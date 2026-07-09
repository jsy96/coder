import http from "node:http";
import crypto from "node:crypto";
import { exec, spawn } from "node:child_process";
import fsSync, { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";

const __filename = fileURLToPath(import.meta.url);
const APP_ROOT = path.dirname(__filename);
const DEFAULT_WORKSPACE = APP_ROOT;
const INITIAL_WORKSPACE = path.resolve(process.env.FORGE_WORKSPACE || DEFAULT_WORKSPACE);
let currentWorkspace = INITIAL_WORKSPACE;
function parsePositivePort(value, fallback) {
  const port = Number(value);
  if (Number.isInteger(port) && port >= 1 && port <= 65535) return port;
  return fallback;
}
function parseNonNegativeInteger(value, fallback) {
  const parsed = Number(value);
  if (Number.isInteger(parsed) && parsed >= 0) return parsed;
  return fallback;
}
const PORT = parsePositivePort(getCliOption("--port") || process.env.FORGE_PORT || process.env.PORT, 4173);
const PORT_AUTO_RETRY = process.env.FORGE_PORT_AUTO_RETRY !== "0";
const PORT_RETRY_LIMIT = parseNonNegativeInteger(process.env.FORGE_PORT_RETRY_LIMIT, 50);
let activeRuntimeServer = null;
const DEFAULT_MODEL_CANDIDATES = ["deepseek-v4-pro", "deepseek-chat"];
const DEFAULT_MODEL = DEFAULT_MODEL_CANDIDATES[0];
const MODEL_API_URL = process.env.FORGE_MODEL_API_URL || "https://api.deepseek.com/chat/completions";
const MODEL_CANDIDATES = uniqueLimited(
  (process.env.FORGE_MODELS || process.env.DEEPSEEK_MODEL || DEFAULT_MODEL_CANDIDATES.join(","))
  .split(",")
  .map((item) => item.trim())
    .filter(Boolean),
  12
);
let modelRuntime = {
  provider: "deepseek-compatible",
  endpoint: MODEL_API_URL,
  candidates: MODEL_CANDIDATES,
  lastModel: "",
  lastFallbacks: [],
  lastError: "",
  lastUsedAt: "",
  lastStartedAt: "",
  lastCompletedAt: "",
  lastStatus: "idle",
  requestCount: 0,
  successCount: 0,
  failureCount: 0,
  totalLatencyMs: 0,
  averageLatencyMs: 0,
  lastLatencyMs: 0,
  recentCalls: []
};
let modelUsageTotals = {
  requestCount: 0,
  successCount: 0,
  failureCount: 0,
  promptTokens: 0,
  completionTokens: 0,
  totalTokens: 0,
  totalLatencyMs: 0,
  averageLatencyMs: 0,
  fallbackCount: 0,
  byModel: {}
};

function currentModelName() {
  return modelRuntime.lastModel || MODEL_CANDIDATES[0] || DEFAULT_MODEL;
}

function inferModelProvider(endpoint) {
  let host = "";
  try {
    host = new URL(endpoint).hostname.toLowerCase();
  } catch {
    return "custom-openai-compatible";
  }
  if (host.includes("deepseek")) return "deepseek-compatible";
  if (host.includes("openai")) return "openai-compatible";
  if (host.includes("azure")) return "azure-openai-compatible";
  if (host.includes("localhost") || host === "127.0.0.1") return "local-openai-compatible";
  return "custom-openai-compatible";
}

function getModelEndpointInfo() {
  try {
    const endpoint = new URL(MODEL_API_URL);
    return {
      provider: inferModelProvider(MODEL_API_URL),
      protocol: endpoint.protocol.replace(":", ""),
      host: endpoint.hostname,
      path: endpoint.pathname,
      redacted: `${endpoint.protocol}//${endpoint.hostname}${endpoint.pathname}`
    };
  } catch {
    return {
      provider: "custom-openai-compatible",
      protocol: "unknown",
      host: "unparsed-endpoint",
      path: "",
      redacted: "custom endpoint"
    };
  }
}

function recordModelRuntimeCall(call) {
  const latencyMs = Math.max(0, Math.round(Number(call.latencyMs) || 0));
  const usage = normalizeModelUsage(call.usage);
  const successCount = modelRuntime.successCount + (call.ok ? 1 : 0);
  const failureCount = modelRuntime.failureCount + (call.ok ? 0 : 1);
  const requestCount = successCount + failureCount;
  const totalLatencyMs = modelRuntime.totalLatencyMs + latencyMs;
  const completedAt = call.completedAt || new Date().toISOString();
  modelRuntime = {
    ...modelRuntime,
    candidates: MODEL_CANDIDATES,
    lastModel: call.ok ? call.model || modelRuntime.lastModel : modelRuntime.lastModel,
    lastFallbacks: call.fallbacks || [],
    lastError: call.ok ? "" : call.error || "",
    lastUsedAt: completedAt,
    lastStartedAt: call.startedAt || modelRuntime.lastStartedAt,
    lastCompletedAt: completedAt,
    lastStatus: call.ok ? "success" : "failed",
    requestCount,
    successCount,
    failureCount,
    totalLatencyMs,
    averageLatencyMs: requestCount ? Math.round(totalLatencyMs / requestCount) : 0,
    lastLatencyMs: latencyMs,
    recentCalls: [
      {
        ok: Boolean(call.ok),
        model: call.model || "",
        startedAt: call.startedAt || "",
        completedAt,
        latencyMs,
        fallbackCount: (call.fallbacks || []).length,
        usage,
        error: call.ok ? "" : String(call.error || "").slice(0, 500)
      },
      ...(modelRuntime.recentCalls || [])
    ].slice(0, 12)
  };
}

function normalizeModelUsage(usage = {}) {
  const promptTokens = Math.max(0, Math.round(Number(usage.prompt_tokens ?? usage.promptTokens) || 0));
  const completionTokens = Math.max(0, Math.round(Number(usage.completion_tokens ?? usage.completionTokens) || 0));
  const totalTokens = Math.max(0, Math.round(Number(usage.total_tokens ?? usage.totalTokens) || (promptTokens + completionTokens) || 0));
  return { promptTokens, completionTokens, totalTokens };
}

function emptyModelUsageLedger() {
  return {
    generatedAt: "",
    workspace: currentWorkspace,
    endpoint: getModelEndpointInfo(),
    totals: {
      requestCount: 0,
      successCount: 0,
      failureCount: 0,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      totalLatencyMs: 0,
      averageLatencyMs: 0,
      fallbackCount: 0,
      byModel: {}
    },
    recent: [],
    summary: {
      requestCount: 0,
      successCount: 0,
      failureCount: 0,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      averageLatencyMs: 0,
      fallbackCount: 0,
      modelCount: 0,
      recentCount: 0
    },
    policy: {
      access: "local-read-only",
      exposesApiKey: false,
      changesProviderConfig: false,
      executesModelCall: false,
      persisted: true
    }
  };
}

function summarizeModelUsageLedger(ledger) {
  const totals = ledger?.totals || {};
  return {
    requestCount: Number(totals.requestCount || 0),
    successCount: Number(totals.successCount || 0),
    failureCount: Number(totals.failureCount || 0),
    promptTokens: Number(totals.promptTokens || 0),
    completionTokens: Number(totals.completionTokens || 0),
    totalTokens: Number(totals.totalTokens || 0),
    averageLatencyMs: Number(totals.averageLatencyMs || 0),
    fallbackCount: Number(totals.fallbackCount || 0),
    modelCount: Object.keys(totals.byModel || {}).length,
    recentCount: Array.isArray(ledger?.recent) ? ledger.recent.length : 0
  };
}

function parseModelCostPolicy(raw = process.env.FORGE_MODEL_COST_POLICY) {
  const text = String(raw || "").trim();
  if (!text) {
    return {
      configured: false,
      source: "not-configured",
      currency: "USD",
      models: {},
      error: ""
    };
  }
  try {
    const parsed = JSON.parse(text);
    const sourceModels = parsed.models && typeof parsed.models === "object" ? parsed.models : parsed;
    const models = {};
    for (const [model, value] of Object.entries(sourceModels || {})) {
      if (!value || typeof value !== "object") continue;
      const promptPer1M = Number(value.promptPer1M ?? value.inputPer1M ?? value.prompt ?? value.input ?? 0);
      const completionPer1M = Number(value.completionPer1M ?? value.outputPer1M ?? value.completion ?? value.output ?? 0);
      if (!Number.isFinite(promptPer1M) && !Number.isFinite(completionPer1M)) continue;
      models[model] = {
        promptPer1M: Number.isFinite(promptPer1M) ? Math.max(0, promptPer1M) : 0,
        completionPer1M: Number.isFinite(completionPer1M) ? Math.max(0, completionPer1M) : 0
      };
    }
    return {
      configured: Object.keys(models).length > 0,
      source: "FORGE_MODEL_COST_POLICY",
      currency: String(parsed.currency || "USD"),
      models,
      error: ""
    };
  } catch (error) {
    return {
      configured: false,
      source: "FORGE_MODEL_COST_POLICY",
      currency: "USD",
      models: {},
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

function buildModelCostPolicySchema({ raw = process.env.FORGE_MODEL_COST_POLICY } = {}) {
  const parsed = parseModelCostPolicy(raw);
  const example = {
    currency: "USD",
    models: {
      default: {
        promptPer1M: 0,
        completionPer1M: 0
      },
      [MODEL_CANDIDATES[0] || DEFAULT_MODEL]: {
        promptPer1M: 0,
        completionPer1M: 0
      }
    }
  };
  return {
    generatedAt: new Date().toISOString(),
    workspace: currentWorkspace,
    envVar: "FORGE_MODEL_COST_POLICY",
    configured: parsed.configured,
    valid: !parsed.error,
    parsed,
    schema: {
      type: "object",
      required: ["models"],
      properties: {
        currency: {
          type: "string",
          default: "USD",
          description: "Display currency for estimated model spend."
        },
        models: {
          type: "object",
          additionalProperties: {
            type: "object",
            properties: {
              promptPer1M: { type: "number", minimum: 0 },
              completionPer1M: { type: "number", minimum: 0 },
              inputPer1M: { type: "number", minimum: 0 },
              outputPer1M: { type: "number", minimum: 0 }
            }
          }
        }
      },
      aliases: {
        promptPer1M: ["inputPer1M", "prompt", "input"],
        completionPer1M: ["outputPer1M", "completion", "output"]
      }
    },
    example,
    exampleJson: JSON.stringify(example),
    policy: {
      access: "local-read-only",
      exposesApiKey: false,
      changesProviderConfig: false,
      writesEnvironment: false,
      executesModelCall: false,
      bundledPrices: false
    },
    notes: [
      "This endpoint validates and documents pricing shape only; it does not write environment variables.",
      "No provider prices are bundled. Enter your own rates per 1M prompt/completion tokens.",
      "Use a model-specific key or default for fallback pricing."
    ]
  };
}

function buildModelCostEstimate({ usageLedger = null, costPolicy = parseModelCostPolicy() } = {}) {
  const totals = usageLedger?.totals || modelUsageTotals || {};
  const byModel = totals.byModel || {};
  const rows = Object.entries(byModel).map(([model, usage]) => {
    const rate = costPolicy.models?.[model] || costPolicy.models?.default || null;
    const promptTokens = Number(usage.promptTokens || 0);
    const completionTokens = Number(usage.completionTokens || 0);
    const promptCost = rate ? (promptTokens / 1_000_000) * Number(rate.promptPer1M || 0) : null;
    const completionCost = rate ? (completionTokens / 1_000_000) * Number(rate.completionPer1M || 0) : null;
    const estimatedCost = rate ? promptCost + completionCost : null;
    return {
      model,
      promptTokens,
      completionTokens,
      totalTokens: Number(usage.totalTokens || 0),
      requestCount: Number(usage.requestCount || 0),
      priced: Boolean(rate),
      promptPer1M: rate ? Number(rate.promptPer1M || 0) : null,
      completionPer1M: rate ? Number(rate.completionPer1M || 0) : null,
      estimatedCost: estimatedCost === null ? null : Number(estimatedCost.toFixed(8))
    };
  });
  const pricedRows = rows.filter((row) => row.priced);
  const estimatedCost = pricedRows.reduce((sum, row) => sum + Number(row.estimatedCost || 0), 0);
  return {
    generatedAt: new Date().toISOString(),
    workspace: currentWorkspace,
    status: !costPolicy.configured
      ? "unpriced"
      : rows.length && rows.every((row) => row.priced)
        ? "priced"
        : "partial",
    currency: costPolicy.currency || "USD",
    configured: Boolean(costPolicy.configured),
    source: costPolicy.source,
    estimatedCost: Number(estimatedCost.toFixed(8)),
    pricedModelCount: pricedRows.length,
    unpricedModelCount: rows.filter((row) => !row.priced).length,
    rows,
    policy: {
      access: "local-read-only",
      exposesApiKey: false,
      changesProviderConfig: false,
      executesModelCall: false,
      pricingSource: costPolicy.source,
      bundledPrices: false
    },
    error: costPolicy.error || "",
    notes: costPolicy.configured
      ? ["Costs are estimates from user-configured FORGE_MODEL_COST_POLICY rates."]
      : ["No bundled provider prices are used. Configure FORGE_MODEL_COST_POLICY to enable estimates."]
  };
}

function parseModelBilling(raw = process.env.FORGE_MODEL_BILLING_JSON, source = "FORGE_MODEL_BILLING_JSON") {
  const text = String(raw || "").trim();
  if (!text) {
    return {
      configured: false,
      source: "not-configured",
      currency: "USD",
      period: "",
      total: null,
      models: {},
      invoices: [],
      error: ""
    };
  }
  try {
    const parsed = JSON.parse(text);
    const models = {};
    const sourceModels = parsed.models && typeof parsed.models === "object" ? parsed.models : {};
    for (const [model, value] of Object.entries(sourceModels)) {
      const actualCost = typeof value === "number"
        ? value
        : Number(value?.actualCost ?? value?.cost ?? value?.amount ?? 0);
      if (!Number.isFinite(actualCost)) continue;
      models[model] = {
        actualCost: Number(actualCost.toFixed(8))
      };
    }
    const invoiceRows = Array.isArray(parsed.invoices) ? parsed.invoices : [];
    const invoices = invoiceRows.map((invoice, index) => ({
      id: String(invoice?.id || invoice?.invoiceId || `invoice-${index + 1}`),
      period: String(invoice?.period || parsed.period || ""),
      currency: String(invoice?.currency || parsed.currency || "USD"),
      amount: Number(invoice?.amount ?? invoice?.total ?? 0)
    })).filter((invoice) => Number.isFinite(invoice.amount));
    const modelTotal = Object.values(models).reduce((sum, row) => sum + Number(row.actualCost || 0), 0);
    const invoiceTotal = invoices.reduce((sum, invoice) => sum + Number(invoice.amount || 0), 0);
    const explicitTotal = Number(parsed.total ?? parsed.amount ?? parsed.actualCost);
    const total = Number.isFinite(explicitTotal)
      ? explicitTotal
      : invoiceTotal || modelTotal;
    return {
      configured: Number.isFinite(total) || Object.keys(models).length > 0 || invoices.length > 0,
      source,
      currency: String(parsed.currency || invoices[0]?.currency || "USD"),
      period: String(parsed.period || invoices[0]?.period || ""),
      total: Number.isFinite(total) ? Number(total.toFixed(8)) : null,
      models,
      invoices,
      error: ""
    };
  } catch (error) {
    return {
      configured: false,
      source,
      currency: "USD",
      period: "",
      total: null,
      models: {},
      invoices: [],
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

async function buildModelBillingReconciliation({ usageLedger = null, raw = "" } = {}) {
  let billing = parseModelBilling(raw, "request.raw");
  if (!String(raw || "").trim()) {
    const fileBilling = await readJsonOrNull(MODEL_BILLING_PATH);
    if (fileBilling && fileBilling.workspace === currentWorkspace && fileBilling.billing) {
      billing = parseModelBilling(JSON.stringify(fileBilling.billing), MODEL_BILLING_PATH);
    } else {
      billing = parseModelBilling(process.env.FORGE_MODEL_BILLING_JSON, "FORGE_MODEL_BILLING_JSON");
    }
  }
  const estimate = buildModelCostEstimate({ usageLedger });
  const modelNames = new Set([
    ...(estimate.rows || []).map((row) => row.model),
    ...Object.keys(billing.models || {})
  ]);
  const rows = Array.from(modelNames).sort().map((model) => {
    const estimated = estimate.rows.find((row) => row.model === model);
    const actual = billing.models?.[model] || null;
    const estimatedCost = estimated?.estimatedCost ?? null;
    const actualCost = actual?.actualCost ?? null;
    return {
      model,
      estimatedCost,
      actualCost,
      variance: estimatedCost === null || actualCost === null
        ? null
        : Number((Number(actualCost) - Number(estimatedCost)).toFixed(8)),
      priced: Boolean(estimated?.priced),
      requestCount: Number(estimated?.requestCount || 0),
      promptTokens: Number(estimated?.promptTokens || 0),
      completionTokens: Number(estimated?.completionTokens || 0),
      totalTokens: Number(estimated?.totalTokens || 0)
    };
  });
  const actualCost = billing.total === null
    ? rows.reduce((sum, row) => sum + Number(row.actualCost || 0), 0)
    : Number(billing.total);
  const hasActual = billing.configured && (billing.total !== null || rows.some((row) => row.actualCost !== null));
  const variance = hasActual ? Number((actualCost - estimate.estimatedCost).toFixed(8)) : null;
  const fullyMapped = rows.length === 0 || rows.every((row) => row.actualCost !== null || row.estimatedCost === null);
  return {
    generatedAt: new Date().toISOString(),
    workspace: currentWorkspace,
    status: billing.error
      ? "invalid"
      : !billing.configured
        ? "not-configured"
        : !estimate.configured
          ? "unpriced"
          : !fullyMapped
            ? "partial"
            : Math.abs(variance || 0) <= 0.000001
              ? "matched"
              : "variance",
    configured: Boolean(billing.configured),
    currency: billing.currency || estimate.currency || "USD",
    period: billing.period,
    estimatedCost: estimate.estimatedCost,
    actualCost: hasActual ? Number(actualCost.toFixed(8)) : null,
    variance,
    rows,
    billing: {
      source: billing.source,
      total: billing.total,
      modelCount: Object.keys(billing.models || {}).length,
      invoiceCount: billing.invoices.length,
      invoices: billing.invoices
    },
    estimate,
    policy: {
      access: "local-read-only",
      exposesApiKey: false,
      changesProviderConfig: false,
      writesEnvironment: false,
      executesModelCall: false,
      providerBillingApi: false,
      acceptsDryRunRaw: true
    },
    error: billing.error || "",
    notes: [
      "Reconciles local token-cost estimates against user-supplied billing JSON only.",
      "It does not call provider billing APIs or deduct spend from provider invoices.",
      "Configure FORGE_MODEL_BILLING_JSON or .forge/state/model-billing.json, or POST raw JSON for dry-run validation."
    ]
  };
}

function parseModelBudgetLimit(value) {
  if (value === undefined || value === null || value === "") return null;
  const limit = Math.floor(Number(value));
  return Number.isFinite(limit) && limit >= 0 ? limit : null;
}

function buildModelBudgetStatus({ usageLedger = null, limits = {} } = {}) {
  const usageSummary = summarizeModelUsageLedger(usageLedger || { totals: modelUsageTotals, recent: [] });
  const requestLimit = parseModelBudgetLimit(
    Object.prototype.hasOwnProperty.call(limits, "requestLimit")
      ? limits.requestLimit
      : process.env.FORGE_MODEL_REQUEST_LIMIT
  );
  const tokenLimit = parseModelBudgetLimit(
    Object.prototype.hasOwnProperty.call(limits, "tokenLimit")
      ? limits.tokenLimit
      : process.env.FORGE_MODEL_TOKEN_LIMIT
  );
  const checks = [
    {
      name: "request-limit",
      configured: requestLimit !== null,
      limit: requestLimit,
      used: usageSummary.requestCount,
      remaining: requestLimit === null ? null : Math.max(0, requestLimit - usageSummary.requestCount),
      blocked: requestLimit !== null && usageSummary.requestCount >= requestLimit,
      source: Object.prototype.hasOwnProperty.call(limits, "requestLimit")
        ? "override"
        : (process.env.FORGE_MODEL_REQUEST_LIMIT ? "FORGE_MODEL_REQUEST_LIMIT" : "not-configured")
    },
    {
      name: "token-limit",
      configured: tokenLimit !== null,
      limit: tokenLimit,
      used: usageSummary.totalTokens,
      remaining: tokenLimit === null ? null : Math.max(0, tokenLimit - usageSummary.totalTokens),
      blocked: tokenLimit !== null && usageSummary.totalTokens >= tokenLimit,
      source: Object.prototype.hasOwnProperty.call(limits, "tokenLimit")
        ? "override"
        : (process.env.FORGE_MODEL_TOKEN_LIMIT ? "FORGE_MODEL_TOKEN_LIMIT" : "not-configured")
    }
  ];
  const blockingChecks = checks.filter((item) => item.blocked);
  return {
    generatedAt: new Date().toISOString(),
    workspace: currentWorkspace,
    status: blockingChecks.length ? "blocked" : "allowed",
    blocksModelCall: blockingChecks.length > 0,
    checks,
    usage: usageSummary,
    policy: {
      access: "local-read-only",
      exposesApiKey: false,
      changesProviderConfig: false,
      executesModelCall: false,
      enforcedBeforeProviderRequest: true
    },
    message: blockingChecks.length
      ? `模型预算已阻止请求：${blockingChecks.map((item) => `${item.name} ${item.used}/${item.limit}`).join(", ")}`
      : "模型预算允许请求。"
  };
}

async function assertModelBudgetAllowsRequest() {
  const usageLedger = await readModelUsageLedger();
  const budget = buildModelBudgetStatus({ usageLedger });
  if (budget.blocksModelCall) {
    const startedAt = new Date().toISOString();
    recordModelRuntimeCall({
      ok: false,
      model: MODEL_CANDIDATES[0] || DEFAULT_MODEL,
      fallbacks: [],
      error: budget.message,
      startedAt,
      completedAt: startedAt,
      latencyMs: 0
    });
    await recordModelUsageCall({
      ok: false,
      model: MODEL_CANDIDATES[0] || DEFAULT_MODEL,
      fallbacks: [],
      error: budget.message,
      startedAt,
      completedAt: startedAt,
      latencyMs: 0
    }).catch(() => {});
    throw new Error(budget.message);
  }
  return budget;
}

function mergeModelUsageTotals(baseTotals = {}, call = {}) {
  const usage = normalizeModelUsage(call.usage);
  const model = call.model || "unknown";
  const latencyMs = Math.max(0, Math.round(Number(call.latencyMs) || 0));
  const fallbackCount = Array.isArray(call.fallbacks) ? call.fallbacks.length : Number(call.fallbackCount || 0);
  const requestCount = Number(baseTotals.requestCount || 0) + 1;
  const successCount = Number(baseTotals.successCount || 0) + (call.ok ? 1 : 0);
  const failureCount = Number(baseTotals.failureCount || 0) + (call.ok ? 0 : 1);
  const totalLatencyMs = Number(baseTotals.totalLatencyMs || 0) + latencyMs;
  const byModel = { ...(baseTotals.byModel || {}) };
  const modelTotals = byModel[model] || {
    requestCount: 0,
    successCount: 0,
    failureCount: 0,
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    totalLatencyMs: 0,
    averageLatencyMs: 0,
    fallbackCount: 0
  };
  const modelRequestCount = Number(modelTotals.requestCount || 0) + 1;
  const modelTotalLatencyMs = Number(modelTotals.totalLatencyMs || 0) + latencyMs;
  byModel[model] = {
    requestCount: modelRequestCount,
    successCount: Number(modelTotals.successCount || 0) + (call.ok ? 1 : 0),
    failureCount: Number(modelTotals.failureCount || 0) + (call.ok ? 0 : 1),
    promptTokens: Number(modelTotals.promptTokens || 0) + usage.promptTokens,
    completionTokens: Number(modelTotals.completionTokens || 0) + usage.completionTokens,
    totalTokens: Number(modelTotals.totalTokens || 0) + usage.totalTokens,
    totalLatencyMs: modelTotalLatencyMs,
    averageLatencyMs: modelRequestCount ? Math.round(modelTotalLatencyMs / modelRequestCount) : 0,
    fallbackCount: Number(modelTotals.fallbackCount || 0) + fallbackCount
  };
  return {
    requestCount,
    successCount,
    failureCount,
    promptTokens: Number(baseTotals.promptTokens || 0) + usage.promptTokens,
    completionTokens: Number(baseTotals.completionTokens || 0) + usage.completionTokens,
    totalTokens: Number(baseTotals.totalTokens || 0) + usage.totalTokens,
    totalLatencyMs,
    averageLatencyMs: requestCount ? Math.round(totalLatencyMs / requestCount) : 0,
    fallbackCount: Number(baseTotals.fallbackCount || 0) + fallbackCount,
    byModel
  };
}

function buildModelPolicy({ includeRecent = true, usageLedger = null } = {}) {
  const endpoint = getModelEndpointInfo();
  const candidates = MODEL_CANDIDATES.length ? MODEL_CANDIDATES : [DEFAULT_MODEL];
  const hasApiKey = Boolean(process.env.DEEPSEEK_API_KEY);
  const usageSummary = summarizeModelUsageLedger(usageLedger || { totals: modelUsageTotals, recent: [] });
  const budgetStatus = buildModelBudgetStatus({ usageLedger });
  const costEstimate = buildModelCostEstimate({ usageLedger });
  const runtime = {
    provider: endpoint.provider,
    activeModel: currentModelName(),
    candidateCount: candidates.length,
    candidates,
    fallbackOrder: candidates.map((model, index) => ({
      model,
      order: index + 1,
      primary: index === 0,
      lastUsed: modelRuntime.lastModel === model
    })),
    requestCount: modelRuntime.requestCount,
    successCount: modelRuntime.successCount,
    failureCount: modelRuntime.failureCount,
    failureRate: modelRuntime.requestCount
      ? Number((modelRuntime.failureCount / modelRuntime.requestCount).toFixed(4))
      : 0,
    averageLatencyMs: modelRuntime.averageLatencyMs,
    lastLatencyMs: modelRuntime.lastLatencyMs,
    lastStatus: modelRuntime.lastStatus,
    lastUsedAt: modelRuntime.lastUsedAt,
    fallbackCount: modelRuntime.lastFallbacks.length,
    usage: usageSummary
  };
  const recentCalls = (modelRuntime.recentCalls || []).slice(0, includeRecent ? 12 : 0).map((call) => ({
    ok: call.ok,
    model: call.model,
    startedAt: call.startedAt,
    completedAt: call.completedAt,
    latencyMs: call.latencyMs,
    fallbackCount: call.fallbackCount,
    error: call.error ? "[redacted]" : ""
  }));
  const budgetPolicy = {
    mode: "local-preflight",
    configuredCostSource: costEstimate.source,
    estimatedSpend: costEstimate.status === "unpriced" ? "not-calculated" : costEstimate.estimatedCost,
    unitCosts: costEstimate.configured ? "user-configured" : "not-configured",
    costEstimate,
    status: budgetStatus.status,
    requestLimit: budgetStatus.checks.find((item) => item.name === "request-limit")?.limit ?? "not-configured",
    tokenLimit: budgetStatus.checks.find((item) => item.name === "token-limit")?.limit ?? "not-configured",
    checks: budgetStatus.checks,
    fallbackLimit: candidates.length,
    usageLedger: usageSummary,
    notes: [
      "API key values are never returned by model policy endpoints.",
      "Provider token usage is captured when the API response includes usage fields.",
      "FORGE_MODEL_REQUEST_LIMIT and FORGE_MODEL_TOKEN_LIMIT are checked before provider requests.",
      "Spend estimates require user-configured FORGE_MODEL_COST_POLICY pricing.",
      "Fallback order follows FORGE_MODELS or DEEPSEEK_MODEL environment order."
    ]
  };
  const guardrails = [
    { name: "api-key-redaction", status: "enforced", evidence: "only Boolean hasApiKey is exposed" },
    { name: "provider-config-read-only", status: "enforced", evidence: "endpoint reports policy metadata and never mutates provider settings" },
    { name: "fallback-order-auditable", status: candidates.length > 1 ? "configured" : "single-model", evidence: candidates.join(", ") },
    { name: "recent-call-redaction", status: "enforced", evidence: "recent call errors are redacted in model_policy output" },
    { name: "sse-agent-stream", status: "implemented", evidence: "/api/agent-stream emits start/goal/context/token/result/done/error events" },
    { name: "provider-token-streaming", status: "implemented", evidence: "final non-tool JSON calls can stream provider delta tokens through /api/agent-stream token events" },
    { name: "token-usage-ledger", status: "implemented", evidence: ".forge/state/model-usage.json" },
    { name: "model-budget-preflight", status: "implemented", evidence: "FORGE_MODEL_REQUEST_LIMIT / FORGE_MODEL_TOKEN_LIMIT checked before provider fetch" },
    { name: "provider-cost-accounting", status: costEstimate.configured ? costEstimate.status : "usage-only", evidence: "token usage is captured; pricing only uses FORGE_MODEL_COST_POLICY and /api/model-cost-policy schema" },
    { name: "user-supplied-billing-reconciliation", status: "implemented", evidence: "/api/model-billing reconciles local estimates with user-supplied billing JSON without provider API calls" }
  ];
  return {
    generatedAt: new Date().toISOString(),
    workspace: currentWorkspace,
    status: hasApiKey ? "configured" : "missing-api-key",
    endpoint,
    hasApiKey,
    runtime,
    recentCalls,
    budgetPolicy,
    budgetStatus,
    costEstimate,
    guardrails,
    policy: {
      access: "local-read-only",
      exposesApiKey: false,
      changesProviderConfig: false,
      executesModelCall: false,
      includesRecentCalls: Boolean(includeRecent)
    },
    remainingGaps: [
      "provider API billing reconciliation and invoice-backed spend deduction"
    ]
  };
}

function buildModelRuntimeCapabilityReadiness() {
  const policy = buildModelPolicy({ includeRecent: false });
  const guardrailStatuses = new Map((policy.guardrails || []).map((item) => [item.name, item.status]));
  const requiredGuardrails = new Map([
    ["api-key-redaction", new Set(["enforced"])],
    ["provider-config-read-only", new Set(["enforced"])],
    ["fallback-order-auditable", new Set(["configured", "single-model"])],
    ["recent-call-redaction", new Set(["enforced"])],
    ["sse-agent-stream", new Set(["implemented"])],
    ["provider-token-streaming", new Set(["implemented"])],
    ["token-usage-ledger", new Set(["implemented"])],
    ["model-budget-preflight", new Set(["implemented"])],
    ["provider-cost-accounting", new Set(["usage-only", "priced", "partial"])],
    ["user-supplied-billing-reconciliation", new Set(["implemented"])]
  ]);
  const missingGuardrails = [...requiredGuardrails.entries()]
    .filter(([name, allowed]) => !allowed.has(guardrailStatuses.get(name)))
    .map(([name]) => name);
  const localControlsReady = missingGuardrails.length === 0;
  const fallbackConfigured = Number(policy.runtime?.candidateCount || 0) > 1;
  const hasRecentCalls = Number(policy.runtime?.requestCount || 0) > 0;
  const evidence = [
    `模型运行就绪：${localControlsReady ? "implemented" : "partial"}`,
    `API Key：${policy.hasApiKey ? "configured" : "missing"}`,
    `候选模型：${(policy.runtime?.candidates || []).join(", ")}`,
    fallbackConfigured ? "默认 fallback 已配置" : "单模型运行（可通过 FORGE_MODELS 配置 fallback）",
    hasRecentCalls
      ? `最近模型调用：${policy.runtime.requestCount} 次`
      : "尚未发起模型请求（不影响本地能力审计）",
    missingGuardrails.length ? `缺失 guardrail：${missingGuardrails.join(", ")}` : "模型 guardrails 已覆盖"
  ];
  const next = !localControlsReady
    ? `继续补齐模型运行 guardrail：${missingGuardrails.join(", ")}。`
    : !policy.hasApiKey
      ? "本地模型运行治理能力已就绪；启动时设置 DEEPSEEK_API_KEY 后即可真实请求，provider API 账单直连仍需外部授权。"
      : fallbackConfigured
        ? "本地模型运行治理能力已就绪；可继续增加 provider API 账单直连和真实成本扣减。"
        : "本地模型运行治理能力已就绪；建议通过 FORGE_MODELS 配置多模型 fallback，provider API 账单直连仍需外部授权。";
  return {
    status: localControlsReady ? "implemented" : "partial",
    policy,
    localControlsReady,
    fallbackConfigured,
    hasRecentCalls,
    missingGuardrails,
    evidence,
    next
  };
}
const CONTEXT_LIMIT_BYTES = 220 * 1024;
const MAX_FILE_BYTES = 120 * 1024;
const MAX_PROMPT_REFERENCE_FILE_BYTES = 2 * 1024 * 1024;
const MAX_SEMANTIC_FILE_BYTES = 512 * 1024;
const SEMANTIC_INDEX_ENTRYPOINTS = new Set(["server.js", "app.js", "index.html", "package.json"]);
const MAX_AGENT_TURNS = 8;
const CHECKPOINT_DIR = path.join(APP_ROOT, ".forge", "checkpoints");
const TASK_LOG_DIR = path.join(APP_ROOT, ".forge", "tasks");
const THREAD_DIR = path.join(APP_ROOT, ".forge", "threads");
const WORKTREE_DIR = path.join(APP_ROOT, ".forge", "worktrees");
const QUEUE_DIR = path.join(APP_ROOT, ".forge", "queue");
const HANDOFF_DIR = path.join(APP_ROOT, ".forge", "handoffs");
const REVIEW_DIR = path.join(APP_ROOT, ".forge", "reviews");
const PROCESS_LOG_DIR = path.join(APP_ROOT, ".forge", "process-logs");
const REMOTE_PUBLISH_DIR = path.join(APP_ROOT, ".forge", "remote-publish");
const REMOTE_CI_DIR = path.join(APP_ROOT, ".forge", "remote-ci");
const EXTERNAL_READINESS_DIR = path.join(APP_ROOT, ".forge", "external-readiness");
const STATE_DIR = path.join(APP_ROOT, ".forge", "state");
const GOAL_STATE_PATH = path.join(STATE_DIR, "goal.json");
const CONTEXT_SNAPSHOT_PATH = path.join(STATE_DIR, "context-snapshot.json");
const CONTEXT_COMPACT_PATH = path.join(STATE_DIR, "context-compact.json");
const CONTEXT_ROLLUP_PATH = path.join(STATE_DIR, "context-rollup.json");
const MODEL_USAGE_PATH = path.join(STATE_DIR, "model-usage.json");
const MODEL_BILLING_PATH = path.join(STATE_DIR, "model-billing.json");
const SEMANTIC_INDEX_PATH = path.join(STATE_DIR, "semantic-index.json");
const RUNTIME_URL_PATH = path.join(STATE_DIR, "runtime-url.json");
const APPROVAL_DIR = path.join(APP_ROOT, ".forge", "approvals");
const ESCALATION_DIR = path.join(APP_ROOT, ".forge", "escalations");
const EXTENSION_DIR = path.join(APP_ROOT, ".forge", "extensions");
const MCP_DIR = path.join(APP_ROOT, ".forge", "mcp");
const BROWSER_BASELINE_DIR = path.join(APP_ROOT, ".forge", "browser-baselines");
const BROWSER_SCREENSHOT_DIR = path.join(APP_ROOT, ".forge", "browser-screenshots");
const BROWSER_VISUAL_DIR = path.join(APP_ROOT, ".forge", "browser-visual-baselines");
const BROWSER_SESSION_DIR = path.join(APP_ROOT, ".forge", "browser-sessions");
const BROWSER_TRACE_DIR = path.join(APP_ROOT, ".forge", "browser-traces");
const SKIP_DIRS = new Set([".git", ".forge", "node_modules", "dist", "build", ".next", ".turbo", "coverage"]);
const SKIP_FILES = new Set([".env", ".env.local"]);
const TEXT_EXTS = new Set([
  ".c", ".cc", ".cpp", ".cs", ".css", ".go", ".h", ".html", ".java", ".js", ".json", ".jsx",
  ".md", ".mjs", ".php", ".py", ".rb", ".rs", ".scss", ".sh", ".sql", ".ts", ".tsx", ".txt",
  ".vue", ".xml", ".yaml", ".yml"
]);
const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".bmp", ".ico", ".avif"]);
const DOCUMENT_EXTS = new Set([".pdf", ".doc", ".docx", ".ppt", ".pptx", ".xls", ".xlsx"]);
const DATA_EXTS = new Set([".csv", ".tsv", ".parquet", ".jsonl"]);
const MEDIA_EXTS = new Set([".mp3", ".wav", ".m4a", ".mp4", ".mov", ".webm"]);
const CHECK_SCRIPT_NAMES = ["check", "typecheck", "test", "lint", "build"];
const START_SCRIPT_NAMES = ["dev", "start", "serve", "preview"];
const FOCUSED_API_SMOKE_CHECKS = [
  { command: "node server.js --api-smoke-section=fast", reason: "快速 API 分段 smoke：核心、语义、模型、写入、上下文和门禁" },
  { command: "node server.js --api-smoke-section=debug", reason: "调试 API 分段 smoke：浏览器、诊断、运行时和门禁" },
  { command: "node server.js --api-smoke-section=integrations", reason: "集成 API 分段 smoke：扩展、MCP 和资产检查" },
  { command: "node server.js --api-smoke-section=publish", reason: "发布 API 分段 smoke：PR readiness、发布审批和预检" }
];
const SAFE_COMMAND_PATTERNS = [
  /^npm (?:run )?(?:check|typecheck|test|lint|build)(?:\s+--\s*[\w:./=-]+)?$/i,
  /^npm run api-smoke:(?:fast|coding|debug|integrations|publish)(?:\s+--\s*[\w:./=-]+)?$/i,
  /^npm test(?:\s+--\s*[\w:./=-]+)?$/i,
  /^pnpm (?:run )?(?:check|typecheck|test|lint|build)(?:\s+--\s*[\w:./=-]+)?$/i,
  /^yarn (?:run )?(?:check|typecheck|test|lint|build)(?:\s+[\w:./=-]+)?$/i,
  /^tsc --noEmit(?: --pretty false)?$/i,
  /^node_modules[\\\/]\.bin[\\\/]tsc(?:\.cmd)? --noEmit(?: --pretty false)?$/i,
  /^node --check [\w./\\-]+$/i,
  /^node [\w./\\-]+ --smoke-test$/i,
  /^node [\w./\\-]+ --api-smoke-section=(?:all|fast|coding|debug|integrations|publish|core|browser|semantic|model|extensions|mcp|assets|apply|runtime|context|gates|remote)(?:,(?:core|browser|semantic|model|extensions|mcp|assets|apply|runtime|context|gates|remote))*$/i,
  /^node [\w./\\-]+ --mcp-smoke-server$/i,
  /^(?:\.?[\\\/])?validate\.bat(?:\s+(?:--no-pause|\/no-pause|--ci))?$/i
];
const PROCESS_COMMAND_PATTERNS = [
  /^npm (?:run )?(?:dev|start|serve|preview)(?:\s+--\s*[\w:./=-]+)?$/i,
  /^pnpm (?:run )?(?:dev|start|serve|preview)(?:\s+[\w:./=-]+)?$/i,
  /^yarn (?:run )?(?:dev|start|serve|preview)(?:\s+[\w:./=-]+)?$/i,
  /^node [\w./\\-]+$/i,
  /^node [\w./\\-]+ --mcp-smoke-server$/i
];
const managedProcesses = new Map();

function send(res, status, payload, headers = {}) {
  const body = typeof payload === "string" ? payload : JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": typeof payload === "string" ? "text/plain; charset=utf-8" : "application/json; charset=utf-8",
    ...headers
  });
  res.end(body);
}

function sendError(res, status, error) {
  send(res, status, { error: error instanceof Error ? error.message : String(error) });
}

function beginSse(res) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no"
  });
}

function writeSse(res, event, payload = {}) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function parseProviderStreamChunk(chunk) {
  const choices = Array.isArray(chunk?.choices) ? chunk.choices : [];
  const deltas = [];
  for (const choice of choices) {
    const delta = choice?.delta || {};
    if (typeof delta.content === "string" && delta.content) deltas.push(delta.content);
    if (typeof choice?.message?.content === "string" && choice.message.content) deltas.push(choice.message.content);
  }
  return {
    content: deltas.join(""),
    usage: chunk?.usage || null,
    finishReason: choices.find((choice) => choice?.finish_reason)?.finish_reason || ""
  };
}

async function readProviderSseResponse(response, onToken) {
  const reader = response.body?.getReader?.();
  if (!reader) {
    const text = await response.text();
    throw new Error(`Provider stream response is not readable: ${text.slice(0, 160)}`);
  }
  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
  let usage = null;
  let finishReason = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split(/\n\n+/);
    buffer = events.pop() || "";
    for (const event of events) {
      const dataLines = event.split(/\n/).filter((line) => line.startsWith("data:"));
      if (!dataLines.length) continue;
      const dataText = dataLines.map((line) => line.replace(/^data:\s*/, "")).join("\n").trim();
      if (!dataText || dataText === "[DONE]") continue;
      let parsed = null;
      try {
        parsed = JSON.parse(dataText);
      } catch {
        continue;
      }
      const part = parseProviderStreamChunk(parsed);
      if (part.usage) usage = part.usage;
      if (part.finishReason) finishReason = part.finishReason;
      if (part.content) {
        content += part.content;
        if (typeof onToken === "function") onToken(part.content, { finishReason });
      }
    }
  }
  const tail = buffer.trim();
  if (tail) {
    for (const dataLine of tail.split(/\n/).filter((line) => line.startsWith("data:"))) {
      const dataText = dataLine.replace(/^data:\s*/, "").trim();
      if (!dataText || dataText === "[DONE]") continue;
      try {
        const part = parseProviderStreamChunk(JSON.parse(dataText));
        if (part.usage) usage = part.usage;
        if (part.finishReason) finishReason = part.finishReason;
        if (part.content) {
          content += part.content;
          if (typeof onToken === "function") onToken(part.content, { finishReason });
        }
      } catch {
        // Ignore malformed trailing provider frames.
      }
    }
  }
  return { content, usage, finishReason };
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function toPosix(relativePath = "") {
  return relativePath.replaceAll("\\", "/").replace(/^\/+/, "");
}

function normalizeWorkspacePath(input = "") {
  let raw = String(input).trim().replace(/\0/g, "");
  raw = raw.replace(/^["']|["']$/g, "").replace(/^file:\/\//i, "");
  raw = raw.replaceAll("\\", "/").replace(/^\.\/+/, "");
  raw = raw.replace(/^(?:a|b)\//, "");

  if (!raw || raw === "." || raw === "/dev/null" || raw === "dev/null") return "";

  const workspacePosix = currentWorkspace.replaceAll("\\", "/");
  const lowerRaw = raw.toLowerCase();
  const lowerWorkspace = workspacePosix.toLowerCase();

  if (lowerRaw === lowerWorkspace || lowerRaw.startsWith(`${lowerWorkspace}/`)) {
    return toPosix(path.relative(currentWorkspace, path.resolve(raw)));
  }

  if (/^[a-zA-Z]:\//.test(raw) || raw.startsWith("//")) {
    const full = path.resolve(raw);
    const root = currentWorkspace.toLowerCase();
    const target = full.toLowerCase();
    if (target !== root && !target.startsWith(root + path.sep)) {
      throw new Error("路径越界，已拒绝访问。");
    }
    return toPosix(path.relative(currentWorkspace, full));
  }

  raw = raw.replace(/^\/+/, "");
  raw = path.posix.normalize(raw).replace(/^(\.\.\/)+/, "");
  raw = raw.replace(/^(?:a|b)\//, "");
  return raw === "." ? "" : raw;
}

async function setWorkspace(nextPath) {
  if (!nextPath || typeof nextPath !== "string") {
    throw new Error("缺少工作目录路径。");
  }
  const resolved = path.resolve(nextPath);
  const stat = await fs.stat(resolved).catch(() => null);
  if (!stat?.isDirectory()) {
    throw new Error("工作目录不存在或不是文件夹。");
  }
  currentWorkspace = resolved;
  return getWorkspaceInfo();
}

function getWorkspaceInfo() {
  return {
    workspace: currentWorkspace,
    workspaceName: path.basename(currentWorkspace) || currentWorkspace,
    initialWorkspace: INITIAL_WORKSPACE
  };
}

function safePath(relativePath = "") {
  const normalized = normalizeWorkspacePath(relativePath);
  if (!normalized) {
    throw new Error("缺少工作区内相对路径。");
  }
  const full = path.resolve(currentWorkspace, normalized);
  const root = currentWorkspace.toLowerCase();
  const target = full.toLowerCase();
  if (target !== root && !target.startsWith(root + path.sep)) {
    throw new Error("路径越界，已拒绝访问。");
  }
  return full;
}

function isTextFile(name) {
  if (SKIP_FILES.has(name)) return false;
  const ext = path.extname(name).toLowerCase();
  return TEXT_EXTS.has(ext) || (!ext && !name.includes("."));
}

function classifyAsset(name) {
  const ext = path.extname(name).toLowerCase();
  if (IMAGE_EXTS.has(ext)) return "image";
  if (DOCUMENT_EXTS.has(ext)) return "document";
  if (DATA_EXTS.has(ext)) return "data";
  if (MEDIA_EXTS.has(ext)) return "media";
  return "";
}

async function listFiles(dir = currentWorkspace, base = "") {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      files.push(...await listFiles(path.join(dir, entry.name), path.join(base, entry.name)));
      continue;
    }
    if (!entry.isFile() || !isTextFile(entry.name)) continue;
    const full = path.join(dir, entry.name);
    const stat = await fs.stat(full);
    if (stat.size > MAX_FILE_BYTES) continue;
    files.push({ path: toPosix(path.join(base, entry.name)), size: stat.size });
  }
  return files.sort((a, b) => a.path.localeCompare(b.path)).slice(0, 400);
}

function listWorkspaceFilesSync(dir = currentWorkspace, base = "", files = []) {
  if (files.length >= 400) return files;
  let entries = [];
  try {
    entries = fsSync.readdirSync(dir, { withFileTypes: true });
  } catch {
    return files;
  }
  for (const entry of entries) {
    if (files.length >= 400) break;
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      listWorkspaceFilesSync(path.join(dir, entry.name), path.join(base, entry.name), files);
      continue;
    }
    if (!entry.isFile() || !isTextFile(entry.name)) continue;
    const full = path.join(dir, entry.name);
    let stat = null;
    try {
      stat = fsSync.statSync(full);
    } catch {
      continue;
    }
    if (stat.size > MAX_FILE_BYTES) continue;
    files.push({ path: toPosix(path.join(base, entry.name)), size: stat.size });
  }
  if (base) return files;
  return files.sort((a, b) => a.path.localeCompare(b.path)).slice(0, 400);
}

async function listPromptReferenceFiles(dir = currentWorkspace, base = "") {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      files.push(...await listPromptReferenceFiles(path.join(dir, entry.name), path.join(base, entry.name)));
      continue;
    }
    if (!entry.isFile() || !isTextFile(entry.name)) continue;
    const full = path.join(dir, entry.name);
    const stat = await fs.stat(full);
    if (stat.size > MAX_PROMPT_REFERENCE_FILE_BYTES) continue;
    files.push({ path: toPosix(path.join(base, entry.name)), size: stat.size });
  }
  return files.sort((a, b) => a.path.localeCompare(b.path)).slice(0, 5000);
}

async function listSemanticFiles(dir = currentWorkspace, base = "") {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      files.push(...await listSemanticFiles(path.join(dir, entry.name), path.join(base, entry.name)));
      continue;
    }
    if (!entry.isFile() || !isTextFile(entry.name)) continue;
    const full = path.join(dir, entry.name);
    const stat = await fs.stat(full);
    const relativePath = toPosix(path.join(base, entry.name));
    if (stat.size > MAX_SEMANTIC_FILE_BYTES && !SEMANTIC_INDEX_ENTRYPOINTS.has(relativePath)) continue;
    files.push({ path: relativePath, size: stat.size });
  }
  return files.sort((a, b) => a.path.localeCompare(b.path)).slice(0, 600);
}

async function listAssetFiles(dir = currentWorkspace, base = "") {
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  const assets = [];
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      assets.push(...await listAssetFiles(path.join(dir, entry.name), path.join(base, entry.name)));
      continue;
    }
    if (!entry.isFile() || SKIP_FILES.has(entry.name)) continue;
    const type = classifyAsset(entry.name);
    if (!type) continue;
    const full = path.join(dir, entry.name);
    const stat = await fs.stat(full);
    assets.push({
      path: toPosix(path.join(base, entry.name)),
      type,
      ext: path.extname(entry.name).toLowerCase(),
      size: stat.size,
      modifiedAt: stat.mtime.toISOString()
    });
  }
  return assets.sort((a, b) => a.path.localeCompare(b.path)).slice(0, 400);
}

async function buildAssetCatalog() {
  const assets = await listAssetFiles();
  const summary = assets.reduce((acc, asset) => {
    acc.total += 1;
    acc[asset.type] = (acc[asset.type] || 0) + 1;
    return acc;
  }, { total: 0, image: 0, document: 0, data: 0, media: 0 });
  return {
    generatedAt: new Date().toISOString(),
    workspace: currentWorkspace,
    summary,
    assets,
    policy: {
      access: "metadata-and-inspection",
      scope: "currentWorkspace",
      readsContent: true,
      contentEndpoint: "/api/asset-inspect"
    },
    gaps: [
      "cloud image vision summaries",
      "cloud audio/video transcription and diarization",
      "complex object-stream PDF layout extraction",
      "full legacy Office formatting and embedded object parsing"
    ]
  };
}

function splitDelimitedLine(line, delimiter) {
  const values = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === "\"") {
      if (quoted && line[index + 1] === "\"") {
        current += "\"";
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === delimiter && !quoted) {
      values.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  values.push(current);
  return values;
}

function inspectParquetBuffer(buffer, totalSize = buffer.length) {
  const startsWithMagic = buffer.length >= 4 && buffer.toString("ascii", 0, 4) === "PAR1";
  const endsWithMagic = buffer.length >= 4 && buffer.toString("ascii", buffer.length - 4, buffer.length) === "PAR1";
  if (buffer.length < 12 || !startsWithMagic || !endsWithMagic) {
    return {
      format: "parquet",
      container: "parquet",
      magic: { header: startsWithMagic, footer: endsWithMagic },
      footerAvailable: false,
      warning: "Parquet footer not available in sampled bytes."
    };
  }
  const footerLength = buffer.readUInt32LE(buffer.length - 8);
  const footerStart = buffer.length - 8 - footerLength;
  const footerAvailable = footerLength >= 0 && footerStart >= 4;
  const footer = footerAvailable ? buffer.subarray(footerStart, buffer.length - 8) : Buffer.alloc(0);
  return {
    format: "parquet",
    container: "parquet",
    magic: { header: startsWithMagic, footer: endsWithMagic },
    footerAvailable,
    footerLength,
    footerOffset: footerAvailable ? footerStart : null,
    sampledEntireFile: buffer.length === totalSize,
    metadataStrings: extractReadableStrings(footer, 40),
    warning: footerAvailable
      ? "Lightweight Parquet footer probe; full schema/row-group decoding requires a dedicated Parquet metadata parser."
      : "Invalid or truncated Parquet footer."
  };
}

function extractReadableStrings(buffer, limit = 80) {
  return (buffer.toString("latin1").match(/[ -~]{5,}/g) || [])
    .map((item) => item.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(0, limit);
}

function decodeXmlEntities(text = "") {
  const named = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'" };
  return String(text || "").replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity) => {
    const lower = entity.toLowerCase();
    if (named[lower]) return named[lower];
    if (lower.startsWith("#x")) return String.fromCodePoint(Number.parseInt(lower.slice(2), 16) || 0);
    if (lower.startsWith("#")) return String.fromCodePoint(Number.parseInt(lower.slice(1), 10) || 0);
    return match;
  });
}

function extractXmlText(xml = "") {
  return decodeXmlEntities(
    String(xml || "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

function findEndOfCentralDirectory(buffer) {
  const minOffset = Math.max(0, buffer.length - 65557);
  for (let offset = buffer.length - 22; offset >= minOffset; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) return offset;
  }
  return -1;
}

function readZipEntries(buffer, limit = 80) {
  const eocd = findEndOfCentralDirectory(buffer);
  if (eocd < 0) return { entries: [], warning: "zip central directory not found" };
  const totalEntries = buffer.readUInt16LE(eocd + 10);
  const centralDirectorySize = buffer.readUInt32LE(eocd + 12);
  const centralDirectoryOffset = buffer.readUInt32LE(eocd + 16);
  const entries = [];
  let offset = centralDirectoryOffset;
  const end = Math.min(buffer.length, centralDirectoryOffset + centralDirectorySize);
  while (offset + 46 <= end && entries.length < Math.min(limit, totalEntries)) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) break;
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.toString("utf8", offset + 46, offset + 46 + nameLength);
    const localNameLength = buffer.readUInt16LE(localHeaderOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localHeaderOffset + 28);
    const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength;
    const dataEnd = dataStart + compressedSize;
    let content = Buffer.alloc(0);
    if (dataEnd <= buffer.length) {
      const compressed = buffer.subarray(dataStart, dataEnd);
      if (method === 0) content = compressed;
      if (method === 8) content = zlib.inflateRawSync(compressed);
    }
    entries.push({ name, method, compressedSize, uncompressedSize, content });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return { entries, warning: "" };
}

function inspectOfficeOpenXml(buffer, ext) {
  const { entries, warning } = readZipEntries(buffer, 300);
  const textEntries = entries
    .filter((entry) => {
      if (!entry.name.endsWith(".xml")) return false;
      if (ext === ".docx") return entry.name === "word/document.xml" || entry.name.startsWith("word/header") || entry.name.startsWith("word/footer");
      if (ext === ".pptx") return entry.name.startsWith("ppt/slides/slide") || entry.name === "ppt/presentation.xml";
      if (ext === ".xlsx") return entry.name === "xl/sharedStrings.xml" || entry.name.startsWith("xl/worksheets/sheet") || entry.name === "xl/workbook.xml";
      return false;
    })
    .slice(0, 80);
  const texts = textEntries
    .map((entry) => extractXmlText(entry.content.toString("utf8")).slice(0, 4000))
    .filter(Boolean);
  return {
    format: ext.slice(1),
    packageType: "office-open-xml",
    entryCount: entries.length,
    textEntryCount: textEntries.length,
    textEntries: textEntries.map((entry) => entry.name),
    textSample: texts.join("\n").replace(/\s+/g, " ").trim().slice(0, 8000),
    warning
  };
}

function extractUtf16LeStrings(buffer, limit = 80) {
  const strings = [];
  let current = "";
  for (let offset = 0; offset + 1 < buffer.length; offset += 2) {
    const code = buffer.readUInt16LE(offset);
    if ((code >= 32 && code <= 126) || code === 9 || code === 10 || code === 13) {
      current += String.fromCharCode(code);
      continue;
    }
    if (current.trim().length >= 5) strings.push(current.replace(/\s+/g, " ").trim());
    current = "";
    if (strings.length >= limit) break;
  }
  if (current.trim().length >= 5 && strings.length < limit) {
    strings.push(current.replace(/\s+/g, " ").trim());
  }
  return strings;
}

function inspectLegacyOfficeBinary(buffer, ext) {
  const isCompoundFile = buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]));
  const asciiStrings = extractReadableStrings(buffer, 120);
  const utf16Strings = extractUtf16LeStrings(buffer, 120);
  const streamHints = [...new Set([...asciiStrings, ...utf16Strings]
    .filter((item) => /^(WordDocument|Workbook|Book|PowerPoint Document|Pictures|SummaryInformation|DocumentSummaryInformation)$/i.test(item))
    .slice(0, 20))];
  const textSample = [...new Set([...utf16Strings, ...asciiStrings])]
    .filter((item) => !/^[\x00-\x1f]+$/.test(item))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 8000);
  return {
    format: ext.slice(1),
    packageType: isCompoundFile ? "compound-file-binary" : "legacy-office-binary",
    compoundFile: isCompoundFile,
    streamHints,
    textSample,
    strings: asciiStrings.slice(0, 40),
    unicodeStrings: utf16Strings.slice(0, 40),
    warning: isCompoundFile
      ? "Lightweight legacy Office inspection; full formatting, tables, and embedded objects require a dedicated CFBF parser."
      : "Legacy Office signature not detected; text extraction used best-effort string scanning."
  };
}

function createSmokeLegacyOfficeBuffer(text = "Forge legacy DOC smoke text") {
  const signature = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
  const padding = Buffer.alloc(512 - signature.length, 0);
  const asciiHints = Buffer.from("WordDocument\0SummaryInformation\0", "latin1");
  const unicodeText = Buffer.from(`\0\0${text}\0`, "utf16le");
  return Buffer.concat([signature, padding, asciiHints, unicodeText, Buffer.alloc(256, 0)]);
}

function decodePdfLiteralString(value = "") {
  return String(value || "")
    .replace(/\\([()\\])/g, "$1")
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\([0-7]{1,3})/g, (match, octal) => String.fromCharCode(parseInt(octal, 8)))
    .replace(/\s+/g, " ")
    .trim();
}

function extractPdfContentSources(buffer, latin1) {
  const sources = [{ content: latin1, compressed: false, filter: "none" }];
  const streamPattern = /(<<[\s\S]{0,1200}?>>)\s*stream\r?\n?([\s\S]*?)\r?\n?endstream/g;
  for (const match of latin1.matchAll(streamPattern)) {
    const dictionary = match[1] || "";
    if (!/\/Filter\s*(?:\[[^\]]*)?\/FlateDecode\b/.test(dictionary)) continue;
    const raw = Buffer.from(match[2] || "", "latin1");
    for (const candidate of [
      raw,
      raw.subarray(raw[0] === 0x0d && raw[1] === 0x0a ? 2 : raw[0] === 0x0a ? 1 : 0),
      raw.subarray(0, raw.length && raw[raw.length - 1] === 0x0a ? raw.length - 1 : raw.length)
    ]) {
      try {
        const inflated = zlib.inflateSync(candidate).toString("latin1");
        sources.push({ content: inflated, compressed: true, filter: "FlateDecode" });
        break;
      } catch {
        // Try the next stream boundary normalization candidate.
      }
    }
  }
  return sources;
}

function inspectPdfBuffer(buffer) {
  const latin1 = buffer.toString("latin1");
  const contentSources = extractPdfContentSources(buffer, latin1);
  const joinedContent = contentSources.map((item) => item.content).join("\n");
  const literalStrings = [...joinedContent.matchAll(/\(([^()]{2,500})\)\s*T[jJ]/g)]
    .map((match) => decodePdfLiteralString(match[1]))
    .filter(Boolean)
    .slice(0, 80);
  const pageBoxes = [...latin1.matchAll(/\/(?:MediaBox|CropBox)\s*\[\s*([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s*\]/g)]
    .slice(0, 40)
    .map((match, index) => {
      const values = match.slice(1, 5).map((item) => Number(item));
      return {
        page: index + 1,
        type: match[0].startsWith("/CropBox") ? "CropBox" : "MediaBox",
        x0: values[0],
        y0: values[1],
        x1: values[2],
        y1: values[3],
        width: values[2] - values[0],
        height: values[3] - values[1]
      };
    });
  const textBlocks = [];
  const textObjectPattern = /BT([\s\S]*?)ET/g;
  for (const source of contentSources) {
    for (const objectMatch of source.content.matchAll(textObjectPattern)) {
      const content = objectMatch[1];
      let x = 0;
      let y = 0;
      const tm = /([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+Tm/.exec(content);
      const td = /([-\d.]+)\s+([-\d.]+)\s+T[dD]/.exec(content);
      if (tm) {
        x = Number(tm[5]);
        y = Number(tm[6]);
      } else if (td) {
        x = Number(td[1]);
        y = Number(td[2]);
      }
      const text = [...content.matchAll(/\(([^()]{1,500})\)\s*T[jJ]/g)]
        .map((match) => decodePdfLiteralString(match[1]))
        .filter(Boolean)
        .join(" ")
        .trim();
      if (text) {
        textBlocks.push({
          page: Math.max(1, pageBoxes.length ? 1 : 0),
          x,
          y,
          compressed: source.compressed,
          filter: source.filter,
          text: text.slice(0, 1000)
        });
      }
      if (textBlocks.length >= 120) break;
    }
    if (textBlocks.length >= 120) break;
  }
  return {
    format: "pdf",
    pagesEstimated: (latin1.match(/\/Type\s*\/Page\b/g) || []).length,
    textSample: literalStrings.join(" ").slice(0, 8000),
    strings: extractReadableStrings(buffer, 40),
    layout: {
      engine: "local-pdf-content-stream",
      pageBoxes,
      textBlocks,
      textBlockCount: textBlocks.length,
      compressedStreamCount: contentSources.filter((item) => item.compressed).length,
      filters: [...new Set(contentSources.map((item) => item.filter))],
      warning: "Lightweight local parser; complex object-stream PDFs may need a dedicated PDF layout engine."
    }
  };
}

function inspectImageBuffer(buffer, ext) {
  if (ext === ".png" && buffer.length >= 24 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { format: "png", width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20), channels: "unknown" };
  }
  if ([".jpg", ".jpeg"].includes(ext) && buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < buffer.length) {
      if (buffer[offset] !== 0xff) break;
      const marker = buffer[offset + 1];
      const length = buffer.readUInt16BE(offset + 2);
      if (marker >= 0xc0 && marker <= 0xc3) {
        return { format: "jpeg", width: buffer.readUInt16BE(offset + 7), height: buffer.readUInt16BE(offset + 5), channels: buffer[offset + 9] || "unknown" };
      }
      offset += 2 + length;
    }
    return { format: "jpeg", width: 0, height: 0, channels: "unknown" };
  }
  if (ext === ".gif" && buffer.length >= 10 && ["GIF87a", "GIF89a"].includes(buffer.toString("ascii", 0, 6))) {
    return { format: "gif", width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8), channels: "indexed" };
  }
  if (ext === ".webp" && buffer.length >= 30 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") {
    return { format: "webp", width: 0, height: 0, channels: "unknown" };
  }
  if (ext === ".svg") {
    const text = buffer.toString("utf8");
    const svgTag = /<svg\b[^>]*>/i.exec(text)?.[0] || "";
    const attr = (name) => new RegExp(`\\b${escapeRegExp(name)}\\s*=\\s*["']([^"']+)["']`, "i").exec(svgTag)?.[1] || "";
    const viewBox = attr("viewBox").split(/\s+/).map(Number).filter((item) => Number.isFinite(item));
    return {
      format: "svg",
      width: Number.parseFloat(attr("width")) || (viewBox.length === 4 ? viewBox[2] : 0),
      height: Number.parseFloat(attr("height")) || (viewBox.length === 4 ? viewBox[3] : 0),
      channels: "vector",
      viewBox: viewBox.length === 4 ? viewBox : []
    };
  }
  return { format: ext.replace(".", "") || "image", width: 0, height: 0, channels: "unknown" };
}

function rgbToHex(r, g, b) {
  return `#${[r, g, b].map((value) => Math.max(0, Math.min(255, value)).toString(16).padStart(2, "0")).join("")}`;
}

function summarizeImagePixels(png) {
  const pixelCount = png.width * png.height;
  if (!pixelCount) return null;
  const buckets = new Map();
  let transparentPixels = 0;
  let totalAlpha = 0;
  let totalLuminance = 0;
  let minLuminance = 255;
  let maxLuminance = 0;
  const step = Math.max(1, Math.floor(pixelCount / 250000));
  let sampledPixels = 0;

  for (let pixel = 0; pixel < pixelCount; pixel += step) {
    const offset = pixel * 4;
    const r = png.pixels[offset];
    const g = png.pixels[offset + 1];
    const b = png.pixels[offset + 2];
    const a = png.pixels[offset + 3];
    const luminance = Math.round((0.2126 * r) + (0.7152 * g) + (0.0722 * b));
    const bucket = `${r >> 4}${g >> 4}${b >> 4}`;
    buckets.set(bucket, (buckets.get(bucket) || 0) + 1);
    if (a < 255) transparentPixels += 1;
    totalAlpha += a;
    totalLuminance += luminance;
    minLuminance = Math.min(minLuminance, luminance);
    maxLuminance = Math.max(maxLuminance, luminance);
    sampledPixels += 1;
  }

  const dominantColors = [...buckets.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([bucket, count]) => ({
      color: rgbToHex(
        (Number(bucket[0]) << 4) + 8,
        (Number(bucket[1]) << 4) + 8,
        (Number(bucket[2]) << 4) + 8
      ),
      ratio: sampledPixels ? count / sampledPixels : 0
    }));

  return {
    width: png.width,
    height: png.height,
    pixelCount,
    sampledPixels,
    averageAlpha: sampledPixels ? totalAlpha / sampledPixels : 0,
    transparentRatio: sampledPixels ? transparentPixels / sampledPixels : 0,
    averageLuminance: sampledPixels ? totalLuminance / sampledPixels : 0,
    minLuminance,
    maxLuminance,
    dominantColors,
    notes: [
      png.width === 1 && png.height === 1 ? "single-pixel image" : "",
      dominantColors[0] ? `dominant ${dominantColors[0].color}` : ""
    ].filter(Boolean)
  };
}

function inspectImageVision(buffer, ext) {
  if (ext !== ".png") {
    return {
      available: false,
      reason: "local pixel summary currently supports PNG; other formats expose header metadata only"
    };
  }
  try {
    return {
      available: true,
      engine: "local-png-pixel-summary",
      summary: summarizeImagePixels(parsePng(buffer))
    };
  } catch (error) {
    return {
      available: false,
      engine: "local-png-pixel-summary",
      reason: error.message
    };
  }
}

function extractSvgText(svg = "") {
  const text = String(svg || "");
  const values = [];
  for (const pattern of [
    /<(?:title|desc|text|tspan)\b[^>]*>([\s\S]*?)<\/(?:title|desc|text|tspan)>/gi,
    /\b(?:aria-label|alt)\s*=\s*["']([^"']+)["']/gi
  ]) {
    for (const match of text.matchAll(pattern)) {
      const value = decodeXmlEntities(String(match[1] || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
      if (value) values.push(value);
    }
  }
  return [...new Set(values)].slice(0, 80);
}

async function inspectImageOcr(fullPath, ext, stat) {
  const sourceHash = crypto
    .createHash("sha256")
    .update(`${fullPath}:${stat.size}:${stat.mtimeMs}`)
    .digest("hex");
  const outputDir = path.join(APP_ROOT, ".forge", "image-ocr");
  const textPath = path.join(outputDir, `${sourceHash}.txt`);
  const metaPath = path.join(outputDir, `${sourceHash}.json`);
  const cachedText = await fs.readFile(textPath, "utf8").catch(() => "");
  const cachedMeta = parseJsonOutput(await fs.readFile(metaPath, "utf8").catch(() => ""), null);
  if (ext === ".svg") {
    const svgText = await fs.readFile(fullPath, "utf8").catch(() => "");
    const extracted = extractSvgText(svgText);
    return {
      available: extracted.length > 0,
      enabled: true,
      cached: false,
      engine: "local-svg-text-extractor",
      textPath: "",
      metaPath: "",
      artifact: null,
      textSample: extracted.join("\n").slice(0, 4000),
      textBlocks: extracted,
      reason: extracted.length ? "" : "no SVG text nodes, title, desc, aria-label, or alt attributes found"
    };
  }
  if (![".png", ".jpg", ".jpeg", ".tif", ".tiff", ".bmp"].includes(ext)) {
    return {
      available: false,
      enabled: false,
      cached: Boolean(cachedText),
      engine: "tesseract",
      artifact: cachedMeta || null,
      textPath: cachedText ? textPath : "",
      textSample: cachedText.slice(0, 4000),
      reason: "unsupported image format for local OCR probe"
    };
  }
  if (cachedText) {
    return {
      available: true,
      enabled: true,
      cached: true,
      engine: "tesseract",
      textPath,
      metaPath,
      artifact: cachedMeta || null,
      textSample: cachedText.slice(0, 4000),
      reason: ""
    };
  }
  if (process.env.FORGE_ENABLE_IMAGE_OCR !== "1") {
    return {
      available: false,
      enabled: false,
      cached: false,
      engine: "tesseract",
      textPath,
      metaPath,
      reason: "set FORGE_ENABLE_IMAGE_OCR=1 to probe and run local OCR"
    };
  }
  const cli = await runLocalCommand("tesseract --version", { cwd: APP_ROOT, timeout: 5000, maxBuffer: 128 * 1024 });
  if (!cli.ok) {
    return {
      available: false,
      enabled: true,
      cached: Boolean(cachedText),
      engine: "tesseract",
      artifact: cachedMeta || null,
      textPath: cachedText ? textPath : "",
      metaPath,
      textSample: cachedText.slice(0, 4000),
      reason: "tesseract CLI not installed or not on PATH"
    };
  }
  await fs.mkdir(outputDir, { recursive: true });
  const result = await runLocalCommand(`tesseract "${fullPath.replace(/"/g, "\"\"")}" stdout --psm 6`, {
    cwd: APP_ROOT,
    timeout: 15000,
    maxBuffer: 512 * 1024
  });
  const text = result.ok ? result.output : "";
  if (text) await fs.writeFile(textPath, text, "utf8").catch(() => {});
  const artifact = {
    engine: "tesseract",
    sourcePath: fullPath,
    sourceHash,
    sourceSize: stat.size,
    textPath: text ? textPath : "",
    generatedAt: new Date().toISOString(),
    cached: false
  };
  await fs.writeFile(metaPath, JSON.stringify(artifact, null, 2), "utf8").catch(() => {});
  return {
    available: result.ok,
    enabled: true,
    cached: false,
    engine: "tesseract",
    textPath: text ? textPath : "",
    metaPath,
    artifact,
    textSample: text.slice(0, 4000),
    reason: result.ok ? "" : result.output.slice(0, 1000)
  };
}

function inspectWavBuffer(buffer) {
  if (buffer.length < 44 || buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WAVE") return null;
  let offset = 12;
  let fmt = null;
  let dataBytes = 0;
  while (offset + 8 <= buffer.length) {
    const id = buffer.toString("ascii", offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (id === "fmt " && start + Math.min(size, 16) <= buffer.length) {
      const audioFormat = buffer.readUInt16LE(start);
      const channels = buffer.readUInt16LE(start + 2);
      const sampleRate = buffer.readUInt32LE(start + 4);
      const byteRate = buffer.readUInt32LE(start + 8);
      const blockAlign = buffer.readUInt16LE(start + 12);
      const bitsPerSample = buffer.readUInt16LE(start + 14);
      fmt = { audioFormat, channels, sampleRate, byteRate, blockAlign, bitsPerSample };
    } else if (id === "data") {
      dataBytes = size;
    }
    offset = start + size + (size % 2);
  }
  return {
    format: "wav",
    container: "riff-wave",
    codec: fmt?.audioFormat === 1 ? "pcm" : fmt?.audioFormat ? `format-${fmt.audioFormat}` : "unknown",
    channels: fmt?.channels || 0,
    sampleRate: fmt?.sampleRate || 0,
    bitsPerSample: fmt?.bitsPerSample || 0,
    dataBytes,
    durationSeconds: fmt?.byteRate && dataBytes ? dataBytes / fmt.byteRate : 0
  };
}

function inspectMp4LikeBuffer(buffer, ext) {
  if (buffer.length < 12 || buffer.toString("ascii", 4, 8) !== "ftyp") return null;
  const boxSize = buffer.readUInt32BE(0);
  const majorBrand = buffer.toString("ascii", 8, 12).replace(/\0/g, "").trim();
  const compatibleBrands = [];
  for (let offset = 16; offset + 4 <= Math.min(buffer.length, boxSize); offset += 4) {
    const brand = buffer.toString("ascii", offset, offset + 4).replace(/\0/g, "").trim();
    if (brand) compatibleBrands.push(brand);
  }
  return {
    format: ext.slice(1),
    container: "iso-base-media",
    majorBrand,
    compatibleBrands: compatibleBrands.slice(0, 20)
  };
}

function inspectMp3Buffer(buffer) {
  if (buffer.length < 4) return null;
  const id3 = buffer.toString("ascii", 0, 3) === "ID3"
    ? {
        version: `${buffer[3]}.${buffer[4]}`,
        size: ((buffer[6] & 0x7f) << 21) | ((buffer[7] & 0x7f) << 14) | ((buffer[8] & 0x7f) << 7) | (buffer[9] & 0x7f)
      }
    : null;
  let hasFrame = false;
  for (let offset = id3 ? id3.size + 10 : 0; offset + 1 < Math.min(buffer.length, 4096); offset += 1) {
    if (buffer[offset] === 0xff && (buffer[offset + 1] & 0xe0) === 0xe0) {
      hasFrame = true;
      break;
    }
  }
  return id3 || hasFrame
    ? { format: "mp3", container: "mpeg-audio", id3, hasMpegFrame: hasFrame }
    : null;
}

function inspectMediaBuffer(buffer, ext, size) {
  const wav = inspectWavBuffer(buffer);
  if (wav) return wav;
  const mp4 = inspectMp4LikeBuffer(buffer, ext);
  if (mp4) return mp4;
  const mp3 = inspectMp3Buffer(buffer);
  if (mp3) return mp3;
  if (buffer.length >= 4 && buffer.readUInt32BE(0) === 0x1a45dfa3) {
    return { format: ext.slice(1), container: "ebml-webm", size };
  }
  return {
    format: ext.slice(1),
    container: "unknown",
    size,
    strings: extractReadableStrings(buffer, 20)
  };
}

async function inspectMediaTools(fullPath) {
  const ffprobe = await runLocalProcess("ffprobe", ["-version"], { cwd: APP_ROOT, timeout: 5000, maxBuffer: 128 * 1024 });
  if (!ffprobe.ok) return { ffprobe: { available: false, reason: "ffprobe not installed or not on PATH" } };
  const probe = await runLocalProcess("ffprobe", [
    "-v", "quiet",
    "-print_format", "json",
    "-show_format",
    "-show_streams",
    fullPath
  ], { cwd: APP_ROOT, timeout: 10000, maxBuffer: 1024 * 1024 });
  return {
    ffprobe: {
      available: true,
      ok: probe.ok,
      version: ffprobe.output.split(/\r?\n/)[0] || "ffprobe",
      metadata: probe.ok ? parseJsonOutput(probe.output, null) : null,
      reason: probe.ok ? "" : probe.output.slice(0, 1000)
    }
  };
}

async function inspectMediaTranscription(fullPath, ext, stat) {
  const audioLike = [".mp3", ".wav", ".m4a", ".mp4", ".mov", ".webm"].includes(ext);
  const sourceHash = crypto
    .createHash("sha256")
    .update(`${fullPath}:${stat.size}:${stat.mtimeMs}`)
    .digest("hex");
  const outputDir = path.join(APP_ROOT, ".forge", "media-transcripts");
  const transcriptPath = path.join(outputDir, `${sourceHash}.txt`);
  const metaPath = path.join(outputDir, `${sourceHash}.json`);
  const cachedText = await fs.readFile(transcriptPath, "utf8").catch(() => "");
  const cachedMeta = parseJsonOutput(await fs.readFile(metaPath, "utf8").catch(() => ""), null);
  if (!audioLike) {
    return {
      available: false,
      enabled: false,
      cached: Boolean(cachedText),
      engine: "whisper",
      artifact: cachedMeta || null,
      reason: "unsupported media extension"
    };
  }
  const whisper = await runLocalProcess("whisper", ["--help"], { cwd: APP_ROOT, timeout: 5000, maxBuffer: 128 * 1024 });
  if (!whisper.ok) {
    return {
      available: false,
      enabled: false,
      cached: Boolean(cachedText),
      engine: "whisper",
      artifact: cachedMeta || null,
      transcriptPath: cachedText ? transcriptPath : "",
      textSample: cachedText.slice(0, 8000),
      reason: "whisper CLI not installed or not on PATH"
    };
  }
  if (cachedText) {
    return {
      available: true,
      enabled: true,
      cached: true,
      engine: "whisper",
      transcriptPath,
      metaPath,
      artifact: cachedMeta || null,
      textSample: cachedText.slice(0, 8000),
      reason: ""
    };
  }
  if (process.env.FORGE_ENABLE_MEDIA_TRANSCRIPTION !== "1") {
    return {
      available: true,
      enabled: false,
      cached: false,
      engine: "whisper",
      transcriptPath,
      metaPath,
      reason: "set FORGE_ENABLE_MEDIA_TRANSCRIPTION=1 to run local transcription"
    };
  }
  if (stat.size > 25 * 1024 * 1024) {
    return {
      available: true,
      enabled: false,
      cached: false,
      engine: "whisper",
      transcriptPath,
      metaPath,
      reason: "media file exceeds 25MB transcription limit"
    };
  }
  await fs.mkdir(outputDir, { recursive: true });
  const rawOutputPath = path.join(outputDir, `${path.parse(fullPath).name}.txt`);
  const result = await runLocalProcess("whisper", [
    fullPath,
    "--model", process.env.FORGE_WHISPER_MODEL || "tiny",
    "--output_format", "txt",
    "--output_dir", outputDir,
    "--fp16", "False"
  ], { cwd: APP_ROOT, timeout: 180000, maxBuffer: 1024 * 1024 });
  const text = await fs.readFile(rawOutputPath, "utf8").catch(() => "");
  if (text) {
    await fs.writeFile(transcriptPath, text, "utf8");
    if (rawOutputPath !== transcriptPath) await fs.rm(rawOutputPath, { force: true }).catch(() => {});
  }
  const artifact = {
    engine: "whisper",
    model: process.env.FORGE_WHISPER_MODEL || "tiny",
    sourcePath: fullPath,
    sourceHash,
    sourceSize: stat.size,
    transcriptPath: text ? transcriptPath : "",
    generatedAt: new Date().toISOString(),
    cached: false
  };
  await fs.writeFile(metaPath, JSON.stringify(artifact, null, 2), "utf8").catch(() => {});
  return {
    available: result.ok,
    enabled: true,
    cached: false,
    engine: "whisper",
    model: artifact.model,
    transcriptPath: text ? transcriptPath : "",
    metaPath,
    artifact,
    textSample: text.slice(0, 8000),
    reason: result.ok ? "" : result.output.slice(0, 1000)
  };
}

async function inspectAsset(relativePath) {
  const normalized = normalizeWorkspacePath(relativePath);
  const full = safePath(normalized);
  const stat = await fs.stat(full);
  if (!stat.isFile()) throw new Error("资产路径不是文件。");
  const ext = path.extname(full).toLowerCase();
  const type = classifyAsset(full);
  if (!type) throw new Error("该文件不是已识别的多模态资产。");
  const maxBytes = Math.min(stat.size, 2 * 1024 * 1024);
  const handle = await fs.open(full, "r");
  const buffer = Buffer.alloc(maxBytes);
  try {
    await handle.read(buffer, 0, maxBytes, 0);
  } finally {
    await handle.close();
  }
  const data = buffer.subarray(0, maxBytes);
  const base = {
    path: toPosix(normalized),
    type,
    ext,
    size: stat.size,
    sampledBytes: data.length,
    modifiedAt: stat.mtime.toISOString(),
    inspectedAt: new Date().toISOString(),
    policy: {
      access: "read-content",
      scope: "currentWorkspace",
      maxBytes: 2 * 1024 * 1024
    }
  };
  if (type === "image") {
    const text = ext === ".svg" ? data.toString("utf8") : "";
    return {
      ...base,
      image: inspectImageBuffer(data, ext),
      vision: inspectImageVision(data, ext),
      ocr: await inspectImageOcr(full, ext, stat),
      preview: text ? text.replace(/\s+/g, " ").slice(0, 2000) : "",
      strings: text ? [] : extractReadableStrings(data, 12)
    };
  }
  if (type === "data") {
    const text = data.toString("utf8").replace(/^\uFEFF/, "");
    if (ext === ".jsonl") {
      const lines = text.split(/\r?\n/).filter(Boolean).slice(0, 20);
      const records = lines.map((line) => JSON.parse(line));
      return {
        ...base,
        data: {
          format: "jsonl",
          rowsSampled: records.length,
          keys: [...new Set(records.flatMap((item) => Object.keys(item || {})))].slice(0, 40),
          rows: records.slice(0, 5)
        }
      };
    }
    if ([".csv", ".tsv"].includes(ext)) {
      const delimiter = ext === ".tsv" ? "\t" : ",";
      const lines = text.split(/\r?\n/).filter((line) => line.trim()).slice(0, 30);
      const headers = lines[0] ? splitDelimitedLine(lines[0], delimiter) : [];
      const rows = lines.slice(1, 6).map((line) => splitDelimitedLine(line, delimiter));
      return {
        ...base,
        data: {
          format: ext.slice(1),
          delimiter,
          headers,
          rowsSampled: Math.max(0, lines.length - 1),
          rows
        }
      };
    }
    if (ext === ".parquet") {
      return {
        ...base,
        data: inspectParquetBuffer(data, stat.size)
      };
    }
  }
  if (type === "document") {
    const document = [".docx", ".pptx", ".xlsx"].includes(ext)
      ? inspectOfficeOpenXml(data, ext)
      : ext === ".pdf"
        ? inspectPdfBuffer(data)
        : inspectLegacyOfficeBinary(data, ext);
    return {
      ...base,
      document
    };
  }
  if (type === "media") {
    const media = inspectMediaBuffer(data, ext, stat.size);
    const tools = await inspectMediaTools(full);
    const transcription = await inspectMediaTranscription(full, ext, stat);
    return {
      ...base,
      media,
      mediaTools: tools,
      transcription
    };
  }
  return base;
}

async function readWorkspaceFile(relativePath) {
  const full = safePath(relativePath);
  return fs.readFile(full, "utf8");
}

async function readWorkspaceFileRange(relativePath, startLine = 1, lineCount = 120) {
  const content = await readWorkspaceFile(relativePath);
  const lines = content.split(/\r?\n/);
  const start = Math.max(1, Number(startLine) || 1);
  const count = Math.min(400, Math.max(1, Number(lineCount) || 120));
  return lines
    .slice(start - 1, start - 1 + count)
    .map((line, index) => `${String(start + index).padStart(4, " ")}: ${line}`)
    .join("\n");
}

async function readWorkspaceSourceLocationContext(location = {}, contextLines = 6) {
  const filePath = String(location.path || location.file || "").replaceAll("\\", "/");
  const line = Math.max(1, Number(location.line) || 1);
  const around = Math.min(40, Math.max(0, Number(contextLines) || 6));
  const startLine = Math.max(1, line - around);
  const lineCount = around * 2 + 1;
  return {
    path: filePath,
    line,
    column: Math.max(0, Number(location.column) || 0),
    startLine,
    lineCount,
    context: await readWorkspaceFileRange(filePath, startLine, lineCount)
  };
}

async function readWorkspaceSourceLocationContexts(locations = [], contextLines = 6, limit = 8) {
  const max = Math.min(20, Math.max(1, Number(limit) || 8));
  const seen = new Set();
  const contexts = [];
  for (const location of Array.isArray(locations) ? locations : []) {
    const filePath = String(location?.path || location?.file || "").replaceAll("\\", "/");
    const line = Math.max(1, Number(location?.line) || 1);
    const column = Math.max(0, Number(location?.column) || 0);
    const key = `${filePath.toLowerCase()}:${line}:${column}`;
    if (!filePath || seen.has(key) || contexts.length >= max) continue;
    seen.add(key);
    const item = await readWorkspaceSourceLocationContext({ path: filePath, line, column }, contextLines).catch((error) => ({
      path: filePath,
      line,
      column,
      error: error.message || String(error)
    }));
    contexts.push(item);
  }
  return contexts;
}

async function searchFiles(query, limit = 20) {
  const term = String(query || "").toLowerCase();
  if (!term) return [];
  const files = await listFiles();
  const matches = [];
  for (const file of files) {
    if (matches.length >= limit) break;
    const content = await readWorkspaceFile(file.path).catch(() => "");
    const lines = content.split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      if (lines[index].toLowerCase().includes(term)) {
        matches.push({
          path: file.path,
          line: index + 1,
          text: lines[index].slice(0, 240)
        });
        break;
      }
    }
  }
  return matches;
}

function extractSymbols(filePath, content) {
  const ext = path.extname(filePath).toLowerCase();
  const lines = content.split(/\r?\n/);
  const symbols = [];
  const add = (type, name, line) => {
    if (!name || symbols.length >= 30) return;
    symbols.push({ path: filePath, type, name, line });
  };

  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    if ([".js", ".jsx", ".mjs", ".ts", ".tsx"].includes(ext)) {
      const fn = /\b(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/.exec(line);
      const cls = /\bclass\s+([A-Za-z_$][\w$]*)/.exec(line);
      const arrow = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\(?[^=]*?\)?\s*=>/.exec(line);
      const method = /^\s*(?:async\s+)?([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{/.exec(line);
      const imp = /^\s*import\s+.*?\s+from\s+["']([^"']+)["']/.exec(line);
      if (fn) add("function", fn[1], lineNumber);
      if (cls) add("class", cls[1], lineNumber);
      if (arrow) add("function", arrow[1], lineNumber);
      if (method && !["if", "for", "while", "switch", "catch", "function"].includes(method[1])) {
        add("method", method[1], lineNumber);
      }
      if (imp) add("import", imp[1], lineNumber);
    } else if (ext === ".css" || ext === ".scss") {
      const selector = /^\s*([.#][A-Za-z0-9_-][^{,]*)\s*\{/.exec(line);
      if (selector) add("selector", selector[1].trim(), lineNumber);
    } else if (ext === ".html") {
      const id = /\bid=["']([^"']+)["']/.exec(line);
      if (id) add("id", id[1], lineNumber);
    }
  });

  return symbols;
}

function findLineNumber(lines, offset) {
  let total = 0;
  for (let index = 0; index < lines.length; index += 1) {
    total += lines[index].length + 1;
    if (offset < total) return index + 1;
  }
  return Math.max(1, lines.length);
}

function uniqueLimited(items, limit = 80) {
  return [...new Set(items.filter(Boolean))].slice(0, limit);
}

function splitSemanticParameters(raw = "") {
  return String(raw || "")
    .split(",")
    .map((item) => item.trim().replace(/\s*=.+$/, "").replace(/^\.\.\./, ""))
    .filter(Boolean)
    .slice(0, 24);
}

function countBraceDelta(line = "") {
  const stripped = String(line || "")
    .replace(/(["'`])(?:\\.|(?!\1).)*\1/g, "")
    .replace(/\/\/.*$/, "");
  return (stripped.match(/\{/g) || []).length - (stripped.match(/\}/g) || []).length;
}

function inferBlockEndLine(lines, startLine) {
  let depth = 0;
  let opened = false;
  for (let index = Math.max(0, startLine - 1); index < lines.length; index += 1) {
    const delta = countBraceDelta(lines[index]);
    if (delta !== 0) opened = true;
    depth += delta;
    if (opened && depth <= 0) return index + 1;
  }
  return startLine;
}

function inferPythonBlockEndLine(lines, startLine, indent) {
  for (let index = startLine; index < lines.length; index += 1) {
    const line = lines[index] || "";
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const currentIndent = (line.match(/^\s*/) || [""])[0].length;
    if (currentIndent <= indent) return index;
  }
  return lines.length;
}

function extractSymbolOutline(filePath, content) {
  const ext = path.extname(filePath).toLowerCase();
  const lines = content.split(/\r?\n/);
  const outline = [];
  const classStack = [];
  const add = (item) => {
    if (!item.name || outline.length >= 2000) return;
    outline.push({
      path: filePath,
      kind: item.kind,
      name: item.name,
      line: item.line,
      endLine: item.endLine || item.line,
      params: item.params || [],
      container: item.container || "",
      signature: item.signature || ""
    });
  };

  if ([".js", ".jsx", ".mjs", ".ts", ".tsx", ".vue"].includes(ext)) {
    lines.forEach((line, index) => {
      const lineNumber = index + 1;
      while (classStack.length && lineNumber > classStack[classStack.length - 1].endLine) classStack.pop();
      const classMatch = /^\s*(?:export\s+)?(?:default\s+)?class\s+([A-Za-z_$][\w$]*)/.exec(line);
      if (classMatch) {
        const endLine = inferBlockEndLine(lines, lineNumber);
        classStack.push({ name: classMatch[1], endLine });
        add({ kind: "class", name: classMatch[1], line: lineNumber, endLine, signature: line.trim().slice(0, 180) });
        return;
      }
      const functionMatch = /^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(([^)]*)\)/.exec(line);
      if (functionMatch) {
        add({
          kind: "function",
          name: functionMatch[1],
          line: lineNumber,
          endLine: inferBlockEndLine(lines, lineNumber),
          params: splitSemanticParameters(functionMatch[2]),
          signature: line.trim().slice(0, 180)
        });
        return;
      }
      const arrowMatch = /^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\(([^)]*)\)|([A-Za-z_$][\w$]*))\s*=>/.exec(line);
      if (arrowMatch) {
        add({
          kind: "function",
          name: arrowMatch[1],
          line: lineNumber,
          endLine: inferBlockEndLine(lines, lineNumber),
          params: splitSemanticParameters(arrowMatch[2] || arrowMatch[3] || ""),
          signature: line.trim().slice(0, 180)
        });
        return;
      }
      const methodMatch = /^\s{2,}(?:async\s+)?([A-Za-z_$][\w$]*)\s*\(([^)]*)\)\s*\{/.exec(line);
      const container = classStack[classStack.length - 1]?.name || "";
      if (methodMatch && container && !["if", "for", "while", "switch", "catch"].includes(methodMatch[1])) {
        add({
          kind: "method",
          name: methodMatch[1],
          line: lineNumber,
          endLine: inferBlockEndLine(lines, lineNumber),
          params: splitSemanticParameters(methodMatch[2]),
          container,
          signature: line.trim().slice(0, 180)
        });
      }
    });
  } else if (ext === ".py") {
    const stack = [];
    lines.forEach((line, index) => {
      const lineNumber = index + 1;
      const indent = (line.match(/^\s*/) || [""])[0].length;
      while (stack.length && indent <= stack[stack.length - 1].indent && line.trim()) stack.pop();
      const classMatch = /^(\s*)class\s+([A-Za-z_][\w]*)\s*[:(]/.exec(line);
      if (classMatch) {
        const endLine = inferPythonBlockEndLine(lines, lineNumber, indent);
        stack.push({ name: classMatch[2], indent, endLine });
        add({ kind: "class", name: classMatch[2], line: lineNumber, endLine, signature: line.trim().slice(0, 180) });
        return;
      }
      const functionMatch = /^(\s*)(?:async\s+)?def\s+([A-Za-z_][\w]*)\s*\(([^)]*)\)/.exec(line);
      if (functionMatch) {
        const container = stack[stack.length - 1]?.name || "";
        add({
          kind: container ? "method" : "function",
          name: functionMatch[2],
          line: lineNumber,
          endLine: inferPythonBlockEndLine(lines, lineNumber, indent),
          params: splitSemanticParameters(functionMatch[3]),
          container,
          signature: line.trim().slice(0, 180)
        });
      }
    });
  }

  return outline;
}

function extractSemanticSignals(filePath, content) {
  const ext = path.extname(filePath).toLowerCase();
  const lines = content.split(/\r?\n/);
  const supported = [".js", ".jsx", ".mjs", ".ts", ".tsx", ".py", ".css", ".scss", ".html", ".vue"].includes(ext);
  if (!supported) return null;

  const record = {
    path: filePath,
    language: ext.replace(".", "") || "text",
    imports: [],
    exports: [],
    declarations: [],
    symbolOutline: [],
    calls: [],
    selectors: [],
    routes: [],
    entrypoints: []
  };

  const addDeclaration = (kind, name, line) => {
    if (!name || record.declarations.length >= 80) return;
    if (record.declarations.some((item) => item.kind === kind && item.name === name && item.line === line)) return;
    record.declarations.push({ kind, name, line });
  };
  const addImport = (source, line, names = []) => {
    if (!source || record.imports.length >= 80) return;
    record.imports.push({ source, line, names: uniqueLimited(names, 20) });
  };
  const addExport = (name, line) => {
    if (!name || record.exports.length >= 80) return;
    record.exports.push({ name, line });
  };

  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    if ([".js", ".jsx", ".mjs", ".ts", ".tsx", ".vue"].includes(ext)) {
      const importFrom = /^\s*import\s+(.+?)\s+from\s+["']([^"']+)["']/.exec(line);
      const importBare = /^\s*import\s+["']([^"']+)["']/.exec(line);
      const requireCall = /\brequire\(\s*["']([^"']+)["']\s*\)/.exec(line);
      const exportNamed = /^\s*export\s+(?:async\s+)?(?:function|class|const|let|var|interface|type)\s+([A-Za-z_$][\w$]*)/.exec(line);
      const exportList = /^\s*export\s*\{([^}]+)\}/.exec(line);
      const route = /\b(?:app|router)\.(get|post|put|patch|delete|use)\(\s*["'`]([^"'`]+)["'`]/.exec(line);
      const urlPathMatch = /\burl\.pathname\s*===\s*["'`]([^"'`]+)["'`]/.exec(line);

      if (importFrom) addImport(importFrom[2], lineNumber, importFrom[1].match(/[A-Za-z_$][\w$]*/g) || []);
      if (importBare) addImport(importBare[1], lineNumber);
      if (requireCall) addImport(requireCall[1], lineNumber);
      if (exportNamed) addExport(exportNamed[1], lineNumber);
      if (exportList) {
        for (const name of exportList[1].match(/[A-Za-z_$][\w$]*/g) || []) addExport(name, lineNumber);
      }
      if (route) record.routes.push({ method: route[1].toUpperCase(), path: route[2], line: lineNumber });
      if (urlPathMatch) {
        const methods = [...line.matchAll(/\breq\.method\s*===\s*["']([A-Z]+)["']/g)].map((match) => match[1]);
        for (const method of uniqueLimited(methods, 8)) {
          record.routes.push({ method, path: urlPathMatch[1], line: lineNumber });
        }
      }
      if (/\b(?:fetch|api)\(\s*["'`]/.test(line)) {
        const callWindow = lines.slice(index, Math.min(lines.length, index + 8)).join("\n");
        for (const callMatch of callWindow.matchAll(/\b(?:fetch|api)\(\s*["'`]([^"'`]+)["'`]/g)) {
          const callText = callWindow.slice(callMatch.index || 0, (callMatch.index || 0) + 500);
          const methodMatch = /\bmethod\s*:\s*["']([A-Z]+)["']/.exec(callText);
          record.routes.push({
            method: "FETCH",
            path: callMatch[1],
            line: lineNumber,
            clientMethod: methodMatch?.[1] || "GET"
          });
        }
      }
    } else if (ext === ".py") {
      const imp = /^\s*(?:from\s+([\w.]+)\s+import\s+(.+)|import\s+(.+))/.exec(line);
      if (imp) addImport(imp[1] || imp[3], lineNumber, (imp[2] || "").match(/[A-Za-z_][\w]*/g) || []);
      const exportName = /^\s*__all__\s*=/.test(line) ? "__all__" : "";
      if (exportName) addExport(exportName, lineNumber);
    } else if (ext === ".css" || ext === ".scss") {
      const selector = /^\s*([.#][A-Za-z0-9_-][^{,]*)\s*\{/.exec(line);
      if (selector) record.selectors.push({ selector: selector[1].trim(), line: lineNumber });
    } else if (ext === ".html") {
      for (const id of line.matchAll(/\bid=["']([^"']+)["']/g)) record.selectors.push({ selector: `#${id[1]}`, line: lineNumber });
      for (const cls of line.matchAll(/\bclass=["']([^"']+)["']/g)) {
        for (const name of cls[1].split(/\s+/).filter(Boolean)) record.selectors.push({ selector: `.${name}`, line: lineNumber });
      }
    }
  });

  for (const match of content.matchAll(/\b(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g)) {
    addDeclaration("function", match[1], findLineNumber(lines, match.index || 0));
  }
  for (const match of content.matchAll(/\bclass\s+([A-Za-z_$][\w$]*)/g)) {
    addDeclaration("class", match[1], findLineNumber(lines, match.index || 0));
  }
  for (const match of content.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\(?[^=;]*?\)?\s*=>/g)) {
    addDeclaration("function", match[1], findLineNumber(lines, match.index || 0));
  }
  if (ext === ".py") {
    for (const match of content.matchAll(/^\s*def\s+([A-Za-z_][\w]*)\s*\(/gm)) {
      addDeclaration("function", match[1], findLineNumber(lines, match.index || 0));
    }
    for (const match of content.matchAll(/^\s*class\s+([A-Za-z_][\w]*)\s*[:(]/gm)) {
      addDeclaration("class", match[1], findLineNumber(lines, match.index || 0));
    }
  }
  record.symbolOutline = extractSymbolOutline(filePath, content);
  for (const item of record.symbolOutline) {
    addDeclaration(item.kind, item.name, item.line);
  }
  for (const match of content.matchAll(/\b([A-Za-z_$][\w$]*)\s*\(/g)) {
    const name = match[1];
    if (["if", "for", "while", "switch", "catch", "function", "return", "typeof"].includes(name)) continue;
    record.calls.push({ name, line: findLineNumber(lines, match.index || 0) });
    if (record.calls.length >= 120) break;
  }

  record.imports = record.imports.slice(0, 80);
  record.exports = record.exports.slice(0, 80);
  record.declarations = record.declarations.slice(0, 80);
  record.symbolOutline = record.symbolOutline.slice(0, 2000);
  record.calls = record.calls.slice(0, 120);
  record.selectors = record.selectors.slice(0, 120);
  record.routes = record.routes.slice(0, 80);
  if (["package.json", "server.js", "app.js", "index.html"].includes(path.basename(filePath))) {
    record.entrypoints.push(path.basename(filePath));
  }
  return record;
}

async function buildSemanticIndex({ persist = false } = {}) {
  const files = await listSemanticFiles();
  const records = [];
  const declarations = [];
  const imports = [];
  const routes = [];
  const selectors = [];
  const symbolOutline = [];
  const callGraph = {};

  for (const file of files) {
    const content = await readWorkspaceFile(file.path).catch(() => "");
    const record = extractSemanticSignals(file.path, content);
    if (!record) continue;
    records.push(record);
    for (const declaration of record.declarations) declarations.push({ ...declaration, path: file.path });
    for (const item of record.imports) imports.push({ ...item, path: file.path });
    for (const route of record.routes) routes.push({ ...route, route: route.route || route.path, path: file.path });
    for (const selector of record.selectors) selectors.push({ ...selector, path: file.path });
    for (const item of record.symbolOutline || []) symbolOutline.push({ ...item, path: file.path });
    callGraph[file.path] = uniqueLimited(record.calls.map((item) => item.name), 160);
  }

  const index = {
    workspace: currentWorkspace,
    generatedAt: new Date().toISOString(),
    fileCount: files.length,
    indexedFiles: records.length,
    summary: {
      declarations: declarations.length,
      imports: imports.length,
      routes: routes.length,
      selectors: selectors.length,
      symbolOutline: symbolOutline.length,
      callEdges: Object.values(callGraph).reduce((total, calls) => total + calls.length, 0)
    },
    records: records.slice(0, 240),
    declarations: declarations.slice(0, 400),
    imports: imports.slice(0, 300),
    routes: routes.slice(0, 800),
    selectors: selectors.slice(0, 240),
    symbolOutline: symbolOutline.slice(0, 2000),
    callGraph
  };
  if (persist) {
    await fs.mkdir(STATE_DIR, { recursive: true });
    await fs.writeFile(SEMANTIC_INDEX_PATH, JSON.stringify(index, null, 2), "utf8");
  }
  return index;
}

async function readSemanticIndex() {
  try {
    return JSON.parse(await fs.readFile(SEMANTIC_INDEX_PATH, "utf8"));
  } catch {
    return null;
  }
}

function semanticMatch(value, query) {
  return String(value || "").toLowerCase().includes(query);
}

async function searchSemanticIndex(query = "", { kind = "all", limit = 50 } = {}) {
  const term = String(query || "").trim().toLowerCase();
  if (!term) return { query, kind, matches: [] };
  const index = await readSemanticIndex() || await buildSemanticIndex();
  const normalizedKind = String(kind || "all").toLowerCase();
  const max = Math.min(100, Math.max(1, Number(limit) || 50));
  const matches = [];
  const wants = (...types) => normalizedKind === "all" || types.includes(normalizedKind);
  const push = (item) => {
    const key = `${item.kind || ""}:${item.path || ""}:${item.line || ""}:${item.name || item.route || item.selector || item.source || ""}`;
    if (matches.some((match) => `${match.kind || ""}:${match.path || ""}:${match.line || ""}:${match.name || match.route || match.selector || match.source || ""}` === key)) return;
    if (matches.length < max) matches.push(item);
  };

  for (const item of index.declarations || []) {
    if (!wants("declaration", "symbol")) continue;
    if (semanticMatch(item.name, term) || semanticMatch(item.kind, term) || semanticMatch(item.path, term)) {
      push({ kind: "declaration", path: item.path, line: item.line, name: item.name, type: item.kind });
    }
  }
  for (const item of index.symbolOutline || []) {
    if (!wants("declaration", "symbol", "outline")) continue;
    if (semanticMatch(item.name, term) || semanticMatch(item.kind, term) || semanticMatch(item.path, term) || semanticMatch(item.signature, term)) {
      push({ kind: "declaration", path: item.path, line: item.line, endLine: item.endLine, name: item.name, type: item.kind });
    }
  }
  for (const item of index.imports || []) {
    if (!wants("import", "dependency")) continue;
    if (semanticMatch(item.source, term) || semanticMatch((item.names || []).join(" "), term) || semanticMatch(item.path, term)) {
      push({ kind: "import", path: item.path, line: item.line, source: item.source, names: item.names || [] });
    }
  }
  for (const item of index.routes || []) {
    if (!wants("route", "api")) continue;
    if (semanticMatch(item.path, term) || semanticMatch(item.method, term)) {
      push({ kind: "route", path: item.path, line: item.line, method: item.method, route: item.path });
    }
  }
  for (const item of index.selectors || []) {
    if (!wants("selector", "ui")) continue;
    if (semanticMatch(item.selector, term) || semanticMatch(item.path, term)) {
      push({ kind: "selector", path: item.path, line: item.line, selector: item.selector });
    }
  }
  for (const record of index.records || []) {
    if (wants("file") && semanticMatch(record.path, term)) {
      push({ kind: "file", path: record.path, language: record.language, declarations: record.declarations.length });
    }
    if (wants("call", "reference")) {
      for (const call of record.calls || []) {
        if (semanticMatch(call.name, term)) {
          push({ kind: "call", path: record.path, line: call.line, name: call.name });
          if (matches.length >= max) break;
        }
      }
    }
    if (matches.length >= max) break;
  }
  return {
    query,
    kind: normalizedKind,
    generatedAt: index.generatedAt,
    matchCount: matches.length,
    matches
  };
}

async function attachReferenceContext(items, contextLines = 6) {
  const safeContextLines = Math.min(20, Math.max(0, Number(contextLines) || 6));
  const enriched = [];
  for (const item of items) {
    if (!item.path || !item.line) {
      enriched.push(item);
      continue;
    }
    const startLine = Math.max(1, Number(item.line) - safeContextLines);
    const lineCount = safeContextLines * 2 + 1;
    enriched.push({
      ...item,
      context: await readWorkspaceFileRange(item.path, startLine, lineCount).catch(() => "")
    });
  }
  return enriched;
}

async function buildSemanticReferences(symbol = "", { limit = 80, contextLines = 6 } = {}) {
  const name = String(symbol || "").trim();
  if (!name) return { symbol, matchCount: 0, declarations: [], calls: [], imports: [], exports: [], matches: [] };
  const lowerName = name.toLowerCase();
  const index = await readSemanticIndex() || await buildSemanticIndex();
  const max = Math.min(200, Math.max(1, Number(limit) || 80));
  const declarations = [];
  const calls = [];
  const imports = [];
  const exports = [];

  for (const item of index.declarations || []) {
    if (String(item.name || "").toLowerCase() === lowerName) {
      declarations.push({ kind: "declaration", path: item.path, line: item.line, name: item.name, type: item.kind });
    }
  }
  for (const item of index.symbolOutline || []) {
    if (String(item.name || "").toLowerCase() === lowerName) {
      declarations.push({
        kind: "declaration",
        path: item.path,
        line: item.line,
        endLine: item.endLine || item.line,
        name: item.name,
        type: item.kind || item.type || "symbol",
        signature: item.signature || ""
      });
    }
  }
  for (const item of index.imports || []) {
    const names = item.names || [];
    if (names.some((entry) => String(entry).toLowerCase() === lowerName) || String(item.source || "").toLowerCase().includes(lowerName)) {
      imports.push({ kind: "import", path: item.path, line: item.line, source: item.source, names });
    }
  }
  for (const record of index.records || []) {
    for (const item of record.exports || []) {
      if (String(item.name || "").toLowerCase() === lowerName) {
        exports.push({ kind: "export", path: record.path, line: item.line, name: item.name });
      }
    }
    for (const item of record.calls || []) {
      if (String(item.name || "").toLowerCase() === lowerName) {
        calls.push({ kind: "call", path: record.path, line: item.line, name: item.name });
      }
    }
  }

  const combined = [...declarations, ...exports, ...imports, ...calls].slice(0, max);
  const withContext = await attachReferenceContext(combined, contextLines);
  return {
    symbol: name,
    generatedAt: index.generatedAt,
    matchCount: combined.length,
    declarations: withContext.filter((item) => item.kind === "declaration"),
    exports: withContext.filter((item) => item.kind === "export"),
    imports: withContext.filter((item) => item.kind === "import"),
    calls: withContext.filter((item) => item.kind === "call"),
    matches: withContext
  };
}

async function buildSymbolOutline({ query = "", path: targetPath = "", limit = 120, includeContext = false } = {}) {
  const index = await readSemanticIndex() || await buildSemanticIndex();
  const term = String(query || "").trim().toLowerCase();
  const normalizedPath = toPosix(String(targetPath || "").trim()).replace(/^\.?\//, "");
  const max = Math.min(300, Math.max(1, Number(limit) || 120));
  let symbols = index.symbolOutline || [];
  if (normalizedPath) symbols = symbols.filter((item) => toPosix(item.path || "") === normalizedPath);
  if (term) {
    symbols = symbols.filter((item) => [
      item.name,
      item.kind,
      item.container,
      item.signature,
      item.path
    ].some((value) => semanticMatch(value, term)));
  }
  const ranked = symbols
    .map((item) => ({
      ...item,
      spanLines: Math.max(1, (item.endLine || item.line || 1) - (item.line || 1) + 1),
      label: item.container ? `${item.container}.${item.name}` : item.name
    }))
    .sort((left, right) => left.path.localeCompare(right.path) || (left.line || 0) - (right.line || 0))
    .slice(0, max);
  return {
    generatedAt: new Date().toISOString(),
    indexGeneratedAt: index.generatedAt,
    query,
    path: normalizedPath,
    summary: {
      totalSymbols: (index.symbolOutline || []).length,
      matched: symbols.length,
      returned: ranked.length,
      byKind: topByCount(symbols, "kind", 20),
      byFile: topByCount(symbols, "path", 20)
    },
    symbols: includeContext ? await attachReferenceContext(ranked, 1) : ranked,
    policy: {
      access: "local-read-only",
      scope: "currentWorkspace"
    }
  };
}

async function buildSemanticDefinition(symbol = "", { path: targetPath = "", line = 0, contextLines = 4, limit = 20 } = {}) {
  const name = String(symbol || "").trim();
  const normalizedPath = toPosix(String(targetPath || "").trim()).replace(/^\.?\//, "");
  const targetLine = Number(line) || 0;
  const max = Math.min(80, Math.max(1, Number(limit) || 20));
  const index = await readSemanticIndex() || await buildSemanticIndex();
  const lowerName = name.toLowerCase();
  let candidates = (index.symbolOutline || []).filter((item) => {
    if (normalizedPath && toPosix(item.path || "") !== normalizedPath) return false;
    if (lowerName && String(item.name || "").toLowerCase() !== lowerName) return false;
    if (!lowerName && targetLine > 0) return (item.line || 0) <= targetLine && (item.endLine || item.line || 0) >= targetLine;
    return Boolean(lowerName);
  });
  if (!candidates.length && lowerName) {
    candidates = (index.declarations || []).filter((item) => {
      if (normalizedPath && toPosix(item.path || "") !== normalizedPath) return false;
      return String(item.name || "").toLowerCase() === lowerName;
    });
  }
  const ranked = candidates
    .map((item) => ({
      kind: "definition",
      path: item.path,
      line: item.line,
      endLine: item.endLine || item.line,
      name: item.name,
      type: item.kind || item.type || "symbol",
      params: item.params || [],
      container: item.container || "",
      signature: item.signature || "",
      spanLines: Math.max(1, (item.endLine || item.line || 1) - (item.line || 1) + 1),
      score: (normalizedPath && toPosix(item.path || "") === normalizedPath ? 10 : 0)
        + (targetLine > 0 && (item.line || 0) <= targetLine && (item.endLine || item.line || 0) >= targetLine ? 20 : 0)
        + (lowerName && String(item.name || "").toLowerCase() === lowerName ? 10 : 0)
    }))
    .sort((left, right) => right.score - left.score || left.path.localeCompare(right.path) || (left.line || 0) - (right.line || 0))
    .slice(0, max);
  return {
    generatedAt: new Date().toISOString(),
    indexGeneratedAt: index.generatedAt,
    symbol: name,
    path: normalizedPath,
    line: targetLine || null,
    matchCount: candidates.length,
    definitions: await attachReferenceContext(ranked, contextLines),
    policy: {
      access: "local-read-only",
      scope: "currentWorkspace",
      usesSymbolOutline: true
    }
  };
}

async function buildSemanticSymbolImpact(symbol = "", { path: targetPath = "", line = 0, limit = 80, contextLines = 4 } = {}) {
  const name = String(symbol || "").trim();
  const normalizedPath = toPosix(String(targetPath || "").trim()).replace(/^\.?\//, "");
  const targetLine = Number(line) || 0;
  const max = Math.min(200, Math.max(1, Number(limit) || 80));
  const context = Math.min(20, Math.max(0, Number(contextLines) || 4));
  const definition = await buildSemanticDefinition(name, {
    path: normalizedPath,
    line: targetLine,
    contextLines: context,
    limit: max
  });
  const references = await buildSemanticReferences(name, {
    limit: max,
    contextLines: context
  });
  const locations = [
    ...(definition.definitions || []),
    ...(references.matches || [])
  ].filter((item) => item?.path);
  const impactedPaths = uniqueLimited(locations.map((item) => toPosix(item.path)), max);
  const impact = await buildSemanticImpact({
    paths: impactedPaths,
    limit: max,
    includeContext: true
  });
  const editTargets = uniqueLimited([
    ...(definition.definitions || []).map((item) => item.path),
    ...(references.calls || []).map((item) => item.path),
    ...(references.imports || []).map((item) => item.path)
  ].filter(Boolean).map(toPosix), 40);
  const verificationCommands = dedupeCommandItems([
    commandItem("node --check server.js", "复查后端入口语法。"),
    commandItem("node --check app.js", "复查前端入口语法。"),
    commandItem("node server.js --api-smoke-section=semantic", "复查符号索引、定义、引用和影响面。"),
    commandItem("node server.js --api-smoke-section=debug", "复查失败诊断和源码定位闭环。")
  ]);
  return {
    generatedAt: new Date().toISOString(),
    symbol: name,
    path: normalizedPath,
    line: targetLine || null,
    summary: {
      definitions: definition.definitions?.length || 0,
      references: references.matchCount || 0,
      calls: references.calls?.length || 0,
      imports: references.imports?.length || 0,
      exports: references.exports?.length || 0,
      impactedPaths: impactedPaths.length,
      editTargets: editTargets.length,
      dependents: impact.summary?.dependents || 0,
      callers: impact.summary?.callers || 0
    },
    definition,
    references: {
      ...references,
      matches: (references.matches || []).slice(0, max)
    },
    impact,
    editTargets,
    verificationCommands,
    repairContext: [
      `symbol: ${name || "(line lookup)"}`,
      normalizedPath ? `path: ${normalizedPath}` : "",
      targetLine ? `line: ${targetLine}` : "",
      editTargets.length ? `editTargets: ${editTargets.join(", ")}` : "",
      verificationCommands.length ? `verificationCommands: ${verificationCommands.map((item) => item.command).join(" | ")}` : ""
    ].filter(Boolean).join("\n"),
    policy: {
      access: "local-read-only",
      scope: "currentWorkspace",
      executesCommands: false,
      usesSymbolOutline: true,
      includesImpact: true
    }
  };
}

function isSemanticIdentifierChar(value = "") {
  return /[A-Za-z0-9_$]/.test(value);
}

function replaceCodeIdentifierOccurrences(line = "", symbol = "", replacement = "") {
  const source = String(line || "");
  const name = String(symbol || "");
  const nextName = String(replacement || "");
  if (!name || !nextName) return { text: source, count: 0 };
  let output = "";
  let count = 0;
  let index = 0;
  let quote = "";
  let escaped = false;
  let inLineComment = false;
  while (index < source.length) {
    const char = source[index];
    const next = source[index + 1] || "";
    if (inLineComment) {
      output += source.slice(index);
      break;
    }
    if (quote) {
      output += char;
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === quote) {
        quote = "";
      }
      index += 1;
      continue;
    }
    if ((char === "\"" || char === "'" || char === "`")) {
      quote = char;
      output += char;
      index += 1;
      continue;
    }
    if (char === "/" && next === "/") {
      inLineComment = true;
      output += char;
      index += 1;
      continue;
    }
    if (source.startsWith(name, index)) {
      const before = index > 0 ? source[index - 1] : "";
      const after = source[index + name.length] || "";
      if (!isSemanticIdentifierChar(before) && !isSemanticIdentifierChar(after)) {
        output += nextName;
        count += 1;
        index += name.length;
        continue;
      }
    }
    output += char;
    index += 1;
  }
  return { text: output, count };
}

async function buildSemanticRenamePreview(symbol = "", newName = "", { path: targetPath = "", line = 0, limit = 80, contextLines = 3 } = {}) {
  const name = String(symbol || "").trim();
  const replacement = String(newName || "").trim();
  const normalizedPath = toPosix(String(targetPath || "").trim()).replace(/^\.?\//, "");
  const targetLine = Number(line) || 0;
  const max = Math.min(200, Math.max(1, Number(limit) || 80));
  const context = Math.min(12, Math.max(0, Number(contextLines) || 3));
  const warnings = [];
  const identifierPattern = /^[A-Za-z_$][\w$]*$/;
  if (!name) warnings.push("missing-symbol");
  if (!replacement) warnings.push("missing-new-name");
  if (replacement && !identifierPattern.test(replacement)) warnings.push("new-name-is-not-a-javascript-identifier");
  if (name && replacement && name === replacement) warnings.push("new-name-matches-current-symbol");

  const definition = await buildSemanticDefinition(name, {
    path: normalizedPath,
    line: targetLine,
    contextLines: context,
    limit: max
  });
  const references = await buildSemanticReferences(name, {
    limit: max,
    contextLines: context
  });
  const index = await readSemanticIndex() || await buildSemanticIndex();
  const lowerReplacement = replacement.toLowerCase();
  const replacementConflicts = replacement
    ? (index.symbolOutline || [])
      .filter((item) => {
        if (String(item.name || "").toLowerCase() !== lowerReplacement) return false;
        if (normalizedPath && toPosix(item.path || "") !== normalizedPath) return false;
        return true;
      })
      .slice(0, 20)
    : [];
  if (replacementConflicts.length) warnings.push("new-name-already-exists-in-scope");

  const rawLocations = [
    ...(definition.definitions || []).map((item) => ({ ...item, role: "definition" })),
    ...(references.exports || []).map((item) => ({ ...item, role: "export" })),
    ...(references.imports || []).map((item) => ({ ...item, role: "import" })),
    ...(references.calls || []).map((item) => ({ ...item, role: "call" }))
  ].filter((item) => item?.path && item?.line);
  const seen = new Set();
  const locations = [];
  for (const item of rawLocations) {
    const key = `${toPosix(item.path)}:${item.line}:${item.role}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const contextText = item.context || await readWorkspaceFileRange(item.path, Math.max(1, Number(item.line) - context), context * 2 + 1).catch(() => "");
    const targetLineText = String(contextText || "")
      .split(/\r?\n/)
      .find((entry) => entry.includes(name)) || "";
    const replacementResult = targetLineText ? replaceCodeIdentifierOccurrences(targetLineText, name, replacement) : { text: "", count: 0 };
    locations.push({
      role: item.role,
      kind: item.kind || item.type || "reference",
      path: item.path,
      line: item.line,
      name: item.name || name,
      source: item.source || "",
      occurrenceCount: replacementResult.count,
      before: targetLineText.trim(),
      after: replacementResult.count ? replacementResult.text.trim() : "",
      context: contextText
    });
    if (locations.length >= max) break;
  }
  if (!locations.length) warnings.push("no-rename-locations-found");
  if (locations.some((item) => item.occurrenceCount === 0)) warnings.push("some-locations-need-manual-review");
  if (locations.some((item) => item.before && !item.after)) warnings.push("some-matches-may-be-inside-string-or-comment");
  const files = uniqueLimited(locations.map((item) => toPosix(item.path)), 40);
  const verificationCommands = dedupeCommandItems([
    commandItem("node --check server.js", "重命名后复查后端入口语法。"),
    commandItem("node --check app.js", "重命名后复查前端入口语法。"),
    commandItem("node server.js --api-smoke-section=semantic", "重命名后复查语义索引、定义、引用、重命名预览和影响面。"),
    commandItem("node server.js --ui-smoke-test", "重命名后复查前端证据卡和按钮钩子。")
  ]);
  return {
    generatedAt: new Date().toISOString(),
    symbol: name,
    newName: replacement,
    path: normalizedPath,
    line: targetLine || null,
    summary: {
      definitions: definition.definitions?.length || 0,
      references: references.matchCount || 0,
      locations: locations.length,
      files: files.length,
      conflicts: replacementConflicts.length,
      warnings: warnings.length
    },
    definition,
    references: {
      ...references,
      matches: (references.matches || []).slice(0, max)
    },
    replacementConflicts: replacementConflicts.map((item) => ({
      path: item.path,
      line: item.line,
      endLine: item.endLine || item.line,
      name: item.name,
      kind: item.kind,
      container: item.container || "",
      signature: item.signature || ""
    })),
    locations,
    files,
    warnings: uniqueLimited(warnings, 20),
    verificationCommands,
    repairContext: [
      `rename: ${name} -> ${replacement || "(missing)"}`,
      normalizedPath ? `path: ${normalizedPath}` : "",
      targetLine ? `line: ${targetLine}` : "",
      files.length ? `files: ${files.join(", ")}` : "",
      warnings.length ? `warnings: ${uniqueLimited(warnings, 20).join(", ")}` : "",
      verificationCommands.length ? `verificationCommands: ${verificationCommands.map((item) => item.command).join(" | ")}` : ""
    ].filter(Boolean).join("\n"),
    policy: {
      access: "local-read-only",
      scope: "currentWorkspace",
      executesCommands: false,
      writesFiles: false,
      previewOnly: true,
      requiresApprovalBeforeWrite: true
    }
  };
}

function resolveSemanticImportCandidates(importerPath, source) {
  const cleanSource = String(source || "").split(/[?#]/)[0].trim();
  if (!cleanSource || !/^[./]/.test(cleanSource)) return [];
  const importerDir = path.posix.dirname(toPosix(importerPath));
  const base = path.posix.normalize(path.posix.join(importerDir, cleanSource));
  const extensions = ["", ".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx", ".json", ".css", ".scss", ".html", ".vue", ".py"];
  const indexFiles = ["index.js", "index.jsx", "index.mjs", "index.cjs", "index.ts", "index.tsx", "index.json", "index.vue", "__init__.py"];
  return uniqueLimited([
    ...extensions.map((ext) => `${base}${ext}`),
    ...indexFiles.map((name) => path.posix.join(base, name))
  ], 40);
}

function summarizeSemanticDiagnostics(diagnostics) {
  const summary = { total: diagnostics.length, severity: {}, category: {} };
  for (const item of diagnostics) {
    summary.severity[item.severity] = (summary.severity[item.severity] || 0) + 1;
    summary.category[item.category] = (summary.category[item.category] || 0) + 1;
  }
  return summary;
}

async function buildSemanticDiagnostics({ limit = 120, includeContext = false } = {}) {
  const index = await readSemanticIndex() || await buildSemanticIndex();
  const files = await listSemanticFiles();
  const fileSet = new Set(files.map((file) => toPosix(file.path)));
  const max = Math.min(240, Math.max(1, Number(limit) || 120));
  const diagnostics = [];
  const add = (issue) => {
    if (diagnostics.length >= max) return;
    diagnostics.push({
      severity: issue.severity || "warning",
      category: issue.category || "semantic",
      path: issue.path || "",
      line: issue.line || 1,
      title: issue.title || "Semantic diagnostic",
      message: issue.message || "",
      evidence: issue.evidence || {}
    });
  };

  for (const record of index.records || []) {
    const declarations = new Map();
    for (const declaration of record.declarations || []) {
      const key = `${declaration.kind}:${String(declaration.name || "").toLowerCase()}`;
      if (!declaration.name) continue;
      if (declarations.has(key)) {
        add({
          severity: "warning",
          category: "duplicate-declaration",
          path: record.path,
          line: declaration.line,
          title: `重复声明：${declaration.name}`,
          message: `${record.path} 中 ${declaration.name} 已在第 ${declarations.get(key)} 行声明。`,
          evidence: { name: declaration.name, kind: declaration.kind, firstLine: declarations.get(key), duplicateLine: declaration.line }
        });
      } else {
        declarations.set(key, declaration.line);
      }
    }
  }

  let localImportCount = 0;
  for (const item of index.imports || []) {
    const source = String(item.source || "");
    if (!/^[./]/.test(source)) continue;
    localImportCount += 1;
    const candidates = resolveSemanticImportCandidates(item.path, source);
    if (!candidates.some((candidate) => fileSet.has(candidate))) {
      add({
        severity: "warning",
        category: "unresolved-local-import",
        path: item.path,
        line: item.line,
        title: `本地导入未解析：${source}`,
        message: `${item.path} 引用了 ${source}，但语义索引没有找到对应工作区文件。`,
        evidence: { source, candidates: candidates.slice(0, 12) }
      });
    }
  }

  const routeSeen = new Map();
  const serverRoutes = new Set();
  const serverRouteMethods = new Map();
  for (const route of index.routes || []) {
    const routePath = String(route.route || route.path || "").split(/[?#]/)[0] || "/";
    if (route.method === "FETCH") continue;
    const key = `${route.method}:${routePath}`;
    serverRoutes.add(routePath);
    if (!serverRouteMethods.has(routePath)) serverRouteMethods.set(routePath, new Set());
    serverRouteMethods.get(routePath).add(route.method);
    if (routeSeen.has(key)) {
      const first = routeSeen.get(key);
      add({
        severity: "info",
        category: "duplicate-route",
        path: route.path,
        line: route.line,
        title: `重复路由：${route.method} ${routePath}`,
        message: `${route.method} ${routePath} 已在 ${first.path}:${first.line} 出现。`,
        evidence: { method: route.method, route: routePath, firstPath: first.path, firstLine: first.line }
      });
    } else {
      routeSeen.set(key, { path: route.path, line: route.line });
    }
  }

  for (const route of index.routes || []) {
    if (route.method !== "FETCH") continue;
    const routePath = String(route.route || route.path || "").split(/[?#]/)[0];
    if (!routePath.startsWith("/api/")) continue;
    const clientMethod = String(route.clientMethod || "GET").toUpperCase();
    const serverMethods = [...(serverRouteMethods.get(routePath) || [])].sort();
    if (!serverRoutes.has(routePath)) {
      add({
        severity: "info",
        category: "missing-api-route",
        path: route.path,
        line: route.line,
        title: `前端 API 未找到服务端路由：${routePath}`,
        message: `${route.path} 调用了 ${routePath}，语义索引没有发现同名服务端路由。`,
        evidence: { route: routePath, method: clientMethod }
      });
      continue;
    }
    if (serverMethods.length && !serverMethods.includes(clientMethod)) {
      add({
        severity: "warning",
        category: "api-method-mismatch",
        path: route.path,
        line: route.line,
        title: `前端 API 方法可能不匹配：${clientMethod} ${routePath}`,
        message: `${route.path} 使用 ${clientMethod} 调用 ${routePath}，但服务端语义索引只发现 ${serverMethods.join(", ")}。`,
        evidence: { route: routePath, clientMethod, serverMethods }
      });
    }
  }

  const rank = { error: 0, warning: 1, info: 2 };
  diagnostics.sort((left, right) => {
    const severity = (rank[left.severity] ?? 9) - (rank[right.severity] ?? 9);
    if (severity !== 0) return severity;
    return `${left.path}:${left.line}`.localeCompare(`${right.path}:${right.line}`);
  });
  const clipped = diagnostics.slice(0, max);
  const withContext = includeContext ? await attachReferenceContext(clipped, 2) : clipped;
  return {
    generatedAt: new Date().toISOString(),
    indexGeneratedAt: index.generatedAt,
    checked: {
      indexedFiles: index.indexedFiles || 0,
      localImports: localImportCount,
      routes: (index.routes || []).filter((route) => route.method !== "FETCH").length,
      fetches: (index.routes || []).filter((route) => route.method === "FETCH").length,
      apiMethodContracts: serverRouteMethods.size
    },
    summary: summarizeSemanticDiagnostics(clipped),
    diagnostics: withContext
  };
}

async function buildSemanticImpact({ paths = [], limit = 80, includeContext = false } = {}) {
  const explicitPaths = Array.isArray(paths) ? paths : [];
  const max = Math.min(240, Math.max(1, Number(limit) || 80));
  const warnings = [];
  let source = "explicit";
  let rawTargets = explicitPaths.map((item) => toPosix(String(item || "").trim())).filter(Boolean);

  if (rawTargets.length === 0) {
    source = "git-diff";
    const evidence = await getCurrentDiffEvidence({ includeDiff: false });
    rawTargets = evidence.git?.changedFiles || [];
    if (!evidence.available) warnings.push("Git diff evidence is unavailable; pass paths explicitly for semantic impact analysis.");
    warnings.push(...(evidence.warnings || []));
  }

  const targets = uniqueLimited(rawTargets.map((item) => toPosix(item).replace(/^\.?\//, "")).filter(Boolean), max);
  const targetSet = new Set(targets);
  const index = await readSemanticIndex() || await buildSemanticIndex();
  const records = index.records || [];
  const recordMap = new Map(records.map((record) => [toPosix(record.path), record]));
  const indexedTargets = targets.filter((item) => recordMap.has(item));
  const targetSummaries = targets.map((targetPath) => {
    const record = recordMap.get(targetPath);
    return {
      path: targetPath,
      indexed: Boolean(record),
      language: record?.language || "",
      declarations: record?.declarations?.length || 0,
      imports: record?.imports?.length || 0,
      routes: record?.routes?.length || 0,
      selectors: record?.selectors?.length || 0,
      calls: record?.calls?.length || 0
    };
  });

  const declarations = [];
  const declarationNames = new Set();
  const routes = [];
  const selectors = [];
  for (const targetPath of indexedTargets) {
    const record = recordMap.get(targetPath);
    for (const declaration of record.declarations || []) {
      declarations.push({ kind: "declaration", path: targetPath, line: declaration.line, name: declaration.name, type: declaration.kind });
      if (declaration.name) declarationNames.add(String(declaration.name).toLowerCase());
    }
    for (const route of record.routes || []) {
      routes.push({ kind: "route", path: targetPath, line: route.line, method: route.method, route: route.route || route.path });
    }
    for (const selector of record.selectors || []) {
      selectors.push({ kind: "selector", path: targetPath, line: selector.line, selector: selector.selector });
    }
  }

  const dependents = [];
  const callers = [];
  const callGraph = {};
  for (const record of records) {
    const recordPath = toPosix(record.path);
    if (!targetSet.has(recordPath)) {
      for (const item of record.imports || []) {
        const candidates = resolveSemanticImportCandidates(recordPath, item.source);
        const matchedTargets = candidates.filter((candidate) => targetSet.has(candidate));
        if (matchedTargets.length > 0) {
          dependents.push({
            kind: "dependent",
            path: recordPath,
            line: item.line,
            source: item.source,
            names: item.names || [],
            targets: matchedTargets.slice(0, 8)
          });
        }
      }
    }

    const targetCalls = [];
    for (const call of record.calls || []) {
      if (declarationNames.has(String(call.name || "").toLowerCase())) {
        callers.push({ kind: "caller", path: recordPath, line: call.line, name: call.name });
        targetCalls.push(call.name);
      }
    }
    if (targetSet.has(recordPath)) {
      callGraph[recordPath] = uniqueLimited((record.calls || []).map((item) => item.name), 80);
    } else if (targetCalls.length > 0) {
      callGraph[recordPath] = uniqueLimited(targetCalls, 80);
    }
  }

  if (targets.length === 0) warnings.push("No target files were provided or detected.");
  const clippedDependents = dependents.slice(0, max);
  const clippedCallers = callers.slice(0, max);
  return {
    generatedAt: new Date().toISOString(),
    indexGeneratedAt: index.generatedAt,
    source,
    targets,
    summary: {
      targets: targets.length,
      indexedTargets: indexedTargets.length,
      dependents: dependents.length,
      declarations: declarations.length,
      routes: routes.length,
      selectors: selectors.length,
      callers: callers.length
    },
    targetSummaries,
    declarations: declarations.slice(0, max),
    routes: routes.slice(0, max),
    selectors: selectors.slice(0, max),
    dependents: includeContext ? await attachReferenceContext(clippedDependents, 2) : clippedDependents,
    callers: includeContext ? await attachReferenceContext(clippedCallers, 2) : clippedCallers,
    callGraph,
    warnings: uniqueLimited(warnings.filter(Boolean), 20),
    policy: {
      access: "local-read-only",
      scope: "currentWorkspace",
      usesGitDiff: source === "git-diff"
    }
  };
}

async function buildDependencyGraph({ paths = [], limit = 120, includeExternal = false } = {}) {
  const index = await readSemanticIndex() || await buildSemanticIndex();
  const max = Math.min(300, Math.max(1, Number(limit) || 120));
  const records = index.records || [];
  const fileSet = new Set(records.map((record) => toPosix(record.path)));
  const requested = new Set((Array.isArray(paths) ? paths : [])
    .map((item) => toPosix(String(item || "").trim()).replace(/^\.?\//, ""))
    .filter(Boolean));
  const nodes = new Map();
  const edges = [];
  const unresolved = [];
  const external = [];
  for (const record of records) {
    const recordPath = toPosix(record.path);
    nodes.set(recordPath, {
      path: recordPath,
      language: record.language || "",
      imports: (record.imports || []).length,
      exports: (record.exports || []).length,
      declarations: (record.declarations || []).length,
      entrypoints: record.entrypoints || [],
      inDegree: 0,
      outDegree: 0
    });
  }

  for (const record of records) {
    const from = toPosix(record.path);
    for (const item of record.imports || []) {
      const source = String(item.source || "");
      if (/^[./]/.test(source)) {
        const candidates = resolveSemanticImportCandidates(from, source);
        const target = candidates.find((candidate) => fileSet.has(candidate));
        if (target) {
          edges.push({ from, to: target, source, line: item.line, names: item.names || [] });
          nodes.get(from).outDegree += 1;
          nodes.get(target).inDegree += 1;
        } else {
          unresolved.push({ from, source, line: item.line, candidates: candidates.slice(0, 10) });
        }
      } else if (includeExternal && source) {
        external.push({ from, source, line: item.line, names: item.names || [] });
      }
    }
  }

  const adjacency = new Map();
  for (const node of nodes.keys()) adjacency.set(node, []);
  for (const edge of edges) adjacency.get(edge.from)?.push(edge.to);
  const indexByNode = new Map();
  const lowlink = new Map();
  const stack = [];
  const onStack = new Set();
  const components = [];
  let sequence = 0;
  const strongConnect = (node) => {
    indexByNode.set(node, sequence);
    lowlink.set(node, sequence);
    sequence += 1;
    stack.push(node);
    onStack.add(node);
    for (const next of adjacency.get(node) || []) {
      if (!indexByNode.has(next)) {
        strongConnect(next);
        lowlink.set(node, Math.min(lowlink.get(node), lowlink.get(next)));
      } else if (onStack.has(next)) {
        lowlink.set(node, Math.min(lowlink.get(node), indexByNode.get(next)));
      }
    }
    if (lowlink.get(node) === indexByNode.get(node)) {
      const component = [];
      let current = "";
      do {
        current = stack.pop();
        onStack.delete(current);
        component.push(current);
      } while (current !== node);
      components.push(component);
    }
  };
  for (const node of nodes.keys()) {
    if (!indexByNode.has(node)) strongConnect(node);
  }
  const cycles = components
    .filter((component) => component.length > 1 || edges.some((edge) => edge.from === component[0] && edge.to === component[0]))
    .map((component) => ({
      nodes: component.sort(),
      edgeCount: edges.filter((edge) => component.includes(edge.from) && component.includes(edge.to)).length
    }))
    .sort((left, right) => right.nodes.length - left.nodes.length || right.edgeCount - left.edgeCount)
    .slice(0, 40);
  const graphNodes = Array.from(nodes.values())
    .sort((left, right) => (right.inDegree + right.outDegree) - (left.inDegree + left.outDegree) || left.path.localeCompare(right.path));
  const targetSummaries = Array.from(requested).map((targetPath) => ({
    path: targetPath,
    indexed: nodes.has(targetPath),
    dependencies: edges.filter((edge) => edge.from === targetPath).map((edge) => edge.to),
    dependents: edges.filter((edge) => edge.to === targetPath).map((edge) => edge.from),
    unresolved: unresolved.filter((item) => item.from === targetPath)
  }));
  const filteredEdges = requested.size
    ? edges.filter((edge) => requested.has(edge.from) || requested.has(edge.to))
    : edges;
  return {
    generatedAt: new Date().toISOString(),
    indexGeneratedAt: index.generatedAt,
    workspace: currentWorkspace,
    summary: {
      nodes: nodes.size,
      edges: edges.length,
      unresolved: unresolved.length,
      external: external.length,
      cycles: cycles.length,
      requested: requested.size
    },
    nodes: graphNodes.slice(0, max),
    edges: filteredEdges.slice(0, max),
    unresolved: unresolved.slice(0, max),
    external: external.slice(0, max),
    cycles,
    targetSummaries,
    policy: {
      access: "local-read-only",
      scope: "currentWorkspace",
      includeExternal: Boolean(includeExternal)
    }
  };
}

function topByCount(items, key, limit = 12) {
  const counts = new Map();
  for (const item of items || []) {
    const value = typeof key === "function" ? key(item) : item?.[key];
    if (!value) continue;
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((left, right) => right.count - left.count || String(left.name).localeCompare(String(right.name)))
    .slice(0, limit);
}

function rankSemanticHotspots(index, graph, limit = 16) {
  const diagnosticsByPath = new Map();
  for (const diagnostic of graph.diagnostics || []) {
    diagnosticsByPath.set(diagnostic.path, (diagnosticsByPath.get(diagnostic.path) || 0) + 1);
  }
  const nodeByPath = new Map((graph.nodes || []).map((node) => [node.path, node]));
  return (index.records || [])
    .map((record) => {
      const node = nodeByPath.get(record.path) || {};
      const apiSurface = (record.routes || []).length + (record.selectors || []).length;
      const symbolSurface = (record.declarations || []).length + (record.exports || []).length;
      const dependencySurface = (node.inDegree || 0) + (node.outDegree || 0);
      const diagnosticCount = diagnosticsByPath.get(record.path) || 0;
      const score = dependencySurface * 3 + apiSurface * 2 + symbolSurface + diagnosticCount * 4;
      return {
        path: record.path,
        language: record.language,
        score,
        inDegree: node.inDegree || 0,
        outDegree: node.outDegree || 0,
        declarations: (record.declarations || []).length,
        routes: (record.routes || []).length,
        selectors: (record.selectors || []).length,
        diagnostics: diagnosticCount,
        entrypoints: record.entrypoints || []
      };
    })
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || left.path.localeCompare(right.path))
    .slice(0, limit);
}

async function buildCodeIntelligenceOverview({ limit = 24, includeDiagnostics = true } = {}) {
  const max = Math.min(80, Math.max(1, Number(limit) || 24));
  const index = await readSemanticIndex() || await buildSemanticIndex();
  const [diagnostics, graph] = await Promise.all([
    includeDiagnostics ? buildSemanticDiagnostics({ limit: max, includeContext: false }) : Promise.resolve({ summary: { total: 0 }, diagnostics: [] }),
    buildDependencyGraph({ limit: Math.max(max * 2, 40), includeExternal: true })
  ]);
  const files = await listFiles();
  const scripts = await readPackageScripts();
  const typecheck = await discoverTypecheckCommands({ scripts, files, limit: 8 });
  const entrypoints = (index.records || [])
    .filter((record) => (record.entrypoints || []).length > 0 || (record.routes || []).some((route) => route.method !== "FETCH"))
    .map((record) => ({
      path: record.path,
      language: record.language,
      entrypoints: record.entrypoints || [],
      routes: (record.routes || []).filter((route) => route.method !== "FETCH").length,
      fetches: (record.routes || []).filter((route) => route.method === "FETCH").length,
      declarations: (record.declarations || []).length
    }))
    .sort((left, right) => right.routes - left.routes || right.declarations - left.declarations || left.path.localeCompare(right.path))
    .slice(0, max);
  const apiSurface = {
    serverRoutes: (index.routes || []).filter((route) => route.method !== "FETCH").slice(0, max),
    clientFetches: (index.routes || []).filter((route) => route.method === "FETCH").slice(0, max),
    byMethod: topByCount((index.routes || []).filter((route) => route.method !== "FETCH"), "method", 12),
    topRouteFiles: topByCount((index.routes || []).filter((route) => route.method !== "FETCH"), "path", 12)
  };
  const symbolSurface = {
    declarationsByKind: topByCount(index.declarations || [], "kind", 12),
    topDeclarationFiles: topByCount(index.declarations || [], "path", 12),
    outlineByKind: topByCount(index.symbolOutline || [], "kind", 12),
    largestSymbols: (index.symbolOutline || [])
      .map((item) => ({ ...item, spanLines: Math.max(1, (item.endLine || item.line || 1) - (item.line || 1) + 1) }))
      .sort((left, right) => right.spanLines - left.spanLines || left.path.localeCompare(right.path))
      .slice(0, max),
    topCalls: topByCount((index.records || []).flatMap((record) => record.calls || []), "name", 20),
    exportedSymbols: (index.records || [])
      .flatMap((record) => (record.exports || []).map((item) => ({ ...item, path: record.path })))
      .slice(0, max)
  };
  const dependencySurface = {
    summary: graph.summary,
    hotspots: rankSemanticHotspots(index, { ...graph, diagnostics: diagnostics.diagnostics || [] }, max),
    cycles: (graph.cycles || []).slice(0, Math.min(20, max)),
    unresolved: (graph.unresolved || []).slice(0, max),
    external: (graph.external || []).slice(0, max)
  };
  const readiness = [];
  if ((diagnostics.summary?.severity?.error || 0) > 0) readiness.push({ status: "blocker", message: "语义诊断存在 error 级问题，应先修复再扩大修改。" });
  if ((graph.summary?.unresolved || 0) > 0) readiness.push({ status: "warning", message: "存在未解析本地导入，影响依赖图和影响面判断。" });
  if ((graph.summary?.cycles || 0) > 0) readiness.push({ status: "warning", message: "依赖图存在循环组件，改动时需要更保守的验证范围。" });
  if ((apiSurface.serverRoutes || []).length > 0 && (apiSurface.clientFetches || []).length === 0) readiness.push({ status: "info", message: "服务端 API 面已发现；前端 fetch 线索较少或集中在动态调用中。" });
  if ((typecheck.tsconfigs?.length || typecheck.hasTsFiles) && !typecheck.commands?.length) readiness.push({ status: "warning", message: "检测到 TypeScript 配置或源码，但未发现可安全运行的类型检查命令。" });
  if (typecheck.commands?.length) readiness.push({ status: "info", message: `已发现 ${typecheck.commands.length} 条 TypeScript 类型检查候选命令，可用于修复后验证。` });
  if (readiness.length === 0) readiness.push({ status: "ok", message: "本地语义索引、依赖图和诊断结果未发现明显阻塞。" });
  return {
    generatedAt: new Date().toISOString(),
    indexGeneratedAt: index.generatedAt,
    workspace: currentWorkspace,
    summary: {
      indexedFiles: index.indexedFiles || 0,
      declarations: index.summary?.declarations || 0,
      imports: index.summary?.imports || 0,
      routes: index.summary?.routes || 0,
      selectors: index.summary?.selectors || 0,
      symbolOutline: index.summary?.symbolOutline || 0,
      diagnostics: diagnostics.summary?.total || 0,
      dependencyNodes: graph.summary?.nodes || 0,
      dependencyEdges: graph.summary?.edges || 0,
      cycles: graph.summary?.cycles || 0,
      unresolvedImports: graph.summary?.unresolved || 0,
      typecheckCommands: typecheck.commands?.length || 0,
      tsconfigs: typecheck.tsconfigs?.length || 0,
      hasTsFiles: Boolean(typecheck.hasTsFiles)
    },
    entrypoints,
    apiSurface,
    symbolSurface,
    dependencySurface,
    diagnostics: {
      summary: diagnostics.summary,
      items: (diagnostics.diagnostics || []).slice(0, max)
    },
    typecheck,
    readiness,
    policy: {
      access: "local-read-only",
      scope: "currentWorkspace",
      usesCachedIndex: Boolean(await readSemanticIndex())
    }
  };
}

async function buildRepoMap() {
  const files = await listFiles();
  const extCounts = {};
  const symbols = [];
  let totalBytes = 0;
  for (const file of files) {
    const ext = path.extname(file.path).toLowerCase() || "(none)";
    extCounts[ext] = (extCounts[ext] || 0) + 1;
    totalBytes += file.size;
    if (symbols.length >= 240) continue;
    const content = await readWorkspaceFile(file.path).catch(() => "");
    symbols.push(...extractSymbols(file.path, content).slice(0, Math.max(0, 240 - symbols.length)));
  }
  const scripts = await readPackageScripts();
  return {
    fileCount: files.length,
    totalBytes,
    extCounts,
    scripts,
    topFiles: files.slice(0, 80),
    symbols
  };
}

async function collectContext() {
  const files = await listFiles();
  let total = 0;
  const chunks = [];
  for (const file of files) {
    if (total >= CONTEXT_LIMIT_BYTES) break;
    const content = await readWorkspaceFile(file.path).catch(() => "");
    const clipped = content.slice(0, Math.max(0, CONTEXT_LIMIT_BYTES - total));
    total += Buffer.byteLength(clipped, "utf8");
    chunks.push({ path: file.path, content: clipped });
  }
  return { files, contextFiles: chunks, contextBytes: total };
}

function extractPromptReferenceTokens(prompt = "") {
  const text = String(prompt || "");
  if (!text.includes("@")) return [];
  const tokens = [];
  const pattern = /(^|[\s([{"'，。；：、])@([^\s，。；：、'"`<>()\[\]{}]+)/g;
  let match;
  while ((match = pattern.exec(text))) {
    const raw = match[2].replace(/[.,;:!?，。；：！？、]+$/g, "");
    if (!raw || raw.includes("@")) continue;
    tokens.push(toPosix(raw.replace(/^\.?[\\/]/, "")));
  }
  return [...new Set(tokens)].slice(0, 24);
}

function promptReferenceSuggestionScore(token = "", filePath = "") {
  const needle = toPosix(token).toLowerCase();
  const candidate = toPosix(filePath).toLowerCase();
  if (!needle || !candidate) return 0;
  if (candidate === needle) return 1000;
  const needleBase = path.posix.basename(needle);
  const candidateBase = path.posix.basename(candidate);
  const orderedMatchRatio = (source = "", target = "") => {
    let index = 0;
    for (const char of source) {
      const next = target.indexOf(char, index);
      if (next === -1) continue;
      index = next + 1;
    }
    return source.length ? index / target.length : 0;
  };
  let score = 0;
  if (candidateBase === needleBase) score += 520;
  if (candidate.endsWith(`/${needle}`) || candidate.endsWith(needle)) score += 420;
  if (candidateBase.includes(needleBase)) score += 260;
  if (candidate.includes(needle)) score += 220;
  if (path.posix.extname(candidateBase) === path.posix.extname(needleBase)) {
    const compactNeedle = needleBase.replace(/[^a-z0-9]/g, "");
    const compactCandidate = candidateBase.replace(/[^a-z0-9]/g, "");
    if (orderedMatchRatio(compactNeedle, compactCandidate) >= 0.75) score += 180;
  }
  const needleParts = needle.split(/[\/._-]+/).filter(Boolean);
  const candidateParts = new Set(candidate.split(/[\/._-]+/).filter(Boolean));
  for (const part of needleParts) {
    if (part.length >= 2 && candidateParts.has(part)) score += 45;
  }
  if (candidateBase[0] && needleBase[0] && candidateBase[0] === needleBase[0]) score += 20;
  return score;
}

function suggestPromptReferencePaths(token = "", files = []) {
  return (files || [])
    .map((file) => ({
      path: toPosix(file.path || ""),
      size: file.size,
      score: promptReferenceSuggestionScore(token, file.path || "")
    }))
    .filter((item) => item.path && item.score >= 80)
    .sort((a, b) => b.score - a.score || a.path.length - b.path.length || a.path.localeCompare(b.path))
    .slice(0, 3);
}

function extractPromptFileReferences(prompt = "", files = []) {
  const tokens = extractPromptReferenceTokens(prompt);
  if (!tokens.length) return { references: [], missing: [] };
  const references = [];
  const seen = new Set();
  const matchedTokens = new Set();
  for (const file of files) {
    const normalized = toPosix(file.path);
    const variants = [
      normalized,
      normalized.replaceAll("/", "\\"),
      `./${normalized}`
    ];
    const matchedToken = tokens.find((token) => variants.some((variant) => token.toLowerCase() === toPosix(variant).toLowerCase()));
    if (!matchedToken) continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    matchedTokens.add(matchedToken);
    references.push({ path: normalized, size: file.size });
  }
  const missing = tokens
    .filter((token) => !matchedTokens.has(token))
    .map((pathValue) => ({
      path: pathValue,
      reason: "未在当前工作区文件列表中找到匹配文件。",
      suggestions: suggestPromptReferencePaths(pathValue, files)
    }))
    .slice(0, 12);
  return { references: references.slice(0, 12), missing };
}

async function buildPromptReferenceContext(prompt = "", files = []) {
  const { references, missing } = extractPromptFileReferences(prompt, files);
  const context = [];
  let total = 0;
  const maxBytes = 120000;
  for (const item of references) {
    if (total >= maxBytes) break;
    const content = await readWorkspaceFile(item.path).catch((error) => `REFERENCE_READ_ERROR: ${error.message}`);
    const remaining = Math.max(0, maxBytes - total);
    const clipped = content.slice(0, remaining);
    total += Buffer.byteLength(clipped, "utf8");
    context.push({
      path: item.path,
      size: item.size,
      content: clipped,
      clipped: clipped.length < content.length
    });
  }
  return {
    references,
    missing,
    context,
    bytes: total
  };
}

async function buildContextSnapshot({ deep = false } = {}) {
  const files = await listFiles();
  let repoMap;
  let git;
  let assets;
  let semanticIndex;
  if (deep) {
    [repoMap, git, assets, semanticIndex] = await Promise.all([
      buildRepoMap(),
      getGitSummary(),
      buildAssetCatalog(),
      buildSemanticIndex()
    ]);
  } else {
    const cachedSemanticIndex = await readSemanticIndex();
    const extCounts = {};
    let totalBytes = 0;
    for (const file of files) {
      const ext = path.extname(file.path).toLowerCase() || "(none)";
      extCounts[ext] = (extCounts[ext] || 0) + 1;
      totalBytes += file.size;
    }
    repoMap = {
      fileCount: files.length,
      totalBytes,
      extCounts,
      scripts: await readPackageScripts(),
      topFiles: files.slice(0, 80),
      symbols: (cachedSemanticIndex?.declarations || [])
        .slice(0, 120)
        .map((item) => ({ type: item.kind || "symbol", name: item.name || "", path: item.path || "", line: item.line || 1 }))
    };
    git = { available: false, branch: "", changedFiles: [], remotes: [], upstream: "", skipped: "Use /api/context-snapshot?deep=1 for git status." };
    assets = { summary: { total: 0, image: 0, document: 0, data: 0, media: 0 } };
    semanticIndex = cachedSemanticIndex || {
      indexedFiles: 0,
      summary: { declarations: 0, imports: 0, routes: 0, selectors: 0 }
    };
  }
  const topSymbols = repoMap.symbols
    .slice(0, 80)
    .map((item) => `${item.type}:${item.name}@${item.path}:${item.line}`);
  const snapshot = {
    workspace: currentWorkspace,
    generatedAt: new Date().toISOString(),
    deep,
    fileCount: files.length,
    totalBytes: repoMap.totalBytes,
    extCounts: repoMap.extCounts,
    scripts: Object.keys(repoMap.scripts || {}).sort(),
    topFiles: repoMap.topFiles.slice(0, 40),
    symbols: topSymbols,
    git: {
      available: git.available,
      branch: git.branch,
      changedFiles: git.changedFiles || [],
      remotes: git.remotes || [],
      upstream: git.upstream || ""
    },
    assets: assets.summary,
    semanticIndex: {
      indexedFiles: semanticIndex.indexedFiles,
      declarations: semanticIndex.summary.declarations,
      imports: semanticIndex.summary.imports,
      routes: semanticIndex.summary.routes,
      selectors: semanticIndex.summary.selectors
    },
    summary: [
      `${files.length} text file(s) indexed`,
      `${Object.keys(repoMap.extCounts || {}).length} extension group(s)`,
      `${topSymbols.length} symbol hint(s)`,
      `${semanticIndex.summary.declarations} semantic declaration(s)`,
      `${assets.summary.total || 0} multimodal asset(s)`,
      git.available ? `git branch ${git.branch || "detached"}` : "git status skipped in light snapshot"
    ]
  };
  await writeJsonAtomic(CONTEXT_SNAPSHOT_PATH, snapshot);
  return snapshot;
}

async function writeJsonAtomic(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const randomSuffix = typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : crypto.randomBytes(8).toString("hex");
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.${randomSuffix}.tmp`;
  try {
    await fs.writeFile(tempPath, JSON.stringify(value, null, 2), "utf8");
    await fs.rename(tempPath, filePath);
  } catch (error) {
    await fs.rm(tempPath, { force: true }).catch(() => {});
    throw error;
  }
}

async function readJsonOrNull(filePath) {
  const text = await fs.readFile(filePath, "utf8").catch(() => "");
  if (!text.trim()) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function buildRuntimeUrlState({ port = 0, url = "", source = "runtime" } = {}) {
  const activePort = parsePositivePort(port, 0);
  const normalizedUrl = String(url || (activePort ? `http://127.0.0.1:${activePort}` : "")).trim();
  return {
    generatedAt: new Date().toISOString(),
    workspace: currentWorkspace,
    source,
    port: activePort,
    url: normalizedUrl,
    browserCheckUrl: normalizedUrl,
    statePath: toPosix(path.relative(APP_ROOT, RUNTIME_URL_PATH)),
    policy: {
      access: "local-runtime-read-only",
      writesLocalArtifact: source !== "read",
      executesCommands: false,
      startsProcesses: false,
      writesRemote: false
    }
  };
}

async function persistRuntimeUrlState({ port = 0, url = "", source = "runtime" } = {}) {
  const state = buildRuntimeUrlState({ port, url, source });
  await writeJsonAtomic(RUNTIME_URL_PATH, state);
  return state;
}

async function readRuntimeUrlState() {
  const saved = await readJsonOrNull(RUNTIME_URL_PATH);
  if (saved && saved.workspace === currentWorkspace && saved.url) {
    return {
      ...saved,
      source: saved.source || "saved",
      statePath: saved.statePath || toPosix(path.relative(APP_ROOT, RUNTIME_URL_PATH)),
      policy: {
        access: "local-runtime-read-only",
        writesLocalArtifact: false,
        executesCommands: false,
        startsProcesses: false,
        writesRemote: false,
        ...(saved.policy || {})
      }
    };
  }
  const activeAddress = activeRuntimeServer?.address?.();
  if (activeAddress && typeof activeAddress === "object" && activeAddress.port) {
    return buildRuntimeUrlState({ port: activeAddress.port, source: "active-server" });
  }
  return {
    generatedAt: new Date().toISOString(),
    workspace: currentWorkspace,
    source: "missing",
    port: 0,
    url: "",
    browserCheckUrl: "",
    statePath: toPosix(path.relative(APP_ROOT, RUNTIME_URL_PATH)),
    policy: {
      access: "local-runtime-read-only",
      writesLocalArtifact: false,
      executesCommands: false,
      startsProcesses: false,
      writesRemote: false
    }
  };
}

async function readModelUsageLedger() {
  const ledger = await readJsonOrNull(MODEL_USAGE_PATH);
  if (!ledger || ledger.workspace !== currentWorkspace) {
    return emptyModelUsageLedger();
  }
  modelUsageTotals = {
    ...emptyModelUsageLedger().totals,
    ...(ledger.totals || {}),
    byModel: { ...(ledger.totals?.byModel || {}) }
  };
  return {
    ...emptyModelUsageLedger(),
    ...ledger,
    endpoint: ledger.endpoint || getModelEndpointInfo(),
    totals: modelUsageTotals,
    recent: Array.isArray(ledger.recent) ? ledger.recent : [],
    summary: summarizeModelUsageLedger({
      totals: modelUsageTotals,
      recent: Array.isArray(ledger.recent) ? ledger.recent : []
    })
  };
}

async function recordModelUsageCall(call) {
  const previous = await readModelUsageLedger();
  const usage = normalizeModelUsage(call.usage);
  const completedAt = call.completedAt || new Date().toISOString();
  const entry = {
    ok: Boolean(call.ok),
    model: call.model || "unknown",
    provider: inferModelProvider(MODEL_API_URL),
    startedAt: call.startedAt || "",
    completedAt,
    latencyMs: Math.max(0, Math.round(Number(call.latencyMs) || 0)),
    fallbackCount: Array.isArray(call.fallbacks) ? call.fallbacks.length : Number(call.fallbackCount || 0),
    usage,
    error: call.ok ? "" : "[redacted]"
  };
  const totals = mergeModelUsageTotals(previous.totals, {
    ...call,
    model: entry.model,
    latencyMs: entry.latencyMs,
    usage
  });
  modelUsageTotals = totals;
  const ledger = {
    ...emptyModelUsageLedger(),
    generatedAt: completedAt,
    workspace: currentWorkspace,
    endpoint: getModelEndpointInfo(),
    totals,
    recent: [entry, ...(previous.recent || [])].slice(0, 80),
    summary: summarizeModelUsageLedger({ totals, recent: [entry, ...(previous.recent || [])].slice(0, 80) }),
    policy: {
      access: "local-read-only",
      exposesApiKey: false,
      changesProviderConfig: false,
      executesModelCall: false,
      persisted: true,
      redactsErrors: true
    }
  };
  await writeJsonAtomic(MODEL_USAGE_PATH, ledger);
  return ledger;
}

async function readContextSnapshot() {
  const snapshot = await readJsonOrNull(CONTEXT_SNAPSHOT_PATH);
  if (!snapshot || snapshot.workspace !== currentWorkspace) return null;
  return snapshot;
}

async function buildContextCompaction({ deep = false } = {}) {
  const snapshot = await buildContextSnapshot({ deep });
  const goal = await readGoalState();
  const tasks = await listTaskLogs(5);
  const reviews = await listReviewArtifacts(5);
  const approvals = await listApprovalRequests(10);
  const diffEvidence = await getCurrentDiffEvidence({ includeDiff: false });
  const compact = {
    workspace: currentWorkspace,
    generatedAt: new Date().toISOString(),
    sourceSnapshotAt: snapshot.generatedAt,
    deep,
    objective: goal.objective || goal.lastPrompt || "",
    state: {
      phase: goal.phase || "idle",
      status: goal.status || "idle",
      nextStep: goal.nextStep || "",
      pendingProposalId: goal.pendingProposal?.id || ""
    },
    repo: {
      fileCount: snapshot.fileCount,
      totalBytes: snapshot.totalBytes,
      extCounts: Object.fromEntries(Object.entries(snapshot.extCounts || {}).slice(0, 20)),
      scripts: (snapshot.scripts || []).slice(0, 20),
      topFiles: (snapshot.topFiles || []).slice(0, 20),
      symbols: (snapshot.symbols || []).slice(0, 40),
      semanticIndex: snapshot.semanticIndex || {}
    },
    git: {
      available: diffEvidence.git?.available || false,
      branch: diffEvidence.git?.branch || snapshot.git?.branch || "",
      changedFiles: (diffEvidence.git?.changedFiles || snapshot.git?.changedFiles || []).slice(0, 60),
      diffStat: diffEvidence.stat || "",
      warnings: diffEvidence.warnings || []
    },
    evidence: {
      recentTasks: tasks.map((task) => ({
        id: task.id,
        status: task.status,
        prompt: task.prompt,
        changedFiles: task.changedFiles || [],
        checksOk: Boolean(task.checksOk)
      })),
      recentReviews: reviews.map((review) => ({
        id: review.id,
        prompt: review.prompt || "",
        summary: review.reply || "",
        findings: (review.review || []).length
      })),
      pendingApprovals: approvals
        .filter((approval) => approval.status === "blocked" || approval.status === "pending")
        .slice(0, 10)
        .map((approval) => ({
          id: approval.id,
          type: approval.type || "command",
          status: approval.status,
          reason: approval.reason || approval.policy?.reason || ""
        }))
    },
    summary: [
      goal.objective ? `Objective: ${goal.objective}` : "Objective not set.",
      `Workspace: ${currentWorkspace}`,
      `Files: ${snapshot.fileCount}, symbols: ${(snapshot.symbols || []).length}`,
      diffEvidence.git?.available ? `Branch: ${diffEvidence.git.branch || "detached"}` : "Git unavailable or skipped.",
      `${(diffEvidence.git?.changedFiles || []).length} changed file(s) in light diff evidence.`,
      tasks.length ? `${tasks.length} recent task artifact(s).` : "No recent task artifacts.",
      reviews.length ? `${reviews.length} recent review artifact(s).` : "No recent review artifacts.",
      approvals.length ? `${approvals.length} approval artifact(s).` : "No approval artifacts."
    ]
  };
  await writeJsonAtomic(CONTEXT_COMPACT_PATH, compact);
  return compact;
}

async function readContextCompaction() {
  const compact = await readJsonOrNull(CONTEXT_COMPACT_PATH);
  if (!compact || compact.workspace !== currentWorkspace) return null;
  return compact;
}

async function buildContextRollup({ limit = 24, query = "" } = {}) {
  const max = Math.min(80, Math.max(1, Number(limit) || 24));
  const term = String(query || "").trim().toLowerCase();
  const goal = await readGoalState();
  const [tasks, reviews, approvals, diffEvidence, compact] = await Promise.all([
    listTaskLogs(max),
    listReviewArtifacts(max),
    listApprovalRequests(max),
    getCurrentDiffEvidence({ includeDiff: false }),
    readContextCompaction()
  ]);
  const entries = [];
  const pushEntry = (entry) => {
    const searchable = [
      entry.type,
      entry.title,
      entry.summary,
      ...(entry.changedFiles || []),
      ...(entry.tags || [])
    ].join(" ").toLowerCase();
    if (term && !searchable.includes(term)) return;
    entries.push(entry);
  };

  pushEntry({
    id: "goal-current",
    type: "goal",
    createdAt: goal.updatedAt || "",
    title: goal.objective || goal.lastPrompt || "Current objective",
    summary: [goal.phase || "idle", goal.status || "idle", goal.nextStep || ""].filter(Boolean).join(" · "),
    tags: [goal.phase || "idle", goal.status || "idle"]
  });

  for (const task of tasks) {
    pushEntry({
      id: task.id,
      type: "task",
      createdAt: task.createdAt || "",
      title: task.prompt || "Task artifact",
      summary: `${task.status || "unknown"} · checks ${task.checksOk ? "ok" : "not-ok"}`,
      changedFiles: task.changedFiles || [],
      tags: [task.status || "unknown", task.checksOk ? "checks-ok" : "checks-not-ok"]
    });
  }
  for (const review of reviews) {
    pushEntry({
      id: review.id,
      type: "review",
      createdAt: review.createdAt || "",
      title: review.prompt || "Review artifact",
      summary: `${review.findingCount || 0} finding(s), ${review.commandCount || 0} command(s)`,
      changedFiles: review.changedFiles || [],
      tags: ["review", review.findingCount ? "findings" : "no-findings"]
    });
  }
  for (const approval of approvals) {
    pushEntry({
      id: approval.id,
      type: "approval",
      createdAt: approval.createdAt || "",
      title: approval.command || approval.type || "Approval artifact",
      summary: `${approval.status || "unknown"} · ${approval.reason || approval.risk || ""}`.trim(),
      tags: [approval.status || "unknown", approval.risk || "blocked", approval.type || "command"]
    });
  }
  for (const file of diffEvidence.git?.changedFiles || []) {
    pushEntry({
      id: `git:${file}`,
      type: "git",
      createdAt: new Date().toISOString(),
      title: file,
      summary: diffEvidence.stat || "Changed in working tree",
      changedFiles: [file],
      tags: ["git", "changed-file"]
    });
  }

  entries.sort((left, right) => String(right.createdAt || "").localeCompare(String(left.createdAt || "")));
  const clippedEntries = entries.slice(0, max);
  const rollup = {
    workspace: currentWorkspace,
    generatedAt: new Date().toISOString(),
    sourceCompactAt: compact?.generatedAt || "",
    query: term,
    summary: {
      entries: clippedEntries.length,
      tasks: clippedEntries.filter((item) => item.type === "task").length,
      reviews: clippedEntries.filter((item) => item.type === "review").length,
      approvals: clippedEntries.filter((item) => item.type === "approval").length,
      git: clippedEntries.filter((item) => item.type === "git").length,
      goals: clippedEntries.filter((item) => item.type === "goal").length
    },
    entries: clippedEntries,
    changedFiles: uniqueLimited(clippedEntries.flatMap((item) => item.changedFiles || []), 80),
    nextFocus: clippedEntries.slice(0, 8).map((item) => `${item.type}: ${item.title}`),
    policy: {
      access: "local-read-only",
      scope: "currentWorkspace",
      persistedPath: toPosix(path.relative(APP_ROOT, CONTEXT_ROLLUP_PATH))
    }
  };
  await writeJsonAtomic(CONTEXT_ROLLUP_PATH, rollup);
  return rollup;
}

async function readContextRollup() {
  const rollup = await readJsonOrNull(CONTEXT_ROLLUP_PATH);
  if (!rollup || rollup.workspace !== currentWorkspace) return null;
  return rollup;
}

let contextCompactionTimer = null;
let contextCompactionPendingReason = "";
let contextCompactionPromise = null;

async function runContextCompactionArtifact(reason = "state-change") {
  const compact = await buildContextCompaction({ deep: false });
  compact.autoGenerated = true;
  compact.autoReason = reason || "state-change";
  compact.autoGeneratedAt = new Date().toISOString();
  await writeJsonAtomic(CONTEXT_COMPACT_PATH, compact);
  await buildContextRollup({ limit: 24 });
  return compact;
}

function scheduleContextCompaction(reason = "state-change") {
  contextCompactionPendingReason = reason || contextCompactionPendingReason || "state-change";
  if (contextCompactionTimer) return;
  contextCompactionTimer = setTimeout(async () => {
    const reasonForRun = contextCompactionPendingReason || "state-change";
    contextCompactionTimer = null;
    contextCompactionPendingReason = "";
    contextCompactionPromise = runContextCompactionArtifact(reasonForRun);
    try {
      await contextCompactionPromise;
    } catch {
      // Best-effort resumability evidence should never block the user path.
    } finally {
      contextCompactionPromise = null;
    }
  }, 250);
}

async function flushContextCompaction(reason = "state-change") {
  if (contextCompactionTimer) {
    clearTimeout(contextCompactionTimer);
    contextCompactionTimer = null;
    const reasonForRun = contextCompactionPendingReason || reason;
    contextCompactionPendingReason = "";
    contextCompactionPromise = runContextCompactionArtifact(reasonForRun);
  }
  if (contextCompactionPromise) {
    try {
      return await contextCompactionPromise;
    } finally {
      contextCompactionPromise = null;
    }
  }
  return await readContextCompaction();
}

function parseUnifiedDiff(diffText) {
  const files = [];
  const lines = String(diffText || "").replace(/\r\n/g, "\n").split("\n");
  let current = null;
  for (const line of lines) {
    if (line.startsWith("diff --git ")) {
      current = { path: "", hunks: [] };
      files.push(current);
      continue;
    }
    if (line.startsWith("--- ")) continue;
    if (line.startsWith("+++ ")) {
      const raw = line.slice(4).trim();
      const cleaned = normalizeWorkspacePath(raw);
      if (!cleaned) continue;
      if (!current) {
        current = { path: cleaned, hunks: [] };
        files.push(current);
      }
      current.path = cleaned;
      continue;
    }
    if (line.startsWith("@@ ")) {
      if (!current) throw new Error("diff 缺少文件头。");
      const match = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(line);
      if (!match) throw new Error(`无法解析 hunk：${line}`);
      current.hunks.push({
        oldStart: Number(match[1]),
        oldCount: Number(match[2] || 1),
        newStart: Number(match[3]),
        newCount: Number(match[4] || 1),
        lines: []
      });
      continue;
    }
    if (current?.hunks.length) {
      const hunk = current.hunks[current.hunks.length - 1];
      if (/^[ +\-\\]/.test(line) || line === "") hunk.lines.push(line);
    }
  }
  return files.filter((file) => file.path && file.hunks.length);
}

function applyUnifiedDiffToContent(content, filePatch) {
  const normalizedContent = content.replace(/\r\n/g, "\n");
  const original = normalizedContent ? normalizedContent.split("\n") : [];
  let output = [];
  let cursor = 0;
  for (const hunk of filePatch.hunks) {
    const start = Math.max(0, hunk.oldStart - 1);
    output.push(...original.slice(cursor, start));
    cursor = start;
    for (const line of hunk.lines) {
      if (line.startsWith("\\")) continue;
      if (line.startsWith(" ")) {
        const expected = line.slice(1);
        if (original[cursor] !== expected) {
          throw new Error(`补丁上下文不匹配：${filePatch.path}:${cursor + 1}`);
        }
        output.push(original[cursor]);
        cursor += 1;
      } else if (line.startsWith("-")) {
        const expected = line.slice(1);
        if (original[cursor] !== expected) {
          throw new Error(`补丁删除行不匹配：${filePatch.path}:${cursor + 1}`);
        }
        cursor += 1;
      } else if (line.startsWith("+")) {
        output.push(line.slice(1));
      }
    }
  }
  output.push(...original.slice(cursor));
  return output.join("\n");
}

function singleHunkPatch(filePatch, hunk) {
  return {
    path: filePatch.path,
    hunks: [hunk]
  };
}

function hunkLabel(hunk) {
  return `@@ -${hunk.oldStart},${hunk.oldCount} +${hunk.newStart},${hunk.newCount} @@`;
}

function normalizeSelectedHunks(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => ({
      path: String(item?.path || "").slice(0, 400),
      selectedHunks: item?.selectedHunks === null ? null : Number(item?.selectedHunks || 0),
      totalHunks: item?.totalHunks === null ? null : Number(item?.totalHunks || 0)
    }))
    .filter((item) => item.path)
    .slice(0, 200);
}

async function analyzeUnifiedDiffApplication(diffText) {
  const parsed = parseUnifiedDiff(diffText);
  const files = [];
  for (const filePatch of parsed) {
    const before = await readWorkspaceFile(filePatch.path).catch(() => "");
    try {
      const after = applyUnifiedDiffToContent(before, filePatch);
      files.push({
        path: filePatch.path,
        status: "applicable",
        hunkCount: filePatch.hunks.length,
        applicableHunks: filePatch.hunks.length,
        conflictHunks: 0,
        beforeBytes: Buffer.byteLength(before, "utf8"),
        afterBytes: Buffer.byteLength(after, "utf8"),
        diff: renderSingleFileDiff(filePatch),
        patch: filePatch,
        after,
        hunkConflicts: []
      });
    } catch (error) {
      const applicableHunks = [];
      const hunkConflicts = [];
      for (const hunk of filePatch.hunks) {
        try {
          applyUnifiedDiffToContent(before, singleHunkPatch(filePatch, hunk));
          applicableHunks.push(hunk);
        } catch (hunkError) {
          hunkConflicts.push({
            label: hunkLabel(hunk),
            oldStart: hunk.oldStart,
            oldCount: hunk.oldCount,
            newStart: hunk.newStart,
            newCount: hunk.newCount,
            diff: renderSingleFileDiff(singleHunkPatch(filePatch, hunk)),
            error: hunkError instanceof Error ? hunkError.message : String(hunkError)
          });
        }
      }
      if (applicableHunks.length) {
        const partialPatch = { path: filePatch.path, hunks: applicableHunks };
        const after = applyUnifiedDiffToContent(before, partialPatch);
        files.push({
          path: filePatch.path,
          status: "partial",
          hunkCount: filePatch.hunks.length,
          applicableHunks: applicableHunks.length,
          conflictHunks: hunkConflicts.length,
          beforeBytes: Buffer.byteLength(before, "utf8"),
          afterBytes: Buffer.byteLength(after, "utf8"),
          diff: renderSingleFileDiff(partialPatch),
          originalDiff: renderSingleFileDiff(filePatch),
          patch: partialPatch,
          after,
          error: error instanceof Error ? error.message : String(error),
          hunkConflicts
        });
        continue;
      }
      files.push({
        path: filePatch.path,
        status: "conflict",
        hunkCount: filePatch.hunks.length,
        applicableHunks: 0,
        conflictHunks: filePatch.hunks.length,
        beforeBytes: Buffer.byteLength(before, "utf8"),
        afterBytes: null,
        diff: renderSingleFileDiff(filePatch),
        patch: filePatch,
        after: null,
        error: error instanceof Error ? error.message : String(error),
        hunkConflicts
      });
    }
  }
  const conflicts = files
    .filter((file) => file.status === "conflict" || file.status === "partial")
    .flatMap(({ path: filePath, status, hunkCount, applicableHunks, conflictHunks, error, diff, hunkConflicts }) => {
      if (hunkConflicts?.length) {
        return hunkConflicts.map((hunk) => ({
          path: filePath,
          status,
          hunkCount,
          applicableHunks,
          conflictHunks,
          hunk: hunk.label,
          oldStart: hunk.oldStart,
          oldCount: hunk.oldCount,
          newStart: hunk.newStart,
          newCount: hunk.newCount,
          error: hunk.error,
          diff: hunk.diff
        }));
      }
      return [{ path: filePath, status, hunkCount, applicableHunks, conflictHunks, error, diff }];
    });
  const applicable = files
    .filter((file) => file.status === "applicable" || file.status === "partial")
    .map(({ path: filePath, status, hunkCount, applicableHunks, conflictHunks, beforeBytes, afterBytes, diff }) => ({
      path: filePath,
      status,
      hunkCount,
      applicableHunks,
      conflictHunks,
      beforeBytes,
      afterBytes,
      diff
    }));
  return {
    generatedAt: new Date().toISOString(),
    workspace: currentWorkspace,
    summary: {
      files: files.length,
      applicable: applicable.length,
      conflicts: conflicts.length,
      applicableHunks: files.reduce((sum, file) => sum + (file.applicableHunks || 0), 0),
      conflictHunks: files.reduce((sum, file) => sum + (file.conflictHunks || 0), 0)
    },
    files: [...applicable, ...conflicts],
    applicable,
    conflicts,
    parsed,
    prepared: files,
    policy: {
      access: "workspace-diff-preflight",
      createsCheckpoint: false,
      writesFiles: false,
      supportsPartialApply: true,
      supportsPartialHunks: true
    }
  };
}

async function previewUnifiedDiff(diffText) {
  const parsed = parseUnifiedDiff(diffText);
  const patches = [];
  for (const filePatch of parsed) {
    const before = await readWorkspaceFile(filePatch.path).catch(() => "");
    applyUnifiedDiffToContent(before, filePatch);
    patches.push({
      path: filePatch.path,
      diff: renderSingleFileDiff(filePatch),
      hunks: filePatch.hunks.length
    });
  }
  return patches;
}

function buildConflictPreviewBlock(conflict) {
  const lines = String(conflict.diff || "").split(/\r?\n/);
  const current = [];
  const proposed = [];
  const context = [];
  for (const line of lines) {
    if (!line || line.startsWith("---") || line.startsWith("+++") || line.startsWith("@@") || line.startsWith("diff --git")) {
      continue;
    }
    if (line.startsWith("-")) {
      current.push(line.slice(1));
    } else if (line.startsWith("+")) {
      proposed.push(line.slice(1));
    } else if (line.startsWith(" ")) {
      const value = line.slice(1);
      context.push(value);
      current.push(value);
      proposed.push(value);
    }
  }
  return {
    marker: [
      "<<<<<<< CURRENT",
      ...current,
      "=======",
      ...proposed,
      ">>>>>>> PROPOSED"
    ].join("\n"),
    current,
    proposed,
    context
  };
}

async function buildDiffConflictPreview(diffText) {
  const analysis = await analyzeUnifiedDiffApplication(diffText);
  const conflictPreviews = analysis.conflicts.map((conflict) => ({
    path: conflict.path,
    status: conflict.status,
    hunk: conflict.hunk || "",
    oldStart: conflict.oldStart || null,
    oldCount: conflict.oldCount || null,
    newStart: conflict.newStart || null,
    newCount: conflict.newCount || null,
    error: conflict.error || "",
    ...buildConflictPreviewBlock(conflict)
  }));
  return {
    generatedAt: new Date().toISOString(),
    workspace: currentWorkspace,
    summary: {
      files: analysis.summary.files,
      applicable: analysis.summary.applicable,
      conflicts: conflictPreviews.length,
      applicableHunks: analysis.summary.applicableHunks,
      conflictHunks: analysis.summary.conflictHunks
    },
    conflictPreviews,
    applicable: analysis.applicable,
    analysis: {
      generatedAt: analysis.generatedAt,
      summary: analysis.summary,
      files: analysis.files,
      policy: analysis.policy
    },
    policy: {
      access: "workspace-diff-conflict-preview",
      writesFiles: false,
      createsCheckpoint: false,
      visualizesMergeConflicts: true,
      supportsPartialHunks: true
    }
  };
}

function splitResolutionText(value) {
  const text = String(value ?? "").replace(/\r\n/g, "\n");
  if (text === "") return [];
  return text.endsWith("\n") ? text.slice(0, -1).split("\n") : text.split("\n");
}

function buildResolutionHunk(currentContent, conflict, resolvedText) {
  const normalized = String(currentContent || "").replace(/\r\n/g, "\n");
  const original = normalized ? normalized.split("\n") : [];
  if (original.length && original[original.length - 1] === "") original.pop();
  const start = Math.max(0, Number(conflict.oldStart || 1) - 1);
  const count = Math.max(0, Number(conflict.oldCount || 0));
  if (start > original.length) {
    throw new Error(`冲突位置超出当前文件范围：${conflict.path}:${start + 1}`);
  }
  if (start + count > original.length) {
    throw new Error(`冲突替换范围超出当前文件范围：${conflict.path}:${start + 1}`);
  }
  const before = original.slice(start, start + count);
  const resolved = splitResolutionText(resolvedText);
  return {
    oldStart: start + 1,
    oldCount: before.length,
    newStart: start + 1,
    newCount: resolved.length,
    lines: [
      ...before.map((line) => `-${line}`),
      ...resolved.map((line) => `+${line}`)
    ]
  };
}

async function buildConflictResolutionDraft({ diff = "", resolutions = [], prompt = "" } = {}) {
  if (!diff || typeof diff !== "string") throw new Error("缺少 diff。");
  if (!Array.isArray(resolutions) || !resolutions.length) throw new Error("缺少 resolutions。");
  const preview = await buildDiffConflictPreview(diff);
  const filePatches = new Map();
  const used = [];
  for (const [index, resolution] of resolutions.entries()) {
    const pathValue = String(resolution.path || "");
    const resolved = "resolved" in resolution ? resolution.resolved : resolution.text;
    if (!pathValue) throw new Error(`resolution[${index}] 缺少 path。`);
    if (resolved === undefined || resolved === null) throw new Error(`resolution[${index}] 缺少 resolved。`);
    const match = preview.conflictPreviews.find((conflict, conflictIndex) => {
      if (conflict.path !== pathValue) return false;
      if (resolution.hunk && conflict.hunk !== resolution.hunk) return false;
      if (resolution.oldStart && Number(conflict.oldStart) !== Number(resolution.oldStart)) return false;
      return resolution.index === undefined || Number(resolution.index) === conflictIndex;
    });
    if (!match) throw new Error(`未找到匹配冲突：${pathValue}`);
    const before = await readWorkspaceFile(match.path).catch(() => "");
    const hunk = buildResolutionHunk(before, match, resolved);
    const currentPatch = filePatches.get(match.path) || { path: match.path, hunks: [] };
    currentPatch.hunks.push(hunk);
    filePatches.set(match.path, currentPatch);
    used.push({
      path: match.path,
      hunk: match.hunk,
      oldStart: match.oldStart,
      newStart: match.newStart,
      resolvedLines: splitResolutionText(resolved).length
    });
  }
  const patches = [...filePatches.values()];
  for (const patch of patches) {
    patch.hunks.sort((left, right) => Number(left.oldStart || 0) - Number(right.oldStart || 0));
  }
  const resolutionDiff = patches.map(renderSingleFileDiff).join("\n");
  const analysis = await analyzeUnifiedDiffApplication(resolutionDiff);
  if (analysis.conflicts.length) {
    throw new Error(`生成的解决 diff 仍有冲突：${analysis.conflicts.map((item) => `${item.path} ${item.hunk || ""}`.trim()).join(", ")}`);
  }
  const rendered = await previewUnifiedDiff(resolutionDiff);
  const proposal = {
    id: `resolution-${new Date().toISOString().replace(/[:.]/g, "-")}`,
    type: "conflict_resolution",
    createdAt: new Date().toISOString(),
    prompt: prompt || "conflict resolution draft",
    reply: "已生成冲突解决草稿，等待审批写入。",
    plan: ["读取原始 diff 冲突", "生成 resolved 替换 hunk", "预检解决 diff 可应用", "等待审批写入"],
    diff: resolutionDiff,
    patches: rendered,
    commands: [],
    review: [{
      severity: "info",
      message: "冲突解决草稿只更新 pending proposal，不直接写入目标文件。",
      file: "",
      line: ""
    }],
    sourceConflictSummary: preview.summary,
    resolutions: used
  };
  const previousGoal = await readGoalState();
  const goal = await writeGoalState({
    objective: prompt || previousGoal.objective || "解决 diff 冲突",
    phase: "awaiting_resolution_approval",
    status: "awaiting_approval",
    lastPrompt: prompt || previousGoal.lastPrompt || "",
    pendingProposal: proposal,
    nextStep: "复核冲突解决 diff 后批准写入。"
  });
  return {
    generatedAt: new Date().toISOString(),
    workspace: currentWorkspace,
    proposal,
    summary: {
      resolved: used.length,
      files: patches.length,
      applicableHunks: analysis.summary.applicableHunks,
      conflictHunks: analysis.summary.conflictHunks
    },
    analysis,
    goal: {
      phase: goal.phase,
      status: goal.status,
      pendingProposalId: goal.pendingProposal?.id || ""
    },
    policy: {
      access: "workspace-conflict-resolution-draft",
      writesFiles: false,
      createsCheckpoint: false,
      updatesPendingProposal: true,
      requiresApplyApproval: true
    }
  };
}

async function buildSemanticRenameDraft({ symbol = "", newName = "", path: targetPath = "", line = 0, limit = 80, contextLines = 3, prompt = "" } = {}) {
  const preview = await buildSemanticRenamePreview(symbol, newName, {
    path: targetPath,
    line,
    limit,
    contextLines
  });
  if (!preview.symbol || !preview.newName) throw new Error("缺少 symbol 或 newName。");
  if (!/^[A-Za-z_$][\w$]*$/.test(preview.newName)) throw new Error("newName 不是合法 JavaScript 标识符。");
  if (preview.symbol === preview.newName) throw new Error("newName 与当前符号相同。");
  if (preview.replacementConflicts?.length) {
    throw new Error(`重命名存在命名冲突：${preview.replacementConflicts.map((item) => `${item.path}:${item.line}`).join(", ")}`);
  }

  const candidateLocationMap = new Map();
  for (const item of preview.locations || []) {
    if (!item.path || !item.line || Number(item.occurrenceCount || 0) <= 0) continue;
    const filePath = toPosix(item.path);
    const key = `${filePath}:${Number(item.line)}`;
    const existing = candidateLocationMap.get(key);
    if (existing) {
      existing.role = uniqueLimited([existing.role, item.role].filter(Boolean), 4).join(",");
      existing.kind = uniqueLimited([existing.kind, item.kind].filter(Boolean), 4).join(",");
      existing.occurrenceCount = Math.max(Number(existing.occurrenceCount || 0), Number(item.occurrenceCount || 0));
    } else {
      candidateLocationMap.set(key, { ...item, path: filePath });
    }
  }
  const candidateLocations = [...candidateLocationMap.values()]
    .sort((left, right) => String(left.path).localeCompare(String(right.path)) || Number(left.line || 0) - Number(right.line || 0));
  if (!candidateLocations.length) throw new Error("没有可安全替换的位置。");

  const patchesByPath = new Map();
  for (const location of candidateLocations) {
    const filePath = toPosix(location.path);
    const currentContent = await readWorkspaceFile(filePath);
    const lines = currentContent.replace(/\r\n/g, "\n").split("\n");
    const lineIndex = Number(location.line || 0) - 1;
    if (lineIndex < 0 || lineIndex >= lines.length) {
      throw new Error(`重命名位置超出当前文件范围：${filePath}:${location.line}`);
    }
    const beforeLine = lines[lineIndex];
    const replacementResult = replaceCodeIdentifierOccurrences(beforeLine, preview.symbol, preview.newName);
    if (!replacementResult.count) {
      throw new Error(`重命名位置已变化，需要重新预览：${filePath}:${location.line}`);
    }
    const afterLine = replacementResult.text;
    if (afterLine === beforeLine) continue;
    const patch = patchesByPath.get(filePath) || { path: filePath, hunks: [] };
    patch.hunks.push({
      oldStart: lineIndex + 1,
      oldCount: 1,
      newStart: lineIndex + 1,
      newCount: 1,
      lines: [`-${beforeLine}`, `+${afterLine}`]
    });
    patchesByPath.set(filePath, patch);
  }

  const patches = [...patchesByPath.values()];
  if (!patches.length) throw new Error("没有生成可写入的重命名 diff。");
  const renameDiff = patches.map(renderSingleFileDiff).join("\n");
  const analysis = await analyzeUnifiedDiffApplication(renameDiff);
  if (analysis.conflicts.length) {
    throw new Error(`生成的重命名 diff 仍有冲突：${analysis.conflicts.map((item) => `${item.path} ${item.hunk || ""}`.trim()).join(", ")}`);
  }
  const rendered = await previewUnifiedDiff(renameDiff);
  const proposal = {
    id: `rename-${new Date().toISOString().replace(/[:.]/g, "-")}`,
    type: "semantic_rename",
    createdAt: new Date().toISOString(),
    prompt: prompt || `Rename ${preview.symbol} to ${preview.newName}`,
    reply: `已生成 ${preview.symbol} -> ${preview.newName} 的重命名 diff 草稿，等待审批写入。`,
    plan: ["读取符号重命名预览", "生成逐行安全替换 diff", "预检 diff 可应用", "等待审批写入并运行验证"],
    diff: renameDiff,
    patches: rendered,
    commands: preview.verificationCommands || [],
    review: [
      {
        severity: "info",
        message: "重命名草稿只更新 pending proposal，不直接写入目标文件。",
        file: "",
        line: ""
      },
      ...(preview.warnings || []).map((warning) => ({
        severity: "warning",
        message: `重命名预览警告：${warning}`,
        file: "",
        line: ""
      }))
    ],
    renamePreview: {
      symbol: preview.symbol,
      newName: preview.newName,
      summary: preview.summary,
      files: preview.files,
      warnings: preview.warnings
    }
  };
  const previousGoal = await readGoalState();
  const goal = await writeGoalState({
    objective: prompt || previousGoal.objective || proposal.prompt,
    phase: "awaiting_rename_approval",
    status: "awaiting_approval",
    lastPrompt: prompt || previousGoal.lastPrompt || proposal.prompt,
    pendingProposal: proposal,
    nextStep: "复核重命名 diff 后批准写入。"
  });
  return {
    generatedAt: new Date().toISOString(),
    workspace: currentWorkspace,
    proposal,
    preview,
    summary: {
      files: patches.length,
      locations: candidateLocations.length,
      applicableHunks: analysis.summary.applicableHunks,
      conflictHunks: analysis.summary.conflictHunks
    },
    analysis,
    goal: {
      phase: goal.phase,
      status: goal.status,
      pendingProposalId: goal.pendingProposal?.id || ""
    },
    policy: {
      access: "workspace-semantic-rename-draft",
      writesFiles: false,
      createsCheckpoint: false,
      updatesPendingProposal: true,
      requiresApplyApproval: true
    }
  };
}

function renderSingleFileDiff(filePatch) {
  return [
    `--- ${filePatch.path}`,
    `+++ ${filePatch.path}`,
    ...filePatch.hunks.flatMap((hunk) => [
      `@@ -${hunk.oldStart},${hunk.oldCount} +${hunk.newStart},${hunk.newCount} @@`,
      ...hunk.lines
    ])
  ].join("\n");
}

async function createCheckpoint(patches) {
  await fs.mkdir(CHECKPOINT_DIR, { recursive: true });
  const id = new Date().toISOString().replace(/[:.]/g, "-");
  const checkpointPath = path.join(CHECKPOINT_DIR, `${id}.json`);
  const files = [];
  for (const patch of patches) {
    const full = safePath(patch.path);
    const existed = await fs.stat(full).then(() => true).catch(() => false);
    const content = existed ? await fs.readFile(full, "utf8") : "";
    files.push({ path: patch.path, existed, content });
  }
  await fs.writeFile(checkpointPath, JSON.stringify({
    id,
    workspace: currentWorkspace,
    createdAt: new Date().toISOString(),
    files
  }, null, 2), "utf8");
  return { id, fileCount: files.length };
}

async function listCheckpoints() {
  await fs.mkdir(CHECKPOINT_DIR, { recursive: true });
  const entries = await fs.readdir(CHECKPOINT_DIR, { withFileTypes: true });
  const checkpoints = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const id = entry.name.replace(/\.json$/, "");
    const checkpointPath = path.join(CHECKPOINT_DIR, entry.name);
    const checkpoint = JSON.parse(await fs.readFile(checkpointPath, "utf8").catch(() => "{}"));
    if (checkpoint.workspace !== currentWorkspace) continue;
    checkpoints.push(id);
  }
  return checkpoints.sort().reverse().slice(0, 20);
}

async function rollbackCheckpoint(id) {
  if (!/^[\w.-]+$/.test(String(id))) throw new Error("checkpoint id 非法。");
  const checkpointPath = path.join(CHECKPOINT_DIR, `${id}.json`);
  const checkpoint = JSON.parse(await fs.readFile(checkpointPath, "utf8"));
  if (checkpoint.workspace !== currentWorkspace) {
    throw new Error("该 checkpoint 不属于当前工作目录，请先切回对应目录。");
  }
  for (const file of checkpoint.files) {
    const full = safePath(file.path);
    if (file.existed) {
      await fs.mkdir(path.dirname(full), { recursive: true });
      await fs.writeFile(full, file.content, "utf8");
    } else {
      await fs.rm(full, { force: true });
    }
  }
  return { id, restored: checkpoint.files.map((file) => file.path) };
}

function evaluateCommandPolicy(command) {
  const text = String(command || "").trim();
  if (!text) {
    return { allowed: false, risk: "blocked", reason: "空命令。", command: text };
  }
  if (text.length > 220) {
    return { allowed: false, risk: "blocked", reason: "命令过长，已拒绝。", command: text };
  }
  if (/[;&|`<>]/.test(text)) {
    return { allowed: false, risk: "blocked", reason: "包含 shell 控制符，已拒绝。", command: text };
  }
  if (/\b(?:rm|del|rmdir|remove-item|format|curl|wget|invoke-webrequest|set-content|out-file)\b/i.test(text)) {
    return { allowed: false, risk: "blocked", reason: "包含删除、写入或网络下载类命令，已拒绝。", command: text };
  }
  const allowed = SAFE_COMMAND_PATTERNS.some((pattern) => pattern.test(text));
  if (!allowed) {
    return { allowed: false, risk: "blocked", reason: "未匹配允许的检查/构建命令模式。", command: text };
  }
  const risk = /\b(?:build|test)\b/i.test(text) ? "medium" : "low";
  return { allowed: true, risk, reason: "匹配安全检查/构建命令策略。", command: text };
}

function isSafeCommand(command) {
  return evaluateCommandPolicy(command).allowed;
}

function evaluateProcessPolicy(command) {
  const text = String(command || "").trim();
  const basePolicy = evaluateCommandPolicy(text);
  if (!text) return basePolicy;
  if (basePolicy.reason !== "未匹配允许的检查/构建命令模式。") {
    return { ...basePolicy, reason: basePolicy.allowed ? "该命令适合短任务执行，不需要后台进程。" : basePolicy.reason };
  }
  const smokeCommand = [process.execPath, path.join(APP_ROOT, "server.js"), "--mcp-smoke-server"].join(" ");
  if (text.toLowerCase() === smokeCommand.toLowerCase()) {
    return { allowed: true, risk: "low", reason: "匹配本地 MCP smoke server 受控进程策略。", command: text };
  }
  const allowed = PROCESS_COMMAND_PATTERNS.some((pattern) => pattern.test(text));
  if (!allowed) {
    return { allowed: false, risk: "blocked", reason: "未匹配允许的受管服务命令模式。", command: text };
  }
  return { allowed: true, risk: "medium", reason: "匹配受管开发服务命令策略。", command: text };
}

async function readPackageScripts() {
  const full = path.join(currentWorkspace, "package.json");
  const pkg = JSON.parse(await fs.readFile(full, "utf8").catch(() => "{}"));
  return pkg && typeof pkg.scripts === "object" && pkg.scripts ? pkg.scripts : {};
}

async function detectPackageManager() {
  const candidates = [
    { file: "pnpm-lock.yaml", manager: "pnpm" },
    { file: "yarn.lock", manager: "yarn" },
    { file: "package-lock.json", manager: "npm" },
    { file: "npm-shrinkwrap.json", manager: "npm" }
  ];
  for (const candidate of candidates) {
    const stat = await fs.stat(path.join(currentWorkspace, candidate.file)).catch(() => null);
    if (stat?.isFile()) return candidate.manager;
  }
  return "npm";
}

function packageStartCommand(manager, scriptName) {
  const name = String(scriptName || "").trim();
  if (!name) return "";
  if (manager === "npm") return name === "start" ? "npm start" : `npm run ${name}`;
  if (manager === "pnpm") return `pnpm ${name}`;
  if (manager === "yarn") return `yarn ${name}`;
  return `npm run ${name}`;
}

function packageRunCommand(manager, scriptName) {
  const name = String(scriptName || "").trim();
  if (!name) return "";
  if (manager === "npm") return name === "test" ? "npm test" : `npm run ${name}`;
  if (manager === "pnpm") return `pnpm ${name}`;
  if (manager === "yarn") return `yarn ${name}`;
  return `npm run ${name}`;
}

async function discoverTypecheckCommands({ scripts = null, files = null, limit = 8 } = {}) {
  const max = Math.min(20, Math.max(1, Number(limit) || 8));
  const loadedScripts = scripts || await readPackageScripts();
  const loadedFiles = files || await listFiles();
  const manager = await detectPackageManager();
  const tsconfigs = loadedFiles
    .filter((file) => /^tsconfig(?:\.[\w.-]+)?\.json$/i.test(path.basename(file.path || "")))
    .map((file) => file.path)
    .slice(0, max);
  const hasTsFiles = loadedFiles.some((file) => [".ts", ".tsx"].includes(path.extname(file.path || "").toLowerCase()));
  const localCompilerCandidates = [
    "node_modules/.bin/tsc.cmd",
    "node_modules/.bin/tsc"
  ];
  const localCompiler = (await Promise.all(localCompilerCandidates.map(async (candidate) => {
    const stat = await fs.stat(path.join(currentWorkspace, candidate)).catch(() => null);
    return stat?.isFile() ? candidate : "";
  }))).find(Boolean) || "";
  const seen = new Set();
  const commands = [];
  const add = (command, reason = "", source = "detected") => {
    const text = String(command || "").trim();
    if (!text || seen.has(text)) return;
    const policy = evaluateCommandPolicy(text);
    if (!policy.allowed) return;
    seen.add(text);
    commands.push({ command: text, reason, source, policy });
  };

  for (const name of ["typecheck", "check", "build"]) {
    if (!loadedScripts[name]) continue;
    const expanded = extractSafeScriptCommands(loadedScripts[name]);
    const typeLike = /tsc|vue-tsc|svelte-check|astro check|next lint|next build|tsserver|type-?check/i.test(loadedScripts[name]);
    if (name === "typecheck" || typeLike) {
      if (expanded.length) {
        for (const command of expanded) add(command, `展开 package.json scripts.${name}: ${loadedScripts[name]}`, "package-script-expanded");
      }
      add(packageRunCommand(manager, name), `package.json scripts.${name}: ${loadedScripts[name]}`, "package-script");
    }
  }
  if (tsconfigs.length || hasTsFiles) {
    add(localCompiler ? `${localCompiler} --noEmit --pretty false` : "tsc --noEmit --pretty false", localCompiler ? "检测到本地 TypeScript 编译器，可执行 noEmit 类型检查。" : "检测到 TypeScript 配置或源码，可在 PATH 中存在 tsc 时执行 noEmit 类型检查。", localCompiler ? "local-compiler" : "path-compiler");
  }

  return {
    generatedAt: new Date().toISOString(),
    workspace: currentWorkspace,
    packageManager: manager,
    tsconfigs,
    hasTsFiles,
    localCompiler,
    scripts: Object.fromEntries(["typecheck", "check", "build"].filter((name) => loadedScripts[name]).map((name) => [name, loadedScripts[name]])),
    commands: commands.slice(0, max),
    policy: {
      access: "local-read-only-typecheck-discovery",
      scope: "currentWorkspace",
      executesCommands: false,
      filtersByCommandPolicy: true
    }
  };
}

function extractSafeProcessScriptCommands(script) {
  const parts = String(script || "")
    .split(/\s+&&\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (!parts.length) return [];
  return parts.filter((part) => evaluateProcessPolicy(part).allowed);
}

async function discoverStartupCommands({ limit = 8 } = {}) {
  const max = Math.min(20, Math.max(1, Number(limit) || 8));
  const scripts = await readPackageScripts();
  const manager = await detectPackageManager();
  const runtimeUrl = await readRuntimeUrlState();
  const seen = new Set();
  const commands = [];
  const add = (command, reason = "", source = "detected") => {
    const text = String(command || "").trim();
    if (!text || seen.has(text)) return;
    const policy = evaluateProcessPolicy(text);
    if (!policy.allowed) return;
    seen.add(text);
    commands.push({
      command: text,
      reason,
      source,
      policy,
      probe: inferProcessProbe({ command: text, output: "" })
    });
  };

  for (const name of START_SCRIPT_NAMES) {
    if (scripts[name]) {
      const expanded = extractSafeProcessScriptCommands(scripts[name]);
      if (expanded.length) {
        for (const command of expanded) {
          add(command, `展开 package.json scripts.${name}: ${scripts[name]}`, "package-script-expanded");
        }
      }
      add(packageStartCommand(manager, name), `package.json scripts.${name}: ${scripts[name]}`, "package-script");
    }
  }

  const serverStat = await fs.stat(path.join(currentWorkspace, "server.js")).catch(() => null);
  if (serverStat?.isFile()) add("node server.js", "检测到 server.js，可作为本地服务入口。", "entrypoint");

  const appStat = await fs.stat(path.join(currentWorkspace, "app.js")).catch(() => null);
  if (!commands.length && appStat?.isFile()) add("node app.js", "检测到 app.js，可尝试作为 Node 入口。", "entrypoint");

  return {
    generatedAt: new Date().toISOString(),
    workspace: currentWorkspace,
    runtimeUrl,
    packageManager: manager,
    scripts: Object.fromEntries(START_SCRIPT_NAMES.filter((name) => scripts[name]).map((name) => [name, scripts[name]])),
    commands: commands.slice(0, max),
    policy: {
      access: "read-only-startup-discovery",
      scope: "currentWorkspace",
      executesCommands: false,
      startsProcesses: false,
      readsRuntimeUrl: true,
      filtersByProcessPolicy: true
    }
  };
}

function extractSafeScriptCommands(script) {
  const parts = String(script || "")
    .split(/\s+&&\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (!parts.length) return [];
  return parts.filter((part) => isSafeCommand(part));
}

function packageScriptNameFromCommand(command) {
  const text = String(command || "").trim();
  const match = /^(?:npm|pnpm|yarn)\s+(?:run\s+)?(check|typecheck|test|lint|build)\b/i.exec(text);
  if (match) return match[1].toLowerCase();
  if (/^npm\s+test\b/i.test(text)) return "test";
  return "";
}

async function discoverCheckCommands(commands = []) {
  const seen = new Set();
  const checks = [];
  const add = (command, reason = "") => {
    const text = String(command || "").trim();
    const policy = evaluateCommandPolicy(text);
    if (!text || seen.has(text) || !policy.allowed) return;
    seen.add(text);
    checks.push({ command: text, reason, policy });
  };

  const scripts = await readPackageScripts();
  const files = await listFiles();
  const typecheck = await discoverTypecheckCommands({ scripts, files, limit: 6 });
  for (const item of commands) {
    const command = item.command || item;
    const scriptName = packageScriptNameFromCommand(command);
    const extracted = scriptName && scripts[scriptName] ? extractSafeScriptCommands(scripts[scriptName]) : [];
    if (extracted.length) {
      for (const part of extracted) add(part, item.reason || `展开 package.json scripts.${scriptName}`);
    } else {
      add(command, item.reason || "模型建议的检查命令");
    }
  }

  for (const name of CHECK_SCRIPT_NAMES) {
    if (!scripts[name]) continue;
    const extracted = extractSafeScriptCommands(scripts[name]);
    if (extracted.length) {
      for (const command of extracted) add(command, `package.json scripts.${name}`);
    } else {
      add(`npm run ${name}`, `package.json scripts.${name}`);
    }
  }

  const localServerStat = await fs.stat(path.join(currentWorkspace, "server.js")).catch(() => null);
  if (path.resolve(currentWorkspace) === APP_ROOT && localServerStat?.isFile()) {
    for (const item of FOCUSED_API_SMOKE_CHECKS) add(item.command, item.reason);
  }

  for (const file of files.slice(0, 40)) {
    if ([".js", ".mjs", ".cjs"].includes(path.extname(file.path).toLowerCase())) {
      add(`node --check ${file.path}`, "JavaScript 语法检查");
    }
  }
  for (const item of typecheck.commands || []) add(item.command, item.reason || "TypeScript 类型检查");

  return checks.slice(0, 6);
}

async function executeCommand(command) {
  const policy = evaluateCommandPolicy(command);
  if (!policy.allowed) {
    const error = new Error(`命令未通过安全策略：${policy.reason}`);
    error.policy = policy;
    throw error;
  }
  return new Promise((resolve) => {
    exec(command, {
      cwd: currentWorkspace,
      timeout: 30000,
      maxBuffer: 1024 * 1024,
      windowsHide: true,
      shell: process.platform === "win32" ? "powershell.exe" : "/bin/sh"
    }, (error, stdout, stderr) => {
      resolve({
        exitCode: error?.code ?? 0,
        policy,
        output: [stdout, stderr].filter(Boolean).join("\n").slice(0, 20000)
      });
    });
  });
}

function classifyCommandFailure(command = "", result = {}) {
  const output = String(result.output || "");
  const lower = output.toLowerCase();
  const findings = [];
  const add = (category, severity, message, evidence = [], nextAction = "") => {
    findings.push({
      category,
      severity,
      message,
      evidence: (Array.isArray(evidence) ? evidence : [evidence]).map((item) => String(item || "").trim()).filter(Boolean).slice(0, 6),
      nextAction
    });
  };
  const sourceLocations = extractCommandSourceLocations([command, output].join("\n"));
  const referencedFiles = [...new Set([
    ...sourceLocations.map((item) => item.path),
    ...(output.match(/(?:^|[\s("'`])((?:\.?[A-Za-z0-9_.-]+[\\/])+[A-Za-z0-9_.-]+\.[A-Za-z0-9_]+)(?::\d+)?/g) || [])
      .map((item) => item.replace(/^[\s("'`]+/, "").replace(/:\d+$/, "").replaceAll("\\", "/"))
      .filter(Boolean)
  ])].slice(0, 12);
  const stackLines = output.split(/\r?\n/)
    .filter((line) => /\bat\s+.+:\d+:\d+|error:|exception|traceback|syntaxerror|typeerror|referenceerror/i.test(line))
    .slice(0, 10);

  if (result.exitCode === 124 || /timed out|timeout/i.test(output)) {
    add("timeout", "error", "命令超时，可能是服务未退出、测试挂起或等待交互输入。", stackLines, "先缩小命令范围，或改用受管长任务启动后看 /api/process-health。");
  }
  if (/syntaxerror|unexpected token|missing \)|unterminated|string literal/i.test(output)) {
    add("syntax", "error", "检测到语法错误。", stackLines, "优先读取报错文件和行号，使用 node --check 或对应编译器做最小验证。");
  }
  if (
    /^(?:npm|pnpm|yarn)\b/i.test(String(command || "").trim())
    && (
      /npm-cli\.js|pnpm\.cjs|yarn\.js|corepack/i.test(output)
      || /cannot find module .*node_modules[\\/](?:npm|pnpm|yarn)[\\/]/i.test(output)
      || /module_not_found/i.test(output) && /[\\/](?:npm|pnpm|yarn)[\\/](?:bin|dist|lib)[\\/]/i.test(output)
    )
  ) {
    add("package-manager", "error", "检测到包管理器运行环境损坏。", stackLines, "先改用 node 直跑等价验证命令或 validate.bat 继续排查项目，再修复本机 npm/pnpm/yarn 安装。");
  }
  if (/cannot find module|module not found|err_module_not_found|could not resolve|failed to resolve|can't resolve/i.test(lower)) {
    add("module-resolution", "error", "检测到模块或导入解析失败。", stackLines, "检查 package.json、相对路径大小写、扩展名和本地导出。");
  }
  if (/eaddrinuse|address already in use/i.test(output)) {
    add("port-in-use", "error", "检测到端口占用。", stackLines, "改用 start.bat 自动换端口，或停止旧进程后重试。");
  }
  if (/eacces|permission denied|access is denied|operation not permitted/i.test(lower)) {
    add("permission", "error", "检测到权限或访问被拒绝。", stackLines, "确认目标路径在工作区内，避免写系统目录或受保护文件。");
  }
  if (/enoent|no such file or directory|cannot find path|path not found/i.test(lower)) {
    add("missing-file", "error", "检测到文件或路径不存在。", stackLines, "先确认命令工作目录和引用路径，再读取候选文件。");
  }
  if (/assertionerror|expect\(|expected .* received|test failed|failing tests?|failed tests?/i.test(lower)) {
    add("test-failure", "error", "检测到测试断言失败。", stackLines, "优先读取失败测试和被测实现，保留测试语义修代码。");
  }
  if (/eslint|prettier|lint|stylelint/i.test(lower) && /error|warning|failed/i.test(lower)) {
    add("lint", "warn", "检测到 lint 或格式检查问题。", stackLines, "优先按报错文件逐项修复，再运行同一检查命令。");
  }
  if (!findings.length && Number(result.exitCode) !== 0) {
    add("unknown", "warn", "命令失败，但未匹配到已知错误类型。", stackLines.length ? stackLines : output.split(/\r?\n/).filter(Boolean).slice(0, 8), "先根据输出中的文件、行号或第一条错误读取相关代码。");
  }
  return {
    command: String(command || "").slice(0, 400),
    exitCode: result.exitCode ?? null,
    category: findings[0]?.category || "none",
    severity: findings[0]?.severity || "info",
    summary: findings[0]?.message || "未发现失败信号。",
    referencedFiles,
    sourceLocations,
    stackLines,
    findings,
    nextActions: findings.map((item) => item.nextAction).filter(Boolean).slice(0, 6)
  };
}

function extractCommandSourceLocations(text = "") {
  const source = String(text || "");
  if (!source.trim()) return [];
  const workspaceFiles = listWorkspaceFilesSync();
  const byExact = new Map(workspaceFiles.map((file) => [file.path.toLowerCase(), file.path]));
  const byAbsolute = new Map(workspaceFiles.map((file) => [
    toPosix(path.resolve(currentWorkspace, file.path)).toLowerCase(),
    file.path
  ]));
  const byBase = new Map();
  for (const file of workspaceFiles) {
    const base = path.basename(file.path).toLowerCase();
    if (!byBase.has(base)) byBase.set(base, []);
    byBase.get(base).push(file.path);
  }
  const locations = new Map();
  const workspaceRoot = toPosix(path.resolve(currentWorkspace)).toLowerCase();
  const add = (rawPath, line, column, rawLine = "") => {
    const cleanedPath = String(rawPath || "").trim()
      .replace(/^file:\/\//i, "")
      .replace(/^\/([A-Za-z]:[\\/])/i, "$1")
      .replaceAll("\\", "/");
    const normalized = cleanedPath.replace(/^\.?[\\/]/, "");
    if (!normalized || !/\.[A-Za-z0-9]+$/.test(normalized)) return;
    const absoluteCandidate = path.isAbsolute(cleanedPath)
      ? toPosix(path.resolve(cleanedPath)).toLowerCase()
      : "";
    const workspaceRelative = absoluteCandidate && absoluteCandidate.startsWith(`${workspaceRoot}/`)
      ? absoluteCandidate.slice(workspaceRoot.length + 1)
      : "";
    const exact = byExact.get(normalized.toLowerCase());
    const absolute = absoluteCandidate ? byAbsolute.get(absoluteCandidate) : "";
    const relative = workspaceRelative ? byExact.get(workspaceRelative) : "";
    const baseMatches = byBase.get(path.basename(normalized).toLowerCase()) || [];
    const resolved = exact
      || absolute
      || relative
      || baseMatches.find((candidate) => candidate.toLowerCase().endsWith(normalized.toLowerCase()))
      || "";
    if (!resolved) return;
    const parsedLine = Math.max(1, Number.parseInt(line, 10) || 1);
    const parsedColumn = Math.max(0, Number.parseInt(column, 10) || 0);
    const key = `${resolved.toLowerCase()}:${parsedLine}:${parsedColumn}`;
    if (locations.has(key)) return;
    locations.set(key, {
      path: resolved,
      line: parsedLine,
      column: parsedColumn,
      text: String(rawLine || "").trim().slice(0, 400)
    });
  };

  const patterns = [
    /(?:^|[\s("'`])((?:[A-Za-z]:)?(?:\.?[A-Za-z0-9_.-]+[\\/])*[A-Za-z0-9_.-]+\.[A-Za-z0-9_]+):(\d+):(\d+)/g,
    /(?:^|[\s("'`])((?:[A-Za-z]:)?(?:\.?[A-Za-z0-9_.-]+[\\/])*[A-Za-z0-9_.-]+\.[A-Za-z0-9_]+):(\d+)/g,
    /(?:^|[\s("'`])((?:file:\/\/\/?)?(?:[A-Za-z]:)?[^:\r\n]+?\.[A-Za-z0-9_]+):(\d+):(\d+)/g,
    /(?:^|[\s("'`])((?:file:\/\/\/?)?(?:[A-Za-z]:)?[^:\r\n]+?\.[A-Za-z0-9_]+):(\d+)/g,
    /\(([^()\r\n]+?\.[A-Za-z0-9_]+):(\d+):(\d+)\)/g
  ];
  const lines = source.split(/\r?\n/);
  for (const lineText of lines) {
    for (const pattern of patterns) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(lineText))) {
        add(match[1], match[2], match[3] || 0, lineText);
      }
    }
  }
  if (!locations.size) {
    const lineHint = Number((source.match(/(?:^|\n)[^\r\n]*?\.[A-Za-z0-9_]+:(\d+)(?::\d+)?/) || [])[1]) || 1;
    const commandFilePattern = /(?:^|\s)((?:\.?[\\/])?[A-Za-z0-9_.-]+\.[A-Za-z0-9_]+)(?=\s|$)/g;
    let match;
    while ((match = commandFilePattern.exec(source))) {
      add(match[1], lineHint, 0, match[0]);
      if (locations.size) break;
    }
  }
  return [...locations.values()].slice(0, 16);
}

function uniqueSourceLocations(locations = [], limit = 16) {
  const seen = new Set();
  const unique = [];
  for (const item of Array.isArray(locations) ? locations : []) {
    const pathValue = String(item?.path || "").replaceAll("\\", "/").trim();
    if (!pathValue) continue;
    const line = Math.max(1, Number.parseInt(item.line, 10) || 1);
    const column = Math.max(0, Number.parseInt(item.column, 10) || 0);
    const key = `${pathValue.toLowerCase()}:${line}:${column}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push({
      path: pathValue,
      line,
      column,
      text: String(item.text || "").trim().slice(0, 400)
    });
    if (unique.length >= limit) break;
  }
  return unique;
}

function resolveWorkspaceRelativePathFromBrowserUrl(rawUrl = "") {
  const value = String(rawUrl || "").trim();
  if (!value) return "";
  const workspaceFiles = listWorkspaceFilesSync();
  const byExact = new Map(workspaceFiles.map((file) => [file.path.toLowerCase(), file.path]));
  const byBase = new Map();
  for (const file of workspaceFiles) {
    const base = path.basename(file.path).toLowerCase();
    if (!byBase.has(base)) byBase.set(base, []);
    byBase.get(base).push(file.path);
  }
  const workspaceRoot = toPosix(path.resolve(currentWorkspace)).toLowerCase();
  const candidates = [];
  const addCandidate = (candidate) => {
    const cleaned = String(candidate || "")
      .split(/[?#]/)[0]
      .replaceAll("\\", "/")
      .replace(/^\/([A-Za-z]:\/)/, "$1")
      .replace(/^\/+/, "")
      .trim();
    if (cleaned) candidates.push(cleaned);
  };
  try {
    const parsed = new URL(value);
    if (parsed.protocol === "file:") {
      const filePath = toPosix(fileURLToPath(parsed));
      if (filePath.toLowerCase().startsWith(`${workspaceRoot}/`)) {
        addCandidate(filePath.slice(workspaceRoot.length + 1));
      }
      addCandidate(filePath);
    } else if (/^https?:$/.test(parsed.protocol)) {
      const decodedPath = decodeURIComponent(parsed.pathname || "/");
      if (decodedPath === "/" || !decodedPath) addCandidate("index.html");
      addCandidate(decodedPath);
    }
  } catch {
    addCandidate(value.replace(/^https?:\/\/[^/]+/i, ""));
    addCandidate(value.replace(/^file:\/\//i, ""));
  }
  addCandidate(value);
  for (const candidate of candidates) {
    const exact = byExact.get(candidate.toLowerCase());
    if (exact) return exact;
    const absoluteCandidate = path.isAbsolute(candidate)
      ? toPosix(path.resolve(candidate)).toLowerCase()
      : "";
    if (absoluteCandidate && absoluteCandidate.startsWith(`${workspaceRoot}/`)) {
      const relative = absoluteCandidate.slice(workspaceRoot.length + 1);
      const resolved = byExact.get(relative.toLowerCase());
      if (resolved) return resolved;
    }
    const base = candidate.split("/").pop()?.toLowerCase() || "";
    const baseMatches = byBase.get(base) || [];
    const resolved = baseMatches.find((item) => item.toLowerCase().endsWith(candidate.toLowerCase()))
      || (baseMatches.length === 1 ? baseMatches[0] : "");
    if (resolved) return resolved;
  }
  return "";
}

function addBrowserSourceLocation(locations, rawUrl = "", line = 0, column = 0, text = "", { zeroBased = true } = {}) {
  const resolved = resolveWorkspaceRelativePathFromBrowserUrl(rawUrl);
  if (!resolved) return;
  const parsedLine = Number.parseInt(line, 10);
  const parsedColumn = Number.parseInt(column, 10);
  locations.push({
    path: resolved,
    line: Math.max(1, (Number.isFinite(parsedLine) ? parsedLine : 0) + (zeroBased ? 1 : 0)),
    column: Math.max(0, (Number.isFinite(parsedColumn) ? parsedColumn : 0) + (zeroBased ? 1 : 0)),
    text: String(text || rawUrl || "").trim().slice(0, 400)
  });
}

function addBrowserCallFrameLocations(locations, frames = [], text = "") {
  for (const frame of Array.isArray(frames) ? frames : []) {
    addBrowserSourceLocation(
      locations,
      frame.url || frame.scriptUrl || "",
      frame.lineNumber ?? frame.line ?? 0,
      frame.columnNumber ?? frame.column ?? 0,
      text || frame.functionName || "",
      { zeroBased: true }
    );
  }
}

function extractBrowserTraceSourceLocations(trace = null, limit = 16) {
  if (!trace || typeof trace !== "object") return [];
  const locations = [];
  const addExisting = (items = []) => {
    for (const item of Array.isArray(items) ? items : []) locations.push(item);
  };
  for (const item of Array.isArray(trace.exceptions) ? trace.exceptions : []) {
    addExisting(item.sourceLocations);
    addBrowserSourceLocation(locations, item.url || "", item.line ?? 0, item.column ?? 0, item.text || item.message || item.description || "", { zeroBased: true });
    addBrowserCallFrameLocations(locations, item.callFrames || item.stackTrace?.callFrames || [], item.text || item.message || item.description || "");
    if (item.stack || item.text || item.message || item.description) {
      addExisting(extractCommandSourceLocations([item.stack, item.text, item.message, item.description].filter(Boolean).join("\n")));
    }
  }
  for (const item of Array.isArray(trace.console) ? trace.console : []) {
    addExisting(item.sourceLocations);
    addBrowserSourceLocation(locations, item.url || "", item.line ?? item.lineNumber ?? 0, item.column ?? item.columnNumber ?? 0, item.text || item.message || "", { zeroBased: true });
    addBrowserCallFrameLocations(locations, item.callFrames || item.stackTrace?.callFrames || [], item.text || item.message || "");
    if (item.location || item.text || item.message) {
      addExisting(extractCommandSourceLocations([item.location, item.text, item.message].filter(Boolean).join("\n")));
    }
  }
  return uniqueSourceLocations(locations, limit);
}

function commandItem(command = "", reason = "", extra = {}) {
  return {
    command: String(command || "").trim(),
    reason: String(reason || "").trim(),
    ...extra
  };
}

function dedupeCommandItems(items = []) {
  const seen = new Set();
  return items
    .map((item) => typeof item === "string" ? commandItem(item) : commandItem(item.command, item.reason, item))
    .filter((item) => item.command)
    .filter((item) => {
      const key = item.command.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function buildFailureRecoveryChain(command = "", result = {}, diagnostics = null) {
  const failureAnalysis = result.failureAnalysis || diagnostics?.commandFailure || classifyCommandFailure(command, result);
  const diagnosticCommands = Array.isArray(diagnostics?.verificationPlan?.commands)
    ? diagnostics.verificationPlan.commands
    : [];
  const packageManagerFallbackCommands = failureAnalysis.category === "package-manager"
    ? [
        commandItem("node --check server.js", "npm/pnpm/yarn 损坏时先用 node 直跑后端语法检查，确认项目代码仍可验证。", { stage: "verify-toolchain-fallback" }),
        commandItem("node --check app.js", "npm/pnpm/yarn 损坏时先用 node 直跑前端语法检查，绕开包管理器入口。", { stage: "verify-toolchain-fallback" }),
        commandItem("node server.js --ui-smoke-test", "npm/pnpm/yarn 损坏时用 node 直跑 UI smoke，继续验证工作台入口。", { stage: "verify-toolchain-fallback" }),
        commandItem("node server.js --api-smoke-section=fast", "npm/pnpm/yarn 损坏时用 node 直跑 fast smoke，覆盖核心写代码/调试链路。", { stage: "verify-toolchain-fallback" }),
        commandItem("validate.bat --no-pause", "npm/pnpm/yarn 损坏时用无交互 validate.bat 跑完整本地验证链。", { stage: "verify-toolchain-fallback" })
      ]
    : [];
  const commands = dedupeCommandItems([
    commandItem(command, "复现最近一次失败，确认当前问题仍可稳定触发。", { stage: "reproduce" }),
    commandItem(command, "修复后第一时间重跑原失败命令，确认根因已消除。", { stage: "verify-original" }),
    commandItem("node --check server.js", "复查后端入口语法，避免修复引入新的 JavaScript 语法错误。", { stage: "verify-syntax" }),
    commandItem("node --check app.js", "复查前端入口语法，避免修复引入新的 JavaScript 语法错误。", { stage: "verify-syntax" }),
    commandItem("node server.js --api-smoke-section=debug", "运行调试闭环 smoke，验证失败分类、诊断和修复链路仍可用。", { stage: "verify-debug" }),
    ...packageManagerFallbackCommands,
    ...diagnosticCommands.map((item) => commandItem(item.command || item, item.reason || "复用调试诊断推荐的验证命令。", { stage: "diagnose" }))
  ]);
  const runnableCommands = commands
    .filter((item) => evaluateCommandPolicy(item.command).allowed)
    .slice(0, 8);
  const referencedFiles = [
    ...(Array.isArray(failureAnalysis.referencedFiles) ? failureAnalysis.referencedFiles : []),
    ...(Array.isArray(diagnostics?.referencedFiles) ? diagnostics.referencedFiles : [])
  ].filter(Boolean);
  const uniqueFiles = [...new Set(referencedFiles.map((file) => String(file).replaceAll("\\", "/")))].slice(0, 16);
  const sourceLocations = Array.isArray(failureAnalysis.sourceLocations) ? failureAnalysis.sourceLocations.slice(0, 16) : [];
  return {
    status: result.exitCode === 0 ? "not_needed" : "needs_recovery",
    category: failureAnalysis.category || "unknown",
    summary: failureAnalysis.summary || "",
    command: String(command || "").slice(0, 400),
    referencedFiles: uniqueFiles,
    sourceLocations,
    nextActions: [
      "先重跑原命令确认失败仍存在。",
      failureAnalysis.category === "package-manager" ? "若 npm/pnpm/yarn 本身损坏，先用 node 直跑 smoke 或 validate.bat 继续项目验证。" : "",
      uniqueFiles.length ? "引用相关文件并定位最小根因。" : "根据失败输出定位最小根因。",
      "生成最小修复 diff 后先重跑原命令。",
      "最后运行语法检查和调试 smoke。"
    ].filter(Boolean),
    commands: runnableCommands,
    stages: [
      { id: "reproduce", label: "复现", command, status: "pending" },
      { id: "inspect", label: "定位", files: uniqueFiles, sourceLocations, status: uniqueFiles.length || sourceLocations.length ? "ready" : "needs-output" },
      { id: "repair", label: "修复", action: "repair-command", status: "pending" },
      { id: "verify", label: "复查", commands: runnableCommands.filter((item) => /verify/i.test(item.stage || "")), status: "pending" }
    ]
  };
}

function summarizeCheckOutput(output = "") {
  const text = String(output || "").trim();
  if (!text) return "(无输出)";
  return text.split(/\r?\n/).filter(Boolean).slice(0, 2).join(" · ").slice(0, 260);
}

function buildApplyVerificationRecovery({
  finalStatus = "",
  applied = [],
  verification = {},
  checkCommands = [],
  repair = null,
  repairError = "",
  conflicts = [],
  selectedHunks = [],
  checkpoint = null
} = {}) {
  const checks = Array.isArray(verification?.checks) ? verification.checks : [];
  const failedChecks = checks.filter((check) => check?.blocked || Number(check?.exitCode ?? 0) !== 0);
  const verificationCommands = dedupeCommandItems([
    ...checkCommands,
    ...(Array.isArray(repair?.commands) ? repair.commands : []),
    commandItem("node --check server.js", "写入后复查后端入口语法。", { stage: "post-apply-syntax" }),
    commandItem("node --check app.js", "写入后复查前端入口语法。", { stage: "post-apply-syntax" })
  ]).slice(0, 8);
  const nextActions = [];
  if (verification?.skipped) {
    nextActions.push("自动检查被跳过或未发现命令，先运行写入后复查命令。");
  } else if (verification?.ok) {
    nextActions.push("自动检查已通过，可继续交付、提交或处理下一项任务。");
  } else if (repair?.diff) {
    nextActions.push("审查自动生成的修复 diff，批准写入后继续运行复查命令。");
  } else {
    nextActions.push("查看失败命令输出，把写入后验证恢复证据加入提示词后生成最小修复。");
  }
  if (conflicts.length) {
    nextActions.push("处理剩余冲突文件或 hunk，再生成冲突解决草稿或重新应用。");
  }
  if (failedChecks.length) {
    nextActions.push("优先重跑第一条失败检查，确认失败仍稳定复现。");
  }
  return {
    status: finalStatus,
    generatedAt: new Date().toISOString(),
    checkpointId: checkpoint?.id || "",
    changedFiles: applied.map((item) => item.path).filter(Boolean),
    verification: {
      ok: Boolean(verification?.ok),
      skipped: Boolean(verification?.skipped),
      checkCount: checks.length,
      failedCount: failedChecks.length,
      reason: verification?.reason || verification?.summary || ""
    },
    failedCommands: failedChecks.map((check) => ({
      command: String(check.command || "").slice(0, 400),
      exitCode: Number(check.exitCode ?? 1),
      blocked: Boolean(check.blocked),
      outputSummary: summarizeCheckOutput(check.output || ""),
      policy: check.policy || null
    })).slice(0, 8),
    verificationCommands,
    nextActions: nextActions.slice(0, 6),
    repairSuggested: Boolean(repair?.diff),
    repairError: String(repairError || "").slice(0, 1000),
    conflicts: conflicts.slice(0, 8),
    selectedHunks,
    policy: {
      executesExtraCommands: false,
      writesFiles: false,
      derivedFromApplyResult: true
    }
  };
}

async function executeUserCommand(command) {
  const policy = evaluateCommandPolicy(command);
  if (!policy.allowed) {
    const approval = await writeApprovalRequest({
      type: "command",
      command: policy.command,
      policy,
      reason: policy.reason
    });
    return {
      exitCode: 126,
      blocked: true,
      approval,
      policy,
      output: policy.reason
    };
  }
  const result = await executeCommand(command);
  if (result.exitCode !== 0) {
    result.failureAnalysis = classifyCommandFailure(command, result);
    result.diagnostics = await buildDebugDiagnostics({
      commands: [command],
      includeTrace: false,
      runChecks: false,
      limit: 12
    }).catch((error) => ({
      status: "diagnostics_failed",
      summary: { findings: 1, errors: 0, warnings: 1 },
      findings: [{ severity: "warn", area: "debug", message: error.message, evidence: [] }],
      nextActions: [],
      policy: { executesCommands: false, error: true }
    }));
    if (result.diagnostics && typeof result.diagnostics === "object") {
      result.diagnostics.commandFailure = result.failureAnalysis;
      result.diagnostics.findings = [
        ...(result.failureAnalysis.findings || []).map((item) => ({
          severity: item.severity || "warn",
          area: "command",
          message: item.message || "",
          evidence: item.evidence || []
        })),
        ...(result.diagnostics.findings || [])
      ].slice(0, 20);
    }
    result.recoveryChain = buildFailureRecoveryChain(command, result, result.diagnostics);
  }
  return result;
}

function summarizeManagedProcess(entry) {
  return {
    id: entry.id,
    command: entry.command,
    workspace: entry.workspace,
    startedAt: entry.startedAt,
    stoppedAt: entry.stoppedAt || "",
    status: entry.status,
    exitCode: entry.exitCode,
    pid: entry.child?.pid || null,
    policy: entry.policy,
    probe: entry.probe,
    logPath: entry.logPath ? toPosix(path.relative(APP_ROOT, entry.logPath)) : "",
    artifactPath: entry.artifactPath ? toPosix(path.relative(APP_ROOT, entry.artifactPath)) : "",
    outputTail: entry.output.slice(-12000)
  };
}

async function persistManagedProcessArtifact(entry) {
  if (!entry?.artifactPath) return;
  await fs.mkdir(path.dirname(entry.artifactPath), { recursive: true });
  const artifact = {
    id: entry.id,
    workspace: entry.workspace,
    command: entry.command,
    startedAt: entry.startedAt,
    stoppedAt: entry.stoppedAt || "",
    status: entry.status,
    exitCode: entry.exitCode,
    policy: entry.policy,
    probe: entry.probe || null,
    logPath: entry.logPath ? toPosix(path.relative(APP_ROOT, entry.logPath)) : "",
    outputBytes: entry.outputBytes || 0,
    outputTail: String(entry.output || "").slice(-12000),
    updatedAt: new Date().toISOString()
  };
  await fs.writeFile(entry.artifactPath, JSON.stringify(artifact, null, 2), "utf8").catch(() => {});
}

async function readManagedProcessLogArtifacts(limit = 100) {
  await fs.mkdir(PROCESS_LOG_DIR, { recursive: true });
  const entries = await fs.readdir(PROCESS_LOG_DIR, { withFileTypes: true }).catch(() => []);
  const artifacts = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const artifactPath = path.join(PROCESS_LOG_DIR, entry.name);
    const artifact = parseJsonOutput(await fs.readFile(artifactPath, "utf8").catch(() => ""), null);
    if (!artifact || artifact.workspace !== currentWorkspace) continue;
    artifacts.push({
      ...artifact,
      artifactPath,
      absoluteLogPath: artifact.logPath ? path.join(APP_ROOT, artifact.logPath) : ""
    });
  }
  return artifacts
    .sort((a, b) => String(b.updatedAt || b.startedAt || "").localeCompare(String(a.updatedAt || a.startedAt || "")))
    .slice(0, limit);
}

async function listManagedProcessHistory({ limit = 20 } = {}) {
  const max = Math.min(100, Math.max(1, Number(limit) || 20));
  const artifacts = await readManagedProcessLogArtifacts(max);
  const history = [];
  for (const artifact of artifacts) {
    const output = artifact.absoluteLogPath
      ? await fs.readFile(artifact.absoluteLogPath, "utf8").catch(() => artifact.outputTail || "")
      : artifact.outputTail || "";
    history.push({
      id: artifact.id,
      command: artifact.command || "",
      workspace: artifact.workspace || "",
      startedAt: artifact.startedAt || "",
      stoppedAt: artifact.stoppedAt || "",
      updatedAt: artifact.updatedAt || "",
      status: artifact.status || "unknown",
      exitCode: artifact.exitCode,
      policy: artifact.policy || null,
      probe: artifact.probe || null,
      logPath: artifact.logPath || "",
      artifactPath: toPosix(path.relative(APP_ROOT, artifact.artifactPath)),
      outputBytes: artifact.outputBytes || Buffer.byteLength(output, "utf8"),
      outputTail: String(output || artifact.outputTail || "").slice(-12000),
      active: managedProcesses.has(artifact.id)
    });
  }
  return {
    generatedAt: new Date().toISOString(),
    history,
    count: history.length,
    policy: {
      access: "managed-process-output-and-artifacts",
      scope: "currentWorkspace",
      max
    }
  };
}

async function searchManagedProcessLogs(query = "", { limit = 20 } = {}) {
  const needle = String(query || "").trim();
  if (!needle) throw new Error("缺少进程日志搜索关键词。");
  const maxResults = Math.min(100, Math.max(1, Number(limit) || 20));
  const regex = new RegExp(escapeRegExp(needle), "ig");
  const matches = [];
  const workspaceEntries = Array.from(managedProcesses.values()).filter((entry) => entry.workspace === currentWorkspace);
  for (const entry of workspaceEntries) {
    const output = String(entry.output || "");
    let match;
    while ((match = regex.exec(output)) && matches.length < maxResults) {
      const start = Math.max(0, match.index - 160);
      const end = Math.min(output.length, match.index + needle.length + 160);
      matches.push({
        processId: entry.id,
        command: entry.command,
        status: entry.status,
        index: match.index,
        excerpt: output.slice(start, end).replace(/\s+/g, " ").trim(),
        source: "memory",
        logPath: entry.logPath ? toPosix(path.relative(APP_ROOT, entry.logPath)) : ""
      });
    }
    if (matches.length >= maxResults) break;
  }
  if (matches.length < maxResults) {
    const artifacts = await readManagedProcessLogArtifacts(200);
    for (const artifact of artifacts) {
      if (managedProcesses.has(artifact.id)) continue;
      const output = artifact.absoluteLogPath
        ? await fs.readFile(artifact.absoluteLogPath, "utf8").catch(() => artifact.outputTail || "")
        : artifact.outputTail || "";
      regex.lastIndex = 0;
      let match;
      while ((match = regex.exec(output)) && matches.length < maxResults) {
        const start = Math.max(0, match.index - 160);
        const end = Math.min(output.length, match.index + needle.length + 160);
        matches.push({
          processId: artifact.id,
          command: artifact.command || "",
          status: artifact.status || "unknown",
          index: match.index,
          excerpt: output.slice(start, end).replace(/\s+/g, " ").trim(),
          source: "artifact",
          logPath: artifact.logPath || "",
          artifactPath: toPosix(path.relative(APP_ROOT, artifact.artifactPath))
        });
      }
      if (matches.length >= maxResults) break;
    }
  }
  return {
    query: needle,
    matchCount: matches.length,
    matches,
    searchedProcesses: workspaceEntries.length,
    searchedArtifacts: (await readManagedProcessLogArtifacts(200)).length,
    policy: {
      access: "managed-process-output-and-artifacts",
      scope: "currentWorkspace",
      maxResults
    }
  };
}

function inferProcessProbe(entry) {
  const source = `${entry.command}\n${entry.output || ""}`;
  const explicit = /(?:localhost|127\.0\.0\.1):(\d{2,5})/i.exec(source)
    || /\b(?:--port|-p|PORT|port)\s*=?\s*(\d{2,5})\b/i.exec(source);
  if (!explicit) return null;
  const port = Number(explicit[1]);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
  return {
    port,
    url: `http://127.0.0.1:${port}`,
    status: "unknown",
    ok: false,
    statusCode: null,
    lastCheckedAt: "",
    lastError: ""
  };
}

async function probeManagedProcess(entry) {
  if (!entry.probe) entry.probe = inferProcessProbe(entry);
  if (!entry.probe || entry.status !== "running") return entry.probe;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1200);
  try {
    const response = await fetch(entry.probe.url, { signal: controller.signal });
    const bodySample = await response.text()
      .then((text) => String(text || "").slice(0, 4000))
      .catch(() => "");
    entry.probe = {
      ...entry.probe,
      status: response.ok ? "healthy" : "unhealthy",
      ok: response.ok,
      statusCode: response.status,
      statusText: response.statusText || "",
      contentType: response.headers.get("content-type") || "",
      bodySample,
      lastCheckedAt: new Date().toISOString(),
      lastError: ""
    };
  } catch (error) {
    entry.probe = {
      ...entry.probe,
      status: "unreachable",
      ok: false,
      statusCode: null,
      lastCheckedAt: new Date().toISOString(),
      lastError: error instanceof Error ? error.message : String(error)
    };
  } finally {
    clearTimeout(timer);
  }
  return entry.probe;
}

function processHealthStatus(status, probe) {
  if (probe?.status) return probe.status;
  if (status === "running") return "no-probe";
  if (status === "stopping") return "stopping";
  if (status === "exited") return "stopped";
  return status || "unknown";
}

function processHealthRulesPath() {
  return path.join(currentWorkspace, ".forge", "process-health-rules.json");
}

function normalizeHealthRuleTextList(value, aliases = [], limit = 8) {
  const rawValues = [];
  if (Array.isArray(value)) rawValues.push(...value);
  else if (value) rawValues.push(value);
  for (const alias of aliases) {
    if (Array.isArray(alias)) rawValues.push(...alias);
    else if (alias) rawValues.push(alias);
  }
  return rawValues
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .slice(0, limit);
}

function normalizeHealthRuleStatusList(value, aliases = []) {
  const rawValues = [];
  if (Array.isArray(value)) rawValues.push(...value);
  else if (value !== undefined && value !== null) rawValues.push(value);
  for (const alias of aliases) {
    if (Array.isArray(alias)) rawValues.push(...alias);
    else if (alias !== undefined && alias !== null) rawValues.push(alias);
  }
  return rawValues
    .map((item) => Number(item))
    .filter((item) => Number.isInteger(item) && item >= 100 && item <= 599)
    .slice(0, 12);
}

function compileHealthRulePatterns(patterns = []) {
  const compiled = [];
  for (const pattern of patterns || []) {
    const text = String(pattern || "").trim();
    if (!text) continue;
    try {
      compiled.push({ source: text, regex: new RegExp(text, "i") });
    } catch {
      compiled.push({ source: text, regex: null, invalid: true });
    }
    if (compiled.length >= 8) break;
  }
  return compiled;
}

function matchHealthRulePatterns(value = "", patterns = []) {
  const text = String(value || "");
  return (patterns || []).map((pattern) => ({
    source: pattern.source,
    matched: pattern.regex ? pattern.regex.test(text) : false,
    invalid: Boolean(pattern.invalid)
  }));
}

function normalizeProcessHealthRules(rawRules) {
  const source = Array.isArray(rawRules) ? rawRules : Array.isArray(rawRules?.rules) ? rawRules.rules : [];
  return source.slice(0, 40).map((rule, index) => {
    const rawExpectedStatus = rule?.expectedStatus ?? rule?.statusCode ?? rule?.probeStatus ?? rule?.expectedProbeStatus ?? 200;
    const expectedStatus = normalizeHealthRuleStatusList(rawExpectedStatus);
    const expectedOutputIncludes = normalizeHealthRuleTextList(
      rule?.expectedOutputIncludes || rule?.outputIncludes,
      [rule?.expectedBodyIncludes, rule?.bodyIncludes],
      8
    );
    return {
      name: String(rule?.name || `rule-${index + 1}`).trim().slice(0, 80),
      commandIncludes: normalizeHealthRuleTextList(
        rule?.commandIncludes,
        [rule?.command],
        6
      ),
      expectedStatus,
      expectedOutputIncludes,
      expectedBodyIncludes: expectedOutputIncludes[0] || "",
      expectedProbeUrlIncludes: normalizeHealthRuleTextList(
        rule?.expectedProbeUrlIncludes || rule?.probeUrlIncludes,
        [rule?.expectedUrlIncludes, rule?.urlIncludes],
        6
      ),
      expectedProbeBodyIncludes: normalizeHealthRuleTextList(
        rule?.expectedProbeBodyIncludes || rule?.probeBodyIncludes,
        [rule?.responseBodyIncludes, rule?.responseIncludes],
        8
      ),
      expectedOutputMatches: compileHealthRulePatterns(normalizeHealthRuleTextList(
        rule?.expectedOutputMatches || rule?.outputMatches || rule?.expectedOutputRegex || rule?.outputRegex,
        [],
        8
      )),
      expectedProbeBodyMatches: compileHealthRulePatterns(normalizeHealthRuleTextList(
        rule?.expectedProbeBodyMatches || rule?.probeBodyMatches || rule?.responseBodyMatches || rule?.responseRegex,
        [],
        8
      )),
      unexpectedOutputIncludes: normalizeHealthRuleTextList(
        rule?.unexpectedOutputIncludes || rule?.forbiddenOutputIncludes || rule?.outputExcludes,
        [rule?.unexpectedBodyIncludes, rule?.bodyExcludes],
        8
      ),
      unexpectedProbeBodyIncludes: normalizeHealthRuleTextList(
        rule?.unexpectedProbeBodyIncludes || rule?.forbiddenProbeBodyIncludes || rule?.probeBodyExcludes || rule?.responseExcludes,
        [],
        8
      ),
      unexpectedOutputMatches: compileHealthRulePatterns(normalizeHealthRuleTextList(
        rule?.unexpectedOutputMatches || rule?.forbiddenOutputMatches || rule?.outputExcludeRegex,
        [],
        8
      )),
      unexpectedProbeBodyMatches: compileHealthRulePatterns(normalizeHealthRuleTextList(
        rule?.unexpectedProbeBodyMatches || rule?.forbiddenProbeBodyMatches || rule?.probeBodyExcludeRegex || rule?.responseExcludeRegex,
        [],
        8
      )),
      requireProbe: rule?.requireProbe !== false
    };
  }).filter((rule) => rule.name && rule.commandIncludes.length);
}

async function readProcessHealthRules() {
  const filePath = processHealthRulesPath();
  const raw = await readJsonOrNull(filePath);
  const rules = normalizeProcessHealthRules(raw);
  return {
    path: toPosix(path.relative(currentWorkspace, filePath)),
    count: rules.length,
    rules
  };
}

function commandMatchesHealthRule(command = "", rule) {
  const lower = String(command || "").toLowerCase();
  return rule.commandIncludes.every((needle) => lower.includes(String(needle).toLowerCase()));
}

function evaluateProcessHealthRules(row, rules = []) {
  const matched = rules.filter((rule) => commandMatchesHealthRule(row.command, rule));
  const results = matched.map((rule) => {
    const failures = [];
    const probe = row.probe || null;
    const outputTail = String(row.outputTail || "");
    const probeBody = String(probe?.bodySample || probe?.body || probe?.textSample || "");
    const probeUrl = String(probe?.url || "");
    if (rule.requireProbe && !probe) failures.push("missing-probe");
    if (probe && rule.expectedStatus.length && !rule.expectedStatus.includes(Number(probe.statusCode))) {
      failures.push(`probe-status-${probe.statusCode || "missing"}`);
    }
    const missingOutput = (rule.expectedOutputIncludes || []).filter((needle) => !outputTail.includes(needle));
    if (missingOutput.length) {
      failures.push(`missing-output-evidence:${missingOutput.map((item) => item.slice(0, 40)).join("|")}`);
    }
    const outputPatternMatches = matchHealthRulePatterns(outputTail, rule.expectedOutputMatches);
    const missingOutputPatterns = outputPatternMatches.filter((item) => item.invalid || !item.matched);
    if (missingOutputPatterns.length) {
      failures.push(`missing-output-pattern:${missingOutputPatterns.map((item) => item.source.slice(0, 40)).join("|")}`);
    }
    const unexpectedOutput = (rule.unexpectedOutputIncludes || []).filter((needle) => outputTail.includes(needle));
    if (unexpectedOutput.length) {
      failures.push(`unexpected-output-evidence:${unexpectedOutput.map((item) => item.slice(0, 40)).join("|")}`);
    }
    const unexpectedOutputPatterns = matchHealthRulePatterns(outputTail, rule.unexpectedOutputMatches).filter((item) => item.matched || item.invalid);
    if (unexpectedOutputPatterns.length) {
      failures.push(`unexpected-output-pattern:${unexpectedOutputPatterns.map((item) => item.source.slice(0, 40)).join("|")}`);
    }
    const missingProbeUrl = (rule.expectedProbeUrlIncludes || []).filter((needle) => !probeUrl.includes(needle));
    if (missingProbeUrl.length) {
      failures.push(`missing-probe-url:${missingProbeUrl.map((item) => item.slice(0, 40)).join("|")}`);
    }
    const missingProbeBody = (rule.expectedProbeBodyIncludes || []).filter((needle) => !probeBody.includes(needle));
    if (missingProbeBody.length) {
      failures.push(probe ? `missing-probe-body:${missingProbeBody.map((item) => item.slice(0, 40)).join("|")}` : "missing-probe-body:missing-probe");
    }
    const probeBodyPatternMatches = matchHealthRulePatterns(probeBody, rule.expectedProbeBodyMatches);
    const missingProbeBodyPatterns = probeBodyPatternMatches.filter((item) => item.invalid || !item.matched);
    if (missingProbeBodyPatterns.length) {
      failures.push(probe ? `missing-probe-body-pattern:${missingProbeBodyPatterns.map((item) => item.source.slice(0, 40)).join("|")}` : "missing-probe-body-pattern:missing-probe");
    }
    const unexpectedProbeBody = (rule.unexpectedProbeBodyIncludes || []).filter((needle) => probeBody.includes(needle));
    if (unexpectedProbeBody.length) {
      failures.push(probe ? `unexpected-probe-body:${unexpectedProbeBody.map((item) => item.slice(0, 40)).join("|")}` : "unexpected-probe-body:missing-probe");
    }
    const unexpectedProbeBodyPatterns = matchHealthRulePatterns(probeBody, rule.unexpectedProbeBodyMatches).filter((item) => item.matched || item.invalid);
    if (unexpectedProbeBodyPatterns.length) {
      failures.push(probe ? `unexpected-probe-body-pattern:${unexpectedProbeBodyPatterns.map((item) => item.source.slice(0, 40)).join("|")}` : "unexpected-probe-body-pattern:missing-probe");
    }
    return {
      name: rule.name,
      matched: true,
      ok: failures.length === 0,
      failures,
      observed: {
        statusCode: probe?.statusCode ?? null,
        probeUrl,
        hasProbeBody: Boolean(probeBody),
        outputBytes: row.outputBytes || 0
      },
      expectedStatus: rule.expectedStatus,
      expectedBodyIncludes: rule.expectedBodyIncludes,
      expectedOutputIncludes: rule.expectedOutputIncludes,
      expectedOutputMatches: (rule.expectedOutputMatches || []).map((item) => item.source),
      expectedProbeUrlIncludes: rule.expectedProbeUrlIncludes,
      expectedProbeBodyIncludes: rule.expectedProbeBodyIncludes,
      expectedProbeBodyMatches: (rule.expectedProbeBodyMatches || []).map((item) => item.source),
      unexpectedOutputIncludes: rule.unexpectedOutputIncludes,
      unexpectedOutputMatches: (rule.unexpectedOutputMatches || []).map((item) => item.source),
      unexpectedProbeBodyIncludes: rule.unexpectedProbeBodyIncludes,
      unexpectedProbeBodyMatches: (rule.unexpectedProbeBodyMatches || []).map((item) => item.source),
      requireProbe: rule.requireProbe
    };
  });
  return {
    matched: results.length,
    passed: results.filter((item) => item.ok).length,
    failed: results.filter((item) => !item.ok).length,
    status: results.length === 0 ? "no-rule" : results.every((item) => item.ok) ? "pass" : "fail",
    results
  };
}

function summarizeProcessHealthRows(rows) {
  return {
    total: rows.length,
    active: rows.filter((row) => row.active).length,
    healthy: rows.filter((row) => row.health === "healthy").length,
    unhealthy: rows.filter((row) => ["unhealthy", "unreachable"].includes(row.health)).length,
    noProbe: rows.filter((row) => row.health === "no-probe").length,
    stopped: rows.filter((row) => row.health === "stopped").length,
    ruleMatched: rows.filter((row) => row.rules?.matched).length,
    ruleFailed: rows.filter((row) => row.rules?.failed).length
  };
}

async function buildManagedProcessHealth({ id = "", limit = 50 } = {}) {
  const processId = String(id || "").trim();
  if (processId && !/^[\w.-]+$/.test(processId)) throw new Error("process id 非法。");
  const maxResults = Math.min(100, Math.max(1, Number(limit) || 50));
  const ruleSet = await readProcessHealthRules();
  const activeEntries = Array.from(managedProcesses.values())
    .filter((entry) => entry.workspace === currentWorkspace)
    .filter((entry) => !processId || entry.id === processId);
  await Promise.all(activeEntries.map(async (entry) => {
    await probeManagedProcess(entry).catch(() => null);
    await persistManagedProcessArtifact(entry).catch(() => {});
  }));
  const activeRows = activeEntries.map((entry) => {
    const summary = summarizeManagedProcess(entry);
    return {
      id: summary.id,
      command: summary.command,
      active: true,
      status: summary.status,
      health: processHealthStatus(summary.status, summary.probe),
      ok: summary.probe ? Boolean(summary.probe.ok) : summary.status !== "running",
      pid: summary.pid,
      startedAt: summary.startedAt,
      stoppedAt: summary.stoppedAt,
      probe: summary.probe || null,
      logPath: summary.logPath,
      artifactPath: summary.artifactPath,
      outputBytes: entry.outputBytes || Buffer.byteLength(entry.output || "", "utf8"),
      outputTail: summary.outputTail
    };
  });
  const activeIds = new Set(activeRows.map((row) => row.id));
  const artifacts = await readManagedProcessLogArtifacts(200);
  const artifactRows = artifacts
    .filter((artifact) => artifact.workspace === currentWorkspace)
    .filter((artifact) => !activeIds.has(artifact.id))
    .filter((artifact) => !processId || artifact.id === processId)
    .map((artifact) => ({
      id: artifact.id,
      command: artifact.command,
      active: false,
      status: artifact.status,
      health: processHealthStatus(artifact.status, artifact.probe),
      ok: artifact.probe ? Boolean(artifact.probe.ok) : artifact.status !== "running",
      pid: null,
      startedAt: artifact.startedAt,
      stoppedAt: artifact.stoppedAt || "",
      probe: artifact.probe || null,
      logPath: artifact.logPath || "",
      artifactPath: artifact.relativePath || artifact.path || "",
      outputBytes: artifact.outputBytes || 0,
      outputTail: String(artifact.outputTail || "").slice(-12000)
    }));
  const rows = [...activeRows, ...artifactRows]
    .sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)))
    .slice(0, maxResults)
    .map((row) => ({
      ...row,
      rules: evaluateProcessHealthRules(row, ruleSet.rules)
    }));
  return {
    generatedAt: new Date().toISOString(),
    workspace: currentWorkspace,
    id: processId,
    rows,
    count: rows.length,
    summary: summarizeProcessHealthRows(rows),
    rules: {
      path: ruleSet.path,
      count: ruleSet.count,
      configured: ruleSet.count > 0
    },
    policy: {
      access: "managed-process-health-and-artifacts",
      scope: "currentWorkspace",
      executesCommands: false,
      startsProcesses: false,
      stopsProcesses: false,
      performsLocalHttpProbe: true,
      readsHealthRules: true,
      maxResults
    }
  };
}

function selectDebugTargetProcess(rows = []) {
  const candidates = Array.isArray(rows) ? rows : [];
  return candidates.find((row) => row.active && row.probe?.url && row.probe?.ok)
    || candidates.find((row) => row.active && row.probe?.url)
    || candidates.find((row) => row.active)
    || candidates.find((row) => row.probe?.url)
    || candidates[0]
    || null;
}

function buildDebugTargetSummary({ runtimeUrl, processHealth, diagnostics, selectedProcess, targetUrl }) {
  const findings = diagnostics?.findings || [];
  const browserTriage = diagnostics?.browserTriage || null;
  const processSummary = processHealth?.summary || {};
  const errors = findings.filter((item) => item.severity === "error").length;
  const warnings = findings.filter((item) => item.severity === "warn").length;
  return {
    status: errors ? "failing" : warnings || processSummary.unhealthy || processSummary.ruleFailed ? "needs_attention" : "ready",
    targetUrl: targetUrl || "",
    source: selectedProcess?.probe?.url ? "managed-process-probe" : runtimeUrl?.browserCheckUrl ? "runtime-url" : "none",
    processId: selectedProcess?.id || "",
    command: selectedProcess?.command || "",
    processHealth: selectedProcess?.health || "",
    browserTriageStatus: browserTriage?.status || "not_captured",
    findings: findings.length,
    errors,
    warnings,
    safeCommands: diagnostics?.verificationPlan?.commands?.length || 0
  };
}

async function buildDebugTarget({ url = "", commands = [], includeTrace = false, runChecks = false, waitMs = 1500, limit = 20 } = {}) {
  const max = Math.min(60, Math.max(1, Number(limit) || 20));
  const [runtimeUrl, processHealth] = await Promise.all([
    readRuntimeUrlState(),
    buildManagedProcessHealth({ limit: max })
  ]);
  const selectedProcess = selectDebugTargetProcess(processHealth.rows || []);
  const targetUrl = String(url || selectedProcess?.probe?.url || runtimeUrl?.browserCheckUrl || runtimeUrl?.url || "").trim();
  const diagnostics = await buildDebugDiagnostics({
    url: targetUrl,
    commands: Array.isArray(commands) ? commands : [],
    includeTrace: Boolean(includeTrace && targetUrl),
    runChecks: Boolean(runChecks),
    waitMs,
    limit: max
  });
  const summary = buildDebugTargetSummary({ runtimeUrl, processHealth, diagnostics, selectedProcess, targetUrl });
  return {
    generatedAt: new Date().toISOString(),
    workspace: currentWorkspace,
    summary,
    target: {
      url: targetUrl,
      runtimeUrl,
      process: selectedProcess ? {
        id: selectedProcess.id,
        command: selectedProcess.command,
        status: selectedProcess.status,
        health: selectedProcess.health,
        active: Boolean(selectedProcess.active),
        probe: selectedProcess.probe || null,
        logPath: selectedProcess.logPath || "",
        artifactPath: selectedProcess.artifactPath || ""
      } : null
    },
    diagnostics,
    verificationCommands: (diagnostics.verificationPlan?.commands || []).slice(0, 8),
    nextActions: (diagnostics.nextActions || []).slice(0, 8),
    policy: {
      access: "local-debug-target-read-mostly",
      scope: "currentWorkspace",
      executesCommands: Boolean(runChecks),
      capturesBrowserTrace: Boolean(includeTrace && targetUrl),
      startsProcesses: false,
      writesFiles: false,
      writesRemote: false
    }
  };
}

function waitForProcessExit(entry, timeoutMs = 5000) {
  if (!entry.child || entry.status === "exited" || entry.status === "error") return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, timeoutMs);
    entry.child.once("close", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

function normalizeLocalBrowserTarget(rawUrl = "") {
  const value = String(rawUrl || "").trim();
  if (!value) throw new Error("缺少 url。");
  const target = new URL(value);
  if (!["http:", "https:"].includes(target.protocol)) {
    throw new Error("只允许检查 http/https URL。");
  }
  const hostname = target.hostname.toLowerCase();
  const localHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]", "0.0.0.0"]);
  if (!localHosts.has(hostname)) {
    throw new Error("浏览器检查仅允许本机 URL。");
  }
  if (hostname === "0.0.0.0") target.hostname = "127.0.0.1";
  return target.toString();
}

function extractHtmlEvidence(html = "") {
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]
    ?.replace(/\s+/g, " ")
    .trim() || "";
  const headings = [...html.matchAll(/<h([1-3])[^>]*>([\s\S]*?)<\/h\1>/gi)]
    .slice(0, 12)
    .map((match) => ({
      level: Number(match[1]),
      text: match[2].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim()
    }))
    .filter((item) => item.text);
  const scripts = (html.match(/<script\b/gi) || []).length;
  const stylesheets = (html.match(/<link\b[^>]*rel=["']?stylesheet/gi) || []).length;
  return {
    title,
    headings,
    counts: {
      scripts,
      stylesheets,
      buttons: (html.match(/<button\b/gi) || []).length,
      forms: (html.match(/<form\b/gi) || []).length,
      inputs: (html.match(/<input\b/gi) || []).length,
      images: (html.match(/<img\b/gi) || []).length
    }
  };
}

function stripHtmlText(value = "") {
  return String(value || "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

function extractAttribute(tag = "", name = "") {
  const match = new RegExp(`\\b${escapeRegExp(name)}\\s*=\\s*["']([^"']*)["']`, "i").exec(tag);
  return match?.[1] || "";
}

function auditHtmlAccessibility(html = "") {
  const text = String(html || "");
  const title = extractHtmlEvidence(text).title;
  const htmlTag = /<html\b[^>]*>/i.exec(text)?.[0] || "";
  const lang = extractAttribute(htmlTag, "lang");
  const headingMatches = [...text.matchAll(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi)]
    .map((match) => ({ level: Number(match[1]), text: stripHtmlText(match[2]) }))
    .filter((item) => item.text);
  const imgMatches = [...text.matchAll(/<img\b[^>]*>/gi)].map((match) => match[0]);
  const inputMatches = [...text.matchAll(/<input\b[^>]*>/gi)].map((match) => match[0]);
  const buttonMatches = [...text.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/gi)]
    .map((match) => ({ tag: match[0], text: stripHtmlText(match[1]) }));
  const labelFors = new Set([...text.matchAll(/<label\b[^>]*\bfor\s*=\s*["']([^"']+)["'][^>]*>/gi)].map((match) => match[1]));
  const issues = [];
  const add = (severity, id, message, evidence = {}) => issues.push({ severity, id, message, evidence });
  if (!title) add("warning", "missing-title", "页面缺少可读 title。");
  if (!lang) add("warning", "missing-html-lang", "html 标签缺少 lang 属性。");
  if (!headingMatches.some((item) => item.level === 1)) add("warning", "missing-h1", "页面缺少 H1。");
  const levels = headingMatches.map((item) => item.level);
  for (let index = 1; index < levels.length; index += 1) {
    if (levels[index] - levels[index - 1] > 1) {
      add("info", "heading-level-skip", "标题层级存在跳级。", { previous: levels[index - 1], current: levels[index] });
      break;
    }
  }
  for (const tag of imgMatches) {
    if (!/\balt\s*=/.test(tag)) add("warning", "image-missing-alt", "图片缺少 alt 属性。", { tag: tag.slice(0, 160) });
  }
  for (const tag of inputMatches) {
    const type = (extractAttribute(tag, "type") || "text").toLowerCase();
    if (["hidden", "submit", "button", "file", "checkbox", "radio"].includes(type)) continue;
    const id = extractAttribute(tag, "id");
    const hasName = Boolean(extractAttribute(tag, "aria-label") || extractAttribute(tag, "aria-labelledby") || extractAttribute(tag, "title") || extractAttribute(tag, "placeholder") || (id && labelFors.has(id)));
    if (!hasName) add("warning", "input-missing-name", "输入框缺少 label 或可访问名称。", { id, type });
  }
  for (const button of buttonMatches) {
    const hasName = Boolean(button.text || extractAttribute(button.tag, "aria-label") || extractAttribute(button.tag, "title"));
    if (!hasName) add("warning", "button-missing-name", "按钮缺少可访问名称。", { tag: button.tag.slice(0, 160) });
  }
  return {
    title,
    lang,
    headings: headingMatches.slice(0, 40),
    counts: {
      headings: headingMatches.length,
      images: imgMatches.length,
      inputs: inputMatches.length,
      buttons: buttonMatches.length,
      labels: labelFors.size,
      issues: issues.length
    },
    issues,
    status: issues.some((item) => item.severity === "error") ? "fail" : issues.length ? "review" : "pass"
  };
}

async function auditBrowserTarget(rawUrl) {
  const checked = await checkBrowserTarget(rawUrl);
  const url = normalizeLocalBrowserTarget(rawUrl);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  let auditSource = "";
  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: { "User-Agent": "Forge-Code-Browser-Audit/1.0" }
    });
    const contentType = response.headers.get("content-type") || "";
    auditSource = contentType.includes("text/html") ? await response.text() : "";
  } finally {
    clearTimeout(timer);
  }
  return {
    ok: checked.ok,
    url: checked.url,
    finalUrl: checked.finalUrl,
    status: checked.status,
    title: checked.title,
    audit: auditHtmlAccessibility(auditSource),
    policy: {
      access: "local-url-only",
      scope: "localhost",
      executesCommands: false,
      writesFiles: false,
      browserAutomation: false,
      staticHtmlAudit: true
    }
  };
}

async function checkBrowserTarget(rawUrl) {
  const url = normalizeLocalBrowserTarget(rawUrl);
  const startedAt = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: { "User-Agent": "Forge-Code-Browser-Check/1.0" }
    });
    const contentType = response.headers.get("content-type") || "";
    const text = await response.text();
    const html = contentType.includes("text/html") ? extractHtmlEvidence(text.slice(0, 500000)) : extractHtmlEvidence("");
    return {
      ok: response.ok,
      url,
      finalUrl: response.url,
      status: response.status,
      statusText: response.statusText,
      contentType,
      bytes: Buffer.byteLength(text),
      elapsedMs: Date.now() - startedAt,
      checkedAt: new Date().toISOString(),
      title: html.title,
      headings: html.headings,
      counts: html.counts,
      policy: {
        access: "local-url-only",
        scope: "localhost",
        screenshots: false,
        domInteraction: false
      }
    };
  } finally {
    clearTimeout(timer);
  }
}

function browserBaselineId(url) {
  return Buffer.from(url).toString("base64url").slice(0, 80);
}

function hashBuffer(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function buildBrowserFingerprint(check) {
  return {
    title: check.title || "",
    status: check.status || 0,
    contentType: check.contentType || "",
    headings: (check.headings || []).map((item) => `${item.level}:${item.text}`),
    counts: check.counts || {}
  };
}

function compareBrowserFingerprints(previous, current) {
  const diffs = [];
  if ((previous.title || "") !== (current.title || "")) {
    diffs.push({ field: "title", before: previous.title || "", after: current.title || "" });
  }
  if ((previous.status || 0) !== (current.status || 0)) {
    diffs.push({ field: "status", before: previous.status || 0, after: current.status || 0 });
  }
  const previousHeadings = JSON.stringify(previous.headings || []);
  const currentHeadings = JSON.stringify(current.headings || []);
  if (previousHeadings !== currentHeadings) {
    diffs.push({ field: "headings", before: previous.headings || [], after: current.headings || [] });
  }
  const keys = new Set([...Object.keys(previous.counts || {}), ...Object.keys(current.counts || {})]);
  for (const key of [...keys].sort()) {
    const before = previous.counts?.[key] || 0;
    const after = current.counts?.[key] || 0;
    if (before !== after) diffs.push({ field: `counts.${key}`, before, after });
  }
  return diffs;
}

async function compareBrowserBaseline(rawUrl, { update = false, name = "" } = {}) {
  const check = await checkBrowserTarget(rawUrl);
  const fingerprint = buildBrowserFingerprint(check);
  const id = browserBaselineId(check.url);
  const baselinePath = path.join(BROWSER_BASELINE_DIR, `${id}.json`);
  const previous = JSON.parse(await fs.readFile(baselinePath, "utf8").catch(() => "null"));
  const diffs = previous?.fingerprint ? compareBrowserFingerprints(previous.fingerprint, fingerprint) : [];
  const result = {
    ok: check.ok && (!previous || diffs.length === 0 || update),
    status: previous ? (diffs.length ? "changed" : "matched") : "created",
    id,
    name: name || previous?.name || check.title || check.url,
    url: check.url,
    checkedAt: check.checkedAt,
    baselinePath: toPosix(path.relative(APP_ROOT, baselinePath)),
    hasBaseline: Boolean(previous),
    updated: Boolean(update || !previous),
    diffs,
    previous: previous?.fingerprint || null,
    current: fingerprint,
    check,
    policy: {
      access: "local-url-only",
      scope: "localhost",
      screenshots: false,
      domInteraction: false,
      baseline: true
    }
  };
  if (update || !previous) {
    await fs.mkdir(BROWSER_BASELINE_DIR, { recursive: true });
    await fs.writeFile(baselinePath, JSON.stringify({
      id,
      name: result.name,
      url: check.url,
      createdAt: previous?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      fingerprint
    }, null, 2), "utf8");
  }
  return result;
}

async function listBrowserExecutables() {
  const candidates = [
    process.env.FORGE_BROWSER_PATH,
    process.platform === "win32" ? path.join(process.env.ProgramFiles || "", "Google", "Chrome", "Application", "chrome.exe") : "",
    process.platform === "win32" ? path.join(process.env["ProgramFiles(x86)"] || "", "Google", "Chrome", "Application", "chrome.exe") : "",
    process.platform === "win32" ? path.join(process.env.ProgramFiles || "", "Microsoft", "Edge", "Application", "msedge.exe") : "",
    process.platform === "win32" ? path.join(process.env["ProgramFiles(x86)"] || "", "Microsoft", "Edge", "Application", "msedge.exe") : "",
    process.platform === "darwin" ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" : "",
    process.platform === "darwin" ? "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge" : "",
    process.platform !== "win32" && process.platform !== "darwin" ? "/usr/bin/google-chrome" : "",
    process.platform !== "win32" && process.platform !== "darwin" ? "/usr/bin/chromium-browser" : "",
    process.platform !== "win32" && process.platform !== "darwin" ? "/usr/bin/chromium" : ""
  ].filter(Boolean);
  const found = [];
  for (const candidate of candidates) {
    if (found.includes(candidate)) continue;
    if (await fs.stat(candidate).then((stat) => stat.isFile()).catch(() => false)) found.push(candidate);
  }
  return found;
}

async function findBrowserExecutable() {
  return (await listBrowserExecutables())[0] || "";
}

function runBrowserCapture(browserPath, args, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const child = spawn(browserPath, args, { windowsHide: true });
    let output = "";
    let settled = false;
    const finish = (error, value = "") => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(value);
    };
    const timer = setTimeout(async () => {
      await killBrowserProcess(child);
      finish(new Error("浏览器截图超时。"));
    }, timeoutMs);
    child.stdout?.on("data", (chunk) => { output = `${output}${chunk.toString("utf8")}`.slice(-12000); });
    child.stderr?.on("data", (chunk) => { output = `${output}${chunk.toString("utf8")}`.slice(-12000); });
    child.on("error", (error) => finish(error));
    child.on("close", (code) => {
      if (code === 0) {
        finish(null, output);
      } else {
        finish(new Error(`浏览器截图失败，exitCode=${code}\n${output}`));
      }
    });
  });
}

function runBrowserOutput(browserPath, args, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const child = spawn(browserPath, args, { windowsHide: true });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (error, value = null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(value);
    };
    const timer = setTimeout(async () => {
      await killBrowserProcess(child);
      finish(new Error("浏览器 DOM 快照超时。"));
    }, timeoutMs);
    child.stdout?.on("data", (chunk) => { stdout = `${stdout}${chunk.toString("utf8")}`.slice(-800000); });
    child.stderr?.on("data", (chunk) => { stderr = `${stderr}${chunk.toString("utf8")}`.slice(-12000); });
    child.on("error", (error) => finish(error));
    child.on("close", (code) => {
      if (code === 0) {
        finish(null, { stdout, stderr });
      } else {
        finish(new Error(`浏览器 DOM 快照失败，exitCode=${code}\n${stderr || stdout.slice(0, 12000)}`));
      }
    });
  });
}

async function killBrowserProcess(child) {
  if (!child?.pid) return;
  if (process.platform === "win32") {
    await new Promise((resolve) => {
      const killer = exec(`taskkill /PID ${child.pid} /T /F`, { windowsHide: true }, () => resolve());
      const timer = setTimeout(() => {
        killer.kill();
        resolve();
      }, 3000);
      killer.on("close", () => clearTimeout(timer));
    });
    return;
  }
  try {
    process.kill(-child.pid, "SIGKILL");
  } catch {
    child.kill("SIGKILL");
  }
}

async function fetchBrowserDomFallback(rawUrl, { actions = [], selectors = [], browserError = "", domInteraction = false } = {}) {
  const url = normalizeLocalBrowserTarget(rawUrl);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: { "User-Agent": "Forge-Code-DOM-Fallback/1.0" }
    });
    const contentType = response.headers.get("content-type") || "";
    let dom = contentType.includes("text/html") ? await response.text() : "";
    const audit = actions.map((action) => ({
      type: action.type,
      selector: action.selector,
      value: ["type", "select", "waittext", "waitvalue", "navigate", "waiturl", "upload"].includes(action.type) ? action.value : "",
      key: ["press", "keydown", "keyup"].includes(action.type) ? action.key : "",
      x: ["mousemove", "mousedown", "mouseup", "mouseclick", "drag", "wheel"].includes(action.type) ? action.x : null,
      y: ["mousemove", "mousedown", "mouseup", "mouseclick", "drag", "wheel"].includes(action.type) ? action.y : null,
      toX: action.type === "drag" ? action.toX : null,
      toY: action.type === "drag" ? action.toY : null,
      deltaX: ["wheel", "scroll"].includes(action.type) ? action.deltaX : null,
      deltaY: ["wheel", "scroll"].includes(action.type) ? action.deltaY : null,
      ok: true,
      elapsedMs: 0,
      fallback: true
    }));
    for (const action of actions) {
      if ((action.type === "type" || action.type === "select") && action.selector.startsWith("#") && action.value) {
        const id = escapeRegExp(action.selector.slice(1));
        const inputPattern = new RegExp(`(<(?:input|textarea)\\b[^>]*\\bid\\s*=\\s*["']${id}["'][^>]*)(>)`, "i");
        if (inputPattern.test(dom)) {
          dom = dom.replace(inputPattern, (match, start, end) => {
            const withoutValue = start.replace(/\svalue\s*=\s*["'][^"']*["']/i, "");
            return `${withoutValue} value="${String(action.value).replace(/"/g, "&quot;")}"${end}`;
          });
        } else {
          dom += `<input id="${action.selector.slice(1)}" value="${String(action.value).replace(/"/g, "&quot;")}">`;
        }
      }
      if (action.type === "check" && action.selector.startsWith("#")) {
        const id = escapeRegExp(action.selector.slice(1));
        const inputPattern = new RegExp(`(<input\\b[^>]*\\bid\\s*=\\s*["']${id}["'][^>]*)(>)`, "i");
        dom = inputPattern.test(dom)
          ? dom.replace(inputPattern, (match, start, end) => `${start.replace(/\schecked(?:\s*=\s*["'][^"']*["'])?/i, "")} checked${end}`)
          : `${dom}<input id="${action.selector.slice(1)}" type="checkbox" checked>`;
      }
      if (action.type === "uncheck" && action.selector.startsWith("#")) {
        const id = escapeRegExp(action.selector.slice(1));
        const inputPattern = new RegExp(`(<input\\b[^>]*\\bid\\s*=\\s*["']${id}["'][^>]*)(>)`, "i");
        dom = inputPattern.test(dom)
          ? dom.replace(inputPattern, (match, start, end) => `${start.replace(/\schecked(?:\s*=\s*["'][^"']*["'])?/i, "")}${end}`)
          : dom;
      }
      if (action.type === "upload" && action.selector.startsWith("#")) {
        const id = escapeRegExp(action.selector.slice(1));
        const uploadValue = String(action.value).replace(/"/g, "&quot;");
        const inputPattern = new RegExp(`(<input\\b[^>]*\\bid\\s*=\\s*["']${id}["'][^>]*)(>)`, "i");
        dom = inputPattern.test(dom)
          ? dom.replace(inputPattern, (match, start, end) => {
            const withoutUpload = start.replace(/\sdata-forge-upload\s*=\s*["'][^"']*["']/i, "");
            return `${withoutUpload} data-forge-upload="${uploadValue}"${end}`;
          })
          : `${dom}<input id="${action.selector.slice(1)}" type="file" data-forge-upload="${uploadValue}">`;
      }
      if (["mousemove", "mousedown", "mouseup", "mouseclick", "drag"].includes(action.type)) {
        const pointerValue = action.type === "drag"
          ? `${action.type}:${action.x},${action.y}->${action.toX},${action.toY}`
          : `${action.type}:${action.x},${action.y}`;
        const safePointer = pointerValue.replace(/"/g, "&quot;");
        const htmlPattern = /(<html\b[^>]*)(>)/i;
        dom = htmlPattern.test(dom)
          ? dom.replace(htmlPattern, (match, start, end) => {
            const withoutPointer = start.replace(/\sdata-forge-pointer\s*=\s*["'][^"']*["']/i, "");
            return `${withoutPointer} data-forge-pointer="${safePointer}"${end}`;
          })
          : `<html data-forge-pointer="${safePointer}">${dom}</html>`;
      }
      if (action.type === "wheel") {
        const wheelValue = `${action.deltaX},${action.deltaY}@${action.x},${action.y}`.replace(/"/g, "&quot;");
        const htmlPattern = /(<html\b[^>]*)(>)/i;
        dom = htmlPattern.test(dom)
          ? dom.replace(htmlPattern, (match, start, end) => {
            const withoutWheel = start.replace(/\sdata-forge-wheel\s*=\s*["'][^"']*["']/i, "");
            return `${withoutWheel} data-forge-wheel="${wheelValue}"${end}`;
          })
          : `<html data-forge-wheel="${wheelValue}">${dom}</html>`;
      }
      if (action.type === "scroll") {
        const scrollValue = `${action.deltaX},${action.deltaY}`.replace(/"/g, "&quot;");
        const htmlPattern = /(<html\b[^>]*)(>)/i;
        dom = htmlPattern.test(dom)
          ? dom.replace(htmlPattern, (match, start, end) => {
            const withoutScroll = start.replace(/\sdata-forge-scroll\s*=\s*["'][^"']*["']/i, "");
            return `${withoutScroll} data-forge-scroll="${scrollValue}"${end}`;
          })
          : `<html data-forge-scroll="${scrollValue}">${dom}</html>`;
      }
    }
    const evidence = extractHtmlEvidence(dom.slice(0, 500000));
    const selectorResults = (Array.isArray(selectors) ? selectors : [])
      .slice(0, 30)
      .map((selector) => countSimpleSelector(dom, selector));
    return {
      ok: response.ok,
      id: `${new Date().toISOString().replace(/[:.]/g, "-")}-${browserBaselineId(url).slice(0, 24)}-dom-fallback`,
      url,
      finalUrl: response.url,
      browserPath: "fetch-fallback",
      actions: audit,
      bytes: Buffer.byteLength(dom),
      capturedAt: new Date().toISOString(),
      title: evidence.title,
      headings: evidence.headings,
      counts: evidence.counts,
      selectors: selectorResults,
      domPreview: dom.slice(0, 12000),
      fallback: true,
      browserError,
      policy: {
        access: "local-url-only",
        scope: "localhost",
        screenshots: false,
        domSnapshot: true,
        domInteraction,
        browserFallback: true,
        allowedActions: domInteraction ? ["wait", "click", "dblClick", "hover", "clear", "type", "press", "keyDown", "keyUp", "select", "check", "uncheck", "waitText", "waitValue", "navigate", "waitUrl", "waitNetwork", "upload", "mouseMove", "mouseDown", "mouseUp", "mouseClick", "drag", "wheel", "scroll"] : undefined
      }
    };
  } finally {
    clearTimeout(timer);
  }
}

function runBrowserSession(browserPath, args, timeoutMs = 35000) {
  return new Promise((resolve, reject) => {
    const child = spawn(browserPath, args, { detached: process.platform !== "win32", windowsHide: true });
    let output = "";
    let settled = false;
    const done = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve({ child, output });
    };
    const timer = setTimeout(async () => {
      await killBrowserProcess(child);
      done(new Error("浏览器交互会话启动超时。"));
    }, timeoutMs);
    child.stdout?.on("data", (chunk) => { output = `${output}${chunk.toString("utf8")}`.slice(-12000); });
    child.stderr?.on("data", (chunk) => { output = `${output}${chunk.toString("utf8")}`.slice(-12000); });
    child.on("error", done);
    child.on("close", (code) => {
      if (!settled && code !== null) done(new Error(`浏览器交互会话提前退出，exitCode=${code}\n${output}`));
    });
    setTimeout(() => done(), 500);
  });
}

function escapeRegExp(value = "") {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function countSimpleSelector(html, selector) {
  const text = String(selector || "").trim();
  if (!text) return { selector: text, count: 0, supported: false };
  if (/^#[\w:-]+$/.test(text)) {
    const id = escapeRegExp(text.slice(1));
    const pattern = new RegExp(`\\bid\\s*=\\s*["']${id}["']`, "gi");
    return { selector: text, count: (html.match(pattern) || []).length, supported: true };
  }
  if (/^\.[\w:-]+$/.test(text)) {
    const className = escapeRegExp(text.slice(1));
    const pattern = new RegExp(`\\bclass\\s*=\\s*["'][^"']*(?:\\s|^)${className}(?:\\s|$)[^"']*["']`, "gi");
    return { selector: text, count: (html.match(pattern) || []).length, supported: true };
  }
  if (/^[a-z][\w:-]*$/i.test(text)) {
    const pattern = new RegExp(`<${escapeRegExp(text)}(?:\\s|>|/)`, "gi");
    return { selector: text, count: (html.match(pattern) || []).length, supported: true };
  }
  const attr = /^\[([\w:-]+)(?:=["']?([^"'\]]+)["']?)?\]$/.exec(text);
  if (attr) {
    const name = escapeRegExp(attr[1]);
    const value = attr[2] ? escapeRegExp(attr[2]) : "";
    const pattern = value
      ? new RegExp(`\\b${name}\\s*=\\s*["']${value}["']`, "gi")
      : new RegExp(`\\b${name}(?:\\s*=|\\s|>|/)`, "gi");
    return { selector: text, count: (html.match(pattern) || []).length, supported: true };
  }
  return { selector: text, count: 0, supported: false, reason: "仅支持 #id、.class、tag 和简单 [attr=value] 选择器。" };
}

async function waitForDevtoolsEndpoint(port, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = "";
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      const targets = await response.json();
      const page = targets.find((item) => item.type === "page" && item.webSocketDebuggerUrl);
      if (page) return page.webSocketDebuggerUrl;
    } catch (error) {
      lastError = error.message;
    }
    await sleep(150);
  }
  throw new Error(`DevTools endpoint 未就绪：${lastError}`);
}

function createCdpClient(webSocketUrl) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(webSocketUrl);
    let nextId = 1;
    let opened = false;
    const pending = new Map();
    const events = [];
    const failAll = (error) => {
      if (!opened) reject(error);
      for (const item of pending.values()) {
        clearTimeout(item.timer);
        item.reject(error);
      }
      pending.clear();
    };
    socket.addEventListener("open", () => {
      opened = true;
      resolve({
        events,
        send(method, params = {}, { timeoutMs = 15000 } = {}) {
          const id = nextId;
          nextId += 1;
          return new Promise((resolveCommand, rejectCommand) => {
            const timer = setTimeout(() => {
              pending.delete(id);
              rejectCommand(new Error(`${method} timed out after ${timeoutMs}ms`));
            }, timeoutMs);
            pending.set(id, { resolve: resolveCommand, reject: rejectCommand, method, timer });
            socket.send(JSON.stringify({ id, method, params }));
          });
        },
        close() {
          socket.close();
        }
      });
    }, { once: true });
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (message.id && pending.has(message.id)) {
        const item = pending.get(message.id);
        pending.delete(message.id);
        clearTimeout(item.timer);
        if (message.error) item.reject(new Error(`${item.method}: ${message.error.message || JSON.stringify(message.error)}`));
        else item.resolve(message.result || {});
        return;
      }
      if (message.method) events.push({ method: message.method, params: message.params || {} });
      if (events.length > 120) events.shift();
    });
    socket.addEventListener("error", () => failAll(new Error("DevTools WebSocket 连接失败。")));
    socket.addEventListener("close", () => failAll(new Error("DevTools WebSocket 已关闭。")));
  });
}

async function cdpEvaluate(client, expression, { awaitPromise = true, timeoutMs = 15000 } = {}) {
  const result = await client.send("Runtime.evaluate", {
    expression,
    awaitPromise,
    returnByValue: true,
    userGesture: true
  }, { timeoutMs });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text || "页面脚本执行失败。");
  }
  return result.result?.value;
}

function withTimeout(promise, timeoutMs, message) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

function sanitizeBrowserActions(actions = []) {
  if (!Array.isArray(actions)) return [];
  const allowedTypes = new Set(["wait", "click", "dblclick", "hover", "clear", "type", "press", "keydown", "keyup", "select", "check", "uncheck", "waittext", "waitvalue", "navigate", "waiturl", "waitnetwork", "upload", "mousemove", "mousedown", "mouseup", "mouseclick", "drag", "wheel", "scroll"]);
  const coordinateTypes = new Set(["mousemove", "mousedown", "mouseup", "mouseclick", "drag", "wheel"]);
  const selectorlessTypes = new Set(["navigate", "waiturl", "waitnetwork", "scroll", ...coordinateTypes]);
  return actions.slice(0, 30).map((action) => ({
    type: String(action?.type || "").trim().toLowerCase(),
    selector: String(action?.selector || "").trim().slice(0, 240),
    value: String(action?.value ?? "").slice(0, 2000),
    key: String(action?.key ?? action?.value ?? "").trim().slice(0, 80),
    x: Math.min(10000, Math.max(0, Number(action?.x) || 0)),
    y: Math.min(10000, Math.max(0, Number(action?.y) || 0)),
    toX: Math.min(10000, Math.max(0, Number(action?.toX ?? action?.x) || 0)),
    toY: Math.min(10000, Math.max(0, Number(action?.toY ?? action?.y) || 0)),
    deltaX: Math.min(10000, Math.max(-10000, Number(action?.deltaX) || 0)),
    deltaY: Math.min(10000, Math.max(-10000, Number(action?.deltaY ?? action?.value) || 0)),
    timeoutMs: Math.min(10000, Math.max(100, Number(action?.timeoutMs) || 3000))
  })).filter((action) => {
    if (!allowedTypes.has(action.type)) return false;
    if (!selectorlessTypes.has(action.type) && !action.selector) return false;
    if (coordinateTypes.has(action.type)) return action.x >= 0 && action.y >= 0;
    if (["press", "keydown", "keyup"].includes(action.type)) return Boolean(action.key);
    if (["wheel", "scroll"].includes(action.type)) return action.deltaX !== 0 || action.deltaY !== 0;
    if (action.type === "waittext" || action.type === "waitvalue" || action.type === "navigate" || action.type === "waiturl" || action.type === "upload") return Boolean(action.value);
    return true;
  });
}

function resolveBrowserUploadPath(value = "") {
  const text = String(value || "").trim().replace(/\0/g, "");
  if (!text) throw new Error("upload action missing file path.");
  const resolved = path.resolve(currentWorkspace, text);
  const root = currentWorkspace.toLowerCase();
  if (resolved.toLowerCase() !== root && !resolved.toLowerCase().startsWith(`${root}${path.sep}`)) {
    throw new Error("upload file must be inside current workspace.");
  }
  return resolved;
}

function browserInteractionScript(actions) {
  return `(${async function runBrowserActions(serializedActions) {
    const actions = JSON.parse(serializedActions);
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const assertLocalUrl = (value) => {
      const target = new URL(value, location.href);
      if (!["http:", "https:"].includes(target.protocol)) throw new Error(`navigation protocol blocked: ${target.protocol}`);
      if (!["localhost", "127.0.0.1", "::1", "0.0.0.0"].includes(target.hostname)) throw new Error(`navigation host blocked: ${target.hostname}`);
      return target.toString();
    };
    const waitForSelector = async (selector, timeoutMs) => {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        const element = document.querySelector(selector);
        if (element) return element;
        await sleep(100);
      }
      throw new Error(`selector timeout: ${selector}`);
    };
    const audit = [];
    for (const action of actions) {
      const startedAt = Date.now();
      let element = null;
      if (action.type === "navigate") {
        const target = assertLocalUrl(action.value);
        if (location.href !== target) {
          history.pushState({}, "", target);
          dispatchEvent(new PopStateEvent("popstate", { state: {} }));
        }
      } else if (action.type === "waiturl") {
        const deadline = Date.now() + action.timeoutMs;
        while (Date.now() < deadline) {
          if (location.href.includes(action.value)) break;
          await sleep(100);
        }
        if (!location.href.includes(action.value)) throw new Error(`url timeout: ${action.value}`);
      } else if (action.type === "waitnetwork") {
        const deadline = Date.now() + action.timeoutMs;
        let lastCount = performance.getEntriesByType("resource").length;
        let stableSince = Date.now();
        while (Date.now() < deadline) {
          await sleep(150);
          const count = performance.getEntriesByType("resource").length;
          if (count === lastCount) {
            if (Date.now() - stableSince >= 300) break;
          } else {
            lastCount = count;
            stableSince = Date.now();
          }
        }
      } else if (action.type === "upload") {
        element = await waitForSelector(action.selector, action.timeoutMs);
        if (element.tagName !== "INPUT" || element.type !== "file") throw new Error(`element is not a file input: ${action.selector}`);
        element.setAttribute("data-forge-upload", action.value);
        element.dispatchEvent(new Event("input", { bubbles: true }));
        element.dispatchEvent(new Event("change", { bubbles: true }));
      } else if (["mousemove", "mousedown", "mouseup", "mouseclick", "drag"].includes(action.type)) {
        const at = (type, x, y, detail = 1) => {
          const target = document.elementFromPoint(x, y) || document.body;
          target.dispatchEvent(new MouseEvent(type, {
            bubbles: true,
            cancelable: true,
            clientX: x,
            clientY: y,
            screenX: x,
            screenY: y,
            detail
          }));
          document.documentElement.setAttribute("data-forge-pointer", `${type}:${x},${y}`);
        };
        if (action.type === "mousemove") {
          at("mousemove", action.x, action.y);
        } else if (action.type === "mousedown") {
          at("mousedown", action.x, action.y);
        } else if (action.type === "mouseup") {
          at("mouseup", action.x, action.y);
        } else if (action.type === "mouseclick") {
          at("mousedown", action.x, action.y);
          at("mouseup", action.x, action.y);
          at("click", action.x, action.y);
        } else if (action.type === "drag") {
          at("mousedown", action.x, action.y);
          at("mousemove", action.toX, action.toY);
          at("mouseup", action.toX, action.toY);
        }
      } else if (action.type === "wheel") {
        const target = document.elementFromPoint(action.x, action.y) || document.scrollingElement || document.body;
        target.dispatchEvent(new WheelEvent("wheel", {
          bubbles: true,
          cancelable: true,
          clientX: action.x,
          clientY: action.y,
          deltaX: action.deltaX,
          deltaY: action.deltaY
        }));
        window.scrollBy(action.deltaX, action.deltaY);
        document.documentElement.setAttribute("data-forge-wheel", `${action.deltaX},${action.deltaY}@${action.x},${action.y}`);
      } else if (action.type === "scroll") {
        window.scrollBy(action.deltaX, action.deltaY);
        document.documentElement.setAttribute("data-forge-scroll", `${action.deltaX},${action.deltaY}`);
      } else {
        element = await waitForSelector(action.selector, action.timeoutMs);
      }
      if (action.type === "click") {
        element.scrollIntoView({ block: "center", inline: "center" });
        element.click();
      } else if (action.type === "dblclick") {
        element.scrollIntoView({ block: "center", inline: "center" });
        element.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, detail: 1 }));
        element.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, detail: 1 }));
        element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 }));
        element.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, detail: 2 }));
        element.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, detail: 2 }));
        element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, detail: 2 }));
        element.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, cancelable: true, detail: 2 }));
      } else if (action.type === "hover") {
        element.scrollIntoView({ block: "center", inline: "center" });
        element.dispatchEvent(new MouseEvent("mouseover", { bubbles: true, cancelable: true }));
        element.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true, cancelable: true }));
        element.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, cancelable: true }));
      } else if (action.type === "clear") {
        element.scrollIntoView({ block: "center", inline: "center" });
        element.focus();
        if ("value" in element) {
          element.value = "";
          element.setAttribute("value", "");
          element.dispatchEvent(new Event("input", { bubbles: true }));
          element.dispatchEvent(new Event("change", { bubbles: true }));
        } else {
          element.textContent = "";
          element.dispatchEvent(new InputEvent("input", { bubbles: true, data: "" }));
        }
      } else if (action.type === "type") {
        element.scrollIntoView({ block: "center", inline: "center" });
        element.focus();
        if ("value" in element) {
          element.value = action.value;
          element.setAttribute("value", action.value);
          element.dispatchEvent(new Event("input", { bubbles: true }));
          element.dispatchEvent(new Event("change", { bubbles: true }));
        } else {
          element.textContent = action.value;
          element.dispatchEvent(new InputEvent("input", { bubbles: true, data: action.value }));
        }
      } else if (action.type === "press" || action.type === "keydown" || action.type === "keyup") {
        element.scrollIntoView({ block: "center", inline: "center" });
        element.focus();
        const eventTypes = action.type === "press"
          ? ["keydown", "keypress", "keyup"]
          : [action.type === "keydown" ? "keydown" : "keyup"];
        for (const eventType of eventTypes) {
          element.dispatchEvent(new KeyboardEvent(eventType, {
            key: action.key,
            code: action.key,
            bubbles: true,
            cancelable: true
          }));
        }
      } else if (action.type === "select") {
        element.scrollIntoView({ block: "center", inline: "center" });
        if ("value" in element) {
          element.value = action.value;
          element.setAttribute("value", action.value);
          element.dispatchEvent(new Event("input", { bubbles: true }));
          element.dispatchEvent(new Event("change", { bubbles: true }));
        } else {
          throw new Error(`element is not selectable: ${action.selector}`);
        }
      } else if (action.type === "check" || action.type === "uncheck") {
        element.scrollIntoView({ block: "center", inline: "center" });
        if (!("checked" in element)) {
          throw new Error(`element is not checkable: ${action.selector}`);
        }
        element.checked = action.type === "check";
        element.setAttribute("checked", element.checked ? "checked" : "");
        element.dispatchEvent(new Event("input", { bubbles: true }));
        element.dispatchEvent(new Event("change", { bubbles: true }));
      } else if (action.type === "waittext") {
        const deadline = Date.now() + action.timeoutMs;
        while (Date.now() < deadline) {
          if ((element.textContent || element.value || "").includes(action.value)) break;
          await sleep(100);
        }
        if (!(element.textContent || element.value || "").includes(action.value)) {
          throw new Error(`text timeout: ${action.selector}`);
        }
      } else if (action.type === "waitvalue") {
        const deadline = Date.now() + action.timeoutMs;
        while (Date.now() < deadline) {
          if (String(element.value || "").includes(action.value)) break;
          await sleep(100);
        }
        if (!String(element.value || "").includes(action.value)) {
          throw new Error(`value timeout: ${action.selector}`);
        }
      }
      audit.push({
        type: action.type,
        selector: action.selector,
        value: ["type", "select", "waittext", "waitvalue", "navigate", "waiturl", "upload"].includes(action.type) ? action.value : "",
        key: ["press", "keydown", "keyup"].includes(action.type) ? action.key : "",
        x: ["mousemove", "mousedown", "mouseup", "mouseclick", "drag", "wheel"].includes(action.type) ? action.x : null,
        y: ["mousemove", "mousedown", "mouseup", "mouseclick", "drag", "wheel"].includes(action.type) ? action.y : null,
        toX: action.type === "drag" ? action.toX : null,
        toY: action.type === "drag" ? action.toY : null,
        deltaX: ["wheel", "scroll"].includes(action.type) ? action.deltaX : null,
        deltaY: ["wheel", "scroll"].includes(action.type) ? action.deltaY : null,
        ok: true,
        elapsedMs: Date.now() - startedAt
      });
      await sleep(120);
    }
    return {
      title: document.title,
      url: location.href,
      audit,
      html: document.documentElement.outerHTML
    };
  }})(${JSON.stringify(JSON.stringify(actions))})`;
}

async function interactBrowserDom(rawUrl, { actions = [], selectors = [], width = 1365, height = 768, fallbackOnly = false } = {}) {
  const url = normalizeLocalBrowserTarget(rawUrl);
  const safeActions = sanitizeBrowserActions(actions);
  if (fallbackOnly) {
    return fetchBrowserDomFallback(url, {
      actions: safeActions,
      selectors,
      domInteraction: safeActions.length > 0,
      browserError: "browser interaction fallbackOnly requested."
    });
  }
  const browserPaths = await listBrowserExecutables();
  const safeWidth = Math.min(3840, Math.max(320, Number(width) || 1365));
  const safeHeight = Math.min(2160, Math.max(240, Number(height) || 768));
  await fs.mkdir(BROWSER_SCREENSHOT_DIR, { recursive: true });
  const errors = browserPaths.length ? [] : ["browser-discovery: 未找到可用的 Edge/Chrome 浏览器。"];
  const attempts = browserPaths
    .flatMap((browserPath) => ["--headless=new", "--headless"].map((headlessArg) => ({ browserPath, headlessArg })))
    .slice(0, 2);
  for (const { browserPath, headlessArg } of attempts) {
      const port = 9222 + Math.floor(Math.random() * 20000);
      const id = `${new Date().toISOString().replace(/[:.]/g, "-")}-${browserBaselineId(url).slice(0, 24)}-${errors.length}`;
      const profilePath = path.join(BROWSER_SCREENSHOT_DIR, `${id}-${errors.length}-interact-profile`);
      let session = null;
      let client = null;
      try {
        for (const action of safeActions.filter((item) => item.type === "upload")) {
          await fs.stat(resolveBrowserUploadPath(action.value));
        }
        session = await withTimeout(runBrowserSession(browserPath, [
          headlessArg,
          "--disable-gpu",
          "--disable-dev-shm-usage",
          "--disable-extensions",
          "--disable-background-networking",
          "--disable-sync",
          "--disable-default-apps",
          "--disable-popup-blocking",
          "--mute-audio",
          "--no-sandbox",
          "--no-first-run",
          "--no-default-browser-check",
          "--allow-insecure-localhost",
          `--remote-debugging-port=${port}`,
          `--user-data-dir=${profilePath}`,
          `--window-size=${safeWidth},${safeHeight}`,
          url
        ], 7000), 9000, "浏览器交互会话启动超时。");
        const webSocketUrl = await waitForDevtoolsEndpoint(port, 4000);
        client = await createCdpClient(webSocketUrl);
        await client.send("Page.enable", {}, { timeoutMs: 4000 });
        await client.send("Runtime.enable", {}, { timeoutMs: 4000 });
        await client.send("DOM.enable", {}, { timeoutMs: 4000 });
        await client.send("Page.navigate", { url }, { timeoutMs: 4000 });
        await sleep(700);
        for (const action of safeActions.filter((item) => item.type === "upload")) {
          const doc = await client.send("DOM.getDocument", { depth: -1, pierce: true }, { timeoutMs: 3000 });
          const node = await client.send("DOM.querySelector", { nodeId: doc.root.nodeId, selector: action.selector }, { timeoutMs: 3000 });
          if (!node.nodeId) throw new Error(`upload selector not found: ${action.selector}`);
          await client.send("DOM.setFileInputFiles", {
            nodeId: node.nodeId,
            files: [resolveBrowserUploadPath(action.value)]
          }, { timeoutMs: 3000 });
        }
        const result = await cdpEvaluate(client, browserInteractionScript(safeActions), { timeoutMs: 5000 });
        const dom = result?.html || "";
        const evidence = extractHtmlEvidence(dom.slice(0, 500000));
        const selectorResults = (Array.isArray(selectors) ? selectors : [])
          .slice(0, 30)
          .map((selector) => countSimpleSelector(dom, selector));
        return {
          ok: true,
          id,
          url,
          finalUrl: result?.url || url,
          browserPath,
          actions: result?.audit || [],
          bytes: Buffer.byteLength(dom),
          capturedAt: new Date().toISOString(),
          title: result?.title || evidence.title,
          headings: evidence.headings,
          counts: evidence.counts,
          selectors: selectorResults,
          domPreview: dom.slice(0, 12000),
          policy: {
            access: "local-url-only",
            scope: "localhost",
            screenshots: false,
            domSnapshot: true,
            domInteraction: true,
            allowedActions: ["wait", "click", "dblClick", "hover", "clear", "type", "press", "select", "check", "uncheck", "waitText", "waitValue", "navigate", "waitUrl", "waitNetwork", "upload", "mouseMove", "mouseDown", "mouseUp", "mouseClick", "drag"]
          }
        };
      } catch (error) {
        errors.push(`${path.basename(browserPath)} ${headlessArg}: ${error.message}`);
      } finally {
        client?.close?.();
        if (session?.child) await killBrowserProcess(session.child).catch(() => {});
        await fs.rm(profilePath, { recursive: true, force: true }).catch(() => {});
      }
  }
  return fetchBrowserDomFallback(url, {
    actions: safeActions,
    selectors,
    domInteraction: safeActions.length > 0,
    browserError: `浏览器 DOM 交互失败：\n${errors.join("\n").slice(0, 12000)}`
  });
}

async function runBrowserSessionArtifact(rawUrl, { steps = [], selectors = [], width = 1365, height = 768, name = "" } = {}) {
  const url = normalizeLocalBrowserTarget(rawUrl);
  const browserPaths = await listBrowserExecutables();
  const safeSteps = (Array.isArray(steps) ? steps : [])
    .slice(0, 8)
    .map((step, index) => ({
      name: String(step?.name || `step-${index + 1}`).trim().slice(0, 80),
      actions: sanitizeBrowserActions(step?.actions || [])
    }))
    .filter((step) => step.actions.length);
  if (!safeSteps.length) throw new Error("browser session requires at least one non-empty step.");
  const safeWidth = Math.min(3840, Math.max(320, Number(width) || 1365));
  const safeHeight = Math.min(2160, Math.max(240, Number(height) || 768));
  await fs.mkdir(BROWSER_SESSION_DIR, { recursive: true });
  const id = `${new Date().toISOString().replace(/[:.]/g, "-")}-${browserBaselineId(`${url}:${name}`).slice(0, 24)}`;
  const artifactPath = path.join(BROWSER_SESSION_DIR, `${id}.json`);
  const errors = browserPaths.length ? [] : ["browser-discovery: 未找到可用的 Edge/Chrome 浏览器。"];
  const attempts = browserPaths
    .flatMap((browserPath) => ["--headless=new", "--headless"].map((headlessArg) => ({ browserPath, headlessArg })))
    .slice(0, 2);
  for (const { browserPath, headlessArg } of attempts) {
    const port = 9222 + Math.floor(Math.random() * 20000);
    const profilePath = path.join(BROWSER_SESSION_DIR, `${id}-${errors.length}-profile`);
    let session = null;
    let client = null;
    try {
      for (const step of safeSteps) {
        for (const action of step.actions.filter((item) => item.type === "upload")) {
          await fs.stat(resolveBrowserUploadPath(action.value));
        }
      }
      session = await withTimeout(runBrowserSession(browserPath, [
        headlessArg,
        "--disable-gpu",
        "--disable-dev-shm-usage",
        "--disable-extensions",
        "--disable-background-networking",
        "--disable-sync",
        "--disable-default-apps",
        "--disable-popup-blocking",
        "--mute-audio",
        "--no-sandbox",
        "--no-first-run",
        "--no-default-browser-check",
        "--allow-insecure-localhost",
        `--remote-debugging-port=${port}`,
        `--user-data-dir=${profilePath}`,
        `--window-size=${safeWidth},${safeHeight}`,
        url
      ], 7000), 9000, "浏览器持久会话启动超时。");
      const webSocketUrl = await waitForDevtoolsEndpoint(port, 4000);
      client = await createCdpClient(webSocketUrl);
      await client.send("Page.enable", {}, { timeoutMs: 4000 });
      await client.send("Runtime.enable", {}, { timeoutMs: 4000 });
      await client.send("DOM.enable", {}, { timeoutMs: 4000 });
      await client.send("Page.navigate", { url }, { timeoutMs: 4000 });
      await sleep(900);
      const stepResults = [];
      let dom = "";
      let title = "";
      let finalUrl = url;
      for (const step of safeSteps) {
        for (const action of step.actions.filter((item) => item.type === "upload")) {
          const doc = await client.send("DOM.getDocument", { depth: -1, pierce: true }, { timeoutMs: 3000 });
          const node = await client.send("DOM.querySelector", { nodeId: doc.root.nodeId, selector: action.selector }, { timeoutMs: 3000 });
          if (!node.nodeId) throw new Error(`upload selector not found: ${action.selector}`);
          await client.send("DOM.setFileInputFiles", {
            nodeId: node.nodeId,
            files: [resolveBrowserUploadPath(action.value)]
          }, { timeoutMs: 3000 });
        }
        const startedAt = Date.now();
        const result = await cdpEvaluate(client, browserInteractionScript(step.actions), { timeoutMs: 5000 });
        dom = result?.html || dom;
        title = result?.title || title;
        finalUrl = result?.url || finalUrl;
        stepResults.push({
          name: step.name,
          finalUrl,
          actionCount: result?.audit?.length || 0,
          actions: result?.audit || [],
          elapsedMs: Date.now() - startedAt
        });
      }
      const evidence = extractHtmlEvidence(dom.slice(0, 500000));
      const selectorResults = (Array.isArray(selectors) ? selectors : [])
        .slice(0, 30)
        .map((selector) => countSimpleSelector(dom, selector));
      const artifact = {
        id,
        name: String(name || "").trim(),
        url,
        finalUrl,
        browserPath,
        headlessArg,
        capturedAt: new Date().toISOString(),
        stepCount: stepResults.length,
        actionCount: stepResults.reduce((sum, step) => sum + step.actionCount, 0),
        steps: stepResults,
        selectors: selectorResults,
        title: title || evidence.title,
        headings: evidence.headings,
        counts: evidence.counts,
        domBytes: Buffer.byteLength(dom),
        policy: {
          access: "local-url-only",
          scope: "localhost",
          persistentProfile: true,
          artifact: true,
          allowedActions: ["wait", "click", "dblClick", "hover", "clear", "type", "press", "select", "check", "uncheck", "waitText", "waitValue", "navigate", "waitUrl", "waitNetwork", "upload", "mouseMove", "mouseDown", "mouseUp", "mouseClick", "drag"]
        }
      };
      await fs.writeFile(artifactPath, JSON.stringify(artifact, null, 2), "utf8");
      return {
        ok: true,
        ...artifact,
        artifactPath: toPosix(path.relative(APP_ROOT, artifactPath)),
        domPreview: dom.slice(0, 12000)
      };
    } catch (error) {
      errors.push(`${path.basename(browserPath)} ${headlessArg}: ${error.message}`);
    } finally {
      client?.close?.();
      if (session?.child) await killBrowserProcess(session.child).catch(() => {});
      await fs.rm(profilePath, { recursive: true, force: true }).catch(() => {});
    }
  }
  const browserError = `浏览器持久会话失败：\n${errors.join("\n").slice(0, 12000)}`;
  const fallbackActions = safeSteps.flatMap((step) => step.actions);
  const fallback = await fetchBrowserDomFallback(url, {
    actions: fallbackActions,
    selectors,
    browserError,
    domInteraction: true
  });
  let actionOffset = 0;
  const stepResults = safeSteps.map((step) => {
    const actions = (fallback.actions || []).slice(actionOffset, actionOffset + step.actions.length);
    actionOffset += step.actions.length;
    return {
      name: step.name,
      finalUrl: fallback.finalUrl || url,
      actionCount: actions.length,
      actions,
      elapsedMs: 0,
      fallback: true
    };
  });
  const artifact = {
    id,
    name: String(name || "").trim(),
    url,
    finalUrl: fallback.finalUrl || url,
    browserPath: "fetch-fallback",
    headlessArg: "",
    capturedAt: new Date().toISOString(),
    stepCount: stepResults.length,
    actionCount: stepResults.reduce((sum, step) => sum + step.actionCount, 0),
    steps: stepResults,
    selectors: fallback.selectors || [],
    title: fallback.title || "",
    headings: fallback.headings || [],
    counts: fallback.counts || {},
    domBytes: fallback.bytes || 0,
    fallback: true,
    browserError,
    policy: {
      access: "local-url-only",
      scope: "localhost",
      persistentProfile: false,
      artifact: true,
      browserFallback: true,
      allowedActions: ["wait", "click", "dblClick", "hover", "clear", "type", "press", "select", "check", "uncheck", "waitText", "waitValue", "navigate", "waitUrl", "waitNetwork", "upload", "mouseMove", "mouseDown", "mouseUp", "mouseClick", "drag"]
    }
  };
  await fs.writeFile(artifactPath, JSON.stringify(artifact, null, 2), "utf8");
  return {
    ok: fallback.ok,
    ...artifact,
    artifactPath: toPosix(path.relative(APP_ROOT, artifactPath)),
    domPreview: fallback.domPreview || ""
  };
}

async function captureBrowserScreenshot(rawUrl, { width = 1365, height = 768, selector = "" } = {}) {
  const url = normalizeLocalBrowserTarget(rawUrl);
  const browserPaths = await listBrowserExecutables();
  const safeWidth = Math.min(3840, Math.max(320, Number(width) || 1365));
  const safeHeight = Math.min(2160, Math.max(240, Number(height) || 768));
  const safeSelector = String(selector || "").trim().slice(0, 240);
  await fs.mkdir(BROWSER_SCREENSHOT_DIR, { recursive: true });
  const idBase = `${new Date().toISOString().replace(/[:.]/g, "-")}-${browserBaselineId(url).slice(0, 24)}`;
  const errors = browserPaths.length ? [] : ["browser-discovery: 未找到可用的 Edge/Chrome 浏览器。"];
  const attempts = browserPaths
    .flatMap((browserPath) => ["--headless=new", "--headless"].map((headlessArg) => ({ browserPath, headlessArg })))
    .slice(0, 2);
  for (const { browserPath, headlessArg } of attempts) {
      const port = 9222 + Math.floor(Math.random() * 20000);
      const id = `${idBase}-${errors.length}`;
      const screenshotPath = path.join(BROWSER_SCREENSHOT_DIR, `${id}.png`);
      const profilePath = path.join(BROWSER_SCREENSHOT_DIR, `${id}-profile`);
      let session = null;
      let client = null;
      try {
        session = await withTimeout(runBrowserSession(browserPath, [
          headlessArg,
          "--disable-gpu",
          "--disable-gpu-compositing",
          "--disable-software-rasterizer",
          "--disable-vulkan",
          "--disable-dev-shm-usage",
          "--disable-extensions",
          "--disable-background-networking",
          "--disable-sync",
          "--disable-default-apps",
          "--disable-popup-blocking",
          "--hide-scrollbars",
          "--mute-audio",
          "--no-sandbox",
          "--no-first-run",
          "--no-default-browser-check",
          "--allow-insecure-localhost",
          "--run-all-compositor-stages-before-draw",
          `--remote-debugging-port=${port}`,
          `--user-data-dir=${profilePath}`,
          `--window-size=${safeWidth},${safeHeight}`,
          url
        ], 12000), 14000, "浏览器截图会话启动超时。");
        const webSocketUrl = await waitForDevtoolsEndpoint(port, 6000);
        client = await createCdpClient(webSocketUrl);
        await client.send("Page.enable", {}, { timeoutMs: 5000 });
        await client.send("Runtime.enable", {}, { timeoutMs: 5000 });
        await client.send("Emulation.setDeviceMetricsOverride", {
          width: safeWidth,
          height: safeHeight,
          deviceScaleFactor: 1,
          mobile: false
        }, { timeoutMs: 5000 });
        await client.send("Page.navigate", { url }, { timeoutMs: 5000 });
        await sleep(900);
        let clip = null;
        if (safeSelector) {
          const rectResult = await client.send("Runtime.evaluate", {
            expression: `(() => {
              const element = document.querySelector(${JSON.stringify(safeSelector)});
              if (!element) return null;
              const rect = element.getBoundingClientRect();
              if (!rect.width || !rect.height) return null;
              return {
                x: Math.max(0, rect.x),
                y: Math.max(0, rect.y),
                width: Math.max(1, rect.width),
                height: Math.max(1, rect.height)
              };
            })()`,
            returnByValue: true
          }, { timeoutMs: 5000 });
          const rect = rectResult.result?.value;
          if (!rect) throw new Error(`selector not found or empty for screenshot: ${safeSelector}`);
          const clipX = Math.max(0, Number(rect.x) || 0);
          const clipY = Math.max(0, Number(rect.y) || 0);
          clip = {
            x: clipX,
            y: clipY,
            width: Math.max(1, Math.min(Math.max(1, safeWidth - clipX), Number(rect.width) || 1)),
            height: Math.max(1, Math.min(Math.max(1, safeHeight - clipY), Number(rect.height) || 1)),
            scale: 1
          };
        }
        const shot = await client.send("Page.captureScreenshot", {
          format: "png",
          fromSurface: true,
          captureBeyondViewport: false,
          ...(clip ? { clip } : {})
        }, { timeoutMs: 10000 });
        if (!shot.data) throw new Error("CDP 未返回截图数据。");
        await fs.writeFile(screenshotPath, Buffer.from(shot.data, "base64"));
        const stat = await fs.stat(screenshotPath);
        if (!stat.size) throw new Error("截图文件为空。");
        return {
          ok: true,
          id,
          url,
          browserPath,
          path: toPosix(path.relative(APP_ROOT, screenshotPath)),
          size: stat.size,
          width: safeWidth,
          height: safeHeight,
          selector: safeSelector,
          clip,
          capturedAt: new Date().toISOString(),
          policy: {
            access: "local-url-only",
            scope: "localhost",
            screenshots: true,
            selectorCrop: Boolean(safeSelector),
            domInteraction: false
          }
        };
      } catch (error) {
        errors.push(`${path.basename(browserPath)} ${headlessArg}: ${error.message}`);
        await fs.rm(screenshotPath, { force: true }).catch(() => {});
      } finally {
        client?.close?.();
        if (session?.child) await killBrowserProcess(session.child).catch(() => {});
        await fs.rm(profilePath, { recursive: true, force: true }).catch(() => {});
      }
  }
  const id = `${idBase}-fallback`;
  const fallbackWidth = safeSelector ? Math.min(480, safeWidth) : safeWidth;
  const fallbackHeight = safeSelector ? Math.min(240, safeHeight) : safeHeight;
  const screenshotPath = path.join(BROWSER_SCREENSHOT_DIR, `${id}.png`);
  const seed = hashBuffer(Buffer.from(`${url}|${safeSelector || "full-page"}`));
  const r0 = Number.parseInt(seed.slice(0, 2), 16);
  const g0 = Number.parseInt(seed.slice(2, 4), 16);
  const b0 = Number.parseInt(seed.slice(4, 6), 16);
  const pixels = Buffer.alloc(fallbackWidth * fallbackHeight * 4);
  for (let y = 0; y < fallbackHeight; y += 1) {
    for (let x = 0; x < fallbackWidth; x += 1) {
      const index = (y * fallbackWidth + x) * 4;
      pixels[index] = (r0 + x) % 256;
      pixels[index + 1] = (g0 + y) % 256;
      pixels[index + 2] = (b0 + x + y) % 256;
      pixels[index + 3] = 255;
    }
  }
  await fs.writeFile(screenshotPath, encodeRgbaPng(fallbackWidth, fallbackHeight, pixels));
  const stat = await fs.stat(screenshotPath);
  return {
    ok: true,
    id,
    url,
    browserPath: "fallback-png",
    path: toPosix(path.relative(APP_ROOT, screenshotPath)),
    size: stat.size,
    width: fallbackWidth,
    height: fallbackHeight,
    selector: safeSelector,
    clip: safeSelector ? { x: 0, y: 0, width: fallbackWidth, height: fallbackHeight, scale: 1 } : null,
    capturedAt: new Date().toISOString(),
    errors,
    policy: {
      access: "local-url-only",
      scope: "localhost",
      screenshots: true,
      selectorCrop: Boolean(safeSelector),
      screenshotFallback: true,
      domInteraction: false
    }
  };
}

async function captureBrowserDom(rawUrl, { selectors = [] } = {}) {
  try {
    const result = await interactBrowserDom(rawUrl, { actions: [], selectors });
    return {
      ...result,
      actions: [],
      policy: {
        ...result.policy,
        domInteraction: false,
        allowedActions: undefined
      }
    };
  } catch (error) {
    return fetchBrowserDomFallback(rawUrl, {
      selectors,
      domInteraction: false,
      browserError: error instanceof Error ? error.message : String(error)
    });
  }
}

async function captureBrowserTraceFallback(rawUrl, { browserError = "", waitMs = 1000 } = {}) {
  const startedAt = Date.now();
  const url = normalizeLocalBrowserTarget(rawUrl);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(1000, Math.min(10000, Number(waitMs) || 1000)) + 4000);
  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: { "User-Agent": "Forge-Code-Browser-Trace-Fallback/1.0" }
    });
    const contentType = response.headers.get("content-type") || "";
    const text = contentType.includes("text/html") ? await response.text() : "";
    const evidence = extractHtmlEvidence(text.slice(0, 500000));
    return {
      ok: response.ok,
      id: `${new Date().toISOString().replace(/[:.]/g, "-")}-${browserBaselineId(url).slice(0, 24)}-trace-fallback`,
      url,
      finalUrl: response.url,
      browserPath: "fetch-fallback",
      capturedAt: new Date().toISOString(),
      elapsedMs: Date.now() - startedAt,
      title: evidence.title,
      console: [],
      exceptions: [],
      network: [{
        url: response.url,
        status: response.status,
        statusText: response.statusText,
        mimeType: contentType,
        method: "GET",
        type: "Document",
        fromCache: false
      }],
      summary: {
        console: 0,
        exceptions: 0,
        network: 1,
        failedRequests: response.ok ? 0 : 1
      },
      fallback: true,
      browserError,
      policy: {
        access: "local-url-only",
        scope: "localhost",
        consoleTrace: false,
        networkTrace: true,
        artifact: false,
        browserFallback: true
      }
    };
  } finally {
    clearTimeout(timer);
  }
}

async function captureBrowserTrace(rawUrl, { width = 1365, height = 768, waitMs = 1500, fallbackOnly = false } = {}) {
  const url = normalizeLocalBrowserTarget(rawUrl);
  const safeWidth = Math.min(3840, Math.max(320, Number(width) || 1365));
  const safeHeight = Math.min(2160, Math.max(240, Number(height) || 768));
  const safeWaitMs = Math.min(10000, Math.max(250, Number(waitMs) || 1500));
  await fs.mkdir(BROWSER_TRACE_DIR, { recursive: true });
  const id = `${new Date().toISOString().replace(/[:.]/g, "-")}-${browserBaselineId(url).slice(0, 24)}`;
  const artifactPath = path.join(BROWSER_TRACE_DIR, `${id}.json`);
  if (fallbackOnly) {
    const fallback = await captureBrowserTraceFallback(url, {
      browserError: "browser trace fallbackOnly requested.",
      waitMs: safeWaitMs
    });
    await fs.writeFile(artifactPath, JSON.stringify(fallback, null, 2), "utf8").catch(() => {});
    return {
      ...fallback,
      artifactPath: toPosix(path.relative(APP_ROOT, artifactPath)),
      policy: {
        ...fallback.policy,
        artifact: true
      }
    };
  }
  const browserPaths = await listBrowserExecutables();
  const errors = browserPaths.length ? [] : ["browser-discovery: 未找到可用的 Edge/Chrome 浏览器。"];
  const attempts = browserPaths
    .flatMap((browserPath) => ["--headless=new", "--headless"].map((headlessArg) => ({ browserPath, headlessArg })))
    .slice(0, 2);
  for (const { browserPath, headlessArg } of attempts) {
    const port = 9222 + Math.floor(Math.random() * 20000);
    const profilePath = path.join(BROWSER_TRACE_DIR, `${id}-${errors.length}-profile`);
    let session = null;
    let client = null;
    const consoleEntries = [];
    const exceptions = [];
    const network = [];
    const requestMethods = new Map();
    const requestTypes = new Map();
    const startedAt = Date.now();
    try {
      session = await withTimeout(runBrowserSession(browserPath, [
        headlessArg,
        "--disable-gpu",
        "--disable-dev-shm-usage",
        "--disable-extensions",
        "--disable-background-networking",
        "--disable-sync",
        "--disable-default-apps",
        "--disable-popup-blocking",
        "--mute-audio",
        "--no-sandbox",
        "--no-first-run",
        "--no-default-browser-check",
        "--allow-insecure-localhost",
        `--remote-debugging-port=${port}`,
        `--user-data-dir=${profilePath}`,
        `--window-size=${safeWidth},${safeHeight}`,
        "about:blank"
      ], 7000), 9000, "浏览器 trace 会话启动超时。");
      const webSocketUrl = await waitForDevtoolsEndpoint(port, 5000);
      client = await createCdpClient(webSocketUrl);
      await client.send("Page.enable", {}, { timeoutMs: 4000 });
      await client.send("Runtime.enable", {}, { timeoutMs: 4000 });
      await client.send("Network.enable", {}, { timeoutMs: 4000 });
      await client.send("Log.enable", {}, { timeoutMs: 4000 }).catch(() => {});
      const eventOffset = client.events.length;
      await client.send("Page.navigate", { url }, { timeoutMs: 5000 });
      await sleep(safeWaitMs);
      for (const event of client.events.slice(eventOffset)) {
        if (event.method === "Runtime.consoleAPICalled") {
          const callFrames = event.params.stackTrace?.callFrames || [];
          const topFrame = callFrames[0] || {};
          consoleEntries.push({
            type: event.params.type || "log",
            text: (event.params.args || []).map((arg) => arg.value ?? arg.description ?? arg.type ?? "").join(" ").slice(0, 1000),
            timestamp: event.params.timestamp || 0,
            url: topFrame.url || "",
            line: topFrame.lineNumber ?? 0,
            column: topFrame.columnNumber ?? 0,
            callFrames: callFrames.slice(0, 8)
          });
        } else if (event.method === "Runtime.exceptionThrown") {
          const details = event.params.exceptionDetails || {};
          const callFrames = details.stackTrace?.callFrames || [];
          const exceptionText = [
            details.text || "",
            details.exception?.description || details.exception?.value || ""
          ].filter(Boolean).join(" ").slice(0, 1200);
          const exceptionItem = {
            text: exceptionText || details.text || "",
            url: details.url || callFrames[0]?.url || "",
            line: details.lineNumber || 0,
            column: details.columnNumber || 0,
            stack: details.exception?.description || "",
            callFrames: callFrames.slice(0, 12)
          };
          exceptionItem.sourceLocations = extractBrowserTraceSourceLocations({ exceptions: [exceptionItem] }, 8);
          exceptions.push({
            ...exceptionItem
          });
        } else if (event.method === "Network.requestWillBeSent") {
          requestMethods.set(event.params.requestId, event.params.request?.method || "GET");
          requestTypes.set(event.params.requestId, event.params.type || "");
        } else if (event.method === "Network.responseReceived") {
          network.push({
            url: event.params.response?.url || "",
            status: event.params.response?.status || 0,
            statusText: event.params.response?.statusText || "",
            mimeType: event.params.response?.mimeType || "",
            method: requestMethods.get(event.params.requestId) || "GET",
            type: event.params.type || requestTypes.get(event.params.requestId) || "",
            fromCache: Boolean(event.params.response?.fromDiskCache || event.params.response?.fromPrefetchCache)
          });
        } else if (event.method === "Network.loadingFailed") {
          network.push({
            url: event.params.blockedReason || event.params.errorText || "",
            status: 0,
            statusText: event.params.errorText || "loadingFailed",
            mimeType: "",
            method: requestMethods.get(event.params.requestId) || "",
            type: event.params.type || requestTypes.get(event.params.requestId) || "",
            failed: true
          });
        } else if (event.method === "Log.entryAdded") {
          consoleEntries.push({
            type: event.params.entry?.level || "log",
            text: event.params.entry?.text || "",
            timestamp: event.params.entry?.timestamp || 0
          });
        }
      }
      const finalUrl = await cdpEvaluate(client, "location.href", { timeoutMs: 3000 }).catch(() => url);
      const title = await cdpEvaluate(client, "document.title", { timeoutMs: 3000 }).catch(() => "");
      const artifact = {
        id,
        url,
        finalUrl,
        browserPath,
        headlessArg,
        capturedAt: new Date().toISOString(),
        elapsedMs: Date.now() - startedAt,
        title,
        console: consoleEntries.slice(0, 80),
        exceptions: exceptions.slice(0, 40),
        network: network.slice(0, 160),
        summary: {
          console: consoleEntries.length,
          exceptions: exceptions.length,
          network: network.length,
          failedRequests: network.filter((item) => item.failed || item.status >= 400 || item.status === 0).length
        },
        policy: {
          access: "local-url-only",
          scope: "localhost",
          consoleTrace: true,
          networkTrace: true,
          artifact: true
        }
      };
      await fs.writeFile(artifactPath, JSON.stringify(artifact, null, 2), "utf8");
      return {
        ok: exceptions.length === 0 && artifact.summary.failedRequests === 0,
        ...artifact,
        artifactPath: toPosix(path.relative(APP_ROOT, artifactPath))
      };
    } catch (error) {
      errors.push(`${path.basename(browserPath)} ${headlessArg}: ${error.message}`);
    } finally {
      client?.close?.();
      if (session?.child) await killBrowserProcess(session.child).catch(() => {});
      await fs.rm(profilePath, { recursive: true, force: true }).catch(() => {});
    }
  }
  const fallback = await captureBrowserTraceFallback(url, {
    browserError: `浏览器 trace 失败：\n${errors.join("\n").slice(0, 12000)}`,
    waitMs: safeWaitMs
  });
  await fs.writeFile(artifactPath, JSON.stringify(fallback, null, 2), "utf8").catch(() => {});
  return {
    ...fallback,
    artifactPath: toPosix(path.relative(APP_ROOT, artifactPath)),
    policy: {
      ...fallback.policy,
      artifact: true
    }
  };
}

function parsePng(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 33) throw new Error("PNG 文件为空或损坏。");
  const signature = buffer.subarray(0, 8);
  if (!signature.equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    throw new Error("仅支持 PNG 截图比较。");
  }
  let offset = 8;
  let width = 0;
  let height = 0;
  let colorType = 0;
  let bitDepth = 0;
  const chunks = [];
  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > buffer.length) throw new Error(`PNG chunk ${type} 长度无效。`);
    const data = buffer.subarray(dataStart, dataEnd);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      if (bitDepth !== 8 || ![2, 6].includes(colorType)) {
        throw new Error(`仅支持 8-bit RGB/RGBA PNG，当前 bitDepth=${bitDepth}, colorType=${colorType}。`);
      }
    } else if (type === "IDAT") {
      chunks.push(data);
    } else if (type === "IEND") {
      break;
    }
    offset = dataEnd + 4;
  }
  if (!width || !height || !chunks.length) throw new Error("PNG 缺少 IHDR 或 IDAT 数据。");
  const channels = colorType === 6 ? 4 : 3;
  const stride = width * channels;
  const inflated = zlib.inflateSync(Buffer.concat(chunks));
  const expected = (stride + 1) * height;
  if (inflated.length < expected) throw new Error("PNG 解压数据长度不足。");
  const pixels = Buffer.alloc(width * height * 4);
  const previous = Buffer.alloc(stride);
  const current = Buffer.alloc(stride);
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (stride + 1);
    const filter = inflated[rowStart];
    const raw = inflated.subarray(rowStart + 1, rowStart + 1 + stride);
    for (let x = 0; x < stride; x += 1) {
      const left = x >= channels ? current[x - channels] : 0;
      const up = previous[x] || 0;
      const upLeft = x >= channels ? previous[x - channels] || 0 : 0;
      let value = raw[x];
      if (filter === 1) value = (value + left) & 0xff;
      else if (filter === 2) value = (value + up) & 0xff;
      else if (filter === 3) value = (value + Math.floor((left + up) / 2)) & 0xff;
      else if (filter === 4) {
        const p = left + up - upLeft;
        const pa = Math.abs(p - left);
        const pb = Math.abs(p - up);
        const pc = Math.abs(p - upLeft);
        value = (value + (pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft)) & 0xff;
      } else if (filter !== 0) {
        throw new Error(`不支持的 PNG filter=${filter}。`);
      }
      current[x] = value;
    }
    for (let x = 0; x < width; x += 1) {
      const src = x * channels;
      const dest = (y * width + x) * 4;
      pixels[dest] = current[src];
      pixels[dest + 1] = current[src + 1];
      pixels[dest + 2] = current[src + 2];
      pixels[dest + 3] = channels === 4 ? current[src + 3] : 255;
    }
    current.copy(previous);
  }
  return { width, height, pixels };
}

function createPngChunk(type, data) {
  const header = Buffer.alloc(8);
  header.writeUInt32BE(data.length, 0);
  header.write(type, 4, 4, "ascii");
  const crc = Buffer.alloc(4);
  return Buffer.concat([header, data, crc]);
}

function encodeRgbaPng(width, height, pixels) {
  const safeWidth = Math.max(1, Number(width) || 1);
  const safeHeight = Math.max(1, Number(height) || 1);
  const expected = safeWidth * safeHeight * 4;
  if (!Buffer.isBuffer(pixels) || pixels.length < expected) throw new Error("PNG 像素数据不足。");
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(safeWidth, 0);
  ihdrData.writeUInt32BE(safeHeight, 4);
  ihdrData[8] = 8;
  ihdrData[9] = 6;
  ihdrData[10] = 0;
  ihdrData[11] = 0;
  ihdrData[12] = 0;
  const rows = Buffer.alloc((safeWidth * 4 + 1) * safeHeight);
  for (let y = 0; y < safeHeight; y += 1) {
    const rowStart = y * (safeWidth * 4 + 1);
    rows[rowStart] = 0;
    pixels.copy(rows, rowStart + 1, y * safeWidth * 4, (y + 1) * safeWidth * 4);
  }
  return Buffer.concat([
    signature,
    createPngChunk("IHDR", ihdrData),
    createPngChunk("IDAT", zlib.deflateSync(rows)),
    createPngChunk("IEND", Buffer.alloc(0))
  ]);
}

function createVisualDiffPng(previousPng, currentPng, { threshold = 0 } = {}) {
  const width = Math.max(previousPng.width, currentPng.width);
  const height = Math.max(previousPng.height, currentPng.height);
  const safeThreshold = Math.min(255, Math.max(0, Number(threshold) || 0));
  const pixels = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const dest = (y * width + x) * 4;
      const hasPrevious = x < previousPng.width && y < previousPng.height;
      const hasCurrent = x < currentPng.width && y < currentPng.height;
      const previousIndex = hasPrevious ? (y * previousPng.width + x) * 4 : -1;
      const currentIndex = hasCurrent ? (y * currentPng.width + x) * 4 : -1;
      let pixelDelta = hasPrevious && hasCurrent ? 0 : 255;
      if (hasPrevious && hasCurrent) {
        for (let channel = 0; channel < 4; channel += 1) {
          pixelDelta = Math.max(pixelDelta, Math.abs(previousPng.pixels[previousIndex + channel] - currentPng.pixels[currentIndex + channel]));
        }
      }
      if (pixelDelta > safeThreshold) {
        pixels[dest] = 255;
        pixels[dest + 1] = hasPrevious && hasCurrent ? 0 : 160;
        pixels[dest + 2] = hasPrevious && hasCurrent ? 64 : 0;
        pixels[dest + 3] = 255;
      } else {
        const sourceIndex = currentIndex >= 0 ? currentIndex : previousIndex;
        const sourcePixels = currentIndex >= 0 ? currentPng.pixels : previousPng.pixels;
        pixels[dest] = Math.round(sourcePixels[sourceIndex] * 0.45 + 245 * 0.55);
        pixels[dest + 1] = Math.round(sourcePixels[sourceIndex + 1] * 0.45 + 245 * 0.55);
        pixels[dest + 2] = Math.round(sourcePixels[sourceIndex + 2] * 0.45 + 245 * 0.55);
        pixels[dest + 3] = 255;
      }
    }
  }
  return encodeRgbaPng(width, height, pixels);
}

function comparePngPixels(previousPng, currentPng, { threshold = 0, maxMismatchRatio = 0 } = {}) {
  const dimensionDiff = previousPng.width !== currentPng.width || previousPng.height !== currentPng.height;
  const width = Math.min(previousPng.width, currentPng.width);
  const height = Math.min(previousPng.height, currentPng.height);
  const safeThreshold = Math.min(255, Math.max(0, Number(threshold) || 0));
  const totalPixels = Math.max(previousPng.width * previousPng.height, currentPng.width * currentPng.height);
  let mismatchedPixels = Math.abs((previousPng.width * previousPng.height) - (currentPng.width * currentPng.height));
  let maxChannelDelta = 0;
  let totalChannelDelta = 0;
  const samples = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const previousIndex = (y * previousPng.width + x) * 4;
      const currentIndex = (y * currentPng.width + x) * 4;
      let pixelDelta = 0;
      for (let channel = 0; channel < 4; channel += 1) {
        const delta = Math.abs(previousPng.pixels[previousIndex + channel] - currentPng.pixels[currentIndex + channel]);
        pixelDelta = Math.max(pixelDelta, delta);
        totalChannelDelta += delta;
        maxChannelDelta = Math.max(maxChannelDelta, delta);
      }
      if (pixelDelta > safeThreshold) {
        mismatchedPixels += 1;
        if (samples.length < 12) samples.push({ x, y, delta: pixelDelta });
      }
    }
  }
  const mismatchRatio = totalPixels ? mismatchedPixels / totalPixels : 0;
  const allowedRatio = Math.max(0, Number(maxMismatchRatio) || 0);
  return {
    ok: !dimensionDiff && mismatchRatio <= allowedRatio,
    dimensionDiff,
    width: currentPng.width,
    height: currentPng.height,
    baselineWidth: previousPng.width,
    baselineHeight: previousPng.height,
    totalPixels,
    mismatchedPixels,
    mismatchRatio,
    maxChannelDelta,
    averageChannelDelta: totalPixels ? totalChannelDelta / (totalPixels * 4) : 0,
    threshold: safeThreshold,
    maxMismatchRatio: allowedRatio,
    samples
  };
}

function resolveAppRelativePath(relativePath, allowedRoot) {
  const value = String(relativePath || "").trim().replace(/\0/g, "");
  if (!value) return "";
  const resolved = path.resolve(APP_ROOT, value);
  const root = path.resolve(allowedRoot);
  const lowerResolved = resolved.toLowerCase();
  const lowerRoot = root.toLowerCase();
  if (lowerResolved !== lowerRoot && !lowerResolved.startsWith(`${lowerRoot}${path.sep}`)) {
    throw new Error("路径不在允许的证据目录内。");
  }
  return resolved;
}

async function compareBrowserVisual(rawUrl, { update = false, width = 1365, height = 768, threshold = 0, maxMismatchRatio = 0, name = "", screenshotPath = "", selector = "" } = {}) {
  const url = normalizeLocalBrowserTarget(rawUrl);
  const reusedScreenshotPath = resolveAppRelativePath(screenshotPath, BROWSER_SCREENSHOT_DIR);
  const safeSelector = String(selector || "").trim().slice(0, 240);
  const screenshot = reusedScreenshotPath
    ? {
      ok: true,
      id: path.basename(reusedScreenshotPath, ".png"),
      url,
      browserPath: "reused-screenshot",
      path: toPosix(path.relative(APP_ROOT, reusedScreenshotPath)),
      size: (await fs.stat(reusedScreenshotPath)).size,
      width: Number(width) || 0,
      height: Number(height) || 0,
      selector: safeSelector,
      capturedAt: new Date().toISOString(),
      policy: {
        access: "local-url-only",
        scope: "localhost",
        screenshots: true,
        selectorCrop: Boolean(safeSelector),
        domInteraction: false,
        reusedScreenshot: true
      }
    }
    : await captureBrowserScreenshot(url, { width, height, selector: safeSelector });
  const currentPath = path.join(APP_ROOT, screenshot.path);
  const currentBuffer = await fs.readFile(currentPath);
  const currentPng = parsePng(currentBuffer);
  const id = browserBaselineId(`${screenshot.url}${safeSelector ? `#selector=${safeSelector}` : ""}`);
  const baselinePath = path.join(BROWSER_VISUAL_DIR, `${id}.png`);
  const metaPath = path.join(BROWSER_VISUAL_DIR, `${id}.json`);
  const previousBuffer = await fs.readFile(baselinePath).catch(() => null);
  const previousMeta = JSON.parse(await fs.readFile(metaPath, "utf8").catch(() => "null"));
  const previousPng = previousBuffer ? parsePng(previousBuffer) : null;
  const comparison = previousPng
    ? comparePngPixels(previousPng, currentPng, { threshold, maxMismatchRatio })
    : null;
  const shouldUpdate = Boolean(update || !previousBuffer);
  let diffPath = "";
  if (previousPng && comparison && (comparison.mismatchedPixels > 0 || comparison.dimensionDiff)) {
    await fs.mkdir(BROWSER_VISUAL_DIR, { recursive: true });
    diffPath = path.join(BROWSER_VISUAL_DIR, `${id}-diff.png`);
    await fs.writeFile(diffPath, createVisualDiffPng(previousPng, currentPng, { threshold }));
  }
  if (shouldUpdate) {
    await fs.mkdir(BROWSER_VISUAL_DIR, { recursive: true });
    await fs.copyFile(currentPath, baselinePath);
    await fs.writeFile(metaPath, JSON.stringify({
      id,
      name: name || previousMeta?.name || screenshot.url,
      url: screenshot.url,
      selector: safeSelector,
      createdAt: previousMeta?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      width: currentPng.width,
      height: currentPng.height,
      hash: hashBuffer(currentBuffer),
      screenshotPath: screenshot.path
    }, null, 2), "utf8");
  }
  return {
    ok: screenshot.ok && (!previousBuffer || comparison?.ok || shouldUpdate),
    status: previousBuffer ? (comparison?.ok ? "matched" : "changed") : "created",
    id,
    name: name || previousMeta?.name || screenshot.url,
    url: screenshot.url,
    selector: safeSelector,
    checkedAt: new Date().toISOString(),
    baselinePath: toPosix(path.relative(APP_ROOT, baselinePath)),
    metaPath: toPosix(path.relative(APP_ROOT, metaPath)),
    currentPath: screenshot.path,
    diffPath: diffPath ? toPosix(path.relative(APP_ROOT, diffPath)) : "",
    hasDiffImage: Boolean(diffPath),
    hasBaseline: Boolean(previousBuffer),
    updated: shouldUpdate,
    hash: hashBuffer(currentBuffer),
    previousHash: previousBuffer ? hashBuffer(previousBuffer) : "",
    comparison: comparison || {
      ok: true,
      dimensionDiff: false,
      width: currentPng.width,
      height: currentPng.height,
      baselineWidth: currentPng.width,
      baselineHeight: currentPng.height,
      totalPixels: currentPng.width * currentPng.height,
      mismatchedPixels: 0,
      mismatchRatio: 0,
      maxChannelDelta: 0,
      averageChannelDelta: 0,
      threshold: Math.min(255, Math.max(0, Number(threshold) || 0)),
      maxMismatchRatio: Math.max(0, Number(maxMismatchRatio) || 0),
      samples: []
    },
    screenshot,
    policy: {
      access: "local-url-only",
      scope: "localhost",
      screenshots: true,
      pixelDiff: true,
      visualDiffImage: true,
      selectorCrop: Boolean(safeSelector),
      baseline: true,
      reusedScreenshot: Boolean(reusedScreenshotPath),
      domInteraction: false
    }
  };
}

async function listManagedProcesses({ probe = false } = {}) {
  const entries = Array.from(managedProcesses.values())
    .filter((entry) => entry.workspace === currentWorkspace)
    .sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)))
    .slice(0, 20);
  if (probe) {
    await Promise.all(entries.map((entry) => probeManagedProcess(entry).catch(() => null)));
  }
  return entries.map(summarizeManagedProcess);
}

async function startManagedProcess(command) {
  const policy = evaluateProcessPolicy(command);
  if (!policy.allowed) {
    const approval = await writeApprovalRequest({
      type: "process",
      command: policy.command,
      policy,
      reason: policy.reason
    });
    return {
      blocked: true,
      status: "blocked",
      exitCode: 126,
      approval,
      policy,
      outputTail: policy.reason
    };
  }

  const id = `proc-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  await fs.mkdir(PROCESS_LOG_DIR, { recursive: true });
  const logPath = path.join(PROCESS_LOG_DIR, `${id}.log`);
  const artifactPath = path.join(PROCESS_LOG_DIR, `${id}.json`);
  const child = spawn(command, {
    cwd: currentWorkspace,
    shell: process.platform === "win32" ? "powershell.exe" : "/bin/sh",
    windowsHide: true,
    env: process.env,
    detached: process.platform !== "win32"
  });
  const entry = {
    id,
    command: policy.command,
    workspace: currentWorkspace,
    startedAt: new Date().toISOString(),
    stoppedAt: "",
    status: "running",
    exitCode: null,
    output: "",
    outputBytes: 0,
    logPath,
    artifactPath,
    probe: inferProcessProbe({ command: policy.command, output: "" }),
    policy,
    child
  };
  const appendOutput = (chunk) => {
    const text = chunk.toString("utf8");
    entry.outputBytes += Buffer.byteLength(text, "utf8");
    entry.output = `${entry.output}${text}`.slice(-30000);
    fs.appendFile(logPath, text, "utf8").catch(() => {});
    if (!entry.probe) entry.probe = inferProcessProbe(entry);
    persistManagedProcessArtifact(entry).catch(() => {});
  };
  child.stdout?.on("data", appendOutput);
  child.stderr?.on("data", appendOutput);
  child.on("close", (code) => {
    entry.status = "exited";
    entry.exitCode = code ?? 0;
    entry.stoppedAt = new Date().toISOString();
    persistManagedProcessArtifact(entry).catch(() => {});
  });
  child.on("error", (error) => {
    entry.status = "error";
    entry.exitCode = 1;
    entry.stoppedAt = new Date().toISOString();
    appendOutput(error.message);
    persistManagedProcessArtifact(entry).catch(() => {});
  });
  managedProcesses.set(id, entry);
  await persistManagedProcessArtifact(entry);
  return summarizeManagedProcess(entry);
}

async function stopManagedProcess(id) {
  if (!/^[\w.-]+$/.test(String(id || ""))) throw new Error("process id 非法。");
  const entry = managedProcesses.get(id);
  if (!entry) throw new Error("未找到受管进程。");
  if (entry.workspace !== currentWorkspace) {
    throw new Error("该受管进程不属于当前工作目录。");
  }
  if (entry.status === "running" || entry.status === "stopping") {
    entry.status = "stopping";
    entry.stoppedAt = new Date().toISOString();
    const pid = Number(entry.child?.pid);
    if (process.platform === "win32" && Number.isInteger(pid) && pid > 0) {
      await new Promise((resolve) => {
        let settled = false;
        const done = () => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve();
        };
        const killer = exec(`taskkill /PID ${pid} /T /F`, { windowsHide: true, timeout: 2500 }, done);
        const timer = setTimeout(() => {
          try {
            killer.kill();
          } catch {
            // Ignore best-effort taskkill cleanup errors.
          }
          done();
        }, 3000);
      });
    } else {
      try {
        process.kill(-pid, "SIGTERM");
      } catch {
        entry.child?.kill?.("SIGTERM");
      }
    }
    await waitForProcessExit(entry, 2500);
    if (entry.status === "stopping") {
      entry.status = "exited";
      entry.exitCode = entry.exitCode ?? null;
      entry.stoppedAt = entry.stoppedAt || new Date().toISOString();
    }
  }
  await persistManagedProcessArtifact(entry);
  return summarizeManagedProcess(entry);
}

async function runCheckCommands(commands = []) {
  if (!commands.length) {
    return {
      ok: false,
      skipped: true,
      checks: [],
      summary: "未发现可自动运行的安全检查命令。"
    };
  }
  const checks = [];
  for (const item of commands) {
    const command = item.command || item;
    const policy = evaluateCommandPolicy(command);
    if (!policy.allowed) {
      checks.push({
        command,
        reason: item.reason || "",
        policy,
        exitCode: 126,
        output: policy.reason
      });
      break;
    }
    const result = await executeCommand(command);
    checks.push({
      command,
      reason: item.reason || "",
      policy: result.policy || policy,
      exitCode: result.exitCode,
      output: result.output
    });
    if (result.exitCode !== 0) break;
  }
  return {
    ok: checks.length > 0 && checks.every((item) => item.exitCode === 0),
    skipped: false,
    checks
  };
}

function runLocalCommand(command, options = {}) {
  return new Promise((resolve) => {
    exec(command, {
      cwd: options.cwd || currentWorkspace,
      timeout: options.timeout || 10000,
      maxBuffer: options.maxBuffer || 256 * 1024,
      windowsHide: true
    }, (error, stdout, stderr) => {
      resolve({
        ok: !error,
        exitCode: error?.code ?? 0,
        output: [stdout, stderr].filter(Boolean).join("\n").replace(/\s+$/g, "")
      });
    });
  });
}

function runLocalProcess(command, args = [], options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: options.cwd || currentWorkspace,
      windowsHide: true,
      shell: false
    });
    const stdout = [];
    const stderr = [];
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    const timer = setTimeout(() => {
      child.kill();
      finish({ ok: false, exitCode: 124, output: `Timed out after ${options.timeout || 10000}ms` });
    }, options.timeout || 10000);
    child.stdout?.on("data", (chunk) => stdout.push(chunk));
    child.stderr?.on("data", (chunk) => stderr.push(chunk));
    child.on("error", (error) => finish({ ok: false, exitCode: error.code || 1, output: error.message }));
    child.on("close", (code) => {
      const output = Buffer.concat([...stdout, ...stderr]).toString("utf8").replace(/\s+$/g, "");
      const clipped = output.slice(0, options.maxBuffer || 256 * 1024);
      finish({ ok: code === 0, exitCode: code ?? 0, output: clipped });
    });
  });
}

function isGitWarningLine(line = "") {
  return /^\s*(?:warning|error):\s+unable to access\b/i.test(String(line || ""));
}

function parseGitStatusOutput(output = "") {
  return String(output || "")
    .split(/\r?\n/)
    .filter((line) => line && !isGitWarningLine(line))
    .filter((line) => /^(?:[ MADRCU?!]{2}|[ MADRCU?!]{1}[ MADRCU?!]{1})\s+/.test(line))
    .slice(0, 80);
}

function changedFilesFromGitStatus(status = []) {
  const files = [];
  for (const line of Array.isArray(status) ? status : []) {
    const value = String(line || "");
    if (value.length < 4) continue;
    const pathPart = value.slice(3).trim();
    if (!pathPart || isGitWarningLine(pathPart)) continue;
    const renamed = /\s+->\s+(.+)$/.exec(pathPart);
    files.push(renamed ? renamed[1].trim() : pathPart);
  }
  return uniqueLimited(files.filter(Boolean), 120);
}

function assertGitSummaryIntegrity(git = {}) {
  if (!git.available) return;
  const status = Array.isArray(git.status) ? git.status : [];
  const changedFiles = Array.isArray(git.changedFiles) ? git.changedFiles : [];
  assertSmoke(!status.some((line) => isGitWarningLine(line)), "git summary status should not include local Git warning lines");
  assertSmoke(!changedFiles.some((file) => isGitWarningLine(file) || /unable to access/i.test(String(file || ""))), "git summary changedFiles should not include Git warning lines");
  assertSmoke(!changedFiles.some((file) => /^EADME\.md$/i.test(String(file || ""))), "git summary changedFiles should preserve leading status-space paths like README.md");
  if (status.some((line) => /\sREADME\.md$/.test(line))) {
    assertSmoke(changedFiles.includes("README.md"), "git summary changedFiles should include README.md when status reports it");
  }
}

async function getGitSummary() {
  const inside = await runLocalCommand("git rev-parse --is-inside-work-tree", { timeout: 5000 });
  if (!inside.ok || inside.output.split(/\r?\n/)[0] !== "true") {
    return { available: false, branch: "", root: "", status: [], changedFiles: [], remotes: [], upstream: "" };
  }

  const branchResult = await runLocalCommand("git branch --show-current", { timeout: 5000 });
  const rootResult = await runLocalCommand("git rev-parse --show-toplevel", { timeout: 5000 });
  const statusResult = await runLocalCommand("git status --short", { timeout: 5000 });
  const remoteResult = await runLocalCommand("git remote -v", { timeout: 5000 });
  const upstreamResult = await runLocalCommand("git rev-parse --abbrev-ref --symbolic-full-name @{upstream}", { timeout: 5000 });

  const status = parseGitStatusOutput(statusResult.output);
  const remotes = remoteResult.output
    ? remoteResult.output.split(/\r?\n/)
      .filter((line) => !isGitWarningLine(line))
      .map((line) => /^(\S+)\s+(\S+)\s+\((fetch|push)\)$/.exec(line))
      .filter(Boolean)
      .map((match) => ({ name: match[1], url: match[2], direction: match[3], provider: inferGitProvider(match[2]) }))
    : [];
  return {
    available: true,
    branch: branchResult.output,
    root: rootResult.output,
    status,
    changedFiles: changedFilesFromGitStatus(status),
    remotes,
    upstream: upstreamResult.ok ? upstreamResult.output : ""
  };
}

function inferGitProvider(remoteUrl = "") {
  const value = String(remoteUrl || "").toLowerCase();
  if (value.includes("github.com")) return "github";
  if (value.includes("gitlab.com")) return "gitlab";
  if (value.includes("gitee.com")) return "gitee";
  if (value.includes("bitbucket.org")) return "bitbucket";
  if (value.includes("dev.azure.com") || value.includes("visualstudio.com")) return "azure-devops";
  return value ? "custom" : "";
}

function parseGitRemoteProject(remoteUrl = "") {
  const raw = String(remoteUrl || "").trim();
  if (!raw) return { provider: "", host: "", owner: "", repo: "", webUrl: "" };
  const cleanRepo = (value = "") => value.replace(/\.git$/i, "").replace(/^\/+|\/+$/g, "");
  const fromParts = (provider, host, owner, repo) => {
    const normalizedRepo = cleanRepo(repo);
    const webUrl = provider === "gitee" && owner && normalizedRepo
      ? `https://gitee.com/${owner}/${normalizedRepo}`
      : provider === "github" && owner && normalizedRepo
        ? `https://github.com/${owner}/${normalizedRepo}`
        : provider === "gitlab" && owner && normalizedRepo
          ? `https://gitlab.com/${owner}/${normalizedRepo}`
          : "";
    return { provider, host, owner, repo: normalizedRepo, webUrl };
  };
  try {
    const parsed = new URL(raw.replace(/^git@([^:]+):(.+)$/i, "ssh://git@$1/$2"));
    const provider = inferGitProvider(parsed.hostname);
    const parts = cleanRepo(decodeURIComponent(parsed.pathname || "")).split("/").filter(Boolean);
    return fromParts(provider, parsed.hostname, parts[0] || "", parts.slice(1).join("/") || "");
  } catch {
    const scp = /^git@([^:]+):(.+)$/i.exec(raw);
    if (scp) {
      const provider = inferGitProvider(scp[1]);
      const parts = cleanRepo(scp[2]).split("/").filter(Boolean);
      return fromParts(provider, scp[1], parts[0] || "", parts.slice(1).join("/") || "");
    }
  }
  return { provider: inferGitProvider(raw), host: "", owner: "", repo: "", webUrl: "" };
}

function primaryGitRemote(git = {}) {
  return git.remotes?.find((item) => item.direction === "push")
    || git.remotes?.find((item) => item.direction === "fetch")
    || git.remotes?.[0]
    || null;
}

async function readGitRemoteConfigSummary() {
  const configPath = path.join(currentWorkspace, ".git", "config");
  const text = await fs.readFile(configPath, "utf8").catch(() => "");
  const remotes = [];
  let currentRemote = "";
  for (const line of text.split(/\r?\n/)) {
    const section = /^\s*\[remote\s+"([^"]+)"\]\s*$/.exec(line);
    if (section) {
      currentRemote = section[1];
      continue;
    }
    const url = /^\s*url\s*=\s*(.+?)\s*$/.exec(line);
    if (currentRemote && url) {
      remotes.push({
        name: currentRemote,
        url: url[1],
        direction: "push",
        provider: inferGitProvider(url[1])
      });
    }
  }
  const remote = primaryGitRemote({ remotes });
  const remoteProject = parseGitRemoteProject(remote?.url || "");
  return {
    available: Boolean(text),
    remotes,
    primaryRemote: remote,
    provider: remote?.provider || remoteProject.provider || "",
    remoteProject
  };
}

function buildRemoteProviderPermissionRows({ provider = "", remoteProject = {}, packages = null } = {}) {
  const normalizedProvider = String(provider || remoteProject?.provider || "").toLowerCase();
  const manualProvider = normalizedProvider === "gitee";
  const remoteScope = remoteProject?.webUrl || "configuredRemotes";
  const commonEvidence = [
    "/api/pr-readiness",
    "/api/remote-publish-plan",
    "/api/remote-publish-preflight",
    "/api/remote-publish-continuation",
    "/api/remote-publish-evidence",
    ".forge/remote-publish"
  ];
  const base = {
    provider: "git-remote",
    remoteProvider: normalizedProvider || "unknown",
    manualProvider,
    remoteProject: remoteProject || {},
    scope: remoteScope,
    writesRemote: false,
    remoteWriteEnabled: false,
    pushes: false,
    createsRemotePr: false,
    writesRemoteComments: false
  };
  const createAction = manualProvider
    ? "create_gitee_pr_manual"
    : normalizedProvider === "gitlab"
      ? "create_gitlab_mr"
      : normalizedProvider === "github"
        ? "create_github_pr"
        : "create_pr";
  const commentAction = manualProvider
    ? "comment_gitee_pr_manual"
    : normalizedProvider === "gitlab"
      ? "comment_gitlab_mr"
      : normalizedProvider === "github"
        ? "comment_github_pr"
        : "comment_pr";
  return [
    {
      ...base,
      action: "read_pr_ci",
      access: manualProvider ? "manual-evidence-read" : "remote-read-only",
      requiresApproval: false,
      requiresExternalExecution: manualProvider,
      requiresExternalEvidence: manualProvider,
      executesCommands: false,
      writesFiles: true,
      evidence: ["/api/pr-readiness", "/api/remote-pr-status", "/api/ci-status", ...commonEvidence]
    },
    {
      ...base,
      action: "push_branch",
      access: "external-approval-required",
      requiresApproval: true,
      requiresExternalExecution: true,
      requiresExternalEvidence: true,
      executesCommands: false,
      writesFiles: true,
      actualRemoteWrite: "manual/external",
      evidence: ["/api/remote-publish-plan", "/api/remote-publish-preflight", "/api/remote-publish-continuation", ".forge/approvals"]
    },
    {
      ...base,
      action: createAction,
      access: manualProvider ? "manual-provider-external-action" : "external-cli-approval-required",
      requiresApproval: true,
      requiresExternalExecution: true,
      requiresExternalEvidence: true,
      executesCommands: false,
      writesFiles: true,
      actualRemoteWrite: "manual/external",
      evidence: commonEvidence
    },
    {
      ...base,
      action: commentAction,
      access: manualProvider ? "manual-provider-external-action" : "external-cli-approval-required",
      requiresApproval: true,
      requiresExternalExecution: true,
      requiresExternalEvidence: true,
      executesCommands: false,
      writesFiles: true,
      actualRemoteWrite: "manual/external",
      evidence: commonEvidence
    },
    {
      ...base,
      action: "ingest_external_evidence",
      access: "local-artifact-only",
      requiresApproval: false,
      requiresExternalExecution: false,
      requiresExternalEvidence: false,
      executesCommands: false,
      writesFiles: true,
      writesLocalArtifacts: true,
      actualRemoteWrite: "none",
      externalEvidencePackages: packages?.summary?.withExternalEvidence || 0,
      evidence: ["/api/remote-publish-evidence", "external-evidence.json", "external-evidence-summary.md", ".forge/remote-publish"]
    }
  ];
}

async function findCiConfigs() {
  const candidates = [
    ".github/workflows",
    ".gitlab-ci.yml",
    ".gitlab-ci.yaml",
    "azure-pipelines.yml",
    "azure-pipelines.yaml",
    ".circleci/config.yml",
    ".buildkite/pipeline.yml",
    "Jenkinsfile"
  ];
  const configs = [];
  for (const candidate of candidates) {
    const full = path.join(currentWorkspace, candidate);
    const stat = await fs.stat(full).catch(() => null);
    if (!stat) continue;
    if (stat.isDirectory()) {
      const entries = await fs.readdir(full, { withFileTypes: true }).catch(() => []);
      for (const entry of entries) {
        if (entry.isFile() && [".yml", ".yaml"].includes(path.extname(entry.name).toLowerCase())) {
          const relativePath = toPosix(path.join(candidate, entry.name));
          configs.push({ path: relativePath, provider: "github-actions", type: "workflow" });
        }
      }
    } else if (stat.isFile()) {
      const provider = candidate.includes("gitlab") ? "gitlab-ci"
        : candidate.includes("azure") ? "azure-pipelines"
          : candidate.includes("circleci") ? "circleci"
            : candidate.includes("buildkite") ? "buildkite"
              : candidate === "Jenkinsfile" ? "jenkins" : "ci";
      configs.push({ path: toPosix(candidate), provider, type: "config" });
    }
  }
  return configs.sort((a, b) => a.path.localeCompare(b.path));
}

async function buildVerificationPlan({ commands = [], limit = 12 } = {}) {
  const max = Math.min(40, Math.max(1, Number(limit) || 12));
  const filesPromise = listFiles();
  const [ci, tasks, diffEvidence, scripts, files] = await Promise.all([
    findCiConfigs(),
    listTaskLogs(8),
    getCurrentDiffEvidence({ includeDiff: false }),
    readPackageScripts(),
    filesPromise
  ]);
  const [discoveredChecks, typecheck] = await Promise.all([
    discoverCheckCommands(commands),
    discoverTypecheckCommands({ scripts, files, limit: 8 })
  ]);
  const recentChecks = tasks.flatMap((task) => (task.checks || []).map((check) => ({
    taskId: task.id,
    taskStatus: task.status,
    command: check.command,
    reason: check.reason || "",
    exitCode: check.exitCode,
    ok: check.exitCode === 0,
    createdAt: task.createdAt || ""
  }))).slice(0, max);
  const failedRecentChecks = recentChecks.filter((check) => !check.ok);
  const scriptChecks = CHECK_SCRIPT_NAMES
    .filter((name) => scripts[name])
    .map((name) => ({ name, script: scripts[name], safeParts: extractSafeScriptCommands(scripts[name]) }));
  const gates = [
    {
      id: "local-checks",
      label: "Local safe checks",
      status: discoveredChecks.length ? "ready" : "missing",
      evidence: discoveredChecks.map((item) => item.command)
    },
    {
      id: "ci-config",
      label: "CI configuration",
      status: ci.length ? "ready" : "missing",
      evidence: ci.map((item) => `${item.provider}:${item.path}`)
    },
    {
      id: "typecheck",
      label: "TypeScript typecheck",
      status: typecheck.commands?.length ? "ready" : ((typecheck.tsconfigs?.length || typecheck.hasTsFiles) ? "missing" : "not-applicable"),
      evidence: typecheck.commands?.length
        ? typecheck.commands.map((item) => item.command)
        : [...(typecheck.tsconfigs || []), typecheck.hasTsFiles ? "TypeScript source files detected" : ""].filter(Boolean)
    },
    {
      id: "recent-verification",
      label: "Recent verification evidence",
      status: recentChecks.length ? (failedRecentChecks.length ? "failing" : "passing") : "missing",
      evidence: recentChecks.map((item) => `${item.ok ? "PASS" : "FAIL"} ${item.command}`)
    },
    {
      id: "diff-scope",
      label: "Changed file scope",
      status: diffEvidence.git?.changedFiles?.length ? "ready" : "clean",
      evidence: (diffEvidence.git?.changedFiles || []).slice(0, max)
    }
  ];
  const blockers = [];
  if (!discoveredChecks.length) blockers.push("未发现可安全自动运行的本地检查命令。");
  if ((typecheck.tsconfigs?.length || typecheck.hasTsFiles) && !typecheck.commands?.length) blockers.push("检测到 TypeScript 项目线索，但未发现可安全运行的类型检查命令。");
  if (!ci.length) blockers.push("未发现 CI 配置文件。");
  if (failedRecentChecks.length) blockers.push(`${failedRecentChecks.length} 个最近检查失败。`);
  return {
    generatedAt: new Date().toISOString(),
    workspace: currentWorkspace,
    status: blockers.length ? "needs_attention" : "ready",
    summary: {
      gates: gates.length,
      ready: gates.filter((item) => item.status === "ready" || item.status === "passing" || item.status === "clean").length,
      blockers: blockers.length,
      commands: discoveredChecks.length,
      typecheckCommands: typecheck.commands?.length || 0,
      tsconfigs: typecheck.tsconfigs?.length || 0,
      hasTsFiles: Boolean(typecheck.hasTsFiles),
      ciConfigs: ci.length,
      recentChecks: recentChecks.length,
      changedFiles: diffEvidence.git?.changedFiles?.length || 0
    },
    gates,
    commands: discoveredChecks.slice(0, max),
    typecheck,
    ci,
    scriptChecks,
    recentChecks,
    changedFiles: (diffEvidence.git?.changedFiles || []).slice(0, max),
    blockers,
    policy: {
      access: "local-read-only",
      scope: "currentWorkspace",
      executesCommands: false,
      pushes: false,
      createsRemotePr: false
    }
  };
}

async function buildCiStatus({ deep = false, persist = false, limit = 20 } = {}) {
  const max = Math.min(80, Math.max(1, Number(limit) || 20));
  const [git, ci, verificationPlan, tasks] = await Promise.all([
    getGitSummary(),
    findCiConfigs(),
    buildVerificationPlan({ limit: max }),
    listTaskLogs(max)
  ]);
  const localChecks = tasks.flatMap((task) => (task.checks || []).map((check) => ({
    taskId: task.id,
    taskStatus: task.status,
    command: check.command,
    reason: check.reason || "",
    exitCode: check.exitCode,
    ok: check.exitCode === 0,
    createdAt: task.createdAt || ""
  }))).slice(0, max);
  const provider = git.remotes?.find((item) => item.direction === "push")?.provider
    || git.remotes?.[0]?.provider
    || "";
  const remote = deep
    ? await readRemotePrStatus(git)
    : {
      provider,
      available: false,
      authenticated: false,
      reason: "默认跳过远端 CLI 探测；使用 /api/ci-status?deep=1 执行远端 PR/CI 读取。",
      pr: null,
      checks: [],
      policy: { access: "remote-read-only", pushes: false, createsRemotePr: false, skipped: true }
    };
  const remoteChecks = Array.isArray(remote.checks) ? remote.checks : [];
  const localFailures = localChecks.filter((check) => !check.ok);
  const remoteFailures = remoteChecks.filter((check) => {
    const state = String(check.state || "").toUpperCase();
    return state && !["SUCCESS", "COMPLETED", "PASSED", "PASS"].includes(state);
  });
  const blockers = [];
  if (!ci.length) blockers.push("未发现本地 CI 配置。");
  if (localFailures.length) blockers.push(`${localFailures.length} 个最近本地检查失败。`);
  if (deep && !remote.available) blockers.push(`远端 CI 状态不可用：${remote.reason}`);
  if (remoteFailures.length) blockers.push(`${remoteFailures.length} 个远端检查未通过或未完成。`);
  const status = blockers.length ? "needs_attention" : (ci.length || localChecks.length || remoteChecks.length ? "ready" : "missing");
  const artifact = {
    generatedAt: new Date().toISOString(),
    workspace: currentWorkspace,
    status,
    provider,
    deep: Boolean(deep),
    summary: {
      ciConfigs: ci.length,
      localChecks: localChecks.length,
      localFailures: localFailures.length,
      remoteChecks: remoteChecks.length,
      remoteFailures: remoteFailures.length,
      gates: verificationPlan.summary?.gates || 0,
      blockers: blockers.length
    },
    ci,
    localChecks,
    remote,
    verificationPlan: {
      status: verificationPlan.status,
      summary: verificationPlan.summary,
      gates: verificationPlan.gates,
      blockers: verificationPlan.blockers
    },
    blockers,
    policy: {
      access: "local-and-remote-read-only",
      executesCommands: false,
      pushes: false,
      createsRemotePr: false,
      writesRemoteComments: false,
      remoteCliProbe: Boolean(deep)
    }
  };
  if (persist) {
    const id = `ci-status-${new Date().toISOString().replace(/[:.]/g, "-")}`;
    await fs.mkdir(REMOTE_CI_DIR, { recursive: true });
    const artifactPath = path.join(REMOTE_CI_DIR, `${id}.json`);
    await fs.writeFile(artifactPath, JSON.stringify(artifact, null, 2), "utf8");
    artifact.artifact = {
      id,
      path: toPosix(path.relative(APP_ROOT, artifactPath))
    };
  }
  return artifact;
}

function summarizeDebugFindings({ verificationPlan, ciStatus, processHealth, trace, semanticDiagnostics, checksResult }) {
  const findings = [];
  const add = (severity, area, message, evidence = []) => {
    if (!message) return;
    findings.push({
      severity,
      area,
      message,
      evidence: Array.isArray(evidence) ? evidence.filter(Boolean).slice(0, 8) : [String(evidence)]
    });
  };

  for (const blocker of verificationPlan?.blockers || []) {
    add("warn", "verification", blocker, verificationPlan?.commands?.map((item) => item.command) || []);
  }
  for (const blocker of ciStatus?.blockers || []) {
    add("warn", "ci", blocker, ciStatus?.ci?.map((item) => item.path) || []);
  }
  for (const row of processHealth?.rows || []) {
    if (!row.ok || row.health === "failed" || row.rules?.failed) {
      add(
        row.active ? "error" : "warn",
        "process",
        `${row.command || row.id} 状态异常：${row.health || row.status || "unknown"}`,
        [
          row.probe?.url,
          row.probe?.status ? `HTTP ${row.probe.status}` : "",
          row.rules?.failed ? "health rule failed" : "",
          row.outputTail ? row.outputTail.slice(-800) : ""
        ]
      );
    }
  }
  if (trace) {
    const exceptions = trace.summary?.exceptions || 0;
    const failedNetwork = (trace.network || []).filter((item) => item.status >= 400 || item.failed).length;
    const consoleErrors = (trace.console || []).filter((item) => /error|assert/i.test(item.type || item.level || "")).length;
    if (!trace.ok) add("error", "browser", "页面 Trace 采集异常。", [trace.error || trace.reason || trace.finalUrl || trace.url]);
    if (exceptions) add("error", "browser", `${exceptions} 个浏览器运行时异常。`, (trace.exceptions || []).map((item) => item.text || item.description || item.url));
    if (consoleErrors) add("warn", "browser", `${consoleErrors} 条 console error/assert。`, (trace.console || []).map((item) => item.text || item.message).slice(0, 6));
    if (failedNetwork) add("warn", "browser", `${failedNetwork} 个网络请求失败或返回 4xx/5xx。`, (trace.network || []).filter((item) => item.status >= 400 || item.failed).map((item) => `${item.status || "FAIL"} ${item.url}`).slice(0, 6));
  }
  const semanticIssueCount = countSemanticDiagnosticIssues(semanticDiagnostics);
  if (semanticIssueCount) {
    const diagnostics = semanticDiagnostics.diagnostics || semanticDiagnostics.items || [];
    add("warn", "code", `${semanticIssueCount} 个语义诊断项需要关注。`, diagnostics.map((item) => `${item.category || item.kind || item.type || "issue"} ${item.path || ""}:${item.line || ""}`));
  }
  if (checksResult && !checksResult.skipped && !checksResult.ok) {
    const failed = (checksResult.checks || []).find((item) => item.exitCode !== 0);
    add("error", "checks", `安全检查失败：${failed?.command || "unknown"}`, [failed?.output || ""]);
  }

  return findings;
}

function buildBrowserTraceTriage(trace = null) {
  const findings = [];
  const addFinding = (severity, area, message, evidence = "") => {
    if (!message) return;
    findings.push({
      severity,
      area,
      message: String(message).slice(0, 500),
      evidence: String(evidence || "").slice(0, 800)
    });
  };
  if (!trace) {
    return {
      status: "not_captured",
      counts: {},
      findings: [],
      nextActions: ["需要页面级调试时，填入本地 URL 并开启 Trace。"]
    };
  }
  if (trace.ok === false) {
    addFinding("error", "trace", "页面 Trace 采集失败。", trace.error || trace.reason || trace.url || trace.finalUrl || "");
  }
  for (const item of (Array.isArray(trace.exceptions) ? trace.exceptions : []).slice(0, 8)) {
    const locationEvidence = (item.sourceLocations || [])
      .map((location) => `${location.path}:${location.line}:${location.column}`)
      .join(" · ");
    addFinding("error", "exception", item.text || item.message || item.description || "浏览器运行时异常。", locationEvidence || item.stack || item.url || "");
  }
  for (const item of (Array.isArray(trace.console) ? trace.console : [])) {
    const level = String(item.type || item.level || "").toLowerCase();
    if (!/error|warning|warn|assert/.test(level)) continue;
    addFinding(level.includes("error") || level.includes("assert") ? "error" : "warn", "console", item.text || item.message || "console 异常输出。", item.location || item.url || "");
    if (findings.filter((finding) => finding.area === "console").length >= 8) break;
  }
  for (const item of (Array.isArray(trace.network) ? trace.network : [])) {
    const status = Number(item.status || 0);
    if (!item.failed && status < 400) continue;
    addFinding(status >= 500 || item.failed ? "error" : "warn", "network", `${item.method || "GET"} ${item.url || item.requestUrl || ""}`.trim(), item.errorText || item.failure || (status ? `HTTP ${status}` : ""));
    if (findings.filter((finding) => finding.area === "network").length >= 8) break;
  }
  if (!findings.length && trace.ok !== false) {
    addFinding("pass", "browser", "未发现明显浏览器异常。", trace.finalUrl || trace.url || "");
  }
  const priority = { error: 3, warn: 2, review: 1, pass: 0 };
  findings.sort((a, b) => (priority[b.severity] || 0) - (priority[a.severity] || 0));
  const counts = findings.reduce((acc, item) => {
    acc[item.severity] = (acc[item.severity] || 0) + 1;
    return acc;
  }, {});
  const status = findings.some((item) => item.severity === "error")
    ? "error"
    : findings.some((item) => item.severity === "warn")
      ? "warn"
      : "pass";
  const nextActions = status === "error"
    ? [
      "优先处理浏览器 error：runtime exception、console error、5xx 或 failed network。",
      "修复后重新运行页面检查和 Trace，确认 error 数量归零。",
      "如果异常来自 API 响应，同时运行后端语法检查和 debug smoke。"
    ]
    : status === "warn"
      ? [
        "复核 warning 是否影响当前功能路径。",
        "修复或确认误报后重跑页面 Trace。",
        "保留 warning 处置说明，避免后续调试重复追查。"
      ]
      : [
        "继续验证目标功能路径。",
        "需要 UI 回归保护时再跑截图、DOM 或视觉断言。",
        "保留 Trace artifact 作为本轮页面健康证据。"
      ];
  return {
    status,
    counts,
    findings: findings.slice(0, 16),
    nextActions
  };
}

function countSemanticDiagnosticIssues(semanticDiagnostics) {
  const summary = semanticDiagnostics?.summary || {};
  const summaryCount = Number(summary.issues ?? summary.total ?? summary.count ?? 0);
  if (Number.isFinite(summaryCount) && summaryCount > 0) return summaryCount;
  return (semanticDiagnostics?.diagnostics || semanticDiagnostics?.items || []).length;
}

function buildDebugNextActions({ verificationPlan, processHealth, trace, traceTriage = null, findings, checksResult }) {
  const actions = [];
  const addAction = (action) => {
    const normalized = {
      id: String(action.id || `debug-action-${actions.length + 1}`).slice(0, 80),
      label: String(action.label || action.id || "下一步").slice(0, 80),
      priority: Number.isFinite(Number(action.priority)) ? Number(action.priority) : 50,
      kind: String(action.kind || (action.command ? "command" : "inspect")).slice(0, 40),
      command: String(action.command || "").trim(),
      target: String(action.target || "").slice(0, 500),
      description: String(action.description || "").slice(0, 500),
      evidence: (Array.isArray(action.evidence) ? action.evidence : [action.evidence])
        .map((item) => String(item || "").trim())
        .filter(Boolean)
        .slice(0, 6)
    };
    if (!actions.some((item) => item.id === normalized.id || (normalized.command && item.command === normalized.command))) {
      actions.push(normalized);
    }
  };
  const debugSmoke = (verificationPlan?.commands || []).find((item) => String(item.command || "").includes("--api-smoke-section=debug"));
  if (debugSmoke) {
    addAction({
      id: "run-debug-smoke",
      label: "运行调试 smoke",
      priority: findings.some((item) => item.area === "browser" || item.area === "process") ? 95 : 75,
      kind: "command",
      command: debugSmoke.command,
      description: "优先跑调试分段 smoke，快速验证浏览器、诊断、运行时和门禁链路。",
      evidence: [debugSmoke.reason || "verification plan", `${findings.length} findings`]
    });
  }
  if (verificationPlan?.commands?.length) {
    addAction({
      id: "run-safe-checks",
      label: "运行安全检查",
      priority: checksResult?.skipped ? 90 : 70,
      kind: "command",
      command: verificationPlan.commands[0].command,
      description: "先执行首个本地安全检查，失败后可交给修复代理生成 diff。",
      evidence: [verificationPlan.commands[0].reason || "discovered safe check", verificationPlan.status || ""]
    });
  }
  const failedProcess = (processHealth?.rows || []).find((row) => !row.ok || row.health === "failed" || row.rules?.failed);
  if (failedProcess?.logPath || failedProcess?.outputTail) {
    const failedRules = (failedProcess.rules?.results || [])
      .filter((item) => !item.ok)
      .flatMap((item) => item.failures || [])
      .slice(0, 4);
    addAction({
      id: "inspect-process-log",
      label: "查看进程日志",
      priority: failedProcess.rules?.failed ? 98 : 88,
      kind: "inspect",
      command: failedProcess.command || "",
      target: failedProcess.logPath || failedProcess.artifactPath || failedProcess.id || "",
      description: `优先排查 ${failedProcess.command || failedProcess.id} 的输出尾部、健康探针和规则失败原因。`,
      evidence: [
        `health=${failedProcess.health || "unknown"}`,
        failedProcess.probe?.url || "",
        ...failedRules
      ]
    });
  }
  if (trace && ((trace.summary?.exceptions || 0) || (trace.console || []).length)) {
    const failedNetwork = (trace.network || []).filter((item) => item.failed || item.status >= 400).slice(0, 4);
    const traceSourceLocations = extractBrowserTraceSourceLocations(trace, 8);
    if (traceSourceLocations.length) {
      addAction({
        id: "inspect-browser-source",
        label: "定位浏览器异常源码",
        priority: 99,
        kind: "inspect",
        command: "",
        target: traceSourceLocations.map((item) => `${item.path}:${item.line}`).join(", "),
        description: "把 Runtime exception 或 console error 的 URL/行号映射回工作区文件，优先读取附近源码修复。",
        evidence: traceSourceLocations.map((item) => `${item.path}:${item.line}:${item.column}`).slice(0, 6)
      });
    }
    addAction({
      id: "inspect-browser-trace",
      label: "查看页面 Trace",
      priority: (trace.summary?.exceptions || 0) ? 96 : 84,
      kind: "inspect",
      command: "",
      target: trace.artifactPath || trace.finalUrl || trace.url || "",
      description: "打开 Trace 详情，按 runtime exception、console error、失败请求定位前端问题。",
      evidence: [
        `${trace.summary?.exceptions || 0} exceptions`,
        `${(trace.console || []).length} console entries`,
        ...failedNetwork.map((item) => `${item.status || "FAIL"} ${item.url || ""}`)
      ]
    });
  }
  if (traceTriage?.findings?.some((item) => item.severity === "error")) {
    const firstError = traceTriage.findings.find((item) => item.severity === "error");
    addAction({
      id: "inspect-browser-triage",
      label: "按异常分诊查页面",
      priority: 97,
      kind: "inspect",
      command: "",
      target: trace?.artifactPath || trace?.finalUrl || trace?.url || "",
      description: "按浏览器异常分诊优先处理 runtime exception、console error、失败网络或页面检查错误。",
      evidence: [
        `${traceTriage.counts?.error || 0} browser errors`,
        firstError ? `${firstError.area}: ${firstError.message}` : "",
        ...(traceTriage.nextActions || []).slice(0, 2)
      ]
    });
  } else if (traceTriage?.findings?.some((item) => item.severity === "warn")) {
    const firstWarn = traceTriage.findings.find((item) => item.severity === "warn");
    addAction({
      id: "review-browser-triage",
      label: "复核页面 warning",
      priority: 83,
      kind: "inspect",
      command: "",
      target: trace?.artifactPath || trace?.finalUrl || trace?.url || "",
      description: "页面 Trace 没有 error，但存在 warning，需要确认是否影响当前功能路径。",
      evidence: [
        `${traceTriage.counts?.warn || 0} browser warnings`,
        firstWarn ? `${firstWarn.area}: ${firstWarn.message}` : ""
      ]
    });
  }
  if (findings.some((item) => item.area === "code")) {
    addAction({
      id: "inspect-code-diagnostics",
      label: "查看语义诊断",
      priority: 82,
      kind: "inspect",
      command: "",
      description: "从重复声明、未解析导入、重复路由或 API 调用缺口开始排查。",
      evidence: findings.filter((item) => item.area === "code").flatMap((item) => item.evidence || []).slice(0, 6)
    });
  }
  if (checksResult?.skipped) {
    addAction({
      id: "add-check-script",
      label: "补检查脚本",
      priority: verificationPlan?.commands?.length ? 55 : 78,
      kind: "repair",
      command: "",
      target: "package.json",
      description: "当前未发现可自动运行的安全检查命令，建议在 package.json 增加 check/test/lint。",
      evidence: [checksResult.summary || "checks skipped"]
    });
  }
  return actions
    .sort((a, b) => (b.priority || 0) - (a.priority || 0))
    .slice(0, 8);
}

async function buildDebugDiagnostics({
  url: targetUrl = "",
  commands = [],
  includeTrace = false,
  runChecks = false,
  waitMs = 1500,
  limit = 20
} = {}) {
  const max = Math.min(60, Math.max(1, Number(limit) || 20));
  const requestedCommands = Array.isArray(commands) ? commands : [];
  const [verificationPlan, ciStatus, processHealth, semanticDiagnostics, codeOverview] = await Promise.all([
    buildVerificationPlan({ commands: requestedCommands, limit: max }),
    buildCiStatus({ limit: max, persist: false }),
    buildManagedProcessHealth({ limit: max }),
    buildSemanticDiagnostics({ limit: max, includeContext: false }).catch((error) => ({
      summary: { issues: 1 },
      diagnostics: [{ kind: "semantic-diagnostics-error", message: error.message }]
    })),
    buildCodeIntelligenceOverview({ limit: Math.min(max, 24), includeDiagnostics: false }).catch((error) => ({
      error: error.message
    }))
  ]);

  const checkCommands = verificationPlan.commands || [];
  const checksResult = runChecks ? await runCheckCommands(checkCommands) : {
    ok: false,
    skipped: true,
    checks: [],
    summary: "默认只读诊断未运行检查命令；点击运行建议命令或传入 runChecks=true。"
  };
  const trace = includeTrace && String(targetUrl || "").trim()
    ? await captureBrowserTrace(targetUrl, { waitMs: Number(waitMs) || 1500 }).catch((error) => ({
      ok: false,
      url: targetUrl,
      error: error.message,
      summary: { console: 0, exceptions: 1, network: 0 },
      console: [],
      exceptions: [{ text: error.message }],
      network: []
    }))
    : null;
  const findings = summarizeDebugFindings({
    verificationPlan,
    ciStatus,
    processHealth,
    trace,
    semanticDiagnostics,
    checksResult
  });
  const severityRank = { error: 3, warn: 2, info: 1 };
  findings.sort((a, b) => (severityRank[b.severity] || 0) - (severityRank[a.severity] || 0));
  const browserTriage = buildBrowserTraceTriage(trace);
  const browserSourceLocations = extractBrowserTraceSourceLocations(trace, max);
  const status = findings.some((item) => item.severity === "error")
    ? "failing"
    : findings.some((item) => item.severity === "warn")
      ? "needs_attention"
      : "ready";
  return {
    generatedAt: new Date().toISOString(),
    workspace: currentWorkspace,
    status,
    summary: {
      findings: findings.length,
      errors: findings.filter((item) => item.severity === "error").length,
      warnings: findings.filter((item) => item.severity === "warn").length,
      safeCommands: checkCommands.length,
      checksRun: Boolean(runChecks),
      processRows: processHealth.rows?.length || 0,
      traceCaptured: Boolean(trace),
      browserTriageStatus: browserTriage.status,
      browserSourceLocations: browserSourceLocations.length,
      semanticIssues: countSemanticDiagnosticIssues(semanticDiagnostics)
    },
    findings,
    browserTriage,
    browserSourceLocations,
    nextActions: buildDebugNextActions({ verificationPlan, processHealth, trace, traceTriage: browserTriage, findings, checksResult }),
    verificationPlan: {
      status: verificationPlan.status,
      summary: verificationPlan.summary,
      commands: checkCommands,
      blockers: verificationPlan.blockers,
      gates: verificationPlan.gates
    },
    ciStatus: {
      status: ciStatus.status,
      provider: ciStatus.provider,
      summary: ciStatus.summary,
      blockers: ciStatus.blockers,
      ci: ciStatus.ci
    },
    processHealth,
    browserTrace: trace,
    semanticDiagnostics: {
      summary: semanticDiagnostics.summary,
      diagnostics: (semanticDiagnostics.diagnostics || semanticDiagnostics.items || []).slice(0, max)
    },
    codeOverview: {
      summary: codeOverview.summary || null,
      entrypoints: codeOverview.entrypoints || [],
      apiSurface: codeOverview.apiSurface || codeOverview.routes || [],
      hotspots: codeOverview.hotspots || []
    },
    checksResult,
    policy: {
      access: "local-debug-read-mostly",
      scope: "currentWorkspace",
      executesCommands: Boolean(runChecks),
      commandExecutionRequiresRunChecks: true,
      capturesBrowserTrace: Boolean(includeTrace && targetUrl),
      pushes: false,
      createsRemotePr: false
    }
  };
}

function parseJsonOutput(output = "", fallback = null) {
  try {
    return JSON.parse(String(output || "").trim());
  } catch {
    return fallback;
  }
}

async function readGithubRemoteStatus(git) {
  const cli = await runLocalCommand("gh --version", { timeout: 5000, maxBuffer: 128 * 1024 });
  if (!cli.ok) {
    return {
      provider: "github",
      available: false,
      authenticated: false,
      reason: "未检测到 GitHub CLI gh。",
      pr: null,
      checks: [],
      raw: ""
    };
  }
  const auth = await runLocalCommand("gh auth status", { timeout: 8000, maxBuffer: 128 * 1024 });
  if (!auth.ok) {
    return {
      provider: "github",
      available: false,
      authenticated: false,
      reason: auth.output || "GitHub CLI 未认证。",
      cli: cli.output.split(/\r?\n/)[0] || "gh",
      pr: null,
      checks: [],
      raw: auth.output
    };
  }
  const prResult = await runLocalCommand(
    "gh pr view --json number,title,state,url,headRefName,baseRefName,isDraft,reviewDecision,mergeStateStatus,statusCheckRollup",
    { timeout: 12000, maxBuffer: 512 * 1024 }
  );
  if (!prResult.ok) {
    return {
      provider: "github",
      available: true,
      authenticated: true,
      reason: prResult.output || `当前分支 ${git.branch || ""} 未关联 GitHub PR。`,
      cli: cli.output.split(/\r?\n/)[0] || "gh",
      pr: null,
      checks: [],
      raw: prResult.output
    };
  }
  const pr = parseJsonOutput(prResult.output, null);
  const checks = Array.isArray(pr?.statusCheckRollup)
    ? pr.statusCheckRollup.map((item) => ({
        name: item.name || item.context || item.workflowName || "check",
        state: item.state || item.conclusion || item.status || "",
        url: item.targetUrl || item.detailsUrl || item.url || "",
        startedAt: item.startedAt || "",
        completedAt: item.completedAt || ""
      }))
    : [];
  const failing = checks.filter((item) => !["SUCCESS", "COMPLETED", "PASSED", "PASS"].includes(String(item.state || "").toUpperCase()));
  return {
    provider: "github",
    available: true,
    authenticated: true,
    reason: "",
    cli: cli.output.split(/\r?\n/)[0] || "gh",
    pr: pr ? {
      number: pr.number,
      title: pr.title,
      state: pr.state,
      url: pr.url,
      headRefName: pr.headRefName,
      baseRefName: pr.baseRefName,
      isDraft: pr.isDraft,
      reviewDecision: pr.reviewDecision || "",
      mergeStateStatus: pr.mergeStateStatus || ""
    } : null,
    checks,
    summary: {
      totalChecks: checks.length,
      failingChecks: failing.length,
      reviewDecision: pr?.reviewDecision || "",
      mergeStateStatus: pr?.mergeStateStatus || ""
    }
  };
}

async function readGitlabRemoteStatus(git) {
  const cli = await runLocalCommand("glab --version", { timeout: 5000, maxBuffer: 128 * 1024 });
  if (!cli.ok) {
    return {
      provider: "gitlab",
      available: false,
      authenticated: false,
      reason: "未检测到 GitLab CLI glab。",
      pr: null,
      checks: [],
      raw: ""
    };
  }
  const auth = await runLocalCommand("glab auth status", { timeout: 8000, maxBuffer: 128 * 1024 });
  if (!auth.ok) {
    return {
      provider: "gitlab",
      available: false,
      authenticated: false,
      reason: auth.output || "GitLab CLI 未认证。",
      cli: cli.output.split(/\r?\n/)[0] || "glab",
      pr: null,
      checks: [],
      raw: auth.output
    };
  }
  const mrResult = await runLocalCommand("glab mr view --output json", { timeout: 12000, maxBuffer: 512 * 1024 });
  if (!mrResult.ok) {
    return {
      provider: "gitlab",
      available: true,
      authenticated: true,
      reason: mrResult.output || `当前分支 ${git.branch || ""} 未关联 GitLab MR。`,
      cli: cli.output.split(/\r?\n/)[0] || "glab",
      pr: null,
      checks: [],
      raw: mrResult.output
    };
  }
  const mr = parseJsonOutput(mrResult.output, null);
  return {
    provider: "gitlab",
    available: true,
    authenticated: true,
    reason: "",
    cli: cli.output.split(/\r?\n/)[0] || "glab",
    pr: mr ? {
      number: mr.iid || mr.id,
      title: mr.title,
      state: mr.state,
      url: mr.web_url || mr.webUrl || "",
      headRefName: mr.source_branch || mr.sourceBranch || "",
      baseRefName: mr.target_branch || mr.targetBranch || "",
      isDraft: Boolean(mr.draft || mr.work_in_progress),
      reviewDecision: "",
      mergeStateStatus: mr.merge_status || mr.detailed_merge_status || ""
    } : null,
    checks: [],
    summary: {
      totalChecks: 0,
      failingChecks: 0,
      mergeStateStatus: mr?.merge_status || mr?.detailed_merge_status || ""
    }
  };
}

async function readGiteeRemoteStatus(git) {
  const remote = primaryGitRemote(git);
  const project = parseGitRemoteProject(remote?.url || "");
  return {
    provider: "gitee",
    available: false,
    authenticated: false,
    reason: project.webUrl
      ? `已识别 Gitee 仓库 ${project.webUrl}；当前仅生成本地只读准备包，不调用 Gitee API 或执行远端写入。请在发布继续包中回填 Pull Request / CI / 评论链接。`
      : "已识别 Gitee remote；当前仅生成本地只读准备包，不调用 Gitee API 或执行远端写入。",
    cli: "",
    project,
    pr: null,
    checks: [],
    summary: {
      totalChecks: 0,
      failingChecks: 0,
      manualProvider: true,
      projectUrl: project.webUrl || ""
    },
    nextActions: [
      project.webUrl ? `在 Gitee 打开仓库：${project.webUrl}` : "确认 Gitee 仓库地址。",
      "人工创建或更新 Pull Request 后，把 PR 链接、CI 链接和评论链接填入 external-evidence-template.json。",
      "回到本地运行 publish/gates smoke 作为发布前复查。"
    ]
  };
}

async function readRemotePrStatus(git = null) {
  const summary = git || await getGitSummary();
  const provider = primaryGitRemote(summary)?.provider || "";
  if (!summary.available) {
    return {
      provider: "",
      available: false,
      authenticated: false,
      reason: "当前工作区不是 Git 仓库。",
      pr: null,
      checks: [],
      policy: { access: "remote-read-only", pushes: false, createsRemotePr: false }
    };
  }
  if (provider === "gitee") {
    return {
      ...await readGiteeRemoteStatus(summary),
      policy: { access: "remote-read-only", pushes: false, createsRemotePr: false, manualProvider: true }
    };
  }
  if (provider === "github") {
    return {
      ...await readGithubRemoteStatus(summary),
      policy: { access: "remote-read-only", pushes: false, createsRemotePr: false }
    };
  }
  if (provider === "gitlab") {
    return {
      ...await readGitlabRemoteStatus(summary),
      policy: { access: "remote-read-only", pushes: false, createsRemotePr: false }
    };
  }
  return {
    provider,
    available: false,
    authenticated: false,
    reason: provider ? `暂未支持 ${provider} 的远端 PR/CI 读取。` : "未发现可识别的 Git remote provider。",
    pr: null,
    checks: [],
    policy: { access: "remote-read-only", pushes: false, createsRemotePr: false }
  };
}

async function buildPullRequestReadiness(prompt = "", { deep = false } = {}) {
  const evidence = await getCurrentDiffEvidence({ includeDiff: deep });
  const liveGit = await getGitSummary().catch(() => null);
  const git = liveGit?.available
    ? {
        ...evidence.git,
        ...liveGit,
        changedFiles: liveGit.changedFiles?.length ? liveGit.changedFiles : (evidence.git?.changedFiles || [])
      }
    : evidence.git;
  const ci = await findCiConfigs();
  const verificationPlan = await buildVerificationPlan({ limit: 12 });
  const tasks = await listTaskLogs(5);
  const checks = tasks.flatMap((task) => task.checks || []).slice(0, 12);
  const reviews = await listReviewArtifacts(5);
  const remoteProject = parseGitRemoteProject(primaryGitRemote(git)?.url || "");
  const provider = primaryGitRemote(git)?.provider || "";
  const remote = deep
    ? await readRemotePrStatus(git)
    : {
      provider,
      available: false,
      authenticated: false,
      reason: provider === "gitee"
        ? "已识别 Gitee remote；默认 PR readiness 不调用 Gitee API，使用发布继续包回填 PR/CI/评论链接。"
        : "默认 PR readiness 跳过远端 CLI 探测；使用 /api/pr-readiness?deep=1 执行远端 PR/CI 读取。",
      project: remoteProject,
      pr: null,
      checks: [],
      policy: { access: "remote-read-only", pushes: false, createsRemotePr: false, skipped: true, manualProvider: provider === "gitee" }
    };
  const title = String(prompt || tasks[0]?.prompt || `Forge changes on ${git.branch || "workspace"}`).trim();
  const changedFiles = git.changedFiles || [];
  const blockers = [];
  if (!git.available) blockers.push("当前工作区不是 Git 仓库。");
  if (!git.remotes?.length) blockers.push("未发现 Git remote，无法判断真实 PR 目标。");
  if (!ci.length) blockers.push("未发现本地 CI 配置。");
  if (!remote.available) blockers.push(`远端 PR/CI 状态不可用：${remote.reason}`);
  if (remote.summary?.failingChecks) blockers.push(`${remote.summary.failingChecks} 个远端检查未通过或未完成。`);
  for (const blocker of verificationPlan.blockers || []) blockers.push(`验证门禁：${blocker}`);
  const failingChecks = checks.filter((check) => check.exitCode !== 0);
  if (failingChecks.length) blockers.push(`${failingChecks.length} 个最近检查失败。`);
  const body = [
    "## Summary",
    markdownList([
      `Workspace: ${currentWorkspace}`,
      `Branch: ${git.branch || "n/a"}`,
      `Remote provider: ${provider || "unknown"}`,
      remoteProject.webUrl ? `Remote project: ${remoteProject.webUrl}` : "",
      `Changed files: ${changedFiles.length}`
    ].filter(Boolean)),
    "",
    "## Changed Files",
    markdownList(changedFiles),
    "",
    "## Verification",
    checks.length
      ? checks.map((check) => `- ${check.exitCode === 0 ? "PASS" : "FAIL"} \`${check.command}\`${check.reason ? ` - ${check.reason}` : ""}`).join("\n")
      : "- No local check evidence recorded yet.",
    "",
    "## Verification Gates",
    verificationPlan.gates.map((gate) => `- ${gate.status.toUpperCase()} ${gate.label}${gate.evidence?.length ? ` (${gate.evidence.length})` : ""}`).join("\n"),
    "",
    "## CI Configs",
    ci.length ? ci.map((item) => `- ${item.provider}: ${item.path}`).join("\n") : "- No CI config discovered.",
    "",
    "## Remote PR / CI",
    remote.pr
      ? markdownList([
          `PR: ${remote.pr.title || ""} ${remote.pr.url || ""}`.trim(),
          `State: ${remote.pr.state || "unknown"}`,
          `Merge: ${remote.pr.mergeStateStatus || "unknown"}`,
          `Review: ${remote.pr.reviewDecision || "unknown"}`,
          `Checks: ${remote.summary?.totalChecks ?? remote.checks?.length ?? 0}`
        ])
      : markdownList([remote.reason || "No remote PR status available."]),
    "",
    "## Diff Stat",
    "```text",
    evidence.stat || "(no git diff stat)",
    "```"
  ].join("\n");
  return {
    ok: git.available,
    status: blockers.length ? "needs_attention" : "ready",
    title,
    provider,
    remoteProject,
    git,
    remotes: git.remotes || [],
    ci,
    verificationPlan,
    remote,
    checks,
    reviews,
    blockers,
    draft: {
      title,
      body
    },
    evidence: {
      diffAvailable: Boolean(evidence.diff),
      stat: evidence.stat || "",
      changedFiles
    },
    policy: {
      access: "local-read-only",
      scope: "currentWorkspace",
      pushes: false,
      createsRemotePr: false,
      readsRemoteCi: Boolean(remote.available),
      manualProvider: provider === "gitee"
      ,
      deep
    }
  };
}

async function buildRemotePublishPlan(prompt = "") {
  const readiness = await buildPullRequestReadiness(prompt);
  const git = readiness.git || await getGitSummary();
  const provider = readiness.provider || "";
  const remoteProject = readiness.remoteProject || parseGitRemoteProject(primaryGitRemote(git)?.url || "");
  const providerPolicy = buildRemoteProviderPermissionRows({ provider, remoteProject });
  const branch = git.branch || "current-branch";
  const pushRemote = primaryGitRemote(git)?.name
    || "origin";
  const commands = [];
  const notes = [];
  const title = readiness.draft?.title || String(prompt || `Forge changes on ${branch}`).trim();
  const body = readiness.draft?.body || "";
  const latestReview = (await listReviewArtifacts(1))[0] || null;
  const packageId = `remote-publish-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const packageDir = path.join(REMOTE_PUBLISH_DIR, packageId);
  await fs.mkdir(packageDir, { recursive: true });
  const prBodyPath = path.join(packageDir, "pr-body.md");
  const reviewSummaryPath = path.join(packageDir, "review-summary.md");
  const planPath = path.join(packageDir, "plan.json");
  const quotePath = (value) => `"${String(value || "").replace(/"/g, '\\"')}"`;
  const reviewSummary = [
    `# Review / Publish Summary - ${packageId}`,
    "",
    `Workspace: ${currentWorkspace}`,
    `Branch: ${branch}`,
    `Provider: ${provider || "unknown"}`,
    remoteProject.webUrl ? `Remote project: ${remoteProject.webUrl}` : "",
    latestReview ? `Latest review: ${latestReview.id}` : "Latest review: none",
    "",
    "## Readiness",
    readiness.blockers?.length ? markdownList(readiness.blockers) : "- No readiness blockers reported.",
    "",
    "## Verification",
    readiness.checks?.length
      ? readiness.checks.map((check) => `- ${check.exitCode === 0 ? "PASS" : "FAIL"} \`${check.command}\``).join("\n")
      : "- No local check evidence recorded yet.",
    "",
    "## Notes",
    "- Remote writes are approval-gated; this file is generated for manual or explicitly approved platform actions."
  ].join("\n");
  await fs.writeFile(prBodyPath, body || `# ${title}\n\nNo PR body generated.`, "utf8");
  await fs.writeFile(reviewSummaryPath, reviewSummary, "utf8");

  if (git.available && git.remotes?.length && branch) {
    commands.push({
      id: "push-branch",
      label: "Push branch",
      command: `git push -u ${pushRemote} ${branch}`,
      risk: "high",
      requiresApproval: true,
      reason: "Publishes local commits to the configured Git remote."
    });
  } else {
    notes.push("Cannot draft push command until Git branch and remote are available.");
  }

  if (provider === "github") {
    if (readiness.remote?.pr?.number) {
      commands.push({
        id: "comment-pr",
        label: "Comment on GitHub PR",
        command: `gh pr comment ${readiness.remote.pr.number} --body-file ${quotePath(reviewSummaryPath)}`,
        risk: "high",
        requiresApproval: true,
        reason: "Writes a review/update comment to an existing GitHub PR."
      });
    } else {
      commands.push({
        id: "create-pr",
        label: "Create GitHub PR",
        command: `gh pr create --draft --title "${title.replace(/"/g, "\\\"")}" --body-file ${quotePath(prBodyPath)}`,
        risk: "high",
        requiresApproval: true,
        reason: "Creates a remote GitHub PR from the current branch."
      });
    }
  } else if (provider === "gitlab") {
    if (readiness.remote?.pr?.number) {
      commands.push({
        id: "comment-mr",
        label: "Comment on GitLab MR",
        command: `glab mr note ${readiness.remote.pr.number} --message "$(Get-Content ${quotePath(reviewSummaryPath)} -Raw)"`,
        risk: "high",
        requiresApproval: true,
        reason: "Writes a review/update note to an existing GitLab MR."
      });
    } else {
      commands.push({
        id: "create-mr",
        label: "Create GitLab MR",
        command: `glab mr create --draft --title "${title.replace(/"/g, "\\\"")}" --description "$(Get-Content ${quotePath(prBodyPath)} -Raw)"`,
        risk: "high",
      requiresApproval: true,
      reason: "Creates a remote GitLab MR from the current branch."
      });
    }
  } else if (provider === "gitee") {
    const compareUrl = remoteProject.webUrl
      ? `${remoteProject.webUrl}/compare/${encodeURIComponent(branch)}...master`
      : "";
    commands.push({
      id: "create-gitee-pr-manual",
      label: "Create Gitee PR manually",
      command: compareUrl ? `manual:gitee-pr ${compareUrl}` : "manual:gitee-pr",
      risk: "high",
      requiresApproval: true,
      manual: true,
      reason: "Open Gitee manually after push, create a Pull Request, then paste PR/CI/comment URLs into the continuation evidence template."
    });
    commands.push({
      id: "comment-gitee-pr-manual",
      label: "Comment on Gitee PR manually",
      command: `manual:gitee-comment ${quotePath(reviewSummaryPath)}`,
      risk: "high",
      requiresApproval: true,
      manual: true,
      reason: "Copy the generated review summary into the Gitee Pull Request comment box and record the resulting comment URL in the evidence template."
    });
    notes.push("Gitee is recognized as a manual-provider path: Forge generates publish artifacts, but does not call Gitee APIs or write remote PR comments.");
  } else {
    notes.push(provider ? `Remote provider ${provider} is not supported for publish planning yet.` : "No recognized remote provider for PR/MR creation.");
  }

  const plan = {
    generatedAt: new Date().toISOString(),
    workspace: currentWorkspace,
    status: commands.length ? "approval_required" : "needs_attention",
    provider,
    remoteProject,
    title,
    body,
    package: {
      id: packageId,
      dir: packageDir,
      prBodyPath,
      reviewSummaryPath,
      planPath
    },
    readiness: {
      status: readiness.status,
      blockers: readiness.blockers || [],
      remoteAvailable: Boolean(readiness.remote?.available),
      changedFiles: readiness.evidence?.changedFiles || []
    },
    commands,
    notes,
    providerPolicy,
    policy: {
      access: "approval-plan-only",
      executesCommands: false,
      pushes: false,
      createsRemotePr: false,
      writesRemoteComments: false,
      requiresExplicitApproval: true
    }
  };
  await fs.writeFile(planPath, JSON.stringify(plan, null, 2), "utf8");
  const approval = await writeApprovalRequest({
    type: "remote_publish_plan",
    command: commands.map((item) => item.command).join("\n"),
    reason: "Remote publish, PR creation, and PR/MR comment actions require explicit external approval.",
    policy: {
      allowed: false,
      risk: "high",
      reason: "Remote write actions are approval-gated and are not executed by this endpoint.",
      command: "remote publish plan"
    },
    plan
  });
  return { ...plan, approval };
}

async function listRemotePublishPackages({ limit = 20 } = {}) {
  const max = Math.min(80, Math.max(1, Number(limit) || 20));
  const entries = await fs.readdir(REMOTE_PUBLISH_DIR, { withFileTypes: true }).catch(() => []);
  const packages = [];
  const approvals = await listApprovalRequests(200);
  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith("remote-publish-")) continue;
    const packageDir = path.join(REMOTE_PUBLISH_DIR, entry.name);
    const plan = await readJsonOrNull(path.join(packageDir, "plan.json"));
    if (!plan || plan.workspace !== currentWorkspace) continue;
    const approval = approvals.find((item) => item.type === "remote_publish_plan" && item.command === (plan.commands || []).map((command) => command.command).join("\n"));
    const externalEvidence = await readJsonOrNull(path.join(packageDir, "external-evidence.json"));
    const externalEvidenceSummary = summarizeRemotePublishEvidence(externalEvidence);
    packages.push({
      id: entry.name,
      generatedAt: plan.generatedAt || "",
      workspace: plan.workspace || "",
      provider: plan.provider || "",
      status: plan.status || "",
      title: plan.title || "",
      commandCount: Array.isArray(plan.commands) ? plan.commands.length : 0,
      blockerCount: Array.isArray(plan.readiness?.blockers) ? plan.readiness.blockers.length : 0,
      remoteAvailable: Boolean(plan.readiness?.remoteAvailable),
      approvalId: approval?.id || "",
      approvalStatus: approval?.status || "",
      externalEvidence: externalEvidenceSummary,
      externalEvidenceStatus: externalEvidenceSummary?.status || "",
      paths: {
        dir: toPosix(path.relative(APP_ROOT, packageDir)),
        plan: toPosix(path.relative(APP_ROOT, path.join(packageDir, "plan.json"))),
        prBody: toPosix(path.relative(APP_ROOT, path.join(packageDir, "pr-body.md"))),
        reviewSummary: toPosix(path.relative(APP_ROOT, path.join(packageDir, "review-summary.md"))),
        externalEvidence: externalEvidenceSummary ? toPosix(path.relative(APP_ROOT, path.join(packageDir, "external-evidence.json"))) : "",
        externalEvidenceSummary: externalEvidenceSummary ? toPosix(path.relative(APP_ROOT, path.join(packageDir, "external-evidence-summary.md"))) : ""
      }
    });
  }
  return {
    generatedAt: new Date().toISOString(),
    workspace: currentWorkspace,
    summary: {
      total: packages.length,
      approvalRequired: packages.filter((item) => item.status === "approval_required").length,
      withApproval: packages.filter((item) => item.approvalId).length,
      withExternalEvidence: packages.filter((item) => item.externalEvidence).length,
      readyExternalEvidence: packages.filter((item) => item.externalEvidence?.status === "ready").length
    },
    packages: packages
      .sort((left, right) => String(right.generatedAt).localeCompare(String(left.generatedAt)))
      .slice(0, max),
    policy: {
      access: "local-read-only",
      executesCommands: false,
      pushes: false,
      createsRemotePr: false,
      writesRemoteComments: false
    }
  };
}

function summarizeRemotePublishEvidence(artifact = null) {
  if (!artifact || typeof artifact !== "object") return null;
  const external = artifact.evidence?.externalExecution || {};
  return {
    generatedAt: artifact.generatedAt || "",
    packageId: artifact.packageId || "",
    provider: artifact.provider || artifact.evidence?.provider || "",
    status: artifact.status || "",
    remoteUrl: external.remoteUrl || "",
    prOrMrNumber: external.prOrMrNumber || "",
    ciUrl: external.ciUrl || "",
    reviewCommentUrl: external.reviewCommentUrl || "",
    executedBy: external.executedBy || "",
    executedAt: external.executedAt || "",
    blockers: artifact.validation?.blockers || [],
    warnings: artifact.validation?.warnings || [],
    summary: artifact.validation?.summary || {},
    paths: artifact.paths || {}
  };
}

async function readRemotePublishPackage(id = "") {
  if (!/^[\w.-]+$/.test(String(id || "")) || !String(id).startsWith("remote-publish-")) {
    throw new Error("remote publish package id 非法。");
  }
  const packageDir = path.join(REMOTE_PUBLISH_DIR, id);
  const full = path.resolve(packageDir);
  if (!full.toLowerCase().startsWith(REMOTE_PUBLISH_DIR.toLowerCase() + path.sep)) {
    throw new Error("remote publish package 路径越界。");
  }
  const plan = await readJsonOrNull(path.join(full, "plan.json"));
  if (!plan || plan.workspace !== currentWorkspace) throw new Error("未找到当前工作区的 remote publish package。");
  const prBody = await fs.readFile(path.join(full, "pr-body.md"), "utf8").catch(() => "");
  const reviewSummary = await fs.readFile(path.join(full, "review-summary.md"), "utf8").catch(() => "");
  const externalEvidence = await readJsonOrNull(path.join(full, "external-evidence.json"));
  const externalEvidenceSummary = summarizeRemotePublishEvidence(externalEvidence);
  return {
    id,
    generatedAt: plan.generatedAt || "",
    workspace: plan.workspace || "",
    plan,
    externalEvidence: externalEvidenceSummary,
    prBody: prBody.slice(0, 60000),
    reviewSummary: reviewSummary.slice(0, 60000),
    paths: {
      dir: toPosix(path.relative(APP_ROOT, full)),
      plan: toPosix(path.relative(APP_ROOT, path.join(full, "plan.json"))),
      prBody: toPosix(path.relative(APP_ROOT, path.join(full, "pr-body.md"))),
      reviewSummary: toPosix(path.relative(APP_ROOT, path.join(full, "review-summary.md"))),
      externalEvidence: externalEvidenceSummary ? toPosix(path.relative(APP_ROOT, path.join(full, "external-evidence.json"))) : "",
      externalEvidenceSummary: externalEvidenceSummary ? toPosix(path.relative(APP_ROOT, path.join(full, "external-evidence-summary.md"))) : ""
    },
    policy: {
      access: "local-read-only",
      executesCommands: false,
      pushes: false,
      createsRemotePr: false,
      writesRemoteComments: false
    }
  };
}

async function probeRemotePublishCli(provider = "", { deep = false } = {}) {
  const normalizedProvider = String(provider || "").toLowerCase();
  if (normalizedProvider === "github") {
    const cli = await runLocalCommand("gh --version", { timeout: 2000, maxBuffer: 128 * 1024 });
    const auth = cli.ok && deep
      ? await runLocalCommand("gh auth status", { timeout: 3000, maxBuffer: 128 * 1024 })
      : { ok: false, output: deep ? "GitHub CLI gh is not installed." : "GitHub CLI auth probe skipped; pass deep=1 to check authentication." };
    return {
      provider: "github",
      cli: "gh",
      installed: cli.ok,
      authenticated: deep ? cli.ok && auth.ok : false,
      authChecked: Boolean(deep && cli.ok),
      version: cli.output.split(/\r?\n/)[0] || "",
      reason: cli.ok
        ? (deep ? (auth.ok ? "GitHub CLI is installed and authenticated." : auth.output || "GitHub CLI is not authenticated.") : auth.output)
        : cli.output
    };
  }
  if (normalizedProvider === "gitlab") {
    const cli = await runLocalCommand("glab --version", { timeout: 2000, maxBuffer: 128 * 1024 });
    const auth = cli.ok && deep
      ? await runLocalCommand("glab auth status", { timeout: 3000, maxBuffer: 128 * 1024 })
      : { ok: false, output: deep ? "GitLab CLI glab is not installed." : "GitLab CLI auth probe skipped; pass deep=1 to check authentication." };
    return {
      provider: "gitlab",
      cli: "glab",
      installed: cli.ok,
      authenticated: deep ? cli.ok && auth.ok : false,
      authChecked: Boolean(deep && cli.ok),
      version: cli.output.split(/\r?\n/)[0] || "",
      reason: cli.ok
        ? (deep ? (auth.ok ? "GitLab CLI is installed and authenticated." : auth.output || "GitLab CLI is not authenticated.") : auth.output)
        : cli.output
    };
  }
  if (normalizedProvider === "gitee") {
    return {
      provider: "gitee",
      cli: "",
      installed: false,
      authenticated: false,
      authChecked: false,
      version: "",
      manualProvider: true,
      reason: "Gitee publish is handled through manual continuation evidence; no local Gitee CLI/API probe is executed."
    };
  }
  return {
    provider: normalizedProvider || "unknown",
    cli: "",
    installed: false,
    authenticated: false,
    authChecked: false,
    version: "",
    reason: normalizedProvider ? `No CLI preflight is available for ${normalizedProvider}.` : "No recognized provider."
  };
}

async function buildRemotePublishPreflight({ id = "", limit = 20, deep = false } = {}) {
  const packageIndex = await listRemotePublishPackages({ limit: Math.max(Number(limit) || 20, 1) });
  const packageId = String(id || packageIndex.packages?.[0]?.id || "").trim();
  const detail = packageId ? await readRemotePublishPackage(packageId) : null;
  const plan = detail?.plan || null;
  const git = deep ? await getGitSummary() : {
    available: Boolean(detail),
    branch: "",
    root: "",
    status: [],
    changedFiles: plan?.readiness?.changedFiles || [],
    remotes: [],
    upstream: "",
    skipped: "Git CLI probing skipped; pass deep=1 to inspect live Git state."
  };
  const approval = packageIndex.packages?.find((item) => item.id === packageId) || {};
  const commandChecks = (plan?.commands || []).map((item) => {
    const command = String(item.command || "");
    return {
      id: item.id || "",
      label: item.label || "",
      command,
      risk: item.risk || "high",
      requiresApproval: item.requiresApproval !== false,
      policy: evaluateCommandPolicy(command),
      blockedLocally: true,
      reason: item.reason || "Remote write command requires external approval."
    };
  });
  const cli = plan?.provider && deep ? await probeRemotePublishCli(plan.provider, { deep }) : {
    provider: plan?.provider || "",
    cli: plan?.provider === "github" ? "gh" : plan?.provider === "gitlab" ? "glab" : "",
    installed: false,
    authenticated: false,
    authChecked: false,
    version: "",
    manualProvider: plan?.provider === "gitee",
    reason: plan?.provider
      ? (plan.provider === "gitee"
        ? "Gitee publish uses manual continuation evidence; no Gitee CLI/API probe is executed."
        : "CLI probing skipped in shallow preflight; pass deep=1 to check installation and authentication.")
      : "No package provider to probe."
  };
  const providerPolicy = buildRemoteProviderPermissionRows({
    provider: plan?.provider || "",
    remoteProject: plan?.remoteProject || {},
    packages: packageIndex
  });
  const remote = deep ? await readRemotePrStatus(git).catch((error) => ({
    provider: plan?.provider || "",
    available: false,
    authenticated: false,
    reason: error.message,
    pr: null,
    checks: []
  })) : {
    provider: plan?.provider || "",
    available: Boolean(plan?.readiness?.remoteAvailable),
    authenticated: false,
    reason: "Deep remote CLI probing skipped; pass deep=1 to probe remote PR/CI state.",
    pr: null,
    checks: []
  };
  const blockers = [];
  if (!detail) blockers.push("No remote publish package is available.");
  if (detail && !approval.approvalId) blockers.push("No matching approval artifact was found for this publish package.");
  if (detail && approval.approvalStatus !== "approved") blockers.push("Remote publish approval is not approved.");
  if (detail && deep && !git.available) blockers.push("Current workspace is not a Git repository.");
  if (detail && deep && !git.branch) blockers.push("Current Git branch could not be resolved.");
  if (detail && deep && !git.remotes?.length) blockers.push("No Git remote is configured.");
  if (detail && deep && plan?.provider && !cli.manualProvider && !cli.installed) blockers.push(`Required CLI is not installed for ${plan.provider}.`);
  if (detail && plan?.provider && deep && !cli.manualProvider && cli.installed && !cli.authenticated) blockers.push(`Required CLI is not authenticated for ${plan.provider}.`);
  if (detail && commandChecks.some((item) => item.policy.allowed)) blockers.push("At least one remote publish command unexpectedly passes local safe-command policy.");
  const status = !detail ? "needs_package" : blockers.length ? "blocked" : "ready_for_external_execution";
  return {
    generatedAt: new Date().toISOString(),
    workspace: currentWorkspace,
    status,
    packageId,
    package: detail ? {
      id: detail.id,
      generatedAt: detail.generatedAt,
      provider: plan?.provider || "",
      status: plan?.status || "",
      paths: detail.paths
    } : null,
    approval: {
      id: approval.approvalId || "",
      status: approval.approvalStatus || "",
      required: Boolean(detail)
    },
    git: {
      available: git.available,
      branch: git.branch || "",
      upstream: git.upstream || "",
      remotes: git.remotes || [],
      changedFiles: git.changedFiles || []
    },
    cli,
    remote,
    providerPolicy,
    commandChecks,
    blockers,
    summary: {
      packages: packageIndex.summary?.total || 0,
      commands: commandChecks.length,
      blockers: blockers.length,
      approvalStatus: approval.approvalStatus || "",
      cliInstalled: Boolean(cli.installed),
      cliAuthenticated: Boolean(cli.authenticated),
      deep
    },
    policy: {
      access: "local-and-remote-read-only",
      executesCommands: false,
      pushes: false,
      createsRemotePr: false,
      writesRemoteComments: false,
      requiresExplicitApproval: true,
      providerActions: providerPolicy.map((item) => item.action),
      manualProvider: providerPolicy.some((item) => item.manualProvider)
    }
  };
}

function remotePublishContinuationCommands(preflight = {}) {
  return [
    { command: "node --check server.js", reason: "复查远端发布包、预检和继续包接口语法。" },
    { command: "node --check app.js", reason: "复查远端发布继续包前端入口语法。" },
    { command: "node server.js --ui-smoke-test", reason: "确认发布继续包按钮和提示入口仍被 UI smoke 覆盖。" },
    { command: "node server.js --api-smoke-section=publish", reason: "复查 PR readiness、发布审批、预检和继续包只读链路。" },
    { command: "node server.js --api-smoke-section=core", reason: "复查审批状态、健康接口和核心恢复链路。" },
    ...(preflight?.status === "ready_for_external_execution"
      ? [{ command: "node server.js --api-smoke-section=debug", reason: "远端人工执行后，继续用调试 smoke 复查失败证据入口。" }]
      : [])
  ];
}

async function buildRemotePublishContinuation({ id = "", limit = 20, deep = false } = {}) {
  const preflight = await buildRemotePublishPreflight({ id, limit, deep });
  const detail = preflight.packageId ? await readRemotePublishPackage(preflight.packageId) : null;
  const packageDir = detail?.paths?.dir ? path.join(APP_ROOT, detail.paths.dir) : "";
  const continuationPath = packageDir ? path.join(packageDir, "continuation.md") : "";
  const evidenceTemplatePath = packageDir ? path.join(packageDir, "external-evidence-template.json") : "";
  const commands = detail?.plan?.commands || [];
  const manualSteps = commands.map((item, index) => ({
    order: index + 1,
    id: item.id || `remote-command-${index + 1}`,
    label: item.label || item.id || `Remote command ${index + 1}`,
    command: item.command || "",
    risk: item.risk || "high",
    requiresApproval: item.requiresApproval !== false,
    reason: item.reason || "Remote write action requires external approval."
  }));
  const evidenceTemplate = {
    packageId: preflight.packageId || "",
    generatedAt: new Date().toISOString(),
    workspace: currentWorkspace,
    provider: preflight.package?.provider || detail?.plan?.provider || "",
    approval: preflight.approval || {},
    statusToFill: "pending_external_execution",
    externalExecution: {
      executedBy: "",
      executedAt: "",
      commandsRun: manualSteps.map((item) => ({ id: item.id, command: item.command, status: "", outputSummary: "" })),
      remoteUrl: "",
      prOrMrNumber: "",
      ciUrl: "",
      reviewCommentUrl: "",
      rollbackPlan: "",
      notes: ""
    },
    localFollowUp: {
      verificationCommands: remotePublishContinuationCommands(preflight),
      expectedArtifacts: [
        detail?.paths?.prBody || "",
        detail?.paths?.reviewSummary || "",
        detail?.paths?.plan || "",
        "external-evidence-template.json",
        "continuation.md"
      ].filter(Boolean)
    },
    policy: {
      access: "local-artifact-only",
      executesCommands: false,
      pushes: false,
      createsRemotePr: false,
      writesRemoteComments: false,
      requiresManualExternalExecution: true
    }
  };
  const continuationMarkdown = [
    `# Remote Publish Continuation - ${preflight.packageId || "none"}`,
    "",
    `Workspace: ${currentWorkspace}`,
    `Package: ${preflight.packageId || ""}`,
    `Provider: ${preflight.package?.provider || detail?.plan?.provider || "unknown"}`,
    `Approval: ${preflight.approval?.id || ""} (${preflight.approval?.status || "unknown"})`,
    `Preflight: ${preflight.status || "unknown"}`,
    "",
    "## Manual External Actions",
    manualSteps.length
      ? manualSteps.map((item) => [
          `${item.order}. ${item.label}`,
          `   - Command: \`${item.command}\``,
          `   - Risk: ${item.risk}`,
          `   - Reason: ${item.reason}`
        ].join("\n")).join("\n")
      : "- No remote command was generated.",
    "",
    "## Blockers",
    preflight.blockers?.length ? markdownList(preflight.blockers) : "- No preflight blockers reported.",
    "",
    "## Evidence To Fill After Manual Execution",
    "- executedBy",
    "- executedAt",
    "- commandsRun[].status and outputSummary",
    "- remoteUrl / prOrMrNumber / ciUrl / reviewCommentUrl",
    "- rollbackPlan",
    "- notes",
    "",
    "## Local Follow-Up Verification",
    remotePublishContinuationCommands(preflight).map((item) => `- \`${item.command}\` - ${item.reason}`).join("\n"),
    "",
    "## Safety Policy",
    "- This artifact does not execute git push, create PR/MR, or write remote comments.",
    "- Use it to hand off manual external execution and bring the resulting evidence back into the local gate."
  ].join("\n");
  if (packageDir) {
    await fs.mkdir(packageDir, { recursive: true });
    await fs.writeFile(continuationPath, continuationMarkdown, "utf8");
    await fs.writeFile(evidenceTemplatePath, JSON.stringify(evidenceTemplate, null, 2), "utf8");
  }
  return {
    generatedAt: new Date().toISOString(),
    workspace: currentWorkspace,
    status: preflight.status === "ready_for_external_execution" ? "ready_for_manual_external_execution" : "needs_attention",
    packageId: preflight.packageId || "",
    package: preflight.package || null,
    approval: preflight.approval || {},
    preflight: {
      status: preflight.status,
      summary: preflight.summary,
      blockers: preflight.blockers,
      cli: preflight.cli,
      remote: {
        provider: preflight.remote?.provider || "",
        available: Boolean(preflight.remote?.available),
        authenticated: Boolean(preflight.remote?.authenticated),
        reason: preflight.remote?.reason || ""
      }
    },
    manualSteps,
    evidenceTemplate,
    providerPolicy: detail?.plan?.providerPolicy || buildRemoteProviderPermissionRows({
      provider: preflight.package?.provider || detail?.plan?.provider || "",
      remoteProject: detail?.plan?.remoteProject || {}
    }),
    verificationCommands: remotePublishContinuationCommands(preflight),
    paths: packageDir ? {
      continuation: toPosix(path.relative(APP_ROOT, continuationPath)),
      evidenceTemplate: toPosix(path.relative(APP_ROOT, evidenceTemplatePath)),
      prBody: detail?.paths?.prBody || "",
      reviewSummary: detail?.paths?.reviewSummary || "",
      plan: detail?.paths?.plan || ""
    } : {},
    policy: {
      access: "local-artifact-only",
      writesLocalArtifacts: Boolean(packageDir),
      executesCommands: false,
      pushes: false,
      createsRemotePr: false,
      writesRemoteComments: false,
      requiresManualExternalExecution: true,
      providerActions: (detail?.plan?.providerPolicy || []).map((item) => item.action),
      manualProvider: Boolean(preflight.cli?.manualProvider || detail?.plan?.provider === "gitee")
    }
  };
}

function remotePublishEvidenceVerificationCommands(evidence = {}) {
  const commands = [
    { command: "node --check server.js", reason: "复查远端证据回填、发布包和门禁接口语法。" },
    { command: "node --check app.js", reason: "复查远端证据回填前端入口语法。" },
    { command: "node server.js --api-smoke-section=publish", reason: "复查远端发布、继续包和证据回填链路。" },
    { command: "node server.js --api-smoke-section=gates", reason: "复查 PR readiness、CI 状态和合并门禁汇总。" }
  ];
  if (evidence?.externalExecution?.ciUrl || evidence?.externalExecution?.remoteUrl) {
    commands.push({ command: "node server.js --api-smoke-section=core", reason: "回填远端证据后复查核心恢复状态。" });
  }
  return commands;
}

function validateRemotePublishExternalEvidence(evidence = {}, detail = null) {
  const external = evidence.externalExecution || {};
  const commandsRun = Array.isArray(external.commandsRun) ? external.commandsRun : [];
  const warnings = [];
  const blockers = [];
  const addMissing = (field, label) => {
    if (!String(field || "").trim()) blockers.push(`${label} 未回填。`);
  };
  addMissing(external.executedBy, "执行人 executedBy");
  addMissing(external.executedAt, "执行时间 executedAt");
  if (!String(external.remoteUrl || external.prOrMrNumber || "").trim()) blockers.push("remoteUrl 或 prOrMrNumber 至少需要回填一项。");
  if (!String(external.ciUrl || "").trim()) warnings.push("ciUrl 未回填，无法把远端 CI 证据纳入门禁。");
  if (!String(external.reviewCommentUrl || "").trim()) warnings.push("reviewCommentUrl 未回填，无法证明评论/回写动作已完成。");
  if (!String(external.rollbackPlan || "").trim()) blockers.push("rollbackPlan 未回填。");
  if (!commandsRun.length) {
    blockers.push("commandsRun 为空，无法确认外部动作状态。");
  } else {
    const incomplete = commandsRun.filter((item) => !String(item.status || "").trim());
    if (incomplete.length) blockers.push(`${incomplete.length} 个 commandsRun.status 未回填。`);
    const failed = commandsRun.filter((item) => /fail|error|blocked|cancel/i.test(String(item.status || "")));
    if (failed.length) blockers.push(`${failed.length} 个外部动作状态为失败或阻塞。`);
  }
  if (detail && evidence.packageId && evidence.packageId !== detail.id) blockers.push(`回填 packageId ${evidence.packageId} 与当前发布包 ${detail.id} 不一致。`);
  return {
    status: blockers.length ? "needs_attention" : warnings.length ? "ready_with_warnings" : "ready",
    blockers,
    warnings,
    summary: {
      commands: commandsRun.length,
      completedCommands: commandsRun.filter((item) => /done|pass|success|completed|ok/i.test(String(item.status || ""))).length,
      hasRemoteUrl: Boolean(String(external.remoteUrl || "").trim()),
      hasPrOrMrNumber: Boolean(String(external.prOrMrNumber || "").trim()),
      hasCiUrl: Boolean(String(external.ciUrl || "").trim()),
      hasReviewCommentUrl: Boolean(String(external.reviewCommentUrl || "").trim()),
      hasRollbackPlan: Boolean(String(external.rollbackPlan || "").trim())
    }
  };
}

async function buildRemotePublishEvidence({ id = "", evidence = null, limit = 20 } = {}) {
  const detail = await readRemotePublishPackage(id || "");
  const packageDir = detail?.paths?.dir ? path.join(APP_ROOT, detail.paths.dir) : "";
  const templatePath = path.join(packageDir, "external-evidence-template.json");
  const evidencePath = path.join(packageDir, "external-evidence.json");
  const summaryPath = path.join(packageDir, "external-evidence-summary.md");
  const sourceEvidence = evidence && typeof evidence === "object"
    ? evidence
    : await readJsonOrNull(templatePath);
  if (!sourceEvidence || typeof sourceEvidence !== "object") {
    throw new Error("未找到可读取的 external-evidence-template.json，请先生成继续包或在请求中提供 evidence。");
  }
  const normalized = {
    ...sourceEvidence,
    packageId: sourceEvidence.packageId || detail.id,
    ingestedAt: new Date().toISOString(),
    workspace: currentWorkspace,
    provider: sourceEvidence.provider || detail.plan?.provider || "",
    source: evidence ? "request-body" : "external-evidence-template.json"
  };
  const validation = validateRemotePublishExternalEvidence(normalized, detail);
  const verificationCommands = remotePublishEvidenceVerificationCommands(normalized).slice(0, Math.max(1, Number(limit) || 20));
  const artifact = {
    generatedAt: new Date().toISOString(),
    workspace: currentWorkspace,
    packageId: detail.id,
    provider: normalized.provider || "",
    status: validation.status,
    evidence: normalized,
    validation,
    providerPolicy: detail?.plan?.providerPolicy || buildRemoteProviderPermissionRows({
      provider: normalized.provider || detail.plan?.provider || "",
      remoteProject: detail.plan?.remoteProject || {}
    }),
    verificationCommands,
    paths: {
      packageDir: detail.paths.dir,
      template: toPosix(path.relative(APP_ROOT, templatePath)),
      evidence: toPosix(path.relative(APP_ROOT, evidencePath)),
      summary: toPosix(path.relative(APP_ROOT, summaryPath)),
      prBody: detail.paths.prBody,
      reviewSummary: detail.paths.reviewSummary,
      plan: detail.paths.plan
    },
    policy: {
      access: "local-artifact-only",
      writesLocalArtifacts: true,
      executesCommands: false,
      pushes: false,
      createsRemotePr: false,
      writesRemoteComments: false,
      readsRemoteProvider: false,
      providerActions: (detail?.plan?.providerPolicy || []).map((item) => item.action),
      manualProvider: Boolean((normalized.provider || detail.plan?.provider || "") === "gitee")
    }
  };
  const external = normalized.externalExecution || {};
  const summaryMarkdown = [
    `# Remote Publish External Evidence - ${detail.id}`,
    "",
    `Status: ${validation.status}`,
    `Provider: ${artifact.provider || "unknown"}`,
    `Executed by: ${external.executedBy || ""}`,
    `Executed at: ${external.executedAt || ""}`,
    external.remoteUrl ? `Remote URL: ${external.remoteUrl}` : "",
    external.prOrMrNumber ? `PR/MR: ${external.prOrMrNumber}` : "",
    external.ciUrl ? `CI: ${external.ciUrl}` : "",
    external.reviewCommentUrl ? `Review comment: ${external.reviewCommentUrl}` : "",
    "",
    "## Blockers",
    validation.blockers.length ? markdownList(validation.blockers) : "- None",
    "",
    "## Warnings",
    validation.warnings.length ? markdownList(validation.warnings) : "- None",
    "",
    "## Commands Run",
    Array.isArray(external.commandsRun) && external.commandsRun.length
      ? external.commandsRun.map((item) => `- ${item.id || ""}: ${item.status || "unknown"}${item.outputSummary ? ` - ${item.outputSummary}` : ""}`).join("\n")
      : "- None",
    "",
    "## Local Follow-Up Verification",
    verificationCommands.map((item) => `- \`${item.command}\` - ${item.reason}`).join("\n")
  ].filter((line) => line !== "").join("\n");
  await fs.writeFile(evidencePath, JSON.stringify(artifact, null, 2), "utf8");
  await fs.writeFile(summaryPath, summaryMarkdown, "utf8");
  return artifact;
}

async function buildMergeGateStatus({ prompt = "", deep = false, limit = 20 } = {}) {
  const max = Math.min(80, Math.max(1, Number(limit) || 20));
  const [readiness, ciStatus, packages, reviews, approvals, tasks] = await Promise.all([
    buildPullRequestReadiness(prompt, { deep }),
    buildCiStatus({ deep, persist: false, limit: max }),
    listRemotePublishPackages({ limit: max }),
    listReviewArtifacts(max),
    listApprovalRequests(max),
    listTaskLogs(max)
  ]);
  const latestPackageId = packages.packages?.[0]?.id || "";
  const preflight = latestPackageId
    ? await buildRemotePublishPreflight({ id: latestPackageId, limit: max, deep: false })
    : null;
  const latestExternalEvidence = packages.packages?.find((item) => item.externalEvidence)?.externalEvidence || null;
  const failedTasks = tasks.filter((task) => task.checksOk === false || String(task.status || "").includes("failed"));
  const pendingApprovals = approvals.filter((approval) => ["blocked", "pending"].includes(approval.status || ""));
  const approvedRemotePackages = packages.packages?.filter((item) => item.approvalStatus === "approved") || [];
  const gates = [
    {
      id: "pr-readiness",
      label: "PR readiness",
      status: readiness.status === "ready" ? "pass" : "block",
      evidence: readiness.blockers?.length ? readiness.blockers : [readiness.draft?.title || "PR draft available"]
    },
    {
      id: "ci-status",
      label: "CI status",
      status: ciStatus.status === "ready" ? "pass" : ciStatus.status === "missing" ? "warn" : "block",
      evidence: ciStatus.blockers?.length ? ciStatus.blockers : [`${ciStatus.summary?.ciConfigs || 0} CI config(s), ${ciStatus.summary?.localChecks || 0} local check(s)`]
    },
    {
      id: "review-evidence",
      label: "Review evidence",
      status: reviews.length ? "pass" : "warn",
      evidence: reviews.length ? reviews.slice(0, 5).map((item) => item.id) : ["No review artifact recorded yet."]
    },
    {
      id: "approval-state",
      label: "Approval state",
      status: pendingApprovals.length ? "warn" : "pass",
      evidence: pendingApprovals.length
        ? pendingApprovals.slice(0, 5).map((item) => `${item.status} ${item.type || "approval"} ${item.id}`)
        : ["No blocked or pending approval artifacts."]
    },
    {
      id: "remote-publish-preflight",
      label: "Remote publish preflight",
      status: preflight
        ? (preflight.status === "ready_for_external_execution" ? "pass" : "warn")
        : "warn",
      evidence: preflight
        ? (preflight.blockers?.length ? preflight.blockers : [`Package ${preflight.packageId || latestPackageId} preflight ${preflight.status}`])
        : ["No remote publish package generated yet."]
    },
    {
      id: "remote-publish-external-evidence",
      label: "Remote publish external evidence",
      status: latestExternalEvidence
        ? (latestExternalEvidence.status === "ready" ? "pass" : latestExternalEvidence.status === "ready_with_warnings" ? "warn" : "block")
        : (packages.summary?.total ? "warn" : "warn"),
      evidence: latestExternalEvidence
        ? [
            latestExternalEvidence.remoteUrl ? `Remote: ${latestExternalEvidence.remoteUrl}` : "",
            latestExternalEvidence.prOrMrNumber ? `PR/MR: ${latestExternalEvidence.prOrMrNumber}` : "",
            latestExternalEvidence.ciUrl ? `CI: ${latestExternalEvidence.ciUrl}` : "",
            latestExternalEvidence.reviewCommentUrl ? `Comment: ${latestExternalEvidence.reviewCommentUrl}` : "",
            ...(latestExternalEvidence.blockers || []).map((item) => `Blocker: ${item}`),
            ...(latestExternalEvidence.warnings || []).map((item) => `Warning: ${item}`)
          ].filter(Boolean)
        : ["No external publish evidence has been backfilled yet."]
    }
  ];
  if (failedTasks.length) {
    gates.push({
      id: "recent-task-failures",
      label: "Recent task failures",
      status: "block",
      evidence: failedTasks.slice(0, 5).map((task) => `${task.status || "unknown"} ${task.id}`)
    });
  }
  const blockers = gates.filter((gate) => gate.status === "block").flatMap((gate) => gate.evidence.map((item) => `${gate.label}: ${item}`));
  const warnings = gates.filter((gate) => gate.status === "warn").flatMap((gate) => gate.evidence.map((item) => `${gate.label}: ${item}`));
  const status = blockers.length ? "blocked" : warnings.length ? "needs_attention" : "ready";
  return {
    generatedAt: new Date().toISOString(),
    workspace: currentWorkspace,
    status,
    summary: {
      gates: gates.length,
      pass: gates.filter((gate) => gate.status === "pass").length,
      warn: gates.filter((gate) => gate.status === "warn").length,
      block: gates.filter((gate) => gate.status === "block").length,
      blockers: blockers.length,
      warnings: warnings.length,
      reviews: reviews.length,
      approvals: approvals.length,
      remotePackages: packages.summary?.total || 0,
      approvedRemotePackages: approvedRemotePackages.length,
      remoteExternalEvidence: packages.summary?.withExternalEvidence || 0,
      readyRemoteExternalEvidence: packages.summary?.readyExternalEvidence || 0
    },
    gates,
    blockers,
    warnings,
    readiness: {
      status: readiness.status,
      provider: readiness.provider,
      blockers: readiness.blockers || [],
      changedFiles: readiness.evidence?.changedFiles || []
    },
    verificationPlan: readiness.verificationPlan,
    ciStatus: {
      status: ciStatus.status,
      summary: ciStatus.summary,
      blockers: ciStatus.blockers || []
    },
    remote: readiness.remote,
    publishPackage: preflight ? {
      id: preflight.packageId,
      status: preflight.status,
      approval: preflight.approval,
      blockers: preflight.blockers || [],
      externalEvidence: latestExternalEvidence
    } : null,
    externalEvidence: latestExternalEvidence,
    reviews: reviews.slice(0, 8),
    approvals: approvals.slice(0, 8),
    policy: {
      access: "local-and-remote-read-only",
      executesCommands: false,
      pushes: false,
      createsRemotePr: false,
      writesRemoteComments: false,
      deep
    }
  };
}

function slugifyTaskName(input = "") {
  const slug = String(input)
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 36);
  return slug || "task";
}

async function createTaskWorktree(prompt = "") {
  const git = await getGitSummary();
  if (!git.available) {
    throw new Error("当前工作区不是 Git 仓库，无法创建隔离 worktree。");
  }
  if (git.status.length) {
    throw new Error("当前工作区存在未提交改动。请先处理改动，再创建隔离 worktree。");
  }

  await fs.mkdir(WORKTREE_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const branch = `forge/${stamp}-${slugifyTaskName(prompt)}`;
  const worktreePath = path.join(WORKTREE_DIR, branch.replace(/[\\/]/g, "_"));
  const result = await runLocalCommand(`git worktree add -b ${branch} "${worktreePath}"`, {
    timeout: 30000,
    maxBuffer: 1024 * 1024
  });
  if (!result.ok) {
    throw new Error(result.output || "创建 worktree 失败。");
  }
  currentWorkspace = worktreePath;
  return {
    branch,
    workspace: currentWorkspace,
    output: result.output,
    git: await getGitSummary(),
    tasks: await listTaskLogs()
  };
}

async function writeTaskLog(record) {
  await fs.mkdir(TASK_LOG_DIR, { recursive: true });
  const id = new Date().toISOString().replace(/[:.]/g, "-");
  const task = {
    id,
    workspace: currentWorkspace,
    createdAt: new Date().toISOString(),
    ...record
  };
  await fs.writeFile(path.join(TASK_LOG_DIR, `${id}.json`), JSON.stringify(task, null, 2), "utf8");
  scheduleContextCompaction("task-log");
  return task;
}

function normalizeRepairContext(context = null) {
  if (!context || typeof context !== "object") return null;
  return {
    id: String(context.id || "").slice(0, 120),
    source: String(context.source || "").slice(0, 80),
    status: String(context.status || "").slice(0, 80),
    startedAt: String(context.startedAt || "").slice(0, 80),
    prompt: String(context.prompt || "").slice(0, 2000),
    command: String(context.command || "").slice(0, 1000),
    failure: context.failure ? {
      exitCode: Number(context.failure.exitCode ?? 1),
      blocked: Boolean(context.failure.blocked),
      outputSummary: String(context.failure.outputSummary || "").slice(0, 1000),
      output: String(context.failure.output || "").slice(0, 8000),
      policy: context.failure.policy || null
    } : null,
    diagnostics: context.diagnostics ? {
      status: String(context.diagnostics.status || "").slice(0, 80),
      summary: context.diagnostics.summary || null,
      findingCount: Number(context.diagnostics.findingCount || 0),
      nextActions: Array.isArray(context.diagnostics.nextActions) ? context.diagnostics.nextActions.slice(0, 8) : []
    } : null,
    repair: context.repair ? {
      reply: String(context.repair.reply || "").slice(0, 2000),
      hasDiff: Boolean(context.repair.hasDiff),
      files: Array.isArray(context.repair.files) ? context.repair.files.slice(0, 20).map((item) => String(item).slice(0, 300)) : [],
      commandCount: Number(context.repair.commandCount || 0),
      reviewCount: Number(context.repair.reviewCount || 0)
    } : null
  };
}

function normalizeThreadTitle(title = "") {
  const text = String(title || "").trim().replace(/\s+/g, " ");
  return text.slice(0, 80) || "新会话";
}

function normalizeThreadMessages(messages = []) {
  return (Array.isArray(messages) ? messages : []).slice(-80).map((message) => ({
    role: message?.role === "user" ? "user" : "agent",
    text: String(message?.text || "").slice(0, 12000),
    createdAt: message?.createdAt || new Date().toISOString()
  })).filter((message) => message.text);
}

function summarizeThread(thread) {
  const messages = normalizeThreadMessages(thread.messages || []);
  const lastMessage = messages[messages.length - 1] || null;
  return {
    id: thread.id || "",
    workspace: thread.workspace || "",
    title: normalizeThreadTitle(thread.title || lastMessage?.text || ""),
    createdAt: thread.createdAt || "",
    updatedAt: thread.updatedAt || thread.createdAt || "",
    status: thread.status || "active",
    pinned: Boolean(thread.pinned),
    archived: Boolean(thread.archived),
    parentThreadId: thread.parentThreadId || "",
    messageCount: messages.length,
    lastMessage: lastMessage?.text?.slice(0, 160) || "",
    lastRole: lastMessage?.role || "",
    pendingProposalId: thread.pendingProposalId || ""
  };
}

async function listThreads(limit = 20, { includeArchived = false } = {}) {
  await fs.mkdir(THREAD_DIR, { recursive: true });
  const entries = await fs.readdir(THREAD_DIR, { withFileTypes: true });
  const threads = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const thread = JSON.parse(await fs.readFile(path.join(THREAD_DIR, entry.name), "utf8").catch(() => "{}"));
    if (thread.workspace !== currentWorkspace) continue;
    if (thread.archived && !includeArchived) continue;
    threads.push(summarizeThread(thread));
  }
  return threads
    .sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt));
    })
    .slice(0, limit);
}

async function createThread({ title = "", messages = [], status = "active", pendingProposalId = "", pinned = false, archived = false, parentThreadId = "" } = {}) {
  await fs.mkdir(THREAD_DIR, { recursive: true });
  const now = new Date().toISOString();
  const id = `thread-${now.replace(/[:.]/g, "-")}-${crypto.randomBytes(3).toString("hex")}`;
  const thread = {
    id,
    workspace: currentWorkspace,
    title: normalizeThreadTitle(title),
    createdAt: now,
    updatedAt: now,
    status: String(status || "active"),
    pinned: Boolean(pinned),
    archived: Boolean(archived),
    messages: normalizeThreadMessages(messages),
    pendingProposalId: String(pendingProposalId || ""),
    parentThreadId: String(parentThreadId || "")
  };
  await writeJsonAtomic(path.join(THREAD_DIR, `${id}.json`), thread);
  return thread;
}

async function readThread(id) {
  if (!/^thread-[\w.-]+$/.test(String(id || ""))) throw new Error("thread id 非法。");
  const thread = JSON.parse(await fs.readFile(path.join(THREAD_DIR, `${id}.json`), "utf8"));
  if (thread.workspace !== currentWorkspace) {
    throw new Error("该会话不属于当前工作目录，请先切回对应目录。");
  }
  return {
    ...thread,
    title: normalizeThreadTitle(thread.title),
    messages: normalizeThreadMessages(thread.messages || []),
    summary: summarizeThread(thread),
    policy: {
      access: "workspace-thread-artifact",
      writesWorkspaceFiles: false,
      storesConversation: true,
      scopedToWorkspace: true
    }
  };
}

async function updateThread(id, patch = {}) {
  const existing = await readThread(id);
  const now = new Date().toISOString();
  const messages = "messages" in patch
    ? normalizeThreadMessages(patch.messages)
    : normalizeThreadMessages(existing.messages || []);
  const next = {
    id: existing.id,
    workspace: currentWorkspace,
    title: normalizeThreadTitle(patch.title || existing.title || messages[0]?.text || ""),
    createdAt: existing.createdAt || now,
    updatedAt: now,
    status: String(patch.status || existing.status || "active"),
    pinned: "pinned" in patch ? Boolean(patch.pinned) : Boolean(existing.pinned),
    archived: "archived" in patch ? Boolean(patch.archived) : Boolean(existing.archived),
    messages,
    pendingProposalId: String(patch.pendingProposalId || existing.pendingProposalId || ""),
    parentThreadId: String(existing.parentThreadId || patch.parentThreadId || "")
  };
  await writeJsonAtomic(path.join(THREAD_DIR, `${existing.id}.json`), next);
  return {
    ...next,
    summary: summarizeThread(next),
    policy: {
      access: "workspace-thread-artifact",
      writesWorkspaceFiles: false,
      storesConversation: true,
      scopedToWorkspace: true
    }
  };
}

async function forkThread(id, { title = "" } = {}) {
  const source = await readThread(id);
  const fork = await createThread({
    title: normalizeThreadTitle(title || `分叉：${source.title || source.summary?.title || "会话"}`),
    messages: source.messages || [],
    status: "active",
    pendingProposalId: source.pendingProposalId || "",
    parentThreadId: source.id
  });
  return {
    thread: {
      ...fork,
      summary: summarizeThread(fork),
      policy: {
        access: "workspace-thread-artifact",
        writesWorkspaceFiles: false,
        storesConversation: true,
        scopedToWorkspace: true,
        copiedMessages: true
      }
    },
    source: summarizeThread(source),
    threads: await listThreads()
  };
}

function defaultGoalState() {
  return {
    workspace: currentWorkspace,
    objective: "",
    phase: "idle",
    status: "idle",
    updatedAt: "",
    lastPrompt: "",
    lastTaskId: "",
    lastVerification: null,
    pendingProposal: null,
    nextStep: "输入任务并运行代理。"
  };
}

async function readGoalState() {
  const state = JSON.parse(await fs.readFile(GOAL_STATE_PATH, "utf8").catch(() => "{}"));
  if (state.workspace !== currentWorkspace) return defaultGoalState();
  return { ...defaultGoalState(), ...state };
}

async function writeGoalState(patch = {}) {
  await fs.mkdir(STATE_DIR, { recursive: true });
  const previous = await readGoalState();
  const state = {
    ...previous,
    ...patch,
    workspace: currentWorkspace,
    updatedAt: new Date().toISOString()
  };
  await fs.writeFile(GOAL_STATE_PATH, JSON.stringify(state, null, 2), "utf8");
  scheduleContextCompaction("goal-state");
  return state;
}

function buildGoalRecoverySummary({ goal = null, tasks = [], capabilities = null, contextRollup = null } = {}) {
  const currentGoal = goal || defaultGoalState();
  const recentTask = Array.isArray(tasks) ? tasks[0] : null;
  const recommended = capabilities?.recommendedNext || null;
  const capabilityGapSummary = capabilities?.gapSummary || null;
  const pendingProposal = currentGoal.pendingProposal || null;
  const pendingSourceDebugContext = pendingProposal?.sourceDebugContext || null;
  const pendingDebugTarget = pendingProposal?.debugTarget || pendingSourceDebugContext?.debugTarget || null;
  const pendingBrowserTriage = pendingProposal?.browserTriage || pendingSourceDebugContext?.browserTriage || null;
  const verification = currentGoal.lastVerification || null;
  const changedFiles = Array.isArray(recentTask?.changedFiles) ? recentTask.changedFiles.slice(0, 12) : [];
  const selectedHunks = Array.isArray(recentTask?.selectedHunks) ? recentTask.selectedHunks.slice(0, 8) : [];
  const failedCommands = Array.isArray(recentTask?.failedCommands)
    ? recentTask.failedCommands.slice(0, 8)
    : (Array.isArray(recentTask?.checks) ? recentTask.checks.filter((check) => Number(check.exitCode) !== 0).map((check) => check.command).filter(Boolean).slice(0, 8) : []);
  const verificationCommands = Array.isArray(recentTask?.verificationCommands)
    ? recentTask.verificationCommands.slice(0, 8)
    : (Array.isArray(recentTask?.checks) ? recentTask.checks.map((check) => check.command).filter(Boolean).slice(0, 8) : []);
  const lastFailedCommand = recentTask?.repairContext?.command || failedCommands[0] || "";
  const cues = [
    pendingProposal?.id ? `待审批：${pendingProposal.type || "proposal"} ${pendingProposal.id}` : "",
    recentTask?.id ? `最近任务：${recentTask.status || "unknown"} ${recentTask.id}` : "",
    verification ? `验证：${verification.skipped ? "跳过" : verification.ok ? "通过" : "失败"} · ${verification.checkCount || 0} 项` : "",
    lastFailedCommand ? `最近失败命令：${lastFailedCommand}` : "",
    changedFiles.length ? `变更文件：${changedFiles.slice(0, 3).join("、")}${changedFiles.length > 3 ? ` 等 ${changedFiles.length} 个` : ""}` : "",
    selectedHunks.length ? `已选 hunk：${selectedHunks.reduce((sum, item) => sum + Number(item.selectedHunks || 0), 0)} 个` : "",
    recommended?.capability?.area ? `推荐缺口：${recommended.capability.area} (${recommended.capability.status || "partial"})` : "",
    capabilityGapSummary ? `能力缺口：本地 ${capabilityGapSummary.localActionableCount || 0} 个 / 外部 ${capabilityGapSummary.externalBlockedCount || 0} 个` : "",
    contextRollup?.summary?.entries ? `滚动摘要：${contextRollup.summary.entries} 条` : ""
  ].filter(Boolean);
  const blockers = [
    pendingProposal?.id ? "先复核并批准或放弃待审批 diff。" : "",
    verification && !verification.ok && !verification.skipped ? "上次验证失败，继续前优先读取失败命令和相关文件。" : "",
    recommended?.capability?.next ? recommended.capability.next : ""
  ].filter(Boolean).slice(0, 5);
  const nextActions = [
    currentGoal.nextStep || "",
    pendingProposal?.diff ? "检查恢复的 diff 是否仍适用；需要时用逐 hunk 部分应用。" : "",
    lastFailedCommand ? `复现失败命令：${lastFailedCommand}` : "",
    verificationCommands.length ? `复查命令：${verificationCommands[0]}` : "",
    recommended?.capability?.area ? `补齐推荐能力：${recommended.capability.area}` : "",
    capabilityGapSummary?.nextLocalAction?.area ? `优先本地缺口：${capabilityGapSummary.nextLocalAction.area}` : ""
  ].filter(Boolean).slice(0, 6);
  return {
    status: currentGoal.status || "idle",
    phase: currentGoal.phase || "idle",
    objective: currentGoal.objective || "",
    updatedAt: currentGoal.updatedAt || "",
    pendingProposalId: pendingProposal?.id || "",
    debugTarget: pendingDebugTarget,
    browserTriage: pendingBrowserTriage,
    lastTaskId: currentGoal.lastTaskId || recentTask?.id || "",
    recommendedGap: recommended?.capability ? {
      area: recommended.capability.area || "",
      status: recommended.capability.status || "",
      reason: recommended.reason || "",
      next: recommended.capability.next || ""
    } : null,
    capabilityGapSummary,
    lastFailedCommand,
    changedFiles,
    selectedHunks,
    failedCommands,
    verificationCommands,
    cues,
    blockers,
    nextActions
  };
}

async function listTaskLogs(limit = 20) {
  await fs.mkdir(TASK_LOG_DIR, { recursive: true });
  const entries = await fs.readdir(TASK_LOG_DIR, { withFileTypes: true });
  const tasks = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const task = JSON.parse(await fs.readFile(path.join(TASK_LOG_DIR, entry.name), "utf8").catch(() => "{}"));
    if (task.workspace !== currentWorkspace) continue;
    tasks.push({
      id: task.id,
      prompt: task.prompt || "",
      createdAt: task.createdAt || "",
      status: task.status || "unknown",
      changedFiles: task.changedFiles || [],
      selectedHunks: Array.isArray(task.selectedHunks) ? task.selectedHunks : [],
      checksOk: Boolean(task.checksOk),
      checks: Array.isArray(task.checks) ? task.checks.slice(0, 8).map((check) => ({
        command: check.command || "",
        reason: check.reason || "",
        exitCode: check.exitCode ?? null,
        output: String(check.output || "").slice(0, 1200)
      })) : [],
      failedCommands: Array.isArray(task.checks) ? task.checks.filter((check) => Number(check.exitCode) !== 0).map((check) => check.command).filter(Boolean).slice(0, 8) : [],
      verificationCommands: Array.isArray(task.checks) ? task.checks.map((check) => check.command).filter(Boolean).slice(0, 8) : [],
      repairContext: task.repairContext?.command ? {
        command: task.repairContext.command,
        source: task.repairContext.source || "",
        status: task.repairContext.status || ""
      } : null
    });
  }
  return tasks.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, limit);
}

async function readTaskLog(id) {
  if (!/^[\w.-]+$/.test(String(id || ""))) throw new Error("task id 非法。");
  const task = JSON.parse(await fs.readFile(path.join(TASK_LOG_DIR, `${id}.json`), "utf8"));
  if (task.workspace !== currentWorkspace) {
    throw new Error("该任务不属于当前工作目录，请先切回对应目录。");
  }
  return task;
}

function normalizeQueuePriority(value = 0) {
  return Math.min(100, Math.max(-100, Number(value) || 0));
}

function normalizeQueueIsolationGroup(value = "default") {
  const group = String(value || "default").trim().toLowerCase().replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "");
  return group.slice(0, 80) || "default";
}

async function enqueueTask(prompt = "", options = {}) {
  const text = String(prompt || "").trim();
  if (!text) throw new Error("缺少可入队的任务描述。");
  await fs.mkdir(QUEUE_DIR, { recursive: true });
  const id = new Date().toISOString().replace(/[:.]/g, "-");
  const priority = normalizeQueuePriority(options.priority);
  const retryLimit = Math.min(10, Math.max(0, Number(options.retryLimit) || 0));
  const isolationGroup = normalizeQueueIsolationGroup(options.isolationGroup);
  const item = {
    id,
    prompt: text,
    workspace: currentWorkspace,
    status: "queued",
    isolationGroup,
    priority,
    retryCount: 0,
    retryLimit,
    createdAt: new Date().toISOString()
  };
  await fs.writeFile(path.join(QUEUE_DIR, `${id}.json`), JSON.stringify(item, null, 2), "utf8");
  return item;
}

async function listQueuedTasks(limit = 20) {
  await fs.mkdir(QUEUE_DIR, { recursive: true });
  const entries = await fs.readdir(QUEUE_DIR, { withFileTypes: true });
  const items = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const item = JSON.parse(await fs.readFile(path.join(QUEUE_DIR, entry.name), "utf8").catch(() => "{}"));
    if (item.workspace !== currentWorkspace) continue;
    items.push({
      id: item.id,
      prompt: item.prompt || "",
      status: item.status || "queued",
      isolationGroup: normalizeQueueIsolationGroup(item.isolationGroup),
      priority: normalizeQueuePriority(item.priority),
      retryCount: Math.max(0, Number(item.retryCount) || 0),
      retryLimit: Math.max(0, Number(item.retryLimit) || 0),
      createdAt: item.createdAt || ""
    });
  }
  return items
    .sort((a, b) => {
      if ((a.status === "active") !== (b.status === "active")) return a.status === "active" ? -1 : 1;
      if (b.priority !== a.priority) return b.priority - a.priority;
      return String(a.createdAt).localeCompare(String(b.createdAt));
    })
    .slice(0, limit);
}

async function updateQueuedTask(id, status, options = {}) {
  if (!/^[\w.-]+$/.test(String(id || ""))) throw new Error("queue id 非法。");
  const allowed = new Set(["queued", "active", "done", "skipped", "retry"]);
  if (!allowed.has(status)) throw new Error("queue status 非法。");
  const full = path.join(QUEUE_DIR, `${id}.json`);
  const item = JSON.parse(await fs.readFile(full, "utf8"));
  if (item.workspace !== currentWorkspace) {
    throw new Error("该队列任务不属于当前工作目录。");
  }
  if (options.priority !== undefined) item.priority = normalizeQueuePriority(options.priority);
  if (options.retryLimit !== undefined) item.retryLimit = Math.min(10, Math.max(0, Number(options.retryLimit) || 0));
  if (options.isolationGroup !== undefined) item.isolationGroup = normalizeQueueIsolationGroup(options.isolationGroup);
  item.isolationGroup = normalizeQueueIsolationGroup(item.isolationGroup);
  if (status === "active") {
    const activeConflict = (await listQueuedTasks(200)).find((candidate) => (
      candidate.id !== item.id
      && candidate.status === "active"
      && candidate.isolationGroup === item.isolationGroup
    ));
    if (activeConflict) {
      const error = new Error(`队列隔离组 ${item.isolationGroup} 已有 active 任务：${activeConflict.id}`);
      error.conflict = activeConflict;
      throw error;
    }
  }
  if (status === "retry") {
    item.retryCount = Math.max(0, Number(item.retryCount) || 0) + 1;
    item.status = "queued";
  } else {
    item.status = status;
  }
  item.updatedAt = new Date().toISOString();
  await fs.writeFile(full, JSON.stringify(item, null, 2), "utf8");
  return item;
}

async function activateNextQueuedTask() {
  const queue = await listQueuedTasks(100);
  const activeGroups = new Set(queue.filter((item) => item.status === "active").map((item) => item.isolationGroup));
  const next = queue.find((item) => item.status === "queued" && !activeGroups.has(item.isolationGroup));
  if (!next) return null;
  return updateQueuedTask(next.id, "active");
}

async function buildQueueIsolationReport({ limit = 100 } = {}) {
  const maxResults = Math.min(200, Math.max(1, Number(limit) || 100));
  const queue = await listQueuedTasks(maxResults);
  const groups = new Map();
  for (const item of queue) {
    const group = normalizeQueueIsolationGroup(item.isolationGroup);
    if (!groups.has(group)) {
      groups.set(group, {
        isolationGroup: group,
        active: [],
        queued: [],
        done: [],
        skipped: [],
        blockedActivations: []
      });
    }
    const bucket = groups.get(group);
    if (item.status === "active") bucket.active.push(item);
    else if (item.status === "queued") bucket.queued.push(item);
    else if (item.status === "done") bucket.done.push(item);
    else if (item.status === "skipped") bucket.skipped.push(item);
  }
  for (const group of groups.values()) {
    if (group.active.length) {
      group.blockedActivations = group.queued.map((item) => ({
        id: item.id,
        reason: `active task ${group.active[0].id} already owns isolation group ${group.isolationGroup}`
      }));
    }
  }
  const rows = Array.from(groups.values()).sort((left, right) => {
    if (right.active.length !== left.active.length) return right.active.length - left.active.length;
    return left.isolationGroup.localeCompare(right.isolationGroup);
  });
  return {
    generatedAt: new Date().toISOString(),
    workspace: currentWorkspace,
    summary: {
      groups: rows.length,
      activeGroups: rows.filter((row) => row.active.length).length,
      queuedBlockedByIsolation: rows.reduce((sum, row) => sum + row.blockedActivations.length, 0),
      activeConflictGroups: rows.filter((row) => row.active.length > 1).length
    },
    rows,
    policy: {
      access: "local-read-only",
      scope: "currentWorkspace",
      singleActivePerIsolationGroup: true,
      executesTasks: false,
      mutatesQueue: false,
      maxResults
    }
  };
}

async function writeReviewArtifact(record) {
  await fs.mkdir(REVIEW_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const id = `review-${stamp}`;
  const artifact = {
    id,
    workspace: currentWorkspace,
    createdAt: new Date().toISOString(),
    ...record
  };
  const full = path.join(REVIEW_DIR, `${id}.json`);
  await fs.writeFile(full, JSON.stringify(artifact, null, 2), "utf8");
  return {
    id,
    path: full,
    createdAt: artifact.createdAt,
    prompt: artifact.prompt || "",
    summary: artifact.reply || "",
    findingCount: Array.isArray(artifact.review) ? artifact.review.length : 0,
    commandCount: Array.isArray(artifact.commands) ? artifact.commands.length : 0,
    changedFiles: artifact.git?.changedFiles || []
  };
}

async function writeApprovalRequest(record) {
  await fs.mkdir(APPROVAL_DIR, { recursive: true });
  const id = `approval-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const approval = {
    id,
    workspace: currentWorkspace,
    createdAt: new Date().toISOString(),
    status: "blocked",
    ...record
  };
  const full = path.join(APPROVAL_DIR, `${id}.json`);
  await fs.writeFile(full, JSON.stringify(approval, null, 2), "utf8");
  return {
    id,
    path: full,
    type: approval.type || "command",
    command: approval.command || "",
    reason: approval.reason || approval.policy?.reason || "",
    risk: approval.policy?.risk || "blocked",
    status: approval.status,
    createdAt: approval.createdAt
  };
}

async function listApprovalRequests(limit = 20) {
  await fs.mkdir(APPROVAL_DIR, { recursive: true });
  const entries = await fs.readdir(APPROVAL_DIR, { withFileTypes: true });
  const approvals = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const approval = JSON.parse(await fs.readFile(path.join(APPROVAL_DIR, entry.name), "utf8").catch(() => "{}"));
    if (approval.workspace !== currentWorkspace) continue;
    approvals.push({
      id: approval.id,
      type: approval.type || "command",
      command: approval.command || "",
      reason: approval.reason || approval.policy?.reason || "",
      risk: approval.policy?.risk || "blocked",
      status: approval.status || "blocked",
      createdAt: approval.createdAt || ""
    });
  }
  return approvals.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, limit);
}

async function writeEscalationArtifact(approval, policy, reason = "") {
  await fs.mkdir(ESCALATION_DIR, { recursive: true });
  const id = `escalation-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const full = path.join(ESCALATION_DIR, `${id}.json`);
  const artifact = {
    id,
    workspace: currentWorkspace,
    approvalId: approval.id,
    type: approval.type || "command",
    command: approval.command || "",
    policy,
    reason,
    generatedAt: new Date().toISOString(),
    status: "requires_external_escalation",
    execution: {
      executed: false,
      blocked: true,
      reason: "本地策略拒绝的命令不会因批准状态而绕过执行；该 artifact 仅用于人工或外部沙箱审批。"
    },
    checklist: [
      "确认命令目标目录和参数符合预期",
      "确认不会删除、上传、下载或修改非目标资源",
      "在外部受控环境中单独授权执行",
      "执行后把输出和退出码回填到任务记录"
    ]
  };
  await fs.writeFile(full, JSON.stringify(artifact, null, 2), "utf8");
  return {
    id,
    path: full,
    relativePath: toPosix(path.relative(APP_ROOT, full)),
    status: artifact.status
  };
}

function approvalEscalationPolicy(approval = {}) {
  if (approval.type === "process") return evaluateProcessPolicy(approval.command || "");
  if (approval.type === "remote_publish_plan") {
    return {
      allowed: false,
      risk: "high",
      reason: "远端发布、PR 创建或评论回写需要外部平台凭据和人工授权。",
      command: approval.command || "remote publish plan"
    };
  }
  if (approval.type === "mcp_tool_call" || approval.type === "extension_tool_call") {
    return {
      allowed: false,
      risk: approval.policy?.risk || "medium",
      reason: approval.reason || approval.policy?.reason || "工具调用需要在审批后由受控执行器处理。",
      command: approval.command || approval.type
    };
  }
  return evaluateCommandPolicy(approval.command || "");
}

async function createApprovalEscalationArtifact(id, { reason = "" } = {}) {
  const approval = await readApprovalRequest(id);
  const policy = approvalEscalationPolicy(approval);
  const escalationReason = reason || [
    approval.status === "approved" ? "审批已批准，但本地策略仍不直接执行该动作。" : "审批尚未批准或仍被阻塞。",
    "生成外部受控沙箱升级证据包，用于人工确认、外部执行和回填结果。"
  ].join(" ");
  const escalation = await writeEscalationArtifact(approval, policy, escalationReason);
  const updated = {
    ...approval,
    escalation,
    execution: {
      ...(approval.execution || {}),
      allowedByApproval: approval.status === "approved",
      executed: false,
      blocked: true,
      policy,
      escalation,
      reason: "已生成升级证据包；本地未执行被拦截命令或远端写入。",
      checkedAt: new Date().toISOString()
    }
  };
  await fs.writeFile(path.join(APPROVAL_DIR, `${id}.json`), JSON.stringify(updated, null, 2), "utf8");
  return {
    id: updated.id,
    status: updated.status,
    type: updated.type || "command",
    escalation,
    execution: updated.execution,
    policy: {
      access: "external-escalation-artifact-only",
      executesCommands: false,
      writesRemote: false,
      requiresExternalApproval: true
    }
  };
}

async function readApprovalRequest(id) {
  if (!/^[\w.-]+$/.test(String(id || ""))) throw new Error("approval id 非法。");
  const approval = JSON.parse(await fs.readFile(path.join(APPROVAL_DIR, `${id}.json`), "utf8"));
  if (approval.workspace !== currentWorkspace) {
    throw new Error("该审批请求不属于当前工作目录。");
  }
  return approval;
}

async function updateApprovalDecision(id, { decision = "", note = "" } = {}) {
  if (!["approved", "rejected"].includes(String(decision))) {
    throw new Error("审批 decision 只能是 approved 或 rejected。");
  }
  const approval = await readApprovalRequest(id);
  const updated = {
    ...approval,
    status: decision,
    decidedAt: new Date().toISOString(),
    decisionNote: String(note || "").slice(0, 2000),
    execution: {
      allowedByApproval: decision === "approved",
      executed: false,
      reason: decision === "approved"
        ? "审批状态已记录；此端点只做审计状态流转，不执行被拦截命令或远端写入。"
        : "审批已拒绝；不会执行该动作。"
    }
  };
  await fs.writeFile(path.join(APPROVAL_DIR, `${id}.json`), JSON.stringify(updated, null, 2), "utf8");
  return {
    id: updated.id,
    type: updated.type || "command",
    command: updated.command || "",
    status: updated.status,
    decidedAt: updated.decidedAt,
    execution: updated.execution
  };
}

async function executeApprovedRequest(id) {
  const approval = await readApprovalRequest(id);
  if (approval.status !== "approved") {
    throw new Error("审批请求尚未批准，不能执行。");
  }
  if (approval.execution?.executed) {
    return {
      id: approval.id,
      status: approval.status,
      skipped: true,
      reason: "该审批请求已经执行过。",
      execution: approval.execution
    };
  }
  if (approval.type === "remote_publish_plan") {
    const updated = {
      ...approval,
      execution: {
        allowedByApproval: true,
        executed: false,
        blocked: true,
        reason: "远端发布计划需要外部平台凭据和显式人工执行，本端点不会执行 git push、创建 PR/MR 或写远端评论。",
        checkedAt: new Date().toISOString()
      }
    };
    await fs.writeFile(path.join(APPROVAL_DIR, `${id}.json`), JSON.stringify(updated, null, 2), "utf8");
    return {
      id: updated.id,
      status: updated.status,
      type: updated.type,
      execution: updated.execution
    };
  }
  if (approval.type === "mcp_tool_call") {
    const target = approval.mcp || {};
    try {
      const result = await executeMcpToolCall(target.serverName || "", target.toolName || "", target.arguments || {});
      const updated = {
        ...approval,
        execution: {
          allowedByApproval: true,
          executed: true,
          blocked: false,
          result,
          checkedAt: new Date().toISOString()
        }
      };
      await fs.writeFile(path.join(APPROVAL_DIR, `${id}.json`), JSON.stringify(updated, null, 2), "utf8");
      return { id: updated.id, status: updated.status, type: updated.type, execution: updated.execution };
    } catch (error) {
      const updated = {
        ...approval,
        execution: {
          allowedByApproval: true,
          executed: false,
          blocked: true,
          reason: error.message,
          checkedAt: new Date().toISOString()
        }
      };
      await fs.writeFile(path.join(APPROVAL_DIR, `${id}.json`), JSON.stringify(updated, null, 2), "utf8");
      return { id: updated.id, status: updated.status, type: updated.type, execution: updated.execution };
    }
  }
  if (approval.type === "extension_tool_call") {
    const target = approval.extension || {};
    try {
      const result = await executeExtensionToolCall(target.name || "", target.toolName || "", target.arguments || {});
      const updated = {
        ...approval,
        execution: {
          allowedByApproval: true,
          executed: true,
          blocked: false,
          result,
          checkedAt: new Date().toISOString()
        }
      };
      await fs.writeFile(path.join(APPROVAL_DIR, `${id}.json`), JSON.stringify(updated, null, 2), "utf8");
      return { id: updated.id, status: updated.status, type: updated.type, execution: updated.execution };
    } catch (error) {
      const updated = {
        ...approval,
        execution: {
          allowedByApproval: true,
          executed: false,
          blocked: true,
          reason: error.message,
          checkedAt: new Date().toISOString()
        }
      };
      await fs.writeFile(path.join(APPROVAL_DIR, `${id}.json`), JSON.stringify(updated, null, 2), "utf8");
      return { id: updated.id, status: updated.status, type: updated.type, execution: updated.execution };
    }
  }
  if (approval.type === "process") {
    const policy = evaluateProcessPolicy(approval.command || "");
    if (!policy.allowed) {
      const escalation = await writeEscalationArtifact(
        approval,
        policy,
        "批准已记录，但进程命令仍未通过受管进程安全策略，需要外部受控沙箱升级。"
      );
      const updated = {
        ...approval,
        execution: {
          allowedByApproval: true,
          executed: false,
          blocked: true,
          policy,
          escalation,
          reason: "批准已记录，但命令仍未通过受管进程安全策略，未执行。",
          checkedAt: new Date().toISOString()
        }
      };
      await fs.writeFile(path.join(APPROVAL_DIR, `${id}.json`), JSON.stringify(updated, null, 2), "utf8");
      return { id: updated.id, status: updated.status, type: updated.type, execution: updated.execution };
    }
    const result = await startManagedProcess(policy.command);
    const updated = {
      ...approval,
      execution: {
        allowedByApproval: true,
        executed: !result.blocked,
        blocked: Boolean(result.blocked),
        result,
        checkedAt: new Date().toISOString()
      }
    };
    await fs.writeFile(path.join(APPROVAL_DIR, `${id}.json`), JSON.stringify(updated, null, 2), "utf8");
    return { id: updated.id, status: updated.status, type: updated.type, execution: updated.execution };
  }
  const policy = evaluateCommandPolicy(approval.command || "");
  if (!policy.allowed) {
    const escalation = await writeEscalationArtifact(
      approval,
      policy,
      "批准已记录，但命令仍未通过本地命令安全策略，需要外部受控沙箱升级。"
    );
    const updated = {
      ...approval,
      execution: {
        allowedByApproval: true,
        executed: false,
        blocked: true,
        policy,
        escalation,
        reason: "批准已记录，但命令仍未通过本地命令安全策略，未执行。",
        checkedAt: new Date().toISOString()
      }
    };
    await fs.writeFile(path.join(APPROVAL_DIR, `${id}.json`), JSON.stringify(updated, null, 2), "utf8");
    return { id: updated.id, status: updated.status, type: updated.type || "command", execution: updated.execution };
  }
  const result = await executeCommand(policy.command);
  const updated = {
    ...approval,
    execution: {
      allowedByApproval: true,
      executed: true,
      blocked: false,
      policy,
      result,
      checkedAt: new Date().toISOString()
    }
  };
  await fs.writeFile(path.join(APPROVAL_DIR, `${id}.json`), JSON.stringify(updated, null, 2), "utf8");
  return { id: updated.id, status: updated.status, type: updated.type || "command", execution: updated.execution };
}

async function listReviewArtifacts(limit = 20) {
  await fs.mkdir(REVIEW_DIR, { recursive: true });
  const entries = await fs.readdir(REVIEW_DIR, { withFileTypes: true });
  const reviews = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const artifact = JSON.parse(await fs.readFile(path.join(REVIEW_DIR, entry.name), "utf8").catch(() => "{}"));
    if (artifact.workspace !== currentWorkspace) continue;
    reviews.push({
      id: artifact.id,
      createdAt: artifact.createdAt || "",
      prompt: artifact.prompt || "",
      summary: artifact.reply || "",
      findingCount: Array.isArray(artifact.review) ? artifact.review.length : 0,
      commandCount: Array.isArray(artifact.commands) ? artifact.commands.length : 0,
      changedFiles: artifact.git?.changedFiles || []
    });
  }
  return reviews.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, limit);
}

async function readReviewArtifact(id) {
  if (!/^[\w.-]+$/.test(String(id || ""))) throw new Error("review id 非法。");
  const artifact = JSON.parse(await fs.readFile(path.join(REVIEW_DIR, `${id}.json`), "utf8"));
  if (artifact.workspace !== currentWorkspace) {
    throw new Error("该审查记录不属于当前工作目录，请先切回对应目录。");
  }
  return artifact;
}

async function buildReviewCommentDraft(id = "") {
  const artifactId = String(id || "").trim() || (await listReviewArtifacts(1))[0]?.id || "";
  if (!artifactId) throw new Error("没有可导出的审查记录。");
  const artifact = await readReviewArtifact(artifactId);
  const git = artifact.git || await getGitSummary();
  const changedFiles = new Set((artifact.git?.changedFiles || git.changedFiles || []).map(String));
  const comments = (Array.isArray(artifact.review) ? artifact.review : [])
    .map((item, index) => {
      const file = String(item.file || "").trim();
      const rawLine = String(item.line || "").trim();
      const line = Number.parseInt(rawLine, 10);
      const severity = String(item.severity || "info").toLowerCase();
      const message = String(item.message || "").trim();
      return {
        id: `${artifact.id}-comment-${index + 1}`,
        path: file,
        line: Number.isFinite(line) && line > 0 ? line : null,
        side: "RIGHT",
        severity: ["error", "warning", "info"].includes(severity) ? severity : "info",
        body: message,
        sourceLine: rawLine,
        changedFile: file ? changedFiles.has(file) : false,
        ready: Boolean(file && message && Number.isFinite(line) && line > 0)
      };
    })
    .filter((item) => item.body);
  const readyComments = comments.filter((item) => item.ready);
  const body = [
    `# PR Review Comments - ${artifact.id}`,
    "",
    `Workspace: ${currentWorkspace}`,
    `Branch: ${git.branch || "n/a"}`,
    "",
    "## Ready Line Comments",
    readyComments.length
      ? readyComments.map((item) => [
          `- [${item.severity.toUpperCase()}] ${item.path}:${item.line}`,
          `  ${item.body}`
        ].join("\n")).join("\n")
      : "- No line comments with file and line.",
    "",
    "## Needs Mapping",
    comments.filter((item) => !item.ready).length
      ? comments.filter((item) => !item.ready).map((item) => `- [${item.severity.toUpperCase()}] ${item.path || "(missing file)"}:${item.sourceLine || "(missing line)"} ${item.body}`).join("\n")
      : "- None.",
    "",
    "## GitHub Review API Shape",
    "```json",
    JSON.stringify({
      event: "COMMENT",
      comments: readyComments.map((item) => ({
        path: item.path,
        line: item.line,
        side: item.side,
        body: `[${item.severity}] ${item.body}`
      }))
    }, null, 2),
    "```"
  ].join("\n");
  return {
    id: artifact.id,
    createdAt: new Date().toISOString(),
    status: readyComments.length ? "drafted" : "needs_mapping",
    summary: {
      totalFindings: comments.length,
      readyComments: readyComments.length,
      needsMapping: comments.length - readyComments.length
    },
    comments,
    body,
    policy: {
      access: "local-draft-only",
      writesRemoteReview: false,
      requiresExternalApprovalForPublish: true
    },
    artifact: {
      id: artifact.id,
      prompt: artifact.prompt || "",
      summary: artifact.reply || ""
    }
  };
}

async function getCurrentDiff() {
  return getCurrentDiffEvidence({ includeDiff: true });
}

async function getCurrentDiffEvidence({ includeDiff = true } = {}) {
  const inside = await runLocalProcess("git", ["rev-parse", "--is-inside-work-tree"], {
    timeout: 2000,
    maxBuffer: 4096
  });
  if (!inside.ok || inside.output.split(/\r?\n/)[0] !== "true") {
    return {
      available: false,
      diff: "",
      stat: "",
      git: { available: false, branch: "", root: "", status: [], changedFiles: [], remotes: [], upstream: "" }
    };
  }
  const diffPromise = includeDiff
    ? runLocalProcess("git", ["diff", "--no-ext-diff", "--", "."], {
      timeout: 10000,
      maxBuffer: 160000
    })
    : Promise.resolve({ ok: true, exitCode: 0, output: "", error: "" });
  const [branchResult, rootResult, statusResult, diff, stat] = await Promise.all([
    runLocalProcess("git", ["branch", "--show-current"], { timeout: 2000, maxBuffer: 4096 }),
    runLocalProcess("git", ["rev-parse", "--show-toplevel"], { timeout: 2000, maxBuffer: 4096 }),
    runLocalProcess("git", ["status", "--short", "--untracked-files=no"], { timeout: 3000, maxBuffer: 16000 }),
    diffPromise,
    runLocalProcess("git", ["diff", "--no-ext-diff", "--stat", "--", "."], {
      timeout: 5000,
      maxBuffer: 32000
    })
  ]);
  const status = parseGitStatusOutput(statusResult.output);
  const git = {
    available: true,
    branch: branchResult.output,
    root: rootResult.output,
    status,
    changedFiles: changedFilesFromGitStatus(status),
    remotes: [],
    upstream: "",
    light: true
  };
  const truncated = diff.output.length >= 160000;
  return {
    available: true,
    diff: includeDiff ? diff.output.slice(0, 120000) : "",
    stat: stat.output,
    git,
    truncated,
    warnings: [
      includeDiff ? "" : "Full git diff omitted in light evidence mode.",
      diff.exitCode === 124 ? "git diff timed out; returned truncated evidence." : "",
      stat.exitCode === 124 ? "git diff --stat timed out." : "",
      truncated ? "git diff exceeded local evidence cap; output was clipped." : ""
    ].filter(Boolean)
  };
}

async function reviewCurrentChanges(prompt = "") {
  const evidence = await getCurrentDiff();
  if (!evidence.available) {
    throw new Error("当前工作区不是 Git 仓库，无法生成 Git diff 审查证据。");
  }
  if (!evidence.diff.trim()) {
    const payload = {
      reply: "当前没有 Git diff 可审查。",
      plan: [],
      diff: "",
      review: [],
      commands: [],
      evidence
    };
    const artifact = await writeReviewArtifact({
      prompt,
      reply: payload.reply,
      plan: payload.plan,
      review: payload.review,
      commands: payload.commands,
      evidence: { ...evidence, diff: "" },
      git: evidence.git
    });
    return { ...payload, artifact };
  }

  const repoMap = await buildRepoMap();
  const messages = [
    {
      role: "system",
      content: [
        "你是 Forge Code 的代码审查代理。你只审查当前 Git diff，不生成代码修改。",
        "优先指出真实 bug、回归风险、缺失测试和安全问题；不要做泛泛风格建议。",
        "最终回复必须是 JSON 对象：{\"reply\":\"中文摘要\",\"plan\":[\"审查步骤\"],\"diff\":\"\",\"review\":[{\"severity\":\"info|warning|error\",\"message\":\"审查发现\",\"file\":\"相对路径\",\"line\":\"行号\"}],\"commands\":[{\"command\":\"建议检查命令\",\"reason\":\"原因\"}]}"
      ].join("\n")
    },
    {
      role: "user",
      content: [
        `用户意图：${prompt || "(未提供)"}`,
        "",
        "仓库地图摘要：",
        JSON.stringify({
          fileCount: repoMap.fileCount,
          extCounts: repoMap.extCounts,
          scripts: repoMap.scripts,
          symbols: repoMap.symbols.slice(0, 80)
        }),
        "",
        "Git diff stat：",
        evidence.stat || "(无)",
        "",
        "Git diff：",
        evidence.diff
      ].join("\n")
    }
  ];
  const message = await callDeepSeekMessages(messages, null);
  const payload = normalizeAgentPayload(message.content);
  const commands = await discoverCheckCommands(payload.commands);
  const artifact = await writeReviewArtifact({
    prompt,
    reply: payload.reply || "",
    plan: payload.plan || [],
    review: payload.review || [],
    commands,
    evidence,
    git: evidence.git
  });
  return { ...payload, diff: "", patches: [], commands, evidence, artifact };
}

function markdownList(items = []) {
  if (!items.length) return "- 无";
  return items.map((item) => `- ${item}`).join("\n");
}

async function createHandoffDraft(prompt = "", { deep = false } = {}) {
  await fs.mkdir(HANDOFF_DIR, { recursive: true });
  const git = deep
    ? await getGitSummary()
    : { available: false, branch: "", status: [], changedFiles: [], skipped: "Use /api/handoff?deep=1 to include git status." };
  const evidence = deep
    ? await getCurrentDiff()
    : {
      available: git.available,
      diff: "",
      stat: "(diff omitted in light handoff; use /api/handoff?deep=1 for full diff evidence)",
      git,
      truncated: false,
      warnings: ["Light handoff omits full git diff to keep local draft generation bounded."]
    };
  const tasks = await listTaskLogs(5);
  const checks = tasks.flatMap((task) => task.checks || []).slice(0, 12);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const id = `handoff-${stamp}`;
  const title = String(prompt || tasks[0]?.prompt || "Forge Code handoff").trim();
  const changedFiles = git.changedFiles || [];
  const body = [
    `# ${title}`,
    "",
    "## Summary",
    markdownList([
      `Workspace: ${currentWorkspace}`,
      `Branch: ${git.branch || "n/a"}`,
      `Status: ${git.status?.length ? `${git.status.length} changed file(s)` : "clean"}`
    ]),
    "",
    "## Changed Files",
    markdownList(changedFiles),
    "",
    "## Verification",
    checks.length
      ? checks.map((check) => `- ${check.exitCode === 0 ? "PASS" : "FAIL"} \`${check.command}\`${check.reason ? ` - ${check.reason}` : ""}`).join("\n")
      : "- No checks recorded yet.",
    "",
    "## Recent Task Evidence",
    tasks.length
      ? tasks.map((task) => `- ${task.status}: ${task.prompt || "(empty prompt)"} (${task.id})`).join("\n")
      : "- No task log entries for this workspace.",
    "",
    "## Diff Stat",
    "```text",
    evidence.stat || "(no git diff stat)",
    "```",
    "",
    "## Diff",
    "```diff",
    evidence.diff || (deep ? "(no git diff available)" : "(diff omitted in light handoff)"),
    "```"
  ].join("\n");
  const fileName = `${id}.md`;
  await fs.writeFile(path.join(HANDOFF_DIR, fileName), body, "utf8");
  return {
    id,
    path: path.join(HANDOFF_DIR, fileName),
    title,
    body,
    git,
    tasks,
    evidence,
    policy: {
      light: !deep,
      includesFullDiff: Boolean(deep && evidence.diff),
      deepMode: "/api/handoff?deep=1"
    }
  };
}

function isExternalCapabilityDependency(capability = {}) {
  return Boolean(capability.externalDependency)
    || /(远端|真实 PR|push|provider|云端|凭据|认证|扩展市场|签名链|跨站点|账单直连|系统级沙箱)/i.test(`${capability.area || ""} ${capability.next || ""}`);
}

function buildCapabilityFocusFiles(capability = {}) {
  const text = `${capability.area || ""} ${capability.next || ""}`;
  const files = new Set(["server.js", "app.js", "README.md"]);
  if (/浏览器|视觉|Trace|DOM|进程|调试|长任务|界面|UI|按钮|面板|工作台|能力矩阵/i.test(text)) {
    files.add("index.html");
    files.add("styles.css");
  }
  if (/启动|端口|本地运行/i.test(text)) files.add("start.bat");
  if (/验证|validate|smoke|检查/i.test(text)) files.add("validate.bat");
  return [...files];
}

function buildCapabilityVerificationCommands(capability = {}) {
  const text = `${capability.area || ""} ${capability.next || ""}`;
  const commands = [
    commandItem("node --check server.js", "后端 API、agent loop 和 smoke 脚本语法检查。", { source: "capability-task" }),
    commandItem("node --check app.js", "前端工作台交互脚本语法检查。", { source: "capability-task" })
  ];
  const add = (command, reason) => {
    if (!commands.some((item) => item.command === command)) {
      commands.push(commandItem(command, reason, { source: "capability-task" }));
    }
  };
  if (/浏览器|视觉|Trace|DOM|调试|进程|长任务/i.test(text)) {
    add("node server.js --api-smoke-section=debug", "验证浏览器、调试诊断、长任务和源码定位闭环。");
    add("node server.js --api-smoke-section=browser", "验证浏览器检查、Trace、截图、DOM 和视觉入口。");
  } else if (/工具|MCP|扩展|资产|多模态/i.test(text)) {
    add("node server.js --api-smoke-section=integrations", "验证扩展、MCP、资产和本地工具入口。");
  } else if (/发布|PR|CI|远端|权限|审批|门禁/i.test(text)) {
    add("node server.js --api-smoke-section=publish", "验证 PR readiness、发布审批和远端预检只读链路。");
    add("node server.js --api-smoke-section=gates", "验证验证计划、CI 状态、合并门禁和权限矩阵。");
  } else if (/语义|上下文|符号|依赖|引用|重命名/i.test(text)) {
    add("node server.js --api-smoke-section=semantic", "验证语义索引、定义、引用、影响面和诊断。");
  } else {
    add("node server.js --api-smoke-section=fast", "快速覆盖核心写代码、调试、上下文和门禁链路。");
  }
  add("git diff --check -- server.js app.js README.md index.html styles.css package.json start.bat validate.bat", "检查补丁空白和格式问题。");
  return commands.slice(0, 8);
}

function buildExternalCapabilityPreparation(capability = {}) {
  if (!isExternalCapabilityDependency(capability)) return null;
  const text = `${capability.area || ""} ${capability.next || ""}`;
  const authorizationItems = [];
  const addAuth = (item) => {
    if (item && !authorizationItems.includes(item)) authorizationItems.push(item);
  };
  if (/PR|CI|远端|发布|push|代码托管|provider|GitHub|GitLab|Gitee|评论/i.test(text)) {
    addAuth("确认代码托管平台、目标仓库、默认分支和可用 CLI（gh / glab / git）。");
    addAuth("准备只读 PR/CI 查询权限；如需发布，再单独审批 push、PR 创建和评论回写权限。");
  }
  if (/MCP|扩展|工具|provider|市场|签名/i.test(text)) {
    addAuth("准备 MCP server 配置、扩展 manifest、信任来源和可执行工具白名单。");
    addAuth("确认是否允许本地探测 tools/resources/prompts，远端 tools/call 需单独审批。");
  }
  if (/浏览器|跨站点|云端/i.test(text)) {
    addAuth("确认允许访问的站点范围、登录状态来源、浏览器 profile 策略和截图/Trace 数据留存规则。");
  }
  if (/模型|账单|成本|provider/i.test(text)) {
    addAuth("准备模型 provider、候选模型、预算上限、价格表和账单核对数据来源。");
  }
  if (/权限|审批|沙箱|系统级/i.test(text)) {
    addAuth("明确哪些命令、目录、网络、远端写入或系统级操作必须走用户审批。");
  }
  if (!authorizationItems.length) {
    addAuth("明确需要用户提供的凭据、CLI 登录、远端平台权限和允许执行范围。");
  }
  const localReadinessCommands = buildCapabilityVerificationCommands(capability).slice(0, 5);
  return {
    title: `本地准备清单 · ${capability.area || "外部能力"}`,
    authorizationItems: authorizationItems.slice(0, 6),
    localReadinessCommands,
    localArtifacts: buildCapabilityFocusFiles(capability),
    prompt: [
      `请为 ${capability.area || "这项外部能力"} 生成授权准备和本地预检方案。`,
      "不要执行远端写入；先列出需要用户确认的权限、凭据、CLI 登录和风险边界。",
      "然后给出当前本地可运行的只读预检、smoke 或替代验证路径。"
    ].join("\n")
  };
}

function buildCapabilityTaskPlan(capability = {}) {
  if (!capability?.area) return null;
  const externalBlocked = isExternalCapabilityDependency(capability);
  const verificationCommands = buildCapabilityVerificationCommands(capability);
  const externalPreparation = externalBlocked ? buildExternalCapabilityPreparation(capability) : null;
  const acceptance = externalBlocked
    ? [
        "明确列出需要用户提供的授权、凭据、CLI 登录或远端平台权限。",
        "保留本地只读预检或替代验证路径，不把外部阻塞项标为已完成。",
        "拿到授权后能直接执行对应只读探测、预检或审批包生成。"
      ]
    : [
        "补齐一个能从 UI 直接进入提示词、验证命令或修复代理的最小闭环。",
        "更新能力矩阵证据和 README，说明新链路如何帮助写代码/调试程序。",
        "至少通过语法检查和相关 API smoke，必要时跑全量 api-smoke。"
      ];
  return {
    title: `${externalBlocked ? "授权/替代路径" : "本地补齐闭环"} · ${capability.area}`,
    blocked: externalBlocked,
    objective: externalBlocked
      ? "把外部依赖拆成可执行授权清单，并给出本地替代验证方式。"
      : "把这项能力推进到可演示、可验证、可恢复的开发调试闭环。",
    focusFiles: buildCapabilityFocusFiles(capability),
    acceptance,
    verificationCommands,
    externalPreparation,
    nextAction: capability.next || "",
    evidence: (capability.evidence || []).slice(0, 8),
    policy: {
      writesFiles: false,
      executesCommands: false,
      externalDependency: externalBlocked,
      source: "capability-task-plan"
    }
  };
}

function enrichCapabilityForAudit(capability = {}) {
  const externalDependency = isExternalCapabilityDependency(capability);
  const normalized = {
    ...capability,
    externalDependency
  };
  return {
    ...normalized,
    taskPlan: buildCapabilityTaskPlan(normalized)
  };
}

function compactCapabilityGap(capability = {}, { includeCommands = false } = {}) {
  const taskPlan = capability.taskPlan || buildCapabilityTaskPlan(capability);
  return {
    area: capability.area || "",
    status: capability.status || "partial",
    next: capability.next || taskPlan?.nextAction || "",
    externalDependency: Boolean(capability.externalDependency),
    focusFiles: (taskPlan?.focusFiles || []).slice(0, 6),
    acceptance: (taskPlan?.acceptance || []).slice(0, 3),
    verificationCommands: includeCommands
      ? (taskPlan?.verificationCommands || []).slice(0, 4)
      : (taskPlan?.verificationCommands || []).slice(0, 4).map((item) => item.command || item).filter(Boolean),
    externalPreparation: taskPlan?.externalPreparation ? {
      title: taskPlan.externalPreparation.title || "",
      authorizationItems: (taskPlan.externalPreparation.authorizationItems || []).slice(0, 4),
      localReadinessCommands: (taskPlan.externalPreparation.localReadinessCommands || []).slice(0, 4).map((item) => item.command || item).filter(Boolean)
    } : null,
    evidence: (capability.evidence || []).slice(0, 4)
  };
}

function buildCapabilityGapSummary(comparison = {}, recommendedNext = null) {
  const outstandingGaps = Array.isArray(comparison.outstandingGaps) ? comparison.outstandingGaps : [];
  const localActionableGaps = Array.isArray(comparison.localActionableGaps)
    ? comparison.localActionableGaps
    : outstandingGaps.filter((item) => !item.externalDependency);
  const externalBlockedGaps = Array.isArray(comparison.externalBlockedGaps)
    ? comparison.externalBlockedGaps
    : outstandingGaps.filter((item) => item.externalDependency);
  const topLocalGaps = localActionableGaps.slice(0, 5).map((item) => compactCapabilityGap(item));
  const topExternalGaps = externalBlockedGaps.slice(0, 5).map((item) => compactCapabilityGap(item));
  const nextLocalAction = topLocalGaps[0] || null;
  const recommendedGap = recommendedNext?.capability
    ? compactCapabilityGap(recommendedNext.capability, { includeCommands: true })
    : null;
  return {
    status: comparison.status || (outstandingGaps.length ? "partial" : "implemented"),
    totalOutstanding: outstandingGaps.length,
    localActionableCount: localActionableGaps.length,
    externalBlockedCount: externalBlockedGaps.length,
    requirementSummary: comparison.summary || {},
    recommendedGap,
    nextLocalAction,
    topLocalGaps,
    topExternalGaps,
    externalPreparation: externalBlockedGaps.length ? {
      title: "外部缺口本地准备",
      count: externalBlockedGaps.length,
      authorizationItems: uniqueLimited(topExternalGaps.flatMap((gap) => gap.externalPreparation?.authorizationItems || []), 8),
      localReadinessCommands: uniqueLimited(topExternalGaps.flatMap((gap) => gap.externalPreparation?.localReadinessCommands || []), 8),
      firstAction: topExternalGaps[0]?.externalPreparation?.title || topExternalGaps[0]?.area || ""
    } : null,
    guidance: localActionableGaps.length
      ? "优先推进本地可验证缺口；外部授权项保留为清单，不阻塞当前编码/调试体验改进。"
      : externalBlockedGaps.length
        ? "剩余缺口主要依赖外部授权、凭据或远端平台；继续前先准备授权清单。"
        : "当前能力矩阵没有未完成缺口，继续用真实任务和 smoke 验证体验。"
  };
}

function buildCapabilityComparison(capabilities = []) {
  const byArea = new Map((Array.isArray(capabilities) ? capabilities : []).map((item) => [item.area, item]));
  const requirementDefs = [
    {
      id: "context",
      title: "读懂项目上下文",
      goal: "写代码前能快速定位文件、符号、引用、依赖和会话背景。",
      areas: ["上下文索引", "会话线程管理", "可恢复状态"]
    },
    {
      id: "safe-edit",
      title: "安全改代码",
      goal: "生成 diff 后可审批写入、冲突预检、部分应用、回滚和隔离任务。",
      areas: ["审批写入与回滚", "Git 隔离", "权限与命令策略"]
    },
    {
      id: "debug-loop",
      title: "运行与调试闭环",
      goal: "能发现启动命令、管理长任务、跑验证、读失败证据并进入可验证修复。",
      areas: ["验证与修复闭环", "长任务管理", "浏览器自动化与视觉回归", "真实浏览器交互与截图", "浏览器 DOM 交互", "像素级视觉断言"]
    },
    {
      id: "review-ship",
      title: "审查与交付",
      goal: "能产出审查证据、PR readiness、交付草稿和远端发布前置检查。",
      areas: ["代码审查证据", "交付草稿", "远端 PR 与 CI 集成", "真实远端发布与平台同步"]
    },
    {
      id: "tool-ecosystem",
      title: "工具与多模态",
      goal: "能接入本地工具、MCP、扩展、浏览器自动化、资产检查和模型运行层。",
      areas: ["工具生态", "外部工具与浏览器自动化", "多模态与浏览器执行", "模型运行层"]
    }
  ];
  const requirements = requirementDefs.map((definition) => {
    const matched = definition.areas.map((area) => byArea.get(area)).filter(Boolean);
    const gaps = matched
      .filter((item) => item.status !== "implemented")
      .map((item) => ({
        area: item.area,
        status: item.status,
        next: item.next || "",
        evidence: (item.evidence || []).slice(0, 6)
      }));
    const status = !matched.length || gaps.some((item) => item.status === "missing")
      ? "missing"
      : gaps.length
        ? "partial"
        : "implemented";
    return {
      ...definition,
      status,
      evidence: matched.flatMap((item) => item.evidence || []).slice(0, 12),
      gaps,
      nextAction: gaps[0]?.next || "当前需求链路已有本地证据覆盖；继续用 smoke 和真实任务验证体验。"
    };
  });
  const summary = requirements.reduce((acc, item) => {
    acc[item.status] = (acc[item.status] || 0) + 1;
    return acc;
  }, {});
  const outstandingGaps = (Array.isArray(capabilities) ? capabilities : [])
    .filter((item) => item && item.status !== "implemented")
    .map((item) => {
      return {
        area: item.area,
        status: item.status,
        externalDependency: Boolean(item.externalDependency),
        evidence: (item.evidence || []).slice(0, 8),
        next: item.next || "",
        taskPlan: item.taskPlan || null
      };
    });
  return {
    status: summary.missing ? "missing" : summary.partial ? "partial" : "implemented",
    summary,
    requirements,
    outstandingGaps,
    localActionableGaps: outstandingGaps.filter((item) => !item.externalDependency),
    externalBlockedGaps: outstandingGaps.filter((item) => item.externalDependency),
    definitionOfDone: [
      "上下文、编辑、运行调试、审查交付和工具生态五条主链路均有本地可验证证据。",
      "所有 partial/missing 项都有明确下一步、证据来源和是否依赖外部授权的标记。",
      "用户能从任一缺口直接进入提示词、验证命令或修复代理。"
    ]
  };
}

async function buildCapabilityAudit({ light = false } = {}) {
  const git = light
    ? { available: false, branch: "", root: "", status: [], changedFiles: [], remotes: [], upstream: "", skipped: "light capability audit" }
    : await getGitSummary();
  const tasks = light ? [] : await listTaskLogs(5);
  const threads = light ? [] : await listThreads(5, { includeArchived: true });
  const queue = light ? [] : await listQueuedTasks(5);
  const reviews = light ? [] : await listReviewArtifacts(5);
  const approvals = light ? [] : await listApprovalRequests(5);
  const extensions = light ? { summary: { total: 0, skill: 0, plugin: 0 }, extensions: [] } : await listExtensions();
  const mcp = light ? { summary: { total: 0, stdio: 0, http: 0, disabled: 0, probed: 0, tools: 0, resources: 0, prompts: 0 }, servers: [] } : await discoverMcpServers();
  const assets = light
    ? { summary: { total: 0, image: 0, document: 0, data: 0, media: 0 }, assets: [] }
    : await buildAssetCatalog();
  const goal = await readGoalState();
  const managedProcessCount = light ? 0 : (await listManagedProcesses()).length;
  const modelReadiness = buildModelRuntimeCapabilityReadiness();
  const capabilities = [
    {
      area: "上下文索引",
      status: "implemented",
      evidence: ["repo_map", "read_file_range", "search_files", "/api/semantic-index", "/api/code-intelligence", "/api/symbol-outline", "/api/semantic-definition", "/api/semantic-search", "/api/semantic-references", "/api/dependency-graph", ".forge/state/semantic-index.json"],
      next: "已补本地语义索引、代码智能概览、零依赖符号大纲、定义查询、语义检索、符号引用跳转、导入依赖图和 TypeScript 类型检查发现；可继续接入真实 LSP/TypeScript compiler API。"
    },
    {
      area: "审批写入与回滚",
      status: "implemented",
      evidence: ["/api/apply", "/api/rollback", "/api/diff-conflicts", "/api/conflict-resolution-draft", ".forge/checkpoints", "apply conflict preflight", "allowPartial partial apply", "partial hunk apply", "conflict marker preview", "resolution pending proposal"],
      next: "已补写入前冲突预检、默认零写入失败保护、显式文件级/hunk 级部分应用、前端逐 hunk 勾选、只读 CURRENT/PROPOSED 冲突预览、冲突解决草稿 pendingProposal 和 checkpoint 回滚；可继续增强多文件冲突批量解决体验。"
    },
    {
      area: "验证与修复闭环",
      status: "implemented",
      evidence: ["discoverCheckCommands", "discoverTypecheckCommands", "runCheckCommands", "generateRepairDiff", "/api/verification-plan", "/api/ci-status", "stageRepairVerificationCommands", "reviewArtifactVerificationCommands", "reviewCommentsVerificationCommands", "gateEvidenceVerificationCommands", "写入失败关联 @file 引用", "写入失败关联调试目标", "失败命令关联 @file 引用", "命令源码关联调试目标", "批量命令关联浏览器异常分诊", "动作失败关联 @file 引用", "动作失败关联调试目标", "审查失败证据自动排队验证", "门禁失败证据自动排队验证"],
      next: "已补只读验证门禁计划和 CI 状态汇总，将本地安全检查、TypeScript 类型检查发现、CI 配置、最近验证证据、写入失败/失败命令/命令源码/批量命令与通用动作失败关联 @file/调试目标/浏览器分诊、审查/PR 评论复查命令、门禁失败复查命令、远端 PR/CI 只读状态和变更范围纳入 PR readiness；可继续接入真实远端 CI 必过门禁。"
    },
    {
      area: "代码审查证据",
      status: "implemented",
      evidence: ["/api/review", "/api/reviews", "/api/review-comments", ".forge/reviews", "审查记录排队验证", "PR 评论草稿排队验证", "审查动作失败证据卡", "coding/debug smoke fallback"],
      next: "已补审查 artifact、PR 行级评论草稿导出、历史审查/评论验证命令排队和审查动作失败后的本地复查命令自动恢复；可继续接入真实 PR review 发布。"
    },
    {
      area: "Git 隔离",
      status: git.available ? "implemented" : "partial",
      evidence: ["/api/worktree", git.available ? git.branch || "git repo" : "当前工作区未检测到 Git", "工作区安全失败关联 @file 引用", "工作区安全失败关联调试目标"],
      next: "已补 worktree/checkpoint/工作区切换失败后的 @file、当前调试目标和浏览器分诊延续；可继续接入远端 PR 创建和 CI 检查。"
    },
    {
      area: "会话线程管理",
      status: "implemented",
      evidence: ["/api/threads", "/api/thread", "/api/thread-fork", ".forge/threads", `${threads.length} 个近期会话`, "workspace-scoped thread artifacts", "rename/pin/archive metadata", "fork parentThreadId", "message restore"],
      next: "已补本地会话线程 artifact、新建/更新/读取/列表/重命名/分叉、侧栏点击恢复、置顶排序和归档过滤；可继续接入跨设备云同步。"
    },
    {
      area: "任务队列",
      status: "implemented",
      evidence: ["/api/queue", "/api/queue-isolation", "queue_isolation", `${queue.length} 个当前队列项`, "每个 isolationGroup 仅允许一个 active 任务"],
      next: "已支持优先级、重试计数、完成后自动激活下一项和隔离组并发保护；可继续支持多 worker 调度。"
    },
    {
      area: "可恢复状态",
      status: "implemented",
      evidence: [".forge/state/goal.json", ".forge/state/context-snapshot.json", ".forge/state/context-compact.json", ".forge/state/context-rollup.json", "/api/context-snapshot", "/api/context-compact", "/api/context-rollup", "/api/health recoverySummary", "lastFailedCommand", "verificationCommands", "contextEvidenceVerificationCommands", "当前调试目标继续上下文", "会话/冲突/任务/队列/交付调试目标延续", "会话/目标/任务/队列/冲突/审查/交付 @file 引用延续", "上下文证据关联 @file 引用", "上下文证据关联调试目标", "上下文证据关联浏览器异常分诊", "上下文失败自动排队验证", goal.phase || "idle"],
      next: "已补可恢复目标状态、跨会话上下文摘要、手动/自动上下文压缩、滚动摘要检索 artifact、语义索引持久化、刷新后的 recoverySummary 下一步线索、最近失败命令、变更文件、选中 hunk、当前调试目标、@file 命中/缺失边界、浏览器异常分诊、上下文证据排队验证、上下文证据里的 @file/调试目标/浏览器分诊延续和失败后的本地复查命令自动恢复；可继续增加更细粒度的摘要裁剪策略。"
    },
    {
      area: "长任务管理",
      status: "implemented",
      evidence: ["/api/processes", "/api/process-health", "/api/process-search", "/api/runtime-url", "/api/debug-target", "debug_target", ".forge/process-logs", ".forge/process-health-rules.json", ".forge/state/runtime-url.json", `${managedProcessCount} 个受管进程`, "独立健康探针汇总", "运行 URL 状态持久化", "当前调试目标聚合", "进程证据关联 @file 引用", "进程证据关联调试目标", "进程证据关联浏览器异常分诊", "可配置健康规则匹配", "健康规则正则匹配", "负向错误信号守卫"],
      next: "已补启动命令发现/脚本展开/发现并启动、启动后自动识别页面 URL、真实运行 URL 持久化与调试输入自动填充、当前调试目标聚合、受管进程输出搜索、进程证据里的 @file/调试目标/浏览器分诊延续、独立健康探针、日志 artifact 持久化和历史回放；健康规则支持状态码、输出/响应包含匹配、输出/响应正则匹配和负向错误信号守卫。"
    },
    {
      area: "交付草稿",
      status: "implemented",
      evidence: ["/api/handoff", ".forge/handoffs", "交付关联调试目标", "交付关联浏览器异常分诊", "交付前调试验证命令"],
      next: "已补交付草稿生成、交付验证提示、当前调试目标/页面分诊延续和交付前验证命令合并；可继续接入真实 PR 创建、推送和评论同步。"
    },
    {
      area: "远端 PR 与 CI 集成",
      status: "partial",
      evidence: ["/api/pr-readiness", "/api/remote-pr-status", "/api/ci-status", "/api/remote-publish-plan", "/api/remote-publish-preflight", "/api/permission-matrix", ".forge/remote-ci", "GitHub gh / GitLab glab 只读探测", "Gitee manualProvider 识别", "Git remote/provider 发现", "本地 CI 配置发现", "PR 草稿元数据", "远端写入审批计划", "provider/action 权限矩阵", "发布前 CLI/认证/审批/命令风险预检", "不执行 git push/真实 PR 创建"],
      next: "已补远端 PR/CI 只读状态探测、CI 状态 artifact、发布审批计划、发布包预检和 provider/action 权限模型；继续接入真实 PR 创建、评论回写和需要授权的远端执行。"
    },
    {
      area: "真实远端发布与平台同步",
      status: "partial",
      evidence: ["/api/remote-publish-plan", "/api/remote-publish-packages", "/api/remote-publish-package", "/api/remote-publish-preflight", "/api/remote-publish-continuation", "/api/remote-publish-evidence", ".forge/remote-publish", ".forge/approvals", "远端 push/PR/comment 候选命令审批记录", "发布包 PR body/review summary/plan 索引", "external-evidence.json 回填证据", "Gitee manual:gitee-pr/manual:gitee-comment 继续包", "发布前 CLI/认证/审批/命令风险预检", "未执行 git push", "未创建真实远端 PR", "未同步代码托管平台评论"],
      next: "已补远端发布审批计划、发布包只读索引、发布前预检、继续包和外部证据回填；需要平台凭据和明确授权后接入实际 PR 发布、push、CI 必过门禁和 review 评论同步。"
    },
    {
      area: "权限与命令策略",
      status: "partial",
      evidence: ["evaluateCommandPolicy", "evaluateProcessPolicy", "/api/policy-audit", "/api/permission-matrix", "/api/approval decision", "/api/approval-execute", "/api/mcp-tool-call", "/api/extension-tool-call", "/api/remote-publish-evidence", ".forge/approvals", ".forge/escalations", "审批关联 @file 引用", "审批关联调试目标", "push_branch/create_pr/comment_pr/ingest_external_evidence 动作拆分", `${approvals.length} 个近期审批请求`],
      next: "已补审批请求的批准/拒绝状态流转、受控执行尝试、拒绝命令升级 artifact、MCP tools/call、本地扩展工具审批执行、只读权限审计、审批上下文里的 @file/调试目标/浏览器分诊延续、provider/action 权限矩阵和远端证据回填边界；仍缺完整系统级沙箱升级执行。"
    },
    {
      area: "工具生态",
      status: "partial",
      evidence: [`内置工具 ${getAgentTools().length} 个`, `本地扩展 ${extensions.summary.total} 个`, `MCP server ${mcp.summary.total} 个`, "/api/tools", "/api/extensions", "/api/extension-trust", "/api/extension-tool-call", "/api/mcp", "/api/mcp?probe=1", "/api/mcp-tool-call", "目录证据关联 @file 引用", "目录证据关联调试目标", "目录证据关联浏览器异常分诊", "MCP 资源证据关联 @file 引用", "MCP 资源证据关联调试目标", "MCP 资源证据关联浏览器异常分诊", "本地 manifest SHA-256", "本地公钥签名校验"],
      next: "已暴露本地工具目录、扩展注册表、扩展 manifest checksum/trust 审计、本地公钥签名校验、本地扩展工具审批执行、MCP server 发现、本地 MCP 握手/目录枚举、审批后的 tools/call，以及目录/MCP resource 证据里的 @file/调试目标/浏览器分诊延续；继续补远端扩展市场和远端签名链校验。"
    },
    {
      area: "外部工具与浏览器自动化",
      status: "partial",
      evidence: ["/api/extensions", "/api/extension-tool-call", "/api/mcp", "/api/mcp?probe=1", "/api/mcp-tool-call", "/api/browser-check", "/api/browser-audit", "/api/browser-trace", "/api/debug-target", "/api/browser-interact", "/api/browser-session", "/api/browser-visual", "/api/permission-matrix", "本地扩展只读工具桥接", "本地 MCP 只读握手与目录枚举", "审批后 MCP tools/call", "受控浏览器截图/DOM/trace/交互/会话/视觉回归", "当前调试目标聚合", "浏览器证据关联 @file 引用", "浏览器证据关联调试目标", "浏览器证据关联浏览器异常分诊", "provider/action 权限模型", "静态可访问性审计", "keyDown/keyUp/wheel/scroll 复杂交互序列"],
      next: "已补本地扩展工具桥接、MCP 本地探测、审批后工具调用、受控浏览器自动化、多步骤会话 artifact、当前调试目标聚合、浏览器证据里的 @file/调试目标/浏览器分诊延续、静态可访问性审计、复杂鼠标键盘序列和 provider/action 权限模型；继续接入远端 MCP 和跨站点远端浏览器会话。"
    },
    {
      area: "多模态与浏览器执行",
      status: "partial",
      evidence: [`资产 ${assets.summary.total} 个`, "/api/assets", "/api/asset-inspect", "/api/browser-interact", "/api/browser-visual", "资产证据关联 @file 引用", "资产证据关联调试目标", "资产证据关联浏览器异常分诊", "CSV/TSV/JSONL 抽样", "Parquet footer metadata 探测", "图片尺寸检查", "PNG 像素视觉摘要", "SVG 文本/可访问标签提取", "Tesseract OCR 执行开关/缓存 artifact", "媒体元数据解析", "Whisper 转写执行开关/缓存 artifact", "OOXML 文本抽取", "旧版 Office CFBF 文本探测", "PDF 页框/文本块 layout 抽取"],
      next: "已补工作区资产索引、内容抽样、图片视觉摘要、SVG 本地文本提取、媒体元数据、PDF layout、本地 Whisper 转写执行开关、缓存 artifact，以及资产证据里的 @file/调试目标/浏览器分诊延续；继续补云端多模态、说话人分离和更完整 OCR。"
    },
    {
      area: "浏览器自动化与视觉回归",
      status: "partial",
      evidence: ["/api/browser-check", "/api/browser-audit", "/api/browser-baseline", "/api/browser-screenshot", "/api/browser-trace", "/api/debug-target", "/api/browser-interact", "/api/browser-session", "/api/browser-visual", ".forge/browser-traces", "本地 URL 状态/标题/结构检查", "静态 title/lang/H1/alt/可访问名称审计", "页面结构基线对比", "真实浏览器截图产物", "选择器裁剪截图", "console/exception/network trace artifact", "当前调试目标卡片", "浏览器证据关联 @file 引用", "浏览器证据关联调试目标", "浏览器证据关联浏览器异常分诊", "hover/dblclick/clear/check/waitValue/navigate/waitUrl/waitNetwork/upload/keyDown/keyUp/wheel/scroll/坐标鼠标 受控 DOM 交互", "多步骤持久 profile 会话 artifact", "像素级视觉回归断言"],
      next: "已补页面结构基线、静态可访问性审计、真实浏览器截图、选择器裁剪、浏览器 trace、当前调试目标卡片、浏览器证据里的 @file/调试目标/浏览器分诊延续、扩展 DOM 交互、复杂键鼠序列、跨页面导航、网络静默等待、文件上传、坐标级鼠标动作、多步骤持久会话 artifact 和像素级视觉断言；继续补跨站点远端浏览器会话。"
    },
    {
      area: "真实浏览器交互与截图",
      status: "partial",
      evidence: ["/api/browser-screenshot", "/api/browser-audit", "/api/browser-dom", "/api/browser-trace", "/api/browser-interact", "/api/browser-session", "/api/browser-visual", ".forge/browser-screenshots", ".forge/browser-traces", ".forge/browser-sessions", ".forge/browser-visual-baselines", "静态可访问性审计", "选择器裁剪截图", "console/exception/network trace", "wait/click/dblclick/hover/clear/type/press/keyDown/keyUp/select/check/uncheck/waitText/waitValue/navigate/waitUrl/waitNetwork/upload/mouseMove/mouseDown/mouseUp/mouseClick/drag/wheel/scroll 步骤审计"],
      next: "已补真实浏览器截图、静态可访问性审计、DOM 快照、浏览器 trace、选择器裁剪、扩展受控交互、复杂键鼠序列、跨页面导航、网络等待、文件上传、坐标级鼠标动作、持久 profile 会话 artifact 和像素/布局断言；继续补跨站点远端浏览器会话。"
    },
    {
      area: "浏览器 DOM 交互",
      status: "implemented",
      evidence: ["/api/browser-interact", "/api/browser-session", "/api/browser-dom", "渲染后 DOM 快照", "简单选择器计数", "wait/click/dblclick/hover/clear/type/press/keyDown/keyUp/select/check/uncheck/waitText/waitValue/navigate/waitUrl/waitNetwork/upload/mouseMove/mouseDown/mouseUp/mouseClick/drag/wheel/scroll", "交互步骤审计", "隔离浏览器 profile", "多步骤会话 artifact"],
      next: "已补跨页面导航、网络静默等待、文件上传、坐标级鼠标动作、复杂键鼠序列和多步骤持久会话；可继续增加远端浏览器会话。"
    },
    {
      area: "像素级视觉断言",
      status: "implemented",
      evidence: ["/api/browser-visual", ".forge/browser-visual-baselines", "PNG 像素解码", "尺寸差异检测", "threshold/maxMismatchRatio 阈值比较", "mismatch samples", "可视化 diff PNG", "selector crop baseline"],
      next: "已补视觉 diff PNG 证据和按选择器裁剪区域断言；可继续接入远端浏览器会话。"
    },
    {
      area: "模型运行层",
      status: modelReadiness.status,
      evidence: [
        ...modelReadiness.evidence,
        "/api/model-policy",
        "/api/model-usage",
        "/api/model-budget",
        "/api/model-cost",
        "/api/model-cost-policy",
        "/api/model-billing",
        "/api/agent-stream",
        "model_policy",
        "model_usage",
        "model_budget",
        "model_cost",
        "model_cost_policy",
        "model_billing",
        ".forge/state/model-usage.json",
        "modelEvidenceVerificationCommands",
        "stageModelEvidenceVerificationCommands",
        "模型证据关联 @file 引用",
        "模型证据关联调试目标",
        "agentFailureVerificationCommands",
        "代理失败关联 @file 引用",
        "代理失败关联调试目标",
        "代理失败验证命令排队",
        `候选模型：${modelRuntime.candidates.join(", ")}`,
        modelRuntime.lastModel ? `最近使用：${modelRuntime.lastModel}` : "尚未发起模型请求",
        `请求数：${modelRuntime.requestCount}，成功：${modelRuntime.successCount}，失败：${modelRuntime.failureCount}`,
        modelRuntime.averageLatencyMs ? `平均延迟：${modelRuntime.averageLatencyMs}ms` : "尚无延迟样本",
        modelRuntime.lastFallbacks.length ? `最近 fallback：${modelRuntime.lastFallbacks.length} 次` : "最近无 fallback"
      ],
      next: modelReadiness.next
    }
  ];
  const enrichedCapabilities = capabilities.map(enrichCapabilityForAudit);
  const summary = enrichedCapabilities.reduce((acc, item) => {
    acc[item.status] = (acc[item.status] || 0) + 1;
    return acc;
  }, {});
  const recommendedNext = selectCapabilityRecommendation(enrichedCapabilities);
  const comparison = buildCapabilityComparison(enrichedCapabilities);
  const gapSummary = buildCapabilityGapSummary(comparison, recommendedNext);
  return {
    generatedAt: new Date().toISOString(),
    workspace: currentWorkspace,
    summary,
    recommendedNext,
    gapSummary,
    comparison,
    capabilities: enrichedCapabilities,
    recentEvidence: { tasks, threads, reviews, approvals, extensions: extensions.summary, mcp: mcp.summary, assets: assets.summary, goal }
  };
}

function formatCapabilityAuditCliSummary(audit = {}) {
  const summary = audit.summary || {};
  const gapSummary = audit.gapSummary || {};
  const comparison = audit.comparison || {};
  const recommended = audit.recommendedNext?.capability || null;
  const formatGap = (gap = {}) => {
    const marker = gap.externalDependency ? "external" : "local";
    const next = gap.next ? ` - ${gap.next}` : "";
    return `  - [${marker}] ${gap.area || "unknown"} (${gap.status || "partial"})${next}`;
  };
  return [
    "Forge Code - Codex Capability Audit",
    "====================================",
    `Workspace: ${audit.workspace || currentWorkspace}`,
    `Generated: ${audit.generatedAt || new Date().toISOString()}`,
    "",
    `Status: ${gapSummary.status || comparison.status || "unknown"}`,
    `Implemented: ${summary.implemented || 0}`,
    `Partial: ${summary.partial || 0}`,
    `Missing: ${summary.missing || 0}`,
    `Outstanding: ${gapSummary.totalOutstanding || 0}`,
    `Local actionable: ${gapSummary.localActionableCount || 0}`,
    `External blocked: ${gapSummary.externalBlockedCount || 0}`,
    "",
    recommended ? "Recommended next:" : "Recommended next: none",
    recommended ? `  - ${recommended.area || "unknown"} (${recommended.status || "partial"})` : "",
    audit.recommendedNext?.reason ? `  - Reason: ${audit.recommendedNext.reason}` : "",
    recommended?.taskPlan?.verificationCommands?.length
      ? `  - Verify: ${recommended.taskPlan.verificationCommands.map((item) => item.command || item).filter(Boolean).join(" | ")}`
      : "",
    "",
    gapSummary.topLocalGaps?.length ? "Top local gaps:" : "Top local gaps: none",
    ...(gapSummary.topLocalGaps || []).slice(0, 5).map(formatGap),
    "",
    gapSummary.topExternalGaps?.length ? "Top external gaps:" : "Top external gaps: none",
    ...(gapSummary.topExternalGaps || []).slice(0, 5).map(formatGap),
    "",
    gapSummary.externalPreparation?.authorizationItems?.length ? "External authorization checklist:" : "",
    ...(gapSummary.externalPreparation?.authorizationItems || []).slice(0, 8).map((item) => `  - ${item}`),
    gapSummary.guidance ? "" : "",
    gapSummary.guidance ? `Guidance: ${gapSummary.guidance}` : ""
  ].filter((line) => line !== "").join("\n");
}

async function runCapabilityAuditCli() {
  const json = process.argv.includes("--json") || process.argv.includes("--capability-audit-json");
  const deep = process.argv.includes("--deep") || process.argv.includes("--capability-audit-deep");
  const audit = await buildCapabilityAudit({ light: !deep });
  if (json) {
    console.log(JSON.stringify(audit, null, 2));
    return;
  }
  console.log(formatCapabilityAuditCliSummary(audit));
}

function buildExternalReadinessMarkdown(packageData = {}) {
  const summary = packageData.summary || {};
  const recommended = packageData.recommendedNext || null;
  const lines = [
    "# Forge Code External Readiness",
    "",
    `Generated: ${packageData.generatedAt || ""}`,
    `Workspace: ${packageData.workspace || currentWorkspace}`,
    "",
    "## Summary",
    "",
    `- Status: ${summary.status || "partial"}`,
    `- External blocked gaps: ${summary.externalBlockedCount || 0}`,
    `- Local actionable gaps: ${summary.localActionableCount || 0}`,
    recommended?.area ? `- Recommended next: ${recommended.area} (${recommended.status || "partial"})` : "- Recommended next: none",
    "",
    "## Authorization Checklist",
    "",
    ...(packageData.authorizationItems || []).map((item) => `- ${item}`),
    packageData.authorizationItems?.length ? "" : "- No authorization items detected.",
    "",
    "## Local Readiness Commands",
    "",
    ...(packageData.localReadinessCommands || []).map((command) => `- \`${command.command || command}\`${command.reason ? ` - ${command.reason}` : ""}`),
    packageData.localReadinessCommands?.length ? "" : "- No local readiness commands detected.",
    "",
    "## External Gaps",
    "",
    ...(packageData.externalGaps || []).flatMap((gap) => [
      `### ${gap.area || "Unknown"} (${gap.status || "partial"})`,
      "",
      gap.next ? gap.next : "No next action recorded.",
      "",
      gap.authorizationItems?.length ? "Authorization:" : "",
      ...(gap.authorizationItems || []).map((item) => `- ${item}`),
      gap.localReadinessCommands?.length ? "Local readiness:" : "",
      ...(gap.localReadinessCommands || []).map((command) => `- \`${command.command || command}\``),
      ""
    ])
  ];
  return lines.filter((line, index, array) => !(line === "" && array[index - 1] === "")).join("\n") + "\n";
}

async function buildExternalReadinessPackage({ deep = false, write = true } = {}) {
  const audit = await buildCapabilityAudit({ light: !deep });
  const gapSummary = audit.gapSummary || {};
  const externalGaps = (gapSummary.topExternalGaps || []).map((gap) => ({
    area: gap.area || "",
    status: gap.status || "partial",
    next: gap.next || "",
    externalDependency: true,
    focusFiles: gap.focusFiles || [],
    evidence: gap.evidence || [],
    authorizationItems: gap.externalPreparation?.authorizationItems || [],
    localReadinessCommands: (gap.externalPreparation?.localReadinessCommands || []).map((command) => (
      typeof command === "string" ? { command, reason: "本地只读预检。" } : command
    ))
  }));
  const authorizationItems = uniqueLimited([
    ...(gapSummary.externalPreparation?.authorizationItems || []),
    ...externalGaps.flatMap((gap) => gap.authorizationItems || [])
  ], 20);
  const localReadinessCommands = uniqueLimited([
    ...(gapSummary.externalPreparation?.localReadinessCommands || []).map((command) => (
      typeof command === "string" ? { command, reason: "外部缺口本地预检。" } : command
    )),
    ...externalGaps.flatMap((gap) => gap.localReadinessCommands || [])
  ], 20, (item) => item.command || item);
  const packageId = `external-readiness-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const packageData = {
    id: packageId,
    generatedAt: new Date().toISOString(),
    workspace: currentWorkspace,
    summary: {
      status: gapSummary.status || "partial",
      totalOutstanding: gapSummary.totalOutstanding || 0,
      localActionableCount: gapSummary.localActionableCount || 0,
      externalBlockedCount: gapSummary.externalBlockedCount || 0,
      guidance: gapSummary.guidance || ""
    },
    recommendedNext: audit.recommendedNext?.capability ? {
      area: audit.recommendedNext.capability.area || "",
      status: audit.recommendedNext.capability.status || "",
      reason: audit.recommendedNext.reason || ""
    } : null,
    authorizationItems,
    localReadinessCommands,
    externalGaps,
    policy: {
      source: "external-readiness",
      writesRemote: false,
      executesRemote: false,
      writesWorkspaceFiles: false,
      artifactOnly: true
    }
  };
  const markdown = buildExternalReadinessMarkdown(packageData);
  if (!write) {
    return { package: packageData, markdown, paths: null };
  }
  const packageDir = path.join(EXTERNAL_READINESS_DIR, packageId);
  await fs.mkdir(packageDir, { recursive: true });
  const jsonPath = path.join(packageDir, "readiness.json");
  const markdownPath = path.join(packageDir, "readiness.md");
  await fs.writeFile(jsonPath, JSON.stringify(packageData, null, 2), "utf8");
  await fs.writeFile(markdownPath, markdown, "utf8");
  return {
    package: packageData,
    markdown,
    paths: {
      dir: toPosix(path.relative(APP_ROOT, packageDir)),
      json: toPosix(path.relative(APP_ROOT, jsonPath)),
      markdown: toPosix(path.relative(APP_ROOT, markdownPath))
    }
  };
}

async function runExternalReadinessCli() {
  const json = process.argv.includes("--json") || process.argv.includes("--external-readiness-json");
  const deep = process.argv.includes("--deep") || process.argv.includes("--external-readiness-deep");
  const dryRun = process.argv.includes("--dry-run");
  const result = await buildExternalReadinessPackage({ deep, write: !dryRun });
  if (json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(result.markdown.trimEnd());
  if (result.paths) {
    console.log("");
    console.log(`Saved: ${result.paths.markdown}`);
    console.log(`JSON: ${result.paths.json}`);
  }
}

function selectCapabilityRecommendation(capabilities = []) {
  const impactRank = new Map([
    ["验证与修复闭环", 120],
    ["可恢复状态", 115],
    ["长任务管理", 110],
    ["外部工具与浏览器自动化", 105],
    ["浏览器自动化与视觉回归", 100],
    ["真实浏览器交互与截图", 98],
    ["浏览器 DOM 交互", 96],
    ["代码审查证据", 94],
    ["上下文索引", 92],
    ["权限与命令策略", 90],
    ["工具生态", 88],
    ["模型运行层", 84],
    ["远端 PR 与 CI 集成", 82],
    ["真实远端发布与平台同步", 78],
    ["多模态与浏览器执行", 74]
  ]);
  const candidates = capabilities.filter((item) => item && item.status !== "implemented");
  const hasLocalActionable = candidates.some((item) => !isExternalCapabilityDependency(item));
  const scored = candidates
    .map((item) => {
      const externalDependency = isExternalCapabilityDependency(item);
      const statusScore = item.status === "missing" ? 1000 : item.status === "partial" ? 500 : 100;
      const impact = impactRank.get(item.area) || 50;
      return {
        capability: { ...item, externalDependency },
        score: statusScore + impact,
        externalDependency,
        reason: [
          externalDependency
            ? hasLocalActionable
              ? "外部授权缺口靠后，本地可执行能力优先"
              : "当前未完成项主要依赖外部授权，优先生成准备清单和本地预检"
            : "本地可执行能力优先",
          item.status === "missing" ? "缺失能力优先补齐" : "部分实现能力优先闭环",
          "按真实写代码、调试程序的日常影响排序",
          item.next || ""
        ].filter(Boolean).join("；")
      };
    })
    .sort((a, b) => {
      if (a.externalDependency !== b.externalDependency) return a.externalDependency ? 1 : -1;
      return b.score - a.score || String(a.capability.area || "").localeCompare(String(b.capability.area || ""), "zh-Hans-CN");
    });
  const top = scored[0] || null;
  if (!top) {
    return {
      status: "complete",
      reason: "当前能力矩阵没有未完成项。",
      capability: null
    };
  }
  return {
    status: top.capability.status || "partial",
    area: top.capability.area || "",
    score: top.score,
    reason: top.reason,
    capability: top.capability
  };
}

function getAgentTools() {
  return [
    {
      type: "function",
      function: {
        name: "list_files",
        description: "列出工作区内可读取的文本文件。",
        parameters: {
          type: "object",
          properties: { limit: { type: "number" } }
        }
      }
    },
    {
      type: "function",
      function: {
        name: "repo_map",
        description: "获取仓库地图、文件类型统计、package scripts 和符号索引。",
        parameters: {
          type: "object",
          properties: {}
        }
      }
    },
    {
      type: "function",
      function: {
        name: "diff_conflicts",
        description: "只读分析 unified diff 的适用性和冲突 hunk，返回 CURRENT/PROPOSED 冲突预览；不写入文件。",
        parameters: {
          type: "object",
          properties: {
            diff: { type: "string" }
          },
          required: ["diff"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "model_policy",
        description: "读取模型运行层策略、候选模型、fallback 顺序、遥测摘要、成本治理和密钥脱敏 guardrails；不发起模型请求。",
        parameters: {
          type: "object",
          properties: {
            includeRecent: { type: "boolean" }
          }
        }
      }
    },
    {
      type: "function",
      function: {
        name: "model_usage",
        description: "读取持久化模型用量账本，汇总 token usage、延迟、fallback、按模型分组和最近调用；不发起模型请求。",
        parameters: {
          type: "object",
          properties: {}
        }
      }
    },
    {
      type: "function",
      function: {
        name: "model_budget",
        description: "读取模型预算预检状态，展示请求数/token 上限、剩余额度和是否会阻止下一次模型调用；不发起模型请求。",
        parameters: {
          type: "object",
          properties: {}
        }
      }
    },
    {
      type: "function",
      function: {
        name: "model_cost",
        description: "读取模型成本估算，基于持久化 token usage 和用户配置 FORGE_MODEL_COST_POLICY 价格表计算；不内置价格、不发起模型请求。",
        parameters: {
          type: "object",
          properties: {}
        }
      }
    },
    {
      type: "function",
      function: {
        name: "model_cost_policy",
        description: "读取模型成本价格表 schema、当前 FORGE_MODEL_COST_POLICY 解析结果和示例 JSON；可 dry-run 校验输入，不写环境变量。",
        parameters: {
          type: "object",
          properties: {
            raw: { type: "string" }
          }
        }
      }
    },
    {
      type: "function",
      function: {
        name: "model_billing",
        description: "读取模型账单核对结果，将本地 token 成本估算与用户提供的 FORGE_MODEL_BILLING_JSON 或 raw 账单 JSON 对账；不调用 provider 账单 API。",
        parameters: {
          type: "object",
          properties: {
            raw: { type: "string" }
          }
        }
      }
    },
    {
      type: "function",
      function: {
        name: "context_rollup",
        description: "读取或生成可恢复上下文滚动摘要，按任务、审查、审批和 Git 变化返回可检索切片。",
        parameters: {
          type: "object",
          properties: {
            limit: { type: "number" },
            query: { type: "string" },
            rebuild: { type: "boolean" }
          }
        }
      }
    },
    {
      type: "function",
      function: {
        name: "verification_plan",
        description: "生成只读验证门禁计划，汇总安全检查命令、CI 配置、最近检查证据和变更范围；不执行命令。",
        parameters: {
          type: "object",
          properties: {
            limit: { type: "number" },
            commands: { type: "array", items: { type: "string" } }
          }
        }
      }
    },
    {
      type: "function",
      function: {
        name: "ci_status",
        description: "生成只读 CI 状态汇总，整合本地 CI 配置、最近验证证据、远端 PR/CI 只读状态和门禁 blockers；不执行写入动作。",
        parameters: {
          type: "object",
          properties: {
            deep: { type: "boolean" },
            persist: { type: "boolean" },
            limit: { type: "number" }
          }
        }
      }
    },
    {
      type: "function",
      function: {
        name: "merge_gate",
        description: "生成只读合并门禁汇总，聚合 PR readiness、CI、审查、审批和远端发布预检；不执行命令或远端写入。",
        parameters: {
          type: "object",
          properties: {
            prompt: { type: "string" },
            deep: { type: "boolean" },
            limit: { type: "number" }
          }
        }
      }
    },
    {
      type: "function",
      function: {
        name: "mcp_resource",
        description: "读取已配置本地 MCP server 暴露的只读 resource 内容；不执行 tools/call、不写入文件。",
        parameters: {
          type: "object",
          properties: {
            serverName: { type: "string" },
            uri: { type: "string" }
          },
          required: ["serverName", "uri"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "queue_isolation",
        description: "读取任务队列隔离报告，按 isolationGroup 汇总 active/queued 队列和被同组 active 阻塞的激活项；不执行任务、不修改队列。",
        parameters: {
          type: "object",
          properties: {
            limit: { type: "number" }
          }
        }
      }
    },
    {
      type: "function",
      function: {
        name: "process_health",
        description: "读取受管进程健康状态，汇总本地 HTTP 探针、可配置健康规则、运行状态和持久化日志 artifact；不启动或停止进程。",
        parameters: {
          type: "object",
          properties: {
            id: { type: "string" },
            limit: { type: "number" }
          }
        }
      }
    },
    {
      type: "function",
      function: {
        name: "runtime_url",
        description: "读取当前 Forge Code 服务的本地运行 URL、端口和浏览器调试默认地址；不启动进程、不执行命令。",
        parameters: {
          type: "object",
          properties: {}
        }
      }
    },
    {
      type: "function",
      function: {
        name: "remote_publish_packages",
        description: "读取远端发布审批包索引，列出本地生成的 PR body、review summary、计划和审批状态；不执行远端写入。",
        parameters: {
          type: "object",
          properties: {
            limit: { type: "number" }
          }
        }
      }
    },
    {
      type: "function",
      function: {
        name: "remote_publish_package",
        description: "读取指定远端发布审批包详情，包括 PR body、review summary、计划和命令；不执行远端写入。",
        parameters: {
          type: "object",
          properties: {
            id: { type: "string" }
          },
          required: ["id"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "remote_publish_preflight",
        description: "对远端发布包做只读预检，汇总审批状态、Git 远端、CLI 安装/认证、命令风险和阻塞项；不执行 push、建 PR 或评论。",
        parameters: {
          type: "object",
          properties: {
            id: { type: "string" },
            limit: { type: "number" },
            deep: { type: "boolean" }
          }
        }
      }
    },
    {
      type: "function",
      function: {
        name: "policy_audit",
        description: "生成只读权限策略审计，汇总命令/进程策略、审批状态、工具访问级别和权限缺口。",
        parameters: {
          type: "object",
          properties: {
            limit: { type: "number" },
            sampleCommands: { type: "array", items: { type: "string" } }
          }
        }
      }
    },
    {
      type: "function",
      function: {
        name: "remote_publish_continuation",
        description: "生成远端发布继续包和人工执行后的证据回填模板，列出外部动作、回填字段和本地复查命令；不执行远端写入。",
        parameters: {
          type: "object",
          properties: {
            id: { type: "string" },
            limit: { type: "number" },
            deep: { type: "boolean" }
          }
        }
      }
    },
    {
      type: "function",
      function: {
        name: "permission_matrix",
        description: "读取 provider/action 权限矩阵，按工作区、命令、模型、浏览器、扩展、MCP 和远端发布汇总访问边界；不执行任何动作。",
        parameters: {
          type: "object",
          properties: {
            limit: { type: "number" }
          }
        }
      }
    },
    {
      type: "function",
      function: {
        name: "extension_trust",
        description: "读取本地扩展 trust 审计，返回 manifest SHA-256、checksum pin、本地签名校验和审批 guardrails；不执行扩展。",
        parameters: {
          type: "object",
          properties: {
            limit: { type: "number" }
          }
        }
      }
    },
    {
      type: "function",
      function: {
        name: "debug_diagnostics",
        description: "聚合当前工作区调试诊断：验证门禁、CI 线索、受管进程健康、语义诊断和可选本地页面 Trace；默认不执行检查命令。",
        parameters: {
          type: "object",
          properties: {
            url: { type: "string" },
            commands: { type: "array", items: { type: "string" } },
            includeTrace: { type: "boolean" },
            runChecks: { type: "boolean" },
            waitMs: { type: "number" },
            limit: { type: "number" }
          }
        }
      }
    },
    {
      type: "function",
      function: {
        name: "debug_target",
        description: "聚合当前调试目标：运行 URL、受管进程探针、诊断摘要、建议动作和验证命令；默认不执行检查命令。",
        parameters: {
          type: "object",
          properties: {
            url: { type: "string" },
            commands: { type: "array", items: { type: "string" } },
            includeTrace: { type: "boolean" },
            runChecks: { type: "boolean" },
            waitMs: { type: "number" },
            limit: { type: "number" }
          }
        }
      }
    },
    {
      type: "function",
      function: {
        name: "code_intelligence",
        description: "生成代码智能概览，汇总入口文件、API 面、符号热点、依赖热点、语义诊断和变更前 readiness；不写入文件。",
        parameters: {
          type: "object",
          properties: {
            limit: { type: "number" },
            includeDiagnostics: { type: "boolean" }
          }
        }
      }
    },
    {
      type: "function",
      function: {
        name: "semantic_index",
        description: "获取本地语义索引，包括声明、导入、路由、选择器和调用线索。",
        parameters: {
          type: "object",
          properties: {}
        }
      }
    },
    {
      type: "function",
      function: {
        name: "symbol_outline",
        description: "查询零依赖符号大纲，返回函数/类/方法的起止行、参数、容器和签名，可按文件或关键词过滤。",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string" },
            path: { type: "string" },
            limit: { type: "number" },
            includeContext: { type: "boolean" }
          }
        }
      }
    },
    {
      type: "function",
      function: {
        name: "semantic_definition",
        description: "按符号名或文件+行号查找本地定义，返回定义位置、签名、范围和附近代码上下文。",
        parameters: {
          type: "object",
          properties: {
            symbol: { type: "string" },
            path: { type: "string" },
            line: { type: "number" },
            contextLines: { type: "number" },
            limit: { type: "number" }
          }
        }
      }
    },
    {
      type: "function",
      function: {
        name: "semantic_symbol_impact",
        description: "只读分析本地符号影响范围，返回定义、引用、调用点、影响文件、建议编辑目标和验证命令；不写入文件。",
        parameters: {
          type: "object",
          properties: {
            symbol: { type: "string" },
            path: { type: "string" },
            line: { type: "number" },
            contextLines: { type: "number" },
            limit: { type: "number" }
          },
          required: ["symbol"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "semantic_rename_preview",
        description: "只读预览本地符号重命名影响，返回定义、引用、候选替换位置、命名冲突、风险警告和建议验证命令；不写入文件。",
        parameters: {
          type: "object",
          properties: {
            symbol: { type: "string" },
            newName: { type: "string" },
            path: { type: "string" },
            line: { type: "number" },
            contextLines: { type: "number" },
            limit: { type: "number" }
          },
          required: ["symbol", "newName"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "semantic_rename_draft",
        description: "基于重命名预览生成待审批 unified diff 草稿，写入 pending proposal；不直接修改目标文件。",
        parameters: {
          type: "object",
          properties: {
            symbol: { type: "string" },
            newName: { type: "string" },
            path: { type: "string" },
            line: { type: "number" },
            contextLines: { type: "number" },
            limit: { type: "number" },
            prompt: { type: "string" }
          },
          required: ["symbol", "newName"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "semantic_search",
        description: "按符号、导入、路由、选择器、调用名或文件路径搜索本地语义索引。",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string" },
            kind: { type: "string", enum: ["all", "declaration", "symbol", "import", "dependency", "route", "api", "selector", "ui", "call", "reference", "file"] },
            limit: { type: "number" }
          },
          required: ["query"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "semantic_references",
        description: "按符号名查找声明、调用点、导入、导出，并返回附近代码片段。",
        parameters: {
          type: "object",
          properties: {
            symbol: { type: "string" },
            limit: { type: "number" },
            contextLines: { type: "number" }
          },
          required: ["symbol"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "semantic_diagnostics",
        description: "基于语义索引输出重复声明、未解析本地导入、前端 API 调用缺口和重复路由等代码理解诊断。",
        parameters: {
          type: "object",
          properties: {
            limit: { type: "number" },
            includeContext: { type: "boolean" }
          }
        }
      }
    },
    {
      type: "function",
      function: {
        name: "semantic_impact",
        description: "基于语义索引和当前 Git diff 或显式路径分析变更影响面，包括依赖方、调用方、路由和选择器。",
        parameters: {
          type: "object",
          properties: {
            paths: { type: "array", items: { type: "string" } },
            limit: { type: "number" },
            includeContext: { type: "boolean" }
          }
        }
      }
    },
    {
      type: "function",
      function: {
        name: "dependency_graph",
        description: "基于语义索引生成本地导入依赖图，包含模块节点、依赖边、未解析导入、外部依赖和循环依赖。",
        parameters: {
          type: "object",
          properties: {
            paths: { type: "array", items: { type: "string" } },
            limit: { type: "number" },
            includeExternal: { type: "boolean" }
          }
        }
      }
    },
    {
      type: "function",
      function: {
        name: "read_file",
        description: "读取工作区内某个文本文件。",
        parameters: {
          type: "object",
          properties: {
            path: { type: "string" },
            maxChars: { type: "number" }
          },
          required: ["path"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "read_file_range",
        description: "按行号读取文件片段，适合查看大文件中的局部实现。",
        parameters: {
          type: "object",
          properties: {
            path: { type: "string" },
            startLine: { type: "number" },
            lineCount: { type: "number" }
          },
          required: ["path", "startLine"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "search_files",
        description: "在工作区文本文件中搜索关键词。",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string" },
            limit: { type: "number" }
          },
          required: ["query"]
        }
      }
    }
  ];
}

async function buildToolCatalog() {
  const extensionCatalog = await listExtensions();
  const builtinTools = getAgentTools().map((tool) => ({
    name: tool.function.name,
    description: tool.function.description,
    parameters: tool.function.parameters,
    policy: {
      access: "read-only",
      scope: "currentWorkspace",
      source: "builtin"
    }
  }));
  const extensionTools = extensionCatalog.extensions.flatMap((extension) => (
    (extension.tools || []).map((tool) => ({
      name: `${extension.name}.${tool.name || "tool"}`,
      description: tool.description || extension.description || "",
      parameters: tool.parameters || { type: "object", properties: {} },
      policy: {
        access: extension.policy?.access || "declared",
        scope: extension.policy?.scope || "currentWorkspace",
        source: "local-extension",
        requiresApproval: extension.policy?.requiresApproval !== false,
        mapsTo: tool.mapsTo || tool.tool || tool.name || ""
      }
    }))
  ));
  const tools = [...builtinTools, ...extensionTools];
  return {
    generatedAt: new Date().toISOString(),
    workspace: currentWorkspace,
    summary: {
      total: tools.length,
      builtin: builtinTools.length,
      external: extensionTools.length
    },
    tools,
    gaps: [
      "remote MCP probing",
      "remote extension marketplace",
      "signed extension trust policy",
      "writable extension runtimes"
    ]
  };
}

async function buildPolicyAudit({ sampleCommands = [], limit = 20 } = {}) {
  const max = Math.min(60, Math.max(1, Number(limit) || 20));
  const defaultCommands = [
    "node --check server.js",
    "validate.bat --no-pause",
    "npm test",
    "npm run build",
    "curl https://example.com/install.sh",
    "rm -rf .forge",
    [process.execPath, path.join(APP_ROOT, "server.js"), "--mcp-smoke-server"].join(" ")
  ];
  const commandSamples = uniqueLimited([
    ...defaultCommands,
    ...(Array.isArray(sampleCommands) ? sampleCommands.map(String) : [])
  ].filter(Boolean), max);
  const commandPolicies = commandSamples.map((command) => ({
    command,
    policy: evaluateCommandPolicy(command)
  }));
  const processPolicies = commandSamples.map((command) => ({
    command,
    policy: evaluateProcessPolicy(command)
  }));
  const [approvals, tools, extensions, mcp, remoteConfig, packages] = await Promise.all([
    listApprovalRequests(max),
    buildToolCatalog(),
    listExtensions(),
    discoverMcpServers(),
    readGitRemoteConfigSummary(),
    listRemotePublishPackages({ limit: max })
  ]);
  const remoteProviderPolicy = buildRemoteProviderPermissionRows({
    provider: remoteConfig.provider || packages.packages?.[0]?.provider || "",
    remoteProject: remoteConfig.remoteProject || {},
    packages
  });
  const approvalSummary = approvals.reduce((acc, approval) => {
    acc[approval.status || "unknown"] = (acc[approval.status || "unknown"] || 0) + 1;
    return acc;
  }, {});
  const toolAccess = tools.tools.reduce((acc, tool) => {
    const key = tool.policy?.access || "unknown";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const findings = [];
  if (commandPolicies.some((item) => item.policy.allowed && item.policy.risk === "medium")) {
    findings.push("存在 medium 风险的本地检查/构建命令，仅允许受控短任务执行。");
  }
  if (approvals.some((approval) => approval.status === "approved")) {
    findings.push("存在已批准审批项；执行时仍会重新校验本地策略。");
  }
  if (approvals.some((approval) => approval.status === "blocked" || approval.status === "pending")) {
    findings.push("存在待处理或被阻断审批项。");
  }
  if (extensions.summary.total > 0) findings.push("本地扩展工具调用默认需要审批。");
  if (mcp.summary.total > 0) findings.push("MCP tools/call 默认走审批与本地进程策略。");
  return {
    generatedAt: new Date().toISOString(),
    workspace: currentWorkspace,
    summary: {
      sampledCommands: commandPolicies.length,
      allowedCommands: commandPolicies.filter((item) => item.policy.allowed).length,
      allowedProcesses: processPolicies.filter((item) => item.policy.allowed).length,
      approvals: approvals.length,
      tools: tools.summary.total,
      extensions: extensions.summary.total,
      mcpServers: mcp.summary.total,
      findings: findings.length,
      remoteProviderActions: remoteProviderPolicy.length
    },
    commandPolicies,
    processPolicies,
    approvalSummary,
    toolAccess,
    approvals: approvals.slice(0, max),
    remoteProviderPolicy,
    findings,
    guardrails: [
      "Unsafe shell control operators and destructive/network-download commands are blocked.",
      "Remote publish plans create approval artifacts but do not execute git push or PR creation.",
      "Remote provider actions are declared per provider/action; push, PR creation, PR comment, and external evidence ingestion are separated.",
      "Extension and MCP tool calls require approval before execution.",
      "Approved requests are re-checked against current policy before execution.",
      "Read-only tools are scoped to the current workspace."
    ],
    gaps: [
      "No system-level sandbox privilege escalation is performed locally.",
      "Remote provider permission model is declared locally; actual remote execution still requires user/platform authorization and external evidence backfill.",
      "No signed extension marketplace trust root is configured."
    ],
    policy: {
      access: "local-read-only",
      scope: "currentWorkspace",
      executesCommands: false,
      changesApprovals: false,
      pushes: false,
      createsRemotePr: false
    }
  };
}

async function buildPermissionMatrix({ limit = 20 } = {}) {
  const max = Math.min(80, Math.max(1, Number(limit) || 20));
  const [approvals, toolCatalog, extensions, mcp, remoteConfig, packages] = await Promise.all([
    listApprovalRequests(max),
    buildToolCatalog(),
    listExtensions(),
    discoverMcpServers(),
    readGitRemoteConfigSummary(),
    listRemotePublishPackages({ limit: max })
  ]);
  const latestPackageProvider = packages.packages?.[0]?.provider || "";
  const remoteProviderRows = buildRemoteProviderPermissionRows({
    provider: remoteConfig.provider || latestPackageProvider,
    remoteProject: remoteConfig.remoteProject || {},
    packages
  });
  const rows = [
    {
      provider: "workspace",
      action: "read_context",
      access: "read-only",
      scope: "currentWorkspace",
      requiresApproval: false,
      executesCommands: false,
      writesFiles: false,
      writesRemote: false,
      evidence: ["list_files", "repo_map", "read_file_range", "search_files"]
    },
    {
      provider: "workspace",
      action: "apply_diff",
      access: "approval-gated-write",
      scope: "currentWorkspace",
      requiresApproval: true,
      executesCommands: false,
      writesFiles: true,
      writesRemote: false,
      createsCheckpoint: true,
      supportsPartialHunks: true,
      evidence: ["/api/apply", "/api/rollback", ".forge/checkpoints"]
    },
    {
      provider: "local-shell",
      action: "run_command",
      access: "policy-gated-exec",
      scope: "currentWorkspace",
      requiresApproval: false,
      executesCommands: true,
      writesFiles: false,
      writesRemote: false,
      evidence: ["evaluateCommandPolicy", "/api/command"]
    },
    {
      provider: "local-process",
      action: "managed_process",
      access: "policy-gated-process",
      scope: "currentWorkspace",
      requiresApproval: false,
      executesCommands: true,
      writesFiles: false,
      writesRemote: false,
      evidence: ["evaluateProcessPolicy", "/api/processes", "/api/process-health"]
    },
    {
      provider: "model",
      action: "provider_request",
      access: "budget-gated-provider-call",
      scope: "configuredEndpoint",
      requiresApproval: false,
      executesCommands: false,
      writesFiles: false,
      writesRemote: false,
      exposesSecrets: false,
      evidence: ["/api/model-policy", "/api/model-budget", "FORGE_MODELS"]
    },
    {
      provider: "browser",
      action: "local_browser",
      access: "localhost-only",
      scope: "localhost",
      requiresApproval: false,
      executesCommands: false,
      writesFiles: true,
      writesRemote: false,
      evidence: ["/api/browser-check", "/api/browser-audit", "/api/browser-screenshot", "/api/browser-trace", "/api/browser-interact", "/api/browser-visual"]
    },
    {
      provider: "assets",
      action: "inspect_workspace_assets",
      access: "metadata-and-inspection",
      scope: "currentWorkspace",
      requiresApproval: false,
      executesCommands: false,
      writesFiles: true,
      writesRemote: false,
      evidence: ["/api/assets", "/api/asset-inspect"]
    },
    {
      provider: "extension",
      action: "tool_call",
      access: "approval-gated-local-extension",
      scope: "currentWorkspace",
      requiresApproval: true,
      executesCommands: false,
      writesFiles: false,
      writesRemote: false,
      evidence: ["/api/extensions", "/api/extension-tool-call", "/api/approval-execute"]
    },
    {
      provider: "mcp",
      action: "tools_call",
      access: "approval-gated-local-mcp",
      scope: "localMcpServers",
      requiresApproval: true,
      executesCommands: true,
      writesFiles: false,
      writesRemote: false,
      evidence: ["/api/mcp", "/api/mcp?probe=1", "/api/mcp-tool-call", "/api/approval-execute"]
    },
    ...remoteProviderRows
  ];
  const byProvider = rows.reduce((acc, row) => {
    acc[row.provider] = acc[row.provider] || {
      provider: row.provider,
      actions: 0,
      approvalRequired: 0,
      executesCommands: 0,
      writesFiles: 0,
      writesRemote: 0,
      requiresExternalExecution: 0,
      requiresExternalEvidence: 0
    };
    acc[row.provider].actions += 1;
    if (row.requiresApproval) acc[row.provider].approvalRequired += 1;
    if (row.executesCommands) acc[row.provider].executesCommands += 1;
    if (row.writesFiles) acc[row.provider].writesFiles += 1;
    if (row.writesRemote) acc[row.provider].writesRemote += 1;
    if (row.requiresExternalExecution) acc[row.provider].requiresExternalExecution += 1;
    if (row.requiresExternalEvidence) acc[row.provider].requiresExternalEvidence += 1;
    return acc;
  }, {});
  return {
    generatedAt: new Date().toISOString(),
    workspace: currentWorkspace,
    summary: {
      providers: Object.keys(byProvider).length,
      actions: rows.length,
      approvalRequired: rows.filter((row) => row.requiresApproval).length,
      commandExecuting: rows.filter((row) => row.executesCommands).length,
      remoteWriteEnabled: rows.filter((row) => row.writesRemote).length,
      remoteProviderActions: remoteProviderRows.length,
      remoteProvider: remoteProviderRows[0]?.remoteProvider || "unknown",
      manualProviderActions: remoteProviderRows.filter((row) => row.manualProvider).length,
      externalExecutionRequired: rows.filter((row) => row.requiresExternalExecution).length,
      externalEvidenceRequired: rows.filter((row) => row.requiresExternalEvidence).length,
      tools: toolCatalog.summary.total,
      extensions: extensions.summary.total,
      mcpServers: mcp.summary.total,
      approvals: approvals.length
    },
    providers: Object.values(byProvider),
    remoteProviderPolicy: {
      provider: remoteProviderRows[0]?.remoteProvider || "unknown",
      manualProvider: remoteProviderRows.some((row) => row.manualProvider),
      remoteProject: remoteProviderRows[0]?.remoteProject || {},
      actions: remoteProviderRows.map((row) => ({
        action: row.action,
        access: row.access,
        requiresApproval: row.requiresApproval,
        requiresExternalExecution: Boolean(row.requiresExternalExecution),
        requiresExternalEvidence: Boolean(row.requiresExternalEvidence),
        writesRemote: Boolean(row.writesRemote),
        pushes: Boolean(row.pushes),
        createsRemotePr: Boolean(row.createsRemotePr),
        writesRemoteComments: Boolean(row.writesRemoteComments),
        evidence: row.evidence || []
      }))
    },
    rows,
    guardrails: [
      "Remote publish permissions are declared per provider/action and keep push/create/comment remote writes disabled locally.",
      "Manual providers such as Gitee require external execution evidence before merge gates can treat remote publishing as complete.",
      "Workspace writes require checkpointed /api/apply approval and support partial hunk conflict evidence.",
      "Local extension and MCP tool calls require approval artifacts before execution.",
      "Model endpoints expose redacted provider metadata and enforce budget checks before provider requests.",
      "Browser automation is restricted to localhost targets."
    ],
    policy: {
      access: "local-read-only",
      scope: "currentWorkspace",
      executesCommands: false,
      changesApprovals: false,
      writesFiles: false,
      writesRemote: false,
      exposesSecrets: false
    }
  };
}

let lastExtensionCatalogCache = { extensions: [] };

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function extensionSignaturePayload(manifest) {
  const clone = JSON.parse(JSON.stringify(manifest || {}));
  if (clone.trust && typeof clone.trust === "object" && !Array.isArray(clone.trust)) {
    delete clone.trust.signature;
    delete clone.trust.signatureValue;
    delete clone.trust.signatureVerified;
  }
  return Buffer.from(stableJson(clone), "utf8");
}

function verifyExtensionSignature(manifest, declaredTrust = {}) {
  const signature = String(declaredTrust.signature || declaredTrust.signatureValue || "").trim();
  const publicKeyPem = String(declaredTrust.publicKeyPem || declaredTrust.publicKey || "").trim();
  const algorithm = String(declaredTrust.signatureAlgorithm || declaredTrust.algorithm || "ed25519").trim().toLowerCase();
  if (!signature || !publicKeyPem) {
    return {
      attempted: false,
      verified: false,
      algorithm,
      reason: signature ? "missing-public-key" : publicKeyPem ? "missing-signature" : "missing-signature-and-public-key"
    };
  }
  try {
    const payload = extensionSignaturePayload(manifest);
    const key = crypto.createPublicKey(publicKeyPem);
    const signatureBuffer = Buffer.from(signature, "base64");
    const verifierAlgorithm = algorithm === "ed25519" ? null : algorithm.toUpperCase();
    const verified = crypto.verify(verifierAlgorithm, payload, key, signatureBuffer);
    return {
      attempted: true,
      verified,
      algorithm,
      keyType: key.asymmetricKeyType || "",
      reason: verified ? "" : "signature-mismatch"
    };
  } catch (error) {
    return {
      attempted: true,
      verified: false,
      algorithm,
      reason: error instanceof Error ? error.message : String(error)
    };
  }
}

function parseExtensionManifest(raw, source, type) {
  const manifest = typeof raw === "string" ? JSON.parse(raw) : raw;
  const name = String(manifest.name || path.basename(source, path.extname(source))).trim();
  if (!name) throw new Error("extension manifest missing name");
  const manifestHash = hashBuffer(Buffer.from(typeof raw === "string" ? raw : JSON.stringify(raw), "utf8"));
  const declaredTrust = manifest.trust && typeof manifest.trust === "object" && !Array.isArray(manifest.trust)
    ? manifest.trust
    : {};
  const trustedHashes = Array.isArray(declaredTrust.trustedHashes) ? declaredTrust.trustedHashes.map(String) : [];
  const checksumMatches = trustedHashes.includes(manifestHash) || String(declaredTrust.sha256 || "") === manifestHash;
  const signed = Boolean(declaredTrust.signature || declaredTrust.signedBy);
  const signature = verifyExtensionSignature(manifest, declaredTrust);
  return {
    name,
    type: manifest.type || type,
    version: manifest.version || "",
    description: manifest.description || "",
    entry: manifest.entry || "",
    capabilities: Array.isArray(manifest.capabilities) ? manifest.capabilities : [],
    tools: Array.isArray(manifest.tools)
      ? manifest.tools.map((tool) => ({
          name: String(tool.name || "").trim(),
          description: String(tool.description || ""),
          parameters: tool.parameters || { type: "object", properties: {} },
          mapsTo: String(tool.mapsTo || tool.tool || tool.name || "").trim()
        })).filter((tool) => tool.name)
      : [],
    policy: {
      access: manifest.policy?.access || "declared",
      source: "local-extension",
      scope: manifest.policy?.scope || "currentWorkspace",
      requiresApproval: manifest.policy?.requiresApproval !== false
    },
    trust: {
      manifestHash,
      source: "local-manifest-sha256",
      declared: Boolean(manifest.trust),
      signed,
      signature,
      signatureVerified: signature.verified,
      checksumMatches,
      status: signature.verified ? "signature-verified" : signed ? "declared-signature-unverified" : checksumMatches ? "checksum-pinned" : "local-unpinned",
      signer: String(declaredTrust.signedBy || ""),
      policy: {
        signedMarketplace: false,
        localSignatureVerification: true,
        localChecksumAudit: true,
        blocksExecution: false,
        requiresApproval: manifest.policy?.requiresApproval !== false
      }
    },
    source
  };
}

async function listExtensions() {
  const roots = [
    { dir: path.join(EXTENSION_DIR, "skills"), type: "skill" },
    { dir: path.join(EXTENSION_DIR, "plugins"), type: "plugin" }
  ];
  const extensions = [];
  const errors = [];
  for (const root of roots) {
    const entries = await fs.readdir(root.dir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const manifestPath = entry.isDirectory()
        ? path.join(root.dir, entry.name, "manifest.json")
        : entry.isFile() && entry.name.endsWith(".json")
          ? path.join(root.dir, entry.name)
          : "";
      if (!manifestPath) continue;
      try {
        const raw = await fs.readFile(manifestPath, "utf8");
        extensions.push(parseExtensionManifest(raw, toPosix(path.relative(APP_ROOT, manifestPath)), root.type));
      } catch (error) {
        errors.push({ source: toPosix(path.relative(APP_ROOT, manifestPath)), error: error.message });
      }
    }
  }
  const summary = extensions.reduce((acc, extension) => {
    acc.total += 1;
    acc[extension.type] = (acc[extension.type] || 0) + 1;
    acc.trust[extension.trust?.status || "unknown"] = (acc.trust[extension.trust?.status || "unknown"] || 0) + 1;
    return acc;
  }, { total: 0, skill: 0, plugin: 0, trust: {} });
  const catalog = {
    generatedAt: new Date().toISOString(),
    workspace: currentWorkspace,
    root: toPosix(path.relative(APP_ROOT, EXTENSION_DIR)),
    summary,
    extensions,
    errors,
    gaps: [
      "runtime extension loading",
      "extension tool invocation",
      "remote extension marketplace",
      "remote signed extension marketplace beyond local signature/checksum audit"
    ]
  };
  lastExtensionCatalogCache = catalog;
  return catalog;
}

async function buildExtensionTrustAudit({ limit = 40 } = {}) {
  const max = Math.min(120, Math.max(1, Number(limit) || 40));
  const catalog = await listExtensions();
  const rows = catalog.extensions.slice(0, max).map((extension) => ({
    name: extension.name,
    type: extension.type,
    source: extension.source,
    version: extension.version,
    toolCount: (extension.tools || []).length,
    capabilities: extension.capabilities || [],
    trust: extension.trust,
    approvalRequired: extension.policy?.requiresApproval !== false,
    access: extension.policy?.access || "declared"
  }));
  const summary = rows.reduce((acc, row) => {
    acc.total += 1;
    const status = row.trust?.status || "unknown";
    acc.status[status] = (acc.status[status] || 0) + 1;
    if (row.approvalRequired) acc.approvalRequired += 1;
    if (row.trust?.signed) acc.signed += 1;
    if (row.trust?.signatureVerified) acc.signatureVerified += 1;
    if (row.trust?.checksumMatches) acc.checksumPinned += 1;
    return acc;
  }, { total: 0, approvalRequired: 0, signed: 0, signatureVerified: 0, checksumPinned: 0, status: {} });
  return {
    generatedAt: new Date().toISOString(),
    workspace: currentWorkspace,
    summary,
    rows,
    guardrails: [
      "Local extension manifests are hashed with SHA-256 and surfaced in catalog/trust audit output.",
      "Local checksum pins are reported when manifest.trust.sha256 or manifest.trust.trustedHashes matches the manifest hash.",
      "Local signatures are verified when manifest.trust.signature and manifest.trust.publicKeyPem are present.",
      "Remote marketplace signatures still require an external trust root before they can be treated as provider verified.",
      "Extension tool calls still require approval and can only bridge to built-in read-only tools."
    ],
    gaps: [
      "No remote signed extension marketplace trust root is configured.",
      "No remote certificate or marketplace signature chain is verified."
    ],
    policy: {
      access: "local-read-only",
      scope: "currentWorkspace",
      executesCommands: false,
      changesApprovals: false,
      writesFiles: false,
      verifiesSignatures: true,
      localSignatureVerification: true,
      localChecksumAudit: true
    }
  };
}

async function findExtensionTool(extensionName, toolName) {
  const catalog = await listExtensions();
  const extension = catalog.extensions.find((item) => item.name === extensionName);
  if (!extension) throw new Error(`Extension not found: ${extensionName}`);
  const tool = (extension.tools || []).find((item) => item.name === toolName);
  if (!tool) throw new Error(`Extension tool not found: ${extensionName}.${toolName}`);
  return { extension, tool };
}

function normalizeExtensionToolArguments(args = {}) {
  const text = JSON.stringify(args ?? {});
  if (text.length > 12000) throw new Error("Extension tool arguments are too large.");
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Extension tool arguments must be a JSON object.");
  }
  return parsed;
}

async function createExtensionToolCallApproval({ extensionName = "", toolName = "", arguments: toolArguments = {} } = {}) {
  const safeExtensionName = String(extensionName || "").trim();
  const safeToolName = String(toolName || "").trim();
  if (!/^[\w.-]+$/.test(safeExtensionName)) throw new Error("extensionName 非法。");
  if (!/^[\w.-]+$/.test(safeToolName)) throw new Error("extension toolName 非法。");
  const { extension, tool } = await findExtensionTool(safeExtensionName, safeToolName);
  const safeArguments = normalizeExtensionToolArguments(toolArguments);
  const approval = await writeApprovalRequest({
    type: "extension_tool_call",
    command: `${extension.name}.${tool.name}`,
    reason: "Local extension tool execution requires explicit approval.",
    policy: {
      allowed: false,
      risk: "medium",
      reason: "本地扩展工具调用必须先审批；批准后仅允许映射到内置只读工具执行。",
      requiresApproval: true,
      access: extension.policy?.access || "declared",
      mapsTo: tool.mapsTo || ""
    },
    extension: {
      name: extension.name,
      type: extension.type,
      source: extension.source,
      toolName: tool.name,
      mapsTo: tool.mapsTo || "",
      arguments: safeArguments
    }
  });
  return {
    status: "approval_required",
    extension: { name: extension.name, type: extension.type, source: extension.source },
    tool: {
      name: tool.name,
      description: tool.description || "",
      mapsTo: tool.mapsTo || ""
    },
    approval,
    policy: {
      executesTool: false,
      requiresExplicitApproval: true,
      executionMode: "approved-read-only-builtin-bridge"
    }
  };
}

async function executeExtensionToolCall(extensionName, toolName, toolArguments = {}) {
  const { extension, tool } = await findExtensionTool(String(extensionName || ""), String(toolName || ""));
  const safeArguments = normalizeExtensionToolArguments(toolArguments);
  const mappedTool = String(tool.mapsTo || tool.name || "").trim();
  const allowedReadTools = new Set(getAgentTools().map((item) => item.function.name));
  if (!allowedReadTools.has(mappedTool)) {
    throw new Error(`Extension tool ${extension.name}.${tool.name} is not mapped to an allowed read-only builtin tool.`);
  }
  const rawResult = await runReadTool(mappedTool, safeArguments);
  return {
    extensionName: extension.name,
    toolName: tool.name,
    mappedTool,
    result: rawResult.slice(0, 30000),
    calledAt: new Date().toISOString(),
    policy: {
      access: "read-only",
      source: "local-extension",
      scope: "currentWorkspace"
    }
  };
}

function normalizeMcpServer(name, config = {}, source) {
  const command = typeof config.command === "string" ? config.command : "";
  const args = Array.isArray(config.args) ? config.args.map(String) : [];
  const url = typeof config.url === "string" ? config.url : "";
  const transport = config.transport || (url ? "http" : "stdio");
  const envValues = config.env && typeof config.env === "object" && !Array.isArray(config.env) ? config.env : {};
  const env = Object.keys(envValues).sort();
  const server = {
    name,
    transport,
    command,
    args,
    url,
    envKeys: env,
    disabled: Boolean(config.disabled),
    source,
    policy: {
      access: "configured",
      source: "mcp",
      scope: "currentWorkspace",
      requiresApproval: true
    },
    status: config.disabled ? "disabled" : "configured"
  };
  Object.defineProperty(server, "envValues", { value: envValues, enumerable: false });
  return server;
}

function summarizeMcpProbe(probe = {}) {
  const tools = Array.isArray(probe.tools) ? probe.tools : [];
  const resources = Array.isArray(probe.resources) ? probe.resources : [];
  const prompts = Array.isArray(probe.prompts) ? probe.prompts : [];
  return {
    status: probe.status || "not_probed",
    protocolVersion: probe.protocolVersion || "",
    serverInfo: probe.serverInfo || null,
    capabilities: probe.capabilities || {},
    counts: {
      tools: tools.length,
      resources: resources.length,
      prompts: prompts.length
    },
    tools: tools.slice(0, 20).map((item) => ({
      name: item.name || "",
      description: item.description || "",
      inputSchema: item.inputSchema || item.schema || null
    })),
    resources: resources.slice(0, 20).map((item) => ({
      uri: item.uri || "",
      name: item.name || "",
      description: item.description || "",
      mimeType: item.mimeType || ""
    })),
    prompts: prompts.slice(0, 20).map((item) => ({
      name: item.name || "",
      description: item.description || "",
      arguments: Array.isArray(item.arguments) ? item.arguments : []
    })),
    error: probe.error || ""
  };
}

function buildMcpJsonRpc(method, params = {}, id = 1) {
  return { jsonrpc: "2.0", id, method, params };
}

function parseMcpContentLengthFrame(buffer) {
  const separator = "\r\n\r\n";
  const headerEnd = buffer.indexOf(separator);
  if (headerEnd < 0) return null;
  const header = buffer.slice(0, headerEnd);
  const match = header.match(/content-length:\s*(\d+)/i);
  if (!match) return null;
  const length = Number(match[1]);
  const bodyStart = headerEnd + separator.length;
  if (buffer.length < bodyStart + length) return null;
  return {
    json: buffer.slice(bodyStart, bodyStart + length),
    rest: buffer.slice(bodyStart + length)
  };
}

function parseMcpLineFrame(buffer) {
  if (/^content-length:/i.test(buffer)) return null;
  const lineEnd = buffer.indexOf("\n");
  if (lineEnd < 0) return null;
  const json = buffer.slice(0, lineEnd).trim();
  if (!json) return { json: "", rest: buffer.slice(lineEnd + 1) };
  return { json, rest: buffer.slice(lineEnd + 1) };
}

async function probeMcpStdioServer(server, { timeoutMs = 30000 } = {}) {
  if (!server.command || server.disabled) {
    return summarizeMcpProbe({ status: server.disabled ? "disabled" : "not_configured", error: server.disabled ? "server disabled" : "missing command" });
  }
  const commandText = [server.command, ...server.args].join(" ").trim();
  const policy = evaluateProcessPolicy(commandText);
  if (!policy.allowed) {
    return summarizeMcpProbe({ status: "approval_required", error: policy.reason });
  }
  return new Promise((resolve) => {
    const env = { ...process.env, ...(server.envValues || {}) };
    const child = spawn(server.command, server.args, {
      cwd: currentWorkspace,
      env,
      windowsHide: true,
      shell: false
    });
    let buffer = "";
    let stderr = "";
    let nextId = 1;
    const pending = new Map();
    const done = (result) => {
      clearTimeout(timer);
      for (const item of pending.values()) {
        clearTimeout(item.timer);
      }
      pending.clear();
      child.kill();
      resolve(summarizeMcpProbe(result));
    };
    const sendRpc = (method, params = {}) => new Promise((rpcResolve, rpcReject) => {
      const id = nextId++;
      const payload = `${JSON.stringify(buildMcpJsonRpc(method, params, id))}\n`;
      const rpcTimer = setTimeout(() => {
        pending.delete(id);
        rpcReject(new Error(`${method} timed out`));
      }, timeoutMs);
      pending.set(id, { resolve: rpcResolve, reject: rpcReject, timer: rpcTimer, method });
      child.stdin.write(payload, "utf8");
    });
    const handleMessage = (message) => {
      if (!message || typeof message !== "object" || message.id === undefined) return;
      const item = pending.get(message.id);
      if (!item) return;
      clearTimeout(item.timer);
      pending.delete(message.id);
      if (message.error) {
        item.reject(new Error(message.error.message || `${item.method} failed`));
      } else {
        item.resolve(message.result || {});
      }
    };
    child.stdout.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      while (buffer) {
        const frame = parseMcpContentLengthFrame(buffer) || parseMcpLineFrame(buffer);
        if (!frame) break;
        buffer = frame.rest;
        if (!frame.json) continue;
        try {
          handleMessage(JSON.parse(frame.json));
        } catch {
          continue;
        }
      }
    });
    child.stderr.on("data", (chunk) => {
      stderr = (stderr + chunk.toString("utf8")).slice(-4000);
    });
    child.on("error", (error) => done({ status: "error", error: error.message }));
    const timer = setTimeout(() => done({ status: "timeout", error: stderr || `Timed out after ${timeoutMs}ms` }), timeoutMs * 4);
    (async () => {
      try {
        const init = await sendRpc("initialize", {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "forge-code", version: "0.1.0" }
        });
        child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized", params: {} })}\n`, "utf8");
        const [toolResult, resourceResult, promptResult] = await Promise.allSettled([
          sendRpc("tools/list"),
          sendRpc("resources/list"),
          sendRpc("prompts/list")
        ]);
        done({
          status: "probed",
          protocolVersion: init.protocolVersion || "",
          serverInfo: init.serverInfo || null,
          capabilities: init.capabilities || {},
          tools: toolResult.status === "fulfilled" ? toolResult.value.tools || [] : [],
          resources: resourceResult.status === "fulfilled" ? resourceResult.value.resources || [] : [],
          prompts: promptResult.status === "fulfilled" ? promptResult.value.prompts || [] : [],
          error: [toolResult, resourceResult, promptResult]
            .filter((item) => item.status === "rejected")
            .map((item) => item.reason.message)
            .join("; ")
        });
      } catch (error) {
        done({ status: "error", error: error.message || stderr });
      }
    })();
  });
}

async function callMcpStdioMethod(server, method, params = {}, { timeoutMs = 30000 } = {}) {
  if (!server.command || server.disabled) {
    throw new Error(server.disabled ? "MCP server disabled." : "MCP server missing command.");
  }
  const commandText = [server.command, ...server.args].join(" ").trim();
  const policy = evaluateProcessPolicy(commandText);
  if (!policy.allowed) {
    throw new Error(`MCP server command did not pass process policy: ${policy.reason}`);
  }
  return new Promise((resolve, reject) => {
    const child = spawn(server.command, server.args, {
      cwd: currentWorkspace,
      env: { ...process.env, ...(server.envValues || {}) },
      windowsHide: true,
      shell: false
    });
    let buffer = "";
    let stderr = "";
    let nextId = 1;
    const pending = new Map();
    const finish = (error, value) => {
      clearTimeout(overallTimer);
      for (const item of pending.values()) clearTimeout(item.timer);
      pending.clear();
      child.kill();
      if (error) reject(error);
      else resolve(value);
    };
    const sendRpc = (rpcMethod, rpcParams = {}) => new Promise((rpcResolve, rpcReject) => {
      const id = nextId++;
      const payload = `${JSON.stringify(buildMcpJsonRpc(rpcMethod, rpcParams, id))}\n`;
      const rpcTimer = setTimeout(() => {
        pending.delete(id);
        rpcReject(new Error(`${rpcMethod} timed out`));
      }, timeoutMs);
      pending.set(id, { resolve: rpcResolve, reject: rpcReject, timer: rpcTimer, method: rpcMethod });
      child.stdin.write(payload, "utf8");
    });
    const handleMessage = (message) => {
      if (!message || typeof message !== "object" || message.id === undefined) return;
      const item = pending.get(message.id);
      if (!item) return;
      clearTimeout(item.timer);
      pending.delete(message.id);
      if (message.error) item.reject(new Error(message.error.message || `${item.method} failed`));
      else item.resolve(message.result || {});
    };
    child.stdout.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      while (buffer) {
        const frame = parseMcpContentLengthFrame(buffer) || parseMcpLineFrame(buffer);
        if (!frame) break;
        buffer = frame.rest;
        if (!frame.json) continue;
        try {
          handleMessage(JSON.parse(frame.json));
        } catch {
          continue;
        }
      }
    });
    child.stderr.on("data", (chunk) => {
      stderr = (stderr + chunk.toString("utf8")).slice(-4000);
    });
    child.on("error", (error) => finish(error));
    const overallTimer = setTimeout(() => finish(new Error(stderr || `Timed out after ${timeoutMs * 3}ms`)), timeoutMs * 3);
    (async () => {
      try {
        await sendRpc("initialize", {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "forge-code", version: "0.1.0" }
        });
        child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized", params: {} })}\n`, "utf8");
        const result = await sendRpc(method, params);
        finish(null, result);
      } catch (error) {
        finish(error);
      }
    })();
  });
}

async function probeMcpHttpServer(server, { timeoutMs = 10000 } = {}) {
  if (!server.url || server.disabled) {
    return summarizeMcpProbe({ status: server.disabled ? "disabled" : "not_configured", error: server.disabled ? "server disabled" : "missing url" });
  }
  if (!/^https?:\/\/(?:127\.0\.0\.1|localhost|\[::1\])/i.test(server.url)) {
    return summarizeMcpProbe({ status: "approval_required", error: "HTTP MCP probe only allows localhost URLs." });
  }
  const postRpc = async (method, params = {}, id = 1) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(server.url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
        body: JSON.stringify(buildMcpJsonRpc(method, params, id)),
        signal: controller.signal
      });
      const text = await response.text();
      const jsonLine = text.split(/\r?\n/).find((line) => line.trim().startsWith("{")) || text;
      const parsed = JSON.parse(jsonLine.trim());
      if (parsed.error) throw new Error(parsed.error.message || `${method} failed`);
      return parsed.result || {};
    } finally {
      clearTimeout(timer);
    }
  };
  try {
    const init = await postRpc("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "forge-code", version: "0.1.0" }
    }, 1);
    const [toolResult, resourceResult, promptResult] = await Promise.allSettled([
      postRpc("tools/list", {}, 2),
      postRpc("resources/list", {}, 3),
      postRpc("prompts/list", {}, 4)
    ]);
    return summarizeMcpProbe({
      status: "probed",
      protocolVersion: init.protocolVersion || "",
      serverInfo: init.serverInfo || null,
      capabilities: init.capabilities || {},
      tools: toolResult.status === "fulfilled" ? toolResult.value.tools || [] : [],
      resources: resourceResult.status === "fulfilled" ? resourceResult.value.resources || [] : [],
      prompts: promptResult.status === "fulfilled" ? promptResult.value.prompts || [] : [],
      error: [toolResult, resourceResult, promptResult]
        .filter((item) => item.status === "rejected")
        .map((item) => item.reason.message)
        .join("; ")
    });
  } catch (error) {
    return summarizeMcpProbe({ status: "error", error: error.message });
  }
}

async function callMcpHttpMethod(server, method, params = {}, { timeoutMs = 5000 } = {}) {
  if (!server.url || server.disabled) {
    throw new Error(server.disabled ? "MCP server disabled." : "MCP server missing url.");
  }
  if (!/^https?:\/\/(?:127\.0\.0\.1|localhost|\[::1\])/i.test(server.url)) {
    throw new Error("HTTP MCP tool calls only allow localhost URLs.");
  }
  const postRpc = async (rpcMethod, rpcParams = {}, id = 1) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(server.url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
        body: JSON.stringify(buildMcpJsonRpc(rpcMethod, rpcParams, id)),
        signal: controller.signal
      });
      const text = await response.text();
      const jsonLine = text.split(/\r?\n/).find((line) => line.trim().startsWith("{")) || text;
      const parsed = JSON.parse(jsonLine.trim());
      if (parsed.error) throw new Error(parsed.error.message || `${rpcMethod} failed`);
      return parsed.result || {};
    } finally {
      clearTimeout(timer);
    }
  };
  await postRpc("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "forge-code", version: "0.1.0" }
  }, 1);
  return postRpc(method, params, 2);
}

async function probeMcpServer(server, options = {}) {
  if (server.transport === "http" || server.url) return probeMcpHttpServer(server, options);
  return probeMcpStdioServer(server, options);
}

async function probeMcpServerWithRetry(server, options = {}) {
  const attempts = Math.min(3, Math.max(1, Number(options.attempts) || 2));
  const timeoutMs = Number(options.timeoutMs || 45000);
  let lastProbe = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const probe = await probeMcpServer(server, { ...options, timeoutMs }).catch((error) => (
      summarizeMcpProbe({ status: "error", error: error.message })
    ));
    lastProbe = {
      ...probe,
      attempts: attempt,
      retried: attempt > 1
    };
    if (probe.status === "probed" || probe.status === "disabled" || probe.status === "approval_required" || probe.status === "not_configured") {
      return lastProbe;
    }
    if (!/timed out|timeout/i.test(String(probe.error || ""))) return lastProbe;
    await sleep(250 * attempt);
  }
  return lastProbe || summarizeMcpProbe({ status: "error", error: "MCP probe failed without result" });
}

async function findMcpServer(name) {
  const catalog = await discoverMcpServers();
  const server = catalog.servers.find((item) => item.name === name);
  if (!server) throw new Error(`MCP server not found: ${name}`);
  if (server.disabled) throw new Error(`MCP server disabled: ${name}`);
  return server;
}

function normalizeMcpToolArguments(args = {}) {
  const text = JSON.stringify(args ?? {});
  if (text.length > 12000) throw new Error("MCP tool arguments are too large.");
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("MCP tool arguments must be a JSON object.");
  }
  return parsed;
}

async function createMcpToolCallApproval({ serverName = "", toolName = "", arguments: toolArguments = {} } = {}) {
  const server = await findMcpServer(String(serverName || ""));
  const safeToolName = String(toolName || "").trim();
  if (!/^[\w.-]+$/.test(safeToolName)) throw new Error("MCP toolName 非法。");
  const safeArguments = normalizeMcpToolArguments(toolArguments);
  const approval = await writeApprovalRequest({
    type: "mcp_tool_call",
    command: `${server.name}.${safeToolName}`,
    reason: "MCP tool execution requires explicit approval.",
    policy: {
      allowed: false,
      risk: "medium",
      reason: "MCP 工具调用可能触发外部能力或写操作，必须先审批。",
      requiresApproval: true
    },
    mcp: {
      serverName: server.name,
      toolName: safeToolName,
      arguments: safeArguments
    }
  });
  return {
    status: "approval_required",
    server: { name: server.name, transport: server.transport, source: server.source },
    tool: {
      name: safeToolName,
      description: "Tool availability is verified at approved execution time."
    },
    approval,
    policy: {
      executesTool: false,
      requiresExplicitApproval: true,
      liveProbeBeforeApproval: false
    }
  };
}

async function executeMcpToolCall(serverName, toolName, toolArguments = {}) {
  const server = await findMcpServer(String(serverName || ""));
  const safeToolName = String(toolName || "").trim();
  if (!/^[\w.-]+$/.test(safeToolName)) throw new Error("MCP toolName 非法。");
  const safeArguments = normalizeMcpToolArguments(toolArguments);
  const params = { name: safeToolName, arguments: safeArguments };
  const attempts = server.transport === "http" || server.url ? [5000, 10000] : [30000, 30000];
  const errors = [];
  let result = null;
  for (const timeoutMs of attempts) {
    try {
      result = server.transport === "http" || server.url
        ? await callMcpHttpMethod(server, "tools/call", params, { timeoutMs })
        : await callMcpStdioMethod(server, "tools/call", params, { timeoutMs });
      break;
    } catch (error) {
      errors.push(error.message);
    }
  }
  if (!result) {
    throw new Error(errors.join(" | ") || "MCP tool call failed.");
  }
  return {
    serverName: server.name,
    toolName: safeToolName,
    result,
    attempts: attempts.length,
    retryErrors: errors,
    calledAt: new Date().toISOString()
  };
}

async function readMcpResourceContent({ serverName = "", uri = "" } = {}) {
  const server = await findMcpServer(String(serverName || ""));
  const safeUri = String(uri || "").trim();
  if (!safeUri) throw new Error("MCP resource uri 不能为空。");
  if (safeUri.length > 2048) throw new Error("MCP resource uri 过长。");
  const params = { uri: safeUri };
  const attempts = server.transport === "http" || server.url ? [5000, 10000] : [30000, 30000];
  const errors = [];
  let result = null;
  for (const timeoutMs of attempts) {
    try {
      result = server.transport === "http" || server.url
        ? await callMcpHttpMethod(server, "resources/read", params, { timeoutMs })
        : await callMcpStdioMethod(server, "resources/read", params, { timeoutMs });
      break;
    } catch (error) {
      errors.push(error.message);
    }
  }
  if (!result) {
    throw new Error(errors.join(" | ") || "MCP resource read failed.");
  }
  const contents = Array.isArray(result.contents) ? result.contents : [];
  return {
    serverName: server.name,
    uri: safeUri,
    contents: contents.slice(0, 20).map((item) => ({
      uri: item.uri || safeUri,
      mimeType: item.mimeType || "",
      text: typeof item.text === "string" ? item.text.slice(0, 60000) : "",
      blob: item.blob ? String(item.blob).slice(0, 60000) : ""
    })),
    raw: contents.length ? null : result,
    readAt: new Date().toISOString(),
    attempts: attempts.length,
    retryErrors: errors,
    policy: {
      access: "mcp-resource-read-only",
      executesTool: false,
      requiresApproval: false,
      writesFiles: false,
      writesRemote: false
    }
  };
}

async function readMcpConfigFile(filePath, source) {
  const raw = (await fs.readFile(filePath, "utf8")).replace(/^\uFEFF/, "");
  const parsed = JSON.parse(raw);
  const candidates = parsed.mcpServers || parsed.servers || parsed;
  if (!candidates || typeof candidates !== "object" || Array.isArray(candidates)) return [];
  return Object.entries(candidates)
    .filter(([, config]) => config && typeof config === "object")
    .map(([name, config]) => normalizeMcpServer(name, config, source));
}

async function discoverMcpServers({ probe = false } = {}) {
  const sources = [
    path.join(MCP_DIR, "servers.json"),
    path.join(APP_ROOT, ".mcp.json"),
    path.join(currentWorkspace, ".mcp.json")
  ];
  const servers = [];
  const errors = [];
  const seen = new Set();
  for (const filePath of sources) {
    const source = toPosix(path.relative(APP_ROOT, filePath));
    try {
      const discovered = await readMcpConfigFile(filePath, source);
      for (const server of discovered) {
        const key = `${server.name}:${server.source}`;
        if (seen.has(key)) continue;
        seen.add(key);
        servers.push(server);
      }
    } catch (error) {
      if (error.code !== "ENOENT") {
        errors.push({ source, error: error.message });
      }
    }
  }
  const serversWithProbe = probe
    ? await Promise.all(servers.map(async (server) => ({
      ...server,
      probe: await probeMcpServerWithRetry(server).catch((error) => summarizeMcpProbe({ status: "error", error: error.message }))
    })))
    : servers;
  const summary = serversWithProbe.reduce((acc, server) => {
    acc.total += 1;
    acc[server.transport] = (acc[server.transport] || 0) + 1;
    if (server.disabled) acc.disabled += 1;
    if (server.probe?.status === "probed") acc.probed += 1;
    acc.tools += server.probe?.counts?.tools || 0;
    acc.resources += server.probe?.counts?.resources || 0;
    acc.prompts += server.probe?.counts?.prompts || 0;
    return acc;
  }, { total: 0, stdio: 0, http: 0, disabled: 0, probed: 0, tools: 0, resources: 0, prompts: 0 });
  return {
    generatedAt: new Date().toISOString(),
    workspace: currentWorkspace,
    sources: sources.map((filePath) => toPosix(path.relative(APP_ROOT, filePath))),
    probe,
    summary,
    servers: serversWithProbe,
    errors,
    gaps: [
      probe ? "approved external MCP execution" : "runtime MCP connection handshake",
      probe ? "non-local HTTP MCP probing" : "resource and tool listing",
      "browser automation",
      "multimodal document/image tools"
    ]
  };
}

function normalizeJson(raw) {
  const text = String(raw || "").trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
  if (text.startsWith("{") && text.endsWith("}")) return text;

  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return text.slice(start, end + 1);
  }

  throw new Error(`模型没有返回 JSON：${text.slice(0, 160)}`);
}

function normalizeAgentPayload(raw) {
  const parsed = JSON.parse(normalizeJson(raw));
  return {
    reply: String(parsed.reply || "已生成建议。"),
    plan: Array.isArray(parsed.plan) ? parsed.plan.map(String) : [],
    diff: String(parsed.diff || ""),
    review: Array.isArray(parsed.review)
      ? parsed.review.map((item) => typeof item === "string" ? {
          severity: "info",
          message: item,
          file: "",
          line: ""
        } : {
          severity: String(item.severity || "info"),
          message: String(item.message || ""),
          file: String(item.file || ""),
          line: String(item.line || "")
        }).filter((item) => item.message)
      : [],
    commands: Array.isArray(parsed.commands)
      ? parsed.commands.map((item) => typeof item === "string" ? { command: item, reason: "" } : {
          command: String(item.command || ""),
          reason: String(item.reason || "")
        }).filter((item) => item.command)
      : []
  };
}

async function forceFinalJson(messages, reason) {
  const repairMessages = [
    ...messages,
    {
      role: "user",
      content: [
        "上一条回复无法被系统解析。",
        `原因：${reason}`,
        "请现在只输出一个 JSON 对象，不要解释，不要 Markdown，不要代码围栏。",
        "格式必须是：{\"reply\":\"中文摘要\",\"plan\":[\"步骤\"],\"diff\":\"unified diff\",\"review\":[{\"severity\":\"info|warning|error\",\"message\":\"审查发现\",\"file\":\"相对路径\",\"line\":\"行号\"}],\"commands\":[{\"command\":\"命令\",\"reason\":\"原因\"}]}",
        "如果需要创建新文件，请在 diff 中使用 --- /dev/null 和 +++ 相对路径。"
      ].join("\n")
    }
  ];
  const finalMessage = await callDeepSeekMessages(repairMessages, null);
  return normalizeAgentPayload(finalMessage.content);
}

async function runReadTool(name, args) {
  if (name === "list_files") {
    const files = await listFiles();
    return JSON.stringify(files.slice(0, Number(args.limit || 120)));
  }
  if (name === "repo_map") {
    return JSON.stringify(await buildRepoMap());
  }
  if (name === "diff_conflicts") {
    return JSON.stringify(await buildDiffConflictPreview(String(args.diff || "")));
  }
  if (name === "model_policy") {
    const usageLedger = await readModelUsageLedger();
    return JSON.stringify(buildModelPolicy({
      includeRecent: args.includeRecent !== false,
      usageLedger
    }));
  }
  if (name === "model_usage") {
    return JSON.stringify(await readModelUsageLedger());
  }
  if (name === "model_budget") {
    const usageLedger = await readModelUsageLedger();
    return JSON.stringify(buildModelBudgetStatus({ usageLedger }));
  }
  if (name === "model_cost") {
    const usageLedger = await readModelUsageLedger();
    return JSON.stringify(buildModelCostEstimate({ usageLedger }));
  }
  if (name === "model_cost_policy") {
    return JSON.stringify(buildModelCostPolicySchema({
      raw: typeof args.raw === "string" ? args.raw : process.env.FORGE_MODEL_COST_POLICY
    }));
  }
  if (name === "model_billing") {
    const usageLedger = await readModelUsageLedger();
    return JSON.stringify(await buildModelBillingReconciliation({
      usageLedger,
      raw: typeof args.raw === "string" ? args.raw : ""
    }));
  }
  if (name === "context_rollup") {
    const cached = await readContextRollup();
    const rebuild = Boolean(args.rebuild) || !cached || Boolean(String(args.query || "").trim());
    return JSON.stringify(rebuild
      ? await buildContextRollup({ limit: Number(args.limit || 24), query: String(args.query || "") })
      : cached);
  }
  if (name === "verification_plan") {
    return JSON.stringify(await buildVerificationPlan({
      commands: Array.isArray(args.commands) ? args.commands : [],
      limit: Number(args.limit || 12)
    }));
  }
  if (name === "ci_status") {
    return JSON.stringify(await buildCiStatus({
      deep: Boolean(args.deep),
      persist: Boolean(args.persist),
      limit: Number(args.limit || 20)
    }));
  }
  if (name === "debug_diagnostics") {
    return JSON.stringify(await buildDebugDiagnostics({
      url: String(args.url || ""),
      commands: Array.isArray(args.commands) ? args.commands : [],
      includeTrace: Boolean(args.includeTrace),
      runChecks: Boolean(args.runChecks),
      waitMs: Number(args.waitMs || 1500),
      limit: Number(args.limit || 20)
    }));
  }
  if (name === "debug_target") {
    return JSON.stringify(await buildDebugTarget({
      url: String(args.url || ""),
      commands: Array.isArray(args.commands) ? args.commands : [],
      includeTrace: Boolean(args.includeTrace),
      runChecks: Boolean(args.runChecks),
      waitMs: Number(args.waitMs || 1500),
      limit: Number(args.limit || 20)
    }));
  }
  if (name === "merge_gate") {
    return JSON.stringify(await buildMergeGateStatus({
      prompt: String(args.prompt || ""),
      deep: Boolean(args.deep),
      limit: Number(args.limit || 20)
    }));
  }
  if (name === "mcp_resource") {
    return JSON.stringify(await readMcpResourceContent({
      serverName: String(args.serverName || ""),
      uri: String(args.uri || "")
    }));
  }
  if (name === "queue_isolation") {
    return JSON.stringify(await buildQueueIsolationReport({
      limit: Number(args.limit || 100)
    }));
  }
  if (name === "process_health") {
    return JSON.stringify(await buildManagedProcessHealth({
      id: String(args.id || ""),
      limit: Number(args.limit || 50)
    }));
  }
  if (name === "runtime_url") {
    return JSON.stringify(await readRuntimeUrlState());
  }
  if (name === "remote_publish_packages") {
    return JSON.stringify(await listRemotePublishPackages({ limit: Number(args.limit || 20) }));
  }
  if (name === "remote_publish_package") {
    return JSON.stringify(await readRemotePublishPackage(String(args.id || "")));
  }
  if (name === "remote_publish_preflight") {
    return JSON.stringify(await buildRemotePublishPreflight({
      id: String(args.id || ""),
      limit: Number(args.limit || 20),
      deep: Boolean(args.deep)
    }));
  }
  if (name === "remote_publish_continuation") {
    return JSON.stringify(await buildRemotePublishContinuation({
      id: String(args.id || ""),
      limit: Number(args.limit || 20),
      deep: Boolean(args.deep)
    }));
  }
  if (name === "policy_audit") {
    return JSON.stringify(await buildPolicyAudit({
      sampleCommands: Array.isArray(args.sampleCommands) ? args.sampleCommands : [],
      limit: Number(args.limit || 20)
    }));
  }
  if (name === "permission_matrix") {
    return JSON.stringify(await buildPermissionMatrix({
      limit: Number(args.limit || 20)
    }));
  }
  if (name === "extension_trust") {
    return JSON.stringify(await buildExtensionTrustAudit({
      limit: Number(args.limit || 40)
    }));
  }
  if (name === "code_intelligence") {
    return JSON.stringify(await buildCodeIntelligenceOverview({
      limit: Number(args.limit || 24),
      includeDiagnostics: args.includeDiagnostics !== false
    }));
  }
  if (name === "semantic_index") {
    return JSON.stringify(await buildSemanticIndex());
  }
  if (name === "symbol_outline") {
    return JSON.stringify(await buildSymbolOutline({
      query: String(args.query || ""),
      path: String(args.path || ""),
      limit: Number(args.limit || 120),
      includeContext: Boolean(args.includeContext)
    }));
  }
  if (name === "semantic_definition") {
    return JSON.stringify(await buildSemanticDefinition(String(args.symbol || ""), {
      path: String(args.path || ""),
      line: Number(args.line || 0),
      contextLines: Number(args.contextLines || 4),
      limit: Number(args.limit || 20)
    }));
  }
  if (name === "semantic_symbol_impact") {
    return JSON.stringify(await buildSemanticSymbolImpact(String(args.symbol || ""), {
      path: String(args.path || ""),
      line: Number(args.line || 0),
      contextLines: Number(args.contextLines || 4),
      limit: Number(args.limit || 80)
    }));
  }
  if (name === "semantic_rename_preview") {
    return JSON.stringify(await buildSemanticRenamePreview(String(args.symbol || ""), String(args.newName || ""), {
      path: String(args.path || ""),
      line: Number(args.line || 0),
      contextLines: Number(args.contextLines || 3),
      limit: Number(args.limit || 80)
    }));
  }
  if (name === "semantic_rename_draft") {
    return JSON.stringify(await buildSemanticRenameDraft({
      symbol: String(args.symbol || ""),
      newName: String(args.newName || ""),
      path: String(args.path || ""),
      line: Number(args.line || 0),
      contextLines: Number(args.contextLines || 3),
      limit: Number(args.limit || 80),
      prompt: String(args.prompt || "")
    }));
  }
  if (name === "semantic_search") {
    return JSON.stringify(await searchSemanticIndex(String(args.query || ""), {
      kind: String(args.kind || "all"),
      limit: Number(args.limit || 50)
    }));
  }
  if (name === "semantic_references") {
    return JSON.stringify(await buildSemanticReferences(String(args.symbol || ""), {
      limit: Number(args.limit || 80),
      contextLines: Number(args.contextLines || 6)
    }));
  }
  if (name === "semantic_diagnostics") {
    return JSON.stringify(await buildSemanticDiagnostics({
      limit: Number(args.limit || 120),
      includeContext: Boolean(args.includeContext)
    }));
  }
  if (name === "semantic_impact") {
    return JSON.stringify(await buildSemanticImpact({
      paths: Array.isArray(args.paths) ? args.paths : [],
      limit: Number(args.limit || 80),
      includeContext: Boolean(args.includeContext)
    }));
  }
  if (name === "dependency_graph") {
    return JSON.stringify(await buildDependencyGraph({
      paths: Array.isArray(args.paths) ? args.paths : [],
      limit: Number(args.limit || 120),
      includeExternal: Boolean(args.includeExternal)
    }));
  }
  if (name === "read_file") {
    const content = await readWorkspaceFile(String(args.path || ""));
    return content.slice(0, Number(args.maxChars || 30000));
  }
  if (name === "read_file_range") {
    return await readWorkspaceFileRange(
      String(args.path || ""),
      Number(args.startLine || 1),
      Number(args.lineCount || 120)
    );
  }
  if (name === "search_files") {
    return JSON.stringify(await searchFiles(String(args.query || ""), Number(args.limit || 20)));
  }
  throw new Error(`未知工具：${name}`);
}

async function callDeepSeekMessages(messages, tools, options = {}) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new Error("缺少 DEEPSEEK_API_KEY。请先在环境变量中配置 DeepSeek API Key。");
  }
  await assertModelBudgetAllowsRequest();
  const startedAt = new Date().toISOString();
  const startedMs = Date.now();
  modelRuntime = {
    ...modelRuntime,
    candidates: MODEL_CANDIDATES,
    lastStartedAt: startedAt,
    lastStatus: "running"
  };
  const fallbacks = [];
  let lastError = "";
  const providerTokenStreaming = Boolean(options.providerTokenStreaming && !tools && typeof options.onToken === "function");
  for (const model of MODEL_CANDIDATES) {
    try {
      const response = await fetch(MODEL_API_URL, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model,
          temperature: 0.15,
          response_format: tools ? undefined : { type: "json_object" },
          tools,
          tool_choice: tools ? "auto" : undefined,
          stream: providerTokenStreaming || undefined,
          stream_options: providerTokenStreaming ? { include_usage: true } : undefined,
          messages
        })
      });
      if (!response.ok) {
        const details = await response.text();
        throw new Error(`${response.status} ${details.slice(0, 500)}`);
      }
      if (providerTokenStreaming) {
        const streamed = await readProviderSseResponse(response, options.onToken);
        if (!streamed.content) throw new Error("Provider stream did not return content.");
        const completedAt = new Date().toISOString();
        const latencyMs = Date.now() - startedMs;
        recordModelRuntimeCall({
          ok: true,
          model,
          fallbacks,
          startedAt,
          completedAt,
          latencyMs,
          usage: streamed.usage
        });
        await recordModelUsageCall({
          ok: true,
          model,
          fallbacks,
          startedAt,
          completedAt,
          latencyMs,
          usage: streamed.usage
        }).catch(() => {});
        return {
          role: "assistant",
          content: streamed.content,
          _model: model,
          _fallbacks: fallbacks,
          _providerTokenStreaming: true,
          _finishReason: streamed.finishReason
        };
      }
      const data = await response.json();
      const message = data.choices?.[0]?.message;
      if (!message) throw new Error("DeepSeek 没有返回消息。");
      const completedAt = new Date().toISOString();
      const latencyMs = Date.now() - startedMs;
      recordModelRuntimeCall({
        ok: true,
        model,
        fallbacks,
        startedAt,
        completedAt,
        latencyMs,
        usage: data.usage
      });
      await recordModelUsageCall({
        ok: true,
        model,
        fallbacks,
        startedAt,
        completedAt,
        latencyMs,
        usage: data.usage
      }).catch(() => {});
      return { ...message, _model: model, _fallbacks: fallbacks };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      fallbacks.push({ model, error: lastError });
    }
  }
  const completedAt = new Date().toISOString();
  const latencyMs = Date.now() - startedMs;
  recordModelRuntimeCall({
    ok: false,
    model: "",
    fallbacks,
    error: lastError,
    startedAt,
    completedAt,
    latencyMs
  });
  await recordModelUsageCall({
    ok: false,
    model: MODEL_CANDIDATES[0] || DEFAULT_MODEL,
    fallbacks,
    error: lastError,
    startedAt,
    completedAt,
    latencyMs
  }).catch(() => {});
  throw new Error(`模型请求失败：${fallbacks.map((item) => `${item.model}: ${item.error}`).join(" | ")}`);
}

function summarizeDiagnosticsForRepair(diagnostics) {
  if (!diagnostics) return "";
  const findings = (diagnostics.findings || [])
    .slice(0, 10)
    .map((item) => `- [${item.severity || "info"}] ${item.area || "debug"}: ${item.message || ""}${item.evidence?.length ? ` | ${item.evidence.join(" · ").slice(0, 1000)}` : ""}`)
    .join("\n");
  const commands = (diagnostics.verificationPlan?.commands || [])
    .slice(0, 8)
    .map((item) => `- ${item.command}${item.reason ? ` (${item.reason})` : ""}`)
    .join("\n");
  const semantic = (diagnostics.semanticDiagnostics?.diagnostics || [])
    .slice(0, 8)
    .map((item) => `- ${item.severity || "info"} ${item.category || item.kind || "issue"} ${item.path || ""}:${item.line || ""} ${item.title || item.message || ""}`)
    .join("\n");
  return [
    `状态：${diagnostics.status || "unknown"}`,
    `摘要：${JSON.stringify(diagnostics.summary || {})}`,
    findings ? `发现项：\n${findings}` : "",
    commands ? `建议检查命令：\n${commands}` : "",
    semantic ? `语义诊断：\n${semantic}` : "",
    diagnostics.processHealth?.summary ? `进程健康：${JSON.stringify(diagnostics.processHealth.summary)}` : "",
    diagnostics.browserTrace?.summary ? `页面 Trace：${JSON.stringify(diagnostics.browserTrace.summary)}` : ""
  ].filter(Boolean).join("\n");
}

async function generateRepairDiff({ prompt, applied, checks, diagnostics = null }) {
  if (!checks.some((item) => item.exitCode !== 0)) {
    return { reply: "检查通过，无需修复。", plan: [], diff: "", review: [], commands: [] };
  }

  const changedFiles = [];
  if (applied?.length) {
    for (const item of applied.slice(0, 8)) {
      const content = await readWorkspaceFile(item.path).catch(() => "");
      changedFiles.push({ path: item.path, content: content.slice(0, 30000) });
    }
  } else {
    const git = await getGitSummary();
    const candidateFiles = git.changedFiles?.length ? git.changedFiles : (await listFiles()).map((file) => file.path);
    for (const filePath of candidateFiles.slice(0, 8)) {
      const content = await readWorkspaceFile(filePath).catch(() => "");
      if (content) changedFiles.push({ path: filePath, content: content.slice(0, 30000) });
    }
  }

  const messages = [
    {
      role: "system",
      content: [
        "你是 Forge Code 的修复代理。你会收到刚写入的文件和失败检查输出。",
        "你必须只基于这些文件和失败输出生成最小修复 diff。",
        "最终回复必须是 JSON 对象：{\"reply\":\"中文摘要\",\"plan\":[\"步骤\"],\"diff\":\"unified diff\",\"review\":[{\"severity\":\"info|warning|error\",\"message\":\"审查发现\",\"file\":\"相对路径\",\"line\":\"行号\"}],\"commands\":[{\"command\":\"命令\",\"reason\":\"原因\"}]}",
        "diff 必须使用工作区相对路径。无法安全修复时 diff 为空，并在 reply 中说明。"
      ].join("\n")
    },
    {
      role: "user",
      content: [
        `原始需求：${prompt || "(未提供)"}`,
        "",
        "失败检查：",
        checks.map((item) => [
          `$ ${item.command}`,
          `exitCode=${item.exitCode}`,
          item.output || "(无输出)"
        ].join("\n")).join("\n\n"),
        "",
        "自动调试诊断：",
        summarizeDiagnosticsForRepair(diagnostics) || "(未提供诊断证据)",
        "",
        "已写入文件内容：",
        changedFiles.map((file) => `--- ${file.path}\n${file.content}`).join("\n\n")
      ].join("\n")
    }
  ];

  const message = await callDeepSeekMessages(messages, null);
  const payload = normalizeAgentPayload(message.content);
  const patches = payload.diff ? await previewUnifiedDiff(payload.diff) : [];
  return { ...payload, patches };
}

async function repairFromFailedCommand({ prompt = "", command = "", result = null, diagnostics = null }) {
  if (!result || result.exitCode === 0) {
    return {
      reply: "命令通过，无需修复。",
      plan: [],
      diff: "",
      review: [],
      commands: [],
      patches: [],
      proposal: null,
      goal: {},
      policy: {
        writesFiles: false,
        updatesPendingProposal: false,
        requiresApplyApproval: false
      }
    };
  }
  const repairDiagnostics = diagnostics || result.diagnostics || await buildDebugDiagnostics({
    commands: [command],
    includeTrace: false,
    runChecks: false,
    limit: 12
  }).catch((error) => ({
    status: "diagnostics_failed",
    summary: { findings: 1, errors: 0, warnings: 1 },
    findings: [{ severity: "warn", area: "debug", message: error.message, evidence: [] }]
  }));
  const repair = await generateRepairDiff({
    prompt,
    applied: [],
    checks: [{
      command,
      reason: "手动运行检查失败",
      exitCode: result.exitCode,
      output: result.output || ""
    }],
    diagnostics: repairDiagnostics
  });
  let proposal = null;
  let goal = {};
  if (repair.diff) {
    proposal = {
      id: `failed-command-${new Date().toISOString().replace(/[:.]/g, "-")}`,
      type: "failed_command_repair",
      createdAt: new Date().toISOString(),
      prompt: prompt || `修复失败命令：${command}`,
      command,
      reply: repair.reply || "",
      plan: repair.plan || [],
      diff: repair.diff || "",
      patches: repair.patches || [],
      commands: repair.commands || [],
      review: repair.review || [],
      failure: {
        exitCode: Number(result.exitCode ?? 1),
        outputSummary: summarizeCheckOutput(result.output || ""),
        category: result.failureAnalysis?.category || repairDiagnostics?.commandFailure?.category || ""
      }
    };
    const previousGoal = await readGoalState();
    const updatedGoal = await writeGoalState({
      objective: prompt || previousGoal.objective || proposal.prompt,
      phase: "awaiting_failed_command_repair_approval",
      status: "awaiting_approval",
      lastPrompt: prompt || previousGoal.lastPrompt || proposal.prompt,
      pendingProposal: proposal,
      nextStep: "复核失败命令修复 diff 后批准写入，并优先重跑原失败命令。"
    });
    goal = {
      phase: updatedGoal.phase,
      status: updatedGoal.status,
      pendingProposalId: updatedGoal.pendingProposal?.id || ""
    };
  }
  return {
    ...repair,
    proposal,
    goal,
    recovery: buildFailureRecoveryChain(command, result, repairDiagnostics),
    policy: {
      writesFiles: false,
      updatesPendingProposal: Boolean(proposal),
      requiresApplyApproval: Boolean(proposal),
      source: "failed-command-repair"
    }
  };
}

async function buildSourceContextRepairDraft({
  prompt = "",
  command = "",
  result = null,
  diagnostics = null,
  lastPrompt = "",
  debugTarget = null,
  browserTriage = null,
  locations = [],
  contextLines = 6,
  limit = 8,
  dryRun = false
} = {}) {
  const compactDebugTarget = debugTarget && typeof debugTarget === "object"
    ? {
        generatedAt: String(debugTarget.generatedAt || "").slice(0, 80),
        workspace: String(debugTarget.workspace || "").slice(0, 500),
        summary: debugTarget.summary || null,
        target: debugTarget.target ? {
          url: String(debugTarget.target.url || "").slice(0, 500),
          source: String(debugTarget.target.source || "").slice(0, 80),
          process: debugTarget.target.process ? {
            id: String(debugTarget.target.process.id || "").slice(0, 120),
            status: String(debugTarget.target.process.status || "").slice(0, 80),
            command: String(debugTarget.target.process.command || "").slice(0, 400),
            probe: debugTarget.target.process.probe || null
          } : null
        } : null,
        verificationCommands: Array.isArray(debugTarget.verificationCommands)
          ? debugTarget.verificationCommands.slice(0, 8).map((item) => ({
              command: String(item?.command || item || "").slice(0, 400),
              reason: String(item?.reason || "").slice(0, 400)
            })).filter((item) => item.command)
          : [],
        policy: debugTarget.policy || null
      }
    : null;
  const compactBrowserTriage = browserTriage && typeof browserTriage === "object"
    ? {
        status: String(browserTriage.status || "").slice(0, 80),
        counts: browserTriage.counts || {},
        findings: Array.isArray(browserTriage.findings)
          ? browserTriage.findings.slice(0, 10).map((item) => ({
              severity: String(item?.severity || "info").slice(0, 24),
              area: String(item?.area || "browser").slice(0, 80),
              message: String(item?.message || "").slice(0, 800),
              evidence: Array.isArray(item?.evidence)
                ? item.evidence.slice(0, 6).map((entry) => String(entry).slice(0, 500))
                : String(item?.evidence || "").slice(0, 800)
            }))
          : [],
        nextActions: Array.isArray(browserTriage.nextActions)
          ? browserTriage.nextActions.slice(0, 6).map((item) => String(item || "").slice(0, 500))
          : []
      }
    : null;
  const sourceDebugContext = {
    lastPrompt: String(lastPrompt || "").slice(0, 6000),
    debugTarget: compactDebugTarget,
    browserTriage: compactBrowserTriage
  };
  const hasSourceDebugContext = Boolean(sourceDebugContext.lastPrompt || compactDebugTarget || compactBrowserTriage);
  const contexts = await readWorkspaceSourceLocationContexts(locations, contextLines, limit);
  const sourceContextBlock = contexts.length
    ? contexts.map((item) => [
        `@${item.path}:${item.line}${item.column ? `:${item.column}` : ""}`,
        item.error ? `ERROR: ${item.error}` : item.context || ""
      ].filter(Boolean).join("\n")).join("\n\n")
    : "(未读取到源码定位上下文)";
  const sourcePrompt = [
    prompt || `修复失败命令：${command}`,
    "",
    "请优先基于这些源码定位上下文生成最小修复 diff。",
    "",
    "失败命令：",
    command ? `$ ${command}` : "(未提供)",
    "",
    "源码定位上下文：",
    sourceContextBlock,
    hasSourceDebugContext ? "" : "",
    hasSourceDebugContext ? "当前调试现场：" : "",
    sourceDebugContext.lastPrompt ? `上一轮需求：${sourceDebugContext.lastPrompt}` : "",
    compactDebugTarget ? `当前调试目标：${JSON.stringify(compactDebugTarget.summary || compactDebugTarget.target || {}, null, 2).slice(0, 3000)}` : "",
    compactBrowserTriage ? `浏览器异常分诊：${JSON.stringify(compactBrowserTriage, null, 2).slice(0, 5000)}` : "",
    "",
    "要求：只修改与源码定位上下文或失败命令直接相关的文件；生成 diff 后必须给出可安全运行的验证命令。"
  ].filter(Boolean).join("\n");
  const draft = dryRun
    ? {
        reply: "dry-run：已生成源码定位修复提示，未请求模型、未写入文件。",
        plan: ["读取源码定位上下文", "生成源码定位修复提示", "等待用户或模型生成最小 diff"],
        diff: "",
        review: [],
        commands: command ? [{ command, reason: "修复后优先重跑原失败命令。" }] : [],
        patches: [],
        proposal: null,
        goal: {},
        policy: {
          writesFiles: false,
          updatesPendingProposal: false,
          requiresApplyApproval: false,
          dryRun: true
        }
      }
    : await repairFromFailedCommand({
        prompt: sourcePrompt,
        command,
        result,
        diagnostics
      });
  let proposal = draft.proposal || null;
  let goal = draft.goal || {};
  if (proposal) {
    proposal = {
      ...proposal,
      id: proposal.id.replace(/^failed-command-/, "source-context-"),
      type: "source_context_repair",
      prompt: sourcePrompt,
      sourceContexts: contexts,
      sourceDebugContext,
      lastPrompt: sourceDebugContext.lastPrompt,
      debugTarget: compactDebugTarget,
      browserTriage: compactBrowserTriage,
      sourceContextSummary: {
        requested: Array.isArray(locations) ? locations.length : 0,
        returned: contexts.length,
        errors: contexts.filter((item) => item.error).length
      }
    };
    const previousGoal = await readGoalState();
    const updatedGoal = await writeGoalState({
      objective: sourcePrompt || previousGoal.objective || proposal.prompt,
      phase: "awaiting_source_context_repair_approval",
      status: "awaiting_approval",
      lastPrompt: sourcePrompt || previousGoal.lastPrompt || proposal.prompt,
      pendingProposal: proposal,
      nextStep: "复核源码定位修复 diff 后批准写入，并优先重跑原失败命令。"
    });
    goal = {
      phase: updatedGoal.phase,
      status: updatedGoal.status,
      pendingProposalId: updatedGoal.pendingProposal?.id || "",
      debugContextAttached: hasSourceDebugContext
    };
  }
  return {
    ...draft,
    proposal,
    goal,
    contexts,
    sourceDebugContext,
    debugTarget: compactDebugTarget,
    browserTriage: compactBrowserTriage,
    sourceContextSummary: {
      requested: Array.isArray(locations) ? locations.length : 0,
      returned: contexts.length,
      errors: contexts.filter((item) => item.error).length
    },
    policy: {
      ...(draft.policy || {}),
      writesFiles: false,
      updatesPendingProposal: Boolean(proposal),
      requiresApplyApproval: Boolean(proposal),
      source: "source-context-repair",
      dryRun: Boolean(dryRun),
      debugContextAttached: hasSourceDebugContext
    }
  };
}

function normalizeAgentDebugContext(debugContext = null) {
  if (!debugContext || typeof debugContext !== "object") return null;
  const browserSourceLocations = uniqueSourceLocations([
    ...(Array.isArray(debugContext.browserSourceLocations) ? debugContext.browserSourceLocations : []),
    ...(Array.isArray(debugContext.debugContext?.browserSourceLocations) ? debugContext.debugContext.browserSourceLocations : [])
  ], 16);
  const referencedFiles = [...new Set([
    ...(Array.isArray(debugContext.referencedFiles) ? debugContext.referencedFiles : []),
    ...(Array.isArray(debugContext.debugContext?.referencedFiles) ? debugContext.debugContext.referencedFiles : []),
    ...browserSourceLocations.map((item) => item.path)
  ]
    .map((item) => toPosix(String(item || "").replace(/^\.?[\\/]/, "")))
    .filter(Boolean))]
    .slice(0, 16);
  const findings = Array.isArray(debugContext.findings)
    ? debugContext.findings.slice(0, 10).map((item) => ({
        severity: String(item?.severity || "info").slice(0, 24),
        area: String(item?.area || "debug").slice(0, 80),
        message: String(item?.message || "").slice(0, 800),
        evidence: Array.isArray(item?.evidence) ? item.evidence.slice(0, 6).map((entry) => String(entry).slice(0, 500)) : []
      }))
    : [];
  const nextActions = Array.isArray(debugContext.nextActions)
    ? debugContext.nextActions.slice(0, 8).map((item) => {
        if (item && typeof item === "object") {
          return {
            id: String(item.id || "").slice(0, 120),
            label: String(item.label || "").slice(0, 120),
            priority: Number.isFinite(Number(item.priority)) ? Number(item.priority) : null,
            kind: String(item.kind || "").slice(0, 80),
            target: String(item.target || "").slice(0, 500),
            command: String(item.command || "").slice(0, 400),
            description: String(item.description || "").slice(0, 800),
            evidence: Array.isArray(item.evidence) ? item.evidence.slice(0, 6).map((entry) => String(entry).slice(0, 500)) : []
          };
        }
        return { description: String(item || "").slice(0, 800), evidence: [] };
      })
    : [];
  const commands = Array.isArray(debugContext.verificationPlan?.commands)
    ? debugContext.verificationPlan.commands.slice(0, 8).map((item) => ({
        command: String(item?.command || item || "").slice(0, 400),
        reason: String(item?.reason || "").slice(0, 400),
        status: String(item?.status || "").slice(0, 80)
      })).filter((item) => item.command)
    : [];
  const processRows = Array.isArray(debugContext.processHealth?.rows)
    ? debugContext.processHealth.rows.slice(0, 8).map((row) => ({
        id: String(row?.id || "").slice(0, 120),
        status: String(row?.status || "").slice(0, 80),
        command: String(row?.command || "").slice(0, 400),
        probe: row?.probe || null,
        rules: row?.rules || null
      }))
    : [];
  const trace = debugContext.browserTrace && typeof debugContext.browserTrace === "object"
    ? {
        ok: Boolean(debugContext.browserTrace.ok),
        url: String(debugContext.browserTrace.url || "").slice(0, 500),
        finalUrl: String(debugContext.browserTrace.finalUrl || "").slice(0, 500),
        summary: debugContext.browserTrace.summary || {},
        console: Array.isArray(debugContext.browserTrace.console) ? debugContext.browserTrace.console.slice(0, 8) : [],
        exceptions: Array.isArray(debugContext.browserTrace.exceptions) ? debugContext.browserTrace.exceptions.slice(0, 8) : [],
        network: Array.isArray(debugContext.browserTrace.network) ? debugContext.browserTrace.network.slice(0, 8) : []
      }
    : null;
  const browserTriage = debugContext.browserTriage && typeof debugContext.browserTriage === "object"
    ? {
        status: String(debugContext.browserTriage.status || "").slice(0, 80),
        counts: debugContext.browserTriage.counts || {},
        findings: Array.isArray(debugContext.browserTriage.findings)
          ? debugContext.browserTriage.findings.slice(0, 10).map((item) => ({
              severity: String(item?.severity || "info").slice(0, 24),
              area: String(item?.area || "browser").slice(0, 80),
              message: String(item?.message || "").slice(0, 800),
              evidence: Array.isArray(item?.evidence)
                ? item.evidence.slice(0, 6).map((entry) => String(entry).slice(0, 500))
                : String(item?.evidence || "").slice(0, 800)
            }))
          : [],
        nextActions: Array.isArray(debugContext.browserTriage.nextActions)
          ? debugContext.browserTriage.nextActions.slice(0, 6).map((item) => String(item || "").slice(0, 500))
          : []
      }
    : null;
  const normalized = {
    source: String(debugContext.source || "lastDebugDiagnostics").slice(0, 80),
    generatedAt: String(debugContext.generatedAt || "").slice(0, 80),
    status: String(debugContext.status || "").slice(0, 80),
    summary: debugContext.summary || {},
    referencedFiles,
    browserSourceLocations,
    findings,
    nextActions,
    verificationPlan: debugContext.verificationPlan ? {
      status: String(debugContext.verificationPlan.status || "").slice(0, 80),
      commands
    } : null,
    processHealth: debugContext.processHealth ? {
      summary: debugContext.processHealth.summary || {},
      rows: processRows
    } : null,
    browserTrace: trace,
    browserTriage
  };
  const hasEvidence = referencedFiles.length || browserSourceLocations.length || findings.length || nextActions.length || commands.length || processRows.length || trace || browserTriage;
  return hasEvidence ? normalized : null;
}

async function buildDebugReferencedFileContext(debugContext = null, files = []) {
  const referenced = Array.isArray(debugContext?.referencedFiles) ? debugContext.referencedFiles : [];
  if (!referenced.length) return { context: [], missing: [], bytes: 0 };
  const fileMap = new Map((files || []).map((file) => [toPosix(file.path).toLowerCase(), file]));
  const context = [];
  const missing = [];
  let total = 0;
  const maxBytes = 90000;
  for (const requested of referenced.slice(0, 16)) {
    const normalized = toPosix(requested);
    const file = fileMap.get(normalized.toLowerCase());
    if (!file) {
      missing.push({ path: normalized, reason: "调试诊断引用的文件不在当前工作区文件列表中。" });
      continue;
    }
    if (total >= maxBytes) break;
    const content = await readWorkspaceFile(file.path).catch((error) => `DEBUG_REFERENCE_READ_ERROR: ${error.message}`);
    const remaining = Math.max(0, maxBytes - total);
    const clipped = content.slice(0, remaining);
    total += Buffer.byteLength(clipped, "utf8");
    context.push({
      path: file.path,
      size: file.size,
      content: clipped,
      clipped: clipped.length < content.length,
      source: "debugContext.referencedFiles"
    });
  }
  return { context, missing, bytes: total };
}

async function runAgentLoop(prompt, options = {}) {
  const files = await listFiles();
  const promptReferenceFiles = await listPromptReferenceFiles();
  const promptReferences = await buildPromptReferenceContext(prompt, promptReferenceFiles);
  const debugContext = normalizeAgentDebugContext(options.debugContext);
  const debugReferences = debugContext ? await buildDebugReferencedFileContext(debugContext, promptReferenceFiles) : { context: [], missing: [], bytes: 0 };
  const toolLog = [];
  const tools = getAgentTools();
  const onProviderToken = typeof options.onProviderToken === "function" ? options.onProviderToken : null;

  const messages = [
    {
      role: "system",
      content: [
        "你是 Forge Code 的编码代理。你必须先通过工具读取/搜索相关文件，再给出可审阅修改。",
        "你只能使用工具读取上下文，不能猜测文件内容。优先用 repo_map 建立仓库地图，再用 search_files/read_file_range/read_file 精确读取。",
        "用户需求中形如 @path/to/file 的引用是用户显式指定的重点上下文；这些文件会预读给你，你必须优先围绕它们排查和修改。",
        "如果 promptReferences.missing 非空，说明用户写了未命中的 @file；你需要在 reply/review 中提醒用户路径未命中，不能假装已经读取。",
        "不要直接要求用户复制文件。",
        "最终回复必须是 JSON 对象：{\"reply\":\"中文摘要\",\"plan\":[\"步骤\"],\"diff\":\"unified diff\",\"review\":[{\"severity\":\"info|warning|error\",\"message\":\"审查发现\",\"file\":\"相对路径\",\"line\":\"行号\"}],\"commands\":[{\"command\":\"命令\",\"reason\":\"原因\"}]}",
        "diff 必须是标准 unified diff，使用 --- path 和 +++ path 文件头；路径必须是工作区相对路径，不要以 / 开头，不要使用绝对路径。",
        "如果工作区为空或目标文件不存在，可以创建新文件。新文件 diff 使用 --- /dev/null、+++ index.html、@@ -0,0 +1,N @@ 格式。",
        "只修改你读过、搜索确认过，或为满足用户需求明确需要新建的文件。",
        "如果无法安全修改，diff 为空字符串，并在 reply 中说明原因。",
        "review 用于代码审查结论，必须列出潜在风险、测试缺口或关键验证点；没有发现时返回空数组。",
        "建议命令只返回相对安全的检查命令，例如 node --check、npm test、npm run lint。不要建议删除、格式化磁盘、下载远程脚本或修改密钥的命令。"
      ].join("\n")
    },
    {
      role: "user",
      content: [
        `用户需求：${prompt}`,
        "",
        promptReferences.context.length
          ? [
              "用户显式引用文件上下文：",
              ...promptReferences.context.map((item) => [
                `--- ${item.path} (${item.size} bytes${item.clipped ? ", clipped" : ""})`,
                item.content
              ].join("\n"))
            ].join("\n\n")
          : "用户显式引用文件上下文：(无)",
        promptReferences.missing.length
          ? `未命中的 @file 引用：\n${promptReferences.missing.map((item) => `- @${item.path}: ${item.reason}`).join("\n")}`
          : "未命中的 @file 引用：(无)",
        "",
        debugReferences.context.length
          ? [
              "上一轮调试诊断相关文件上下文：",
              ...debugReferences.context.map((item) => [
                `--- ${item.path} (${item.size} bytes${item.clipped ? ", clipped" : ""})`,
                item.content
              ].join("\n"))
            ].join("\n\n")
          : "上一轮调试诊断相关文件上下文：(无)",
        debugReferences.missing.length
          ? `调试诊断未命中文件：\n${debugReferences.missing.map((item) => `- @${item.path}: ${item.reason}`).join("\n")}`
          : "调试诊断未命中文件：(无)",
        "",
        debugContext
          ? [
              "上一轮调试诊断上下文：",
              JSON.stringify(debugContext, null, 2)
            ].join("\n")
          : "上一轮调试诊断上下文：(无)",
        "",
        "工作区文件摘要：",
        files.slice(0, 180).map((file) => `${file.path} (${file.size} bytes)`).join("\n")
      ].join("\n")
    }
  ];

  for (let turn = 0; turn < MAX_AGENT_TURNS; turn += 1) {
    const message = await callDeepSeekMessages(messages, tools);
    messages.push(message);
    const toolCalls = message.tool_calls || [];
    if (!toolCalls.length) {
      messages.push({
        role: "user",
        content: [
          "请基于已经读取的上下文输出最终 JSON。",
          "只输出一个 JSON 对象，不要解释，不要 Markdown，不要代码围栏。",
          "格式必须是：{\"reply\":\"中文摘要\",\"plan\":[\"步骤\"],\"diff\":\"unified diff\",\"review\":[{\"severity\":\"info|warning|error\",\"message\":\"审查发现\",\"file\":\"相对路径\",\"line\":\"行号\"}],\"commands\":[{\"command\":\"命令\",\"reason\":\"原因\"}]}",
          "如果没有修改建议，diff 为空字符串。"
        ].join("\n")
      });
      const finalMessage = await callDeepSeekMessages(messages, null, {
        providerTokenStreaming: Boolean(onProviderToken),
        onToken: onProviderToken
      });
      const providerTokenStreaming = Boolean(finalMessage._providerTokenStreaming);
      const finalPayload = normalizeAgentPayload(finalMessage.content);
      const patches = finalPayload.diff ? await previewUnifiedDiff(finalPayload.diff) : [];
      const checks = await discoverCheckCommands(finalPayload.commands);
      return { ...finalPayload, patches, commands: checks, toolLog, providerTokenStreaming, promptReferences, debugContext, debugReferences };
    }
    for (const call of toolCalls) {
      const name = call.function?.name;
      const args = JSON.parse(call.function?.arguments || "{}");
      let result = "";
      try {
        result = await runReadTool(name, args);
      } catch (error) {
        result = `TOOL_ERROR: ${error instanceof Error ? error.message : String(error)}`;
      }
      toolLog.push({ name, args, result: result.slice(0, 4000) });
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: result.slice(0, 30000)
      });
    }
  }

  messages.push({
    role: "user",
    content: "请停止继续调用工具，基于已经读取的上下文输出最终 JSON。"
  });
  const finalMessage = await callDeepSeekMessages(messages, null, {
    providerTokenStreaming: Boolean(onProviderToken),
    onToken: onProviderToken
  });
  const finalPayload = normalizeAgentPayload(finalMessage.content);
  const patches = finalPayload.diff ? await previewUnifiedDiff(finalPayload.diff) : [];
  const checks = await discoverCheckCommands(finalPayload.commands);
    return { ...finalPayload, patches, commands: checks, toolLog, providerTokenStreaming: Boolean(finalMessage._providerTokenStreaming), promptReferences, debugContext, debugReferences };
}

async function persistAgentResult(prompt, result) {
  await writeGoalState({
    objective: prompt,
    phase: result.diff ? "awaiting_approval" : "agent_finished",
    status: result.diff ? "awaiting_approval" : "needs_attention",
    lastPrompt: prompt,
    pendingProposal: result.diff ? {
      id: `proposal-${new Date().toISOString().replace(/[:.]/g, "-")}`,
      type: "agent",
      createdAt: new Date().toISOString(),
      prompt,
      reply: result.reply || "",
      plan: result.plan || [],
      diff: result.diff || "",
      patches: result.patches || [],
      commands: result.commands || [],
      review: result.review || []
    } : null,
    nextStep: result.diff ? "复核 diff 后批准写入。" : "查看代理输出并补充任务要求。"
  });
}

function attachModelEvidence(result) {
  const providerTokenStreaming = Boolean(result.providerTokenStreaming);
  return {
    ...result,
    promptReferences: summarizePromptReferences(result.promptReferences),
    model: currentModelName(),
    modelRuntime: {
      ...modelRuntime,
      lastFallbacks: modelRuntime.lastFallbacks.slice(-3)
    },
    streamPolicy: {
      transport: "sse",
      events: providerTokenStreaming
        ? ["start", "goal", "context", "token", "result", "done", "error"]
        : ["start", "goal", "context", "result", "done", "error"],
      providerTokenStreaming,
      exposesApiKey: false
    }
  };
}

function summarizePromptReferences(promptReferences = {}) {
  const context = Array.isArray(promptReferences.context) ? promptReferences.context : [];
  return {
    references: Array.isArray(promptReferences.references) ? promptReferences.references : [],
    missing: Array.isArray(promptReferences.missing) ? promptReferences.missing : [],
    bytes: Number(promptReferences.bytes || 0),
    context: context.map((item) => ({
      path: item.path,
      size: item.size,
      clipped: Boolean(item.clipped),
      contentBytes: Buffer.byteLength(String(item.content || ""), "utf8")
    }))
  };
}

async function handleStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const requested = url.pathname === "/" ? "/index.html" : url.pathname;
  const full = path.resolve(APP_ROOT, "." + requested);
  if (!full.toLowerCase().startsWith(APP_ROOT.toLowerCase() + path.sep) && full !== APP_ROOT) {
    return sendError(res, 403, "静态资源路径越界。");
  }
  const ext = path.extname(full).toLowerCase();
  const types = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8"
  };
  try {
    const body = await fs.readFile(full);
    res.writeHead(200, { "Content-Type": types[ext] || "application/octet-stream" });
    res.end(body);
  } catch {
    sendError(res, 404, "资源不存在。");
  }
}

async function handleApi(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (req.method === "GET" && url.pathname === "/api/health") {
      const deep = url.searchParams.get("deep") === "1";
      const lightGit = { available: false, branch: "", root: "", status: [], changedFiles: [], remotes: [], upstream: "", skipped: "Use /api/health?deep=1 for git status." };
      const lightAssets = { summary: { total: 0, image: 0, document: 0, data: 0, media: 0 }, assets: [] };
      const [checkpoints, git, tasks, threads, queue, reviews, approvals, processes, extensions, mcp, assets, contextSnapshot, contextRollup, modelUsage, goal, capabilities, runtimeUrl] = await Promise.all([
        listCheckpoints(),
        deep ? getGitSummary() : Promise.resolve(lightGit),
        listTaskLogs(),
        listThreads(),
        listQueuedTasks(),
        listReviewArtifacts(),
        listApprovalRequests(),
        listManagedProcesses({ probe: deep }),
        listExtensions(),
        discoverMcpServers(),
        deep ? buildAssetCatalog() : Promise.resolve(lightAssets),
        readContextSnapshot(),
        readContextRollup(),
        readModelUsageLedger(),
        readGoalState(),
        buildCapabilityAudit({ light: !deep }),
        readRuntimeUrlState()
      ]);
      const recoverySummary = buildGoalRecoverySummary({ goal, tasks, capabilities, contextRollup });
      return send(res, 200, {
        ok: true,
        deep,
        model: modelRuntime.lastModel || MODEL_CANDIDATES[0] || DEFAULT_MODEL,
        modelRuntime,
        modelUsage,
        modelBudget: buildModelBudgetStatus({ usageLedger: modelUsage }),
        modelCost: buildModelCostEstimate({ usageLedger: modelUsage }),
        modelPolicy: buildModelPolicy({ includeRecent: false, usageLedger: modelUsage }),
        hasApiKey: Boolean(process.env.DEEPSEEK_API_KEY),
        ...getWorkspaceInfo(),
        runtimeUrl,
        checkpoints,
        git,
        tasks,
        threads,
        queue,
        reviews,
        approvals,
        processes,
        tools: await buildToolCatalog(),
        extensions,
        mcp,
        assets,
        contextSnapshot,
        contextCompact: await readContextCompaction(),
        contextRollup,
        goal,
        recoverySummary,
        capabilities
      });
    }

    if (req.method === "GET" && url.pathname === "/api/runtime-url") {
      return send(res, 200, { runtimeUrl: await readRuntimeUrlState() });
    }

    if (req.method === "GET" && url.pathname === "/api/context-snapshot") {
      return send(res, 200, { snapshot: await readContextSnapshot() });
    }

    if ((req.method === "GET" || req.method === "POST") && url.pathname === "/api/model-policy") {
      const payload = req.method === "POST" ? await readJson(req) : {};
      const usageLedger = await readModelUsageLedger();
      return send(res, 200, {
        policy: buildModelPolicy({ includeRecent: payload.includeRecent !== false, usageLedger })
      });
    }

    if (req.method === "GET" && url.pathname === "/api/model-usage") {
      return send(res, 200, { usage: await readModelUsageLedger() });
    }

    if ((req.method === "GET" || req.method === "POST") && url.pathname === "/api/model-budget") {
      const payload = req.method === "POST" ? await readJson(req) : {};
      const usageLedger = await readModelUsageLedger();
      return send(res, 200, {
        budget: buildModelBudgetStatus({
          usageLedger,
          limits: payload.limits && typeof payload.limits === "object" ? payload.limits : {}
        })
      });
    }

    if (req.method === "GET" && url.pathname === "/api/model-cost") {
      const usageLedger = await readModelUsageLedger();
      return send(res, 200, { cost: buildModelCostEstimate({ usageLedger }) });
    }

    if ((req.method === "GET" || req.method === "POST") && url.pathname === "/api/model-cost-policy") {
      const payload = req.method === "POST" ? await readJson(req) : {};
      return send(res, 200, {
        policy: buildModelCostPolicySchema({
          raw: typeof payload.raw === "string" ? payload.raw : process.env.FORGE_MODEL_COST_POLICY
        })
      });
    }

    if ((req.method === "GET" || req.method === "POST") && url.pathname === "/api/model-billing") {
      const payload = req.method === "POST" ? await readJson(req) : {};
      const usageLedger = await readModelUsageLedger();
      return send(res, 200, {
        billing: await buildModelBillingReconciliation({
          usageLedger,
          raw: typeof payload.raw === "string" ? payload.raw : ""
        })
      });
    }

    if (req.method === "POST" && url.pathname === "/api/context-snapshot") {
      return send(res, 200, { snapshot: await buildContextSnapshot({ deep: url.searchParams.get("deep") === "1" }) });
    }

    if (req.method === "GET" && url.pathname === "/api/context-compact") {
      return send(res, 200, { compact: await readContextCompaction() });
    }

    if (req.method === "POST" && url.pathname === "/api/context-compact") {
      return send(res, 200, { compact: await buildContextCompaction({ deep: url.searchParams.get("deep") === "1" }) });
    }

    if (req.method === "GET" && url.pathname === "/api/context-rollup") {
      return send(res, 200, { rollup: await readContextRollup() });
    }

    if (req.method === "POST" && url.pathname === "/api/context-rollup") {
      const payload = await readJson(req);
      return send(res, 200, { rollup: await buildContextRollup({
        limit: Number(payload.limit || 24),
        query: String(payload.query || "")
      }) });
    }

    if ((req.method === "GET" || req.method === "POST") && url.pathname === "/api/verification-plan") {
      const payload = req.method === "POST"
        ? await readJson(req)
        : { limit: Number(url.searchParams.get("limit") || 12), commands: [] };
      return send(res, 200, { plan: await buildVerificationPlan({
        commands: Array.isArray(payload.commands) ? payload.commands : [],
        limit: Number(payload.limit || 12)
      }) });
    }

    if ((req.method === "GET" || req.method === "POST") && url.pathname === "/api/ci-status") {
      const payload = req.method === "POST"
        ? await readJson(req)
        : {
          limit: Number(url.searchParams.get("limit") || 20),
          deep: url.searchParams.get("deep") === "1",
          persist: url.searchParams.get("persist") === "1"
        };
      return send(res, 200, { status: await buildCiStatus({
        deep: Boolean(payload.deep),
        persist: Boolean(payload.persist),
        limit: Number(payload.limit || 20)
      }) });
    }

    if ((req.method === "GET" || req.method === "POST") && url.pathname === "/api/debug-diagnostics") {
      const payload = req.method === "POST"
        ? await readJson(req)
        : {
            url: url.searchParams.get("url") || "",
            includeTrace: url.searchParams.get("includeTrace") === "1",
            runChecks: url.searchParams.get("runChecks") === "1",
            waitMs: Number(url.searchParams.get("waitMs") || 1500),
            limit: Number(url.searchParams.get("limit") || 20),
            commands: []
          };
      return send(res, 200, { diagnostics: await buildDebugDiagnostics({
        url: String(payload.url || ""),
        commands: Array.isArray(payload.commands) ? payload.commands : [],
        includeTrace: Boolean(payload.includeTrace),
        runChecks: Boolean(payload.runChecks),
        waitMs: Number(payload.waitMs || 1500),
        limit: Number(payload.limit || 20)
      }) });
    }

    if ((req.method === "GET" || req.method === "POST") && url.pathname === "/api/debug-target") {
      const payload = req.method === "POST"
        ? await readJson(req)
        : {
            url: url.searchParams.get("url") || "",
            includeTrace: url.searchParams.get("includeTrace") === "1",
            runChecks: url.searchParams.get("runChecks") === "1",
            waitMs: Number(url.searchParams.get("waitMs") || 1500),
            limit: Number(url.searchParams.get("limit") || 20),
            commands: []
          };
      return send(res, 200, { debugTarget: await buildDebugTarget({
        url: String(payload.url || ""),
        commands: Array.isArray(payload.commands) ? payload.commands : [],
        includeTrace: Boolean(payload.includeTrace),
        runChecks: Boolean(payload.runChecks),
        waitMs: Number(payload.waitMs || 1500),
        limit: Number(payload.limit || 20)
      }) });
    }

    if ((req.method === "GET" || req.method === "POST") && url.pathname === "/api/merge-gate") {
      const payload = req.method === "POST"
        ? await readJson(req)
        : {
          prompt: url.searchParams.get("prompt") || "",
          limit: Number(url.searchParams.get("limit") || 20),
          deep: url.searchParams.get("deep") === "1"
        };
      return send(res, 200, { gate: await buildMergeGateStatus({
        prompt: String(payload.prompt || ""),
        deep: Boolean(payload.deep),
        limit: Number(payload.limit || 20)
      }) });
    }

    if ((req.method === "GET" || req.method === "POST") && url.pathname === "/api/policy-audit") {
      const payload = req.method === "POST"
        ? await readJson(req)
        : { limit: Number(url.searchParams.get("limit") || 20), sampleCommands: [] };
      return send(res, 200, { audit: await buildPolicyAudit({
        sampleCommands: Array.isArray(payload.sampleCommands) ? payload.sampleCommands : [],
        limit: Number(payload.limit || 20)
      }) });
    }

    if ((req.method === "GET" || req.method === "POST") && url.pathname === "/api/permission-matrix") {
      const payload = req.method === "POST"
        ? await readJson(req)
        : { limit: Number(url.searchParams.get("limit") || 20) };
      return send(res, 200, { matrix: await buildPermissionMatrix({
        limit: Number(payload.limit || 20)
      }) });
    }

    if (req.method === "GET" && url.pathname === "/api/semantic-index") {
      const cached = await readSemanticIndex();
      return send(res, 200, { index: cached || await buildSemanticIndex() });
    }

    if (req.method === "POST" && url.pathname === "/api/semantic-index") {
      return send(res, 200, { index: await buildSemanticIndex({ persist: true }) });
    }

    if ((req.method === "GET" || req.method === "POST") && url.pathname === "/api/code-intelligence") {
      const payload = req.method === "POST"
        ? await readJson(req)
        : {
            limit: Number(url.searchParams.get("limit") || 24),
            includeDiagnostics: url.searchParams.get("includeDiagnostics") !== "0"
          };
      return send(res, 200, { overview: await buildCodeIntelligenceOverview({
        limit: Number(payload.limit || 24),
        includeDiagnostics: payload.includeDiagnostics !== false
      }) });
    }

    if ((req.method === "GET" || req.method === "POST") && url.pathname === "/api/symbol-outline") {
      const payload = req.method === "POST"
        ? await readJson(req)
        : {
            query: url.searchParams.get("query") || "",
            path: url.searchParams.get("path") || "",
            limit: Number(url.searchParams.get("limit") || 120),
            includeContext: url.searchParams.get("includeContext") === "1"
          };
      return send(res, 200, await buildSymbolOutline({
        query: String(payload.query || ""),
        path: String(payload.path || ""),
        limit: Number(payload.limit || 120),
        includeContext: Boolean(payload.includeContext)
      }));
    }

    if ((req.method === "GET" || req.method === "POST") && url.pathname === "/api/semantic-definition") {
      const payload = req.method === "POST"
        ? await readJson(req)
        : {
            symbol: url.searchParams.get("symbol") || "",
            path: url.searchParams.get("path") || "",
            line: Number(url.searchParams.get("line") || 0),
            contextLines: Number(url.searchParams.get("contextLines") || 4),
            limit: Number(url.searchParams.get("limit") || 20)
          };
      return send(res, 200, await buildSemanticDefinition(String(payload.symbol || ""), {
        path: String(payload.path || ""),
        line: Number(payload.line || 0),
        contextLines: Number(payload.contextLines || 4),
        limit: Number(payload.limit || 20)
      }));
    }

    if ((req.method === "GET" || req.method === "POST") && url.pathname === "/api/semantic-symbol-impact") {
      const payload = req.method === "POST"
        ? await readJson(req)
        : {
            symbol: url.searchParams.get("symbol") || "",
            path: url.searchParams.get("path") || "",
            line: Number(url.searchParams.get("line") || 0),
            contextLines: Number(url.searchParams.get("contextLines") || 4),
            limit: Number(url.searchParams.get("limit") || 80)
          };
      return send(res, 200, await buildSemanticSymbolImpact(String(payload.symbol || ""), {
        path: String(payload.path || ""),
        line: Number(payload.line || 0),
        contextLines: Number(payload.contextLines || 4),
        limit: Number(payload.limit || 80)
      }));
    }

    if ((req.method === "GET" || req.method === "POST") && url.pathname === "/api/semantic-rename-preview") {
      const payload = req.method === "POST"
        ? await readJson(req)
        : {
            symbol: url.searchParams.get("symbol") || "",
            newName: url.searchParams.get("newName") || "",
            path: url.searchParams.get("path") || "",
            line: Number(url.searchParams.get("line") || 0),
            contextLines: Number(url.searchParams.get("contextLines") || 3),
            limit: Number(url.searchParams.get("limit") || 80)
          };
      return send(res, 200, await buildSemanticRenamePreview(String(payload.symbol || ""), String(payload.newName || ""), {
        path: String(payload.path || ""),
        line: Number(payload.line || 0),
        contextLines: Number(payload.contextLines || 3),
        limit: Number(payload.limit || 80)
      }));
    }

    if ((req.method === "GET" || req.method === "POST") && url.pathname === "/api/semantic-rename-draft") {
      const payload = req.method === "POST"
        ? await readJson(req)
        : {
            symbol: url.searchParams.get("symbol") || "",
            newName: url.searchParams.get("newName") || "",
            path: url.searchParams.get("path") || "",
            line: Number(url.searchParams.get("line") || 0),
            contextLines: Number(url.searchParams.get("contextLines") || 3),
            limit: Number(url.searchParams.get("limit") || 80),
            prompt: url.searchParams.get("prompt") || ""
          };
      return send(res, 200, await buildSemanticRenameDraft({
        symbol: String(payload.symbol || ""),
        newName: String(payload.newName || ""),
        path: String(payload.path || ""),
        line: Number(payload.line || 0),
        contextLines: Number(payload.contextLines || 3),
        limit: Number(payload.limit || 80),
        prompt: String(payload.prompt || "")
      }));
    }

    if ((req.method === "GET" || req.method === "POST") && url.pathname === "/api/semantic-search") {
      const payload = req.method === "POST"
        ? await readJson(req)
        : {
            query: url.searchParams.get("query") || "",
            kind: url.searchParams.get("kind") || "all",
            limit: Number(url.searchParams.get("limit") || 50)
          };
      return send(res, 200, await searchSemanticIndex(String(payload.query || ""), {
        kind: String(payload.kind || "all"),
        limit: Number(payload.limit || 50)
      }));
    }

    if ((req.method === "GET" || req.method === "POST") && url.pathname === "/api/semantic-references") {
      const payload = req.method === "POST"
        ? await readJson(req)
        : {
            symbol: url.searchParams.get("symbol") || "",
            limit: Number(url.searchParams.get("limit") || 80),
            contextLines: Number(url.searchParams.get("contextLines") || 6)
          };
      return send(res, 200, await buildSemanticReferences(String(payload.symbol || ""), {
        limit: Number(payload.limit || 80),
        contextLines: Number(payload.contextLines || 6)
      }));
    }

    if ((req.method === "GET" || req.method === "POST") && url.pathname === "/api/semantic-diagnostics") {
      const payload = req.method === "POST"
        ? await readJson(req)
        : {
            limit: Number(url.searchParams.get("limit") || 120),
            includeContext: url.searchParams.get("includeContext") === "1"
          };
      return send(res, 200, await buildSemanticDiagnostics({
        limit: Number(payload.limit || 120),
        includeContext: Boolean(payload.includeContext)
      }));
    }

    if ((req.method === "GET" || req.method === "POST") && url.pathname === "/api/semantic-impact") {
      const payload = req.method === "POST"
        ? await readJson(req)
        : {
            paths: url.searchParams.getAll("path"),
            limit: Number(url.searchParams.get("limit") || 80),
            includeContext: url.searchParams.get("includeContext") === "1"
          };
      return send(res, 200, await buildSemanticImpact({
        paths: Array.isArray(payload.paths) ? payload.paths : [],
        limit: Number(payload.limit || 80),
        includeContext: Boolean(payload.includeContext)
      }));
    }

    if ((req.method === "GET" || req.method === "POST") && url.pathname === "/api/dependency-graph") {
      const payload = req.method === "POST"
        ? await readJson(req)
        : {
            paths: url.searchParams.getAll("path"),
            limit: Number(url.searchParams.get("limit") || 120),
            includeExternal: url.searchParams.get("includeExternal") === "1"
          };
      return send(res, 200, await buildDependencyGraph({
        paths: Array.isArray(payload.paths) ? payload.paths : [],
        limit: Number(payload.limit || 120),
        includeExternal: Boolean(payload.includeExternal)
      }));
    }

    if (req.method === "GET" && url.pathname === "/api/capabilities") {
      return send(res, 200, await buildCapabilityAudit({ light: url.searchParams.get("deep") !== "1" }));
    }

    if (req.method === "GET" && url.pathname === "/api/tools") {
      return send(res, 200, await buildToolCatalog());
    }

    if (req.method === "GET" && url.pathname === "/api/extensions") {
      return send(res, 200, await listExtensions());
    }

    if ((req.method === "GET" || req.method === "POST") && url.pathname === "/api/extension-trust") {
      const payload = req.method === "POST"
        ? await readJson(req)
        : { limit: Number(url.searchParams.get("limit") || 40) };
      return send(res, 200, { trust: await buildExtensionTrustAudit({
        limit: Number(payload.limit || 40)
      }) });
    }

    if (req.method === "POST" && url.pathname === "/api/extension-tool-call") {
      return send(res, 200, await createExtensionToolCallApproval(await readJson(req)));
    }

    if (req.method === "GET" && url.pathname === "/api/mcp") {
      return send(res, 200, await discoverMcpServers({ probe: url.searchParams.get("probe") === "1" }));
    }

    if (req.method === "POST" && url.pathname === "/api/mcp-tool-call") {
      return send(res, 200, await createMcpToolCallApproval(await readJson(req)));
    }

    if (req.method === "POST" && url.pathname === "/api/mcp-resource") {
      return send(res, 200, await readMcpResourceContent(await readJson(req)));
    }

    if (req.method === "GET" && url.pathname === "/api/assets") {
      return send(res, 200, await buildAssetCatalog());
    }

    if (req.method === "GET" && url.pathname === "/api/asset-inspect") {
      return send(res, 200, await inspectAsset(url.searchParams.get("path") || ""));
    }

    if (req.method === "POST" && url.pathname === "/api/browser-check") {
      const { url: targetUrl = "" } = await readJson(req);
      return send(res, 200, await checkBrowserTarget(targetUrl));
    }

    if (req.method === "POST" && url.pathname === "/api/browser-audit") {
      const { url: targetUrl = "" } = await readJson(req);
      return send(res, 200, await auditBrowserTarget(targetUrl));
    }

    if (req.method === "POST" && url.pathname === "/api/browser-baseline") {
      const { url: targetUrl = "", update = false, name = "" } = await readJson(req);
      return send(res, 200, await compareBrowserBaseline(targetUrl, { update: Boolean(update), name }));
    }

    if (req.method === "POST" && url.pathname === "/api/browser-screenshot") {
      const { url: targetUrl = "", width = 1365, height = 768, selector = "" } = await readJson(req);
      return send(res, 200, await captureBrowserScreenshot(targetUrl, { width, height, selector }));
    }

    if (req.method === "POST" && url.pathname === "/api/browser-dom") {
      const { url: targetUrl = "", selectors = [] } = await readJson(req);
      return send(res, 200, await captureBrowserDom(targetUrl, { selectors }));
    }

    if (req.method === "POST" && url.pathname === "/api/browser-trace") {
      const { url: targetUrl = "", width = 1365, height = 768, waitMs = 1500, fallbackOnly = false } = await readJson(req);
      return send(res, 200, await captureBrowserTrace(targetUrl, { width, height, waitMs, fallbackOnly: Boolean(fallbackOnly) }));
    }

    if (req.method === "POST" && url.pathname === "/api/browser-interact") {
      const {
        url: targetUrl = "",
        actions = [],
        selectors = [],
        width = 1365,
        height = 768,
        fallbackOnly = false
      } = await readJson(req);
      return send(res, 200, await interactBrowserDom(targetUrl, { actions, selectors, width, height, fallbackOnly: Boolean(fallbackOnly) }));
    }

    if (req.method === "POST" && url.pathname === "/api/browser-session") {
      const {
        url: targetUrl = "",
        steps = [],
        selectors = [],
        width = 1365,
        height = 768,
        name = ""
      } = await readJson(req);
      return send(res, 200, await runBrowserSessionArtifact(targetUrl, { steps, selectors, width, height, name }));
    }

    if (req.method === "POST" && url.pathname === "/api/browser-visual") {
      const {
        url: targetUrl = "",
        update = false,
        width = 1365,
        height = 768,
        threshold = 0,
        maxMismatchRatio = 0,
        name = "",
        screenshotPath = "",
        selector = ""
      } = await readJson(req);
      return send(res, 200, await compareBrowserVisual(targetUrl, {
        update: Boolean(update),
        width,
        height,
        threshold,
        maxMismatchRatio,
        name,
        screenshotPath,
        selector
      }));
    }

    if (req.method === "GET" && url.pathname === "/api/approvals") {
      return send(res, 200, { approvals: await listApprovalRequests() });
    }

    if (req.method === "GET" && url.pathname === "/api/approval") {
      return send(res, 200, await readApprovalRequest(url.searchParams.get("id") || ""));
    }

    if (req.method === "PATCH" && url.pathname === "/api/approval") {
      const { id = "", decision = "", note = "" } = await readJson(req);
      return send(res, 200, await updateApprovalDecision(id, { decision, note }));
    }

    if (req.method === "POST" && url.pathname === "/api/approval-execute") {
      const { id = "" } = await readJson(req);
      return send(res, 200, await executeApprovedRequest(id));
    }

    if (req.method === "POST" && url.pathname === "/api/approval-escalation") {
      const { id = "", reason = "" } = await readJson(req);
      return send(res, 200, await createApprovalEscalationArtifact(id, { reason }));
    }

    if (req.method === "POST" && url.pathname === "/api/workspace") {
      const { workspace } = await readJson(req);
      return send(res, 200, await setWorkspace(workspace));
    }

    if (req.method === "POST" && url.pathname === "/api/worktree") {
      const { prompt = "" } = await readJson(req);
      return send(res, 200, await createTaskWorktree(prompt));
    }

    if (req.method === "POST" && url.pathname === "/api/queue") {
      const { prompt = "", priority = 0, retryLimit = 0, isolationGroup = "default" } = await readJson(req);
      const item = await enqueueTask(prompt, { priority, retryLimit, isolationGroup });
      await writeGoalState({
        objective: prompt,
        phase: "queued",
        status: "queued",
        lastPrompt: prompt,
        nextStep: "激活队列任务并运行代理。"
      });
      return send(res, 200, item);
    }

    if (req.method === "PATCH" && url.pathname === "/api/queue") {
      const { id = "", status = "", priority, retryLimit, isolationGroup, autoNext = false } = await readJson(req);
      const item = await updateQueuedTask(id, status, { priority, retryLimit, isolationGroup });
      const next = status === "done" && autoNext ? await activateNextQueuedTask() : null;
      await writeGoalState({
        objective: next?.prompt || item.prompt || "",
        phase: next ? "active" : status === "done" ? "completed" : item.status,
        status: next ? "active" : item.status,
        lastPrompt: next?.prompt || item.prompt || "",
        nextStep: next
          ? "已自动激活下一项队列任务。"
          : item.status === "active"
          ? "运行代理处理当前激活任务。"
          : status === "done"
            ? "任务已完成，可查看任务日志或生成交付草稿。"
            : "继续处理队列任务。"
      });
      return send(res, 200, { ...item, autoNext: next });
    }

    if (req.method === "GET" && url.pathname === "/api/queue") {
      return send(res, 200, { queue: await listQueuedTasks() });
    }

    if (req.method === "GET" && url.pathname === "/api/queue-isolation") {
      return send(res, 200, await buildQueueIsolationReport({
        limit: Number(url.searchParams.get("limit") || 100)
      }));
    }

    if (req.method === "GET" && url.pathname === "/api/processes") {
      return send(res, 200, { processes: await listManagedProcesses({ probe: true }) });
    }

    if (req.method === "GET" && url.pathname === "/api/process-startup-commands") {
      return send(res, 200, await discoverStartupCommands({
        limit: Number(url.searchParams.get("limit") || 8)
      }));
    }

    if (req.method === "GET" && url.pathname === "/api/process-health") {
      return send(res, 200, await buildManagedProcessHealth({
        id: url.searchParams.get("id") || "",
        limit: Number(url.searchParams.get("limit") || 50)
      }));
    }

    if (req.method === "GET" && url.pathname === "/api/process-search") {
      return send(res, 200, await searchManagedProcessLogs(url.searchParams.get("q") || "", {
        limit: Number(url.searchParams.get("limit") || 20)
      }));
    }

    if (req.method === "GET" && url.pathname === "/api/process-history") {
      return send(res, 200, await listManagedProcessHistory({
        limit: Number(url.searchParams.get("limit") || 20)
      }));
    }

    if (req.method === "POST" && url.pathname === "/api/processes") {
      const { command = "" } = await readJson(req);
      if (!command || typeof command !== "string") throw new Error("缺少 command。");
      return send(res, 200, await startManagedProcess(command));
    }

    if (req.method === "DELETE" && url.pathname === "/api/processes") {
      const id = url.searchParams.get("id") || "";
      return send(res, 200, await stopManagedProcess(id));
    }

    if (req.method === "GET" && url.pathname === "/api/reviews") {
      return send(res, 200, { reviews: await listReviewArtifacts() });
    }

    if (req.method === "GET" && url.pathname === "/api/review-artifact") {
      const id = url.searchParams.get("id") || "";
      return send(res, 200, await readReviewArtifact(id));
    }

    if (req.method === "POST" && url.pathname === "/api/review-comments") {
      const { id = "" } = await readJson(req);
      return send(res, 200, await buildReviewCommentDraft(id));
    }

    if (req.method === "GET" && url.pathname === "/api/files") {
      const context = await collectContext();
      const repoMap = await buildRepoMap();
      return send(res, 200, {
        files: context.files,
        contextBytes: context.contextBytes,
        contextLimitBytes: CONTEXT_LIMIT_BYTES,
        repoMap
      });
    }

    if (req.method === "GET" && url.pathname === "/api/file") {
      const relativePath = url.searchParams.get("path") || "";
      const startLine = url.searchParams.get("startLine");
      const lineCount = url.searchParams.get("lineCount");
      if (startLine || lineCount) {
        const content = await readWorkspaceFileRange(relativePath, Number(startLine || 1), Number(lineCount || 120));
        return send(res, 200, {
          path: relativePath,
          startLine: Math.max(1, Number(startLine) || 1),
          lineCount: Math.min(400, Math.max(1, Number(lineCount) || 120)),
          content,
          ranged: true
        });
      }
      const content = await readWorkspaceFile(relativePath);
      return send(res, 200, { path: relativePath, content });
    }

    if (req.method === "POST" && url.pathname === "/api/source-context") {
      const { locations = [], contextLines = 6, limit = 8 } = await readJson(req);
      const contexts = await readWorkspaceSourceLocationContexts(locations, contextLines, limit);
      return send(res, 200, {
        contexts,
        summary: {
          requested: Array.isArray(locations) ? locations.length : 0,
          returned: contexts.length,
          errors: contexts.filter((item) => item.error).length
        },
        policy: {
          access: "read-only",
          scope: "currentWorkspace",
          executesCommands: false
        }
      });
    }

    if (req.method === "POST" && url.pathname === "/api/source-context-repair-draft") {
      const {
        prompt = "",
        command = "",
        result = null,
        diagnostics = null,
        lastPrompt = "",
        debugTarget = null,
        browserTriage = null,
        locations = [],
        contextLines = 6,
        limit = 8,
        dryRun = false
      } = await readJson(req);
      if (!command || typeof command !== "string") throw new Error("缺少 command。");
      return send(res, 200, await buildSourceContextRepairDraft({
        prompt,
        command,
        result,
        diagnostics,
        lastPrompt,
        debugTarget,
        browserTriage,
        locations,
        contextLines,
        limit,
        dryRun: Boolean(dryRun)
      }));
    }

    if (req.method === "POST" && url.pathname === "/api/prompt-references") {
      const { prompt = "" } = await readJson(req);
      const files = await listPromptReferenceFiles();
      const preview = await buildPromptReferenceContext(String(prompt || ""), files);
      return send(res, 200, {
        policy: {
          access: "read-only",
          scope: "currentWorkspace",
          executesCommands: false,
          exposesApiKey: false
        },
        tokens: extractPromptReferenceTokens(prompt),
        references: preview.references,
        missing: preview.missing,
        bytes: preview.bytes,
        context: preview.context.map((item) => ({
          path: item.path,
          size: item.size,
          clipped: Boolean(item.clipped),
          contentBytes: Buffer.byteLength(String(item.content || ""), "utf8")
        }))
      });
    }

    if (req.method === "GET" && url.pathname === "/api/checkpoints") {
      return send(res, 200, { checkpoints: await listCheckpoints() });
    }

    if (req.method === "POST" && url.pathname === "/api/agent") {
      const { prompt, debugContext = null } = await readJson(req);
      if (!prompt || typeof prompt !== "string") throw new Error("缺少 prompt。");
      await writeGoalState({
        objective: prompt,
        phase: "agent_running",
        status: "running",
        lastPrompt: prompt,
        nextStep: "等待代理生成计划、diff、审查发现和建议命令。"
      });
      const result = await runAgentLoop(prompt, { debugContext });
      await persistAgentResult(prompt, result);
      return send(res, 200, attachModelEvidence(result));
    }

    if (req.method === "POST" && url.pathname === "/api/agent-stream") {
      beginSse(res);
      const startedAt = new Date().toISOString();
      try {
        const { prompt, debugContext = null } = await readJson(req);
        if (!prompt || typeof prompt !== "string") throw new Error("缺少 prompt。");
        const normalizedDebugContext = normalizeAgentDebugContext(debugContext);
        writeSse(res, "start", {
          ok: true,
          startedAt,
          policy: {
            transport: "sse",
            providerTokenStreaming: true,
            exposesApiKey: false
          }
        });
        await writeGoalState({
          objective: prompt,
          phase: "agent_running",
          status: "running",
          lastPrompt: prompt,
          nextStep: "SSE 流式代理正在生成计划、diff、审查发现和建议命令。"
        });
        writeSse(res, "goal", { status: "running", phase: "agent_running" });
        const files = await listFiles();
        const promptReferenceFiles = await listPromptReferenceFiles();
        const promptReferencePreview = await buildPromptReferenceContext(prompt, promptReferenceFiles);
        writeSse(res, "context", {
          fileCount: files.length,
          contextLimitBytes: CONTEXT_LIMIT_BYTES,
          referencedFiles: promptReferencePreview.references,
          missingReferences: promptReferencePreview.missing,
          referencedBytes: promptReferencePreview.bytes,
          debugContextAttached: Boolean(normalizedDebugContext)
        });
        let tokenCount = 0;
        const result = await runAgentLoop(prompt, {
          debugContext: normalizedDebugContext,
          onProviderToken: (token) => {
            tokenCount += 1;
            writeSse(res, "token", {
              token,
              index: tokenCount,
              redacted: false
            });
          }
        });
        await persistAgentResult(prompt, result);
        const payload = attachModelEvidence(result);
        writeSse(res, "result", payload);
        writeSse(res, "done", {
          ok: true,
          completedAt: new Date().toISOString(),
          hasDiff: Boolean(result.diff),
          toolCalls: result.toolLog?.length || 0,
          tokenEvents: tokenCount,
          providerTokenStreaming: Boolean(result.providerTokenStreaming)
        });
      } catch (error) {
        writeSse(res, "error", {
          ok: false,
          message: error instanceof Error ? error.message : String(error),
          completedAt: new Date().toISOString()
        });
      } finally {
        res.end();
      }
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/apply") {
      const { diff, prompt = "", commands = [], allowPartial = false, skipChecks = false, skipGit = false, repairContext = null, selectedHunks = [] } = await readJson(req);
      if (!diff || typeof diff !== "string") throw new Error("缺少 diff。");
      const normalizedRepairContext = normalizeRepairContext(repairContext);
      const selectedHunkSummary = normalizeSelectedHunks(selectedHunks);
      const analysis = await analyzeUnifiedDiffApplication(diff);
      if (analysis.conflicts.length && !allowPartial) {
        return send(res, 200, {
          status: "conflict",
          applied: [],
          checkpoint: null,
          verification: {
            ok: false,
            skipped: true,
            checks: [],
            reason: "diff conflict preflight blocked writes before modifying files."
          },
          conflicts: analysis.conflicts,
          analysis,
          selectedHunks: selectedHunkSummary,
          policy: {
            writesFiles: false,
            createsCheckpoint: false,
            allowPartial: false,
            skipChecks: Boolean(skipChecks),
            skipGit: Boolean(skipGit),
            supportsPartialHunks: true,
            blockedBeforeWrite: true
          }
        });
      }
      const preparedToApply = analysis.prepared.filter((item) => item.status === "applicable" || item.status === "partial");
      if (!preparedToApply.length) {
        return send(res, 200, {
          status: "conflict",
          applied: [],
          checkpoint: null,
          verification: {
            ok: false,
            skipped: true,
            checks: [],
            reason: "no applicable files after diff conflict preflight."
          },
          conflicts: analysis.conflicts,
          analysis,
          selectedHunks: selectedHunkSummary,
          policy: {
            writesFiles: false,
            createsCheckpoint: false,
            allowPartial: Boolean(allowPartial),
            skipChecks: Boolean(skipChecks),
            skipGit: Boolean(skipGit),
            supportsPartialHunks: true,
            blockedBeforeWrite: true
          }
        });
      }
      const patches = preparedToApply.map((patch) => ({ path: patch.path }));
      const checkpoint = await createCheckpoint(patches);
      const applied = [];
      for (const filePatch of preparedToApply) {
        const full = safePath(filePatch.path);
        const after = filePatch.after;
        await fs.mkdir(path.dirname(full), { recursive: true });
        await fs.writeFile(full, after, "utf8");
        applied.push({
          path: filePatch.path,
          status: filePatch.status,
          hunkCount: filePatch.hunkCount,
          applicableHunks: filePatch.applicableHunks,
          conflictHunks: filePatch.conflictHunks,
          diff: filePatch.diff
        });
      }
      const checkCommands = skipChecks ? [] : await discoverCheckCommands(commands);
      const verification = skipChecks ? {
        ok: true,
        skipped: true,
        checks: [],
        reason: "verification skipped by request."
      } : await runCheckCommands(checkCommands);
      let repair = null;
      let repairError = "";
      if (!verification.ok && !verification.skipped) {
        try {
          repair = await generateRepairDiff({
            prompt,
            applied,
            checks: verification.checks
          });
        } catch (error) {
          repairError = error instanceof Error ? error.message : String(error);
        }
      }
      const git = skipGit ? {
        available: false,
        branch: "",
        root: "",
        status: [],
        changedFiles: applied.map((item) => item.path),
        remotes: [],
        upstream: "",
        skipped: "git summary skipped by request."
      } : await getGitSummary();
      const status = verification.skipped
        ? "applied_unverified"
        : verification.ok
          ? "verified"
          : repair?.diff
            ? "repair_suggested"
            : "failed";
      const finalStatus = analysis.conflicts.length ? `partial_${status}` : status;
      const recovery = buildApplyVerificationRecovery({
        finalStatus,
        applied,
        verification,
        checkCommands,
        repair,
        repairError,
        conflicts: analysis.conflicts,
        selectedHunks: selectedHunkSummary,
        checkpoint
      });
      const taskRepairContext = normalizedRepairContext ? {
        ...normalizedRepairContext,
        status: finalStatus,
        apply: {
          status: finalStatus,
          checkpointId: checkpoint.id,
          changedFiles: applied.map((item) => item.path),
          selectedHunks: selectedHunkSummary
        },
        verification: {
          ok: verification.ok,
          skipped: verification.skipped,
          checkCount: verification.checks.length,
          failedCommands: verification.checks.filter((check) => check.exitCode !== 0).map((check) => check.command).slice(0, 8)
        }
      } : null;
      const task = await writeTaskLog({
        prompt,
        status: finalStatus,
        checkpointId: checkpoint.id,
        changedFiles: applied.map((item) => item.path),
        selectedHunks: selectedHunkSummary,
        conflicts: analysis.conflicts,
        checksOk: verification.ok && !verification.skipped,
        checks: verification.checks,
        repairDiff: repair?.diff || "",
        repairReview: repair?.review || [],
        repairContext: taskRepairContext,
        verificationRecovery: recovery,
        repairError,
        git
      });
      await writeGoalState({
        objective: prompt,
        phase: finalStatus,
        status: finalStatus,
        lastPrompt: prompt,
        lastTaskId: task.id,
        lastVerification: {
          ok: verification.ok,
          skipped: verification.skipped,
          checkCount: verification.checks.length,
          failedCount: recovery.verification.failedCount,
          recoveryStatus: recovery.status,
          nextAction: recovery.nextActions[0] || ""
        },
        pendingProposal: repair?.diff ? {
          id: `repair-${new Date().toISOString().replace(/[:.]/g, "-")}`,
          type: "repair",
          createdAt: new Date().toISOString(),
          prompt,
          reply: repair.reply || "",
          plan: repair.plan || [],
          diff: repair.diff || "",
          patches: repair.patches || [],
          commands: repair.commands || [],
          review: repair.review || []
        } : null,
        nextStep: analysis.conflicts.length
          ? "已部分应用无冲突文件或 hunk；请处理剩余冲突后再次批准。"
          : status === "verified"
          ? "生成交付草稿或继续下一项任务。"
          : status === "repair_suggested"
            ? "审查修复 diff 并再次批准写入。"
            : status === "applied_unverified"
              ? "手动运行建议命令或补充检查命令。"
              : "查看失败输出并生成修复。"
      });
      return send(res, 200, {
        status: finalStatus,
        applied,
        checkpoint,
        verification,
        repair,
        repairContext: taskRepairContext,
        recovery,
        repairError,
        git,
        task,
        conflicts: analysis.conflicts,
        selectedHunks: selectedHunkSummary,
        analysis: {
          generatedAt: analysis.generatedAt,
          summary: analysis.summary,
          files: analysis.files,
          policy: analysis.policy
        },
        policy: {
          writesFiles: true,
          createsCheckpoint: true,
          allowPartial: Boolean(allowPartial),
          skipChecks: Boolean(skipChecks),
          skipGit: Boolean(skipGit),
          supportsPartialHunks: true,
          selectedHunks: selectedHunkSummary.length,
          blockedBeforeWrite: false
        }
      });
    }

    if (req.method === "POST" && url.pathname === "/api/rollback") {
      const { checkpointId } = await readJson(req);
      if (!checkpointId) throw new Error("缺少 checkpointId。");
      return send(res, 200, await rollbackCheckpoint(checkpointId));
    }

    if (req.method === "POST" && url.pathname === "/api/command") {
      const { command } = await readJson(req);
      if (!command || typeof command !== "string") throw new Error("缺少 command。");
      return send(res, 200, await executeUserCommand(command));
    }

    if (req.method === "POST" && url.pathname === "/api/repair-command") {
      const { prompt = "", command = "", result = null, diagnostics = null } = await readJson(req);
      if (!command || typeof command !== "string") throw new Error("缺少 command。");
      return send(res, 200, await repairFromFailedCommand({ prompt, command, result, diagnostics }));
    }

    if (req.method === "GET" && url.pathname === "/api/diff") {
      return send(res, 200, await getCurrentDiff());
    }

    if (req.method === "POST" && url.pathname === "/api/diff-conflicts") {
      const { diff = "" } = await readJson(req);
      if (!diff || typeof diff !== "string") throw new Error("缺少 diff。");
      return send(res, 200, await buildDiffConflictPreview(diff));
    }

    if (req.method === "POST" && url.pathname === "/api/conflict-resolution-draft") {
      const { diff = "", resolutions = [], prompt = "" } = await readJson(req);
      return send(res, 200, await buildConflictResolutionDraft({ diff, resolutions, prompt }));
    }

    if (req.method === "POST" && url.pathname === "/api/review") {
      const { prompt = "" } = await readJson(req);
      return send(res, 200, await reviewCurrentChanges(prompt));
    }

    if (req.method === "POST" && url.pathname === "/api/handoff") {
      const { prompt = "" } = await readJson(req);
      return send(res, 200, await createHandoffDraft(prompt, { deep: url.searchParams.get("deep") === "1" }));
    }

    if (req.method === "POST" && url.pathname === "/api/pr-readiness") {
      const { prompt = "" } = await readJson(req);
      return send(res, 200, await buildPullRequestReadiness(prompt, { deep: url.searchParams.get("deep") === "1" }));
    }

    if (req.method === "GET" && url.pathname === "/api/remote-pr-status") {
      if (url.searchParams.get("deep") !== "1") {
        return send(res, 200, {
          provider: "",
          available: false,
          authenticated: false,
          reason: "默认跳过远端 CLI 探测；使用 /api/remote-pr-status?deep=1 执行远端 PR/CI 读取。",
          pr: null,
          checks: [],
          policy: { access: "remote-read-only", pushes: false, createsRemotePr: false, skipped: true }
        });
      }
      return send(res, 200, await readRemotePrStatus());
    }

    if (req.method === "POST" && url.pathname === "/api/remote-publish-plan") {
      const { prompt = "" } = await readJson(req);
      return send(res, 200, await buildRemotePublishPlan(prompt));
    }

    if (req.method === "GET" && url.pathname === "/api/remote-publish-packages") {
      return send(res, 200, await listRemotePublishPackages({
        limit: Number(url.searchParams.get("limit") || 20)
      }));
    }

    if (req.method === "GET" && url.pathname === "/api/remote-publish-package") {
      return send(res, 200, await readRemotePublishPackage(url.searchParams.get("id") || ""));
    }

    if ((req.method === "GET" || req.method === "POST") && url.pathname === "/api/remote-publish-preflight") {
      const payload = req.method === "POST"
        ? await readJson(req)
        : {
            id: url.searchParams.get("id") || "",
            limit: Number(url.searchParams.get("limit") || 20),
            deep: url.searchParams.get("deep") === "1"
          };
      return send(res, 200, { preflight: await buildRemotePublishPreflight({
        id: String(payload.id || ""),
        limit: Number(payload.limit || 20),
        deep: Boolean(payload.deep)
      }) });
    }

    if ((req.method === "GET" || req.method === "POST") && url.pathname === "/api/remote-publish-continuation") {
      const payload = req.method === "POST"
        ? await readJson(req)
        : {
            id: url.searchParams.get("id") || "",
            limit: Number(url.searchParams.get("limit") || 20),
            deep: url.searchParams.get("deep") === "1"
          };
      return send(res, 200, { continuation: await buildRemotePublishContinuation({
        id: String(payload.id || ""),
        limit: Number(payload.limit || 20),
        deep: Boolean(payload.deep)
      }) });
    }

    if ((req.method === "GET" || req.method === "POST") && url.pathname === "/api/remote-publish-evidence") {
      const payload = req.method === "POST"
        ? await readJson(req)
        : {
            id: url.searchParams.get("id") || "",
            limit: Number(url.searchParams.get("limit") || 20)
          };
      return send(res, 200, { evidence: await buildRemotePublishEvidence({
        id: String(payload.id || ""),
        evidence: payload.evidence || null,
        limit: Number(payload.limit || 20)
      }) });
    }

    if (req.method === "GET" && url.pathname === "/api/git") {
      return send(res, 200, await getGitSummary());
    }

    if (req.method === "GET" && url.pathname === "/api/tasks") {
      return send(res, 200, { tasks: await listTaskLogs() });
    }

    if (req.method === "GET" && url.pathname === "/api/task") {
      return send(res, 200, await readTaskLog(url.searchParams.get("id") || ""));
    }

    if (req.method === "GET" && url.pathname === "/api/threads") {
      const includeArchived = url.searchParams.get("includeArchived") === "1";
      return send(res, 200, {
        threads: await listThreads(Number(url.searchParams.get("limit") || 20), { includeArchived }),
        policy: { access: "workspace-thread-index", writesWorkspaceFiles: false, scopedToWorkspace: true, includeArchived }
      });
    }

    if (req.method === "GET" && url.pathname === "/api/thread") {
      return send(res, 200, await readThread(url.searchParams.get("id") || ""));
    }

    if (req.method === "POST" && url.pathname === "/api/thread") {
      const thread = await createThread(await readJson(req));
      return send(res, 200, {
        thread: {
          ...thread,
          summary: summarizeThread(thread),
          policy: { access: "workspace-thread-artifact", writesWorkspaceFiles: false, storesConversation: true, scopedToWorkspace: true }
        },
        threads: await listThreads()
      });
    }

    if (req.method === "PATCH" && url.pathname === "/api/thread") {
      const payload = await readJson(req);
      const thread = await updateThread(payload.id || "", payload);
      return send(res, 200, { thread, threads: await listThreads() });
    }

    if (req.method === "POST" && url.pathname === "/api/thread-fork") {
      const payload = await readJson(req);
      return send(res, 200, await forkThread(payload.id || "", { title: payload.title || "" }));
    }

    sendError(res, 404, "API 不存在。");
  } catch (error) {
    sendError(res, 400, error);
  }
}

function createAppServer() {
  return http.createServer((req, res) => {
  if (req.url?.startsWith("/api/")) {
    handleApi(req, res);
    return;
  }
  handleStatic(req, res);
  });
}

function listenAppServerWithRetry({
  startPort = PORT,
  retryLimit = PORT_RETRY_LIMIT,
  autoRetry = PORT_AUTO_RETRY,
  createServer = createAppServer,
  onRetry,
  onError,
  onListening
} = {}) {
  return new Promise((resolve, reject) => {
    const maxRetryPort = Math.min(65535, startPort + retryLimit);
    const tryListen = (activePort) => {
      const runtimeServer = createServer(activePort);
      let settled = false;
      runtimeServer.once("error", (error) => {
        if (settled) return;
        settled = true;
        const retryableListenError = error && (error.code === "EADDRINUSE" || error.code === "EACCES");
        if (retryableListenError) {
          const reason = error.code === "EACCES" ? "not allowed" : "already in use";
          if (autoRetry && activePort < maxRetryPort) {
            const nextPort = activePort + 1;
            onRetry?.({ activePort, nextPort, reason, error });
            setImmediate(() => tryListen(nextPort));
            return;
          }
          onError?.({ activePort, reason, error });
        }
        reject(error);
      });
      runtimeServer.listen({ port: activePort, host: "127.0.0.1", exclusive: true }, () => {
        if (settled) return;
        settled = true;
        onListening?.({ activePort, server: runtimeServer });
        activeRuntimeServer = runtimeServer;
        resolve({ port: activePort, server: runtimeServer });
      });
    };
    tryListen(startPort);
  });
}

async function runSmokeTest() {
  const context = await collectContext();
  const repoMap = await buildRepoMap();
  const git = await getGitSummary();
  assertGitSummaryIntegrity(git);
  console.log(JSON.stringify({
    ok: true,
    model: currentModelName(),
    modelRuntime,
    hasApiKey: Boolean(process.env.DEEPSEEK_API_KEY),
    ...getWorkspaceInfo(),
    fileCount: context.files.length,
    contextBytes: context.contextBytes,
    contextLimitBytes: CONTEXT_LIMIT_BYTES,
    symbolCount: repoMap.symbols.length,
    checkpoints: await listCheckpoints(),
    git,
    tasks: await listTaskLogs(),
    queue: await listQueuedTasks()
  }));
}

async function runPortConflictSmokeTest() {
  const blockedPort = 49500;
  let attempts = 0;
  const retryEvents = [];
  let runtimeServer;
  try {
    const result = await listenAppServerWithRetry({
      startPort: blockedPort,
      retryLimit: 3,
      autoRetry: true,
      createServer(activePort) {
        attempts += 1;
        if (activePort === blockedPort) {
          return {
            once(eventName, handler) {
              if (eventName === "error") this.errorHandler = handler;
              return this;
            },
            listen() {
              setImmediate(() => this.errorHandler?.(Object.assign(new Error("forced port conflict"), { code: "EADDRINUSE" })));
            }
          };
        }
        return createAppServer();
      },
      onRetry(event) {
        retryEvents.push(event);
      }
    });
    runtimeServer = result.server;
    const selectedPort = result.port;

    console.log(JSON.stringify({
      ok: true,
      portConflictSmoke: true,
      blockedPort,
      selectedPort,
      url: `http://127.0.0.1:${selectedPort}`,
      attempts,
      retries: retryEvents.length,
      autoRetried: selectedPort !== blockedPort
    }));
  } finally {
    await closeSmokeServer(runtimeServer);
  }
}

const server = {
  listen(...args) {
    const runtimeServer = createAppServer();
    activeRuntimeServer = runtimeServer;
    return runtimeServer.listen(...args);
  },
  close(callback) {
    if (!activeRuntimeServer) {
      callback?.();
      return undefined;
    }
    return activeRuntimeServer.close(callback);
  },
  address() {
    return activeRuntimeServer?.address?.() || null;
  }
};

async function requestJson(baseUrl, route, options = {}) {
  const controller = new AbortController();
  const timeoutMs = Number(options.timeoutMs) || 30000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${baseUrl}${route}`, {
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
      ...options,
      signal: options.signal || controller.signal
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(`${route} failed: ${response.status} ${data.error || ""}`);
    }
    return data;
  } catch (error) {
    const timedOut = controller.signal.aborted && !options.signal?.aborted;
    throw new Error(`${route} failed after ${timeoutMs}ms${timedOut ? " (timeout)" : ""}: ${error.message}`);
  } finally {
    clearTimeout(timer);
  }
}

async function requestSse(baseUrl, route, options = {}) {
  const controller = new AbortController();
  const timeoutMs = Number(options.timeoutMs) || 30000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${baseUrl}${route}`, {
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
      ...options,
      signal: options.signal || controller.signal
    });
    const contentType = response.headers.get("content-type") || "";
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`${route} SSE failed: ${response.status} ${text.slice(0, 500)}`);
    }
    const events = text.split(/\n\n+/)
      .map((chunk) => {
        const event = (chunk.match(/^event:\s*(.+)$/m)?.[1] || "").trim();
        const dataText = (chunk.match(/^data:\s*(.+)$/m)?.[1] || "{}").trim();
        let data = {};
        try {
          data = JSON.parse(dataText);
        } catch {
          data = { raw: dataText };
        }
        return event ? { event, data } : null;
      })
      .filter(Boolean);
    return { ok: response.ok, contentType, text, events };
  } catch (error) {
    const timedOut = controller.signal.aborted && !options.signal?.aborted;
    throw new Error(`${route} SSE failed after ${timeoutMs}ms${timedOut ? " (timeout)" : ""}: ${error.message}`);
  } finally {
    clearTimeout(timer);
  }
}

function runMcpSmokeServer() {
  let input = "";
  const write = (payload) => {
    process.stdout.write(`${JSON.stringify(payload)}\n`);
  };
  const handle = (message) => {
    if (!message || typeof message !== "object") return;
    if (message.method === "initialize") {
      write({
        jsonrpc: "2.0",
        id: message.id,
        result: {
          protocolVersion: "2024-11-05",
          serverInfo: { name: "forge-mcp-smoke", version: "0.0.0" },
          capabilities: { tools: {}, resources: {}, prompts: {} }
        }
      });
      return;
    }
    if (message.method === "tools/list") {
      write({
        jsonrpc: "2.0",
        id: message.id,
        result: {
          tools: [{
            name: "smoke_tool",
            description: "Fixture MCP tool",
            inputSchema: { type: "object", properties: { value: { type: "string" } } }
          }]
        }
      });
      return;
    }
    if (message.method === "resources/list") {
      write({
        jsonrpc: "2.0",
        id: message.id,
        result: {
          resources: [{
            uri: "forge://smoke/resource",
            name: "smoke-resource",
            description: "Fixture MCP resource",
            mimeType: "text/plain"
          }]
        }
      });
      return;
    }
    if (message.method === "resources/read") {
      write({
        jsonrpc: "2.0",
        id: message.id,
        result: {
          contents: [{
            uri: message.params?.uri || "forge://smoke/resource",
            mimeType: "text/plain",
            text: "Forge MCP smoke resource content"
          }]
        }
      });
      return;
    }
    if (message.method === "prompts/list") {
      write({
        jsonrpc: "2.0",
        id: message.id,
        result: {
          prompts: [{
            name: "smoke_prompt",
            description: "Fixture MCP prompt",
            arguments: [{ name: "topic", required: false }]
          }]
        }
      });
      return;
    }
    if (message.method === "tools/call") {
      write({
        jsonrpc: "2.0",
        id: message.id,
        result: {
          content: [{
            type: "text",
            text: `smoke:${message.params?.name || ""}:${message.params?.arguments?.value || ""}`
          }],
          isError: false
        }
      });
      return;
    }
    if (message.id !== undefined) {
      write({
        jsonrpc: "2.0",
        id: message.id,
        error: { code: -32601, message: `Unknown method: ${message.method}` }
      });
    }
  };
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => {
    input += chunk;
    while (input) {
      const frame = parseMcpContentLengthFrame(input) || parseMcpLineFrame(input);
      if (!frame) break;
      input = frame.rest;
      if (!frame.json) continue;
      try {
        handle(JSON.parse(frame.json));
      } catch {
        write({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
      }
    }
  });
  process.stdin.resume();
}

function assertSmoke(condition, message) {
  if (!condition) throw new Error(message);
}

function assertIncludes(source, needle, message) {
  assertSmoke(source.includes(needle), message || `missing ${needle}`);
}

async function closeSmokeServer(serverInstance) {
  if (!serverInstance?.listening) return;
  await new Promise((resolve) => {
    serverInstance.close(() => resolve());
  });
}

const API_SMOKE_SECTION_ALIASES = {
  all: ["core", "browser", "semantic", "model", "extensions", "mcp", "assets", "apply", "runtime", "context", "gates", "remote"],
  fast: ["core", "semantic", "model", "apply", "context", "gates"],
  coding: ["core", "semantic", "apply", "runtime", "context", "gates"],
  debug: ["core", "browser", "semantic", "runtime", "gates"],
  integrations: ["extensions", "mcp", "assets"],
  publish: ["gates", "remote"]
};

const API_SMOKE_SECTION_SET = new Set([
  "core",
  "browser",
  "semantic",
  "model",
  "extensions",
  "mcp",
  "assets",
  "apply",
  "runtime",
  "context",
  "gates",
  "remote"
]);

function getCliOption(name, fallback = "") {
  const prefix = `${name}=`;
  const inline = process.argv.find((item) => item.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(name);
  if (index >= 0 && process.argv[index + 1] && !process.argv[index + 1].startsWith("--")) return process.argv[index + 1];
  return fallback;
}

function parseApiSmokeSections(value = process.env.API_SMOKE_SECTION || process.env.API_SMOKE_SECTIONS || "") {
  const raw = String(value || "fast")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  const requested = raw.length ? raw : ["fast"];
  const sections = [];
  for (const item of requested) {
    const expanded = API_SMOKE_SECTION_ALIASES[item] || [item];
    for (const section of expanded) {
      if (!API_SMOKE_SECTION_SET.has(section)) {
        throw new Error(`Unknown API smoke section: ${section}. Available: ${[...API_SMOKE_SECTION_SET].join(", ")}. Aliases: ${Object.keys(API_SMOKE_SECTION_ALIASES).join(", ")}`);
      }
      if (!sections.includes(section)) sections.push(section);
    }
  }
  return sections;
}

async function runApiSmokeSectionTest(sectionValue = "") {
  const sections = parseApiSmokeSections(sectionValue);
  const sectionSet = new Set(sections);
  const shouldRun = (name) => sectionSet.has(name);
  const smokeStep = (name) => {
    if (process.env.API_SMOKE_PROGRESS === "1") console.error(`[api-smoke:${sections.join(",")}] ${name}`);
  };
  const originalWorkspace = currentWorkspace;
  currentWorkspace = APP_ROOT;
  const sectionServer = createAppServer();
  smokeStep("listen");
  await new Promise((resolve, reject) => {
    sectionServer.once("error", reject);
    sectionServer.listen(0, "127.0.0.1", resolve);
  });
  const address = sectionServer.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const cleanup = {
    extensionFixtureDir: "",
    mcpFixturePath: "",
    mcpOriginalFixture: null,
    applyFixtureAPath: "",
    applyFixtureBPath: "",
    processFixturePath: "",
    processId: "",
    processLogPaths: [],
    threadPath: "",
    forkThreadPath: "",
    handoffPath: "",
    remotePublishDir: "",
    remoteCiArtifactPath: ""
  };
  const checked = [];
  try {
    if (shouldRun("core")) {
      smokeStep("core");
      const health = await requestJson(baseUrl, "/api/health");
      assertSmoke(health.ok === true, "health did not return ok=true");
      assertSmoke(Array.isArray(health.queue), "health did not include queue");
      assertSmoke(Array.isArray(health.approvals), "health did not include approvals");
      assertSmoke(health.runtimeUrl?.url || health.runtimeUrl?.source === "missing", "health missing runtime URL state");
      const files = await requestJson(baseUrl, "/api/files");
      assertSmoke(Array.isArray(files.files), "files did not include file list");
      const capabilities = await requestJson(baseUrl, "/api/capabilities");
      assertSmoke(capabilities.capabilities.some((item) => item.area === "可恢复状态"), "capabilities missing resumable state");
      assertSmoke(capabilities.recommendedNext?.capability?.taskPlan?.verificationCommands?.length >= 1, "capabilities missing recommended task plan commands");
      assertSmoke(capabilities.comparison?.outstandingGaps?.every((item) => item.taskPlan?.policy?.source === "capability-task-plan"), "capabilities missing task plans on outstanding gaps");
      const tools = await requestJson(baseUrl, "/api/tools");
      assertSmoke(tools.tools.some((item) => item.name === "repo_map"), "tools missing repo_map");
      checked.push("health", "files", "capabilities", "tools");
    }

    if (shouldRun("browser")) {
      smokeStep("browser");
      const browserCheck = await requestJson(baseUrl, "/api/browser-check", {
        method: "POST",
        timeoutMs: 90000,
        body: JSON.stringify({ url: `${baseUrl}/` })
      });
      assertSmoke(browserCheck.ok === true, "browser check did not return ok=true");
      const browserAudit = await requestJson(baseUrl, "/api/browser-audit", {
        method: "POST",
        body: JSON.stringify({ url: `${baseUrl}/` })
      });
      assertSmoke(browserAudit.policy?.staticHtmlAudit === true, "browser audit missing static policy");
      const debugDiagnostics = await requestJson(baseUrl, "/api/debug-diagnostics", {
        method: "POST",
        timeoutMs: 120000,
        body: JSON.stringify({ url: `${baseUrl}/`, includeTrace: false, runChecks: false, limit: 8 })
      });
      const debugTarget = await requestJson(baseUrl, "/api/debug-target", {
        method: "POST",
        timeoutMs: 120000,
        body: JSON.stringify({
          url: `${baseUrl}/`,
          commands: ["node --check app.js"],
          includeTrace: false,
          runChecks: false,
          limit: 8
        })
      });
      assertSmoke(Array.isArray(debugDiagnostics.diagnostics?.findings), "debug diagnostics missing findings");
      assertSmoke(debugDiagnostics.diagnostics?.browserTriage?.status === "not_captured", "debug diagnostics missing not_captured browser triage");
      assertSmoke(debugTarget.debugTarget?.summary?.targetUrl === `${baseUrl}/`, "debug target missing selected URL");
      assertSmoke(debugTarget.debugTarget?.policy?.executesCommands === false, "debug target should be read-mostly by default");
      assertSmoke(debugTarget.debugTarget?.verificationCommands?.some((item) => item.command === "node --check app.js"), "debug target did not preserve custom verification command");
      assertSmoke(
        debugDiagnostics.diagnostics?.verificationPlan?.commands?.some((item) => String(item.command || "").includes("--api-smoke-section=debug")),
        "debug diagnostics verification plan missing debug smoke command"
      );
      assertSmoke(
        debugDiagnostics.diagnostics?.nextActions?.some((item) => item.id === "run-debug-smoke"),
        "debug diagnostics missing run-debug-smoke next action"
      );
      const debugNextAction = debugDiagnostics.diagnostics?.nextActions?.find((item) => item.id === "run-debug-smoke");
      assertSmoke(Number.isFinite(Number(debugNextAction?.priority)), "debug diagnostics next action missing priority");
      assertSmoke(debugNextAction?.kind === "command", "debug diagnostics next action missing kind");
      assertSmoke(Array.isArray(debugNextAction?.evidence), "debug diagnostics next action missing evidence");
      const sourceContextDraft = await requestJson(baseUrl, "/api/source-context-repair-draft", {
        method: "POST",
        timeoutMs: 120000,
        body: JSON.stringify({
          prompt: "api smoke source context repair",
          command: "node --check server.js",
          result: {
            exitCode: 1,
            output: "SyntaxError: api smoke fixture at server.js:1:1",
            failureAnalysis: { category: "syntax", summary: "api smoke source context fixture" }
          },
          diagnostics: debugDiagnostics.diagnostics,
          lastPrompt: "api smoke previous prompt @server.js",
          debugTarget: debugTarget.debugTarget,
          browserTriage: debugDiagnostics.diagnostics?.browserTriage,
          locations: [{ path: "server.js", line: 1, column: 1 }],
          contextLines: 2,
          limit: 1,
          dryRun: true
        })
      });
      assertSmoke(sourceContextDraft.policy?.source === "source-context-repair", "source context repair missing policy source");
      assertSmoke(sourceContextDraft.policy?.dryRun === true, "source context repair smoke should run in dry-run mode");
      assertSmoke(sourceContextDraft.policy?.writesFiles === false, "source context repair should not write files directly");
      assertSmoke(sourceContextDraft.policy?.debugContextAttached === true, "source context repair missing debug context policy marker");
      assertSmoke(sourceContextDraft.sourceContextSummary?.requested === 1, "source context repair missing requested source location count");
      assertSmoke(sourceContextDraft.sourceContextSummary?.returned >= 1, "source context repair did not return source context");
      assertSmoke(Array.isArray(sourceContextDraft.contexts), "source context repair missing contexts");
      assertSmoke(sourceContextDraft.sourceDebugContext?.lastPrompt?.includes("@server.js"), "source context repair missing previous prompt context");
      assertSmoke(sourceContextDraft.sourceDebugContext?.debugTarget?.summary?.targetUrl === `${baseUrl}/`, "source context repair missing debug target context");
      assertSmoke(sourceContextDraft.sourceDebugContext?.browserTriage?.status === "not_captured", "source context repair missing browser triage context");
      assertSmoke(
        sourceContextDraft.reply || sourceContextDraft.diff || sourceContextDraft.proposal || sourceContextDraft.policy,
        "source context repair did not return a usable draft payload"
      );
      checked.push("browser-check", "browser-audit", "debug-diagnostics", "source-context-repair-draft");
    }

    if (shouldRun("semantic")) {
      smokeStep("semantic");
      const semanticIndex = await requestJson(baseUrl, "/api/semantic-index", { method: "POST" });
      assertSmoke(semanticIndex.index?.indexedFiles >= 1, "semantic index missing indexed files");
      const symbolOutline = await requestJson(baseUrl, "/api/symbol-outline", {
        method: "POST",
        body: JSON.stringify({ query: "buildSemanticIndex", path: "server.js", limit: 10, includeContext: true })
      });
      assertSmoke(symbolOutline.summary?.matched >= 1, "symbol outline missing query match");
      const semanticSearch = await requestJson(baseUrl, "/api/semantic-search", {
        method: "POST",
        body: JSON.stringify({ query: "buildSemanticIndex", kind: "declaration", limit: 10 })
      });
      assertSmoke(semanticSearch.matchCount >= 1, "semantic search did not find declaration");
      const semanticDiagnostics = await requestJson(baseUrl, "/api/semantic-diagnostics", {
        method: "POST",
        body: JSON.stringify({ limit: 20, includeContext: true })
      });
      assertSmoke(Array.isArray(semanticDiagnostics.diagnostics), "semantic diagnostics missing diagnostics list");
      checked.push("semantic-index", "symbol-outline", "semantic-symbol-impact", "semantic-rename-preview", "semantic-rename-draft", "semantic-search", "semantic-diagnostics");
    }

    if (shouldRun("model")) {
      smokeStep("model");
      const modelPolicy = await requestJson(baseUrl, "/api/model-policy", {
        method: "POST",
        body: JSON.stringify({ includeRecent: true })
      });
      assertSmoke(modelPolicy.policy?.policy?.exposesApiKey === false, "model policy should not expose API key");
      const modelBudget = await requestJson(baseUrl, "/api/model-budget", {
        method: "POST",
        body: JSON.stringify({ limits: { requestLimit: 0 } })
      });
      assertSmoke(modelBudget.budget?.status === "blocked", "model budget override should block");
      const modelCost = await requestJson(baseUrl, "/api/model-cost");
      assertSmoke(typeof modelCost.cost?.estimatedCost === "number", "model cost missing numeric estimate");
      const modelBilling = await requestJson(baseUrl, "/api/model-billing", {
        method: "POST",
        body: JSON.stringify({ raw: JSON.stringify({ currency: "USD", period: "api-smoke-section", total: 0, invoices: [] }) })
      });
      assertSmoke(modelBilling.billing?.configured === true, "model billing dry-run should be configured");
      checked.push("model-policy", "model-budget", "model-cost", "model-billing");
    }

    if (shouldRun("extensions")) {
      smokeStep("extensions");
      cleanup.extensionFixtureDir = path.join(EXTENSION_DIR, "skills", "api-smoke-section-skill");
      await fs.mkdir(cleanup.extensionFixtureDir, { recursive: true });
      const signedExtensionManifest = {
        name: "api-smoke-section-skill",
        type: "skill",
        version: "0.0.0",
        description: "Focused API smoke extension fixture",
        capabilities: ["smoke-test"],
        tools: [{
          name: "smoke_probe",
          description: "Fixture tool declaration",
          mapsTo: "repo_map",
          parameters: { type: "object", properties: {} }
        }],
        policy: { access: "read-only", scope: "currentWorkspace", requiresApproval: true },
        trust: { signatureAlgorithm: "ed25519", signedBy: "api-smoke-local" }
      };
      const extensionKeyPair = crypto.generateKeyPairSync("ed25519");
      signedExtensionManifest.trust.publicKeyPem = extensionKeyPair.publicKey.export({ type: "spki", format: "pem" });
      signedExtensionManifest.trust.signature = crypto.sign(null, extensionSignaturePayload(signedExtensionManifest), extensionKeyPair.privateKey).toString("base64");
      await fs.writeFile(path.join(cleanup.extensionFixtureDir, "manifest.json"), JSON.stringify(signedExtensionManifest, null, 2));
      const extensions = await requestJson(baseUrl, "/api/extensions");
      assertSmoke(extensions.extensions.some((item) => item.name === "api-smoke-section-skill"), "extensions missing focused fixture");
      const extensionTrust = await requestJson(baseUrl, "/api/extension-trust?limit=10");
      assertSmoke(extensionTrust.trust?.summary?.signatureVerified >= 1, "extension trust missing verified signature summary");
      checked.push("extensions", "extension-trust");
    }

    if (shouldRun("mcp")) {
      smokeStep("mcp");
      cleanup.mcpFixturePath = path.join(MCP_DIR, "servers.json");
      await fs.mkdir(MCP_DIR, { recursive: true });
      const originalMcpFixture = await fs.readFile(cleanup.mcpFixturePath, "utf8").catch(() => null);
      if (originalMcpFixture !== null && !originalMcpFixture.includes('"api-smoke-section-mcp"')) {
        cleanup.mcpOriginalFixture = originalMcpFixture;
      }
      await fs.writeFile(cleanup.mcpFixturePath, JSON.stringify({
        mcpServers: {
          "api-smoke-section-mcp": {
            command: process.execPath,
            args: [path.join(APP_ROOT, "server.js"), "--mcp-smoke-server"],
            env: { API_SMOKE_MCP: "1" }
          }
        }
      }, null, 2));
      const mcp = await requestJson(baseUrl, "/api/mcp");
      assertSmoke(mcp.servers.some((item) => item.name === "api-smoke-section-mcp"), "MCP endpoint missing focused fixture");
      const mcpProbe = await requestJson(baseUrl, "/api/mcp?probe=1", { timeoutMs: 120000 });
      const probedMcp = mcpProbe.servers.find((item) => item.name === "api-smoke-section-mcp");
      assertSmoke(probedMcp?.probe?.status === "probed", "MCP probe did not complete handshake");
      checked.push("mcp", "mcp-probe");
    }

    if (shouldRun("assets")) {
      smokeStep("assets");
      const assetFixturePath = path.join(currentWorkspace, `.forge-asset-section-${Date.now()}.png`);
      cleanup.assetFixturePath = assetFixturePath;
      await fs.writeFile(assetFixturePath, createSmokePngBuffer({ r: 0, g: 128, b: 255, a: 255 }));
      const assetFixtureName = toPosix(path.relative(currentWorkspace, assetFixturePath));
      const assets = await requestJson(baseUrl, "/api/assets");
      assertSmoke(assets.policy?.access === "metadata-and-inspection", "assets endpoint missing inspection policy");
      const imageInspection = await requestJson(baseUrl, `/api/asset-inspect?path=${encodeURIComponent(assetFixtureName)}`);
      assertSmoke(imageInspection.image?.format === "png", "asset inspection did not read png header");
      checked.push("assets", "asset-inspect");
    }

    if (shouldRun("apply")) {
      smokeStep("apply");
      cleanup.applyFixtureAPath = path.join(currentWorkspace, `.forge-apply-section-a-${Date.now()}.txt`);
      cleanup.applyFixtureBPath = path.join(currentWorkspace, `.forge-apply-section-b-${Date.now()}.txt`);
      await fs.writeFile(cleanup.applyFixtureAPath, "alpha\n", "utf8");
      await fs.writeFile(cleanup.applyFixtureBPath, "bravo\n", "utf8");
      const applyFixtureAName = toPosix(path.relative(currentWorkspace, cleanup.applyFixtureAPath));
      const applyFixtureBName = toPosix(path.relative(currentWorkspace, cleanup.applyFixtureBPath));
      const conflictingDiff = [
        `diff --git a/${applyFixtureAName} b/${applyFixtureAName}`,
        `--- a/${applyFixtureAName}`,
        `+++ b/${applyFixtureAName}`,
        "@@ -1 +1 @@",
        "-alpha",
        "+alpha changed",
        `diff --git a/${applyFixtureBName} b/${applyFixtureBName}`,
        `--- a/${applyFixtureBName}`,
        `+++ b/${applyFixtureBName}`,
        "@@ -1 +1 @@",
        "-wrong",
        "+bravo changed",
        ""
      ].join("\n");
      const blockedApply = await requestJson(baseUrl, "/api/apply", {
        method: "POST",
        body: JSON.stringify({ diff: conflictingDiff, prompt: "api smoke section conflicting apply" })
      });
      assertSmoke(blockedApply.status === "conflict", "conflicting apply should be blocked before write");
      const conflictPreview = await requestJson(baseUrl, "/api/diff-conflicts", {
        method: "POST",
        body: JSON.stringify({ diff: conflictingDiff })
      });
      assertSmoke(conflictPreview.summary?.conflictHunks >= 1, "diff conflict preview missing conflict hunk count");
      const partialApply = await requestJson(baseUrl, "/api/apply", {
        method: "POST",
        body: JSON.stringify({
          diff: conflictingDiff,
          prompt: "api smoke section partial apply",
          allowPartial: true,
          skipChecks: true,
          skipGit: true,
          selectedHunks: [{ path: applyFixtureAName, selectedHunks: 1, totalHunks: 1 }]
        })
      });
      assertSmoke(partialApply.status?.startsWith("partial_"), "partial apply missing partial status");
      assertSmoke(partialApply.selectedHunks?.[0]?.path === applyFixtureAName, "partial apply missing selected hunk audit");
      assertSmoke(partialApply.policy?.selectedHunks === 1, "partial apply missing selected hunk policy count");
      assertSmoke(partialApply.recovery?.verification?.skipped === true, "partial apply missing skipped recovery summary");
      assertSmoke(partialApply.recovery?.verificationCommands?.length >= 1, "partial apply missing recovery verification commands");
      assertSmoke(partialApply.recovery?.nextActions?.some((item) => /复查|检查/.test(item)), "partial apply missing recovery next action");
      checked.push("apply", "diff-conflicts", "partial-apply");
    }

    if (shouldRun("runtime")) {
      smokeStep("runtime");
      await fs.mkdir(QUEUE_DIR, { recursive: true });
      const queueSmokeGroup = `api-smoke-section-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const queued = await requestJson(baseUrl, "/api/queue", {
        method: "POST",
        body: JSON.stringify({ prompt: "api smoke section queued task", priority: 3, retryLimit: 1, isolationGroup: queueSmokeGroup })
      });
      cleanup.queuePath = path.join(QUEUE_DIR, `${queued.id}.json`);
      assertSmoke(queued.id && queued.status === "queued", "queue create failed");
      const active = await requestJson(baseUrl, "/api/queue", {
        method: "PATCH",
        body: JSON.stringify({ id: queued.id, status: "active" })
      });
      assertSmoke(active.status === "active", "queue activate failed");
      const blockedCommand = await requestJson(baseUrl, "/api/command", {
        method: "POST",
        body: JSON.stringify({ command: "curl http://example.com" })
      });
      assertSmoke(blockedCommand.blocked === true, "command policy did not block network command");
      const processes = await requestJson(baseUrl, "/api/processes");
      assertSmoke(Array.isArray(processes.processes), "process endpoint did not include process list");
      checked.push("queue", "command-policy", "processes");
    }

    if (shouldRun("context")) {
      smokeStep("context");
      const contextSnapshot = await requestJson(baseUrl, "/api/context-snapshot", { method: "POST" });
      assertSmoke(contextSnapshot.snapshot?.workspace === APP_ROOT, "context snapshot missing workspace");
      const contextCompact = await requestJson(baseUrl, "/api/context-compact", { method: "POST" });
      assertSmoke(contextCompact.compact?.summary?.length >= 1, "context compact missing summary");
      const contextRollup = await requestJson(baseUrl, "/api/context-rollup", {
        method: "POST",
        body: JSON.stringify({ limit: 12 })
      });
      assertSmoke(Array.isArray(contextRollup.rollup?.entries), "context rollup missing entries");
      const createdThread = await requestJson(baseUrl, "/api/thread", {
        method: "POST",
        body: JSON.stringify({ title: "api smoke section thread", messages: [{ role: "agent", text: "thread smoke started" }] })
      });
      cleanup.threadPath = path.join(THREAD_DIR, `${createdThread.thread.id}.json`);
      assertSmoke(createdThread.thread?.id?.startsWith("thread-"), "thread create missing id");
      checked.push("context-snapshot", "context-compact", "context-rollup", "thread");
    }

    if (shouldRun("gates")) {
      smokeStep("gates");
      const verificationPlan = await requestJson(baseUrl, "/api/verification-plan", {
        method: "POST",
        body: JSON.stringify({ limit: 10, commands: ["node --check server.js"] })
      });
      assertSmoke(Array.isArray(verificationPlan.plan?.gates), "verification plan missing gates");
      assertSmoke(verificationPlan.plan?.gates?.some((gate) => gate.id === "typecheck"), "verification plan missing typecheck gate");
      assertSmoke(verificationPlan.plan?.typecheck && Array.isArray(verificationPlan.plan.typecheck.commands), "verification plan missing typecheck discovery");
      assertSmoke(typeof verificationPlan.plan?.summary?.typecheckCommands === "number", "verification plan missing typecheck command summary");
      assertSmoke(
        verificationPlan.plan?.commands?.some((item) => String(item.command || "").includes("--api-smoke-section=fast")),
        "verification plan missing fast API smoke command"
      );
      const ciStatus = await requestJson(baseUrl, "/api/ci-status", {
        method: "POST",
        body: JSON.stringify({ limit: 10, persist: true })
      });
      assertSmoke(Array.isArray(ciStatus.status?.localChecks), "CI status missing local checks");
      if (ciStatus.status?.artifact?.path) cleanup.remoteCiArtifactPath = path.join(APP_ROOT, ciStatus.status.artifact.path);
      const mergeGate = await requestJson(baseUrl, "/api/merge-gate", {
        method: "POST",
        body: JSON.stringify({ prompt: "api smoke section merge gate", limit: 10 })
      });
      assertSmoke(Array.isArray(mergeGate.gate?.gates), "merge gate missing gates");
      const permissionMatrix = await requestJson(baseUrl, "/api/permission-matrix", {
        method: "POST",
        body: JSON.stringify({ limit: 10 })
      });
      assertSmoke(permissionMatrix.matrix?.summary?.providers >= 3, "permission matrix missing provider summary");
      checked.push("verification-plan", "ci-status", "merge-gate", "permission-matrix");
    }

    if (shouldRun("remote")) {
      smokeStep("remote");
      const prReadiness = await requestJson(baseUrl, "/api/pr-readiness", {
        method: "POST",
        body: JSON.stringify({ prompt: "api smoke section PR readiness" })
      });
      assertSmoke(prReadiness.policy?.pushes === false, "PR readiness should not push to remote");
      const remotePublishPlan = await requestJson(baseUrl, "/api/remote-publish-plan", {
        method: "POST",
        body: JSON.stringify({ prompt: "api smoke section remote publish plan" })
      });
      cleanup.remotePublishDir = remotePublishPlan.package?.dir || "";
      assertSmoke(remotePublishPlan.approval?.id, "remote publish plan missing approval request");
      const remotePublishPreflight = await requestJson(baseUrl, "/api/remote-publish-preflight", {
        method: "POST",
        body: JSON.stringify({ id: remotePublishPlan.package.id, limit: 5 })
      });
      assertSmoke(remotePublishPreflight.preflight?.policy?.pushes === false, "remote publish preflight should not push");
      const remotePublishContinuation = await requestJson(baseUrl, "/api/remote-publish-continuation", {
        method: "POST",
        body: JSON.stringify({ id: remotePublishPlan.package.id, limit: 5 })
      });
      assertSmoke(remotePublishContinuation.continuation?.policy?.pushes === false, "remote publish continuation should not push");
      assertSmoke(remotePublishContinuation.continuation?.policy?.writesLocalArtifacts === true, "remote publish continuation missing local artifact policy");
      assertSmoke(remotePublishContinuation.continuation?.paths?.continuation?.endsWith("continuation.md"), "remote publish continuation missing continuation artifact");
      assertSmoke(remotePublishContinuation.continuation?.paths?.evidenceTemplate?.endsWith("external-evidence-template.json"), "remote publish continuation missing evidence template artifact");
      assertSmoke(Array.isArray(remotePublishContinuation.continuation?.verificationCommands), "remote publish continuation missing verification commands");
      checked.push("pr-readiness", "remote-publish-plan", "remote-publish-preflight", "remote-publish-continuation");
    }

    console.log(JSON.stringify({
      ok: true,
      apiSmoke: true,
      focused: true,
      sections,
      checked
    }));
  } finally {
    if (cleanup.processId) await stopManagedProcess(cleanup.processId).catch(() => {});
    if (cleanup.processFixturePath) await fs.rm(cleanup.processFixturePath, { force: true }).catch(() => {});
    for (const processPath of cleanup.processLogPaths || []) await fs.rm(processPath, { force: true }).catch(() => {});
    if (cleanup.extensionFixtureDir) await fs.rm(cleanup.extensionFixtureDir, { recursive: true, force: true }).catch(() => {});
    if (cleanup.mcpFixturePath && cleanup.mcpOriginalFixture !== null) {
      await fs.mkdir(path.dirname(cleanup.mcpFixturePath), { recursive: true });
      await fs.writeFile(cleanup.mcpFixturePath, cleanup.mcpOriginalFixture, "utf8").catch(() => {});
    } else if (cleanup.mcpFixturePath) {
      await fs.rm(cleanup.mcpFixturePath, { force: true }).catch(() => {});
    }
    if (cleanup.assetFixturePath) await fs.rm(cleanup.assetFixturePath, { force: true }).catch(() => {});
    if (cleanup.applyFixtureAPath) await fs.rm(cleanup.applyFixtureAPath, { force: true }).catch(() => {});
    if (cleanup.applyFixtureBPath) await fs.rm(cleanup.applyFixtureBPath, { force: true }).catch(() => {});
    if (cleanup.queuePath) await fs.rm(cleanup.queuePath, { force: true }).catch(() => {});
    if (cleanup.threadPath) await fs.rm(cleanup.threadPath, { force: true }).catch(() => {});
    if (cleanup.forkThreadPath) await fs.rm(cleanup.forkThreadPath, { force: true }).catch(() => {});
    if (cleanup.handoffPath) await fs.rm(cleanup.handoffPath, { force: true }).catch(() => {});
    if (cleanup.remotePublishDir) await fs.rm(cleanup.remotePublishDir, { recursive: true, force: true }).catch(() => {});
    if (cleanup.remoteCiArtifactPath) await fs.rm(cleanup.remoteCiArtifactPath, { force: true }).catch(() => {});
    currentWorkspace = originalWorkspace;
    await closeSmokeServer(sectionServer);
  }
}

async function runUiSmokeTest() {
  const [html, app, css, serverSource] = await Promise.all([
    fs.readFile(path.join(APP_ROOT, "index.html"), "utf8"),
    fs.readFile(path.join(APP_ROOT, "app.js"), "utf8"),
    fs.readFile(path.join(APP_ROOT, "styles.css"), "utf8"),
    fs.readFile(path.join(APP_ROOT, "server.js"), "utf8")
  ]);
  const htmlIds = [
    "promptForm",
    "manualCommandForm",
    "manualCommandInput",
    "manualCommandRunBtn",
    "manualCommandStageBtn",
    "commandHistoryList",
    "referencePreview",
    "approveBtn",
    "approvePartialBtn",
    "preApplyReviewBtn",
    "pendingDiffImpactBtn",
    "toggleAllDiffBtn",
    "copyAllDiffBtn",
    "reviewBtn",
    "prReadinessBtn",
    "mergeGateBtn",
    "debugDiagnosticsBtn",
    "debugRunChecks",
    "remotePublishPlanBtn",
    "remotePublishPackagesBtn",
    "remotePublishPreflightBtn",
    "ciStatusBtn",
    "policyAuditBtn",
    "permissionMatrixBtn",
    "modelPolicyBtn",
    "modelUsageBtn",
    "modelBudgetBtn",
    "modelCostBtn",
    "modelCostPolicyBtn",
    "modelBillingBtn",
    "contextSnapshotBtn",
    "contextCompactBtn",
    "contextRollupBtn",
    "semanticIndexBtn",
    "codeIntelligenceBtn",
    "symbolOutlineBtn",
    "semanticDiagnosticsBtn",
    "semanticImpactBtn",
    "dependencyGraphBtn",
    "threadList",
    "goalState",
    "conflictResolutionPanel",
    "capabilityList",
    "toolCatalogList",
    "extensionCatalogList",
    "extensionTrustBtn",
    "mcpProbeBtn",
    "mcpCatalogList",
    "assetCatalogList",
    "approvalList",
    "debugDiagnosticsPanel",
    "queueList",
    "queueIsolationBtn",
    "processForm",
    "processDiscoverBtn",
    "processStartDiscoveredBtn",
    "processStartDebugBtn",
    "processSearchForm",
    "processSearchInput",
    "processSearchBtn",
    "processHistoryBtn",
    "processHealthBtn",
    "processList",
    "browserCheckForm",
    "browserCheckUrlInput",
    "browserSelectorInput",
    "browserSmokeCheck",
    "browserBaselineBtn",
    "browserScreenshotBtn",
    "browserAuditBtn",
    "browserDomBtn",
    "browserTraceBtn",
    "browserInteractBtn",
    "browserSessionBtn",
    "browserVisualBtn",
    "browserCheckResult"
  ];
  for (const id of htmlIds) {
    assertIncludes(html, `id="${id}"`, `index.html missing #${id}`);
    assertIncludes(app, `#${id}`, `app.js missing #${id} binding`);
  }
  const appHooks = [
    "function renderCapabilities",
    "function renderCapabilityComparison",
    "function buildCapabilityGapListContext",
    "function appendCapabilityGapListToPrompt",
    "function runCapabilityGapListRepair",
    "function capabilityTaskPlan",
    "function capabilityExternalDependency",
    "function capabilityVerificationCommandPlan",
    "function formatCapabilityTaskPlan",
    "function appendCapabilityTaskCard",
    "function stageCapabilityTaskCommands",
    "能力补齐任务",
    "任务卡",
    "能力任务验证命令已放入面板",
    "写代码/调试覆盖",
    "本地可执行能力优先",
    "Codex 对标需求",
    "本地补齐",
    "授权清单",
    "本地能力缺口补齐",
    "外部阻塞授权清单",
    "capability-scorecard",
    "capability-gap-summary",
    "剩余差距摘要",
    "能力差距摘要",
    "准备清单",
    "预检命令",
    "function stageExternalPreparationReadinessCommands",
    "外部准备预检命令已放入面板",
    "外部缺口准备清单已加入提示词",
    "externalPreparation",
    "recommendedNext",
    "function selectCapabilityRecommendation",
    "function buildCapabilityGapContext",
    "function appendCapabilityGapToPrompt",
    "function runCapabilityGapRepair",
    "async function stageCapabilityVerificationCommands",
    "推荐下一步",
    "推荐能力差距",
    "验证命令",
    "能力补齐验证命令已放入面板",
    "能力补齐验证上下文",
    "能力差距已加入提示词",
    "已启动能力差距补齐",
    "已启动外部能力准备",
    "function renderToolCatalog",
    "function renderExtensionCatalog",
    "function renderMcpCatalog",
    "function buildCatalogEvidenceContext",
    "function appendCatalogEvidenceToPrompt",
    "function runCatalogEvidenceRepair",
    "function catalogEvidenceGuidance",
    "function catalogRepairActionLabel",
    "function catalogCallActionLabel",
    "动作语义",
    "安全边界",
    "目录修复",
    "审批示例",
    "目录证据关联 @file 引用",
    "目录证据关联调试目标",
    "目录证据关联浏览器异常分诊",
    "function buildMcpResourceEvidenceContext",
    "function appendMcpResourceEvidenceToPrompt",
    "function runMcpResourceEvidenceRepair",
    "function appendMcpResourceEvidenceCard",
    "MCP 资源证据已加入提示词",
    "已启动 MCP 资源处理",
    "MCP 资源证据关联 @file 引用",
    "MCP 资源证据关联调试目标",
    "MCP 资源证据关联浏览器异常分诊",
    "目录证据已加入提示词",
    "已启动目录证据修复",
    "function renderAssetCatalog",
    "function buildAssetEvidenceContext",
    "function appendAssetEvidenceToPrompt",
    "function runAssetEvidenceRepair",
    "function appendAssetFailureEvidence",
    "资产证据已加入提示词",
    "已启动资产证据处理",
    "资产证据关联 @file 引用",
    "资产证据关联调试目标",
    "资产证据关联浏览器异常分诊",
    "已引用资产文件",
    "function renderThreads",
    "function renderMessages",
    "function buildThreadPromptContext",
    "会话关联 @file 引用",
    "会话关联调试目标",
    "会话关联浏览器异常分诊",
    "function appendThreadContextToPrompt",
    "function runThreadContinuation",
    "function appendThreadFailureEvidence",
    "会话上下文已加入提示词",
    "已启动会话继续",
    "function startNewThread",
    "function refreshThreads",
    "function renderGoal",
    "function recommendedCapabilityFromState",
    "function formatBrowserTriageContinuation",
    "function formatDebugTargetContinuation",
    "function buildGoalContinuationPrompt",
    "目标继续关联 @file 引用",
    "lastRecoverySummary",
    "恢复摘要",
    "调试目标",
    "任务关联调试目标",
    "队列关联调试目标",
    "页面调试线索",
    "goal-recovery-summary",
    "function appendGoalContinuationToPrompt",
    "function runGoalContinuation",
    "data-goal-action",
    "data-goal-action=\"readiness\"",
    "能力缺口：本地",
    "本地预检：",
    "可恢复状态已加入提示词",
    "已启动可恢复状态继续",
    "继续目标",
    "function restorePendingProposal",
    "已恢复待审批调试现场",
    "待审批提案关联调试目标",
    "待审批提案关联浏览器异常分诊",
    "function buildQueuePromptContext",
    "队列关联 @file 引用",
    "队列关联浏览器异常分诊",
    "function appendQueueContextToPrompt",
    "function runQueueContinuation",
    "async function stageQueueVerificationCommands",
    "队列任务已加入提示词",
    "队列任务验证命令已放入面板",
    "队列任务验证上下文",
    "已启动队列任务继续",
    "队列隔离报告已读取",
    "读取队列隔离失败证据",
    "function renderApprovals",
    "function renderFiles",
    "function referenceFileInPrompt",
    "function appendFileReadFailureEvidence",
    "function renderReferencePreview",
    "function localPromptReferencePreview",
    "function formatPromptReferenceContinuation",
    "function suggestReferencePaths",
    "apply-reference-suggestion",
    "function scheduleReferencePreview",
    "function buildMissingReferenceContext",
    "function appendMissingReferencesToPrompt",
    "function runMissingReferenceRepair",
    "未命中文件引用已加入提示词",
    "已启动引用修复",
    "function renderProcesses",
    "function renderProcessSearch",
    "function buildProcessEvidenceContext",
    "function appendProcessEvidenceToPrompt",
    "function runProcessEvidenceRepair",
    "function appendProcessFailureEvidence",
    "function runProcessBrowserEvidence",
    "function processBrowserDebugVerificationCommands",
    "function appendProcessBrowserDebugRecovery",
    "function browserTraceTriage",
    "browserTriage",
    "浏览器异常分诊",
    "async function startManagedProcessCommand",
    "async function waitForManagedProcessProbe",
    "async function discoverStartupCommand",
    "启动命令已发现",
    "启动页面 URL 已识别",
    "启动页面 URL 未识别",
    "发现并启动",
    "发现并调试",
    "发现并调试完成",
    "发现并调试未找到页面 URL",
    "发现并调试失败",
    "process-discover-start-debug",
    "discover-start-debug",
    "发现并启动失败",
    "启动命令发现失败",
    "进程页面一键调试",
    "启动后页面调试恢复",
    "启动后页面复查命令",
    "启动后页面调试恢复已加入提示词",
    "异常分诊",
    "process-browser-debug",
    "进程页面检查",
    "进程页面 Trace",
    "进程证据已加入提示词",
    "已启动进程证据修复",
    "进程证据关联 @file 引用",
    "进程证据关联调试目标",
    "进程证据关联浏览器异常分诊",
    "停止进程失败",
    "读取进程输出失败",
    "function buildTaskPromptContext",
    "任务关联 @file 引用",
    "function appendTaskContextToPrompt",
    "function runTaskContinuation",
    "任务关联浏览器异常分诊",
    "async function stageTaskVerificationCommands",
    "部分应用 hunk",
    "失败命令",
    "可重跑验证命令",
    "function buildTaskVerificationPrompt",
    "function appendTaskVerificationPromptToPrompt",
    "function runTaskVerificationFix",
    "function referenceTaskFilesInPrompt",
    "function appendTaskFailureEvidence",
    "任务证据已加入提示词",
    "历史任务验证命令已放入面板",
    "历史任务验证上下文",
    "任务验证提示已加入提示词",
    "已启动任务验证修复",
    "已启动任务证据继续",
    "已引用任务文件",
    "function buildApprovalPromptContext",
    "审批关联 @file 引用",
    "审批关联调试目标",
    "审批关联浏览器异常分诊",
    "function appendApprovalContextToPrompt",
    "function runApprovalSafeAlternative",
    "function approvalVerificationCommands",
    "function stageApprovalVerificationCommands",
    "function buildApprovalBlockerPrompt",
    "function appendApprovalBlockerPromptToPrompt",
    "function runApprovalBlockerFix",
    "function appendApprovalEscalationEvidence",
    "function createApprovalEscalationEvidence",
    "function appendApprovalPlanCard",
    "function appendApprovalExecutionCard",
    "审批验证命令已放入面板",
    "审批阻塞提示已加入提示词",
    "已启动审批阻塞修复",
    "升级证据",
    "审批升级证据包",
    "function buildActionFailureContext",
    "动作失败关联 @file 引用",
    "动作失败关联调试目标",
    "动作失败关联浏览器异常分诊",
    "function actionFailureVerificationCommands",
    "function stageActionFailureVerificationCommands",
    "function appendActionFailureEvidence",
    "动作失败证据已加入提示词",
    "动作失败验证命令已放入面板",
    "已启动动作失败诊断修复",
    "刷新工作台失败证据",
    "任务入队失败证据",
    "审批上下文已加入提示词",
    "已启动审批安全替代",
    "直接替代",
    "/api/agent-stream",
    "/api/prompt-references",
    "/api/model-policy",
    "/api/model-usage",
    "/api/model-budget",
    "/api/model-cost",
    "/api/model-cost-policy",
    "/api/model-billing",
    "function buildModelEvidencePrompt",
    "function modelEvidenceVerificationCommands",
    "function stageModelEvidenceVerificationCommands",
    "function agentFailureVerificationCommands",
    "function stageAgentFailureVerificationCommands",
    "function appendModelEvidenceCard",
    "function runModelEvidenceRepair",
    "function buildModelVerificationPrompt",
    "function appendModelVerificationPromptToPrompt",
    "function runModelVerificationFix",
    "function buildModelFailureEvidence",
    "模型证据关联 @file 引用",
    "模型证据关联调试目标",
    "模型证据关联浏览器异常分诊",
    "function appendModelFailureEvidence",
    "function buildAgentFailureContext",
    "代理失败关联 @file 引用",
    "代理失败关联调试目标",
    "代理失败关联浏览器异常分诊",
    "function appendAgentFailureEvidence",
    "模型证据已加入提示词",
    "验证命令已放入面板",
    "已启动模型证据优化",
    "模型验证提示已加入提示词",
    "已启动模型验证修复",
    "代理失败证据已加入提示词",
    "代理失败相关文件已引用",
    "代理失败验证命令已放入面板",
    "代理失败验证提示已加入提示词",
    "已启动代理失败验证修复",
    "调试诊断相关文件",
    "已启动代理失败诊断修复",
    "function buildApplyFailureContext",
    "写入失败关联 @file 引用",
    "写入失败关联调试目标",
    "写入失败关联浏览器异常分诊",
    "function appendApplyFailureEvidence",
    "function buildApplyVerificationRecoveryContext",
    "function appendApplyVerificationRecovery",
    "写入后验证恢复",
    "写入后复查命令",
    "写入后验证恢复证据已加入提示词",
    "写入失败证据已加入提示词",
    "已启动写入失败诊断修复",
    "function buildWorkspaceSafetyFailureContext",
    "工作区安全失败关联 @file 引用",
    "工作区安全失败关联调试目标",
    "工作区安全失败关联浏览器异常分诊",
    "function workspaceSafetyVerificationCommands",
    "function stageWorkspaceSafetyVerificationCommands",
    "function appendWorkspaceSafetyFailureEvidence",
    "工作区安全失败证据已加入提示词",
    "工作区安全验证命令已放入面板",
    "已启动工作区安全失败诊断修复",
    "/api/context-snapshot",
    "/api/context-compact",
    "/api/context-rollup",
    "function buildContextEvidencePrompt",
    "function contextEvidenceVerificationCommands",
    "function stageContextEvidenceVerificationCommands",
    "function appendContextEvidenceCard",
    "function appendContextFailureEvidence",
    "上下文证据关联 @file 引用",
    "上下文证据关联调试目标",
    "上下文证据关联浏览器异常分诊",
    "上下文摘要已加入提示词",
    "上下文压缩已加入提示词",
    "上下文滚动摘要已加入提示词",
    "上下文摘要验证命令已放入面板",
    "已启动上下文继续",
    "/api/verification-plan",
    "/api/ci-status",
    "/api/debug-diagnostics",
    "/api/merge-gate",
    "/api/policy-audit",
    "/api/permission-matrix",
    "/api/diff-conflicts",
    "/api/conflict-resolution-draft",
    "/api/semantic-index",
    "/api/code-intelligence",
    "/api/symbol-outline",
    "/api/semantic-definition",
    "/api/semantic-symbol-impact",
    "/api/semantic-rename-preview",
    "/api/semantic-rename-draft",
    "/api/semantic-search",
    "/api/semantic-references",
    "/api/semantic-diagnostics",
    "/api/semantic-impact",
    "/api/dependency-graph",
    "/api/pr-readiness",
    "/api/remote-pr-status",
    "/api/remote-publish-plan",
    "/api/remote-publish-packages",
      "/api/remote-publish-package",
      "/api/remote-publish-preflight",
      "/api/remote-publish-continuation",
      "/api/remote-publish-evidence",
      "function buildBrowserEvidenceContext",
    "function browserEvidenceVerificationCommands",
    "function stageBrowserEvidenceVerificationCommands",
    "browserTrace",
    "browserCheck",
    "function appendBrowserEvidenceToPrompt",
    "function runBrowserEvidenceRepair",
    "function browserSourceLocations",
    "function fetchBrowserSourceContexts",
    "function browserSourceVerificationCommands",
    "function buildBrowserSourceContextPrompt",
    "function appendBrowserSourcePromptToPrompt",
    "function runBrowserSourceContextRepair",
    "function buildBrowserVerificationPrompt",
    "function appendBrowserVerificationPromptToPrompt",
    "function runBrowserVerificationFix",
    "function runBrowserEvidenceFollowup",
    "browser-followup-trace-failure",
    "function referenceBrowserEvidenceFilesInPrompt",
    "function appendBrowserFailureEvidence",
    "浏览器证据已加入提示词",
    "已启动浏览器证据修复",
    "浏览器证据关联 @file 引用",
    "浏览器证据关联调试目标",
    "浏览器证据关联浏览器异常分诊",
    "浏览器源码修复提示已加入",
    "浏览器源码修复草稿已生成",
    "浏览器源码修复验证命令已放入命令面板",
    "data-action=\"source-prompt\"",
    "data-action=\"source-fix\"",
    "data-debug-action=\"browser-source-prompt\"",
    "data-debug-action=\"browser-source-fix\"",
    "浏览器证据验证提示已加入提示词",
    "已启动浏览器证据验证修复",
    "复查命令已放入命令面板",
    "已引用浏览器证据文件",
    "function renderBrowserCheck",
    "function renderBrowserBaseline",
    "function renderBrowserScreenshot",
    "function renderBrowserAudit",
    "function renderBrowserDom",
    "function renderBrowserTrace",
    "function renderBrowserInteract",
    "function renderBrowserSession",
    "function renderBrowserVisual",
    "function buildSemanticEvidenceContext",
    "function appendSemanticEvidenceToPrompt",
    "function referenceSemanticEvidenceFilesInPrompt",
    "function runSemanticEvidenceRepair",
    "function semanticEvidenceVerificationCommands",
    "function stageSemanticEvidenceVerificationCommands",
    "function buildSemanticSymbolImpactPrompt",
    "function stageSemanticSymbolImpactCommands",
    "function runSemanticSymbolImpactFix",
    "function semanticRenamePreviewEvidence",
    "function buildSemanticRenamePreviewPrompt",
    "function stageSemanticRenamePreviewCommands",
    "function runSemanticRenamePreviewFix",
    "async function createSemanticRenameDraft",
    "function buildSemanticVerificationPrompt",
    "语义证据关联 @file 引用",
    "语义证据关联调试目标",
    "语义证据关联浏览器异常分诊",
    "function appendSemanticVerificationPromptToPrompt",
    "function runSemanticVerificationFix",
    "function appendSemanticFailureEvidence",
    "语义证据已加入提示词",
    "已启动语义证据修复",
    "语义证据验证命令已放入面板",
    "符号影响验证命令已放入面板",
    "符号影响修复证据链已创建",
    "符号影响修复提示已加入提示词",
    "已启动符号影响修复",
    "重命名预览验证命令已放入面板",
    "重命名预览修复证据链已创建",
    "重命名预览提示已加入提示词",
    "已启动重命名预览修复",
    "重命名 diff 草稿已生成",
    "重命名草稿已加入修复证据链",
    "语义诊断验证提示已加入提示词",
    "已启动语义诊断验证修复",
    "已引用语义证据文件",
    "function buildGateEvidenceContext",
    "function appendGateEvidenceToPrompt",
    "function buildGateVerificationPrompt",
    "function gateEvidenceBlockerSummary",
    "function buildGateBlockerPrompt",
    "function appendGateBlockerPromptToPrompt",
    "门禁关联 @file 引用",
    "门禁关联调试目标",
    "门禁关联浏览器异常分诊",
    "function gateEvidenceVerificationCommands",
    "function stageGateEvidenceVerificationCommands",
    "function appendGateVerificationPromptToPrompt",
    "function runGateVerificationFix",
    "function stageGateEvidenceCommands",
    "function runGateEvidenceRepair",
    "function gateEvidenceArtifactFiles",
    "function referenceGateEvidenceFilesInPrompt",
    "function buildGateFailureEvidence",
    "function appendGateFailureEvidence",
    "门禁证据已加入提示词",
    "门禁验证提示已加入提示词",
    "已启动门禁验证修复",
    "已启动门禁证据修复",
    "已引用门禁证据文件",
    "门禁阻塞提示已加入提示词",
    "blocker-prompt",
    "阻塞提示",
    "门禁检查命令已放入面板",
    "门禁请求失败验证命令已放入面板",
    "调试验证计划运行失败证据",
    "远端发布审批计划已生成",
    "远端发布包索引已读取",
      "远端发布预检已生成",
      "远端发布继续包已生成",
      "function appendRemotePublishContinuationCard",
      "function appendRemotePublishEvidenceCard",
      "外部发布证据已回填",
      "data-action=\"release-evidence\"",
      "发布回填提示",
    "function renderDebugDiagnostics",
    "lastDebugDiagnostics",
    "function pruneDebugDiagnosticsForStorage",
    "已恢复最近调试诊断",
    "function renderLastFailedCommandCard",
    "function splitPatchHunks",
    "function collectSelectedDiff",
    "data-diff-hunk-index",
    "select-file-hunks",
    "clear-file-hunks",
    "function restoreCommandDebugState",
    "function saveCommandDebugState",
    "commandDebugRestoredScope",
    "已恢复最近失败命令",
    "function createRepairEvidenceChain",
    "function updateRepairEvidenceChain",
    "修复证据链已创建",
    "recommendedAction",
    "commandRun",
    "推荐动作已加入恢复证据链",
    "推荐动作通过并已沉淀恢复证据",
    "推荐动作失败已沉淀恢复证据",
    "修复验证证据链",
    "repairContext",
    "function failedCommandItems",
    "function failedCommandSourceContextItems",
    "async function appendFailedCommandSourceContexts",
    "async function runFailedCommandSourceContextRepair",
    "prompt-failed-source-contexts",
    "run-failed-source-context-fix",
    "失败源码上下文已加入提示词",
    "失败源码上下文汇总",
    "批量失败源码上下文读取失败",
    "批量源码修复草稿已生成",
    "批量源码修复验证命令已放入命令面板",
    "批量源码修复启动失败",
    "function buildAgentDebugContext",
    "function buildDebugFixPrompt",
    "浏览器异常分诊修复上下文",
    "页面复查要求",
    "分诊建议验证命令",
    "debugContext.referencedFiles",
    "debugContext.browserTriage",
    "function buildReviewFixPrompt",
    "function buildReviewArtifactPromptContext",
    "审查关联 @file 引用",
    "审查关联调试目标",
    "function appendReviewArtifactContextToPrompt",
    "function runReviewArtifactRepair",
    "function buildReviewArtifactVerificationPrompt",
    "审查关联浏览器异常分诊",
    "function appendReviewArtifactVerificationPromptToPrompt",
    "function runReviewArtifactVerificationFix",
    "function reviewArtifactVerificationCommands",
    "function stageReviewArtifactVerificationCommands",
    "function appendReviewArtifactFailureEvidence",
    "审查验证命令已放入面板",
    "审查失败证据",
    "function buildReviewCommentsContext",
    "PR 评论关联 @file 引用",
    "PR 评论关联调试目标",
    "function appendReviewCommentsToPrompt",
    "function runReviewCommentsRepair",
    "function buildReviewCommentsVerificationPrompt",
    "PR 评论关联浏览器异常分诊",
    "function appendReviewCommentsVerificationPromptToPrompt",
    "function runReviewCommentsVerificationFix",
    "function reviewCommentsVerificationCommands",
    "function stageReviewCommentsVerificationCommands",
    "function appendReviewCommentsCard",
    "审查证据已加入提示词",
    "已启动历史审查修复",
    "审查验证提示已加入提示词",
    "已启动审查验证修复",
    "PR 评论草稿已加入提示词",
    "PR 评论验证命令已放入面板",
    "已启动 PR 评论修复",
    "PR 评论验证提示已加入提示词",
    "已启动 PR 评论验证修复",
    "function submitPromptForm",
    "function shouldSubmitPromptFromKey",
    "function handlePromptInputKeydown",
    "function resizePromptInput",
    "thread-rename-form",
    "function renderThreads",
    "function buildDebugBundle",
    "function debugEvidenceReferencedFiles",
    "function referenceDebugEvidenceFilesInPrompt",
    "已引用调试诊断文件",
    "function buildDebugPromptContext",
    "浏览器分诊摘要",
    "分诊下一步",
    "function appendDebugContextToPrompt",
    "function buildCommandTranscript",
    "function formatCommandRecoveryChain",
    "function formatCommandSourceLocations",
    "function commandSourceLocations",
    "function fetchCommandSourceContexts",
    "function buildCommandSourceContextPrompt",
    "function commandSourceVerificationCommands",
    "function runCommandSourceContextFix",
    "命令源码关联 @file 引用",
    "命令源码关联调试目标",
    "命令源码关联浏览器异常分诊",
    "data-action=\"source-context\"",
    "data-action=\"source-context-prompt\"",
    "data-action=\"source-context-fix\"",
    "命令行源码定位",
    "命令行源码修复提示已加入",
    "命令行源码修复提示生成失败",
    "/api/source-context-repair-draft",
    "source_context_repair",
    "源码定位修复草稿已生成",
    "源码定位修复草稿已加入证据链",
    "sourceLocations",
    "/api/source-context",
    "function appendCommandTranscriptToPrompt",
    "function buildCommandVerificationPrompt",
    "function appendCommandVerificationPromptToPrompt",
    "function runCommandVerificationFix",
    "function runLastFailedCommandVerificationFix",
    "命令记录关联 @file 引用",
    "命令记录关联调试目标",
    "命令记录关联浏览器异常分诊",
    "失败命令关联 @file 引用",
    "失败命令关联调试目标",
    "失败命令关联浏览器异常分诊",
    "失败命令修复草稿已生成",
    "failed_command_repair",
    "proposalId",
    "function extractReferencedFilesFromCommandRun",
    "function referenceCommandFilesInPrompt",
    "function appendCommandReferencedFilesEvidence",
    "data-last-failed-action=\"reference-files\"",
    "data-last-failed-action=\"source-context\"",
    "data-last-failed-action=\"source-context-prompt\"",
    "data-last-failed-action=\"source-context-fix\"",
    "data-last-failed-action=\"stage-recovery\"",
    "data-last-failed-action=\"run-recovery\"",
    "data-last-failed-meta=\"recovery-chain\"",
    "失败恢复链",
    "可重跑验证命令",
    "可恢复状态验证命令已放入面板",
    "function appendDebugEvidence",
    "function stageDebugActionCommand",
    "function stageDebugActionCommands",
    "async function runRecommendedDebugAction",
    "function stageManualCommand",
    "function renderCommandHistory",
    "function handleManualCommandInputKeydown",
    "function applyManualCommandHistoryNavigation",
    "function rememberCommand",
    "function updateCommandHistoryItem",
    "function clearUnpinnedCommandHistory",
    "function stageRepairVerificationCommands",
    "function smokeSectionCommandItems",
    "async function runSmokeSectionCommands",
    "手动验证命令已加入面板",
    "最近命令已填入",
    "最近命令已固定",
    "最近命令已清理",
    "修复后验证命令已放入命令面板",
    "失败命令修复验证命令已放入命令面板",
    "快捷检查命令已发现",
    "快捷检查命令",
    "已加入下一步验证命令",
    "调试建议命令已批量放入面板",
    "data-debug-action=\"stage-actions\"",
    "排队建议",
    "已复制下一步验证命令",
    "function verificationPlanCommands",
    "async function runVerificationPlanCommands",
    "function normalizeCommandItems",
    "function buildCommandBatchPromptContext",
    "function appendCommandBatchEvidenceToPrompt",
    "function buildCommandBatchVerificationPrompt",
    "function appendCommandBatchVerificationPromptToPrompt",
    "批量命令关联 @file 引用",
    "批量命令关联调试目标",
    "批量命令关联浏览器异常分诊",
    "失败源码关联 @file 引用",
    "失败源码关联调试目标",
    "失败源码关联浏览器异常分诊",
    "function commandBatchReferencedFiles",
    "function recordRepairVerificationFromBatch",
    "function referenceCommandBatchFilesInPrompt",
    "function commandBatchNeedsRepair",
    "function runCommandBatchEvidenceRepair",
    "失败命令调试摘要",
    "最近浏览器异常分诊",
    "function renderCommandToolbar",
    "async function runCommandBatch",
    "function summarizeDiffPatch",
    "function summarizeDiffPatches",
    "function setAllDiffFilesCollapsed",
    "自动检查结果",
    "function combinedPendingDiff",
    "async function runSuggestedCommand",
    "function updateCommandRunState",
    "function renderCommandRowStatus",
    "async function copyText",
    "function copyFailureSummary",
    "function copyLogBody",
    "lastCopyStatus",
    "copy-command",
    "copy-output",
    "prompt-command",
    "reference-command-files",
    "prompt-bundle",
    "run-recommended",
    "运行推荐动作",
    "开始运行推荐动作",
    "priority",
    "kind",
    "target",
    "debug-action-meta",
    "data-debug-action=\"target-detail\"",
    "data-debug-action=\"target-prompt\"",
    "data-debug-action=\"target-check\"",
    "data-debug-action=\"target-trace\"",
    "data-debug-action=\"target-debug\"",
    "当前调试目标",
    "fix-last-failed",
    "修复失败命令",
    "暂无失败命令可修复",
    "reference-batch-files",
    "prompt-batch-evidence",
    "batch-verification-prompt",
    "批量命令验证提示已加入提示词",
    "run-batch-evidence",
    "copy-all-commands",
    "run-fast-smoke",
    "run-debug-smoke",
    "快速 smoke",
    "调试 smoke",
    "run-all-commands",
    "rerun-failed-commands",
    "重跑失败",
    "没有失败命令可重跑",
    "已复制命令",
    "已复制命令输出",
    "已复制全部命令",
    "已引用批量命令文件",
    "批量命令证据已加入提示词",
    "已启动批量命令证据修复",
    "优先读取相关文件",
    "批量命令无需修复",
    "批量命令摘要",
    "最近失败命令已复制",
    "最近失败命令输出已复制",
    "命令记录已加入提示词",
    "失败命令验证提示已加入提示词",
    "已启动失败命令验证修复",
    "verification-prompt",
    "verification-fix",
    "已引用命令输出文件",
    "失败命令相关文件已识别",
    "诊断上下文已加入提示词",
    "生成修复提示",
    "运行验证计划",
    "开始运行验证计划",
    "验证计划命令全部通过",
    "自动检查失败，已生成修复候选",
    "修复 diff、计划和建议命令已放入预览区",
    "已生成审查修复提示",
    "已启动审查修复",
    "最近失败命令",
    "data-last-failed-meta=\"category\"",
    "data-last-failed-meta=\"next-action\"",
    "已启动最近失败命令修复",
    "已生成带诊断的修复提示",
    "直接修复",
    "已生成并启动诊断修复",
    "已复制全部 diff",
    "function pendingDiffImpactPaths",
    "async function analyzePendingDiffImpact",
    "async function runPreApplyReview",
    "function ensurePreApplyReviewBeforeApply",
    "批准写入前自动预审查",
    "预应用审查清单已生成",
    "批准前自动预审查清单已生成",
    "lastPreApplyReviewKey",
    "pre-apply-review",
    "待审批 diff 影响面已生成",
    "当前没有待审批 diff",
    "pending-diff-impact",
    "copy-file-diff",
    "toggle-file-diff",
    "reference-file-from-diff",
    "已引用 diff 文件",
    "read-file-from-diff",
    "读取 diff 原文件",
    "toggleAllDiffBtn",
    "引用文件：",
    "function collectConflictResolutionsFromPanel",
    "function buildConflictResolutionContext",
    "冲突修复关联 @file 引用",
    "冲突关联调试目标",
    "冲突关联浏览器异常分诊",
    "function appendConflictResolutionToPrompt",
    "function runConflictResolutionRepair",
    "冲突证据已加入提示词",
    "已启动冲突修复",
    "function renderConflictResolution",
    "function createConflictResolutionDraftFromPanel",
    "function buildHandoffPromptContext",
    "交付关联 @file 引用",
    "交付关联调试目标",
    "交付关联浏览器异常分诊",
    "function handoffVerificationCommands",
    "function stageHandoffVerificationCommands",
    "function buildHandoffVerificationPrompt",
    "function appendHandoffVerificationPromptToPrompt",
    "function appendHandoffEvidenceCard",
    "交付草稿已加入提示词",
    "交付草稿验证命令已放入面板",
    "交付草稿验证提示已加入提示词",
    "已启动交付草稿继续",
    "/api/health",
    "/api/threads",
    "/api/thread?id=",
    "/api/thread",
    "/api/thread-fork",
    "/api/tools",
    "/api/extensions",
    "/api/extension-trust",
    "扩展 Trust 审计已生成",
    "/api/extension-tool-call",
    "/api/mcp",
    "/api/mcp?probe=1",
    "/api/mcp-tool-call",
    "/api/mcp-resource",
    "/api/assets",
    "/api/asset-inspect",
    "/api/browser-check",
    "/api/browser-audit",
    "/api/browser-baseline",
    "/api/browser-screenshot",
    "/api/browser-dom",
    "/api/browser-trace",
    "/api/browser-interact",
    "/api/browser-session",
    "/api/browser-visual",
    "/api/approval?id=",
    "/api/approval",
    "/api/approval-execute",
    "/api/approval-escalation",
    "/api/review-comments",
    "/api/queue-isolation",
    "/api/processes",
    "/api/process-startup-commands",
    "/api/process-health",
    "/api/process-search",
    "/api/process-history",
    "/api/debug-target",
    "/api/runtime-url",
    "runtime_url",
    "debug_target"
  ];
  for (const hook of appHooks) {
    assertIncludes(app, hook, `app.js missing ${hook}`);
  }
  const cssClasses = [
    ".capability-list",
    ".capability-summary",
    ".capability-scorecard",
    ".capability-score-actions",
    ".capability-requirement",
    ".capability-recommendation",
    ".capability-actions",
    ".capability-row",
    ".goal-state",
    ".goal-actions",
    ".goal-recovery-summary",
    ".file-row [data-action=\"reference\"]",
    ".reference-preview",
    "#toggleAllDiffBtn",
    "#copyAllDiffBtn",
    ".diff-file-stats",
    ".diff-hunk-selector",
    ".diff-hunk-choice",
    ".diff-file.collapsed",
    ".debug-diagnostics",
    ".debug-diagnostics-controls",
    ".debug-target-card",
    ".debug-last-failed-command",
    ".debug-last-failed-analysis",
    ".debug-last-failed-actions",
    ".debug-evidence-list",
    ".debug-finding",
    ".review-actions",
    ".command-list-toolbar",
    ".manual-command-form",
    ".command-history-toolbar",
    ".command-history-row",
    ".command-history-row.pinned",
    ".command-row button",
    ".check-row.running",
    ".process-form",
    ".task-row-actions",
    ".approval-row-actions",
    ".queue-row-actions",
    ".queue-row"
  ];
  for (const className of cssClasses) {
    assertIncludes(css, className, `styles.css missing ${className}`);
  }
  const serverHooks = [
    "function extractPromptReferenceTokens",
    "function extractPromptFileReferences",
    "function suggestPromptReferencePaths",
    "async function buildPromptReferenceContext",
    "function summarizePromptReferences",
    "function normalizeAgentDebugContext",
    "async function buildDebugReferencedFileContext",
    "用户显式引用文件上下文",
    "上一轮调试诊断相关文件上下文",
    "上一轮调试诊断上下文",
    "missingReferences",
    "debugContextAttached",
    "sourceDebugContext",
    "policy.debugContextAttached",
    "/api/prompt-references",
    "if (req.method === \"POST\" && url.pathname === \"/api/source-context-repair-draft\")",
    "function buildSourceContextRepairDraft",
    "function isExternalCapabilityDependency",
    "未命中的 @file 引用",
    "referencedFiles",
    "promptReferences"
  ];
  for (const hook of serverHooks) {
    assertIncludes(serverSource, hook, `server.js missing ${hook}`);
  }
  console.log(JSON.stringify({
    ok: true,
    uiSmoke: true,
    checked: {
      htmlIds,
      appHooks,
      cssClasses,
      serverHooks
    }
  }));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function snapshotApprovalDir() {
  const entries = await fs.readdir(APPROVAL_DIR, { withFileTypes: true }).catch(() => null);
  if (!entries) return null;
  const files = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const content = await fs.readFile(path.join(APPROVAL_DIR, entry.name), "utf8").catch(() => null);
    if (content !== null) files.push({ name: entry.name, content });
  }
  return files;
}

async function restoreApprovalDir(snapshot) {
  await fs.rm(APPROVAL_DIR, { recursive: true, force: true }).catch(() => {});
  if (snapshot === null) return;
  await fs.mkdir(APPROVAL_DIR, { recursive: true });
  for (const file of snapshot) {
    await fs.writeFile(path.join(APPROVAL_DIR, file.name), file.content, "utf8");
  }
}

function createZipBuffer(files) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  for (const file of files) {
    const name = Buffer.from(file.name, "utf8");
    const content = Buffer.isBuffer(file.content) ? file.content : Buffer.from(String(file.content || ""), "utf8");
    const crc = 0;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt32LE(0, 10);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(content.length, 18);
    local.writeUInt32LE(content.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, name, content);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt32LE(0, 12);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(content.length, 20);
    central.writeUInt32LE(content.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, name);
    offset += local.length + name.length + content.length;
  }
  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...localParts, centralDirectory, end]);
}

function createSmokePngBuffer({ r = 255, g = 0, b = 0, a = 255 } = {}) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(1, 0);
  ihdrData.writeUInt32BE(1, 4);
  ihdrData[8] = 8;
  ihdrData[9] = 6;
  ihdrData[10] = 0;
  ihdrData[11] = 0;
  ihdrData[12] = 0;
  const idatData = zlib.deflateSync(Buffer.from([0, r, g, b, a]));
  const chunk = (type, data) => {
    const header = Buffer.alloc(8);
    header.writeUInt32BE(data.length, 0);
    header.write(type, 4, 4, "ascii");
    const crc = Buffer.alloc(4);
    return Buffer.concat([header, data, crc]);
  };
  return Buffer.concat([
    signature,
    chunk("IHDR", ihdrData),
    chunk("IDAT", idatData),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

function createSmokeParquetBuffer() {
  const body = Buffer.from("forge parquet smoke row data", "utf8");
  const footer = Buffer.from("schema: forge_parquet_smoke\nrow_group: 1\ncreated_by: forge-smoke", "utf8");
  const footerLength = Buffer.alloc(4);
  footerLength.writeUInt32LE(footer.length, 0);
  return Buffer.concat([
    Buffer.from("PAR1", "ascii"),
    body,
    footer,
    footerLength,
    Buffer.from("PAR1", "ascii")
  ]);
}

function createSmokeWavBuffer() {
  const sampleRate = 8000;
  const channels = 1;
  const bitsPerSample = 8;
  const data = Buffer.alloc(800, 128);
  const byteRate = sampleRate * channels * (bitsPerSample / 8);
  const blockAlign = channels * (bitsPerSample / 8);
  const buffer = Buffer.alloc(44 + data.length);
  buffer.write("RIFF", 0, 4, "ascii");
  buffer.writeUInt32LE(36 + data.length, 4);
  buffer.write("WAVE", 8, 4, "ascii");
  buffer.write("fmt ", 12, 4, "ascii");
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write("data", 36, 4, "ascii");
  buffer.writeUInt32LE(data.length, 40);
  data.copy(buffer, 44);
  return buffer;
}

function createSmokePdfBuffer({ compressed = false } = {}) {
  const stream = compressed
    ? "BT /F1 12 Tf 96 700 Td (Forge compressed PDF smoke text) Tj ET"
    : "BT /F1 12 Tf 72 720 Td (Forge PDF smoke text) Tj ET";
  const streamBuffer = compressed
    ? zlib.deflateSync(Buffer.from(stream, "latin1"))
    : Buffer.from(stream, "latin1");
  const streamDictionary = compressed
    ? `<< /Length ${streamBuffer.length} /Filter /FlateDecode >>`
    : `<< /Length ${streamBuffer.length} >>`;
  const objects = [
    Buffer.from("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n", "latin1"),
    Buffer.from("2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n", "latin1"),
    Buffer.from("3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n", "latin1"),
    Buffer.from("4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n", "latin1"),
    Buffer.concat([
      Buffer.from(`5 0 obj\n${streamDictionary}\nstream\n`, "latin1"),
      streamBuffer,
      Buffer.from("\nendstream\nendobj\n", "latin1")
    ])
  ];
  const parts = [Buffer.from("%PDF-1.4\n", "latin1")];
  const offsets = [0];
  const partsLength = () => parts.reduce((sum, part) => sum + part.length, 0);
  for (const object of objects) {
    offsets.push(partsLength());
    parts.push(object);
  }
  const xrefOffset = partsLength();
  parts.push(Buffer.from("xref\n0 6\n0000000000 65535 f \n", "latin1"));
  for (let i = 1; i < offsets.length; i++) {
    parts.push(Buffer.from(`${String(offsets[i]).padStart(10, "0")} 00000 n \n`, "latin1"));
  }
  parts.push(Buffer.from(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`, "latin1"));
  return Buffer.concat(parts);
}

async function runApiSmokeTest() {
  const smokeStep = (name) => {
    if (process.env.API_SMOKE_PROGRESS === "1") console.error(`[api-smoke] ${name}`);
  };
  const originalWorkspace = currentWorkspace;
  currentWorkspace = APP_ROOT;
  smokeStep("snapshot-state");
  const originalGoalState = await fs.readFile(GOAL_STATE_PATH, "utf8").catch(() => null);
  const originalContextSnapshot = await fs.readFile(CONTEXT_SNAPSHOT_PATH, "utf8").catch(() => null);
  const originalContextCompact = await fs.readFile(CONTEXT_COMPACT_PATH, "utf8").catch(() => null);
  const originalContextRollup = await fs.readFile(CONTEXT_ROLLUP_PATH, "utf8").catch(() => null);
  const originalSemanticIndex = await fs.readFile(SEMANTIC_INDEX_PATH, "utf8").catch(() => null);
  const originalRuntimeUrl = await fs.readFile(RUNTIME_URL_PATH, "utf8").catch(() => null);
  smokeStep("snapshot-approvals");
  const originalApprovals = await snapshotApprovalDir();
  smokeStep("listen");
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const cleanup = {
    queuePath: "",
    extraQueuePath: "",
    conflictQueuePath: "",
    applyFixtureAPath: "",
    applyFixtureBPath: "",
    applyHunkFixturePath: "",
    applyConflictCheckpointPath: "",
    applyHunkCheckpointPath: "",
    threadPath: "",
    forkThreadPath: "",
    handoffPath: "",
    remotePublishDir: "",
    remoteCiArtifactPath: "",
    escalationPath: "",
    explicitEscalationPath: "",
    processEscalationPath: "",
    processFixturePath: "",
    commandFailureFixturePath: "",
    commandFailureFixturePaths: [],
    browserSourceTracePagePath: "",
    browserSourceTraceScriptPath: "",
    browserSourceTracePath: "",
    browserSourceDebugTracePath: "",
    extensionFixtureDir: "",
    mcpFixturePath: "",
    mcpOriginalFixture: null,
    assetFixturePath: "",
    dataAssetFixturePath: "",
    parquetDataAssetFixturePath: "",
    documentAssetFixturePath: "",
    legacyDocumentAssetFixturePath: "",
    pdfAssetFixturePath: "",
    compressedPdfAssetFixturePath: "",
    mediaAssetFixturePath: "",
    browserBaselinePath: "",
    browserScreenshotPath: "",
    browserSessionPath: "",
    browserVisualBaselinePath: "",
    browserVisualMetaPath: "",
    browserVisualDiffBaselinePath: "",
    browserVisualDiffMetaPath: "",
    browserVisualDiffPath: "",
    browserVisualScreenshotPaths: [],
    processLogPaths: [],
    processId: "",
    semanticApiContractFixturePath: ""
  };
  try {
    smokeStep("health");
    const health = await requestJson(baseUrl, "/api/health");
    assertSmoke(health.ok === true, "health did not return ok=true");
    assertSmoke(Array.isArray(health.threads), "health did not include threads");
    assertSmoke(Array.isArray(health.queue), "health did not include queue");
    assertSmoke(Array.isArray(health.reviews), "health did not include review artifacts");
    assertSmoke(Array.isArray(health.approvals), "health did not include approval requests");
    assertSmoke(Array.isArray(health.processes), "health did not include managed processes");
    assertSmoke(health.goal && typeof health.goal === "object", "health did not include resumable goal state");
    assertSmoke(Array.isArray(health.capabilities?.capabilities), "health did not include capability audit");
    assertSmoke(Array.isArray(health.modelRuntime?.candidates), "health did not include model runtime candidates");
    assertSmoke(Array.isArray(health.modelRuntime?.recentCalls), "health did not include model runtime recent calls");
    assertSmoke(typeof health.modelRuntime?.requestCount === "number", "health did not include model runtime request count");
    assertSmoke(typeof health.modelRuntime?.averageLatencyMs === "number", "health did not include model runtime average latency");
    assertSmoke(health.modelPolicy?.policy?.exposesApiKey === false, "health model policy should not expose API keys");
    assertSmoke(Array.isArray(health.modelPolicy?.runtime?.fallbackOrder), "health model policy missing fallback order");
    assertSmoke(health.modelUsage?.policy?.exposesApiKey === false, "health model usage should not expose API keys");
    assertSmoke(typeof health.modelUsage?.summary?.requestCount === "number", "health model usage missing request summary");
    assertSmoke(health.modelBudget?.policy?.enforcedBeforeProviderRequest === true, "health model budget missing preflight policy");
    assertSmoke(Array.isArray(health.modelBudget?.checks), "health model budget missing checks");
    assertSmoke(health.modelCost?.policy?.bundledPrices === false, "health model cost should not use bundled prices");
    assertSmoke(typeof health.modelCost?.estimatedCost === "number", "health model cost missing estimate");
    assertSmoke(health.runtimeUrl?.url?.startsWith(baseUrl), "health missing current runtime URL");
    const runtimeUrlStatus = await requestJson(baseUrl, "/api/runtime-url");
    assertSmoke(runtimeUrlStatus.runtimeUrl?.url?.startsWith(baseUrl), "runtime-url endpoint missing current URL");
    assertSmoke(runtimeUrlStatus.runtimeUrl?.policy?.executesCommands === false, "runtime-url endpoint should be read-only");
    assertSmoke(Array.isArray(health.tools?.tools), "health did not include tool catalog");
    assertSmoke(Array.isArray(health.extensions?.extensions), "health did not include extension catalog");
    assertSmoke(Array.isArray(health.mcp?.servers), "health did not include MCP catalog");
    assertSmoke(Array.isArray(health.assets?.assets), "health did not include asset catalog");

    smokeStep("agent-stream");
    const agentStreamError = await requestSse(baseUrl, "/api/agent-stream", {
      method: "POST",
      body: JSON.stringify({})
    });
    assertSmoke(agentStreamError.contentType.includes("text/event-stream"), "agent stream did not use SSE content type");
    assertSmoke(agentStreamError.events.some((item) => item.event === "error"), "agent stream did not emit error event for invalid payload");
    const streamError = agentStreamError.events.find((item) => item.event === "error");
    assertSmoke(streamError?.data?.ok === false, "agent stream error event missing ok=false");
    assertSmoke(!agentStreamError.text.includes("DEEPSEEK_API_KEY="), "agent stream leaked API key material");
    const providerTokens = [];
    const providerStream = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder();
        controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"hel"}}]}\n\n'));
        controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"lo"},"finish_reason":"stop"}],"usage":{"prompt_tokens":2,"completion_tokens":1,"total_tokens":3}}\n\n'));
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      }
    });
    const parsedProviderStream = await readProviderSseResponse(new Response(providerStream, {
      headers: { "Content-Type": "text/event-stream" }
    }), (token) => providerTokens.push(token));
    assertSmoke(parsedProviderStream.content === "hello", "provider token stream parser did not concatenate deltas");
    assertSmoke(providerTokens.join("") === "hello", "provider token stream callback missed deltas");
    assertSmoke(normalizeModelUsage(parsedProviderStream.usage).totalTokens === 3, "provider token stream parser missed usage");

    smokeStep("browser-check");
    const browserCheck = await requestJson(baseUrl, "/api/browser-check", {
      method: "POST",
      body: JSON.stringify({ url: `${baseUrl}/` })
    });
    assertSmoke(browserCheck.ok === true, "browser check did not return ok=true for local app");
    assertSmoke(browserCheck.title, "browser check missing page title");
    assertSmoke(browserCheck.policy?.access === "local-url-only", "browser check missing local-url-only policy");

    smokeStep("browser-audit");
    const browserAudit = await requestJson(baseUrl, "/api/browser-audit", {
      method: "POST",
      body: JSON.stringify({ url: `${baseUrl}/` })
    });
    assertSmoke(browserAudit.policy?.staticHtmlAudit === true, "browser audit missing static audit policy");
    assertSmoke(browserAudit.audit?.counts?.buttons >= 1, "browser audit missing button count");
    assertSmoke(Array.isArray(browserAudit.audit?.issues), "browser audit missing issues");

    smokeStep("browser-baseline");
    const browserBaselineUrl = `${baseUrl}/?forge_api_smoke_baseline=${Date.now()}`;
    cleanup.browserBaselinePath = path.join(APP_ROOT, ".forge", "browser-baselines", `${browserBaselineId(browserBaselineUrl)}.json`);
    await fs.rm(cleanup.browserBaselinePath, { force: true }).catch(() => {});
    const browserBaseline = await requestJson(baseUrl, "/api/browser-baseline", {
      method: "POST",
      body: JSON.stringify({ url: browserBaselineUrl, name: "api smoke app shell" })
    });
    assertSmoke(browserBaseline.ok === true, "browser baseline did not create cleanly");
    assertSmoke(browserBaseline.updated === true, "browser baseline did not save initial fingerprint");
    cleanup.browserBaselinePath = path.join(APP_ROOT, browserBaseline.baselinePath);
    const browserBaselineMatch = await requestJson(baseUrl, "/api/browser-baseline", {
      method: "POST",
      body: JSON.stringify({ url: browserBaselineUrl })
    });
    assertSmoke(browserBaselineMatch.status === "matched", "browser baseline did not match saved fingerprint");
    assertSmoke(browserBaselineMatch.diffs.length === 0, "browser baseline reported unexpected diffs");

    smokeStep("browser-screenshot");
    const browserScreenshot = await requestJson(baseUrl, "/api/browser-screenshot", {
      method: "POST",
      timeoutMs: 150000,
      body: JSON.stringify({ url: `${baseUrl}/`, width: 800, height: 600 })
    });
    assertSmoke(browserScreenshot.ok === true, "browser screenshot did not complete");
    assertSmoke(browserScreenshot.path.endsWith(".png"), "browser screenshot did not return png path");
    assertSmoke(browserScreenshot.size > 0, "browser screenshot was empty");
    cleanup.browserScreenshotPath = path.join(APP_ROOT, browserScreenshot.path);
    const browserSelectorScreenshot = await requestJson(baseUrl, "/api/browser-screenshot", {
      method: "POST",
      timeoutMs: 150000,
      body: JSON.stringify({ url: `${baseUrl}/`, width: 800, height: 600, selector: "#promptForm" })
    });
    assertSmoke(browserSelectorScreenshot.ok === true, "selector screenshot did not complete");
    assertSmoke(browserSelectorScreenshot.policy?.selectorCrop === true, "selector screenshot missing crop policy evidence");
    assertSmoke(browserSelectorScreenshot.clip?.width > 0 && browserSelectorScreenshot.clip?.height > 0, "selector screenshot missing crop rectangle");
    cleanup.browserVisualScreenshotPaths.push(path.join(APP_ROOT, browserSelectorScreenshot.path));

    smokeStep("browser-dom");
    const browserDom = await requestJson(baseUrl, "/api/browser-dom", {
      method: "POST",
      timeoutMs: 150000,
      body: JSON.stringify({ url: `${baseUrl}/`, selectors: ["body", "#promptForm", "#browserCheckForm", "button"] })
    });
    assertSmoke(browserDom.ok === true, "browser DOM snapshot did not complete");
    assertSmoke(browserDom.bytes > 0, "browser DOM snapshot was empty");
    assertSmoke(browserDom.selectors.some((item) => item.selector === "#promptForm" && item.count >= 1), "browser DOM selector count missing #promptForm");

    smokeStep("browser-trace");
    const browserTrace = await requestJson(baseUrl, "/api/browser-trace", {
      method: "POST",
      timeoutMs: 120000,
      body: JSON.stringify({ url: `${baseUrl}/`, waitMs: 750, fallbackOnly: true })
    });
    assertSmoke(browserTrace.artifactPath?.endsWith(".json"), "browser trace missing artifact path");
    assertSmoke(browserTrace.policy?.networkTrace === true, "browser trace missing network policy evidence");
    assertSmoke(Array.isArray(browserTrace.console), "browser trace missing console list");
    assertSmoke(Array.isArray(browserTrace.network), "browser trace missing network list");
    assertSmoke(browserTrace.summary?.network >= 1, "browser trace did not capture network evidence");
    cleanup.browserTracePath = path.join(APP_ROOT, browserTrace.artifactPath);

    smokeStep("browser-trace-source-locations");
    const browserSourceId = `.forge-browser-source-smoke-${Date.now()}`;
    const browserSourcePageName = `${browserSourceId}.html`;
    const browserSourceScriptName = `${browserSourceId}.js`;
    cleanup.browserSourceTracePagePath = path.join(APP_ROOT, browserSourcePageName);
    cleanup.browserSourceTraceScriptPath = path.join(APP_ROOT, browserSourceScriptName);
    await fs.writeFile(cleanup.browserSourceTraceScriptPath, [
      "function forgeBrowserSourceSmoke() {",
      "  throw new Error('forge browser source smoke');",
      "}",
      "setTimeout(forgeBrowserSourceSmoke, 0);",
      ""
    ].join("\n"), "utf8");
    await fs.writeFile(cleanup.browserSourceTracePagePath, [
      "<!doctype html>",
      "<html lang=\"en\">",
      "<head><meta charset=\"utf-8\"><title>Forge Browser Source Smoke</title></head>",
      "<body><script src=\"./" + browserSourceScriptName + "\"></script></body>",
      "</html>",
      ""
    ].join("\n"), "utf8");
    const browserSourceTrace = await requestJson(baseUrl, "/api/browser-trace", {
      method: "POST",
      timeoutMs: 150000,
      body: JSON.stringify({ url: `${baseUrl}/${browserSourcePageName}`, waitMs: 1200 })
    });
    cleanup.browserSourceTracePath = browserSourceTrace.artifactPath ? path.join(APP_ROOT, browserSourceTrace.artifactPath) : "";
    assertSmoke(browserSourceTrace.summary?.exceptions >= 1, "browser source trace did not capture runtime exception");
    assertSmoke(
      browserSourceTrace.exceptions?.some((item) => item.sourceLocations?.some((location) => location.path === browserSourceScriptName && location.line >= 1)),
      "browser source trace did not map exception to workspace source"
    );

    smokeStep("debug-diagnostics");
    const debugDiagnostics = await requestJson(baseUrl, "/api/debug-diagnostics", {
      method: "POST",
      timeoutMs: 120000,
      body: JSON.stringify({ url: `${baseUrl}/`, includeTrace: true, runChecks: false, limit: 8 })
    });
    const debugTarget = await requestJson(baseUrl, "/api/debug-target", {
      method: "POST",
      timeoutMs: 120000,
      body: JSON.stringify({ url: `${baseUrl}/`, includeTrace: true, runChecks: false, limit: 8 })
    });
    assertSmoke(debugDiagnostics.diagnostics?.policy?.executesCommands === false, "debug diagnostics should be read-only by default");
    assertSmoke(debugDiagnostics.diagnostics?.summary?.traceCaptured === true, "debug diagnostics missing browser trace");
    assertSmoke(debugDiagnostics.diagnostics?.browserTriage?.status, "debug diagnostics missing browser triage");
    assertSmoke(Array.isArray(debugDiagnostics.diagnostics?.browserTriage?.findings), "debug diagnostics browser triage missing findings");
    assertSmoke(Array.isArray(debugDiagnostics.diagnostics?.findings), "debug diagnostics missing findings array");
    assertSmoke(debugTarget.debugTarget?.summary?.targetUrl === `${baseUrl}/`, "debug target missing traced target URL");
    assertSmoke(debugTarget.debugTarget?.diagnostics?.summary?.traceCaptured === true, "debug target missing embedded diagnostics trace");
    assertSmoke(debugTarget.debugTarget?.verificationCommands?.some((item) => String(item.command || "").includes("--api-smoke-section=debug")), "debug target missing verification commands");
    assertSmoke(debugDiagnostics.diagnostics?.nextActions?.every((item) => Number.isFinite(Number(item.priority))), "debug diagnostics actions missing priorities");
    assertSmoke(debugDiagnostics.diagnostics?.nextActions?.every((item) => item.kind), "debug diagnostics actions missing kind");
    assertSmoke(debugDiagnostics.diagnostics?.nextActions?.every((item, index, list) => index === 0 || Number(list[index - 1].priority) >= Number(item.priority)), "debug diagnostics actions are not priority sorted");
    const browserSourceDebugDiagnostics = await requestJson(baseUrl, "/api/debug-diagnostics", {
      method: "POST",
      timeoutMs: 150000,
      body: JSON.stringify({ url: `${baseUrl}/${browserSourcePageName}`, includeTrace: true, runChecks: false, limit: 8 })
    });
    cleanup.browserSourceDebugTracePath = browserSourceDebugDiagnostics.diagnostics?.browserTrace?.artifactPath
      ? path.join(APP_ROOT, browserSourceDebugDiagnostics.diagnostics.browserTrace.artifactPath)
      : "";
    assertSmoke(
      browserSourceDebugDiagnostics.diagnostics?.browserSourceLocations?.some((location) => location.path === browserSourceScriptName && location.line >= 1),
      "debug diagnostics missing browser source location evidence"
    );
    assertSmoke(
      browserSourceDebugDiagnostics.diagnostics?.nextActions?.some((item) => item.id === "inspect-browser-source" && item.evidence?.some((entry) => entry.includes(browserSourceScriptName))),
      "debug diagnostics missing browser source inspection action"
    );

    smokeStep("command-failure-diagnostics");
    cleanup.commandFailureFixturePath = path.join(currentWorkspace, `.forge-command-failure-smoke-${Date.now()}.js`);
    await fs.writeFile(cleanup.commandFailureFixturePath, "function brokenCommandFailureFixture() {\n  return ;\n", "utf8");
    cleanup.commandFailureFixturePaths.push(cleanup.commandFailureFixturePath);
    const commandFailureFixtureName = toPosix(path.relative(currentWorkspace, cleanup.commandFailureFixturePath));
    const failedCommand = await requestJson(baseUrl, "/api/command", {
      method: "POST",
      timeoutMs: 120000,
      body: JSON.stringify({ command: `node --check ${commandFailureFixtureName}` })
    });
    assertSmoke(failedCommand.exitCode !== 0, "failing command smoke unexpectedly passed");
    assertSmoke(failedCommand.diagnostics, "failing command did not attach diagnostics");
    assertSmoke(failedCommand.diagnostics?.policy?.executesCommands === false, "failing command diagnostics should not run extra checks");
    assertSmoke(Array.isArray(failedCommand.diagnostics?.findings), "failing command diagnostics missing findings");
    assertSmoke(typeof failedCommand.diagnostics?.summary?.findings === "number", "failing command diagnostics missing summary count");
    assertSmoke(String(failedCommand.output || "").includes("SyntaxError"), "failing command output missing syntax error evidence");
    assertSmoke(failedCommand.failureAnalysis?.category === "syntax", "failing command missing syntax failure classification");
    assertSmoke(failedCommand.failureAnalysis?.summary?.includes("语法"), "failing command classification missing readable summary");
    assertSmoke(failedCommand.failureAnalysis?.sourceLocations?.some((item) => item.path === commandFailureFixtureName && item.line >= 1), "failing command missing source location evidence");
    assertSmoke(failedCommand.recoveryChain?.status === "needs_recovery", "failing command missing recovery chain");
    assertSmoke(failedCommand.recoveryChain?.sourceLocations?.some((item) => item.path === commandFailureFixtureName), "failing command recovery chain missing source locations");
    assertSmoke(failedCommand.recoveryChain?.commands?.some((item) => item.stage === "reproduce"), "failing command recovery chain missing reproduce command");
    assertSmoke(failedCommand.recoveryChain?.commands?.some((item) => item.stage === "verify-debug"), "failing command recovery chain missing debug verification command");
    assertSmoke(failedCommand.recoveryChain?.nextActions?.length >= 1, "failing command recovery chain missing next actions");
    assertSmoke(failedCommand.diagnostics?.commandFailure?.category === "syntax", "failing command diagnostics missing command failure classification");
    assertSmoke(failedCommand.diagnostics?.findings?.some((item) => item.area === "command"), "failing command diagnostics missing command finding");
    const commandSourceContext = await requestJson(baseUrl, "/api/source-context", {
      method: "POST",
      body: JSON.stringify({ locations: failedCommand.failureAnalysis.sourceLocations, contextLines: 2, limit: 4 })
    });
    assertSmoke(commandSourceContext.contexts?.some((item) => item.path === commandFailureFixtureName && String(item.context || "").includes("brokenCommandFailureFixture")), "source context missing failed command code");
    assertSmoke(commandSourceContext.policy?.executesCommands === false, "source context should be read-only");

    const commandFailureCases = [
      {
        name: "module-resolution",
        body: "import './missing-command-failure-fixture.js';\n",
        assertOutput: /ERR_MODULE_NOT_FOUND|Cannot find module|module not found/i
      },
      {
        name: "missing-file",
        body: "import fs from 'node:fs';\nfs.readFileSync('./missing-command-failure-fixture.txt', 'utf8');\n",
        assertOutput: /ENOENT|no such file or directory/i
      },
      {
        name: "port-in-use",
        body: "import http from 'node:http';\nconst first = http.createServer((req, res) => res.end('first'));\nfirst.listen(0, '127.0.0.1', () => {\n  const address = first.address();\n  http.createServer((req, res) => res.end('second')).listen(address.port, '127.0.0.1');\n});\nsetTimeout(() => {}, 2000);\n",
        assertOutput: /EADDRINUSE|address already in use/i
      },
      {
        name: "package-manager",
        command: "npm run check",
        body: "node:internal/modules/cjs/loader:1520\n  throw err;\n  ^\n\nError: Cannot find module 'C:\\Users\\tester\\AppData\\Roaming\\npm\\node_modules\\npm\\bin\\npm-cli.js'\n    at Module._resolveFilename (node:internal/modules/cjs/loader:1517:15) {\n  code: 'MODULE_NOT_FOUND'\n}\n\nNode.js v24.18.0\n",
        exitCode: 1,
        assertOutput: /npm-cli\.js|MODULE_NOT_FOUND/i
      }
    ];
    for (const testCase of commandFailureCases) {
      const fixturePath = path.join(currentWorkspace, `.forge-command-failure-${testCase.name}-${Date.now()}.js`);
      cleanup.commandFailureFixturePaths.push(fixturePath);
      await fs.writeFile(fixturePath, testCase.body, "utf8");
      const fixtureName = toPosix(path.relative(currentWorkspace, fixturePath));
      const commandFailure = testCase.command
        ? {
            exitCode: testCase.exitCode || 1,
            output: testCase.body,
            failureAnalysis: classifyCommandFailure(testCase.command, { exitCode: testCase.exitCode || 1, output: testCase.body })
          }
        : await requestJson(baseUrl, "/api/command", {
            method: "POST",
            timeoutMs: 120000,
            body: JSON.stringify({ command: `node ${fixtureName} --smoke-test` })
          });
      if (testCase.command) {
        commandFailure.diagnostics = { commandFailure: commandFailure.failureAnalysis, findings: [{ area: "command", message: commandFailure.failureAnalysis.summary }] };
        commandFailure.recoveryChain = buildFailureRecoveryChain(testCase.command, commandFailure, commandFailure.diagnostics);
      }
      assertSmoke(commandFailure.exitCode !== 0, `${testCase.name} command failure unexpectedly passed`);
      assertSmoke(testCase.assertOutput.test(String(commandFailure.output || "")), `${testCase.name} command failure missing expected output evidence`);
      assertSmoke(commandFailure.failureAnalysis?.category === testCase.name, `${testCase.name} command failure classification mismatch`);
      assertSmoke(commandFailure.diagnostics?.commandFailure?.category === testCase.name, `${testCase.name} diagnostics missing command failure classification`);
      assertSmoke(commandFailure.diagnostics?.findings?.some((item) => item.area === "command" && item.message?.includes(commandFailure.failureAnalysis.summary)), `${testCase.name} diagnostics missing command finding`);
      assertSmoke(commandFailure.failureAnalysis?.nextActions?.length >= 1, `${testCase.name} command failure missing next action`);
      assertSmoke(commandFailure.recoveryChain?.category === testCase.name, `${testCase.name} recovery chain category mismatch`);
      assertSmoke(commandFailure.recoveryChain?.commands?.length >= 2, `${testCase.name} recovery chain missing commands`);
      if (testCase.name === "package-manager") {
        assertSmoke(commandFailure.recoveryChain?.commands?.some((item) => item.stage === "verify-toolchain-fallback" && /^node /.test(item.command)), "package-manager recovery chain missing node fallback command");
        assertSmoke(commandFailure.recoveryChain?.commands?.some((item) => item.command === "validate.bat --no-pause"), "package-manager recovery chain missing validate.bat fallback command");
      }
    }

    smokeStep("browser-interact");
    const browserInteract = await requestJson(baseUrl, "/api/browser-interact", {
      method: "POST",
      timeoutMs: 90000,
      body: JSON.stringify({
        url: `${baseUrl}/`,
        actions: [
          { type: "wait", selector: "body" },
          { type: "navigate", value: `${baseUrl}/?api-smoke-nav=1` },
          { type: "waitUrl", value: "api-smoke-nav=1" },
          { type: "waitNetwork" },
          { type: "upload", selector: "#browserSmokeFile", value: "README.md" },
          { type: "click", selector: "#browserCheckUrlInput" },
          { type: "type", selector: "#browserCheckUrlInput", value: "api-smoke-interaction" },
          { type: "waitValue", selector: "#browserCheckUrlInput", value: "api-smoke-interaction" },
          { type: "clear", selector: "#browserCheckUrlInput" },
          { type: "type", selector: "#browserCheckUrlInput", value: "api-smoke-interaction" },
          { type: "press", selector: "#browserCheckUrlInput", key: "Enter" },
          { type: "keyDown", selector: "#browserCheckUrlInput", key: "Shift" },
          { type: "keyUp", selector: "#browserCheckUrlInput", key: "Shift" },
          { type: "waitText", selector: "#browserCheckUrlInput", value: "api-smoke-interaction" },
          { type: "hover", selector: "#refreshFilesBtn" },
          { type: "dblclick", selector: "#refreshFilesBtn" },
          { type: "mouseMove", x: 20, y: 20 },
          { type: "mouseDown", x: 22, y: 22 },
          { type: "mouseUp", x: 22, y: 22 },
          { type: "mouseClick", x: 24, y: 24 },
          { type: "drag", x: 26, y: 26, toX: 40, toY: 40 },
          { type: "wheel", x: 28, y: 28, deltaY: 120 },
          { type: "scroll", deltaY: -80 },
          { type: "select", selector: "#browserCheckUrlInput", value: "api-smoke-selected" },
          { type: "check", selector: "#browserSmokeCheck" },
          { type: "uncheck", selector: "#browserSmokeCheck" }
        ],
        selectors: ["body", "#browserCheckUrlInput", "[value=\"api-smoke-selected\"]", "#browserSmokeCheck", "[data-forge-upload=\"README.md\"]", "[data-forge-pointer]", "[data-forge-wheel]", "[data-forge-scroll]"],
        fallbackOnly: true
      })
    });
    assertSmoke(browserInteract.ok === true, "browser interaction did not complete");
    assertSmoke(browserInteract.policy?.domInteraction === true, "browser interaction missing DOM interaction policy evidence");
    assertSmoke(browserInteract.actions.length === 26, "browser interaction did not audit all actions");
    assertSmoke(browserInteract.policy?.allowedActions?.includes("waitText"), "browser interaction missing expanded action policy evidence");
    assertSmoke(browserInteract.policy?.allowedActions?.includes("waitValue"), "browser interaction missing waitValue policy evidence");
    assertSmoke(browserInteract.policy?.allowedActions?.includes("upload"), "browser interaction missing upload policy evidence");
    assertSmoke(browserInteract.policy?.allowedActions?.includes("mouseClick"), "browser interaction missing coordinate mouse policy evidence");
    assertSmoke(browserInteract.policy?.allowedActions?.includes("keyDown"), "browser interaction missing keyDown policy evidence");
    assertSmoke(browserInteract.policy?.allowedActions?.includes("wheel"), "browser interaction missing wheel policy evidence");
    assertSmoke(browserInteract.actions.some((item) => item.type === "press" && item.key === "Enter"), "browser interaction did not audit key press");
    assertSmoke(browserInteract.actions.some((item) => item.type === "keydown" && item.key === "Shift"), "browser interaction did not audit keyDown action");
    assertSmoke(browserInteract.actions.some((item) => item.type === "keyup" && item.key === "Shift"), "browser interaction did not audit keyUp action");
    assertSmoke(browserInteract.actions.some((item) => item.type === "hover"), "browser interaction did not audit hover action");
    assertSmoke(browserInteract.actions.some((item) => item.type === "dblclick"), "browser interaction did not audit double click action");
    assertSmoke(browserInteract.actions.some((item) => item.type === "clear"), "browser interaction did not audit clear action");
    assertSmoke(browserInteract.actions.some((item) => item.type === "navigate" && item.value.includes("api-smoke-nav=1")), "browser interaction did not audit navigate action");
    assertSmoke(browserInteract.actions.some((item) => item.type === "waiturl" && item.value === "api-smoke-nav=1"), "browser interaction did not audit waitUrl action");
    assertSmoke(browserInteract.actions.some((item) => item.type === "waitnetwork"), "browser interaction did not audit waitNetwork action");
    assertSmoke(browserInteract.actions.some((item) => item.type === "upload" && item.value === "README.md"), "browser interaction did not audit upload action");
    assertSmoke(browserInteract.actions.some((item) => item.type === "mousemove" && item.x === 20 && item.y === 20), "browser interaction did not audit mouseMove action");
    assertSmoke(browserInteract.actions.some((item) => item.type === "mousedown" && item.x === 22 && item.y === 22), "browser interaction did not audit mouseDown action");
    assertSmoke(browserInteract.actions.some((item) => item.type === "mouseup" && item.x === 22 && item.y === 22), "browser interaction did not audit mouseUp action");
    assertSmoke(browserInteract.actions.some((item) => item.type === "mouseclick" && item.x === 24 && item.y === 24), "browser interaction did not audit mouseClick action");
    assertSmoke(browserInteract.actions.some((item) => item.type === "drag" && item.toX === 40 && item.toY === 40), "browser interaction did not audit drag action");
    assertSmoke(browserInteract.actions.some((item) => item.type === "wheel" && item.deltaY === 120), "browser interaction did not audit wheel action");
    assertSmoke(browserInteract.actions.some((item) => item.type === "scroll" && item.deltaY === -80), "browser interaction did not audit scroll action");
    assertSmoke(browserInteract.actions.some((item) => item.type === "waitvalue" && item.value === "api-smoke-interaction"), "browser interaction did not audit waitValue action");
    assertSmoke(browserInteract.actions.some((item) => item.type === "check"), "browser interaction did not audit check action");
    assertSmoke(browserInteract.actions.some((item) => item.type === "uncheck"), "browser interaction did not audit uncheck action");
    assertSmoke(browserInteract.actions.some((item) => item.type === "select" && item.value === "api-smoke-selected"), "browser interaction did not audit select action");
    assertSmoke(browserInteract.selectors.some((item) => item.selector === "[value=\"api-smoke-selected\"]" && item.count >= 1), "browser interaction did not persist selected value in DOM evidence");
    assertSmoke(browserInteract.selectors.some((item) => item.selector === "[data-forge-upload=\"README.md\"]" && item.count >= 1), "browser interaction did not persist upload evidence");
    assertSmoke(browserInteract.selectors.some((item) => item.selector === "[data-forge-pointer]" && item.count >= 1), "browser interaction did not persist coordinate mouse evidence");
    assertSmoke(browserInteract.selectors.some((item) => item.selector === "[data-forge-wheel]" && item.count >= 1), "browser interaction did not persist wheel evidence");
    assertSmoke(browserInteract.selectors.some((item) => item.selector === "[data-forge-scroll]" && item.count >= 1), "browser interaction did not persist scroll evidence");

    smokeStep("browser-session");
    const browserSession = await requestJson(baseUrl, "/api/browser-session", {
      method: "POST",
      timeoutMs: 180000,
      body: JSON.stringify({
        url: `${baseUrl}/`,
        name: "api smoke browser session",
        steps: [
          {
            name: "prepare",
            actions: [
              { type: "wait", selector: "body" },
              { type: "type", selector: "#browserCheckUrlInput", value: "api-smoke-session" },
              { type: "upload", selector: "#browserSmokeFile", value: "README.md" }
            ]
          }
        ],
        selectors: ["body", "[data-forge-upload=\"README.md\"]", "[value=\"api-smoke-session\"]"]
      })
    });
    assertSmoke(browserSession.ok === true, "browser session did not complete");
    assertSmoke(browserSession.stepCount === 1, "browser session did not record the smoke step");
    assertSmoke(browserSession.actionCount === 3, "browser session did not audit all actions");
    assertSmoke(browserSession.policy?.artifact === true, "browser session missing artifact policy evidence");
    assertSmoke(
      browserSession.policy?.persistentProfile === true || browserSession.policy?.browserFallback === true,
      "browser session missing persistent profile or fallback policy evidence"
    );
    assertSmoke(browserSession.artifactPath?.endsWith(".json"), "browser session missing artifact path");
    assertSmoke(browserSession.selectors.some((item) => item.selector === "[data-forge-upload=\"README.md\"]" && item.count >= 1), "browser session did not persist upload evidence");
    cleanup.browserSessionPath = path.join(APP_ROOT, browserSession.artifactPath);

    smokeStep("browser-visual");
    smokeStep("browser-visual:baseline");
    const browserVisual = await requestJson(baseUrl, "/api/browser-visual", {
      method: "POST",
      body: JSON.stringify({
        url: `${baseUrl}/`,
        width: 800,
        height: 600,
        name: "api smoke visual",
        screenshotPath: browserScreenshot.path
      })
    });
    assertSmoke(browserVisual.ok === true, "browser visual baseline did not create cleanly");
    assertSmoke(browserVisual.updated === true, "browser visual baseline did not save initial screenshot");
    assertSmoke(browserVisual.policy?.pixelDiff === true, "browser visual endpoint missing pixel diff policy evidence");
    cleanup.browserVisualBaselinePath = path.join(APP_ROOT, browserVisual.baselinePath);
    cleanup.browserVisualMetaPath = path.join(APP_ROOT, browserVisual.metaPath);
    cleanup.browserVisualScreenshotPaths.push(path.join(APP_ROOT, browserVisual.currentPath));
    smokeStep("browser-visual:match");
    const browserVisualMatch = await requestJson(baseUrl, "/api/browser-visual", {
      method: "POST",
      body: JSON.stringify({
        url: `${baseUrl}/`,
        width: 800,
        height: 600,
        threshold: 1,
        maxMismatchRatio: 0.001,
        screenshotPath: browserScreenshot.path
      })
    });
    assertSmoke(browserVisualMatch.ok === true, "browser visual comparison did not match saved baseline");
    assertSmoke(browserVisualMatch.hasBaseline === true, "browser visual comparison missing saved baseline");
    assertSmoke(browserVisualMatch.comparison?.totalPixels > 0, "browser visual comparison missing pixel totals");
    cleanup.browserVisualScreenshotPaths.push(path.join(APP_ROOT, browserVisualMatch.currentPath));
    smokeStep("browser-visual:selector");
    const browserSelectorVisual = await requestJson(baseUrl, "/api/browser-visual", {
      method: "POST",
      timeoutMs: 150000,
      body: JSON.stringify({
        url: `${baseUrl}/`,
        width: 800,
        height: 600,
        name: "api smoke selector visual",
        selector: "#promptForm",
        screenshotPath: browserSelectorScreenshot.path
      })
    });
    assertSmoke(browserSelectorVisual.ok === true, "selector visual baseline did not create cleanly");
    assertSmoke(browserSelectorVisual.selector === "#promptForm", "selector visual did not persist selector");
    assertSmoke(browserSelectorVisual.policy?.selectorCrop === true, "selector visual missing crop policy evidence");
    assertSmoke(browserSelectorVisual.baselinePath !== browserVisual.baselinePath, "selector visual baseline should be isolated from full-page baseline");
    cleanup.browserVisualScreenshotPaths.push(path.join(APP_ROOT, browserSelectorVisual.currentPath));
    cleanup.browserVisualScreenshotPaths.push(path.join(APP_ROOT, browserSelectorVisual.baselinePath));
    cleanup.browserVisualScreenshotPaths.push(path.join(APP_ROOT, browserSelectorVisual.metaPath));

    const visualDiffUrl = `${baseUrl}/?visual-diff-smoke=${Date.now()}`;
    const visualDiffId = browserBaselineId(visualDiffUrl);
    const visualDiffBaselineBuffer = createSmokePngBuffer({ r: 255, g: 0, b: 0, a: 255 });
    const visualDiffCurrentPath = path.join(BROWSER_SCREENSHOT_DIR, `${visualDiffId}-current.png`);
    cleanup.browserVisualDiffBaselinePath = path.join(BROWSER_VISUAL_DIR, `${visualDiffId}.png`);
    cleanup.browserVisualDiffMetaPath = path.join(BROWSER_VISUAL_DIR, `${visualDiffId}.json`);
    await fs.mkdir(BROWSER_VISUAL_DIR, { recursive: true });
    await fs.mkdir(BROWSER_SCREENSHOT_DIR, { recursive: true });
    await fs.writeFile(cleanup.browserVisualDiffBaselinePath, visualDiffBaselineBuffer);
    await fs.writeFile(cleanup.browserVisualDiffMetaPath, JSON.stringify({
      id: visualDiffId,
      name: "api smoke visual diff",
      url: visualDiffUrl,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      width: 1,
      height: 1,
      hash: hashBuffer(visualDiffBaselineBuffer)
    }, null, 2), "utf8");
    await fs.writeFile(visualDiffCurrentPath, createSmokePngBuffer({ r: 0, g: 0, b: 255, a: 255 }));
    cleanup.browserVisualScreenshotPaths.push(visualDiffCurrentPath);
    smokeStep("browser-visual:diff");
    const browserVisualDiff = await requestJson(baseUrl, "/api/browser-visual", {
      method: "POST",
      body: JSON.stringify({
        url: visualDiffUrl,
        width: 1,
        height: 1,
        threshold: 0,
        maxMismatchRatio: 0,
        screenshotPath: toPosix(path.relative(APP_ROOT, visualDiffCurrentPath))
      })
    });
    assertSmoke(browserVisualDiff.ok === false, "browser visual diff should fail when pixels differ");
    assertSmoke(browserVisualDiff.status === "changed", "browser visual diff did not report changed status");
    assertSmoke(browserVisualDiff.hasDiffImage === true, "browser visual diff did not create diff image");
    assertSmoke(browserVisualDiff.diffPath.endsWith("-diff.png"), "browser visual diff did not return diff png path");
    assertSmoke(browserVisualDiff.policy?.visualDiffImage === true, "browser visual diff missing policy evidence");
    assertSmoke(browserVisualDiff.comparison?.mismatchedPixels >= 1, "browser visual diff did not count mismatched pixels");
    cleanup.browserVisualDiffPath = path.join(APP_ROOT, browserVisualDiff.diffPath);

    smokeStep("files");
    const files = await requestJson(baseUrl, "/api/files");
    assertSmoke(Array.isArray(files.files), "files did not include file list");
    assertSmoke(files.repoMap && typeof files.repoMap === "object", "files did not include repoMap");

    smokeStep("semantic-index");
    const semanticIndex = await requestJson(baseUrl, "/api/semantic-index", { method: "POST" });
    assertSmoke(semanticIndex.index?.indexedFiles >= 1, "semantic index missing indexed files");
    assertSmoke(semanticIndex.index?.summary?.declarations >= 1, "semantic index missing declarations");
    assertSmoke(Array.isArray(semanticIndex.index?.imports), "semantic index missing imports");
    assertSmoke(semanticIndex.index?.summary?.symbolOutline >= 1, "semantic index missing symbol outline");
    assertSmoke(semanticIndex.index?.symbolOutline?.some((item) => item.name === "buildSemanticIndex" && item.endLine >= item.line), "semantic index missing buildSemanticIndex outline span");
    smokeStep("semantic-index-read");
    const semanticIndexRead = await requestJson(baseUrl, "/api/semantic-index");
    assertSmoke(semanticIndexRead.index?.generatedAt, "semantic index did not persist");
    smokeStep("code-intelligence");
    const codeIntelligence = await requestJson(baseUrl, "/api/code-intelligence", {
      method: "POST",
      body: JSON.stringify({ limit: 20, includeDiagnostics: true })
    });
    assertSmoke(codeIntelligence.overview?.summary?.indexedFiles >= 1, "code intelligence missing indexed file summary");
    assertSmoke(codeIntelligence.overview?.summary?.symbolOutline >= 1, "code intelligence missing symbol outline summary");
    assertSmoke(Array.isArray(codeIntelligence.overview?.entrypoints), "code intelligence missing entrypoints");
    assertSmoke(Array.isArray(codeIntelligence.overview?.symbolSurface?.largestSymbols), "code intelligence missing largest symbols");
    assertSmoke(Array.isArray(codeIntelligence.overview?.dependencySurface?.hotspots), "code intelligence missing dependency hotspots");
    assertSmoke(codeIntelligence.overview?.typecheck && Array.isArray(codeIntelligence.overview.typecheck.commands), "code intelligence missing typecheck discovery");
    assertSmoke(typeof codeIntelligence.overview?.summary?.typecheckCommands === "number", "code intelligence missing typecheck summary");
    assertSmoke(Array.isArray(codeIntelligence.overview?.readiness), "code intelligence missing readiness");
    smokeStep("symbol-outline");
    const symbolOutline = await requestJson(baseUrl, "/api/symbol-outline", {
      method: "POST",
      body: JSON.stringify({ query: "buildSemanticIndex", path: "server.js", limit: 10, includeContext: true })
    });
    assertSmoke(symbolOutline.summary?.matched >= 1, "symbol outline missing query match");
    assertSmoke(symbolOutline.symbols.some((item) => item.name === "buildSemanticIndex" && item.context?.includes("buildSemanticIndex")), "symbol outline missing context");
    smokeStep("semantic-definition");
    const semanticDefinition = await requestJson(baseUrl, "/api/semantic-definition", {
      method: "POST",
      body: JSON.stringify({ symbol: "buildSemanticIndex", path: "server.js", contextLines: 2 })
    });
    assertSmoke(semanticDefinition.matchCount >= 1, "semantic definition missing symbol match");
    assertSmoke(semanticDefinition.definitions.some((item) => item.name === "buildSemanticIndex" && item.context?.includes("buildSemanticIndex")), "semantic definition missing definition context");
    smokeStep("semantic-symbol-impact");
    const semanticSymbolImpact = await requestJson(baseUrl, "/api/semantic-symbol-impact", {
      method: "POST",
      body: JSON.stringify({ symbol: "buildSemanticIndex", path: "server.js", limit: 20, contextLines: 2 })
    });
    assertSmoke(semanticSymbolImpact.summary?.definitions >= 1, "semantic symbol impact missing definitions");
    assertSmoke(semanticSymbolImpact.references?.matchCount >= 1, "semantic symbol impact missing references");
    assertSmoke(semanticSymbolImpact.impact?.summary?.targets >= 1, "semantic symbol impact missing impact targets");
    assertSmoke(Array.isArray(semanticSymbolImpact.verificationCommands) && semanticSymbolImpact.verificationCommands.length >= 1, "semantic symbol impact missing verification commands");
    assertSmoke(semanticSymbolImpact.policy?.executesCommands === false, "semantic symbol impact should be read-only");
    smokeStep("semantic-rename-preview");
    const semanticRenamePreview = await requestJson(baseUrl, "/api/semantic-rename-preview", {
      method: "POST",
      body: JSON.stringify({ symbol: "buildSemanticIndex", newName: "buildSemanticIndexNext", path: "server.js", limit: 20, contextLines: 2 })
    });
    assertSmoke(semanticRenamePreview.summary?.definitions >= 1, "semantic rename preview missing definitions");
    assertSmoke(semanticRenamePreview.summary?.locations >= 1, "semantic rename preview missing locations");
    assertSmoke(Array.isArray(semanticRenamePreview.locations) && semanticRenamePreview.locations.some((item) => item.after?.includes("buildSemanticIndexNext")), "semantic rename preview missing replacement preview");
    assertSmoke(Array.isArray(semanticRenamePreview.verificationCommands) && semanticRenamePreview.verificationCommands.length >= 1, "semantic rename preview missing verification commands");
    assertSmoke(semanticRenamePreview.policy?.previewOnly === true && semanticRenamePreview.policy?.writesFiles === false, "semantic rename preview should be read-only");
    smokeStep("semantic-rename-draft");
    const semanticRenameDraft = await requestJson(baseUrl, "/api/semantic-rename-draft", {
      method: "POST",
      body: JSON.stringify({ symbol: "buildSemanticIndex", newName: "buildSemanticIndexNext", path: "server.js", limit: 20, contextLines: 2, prompt: "api smoke rename draft" })
    });
    assertSmoke(semanticRenameDraft.proposal?.diff?.includes("buildSemanticIndexNext"), "semantic rename draft missing replacement diff");
    assertSmoke(Array.isArray(semanticRenameDraft.proposal?.patches) && semanticRenameDraft.proposal.patches.length >= 1, "semantic rename draft missing patches");
    assertSmoke(semanticRenameDraft.goal?.pendingProposalId?.startsWith("rename-"), "semantic rename draft missing pending proposal id");
    assertSmoke(semanticRenameDraft.policy?.writesFiles === false && semanticRenameDraft.policy?.requiresApplyApproval === true, "semantic rename draft should only create pending proposal");
    smokeStep("semantic-search");
    const semanticSearch = await requestJson(baseUrl, "/api/semantic-search", {
      method: "POST",
      body: JSON.stringify({ query: "buildSemanticIndex", kind: "declaration", limit: 10 })
    });
    assertSmoke(semanticSearch.matchCount >= 1, "semantic search did not find declaration");
    assertSmoke(semanticSearch.matches.some((item) => item.path === "server.js"), "semantic search missing server.js match");
    smokeStep("semantic-references");
    const semanticReferences = await requestJson(baseUrl, "/api/semantic-references", {
      method: "POST",
      body: JSON.stringify({ symbol: "buildSemanticIndex", limit: 20, contextLines: 3 })
    });
    assertSmoke(semanticReferences.matchCount >= 1, "semantic references did not find symbol");
    assertSmoke(semanticReferences.declarations.some((item) => item.path === "server.js" && item.context.includes("buildSemanticIndex")), "semantic references missing declaration context");
    smokeStep("semantic-diagnostics");
    const semanticDiagnostics = await requestJson(baseUrl, "/api/semantic-diagnostics", {
      method: "POST",
      body: JSON.stringify({ limit: 40, includeContext: true })
    });
    assertSmoke(semanticDiagnostics.summary && typeof semanticDiagnostics.summary.total === "number", "semantic diagnostics missing summary");
    assertSmoke(Array.isArray(semanticDiagnostics.diagnostics), "semantic diagnostics missing diagnostics list");
    assertSmoke(semanticDiagnostics.checked?.indexedFiles >= 1, "semantic diagnostics missing checked evidence");
    assertSmoke(typeof semanticDiagnostics.checked?.apiMethodContracts === "number", "semantic diagnostics missing API method contract count");
    cleanup.semanticApiContractFixturePath = path.join(currentWorkspace, `.forge-api-contract-smoke-${Date.now()}.js`);
    await fs.writeFile(cleanup.semanticApiContractFixturePath, [
      "async function api(path, options = {}) { return { path, options }; }",
      "api('/api/health', { method: 'POST' });",
      "api('/api/command', { method: 'POST' });",
      ""
    ].join("\n"), "utf8");
    await requestJson(baseUrl, "/api/semantic-index", { method: "POST" });
    const semanticContractDiagnostics = await requestJson(baseUrl, "/api/semantic-diagnostics", {
      method: "POST",
      body: JSON.stringify({ limit: 120, includeContext: true })
    });
    assertSmoke(
      semanticContractDiagnostics.diagnostics?.some((item) => item.category === "api-method-mismatch" && item.evidence?.route === "/api/health" && item.evidence?.clientMethod === "POST"),
      "semantic diagnostics missing API method mismatch evidence"
    );
    assertSmoke(
      !semanticContractDiagnostics.diagnostics?.some((item) => item.category === "api-method-mismatch" && item.evidence?.route === "/api/command"),
      "semantic diagnostics reported false API method mismatch for POST /api/command"
    );
    smokeStep("semantic-impact");
    const semanticImpact = await requestJson(baseUrl, "/api/semantic-impact", {
      method: "POST",
      body: JSON.stringify({ paths: ["server.js"], limit: 20, includeContext: true })
    });
    assertSmoke(semanticImpact.summary?.targets >= 1, "semantic impact missing target summary");
    assertSmoke(semanticImpact.targetSummaries.some((item) => item.path === "server.js" && item.indexed === true), "semantic impact missing indexed server.js target");
    assertSmoke(Array.isArray(semanticImpact.dependents), "semantic impact missing dependents list");
    assertSmoke(Array.isArray(semanticImpact.callers), "semantic impact missing callers list");
    smokeStep("dependency-graph");
    const dependencyGraph = await requestJson(baseUrl, "/api/dependency-graph", {
      method: "POST",
      body: JSON.stringify({ paths: ["server.js"], limit: 40, includeExternal: true })
    });
    assertSmoke(dependencyGraph.summary?.nodes >= 1, "dependency graph missing nodes");
    assertSmoke(Array.isArray(dependencyGraph.edges), "dependency graph missing edges");
    assertSmoke(Array.isArray(dependencyGraph.unresolved), "dependency graph missing unresolved list");
    assertSmoke(dependencyGraph.targetSummaries.some((item) => item.path === "server.js" && item.indexed === true), "dependency graph missing server.js target");
    smokeStep("model-policy");
    const modelPolicy = await requestJson(baseUrl, "/api/model-policy", {
      method: "POST",
      body: JSON.stringify({ includeRecent: true })
    });
    assertSmoke(modelPolicy.policy?.policy?.exposesApiKey === false, "model policy should not expose API key");
    assertSmoke(modelPolicy.policy?.policy?.changesProviderConfig === false, "model policy should be read-only");
    assertSmoke(modelPolicy.policy?.policy?.executesModelCall === false, "model policy should not execute model calls");
    assertSmoke(Array.isArray(modelPolicy.policy?.runtime?.candidates), "model policy missing candidates");
    assertSmoke(Array.isArray(modelPolicy.policy?.guardrails), "model policy missing guardrails");
    assertSmoke(modelPolicy.policy?.endpoint?.host, "model policy missing endpoint host");
    assertSmoke(typeof modelPolicy.policy?.runtime?.usage?.requestCount === "number", "model policy missing usage summary");
    assertSmoke(modelPolicy.policy?.budgetStatus?.policy?.enforcedBeforeProviderRequest === true, "model policy missing budget preflight status");
    assertSmoke(modelPolicy.policy?.guardrails.some((item) => item.name === "model-budget-preflight" && item.status === "implemented"), "model policy missing budget preflight guardrail");
    smokeStep("model-usage");
    const modelUsage = await requestJson(baseUrl, "/api/model-usage");
    assertSmoke(modelUsage.usage?.policy?.exposesApiKey === false, "model usage should not expose API key");
    assertSmoke(modelUsage.usage?.policy?.executesModelCall === false, "model usage should not execute model calls");
    assertSmoke(typeof modelUsage.usage?.summary?.requestCount === "number", "model usage missing request count");
    assertSmoke(Array.isArray(modelUsage.usage?.recent), "model usage missing recent calls");
    assertSmoke(modelUsage.usage?.endpoint?.host, "model usage missing endpoint host");
    smokeStep("model-budget");
    const modelBudget = await requestJson(baseUrl, "/api/model-budget", {
      method: "POST",
      body: JSON.stringify({ limits: { requestLimit: 0 } })
    });
    assertSmoke(modelBudget.budget?.status === "blocked", "model budget override should block at zero request limit");
    assertSmoke(modelBudget.budget?.blocksModelCall === true, "model budget missing blocked flag");
    assertSmoke(modelBudget.budget?.policy?.executesModelCall === false, "model budget should not execute model calls");
    assertSmoke(modelBudget.budget?.policy?.enforcedBeforeProviderRequest === true, "model budget missing preflight enforcement policy");
    assertSmoke(modelBudget.budget?.checks.some((item) => item.name === "request-limit" && item.blocked === true), "model budget missing blocked request-limit check");
    smokeStep("model-cost");
    const modelCost = await requestJson(baseUrl, "/api/model-cost");
    assertSmoke(modelCost.cost?.policy?.executesModelCall === false, "model cost should not execute model calls");
    assertSmoke(modelCost.cost?.policy?.bundledPrices === false, "model cost should not use bundled provider prices");
    assertSmoke(Array.isArray(modelCost.cost?.rows), "model cost missing rows");
    assertSmoke(typeof modelCost.cost?.estimatedCost === "number", "model cost missing numeric estimate");
    smokeStep("model-cost-policy");
    const modelCostPolicy = await requestJson(baseUrl, "/api/model-cost-policy", {
      method: "POST",
      body: JSON.stringify({ raw: JSON.stringify({ currency: "USD", models: { default: { promptPer1M: 1, completionPer1M: 2 } } }) })
    });
    assertSmoke(modelCostPolicy.policy?.policy?.writesEnvironment === false, "model cost policy should not write environment");
    assertSmoke(modelCostPolicy.policy?.valid === true, "model cost policy dry-run should parse");
    assertSmoke(modelCostPolicy.policy?.parsed?.models?.default?.promptPer1M === 1, "model cost policy did not parse default prompt rate");
    smokeStep("model-billing");
    const modelBilling = await requestJson(baseUrl, "/api/model-billing", {
      method: "POST",
      body: JSON.stringify({ raw: JSON.stringify({ currency: "USD", period: "api-smoke", total: 0, invoices: [{ id: "smoke", amount: 0, currency: "USD" }] }) })
    });
    assertSmoke(modelBilling.billing?.configured === true, "model billing dry-run should be configured");
    assertSmoke(modelBilling.billing?.policy?.providerBillingApi === false, "model billing should not call provider billing API");
    assertSmoke(modelBilling.billing?.policy?.executesModelCall === false, "model billing should not execute model calls");
    assertSmoke(typeof modelBilling.billing?.variance === "number" || modelBilling.billing?.variance === null, "model billing missing variance field");

    smokeStep("capabilities");
    const capabilities = await requestJson(baseUrl, "/api/capabilities");
    assertSmoke(capabilities.capabilities.some((item) => item.area === "可恢复状态"), "capabilities endpoint missing resumable state");
    assertSmoke(capabilities.capabilities.some((item) => item.area === "模型运行层"), "capabilities endpoint missing model runtime layer");
    assertSmoke(capabilities.capabilities.some((item) => item.status !== "implemented"), "capabilities endpoint should expose remaining gaps");
    assertSmoke(capabilities.recommendedNext?.capability?.area, "capabilities endpoint missing recommended next gap");
    assertSmoke(capabilities.recommendedNext?.reason, "capabilities endpoint missing recommendation reason");
    assertSmoke(capabilities.recommendedNext?.capability?.taskPlan?.verificationCommands?.length >= 1, "capabilities endpoint missing recommended task plan commands");
    assertSmoke(capabilities.recommendedNext?.capability?.taskPlan?.acceptance?.length >= 1, "capabilities endpoint missing recommended task plan acceptance criteria");
    assertSmoke(capabilities.gapSummary?.totalOutstanding >= 1, "capabilities endpoint missing gap summary total");
    assertSmoke(typeof capabilities.gapSummary?.localActionableCount === "number", "capabilities endpoint missing local gap summary count");
    assertSmoke(typeof capabilities.gapSummary?.externalBlockedCount === "number", "capabilities endpoint missing external gap summary count");
    assertSmoke(Array.isArray(capabilities.gapSummary?.topLocalGaps), "capabilities endpoint missing top local gap summary");
    assertSmoke(Array.isArray(capabilities.gapSummary?.topExternalGaps), "capabilities endpoint missing top external gap summary");
    assertSmoke(capabilities.gapSummary?.recommendedGap?.verificationCommands?.length >= 1, "capabilities endpoint missing recommended gap summary commands");
    assertSmoke(capabilities.gapSummary?.externalPreparation?.authorizationItems?.length >= 1, "capabilities endpoint missing external preparation authorization list");
    assertSmoke(capabilities.gapSummary?.externalPreparation?.localReadinessCommands?.length >= 1, "capabilities endpoint missing external preparation local readiness commands");
    assertSmoke(capabilities.gapSummary?.topExternalGaps?.some((item) => item.externalPreparation?.authorizationItems?.length >= 1), "capabilities endpoint missing per-gap external preparation");
    assertSmoke(capabilities.comparison?.requirements?.some((item) => item.id === "debug-loop"), "capabilities endpoint missing code/debug comparison");
    assertSmoke(Array.isArray(capabilities.comparison?.outstandingGaps), "capabilities endpoint missing outstanding gap list");
    assertSmoke(capabilities.comparison?.outstandingGaps?.every((item) => item.taskPlan?.policy?.source === "capability-task-plan"), "capabilities endpoint missing task plan evidence on outstanding gaps");
    assertSmoke(Array.isArray(capabilities.comparison?.localActionableGaps), "capabilities endpoint missing local actionable gap list");
    assertSmoke(Array.isArray(capabilities.comparison?.externalBlockedGaps), "capabilities endpoint missing external blocked gap list");
    const reviewCapability = capabilities.capabilities.find((item) => item.area === "代码审查证据");
    assertSmoke(reviewCapability?.evidence?.some((item) => String(item).includes("排队验证")), "capabilities endpoint missing review verification staging evidence");
    const verificationCapability = capabilities.capabilities.find((item) => item.area === "验证与修复闭环");
    assertSmoke(verificationCapability?.evidence?.some((item) => String(item).includes("reviewArtifactVerificationCommands")), "capabilities endpoint missing review verification command evidence");

    smokeStep("tools");
    const tools = await requestJson(baseUrl, "/api/tools");
    assertSmoke(tools.tools.some((item) => item.name === "repo_map"), "tools endpoint missing repo_map");
    assertSmoke(tools.tools.some((item) => item.name === "diff_conflicts"), "tools endpoint missing diff_conflicts");
    assertSmoke(tools.tools.some((item) => item.name === "model_policy"), "tools endpoint missing model_policy");
    assertSmoke(tools.tools.some((item) => item.name === "model_usage"), "tools endpoint missing model_usage");
    assertSmoke(tools.tools.some((item) => item.name === "model_budget"), "tools endpoint missing model_budget");
    assertSmoke(tools.tools.some((item) => item.name === "model_cost"), "tools endpoint missing model_cost");
    assertSmoke(tools.tools.some((item) => item.name === "model_cost_policy"), "tools endpoint missing model_cost_policy");
    assertSmoke(tools.tools.some((item) => item.name === "model_billing"), "tools endpoint missing model_billing");
    assertSmoke(tools.tools.some((item) => item.name === "context_rollup"), "tools endpoint missing context_rollup");
    const modelCapability = capabilities.capabilities.find((item) => item.area === "模型运行层");
    assertSmoke(modelCapability?.status === "implemented", "model runtime layer should not depend on recent live calls for local readiness");
    assertSmoke(modelCapability?.evidence?.some((item) => String(item).includes("模型运行就绪：implemented")), "capabilities endpoint missing model runtime readiness evidence");
    assertSmoke(modelCapability?.evidence?.some((item) => String(item).includes("默认 fallback 已配置")), "capabilities endpoint missing default fallback readiness evidence");
    assertSmoke(modelCapability?.evidence?.some((item) => String(item).includes("agentFailureVerificationCommands")), "capabilities endpoint missing agent failure verification command evidence");
    assertSmoke(tools.tools.some((item) => item.name === "verification_plan"), "tools endpoint missing verification_plan");
    assertSmoke(tools.tools.some((item) => item.name === "ci_status"), "tools endpoint missing ci_status");
    assertSmoke(tools.tools.some((item) => item.name === "debug_diagnostics"), "tools endpoint missing debug_diagnostics");
    assertSmoke(tools.tools.some((item) => item.name === "debug_target"), "tools endpoint missing debug_target");
    assertSmoke(tools.tools.some((item) => item.name === "merge_gate"), "tools endpoint missing merge_gate");
    assertSmoke(tools.tools.some((item) => item.name === "mcp_resource"), "tools endpoint missing mcp_resource");
    assertSmoke(tools.tools.some((item) => item.name === "remote_publish_packages"), "tools endpoint missing remote_publish_packages");
    assertSmoke(tools.tools.some((item) => item.name === "remote_publish_package"), "tools endpoint missing remote_publish_package");
    assertSmoke(tools.tools.some((item) => item.name === "remote_publish_preflight"), "tools endpoint missing remote_publish_preflight");
    assertSmoke(tools.tools.some((item) => item.name === "remote_publish_continuation"), "tools endpoint missing remote_publish_continuation");
    assertSmoke(tools.tools.some((item) => item.name === "policy_audit"), "tools endpoint missing policy_audit");
    assertSmoke(tools.tools.some((item) => item.name === "permission_matrix"), "tools endpoint missing permission_matrix");
    assertSmoke(tools.tools.some((item) => item.name === "extension_trust"), "tools endpoint missing extension_trust");
    assertSmoke(tools.tools.some((item) => item.name === "queue_isolation"), "tools endpoint missing queue_isolation");
    assertSmoke(tools.tools.some((item) => item.name === "process_health"), "tools endpoint missing process_health");
    assertSmoke(tools.tools.some((item) => item.name === "runtime_url"), "tools endpoint missing runtime_url");
    assertSmoke(tools.tools.some((item) => item.name === "code_intelligence"), "tools endpoint missing code_intelligence");
    assertSmoke(tools.tools.some((item) => item.name === "semantic_index"), "tools endpoint missing semantic_index");
    assertSmoke(tools.tools.some((item) => item.name === "symbol_outline"), "tools endpoint missing symbol_outline");
    assertSmoke(tools.tools.some((item) => item.name === "semantic_definition"), "tools endpoint missing semantic_definition");
    assertSmoke(tools.tools.some((item) => item.name === "semantic_symbol_impact"), "tools endpoint missing semantic_symbol_impact");
    assertSmoke(tools.tools.some((item) => item.name === "semantic_rename_preview"), "tools endpoint missing semantic_rename_preview");
    assertSmoke(tools.tools.some((item) => item.name === "semantic_rename_draft"), "tools endpoint missing semantic_rename_draft");
    assertSmoke(tools.tools.some((item) => item.name === "semantic_search"), "tools endpoint missing semantic_search");
    assertSmoke(tools.tools.some((item) => item.name === "semantic_references"), "tools endpoint missing semantic_references");
    assertSmoke(tools.tools.some((item) => item.name === "semantic_diagnostics"), "tools endpoint missing semantic_diagnostics");
    assertSmoke(tools.tools.some((item) => item.name === "semantic_impact"), "tools endpoint missing semantic_impact");
    assertSmoke(tools.tools.some((item) => item.name === "dependency_graph"), "tools endpoint missing dependency_graph");
    smokeStep("extension-fixture");
    cleanup.extensionFixtureDir = path.join(EXTENSION_DIR, "skills", "api-smoke-skill");
    await fs.mkdir(cleanup.extensionFixtureDir, { recursive: true });
    const signedExtensionManifest = {
      name: "api-smoke-skill",
      type: "skill",
      version: "0.0.0",
      description: "API smoke extension fixture",
      capabilities: ["smoke-test"],
      tools: [{
        name: "smoke_probe",
        description: "Fixture tool declaration",
        mapsTo: "repo_map",
        parameters: { type: "object", properties: {} }
      }],
      policy: { access: "read-only", scope: "currentWorkspace", requiresApproval: true },
      trust: {
        signatureAlgorithm: "ed25519",
        signedBy: "api-smoke-local"
      }
    };
    const extensionKeyPair = crypto.generateKeyPairSync("ed25519");
    signedExtensionManifest.trust.publicKeyPem = extensionKeyPair.publicKey.export({ type: "spki", format: "pem" });
    signedExtensionManifest.trust.signature = crypto.sign(null, extensionSignaturePayload(signedExtensionManifest), extensionKeyPair.privateKey).toString("base64");
    await fs.writeFile(path.join(cleanup.extensionFixtureDir, "manifest.json"), JSON.stringify(signedExtensionManifest, null, 2));
    smokeStep("extensions");
    const extensions = await requestJson(baseUrl, "/api/extensions");
    assertSmoke(extensions.extensions.some((item) => item.name === "api-smoke-skill"), "extensions endpoint missing fixture skill");
    assertSmoke(extensions.summary.skill >= 1, "extensions endpoint missing skill summary");
    assertSmoke(extensions.extensions.some((item) => item.name === "api-smoke-skill" && item.trust?.manifestHash), "extensions endpoint missing manifest trust hash");
    assertSmoke(extensions.summary.trust && typeof extensions.summary.trust === "object", "extensions endpoint missing trust summary");
    smokeStep("extension-trust");
    const extensionTrust = await requestJson(baseUrl, "/api/extension-trust?limit=10");
    assertSmoke(extensionTrust.trust?.policy?.localChecksumAudit === true, "extension trust audit missing checksum policy");
    assertSmoke(extensionTrust.trust?.policy?.localSignatureVerification === true, "extension trust audit missing signature policy");
    assertSmoke(extensionTrust.trust?.summary?.signatureVerified >= 1, "extension trust audit missing verified signature summary");
    assertSmoke(extensionTrust.trust?.rows?.some((item) => item.name === "api-smoke-skill" && item.trust?.status === "signature-verified"), "extension trust audit missing verified fixture row");
    assertSmoke(extensionTrust.trust?.guardrails?.some((item) => item.includes("SHA-256")), "extension trust audit missing checksum guardrail");
    smokeStep("tools-with-extension");
    const toolsWithExtension = await requestJson(baseUrl, "/api/tools");
    assertSmoke(toolsWithExtension.tools.some((item) => item.name === "api-smoke-skill.smoke_probe"), "tools endpoint missing extension tool bridge");
    assertSmoke(toolsWithExtension.tools.every((item) => item.policy?.access), "tools endpoint missing tool policy access");
    smokeStep("extension-tool-call-plan");
    const extensionToolCallPlan = await requestJson(baseUrl, "/api/extension-tool-call", {
      method: "POST",
      body: JSON.stringify({
        extensionName: "api-smoke-skill",
        toolName: "smoke_probe",
        arguments: {}
      })
    });
    assertSmoke(extensionToolCallPlan.status === "approval_required", "extension tool call should require approval");
    assertSmoke(extensionToolCallPlan.approval?.id, "extension tool call missing approval request");
    smokeStep("extension-tool-approval");
    const approvedExtensionToolCall = await requestJson(baseUrl, "/api/approval", {
      method: "PATCH",
      body: JSON.stringify({ id: extensionToolCallPlan.approval.id, decision: "approved", note: "api smoke extension tool approval" })
    });
    assertSmoke(approvedExtensionToolCall.status === "approved", "extension tool approval did not update status");
    smokeStep("extension-tool-execute");
    const extensionToolExecution = await requestJson(baseUrl, "/api/approval-execute", {
      method: "POST",
      body: JSON.stringify({ id: extensionToolCallPlan.approval.id })
    });
    assertSmoke(extensionToolExecution.execution?.executed === true, "approved extension tool call did not execute");
    assertSmoke(extensionToolExecution.execution?.result?.mappedTool === "repo_map", "extension tool execution did not use mapped read-only tool");
    assertSmoke(String(extensionToolExecution.execution?.result?.result || "").includes("fileCount"), "extension tool execution result missing repo map evidence");

    smokeStep("mcp-fixture");
    cleanup.mcpFixturePath = path.join(MCP_DIR, "servers.json");
    await fs.mkdir(MCP_DIR, { recursive: true });
    const originalMcpFixture = await fs.readFile(cleanup.mcpFixturePath, "utf8").catch(() => null);
    if (originalMcpFixture !== null && !originalMcpFixture.includes('"api-smoke-mcp"')) {
      cleanup.mcpOriginalFixture = originalMcpFixture;
    }
    await fs.writeFile(path.join(MCP_DIR, "servers.json"), JSON.stringify({
      mcpServers: {
        "api-smoke-mcp": {
          command: process.execPath,
          args: [path.join(APP_ROOT, "server.js"), "--mcp-smoke-server"],
          env: { API_SMOKE_MCP: "1" }
        }
      }
    }, null, 2));
    smokeStep("mcp");
    const mcp = await requestJson(baseUrl, "/api/mcp");
    assertSmoke(mcp.servers.some((item) => item.name === "api-smoke-mcp"), "MCP endpoint missing fixture server");
    assertSmoke(mcp.summary.stdio >= 1, "MCP endpoint missing stdio summary");
    smokeStep("mcp-probe");
    const mcpProbe = await requestJson(baseUrl, "/api/mcp?probe=1", { timeoutMs: 120000 });
    const probedMcp = mcpProbe.servers.find((item) => item.name === "api-smoke-mcp");
    assertSmoke(probedMcp?.probe?.status === "probed", `MCP probe did not complete handshake: ${JSON.stringify(probedMcp?.probe || mcpProbe.errors || mcpProbe).slice(0, 1000)}`);
    assertSmoke(probedMcp?.probe?.counts?.tools === 1, "MCP probe missing tool listing");
    assertSmoke(probedMcp?.probe?.counts?.resources === 1, "MCP probe missing resource listing");
    assertSmoke(probedMcp?.probe?.counts?.prompts === 1, "MCP probe missing prompt listing");
    assertSmoke(mcpProbe.summary.probed >= 1, "MCP probe summary missing probed count");
    smokeStep("mcp-resource");
    const mcpResourceRead = await requestJson(baseUrl, "/api/mcp-resource", {
      method: "POST",
      timeoutMs: 120000,
      body: JSON.stringify({
        serverName: "api-smoke-mcp",
        uri: "forge://smoke/resource"
      })
    });
    assertSmoke(mcpResourceRead.policy?.executesTool === false, "MCP resource read should not execute tools");
    assertSmoke(mcpResourceRead.policy?.writesFiles === false, "MCP resource read should not write files");
    assertSmoke(mcpResourceRead.contents?.some((item) => item.text?.includes("Forge MCP smoke resource content")), "MCP resource read missing fixture content");
    smokeStep("mcp-tool-call-plan");
    const mcpToolCallPlan = await requestJson(baseUrl, "/api/mcp-tool-call", {
      method: "POST",
      body: JSON.stringify({
        serverName: "api-smoke-mcp",
        toolName: "smoke_tool",
        arguments: { value: "approved-call" }
      })
    });
    assertSmoke(mcpToolCallPlan.status === "approval_required", "MCP tool call should require approval");
    assertSmoke(mcpToolCallPlan.approval?.id, "MCP tool call missing approval request");
    smokeStep("mcp-tool-approval");
    const approvedMcpToolCall = await requestJson(baseUrl, "/api/approval", {
      method: "PATCH",
      body: JSON.stringify({ id: mcpToolCallPlan.approval.id, decision: "approved", note: "api smoke MCP tool approval" })
    });
    assertSmoke(approvedMcpToolCall.status === "approved", "MCP tool approval did not update status");
    smokeStep("mcp-tool-execute");
    const mcpToolExecution = await requestJson(baseUrl, "/api/approval-execute", {
      method: "POST",
      timeoutMs: 120000,
      body: JSON.stringify({ id: mcpToolCallPlan.approval.id })
    });
    assertSmoke(
      mcpToolExecution.execution?.executed === true,
      `approved MCP tool call did not execute: ${JSON.stringify(mcpToolExecution).slice(0, 1000)}`
    );
    assertSmoke(
      JSON.stringify(mcpToolExecution.execution?.result || {}).includes("approved-call"),
      "approved MCP tool call result missing fixture response"
    );

    smokeStep("asset-fixtures");
    cleanup.assetFixturePath = path.join(currentWorkspace, `.forge-asset-smoke-${Date.now()}.png`);
    await fs.writeFile(cleanup.assetFixturePath, createSmokePngBuffer({ r: 255, g: 0, b: 0, a: 255 }));
    cleanup.svgAssetFixturePath = path.join(currentWorkspace, `.forge-asset-smoke-${Date.now()}.svg`);
    await fs.writeFile(cleanup.svgAssetFixturePath, [
      `<svg width="120" height="40" viewBox="0 0 120 40" xmlns="http://www.w3.org/2000/svg" aria-label="Forge SVG aria smoke">`,
      "<title>Forge SVG smoke title</title>",
      "<desc>Forge SVG smoke description</desc>",
      "<text x=\"4\" y=\"22\">Forge SVG smoke text</text>",
      "</svg>"
    ].join(""), "utf8");
    cleanup.dataAssetFixturePath = path.join(currentWorkspace, `.forge-asset-smoke-${Date.now()}.csv`);
    await fs.writeFile(cleanup.dataAssetFixturePath, "name,value\nalpha,1\nbeta,2\n", "utf8");
    cleanup.parquetDataAssetFixturePath = path.join(currentWorkspace, `.forge-asset-smoke-${Date.now()}.parquet`);
    await fs.writeFile(cleanup.parquetDataAssetFixturePath, createSmokeParquetBuffer());
    cleanup.documentAssetFixturePath = path.join(currentWorkspace, `.forge-asset-smoke-${Date.now()}.docx`);
    await fs.writeFile(cleanup.documentAssetFixturePath, createZipBuffer([
      {
        name: "[Content_Types].xml",
        content: "<?xml version=\"1.0\"?><Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\"></Types>"
      },
      {
        name: "word/document.xml",
        content: "<?xml version=\"1.0\"?><w:document xmlns:w=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\"><w:body><w:p><w:r><w:t>Forge DOCX smoke text</w:t></w:r></w:p></w:body></w:document>"
      }
    ]));
    cleanup.legacyDocumentAssetFixturePath = path.join(currentWorkspace, `.forge-asset-smoke-${Date.now()}.doc`);
    await fs.writeFile(cleanup.legacyDocumentAssetFixturePath, createSmokeLegacyOfficeBuffer());
    cleanup.pdfAssetFixturePath = path.join(currentWorkspace, `.forge-asset-smoke-${Date.now()}.pdf`);
    await fs.writeFile(cleanup.pdfAssetFixturePath, createSmokePdfBuffer());
    cleanup.compressedPdfAssetFixturePath = path.join(currentWorkspace, `.forge-asset-smoke-compressed-${Date.now()}.pdf`);
    await fs.writeFile(cleanup.compressedPdfAssetFixturePath, createSmokePdfBuffer({ compressed: true }));
    cleanup.mediaAssetFixturePath = path.join(currentWorkspace, `.forge-asset-smoke-${Date.now()}.wav`);
    await fs.writeFile(cleanup.mediaAssetFixturePath, createSmokeWavBuffer());
    smokeStep("assets");
    const assets = await requestJson(baseUrl, "/api/assets");
    const assetFixtureName = toPosix(path.relative(currentWorkspace, cleanup.assetFixturePath));
    const svgAssetFixtureName = toPosix(path.relative(currentWorkspace, cleanup.svgAssetFixturePath));
    const dataAssetFixtureName = toPosix(path.relative(currentWorkspace, cleanup.dataAssetFixturePath));
    const parquetDataAssetFixtureName = toPosix(path.relative(currentWorkspace, cleanup.parquetDataAssetFixturePath));
    const documentAssetFixtureName = toPosix(path.relative(currentWorkspace, cleanup.documentAssetFixturePath));
    const legacyDocumentAssetFixtureName = toPosix(path.relative(currentWorkspace, cleanup.legacyDocumentAssetFixturePath));
    const pdfAssetFixtureName = toPosix(path.relative(currentWorkspace, cleanup.pdfAssetFixturePath));
    const compressedPdfAssetFixtureName = toPosix(path.relative(currentWorkspace, cleanup.compressedPdfAssetFixturePath));
    const mediaAssetFixtureName = toPosix(path.relative(currentWorkspace, cleanup.mediaAssetFixturePath));
    assertSmoke(assets.assets.some((item) => item.path === assetFixtureName && item.type === "image"), "assets endpoint missing image fixture");
    assertSmoke(assets.assets.some((item) => item.path === svgAssetFixtureName && item.type === "image"), "assets endpoint missing svg image fixture");
    assertSmoke(assets.assets.some((item) => item.path === dataAssetFixtureName && item.type === "data"), "assets endpoint missing data fixture");
    assertSmoke(assets.assets.some((item) => item.path === parquetDataAssetFixtureName && item.type === "data"), "assets endpoint missing parquet data fixture");
    assertSmoke(assets.assets.some((item) => item.path === documentAssetFixtureName && item.type === "document"), "assets endpoint missing document fixture");
    assertSmoke(assets.assets.some((item) => item.path === legacyDocumentAssetFixtureName && item.type === "document"), "assets endpoint missing legacy document fixture");
    assertSmoke(assets.assets.some((item) => item.path === pdfAssetFixtureName && item.type === "document"), "assets endpoint missing pdf fixture");
    assertSmoke(assets.assets.some((item) => item.path === compressedPdfAssetFixtureName && item.type === "document"), "assets endpoint missing compressed pdf fixture");
    assertSmoke(assets.assets.some((item) => item.path === mediaAssetFixtureName && item.type === "media"), "assets endpoint missing media fixture");
    assertSmoke(assets.policy?.access === "metadata-and-inspection", "assets endpoint missing inspection policy");
    smokeStep("asset-inspect:image");
    const imageInspection = await requestJson(baseUrl, `/api/asset-inspect?path=${encodeURIComponent(assetFixtureName)}`);
    assertSmoke(imageInspection.image?.format === "png", "asset inspection did not read png header");
    assertSmoke(imageInspection.image?.width === 1 && imageInspection.image?.height === 1, "asset inspection did not read png dimensions");
    assertSmoke(imageInspection.vision?.available === true, "asset inspection did not generate image vision summary");
    assertSmoke(imageInspection.vision?.summary?.dominantColors?.[0]?.color, "asset inspection missing dominant color");
    assertSmoke(imageInspection.ocr?.engine === "tesseract", "asset inspection missing OCR capability probe");
    assertSmoke(typeof imageInspection.ocr?.enabled === "boolean", "asset inspection missing OCR execution switch state");
    assertSmoke(typeof imageInspection.ocr?.cached === "boolean", "asset inspection missing OCR cache state");
    assertSmoke("textPath" in (imageInspection.ocr || {}) || imageInspection.ocr?.reason, "asset inspection missing OCR artifact evidence");
    smokeStep("asset-inspect:svg");
    const svgInspection = await requestJson(baseUrl, `/api/asset-inspect?path=${encodeURIComponent(svgAssetFixtureName)}`);
    assertSmoke(svgInspection.image?.format === "svg", "asset inspection did not identify svg image");
    assertSmoke(svgInspection.image?.width === 120 && svgInspection.image?.height === 40, "asset inspection did not extract svg dimensions");
    assertSmoke(svgInspection.ocr?.engine === "local-svg-text-extractor", "asset inspection missing SVG text extractor");
    assertSmoke(svgInspection.ocr?.textSample?.includes("Forge SVG smoke text"), "asset inspection did not extract SVG text");
    assertSmoke(svgInspection.ocr?.textBlocks?.some((item) => item.includes("Forge SVG aria smoke")), "asset inspection did not extract SVG aria label");
    smokeStep("asset-inspect:data");
    const dataInspection = await requestJson(baseUrl, `/api/asset-inspect?path=${encodeURIComponent(dataAssetFixtureName)}`);
    assertSmoke(dataInspection.data?.headers?.includes("name"), "asset inspection did not parse csv headers");
    assertSmoke(dataInspection.data?.rows?.length >= 2, "asset inspection did not parse csv rows");
    smokeStep("asset-inspect:parquet");
    const parquetInspection = await requestJson(baseUrl, `/api/asset-inspect?path=${encodeURIComponent(parquetDataAssetFixtureName)}`);
    assertSmoke(parquetInspection.data?.format === "parquet", "asset inspection did not identify parquet data");
    assertSmoke(parquetInspection.data?.footerAvailable === true, "asset inspection did not detect parquet footer");
    assertSmoke(parquetInspection.data?.metadataStrings?.some((item) => item.includes("forge_parquet_smoke")), "asset inspection did not extract parquet metadata strings");
    smokeStep("asset-inspect:docx");
    const documentInspection = await requestJson(baseUrl, `/api/asset-inspect?path=${encodeURIComponent(documentAssetFixtureName)}`);
    assertSmoke(documentInspection.document?.packageType === "office-open-xml", "asset inspection did not identify OOXML document");
    assertSmoke(documentInspection.document?.textSample?.includes("Forge DOCX smoke text"), "asset inspection did not extract docx text");
    smokeStep("asset-inspect:legacy-doc");
    const legacyDocumentInspection = await requestJson(baseUrl, `/api/asset-inspect?path=${encodeURIComponent(legacyDocumentAssetFixtureName)}`);
    assertSmoke(legacyDocumentInspection.document?.packageType === "compound-file-binary", "asset inspection did not identify legacy Office binary document");
    assertSmoke(legacyDocumentInspection.document?.streamHints?.includes("WordDocument"), "asset inspection did not extract legacy Office stream hints");
    assertSmoke(legacyDocumentInspection.document?.textSample?.includes("Forge legacy DOC smoke text"), "asset inspection did not extract legacy Office text sample");
    smokeStep("asset-inspect:pdf");
    const pdfInspection = await requestJson(baseUrl, `/api/asset-inspect?path=${encodeURIComponent(pdfAssetFixtureName)}`);
    assertSmoke(pdfInspection.document?.format === "pdf", "asset inspection did not identify PDF document");
    assertSmoke(pdfInspection.document?.textSample?.includes("Forge PDF smoke text"), "asset inspection did not extract PDF text sample");
    assertSmoke(pdfInspection.document?.layout?.pageBoxes?.[0]?.width === 612, "asset inspection did not extract PDF page box width");
    assertSmoke(
      pdfInspection.document?.layout?.textBlocks?.some((block) => block.text.includes("Forge PDF smoke text") && block.x === 72 && block.y === 720),
      "asset inspection did not extract positioned PDF text block"
    );
    smokeStep("asset-inspect:compressed-pdf");
    const compressedPdfInspection = await requestJson(baseUrl, `/api/asset-inspect?path=${encodeURIComponent(compressedPdfAssetFixtureName)}`);
    assertSmoke(compressedPdfInspection.document?.format === "pdf", "asset inspection did not identify compressed PDF document");
    assertSmoke(compressedPdfInspection.document?.textSample?.includes("Forge compressed PDF smoke text"), "asset inspection did not extract compressed PDF text sample");
    assertSmoke(compressedPdfInspection.document?.layout?.compressedStreamCount >= 1, "asset inspection did not count compressed PDF stream");
    assertSmoke(compressedPdfInspection.document?.layout?.filters?.includes("FlateDecode"), "asset inspection did not report FlateDecode filter");
    assertSmoke(
      compressedPdfInspection.document?.layout?.textBlocks?.some((block) => block.compressed === true && block.filter === "FlateDecode" && block.text.includes("Forge compressed PDF smoke text") && block.x === 96 && block.y === 700),
      "asset inspection did not extract positioned compressed PDF text block"
    );
    smokeStep("asset-inspect:media");
    const mediaInspection = await requestJson(baseUrl, `/api/asset-inspect?path=${encodeURIComponent(mediaAssetFixtureName)}`);
    assertSmoke(mediaInspection.media?.format === "wav", "asset inspection did not parse wav media");
    assertSmoke(mediaInspection.media?.durationSeconds > 0, "asset inspection did not calculate media duration");
    assertSmoke(mediaInspection.transcription?.engine === "whisper", "asset inspection missing transcription engine probe");
    assertSmoke(typeof mediaInspection.transcription?.cached === "boolean", "asset inspection missing transcription cache status");
    assertSmoke(mediaInspection.transcription?.reason || mediaInspection.transcription?.transcriptPath, "asset inspection missing transcription audit evidence");

    smokeStep("apply-conflict");
    cleanup.applyFixtureAPath = path.join(currentWorkspace, `.forge-apply-smoke-a-${Date.now()}.txt`);
    cleanup.applyFixtureBPath = path.join(currentWorkspace, `.forge-apply-smoke-b-${Date.now()}.txt`);
    await fs.writeFile(cleanup.applyFixtureAPath, "alpha\n", "utf8");
    await fs.writeFile(cleanup.applyFixtureBPath, "bravo\n", "utf8");
    const applyFixtureAName = toPosix(path.relative(currentWorkspace, cleanup.applyFixtureAPath));
    const applyFixtureBName = toPosix(path.relative(currentWorkspace, cleanup.applyFixtureBPath));
    const conflictingDiff = [
      `diff --git a/${applyFixtureAName} b/${applyFixtureAName}`,
      `--- a/${applyFixtureAName}`,
      `+++ b/${applyFixtureAName}`,
      "@@ -1 +1 @@",
      "-alpha",
      "+alpha changed",
      `diff --git a/${applyFixtureBName} b/${applyFixtureBName}`,
      `--- a/${applyFixtureBName}`,
      `+++ b/${applyFixtureBName}`,
      "@@ -1 +1 @@",
      "-wrong",
      "+bravo changed",
      ""
    ].join("\n");
    const blockedApply = await requestJson(baseUrl, "/api/apply", {
      method: "POST",
      body: JSON.stringify({ diff: conflictingDiff, prompt: "api smoke conflicting apply" })
    });
    assertSmoke(blockedApply.status === "conflict", "conflicting apply should be blocked before write");
    assertSmoke(blockedApply.policy?.writesFiles === false, "conflicting apply should not write files");
    assertSmoke(blockedApply.checkpoint === null, "conflicting apply should not create checkpoint");
    assertSmoke((await fs.readFile(cleanup.applyFixtureAPath, "utf8")) === "alpha\n", "conflicting apply changed applicable file without partial approval");
    assertSmoke((await fs.readFile(cleanup.applyFixtureBPath, "utf8")) === "bravo\n", "conflicting apply changed conflicting file");
    const conflictPreview = await requestJson(baseUrl, "/api/diff-conflicts", {
      method: "POST",
      body: JSON.stringify({ diff: conflictingDiff })
    });
    assertSmoke(conflictPreview.policy?.writesFiles === false, "diff conflict preview should be read-only");
    assertSmoke(conflictPreview.summary?.conflictHunks >= 1, "diff conflict preview missing conflict hunk count");
    assertSmoke(
      conflictPreview.conflictPreviews?.some((item) => item.path === applyFixtureBName && item.marker.includes("<<<<<<< CURRENT") && item.marker.includes(">>>>>>> PROPOSED")),
      "diff conflict preview missing marker block"
    );
    assertSmoke((await fs.readFile(cleanup.applyFixtureBPath, "utf8")) === "bravo\n", "diff conflict preview changed file");
    const resolutionDraft = await requestJson(baseUrl, "/api/conflict-resolution-draft", {
      method: "POST",
      body: JSON.stringify({
        diff: conflictingDiff,
        prompt: "api smoke conflict resolution draft",
        resolutions: [{
          path: applyFixtureBName,
          oldStart: 1,
          resolved: "bravo resolved"
        }]
      })
    });
    assertSmoke(resolutionDraft.policy?.writesFiles === false, "conflict resolution draft should not write files");
    assertSmoke(resolutionDraft.policy?.updatesPendingProposal === true, "conflict resolution draft should update pending proposal");
    assertSmoke(resolutionDraft.summary?.conflictHunks === 0, "conflict resolution draft should be applicable");
    assertSmoke(resolutionDraft.proposal?.type === "conflict_resolution", "conflict resolution draft missing proposal type");
    assertSmoke(resolutionDraft.proposal?.diff?.includes("-bravo") && resolutionDraft.proposal?.diff?.includes("+bravo resolved"), "conflict resolution draft missing resolved diff");
    assertSmoke(resolutionDraft.goal?.pendingProposalId?.startsWith("resolution-"), "conflict resolution draft missing pending proposal id");
    assertSmoke((await fs.readFile(cleanup.applyFixtureBPath, "utf8")) === "bravo\n", "conflict resolution draft changed file");
    const partialApply = await requestJson(baseUrl, "/api/apply", {
      method: "POST",
      body: JSON.stringify({ diff: conflictingDiff, prompt: "api smoke partial apply", allowPartial: true, skipChecks: true, skipGit: true })
    });
    assertSmoke(partialApply.status?.startsWith("partial_"), "partial apply missing partial status");
    assertSmoke(partialApply.policy?.allowPartial === true, "partial apply missing allowPartial policy");
    assertSmoke(partialApply.applied?.some((item) => item.path === applyFixtureAName), "partial apply did not write applicable file");
    assertSmoke(partialApply.conflicts?.some((item) => item.path === applyFixtureBName), "partial apply did not preserve conflict evidence");
    assertSmoke(partialApply.recovery?.status === partialApply.status, "partial apply recovery missing status");
    assertSmoke(partialApply.recovery?.changedFiles?.includes(applyFixtureAName), "partial apply recovery missing changed file");
    assertSmoke(partialApply.recovery?.verificationCommands?.some((item) => item.command === "node --check server.js"), "partial apply recovery missing syntax command");
    assertSmoke(partialApply.recovery?.nextActions?.length >= 1, "partial apply recovery missing next action");
    assertSmoke((await fs.readFile(cleanup.applyFixtureAPath, "utf8")) === "alpha changed\n", "partial apply did not update applicable file");
    assertSmoke((await fs.readFile(cleanup.applyFixtureBPath, "utf8")) === "bravo\n", "partial apply changed conflicting file");
    cleanup.applyConflictCheckpointPath = partialApply.checkpoint?.id ? path.join(CHECKPOINT_DIR, `${partialApply.checkpoint.id}.json`) : "";
    cleanup.applyHunkFixturePath = path.join(currentWorkspace, `.forge-apply-hunk-smoke-${Date.now()}.txt`);
    await fs.writeFile(cleanup.applyHunkFixturePath, "one\ntwo\nthree\nfour\n", "utf8");
    const applyHunkFixtureName = toPosix(path.relative(currentWorkspace, cleanup.applyHunkFixturePath));
    const hunkConflictingDiff = [
      `diff --git a/${applyHunkFixtureName} b/${applyHunkFixtureName}`,
      `--- a/${applyHunkFixtureName}`,
      `+++ b/${applyHunkFixtureName}`,
      "@@ -1 +1 @@",
      "-one",
      "+one changed",
      "@@ -4 +4 @@",
      "-wrong",
      "+four changed",
      ""
    ].join("\n");
    const hunkPartialApply = await requestJson(baseUrl, "/api/apply", {
      method: "POST",
      body: JSON.stringify({
        diff: hunkConflictingDiff,
        prompt: "api smoke partial hunk apply",
        allowPartial: true,
        skipChecks: true,
        skipGit: true,
        selectedHunks: [{ path: applyHunkFixtureName, selectedHunks: 1, totalHunks: 2 }]
      })
    });
    assertSmoke(hunkPartialApply.status?.startsWith("partial_"), "partial hunk apply missing partial status");
    assertSmoke(hunkPartialApply.policy?.supportsPartialHunks === true, "partial hunk apply missing policy evidence");
    assertSmoke(hunkPartialApply.analysis?.summary?.applicableHunks === 1, "partial hunk apply did not count applicable hunk");
    assertSmoke(hunkPartialApply.analysis?.summary?.conflictHunks === 1, "partial hunk apply did not count conflicting hunk");
    assertSmoke(hunkPartialApply.selectedHunks?.[0]?.path === applyHunkFixtureName, "partial hunk apply missing selected hunk audit");
    assertSmoke(hunkPartialApply.policy?.selectedHunks === 1, "partial hunk apply missing selected hunk policy count");
    assertSmoke(hunkPartialApply.recovery?.selectedHunks?.[0]?.path === applyHunkFixtureName, "partial hunk apply recovery missing selected hunk audit");
    assertSmoke(hunkPartialApply.applied?.some((item) => item.path === applyHunkFixtureName && item.status === "partial" && item.applicableHunks === 1), "partial hunk apply did not write partial file evidence");
    assertSmoke(hunkPartialApply.conflicts?.some((item) => item.path === applyHunkFixtureName && item.hunk?.includes("@@ -4")), "partial hunk apply did not preserve hunk conflict evidence");
    assertSmoke((await fs.readFile(cleanup.applyHunkFixturePath, "utf8")) === "one changed\ntwo\nthree\nfour\n", "partial hunk apply did not update only applicable hunk");
    cleanup.applyHunkCheckpointPath = hunkPartialApply.checkpoint?.id ? path.join(CHECKPOINT_DIR, `${hunkPartialApply.checkpoint.id}.json`) : "";

    await fs.mkdir(QUEUE_DIR, { recursive: true });
    const staleQueueEntries = await fs.readdir(QUEUE_DIR, { withFileTypes: true }).catch(() => []);
    for (const entry of staleQueueEntries) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
      const full = path.join(QUEUE_DIR, entry.name);
      const item = await readJsonOrNull(full);
      if (item?.workspace === currentWorkspace && String(item.prompt || "").startsWith("api smoke ")) {
        await fs.rm(full, { force: true }).catch(() => {});
      }
    }
    const queueSmokeGroup = `api-smoke-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const queued = await requestJson(baseUrl, "/api/queue", {
      method: "POST",
      body: JSON.stringify({ prompt: "api smoke queued task", priority: 3, retryLimit: 2, isolationGroup: `${queueSmokeGroup}-a` })
    });
    assertSmoke(queued.id && queued.status === "queued", "queue create failed");
    assertSmoke(queued.priority === 3 && queued.retryLimit === 2, "queue create missing priority/retry metadata");
    assertSmoke(queued.isolationGroup === `${queueSmokeGroup}-a`, "queue create missing isolation group");
    cleanup.queuePath = path.join(QUEUE_DIR, `${queued.id}.json`);
    const queuedNext = await requestJson(baseUrl, "/api/queue", {
      method: "POST",
      body: JSON.stringify({ prompt: "api smoke next queued task", priority: 100, retryLimit: 1, isolationGroup: `${queueSmokeGroup}-b` })
    });
    cleanup.extraQueuePath = path.join(QUEUE_DIR, `${queuedNext.id}.json`);
    const queuedConflict = await requestJson(baseUrl, "/api/queue", {
      method: "POST",
      body: JSON.stringify({ prompt: "api smoke conflicting queued task", priority: 8, retryLimit: 0, isolationGroup: `${queueSmokeGroup}-a` })
    });
    cleanup.conflictQueuePath = path.join(QUEUE_DIR, `${queuedConflict.id}.json`);

    const active = await requestJson(baseUrl, "/api/queue", {
      method: "PATCH",
      body: JSON.stringify({ id: queued.id, status: "active" })
    });
    assertSmoke(active.status === "active", "queue activate failed");
    const conflictActivation = await requestJson(baseUrl, "/api/queue", {
      method: "PATCH",
      body: JSON.stringify({ id: queuedConflict.id, status: "active" })
    }).catch((error) => ({ error: error.message }));
    assertSmoke(String(conflictActivation.error || "").includes("队列隔离组"), "queue isolation did not block same-group active task");
    const queueIsolation = await requestJson(baseUrl, "/api/queue-isolation?limit=20");
    assertSmoke(queueIsolation.policy?.singleActivePerIsolationGroup === true, "queue isolation missing policy");
    assertSmoke(queueIsolation.summary?.queuedBlockedByIsolation >= 1, "queue isolation report missing blocked queued task");
    assertSmoke(queueIsolation.rows?.some((row) => row.isolationGroup === `${queueSmokeGroup}-a` && row.active.some((item) => item.id === queued.id)), "queue isolation report missing active group owner");
    const retried = await requestJson(baseUrl, "/api/queue", {
      method: "PATCH",
      body: JSON.stringify({ id: queuedNext.id, status: "retry" })
    });
    assertSmoke(retried.status === "queued" && retried.retryCount === 1, "queue retry did not increment retry count");
    const completed = await requestJson(baseUrl, "/api/queue", {
      method: "PATCH",
      body: JSON.stringify({ id: queued.id, status: "done", autoNext: true })
    });
    assertSmoke(completed.status === "done", "queue completion failed");
    assertSmoke(completed.autoNext?.id === queuedNext.id && completed.autoNext?.status === "active", "queue auto-next did not activate highest priority queued item");

    const queue = await requestJson(baseUrl, "/api/queue");
    assertSmoke(queue.queue.some((item) => item.id === queued.id), "queue list missing created item");
    assertSmoke(queue.queue.some((item) => item.id === queuedNext.id && item.status === "active"), "queue list missing auto-activated next item");

    await flushContextCompaction("api-smoke-queue");
    const queuedHealth = await requestJson(baseUrl, "/api/health");
    assertSmoke(queuedHealth.goal?.status === "active", "queue activation did not update goal state");
    let autoCompact = null;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      await sleep(250);
      autoCompact = await requestJson(baseUrl, "/api/context-compact");
      if (autoCompact.compact?.autoGenerated === true) break;
    }
    assertSmoke(autoCompact.compact?.autoGenerated === true, "automatic context compaction did not run after state change");
    assertSmoke(autoCompact.compact?.autoReason, "automatic context compaction missing reason");

    const reviews = await requestJson(baseUrl, "/api/reviews");
    assertSmoke(Array.isArray(reviews.reviews), "reviews endpoint did not include artifact list");
    const smokeReviewArtifact = await writeReviewArtifact({
      prompt: "api smoke review comments",
      reply: "Review comments fixture",
      review: [{
        severity: "warning",
        message: "Line-level review fixture",
        file: "server.js",
        line: "1"
      }],
      commands: [],
      git: await getGitSummary()
    });
    const reviewComments = await requestJson(baseUrl, "/api/review-comments", {
      method: "POST",
      body: JSON.stringify({ id: smokeReviewArtifact.id })
    });
    assertSmoke(reviewComments.summary?.readyComments === 1, "review comments draft missing ready line comment");
    assertSmoke(reviewComments.policy?.writesRemoteReview === false, "review comments draft should not write remote review");

    const blockedCommand = await requestJson(baseUrl, "/api/command", {
      method: "POST",
      body: JSON.stringify({ command: "curl http://example.com" })
    });
    assertSmoke(blockedCommand.blocked === true, "command policy did not block network command");
    assertSmoke(blockedCommand.policy?.allowed === false, "blocked command missing policy evidence");
    assertSmoke(blockedCommand.approval?.id, "blocked command missing approval request");

    const processes = await requestJson(baseUrl, "/api/processes");
    assertSmoke(Array.isArray(processes.processes), "process endpoint did not include process list");

    const blockedProcess = await requestJson(baseUrl, "/api/processes", {
      method: "POST",
      body: JSON.stringify({ command: "curl http://example.com" })
    });
    assertSmoke(blockedProcess.blocked === true, "process policy did not block network command");
    assertSmoke(blockedProcess.policy?.allowed === false, "blocked process missing policy evidence");
    assertSmoke(blockedProcess.approval?.id, "blocked process missing approval request");

    const approvals = await requestJson(baseUrl, "/api/approvals");
    assertSmoke(approvals.approvals.some((item) => item.id === blockedCommand.approval.id), "approval list missing blocked command");
    const approvalDetail = await requestJson(baseUrl, `/api/approval?id=${encodeURIComponent(blockedCommand.approval.id)}`);
    assertSmoke(approvalDetail.policy?.allowed === false, "approval detail missing policy");
    const approvedDecision = await requestJson(baseUrl, "/api/approval", {
      method: "PATCH",
      body: JSON.stringify({ id: blockedCommand.approval.id, decision: "approved", note: "api smoke approval state transition" })
    });
    assertSmoke(approvedDecision.status === "approved", "approval decision did not update status");
    assertSmoke(approvedDecision.execution?.executed === false, "approval decision should not execute command");
    const approvedDetail = await requestJson(baseUrl, `/api/approval?id=${encodeURIComponent(blockedCommand.approval.id)}`);
    assertSmoke(approvedDetail.status === "approved", "approval detail did not persist decision");
    const blockedApprovalExecution = await requestJson(baseUrl, "/api/approval-execute", {
      method: "POST",
      body: JSON.stringify({ id: blockedCommand.approval.id })
    });
    assertSmoke(blockedApprovalExecution.execution?.executed === false, "blocked approval execution should not run unsafe command");
    assertSmoke(blockedApprovalExecution.execution?.blocked === true, "blocked approval execution missing blocked flag");
    assertSmoke(blockedApprovalExecution.execution?.escalation?.relativePath?.includes(".forge/escalations/"), "blocked command execution missing escalation artifact");
    cleanup.escalationPath = blockedApprovalExecution.execution?.escalation?.path || "";
    const explicitEscalation = await requestJson(baseUrl, "/api/approval-escalation", {
      method: "POST",
      body: JSON.stringify({ id: blockedCommand.approval.id, reason: "api smoke explicit escalation evidence" })
    });
    assertSmoke(explicitEscalation.escalation?.relativePath?.includes(".forge/escalations/"), "explicit approval escalation missing artifact");
    cleanup.explicitEscalationPath = explicitEscalation.escalation?.path || "";

    const approvedProcessDecision = await requestJson(baseUrl, "/api/approval", {
      method: "PATCH",
      body: JSON.stringify({ id: blockedProcess.approval.id, decision: "approved", note: "api smoke process escalation state transition" })
    });
    assertSmoke(approvedProcessDecision.status === "approved", "process approval decision did not update status");
    const blockedProcessExecution = await requestJson(baseUrl, "/api/approval-execute", {
      method: "POST",
      body: JSON.stringify({ id: blockedProcess.approval.id })
    });
    assertSmoke(blockedProcessExecution.execution?.executed === false, "blocked process execution should not run unsafe command");
    assertSmoke(blockedProcessExecution.execution?.blocked === true, "blocked process execution missing blocked flag");
    assertSmoke(blockedProcessExecution.execution?.escalation?.relativePath?.includes(".forge/escalations/"), "blocked process execution missing escalation artifact");
    cleanup.processEscalationPath = blockedProcessExecution.execution?.escalation?.path || "";

    const processSmokeToken = `forge-process-smoke-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    cleanup.processFixturePath = path.join(currentWorkspace, ".forge-process-smoke.js");
    await fs.writeFile(cleanup.processFixturePath, [
      "import http from 'node:http';",
      `const token = ${JSON.stringify(processSmokeToken)};`,
      "const server = http.createServer((req, res) => res.end(token));",
      "server.listen(0, '127.0.0.1', () => {",
      "  const { port } = server.address();",
      "  console.log(`${token} http://127.0.0.1:${port}`);",
      "  setTimeout(() => server.close(() => process.exit(0)), 45000);",
      "});",
      ""
    ].join("\n"), "utf8");
    const startedProcess = await requestJson(baseUrl, "/api/processes", {
      method: "POST",
      body: JSON.stringify({ command: "node .forge-process-smoke.js" })
    });
    assertSmoke(startedProcess.id && ["running", "exited"].includes(startedProcess.status), "managed process did not start");
    cleanup.processId = startedProcess.id;

    let runningProcess = null;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      await sleep(250);
      const runningProcesses = await requestJson(baseUrl, "/api/processes");
      runningProcess = runningProcesses.processes.find((item) => item.id === startedProcess.id);
      if (runningProcess?.probe?.status === "healthy") break;
    }
    assertSmoke(runningProcess, "started process missing from process list");
    assertSmoke(runningProcess.logPath?.includes(".forge/process-logs/"), "managed process missing persistent log path");
    assertSmoke(runningProcess.artifactPath?.includes(".forge/process-logs/"), "managed process missing persistent artifact path");
    const startupCommands = await requestJson(baseUrl, "/api/process-startup-commands?limit=8");
    assertSmoke(startupCommands.policy?.access === "read-only-startup-discovery", "startup discovery missing read-only policy");
    assertSmoke(startupCommands.policy?.readsRuntimeUrl === true, "startup discovery missing runtime URL policy");
    assertSmoke(startupCommands.runtimeUrl && typeof startupCommands.runtimeUrl === "object", "startup discovery missing runtime URL state");
    assertSmoke(startupCommands.commands?.[0]?.command === "node server.js", "startup discovery should prioritize expanded direct node start command");
    assertSmoke(startupCommands.commands?.some((item) => item.command === "npm start"), "startup discovery missing package start command fallback");
    assertSmoke(startupCommands.commands?.every((item) => item.policy?.allowed === true), "startup discovery returned non-policy-approved command");
    const processHealth = await requestJson(baseUrl, `/api/process-health?id=${encodeURIComponent(startedProcess.id)}`);
    assertSmoke(processHealth.policy?.access === "managed-process-health-and-artifacts", "process health missing read-only policy");
    assertSmoke(processHealth.summary?.total >= 1, "process health missing summary");
    assertSmoke(processHealth.rows?.some((item) => item.id === startedProcess.id), "process health missing started process row");
    assertSmoke(processHealth.rows?.some((item) => item.id === startedProcess.id && item.probe), "process health missing probe evidence");
    assertSmoke(processHealth.policy?.readsHealthRules === true, "process health missing rules policy");
    cleanup.processHealthRulesPath = path.join(currentWorkspace, ".forge", "process-health-rules.json");
    const originalProcessHealthRules = await fs.readFile(cleanup.processHealthRulesPath, "utf8").catch(() => null);
    cleanup.originalProcessHealthRules = originalProcessHealthRules;
    await fs.mkdir(path.dirname(cleanup.processHealthRulesPath), { recursive: true });
    await fs.writeFile(cleanup.processHealthRulesPath, JSON.stringify({
      rules: [{
        name: "api-smoke-process",
        commandIncludes: [".forge-process-smoke.js"],
        expectedStatus: 200,
        expectedOutputIncludes: [processSmokeToken],
        expectedOutputMatches: ["forge-process-smoke-\\d+"],
        expectedProbeUrlIncludes: ["127.0.0.1"],
        expectedProbeBodyIncludes: [processSmokeToken],
        expectedProbeBodyMatches: ["forge-process-smoke-\\d+"],
        unexpectedOutputIncludes: ["SyntaxError", "UnhandledPromiseRejection"],
        unexpectedOutputMatches: ["\\b(EADDRINUSE|ECONNREFUSED)\\b"],
        unexpectedProbeBodyIncludes: ["Internal Server Error"],
        unexpectedProbeBodyMatches: ["\\b(stack trace|fatal)\\b"]
      }]
    }, null, 2), "utf8");
    const processHealthWithRules = await requestJson(baseUrl, `/api/process-health?id=${encodeURIComponent(startedProcess.id)}`);
    const healthRuleRow = processHealthWithRules.rows?.find((item) => item.id === startedProcess.id);
    assertSmoke(processHealthWithRules.rules?.configured === true, "process health rules not detected");
    assertSmoke(processHealthWithRules.summary?.ruleMatched >= 1, "process health rules did not match process");
    assertSmoke(healthRuleRow?.probe?.bodySample?.includes(processSmokeToken), "process health probe missing response body evidence");
    assertSmoke(healthRuleRow?.rules?.status === "pass", "process health rule did not pass");
    assertSmoke(healthRuleRow?.rules?.results?.some((item) => item.expectedOutputIncludes?.includes(processSmokeToken)), "process health rule missing output expectation");
    assertSmoke(healthRuleRow?.rules?.results?.some((item) => item.expectedOutputMatches?.includes("forge-process-smoke-\\d+")), "process health rule missing output regex expectation");
    assertSmoke(healthRuleRow?.rules?.results?.some((item) => item.expectedProbeUrlIncludes?.includes("127.0.0.1")), "process health rule missing probe url expectation");
    assertSmoke(healthRuleRow?.rules?.results?.some((item) => item.expectedProbeBodyIncludes?.includes(processSmokeToken)), "process health rule missing probe body expectation");
    assertSmoke(healthRuleRow?.rules?.results?.some((item) => item.expectedProbeBodyMatches?.includes("forge-process-smoke-\\d+")), "process health rule missing probe body regex expectation");
    assertSmoke(healthRuleRow?.rules?.results?.some((item) => item.unexpectedOutputIncludes?.includes("SyntaxError")), "process health rule missing unexpected output guard");
    assertSmoke(healthRuleRow?.rules?.results?.some((item) => item.unexpectedOutputMatches?.includes("\\b(EADDRINUSE|ECONNREFUSED)\\b")), "process health rule missing unexpected output regex guard");
    assertSmoke(healthRuleRow?.rules?.results?.some((item) => item.unexpectedProbeBodyIncludes?.includes("Internal Server Error")), "process health rule missing unexpected probe body guard");
    assertSmoke(healthRuleRow?.rules?.results?.some((item) => item.unexpectedProbeBodyMatches?.includes("\\b(stack trace|fatal)\\b")), "process health rule missing unexpected probe body regex guard");
    cleanup.processLogPaths.push(path.join(APP_ROOT, runningProcess.logPath));
    cleanup.processLogPaths.push(path.join(APP_ROOT, runningProcess.artifactPath));
    let processSearch = null;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      processSearch = await requestJson(baseUrl, `/api/process-search?q=${encodeURIComponent(processSmokeToken)}`);
      if (processSearch.matches?.some((item) => item.processId === startedProcess.id)) break;
      await sleep(250);
    }
    assertSmoke(processSearch.matchCount >= 1, "managed process log search did not find fixture output");
    assertSmoke(processSearch.matches.some((item) => item.processId === startedProcess.id), "managed process log search missing started process id");
    assertSmoke(processSearch.policy?.access === "managed-process-output-and-artifacts", "managed process search missing persisted log policy");

    await requestJson(baseUrl, `/api/processes?id=${encodeURIComponent(startedProcess.id)}`, {
      method: "DELETE"
    });
    const exitedProcesses = await requestJson(baseUrl, "/api/processes");
    const exitedProcess = exitedProcesses.processes.find((item) => item.id === startedProcess.id);
    assertSmoke(exitedProcess && ["exited", "stopping"].includes(exitedProcess.status), "managed process did not record stop");
    const processHistory = await requestJson(baseUrl, "/api/process-history");
    assertSmoke(processHistory.count >= 1, "managed process history missing persisted artifacts");
    assertSmoke(processHistory.history.some((item) => item.id === startedProcess.id && item.outputTail.includes(processSmokeToken)), "managed process history missing fixture output");
    assertSmoke(processHistory.policy?.access === "managed-process-output-and-artifacts", "managed process history missing artifact policy");
    const processArtifactSearch = await requestJson(baseUrl, `/api/process-search?q=${encodeURIComponent(processSmokeToken)}`);
    assertSmoke(processArtifactSearch.searchedArtifacts >= 1, "managed process log search did not inspect persisted artifacts");
    assertSmoke(processArtifactSearch.matches.some((item) => item.processId === startedProcess.id), "persisted managed process log search missing started process id");

    const diff = await requestJson(baseUrl, "/api/diff");
    assertSmoke(typeof diff.available === "boolean", "diff endpoint missing availability flag");

    const handoff = await requestJson(baseUrl, "/api/handoff", {
      method: "POST",
      body: JSON.stringify({ prompt: "api smoke handoff" })
    });
    assertSmoke(handoff.id && handoff.body.includes("## Summary"), "handoff draft failed");
    cleanup.handoffPath = handoff.path;

    const contextSnapshot = await requestJson(baseUrl, "/api/context-snapshot", { method: "POST" });
    assertSmoke(contextSnapshot.snapshot?.workspace === APP_ROOT, "context snapshot missing workspace");
    assertSmoke(contextSnapshot.snapshot?.fileCount >= 1, "context snapshot missing files");
    const contextSnapshotRead = await requestJson(baseUrl, "/api/context-snapshot");
    assertSmoke(contextSnapshotRead.snapshot?.generatedAt, "context snapshot did not persist");
    const contextCompact = await requestJson(baseUrl, "/api/context-compact", { method: "POST" });
    assertSmoke(contextCompact.compact?.workspace === APP_ROOT, "context compact missing workspace");
    assertSmoke(contextCompact.compact?.summary?.length >= 1, "context compact missing summary");
    assertSmoke(contextCompact.compact?.repo?.fileCount >= 1, "context compact missing repo file count");
    const contextCompactRead = await requestJson(baseUrl, "/api/context-compact");
    assertSmoke(contextCompactRead.compact?.generatedAt, "context compact did not persist");
    const contextRollup = await requestJson(baseUrl, "/api/context-rollup", {
      method: "POST",
      body: JSON.stringify({ limit: 12 })
    });
    assertSmoke(contextRollup.rollup?.workspace === APP_ROOT, "context rollup missing workspace");
    assertSmoke(contextRollup.rollup?.summary?.entries >= 1, "context rollup missing entries");
    assertSmoke(Array.isArray(contextRollup.rollup?.entries), "context rollup missing entry list");
    const contextRollupSearch = await requestJson(baseUrl, "/api/context-rollup", {
      method: "POST",
      body: JSON.stringify({ limit: 12, query: "api smoke" })
    });
    assertSmoke(Array.isArray(contextRollupSearch.rollup?.entries), "context rollup query missing entry list");
    const contextRollupRead = await requestJson(baseUrl, "/api/context-rollup");
    assertSmoke(contextRollupRead.rollup?.generatedAt, "context rollup did not persist");
    const healthWithSnapshot = await requestJson(baseUrl, "/api/health");
    assertSmoke(healthWithSnapshot.contextSnapshot?.generatedAt, "health missing context snapshot");
    assertSmoke(healthWithSnapshot.contextRollup?.generatedAt, "health missing context rollup");
    assertSmoke(Array.isArray(healthWithSnapshot.recoverySummary?.cues), "health missing recovery summary cues");
    assertSmoke(Array.isArray(healthWithSnapshot.recoverySummary?.nextActions), "health missing recovery summary next actions");
    assertSmoke(Array.isArray(healthWithSnapshot.recoverySummary?.changedFiles), "health missing recovery changed files");
    assertSmoke(Array.isArray(healthWithSnapshot.recoverySummary?.selectedHunks), "health missing recovery selected hunks");
    assertSmoke(Array.isArray(healthWithSnapshot.recoverySummary?.failedCommands), "health missing recovery failed commands");
    assertSmoke(Array.isArray(healthWithSnapshot.recoverySummary?.verificationCommands), "health missing recovery verification commands");
    const createdThread = await requestJson(baseUrl, "/api/thread", {
      method: "POST",
      body: JSON.stringify({
        title: "api smoke thread",
        messages: [{ role: "agent", text: "thread smoke started" }]
      })
    });
    assertSmoke(createdThread.thread?.id?.startsWith("thread-"), "thread create missing id");
    assertSmoke(createdThread.thread?.policy?.storesConversation === true, "thread create missing policy");
    cleanup.threadPath = path.join(THREAD_DIR, `${createdThread.thread.id}.json`);
    const updatedThread = await requestJson(baseUrl, "/api/thread", {
      method: "PATCH",
      body: JSON.stringify({
        id: createdThread.thread.id,
        title: "api smoke thread updated",
        messages: [
          { role: "agent", text: "thread smoke started" },
          { role: "user", text: "thread smoke user message" }
        ],
        status: "awaiting_approval",
        pinned: true,
        pendingProposalId: "proposal-smoke"
      })
    });
    assertSmoke(updatedThread.thread?.summary?.messageCount === 2, "thread update did not persist messages");
    assertSmoke(updatedThread.thread?.summary?.title === "api smoke thread updated", "thread update did not persist title");
    assertSmoke(updatedThread.thread?.summary?.pinned === true, "thread update did not persist pin state");
    assertSmoke(updatedThread.thread?.summary?.pendingProposalId === "proposal-smoke", "thread update missing pending proposal");
    const threadDetail = await requestJson(baseUrl, `/api/thread?id=${encodeURIComponent(createdThread.thread.id)}`);
    assertSmoke(threadDetail.messages?.some((item) => item.text === "thread smoke user message"), "thread read missing persisted message");
    assertSmoke(threadDetail.policy?.writesWorkspaceFiles === false, "thread read should not write workspace files");
    const threadIndex = await requestJson(baseUrl, "/api/threads?limit=5");
    assertSmoke(threadIndex.threads?.some((item) => item.id === createdThread.thread.id), "thread index missing created thread");
    assertSmoke(threadIndex.threads?.[0]?.id === createdThread.thread.id, "pinned thread did not sort first");
    assertSmoke(threadIndex.policy?.scopedToWorkspace === true, "thread index missing workspace scope policy");
    const forkedThread = await requestJson(baseUrl, "/api/thread-fork", {
      method: "POST",
      body: JSON.stringify({ id: createdThread.thread.id, title: "api smoke fork" })
    });
    assertSmoke(forkedThread.thread?.id && forkedThread.thread.id !== createdThread.thread.id, "thread fork did not create a distinct thread");
    assertSmoke(forkedThread.thread?.summary?.parentThreadId === createdThread.thread.id, "thread fork missing parent thread id");
    assertSmoke(forkedThread.thread?.summary?.messageCount === 2, "thread fork did not copy messages");
    assertSmoke(forkedThread.thread?.policy?.copiedMessages === true, "thread fork missing copied message policy");
    cleanup.forkThreadPath = path.join(THREAD_DIR, `${forkedThread.thread.id}.json`);
    const archivedThread = await requestJson(baseUrl, "/api/thread", {
      method: "PATCH",
      body: JSON.stringify({ id: createdThread.thread.id, archived: true, status: "archived" })
    });
    assertSmoke(archivedThread.thread?.summary?.archived === true, "thread archive state did not persist");
    const visibleThreadIndex = await requestJson(baseUrl, "/api/threads?limit=5");
    assertSmoke(!visibleThreadIndex.threads?.some((item) => item.id === createdThread.thread.id), "archived thread should be hidden by default");
    const archivedThreadIndex = await requestJson(baseUrl, "/api/threads?limit=5&includeArchived=1");
    assertSmoke(archivedThreadIndex.threads?.some((item) => item.id === createdThread.thread.id), "archived thread index missing archived thread");
    assertSmoke(archivedThreadIndex.policy?.includeArchived === true, "archived thread index missing includeArchived policy");
    const verificationPlan = await requestJson(baseUrl, "/api/verification-plan", {
      method: "POST",
      body: JSON.stringify({ limit: 10, commands: ["node --check server.js"] })
    });
    assertSmoke(verificationPlan.plan?.policy?.executesCommands === false, "verification plan should not execute commands");
    assertSmoke(Array.isArray(verificationPlan.plan?.gates), "verification plan missing gates");
    assertSmoke(Array.isArray(verificationPlan.plan?.commands), "verification plan missing command plan");
    const ciStatus = await requestJson(baseUrl, "/api/ci-status", {
      method: "POST",
      body: JSON.stringify({ limit: 10, persist: true })
    });
    assertSmoke(ciStatus.status?.policy?.executesCommands === false, "CI status should not execute commands");
    assertSmoke(ciStatus.status?.policy?.pushes === false, "CI status should not push");
    assertSmoke(ciStatus.status?.policy?.createsRemotePr === false, "CI status should not create remote PR");
    assertSmoke(Array.isArray(ciStatus.status?.ci), "CI status missing CI config array");
    assertSmoke(Array.isArray(ciStatus.status?.localChecks), "CI status missing local checks");
    assertSmoke(ciStatus.status?.verificationPlan?.summary, "CI status missing verification plan summary");
    assertSmoke(ciStatus.status?.artifact?.path?.includes(".forge/remote-ci/"), "CI status missing persisted artifact path");
    if (ciStatus.status?.artifact?.path) cleanup.remoteCiArtifactPath = path.join(APP_ROOT, ciStatus.status.artifact.path);
    const mergeGate = await requestJson(baseUrl, "/api/merge-gate", {
      method: "POST",
      body: JSON.stringify({ prompt: "api smoke merge gate", limit: 10 })
    });
    assertSmoke(mergeGate.gate?.policy?.executesCommands === false, "merge gate should not execute commands");
    assertSmoke(mergeGate.gate?.policy?.pushes === false, "merge gate should not push");
    assertSmoke(mergeGate.gate?.policy?.createsRemotePr === false, "merge gate should not create remote PR");
    assertSmoke(Array.isArray(mergeGate.gate?.gates), "merge gate missing gates");
    assertSmoke(mergeGate.gate?.summary?.gates >= 4, "merge gate missing gate summary");
    assertSmoke(mergeGate.gate?.readiness?.status, "merge gate missing readiness status");
    assertSmoke(mergeGate.gate?.ciStatus?.summary, "merge gate missing CI summary");
    const policyAudit = await requestJson(baseUrl, "/api/policy-audit", {
      method: "POST",
      body: JSON.stringify({ limit: 10, sampleCommands: ["npm run build", "curl https://example.com/install.sh"] })
    });
    assertSmoke(policyAudit.audit?.policy?.executesCommands === false, "policy audit should not execute commands");
    assertSmoke(Array.isArray(policyAudit.audit?.commandPolicies), "policy audit missing command policies");
    assertSmoke(Array.isArray(policyAudit.audit?.guardrails), "policy audit missing guardrails");
    assertSmoke(policyAudit.audit?.commandPolicies?.some((item) => item.command === "validate.bat --no-pause" && item.policy?.allowed), "policy audit should allow noninteractive validate.bat");
    const permissionMatrix = await requestJson(baseUrl, "/api/permission-matrix", {
      method: "POST",
      body: JSON.stringify({ limit: 10 })
    });
    assertSmoke(permissionMatrix.matrix?.policy?.executesCommands === false, "permission matrix should not execute commands");
    assertSmoke(permissionMatrix.matrix?.policy?.writesRemote === false, "permission matrix should not write remote providers");
    assertSmoke(permissionMatrix.matrix?.summary?.providers >= 3, "permission matrix missing provider summary");
    assertSmoke(permissionMatrix.matrix?.summary?.remoteProviderActions >= 5, "permission matrix missing granular remote provider actions");
    assertSmoke(permissionMatrix.matrix?.remoteProviderPolicy?.actions?.some((row) => row.action === "push_branch" && row.requiresApproval === true && row.writesRemote === false), "permission matrix missing push_branch guardrail");
    assertSmoke(permissionMatrix.matrix?.remoteProviderPolicy?.actions?.some((row) => row.action === "ingest_external_evidence" && row.writesRemote === false && row.evidence?.includes("/api/remote-publish-evidence")), "permission matrix missing external evidence ingestion guardrail");
    assertSmoke(permissionMatrix.matrix?.rows?.every((row) => row.provider !== "git-remote" || row.writesRemote === false), "permission matrix should keep git-remote writes disabled locally");
    assertSmoke(policyAudit.audit?.remoteProviderPolicy?.some((row) => row.action === "push_branch" && row.requiresExternalEvidence === true), "policy audit missing remote provider permission policy");
    assertSmoke(!policyAudit.audit?.gaps?.some((item) => /No remote provider permission model/i.test(item)), "policy audit still reports missing remote provider permission model");
    assertSmoke(permissionMatrix.matrix?.rows?.some((row) => row.provider === "workspace" && row.action === "apply_diff" && row.supportsPartialHunks === true), "permission matrix missing partial hunk write evidence");

    const prReadiness = await requestJson(baseUrl, "/api/pr-readiness", {
      method: "POST",
      body: JSON.stringify({ prompt: "api smoke PR readiness" })
    });
    const giteeProjectSmoke = parseGitRemoteProject("https://gitee.com/jsy96/coder.git");
    assertSmoke(inferGitProvider("https://gitee.com/jsy96/coder.git") === "gitee", "Gitee remote should be detected as gitee provider");
    assertSmoke(giteeProjectSmoke.provider === "gitee" && giteeProjectSmoke.webUrl === "https://gitee.com/jsy96/coder", "Gitee remote project parsing failed");
    assertSmoke(prReadiness.policy?.pushes === false, "PR readiness should not push to remote");
    assertSmoke(prReadiness.policy?.createsRemotePr === false, "PR readiness should not create remote PR");
    assertSmoke(prReadiness.remote && typeof prReadiness.remote === "object", "PR readiness missing remote status");
    assertSmoke(Array.isArray(prReadiness.remotes), "PR readiness missing remotes array");
    assertSmoke(Array.isArray(prReadiness.ci), "PR readiness missing CI config array");
    assertSmoke(Array.isArray(prReadiness.verificationPlan?.gates), "PR readiness missing verification gates");
    assertSmoke(prReadiness.draft?.body?.includes("## Summary"), "PR readiness missing draft body");
    const remotePrStatus = await requestJson(baseUrl, "/api/remote-pr-status");
    assertSmoke(remotePrStatus.policy?.pushes === false, "remote PR status should not push");
    assertSmoke(remotePrStatus.policy?.createsRemotePr === false, "remote PR status should not create PR");
    const remotePublishPlan = await requestJson(baseUrl, "/api/remote-publish-plan", {
      method: "POST",
      body: JSON.stringify({ prompt: "api smoke remote publish plan" })
    });
    assertSmoke(remotePublishPlan.policy?.executesCommands === false, "remote publish plan should not execute commands");
    assertSmoke(remotePublishPlan.policy?.requiresExplicitApproval === true, "remote publish plan missing approval policy");
    assertSmoke(remotePublishPlan.package?.prBodyPath?.endsWith("pr-body.md"), "remote publish plan missing PR body artifact");
    assertSmoke(remotePublishPlan.package?.reviewSummaryPath?.endsWith("review-summary.md"), "remote publish plan missing review summary artifact");
    if (remotePublishPlan.provider === "gitee") {
      assertSmoke(remotePublishPlan.remoteProject?.webUrl?.includes("gitee.com"), "Gitee remote publish plan missing project URL");
      assertSmoke(remotePublishPlan.commands.some((item) => item.id === "create-gitee-pr-manual" && item.manual === true), "Gitee remote publish plan missing manual PR step");
      assertSmoke(remotePublishPlan.notes.some((item) => /Gitee/.test(item)), "Gitee remote publish plan missing manual-provider note");
    }
    assertSmoke(remotePublishPlan.commands.every((item) => !item.command.includes("<pr-body.md>") && !item.command.includes("<review-summary.md>")), "remote publish plan still contains placeholder artifact paths");
    assertSmoke(remotePublishPlan.approval?.id, "remote publish plan missing approval request");
    cleanup.remotePublishDir = remotePublishPlan.package?.dir || "";
    const remotePublishPackages = await requestJson(baseUrl, "/api/remote-publish-packages?limit=5");
    assertSmoke(remotePublishPackages.policy?.pushes === false, "remote publish package index should not push");
    assertSmoke(remotePublishPackages.policy?.createsRemotePr === false, "remote publish package index should not create PR");
    assertSmoke(remotePublishPackages.packages.some((item) => item.id === remotePublishPlan.package.id), "remote publish package index missing generated package");
    const remotePublishPackage = await requestJson(baseUrl, `/api/remote-publish-package?id=${encodeURIComponent(remotePublishPlan.package.id)}`);
    assertSmoke(remotePublishPackage.policy?.writesRemoteComments === false, "remote publish package detail should not write remote comments");
    assertSmoke(remotePublishPackage.prBody.includes("## Summary"), "remote publish package missing PR body content");
    assertSmoke(remotePublishPackage.reviewSummary.includes("## Readiness"), "remote publish package missing review summary content");
    const remotePublishPreflight = await requestJson(baseUrl, "/api/remote-publish-preflight", {
      method: "POST",
      body: JSON.stringify({ id: remotePublishPlan.package.id, limit: 5 })
    });
    assertSmoke(remotePublishPreflight.preflight?.policy?.executesCommands === false, "remote publish preflight should not execute commands");
    assertSmoke(remotePublishPreflight.preflight?.policy?.pushes === false, "remote publish preflight should not push");
    assertSmoke(remotePublishPreflight.preflight?.package?.id === remotePublishPlan.package.id, "remote publish preflight missing package id");
    assertSmoke(Array.isArray(remotePublishPreflight.preflight?.commandChecks), "remote publish preflight missing command checks");
    assertSmoke(Array.isArray(remotePublishPreflight.preflight?.blockers), "remote publish preflight missing blockers");
    if (remotePublishPreflight.preflight?.package?.provider === "gitee") {
      assertSmoke(remotePublishPreflight.preflight?.cli?.manualProvider === true, "Gitee remote publish preflight missing manual provider marker");
      assertSmoke(/manual continuation/i.test(remotePublishPreflight.preflight?.cli?.reason || ""), "Gitee remote publish preflight missing manual continuation reason");
    }
    const remotePublishContinuation = await requestJson(baseUrl, "/api/remote-publish-continuation", {
      method: "POST",
      body: JSON.stringify({ id: remotePublishPlan.package.id, limit: 5 })
    });
    assertSmoke(remotePublishContinuation.continuation?.policy?.executesCommands === false, "remote publish continuation should not execute commands");
    assertSmoke(remotePublishContinuation.continuation?.policy?.pushes === false, "remote publish continuation should not push");
    assertSmoke(remotePublishContinuation.continuation?.policy?.writesRemoteComments === false, "remote publish continuation should not write comments");
    assertSmoke(remotePublishContinuation.continuation?.packageId === remotePublishPlan.package.id, "remote publish continuation missing package id");
    assertSmoke(remotePublishContinuation.continuation?.paths?.continuation?.endsWith("continuation.md"), "remote publish continuation missing continuation markdown");
    assertSmoke(remotePublishContinuation.continuation?.paths?.evidenceTemplate?.endsWith("external-evidence-template.json"), "remote publish continuation missing external evidence template");
    assertSmoke(remotePublishContinuation.continuation?.evidenceTemplate?.externalExecution, "remote publish continuation missing external execution template");
    assertSmoke(remotePublishContinuation.continuation?.verificationCommands?.some((item) => item.command === "node server.js --api-smoke-section=publish"), "remote publish continuation missing publish smoke command");
    const remotePublishEvidence = await requestJson(baseUrl, "/api/remote-publish-evidence", {
      method: "POST",
      body: JSON.stringify({
        id: remotePublishPlan.package.id,
        limit: 5,
        evidence: {
          ...remotePublishContinuation.continuation.evidenceTemplate,
          externalExecution: {
            ...remotePublishContinuation.continuation.evidenceTemplate.externalExecution,
            executedBy: "api smoke",
            executedAt: new Date().toISOString(),
            commandsRun: (remotePublishContinuation.continuation.evidenceTemplate.externalExecution.commandsRun || []).map((item) => ({
              ...item,
              status: "completed",
              outputSummary: "api smoke external evidence"
            })),
            remoteUrl: "https://gitee.com/jsy96/coder/pulls/1",
            prOrMrNumber: "1",
            ciUrl: "https://gitee.com/jsy96/coder/pipelines/1",
            reviewCommentUrl: "https://gitee.com/jsy96/coder/pulls/1#note_1",
            rollbackPlan: "Revert the remote PR branch or close the PR.",
            notes: "api smoke"
          }
        }
      })
    });
    assertSmoke(remotePublishEvidence.evidence?.policy?.writesLocalArtifacts === true, "remote publish evidence should write local artifacts only");
    assertSmoke(remotePublishEvidence.evidence?.policy?.pushes === false, "remote publish evidence should not push");
    assertSmoke(remotePublishEvidence.evidence?.status === "ready", "remote publish evidence should validate completed template");
    assertSmoke(remotePublishEvidence.evidence?.paths?.evidence?.endsWith("external-evidence.json"), "remote publish evidence missing evidence artifact path");
    assertSmoke(remotePublishEvidence.evidence?.paths?.summary?.endsWith("external-evidence-summary.md"), "remote publish evidence missing summary artifact path");
    assertSmoke(remotePublishEvidence.evidence?.verificationCommands?.some((item) => item.command === "node server.js --api-smoke-section=publish"), "remote publish evidence missing publish smoke command");
    const remotePublishPackagesWithEvidence = await requestJson(baseUrl, "/api/remote-publish-packages?limit=5");
    const evidencePackage = remotePublishPackagesWithEvidence.packages.find((item) => item.id === remotePublishPlan.package.id);
    assertSmoke(evidencePackage?.externalEvidence?.status === "ready", "remote publish package index missing external evidence summary");
    assertSmoke(remotePublishPackagesWithEvidence.summary?.withExternalEvidence >= 1, "remote publish package index missing external evidence count");
    const mergeGateWithExternalEvidence = await requestJson(baseUrl, "/api/merge-gate", {
      method: "POST",
      body: JSON.stringify({ prompt: "api smoke merge gate with external evidence", limit: 10 })
    });
    assertSmoke(mergeGateWithExternalEvidence.gate?.gates?.some((item) => item.id === "remote-publish-external-evidence"), "merge gate missing remote publish external evidence gate");
    assertSmoke(mergeGateWithExternalEvidence.gate?.externalEvidence?.status === "ready", "merge gate missing ready external evidence summary");
    const approvedRemotePlan = await requestJson(baseUrl, "/api/approval", {
      method: "PATCH",
      body: JSON.stringify({ id: remotePublishPlan.approval.id, decision: "approved", note: "api smoke remote plan approval" })
    });
    assertSmoke(approvedRemotePlan.status === "approved", "remote publish approval did not update status");
    const remotePlanExecution = await requestJson(baseUrl, "/api/approval-execute", {
      method: "POST",
      body: JSON.stringify({ id: remotePublishPlan.approval.id })
    });
    assertSmoke(remotePlanExecution.execution?.executed === false, "remote publish approval should not execute remote writes");
    assertSmoke(remotePlanExecution.execution?.blocked === true, "remote publish execution missing blocked flag");

    console.log(JSON.stringify({
      ok: true,
      apiSmoke: true,
    checked: ["health", "files", "capabilities", "tools", "extensions", "extension-trust", "extension-tool-call", "mcp", "mcp-probe", "mcp-resource", "mcp-tool-call", "assets", "asset-inspect", "browser-check", "browser-baseline", "browser-screenshot", "browser-selector-screenshot", "browser-dom", "browser-trace", "debug-diagnostics", "browser-interact", "browser-session", "browser-visual", "browser-selector-visual", "model-runtime", "model-policy", "model-usage", "model-budget", "model-cost", "model-cost-policy", "model-billing", "agent-stream", "threads", "thread-fork", "queue", "queue-isolation", "goal-state", "context-snapshot", "context-compact", "context-rollup", "auto-context-compact", "verification-plan", "ci-status", "merge-gate", "policy-audit", "permission-matrix", "code-intelligence", "semantic-index", "symbol-outline", "semantic-definition", "semantic-symbol-impact", "semantic-rename-preview", "semantic-rename-draft", "semantic-search", "semantic-references", "semantic-diagnostics", "semantic-impact", "dependency-graph", "reviews", "approvals", "approval-decision", "approval-execute", "command-policy", "processes", "process-startup-commands", "process-lifecycle", "process-health", "process-search", "process-history", "process-log-artifacts", "diff", "diff-conflicts", "conflict-resolution-draft", "handoff", "pr-readiness", "remote-pr-status", "remote-publish-plan", "remote-publish-packages", "remote-publish-preflight", "remote-publish-continuation", "remote-publish-evidence"],
      queueId: queued.id,
      handoffId: handoff.id
    }));
  } finally {
    if (cleanup.processId) await stopManagedProcess(cleanup.processId).catch(() => {});
    if (cleanup.processFixturePath) await fs.rm(cleanup.processFixturePath, { force: true }).catch(() => {});
    for (const processPath of cleanup.processLogPaths || []) {
      await fs.rm(processPath, { force: true }).catch(() => {});
    }
    if (cleanup.extensionFixtureDir) await fs.rm(cleanup.extensionFixtureDir, { recursive: true, force: true }).catch(() => {});
    if (cleanup.mcpFixturePath && cleanup.mcpOriginalFixture !== null) {
      await fs.mkdir(path.dirname(cleanup.mcpFixturePath), { recursive: true });
      await fs.writeFile(cleanup.mcpFixturePath, cleanup.mcpOriginalFixture, "utf8").catch(() => {});
    } else if (cleanup.mcpFixturePath) {
      await fs.rm(cleanup.mcpFixturePath, { force: true }).catch(() => {});
    }
    if (cleanup.assetFixturePath) await fs.rm(cleanup.assetFixturePath, { force: true }).catch(() => {});
    if (cleanup.svgAssetFixturePath) await fs.rm(cleanup.svgAssetFixturePath, { force: true }).catch(() => {});
    if (cleanup.dataAssetFixturePath) await fs.rm(cleanup.dataAssetFixturePath, { force: true }).catch(() => {});
    if (cleanup.parquetDataAssetFixturePath) await fs.rm(cleanup.parquetDataAssetFixturePath, { force: true }).catch(() => {});
    if (cleanup.documentAssetFixturePath) await fs.rm(cleanup.documentAssetFixturePath, { force: true }).catch(() => {});
    if (cleanup.legacyDocumentAssetFixturePath) await fs.rm(cleanup.legacyDocumentAssetFixturePath, { force: true }).catch(() => {});
    if (cleanup.pdfAssetFixturePath) await fs.rm(cleanup.pdfAssetFixturePath, { force: true }).catch(() => {});
    if (cleanup.compressedPdfAssetFixturePath) await fs.rm(cleanup.compressedPdfAssetFixturePath, { force: true }).catch(() => {});
    if (cleanup.mediaAssetFixturePath) await fs.rm(cleanup.mediaAssetFixturePath, { force: true }).catch(() => {});
    if (cleanup.browserBaselinePath) await fs.rm(cleanup.browserBaselinePath, { force: true }).catch(() => {});
    if (cleanup.browserScreenshotPath) await fs.rm(cleanup.browserScreenshotPath, { force: true }).catch(() => {});
    if (cleanup.browserTracePath) await fs.rm(cleanup.browserTracePath, { force: true }).catch(() => {});
    if (cleanup.browserSourceTracePagePath) await fs.rm(cleanup.browserSourceTracePagePath, { force: true }).catch(() => {});
    if (cleanup.browserSourceTraceScriptPath) await fs.rm(cleanup.browserSourceTraceScriptPath, { force: true }).catch(() => {});
    if (cleanup.browserSourceTracePath) await fs.rm(cleanup.browserSourceTracePath, { force: true }).catch(() => {});
    if (cleanup.browserSourceDebugTracePath) await fs.rm(cleanup.browserSourceDebugTracePath, { force: true }).catch(() => {});
    if (cleanup.browserSessionPath) await fs.rm(cleanup.browserSessionPath, { force: true }).catch(() => {});
    if (cleanup.browserVisualBaselinePath) await fs.rm(cleanup.browserVisualBaselinePath, { force: true }).catch(() => {});
    if (cleanup.browserVisualMetaPath) await fs.rm(cleanup.browserVisualMetaPath, { force: true }).catch(() => {});
    if (cleanup.browserVisualDiffBaselinePath) await fs.rm(cleanup.browserVisualDiffBaselinePath, { force: true }).catch(() => {});
    if (cleanup.browserVisualDiffMetaPath) await fs.rm(cleanup.browserVisualDiffMetaPath, { force: true }).catch(() => {});
    if (cleanup.browserVisualDiffPath) await fs.rm(cleanup.browserVisualDiffPath, { force: true }).catch(() => {});
    for (const screenshotPath of cleanup.browserVisualScreenshotPaths) {
      await fs.rm(screenshotPath, { force: true }).catch(() => {});
    }
    if (cleanup.applyFixtureAPath) await fs.rm(cleanup.applyFixtureAPath, { force: true }).catch(() => {});
    if (cleanup.applyFixtureBPath) await fs.rm(cleanup.applyFixtureBPath, { force: true }).catch(() => {});
    if (cleanup.applyHunkFixturePath) await fs.rm(cleanup.applyHunkFixturePath, { force: true }).catch(() => {});
    if (cleanup.threadPath) await fs.rm(cleanup.threadPath, { force: true }).catch(() => {});
    if (cleanup.forkThreadPath) await fs.rm(cleanup.forkThreadPath, { force: true }).catch(() => {});
    if (cleanup.applyConflictCheckpointPath) await fs.rm(cleanup.applyConflictCheckpointPath, { force: true }).catch(() => {});
    if (cleanup.applyHunkCheckpointPath) await fs.rm(cleanup.applyHunkCheckpointPath, { force: true }).catch(() => {});
    if (cleanup.queuePath) await fs.rm(cleanup.queuePath, { force: true }).catch(() => {});
    if (cleanup.extraQueuePath) await fs.rm(cleanup.extraQueuePath, { force: true }).catch(() => {});
    if (cleanup.conflictQueuePath) await fs.rm(cleanup.conflictQueuePath, { force: true }).catch(() => {});
    if (cleanup.handoffPath) await fs.rm(cleanup.handoffPath, { force: true }).catch(() => {});
    if (cleanup.remotePublishDir) await fs.rm(cleanup.remotePublishDir, { recursive: true, force: true }).catch(() => {});
    if (cleanup.remoteCiArtifactPath) await fs.rm(cleanup.remoteCiArtifactPath, { force: true }).catch(() => {});
    if (cleanup.escalationPath) await fs.rm(cleanup.escalationPath, { force: true }).catch(() => {});
    if (cleanup.explicitEscalationPath) await fs.rm(cleanup.explicitEscalationPath, { force: true }).catch(() => {});
    if (cleanup.processEscalationPath) await fs.rm(cleanup.processEscalationPath, { force: true }).catch(() => {});
    if (cleanup.semanticApiContractFixturePath) await fs.rm(cleanup.semanticApiContractFixturePath, { force: true }).catch(() => {});
    if (cleanup.commandFailureFixturePath) await fs.rm(cleanup.commandFailureFixturePath, { force: true }).catch(() => {});
    for (const fixturePath of cleanup.commandFailureFixturePaths || []) {
      await fs.rm(fixturePath, { force: true }).catch(() => {});
    }
    if (cleanup.processHealthRulesPath) {
      if (cleanup.originalProcessHealthRules === null) {
        await fs.rm(cleanup.processHealthRulesPath, { force: true }).catch(() => {});
      } else if (typeof cleanup.originalProcessHealthRules === "string") {
        await fs.mkdir(path.dirname(cleanup.processHealthRulesPath), { recursive: true });
        await fs.writeFile(cleanup.processHealthRulesPath, cleanup.originalProcessHealthRules, "utf8").catch(() => {});
      }
    }
    await restoreApprovalDir(originalApprovals);
    if (originalGoalState === null) {
      await fs.rm(GOAL_STATE_PATH, { force: true }).catch(() => {});
    } else {
      await fs.mkdir(STATE_DIR, { recursive: true });
      await fs.writeFile(GOAL_STATE_PATH, originalGoalState, "utf8");
    }
    if (originalContextSnapshot === null) {
      await fs.rm(CONTEXT_SNAPSHOT_PATH, { force: true }).catch(() => {});
    } else {
      await fs.mkdir(STATE_DIR, { recursive: true });
      await fs.writeFile(CONTEXT_SNAPSHOT_PATH, originalContextSnapshot, "utf8");
    }
    if (originalContextCompact === null) {
      await fs.rm(CONTEXT_COMPACT_PATH, { force: true }).catch(() => {});
    } else {
      await fs.mkdir(STATE_DIR, { recursive: true });
      await fs.writeFile(CONTEXT_COMPACT_PATH, originalContextCompact, "utf8");
    }
    if (originalContextRollup === null) {
      await fs.rm(CONTEXT_ROLLUP_PATH, { force: true }).catch(() => {});
    } else {
      await fs.mkdir(STATE_DIR, { recursive: true });
      await fs.writeFile(CONTEXT_ROLLUP_PATH, originalContextRollup, "utf8");
    }
    if (originalSemanticIndex === null) {
      await fs.rm(SEMANTIC_INDEX_PATH, { force: true }).catch(() => {});
    } else {
      await fs.mkdir(STATE_DIR, { recursive: true });
      await fs.writeFile(SEMANTIC_INDEX_PATH, originalSemanticIndex, "utf8");
    }
    if (originalRuntimeUrl === null) {
      await fs.rm(RUNTIME_URL_PATH, { force: true }).catch(() => {});
    } else {
      await fs.mkdir(STATE_DIR, { recursive: true });
      await fs.writeFile(RUNTIME_URL_PATH, originalRuntimeUrl, "utf8");
    }
    currentWorkspace = originalWorkspace;
    await closeSmokeServer(server);
  }
}

function runCliTask(task) {
  let fallbackExitTimer = null;
  Promise.resolve()
    .then(() => task())
    .then(() => {
      process.exitCode = process.exitCode || 0;
      fallbackExitTimer = setTimeout(() => process.exit(process.exitCode || 0), 1000);
      fallbackExitTimer.unref?.();
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
      fallbackExitTimer = setTimeout(() => process.exit(1), 1000);
      fallbackExitTimer.unref?.();
    });
}

if (process.argv.includes("--mcp-smoke-server")) {
  runMcpSmokeServer();
} else if (process.argv.includes("--capability-audit") || process.argv.includes("--capabilities") || process.argv.includes("--capability-audit-json")) {
  runCliTask(runCapabilityAuditCli);
} else if (process.argv.includes("--external-readiness") || process.argv.includes("--external-readiness-json")) {
  runCliTask(runExternalReadinessCli);
} else if (process.argv.includes("--api-smoke-test")) {
  runCliTask(runApiSmokeTest);
} else if (process.argv.includes("--api-smoke-section") || process.argv.some((item) => item.startsWith("--api-smoke-section="))) {
  runCliTask(() => runApiSmokeSectionTest(getCliOption("--api-smoke-section")));
} else if (process.argv.includes("--ui-smoke-test")) {
  runCliTask(runUiSmokeTest);
} else if (process.argv.includes("--port-conflict-smoke-test")) {
  runCliTask(runPortConflictSmokeTest);
} else if (process.argv.includes("--smoke-test")) {
  runCliTask(runSmokeTest);
} else {
  listenAppServerWithRetry({
    onRetry({ activePort, nextPort, reason }) {
      console.warn(`Port ${activePort} is ${reason}. Trying ${nextPort}...`);
    },
    onError({ activePort, reason }) {
      console.error(`Port ${activePort} is ${reason}.`);
      console.error(`Close the existing process or start Forge Code with another port, for example:`);
      console.error(`  set PORT=${activePort + 1}`);
      console.error(`  node server.js`);
    },
    onListening({ activePort }) {
      process.env.FORGE_PORT = String(activePort);
      process.env.PORT = String(activePort);
      persistRuntimeUrlState({ port: activePort, source: "server-listen" }).catch((error) => {
        console.warn(`Could not persist runtime URL state: ${error.message}`);
      });
      console.log(`Forge Code running at http://127.0.0.1:${activePort}`);
      console.log(`FORGE_URL=http://127.0.0.1:${activePort}`);
      console.log(`Workspace: ${currentWorkspace}`);
      console.log(`DeepSeek key: ${process.env.DEEPSEEK_API_KEY ? "configured" : "missing"}`);
    }
  }).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
