const log = document.querySelector("#log");
const form = document.querySelector("#promptForm");
const workspaceForm = document.querySelector("#workspaceForm");
const processForm = document.querySelector("#processForm");
const processSearchForm = document.querySelector("#processSearchForm");
const manualCommandForm = document.querySelector("#manualCommandForm");
const processSearchBtn = document.querySelector("#processSearchBtn");
const processHistoryBtn = document.querySelector("#processHistoryBtn");
const processHealthBtn = document.querySelector("#processHealthBtn");
const queueIsolationBtn = document.querySelector("#queueIsolationBtn");
const browserCheckForm = document.querySelector("#browserCheckForm");
const workspaceInput = document.querySelector("#workspaceInput");
const processCommandInput = document.querySelector("#processCommandInput");
const processSearchInput = document.querySelector("#processSearchInput");
const manualCommandInput = document.querySelector("#manualCommandInput");
const browserCheckUrlInput = document.querySelector("#browserCheckUrlInput");
const browserSelectorInput = document.querySelector("#browserSelectorInput");
const input = document.querySelector("#promptInput");
const toast = document.querySelector("#toast");
const replayBtn = document.querySelector("#replayBtn");
const approveBtn = document.querySelector("#approveBtn");
const approvePartialBtn = document.querySelector("#approvePartialBtn");
const rollbackBtn = document.querySelector("#rollbackBtn");
const attachBtn = document.querySelector("#attachBtn");
const refreshFilesBtn = document.querySelector("#refreshFilesBtn");
const newTaskBtn = document.querySelector("#newTaskBtn");
const runAgentBtn = document.querySelector("#runAgentBtn");
const runCommandsBtn = document.querySelector("#runCommandsBtn");
const manualCommandRunBtn = document.querySelector("#manualCommandRunBtn");
const manualCommandStageBtn = document.querySelector("#manualCommandStageBtn");
const debugDiagnosticsBtn = document.querySelector("#debugDiagnosticsBtn");
const debugRunChecks = document.querySelector("#debugRunChecks");
const startProcessBtn = document.querySelector("#startProcessBtn");
const processDiscoverBtn = document.querySelector("#processDiscoverBtn");
const processStartDiscoveredBtn = document.querySelector("#processStartDiscoveredBtn");
const processStartDebugBtn = document.querySelector("#processStartDebugBtn");
const browserBaselineBtn = document.querySelector("#browserBaselineBtn");
const browserScreenshotBtn = document.querySelector("#browserScreenshotBtn");
const browserAuditBtn = document.querySelector("#browserAuditBtn");
const browserDomBtn = document.querySelector("#browserDomBtn");
const browserTraceBtn = document.querySelector("#browserTraceBtn");
const browserInteractBtn = document.querySelector("#browserInteractBtn");
const browserSessionBtn = document.querySelector("#browserSessionBtn");
const browserVisualBtn = document.querySelector("#browserVisualBtn");
const worktreeBtn = document.querySelector("#worktreeBtn");
const contextSnapshotBtn = document.querySelector("#contextSnapshotBtn");
const contextCompactBtn = document.querySelector("#contextCompactBtn");
const contextRollupBtn = document.querySelector("#contextRollupBtn");
const modelPolicyBtn = document.querySelector("#modelPolicyBtn");
const modelUsageBtn = document.querySelector("#modelUsageBtn");
const modelBudgetBtn = document.querySelector("#modelBudgetBtn");
const modelCostBtn = document.querySelector("#modelCostBtn");
const modelCostPolicyBtn = document.querySelector("#modelCostPolicyBtn");
const modelBillingBtn = document.querySelector("#modelBillingBtn");
const semanticIndexBtn = document.querySelector("#semanticIndexBtn");
const codeIntelligenceBtn = document.querySelector("#codeIntelligenceBtn");
const symbolOutlineBtn = document.querySelector("#symbolOutlineBtn");
const semanticDiagnosticsBtn = document.querySelector("#semanticDiagnosticsBtn");
const semanticImpactBtn = document.querySelector("#semanticImpactBtn");
const dependencyGraphBtn = document.querySelector("#dependencyGraphBtn");
const reviewBtn = document.querySelector("#reviewBtn");
const queueBtn = document.querySelector("#queueBtn");
const handoffBtn = document.querySelector("#handoffBtn");
const prReadinessBtn = document.querySelector("#prReadinessBtn");
const mergeGateBtn = document.querySelector("#mergeGateBtn");
const verificationPlanBtn = document.querySelector("#verificationPlanBtn");
const ciStatusBtn = document.querySelector("#ciStatusBtn");
const policyAuditBtn = document.querySelector("#policyAuditBtn");
const permissionMatrixBtn = document.querySelector("#permissionMatrixBtn");
const remotePublishPlanBtn = document.querySelector("#remotePublishPlanBtn");
const remotePublishPackagesBtn = document.querySelector("#remotePublishPackagesBtn");
const remotePublishPreflightBtn = document.querySelector("#remotePublishPreflightBtn");
const extensionTrustBtn = document.querySelector("#extensionTrustBtn");
const planSteps = document.querySelector("#planSteps");
const goalState = document.querySelector("#goalState");
const diffList = document.querySelector("#diffList");
const diffSummary = document.querySelector("#diffSummary");
const toggleAllDiffBtn = document.querySelector("#toggleAllDiffBtn");
const copyAllDiffBtn = document.querySelector("#copyAllDiffBtn");
const preApplyReviewBtn = document.querySelector("#preApplyReviewBtn");
const pendingDiffImpactBtn = document.querySelector("#pendingDiffImpactBtn");
const conflictResolutionPanel = document.querySelector("#conflictResolutionPanel");
const commandHistoryList = document.querySelector("#commandHistoryList");
const checksList = document.querySelector("#checksList");
const reviewList = document.querySelector("#reviewList");
const reviewArtifactList = document.querySelector("#reviewArtifactList");
const approvalList = document.querySelector("#approvalList");
const debugDiagnosticsPanel = document.querySelector("#debugDiagnosticsPanel");
const queueList = document.querySelector("#queueList");
const processList = document.querySelector("#processList");
const browserCheckResult = document.querySelector("#browserCheckResult");
const fileList = document.querySelector("#fileList");
const repoName = document.querySelector("#repoName");
const branchName = document.querySelector("#branchName");
const workspaceStatus = document.querySelector("#workspaceStatus");
const contextMeter = document.querySelector("#contextMeter");
const contextText = document.querySelector("#contextText");
const gitStatus = document.querySelector("#gitStatus");
const threadList = document.querySelector("#threadList");
const taskList = document.querySelector("#taskList");
const capabilityList = document.querySelector("#capabilityList");
const toolCatalogList = document.querySelector("#toolCatalogList");
const extensionCatalogList = document.querySelector("#extensionCatalogList");
const mcpCatalogList = document.querySelector("#mcpCatalogList");
const mcpProbeBtn = document.querySelector("#mcpProbeBtn");
const assetCatalogList = document.querySelector("#assetCatalogList");
const runState = document.querySelector("#runState");
const referencePreview = document.querySelector("#referencePreview");

const state = {
  files: [],
  pendingPatches: [],
  pendingDiff: "",
  pendingCommands: [],
  conflictPreview: null,
  lastPrompt: "",
  checkpoints: [],
  restoredProposalId: "",
  busy: false,
  activeThreadId: "",
  threadMessages: [],
  contextSnapshot: null,
  contextRollup: null,
  lastDebugDiagnostics: null,
  lastFailedCommand: null,
  commandResults: {},
  commandHistory: [],
  activeRepairChain: null,
  repairChains: [],
  lastCapabilityAudit: null,
  lastPreApplyReviewKey: "",
  lastPreApplyReview: null,
  lastRecoverySummary: null,
  commandDebugRestoredScope: "",
  manualCommandHistoryCursor: -1,
  manualCommandHistoryDraft: "",
  referencePreviewTimer: 0,
  referencePreviewRequestId: 0
};

const COMMAND_DEBUG_STORAGE_KEY = "forge-command-debug-state-v1";

function currentDebugScope() {
  return [
    workspaceStatus?.textContent || "",
    state.activeThreadId || "no-thread"
  ].join("::");
}

function pruneCommandResults(results = {}) {
  const entries = Object.entries(results || {})
    .filter(([command, run]) => command && run?.status === "done")
    .sort((a, b) => String(b[1]?.completedAt || b[1]?.startedAt || "").localeCompare(String(a[1]?.completedAt || a[1]?.startedAt || "")))
    .slice(0, 30);
  return Object.fromEntries(entries);
}

function pruneDebugDiagnosticsForStorage(result) {
  if (!result || typeof result !== "object") return null;
  const compactCommand = (item) => {
    if (typeof item === "string") return item.slice(0, 300);
    return {
      id: String(item?.id || "").slice(0, 80),
      label: String(item?.label || "").slice(0, 120),
      command: String(item?.command || "").slice(0, 300),
      description: String(item?.description || "").slice(0, 300),
      priority: item?.priority || null,
      kind: String(item?.kind || "").slice(0, 80),
      target: String(item?.target || "").slice(0, 160),
      evidence: (item?.evidence || []).slice(0, 4).map((value) => String(value).slice(0, 240))
    };
  };
  const compactFinding = (item) => ({
    area: String(item?.area || "").slice(0, 80),
    severity: String(item?.severity || "").slice(0, 40),
    message: String(item?.message || "").slice(0, 320),
    evidence: (item?.evidence || []).slice(0, 4).map((value) => String(value).slice(0, 240))
  });
  const compactSourceLocation = (item) => ({
    path: String(item?.path || "").replaceAll("\\", "/").slice(0, 240),
    line: Number(item?.line || 1),
    column: Number(item?.column || 0),
    text: String(item?.text || "").slice(0, 240)
  });
  const compactBrowserTriage = result.browserTriage && typeof result.browserTriage === "object"
    ? {
        status: result.browserTriage.status || "",
        counts: result.browserTriage.counts || {},
        findings: (result.browserTriage.findings || []).slice(0, 8).map(compactFinding),
        nextActions: (result.browserTriage.nextActions || []).slice(0, 6).map(compactCommand)
      }
    : null;
  return {
    restoredFromStorage: true,
    generatedAt: result.generatedAt || result.startedAt || "",
    workspace: result.workspace || "",
    status: result.status || "",
    summary: result.summary || null,
    findings: (result.findings || []).slice(0, 10).map(compactFinding),
    nextActions: (result.nextActions || []).slice(0, 10).map(compactCommand),
    browserSourceLocations: (result.browserSourceLocations || []).slice(0, 16).map(compactSourceLocation),
    verificationPlan: result.verificationPlan ? {
      status: result.verificationPlan.status || "",
      commands: (result.verificationPlan.commands || []).slice(0, 12).map(compactCommand),
      summary: result.verificationPlan.summary || null
    } : null,
    processHealth: result.processHealth ? {
      summary: result.processHealth.summary || null,
      rows: (result.processHealth.rows || []).slice(0, 8).map((row) => ({
        id: row?.id || "",
        status: row?.status || "",
        command: String(row?.command || "").slice(0, 240),
        url: row?.url || row?.probe?.url || "",
        probe: row?.probe ? {
          ok: row.probe.ok,
          status: row.probe.status,
          url: row.probe.url || "",
          error: String(row.probe.error || "").slice(0, 240)
        } : null
      }))
    } : null,
    browserTrace: result.browserTrace ? {
      ok: result.browserTrace.ok,
      status: result.browserTrace.status || "",
      url: result.browserTrace.url || "",
      finalUrl: result.browserTrace.finalUrl || "",
      artifactPath: result.browserTrace.artifactPath || "",
      summary: result.browserTrace.summary || null,
      console: (result.browserTrace.console || []).slice(0, 12),
      pageErrors: (result.browserTrace.pageErrors || result.browserTrace.exceptions || []).slice(0, 8),
      exceptions: (result.browserTrace.exceptions || []).slice(0, 8),
      network: (result.browserTrace.network || result.browserTrace.failedRequests || []).slice(0, 12)
    } : null,
    browserTriage: compactBrowserTriage,
    semanticDiagnostics: result.semanticDiagnostics ? {
      status: result.semanticDiagnostics.status || "",
      summary: result.semanticDiagnostics.summary || null,
      findings: (result.semanticDiagnostics.findings || []).slice(0, 8).map(compactFinding)
    } : null
  };
}

function saveCommandDebugState() {
  try {
    const payload = {
      scope: currentDebugScope(),
      savedAt: new Date().toISOString(),
      lastDebugDiagnostics: pruneDebugDiagnosticsForStorage(state.lastDebugDiagnostics),
      lastFailedCommand: state.lastFailedCommand,
      commandResults: pruneCommandResults(state.commandResults),
      commandHistory: pruneCommandHistory(state.commandHistory),
      activeRepairChain: state.activeRepairChain,
      repairChains: pruneRepairChains(state.repairChains)
    };
    window.localStorage?.setItem(COMMAND_DEBUG_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Best-effort UI recovery cache.
  }
}

function clearCommandDebugState({ persist = true } = {}) {
  state.lastFailedCommand = null;
  state.commandResults = {};
  state.commandHistory = [];
  state.activeRepairChain = null;
  state.repairChains = [];
  state.commandDebugRestoredScope = "";
  renderLastFailedCommandCard();
  updateCommandToolbarSummaries();
  if (persist) saveCommandDebugState();
}

function restoreCommandDebugState() {
  try {
    const scope = currentDebugScope();
    if (state.commandDebugRestoredScope === scope) return false;
    const raw = window.localStorage?.getItem(COMMAND_DEBUG_STORAGE_KEY);
    if (!raw) return false;
    const payload = JSON.parse(raw);
    if (!payload || payload.scope !== scope) return false;
    state.commandResults = pruneCommandResults(payload.commandResults || {});
    state.lastDebugDiagnostics = payload.lastDebugDiagnostics || null;
    state.lastFailedCommand = payload.lastFailedCommand || null;
    state.commandHistory = pruneCommandHistory(payload.commandHistory || []);
    state.activeRepairChain = payload.activeRepairChain || null;
    state.repairChains = pruneRepairChains(payload.repairChains || []);
    state.commandDebugRestoredScope = scope;
    if (state.lastDebugDiagnostics) {
      renderDebugDiagnostics(state.lastDebugDiagnostics, { persist: false });
    } else {
      renderLastFailedCommandCard();
    }
    renderCommandHistory();
    updateCommandToolbarSummaries();
    if (state.lastDebugDiagnostics) {
      appendDebugEvidence(
        "已恢复最近调试诊断",
        state.lastDebugDiagnostics.status || "ready",
        [
          state.lastDebugDiagnostics.summary ? JSON.stringify(state.lastDebugDiagnostics.summary, null, 2) : "",
          state.lastDebugDiagnostics.browserTriage?.status ? `browserTriage: ${state.lastDebugDiagnostics.browserTriage.status}` : "",
          state.lastDebugDiagnostics.verificationPlan?.commands?.length ? `verification commands: ${state.lastDebugDiagnostics.verificationPlan.commands.length}` : ""
        ].filter(Boolean).join("\n")
      );
    }
    if (state.lastFailedCommand) {
      appendDebugEvidence(
        "已恢复最近失败命令",
        "ready",
        `${state.lastFailedCommand.command || ""}\n${summarizeCommandOutput(state.lastFailedCommand.result?.output || state.lastFailedCommand.error || "")}`
      );
    }
    if (state.activeRepairChain) {
      appendToolCall({
        title: "已恢复修复证据链",
        label: "repair",
        state: state.activeRepairChain.status || "ready",
        body: summarizeRepairEvidenceChain(state.activeRepairChain)
      });
    }
    return true;
  } catch {
    return false;
  }
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `请求失败：${response.status}`);
  }
  return data;
}

async function consumeSse(response, onEvent) {
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(text || `请求失败：${response.status}`);
  }
  if (!response.body) throw new Error("当前浏览器不支持流式响应。");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() || "";
    for (const chunk of chunks) {
      const eventLine = chunk.split("\n").find((line) => line.startsWith("event:"));
      const dataLine = chunk.split("\n").find((line) => line.startsWith("data:"));
      if (!eventLine || !dataLine) continue;
      const event = eventLine.replace(/^event:\s*/, "").trim();
      const data = JSON.parse(dataLine.replace(/^data:\s*/, ""));
      onEvent(event, data);
    }
  }
}

async function runAgentRequest(prompt, debugContext = buildAgentDebugContext()) {
  if (!window.ReadableStream) {
    return await api("/api/agent", {
      method: "POST",
      body: JSON.stringify({ prompt, debugContext })
    });
  }
  let finalResult = null;
  const streamLog = [];
  const response = await fetch("/api/agent-stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, debugContext })
  });
  try {
    await consumeSse(response, (event, data) => {
      streamLog.push({ event, data });
      if (event === "start") setBusy(true, "流式启动");
      if (event === "goal") renderPlan(["流式代理启动", "读取上下文", "生成 diff 和审查"]);
      if (event === "context") {
        const missingReferences = data.missingReferences || [];
        appendToolCall({
          title: "流式上下文事件",
          label: "stream",
          state: `${data.fileCount || 0} files · ${(data.referencedFiles || []).length} refs · ${missingReferences.length} missing`,
          body: JSON.stringify(data, null, 2)
        });
        if (missingReferences.length) {
          appendToolCall({
            title: "未命中的文件引用",
            label: "ctx",
            state: `${missingReferences.length} missing`,
            body: missingReferences.map((item) => `@${item.path} · ${item.reason || "未匹配"}`).join("\n")
          });
        }
      }
      if (event === "token") setBusy(true, `token ${data.index || streamLog.length}`);
      if (event === "result") finalResult = data;
      if (event === "error") throw new Error(data.message || "流式代理失败");
    });
  } catch (error) {
    error.streamLog = streamLog.map((item) => ({
      event: item.event,
      data: item.event === "result"
        ? { reply: item.data?.reply, patches: item.data?.patches?.length || 0, streamPolicy: item.data?.streamPolicy }
        : item.event === "token"
          ? { index: item.data?.index, chars: String(item.data?.token || "").length }
          : item.data
    }));
    error.endpoint = "/api/agent-stream";
    throw error;
  }
  if (!finalResult) throw new Error("流式代理未返回最终结果。");
  finalResult.streamLog = streamLog.map((item) => ({
    event: item.event,
    data: item.event === "result"
      ? { reply: item.data.reply, patches: item.data.patches?.length || 0, streamPolicy: item.data.streamPolicy }
      : item.event === "token"
        ? { index: item.data.index, chars: String(item.data.token || "").length }
        : item.data
  }));
  return finalResult;
}

function buildAgentDebugContext() {
  const diagnostics = state.lastDebugDiagnostics;
  if (!diagnostics) return null;
  const referencedFiles = debugEvidenceReferencedFiles(diagnostics);
  const browserSourceLocations = (diagnostics.browserSourceLocations || []).slice(0, 16).map((item) => ({
    path: item.path || "",
    line: Number(item.line || 1),
    column: Number(item.column || 0),
    text: item.text || ""
  }));
  const browserTriage = diagnostics.browserTriage && typeof diagnostics.browserTriage === "object"
    ? {
        status: diagnostics.browserTriage.status || "",
        counts: diagnostics.browserTriage.counts || {},
        findings: (diagnostics.browserTriage.findings || []).slice(0, 10).map((item) => ({
          severity: item.severity || "info",
          area: item.area || "browser",
          message: item.message || "",
          evidence: item.evidence || ""
        })),
        nextActions: (diagnostics.browserTriage.nextActions || []).slice(0, 6)
      }
    : null;
  return {
    source: "lastDebugDiagnostics",
    generatedAt: diagnostics.generatedAt || "",
    status: diagnostics.status || "",
    summary: diagnostics.summary || {},
    debugContext: {
      referencedFiles,
      browserTriage,
      browserSourceLocations
    },
    "debugContext.referencedFiles": referencedFiles,
    "debugContext.browserTriage": browserTriage,
    "debugContext.browserSourceLocations": browserSourceLocations,
    referencedFiles,
    browserSourceLocations,
    findings: (diagnostics.findings || []).slice(0, 10).map((item) => ({
      severity: item.severity || "info",
      area: item.area || "",
      message: item.message || "",
      evidence: (item.evidence || []).slice(0, 6)
    })),
    nextActions: (diagnostics.nextActions || []).slice(0, 8),
    verificationPlan: diagnostics.verificationPlan ? {
      status: diagnostics.verificationPlan.status || "",
      commands: (diagnostics.verificationPlan.commands || []).slice(0, 8)
    } : null,
    processHealth: diagnostics.processHealth ? {
      summary: diagnostics.processHealth.summary || {},
      rows: (diagnostics.processHealth.rows || []).slice(0, 8).map((row) => ({
        id: row.id,
        status: row.status,
        command: row.command,
        probe: row.probe,
        rules: row.rules
      }))
    } : null,
    browserTrace: diagnostics.browserTrace ? {
      ok: diagnostics.browserTrace.ok,
      url: diagnostics.browserTrace.url,
      finalUrl: diagnostics.browserTrace.finalUrl,
      summary: diagnostics.browserTrace.summary,
      console: (diagnostics.browserTrace.console || []).slice(0, 8),
      exceptions: (diagnostics.browserTrace.exceptions || []).slice(0, 8),
      network: (diagnostics.browserTrace.network || []).filter((item) => item.failed || item.status >= 400).slice(0, 8)
    } : null,
    browserTriage
  };
}

function buildDebugFixPrompt(result = state.lastDebugDiagnostics) {
  if (!result) return "";
  const referencedFiles = debugEvidenceReferencedFiles(result);
  const findings = (result.findings || [])
    .slice(0, 8)
    .map((item, index) => `${index + 1}. [${item.severity || "info"}] ${item.area || "debug"}：${item.message || ""}${item.evidence?.length ? `；证据：${item.evidence.slice(0, 4).join(" / ")}` : ""}`)
    .join("\n");
  const actions = (result.nextActions || [])
    .slice(0, 6)
    .map((item, index) => {
      const meta = [
        item.priority ? `P${item.priority}` : "",
        item.kind || "",
        item.target ? `target=${item.target}` : "",
        item.evidence?.length ? `evidence=${item.evidence.slice(0, 3).join(" / ")}` : ""
      ].filter(Boolean).join(" · ");
      return `${index + 1}. ${item.label || item.id || "建议动作"}${meta ? `（${meta}）` : ""}${item.description ? `：${item.description}` : ""}${item.command ? `；命令：${item.command}` : ""}`;
    })
    .join("\n");
  const commands = (result.verificationPlan?.commands || [])
    .slice(0, 6)
    .map((item) => `- ${item.command || item}${item.reason ? `：${item.reason}` : ""}`)
    .join("\n");
  const triage = result.browserTriage && typeof result.browserTriage === "object" ? result.browserTriage : null;
  const triageCounts = triage?.counts ? JSON.stringify(triage.counts) : "";
  const triageFindings = (triage?.findings || [])
    .slice(0, 8)
    .map((item, index) => {
      const evidence = Array.isArray(item.evidence) ? item.evidence.join(" / ") : item.evidence;
      return `${index + 1}. [${item.severity || "info"}] ${item.area || "browser"}：${item.message || ""}${evidence ? `；证据：${String(evidence).slice(0, 240)}` : ""}`;
    })
    .join("\n");
  const triageActions = (triage?.nextActions || [])
    .slice(0, 4)
    .map((item) => `- ${item}`)
    .join("\n");
  const traceUrl = result.browserTrace?.finalUrl || result.browserTrace?.url || result.browserTrace?.targetUrl || "";
  const browserRecheck = [
    traceUrl ? `- 修复后对 ${traceUrl} 重新运行页面检查和 Trace。` : triage ? "- 修复后重新运行页面检查和 Trace，确认异常分诊不再是 error/warn。" : "",
    triage?.status === "error" ? "- 若异常来自 API/后端，同时运行服务端语法检查和 debug smoke。" : "",
    traceUrl ? "- 如果仍失败，把新的 Trace artifact、console 和 network 证据加入下一轮提示。" : ""
  ].filter(Boolean).join("\n");
  const triageVerificationCommands = triage?.status && triage.status !== "not_captured"
    ? [
      "node --check app.js",
      "node server.js --api-smoke-section=browser",
      triage.status === "error" ? "node server.js --api-smoke-section=debug" : ""
    ].filter(Boolean)
    : [];
  return [
    state.lastPrompt ? `继续修复上一轮任务：${state.lastPrompt}` : "请基于最近一次调试诊断修复当前项目。",
    "",
    "请优先依据已附加的最近调试诊断上下文定位问题，读取必要文件，生成最小 diff，并给出可运行的验证命令。",
    "",
    referencedFiles.length ? `优先读取相关文件：\n${referencedFiles.map((file) => `@${file}`).join("\n")}` : "",
    referencedFiles.length ? "" : "",
    result.status ? `诊断状态：${result.status}` : "",
    result.summary ? `诊断摘要：${JSON.stringify(result.summary)}` : "",
    triage ? `浏览器异常分诊修复上下文：${triage.status || "unknown"}${triageCounts ? ` · ${triageCounts}` : ""}` : "",
    triageFindings ? `分诊发现：\n${triageFindings}` : "",
    triageActions ? `分诊下一步：\n${triageActions}` : "",
    browserRecheck ? `页面复查要求：\n${browserRecheck}` : "",
    findings ? `主要发现：\n${findings}` : "",
    actions ? `建议动作：\n${actions}` : "",
    commands ? `建议验证命令：\n${commands}` : "",
    triageVerificationCommands.length ? `分诊建议验证命令：\n${triageVerificationCommands.map((command) => `- ${command}`).join("\n")}` : "",
    "",
    "要求：不要猜测文件内容；先读取相关文件；如果无法安全修改，请说明原因并给出下一步排查命令。"
  ].filter(Boolean).join("\n");
}

function buildReviewFixPrompt(item = {}) {
  const location = [item.file, item.line].filter(Boolean).join(":");
  return [
    state.lastPrompt ? `继续修复上一轮任务：${state.lastPrompt}` : "请修复当前审查发现。",
    "",
    "请优先读取相关文件，针对下面这条审查发现生成最小 diff，并给出可运行的验证命令。",
    "",
    `严重级别：${item.severity || "info"}`,
    location ? `位置：${location}` : "",
    item.message ? `发现：${item.message}` : "",
    "",
    "要求：不要猜测文件内容；如果无法安全修改，请说明原因并给出下一步排查命令。"
  ].filter(Boolean).join("\n");
}

function submitPromptForm() {
  if (form.requestSubmit) {
    form.requestSubmit();
  } else {
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  }
}

function shouldSubmitPromptFromKey(event) {
  if (!event || event.key !== "Enter") return false;
  if (event.isComposing || event.keyCode === 229) return false;
  if (event.shiftKey && !event.metaKey && !event.ctrlKey) return false;
  return true;
}

function handlePromptInputKeydown(event) {
  if (!shouldSubmitPromptFromKey(event)) return;
  event.preventDefault();
  submitPromptForm();
}

function resizePromptInput() {
  if (!input) return;
  input.style.height = "auto";
  const maxHeight = Number.parseInt(getComputedStyle(input).maxHeight, 10) || 320;
  const nextHeight = Math.min(Math.max(input.scrollHeight, 68), maxHeight);
  input.style.height = `${nextHeight}px`;
  input.classList.toggle("is-scrollable", input.scrollHeight > maxHeight);
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove("show"), 2600);
}

function formatBytes(bytes = 0) {
  const value = Number(bytes || 0);
  if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`;
  if (value >= 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${value} B`;
}

function escapeHtml(value = "") {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function normalizeReferencePath(value = "") {
  return String(value || "").replace(/^\.?[\\/]/, "").replaceAll("\\", "/");
}

function referenceSuggestionScore(token = "", filePath = "") {
  const needle = normalizeReferencePath(token).toLowerCase();
  const candidate = normalizeReferencePath(filePath).toLowerCase();
  if (!needle || !candidate) return 0;
  if (candidate === needle) return 1000;
  const needleBase = needle.split("/").pop() || needle;
  const candidateBase = candidate.split("/").pop() || candidate;
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
  if (pathExtension(candidateBase) === pathExtension(needleBase)) {
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

function pathExtension(value = "") {
  const last = String(value || "").split("/").pop() || "";
  const index = last.lastIndexOf(".");
  return index > 0 ? last.slice(index).toLowerCase() : "";
}

function suggestReferencePaths(token = "", files = state.files || []) {
  const normalizedToken = normalizeReferencePath(token);
  return (files || [])
    .map((file) => ({
      path: normalizeReferencePath(file.path || ""),
      size: file.size,
      score: referenceSuggestionScore(normalizedToken, file.path || "")
    }))
    .filter((item) => item.path && item.score >= 80)
    .sort((a, b) => b.score - a.score || a.path.length - b.path.length || a.path.localeCompare(b.path))
    .slice(0, 3);
}

function replacePromptReferenceToken(fromPath = "", toPath = "") {
  if (!input || !fromPath || !toPath) return false;
  const escaped = String(fromPath).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const before = "(^|[\\s([{\\\"'，。；：、])";
  const trailing = "([.,;:!?，。；：！？、]*)";
  const after = "(?=$|[\\s，。；：、'\\\"`<>()\\[\\]{}])";
  const pattern = new RegExp(`${before}@${escaped}${trailing}${after}`, "g");
  const next = input.value.replace(pattern, (match, prefix, suffix = "") => `${prefix}@${toPath}${suffix}`);
  if (next === input.value) return false;
  input.value = next;
  input.focus();
  scheduleReferencePreview({ immediate: true });
  showToast(`已替换为 @${toPath}`);
  return true;
}

function buildMissingReferenceContext(preview = {}) {
  const missing = preview.missing || preview.missingReferences || [];
  if (!missing.length) return "";
  const references = preview.references || preview.referencedFiles || [];
  const tokens = preview.tokens || [];
  return [
    "请修复当前提示词中的未命中 @file 引用，让代理在写代码/调试前能读取正确文件。",
    "",
    tokens.length ? `提示词中识别到 ${tokens.length} 个 @file token。` : "",
    references.length ? `已命中文件：${references.map((item) => `@${item.path || item}`).join(" ")}` : "已命中文件：(无)",
    "",
    "未命中的 @file 引用：",
    missing.map((item) => {
      const suggestions = (item.suggestions || []).map((suggestion) => `@${suggestion.path || suggestion}`).join(" ");
      return `- @${item.path || item}: ${item.reason || "未在当前工作区文件列表中找到匹配文件。"}${suggestions ? ` 候选：${suggestions}` : ""}`;
    }).join("\n"),
    "",
    "要求：先搜索当前工作区中最可能对应的文件路径；把提示词里的错误 @file 改成真实路径；不要假装已经读取未命中文件；如果确实没有对应文件，请说明缺失文件和下一步排查命令。"
  ].filter(Boolean).join("\n");
}

function appendMissingReferencesToPrompt(preview = {}) {
  const context = buildMissingReferenceContext(preview);
  if (!context) {
    showToast("暂无未命中的文件引用。");
    return "";
  }
  const current = input.value.trim();
  input.value = [current, context].filter(Boolean).join("\n\n---\n\n");
  input.focus();
  scheduleReferencePreview({ immediate: true });
  appendToolCall({
    title: "未命中文件引用已加入提示词",
    label: "@file",
    state: `${(preview.missing || preview.missingReferences || []).length} missing`,
    body: context.slice(0, 12000)
  });
  showToast("未命中文件引用已加入提示词。");
  return context;
}

function runMissingReferenceRepair(preview = {}) {
  if (state.busy) {
    showToast("代理正在运行，请稍后再修复引用。");
    return "";
  }
  const context = buildMissingReferenceContext(preview);
  if (!context) {
    showToast("暂无可修复的未命中文件引用。");
    return "";
  }
  const prompt = [
    context,
    "",
    "请现在直接修复这些引用问题：优先搜索真实文件路径，更新提示词中的 @file 引用，并在必要时继续执行原本的编码/调试任务。"
  ].join("\n");
  input.value = prompt;
  scheduleReferencePreview({ immediate: true });
  appendToolCall({
    title: "已启动引用修复",
    label: "@file",
    state: "running",
    body: prompt.slice(0, 12000)
  });
  showToast("正在启动引用修复。");
  submitPromptForm();
  return prompt;
}

function renderReferencePreview(preview = null) {
  if (!referencePreview) return;
  const tokens = preview?.tokens || [];
  if (!tokens.length) {
    referencePreview.innerHTML = "";
    referencePreview.className = "reference-preview";
    return;
  }
  const references = preview.references || [];
  const missing = preview.missing || [];
  referencePreview.className = `reference-preview ${missing.length ? "has-missing" : "all-matched"}`;
  const matchedText = references.length
    ? references.slice(0, 5).map((item) => `@${escapeHtml(item.path)}`).join(" ")
    : "暂无命中文件";
  const missingText = missing.length
    ? missing.slice(0, 5).map((item) => `@${escapeHtml(item.path)}`).join(" ")
    : "";
  const suggestionItems = missing
    .flatMap((item) => (item.suggestions || []).slice(0, 2).map((suggestion) => ({
      from: item.path,
      to: suggestion.path,
      label: `@${item.path} -> @${suggestion.path}`
    })))
    .slice(0, 4);
  const suggestionText = suggestionItems.length
    ? `<span class="reference-preview-suggestions">建议：${suggestionItems.map((item) => `<button type="button" data-action="apply-reference-suggestion" data-from="${escapeHtml(item.from)}" data-to="${escapeHtml(item.to)}">${escapeHtml(item.label)}</button>`).join("")}</span>`
    : "";
  referencePreview.innerHTML = `
    <span class="reference-preview-summary">${references.length}/${tokens.length} 个 @file 命中 · ${formatBytes(preview.bytes || 0)}</span>
    <span class="reference-preview-paths">${matchedText}</span>
    ${missingText ? `<span class="reference-preview-missing">未命中：${missingText}</span>` : ""}
    ${suggestionText}
    ${missing.length ? `<span class="reference-preview-actions"><button type="button" data-action="prompt-missing-references">加入提示词</button><button type="button" data-action="repair-missing-references">修复引用</button></span>` : ""}
  `;
  referencePreview.querySelectorAll("[data-action='apply-reference-suggestion']").forEach((button) => {
    button.addEventListener("click", () => {
      replacePromptReferenceToken(button.dataset.from || "", button.dataset.to || "");
    });
  });
  referencePreview.querySelector("[data-action='prompt-missing-references']")?.addEventListener("click", () => {
    appendMissingReferencesToPrompt(preview);
  });
  referencePreview.querySelector("[data-action='repair-missing-references']")?.addEventListener("click", () => {
    runMissingReferenceRepair(preview);
  });
}

function localPromptReferencePreview(prompt = "") {
  const text = String(prompt || "");
  if (!text.includes("@")) return { tokens: [], references: [], missing: [], bytes: 0 };
  const tokens = [];
  const pattern = /(^|[\s([{"'，。；：、])@([^\s，。；：、'"`<>()\[\]{}]+)/g;
  let match;
  while ((match = pattern.exec(text))) {
    const raw = match[2].replace(/[.,;:!?，。；：！？、]+$/g, "");
    if (!raw || raw.includes("@")) continue;
    const token = raw.replace(/^\.?[\\/]/, "").replaceAll("\\", "/");
    if (!tokens.some((item) => item.toLowerCase() === token.toLowerCase())) tokens.push(token);
  }
  const references = [];
  const matched = new Set();
  for (const token of tokens.slice(0, 24)) {
    const file = state.files.find((item) => String(item.path || "").replaceAll("\\", "/").toLowerCase() === token.toLowerCase());
    if (!file) continue;
    matched.add(token.toLowerCase());
    references.push({ path: file.path, size: file.size });
  }
  const missing = tokens
    .slice(0, 24)
    .filter((token) => !matched.has(token.toLowerCase()))
    .map((path) => ({
      path,
      reason: "未在当前文件列表中找到匹配文件。",
      suggestions: suggestReferencePaths(path)
    }));
  const bytes = references.reduce((sum, item) => sum + Number(item.size || 0), 0);
  return { tokens: tokens.slice(0, 24), references, missing, bytes };
}

function scheduleReferencePreview({ immediate = false } = {}) {
  if (!referencePreview || !input) return;
  resizePromptInput();
  window.clearTimeout(state.referencePreviewTimer);
  const prompt = input.value;
  const localPreview = localPromptReferencePreview(prompt);
  renderReferencePreview(localPreview);
  if (!localPreview.tokens.length) return;
  const requestId = state.referencePreviewRequestId + 1;
  state.referencePreviewRequestId = requestId;
  state.referencePreviewTimer = window.setTimeout(async () => {
    try {
      const preview = await api("/api/prompt-references", {
        method: "POST",
        body: JSON.stringify({ prompt })
      });
      if (state.referencePreviewRequestId === requestId && input.value === prompt) {
        renderReferencePreview(preview);
      }
    } catch {
      if (state.referencePreviewRequestId === requestId) {
        referencePreview.classList.add("has-missing");
      }
    }
  }, immediate ? 0 : 260);
}

function setBusy(value, label = "待命") {
  state.busy = value;
  runAgentBtn.disabled = value;
  approveBtn.disabled = value;
  if (approvePartialBtn) approvePartialBtn.disabled = value;
  if (copyAllDiffBtn) {
    const hasDiff = Boolean(state.pendingDiff || (state.pendingPatches || []).some((patch) => patch.diff));
    copyAllDiffBtn.disabled = value || !hasDiff;
  }
  if (toggleAllDiffBtn) {
    const hasDiff = Boolean(state.pendingPatches?.length);
    toggleAllDiffBtn.disabled = value || !hasDiff;
  }
  if (pendingDiffImpactBtn) {
    const hasDiff = Boolean(state.pendingDiff || (state.pendingPatches || []).some((patch) => patch.diff || patch.path));
    pendingDiffImpactBtn.disabled = value || !hasDiff;
  }
  if (preApplyReviewBtn) {
    const hasDiff = Boolean(state.pendingDiff || (state.pendingPatches || []).some((patch) => patch.diff || patch.path));
    preApplyReviewBtn.disabled = value || !hasDiff;
  }
  rollbackBtn.disabled = value;
  runCommandsBtn.disabled = value;
  if (debugDiagnosticsBtn) debugDiagnosticsBtn.disabled = value;
  if (queueIsolationBtn) queueIsolationBtn.disabled = value;
  if (startProcessBtn) startProcessBtn.disabled = value;
  if (processHealthBtn) processHealthBtn.disabled = value;
  if (processHistoryBtn) processHistoryBtn.disabled = value;
  if (reviewBtn) reviewBtn.disabled = value;
  if (worktreeBtn) worktreeBtn.disabled = value;
  if (contextSnapshotBtn) contextSnapshotBtn.disabled = value;
  if (contextCompactBtn) contextCompactBtn.disabled = value;
  if (contextRollupBtn) contextRollupBtn.disabled = value;
  if (modelPolicyBtn) modelPolicyBtn.disabled = value;
  if (modelUsageBtn) modelUsageBtn.disabled = value;
  if (modelBudgetBtn) modelBudgetBtn.disabled = value;
  if (modelCostBtn) modelCostBtn.disabled = value;
  if (modelCostPolicyBtn) modelCostPolicyBtn.disabled = value;
  if (modelBillingBtn) modelBillingBtn.disabled = value;
  if (semanticIndexBtn) semanticIndexBtn.disabled = value;
  if (symbolOutlineBtn) symbolOutlineBtn.disabled = value;
  if (semanticDiagnosticsBtn) semanticDiagnosticsBtn.disabled = value;
  if (semanticImpactBtn) semanticImpactBtn.disabled = value;
  if (dependencyGraphBtn) dependencyGraphBtn.disabled = value;
  if (queueBtn) queueBtn.disabled = value;
  if (handoffBtn) handoffBtn.disabled = value;
  if (mergeGateBtn) mergeGateBtn.disabled = value;
  if (verificationPlanBtn) verificationPlanBtn.disabled = value;
  if (ciStatusBtn) ciStatusBtn.disabled = value;
  if (policyAuditBtn) policyAuditBtn.disabled = value;
  if (permissionMatrixBtn) permissionMatrixBtn.disabled = value;
  if (remotePublishPlanBtn) remotePublishPlanBtn.disabled = value;
  if (remotePublishPackagesBtn) remotePublishPackagesBtn.disabled = value;
  if (remotePublishPreflightBtn) remotePublishPreflightBtn.disabled = value;
  if (extensionTrustBtn) extensionTrustBtn.disabled = value;
  if (browserAuditBtn) browserAuditBtn.disabled = value;
  runState.lastChild.textContent = value ? "运行中" : label;
}

function appendMessage(role, text, options = {}) {
  const article = document.createElement("article");
  article.className = `message ${role}`;
  article.innerHTML = `<span>${role === "user" ? "你" : "Forge"}</span><p></p>`;
  article.querySelector("p").textContent = text;
  log.appendChild(article);
  log.scrollTop = log.scrollHeight;
  if (options.record !== false) {
    state.threadMessages.push({ role: role === "user" ? "user" : "agent", text, createdAt: new Date().toISOString() });
    persistActiveThread();
  }
}

function renderMessages(messages = []) {
  log.innerHTML = "";
  state.threadMessages = [];
  messages.forEach((message) => appendMessage(message.role === "user" ? "user" : "agent", message.text || "", { record: false }));
  state.threadMessages = messages.map((message) => ({
    role: message.role === "user" ? "user" : "agent",
    text: message.text || "",
    createdAt: message.createdAt || new Date().toISOString()
  })).filter((message) => message.text);
}

function persistActiveThread() {
  if (!state.activeThreadId) return;
  const messages = state.threadMessages.slice(-80);
  const title = messages.find((message) => message.role === "user")?.text || messages[0]?.text || "新会话";
  api("/api/thread", {
    method: "PATCH",
    body: JSON.stringify({
      id: state.activeThreadId,
      title,
      messages,
      status: state.pendingDiff ? "awaiting_approval" : "active",
      pendingProposalId: state.restoredProposalId || ""
    })
  }).then((result) => {
    renderThreads(result.threads || []);
  }).catch(() => {});
}

function compactThreadMessages(messages = [], max = 9000) {
  const rows = (Array.isArray(messages) ? messages : []).slice(-18).map((message, index) => {
    const role = message.role === "user" ? "user" : "agent";
    const text = String(message.text || "").trim();
    const createdAt = message.createdAt ? ` @ ${message.createdAt}` : "";
    return `#${index + 1} ${role}${createdAt}\n${text}`;
  });
  return rows.join("\n\n").slice(0, max);
}

function buildThreadPromptContext(detail = {}) {
  const messages = Array.isArray(detail.messages) ? detail.messages : [];
  if (!detail.id && !messages.length) return "";
  const summary = detail.summary || {};
  const threadBrowserTriageContext = formatBrowserTriageContinuation(state.lastDebugDiagnostics?.browserTriage || null, { title: "会话关联浏览器异常分诊" });
  return [
    "请基于这段历史会话上下文继续当前编码/调试任务。",
    "",
    `会话 ID：${detail.id || summary.id || ""}`,
    `标题：${detail.title || summary.title || "未命名会话"}`,
    `状态：${detail.status || summary.status || "active"}`,
    summary.parentThreadId ? `父会话：${summary.parentThreadId}` : "",
    summary.pendingProposalId ? `待审批提案：${summary.pendingProposalId}` : "",
    `消息数：${messages.length || summary.messageCount || 0}`,
    summary.lastMessage ? `最近消息摘要：${summary.lastMessage}` : "",
    "",
    "最近会话消息：",
    compactThreadMessages(messages),
    threadBrowserTriageContext ? "\n页面调试线索：" : "",
    threadBrowserTriageContext,
    "",
    "要求：先读取必要文件和当前工作树状态，不要假设历史上下文仍然完全准确；保留已有正确改动，优先补齐最影响写代码/调试体验的最小闭环；需要改代码时输出最小 diff，并给出或执行安全验证命令。"
  ].filter(Boolean).join("\n");
}

async function loadThreadDetail(thread = {}) {
  const id = thread.id || "";
  if (!id) throw new Error("会话缺少 id。");
  return api(`/api/thread?id=${encodeURIComponent(id)}`);
}

function appendThreadFailureEvidence(thread = {}, error, {
  title = "会话操作失败",
  action = "thread-action",
  endpoint = "/api/thread",
  request = null,
  retry = null
} = {}) {
  return appendActionFailureEvidence({
    kind: "thread",
    action,
    targetName: thread.title || thread.id || "thread",
    endpoint,
    request: request || { id: thread.id || "" },
    item: thread,
    error
  }, {
    title,
    label: "thread",
    retry,
    safe: thread.id ? () => appendThreadContextToPrompt(thread) : null
  });
}

async function appendThreadContextToPrompt(thread = {}) {
  try {
    const detail = await loadThreadDetail(thread);
    const context = buildThreadPromptContext(detail);
    if (!context) {
      showToast("暂无可加入提示词的会话上下文。");
      return "";
    }
    const current = input.value.trim();
    input.value = [current, context].filter(Boolean).join("\n\n---\n\n");
    input.focus();
    scheduleReferencePreview({ immediate: true });
    appendToolCall({
      title: `会话上下文已加入提示词：${detail.title || detail.id}`,
      label: "thread",
      state: detail.status || "active",
      body: context.slice(0, 12000)
    });
    showToast("会话上下文已加入提示词。");
    return context;
  } catch (error) {
    showToast(error.message);
    appendThreadFailureEvidence(thread, error, {
      title: `会话上下文加入失败：${thread.title || thread.id || "thread"}`,
      action: "thread-prompt",
      endpoint: "/api/thread",
      request: { id: thread.id || "" },
      retry: () => appendThreadContextToPrompt(thread)
    });
    return "";
  }
}

async function runThreadContinuation(thread = {}) {
  if (state.busy) {
    showToast("代理正在运行，请稍后再继续会话。");
    return "";
  }
  try {
    const detail = await loadThreadDetail(thread);
    const context = buildThreadPromptContext(detail);
    if (!context) {
      showToast("暂无可用于继续的会话上下文。");
      return "";
    }
    const prompt = [
      context,
      "",
      "请现在直接基于这段历史会话继续推进：先核对当前文件状态，再完成下一步最小可验证修复或增强；如历史结论已过期，请以当前工作树为准。"
    ].join("\n");
    input.value = prompt;
    scheduleReferencePreview({ immediate: true });
    appendToolCall({
      title: `已启动会话继续：${detail.title || detail.id}`,
      label: "thread",
      state: "running",
      body: prompt.slice(0, 12000)
    });
    showToast("正在基于历史会话启动继续任务。");
    submitPromptForm();
    return prompt;
  } catch (error) {
    showToast(error.message);
    appendThreadFailureEvidence(thread, error, {
      title: `会话继续失败：${thread.title || thread.id || "thread"}`,
      action: "thread-continuation",
      endpoint: "/api/thread",
      request: { id: thread.id || "" },
      retry: () => runThreadContinuation(thread)
    });
    return "";
  }
}

function contextEvidenceValue(kind, result = {}) {
  if (kind === "snapshot") return result.snapshot || result;
  if (kind === "compact") return result.compact || result;
  if (kind === "rollup") return result.rollup || result;
  return result;
}

function contextEvidenceTitle(kind) {
  if (kind === "snapshot") return "上下文摘要";
  if (kind === "compact") return "上下文压缩";
  if (kind === "rollup") return "上下文滚动摘要";
  return "上下文证据";
}

function contextEvidenceLabel(kind) {
  if (kind === "compact") return "compact";
  if (kind === "rollup") return "rollup";
  return "context";
}

function contextEvidencePromptTitle(kind) {
  if (kind === "snapshot") return "上下文摘要已加入提示词";
  if (kind === "compact") return "上下文压缩已加入提示词";
  if (kind === "rollup") return "上下文滚动摘要已加入提示词";
  return "上下文证据已加入提示词";
}

function buildContextEvidencePrompt(kind, result = {}) {
  const evidence = contextEvidenceValue(kind, result);
  if (!evidence || typeof evidence !== "object") return "";
  const title = contextEvidenceTitle(kind);
  const summaryLines = [];
  if (evidence.workspace) summaryLines.push(`工作区：${evidence.workspace}`);
  if (evidence.generatedAt) summaryLines.push(`生成时间：${evidence.generatedAt}`);
  if (evidence.fileCount !== undefined) summaryLines.push(`文件数：${evidence.fileCount}`);
  if (evidence.repo?.fileCount !== undefined) summaryLines.push(`仓库文件数：${evidence.repo.fileCount}`);
  if (evidence.summary?.entries !== undefined) summaryLines.push(`滚动条目：${evidence.summary.entries}`);
  if (Array.isArray(evidence.summary)) summaryLines.push(`摘要条目：${evidence.summary.length}`);
  if (evidence.goal?.phase) summaryLines.push(`目标阶段：${evidence.goal.phase}`);
  return [
    `请基于这份${title}继续当前编码/调试任务。`,
    "",
    ...summaryLines,
    "",
    `${title} JSON：`,
    JSON.stringify(evidence, null, 2).slice(0, 12000),
    "",
    "要求：先核对当前工作树和必要文件，判断这份上下文是否仍然准确；优先补齐最影响写代码/调试体验的最小闭环；需要改代码时输出最小 diff，并给出或执行安全验证命令。"
  ].filter(Boolean).join("\n");
}

function contextEvidenceVerificationCommands(kind = "context", result = {}, {
  source = "context-evidence",
  includeFallback = true
} = {}) {
  const evidence = contextEvidenceValue(kind, result) || {};
  const commands = [];
  const visit = (value) => {
    if (!value) return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (typeof value !== "object") return;
    if (Array.isArray(value.verificationCommands)) {
      value.verificationCommands.forEach((item) => commands.push(item));
    }
    Object.values(value).forEach(visit);
  };
  visit(evidence);
  if (includeFallback) {
    commands.push(
      { command: "node --check app.js", reason: "复查上下文证据卡、失败证据和排队验证入口的前端语法。", source },
      { command: "node --check server.js", reason: "复查上下文摘要、压缩、滚动摘要和恢复状态接口的后端语法。", source },
      { command: "node server.js --ui-smoke-test", reason: "复查上下文证据按钮、继续任务和失败恢复入口。", source },
      { command: "node server.js --api-smoke-section=fast", reason: "复查上下文摘要、压缩、滚动摘要、目标状态和核心恢复链路。", source },
      { command: "node server.js --api-smoke-section=debug", reason: "复查上下文失败后进入调试诊断和验证修复链路。", source }
    );
  }
  return normalizeCommandItems(commands).slice(0, 12);
}

function contextEvidenceVerificationSuccessTitle(kind = "context", title = "") {
  if (title) return `${title}验证命令已放入面板`;
  if (kind === "snapshot") return "上下文摘要验证命令已放入面板";
  if (kind === "compact") return "上下文压缩验证命令已放入面板";
  if (kind === "rollup") return "上下文滚动摘要验证命令已放入面板";
  return "上下文证据验证命令已放入面板";
}

function stageContextEvidenceVerificationCommands(kind = "context", result = {}, {
  title = "",
  source = "context-evidence",
  includeFallback = true,
  note = ""
} = {}) {
  const commands = contextEvidenceVerificationCommands(kind, result, { source, includeFallback });
  const displayTitle = title || contextEvidenceTitle(kind);
  return stageRepairVerificationCommands(commands, {
    title: `${displayTitle}验证命令`,
    successTitle: contextEvidenceVerificationSuccessTitle(kind, title),
    source,
    note: note || "上下文证据会先复查语法、UI smoke、fast smoke 和 debug smoke。"
  });
}

function appendContextEvidenceCard(kind, result = {}) {
  const evidence = contextEvidenceValue(kind, result);
  appendToolCall({
    title: `${contextEvidenceTitle(kind)}已保存`,
    label: contextEvidenceLabel(kind),
    state: "完成",
    body: JSON.stringify(evidence, null, 2).slice(0, 12000)
  });
  const context = buildContextEvidencePrompt(kind, result);
  if (!context) return;
  const actions = document.createElement("div");
  actions.className = "debug-last-failed-actions";
  actions.innerHTML = `<button type="button" data-action="prompt">加入提示词</button><button type="button" data-action="stage-verification">排队验证</button><button type="button" data-action="continue">直接继续</button>`;
  actions.querySelector("[data-action='prompt']").addEventListener("click", () => {
    const current = input.value.trim();
    input.value = [current, context].filter(Boolean).join("\n\n---\n\n");
    input.focus();
    scheduleReferencePreview({ immediate: true });
    appendToolCall({
      title: contextEvidencePromptTitle(kind),
      label: contextEvidenceLabel(kind),
      state: "ready",
      body: context.slice(0, 12000)
    });
    showToast(`${contextEvidencePromptTitle(kind)}。`);
  });
  actions.querySelector("[data-action='stage-verification']").addEventListener("click", () => {
    stageContextEvidenceVerificationCommands(kind, result);
  });
  actions.querySelector("[data-action='continue']").addEventListener("click", () => {
    if (state.busy) {
      showToast("代理正在运行，请稍后再继续上下文任务。");
      return;
    }
    const prompt = [
      context,
      "",
      "请现在直接基于这份上下文证据继续推进：先确认当前文件状态，再完成下一步最小可验证修复或增强；如果上下文过期，以当前工作树为准。"
    ].join("\n");
    input.value = prompt;
    scheduleReferencePreview({ immediate: true });
    appendToolCall({
      title: `已启动上下文继续：${contextEvidenceTitle(kind)}`,
      label: contextEvidenceLabel(kind),
      state: "running",
      body: prompt.slice(0, 12000)
    });
    showToast("正在基于上下文证据启动继续任务。");
    submitPromptForm();
  });
  log.lastElementChild?.appendChild(actions);
}

function appendContextFailureEvidence(kind, error, {
  endpoint = "",
  request = null
} = {}) {
  const message = error?.message || String(error || "unknown error");
  const evidence = {
    status: "failed",
    generatedAt: new Date().toISOString(),
    kind,
    title: contextEvidenceTitle(kind),
    endpoint,
    request,
    error: message,
    workspace: workspaceStatus?.textContent || "",
    lastPrompt: state.lastPrompt || input.value.trim(),
    pendingDiff: {
      bytes: String(state.pendingDiff || "").length,
      files: (state.pendingPatches || []).map((patch) => patch.path).filter(Boolean).slice(0, 20)
    },
    contextState: {
      hasSnapshot: Boolean(state.contextSnapshot),
      hasRollup: Boolean(state.contextRollup),
      hasDebugDiagnostics: Boolean(state.lastDebugDiagnostics),
      hasRepairChain: Boolean(state.activeRepairChain),
      activeThreadId: state.activeThreadId || ""
    }
  };
  appendContextEvidenceCard(kind, {
    [kind]: evidence
  });
  stageContextEvidenceVerificationCommands(kind, {
    [kind]: evidence
  }, {
    title: `${contextEvidenceTitle(kind)}失败`,
    source: "context-failure"
  });
  return evidence;
}

function modelEvidenceValue(kind, result = {}) {
  if (kind === "policy") return result.policy || result;
  if (kind === "usage") return result.usage || result;
  if (kind === "budget") return result.budget || result;
  if (kind === "cost") return result.cost || result;
  if (kind === "cost-policy") return result.policy || result;
  if (kind === "billing") return result.billing || result;
  return result;
}

function modelEvidenceTitle(kind) {
  if (kind === "policy") return "模型策略";
  if (kind === "usage") return "模型用量";
  if (kind === "budget") return "模型预算";
  if (kind === "cost") return "模型成本";
  if (kind === "cost-policy") return "模型价格表";
  if (kind === "billing") return "模型账单核对";
  return "模型证据";
}

function modelEvidenceState(kind, evidence = {}) {
  if (kind === "usage") return `${evidence.summary?.requestCount || 0} requests`;
  if (kind === "cost-policy") return evidence.valid ? "valid" : "invalid";
  return evidence.status || "unknown";
}

function modelEvidenceSummary(kind, evidence = {}) {
  if (kind === "policy") {
    return {
      generatedAt: evidence.generatedAt,
      status: evidence.status,
      endpoint: evidence.endpoint,
      runtime: evidence.runtime,
      budgetPolicy: evidence.budgetPolicy,
      guardrails: evidence.guardrails,
      remainingGaps: evidence.remainingGaps
    };
  }
  if (kind === "usage") {
    return {
      generatedAt: evidence.generatedAt,
      endpoint: evidence.endpoint,
      summary: evidence.summary,
      totals: evidence.totals,
      recent: evidence.recent?.slice(0, 12),
      policy: evidence.policy
    };
  }
  if (kind === "budget") {
    return {
      generatedAt: evidence.generatedAt,
      status: evidence.status,
      blocksModelCall: evidence.blocksModelCall,
      checks: evidence.checks,
      usage: evidence.usage,
      policy: evidence.policy,
      message: evidence.message
    };
  }
  if (kind === "cost") {
    return {
      generatedAt: evidence.generatedAt,
      status: evidence.status,
      currency: evidence.currency,
      configured: evidence.configured,
      estimatedCost: evidence.estimatedCost,
      pricedModelCount: evidence.pricedModelCount,
      unpricedModelCount: evidence.unpricedModelCount,
      rows: evidence.rows,
      policy: evidence.policy,
      notes: evidence.notes,
      error: evidence.error
    };
  }
  if (kind === "cost-policy") {
    return {
      envVar: evidence.envVar,
      configured: evidence.configured,
      valid: evidence.valid,
      parsed: evidence.parsed,
      schema: evidence.schema,
      exampleJson: evidence.exampleJson,
      policy: evidence.policy,
      notes: evidence.notes
    };
  }
  if (kind === "billing") {
    return {
      generatedAt: evidence.generatedAt,
      status: evidence.status,
      configured: evidence.configured,
      currency: evidence.currency,
      period: evidence.period,
      estimatedCost: evidence.estimatedCost,
      actualCost: evidence.actualCost,
      variance: evidence.variance,
      rows: evidence.rows,
      billing: evidence.billing,
      policy: evidence.policy,
      notes: evidence.notes,
      error: evidence.error
    };
  }
  return evidence;
}

function buildModelEvidencePrompt(kind, result = {}) {
  const evidence = modelEvidenceValue(kind, result);
  if (!evidence || typeof evidence !== "object") return "";
  const title = modelEvidenceTitle(kind);
  const summary = modelEvidenceSummary(kind, evidence);
  const status = modelEvidenceState(kind, evidence);
  const warnings = [
    evidence.blocksModelCall ? "预算会阻止模型请求" : "",
    evidence.error ? `错误：${evidence.error}` : "",
    evidence.unpricedModelCount ? `未定价模型：${evidence.unpricedModelCount}` : "",
    evidence.valid === false ? "价格表 schema 无效" : "",
    evidence.status === "over_budget" ? "预算超限" : "",
    evidence.status === "variance" ? "账单存在差异" : ""
  ].filter(Boolean);
  return [
    `请基于这份${title}证据优化当前项目的模型运行、预算、成本或账单核对体验。`,
    "",
    `证据类型：${kind}`,
    `状态：${status}`,
    warnings.length ? `风险：${warnings.join("；")}` : "",
    "",
    "模型证据摘要：",
    JSON.stringify(summary, null, 2).slice(0, 9000),
    "",
    "完整证据 JSON：",
    JSON.stringify(evidence, null, 2).slice(0, 12000),
    "",
    "要求：先判断该证据是否暴露真实写代码/调试时的模型稳定性、fallback、预算、成本或账单 blocker；需要改代码时输出最小 diff；需要验证时给出或执行安全检查命令；不要发起真实模型请求或远端写入。"
  ].filter(Boolean).join("\n");
}

function appendModelEvidenceToPrompt(kind, result = {}) {
  const context = buildModelEvidencePrompt(kind, result);
  if (!context) {
    showToast("暂无可加入提示词的模型证据。");
    return "";
  }
  const current = input.value.trim();
  input.value = [current, context].filter(Boolean).join("\n\n---\n\n");
  input.focus();
  scheduleReferencePreview({ immediate: true });
  appendToolCall({
    title: `${modelEvidenceTitle(kind)}证据已加入提示词`,
    label: "model",
    state: "ready",
    body: context.slice(0, 12000)
  });
  showToast("模型证据已加入提示词。");
  return context;
}

function runModelEvidenceRepair(kind, result = {}) {
  if (state.busy) {
    showToast("代理正在运行，请稍后再启动模型证据优化。");
    return "";
  }
  const context = buildModelEvidencePrompt(kind, result);
  if (!context) {
    showToast("暂无可用于优化的模型证据。");
    return "";
  }
  const prompt = [
    context,
    "",
    "请现在直接基于这份模型证据继续改进：优先补齐模型 fallback、预算预检、成本估算、价格表 schema 或账单核对中的最大短板，并给出安全验证命令。"
  ].join("\n");
  input.value = prompt;
  scheduleReferencePreview({ immediate: true });
  appendToolCall({
    title: `已启动模型证据优化：${modelEvidenceTitle(kind)}`,
    label: "model",
    state: "running",
    body: prompt.slice(0, 12000)
  });
  showToast("正在基于模型证据启动优化任务。");
  submitPromptForm();
  return prompt;
}

function buildModelVerificationPrompt(kind, result = {}) {
  const context = buildModelEvidencePrompt(kind, result);
  if (!context) return "";
  const commands = modelEvidenceVerificationCommands(kind, result).map((item) => item.command);
  return [
    context,
    "",
    "目标：把这份模型运行证据转成可验证修复闭环。",
    "",
    "建议验证命令：",
    ...commands.map((command) => `- ${command}`),
    "",
    "输出要求：",
    "1. 先判断问题属于模型 fallback、预算预检、成本估算、价格表 schema、账单核对、SSE 流式解析还是错误恢复。",
    "2. 如果需要改代码，请生成最小 diff，避免无关重构。",
    "3. 不要发起真实模型请求、远端写入或泄露密钥。",
    "4. 修复后必须说明应运行哪些本地验证命令，并优先复用上面的安全检查。"
  ].filter(Boolean).join("\n");
}

function modelEvidenceVerificationCommands(kind = "model", result = {}, {
  source = "model-evidence"
} = {}) {
  const evidence = modelEvidenceValue(kind, result) || {};
  const commands = [
    { command: "node --check app.js", reason: "复查模型证据卡、失败证据和命令面板入口的前端语法。", source },
    { command: "node --check server.js", reason: "复查模型策略、预算、成本、账单和 SSE 入口的后端语法。", source },
    { command: "node server.js --ui-smoke-test", reason: "复查模型证据、代理失败证据和验证排队按钮。", source },
    { command: "node server.js --api-smoke-section=model", reason: "复查模型策略、用量、预算、成本、价格表、账单和 agent-stream。", source },
    { command: "node server.js --api-smoke-section=debug", reason: "复查模型/代理失败后进入调试恢复链路。", source }
  ];
  if (evidence.status === "over_budget" || evidence.blocksModelCall) {
    commands.push({ command: "node server.js --api-smoke-section=fast", reason: "预算阻断后复查核心、模型、写入和门禁组合链路。", source });
  }
  return normalizeCommandItems(commands).slice(0, 12);
}

function stageModelEvidenceVerificationCommands(kind = "model", result = {}, {
  title = "",
  source = "model-evidence",
  note = ""
} = {}) {
  const commands = modelEvidenceVerificationCommands(kind, result, { source });
  return stageRepairVerificationCommands(commands, {
    title: `${title || modelEvidenceTitle(kind)}验证命令`,
    successTitle: `${title || modelEvidenceTitle(kind)}验证命令已放入面板`,
    source,
    note: note || "模型证据会先复查语法、UI smoke、model smoke 和 debug smoke。"
  });
}

function agentFailureVerificationCommands(evidence = {}, {
  source = "agent-failure"
} = {}) {
  const commands = [
    { command: "node --check app.js", reason: "复查代理失败证据卡、引用文件和验证排队入口的前端语法。", source },
    { command: "node --check server.js", reason: "复查 agent-stream、模型运行层和错误恢复入口的后端语法。", source },
    { command: "node server.js --ui-smoke-test", reason: "复查代理失败证据、重试、诊断修复和命令面板入口。", source },
    { command: "node server.js --api-smoke-section=model", reason: "复查模型策略、预算、账单和 SSE agent-stream 链路。", source },
    { command: "node server.js --api-smoke-section=debug", reason: "复查代理失败后进入调试诊断和恢复链路。", source }
  ];
  if (evidence?.debugContext || Array.isArray(evidence?.streamLog) && evidence.streamLog.length) {
    commands.push({ command: "node server.js --api-smoke-section=fast", reason: "带调试上下文或流式事件时复查核心、模型、写入和门禁组合链路。", source });
  }
  return normalizeCommandItems(commands).slice(0, 12);
}

function stageAgentFailureVerificationCommands(evidence = {}, {
  title = "代理失败",
  source = "agent-failure",
  note = ""
} = {}) {
  const commands = agentFailureVerificationCommands(evidence, { source });
  return stageRepairVerificationCommands(commands, {
    title: `${title}验证命令`,
    successTitle: "代理失败验证命令已放入面板",
    source,
    note: note || "代理失败会先复查语法、UI smoke、model smoke 和 debug smoke。"
  });
}

function appendModelVerificationPromptToPrompt(kind, result = {}) {
  const prompt = buildModelVerificationPrompt(kind, result);
  if (!prompt) {
    showToast("暂无可生成验证提示的模型证据。");
    return "";
  }
  const current = input.value.trim();
  input.value = [current, prompt].filter(Boolean).join("\n\n---\n\n");
  input.focus();
  scheduleReferencePreview({ immediate: true });
  appendToolCall({
    title: `${modelEvidenceTitle(kind)}验证提示已加入提示词`,
    label: "model",
    state: "ready",
    body: prompt.slice(0, 12000)
  });
  showToast("模型验证提示已加入提示词。");
  return prompt;
}

function runModelVerificationFix(kind, result = {}) {
  if (state.busy) {
    showToast("代理正在运行，请稍后再启动模型验证修复。");
    return "";
  }
  const prompt = buildModelVerificationPrompt(kind, result);
  if (!prompt) {
    showToast("暂无可运行的模型验证修复提示。");
    return "";
  }
  input.value = prompt;
  scheduleReferencePreview({ immediate: true });
  appendToolCall({
    title: `已启动模型验证修复：${modelEvidenceTitle(kind)}`,
    label: "model",
    state: "running",
    body: prompt.slice(0, 12000)
  });
  showToast("正在启动带验证要求的模型运行修复。");
  submitPromptForm();
  return prompt;
}

function appendModelEvidenceCard(kind, result = {}) {
  const evidence = modelEvidenceValue(kind, result);
  appendToolCall({
    title: `${modelEvidenceTitle(kind)}已读取`,
    label: "model",
    state: modelEvidenceState(kind, evidence || {}),
    body: JSON.stringify(modelEvidenceSummary(kind, evidence || {}), null, 2).slice(0, 12000)
  });
  const context = buildModelEvidencePrompt(kind, result);
  if (!context) return;
  const actions = document.createElement("div");
  actions.className = "debug-last-failed-actions";
  actions.innerHTML = `<button type="button" data-action="prompt">加入提示词</button><button type="button" data-action="stage-verification">排队验证</button><button type="button" data-action="verification-prompt">验证提示</button><button type="button" data-action="verification-fix">验证修复</button><button type="button" data-action="repair">直接优化</button>`;
  actions.querySelector("[data-action='prompt']").addEventListener("click", () => {
    appendModelEvidenceToPrompt(kind, result);
  });
  actions.querySelector("[data-action='stage-verification']").addEventListener("click", () => {
    stageModelEvidenceVerificationCommands(kind, result);
  });
  actions.querySelector("[data-action='verification-prompt']").addEventListener("click", () => {
    appendModelVerificationPromptToPrompt(kind, result);
  });
  actions.querySelector("[data-action='verification-fix']").addEventListener("click", () => {
    runModelVerificationFix(kind, result);
  });
  actions.querySelector("[data-action='repair']").addEventListener("click", () => {
    runModelEvidenceRepair(kind, result);
  });
  log.lastElementChild?.appendChild(actions);
}

function buildModelFailureEvidence(kind, error, {
  endpoint = "",
  request = null
} = {}) {
  return {
    generatedAt: new Date().toISOString(),
    status: "failed",
    kind,
    title: modelEvidenceTitle(kind),
    endpoint,
    request,
    error: normalizeActionFailureError(error),
    workspace: workspaceStatus?.textContent || "",
    lastPrompt: state.lastPrompt || input.value.trim(),
    modelRuntime: {
      candidates: state.modelRuntime?.candidates || [],
      lastModel: state.modelRuntime?.lastModel || "",
      lastStatus: state.modelRuntime?.lastStatus || "",
      lastError: state.modelRuntime?.lastError || "",
      requestCount: state.modelRuntime?.requestCount || 0,
      failureCount: state.modelRuntime?.failureCount || 0
    },
    pendingDiff: state.pendingDiff?.patches?.length ? {
      patches: state.pendingDiff.patches.length,
      commands: (state.pendingCommands || []).map((item) => item.command || item).slice(0, 8)
    } : null
  };
}

function appendModelFailureEvidence(kind, error, options = {}) {
  const evidence = buildModelFailureEvidence(kind, error, options);
  const result = kind === "cost-policy" ? { policy: evidence } : { [kind]: evidence };
  stageModelEvidenceVerificationCommands(kind, result, {
    title: `${modelEvidenceTitle(kind)}失败证据`,
    source: `model-${kind}-failure`,
    note: "模型证据读取失败后自动排入语法、UI、model 和 debug 复查命令，避免模型运行层诊断中断。"
  });
  appendToolCall({
    title: `${modelEvidenceTitle(kind)}读取失败`,
    label: "model",
    state: "失败",
    body: buildModelEvidencePrompt(kind, result).slice(0, 12000)
  });
  const actions = document.createElement("div");
  actions.className = "debug-last-failed-actions";
  actions.innerHTML = `<button type="button" data-action="prompt">加入提示词</button><button type="button" data-action="stage-verification">排队验证</button><button type="button" data-action="verification-prompt">验证提示</button><button type="button" data-action="verification-fix">验证修复</button><button type="button" data-action="repair">直接优化</button>`;
  actions.querySelector("[data-action='prompt']").addEventListener("click", () => {
    appendModelEvidenceToPrompt(kind, result);
  });
  actions.querySelector("[data-action='stage-verification']").addEventListener("click", () => {
    stageModelEvidenceVerificationCommands(kind, result);
  });
  actions.querySelector("[data-action='verification-prompt']").addEventListener("click", () => {
    appendModelVerificationPromptToPrompt(kind, result);
  });
  actions.querySelector("[data-action='verification-fix']").addEventListener("click", () => {
    runModelVerificationFix(kind, result);
  });
  actions.querySelector("[data-action='repair']").addEventListener("click", () => {
    runModelEvidenceRepair(kind, result);
  });
  log.lastElementChild?.appendChild(actions);
  return evidence;
}

function buildAgentFailureContext(error, {
  prompt = "",
  debugContext = null,
  endpoint = "",
  streamLog = []
} = {}) {
  const message = error?.message || String(error || "unknown error");
  const events = streamLog || error?.streamLog || [];
  const referencedFiles = Array.isArray(debugContext?.referencedFiles)
    ? debugContext.referencedFiles.map((file) => String(file || "").trim()).filter(Boolean).slice(0, 16)
    : [];
  return [
    "请基于这次代理/模型请求失败证据继续修复当前项目的写代码与调试体验。",
    "",
    `失败端点：${endpoint || error?.endpoint || "/api/agent-stream"}`,
    `错误信息：${message}`,
    `原始需求字符数：${String(prompt || "").length}`,
    `附加调试上下文：${debugContext ? "是" : "否"}`,
    referencedFiles.length ? `调试诊断相关文件：\n${referencedFiles.map((file) => `@${file}`).join("\n")}` : "",
    `流式事件数：${events.length}`,
    "",
    "原始用户需求：",
    String(prompt || "").slice(0, 8000),
    "",
    "最近流式事件：",
    JSON.stringify(events.slice(-8), null, 2).slice(0, 8000),
    "",
    debugContext ? "附加调试上下文：" : "",
    debugContext ? JSON.stringify(debugContext, null, 2).slice(0, 8000) : "",
    "",
    "要求：先判断失败属于模型配置、预算/密钥、上下文引用、SSE 流式解析、后端异常还是 UI 恢复问题；需要改代码时输出最小 diff；需要验证时给出或执行安全检查命令；不要发起真实远端写入。"
  ].filter(Boolean).join("\n");
}

function appendAgentFailureEvidence(error, options = {}) {
  const context = buildAgentFailureContext(error, options);
  const message = error?.message || String(error || "unknown error");
  const referencedFiles = Array.isArray(options.debugContext?.referencedFiles)
    ? options.debugContext.referencedFiles.map((file) => String(file || "").trim()).filter(Boolean).slice(0, 16)
    : [];
  const agentEvidence = {
    error: normalizeActionFailureError(error),
    endpoint: options.endpoint || error?.endpoint || "/api/agent-stream",
    prompt: options.prompt || "",
    debugContext: options.debugContext || null,
    streamLog: options.streamLog || error?.streamLog || []
  };
  stageAgentFailureVerificationCommands(agentEvidence);
  appendToolCall({
    title: "代理请求失败证据",
    label: "ai",
    state: "失败",
    body: context.slice(0, 12000)
  });
  const actions = document.createElement("div");
  actions.className = "debug-last-failed-actions";
  actions.innerHTML = `<button type="button" data-action="prompt">加入提示词</button><button type="button" data-action="reference-files">引用文件</button><button type="button" data-action="stage-verification">排队验证</button><button type="button" data-action="verification-prompt">验证提示</button><button type="button" data-action="verification-fix">验证修复</button><button type="button" data-action="retry">重试</button><button type="button" data-action="diagnose">诊断修复</button>`;
  actions.querySelector("[data-action='prompt']").addEventListener("click", () => {
    const current = input.value.trim();
    input.value = [current, context].filter(Boolean).join("\n\n---\n\n");
    input.focus();
    scheduleReferencePreview({ immediate: true });
    appendToolCall({
      title: "代理失败证据已加入提示词",
      label: "ai",
      state: "ready",
      body: context.slice(0, 12000)
    });
    showToast("代理失败证据已加入提示词。");
  });
  actions.querySelector("[data-action='reference-files']").addEventListener("click", () => {
    if (!referencedFiles.length) {
      showToast("这次代理失败证据里没有调试相关文件。");
      appendToolCall({
        title: "代理失败证据未识别到文件",
        label: "ai",
        state: "跳过",
        body: "当前代理失败证据没有 debugContext.referencedFiles。"
      });
      return;
    }
    const current = input.value.trim();
    const existingLower = current.toLowerCase();
    const refs = referencedFiles
      .map((file) => `@${file}`)
      .filter((ref) => !existingLower.includes(ref.toLowerCase()));
    input.value = [current, refs.join(" ")].filter(Boolean).join(current ? "\n" : "");
    input.focus();
    scheduleReferencePreview({ immediate: true });
    appendToolCall({
      title: "代理失败相关文件已引用",
      label: "ai",
      state: `${referencedFiles.length} files`,
      body: referencedFiles.map((file) => `@${file}`).join("\n")
    });
    showToast(`已引用 ${referencedFiles.length} 个代理失败相关文件。`);
  });
  const buildAgentVerificationPrompt = () => [
    context,
    "",
    referencedFiles.length ? `优先读取相关文件：\n${referencedFiles.map((file) => `@${file}`).join("\n")}` : "",
    "",
    "目标：把这次代理/模型请求失败转成可验证修复闭环。",
    "",
    "建议验证命令：",
    "- node --check app.js",
    "- node --check server.js",
    "- node server.js --ui-smoke-test",
    "- node server.js --api-smoke-section=debug",
    "",
    "输出要求：",
    "1. 先判断失败属于模型配置、预算/密钥、上下文引用、SSE 流式解析、后端异常还是 UI 恢复问题。",
    "2. 如果需要改代码，请生成最小 diff，避免无关重构。",
    "3. 不要发起真实模型请求、远端写入或泄露密钥。",
    "4. 修复后必须说明应运行哪些本地验证命令，并优先复用上面的安全检查。"
  ].filter(Boolean).join("\n");
  actions.querySelector("[data-action='stage-verification']").addEventListener("click", () => {
    stageAgentFailureVerificationCommands(agentEvidence);
  });
  actions.querySelector("[data-action='verification-prompt']").addEventListener("click", () => {
    const prompt = buildAgentVerificationPrompt();
    const current = input.value.trim();
    input.value = [current, prompt].filter(Boolean).join("\n\n---\n\n");
    input.focus();
    scheduleReferencePreview({ immediate: true });
    appendToolCall({
      title: "代理失败验证提示已加入提示词",
      label: "ai",
      state: "ready",
      body: prompt.slice(0, 12000)
    });
    showToast("代理失败验证提示已加入提示词。");
  });
  actions.querySelector("[data-action='verification-fix']").addEventListener("click", () => {
    if (state.busy) {
      showToast("代理正在运行，请稍后再启动代理失败验证修复。");
      return;
    }
    const prompt = buildAgentVerificationPrompt();
    input.value = prompt;
    scheduleReferencePreview({ immediate: true });
    appendToolCall({
      title: "已启动代理失败验证修复",
      label: "ai",
      state: "running",
      body: prompt.slice(0, 12000)
    });
    showToast("正在启动带验证要求的代理失败修复。");
    submitPromptForm();
  });
  actions.querySelector("[data-action='retry']").addEventListener("click", () => {
    if (state.busy) {
      showToast("代理正在运行，请稍后再重试。");
      return;
    }
    if (!options.prompt) {
      showToast("没有可重试的原始需求。");
      return;
    }
    input.value = options.prompt;
    scheduleReferencePreview({ immediate: true });
    appendToolCall({
      title: "已准备重试代理请求",
      label: "ai",
      state: "ready",
      body: `上次错误：${message}`
    });
    submitPromptForm();
  });
  actions.querySelector("[data-action='diagnose']").addEventListener("click", () => {
    if (state.busy) {
      showToast("代理正在运行，请稍后再启动诊断修复。");
      return;
    }
    const prompt = [
      context,
      "",
      referencedFiles.length ? `优先读取相关文件：\n${referencedFiles.map((file) => `@${file}`).join("\n")}` : "",
      "",
      "请现在直接基于这次代理失败证据修复请求链路：优先补齐错误恢复、模型配置提示、上下文引用处理、SSE 失败证据或可重试动作。"
    ].join("\n");
    input.value = prompt;
    scheduleReferencePreview({ immediate: true });
    appendToolCall({
      title: "已启动代理失败诊断修复",
      label: "ai",
      state: "running",
      body: prompt.slice(0, 12000)
    });
    showToast("正在基于代理失败证据启动修复。");
    submitPromptForm();
  });
  log.lastElementChild?.appendChild(actions);
  return context;
}

function appendToolCall({ title, label, state: status, body }) {
  const article = document.createElement("article");
  article.className = `tool-call ${status === "运行中" ? "running" : ""}`;
  article.innerHTML = `
    <header>
      <span class="tool-icon"></span>
      <strong></strong>
      <em></em>
    </header>
    <pre></pre>
  `;
  article.querySelector(".tool-icon").textContent = label;
  article.querySelector("strong").textContent = title;
  article.querySelector("em").textContent = status;
  article.querySelector("pre").textContent = body || "";
  log.appendChild(article);
  log.scrollTop = log.scrollHeight;
}

function compactJson(value, max = 12000) {
  return JSON.stringify(value, null, 2).slice(0, max);
}

let lastCopyStatus = { ok: false, method: "none", reason: "not attempted" };

function copyFailureSummary() {
  if (lastCopyStatus.ok) return `复制方式：${lastCopyStatus.method}`;
  return `复制失败：${lastCopyStatus.reason || "浏览器拒绝写入剪贴板"}`;
}

function copyLogBody(copied, copiedBody = "") {
  return copied ? copiedBody : copyFailureSummary();
}

async function copyText(text) {
  if (!text) {
    lastCopyStatus = { ok: false, method: "none", reason: "没有可复制内容" };
    return false;
  }
  const clipboard = navigator.clipboard;
  try {
    if (!clipboard?.writeText) throw new Error("navigator.clipboard.writeText unavailable");
    await clipboard.writeText(text);
    lastCopyStatus = { ok: true, method: "clipboard", reason: "" };
    return true;
  } catch (clipboardError) {
    const area = document.createElement("textarea");
    area.value = text;
    area.style.position = "fixed";
    area.style.left = "-9999px";
    area.style.top = "0";
    area.setAttribute("readonly", "");
    try {
      document.body.appendChild(area);
      area.focus();
      area.select();
      area.setSelectionRange(0, area.value.length);
      const ok = document.execCommand("copy");
      lastCopyStatus = ok
        ? { ok: true, method: "textarea-fallback", reason: "" }
        : {
            ok: false,
            method: "textarea-fallback",
            reason: clipboardError?.message
              ? `剪贴板 API 失败，textarea fallback 也被拒绝：${clipboardError.message}`
              : "剪贴板 API 失败，textarea fallback 也被拒绝"
          };
      return ok;
    } catch (fallbackError) {
      lastCopyStatus = {
        ok: false,
        method: "textarea-fallback",
        reason: [
          clipboardError?.message ? `clipboard: ${clipboardError.message}` : "",
          fallbackError?.message ? `fallback: ${fallbackError.message}` : ""
        ].filter(Boolean).join("；") || "浏览器拒绝复制"
      };
      return false;
    } finally {
      area.remove();
    }
  }
}

function buildDebugBundle(result) {
  if (!result) return "";
  return JSON.stringify({
    generatedAt: result.generatedAt,
    workspace: result.workspace,
    status: result.status,
    summary: result.summary,
    findings: result.findings || [],
    nextActions: result.nextActions || [],
    verificationPlan: result.verificationPlan || null,
    ciStatus: result.ciStatus || null,
    processHealth: result.processHealth || null,
    browserTriage: result.browserTriage || null,
    browserSourceLocations: result.browserSourceLocations || [],
    browserTrace: result.browserTrace ? {
      ok: result.browserTrace.ok,
      url: result.browserTrace.url,
      finalUrl: result.browserTrace.finalUrl,
      summary: result.browserTrace.summary,
      artifactPath: result.browserTrace.artifactPath,
      console: (result.browserTrace.console || []).slice(0, 20),
      exceptions: (result.browserTrace.exceptions || []).slice(0, 20),
      network: (result.browserTrace.network || []).filter((item) => item.failed || item.status >= 400).slice(0, 20)
    } : null,
    semanticDiagnostics: result.semanticDiagnostics || null
  }, null, 2);
}

function debugEvidenceReferencedFiles(result = state.lastDebugDiagnostics) {
  if (!result) return [];
  const sourceLocationFiles = (result.browserSourceLocations || [])
    .map((item) => String(item?.path || "").replaceAll("\\", "/"))
    .filter(Boolean);
  const textParts = [
    buildDebugBundle(result),
    JSON.stringify(result.findings || []),
    JSON.stringify(result.nextActions || []),
    JSON.stringify(result.verificationPlan || {}),
    JSON.stringify(result.processHealth || {}),
    JSON.stringify(result.browserTriage || {}),
    JSON.stringify(result.browserSourceLocations || []),
    JSON.stringify(result.browserTrace || {}),
    JSON.stringify(result.semanticDiagnostics || {})
  ];
  const text = textParts.filter(Boolean).join("\n");
  if (!text.trim()) return [];
  const workspaceFiles = (state.files || []).map((file) => file.path).filter(Boolean);
  const matched = new Map();
  for (const file of sourceLocationFiles) {
    if (workspaceFiles.some((workspaceFile) => workspaceFile.toLowerCase() === file.toLowerCase())) {
      matched.set(file.toLowerCase(), file);
    }
  }
  for (const file of workspaceFiles) {
    const normalized = String(file || "").replaceAll("\\", "/");
    const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replaceAll("/", "[/\\\\]");
    const pattern = new RegExp(`(^|[^\\w.-])(${escaped})(?::\\d+)?(?=$|[^\\w.-])`, "i");
    if (pattern.test(text)) matched.set(normalized.toLowerCase(), normalized);
  }
  return [...matched.values()].slice(0, 16);
}

function referenceDebugEvidenceFilesInPrompt(result = state.lastDebugDiagnostics, { focus = true } = {}) {
  const files = debugEvidenceReferencedFiles(result);
  if (!files.length) {
    appendDebugEvidence("调试诊断未识别到文件引用", "跳过", "当前诊断包、进程健康、页面 Trace 和语义诊断里没有匹配到当前工作区文件。");
    showToast("调试诊断里没有识别到工作区文件。");
    return [];
  }
  const existing = input.value.trim();
  const existingLower = existing.toLowerCase();
  const refs = files
    .map((file) => `@${file}`)
    .filter((ref) => !existingLower.includes(ref.toLowerCase()));
  input.value = [existing, refs.join(" ")].filter(Boolean).join(existing ? "\n" : "");
  if (focus) input.focus();
  scheduleReferencePreview({ immediate: true });
  appendDebugEvidence(
    "已引用调试诊断文件",
    `${files.length} files`,
    files.map((file) => `@${file}`).join("\n")
  );
  showToast(`已引用 ${files.length} 个调试相关文件。`);
  return files;
}

function appendDebugEvidence(title, stateLabel, value) {
  appendToolCall({
    title,
    label: "debug",
    state: stateLabel,
    body: typeof value === "string" ? value : compactJson(value)
  });
}

function buildDebugPromptContext(result, { title = "请基于这份调试诊断继续排查并修复问题。" } = {}) {
  if (!result) return "";
  const referencedFiles = debugEvidenceReferencedFiles(result);
  const findings = (result.findings || [])
    .slice(0, 10)
    .map((item, index) => `${index + 1}. [${item.severity || "info"}] ${item.area || "debug"}：${item.message || ""}${item.evidence?.length ? `\n   证据：${item.evidence.slice(0, 5).join(" / ")}` : ""}`)
    .join("\n");
  const actions = (result.nextActions || [])
    .slice(0, 8)
    .map((item, index) => {
      const meta = [
        item.priority ? `P${item.priority}` : "",
        item.kind || "",
        item.target ? `target=${item.target}` : "",
        item.evidence?.length ? `evidence=${item.evidence.slice(0, 4).join(" / ")}` : ""
      ].filter(Boolean).join(" · ");
      return `${index + 1}. ${item.label || item.id || item.description || "下一步"}${meta ? `\n   ${meta}` : ""}${item.command ? `\n   $ ${item.command}` : ""}${item.description ? `\n   ${item.description}` : ""}`;
    })
    .join("\n");
  const commands = (result.verificationPlan?.commands || [])
    .slice(0, 8)
    .map((item) => `$ ${item.command}${item.reason ? `\n  ${item.reason}` : ""}`)
    .join("\n");
  const triage = result.browserTriage && typeof result.browserTriage === "object" ? result.browserTriage : null;
  const browserSourceLocations = (result.browserSourceLocations || []).slice(0, 12);
  const browserSourceText = browserSourceLocations
    .map((item) => `- ${item.path}:${item.line || 1}:${item.column || 0}${item.text ? ` ${item.text}` : ""}`)
    .join("\n");
  const triageFindings = (triage?.findings || [])
    .slice(0, 8)
    .map((item, index) => {
      const evidence = Array.isArray(item.evidence) ? item.evidence.join(" / ") : item.evidence;
      return `${index + 1}. [${item.severity || "info"}] ${item.area || "browser"}：${item.message || ""}${evidence ? `\n   证据：${String(evidence).slice(0, 300)}` : ""}`;
    })
    .join("\n");
  const triageActions = (triage?.nextActions || [])
    .slice(0, 5)
    .map((item) => `- ${item}`)
    .join("\n");
  return [
    title,
    "",
    `诊断状态：${result.status || "unknown"}`,
    `工作区：${result.workspace || ""}`,
    result.summary ? `摘要：${JSON.stringify(result.summary)}` : "",
    referencedFiles.length ? `优先读取相关文件：\n${referencedFiles.map((file) => `@${file}`).join("\n")}` : "",
    browserSourceText ? `浏览器异常源码位置：\n${browserSourceText}` : "",
    "",
    "主要发现：",
    findings || "(暂无阻塞发现)",
    "",
    "建议动作：",
    actions || "(暂无建议动作)",
    "",
    "验证命令：",
    commands || "(暂无验证命令)",
    result.processHealth?.summary ? ["", "进程健康摘要：", JSON.stringify(result.processHealth.summary, null, 2)].join("\n") : "",
    triage ? ["", "浏览器分诊摘要：", `状态：${triage.status || "unknown"}`, `统计：${JSON.stringify(triage.counts || {})}`, triageFindings ? `分诊发现：\n${triageFindings}` : "分诊发现：(无)", triageActions ? `分诊下一步：\n${triageActions}` : ""].filter(Boolean).join("\n") : "",
    result.browserTrace?.summary ? ["", "页面 Trace 摘要：", JSON.stringify(result.browserTrace.summary, null, 2)].join("\n") : "",
    result.semanticDiagnostics?.summary ? ["", "语义诊断摘要：", JSON.stringify(result.semanticDiagnostics.summary, null, 2)].join("\n") : "",
    "",
    "完整诊断包：",
    buildDebugBundle(result).slice(0, 12000)
  ].filter((line) => line !== "").join("\n");
}

function appendDebugContextToPrompt(result = state.lastDebugDiagnostics, { focus = true } = {}) {
  const context = buildDebugPromptContext(result);
  if (!context) {
    showToast("暂无可加入提示词的诊断上下文。");
    return "";
  }
  const current = input.value.trim();
  input.value = [current, context].filter(Boolean).join("\n\n---\n\n");
  if (focus) input.focus();
  scheduleReferencePreview({ immediate: true });
  appendDebugEvidence("诊断上下文已加入提示词", "ready", context.slice(0, 12000));
  showToast("诊断上下文已加入提示词。");
  return context;
}

function formatBrowserTriageContinuation(triage = null, { title = "浏览器异常分诊" } = {}) {
  if (!triage || typeof triage !== "object") return "";
  const findings = (triage.findings || [])
    .slice(0, 8)
    .map((item, index) => {
      const evidence = Array.isArray(item.evidence) ? item.evidence.join(" / ") : item.evidence;
      return `${index + 1}. [${item.severity || "info"}] ${item.area || "browser"}：${item.message || ""}${evidence ? `；证据：${String(evidence).slice(0, 240)}` : ""}`;
    })
    .join("\n");
  const actions = (triage.nextActions || [])
    .slice(0, 5)
    .map((item) => `- ${item}`)
    .join("\n");
  return [
    `${title}：${triage.status || "unknown"} · ${JSON.stringify(triage.counts || {})}`,
    findings ? `分诊发现：\n${findings}` : "",
    actions ? `分诊下一步：\n${actions}` : ""
  ].filter(Boolean).join("\n");
}

function commandResultKey(command) {
  return String(command || "").trim();
}

function normalizeCommandItems(commands = []) {
  return (commands || [])
    .map((item) => {
      if (typeof item === "string") {
        return { command: item.trim(), reason: "", policy: null };
      }
      return {
        ...item,
        command: String(item?.command || "").trim(),
        reason: item?.reason || "",
        policy: item?.policy || null
      };
    })
    .filter((item) => item.command);
}

function commandItemsToText(commands = []) {
  return normalizeCommandItems(commands)
    .map((item) => item.command)
    .join("\n");
}

function formatCommandFailureAnalysis(analysis = null) {
  if (!analysis) return "";
  const lines = [
    analysis.category ? `failureCategory: ${analysis.category}` : "",
    analysis.summary ? `summary: ${analysis.summary}` : "",
    analysis.referencedFiles?.length ? `referencedFiles: ${analysis.referencedFiles.join(", ")}` : "",
    analysis.sourceLocations?.length ? `sourceLocations:\n${formatCommandSourceLocations(analysis.sourceLocations)}` : "",
    analysis.nextActions?.length ? `nextActions:\n${analysis.nextActions.map((item) => `- ${item}`).join("\n")}` : "",
    analysis.findings?.length ? `findings:\n${analysis.findings.map((item) => `- ${item.severity || "warn"} ${item.category || "failure"}: ${item.message || ""}${item.evidence?.length ? ` (${item.evidence.slice(0, 3).join(" / ")})` : ""}`).join("\n")}` : ""
  ].filter(Boolean);
  return lines.join("\n");
}

function formatCommandSourceLocations(locations = []) {
  if (!Array.isArray(locations) || !locations.length) return "";
  return locations
    .slice(0, 16)
    .map((item) => {
      const pathValue = item.path || item.file || "";
      const line = item.line ? `:${item.line}` : "";
      const column = item.column ? `:${item.column}` : "";
      const text = item.text ? ` · ${item.text}` : "";
      return `- ${pathValue}${line}${column}${text}`;
    })
    .join("\n");
}

function commandSourceLocations(run = null) {
  const locations = [
    ...(run?.result?.failureAnalysis?.sourceLocations || []),
    ...(run?.result?.recoveryChain?.sourceLocations || []),
    ...(run?.result?.diagnostics?.commandFailure?.sourceLocations || [])
  ];
  const seen = new Set();
  return locations
    .filter((item) => item && (item.path || item.file))
    .filter((item) => {
      const key = `${String(item.path || item.file).toLowerCase()}:${item.line || 1}:${item.column || 0}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 16);
}

async function fetchCommandSourceContexts(run = null, { contextLines = 6, limit = 8 } = {}) {
  const locations = commandSourceLocations(run);
  if (!locations.length) return { contexts: [], summary: { requested: 0, returned: 0, errors: 0 } };
  return await api("/api/source-context", {
    method: "POST",
    body: JSON.stringify({ locations, contextLines, limit })
  });
}

function formatCommandSourceContexts(contexts = []) {
  return (Array.isArray(contexts) ? contexts : [])
    .slice(0, 8)
    .map((item) => [
      `@${item.path}:${item.line}${item.column ? `:${item.column}` : ""}`,
      item.error ? `ERROR: ${item.error}` : item.context || ""
    ].filter(Boolean).join("\n"))
    .join("\n\n");
}

function buildCommandSourceContextPrompt(commandText, run = null, contexts = []) {
  const command = String(commandText || "").trim();
  const sourceBlock = formatCommandSourceContexts(contexts);
  const verificationCommands = commandSourceVerificationCommands(command, run);
  return [
    "请基于失败命令的源码定位上下文继续修复当前项目。",
    "",
    command ? `失败命令：\n$ ${command}` : "",
    run?.result?.failureAnalysis ? `失败分类：\n${formatCommandFailureAnalysis(run.result.failureAnalysis)}` : "",
    sourceBlock ? `源码上下文：\n${sourceBlock}` : "源码上下文：未读取到可用片段。",
    verificationCommands.length ? `修复后验证命令：\n${verificationCommands.map((item) => `- ${item.command}${item.reason ? `：${item.reason}` : ""}`).join("\n")}` : "",
    "",
    "要求：优先从上述行号附近定位根因；需要改代码时输出最小 diff；修复后先重跑原失败命令，再运行相关 smoke 或语法检查。"
  ].filter(Boolean).join("\n");
}

function commandSourceVerificationCommands(commandText, run = null) {
  const command = String(commandText || "").trim();
  return normalizeCommandItems([
    command ? { command, reason: "修复后优先重跑原失败命令。" } : null,
    ...(run?.result?.recoveryChain?.commands || []),
    { command: "node --check server.js", reason: "复查后端入口语法。" },
    { command: "node --check app.js", reason: "复查前端入口语法。" },
    { command: "node server.js --api-smoke-section=debug", reason: "复查失败分类、源码定位和调试闭环。" }
  ].filter(Boolean)).slice(0, 8);
}

async function runCommandSourceContextFix(commandText, run = null) {
  const command = String(commandText || "").trim();
  if (state.busy) {
    showToast("代理正在运行，请稍后再发起源码定位修复。");
    return "";
  }
  try {
    const result = await fetchCommandSourceContexts(run, { contextLines: 6, limit: 8 });
    const prompt = buildCommandSourceContextPrompt(command, run, result.contexts);
    if (!prompt) {
      showToast("这条失败命令没有可运行的源码定位修复提示。");
      return "";
    }
    const verificationCommands = commandSourceVerificationCommands(command, run);
    const draft = await api("/api/source-context-repair-draft", {
      method: "POST",
      body: JSON.stringify({
        prompt,
        command,
        result: run?.result || null,
        diagnostics: run?.result?.diagnostics || null,
        locations: commandSourceLocations(run),
        contextLines: 6,
        limit: 8
      })
    });
    const chain = createRepairEvidenceChain({
      source: "source-context-fix",
      command,
      result: run?.result || null,
      diagnostics: run?.result?.diagnostics || null,
      prompt
    });
    updateRepairEvidenceChain({
      id: chain.id,
      status: "repairing",
      repair: {
        source: "source-context-fix",
        status: draft.diff ? "awaiting_approval" : "no_safe_repair",
        sourceLocations: commandSourceLocations(run),
        sourceContextCount: draft.sourceContextSummary?.returned ?? result.contexts?.length ?? 0,
        promptSummary: prompt.slice(0, 1200),
        hasDiff: Boolean(draft.diff),
        files: repairChainFiles(draft),
        commandCount: draft.commands?.length || 0,
        reviewCount: draft.review?.length || 0,
        proposalId: draft.proposal?.id || draft.goal?.pendingProposalId || ""
      },
      verification: {
        status: "planned",
        commands: draft.commands?.length ? draft.commands : verificationCommands,
        source: "source-context-fix"
      }
    }, { title: draft.diff ? "源码定位修复草稿已加入证据链" : "源码定位修复未生成安全 diff" });
    stageRepairVerificationCommands(draft.commands?.length ? draft.commands : verificationCommands, {
      title: "源码定位修复验证命令",
      successTitle: "源码定位修复验证命令已放入命令面板",
      source: "source-context-fix",
      note: "源码定位修复会优先重跑原失败命令，再执行语法检查和 debug smoke。"
    });
    if (draft.diff) {
      state.pendingDiff = draft.diff;
      renderPlan(draft.plan || []);
      renderDiff(draft.patches || []);
      renderReview(draft.review || []);
    } else {
      input.value = prompt;
      scheduleReferencePreview({ immediate: true });
    }
    appendToolCall({
      title: draft.diff ? `源码定位修复草稿已生成：${command}` : `源码定位修复提示已生成：${command}`,
      label: "ctx",
      state: draft.proposal?.id || draft.goal?.pendingProposalId || `${result.contexts?.length || 0} locations`,
      body: JSON.stringify({
        proposalId: draft.proposal?.id || draft.goal?.pendingProposalId || "",
        type: draft.proposal?.type || "source_context_repair",
        command,
        sourceContextSummary: draft.sourceContextSummary || result.summary || null,
        files: repairChainFiles(draft),
        commands: draft.commands || verificationCommands,
        policy: draft.policy || null,
        reply: draft.reply || "",
        fallbackPrompt: draft.diff ? "" : prompt
      }, null, 2).slice(0, 12000)
    });
    showToast(draft.diff ? "源码定位修复草稿已生成，可复核后批准写入。" : "源码定位修复未生成 diff，已保留提示词。");
    return draft.diff ? draft.diff : prompt;
  } catch (error) {
    appendDebugEvidence("源码定位修复启动失败", "失败", error.message);
    showToast(error.message);
    return "";
  }
}

function formatCommandRecoveryChain(chain = null) {
  if (!chain) return "";
  const commands = normalizeCommandItems(chain.commands || []);
  const stages = Array.isArray(chain.stages) ? chain.stages : [];
  const actions = Array.isArray(chain.nextActions) ? chain.nextActions : [];
  return [
    chain.category ? `recoveryCategory: ${chain.category}` : "",
    chain.summary ? `summary: ${chain.summary}` : "",
    chain.referencedFiles?.length ? `referencedFiles: ${chain.referencedFiles.join(", ")}` : "",
    chain.sourceLocations?.length ? `sourceLocations:\n${formatCommandSourceLocations(chain.sourceLocations)}` : "",
    stages.length ? `stages:\n${stages.map((item) => `- ${item.label || item.id || "stage"}: ${item.status || "pending"}${item.command ? ` · ${item.command}` : ""}`).join("\n")}` : "",
    actions.length ? `nextActions:\n${actions.map((item) => `- ${item}`).join("\n")}` : "",
    commands.length ? `commands:\n${commands.map((item) => `- ${item.command}${item.reason ? `：${item.reason}` : ""}`).join("\n")}` : ""
  ].filter(Boolean).join("\n");
}

function summarizeCommandOutput(output = "", analysis = null) {
  if (analysis?.summary) {
    const suffix = String(output || "").trim()
      ? ` · ${String(output || "").trim().split(/\r?\n/).filter(Boolean).slice(0, 1).join(" ").slice(0, 140)}`
      : "";
    return `${analysis.category || "failure"}：${analysis.summary}${suffix}`.slice(0, 260);
  }
  const text = String(output || "").trim();
  if (!text) return "(无输出)";
  const lines = text.split(/\r?\n/).filter(Boolean);
  return lines.slice(0, 2).join(" · ").slice(0, 260);
}

function buildCommandTranscript(commandText, run = null, { title = "请基于这次命令输出继续排查并修复问题。" } = {}) {
  const result = run?.result || null;
  const status = run?.status === "running"
    ? "running"
    : result?.blocked
      ? "blocked"
      : result
        ? `exit ${result.exitCode ?? "?"}`
        : "queued";
  const output = result?.output || run?.error || "";
  const diagnostics = result?.diagnostics || null;
  const failureAnalysis = result?.failureAnalysis || diagnostics?.commandFailure || null;
  const recoveryChain = result?.recoveryChain || null;
  const sourceLocations = commandSourceLocations(run);
  return [
    title,
    "",
    "命令：",
    `$ ${commandText}`,
    "",
    `状态：${status}`,
    result?.policy ? `策略：${result.policy.risk} · ${result.policy.reason || ""}` : "",
    result?.approval ? `审批：${result.approval.id}` : "",
    failureAnalysis ? `失败分类：${failureAnalysis.category || "unknown"} · ${failureAnalysis.summary || ""}` : "",
    sourceLocations.length ? `源码位置：${sourceLocations.length} 处` : "",
    recoveryChain ? `恢复链：${recoveryChain.commands?.length || 0} 条命令 · ${recoveryChain.nextActions?.[0] || recoveryChain.status || ""}` : "",
    diagnostics ? `诊断：${diagnostics.status || "attached"}` : "",
    "",
    recoveryChain ? [
      "恢复链：",
      formatCommandRecoveryChain(recoveryChain)
    ].join("\n") : "",
    recoveryChain ? "" : "",
    failureAnalysis ? [
      "失败分析：",
      formatCommandFailureAnalysis(failureAnalysis)
    ].join("\n") : "",
    sourceLocations.length ? [
      "源码位置：",
      formatCommandSourceLocations(sourceLocations)
    ].join("\n") : "",
    failureAnalysis ? "" : "",
    "输出：",
    output.slice(0, 12000) || "(暂无输出)",
    diagnostics ? [
      "",
      "诊断摘要：",
      JSON.stringify({
        summary: diagnostics.summary,
        findings: diagnostics.findings,
        nextActions: diagnostics.nextActions,
        policy: diagnostics.policy
      }, null, 2).slice(0, 6000)
    ].join("\n") : ""
  ].filter((line) => line !== "").join("\n");
}

function extractReferencedFilesFromCommandRun(commandText, run = null) {
  const text = [
    commandText,
    run?.result?.output || "",
    run?.error || ""
  ].filter(Boolean).join("\n");
  if (!text.trim()) return [];
  const workspaceFiles = (state.files || []).map((file) => file.path).filter(Boolean);
  const lowerFiles = new Map(workspaceFiles.map((file) => [file.toLowerCase(), file]));
  const matched = new Map();
  const sourceLocations = commandSourceLocations(run);
  for (const location of sourceLocations) {
    const locationPath = location?.path || location?.file || "";
    const exact = lowerFiles.get(String(locationPath).toLowerCase());
    if (exact) matched.set(exact.toLowerCase(), exact);
  }
  for (const file of workspaceFiles) {
    const escaped = file.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const slashVariant = escaped.replaceAll("/", "[/\\\\]");
    const pattern = new RegExp(`(^|[^\\w.-])(${slashVariant})(?::\\d+)?(?=$|[^\\w.-])`, "i");
    if (pattern.test(text)) matched.set(file.toLowerCase(), file);
  }
  const loosePattern = /(?:^|[\s("'`])((?:\.?[A-Za-z0-9_.-]+[\\/])+[A-Za-z0-9_.-]+\.[A-Za-z0-9_]+)(?::\d+)?/g;
  let match;
  while ((match = loosePattern.exec(text))) {
    const normalized = match[1].replace(/^\.?[\\/]/, "").replaceAll("\\", "/");
    const exact = lowerFiles.get(normalized.toLowerCase());
    if (exact) matched.set(exact.toLowerCase(), exact);
  }
  return [...matched.values()].slice(0, 8);
}

function referenceCommandFilesInPrompt(commandText, run = null) {
  const files = extractReferencedFilesFromCommandRun(commandText, run);
  if (!files.length) {
    showToast("这次命令输出里没有识别到工作区文件路径。");
    appendToolCall({
      title: `命令输出未识别到文件引用：${commandText}`,
      label: "$",
      state: "跳过",
      body: summarizeCommandOutput(run?.result?.output || run?.error || "")
    });
    return [];
  }
  const existing = input.value.trim();
  const additions = files.map((file) => `@${file}`);
  const existingLower = existing.toLowerCase();
  const nextRefs = additions.filter((ref) => !existingLower.includes(ref.toLowerCase()));
  input.value = [existing, nextRefs.join(" ")].filter(Boolean).join(existing ? "\n" : "");
  input.focus();
  scheduleReferencePreview({ immediate: true });
  appendToolCall({
    title: `已引用命令输出文件：${commandText}`,
    label: "ctx",
    state: `${files.length} files`,
    body: files.map((file) => `@${file}`).join("\n")
  });
  showToast(`已引用 ${files.length} 个命令相关文件。`);
  return files;
}

function appendCommandReferencedFilesEvidence(commandText, run = null) {
  const command = String(commandText || "").trim();
  if (!command || !run?.result || run.result.blocked || run.result.exitCode === 0) return [];
  const files = extractReferencedFilesFromCommandRun(command, run);
  if (!files.length) return [];
  appendToolCall({
    title: `失败命令相关文件已识别：${command}`,
    label: "ctx",
    state: `${files.length} files`,
    body: [
      "这次失败命令输出命中了工作区文件路径，可直接引用到下一轮修复提示。",
      run?.result?.failureAnalysis?.sourceLocations?.length ? "\n源码位置：" : "",
      run?.result?.failureAnalysis?.sourceLocations?.length ? formatCommandSourceLocations(run.result.failureAnalysis.sourceLocations) : "",
      "",
      ...files.map((file) => `@${file}`)
    ].join("\n")
  });
  return files;
}

function appendCommandTranscriptToPrompt(commandText, run = null, { focus = true } = {}) {
  const command = String(commandText || "").trim();
  if (!command) {
    showToast("这条命令没有可加入提示词的内容。");
    return "";
  }
  const transcript = buildCommandTranscript(command, run);
  const current = input.value.trim();
  input.value = [current, transcript].filter(Boolean).join("\n\n---\n\n");
  if (focus) input.focus();
  scheduleReferencePreview({ immediate: true });
  appendToolCall({
    title: `命令记录已加入提示词：${command}`,
    label: "$",
    state: "ready",
    body: transcript.slice(0, 12000)
  });
  showToast("命令记录已加入提示词。");
  return transcript;
}

function buildCommandVerificationPrompt(commandText, run = null, { diagnostics = null } = {}) {
  const command = String(commandText || "").trim();
  if (!command) return "";
  const attachedDiagnostics = diagnostics
    || run?.result?.diagnostics
    || (state.lastFailedCommand?.command === command ? state.lastDebugDiagnostics : null);
  const commandFiles = extractReferencedFilesFromCommandRun(command, run);
  const failureAnalysis = run?.result?.failureAnalysis || attachedDiagnostics?.commandFailure || null;
  const recoveryChain = run?.result?.recoveryChain || null;
  const diagnosticFiles = attachedDiagnostics ? debugEvidenceReferencedFiles(attachedDiagnostics) : [];
  const analysisFiles = Array.isArray(failureAnalysis?.referencedFiles) ? failureAnalysis.referencedFiles : [];
  const recoveryFiles = Array.isArray(recoveryChain?.referencedFiles) ? recoveryChain.referencedFiles : [];
  const sourceLocations = commandSourceLocations(run);
  const files = [...new Map(
    [...commandFiles, ...diagnosticFiles, ...analysisFiles, ...recoveryFiles]
      .filter(Boolean)
      .map((file) => [String(file).toLowerCase(), file])
  ).values()].slice(0, 16);
  const diagnosticCommands = normalizeCommandItems([
    ...(attachedDiagnostics?.verificationPlan?.commands || []),
    ...(recoveryChain?.commands || [])
  ]);
  const nextActions = (attachedDiagnostics?.nextActions || [])
    .slice(0, 6)
    .map((item, index) => `${index + 1}. ${item.label || item.id || "建议动作"}${item.description ? `：${item.description}` : ""}${item.command ? `；命令：${item.command}` : ""}`)
    .join("\n");
  const transcript = buildCommandTranscript(command, run, {
    title: "这是一条失败命令的完整证据，请据此生成可验证修复方案。"
  });
  return [
    state.lastPrompt ? `继续推进上一轮任务：${state.lastPrompt}` : "请基于最近失败命令修复当前项目。",
    "",
    "目标：把这次失败命令转成可验证的修复闭环。",
    files.length ? `优先读取这些相关文件：\n${files.map((file) => `@${file}`).join("\n")}` : "",
    failureAnalysis ? `失败分类：\n${formatCommandFailureAnalysis(failureAnalysis)}` : "",
    sourceLocations.length ? `优先定位源码位置：\n${formatCommandSourceLocations(sourceLocations)}` : "",
    recoveryChain ? `失败恢复链：\n${formatCommandRecoveryChain(recoveryChain)}` : "",
    attachedDiagnostics?.summary ? `诊断摘要：${JSON.stringify(attachedDiagnostics.summary)}` : "",
    nextActions ? `诊断建议动作：\n${nextActions}` : "",
    diagnosticCommands.length ? `可复用验证命令：\n${diagnosticCommands.map((item) => `- ${item.command}${item.reason ? `：${item.reason}` : ""}`).join("\n")}` : "",
    "",
    "失败命令证据：",
    transcript.slice(0, 16000),
    "",
    "输出要求：",
    "1. 先判断失败根因，并说明要读取或修改的文件。",
    "2. 如果需要改代码，请生成最小 diff，避免无关重构。",
    "3. 必须给出 2-5 条可在当前工作区安全运行的验证命令。",
    "4. 验证命令应优先复用现有脚本、node --check、smoke test 或只读检查。",
    "5. 如果无法安全修复，请明确阻塞原因，并给出下一步只读排查命令。"
  ].filter(Boolean).join("\n");
}

function appendCommandVerificationPromptToPrompt(commandText, run = null, { focus = true } = {}) {
  const command = String(commandText || "").trim();
  const prompt = buildCommandVerificationPrompt(command, run);
  if (!prompt) {
    showToast("这条失败命令没有可生成的验证提示。");
    return "";
  }
  const current = input.value.trim();
  input.value = [current, prompt].filter(Boolean).join("\n\n---\n\n");
  if (focus) input.focus();
  scheduleReferencePreview({ immediate: true });
  appendToolCall({
    title: `失败命令验证提示已加入提示词：${command}`,
    label: "$",
    state: "ready",
    body: prompt.slice(0, 12000)
  });
  showToast("失败命令验证提示已加入提示词。");
  return prompt;
}

function runCommandVerificationFix(commandText, run = null) {
  const command = String(commandText || "").trim();
  if (state.busy) {
    showToast("代理正在运行，请稍后再发起验证修复。");
    return "";
  }
  const prompt = buildCommandVerificationPrompt(command, run);
  if (!prompt) {
    showToast("这条失败命令没有可运行的验证修复提示。");
    return "";
  }
  input.value = prompt;
  scheduleReferencePreview({ immediate: true });
  appendToolCall({
    title: `已启动失败命令验证修复：${command}`,
    label: "$",
    state: "running",
    body: prompt.slice(0, 12000)
  });
  showToast("正在启动带验证要求的修复代理。");
  submitPromptForm();
  return prompt;
}

function runLastFailedCommandVerificationFix() {
  const failure = state.lastFailedCommand;
  if (!failure?.command) {
    appendDebugEvidence("暂无失败命令可修复", "跳过", {
      summary: state.lastDebugDiagnostics?.summary || null
    });
    showToast("当前没有最近失败命令可修复。");
    return "";
  }
  return runCommandVerificationFix(failure.command, failure);
}

function summarizeCommandBatch(commands = []) {
  const items = normalizeCommandItems(commands);
  const summary = { total: items.length, passed: 0, failed: 0, blocked: 0, running: 0, queued: 0 };
  for (const item of items) {
    const run = state.commandResults[commandResultKey(item.command)];
    if (!run) {
      summary.queued += 1;
    } else if (run.status === "running") {
      summary.running += 1;
    } else if (run.result?.blocked) {
      summary.blocked += 1;
    } else if (run.result?.exitCode === 0) {
      summary.passed += 1;
    } else if (run.result) {
      summary.failed += 1;
    } else {
      summary.queued += 1;
    }
  }
  return summary;
}

function formatCommandBatchSummary(commands = []) {
  const summary = summarizeCommandBatch(commands);
  if (!summary.total) return "0 条命令";
  return `${summary.total} 条 · ${summary.passed} 通过 · ${summary.failed} 失败 · ${summary.blocked} 拒绝 · ${summary.running} 运行中 · ${summary.queued} 未运行`;
}

function commandBatchEvidence(commands = []) {
  return normalizeCommandItems(commands)
    .map((item, index) => {
      const run = state.commandResults[commandResultKey(item.command)];
      const result = run?.result;
      const status = run?.status === "running"
        ? "running"
        : result?.blocked
          ? "blocked"
          : result
            ? `exit ${result.exitCode ?? "?"}`
            : "queued";
      return [
        `${index + 1}. $ ${item.command}`,
        item.reason ? `   reason: ${item.reason}` : "",
        item.policy ? `   policy: ${item.policy.risk} · ${item.policy.reason || ""}` : "",
        `   status: ${status}`,
        result?.output ? `   output: ${summarizeCommandOutput(result.output)}` : ""
      ].filter(Boolean).join("\n");
    })
    .join("\n\n");
}

function recordRepairVerificationFromBatch(commands = [], { title = "建议命令", stoppedAt = "", ok = false } = {}) {
  if (!state.activeRepairChain) return null;
  const items = normalizeCommandItems(commands);
  if (!items.length) return null;
  const checks = items.map((item) => {
    const run = state.commandResults[commandResultKey(item.command)] || {};
    return {
      command: item.command,
      reason: item.reason || "",
      status: run.status || "queued",
      exitCode: run.result?.exitCode ?? null,
      blocked: Boolean(run.result?.blocked),
      outputSummary: summarizeCommandOutput(run.result?.output || run.error || "")
    };
  });
  const failedCommands = checks
    .filter((check) => check.blocked || (check.exitCode !== null && check.exitCode !== 0) || check.status !== "done")
    .map((check) => check.command)
    .slice(0, 8);
  return updateRepairEvidenceChain({
    status: ok ? "verified" : "verification_failed",
    verification: {
      status: ok ? "passed" : "failed",
      ok,
      skipped: false,
      title,
      stoppedAt,
      checkCount: checks.length,
      failedCommands,
      checks,
      completedAt: new Date().toISOString()
    }
  }, { title: ok ? "修复证据链验证通过" : "修复证据链验证失败" });
}

function commandBatchReferencedFiles(commands = []) {
  const matched = new Map();
  normalizeCommandItems(commands).forEach((item) => {
    const run = state.commandResults[commandResultKey(item.command)];
    extractReferencedFilesFromCommandRun(item.command, run).forEach((file) => {
      matched.set(file.toLowerCase(), file);
    });
  });
  return [...matched.values()].slice(0, 16);
}

function referenceCommandBatchFilesInPrompt(commands = [], { title = "命令组", focus = true } = {}) {
  const files = commandBatchReferencedFiles(commands);
  if (!files.length) {
    appendToolCall({
      title: `批量命令未识别到文件引用：${title}`,
      label: "ctx",
      state: "跳过",
      body: commandBatchEvidence(commands).slice(0, 4000) || "命令输出里没有匹配当前工作区文件。"
    });
    showToast("这组命令输出里没有识别到工作区文件路径。");
    return [];
  }
  const existing = input.value.trim();
  const existingLower = existing.toLowerCase();
  const refs = files
    .map((file) => `@${file}`)
    .filter((ref) => !existingLower.includes(ref.toLowerCase()));
  input.value = [existing, refs.join(" ")].filter(Boolean).join(existing ? "\n" : "");
  if (focus) input.focus();
  scheduleReferencePreview({ immediate: true });
  appendToolCall({
    title: `已引用批量命令文件：${title}`,
    label: "ctx",
    state: `${files.length} files`,
    body: files.map((file) => `@${file}`).join("\n")
  });
  showToast(`已引用 ${files.length} 个命令组相关文件。`);
  return files;
}

function buildCommandBatchPromptContext(commands = [], { title = "命令组" } = {}) {
  const items = normalizeCommandItems(commands);
  if (!items.length) return "";
  const summary = summarizeCommandBatch(items);
  const failed = failedCommandItems(items);
  const blocked = items.filter((item) => state.commandResults[commandResultKey(item.command)]?.result?.blocked);
  const queued = items.filter((item) => !state.commandResults[commandResultKey(item.command)]?.result);
  const referencedFiles = commandBatchReferencedFiles(items);
  const failedDetails = failed
    .map((item, index) => {
      const run = state.commandResults[commandResultKey(item.command)];
      const failureAnalysis = run?.result?.failureAnalysis || run?.result?.diagnostics?.commandFailure || null;
      const recoveryChain = run?.result?.recoveryChain || null;
      const locations = commandSourceLocations(run);
      return [
        `${index + 1}. $ ${item.command}`,
        failureAnalysis ? `失败分类：${failureAnalysis.category || "unknown"} · ${failureAnalysis.summary || ""}` : "",
        locations.length ? `源码位置：\n${formatCommandSourceLocations(locations)}` : "",
        recoveryChain ? `恢复链：\n${formatCommandRecoveryChain(recoveryChain)}` : ""
      ].filter(Boolean).join("\n");
    })
    .join("\n\n");
  const debugTriage = state.lastDebugDiagnostics?.browserTriage && typeof state.lastDebugDiagnostics.browserTriage === "object"
    ? state.lastDebugDiagnostics.browserTriage
    : null;
  const debugTriageSummary = debugTriage
    ? [
        `状态：${debugTriage.status || "unknown"} · 统计：${JSON.stringify(debugTriage.counts || {})}`,
        (debugTriage.findings || []).slice(0, 6).map((item, index) => {
          const evidence = Array.isArray(item.evidence) ? item.evidence.join(" / ") : item.evidence;
          return `${index + 1}. [${item.severity || "info"}] ${item.area || "browser"}：${item.message || ""}${evidence ? `；证据：${String(evidence).slice(0, 220)}` : ""}`;
        }).join("\n"),
        (debugTriage.nextActions || []).length ? `下一步：\n${debugTriage.nextActions.slice(0, 4).map((item) => `- ${item}`).join("\n")}` : ""
      ].filter(Boolean).join("\n")
    : "";
  return [
    "请基于这组命令运行证据继续推进当前代码修改或调试。",
    "",
    `命令组：${title}`,
    `汇总：${formatCommandBatchSummary(items)}`,
    referencedFiles.length ? `优先读取相关文件：\n${referencedFiles.map((file) => `@${file}`).join("\n")}` : "",
    failed.length ? `失败命令：\n${failed.map((item) => `- $ ${item.command}`).join("\n")}` : "",
    failedDetails ? `失败命令调试摘要：\n${failedDetails}` : "",
    blocked.length ? `策略拦截命令：\n${blocked.map((item) => `- $ ${item.command}`).join("\n")}` : "",
    queued.length ? `尚未运行命令：\n${queued.map((item) => `- $ ${item.command}`).join("\n")}` : "",
    debugTriageSummary ? `最近浏览器异常分诊：\n${debugTriageSummary}` : "",
    "",
    "命令证据：",
    commandBatchEvidence(items).slice(0, 16000),
    "",
    "要求：",
    "1. 先读取上面列出的 @file；优先定位失败命令的根因，避免重复修改已经通过的部分。",
    "2. 如果有源码位置，优先围绕这些行号附近排查；如果有浏览器分诊，按 error/warn 优先级处理。",
    "3. 如果需要改代码，请生成最小 diff，并说明受影响文件。",
    "4. 给出下一轮应运行的安全验证命令；优先只重跑失败项和相关 smoke。",
    "5. 被策略拦截的命令不要绕过策略；请给出安全替代命令或人工授权清单。",
    "6. 如果仍缺证据，请给出只读排查步骤。"
  ].filter(Boolean).join("\n");
}

function appendCommandBatchEvidenceToPrompt(commands = [], { title = "命令组", focus = true } = {}) {
  const context = buildCommandBatchPromptContext(commands, { title });
  if (!context) {
    showToast("当前没有可加入提示词的批量命令证据。");
    return "";
  }
  const current = input.value.trim();
  input.value = [current, context].filter(Boolean).join("\n\n---\n\n");
  if (focus) input.focus();
  scheduleReferencePreview({ immediate: true });
  appendToolCall({
    title: `批量命令证据已加入提示词：${title}`,
    label: "$",
    state: "ready",
    body: context.slice(0, 12000)
  });
  showToast("批量命令证据已加入提示词。");
  return context;
}

function buildCommandBatchVerificationPrompt(commands = [], { title = "命令组" } = {}) {
  const context = buildCommandBatchPromptContext(commands, { title });
  if (!context) return "";
  const summary = summarizeCommandBatch(commands);
  const failed = failedCommandItems(commands);
  const queued = normalizeCommandItems(commands)
    .filter((item) => !state.commandResults[commandResultKey(item.command)]?.result);
  return [
    "请基于这组命令状态生成下一轮可验证修复任务。",
    "",
    `命令组：${title}`,
    `当前状态：${formatCommandBatchSummary(commands)}`,
    failed.length ? `优先重跑失败命令：\n${failed.map((item) => `- $ ${item.command}`).join("\n")}` : "",
    queued.length ? `尚未运行命令：\n${queued.map((item) => `- $ ${item.command}`).join("\n")}` : "",
    summary.failed || summary.blocked || summary.queued
      ? "目标：先解释失败/拦截/未运行项，再给出最小修复 diff 和下一轮安全验证命令。"
      : "目标：复核这组命令是否足以证明当前改动，若证据不足请补充最小安全验证命令。",
    "",
    context
  ].filter(Boolean).join("\n");
}

function appendCommandBatchVerificationPromptToPrompt(commands = [], { title = "命令组", focus = true } = {}) {
  const prompt = buildCommandBatchVerificationPrompt(commands, { title });
  if (!prompt) {
    showToast("当前没有可生成验证提示的批量命令证据。");
    return "";
  }
  const current = input.value.trim();
  input.value = [current, prompt].filter(Boolean).join("\n\n---\n\n");
  if (focus) input.focus();
  scheduleReferencePreview({ immediate: true });
  appendToolCall({
    title: `批量命令验证提示已加入提示词：${title}`,
    label: "$",
    state: "ready",
    body: prompt.slice(0, 12000)
  });
  showToast("批量命令验证提示已加入提示词。");
  return prompt;
}

function commandBatchNeedsRepair(commands = []) {
  const summary = summarizeCommandBatch(commands);
  return summary.failed > 0 || summary.blocked > 0 || summary.queued > 0;
}

function runCommandBatchEvidenceRepair(commands = [], { title = "命令组" } = {}) {
  if (state.busy) {
    showToast("代理正在运行，请稍后再启动批量证据修复。");
    return "";
  }
  const context = buildCommandBatchPromptContext(commands, { title });
  if (!context) {
    showToast("当前没有可用于修复的批量命令证据。");
    return "";
  }
  if (!commandBatchNeedsRepair(commands)) {
    appendToolCall({
      title: `批量命令无需修复：${title}`,
      label: "$",
      state: "跳过",
      body: formatCommandBatchSummary(commands)
    });
    showToast("这组命令没有失败、拦截或未运行项。");
    return "";
  }
  const prompt = [
    context,
    "",
    "请现在直接基于这组命令证据继续修复：优先处理失败项；如果需要改代码，请输出最小 diff；如果只需要验证，请输出下一轮安全验证命令。"
  ].join("\n");
  input.value = prompt;
  scheduleReferencePreview({ immediate: true });
  appendToolCall({
    title: `已启动批量命令证据修复：${title}`,
    label: "$",
    state: "running",
    body: prompt.slice(0, 12000)
  });
  showToast("正在启动批量命令证据修复代理。");
  submitPromptForm();
  return prompt;
}

function pruneCommandHistory(history = []) {
  const seen = new Set();
  const rows = (Array.isArray(history) ? history : [])
    .map((item) => ({
      command: String(item?.command || "").trim(),
      reason: String(item?.reason || "").slice(0, 240),
      source: String(item?.source || "").slice(0, 80),
      pinned: Boolean(item?.pinned),
      lastExitCode: item?.lastExitCode,
      lastStatus: String(item?.lastStatus || "").slice(0, 80),
      runCount: Number(item?.runCount || 0),
      updatedAt: item?.updatedAt || item?.createdAt || new Date().toISOString(),
      createdAt: item?.createdAt || item?.updatedAt || new Date().toISOString()
    }))
    .filter((item) => item.command)
    .sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return String(b.updatedAt || "").localeCompare(String(a.updatedAt || ""));
    })
    .filter((item) => {
      const key = commandResultKey(item.command).toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  const pinned = rows.filter((item) => item.pinned).slice(0, 8);
  const recent = rows.filter((item) => !item.pinned).slice(0, Math.max(0, 12 - pinned.length));
  return [...pinned, ...recent];
}

function rememberCommand(command, { reason = "", source = "manual", result = null } = {}) {
  const commandText = String(command || "").trim();
  if (!commandText) return null;
  const key = commandResultKey(commandText).toLowerCase();
  const existing = (state.commandHistory || []).find((item) => commandResultKey(item.command).toLowerCase() === key);
  const now = new Date().toISOString();
  const next = {
    command: commandText,
    reason: reason || existing?.reason || "",
    source: source || existing?.source || "manual",
    pinned: Boolean(existing?.pinned),
    lastExitCode: result?.exitCode ?? existing?.lastExitCode,
    lastStatus: result ? (result.blocked ? "blocked" : result.exitCode === 0 ? "passed" : "failed") : existing?.lastStatus || "staged",
    runCount: (existing?.runCount || 0) + (result ? 1 : 0),
    createdAt: existing?.createdAt || now,
    updatedAt: now
  };
  state.commandHistory = pruneCommandHistory([
    next,
    ...(state.commandHistory || []).filter((item) => commandResultKey(item.command).toLowerCase() !== key)
  ]);
  renderCommandHistory();
  saveCommandDebugState();
  return next;
}

function updateCommandHistoryItem(command, patch = {}) {
  const key = commandResultKey(command).toLowerCase();
  const now = new Date().toISOString();
  state.commandHistory = pruneCommandHistory((state.commandHistory || []).map((item) => (
    commandResultKey(item.command).toLowerCase() === key
      ? { ...item, ...patch, updatedAt: patch.pinned === undefined ? item.updatedAt : now }
      : item
  )));
  renderCommandHistory();
  saveCommandDebugState();
}

function clearUnpinnedCommandHistory() {
  const before = state.commandHistory?.length || 0;
  state.commandHistory = pruneCommandHistory((state.commandHistory || []).filter((item) => item.pinned));
  renderCommandHistory();
  saveCommandDebugState();
  appendToolCall({
    title: "最近命令已清理",
    label: "$",
    state: "完成",
    body: `清理前 ${before} 条，保留固定命令 ${state.commandHistory.length} 条。`
  });
  showToast("已清空未固定的最近命令。");
}

function renderCommandHistory() {
  if (!commandHistoryList) return;
  const history = pruneCommandHistory(state.commandHistory);
  commandHistoryList.innerHTML = "";
  if (!history.length) {
    commandHistoryList.hidden = true;
    return;
  }
  commandHistoryList.hidden = false;
  const header = document.createElement("div");
  header.className = "command-history-toolbar";
  header.innerHTML = `<strong>最近命令</strong><button type="button" data-action="clear-unpinned">清空未固定</button>`;
  header.querySelector("[data-action='clear-unpinned']").addEventListener("click", clearUnpinnedCommandHistory);
  commandHistoryList.appendChild(header);
  history.slice(0, 6).forEach((item) => {
    const row = document.createElement("div");
    row.className = `command-history-row ${item.lastStatus || "staged"} ${item.pinned ? "pinned" : ""}`;
    row.innerHTML = `
      <button type="button" data-action="fill"><code></code><small></small></button>
      <button type="button" data-action="pin"></button>
      <button type="button" data-action="stage">加入</button>
      <button type="button" data-action="run">重跑</button>
    `;
    row.querySelector("code").textContent = item.command;
    row.querySelector("small").textContent = [
      item.lastStatus || "staged",
      item.pinned ? "固定" : "",
      item.lastExitCode === undefined ? "" : `exit ${item.lastExitCode}`,
      item.runCount ? `${item.runCount} 次` : "",
      item.reason || item.source || ""
    ].filter(Boolean).join(" · ");
    row.querySelector("[data-action='fill']").addEventListener("click", () => {
      if (manualCommandInput) {
        manualCommandInput.value = item.command;
        manualCommandInput.focus();
      }
      appendToolCall({
        title: `最近命令已填入：${item.command}`,
        label: "$",
        state: "ready",
        body: item.command
      });
    });
    const pinButton = row.querySelector("[data-action='pin']");
    pinButton.textContent = item.pinned ? "取消固定" : "固定";
    pinButton.addEventListener("click", () => {
      updateCommandHistoryItem(item.command, { pinned: !item.pinned });
      appendToolCall({
        title: item.pinned ? `最近命令已取消固定：${item.command}` : `最近命令已固定：${item.command}`,
        label: "$",
        state: "ready",
        body: item.command
      });
      showToast(item.pinned ? "已取消固定命令。" : "命令已固定。");
    });
    row.querySelector("[data-action='stage']").addEventListener("click", () => {
      stageManualCommand(item.command, { reason: item.reason || "最近命令", focus: false });
    });
    row.querySelector("[data-action='run']").addEventListener("click", async () => {
      stageManualCommand(item.command, { reason: item.reason || "最近命令", focus: false });
      if (state.busy) {
        showToast("代理正在运行，已先加入面板。");
        return;
      }
      setBusy(true, "重跑最近命令");
      const ok = await runSuggestedCommand(item.command, { single: true });
      setBusy(false, ok ? "命令通过" : "命令失败");
    });
    commandHistoryList.appendChild(row);
  });
}

function commandHistoryNavigationItems() {
  return pruneCommandHistory(state.commandHistory)
    .map((item) => item.command)
    .filter(Boolean);
}

function resetManualCommandHistoryNavigation() {
  state.manualCommandHistoryCursor = -1;
  state.manualCommandHistoryDraft = "";
}

function applyManualCommandHistoryNavigation(direction) {
  if (!manualCommandInput) return false;
  const history = commandHistoryNavigationItems();
  if (!history.length) return false;
  if (state.manualCommandHistoryCursor === -1) {
    state.manualCommandHistoryDraft = manualCommandInput.value || "";
  }
  const nextCursor = Math.max(-1, Math.min(history.length - 1, state.manualCommandHistoryCursor + direction));
  if (nextCursor === state.manualCommandHistoryCursor) return true;
  state.manualCommandHistoryCursor = nextCursor;
  manualCommandInput.value = nextCursor === -1 ? state.manualCommandHistoryDraft : history[nextCursor];
  manualCommandInput.focus();
  requestAnimationFrame(() => {
    const end = manualCommandInput.value.length;
    manualCommandInput.setSelectionRange(end, end);
  });
  return true;
}

function handleManualCommandInputKeydown(event) {
  if (event.defaultPrevented || event.isComposing || event.keyCode === 229) return;
  if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
  const direction = event.key === "ArrowUp" ? 1 : -1;
  if (applyManualCommandHistoryNavigation(direction)) {
    event.preventDefault();
  }
}

function stageDebugActionCommand(action = {}) {
  const command = String(action.command || "").trim();
  if (!command) {
    showToast("这条调试建议没有可运行命令。");
    return false;
  }
  const nextCommand = {
    command,
    reason: action.description || action.label || action.id || "调试建议",
    source: action.id || "debug-action",
    priority: Number(action.priority || 0) || undefined,
    evidence: Array.isArray(action.evidence) ? action.evidence.slice(0, 6) : [],
    target: action.target || "",
    kind: action.kind || ""
  };
  const existing = normalizeCommandItems(state.pendingCommands);
  const merged = [
    nextCommand,
    ...existing.filter((item) => commandResultKey(item.command) !== commandResultKey(command))
  ];
  renderCommands(merged);
  rememberCommand(command, { reason: nextCommand.reason, source: nextCommand.source });
  appendToolCall({
    title: `已加入下一步验证命令：${action.label || action.id || command}`,
    label: "debug",
    state: "ready",
    body: [
      action.priority ? `priority: ${action.priority}` : "",
      action.kind ? `kind: ${action.kind}` : "",
      action.target ? `target: ${action.target}` : "",
      action.description || "",
      action.evidence?.length ? `evidence:\n${action.evidence.map((item) => `- ${item}`).join("\n")}` : "",
      `$ ${command}`
    ].filter(Boolean).join("\n")
  });
  showToast("下一步验证命令已放入命令面板。");
  return true;
}

function stageDebugActionCommands(actions = []) {
  const runnableActions = (Array.isArray(actions) ? actions : [])
    .filter((action) => String(action?.command || "").trim())
    .sort((left, right) => (Number(right.priority) || 0) - (Number(left.priority) || 0));
  const staged = [];
  const seen = new Set();
  runnableActions.forEach((action) => {
    const command = String(action.command || "").trim();
    const key = commandResultKey(command);
    if (!command || seen.has(key)) return;
    seen.add(key);
    staged.push({
      command,
      reason: action.description || action.label || action.id || "调试建议",
      source: action.id || "debug-action",
      priority: Number(action.priority || 0) || undefined,
      evidence: Array.isArray(action.evidence) ? action.evidence.slice(0, 6) : [],
      target: action.target || "",
      kind: action.kind || ""
    });
  });
  if (!staged.length) {
    appendDebugEvidence("暂无可排队的调试建议", "跳过", { nextActions: actions });
    showToast("当前诊断没有可放入命令面板的建议命令。");
    return [];
  }
  const stagedKeys = new Set(staged.map((item) => commandResultKey(item.command)));
  const existing = normalizeCommandItems(state.pendingCommands)
    .filter((item) => !stagedKeys.has(commandResultKey(item.command)));
  renderCommands([...staged, ...existing]);
  staged.forEach((item) => {
    rememberCommand(item.command, { reason: item.reason, source: item.source });
  });
  appendToolCall({
    title: "调试建议命令已批量放入面板",
    label: "debug",
    state: `${staged.length} 条`,
    body: staged.map((item) => [
      item.priority ? `priority: ${item.priority}` : "",
      item.kind ? `kind: ${item.kind}` : "",
      item.target ? `target: ${item.target}` : "",
      item.reason || "",
      `$ ${item.command}`
    ].filter(Boolean).join("\n")).join("\n\n").slice(0, 12000)
  });
  showToast(`${staged.length} 条调试建议命令已放入命令面板。`);
  return staged;
}

async function runRecommendedDebugAction(result = state.lastDebugDiagnostics) {
  const actions = Array.isArray(result?.nextActions) ? result.nextActions : [];
  const action = actions
    .filter((item) => String(item.command || "").trim())
    .sort((left, right) => (Number(right.priority) || 0) - (Number(left.priority) || 0))[0];
  const command = String(action?.command || "").trim();
  if (!command) {
    appendDebugEvidence("暂无可运行的推荐动作", "跳过", {
      summary: result?.summary || null,
      nextActions: actions
    });
    showToast("当前诊断没有可直接运行的推荐动作。");
    return false;
  }
  if (state.busy) {
    showToast("代理正在运行，请稍后再运行推荐动作。");
    return false;
  }
  stageDebugActionCommand(action);
  appendToolCall({
    title: `开始运行推荐动作：${action.label || action.id || command}`,
    label: "debug",
    state: "running",
    body: [
      action.priority ? `priority: ${action.priority}` : "",
      action.kind ? `kind: ${action.kind}` : "",
      action.target ? `target: ${action.target}` : "",
      action.description || "",
      action.evidence?.length ? `evidence:\n${action.evidence.map((item) => `- ${item}`).join("\n")}` : "",
      `$ ${command}`
    ].filter(Boolean).join("\n")
  });
  const startedAt = new Date().toISOString();
  const chain = createRepairEvidenceChain({
    source: "debug-recommended-action",
    command,
    diagnostics: result,
    prompt: state.lastPrompt || input.value.trim()
  });
  updateRepairEvidenceChain({
    id: chain.id,
    status: "checking",
    recommendedAction: {
      id: action.id || "",
      label: action.label || "",
      description: action.description || "",
      priority: Number(action.priority || 0) || null,
      kind: action.kind || "",
      target: action.target || "",
      evidence: Array.isArray(action.evidence) ? action.evidence.slice(0, 6) : [],
      command
    },
    commandRun: {
      command,
      status: "running",
      startedAt
    }
  }, { title: "推荐动作已加入恢复证据链" });
  setBusy(true, "运行推荐动作");
  let ok = false;
  try {
    ok = await runSuggestedCommand(command, { single: true });
  } finally {
    const run = state.commandResults[commandResultKey(command)] || {};
    updateRepairEvidenceChain({
      id: chain.id,
      status: ok ? "verified" : "needs_repair",
      commandRun: {
        command,
        status: ok ? "passed" : "failed",
        startedAt,
        completedAt: new Date().toISOString(),
        exitCode: run.result?.exitCode ?? null,
        blocked: Boolean(run.result?.blocked),
        outputSummary: summarizeCommandOutput(run.result?.output || run.error || "")
      }
    }, { title: ok ? "推荐动作通过并已沉淀恢复证据" : "推荐动作失败已沉淀恢复证据" });
    setBusy(false, ok ? "推荐动作通过" : "推荐动作失败");
  }
  return ok;
}

function stageManualCommand(command, { reason = "手动验证命令", focus = true } = {}) {
  const commandText = String(command || "").trim();
  if (!commandText) {
    showToast("请输入要运行的安全验证命令。");
    manualCommandInput?.focus();
    return null;
  }
  const nextCommand = {
    command: commandText,
    reason,
    source: "manual-command"
  };
  const existing = normalizeCommandItems(state.pendingCommands);
  const merged = [
    nextCommand,
    ...existing.filter((item) => commandResultKey(item.command) !== commandResultKey(commandText))
  ];
  renderCommands(merged);
  rememberCommand(commandText, { reason, source: "manual-command" });
  if (focus) manualCommandInput?.focus();
  appendToolCall({
    title: `手动验证命令已加入面板：${commandText}`,
    label: "$",
    state: "ready",
    body: `$ ${commandText}`
  });
  showToast("手动验证命令已加入命令面板。");
  return nextCommand;
}

function pruneRepairChains(chains = []) {
  return (Array.isArray(chains) ? chains : [])
    .filter((chain) => chain?.id)
    .sort((a, b) => String(b.updatedAt || b.startedAt || "").localeCompare(String(a.updatedAt || a.startedAt || "")))
    .slice(0, 12);
}

function repairChainFiles(repair = null) {
  return (repair?.patches || [])
    .map((patch) => patch.path)
    .filter(Boolean)
    .slice(0, 12);
}

function summarizeRepairEvidenceChain(chain = null) {
  if (!chain) return "(无修复证据链)";
  const lines = [
    `id: ${chain.id || ""}`,
    `status: ${chain.status || "unknown"}`,
    `source: ${chain.source || ""}`,
    chain.recommendedAction ? `recommendedAction: ${chain.recommendedAction.label || chain.recommendedAction.id || "debug action"} · ${chain.recommendedAction.command || ""}` : "",
    chain.command ? `failedCommand: ${chain.command}` : "",
    chain.commandRun ? `commandRun: ${chain.commandRun.status || "unknown"} · exit ${chain.commandRun.exitCode ?? "?"} · ${chain.commandRun.outputSummary || ""}` : "",
    chain.failure ? `failure: exit ${chain.failure.exitCode ?? "?"} · ${chain.failure.outputSummary || "(无输出摘要)"}` : "",
    chain.diagnostics ? `diagnostics: ${chain.diagnostics.status || "attached"} · ${chain.diagnostics.findingCount || 0} findings` : "",
    chain.repair ? `repair: ${chain.repair.hasDiff ? "diff ready" : "no diff"} · ${chain.repair.files?.join(", ") || "no files"} · ${chain.repair.commandCount || 0} commands` : "",
    chain.apply ? `apply: ${chain.apply.status || ""} · checkpoint ${chain.apply.checkpointId || "(none)"} · task ${chain.apply.taskId || "(none)"}` : "",
    chain.verification ? `verification: ${chain.verification.skipped ? "skipped" : chain.verification.ok ? "passed" : "failed"} · ${chain.verification.checkCount || 0} checks` : ""
  ].filter(Boolean);
  return lines.join("\n");
}

function storeRepairEvidenceChain(chain = null) {
  if (!chain?.id) return null;
  const updated = { ...chain, updatedAt: new Date().toISOString() };
  const active = state.activeRepairChain;
  const shouldReplaceActive = !active || active.id === updated.id;
  if (updated.status === "verified") {
    if (shouldReplaceActive) state.activeRepairChain = null;
  } else if (shouldReplaceActive) {
    state.activeRepairChain = updated;
  }
  state.repairChains = pruneRepairChains([
    updated,
    ...(state.repairChains || []).filter((item) => item.id !== updated.id)
  ]);
  saveCommandDebugState();
  return updated;
}

function createRepairEvidenceChain({ source, command = "", result = null, diagnostics = null, prompt = "" } = {}) {
  const now = new Date().toISOString();
  const chain = {
    id: `repair-chain-${now.replace(/[:.]/g, "-")}`,
    scope: currentDebugScope(),
    source: source || "manual-command",
    status: "diagnosed",
    startedAt: now,
    updatedAt: now,
    prompt: prompt || state.lastPrompt || input.value.trim(),
    command,
    failure: result ? {
      exitCode: result.exitCode,
      blocked: Boolean(result.blocked),
      outputSummary: summarizeCommandOutput(result.output || ""),
      output: String(result.output || "").slice(0, 8000),
      policy: result.policy || null
    } : null,
    diagnostics: diagnostics ? {
      status: diagnostics.status || "",
      summary: diagnostics.summary || null,
      findingCount: diagnostics.findings?.length || 0,
      nextActions: (diagnostics.nextActions || []).slice(0, 6)
    } : null,
    recommendedAction: null,
    commandRun: null,
    repair: null,
    apply: null,
    verification: null
  };
  const stored = storeRepairEvidenceChain(chain);
  appendToolCall({
    title: "修复证据链已创建",
    label: "repair",
    state: "diagnosed",
    body: summarizeRepairEvidenceChain(stored)
  });
  return stored;
}

function updateRepairEvidenceChain(patch = {}, { title = "修复证据链已更新" } = {}) {
  const patchId = String(patch.id || "").trim();
  const base = (patchId
    ? [state.activeRepairChain, ...(state.repairChains || [])].find((item) => item?.id === patchId)
    : null)
    || state.activeRepairChain
    || createRepairEvidenceChain({ source: "manual", prompt: state.lastPrompt || input.value.trim() });
  const next = {
    ...base,
    ...patch,
    recommendedAction: patch.recommendedAction === undefined ? base.recommendedAction : patch.recommendedAction,
    commandRun: patch.commandRun === undefined ? base.commandRun : patch.commandRun,
    repair: patch.repair === undefined ? base.repair : patch.repair,
    apply: patch.apply === undefined ? base.apply : patch.apply,
    verification: patch.verification === undefined ? base.verification : patch.verification
  };
  const stored = storeRepairEvidenceChain(next);
  appendToolCall({
    title,
    label: "repair",
    state: stored.status || "updated",
    body: summarizeRepairEvidenceChain(stored)
  });
  return stored;
}

function failedCommandItems(commands = []) {
  return normalizeCommandItems(commands).filter((item) => {
    const run = state.commandResults[commandResultKey(item.command)];
    return Boolean(run?.result && run.result.exitCode !== 0 && !run.result.blocked);
  });
}

function failedCommandSourceContextItems(commands = []) {
  return failedCommandItems(commands)
    .map((item) => {
      const run = state.commandResults[commandResultKey(item.command)];
      return {
        ...item,
        run,
        sourceLocations: commandSourceLocations(run)
      };
    })
    .filter((item) => item.sourceLocations.length > 0);
}

function failedCommandSourceVerificationCommands(items = [], { rerunReason = "修复后重跑原失败命令。" } = {}) {
  return normalizeCommandItems([
    ...items.map((item) => ({ command: item.command, reason: rerunReason })),
    { command: "node --check app.js", reason: "复查前端入口语法。" },
    { command: "node --check server.js", reason: "复查后端入口语法。" },
    { command: "node server.js --api-smoke-section=debug", reason: "复查失败分类、源码定位和调试闭环。" }
  ]).slice(0, 10);
}

async function appendFailedCommandSourceContexts(commands = [], { title = "命令组", mode = "evidence" } = {}) {
  const items = failedCommandSourceContextItems(commands);
  if (!items.length) {
    appendToolCall({
      title: `没有可汇总的失败源码定位：${title}`,
      label: "ctx",
      state: "跳过",
      body: "当前失败命令没有识别到源码位置。"
    });
    showToast("当前失败命令没有可汇总的源码位置。");
    return "";
  }
  const chunks = [];
  for (const item of items.slice(0, 6)) {
    const result = await fetchCommandSourceContexts(item.run, { contextLines: 6, limit: 6 });
    const failureAnalysis = item.run?.result?.failureAnalysis || item.run?.result?.diagnostics?.commandFailure || null;
    chunks.push([
      `$ ${item.command}`,
      failureAnalysis ? `失败分类：${failureAnalysis.category || "unknown"} · ${failureAnalysis.summary || ""}` : "",
      `源码位置：\n${formatCommandSourceLocations(item.sourceLocations)}`,
      result.contexts?.length ? `源码上下文：\n${formatCommandSourceContexts(result.contexts)}` : "源码上下文：未读取到可用片段。"
    ].filter(Boolean).join("\n"));
  }
  const verificationCommands = failedCommandSourceVerificationCommands(items);
  const context = [
    "请基于这组失败命令的源码上下文继续修复当前项目。",
    "",
    `命令组：${title}`,
    `失败源码定位数量：${items.length}`,
    "",
    chunks.join("\n\n---\n\n"),
    "",
    verificationCommands.length ? `修复后验证命令：\n${verificationCommands.map((item) => `- ${item.command}${item.reason ? `：${item.reason}` : ""}`).join("\n")}` : "",
    "",
    "要求：优先围绕上述源码位置做最小修复；修复后先重跑原失败命令，再运行语法检查和 debug smoke。"
  ].filter(Boolean).join("\n");
  if (mode === "prompt") {
    const current = input.value.trim();
    input.value = [current, context].filter(Boolean).join("\n\n---\n\n");
    input.focus();
    scheduleReferencePreview({ immediate: true });
  }
  appendToolCall({
    title: mode === "prompt" ? `失败源码上下文已加入提示词：${title}` : `失败源码上下文汇总：${title}`,
    label: "ctx",
    state: `${items.length} failures`,
    body: context.slice(0, 16000)
  });
  showToast(mode === "prompt" ? "失败源码上下文已加入提示词。" : "失败源码上下文已汇总。");
  return context;
}

async function runFailedCommandSourceContextRepair(commands = [], { title = "命令组" } = {}) {
  if (state.busy) {
    showToast("代理正在运行，请稍后再启动批量源码修复。");
    return "";
  }
  const items = failedCommandSourceContextItems(commands);
  if (!items.length) {
    appendToolCall({
      title: `没有可修复的失败源码定位：${title}`,
      label: "ctx",
      state: "跳过",
      body: "当前失败命令没有识别到源码位置。"
    });
    showToast("当前失败命令没有可用于源码修复的位置。");
    return "";
  }
  setBusy(true, "批量源码修复");
  try {
    const prompt = await appendFailedCommandSourceContexts(items, { title, mode: "evidence" });
    const allLocations = [];
    const seenLocations = new Set();
    items.forEach((item) => {
      item.sourceLocations.forEach((location) => {
        const pathValue = location.path || location.file || "";
        const key = `${String(pathValue).toLowerCase()}:${location.line || 1}:${location.column || 0}`;
        if (!pathValue || seenLocations.has(key)) return;
        seenLocations.add(key);
        allLocations.push(location);
      });
    });
    const primary = items[0];
    const command = items.map((item) => item.command).join(" ; ").slice(0, 1200);
    const verificationCommands = failedCommandSourceVerificationCommands(items, {
      rerunReason: "批量源码修复后重跑原失败命令。"
    });
    const draft = await api("/api/source-context-repair-draft", {
      method: "POST",
      body: JSON.stringify({
        prompt,
        command,
        result: primary.run?.result || null,
        diagnostics: primary.run?.result?.diagnostics || state.lastDebugDiagnostics || null,
        locations: allLocations.slice(0, 24),
        contextLines: 6,
        limit: 12
      })
    });
    const chain = createRepairEvidenceChain({
      source: "batch-source-context-fix",
      command,
      result: primary.run?.result || null,
      diagnostics: primary.run?.result?.diagnostics || state.lastDebugDiagnostics || null,
      prompt
    });
    updateRepairEvidenceChain({
      id: chain.id,
      status: "repairing",
      repair: {
        source: "batch-source-context-fix",
        status: draft.diff ? "awaiting_approval" : "no_safe_repair",
        sourceLocations: allLocations.slice(0, 24),
        sourceContextCount: draft.sourceContextSummary?.returned || 0,
        promptSummary: prompt.slice(0, 1200),
        hasDiff: Boolean(draft.diff),
        files: repairChainFiles(draft),
        commandCount: draft.commands?.length || verificationCommands.length,
        reviewCount: draft.review?.length || 0,
        proposalId: draft.proposal?.id || draft.goal?.pendingProposalId || ""
      },
      verification: {
        status: "planned",
        commands: draft.commands?.length ? draft.commands : verificationCommands,
        source: "batch-source-context-fix"
      }
    }, { title: draft.diff ? "批量源码修复草稿已加入证据链" : "批量源码修复未生成安全 diff" });
    stageRepairVerificationCommands(draft.commands?.length ? draft.commands : verificationCommands, {
      title: "批量源码修复验证命令",
      successTitle: "批量源码修复验证命令已放入命令面板",
      source: "batch-source-context-fix",
      note: "批量源码修复会优先重跑原失败命令，再执行语法检查和 debug smoke。"
    });
    if (draft.diff) {
      state.pendingDiff = draft.diff;
      renderPlan(draft.plan || []);
      renderDiff(draft.patches || []);
      renderReview(draft.review || []);
    } else {
      input.value = prompt;
      scheduleReferencePreview({ immediate: true });
    }
    appendToolCall({
      title: draft.diff ? `批量源码修复草稿已生成：${title}` : `批量源码修复提示已生成：${title}`,
      label: "ctx",
      state: draft.proposal?.id || draft.goal?.pendingProposalId || `${allLocations.length} locations`,
      body: JSON.stringify({
        proposalId: draft.proposal?.id || draft.goal?.pendingProposalId || "",
        type: draft.proposal?.type || "source_context_repair",
        commandCount: items.length,
        sourceLocationCount: allLocations.length,
        sourceContextSummary: draft.sourceContextSummary || null,
        files: repairChainFiles(draft),
        commands: draft.commands || verificationCommands,
        policy: draft.policy || null,
        reply: draft.reply || "",
        fallbackPrompt: draft.diff ? "" : prompt
      }, null, 2).slice(0, 12000)
    });
    showToast(draft.diff ? "批量源码修复草稿已生成，可复核后批准写入。" : "批量源码修复未生成 diff，已保留提示词。");
    setBusy(false, draft.diff ? "待审批" : "修复提示已生成");
    return draft.diff ? draft.diff : prompt;
  } catch (error) {
    const fallbackVerificationCommands = failedCommandSourceVerificationCommands(items, {
      rerunReason: "批量源码修复失败后重跑原失败命令。"
    });
    const fallbackContext = [
      `命令组：${title}`,
      "",
      "失败命令：",
      ...items.slice(0, 8).map((item) => `- ${item.command}`),
      "",
      "源码定位：",
      ...items.slice(0, 8).flatMap((item) => [
        `$ ${item.command}`,
        formatCommandSourceLocations(item.sourceLocations)
      ]),
      "",
      "错误：",
      error.message,
      "",
      fallbackVerificationCommands.length ? `可重跑验证命令：\n${fallbackVerificationCommands.map((item) => `- ${item.command}${item.reason ? `：${item.reason}` : ""}`).join("\n")}` : "",
      "",
      "建议：先点击“源码上下文”把只读上下文加入提示词，或修复接口/模型配置后重新点击“源码修复”。"
    ].filter(Boolean).join("\n");
    input.value = [input.value.trim(), fallbackContext].filter(Boolean).join("\n\n---\n\n");
    scheduleReferencePreview({ immediate: true });
    appendToolCall({
      title: `批量源码修复启动失败：${title}`,
      label: "ctx",
      state: "失败",
      body: fallbackContext.slice(0, 12000)
    });
    appendDebugEvidence("批量源码修复启动失败", "失败", fallbackContext);
    stageRepairVerificationCommands(fallbackVerificationCommands, {
      title: "批量源码修复失败后验证命令",
      successTitle: "批量源码修复失败后验证命令已放入命令面板",
      source: "batch-source-context-fix-fallback",
      note: "源码修复接口失败后仍可先重跑原失败命令，再执行语法检查和 debug smoke。"
    });
    showToast(error.message);
    setBusy(false, "批量源码修复失败");
    return fallbackContext;
  }
}

function smokeSectionCommandItems(commands = [], section = "") {
  const needle = `--api-smoke-section=${section}`;
  return normalizeCommandItems(commands).filter((item) => String(item.command || "").includes(needle));
}

async function runSmokeSectionCommands(commands = [], section = "", { title = "建议命令" } = {}) {
  const items = smokeSectionCommandItems(commands, section);
  if (!items.length) {
    showToast(`当前命令列表没有 ${section} 分段 smoke。`);
    appendToolCall({
      title: `没有 ${section} 分段 smoke 可运行：${title}`,
      label: "$",
      state: "跳过",
      body: commandItemsToText(commands)
    });
    return false;
  }
  if (state.busy) {
    showToast("代理正在运行，请稍后再运行 smoke。");
    return false;
  }
  setBusy(true, `运行 ${section} smoke`);
  const ok = await runCommandBatch(items, {
    title: `${title} · ${section} smoke`,
    stopOnFailure: true
  });
  setBusy(false, ok ? `${section} smoke 通过` : `${section} smoke 失败`);
  return ok;
}

function updateCommandToolbarSummaries() {
  checksList?.querySelectorAll(".command-list-toolbar").forEach((toolbar) => {
    const summary = toolbar.querySelector("[data-command-batch-summary]");
    const rows = Array.from(checksList.querySelectorAll(".command-row[data-command-key]"));
    const commands = rows
      .map((row) => row.dataset.commandKey || row.querySelector("code")?.textContent || "")
      .filter(Boolean);
    if (summary) summary.textContent = formatCommandBatchSummary(commands);
    const referenceFilesButton = toolbar.querySelector("[data-action='reference-batch-files']");
    if (referenceFilesButton) referenceFilesButton.disabled = commandBatchReferencedFiles(commands).length === 0;
    const sourceContextsButton = toolbar.querySelector("[data-action='prompt-failed-source-contexts']");
    if (sourceContextsButton) {
      const sourceContextCount = failedCommandSourceContextItems(commands).length;
      sourceContextsButton.textContent = sourceContextCount ? `源码上下文(${sourceContextCount})` : "源码上下文";
      sourceContextsButton.disabled = sourceContextCount === 0;
    }
    const sourceRepairButton = toolbar.querySelector("[data-action='run-failed-source-context-fix']");
    if (sourceRepairButton) {
      const sourceContextCount = failedCommandSourceContextItems(commands).length;
      sourceRepairButton.textContent = sourceContextCount ? `源码修复(${sourceContextCount})` : "源码修复";
      sourceRepairButton.disabled = sourceContextCount === 0;
    }
    const rerunFailedButton = toolbar.querySelector("[data-action='rerun-failed-commands']");
    if (rerunFailedButton) {
      const failedCount = failedCommandItems(commands).length;
      rerunFailedButton.textContent = failedCount ? `重跑失败(${failedCount})` : "重跑失败";
      rerunFailedButton.disabled = failedCount === 0;
    }
    const repairButton = toolbar.querySelector("[data-action='run-batch-evidence']");
    if (repairButton) repairButton.disabled = !commandBatchNeedsRepair(commands);
    const fastSmokeButton = toolbar.querySelector("[data-action='run-fast-smoke']");
    if (fastSmokeButton) {
      const fastSmokeItems = smokeSectionCommandItems(commands, "fast");
      fastSmokeButton.hidden = fastSmokeItems.length === 0;
      fastSmokeButton.disabled = fastSmokeItems.length === 0;
    }
    const debugSmokeButton = toolbar.querySelector("[data-action='run-debug-smoke']");
    if (debugSmokeButton) {
      const debugSmokeItems = smokeSectionCommandItems(commands, "debug");
      debugSmokeButton.hidden = debugSmokeItems.length === 0;
      debugSmokeButton.disabled = debugSmokeItems.length === 0;
    }
  });
}

function renderCommandToolbar(commands = [], { title = "建议命令" } = {}) {
  const items = normalizeCommandItems(commands);
  if (!items.length) return null;
  const toolbar = document.createElement("div");
  toolbar.className = "command-list-toolbar";
  toolbar.innerHTML = `
    <strong></strong>
    <small data-command-batch-summary></small>
    <button type="button" data-action="run-fast-smoke" hidden>快速 smoke</button>
    <button type="button" data-action="run-debug-smoke" hidden>调试 smoke</button>
    <button type="button" data-action="copy-all-commands">复制全部命令</button>
    <button type="button" data-action="reference-batch-files" disabled>引用文件</button>
    <button type="button" data-action="prompt-failed-source-contexts" disabled>源码上下文</button>
    <button type="button" data-action="run-failed-source-context-fix" disabled>源码修复</button>
    <button type="button" data-action="prompt-batch-evidence">批量证据</button>
    <button type="button" data-action="batch-verification-prompt">验证提示</button>
    <button type="button" data-action="run-batch-evidence" disabled>证据修复</button>
    <button type="button" data-action="run-all-commands">运行全部</button>
    <button type="button" data-action="rerun-failed-commands" disabled>重跑失败</button>
  `;
  toolbar.querySelector("strong").textContent = title;
  toolbar.querySelector("[data-command-batch-summary]").textContent = formatCommandBatchSummary(items);
  toolbar.querySelector("[data-action='run-fast-smoke']").addEventListener("click", async () => {
    await runSmokeSectionCommands(items, "fast", { title });
  });
  toolbar.querySelector("[data-action='run-debug-smoke']").addEventListener("click", async () => {
    await runSmokeSectionCommands(items, "debug", { title });
  });
  toolbar.querySelector("[data-action='copy-all-commands']").addEventListener("click", async () => {
    const body = commandItemsToText(items);
    const copied = await copyText(body);
    appendToolCall({
      title: copied ? `已复制全部命令：${title}` : `复制全部命令失败：${title}`,
      label: "$",
      state: copied ? "完成" : "失败",
      body: copyLogBody(copied, body)
    });
    showToast(copied ? "全部命令已复制。" : copyFailureSummary());
  });
  toolbar.querySelector("[data-action='reference-batch-files']").addEventListener("click", () => {
    referenceCommandBatchFilesInPrompt(items, { title });
  });
  toolbar.querySelector("[data-action='prompt-failed-source-contexts']").addEventListener("click", async () => {
    try {
      await appendFailedCommandSourceContexts(items, { title, mode: "prompt" });
    } catch (error) {
      appendDebugEvidence("批量失败源码上下文读取失败", "失败", error.message);
      showToast(error.message);
    }
  });
  toolbar.querySelector("[data-action='run-failed-source-context-fix']").addEventListener("click", async () => {
    await runFailedCommandSourceContextRepair(items, { title });
  });
  toolbar.querySelector("[data-action='prompt-batch-evidence']").addEventListener("click", () => {
    appendCommandBatchEvidenceToPrompt(items, { title });
  });
  toolbar.querySelector("[data-action='batch-verification-prompt']").addEventListener("click", () => {
    appendCommandBatchVerificationPromptToPrompt(items, { title });
  });
  toolbar.querySelector("[data-action='run-batch-evidence']").addEventListener("click", () => {
    runCommandBatchEvidenceRepair(items, { title });
  });
  toolbar.querySelector("[data-action='run-all-commands']").addEventListener("click", async () => {
    if (state.busy) {
      showToast("代理正在运行，请稍后再运行命令。");
      return;
    }
    setBusy(true, "运行命令");
    const ok = await runCommandBatch(items, { title });
    setBusy(false, ok ? "命令通过" : "命令失败");
  });
  toolbar.querySelector("[data-action='rerun-failed-commands']").addEventListener("click", async () => {
    const failedItems = failedCommandItems(items);
    if (!failedItems.length) {
      appendToolCall({
        title: `没有失败命令可重跑：${title}`,
        label: "$",
        state: "跳过",
        body: formatCommandBatchSummary(items)
      });
      showToast("当前没有失败命令可重跑。");
      updateCommandToolbarSummaries();
      return;
    }
    if (state.busy) {
      showToast("代理正在运行，请稍后再重跑失败命令。");
      return;
    }
    setBusy(true, "重跑失败命令");
    const ok = await runCommandBatch(failedItems, {
      title: `${title} · 重跑失败`,
      stopOnFailure: false
    });
    setBusy(false, ok ? "失败命令已通过" : "仍有失败命令");
  });
  updateCommandToolbarSummaries();
  return toolbar;
}

function renderCommandRowStatus(row, commandText, run = null) {
  const small = row.querySelector("small");
  const button = row.querySelector("button[data-action='run']");
  const detailButton = row.querySelector("button[data-action='detail']");
  const copyOutputButton = row.querySelector("button[data-action='copy-output']");
  const promptButton = row.querySelector("button[data-action='prompt-command']");
  const referenceFilesButton = row.querySelector("button[data-action='reference-command-files']");
  const sourceContextButton = row.querySelector("button[data-action='source-context']");
  const sourceContextPromptButton = row.querySelector("button[data-action='source-context-prompt']");
  const sourceContextFixButton = row.querySelector("button[data-action='source-context-fix']");
  let verificationPromptButton = row.querySelector("button[data-action='verification-prompt']");
  let verificationFixButton = row.querySelector("button[data-action='verification-fix']");
  const baseMeta = row.dataset.meta || "";
  row.classList.remove("passed", "failed", "running");
  if (!run) {
    row.classList.add("queued");
    if (small) small.textContent = baseMeta;
    if (button) {
      button.textContent = "运行";
      button.disabled = false;
    }
    if (detailButton) {
      detailButton.hidden = true;
      detailButton.onclick = null;
    }
    if (copyOutputButton) {
      copyOutputButton.hidden = true;
      copyOutputButton.onclick = null;
    }
    if (promptButton) {
      promptButton.hidden = true;
      promptButton.onclick = null;
    }
    if (referenceFilesButton) {
      referenceFilesButton.hidden = true;
      referenceFilesButton.onclick = null;
    }
    if (sourceContextButton) {
      sourceContextButton.hidden = true;
      sourceContextButton.onclick = null;
    }
    if (sourceContextPromptButton) {
      sourceContextPromptButton.hidden = true;
      sourceContextPromptButton.onclick = null;
    }
    if (sourceContextFixButton) {
      sourceContextFixButton.hidden = true;
      sourceContextFixButton.onclick = null;
    }
    if (verificationPromptButton) {
      verificationPromptButton.hidden = true;
      verificationPromptButton.onclick = null;
    }
    if (verificationFixButton) {
      verificationFixButton.hidden = true;
      verificationFixButton.onclick = null;
    }
    return;
  }
  row.classList.remove("queued");
  if (run.status === "running") {
    row.classList.add("running");
    if (small) small.textContent = [baseMeta, "运行中"].filter(Boolean).join(" · ");
    if (button) {
      button.textContent = "运行中";
      button.disabled = true;
    }
    if (detailButton) {
      detailButton.hidden = true;
      detailButton.onclick = null;
    }
    if (copyOutputButton) {
      copyOutputButton.hidden = true;
      copyOutputButton.onclick = null;
    }
    if (promptButton) {
      promptButton.hidden = true;
      promptButton.onclick = null;
    }
    if (referenceFilesButton) {
      referenceFilesButton.hidden = true;
      referenceFilesButton.onclick = null;
    }
    if (sourceContextButton) {
      sourceContextButton.hidden = true;
      sourceContextButton.onclick = null;
    }
    if (sourceContextPromptButton) {
      sourceContextPromptButton.hidden = true;
      sourceContextPromptButton.onclick = null;
    }
    if (sourceContextFixButton) {
      sourceContextFixButton.hidden = true;
      sourceContextFixButton.onclick = null;
    }
    if (verificationPromptButton) {
      verificationPromptButton.hidden = true;
      verificationPromptButton.onclick = null;
    }
    if (verificationFixButton) {
      verificationFixButton.hidden = true;
      verificationFixButton.onclick = null;
    }
    return;
  }
  const ok = run.result?.exitCode === 0;
  const canBuildVerificationPrompt = Boolean(run.result && run.result.exitCode !== 0 && !run.result.blocked);
  row.classList.add(ok ? "passed" : "failed");
  if (small) {
    small.textContent = [
      baseMeta,
      run.result?.blocked ? "已拒绝" : `exit ${run.result?.exitCode ?? "?"}`,
      summarizeCommandOutput(run.result?.output || run.error || "")
    ].filter(Boolean).join(" · ");
  }
  if (button) {
    button.textContent = "重跑";
    button.disabled = false;
  }
  if (detailButton) detailButton.hidden = false;
  if (detailButton) detailButton.onclick = () => {
    appendToolCall({
      title: `命令详情：${commandText}`,
      label: "$",
      state: run.result?.exitCode === 0 ? "完成" : run.result?.blocked ? "已拒绝" : "失败",
      body: [
        run.result?.policy ? `policy: ${run.result.policy.risk} · ${run.result.policy.reason}` : "",
        run.result?.approval ? `approval: ${run.result.approval.id}` : "",
        run.result?.diagnostics ? `diagnostics: ${run.result.diagnostics.status || "attached"}` : "",
        "",
        run.result?.output || run.error || "(无输出)"
      ].filter((line) => line !== "").join("\n")
    });
  };
  if (copyOutputButton) copyOutputButton.hidden = false;
  if (copyOutputButton) copyOutputButton.onclick = async () => {
    const output = run.result?.output || run.error || "";
    const copied = await copyText(output);
    appendToolCall({
      title: copied ? `已复制命令输出：${commandText}` : `复制命令输出失败：${commandText}`,
      label: "$",
      state: copied ? "完成" : "失败",
      body: copyLogBody(copied, output.slice(0, 4000) || "(无输出)")
    });
    showToast(copied ? "命令输出已复制。" : copyFailureSummary());
  };
  if (promptButton) promptButton.hidden = false;
  if (promptButton) promptButton.onclick = () => {
    appendCommandTranscriptToPrompt(commandText, run);
  };
  if (referenceFilesButton) referenceFilesButton.hidden = false;
  if (referenceFilesButton) referenceFilesButton.onclick = () => {
    referenceCommandFilesInPrompt(commandText, run);
  };
  const sourceLocations = commandSourceLocations(run);
  const canUseSourceContext = canBuildVerificationPrompt && sourceLocations.length > 0;
  if (sourceContextButton) {
    sourceContextButton.hidden = !canUseSourceContext;
    sourceContextButton.onclick = canUseSourceContext
      ? async () => {
          try {
            const result = await fetchCommandSourceContexts(run, { contextLines: 6, limit: 8 });
            appendToolCall({
              title: `命令行源码定位：${commandText}`,
              label: "ctx",
              state: `${result.contexts?.length || 0} locations`,
              body: formatCommandSourceContexts(result.contexts).slice(0, 12000) || "未读取到源码上下文。"
            });
            showToast(`已读取 ${result.contexts?.length || 0} 处源码上下文。`);
          } catch (error) {
            appendDebugEvidence("命令行源码定位失败", "失败", error.message);
            showToast(error.message);
          }
        }
      : null;
  }
  if (sourceContextPromptButton) {
    sourceContextPromptButton.hidden = !canUseSourceContext;
    sourceContextPromptButton.onclick = canUseSourceContext
      ? async () => {
          try {
            const result = await fetchCommandSourceContexts(run, { contextLines: 6, limit: 8 });
            const prompt = buildCommandSourceContextPrompt(commandText, run, result.contexts);
            const current = input.value.trim();
            input.value = [current, prompt].filter(Boolean).join("\n\n---\n\n");
            input.focus();
            scheduleReferencePreview({ immediate: true });
            appendToolCall({
              title: `命令行源码修复提示已加入：${commandText}`,
              label: "ctx",
              state: `${result.contexts?.length || 0} locations`,
              body: prompt.slice(0, 12000)
            });
            showToast("源码修复提示已加入提示词。");
          } catch (error) {
            appendDebugEvidence("命令行源码修复提示生成失败", "失败", error.message);
            showToast(error.message);
          }
        }
      : null;
  }
  if (sourceContextFixButton) {
    sourceContextFixButton.hidden = !canUseSourceContext;
    sourceContextFixButton.onclick = canUseSourceContext
      ? () => runCommandSourceContextFix(commandText, run)
      : null;
  }
  if (canBuildVerificationPrompt && !verificationPromptButton) {
    verificationPromptButton = document.createElement("button");
    verificationPromptButton.type = "button";
    verificationPromptButton.dataset.action = "verification-prompt";
    verificationPromptButton.textContent = "验证提示";
    row.insertBefore(verificationPromptButton, button || null);
  }
  if (verificationPromptButton) {
    verificationPromptButton.hidden = !canBuildVerificationPrompt;
    verificationPromptButton.onclick = canBuildVerificationPrompt
      ? () => appendCommandVerificationPromptToPrompt(commandText, run)
      : null;
  }
  if (canBuildVerificationPrompt && !verificationFixButton) {
    verificationFixButton = document.createElement("button");
    verificationFixButton.type = "button";
    verificationFixButton.dataset.action = "verification-fix";
    verificationFixButton.textContent = "验证修复";
    row.insertBefore(verificationFixButton, button || null);
  }
  if (verificationFixButton) {
    verificationFixButton.hidden = !canBuildVerificationPrompt;
    verificationFixButton.onclick = canBuildVerificationPrompt
      ? () => runCommandVerificationFix(commandText, run)
      : null;
  }
}

function renderLastFailedCommandCard(result = state.lastDebugDiagnostics) {
  const host = debugDiagnosticsPanel?.querySelector(".debug-last-failed-command");
  if (!host) return;
  const failure = state.lastFailedCommand;
  host.innerHTML = "";
  host.hidden = !failure;
  if (!failure) return;

  const command = failure.command || "";
  const output = failure.result?.output || failure.error || "";
  const failureAnalysis = failure.result?.failureAnalysis || failure.result?.diagnostics?.commandFailure || null;
  const recoveryChain = failure.result?.recoveryChain || null;
  const recoveryCommands = normalizeCommandItems(recoveryChain?.commands || []);
  host.innerHTML = `
    <div>
      <strong>最近失败命令</strong>
      <code></code>
      <small></small>
      <div class="debug-last-failed-analysis" hidden>
        <span data-last-failed-meta="category"></span>
        <span data-last-failed-meta="files"></span>
        <span data-last-failed-meta="source-locations"></span>
        <span data-last-failed-meta="next-action"></span>
        <span data-last-failed-meta="recovery-chain"></span>
      </div>
    </div>
    <div class="debug-last-failed-actions">
      <button type="button" data-last-failed-action="detail">详情</button>
      <button type="button" data-last-failed-action="copy-command">复制命令</button>
      <button type="button" data-last-failed-action="copy-output">复制输出</button>
      <button type="button" data-last-failed-action="prompt">加入提示词</button>
      <button type="button" data-last-failed-action="reference-files">引用文件</button>
      <button type="button" data-last-failed-action="source-context">定位源码</button>
      <button type="button" data-last-failed-action="source-context-prompt">源码修复提示</button>
      <button type="button" data-last-failed-action="source-context-fix">源码直接修复</button>
      <button type="button" data-last-failed-action="verification-prompt">验证提示</button>
      <button type="button" data-last-failed-action="verification-fix">验证修复</button>
      <button type="button" data-last-failed-action="stage-recovery">放入复查命令</button>
      <button type="button" data-last-failed-action="run-recovery">运行复查链</button>
      <button type="button" data-last-failed-action="rerun">重跑</button>
      <button type="button" data-last-failed-action="fix">直接修复</button>
    </div>
  `;
  host.querySelector("code").textContent = command;
  host.querySelector("small").textContent = [
    failure.result?.blocked ? "已拒绝" : `exit ${failure.result?.exitCode ?? "?"}`,
    summarizeCommandOutput(output, failureAnalysis)
  ].filter(Boolean).join(" · ");
  const analysisRow = host.querySelector(".debug-last-failed-analysis");
  if ((failureAnalysis || recoveryChain) && analysisRow) {
    const referencedFileCount = Array.isArray(failureAnalysis?.referencedFiles) ? failureAnalysis.referencedFiles.length : 0;
    const sourceLocationCount = commandSourceLocations(failure).length;
    const firstNextAction = Array.isArray(failureAnalysis?.nextActions) ? failureAnalysis.nextActions[0] : "";
    analysisRow.hidden = false;
    analysisRow.querySelector("[data-last-failed-meta='category']").textContent = `分类：${failureAnalysis?.category || recoveryChain?.category || "unknown"}`;
    analysisRow.querySelector("[data-last-failed-meta='files']").textContent = `相关文件：${referencedFileCount}`;
    analysisRow.querySelector("[data-last-failed-meta='source-locations']").textContent = `源码位置：${sourceLocationCount}`;
    analysisRow.querySelector("[data-last-failed-meta='next-action']").textContent = firstNextAction ? `下一步：${firstNextAction}` : "下一步：查看详情";
    analysisRow.querySelector("[data-last-failed-meta='recovery-chain']").textContent = recoveryCommands.length ? `复查链：${recoveryCommands.length} 条` : "复查链：待生成";
  }
  host.querySelector("[data-last-failed-action='detail']").addEventListener("click", () => {
    appendToolCall({
      title: `最近失败命令详情：${command}`,
      label: "$",
      state: failure.result?.blocked ? "已拒绝" : "失败",
      body: [
        failure.result?.policy ? `policy: ${failure.result.policy.risk} · ${failure.result.policy.reason}` : "",
        failure.result?.approval ? `approval: ${failure.result.approval.id}` : "",
        failureAnalysis ? formatCommandFailureAnalysis(failureAnalysis) : "",
        recoveryChain ? formatCommandRecoveryChain(recoveryChain) : "",
        failure.result?.diagnostics ? `diagnostics: ${failure.result.diagnostics.status || "attached"}` : "",
        "",
        output || "(无输出)"
      ].filter((line) => line !== "").join("\n")
    });
  });
  host.querySelector("[data-last-failed-action='copy-command']").addEventListener("click", async () => {
    const copied = await copyText(command);
    appendDebugEvidence(copied ? "最近失败命令已复制" : "最近失败命令复制失败", copied ? "完成" : "失败", copyLogBody(copied, command));
    showToast(copied ? "失败命令已复制。" : copyFailureSummary());
  });
  host.querySelector("[data-last-failed-action='copy-output']").addEventListener("click", async () => {
    const copied = await copyText(output);
    appendDebugEvidence(copied ? "最近失败命令输出已复制" : "最近失败命令输出复制失败", copied ? "完成" : "失败", copyLogBody(copied, output || "(无输出)"));
    showToast(copied ? "失败输出已复制。" : copyFailureSummary());
  });
  host.querySelector("[data-last-failed-action='prompt']").addEventListener("click", () => {
    appendCommandTranscriptToPrompt(command, failure);
  });
  host.querySelector("[data-last-failed-action='reference-files']").addEventListener("click", () => {
    referenceCommandFilesInPrompt(command, failure);
  });
  host.querySelector("[data-last-failed-action='source-context']").addEventListener("click", async () => {
    try {
      const result = await fetchCommandSourceContexts(failure, { contextLines: 6, limit: 8 });
      appendToolCall({
        title: `失败命令源码定位：${command}`,
        label: "ctx",
        state: `${result.contexts?.length || 0} locations`,
        body: formatCommandSourceContexts(result.contexts).slice(0, 12000) || "未读取到源码上下文。"
      });
      showToast(`已读取 ${result.contexts?.length || 0} 处源码上下文。`);
    } catch (error) {
      appendDebugEvidence("失败命令源码定位失败", "失败", error.message);
      showToast(error.message);
    }
  });
  host.querySelector("[data-last-failed-action='source-context-prompt']").addEventListener("click", async () => {
    try {
      const result = await fetchCommandSourceContexts(failure, { contextLines: 6, limit: 8 });
      const prompt = buildCommandSourceContextPrompt(command, failure, result.contexts);
      const current = input.value.trim();
      input.value = [current, prompt].filter(Boolean).join("\n\n---\n\n");
      input.focus();
      scheduleReferencePreview({ immediate: true });
      appendToolCall({
        title: `源码修复提示已加入提示词：${command}`,
        label: "ctx",
        state: `${result.contexts?.length || 0} locations`,
        body: prompt.slice(0, 12000)
      });
      showToast("源码修复提示已加入提示词。");
    } catch (error) {
      appendDebugEvidence("源码修复提示生成失败", "失败", error.message);
      showToast(error.message);
    }
  });
  host.querySelector("[data-last-failed-action='source-context-fix']").addEventListener("click", () => {
    runCommandSourceContextFix(command, failure);
  });
  host.querySelector("[data-last-failed-action='verification-prompt']").addEventListener("click", () => {
    appendCommandVerificationPromptToPrompt(command, failure);
  });
  host.querySelector("[data-last-failed-action='verification-fix']").addEventListener("click", () => {
    runCommandVerificationFix(command, failure);
  });
  host.querySelector("[data-last-failed-action='stage-recovery']").addEventListener("click", () => {
    if (!recoveryCommands.length) {
      showToast("这次失败没有可放入命令面板的复查链。");
      return;
    }
    stageRepairVerificationCommands(recoveryCommands, {
      title: "失败命令复查链",
      successTitle: "失败命令复查链已放入命令面板",
      source: "failed-command-recovery-chain"
    });
  });
  host.querySelector("[data-last-failed-action='run-recovery']").addEventListener("click", async () => {
    if (!recoveryCommands.length) {
      showToast("这次失败没有可运行的复查链。");
      return;
    }
    if (state.busy) {
      showToast("代理正在运行，请稍后再运行复查链。");
      return;
    }
    renderCommands(recoveryCommands);
    setBusy(true, "运行失败命令复查链");
    const ok = await runCommandBatch(recoveryCommands, {
      title: "失败命令复查链",
      stopOnFailure: true
    });
    setBusy(false, ok ? "复查链通过" : "复查链失败");
  });
  host.querySelector("[data-last-failed-action='rerun']").addEventListener("click", async () => {
    if (state.busy) {
      showToast("代理正在运行，请稍后再重跑命令。");
      return;
    }
    setBusy(true, "重跑失败命令");
    const ok = await runSuggestedCommand(command, { single: true });
    setBusy(false, ok ? "命令通过" : "命令失败");
  });
  host.querySelector("[data-last-failed-action='fix']").addEventListener("click", () => {
    if (state.busy) {
      showToast("代理正在运行，请稍后再发起修复。");
      return;
    }
    const prompt = buildDebugFixPrompt(result);
    const failurePrompt = [
      prompt || (state.lastPrompt ? `继续修复上一轮任务：${state.lastPrompt}` : "请修复最近一次失败命令。"),
      "",
      "最近失败命令：",
      `$ ${command}`,
      "",
      "失败输出：",
      output.slice(0, 4000) || "(无输出)"
    ].join("\n");
    input.value = failurePrompt;
    scheduleReferencePreview({ immediate: true });
    appendDebugEvidence("已启动最近失败命令修复", "running", failurePrompt);
    showToast("正在启动最近失败命令修复代理。");
    submitPromptForm();
  });
}

function updateCommandRunState(command, run) {
  const key = commandResultKey(command);
  state.commandResults[key] = {
    ...run,
    startedAt: run?.startedAt || state.commandResults[key]?.startedAt || new Date().toISOString(),
    completedAt: run?.status === "done" ? new Date().toISOString() : ""
  };
  if (run?.status === "done" && run.result && run.result.exitCode !== 0 && !run.result.blocked) {
    state.lastFailedCommand = { command: key, ...state.commandResults[key], capturedAt: new Date().toISOString() };
    if (run.result.failureAnalysis) {
      appendDebugEvidence("失败命令已分类", run.result.failureAnalysis.category || "failure", formatCommandFailureAnalysis(run.result.failureAnalysis));
    }
    appendCommandReferencedFilesEvidence(key, state.commandResults[key]);
    renderLastFailedCommandCard();
  } else if (run?.status === "done" && run.result?.exitCode === 0 && state.lastFailedCommand?.command === key) {
    state.lastFailedCommand = null;
    renderLastFailedCommandCard();
  }
  if (run?.status === "done" && run.result) {
    rememberCommand(key, {
      reason: state.commandHistory.find((item) => commandResultKey(item.command) === key)?.reason || "",
      source: "command-run",
      result: run.result
    });
  }
  checksList?.querySelectorAll(".command-row").forEach((row) => {
    if (row.dataset.commandKey === key) renderCommandRowStatus(row, key, run);
  });
  updateCommandToolbarSummaries();
  saveCommandDebugState();
}

function verificationPlanCommands(plan = null) {
  const commands = [
    ...(plan?.commands || []),
    ...(plan?.typecheck?.commands || [])
  ];
  return normalizeCommandItems(commands);
}

async function runVerificationPlanCommands(plan = null) {
  const commands = verificationPlanCommands(plan);
  if (!commands.length) {
    showToast("当前验证计划没有可运行命令。");
    return false;
  }
  renderCommands(commands);
  appendDebugEvidence(
    "开始运行验证计划",
    "running",
    commands.map((item) => `$ ${item.command}${item.reason ? `\n  ${item.reason}` : ""}`).join("\n")
  );
  const ok = await runCommandBatch(commands, { title: "验证计划", stopOnFailure: true });
  appendDebugEvidence(
    ok ? "验证计划命令全部通过" : "验证计划已停在失败命令",
    ok ? "完成" : "失败",
    commandBatchEvidence(commands)
  );
  return ok;
}

function renderPlan(items = []) {
  const fallback = ["读取工作区上下文", "生成修改方案", "审批后写入文件"];
  const plan = items.length ? items : fallback;
  planSteps.innerHTML = "";
  plan.forEach((item, index) => {
    const li = document.createElement("li");
    li.className = index === 0 ? "active" : index < plan.length - 1 ? "complete" : "";
    li.textContent = item;
    planSteps.appendChild(li);
  });
}

function referenceFileInPrompt(filePath, { titlePrefix = "已引用文件" } = {}) {
  const reference = `@${filePath}`;
  if (!input.value.includes(reference)) {
    input.value = `${input.value.trimEnd()}\n${reference}\n`;
  }
  input.focus();
  appendToolCall({
    title: `${titlePrefix}：${filePath}`,
    label: "ctx",
    state: "已加入输入",
    body: "该文件路径已追加到提示词输入框，代理会优先把它作为编辑/排查上下文。"
  });
  scheduleReferencePreview({ immediate: true });
}

function appendFileReadFailureEvidence(filePath, error, {
  title = "读取文件失败",
  action = "file-read",
  retry = null
} = {}) {
  return appendActionFailureEvidence({
    kind: "file",
    action,
    targetName: filePath || "file",
    endpoint: "/api/file",
    request: { path: filePath || "" },
    item: { path: filePath || "" },
    error
  }, {
    title: `${title}：${filePath || "file"}`,
    label: "cat",
    retry,
    safe: filePath ? () => referenceFileInPrompt(filePath) : null
  });
}

function renderFiles(files = []) {
  state.files = files;
  fileList.innerHTML = "";
  if (!files.length) {
    fileList.textContent = "没有找到可读取的文本文件";
    scheduleReferencePreview({ immediate: true });
    return;
  }
  files.slice(0, 80).forEach((file) => {
    const row = document.createElement("div");
    row.className = "file-row";
    row.innerHTML = `<button type="button" data-action="read"></button><button type="button" data-action="reference">引用</button>`;
    row.querySelector("[data-action='read']").textContent = file.path;
    row.querySelector("[data-action='read']").addEventListener("click", async () => {
      const readFile = async () => {
        const data = await api(`/api/file?path=${encodeURIComponent(file.path)}`);
        appendToolCall({
          title: `读取文件：${file.path}`,
          label: "cat",
          state: "完成",
          body: data.content.slice(0, 5000)
        });
      };
      try {
        await readFile();
      } catch (error) {
        showToast(error.message);
        appendFileReadFailureEvidence(file.path, error, {
          title: "读取文件失败",
          action: "file-read",
          retry: readFile
        });
      }
    });
    row.querySelector("[data-action='reference']").addEventListener("click", () => {
      referenceFileInPrompt(file.path);
    });
    fileList.appendChild(row);
  });
  scheduleReferencePreview({ immediate: true });
}

function summarizeRepoMap(repoMap) {
  if (!repoMap) return "";
  const symbols = repoMap.symbols?.length || 0;
  const scripts = Object.keys(repoMap.scripts || {}).length;
  const types = Object.entries(repoMap.extCounts || {})
    .slice(0, 4)
    .map(([ext, count]) => `${ext} ${count}`)
    .join(" / ");
  return `${symbols} 个符号，${scripts} 个脚本${types ? `，${types}` : ""}`;
}

function summarizeDiffPatch(diff = "") {
  const summary = { additions: 0, deletions: 0 };
  String(diff || "").split(/\r?\n/).forEach((line) => {
    if (line.startsWith("+++") || line.startsWith("---")) return;
    if (line.startsWith("+")) summary.additions += 1;
    if (line.startsWith("-")) summary.deletions += 1;
  });
  return summary;
}

function summarizeDiffPatches(patches = []) {
  return patches.reduce((summary, patch) => {
    const fileSummary = summarizeDiffPatch(patch.diff || "");
    summary.additions += fileSummary.additions;
    summary.deletions += fileSummary.deletions;
    return summary;
  }, { additions: 0, deletions: 0 });
}

function splitPatchHunks(diff = "") {
  const lines = String(diff || "").split(/\r?\n/);
  const headers = [];
  const hunks = [];
  let current = null;
  for (const line of lines) {
    if (line.startsWith("@@")) {
      if (current) hunks.push(current);
      current = { header: line, lines: [line] };
    } else if (current) {
      current.lines.push(line);
    } else if (line.trim()) {
      headers.push(line);
    }
  }
  if (current) hunks.push(current);
  return { headers, hunks };
}

function selectedDiffPatchText(patch = {}, selectedHunkIndexes = []) {
  const parsed = splitPatchHunks(patch.diff || "");
  if (!parsed.hunks.length || selectedHunkIndexes.length === parsed.hunks.length) return patch.diff || "";
  const selected = new Set(selectedHunkIndexes.map((index) => Number(index)));
  const hunkText = parsed.hunks
    .filter((_, index) => selected.has(index))
    .flatMap((hunk) => hunk.lines);
  return [...parsed.headers, ...hunkText, ""].join("\n");
}

function collectSelectedDiff() {
  const selectedPatches = [];
  const selectedSummary = [];
  diffList.querySelectorAll(".diff-file").forEach((item) => {
    const index = Number(item.dataset.patchIndex);
    const patch = state.pendingPatches?.[index] || null;
    if (!patch) return;
    const hunkCheckboxes = [...item.querySelectorAll("[data-diff-hunk-index] input[type='checkbox']")];
    if (!hunkCheckboxes.length) {
      selectedPatches.push(patch.diff || "");
      selectedSummary.push({ path: patch.path, selectedHunks: null, totalHunks: null });
      return;
    }
    const selectedIndexes = hunkCheckboxes
      .map((checkbox) => Number(checkbox.closest("[data-diff-hunk-index]")?.dataset.diffHunkIndex))
      .filter((_, checkboxIndex) => hunkCheckboxes[checkboxIndex].checked);
    if (!selectedIndexes.length) return;
    selectedPatches.push(selectedDiffPatchText(patch, selectedIndexes));
    selectedSummary.push({ path: patch.path, selectedHunks: selectedIndexes.length, totalHunks: hunkCheckboxes.length });
  });
  return {
    diff: selectedPatches.filter(Boolean).join("\n").trimEnd() + (selectedPatches.length ? "\n" : ""),
    summary: selectedSummary
  };
}

function renderDiff(patches = []) {
  state.pendingPatches = patches;
  state.lastPreApplyReviewKey = "";
  state.lastPreApplyReview = null;
  diffList.innerHTML = "";
  renderConflictResolution(null);
  if (!patches.length) {
    diffSummary.textContent = "暂无修改";
    if (toggleAllDiffBtn) {
      toggleAllDiffBtn.disabled = true;
      toggleAllDiffBtn.textContent = "折叠全部";
      toggleAllDiffBtn.setAttribute("aria-expanded", "true");
    }
    if (copyAllDiffBtn) copyAllDiffBtn.disabled = true;
    if (preApplyReviewBtn) preApplyReviewBtn.disabled = !String(state.pendingDiff || "").trim();
    if (pendingDiffImpactBtn) pendingDiffImpactBtn.disabled = !String(state.pendingDiff || "").trim();
    diffList.innerHTML = `<div class="empty-state">本次没有建议写入的 diff。</div>`;
    return;
  }
  const total = summarizeDiffPatches(patches);
  diffSummary.textContent = `${patches.length} 个文件 · +${total.additions} / -${total.deletions}`;
  if (toggleAllDiffBtn) {
    toggleAllDiffBtn.disabled = false;
    toggleAllDiffBtn.textContent = "折叠全部";
    toggleAllDiffBtn.setAttribute("aria-expanded", "true");
  }
  if (copyAllDiffBtn) copyAllDiffBtn.disabled = false;
  if (preApplyReviewBtn) preApplyReviewBtn.disabled = false;
  if (pendingDiffImpactBtn) pendingDiffImpactBtn.disabled = false;
  patches.forEach((patch, patchIndex) => {
    const fileSummary = summarizeDiffPatch(patch.diff || "");
    const parsedHunks = splitPatchHunks(patch.diff || "");
    const item = document.createElement("div");
    item.className = "diff-file";
    item.dataset.patchIndex = String(patchIndex);
    item.innerHTML = `<header><span></span><small class="diff-file-stats"></small><button type="button" data-action="select-file-hunks">全选 hunk</button><button type="button" data-action="clear-file-hunks">取消 hunk</button><button type="button" data-action="reference-file-from-diff">引用</button><button type="button" data-action="read-file-from-diff">原文</button><button type="button" data-action="toggle-file-diff">折叠</button><button type="button" data-action="copy-file-diff">复制</button></header><div class="diff-hunk-selector"></div><pre></pre>`;
    item.querySelector("span").textContent = patch.path;
    item.querySelector(".diff-file-stats").textContent = `+${fileSummary.additions} / -${fileSummary.deletions}${parsedHunks.hunks.length ? ` · ${parsedHunks.hunks.length} hunks` : ""}`;
    const hunkSelector = item.querySelector(".diff-hunk-selector");
    if (parsedHunks.hunks.length) {
      parsedHunks.hunks.forEach((hunk, hunkIndex) => {
        const hunkSummary = summarizeDiffPatch(hunk.lines.join("\n"));
        const row = document.createElement("label");
        row.className = "diff-hunk-choice";
        row.dataset.diffHunkIndex = String(hunkIndex);
        row.innerHTML = `<input type="checkbox" checked /><span></span><small></small>`;
        row.querySelector("span").textContent = hunk.header || `hunk ${hunkIndex + 1}`;
        row.querySelector("small").textContent = `+${hunkSummary.additions} / -${hunkSummary.deletions}`;
        hunkSelector.appendChild(row);
      });
    } else {
      hunkSelector.hidden = true;
    }
    item.querySelector("pre").textContent = patch.diff || "新文件或完整替换内容将在批准后写入。";
    item.querySelector("[data-action='select-file-hunks']").addEventListener("click", () => {
      item.querySelectorAll("[data-diff-hunk-index] input[type='checkbox']").forEach((checkbox) => { checkbox.checked = true; });
    });
    item.querySelector("[data-action='clear-file-hunks']").addEventListener("click", () => {
      item.querySelectorAll("[data-diff-hunk-index] input[type='checkbox']").forEach((checkbox) => { checkbox.checked = false; });
    });
    item.querySelector("[data-action='reference-file-from-diff']").addEventListener("click", () => {
      referenceFileInPrompt(patch.path, { titlePrefix: "已引用 diff 文件" });
    });
    item.querySelector("[data-action='read-file-from-diff']").addEventListener("click", async () => {
      const readOriginal = async () => {
        const data = await api(`/api/file?path=${encodeURIComponent(patch.path)}`);
        appendToolCall({
          title: `读取 diff 原文件：${patch.path}`,
          label: "cat",
          state: "完成",
          body: data.content.slice(0, 8000)
        });
      };
      try {
        await readOriginal();
      } catch (error) {
        appendFileReadFailureEvidence(patch.path, error, {
          title: "读取 diff 原文件失败",
          action: "diff-original-read",
          retry: readOriginal
        });
        showToast(error.message);
      }
    });
    item.querySelector("[data-action='toggle-file-diff']").addEventListener("click", (event) => {
      const collapsed = item.classList.toggle("collapsed");
      event.currentTarget.textContent = collapsed ? "展开" : "折叠";
      event.currentTarget.setAttribute("aria-expanded", String(!collapsed));
    });
    item.querySelector("[data-action='copy-file-diff']").addEventListener("click", async () => {
      const copied = await copyText(patch.diff || "");
    appendToolCall({
      title: copied ? `已复制 diff：${patch.path}` : `复制 diff 失败：${patch.path}`,
      label: "diff",
      state: copied ? "完成" : "失败",
      body: copyLogBody(copied, (patch.diff || "").slice(0, 4000))
    });
      showToast(copied ? "单文件 diff 已复制。" : copyFailureSummary());
    });
    diffList.appendChild(item);
  });
}

function setAllDiffFilesCollapsed(collapsed) {
  diffList.querySelectorAll(".diff-file").forEach((item) => {
    item.classList.toggle("collapsed", collapsed);
    const button = item.querySelector("[data-action='toggle-file-diff']");
    if (button) {
      button.textContent = collapsed ? "展开" : "折叠";
      button.setAttribute("aria-expanded", String(!collapsed));
    }
  });
  if (toggleAllDiffBtn) {
    toggleAllDiffBtn.textContent = collapsed ? "展开全部" : "折叠全部";
    toggleAllDiffBtn.setAttribute("aria-expanded", String(!collapsed));
  }
}

function combinedPendingDiff() {
  return (state.pendingPatches || [])
    .map((patch) => patch.diff || "")
    .filter(Boolean)
    .join("\n\n");
}

function normalizePendingDiffImpactPath(value) {
  const normalized = String(value || "")
    .trim()
    .replaceAll("\\", "/")
    .replace(/^['"]|['"]$/g, "")
    .replace(/^\.?\//, "");
  if (!normalized || normalized === "/dev/null" || normalized.endsWith("/dev/null")) return "";
  return normalized.replace(/^[ab]\//, "");
}

function pendingDiffPathsFromText(diffText = "") {
  const paths = [];
  const addPath = (value) => {
    const pathValue = normalizePendingDiffImpactPath(value);
    if (pathValue) paths.push(pathValue);
  };
  String(diffText || "").split(/\r?\n/).forEach((line) => {
    const gitMatch = /^diff --git\s+a\/(.+?)\s+b\/(.+)$/.exec(line);
    if (gitMatch) {
      addPath(gitMatch[2] || gitMatch[1]);
      return;
    }
    const headerMatch = /^(?:---|\+\+\+)\s+(?:[ab]\/)?(.+)$/.exec(line);
    if (headerMatch) addPath(headerMatch[1]);
  });
  return paths;
}

function pendingDiffImpactPaths() {
  const files = new Map();
  const addPath = (value) => {
    const normalized = normalizePendingDiffImpactPath(value);
    if (normalized) files.set(normalized.toLowerCase(), normalized);
  };
  (state.pendingPatches || []).forEach((patch) => {
    addPath(patch?.path || patch?.file || patch?.target);
    pendingDiffPathsFromText(patch?.diff || "").forEach(addPath);
  });
  pendingDiffPathsFromText(combinedPendingDiff() || state.pendingDiff || "").forEach(addPath);
  return [...files.values()].slice(0, 40);
}

function pendingDiffImpactVerificationCommands(paths = []) {
  const lowerPaths = paths.map((item) => item.toLowerCase());
  const hasPath = (name) => lowerPaths.includes(name.toLowerCase());
  const touchesUi = lowerPaths.some((item) => ["app.js", "index.html", "styles.css"].includes(item));
  const commands = [];
  const addCommand = (command, reason) => {
    if (!commands.some((item) => item.command === command)) commands.push({ command, reason });
  };
  if (hasPath("server.js")) addCommand("node --check server.js", "校验服务端入口语法");
  if (hasPath("app.js")) addCommand("node --check app.js", "校验前端控制台脚本语法");
  if (touchesUi) addCommand("node server.js --ui-smoke-test", "复核待审批 UI 改动的关键挂钩");
  addCommand("node server.js --api-smoke-section=semantic", "复核语义索引、影响面和依赖关系");
  return commands.slice(0, 8);
}

function pendingDiffReviewKey({ allowPartial = false } = {}) {
  const selectedDiff = allowPartial ? collectSelectedDiff() : null;
  const diffText = allowPartial ? selectedDiff.diff : (combinedPendingDiff() || state.pendingDiff || "");
  const paths = pendingDiffImpactPaths();
  const total = summarizeDiffPatches(state.pendingPatches || []);
  return JSON.stringify({
    allowPartial,
    bytes: String(diffText || "").length,
    files: paths,
    additions: total.additions,
    deletions: total.deletions,
    selectedHunks: selectedDiff?.summary || []
  });
}

function buildPreApplyReviewRisks({ paths = [], total = {}, semanticImpact = null, allowPartial = false } = {}) {
  const lowerPaths = paths.map((item) => item.toLowerCase());
  const risks = [];
  const addRisk = (level, message, evidence = "") => {
    if (!risks.some((item) => item.message === message)) risks.push({ level, message, evidence });
  };
  if (allowPartial) addRisk("warn", "本次准备部分应用 hunk，需确认未选 hunk 不会破坏上下文。", "partial apply");
  if ((total.additions || 0) + (total.deletions || 0) > 300) addRisk("warn", "待审批 diff 较大，建议先跑影响面和验证命令。", `+${total.additions || 0} / -${total.deletions || 0}`);
  if (lowerPaths.some((item) => item === "server.js")) addRisk("review", "修改服务端入口或 API 路由，写入前应跑服务端语法和相关 API smoke。", "server.js");
  if (lowerPaths.some((item) => ["app.js", "index.html", "styles.css"].includes(item))) addRisk("review", "修改前端工作台界面，写入前应跑 UI smoke。", "frontend surface");
  if (semanticImpact?.warnings?.length) addRisk("warn", "语义影响面返回 warning，需要先复核。", semanticImpact.warnings.slice(0, 4).join("; "));
  if ((semanticImpact?.dependents || []).length > 0) addRisk("review", "变更文件存在依赖方，批准后需关注下游行为。", `${semanticImpact.dependents.length} dependents`);
  if ((semanticImpact?.callers || []).length > 0) addRisk("review", "变更文件存在调用点，批准后需复核调用链。", `${semanticImpact.callers.length} callers`);
  return risks.length ? risks : [{ level: "pass", message: "未发现明显预应用风险，仍建议按验证命令复查。", evidence: "local pre-apply review" }];
}

async function buildPreApplyReviewEvidence({ allowPartial = false } = {}) {
  const selectedDiff = allowPartial ? collectSelectedDiff() : null;
  const diffText = allowPartial ? selectedDiff.diff : (combinedPendingDiff() || state.pendingDiff || "");
  const paths = pendingDiffImpactPaths();
  const total = summarizeDiffPatches(state.pendingPatches || []);
  const selectedHunks = selectedDiff?.summary || [];
  const semanticImpact = paths.length
    ? await api("/api/semantic-impact", {
      method: "POST",
      body: JSON.stringify({ paths, limit: 60, includeContext: true })
    })
    : null;
  const verificationCommands = pendingDiffImpactVerificationCommands(paths);
  return {
    generatedAt: new Date().toISOString(),
    source: "pre-apply-review",
    status: "review_ready",
    pendingDiff: {
      bytes: String(diffText || "").length,
      patchCount: state.pendingPatches?.length || 0,
      additions: total.additions,
      deletions: total.deletions,
      files: paths,
      allowPartial,
      selectedHunks
    },
    checklist: [
      { item: "目标文件已识别", status: paths.length ? "pass" : "warn", evidence: paths.join(", ") || "no files" },
      { item: "语义影响面已读取", status: semanticImpact ? "pass" : "skip", evidence: semanticImpact?.summary || null },
      { item: "验证命令已准备", status: verificationCommands.length ? "pass" : "warn", evidence: verificationCommands.map((item) => item.command) },
      { item: "写入仍需审批", status: "pass", evidence: "pre-apply review is read-only" }
    ],
    impact: semanticImpact ? {
      summary: semanticImpact.summary,
      targetSummaries: semanticImpact.targetSummaries?.slice(0, 24),
      dependents: semanticImpact.dependents?.slice(0, 24),
      callers: semanticImpact.callers?.slice(0, 24),
      routes: semanticImpact.routes?.slice(0, 16),
      selectors: semanticImpact.selectors?.slice(0, 16),
      warnings: semanticImpact.warnings
    } : null,
    risks: buildPreApplyReviewRisks({ paths, total, semanticImpact, allowPartial }),
    verificationCommands,
    policy: {
      readsOnly: true,
      writesFiles: false,
      requiresApplyApproval: true,
      source: "pre-apply-review"
    }
  };
}

async function runPreApplyReview({ allowPartial = false, automatic = false } = {}) {
  const diffText = combinedPendingDiff() || state.pendingDiff || "";
  if (!diffText.trim()) {
    showToast("当前没有待审批 diff 可预审查。");
    appendToolCall({
      title: "预应用审查跳过",
      label: "review",
      state: "跳过",
      body: "当前没有待审批 diff。"
    });
    return null;
  }
  setBusy(true, "预应用审查");
  try {
    const reviewKey = pendingDiffReviewKey({ allowPartial });
    const evidence = await buildPreApplyReviewEvidence({ allowPartial });
    state.lastPreApplyReviewKey = reviewKey;
    state.lastPreApplyReview = evidence;
    appendSemanticEvidenceCard(evidence, {
      title: automatic ? "批准前自动预审查清单已生成" : "预应用审查清单已生成",
      kind: "pre-apply",
      state: evidence.risks.some((item) => item.level === "warn") ? "review" : "完成",
      body: compactSemanticEvidence(evidence)
    });
    stageRepairVerificationCommands(evidence.verificationCommands || [], {
      title: "预应用审查验证命令",
      successTitle: "预应用审查验证命令已放入面板",
      source: "pre-apply-review",
      note: "预应用审查没有可排队的验证命令。"
    });
    setBusy(false, "预审查完成");
    return evidence;
  } catch (error) {
    showToast(error.message);
    appendSemanticFailureEvidence(error, {
      title: "生成预应用审查失败证据",
      kind: "pre-apply",
      endpoint: "/api/semantic-impact",
      request: {
        paths: pendingDiffImpactPaths(),
        allowPartial,
        pendingDiffBytes: String(diffText || "").length
      }
    });
    setBusy(false, "预审查失败");
    return null;
  }
}

async function ensurePreApplyReviewBeforeApply({ allowPartial = false } = {}) {
  const reviewKey = pendingDiffReviewKey({ allowPartial });
  if (state.lastPreApplyReviewKey === reviewKey && state.lastPreApplyReview) return true;
  appendToolCall({
    title: "批准写入前自动预审查",
    label: "pre-apply",
    state: "running",
    body: [
      "检测到当前待审批 diff 尚未完成本轮预应用审查。",
      "将先生成只读预审查清单、语义影响面和验证命令，再继续写入。"
    ].join("\n")
  });
  const evidence = await runPreApplyReview({ allowPartial, automatic: true });
  if (!evidence) {
    showToast("预审查失败，已暂停写入。");
    return false;
  }
  showToast("批准前预审查完成，继续写入。");
  return true;
}

function collectConflictResolutionsFromPanel() {
  const conflicts = state.conflictPreview?.conflictPreviews || [];
  if (!conflicts.length || !conflictResolutionPanel) return [];
  return [...conflictResolutionPanel.querySelectorAll(".conflict-resolution-row")]
    .map((row) => {
      const index = Number(row.dataset.index || 0);
      const conflict = conflicts[index] || {};
      return {
        path: conflict.path,
        hunk: conflict.hunk,
        oldStart: conflict.oldStart,
        current: conflict.current || [],
        proposed: conflict.proposed || [],
        resolved: row.querySelector("textarea")?.value || ""
      };
    })
    .filter((item) => item.path);
}

function buildConflictResolutionContext(preview = state.conflictPreview) {
  const conflicts = preview?.conflictPreviews || [];
  if (!conflicts.length) return "";
  const resolutions = collectConflictResolutionsFromPanel();
  const rows = conflicts.map((conflict, index) => {
    const resolution = resolutions[index] || {};
    return [
      `### ${index + 1}. ${conflict.path || "unknown"} ${conflict.hunk || ""}`.trim(),
      "<<<<<<< CURRENT",
      ...(conflict.current || []).slice(0, 80),
      "=======",
      ...(conflict.proposed || []).slice(0, 80),
      ">>>>>>> PROPOSED",
      resolution.resolved ? `Resolved 草稿：\n${resolution.resolved}` : ""
    ].filter(Boolean).join("\n");
  }).join("\n\n");
  const files = [...new Set(conflicts.map((item) => item.path).filter(Boolean))];
  return [
    "请基于当前 diff 冲突继续修复，目标是生成可安全审批的最小解决 diff。",
    "",
    `冲突数量：${conflicts.length}`,
    files.length ? `涉及文件：${files.map((file) => `@${file}`).join(" ")}` : "",
    state.pendingDiff ? `待审批 diff 字节数：${state.pendingDiff.length}` : "",
    "",
    "冲突证据：",
    rows,
    "",
    "要求：先读取涉及文件的当前内容；不要直接覆盖用户改动；综合 CURRENT、PROPOSED 和 resolved 草稿，优先保留两边正确意图；生成新的待审批 diff，并给出安全验证命令。"
  ].filter(Boolean).join("\n");
}

function appendConflictResolutionToPrompt(preview = state.conflictPreview) {
  const context = buildConflictResolutionContext(preview);
  if (!context) {
    showToast("暂无可加入提示词的冲突证据。");
    return "";
  }
  const current = input.value.trim();
  input.value = [current, context].filter(Boolean).join("\n\n---\n\n");
  input.focus();
  scheduleReferencePreview({ immediate: true });
  appendToolCall({
    title: "冲突证据已加入提示词",
    label: "merge",
    state: `${preview?.conflictPreviews?.length || 0} conflicts`,
    body: context.slice(0, 12000)
  });
  showToast("冲突证据已加入提示词。");
  return context;
}

function runConflictResolutionRepair(preview = state.conflictPreview) {
  if (state.busy) {
    showToast("代理正在运行，请稍后再修复冲突。");
    return "";
  }
  const context = buildConflictResolutionContext(preview);
  if (!context) {
    showToast("暂无可修复的冲突证据。");
    return "";
  }
  const prompt = [
    context,
    "",
    "请现在直接修复这些冲突：读取相关文件，生成最小可审批 diff，必要时更新冲突解决草稿，并给出可运行的验证命令。"
  ].join("\n");
  input.value = prompt;
  scheduleReferencePreview({ immediate: true });
  appendToolCall({
    title: "已启动冲突修复",
    label: "merge",
    state: "running",
    body: prompt.slice(0, 12000)
  });
  showToast("正在启动冲突修复。");
  submitPromptForm();
  return prompt;
}

function renderConflictResolution(preview = null) {
  state.conflictPreview = preview;
  if (!conflictResolutionPanel) return;
  const conflicts = preview?.conflictPreviews || [];
  conflictResolutionPanel.classList.toggle("hidden", !conflicts.length);
  conflictResolutionPanel.innerHTML = "";
  if (!conflicts.length) return;
  const header = document.createElement("div");
  header.className = "conflict-resolution-head";
  header.innerHTML = `<strong>冲突解决</strong><span class="conflict-resolution-actions"><button type="button" data-action="prompt-conflicts">加入提示词</button><button type="button" data-action="repair-conflicts">直接修复</button><button type="button" data-action="create-resolution-draft">生成解决草稿</button></span>`;
  conflictResolutionPanel.appendChild(header);
  conflicts.forEach((conflict, index) => {
    const row = document.createElement("div");
    row.className = "conflict-resolution-row";
    row.dataset.index = String(index);
    row.innerHTML = [
      `<header><span></span><small></small></header>`,
      `<div class="conflict-sides"><pre data-side="current"></pre><pre data-side="proposed"></pre></div>`,
      `<label>Resolved<textarea rows="4" spellcheck="false"></textarea></label>`,
      `<div class="button-row"><button type="button" data-action="use-current">使用 CURRENT</button><button type="button" data-action="use-proposed">使用 PROPOSED</button></div>`
    ].join("");
    row.querySelector("span").textContent = conflict.path;
    row.querySelector("small").textContent = conflict.hunk || `hunk ${index + 1}`;
    row.querySelector('[data-side="current"]').textContent = ["<<<<<<< CURRENT", ...(conflict.current || [])].join("\n");
    row.querySelector('[data-side="proposed"]').textContent = [">>>>>>> PROPOSED", ...(conflict.proposed || [])].join("\n");
    row.querySelector("textarea").value = (conflict.proposed || []).join("\n");
    conflictResolutionPanel.appendChild(row);
  });
}

function renderCheckpoints(checkpoints = []) {
  state.checkpoints = checkpoints;
  rollbackBtn.textContent = checkpoints.length ? `回滚 ${checkpoints[0].slice(0, 19)}` : "回滚";
}

function buildApplyFailureContext(errorOrResult, {
  diff = state.pendingDiff || "",
  patches = state.pendingPatches || [],
  commands = state.pendingCommands || [],
  allowPartial = false,
  repairContext = state.activeRepairChain || null,
  prompt = state.lastPrompt || input.value.trim(),
  title = "写入失败证据"
} = {}) {
  const isError = errorOrResult instanceof Error;
  const message = isError
    ? errorOrResult.message
    : (errorOrResult?.repairError || errorOrResult?.verification?.reason || errorOrResult?.status || "unknown failure");
  const failedChecks = (errorOrResult?.verification?.checks || [])
    .filter((check) => check.exitCode !== 0)
    .map((check) => ({
      command: check.command,
      exitCode: check.exitCode,
      output: String(check.output || "").slice(0, 3000)
    }))
    .slice(0, 5);
  const patchFiles = patches.map((patch) => patch.path).filter(Boolean).slice(0, 20);
  return [
    "请基于这次 diff 写入 / 验证失败证据继续修复当前项目。",
    "",
    `证据类型：${title}`,
    `状态：${isError ? "request_failed" : errorOrResult?.status || "failed"}`,
    `错误/原因：${message}`,
    `允许部分应用：${allowPartial ? "是" : "否"}`,
    `待写入 diff 字节数：${String(diff || "").length}`,
    `待写入文件数：${patchFiles.length}`,
    "",
    "原始需求：",
    String(prompt || "").slice(0, 6000),
    "",
    "待写入文件：",
    patchFiles.length ? patchFiles.map((file) => `- ${file}`).join("\n") : "- 无",
    "",
    "建议/验证命令：",
    commands.length ? commands.map((item) => `- ${typeof item === "string" ? item : item.command || JSON.stringify(item)}`).join("\n") : "- 无",
    "",
    failedChecks.length ? "失败检查：" : "",
    failedChecks.length ? JSON.stringify(failedChecks, null, 2).slice(0, 8000) : "",
    "",
    "待写入 diff：",
    String(diff || "").slice(0, 12000),
    "",
    repairContext ? "当前修复证据链：" : "",
    repairContext ? summarizeRepairEvidenceChain(repairContext) : "",
    "",
    "要求：先判断失败是 diff 过期、冲突、文件路径问题、写入异常、验证失败还是修复代理未产出 diff；需要改代码时输出最小 diff；如果应先部分应用或重新生成冲突解决草稿，请明确下一步安全动作。"
  ].filter(Boolean).join("\n");
}

function appendApplyFailureEvidence(errorOrResult, options = {}) {
  const context = buildApplyFailureContext(errorOrResult, options);
  appendToolCall({
    title: options.title || "写入失败证据",
    label: "fs",
    state: errorOrResult?.status || "失败",
    body: context.slice(0, 12000)
  });
  const actions = document.createElement("div");
  actions.className = "debug-last-failed-actions";
  actions.innerHTML = `<button type="button" data-action="prompt">加入提示词</button><button type="button" data-action="retry" ${state.pendingDiff ? "" : "disabled"}>重试写入</button><button type="button" data-action="partial" ${state.pendingDiff && !options.allowPartial ? "" : "disabled"}>部分应用</button><button type="button" data-action="repair">诊断修复</button>`;
  actions.querySelector("[data-action='prompt']").addEventListener("click", () => {
    const current = input.value.trim();
    input.value = [current, context].filter(Boolean).join("\n\n---\n\n");
    input.focus();
    scheduleReferencePreview({ immediate: true });
    appendToolCall({
      title: "写入失败证据已加入提示词",
      label: "fs",
      state: "ready",
      body: context.slice(0, 12000)
    });
    showToast("写入失败证据已加入提示词。");
  });
  actions.querySelector("[data-action='retry']").addEventListener("click", () => {
    if (state.busy) {
      showToast("代理正在运行，请稍后再重试写入。");
      return;
    }
    applyPendingDiff({ allowPartial: Boolean(options.allowPartial) });
  });
  actions.querySelector("[data-action='partial']").addEventListener("click", () => {
    if (state.busy) {
      showToast("代理正在运行，请稍后再部分应用。");
      return;
    }
    applyPendingDiff({ allowPartial: true });
  });
  actions.querySelector("[data-action='repair']").addEventListener("click", () => {
    if (state.busy) {
      showToast("代理正在运行，请稍后再启动写入诊断修复。");
      return;
    }
    const prompt = [
      context,
      "",
      "请现在直接基于这次写入失败证据继续修复：优先修正 diff、冲突、验证失败或写入恢复链路，并给出下一轮安全验证命令。"
    ].join("\n");
    input.value = prompt;
    scheduleReferencePreview({ immediate: true });
    appendToolCall({
      title: "已启动写入失败诊断修复",
      label: "fs",
      state: "running",
      body: prompt.slice(0, 12000)
    });
    showToast("正在基于写入失败证据启动修复。");
    submitPromptForm();
  });
  log.lastElementChild?.appendChild(actions);
  return context;
}

function buildApplyVerificationRecoveryContext(result = {}) {
  const recovery = result?.recovery || {};
  if (!recovery || typeof recovery !== "object") return "";
  const commands = normalizeCommandItems(recovery.verificationCommands || []);
  const failedCommands = Array.isArray(recovery.failedCommands) ? recovery.failedCommands : [];
  const nextActions = Array.isArray(recovery.nextActions) ? recovery.nextActions : [];
  const changedFiles = Array.isArray(recovery.changedFiles) ? recovery.changedFiles : [];
  const conflicts = Array.isArray(recovery.conflicts) ? recovery.conflicts : [];
  const selectedHunks = Array.isArray(recovery.selectedHunks) ? recovery.selectedHunks : [];
  return [
    "请基于这次写入后验证恢复证据继续推进当前项目。",
    "",
    `状态：${recovery.status || result.status || "unknown"}`,
    `checkpoint：${recovery.checkpointId || result.checkpoint?.id || "(none)"}`,
    `验证：${recovery.verification?.skipped ? "skipped" : recovery.verification?.ok ? "passed" : "failed"} · checks ${recovery.verification?.checkCount || 0} · failed ${recovery.verification?.failedCount || 0}`,
    recovery.verification?.reason ? `原因：${recovery.verification.reason}` : "",
    recovery.repairSuggested ? "修复候选：已生成待审批 diff" : "修复候选：无",
    recovery.repairError ? `修复错误：${recovery.repairError}` : "",
    "",
    "已写入文件：",
    changedFiles.length ? changedFiles.map((file) => `- @${file}`).join("\n") : "- 无",
    "",
    selectedHunks.length ? "已选 hunk：" : "",
    selectedHunks.length ? selectedHunks.map((item) => `- ${item.path || ""} ${item.selectedHunks || 0}/${item.totalHunks || 0}`).join("\n") : "",
    "",
    conflicts.length ? "剩余冲突：" : "",
    conflicts.length ? conflicts.map((item) => `- ${item.path || ""}${item.reason ? `：${item.reason}` : ""}`).join("\n") : "",
    "",
    failedCommands.length ? "失败命令：" : "",
    failedCommands.length ? failedCommands.map((item) => `- $ ${item.command || ""}\n  exit ${item.exitCode ?? "?"} · ${item.outputSummary || "(无输出摘要)"}`).join("\n") : "",
    "",
    "写入后复查命令：",
    commands.length ? commands.map((item) => `- ${item.command}${item.reason ? `：${item.reason}` : ""}`).join("\n") : "- 无",
    "",
    nextActions.length ? "下一步：" : "",
    nextActions.length ? nextActions.map((item) => `- ${item}`).join("\n") : "",
    "",
    "要求：优先运行或复用写入后复查命令；如果失败，请基于失败输出和已写入文件生成最小修复 diff，并保持审批后再写入。"
  ].filter((line) => line !== "").join("\n");
}

function appendApplyVerificationRecovery(result = {}) {
  const recovery = result?.recovery || null;
  if (!recovery || typeof recovery !== "object") return "";
  const commands = normalizeCommandItems(recovery.verificationCommands || []);
  const context = buildApplyVerificationRecoveryContext(result);
  appendToolCall({
    title: "写入后验证恢复",
    label: "verify",
    state: recovery.status || result.status || "ready",
    body: JSON.stringify({
      status: recovery.status || result.status || "",
      checkpointId: recovery.checkpointId || "",
      changedFiles: recovery.changedFiles || [],
      verification: recovery.verification || null,
      failedCommands: recovery.failedCommands || [],
      nextActions: recovery.nextActions || [],
      verificationCommands: commands
    }, null, 2).slice(0, 12000)
  });
  const actions = document.createElement("div");
  actions.className = "debug-last-failed-actions";
  actions.innerHTML = `<button type="button" data-action="prompt">加入提示词</button><button type="button" data-action="stage" ${commands.length ? "" : "disabled"}>复查命令</button><button type="button" data-action="run" ${commands.length ? "" : "disabled"}>运行复查</button><button type="button" data-action="repair">诊断修复</button>`;
  actions.querySelector("[data-action='prompt']").addEventListener("click", () => {
    const current = input.value.trim();
    input.value = [current, context].filter(Boolean).join("\n\n---\n\n");
    input.focus();
    scheduleReferencePreview({ immediate: true });
    appendToolCall({
      title: "写入后验证恢复证据已加入提示词",
      label: "verify",
      state: "ready",
      body: context.slice(0, 12000)
    });
    showToast("写入后验证恢复证据已加入提示词。");
  });
  actions.querySelector("[data-action='stage']").addEventListener("click", () => {
    stageRepairVerificationCommands(commands, {
      title: "写入后复查命令",
      successTitle: "写入后复查命令已放入命令面板",
      source: "apply-verification-recovery",
      note: "这次写入没有生成可复用的复查命令。"
    });
  });
  actions.querySelector("[data-action='run']").addEventListener("click", async () => {
    if (!commands.length) {
      showToast("这次写入没有可运行的复查命令。");
      return;
    }
    if (state.busy) {
      showToast("代理正在运行，请稍后再运行写入后复查。");
      return;
    }
    renderCommands(commands);
    setBusy(true, "运行写入后复查");
    const ok = await runCommandBatch(commands, {
      title: "写入后复查命令",
      stopOnFailure: true
    });
    setBusy(false, ok ? "写入后复查通过" : "写入后复查失败");
  });
  actions.querySelector("[data-action='repair']").addEventListener("click", () => {
    if (state.busy) {
      showToast("代理正在运行，请稍后再启动写入后验证修复。");
      return;
    }
    const prompt = [
      context,
      "",
      "请现在直接基于这次写入后验证恢复证据继续修复当前项目：先判断应复查、处理冲突、审查修复 diff，还是生成新的最小修复 diff。"
    ].join("\n");
    input.value = prompt;
    scheduleReferencePreview({ immediate: true });
    appendToolCall({
      title: "已启动写入后验证恢复修复",
      label: "verify",
      state: "running",
      body: prompt.slice(0, 12000)
    });
    showToast("正在基于写入后验证恢复证据启动修复。");
    submitPromptForm();
  });
  log.lastElementChild?.appendChild(actions);
  return context;
}

function buildWorkspaceSafetyFailureContext(error, {
  action = "workspace",
  workspace = workspaceInput?.value.trim() || "",
  checkpointId = "",
  currentWorkspace = workspaceStatus?.textContent || "",
  checkpoints = state.checkpoints || [],
  pendingDiff = state.pendingDiff || "",
  pendingPatches = state.pendingPatches || [],
  lastPrompt = state.lastPrompt || ""
} = {}) {
  const message = error?.message || String(error || "unknown error");
  return [
    "请基于这次工作区安全操作失败证据继续修复当前项目。",
    "",
    `动作：${action}`,
    `错误信息：${message}`,
    currentWorkspace ? `当前工作区：${currentWorkspace}` : "",
    workspace ? `目标工作区：${workspace}` : "",
    checkpointId ? `checkpoint：${checkpointId}` : "",
    `可用 checkpoint 数：${checkpoints.length}`,
    `待审批 diff 字节数：${String(pendingDiff || "").length}`,
    `待审批文件数：${pendingPatches.length}`,
    "",
    "上一轮需求：",
    String(lastPrompt || "").slice(0, 6000),
    "",
    "待审批文件：",
    pendingPatches.length ? pendingPatches.map((patch) => `- ${patch.path || ""}`).join("\n") : "- 无",
    "",
    "要求：先判断失败是路径不存在、权限不足、checkpoint 不属于当前工作区、回滚文件写入失败，还是 UI 状态恢复问题；需要改代码时输出最小 diff；不要绕过工作区和 checkpoint 安全校验。"
  ].filter(Boolean).join("\n");
}

function workspaceSafetyVerificationCommands(options = {}, {
  source = "workspace-safety"
} = {}) {
  const action = String(options.action || "workspace");
  const commands = [
    { command: "node --check app.js", reason: "复查工作区安全失败证据卡、checkpoint 入口和命令面板前端语法。", source },
    { command: "node --check server.js", reason: "复查工作区切换、checkpoint 回滚和安全校验后端语法。", source },
    { command: "node server.js --ui-smoke-test", reason: "复查工作区安全失败卡、排队验证和诊断修复入口。", source },
    { command: "node server.js --api-smoke-section=apply", reason: "复查审批写入、冲突预检、部分应用和 checkpoint 写入链路。", source },
    { command: "node server.js --api-smoke-section=debug", reason: "复查工作区安全失败后进入调试恢复链路。", source }
  ];
  if (/rollback|checkpoint|回滚/i.test(action) || options.checkpointId) {
    commands.push({ command: "node server.js --api-smoke-section=fast", reason: "checkpoint 或回滚失败后复查核心、写入、上下文和门禁组合链路。", source });
  }
  return normalizeCommandItems(commands).slice(0, 12);
}

function stageWorkspaceSafetyVerificationCommands(options = {}) {
  const commands = workspaceSafetyVerificationCommands(options);
  return stageRepairVerificationCommands(commands, {
    title: "工作区安全验证命令",
    successTitle: "工作区安全验证命令已放入面板",
    source: "workspace-safety",
    note: "工作区安全失败会先复查语法、UI smoke、apply smoke 和 debug smoke。"
  });
}

function appendWorkspaceSafetyFailureEvidence(error, options = {}) {
  const context = buildWorkspaceSafetyFailureContext(error, options);
  appendToolCall({
    title: options.title || "工作区安全操作失败证据",
    label: options.label || "safe",
    state: "失败",
    body: context.slice(0, 12000)
  });
  const actions = document.createElement("div");
  actions.className = "debug-last-failed-actions";
  actions.innerHTML = `<button type="button" data-action="prompt">加入提示词</button><button type="button" data-action="stage-verification">排队验证</button><button type="button" data-action="repair">诊断修复</button>`;
  actions.querySelector("[data-action='prompt']").addEventListener("click", () => {
    const current = input.value.trim();
    input.value = [current, context].filter(Boolean).join("\n\n---\n\n");
    input.focus();
    scheduleReferencePreview({ immediate: true });
    appendToolCall({
      title: "工作区安全失败证据已加入提示词",
      label: options.label || "safe",
      state: "ready",
      body: context.slice(0, 12000)
    });
    showToast("工作区安全失败证据已加入提示词。");
  });
  actions.querySelector("[data-action='stage-verification']").addEventListener("click", () => {
    stageWorkspaceSafetyVerificationCommands(options);
  });
  actions.querySelector("[data-action='repair']").addEventListener("click", () => {
    if (state.busy) {
      showToast("代理正在运行，请稍后再启动安全诊断修复。");
      return;
    }
    const prompt = [
      context,
      "",
      "请现在直接基于这次安全操作失败证据继续修复：优先补齐工作区切换、checkpoint 回滚、状态恢复或错误提示链路，并给出安全验证命令。"
    ].join("\n");
    input.value = prompt;
    scheduleReferencePreview({ immediate: true });
    appendToolCall({
      title: "已启动工作区安全失败诊断修复",
      label: options.label || "safe",
      state: "running",
      body: prompt.slice(0, 12000)
    });
    showToast("正在基于工作区安全失败证据启动修复。");
    submitPromptForm();
  });
  log.lastElementChild?.appendChild(actions);
  return context;
}

async function createConflictResolutionDraftFromPanel() {
  const conflicts = state.conflictPreview?.conflictPreviews || [];
  if (!state.pendingDiff || !conflicts.length || !conflictResolutionPanel) {
    showToast("当前没有可解决的冲突。");
    return;
  }
  const resolutions = collectConflictResolutionsFromPanel();
  if (!resolutions.length) {
    showToast("请先填写 resolved 内容。");
    return;
  }
  setBusy(true, "生成冲突解决草稿");
  try {
    const result = await api("/api/conflict-resolution-draft", {
      method: "POST",
      body: JSON.stringify({
        diff: state.pendingDiff,
        prompt: state.lastPrompt,
        resolutions
      })
    });
    state.pendingDiff = result.proposal?.diff || "";
    renderPlan(result.proposal?.plan || []);
    renderDiff(result.proposal?.patches || []);
    renderReview(result.proposal?.review || []);
    renderCommands(result.proposal?.commands || []);
    appendToolCall({
      title: "已生成冲突解决草稿",
      label: "merge",
      state: "待审批",
      body: JSON.stringify({
        summary: result.summary,
        proposal: {
          id: result.proposal?.id,
          type: result.proposal?.type,
          files: result.proposal?.patches?.map((item) => item.path) || []
        },
        policy: result.policy
      }, null, 2)
    });
    appendMessage("agent", "冲突解决草稿已放入 Diff 预览，复核后可批准写入。");
    await refreshHealth();
    setBusy(false, "待解决审批");
  } catch (error) {
    showToast(error.message);
    appendActionFailureEvidence({
      kind: "merge",
      action: "conflict-resolution-draft",
      targetName: "conflict-resolution-draft",
      endpoint: "/api/conflict-resolution-draft",
      request: {
        prompt: state.lastPrompt,
        resolutions: resolutions.map((item) => ({
          path: item.path,
          conflictIndex: item.conflictIndex,
          resolvedBytes: String(item.resolved || "").length
        }))
      },
      item: {
        conflictCount: conflicts.length,
        resolutionCount: resolutions.length,
        conflictPreview: state.conflictPreview
      },
      error
    }, {
      title: "生成冲突解决草稿失败",
      label: "merge",
      retry: createConflictResolutionDraftFromPanel,
      safe: () => appendConflictResolutionToPrompt()
    });
    setBusy(false, "冲突解决失败");
  }
}

function renderCommands(commands = []) {
  const commandItems = normalizeCommandItems(commands);
  state.pendingCommands = commandItems;
  checksList.innerHTML = "";
  if (!commandItems.length) {
    checksList.innerHTML = `
      <div class="check-row queued">
        <span></span>
        DeepSeek 未建议运行命令
      </div>
    `;
    return;
  }
  const toolbar = renderCommandToolbar(commandItems, { title: "建议命令" });
  if (toolbar) checksList.appendChild(toolbar);
  commandItems.forEach((command) => {
    const commandText = command.command;
    const commandKey = commandResultKey(commandText);
    const row = document.createElement("div");
    row.className = "check-row queued command-row";
    row.dataset.commandKey = commandKey;
    row.innerHTML = `<span></span><code></code><small></small><button type="button" data-action="copy-command">复制</button><button type="button" data-action="detail" hidden>详情</button><button type="button" data-action="copy-output" hidden>复制输出</button><button type="button" data-action="prompt-command" hidden>加入提示词</button><button type="button" data-action="reference-command-files" hidden>引用文件</button><button type="button" data-action="source-context" hidden>源码定位</button><button type="button" data-action="source-context-prompt" hidden>源码提示</button><button type="button" data-action="source-context-fix" hidden>源码修复</button><button type="button" data-action="run">运行</button>`;
    row.querySelector("code").textContent = commandText;
    const policy = command.policy;
    row.dataset.meta = [
      command.reason || "",
      policy ? `policy: ${policy.risk} · ${policy.reason}` : ""
    ].filter(Boolean).join(" · ");
    renderCommandRowStatus(row, commandText, state.commandResults[commandKey] || null);
    row.querySelector("[data-action='copy-command']").addEventListener("click", async () => {
      const copied = await copyText(commandText);
      appendToolCall({
        title: copied ? `已复制命令：${commandText}` : `复制命令失败：${commandText}`,
        label: "$",
        state: copied ? "完成" : "失败",
        body: copyLogBody(copied, commandText)
      });
      showToast(copied ? "命令已复制。" : copyFailureSummary());
    });
    row.querySelector("[data-action='run']").addEventListener("click", async () => {
      await runSuggestedCommand(commandText, { single: true });
    });
    checksList.appendChild(row);
  });
}

function stageRepairVerificationCommands(commands = [], { title = "修复验证命令", successTitle = "", source = "repair", note = "" } = {}) {
  const items = normalizeCommandItems(commands);
  if (!items.length) {
    appendToolCall({
      title: `${title}未生成`,
      label: "$",
      state: "跳过",
      body: note || "修复候选没有提供下一步验证命令。"
    });
    return [];
  }
  renderCommands(items);
  items.forEach((item) => {
    rememberCommand(item.command, {
      reason: item.reason || title,
      source
    });
  });
  appendToolCall({
    title: successTitle || `${title}已放入命令面板`,
    label: "$",
    state: `${items.length} 条`,
    body: items.map((item) => `$ ${item.command}${item.reason ? `\n  ${item.reason}` : ""}`).join("\n")
  });
  showToast(`${items.length} 条${title}已放入命令面板。`);
  return items;
}

function renderReview(review = []) {
  reviewList.innerHTML = "";
  if (!review.length) {
    reviewList.innerHTML = `<div class="empty-state">暂无审查发现。</div>`;
    return;
  }
  review.forEach((item) => {
    const row = document.createElement("div");
    row.className = `review-row ${item.severity || "info"}`;
    row.innerHTML = `<strong></strong><p></p><small></small><div class="review-actions"><button type="button" data-review-action="draft-fix">生成修复提示</button><button type="button" data-review-action="run-fix">直接修复</button></div>`;
    row.querySelector("strong").textContent = item.severity || "info";
    row.querySelector("p").textContent = item.message || "";
    row.querySelector("small").textContent = [item.file, item.line].filter(Boolean).join(":");
    row.querySelector("[data-review-action='draft-fix']").addEventListener("click", () => {
      const prompt = buildReviewFixPrompt(item);
      input.value = prompt;
      input.focus();
      scheduleReferencePreview({ immediate: true });
      appendToolCall({
        title: "已生成审查修复提示",
        label: "review",
        state: "ready",
        body: prompt
      });
      showToast("审查修复提示已填入输入框。");
    });
    row.querySelector("[data-review-action='run-fix']").addEventListener("click", () => {
      if (state.busy) {
        showToast("代理正在运行，请稍后再发起修复。");
        return;
      }
      const prompt = buildReviewFixPrompt(item);
      input.value = prompt;
      scheduleReferencePreview({ immediate: true });
      appendToolCall({
        title: "已启动审查修复",
        label: "review",
        state: "running",
        body: prompt
      });
      showToast("正在启动审查修复代理。");
      submitPromptForm();
    });
    reviewList.appendChild(row);
  });
}

function reviewArtifactFiles(artifact = {}) {
  const files = [
    ...(artifact.changedFiles || []),
    ...(artifact.git?.changedFiles || []),
    ...(artifact.patches || []).map((patch) => patch.path),
    ...(artifact.review || []).map((item) => item.file)
  ];
  return [...new Set(files.map((file) => String(file || "").trim()).filter(Boolean))].slice(0, 16);
}

function buildReviewArtifactPromptContext(artifact = {}) {
  if (!artifact?.id) return "";
  const files = reviewArtifactFiles(artifact);
  const findings = (artifact.review || [])
    .slice(0, 12)
    .map((item, index) => {
      const location = [item.file, item.line].filter(Boolean).join(":");
      return `${index + 1}. [${item.severity || "info"}] ${location ? `${location} ` : ""}${item.message || ""}`;
    })
    .join("\n");
  const commands = normalizeCommandItems(artifact.commands || [])
    .slice(0, 10)
    .map((item) => `- $ ${item.command}${item.reason ? `\n  ${item.reason}` : ""}`)
    .join("\n");
  return [
    "请基于这条历史审查证据继续修复当前项目。",
    "",
    `审查 ID：${artifact.id}`,
    artifact.prompt ? `原始需求：${artifact.prompt}` : "",
    artifact.reply ? `审查摘要：${artifact.reply}` : artifact.summary ? `审查摘要：${artifact.summary}` : "",
    files.length ? `优先读取相关文件：\n${files.map((file) => `@${file}`).join("\n")}` : "",
    findings ? `审查发现：\n${findings}` : "",
    commands ? `建议验证命令：\n${commands}` : "",
    artifact.git?.status?.length ? `Git 状态：${artifact.git.status.length} 个改动` : "",
    "",
    "要求：先读取相关文件；逐条处理审查发现；生成最小 diff；给出下一轮安全验证命令。"
  ].filter(Boolean).join("\n");
}

function appendReviewArtifactContextToPrompt(artifact = {}) {
  const context = buildReviewArtifactPromptContext(artifact);
  if (!context) {
    showToast("暂无可加入提示词的审查证据。");
    return "";
  }
  const current = input.value.trim();
  input.value = [current, context].filter(Boolean).join("\n\n---\n\n");
  input.focus();
  scheduleReferencePreview({ immediate: true });
  appendToolCall({
    title: `审查证据已加入提示词：${artifact.id}`,
    label: "review",
    state: "ready",
    body: context.slice(0, 12000)
  });
  showToast("审查证据已加入提示词。");
  return context;
}

function runReviewArtifactRepair(artifact = {}) {
  if (state.busy) {
    showToast("代理正在运行，请稍后再启动审查修复。");
    return "";
  }
  const context = buildReviewArtifactPromptContext(artifact);
  if (!context) {
    showToast("暂无可用于修复的审查证据。");
    return "";
  }
  const prompt = [
    context,
    "",
    "请现在直接基于这条历史审查证据启动修复：优先处理高风险发现，输出最小 diff，并给出下一轮安全验证命令。"
  ].join("\n");
  input.value = prompt;
  scheduleReferencePreview({ immediate: true });
  appendToolCall({
    title: `已启动历史审查修复：${artifact.id}`,
    label: "review",
    state: "running",
    body: prompt.slice(0, 12000)
  });
  showToast("正在基于历史审查证据启动修复。");
  submitPromptForm();
  return prompt;
}

function buildReviewArtifactVerificationPrompt(artifact = {}) {
  const context = buildReviewArtifactPromptContext(artifact);
  if (!context) return "";
  const browserTriageContext = formatBrowserTriageContinuation(artifact.browserTriage || artifact.diagnostics?.browserTriage || state.lastDebugDiagnostics?.browserTriage || null, { title: "审查关联浏览器异常分诊" });
  const commandLines = reviewArtifactVerificationCommands(artifact, { includeFallback: true })
    .map((item) => item.command)
    .filter(Boolean)
    .slice(0, 8);
  return [
    context,
    "",
    "目标：把这条审查证据转成可验证修复闭环。",
    browserTriageContext ? `页面调试线索：\n${browserTriageContext}` : "",
    "",
    "建议验证命令：",
    ...commandLines.map((command) => `- ${command}`),
    "",
    "输出要求：",
    "1. 先按 severity 和真实风险排序审查发现。",
    "2. 如果需要改代码，请生成最小 diff，避免无关重构。",
    "3. 修复后必须说明每条审查发现的处理结果：已修复、误报或需要后续输入。",
    "4. 必须给出可在当前工作区安全运行的验证命令，并优先复用上面的命令。"
  ].filter(Boolean).join("\n");
}

function appendReviewArtifactVerificationPromptToPrompt(artifact = {}) {
  const prompt = buildReviewArtifactVerificationPrompt(artifact);
  if (!prompt) {
    showToast("暂无可生成验证提示的审查证据。");
    return "";
  }
  const current = input.value.trim();
  input.value = [current, prompt].filter(Boolean).join("\n\n---\n\n");
  input.focus();
  scheduleReferencePreview({ immediate: true });
  appendToolCall({
    title: `审查验证提示已加入提示词：${artifact.id || "review"}`,
    label: "review",
    state: "ready",
    body: prompt.slice(0, 12000)
  });
  showToast("审查验证提示已加入提示词。");
  return prompt;
}

function runReviewArtifactVerificationFix(artifact = {}) {
  if (state.busy) {
    showToast("代理正在运行，请稍后再启动审查验证修复。");
    return "";
  }
  const prompt = buildReviewArtifactVerificationPrompt(artifact);
  if (!prompt) {
    showToast("暂无可运行的审查验证修复提示。");
    return "";
  }
  input.value = prompt;
  scheduleReferencePreview({ immediate: true });
  appendToolCall({
    title: `已启动审查验证修复：${artifact.id || "review"}`,
    label: "review",
    state: "running",
    body: prompt.slice(0, 12000)
  });
  showToast("正在启动带验证要求的审查修复。");
  submitPromptForm();
  return prompt;
}

function reviewArtifactVerificationCommands(artifact = {}, {
  source = "review-artifact",
  includeFallback = false
} = {}) {
  const commands = normalizeCommandItems(artifact.commands || [])
    .map((item) => ({ ...item, source: item.source || source }));
  if (includeFallback) {
    commands.push(
      { command: "node --check app.js", reason: "复查审查工作台前端语法。", source },
      { command: "node --check server.js", reason: "复查审查 API、artifact 和评论草稿入口语法。", source },
      { command: "node server.js --ui-smoke-test", reason: "复查审查记录、PR 评论草稿和命令面板入口。", source },
      { command: "node server.js --api-smoke-section=coding", reason: "复查写代码、diff、审查和修复主链路。", source },
      { command: "node server.js --api-smoke-section=debug", reason: "复查审查失败后进入调试恢复链路。", source }
    );
  }
  return normalizeCommandItems(commands).slice(0, 12);
}

function stageReviewArtifactVerificationCommands(artifact = {}, {
  title = "审查证据",
  source = "review-artifact",
  includeFallback = true,
  note = ""
} = {}) {
  const commands = reviewArtifactVerificationCommands(artifact, { source, includeFallback });
  return stageRepairVerificationCommands(commands, {
    title: `${title}验证命令`,
    successTitle: title === "审查证据" ? "审查验证命令已放入面板" : `${title}验证命令已放入面板`,
    source,
    note: note || "审查证据会先复查语法、UI smoke、coding smoke 和 debug smoke。"
  });
}

function appendReviewArtifactFailureEvidence(artifact = {}, error, {
  title = "历史审查动作失败",
  action = "review-artifact-action",
  endpoint = "/api/review-artifact",
  request = null,
  retry = null,
  safe = null
} = {}) {
  stageReviewArtifactVerificationCommands(artifact, {
    title: "审查失败证据",
    source: action,
    includeFallback: true,
    note: "审查动作失败后自动排入语法、UI、coding 和 debug 复查命令，避免审查修复链路中断。"
  });
  return appendActionFailureEvidence({
    kind: "review",
    action,
    targetName: artifact.id || artifact.summary || "review-artifact",
    endpoint,
    request: request || { id: artifact.id || "" },
    item: {
      id: artifact.id || "",
      summary: artifact.summary || artifact.prompt || "",
      findingCount: artifact.findingCount || 0,
      commandCount: artifact.commandCount || 0,
      createdAt: artifact.createdAt || ""
    },
    error
  }, { title, label: "review", retry, safe });
}

function buildReviewCommentsContext(draft = {}) {
  if (!draft?.id && !draft?.comments?.length && !draft?.body) return "";
  const ready = (draft.comments || []).filter((item) => item.ready);
  const needsMapping = (draft.comments || []).filter((item) => !item.ready);
  const readyLines = ready
    .slice(0, 12)
    .map((item, index) => `${index + 1}. [${item.severity || "info"}] ${item.path}:${item.line} ${item.body || ""}`)
    .join("\n");
  const mappingLines = needsMapping
    .slice(0, 8)
    .map((item, index) => `${index + 1}. [${item.severity || "info"}] ${item.path || "(missing file)"}:${item.sourceLine || "(missing line)"} ${item.body || ""}`)
    .join("\n");
  return [
    "请基于这份 PR 评论草稿继续修复当前项目。",
    "",
    `审查 ID：${draft.id || draft.artifact?.id || ""}`,
    draft.status ? `草稿状态：${draft.status}` : "",
    draft.summary ? `摘要：${JSON.stringify(draft.summary)}` : "",
    draft.artifact?.prompt ? `原始需求：${draft.artifact.prompt}` : "",
    draft.artifact?.summary ? `审查摘要：${draft.artifact.summary}` : "",
    "",
    readyLines ? `可映射行级评论：\n${readyLines}` : "可映射行级评论：(无)",
    mappingLines ? `需要补映射的评论：\n${mappingLines}` : "",
    "",
    draft.body ? `评论草稿正文：\n${String(draft.body).slice(0, 8000)}` : "",
    "",
    "要求：先读取涉及文件；优先修复 ready comments 对应的真实问题；对 needs_mapping 项补充文件/行号或说明无法映射原因；生成最小 diff，并给出安全验证命令。"
  ].filter(Boolean).join("\n");
}

function appendReviewCommentsToPrompt(draft = {}) {
  const context = buildReviewCommentsContext(draft);
  if (!context) {
    showToast("暂无可加入提示词的 PR 评论草稿。");
    return "";
  }
  const current = input.value.trim();
  input.value = [current, context].filter(Boolean).join("\n\n---\n\n");
  input.focus();
  scheduleReferencePreview({ immediate: true });
  appendToolCall({
    title: `PR 评论草稿已加入提示词：${draft.id || draft.artifact?.id || "review"}`,
    label: "review",
    state: draft.status || "drafted",
    body: context.slice(0, 12000)
  });
  showToast("PR 评论草稿已加入提示词。");
  return context;
}

function runReviewCommentsRepair(draft = {}) {
  if (state.busy) {
    showToast("代理正在运行，请稍后再按评论修复。");
    return "";
  }
  const context = buildReviewCommentsContext(draft);
  if (!context) {
    showToast("暂无可用于修复的 PR 评论草稿。");
    return "";
  }
  const prompt = [
    context,
    "",
    "请现在直接按这份 PR 评论草稿修复：优先处理 error/warning，补齐无法映射的评论线索，输出最小可审批 diff 和验证命令。"
  ].join("\n");
  input.value = prompt;
  scheduleReferencePreview({ immediate: true });
  appendToolCall({
    title: `已启动 PR 评论修复：${draft.id || draft.artifact?.id || "review"}`,
    label: "review",
    state: "running",
    body: prompt.slice(0, 12000)
  });
  showToast("正在基于 PR 评论草稿启动修复。");
  submitPromptForm();
  return prompt;
}

function buildReviewCommentsVerificationPrompt(draft = {}) {
  const context = buildReviewCommentsContext(draft);
  if (!context) return "";
  const browserTriageContext = formatBrowserTriageContinuation(draft.browserTriage || draft.artifact?.browserTriage || draft.artifact?.diagnostics?.browserTriage || state.lastDebugDiagnostics?.browserTriage || null, { title: "PR 评论关联浏览器异常分诊" });
  const commandLines = reviewCommentsVerificationCommands(draft, { includeFallback: true })
    .map((item) => item.command)
    .filter(Boolean)
    .slice(0, 8);
  return [
    context,
    "",
    "目标：把这份 PR 评论草稿转成可验证修复闭环。",
    browserTriageContext ? `页面调试线索：\n${browserTriageContext}` : "",
    "",
    "建议验证命令：",
    ...commandLines.map((command) => `- ${command}`),
    "",
    "输出要求：",
    "1. 先处理 ready comments 中已能定位到文件和行号的问题。",
    "2. 对 needs_mapping 评论补充文件/行号线索，或说明无法映射原因。",
    "3. 如果需要改代码，请生成最小 diff，避免无关重构。",
    "4. 修复后必须给出安全验证命令，并说明哪些评论已经闭环。"
  ].filter(Boolean).join("\n");
}

function appendReviewCommentsVerificationPromptToPrompt(draft = {}) {
  const prompt = buildReviewCommentsVerificationPrompt(draft);
  if (!prompt) {
    showToast("暂无可生成验证提示的 PR 评论草稿。");
    return "";
  }
  const current = input.value.trim();
  input.value = [current, prompt].filter(Boolean).join("\n\n---\n\n");
  input.focus();
  scheduleReferencePreview({ immediate: true });
  appendToolCall({
    title: `PR 评论验证提示已加入提示词：${draft.id || draft.artifact?.id || "review"}`,
    label: "review",
    state: "ready",
    body: prompt.slice(0, 12000)
  });
  showToast("PR 评论验证提示已加入提示词。");
  return prompt;
}

function runReviewCommentsVerificationFix(draft = {}) {
  if (state.busy) {
    showToast("代理正在运行，请稍后再启动 PR 评论验证修复。");
    return "";
  }
  const prompt = buildReviewCommentsVerificationPrompt(draft);
  if (!prompt) {
    showToast("暂无可运行的 PR 评论验证修复提示。");
    return "";
  }
  input.value = prompt;
  scheduleReferencePreview({ immediate: true });
  appendToolCall({
    title: `已启动 PR 评论验证修复：${draft.id || draft.artifact?.id || "review"}`,
    label: "review",
    state: "running",
    body: prompt.slice(0, 12000)
  });
  showToast("正在启动带验证要求的 PR 评论修复。");
  submitPromptForm();
  return prompt;
}

function reviewCommentsVerificationCommands(draft = {}, {
  source = "review-comments",
  includeFallback = false
} = {}) {
  const artifactCommands = draft.artifact?.commands || [];
  const draftCommands = draft.commands || [];
  const commands = normalizeCommandItems([...artifactCommands, ...draftCommands])
    .map((item) => ({ ...item, source: item.source || source }));
  if (includeFallback) {
    commands.push(
      { command: "node --check app.js", reason: "复查 PR 评论草稿前端动作和提示组装语法。", source },
      { command: "node --check server.js", reason: "复查 PR 评论草稿 API 和审查 artifact 读取语法。", source },
      { command: "node server.js --ui-smoke-test", reason: "复查 PR 评论草稿按钮、验证排队和修复入口。", source },
      { command: "node server.js --api-smoke-section=coding", reason: "复查代码修改、审查和评论草稿链路。", source },
      { command: "node server.js --api-smoke-section=debug", reason: "复查评论草稿问题进入调试恢复链路。", source }
    );
  }
  return normalizeCommandItems(commands).slice(0, 12);
}

function stageReviewCommentsVerificationCommands(draft = {}, {
  title = "PR 评论",
  source = "review-comments",
  includeFallback = true,
  note = ""
} = {}) {
  const commands = reviewCommentsVerificationCommands(draft, { source, includeFallback });
  return stageRepairVerificationCommands(commands, {
    title: `${title}验证命令`,
    successTitle: title === "PR 评论" ? "PR 评论验证命令已放入面板" : `${title}验证命令已放入面板`,
    source,
    note: note || "PR 评论草稿会先复查语法、UI smoke、coding smoke 和 debug smoke。"
  });
}

function appendReviewCommentsCard(draft = {}) {
  appendToolCall({
    title: `PR 评论草稿：${draft.id || draft.artifact?.id || "review"}`,
    label: "review",
    state: draft.status || "drafted",
    body: JSON.stringify(draft, null, 2).slice(0, 12000)
  });
  const article = log.lastElementChild;
  if (!article) return;
  const actions = document.createElement("div");
  actions.className = "debug-last-failed-actions";
  actions.innerHTML = `<button type="button" data-action="prompt">加入提示词</button><button type="button" data-action="stage-verification">排队验证</button><button type="button" data-action="verification-prompt">验证提示</button><button type="button" data-action="verification-fix">验证修复</button><button type="button" data-action="repair">按评论修复</button>`;
  actions.querySelector("[data-action='prompt']").addEventListener("click", () => {
    appendReviewCommentsToPrompt(draft);
  });
  actions.querySelector("[data-action='stage-verification']").addEventListener("click", () => {
    stageReviewCommentsVerificationCommands(draft);
  });
  actions.querySelector("[data-action='verification-prompt']").addEventListener("click", () => {
    appendReviewCommentsVerificationPromptToPrompt(draft);
  });
  actions.querySelector("[data-action='verification-fix']").addEventListener("click", () => {
    runReviewCommentsVerificationFix(draft);
  });
  actions.querySelector("[data-action='repair']").addEventListener("click", () => {
    runReviewCommentsRepair(draft);
  });
  article.appendChild(actions);
}

function renderReviewArtifacts(reviews = []) {
  if (!reviewArtifactList) return;
  reviewArtifactList.innerHTML = "";
  if (!reviews.length) {
    reviewArtifactList.innerHTML = `<div class="empty-state">暂无历史审查记录。</div>`;
    return;
  }
  reviews.slice(0, 6).forEach((artifact) => {
    const row = document.createElement("div");
    row.className = `queue-row ${artifact.findingCount ? "active" : "done"}`;
    row.innerHTML = `<strong></strong><small></small><span class="queue-row-actions"><button type="button" data-action="view">查看</button><button type="button" data-action="prompt">加入提示词</button><button type="button" data-action="stage-verification">排队验证</button><button type="button" data-action="verification-prompt">验证提示</button><button type="button" data-action="verification-fix">验证修复</button><button type="button" data-action="run-fix">直接修复</button><button type="button" data-action="comments">评论草稿</button></span>`;
    row.querySelector("strong").textContent = artifact.summary || artifact.prompt || artifact.id;
    row.querySelector("small").textContent = `${artifact.findingCount || 0} 条发现 · ${artifact.commandCount || 0} 条命令 · ${artifact.createdAt?.slice(0, 19) || ""}`;
    const getDetail = async () => await api(`/api/review-artifact?id=${encodeURIComponent(artifact.id)}`);
    row.querySelector("[data-action='view']").addEventListener("click", async () => {
      const viewReviewArtifact = async () => {
        const detail = await getDetail();
        appendToolCall({
          title: `审查记录：${artifact.id}`,
          label: "review",
          state: "完成",
          body: JSON.stringify(detail, null, 2).slice(0, 12000)
        });
      };
      try {
        await viewReviewArtifact();
      } catch (error) {
        showToast(error.message);
        appendReviewArtifactFailureEvidence(artifact, error, {
          title: `查看审查记录失败：${artifact.id}`,
          action: "review-artifact-view",
          retry: viewReviewArtifact,
          safe: () => appendReviewArtifactContextToPrompt(artifact)
        });
      }
    });
    row.querySelector("[data-action='prompt']").addEventListener("click", async () => {
      const promptReviewArtifact = async () => appendReviewArtifactContextToPrompt(await getDetail());
      try {
        await promptReviewArtifact();
      } catch (error) {
        showToast(error.message);
        appendReviewArtifactFailureEvidence(artifact, error, {
          title: `审查证据加入提示词失败：${artifact.id}`,
          action: "review-artifact-prompt",
          retry: promptReviewArtifact,
          safe: () => appendReviewArtifactContextToPrompt(artifact)
        });
      }
    });
    row.querySelector("[data-action='stage-verification']").addEventListener("click", async () => {
      const stageReviewArtifactVerification = async () => stageReviewArtifactVerificationCommands(await getDetail());
      try {
        await stageReviewArtifactVerification();
      } catch (error) {
        showToast(error.message);
        appendReviewArtifactFailureEvidence(artifact, error, {
          title: `审查验证命令排队失败：${artifact.id}`,
          action: "review-artifact-stage-verification",
          retry: stageReviewArtifactVerification,
          safe: () => stageReviewArtifactVerificationCommands(artifact)
        });
      }
    });
    row.querySelector("[data-action='verification-prompt']").addEventListener("click", async () => {
      const promptReviewArtifactVerification = async () => appendReviewArtifactVerificationPromptToPrompt(await getDetail());
      try {
        await promptReviewArtifactVerification();
      } catch (error) {
        showToast(error.message);
        appendReviewArtifactFailureEvidence(artifact, error, {
          title: `审查验证提示生成失败：${artifact.id}`,
          action: "review-artifact-verification-prompt",
          retry: promptReviewArtifactVerification,
          safe: () => appendReviewArtifactContextToPrompt(artifact)
        });
      }
    });
    row.querySelector("[data-action='verification-fix']").addEventListener("click", async () => {
      const repairReviewArtifactVerification = async () => runReviewArtifactVerificationFix(await getDetail());
      try {
        await repairReviewArtifactVerification();
      } catch (error) {
        showToast(error.message);
        appendReviewArtifactFailureEvidence(artifact, error, {
          title: `审查验证修复启动失败：${artifact.id}`,
          action: "review-artifact-verification-fix",
          retry: repairReviewArtifactVerification,
          safe: () => appendReviewArtifactContextToPrompt(artifact)
        });
      }
    });
    row.querySelector("[data-action='run-fix']").addEventListener("click", async () => {
      const repairReviewArtifact = async () => runReviewArtifactRepair(await getDetail());
      try {
        await repairReviewArtifact();
      } catch (error) {
        showToast(error.message);
        appendReviewArtifactFailureEvidence(artifact, error, {
          title: `历史审查直接修复失败：${artifact.id}`,
          action: "review-artifact-run-fix",
          retry: repairReviewArtifact,
          safe: () => appendReviewArtifactContextToPrompt(artifact)
        });
      }
    });
    row.querySelector("[data-action='comments']").addEventListener("click", async () => {
      const draftReviewComments = async () => {
        const draft = await api("/api/review-comments", {
          method: "POST",
          body: JSON.stringify({ id: artifact.id })
        });
        appendReviewCommentsCard(draft);
      };
      try {
        await draftReviewComments();
      } catch (error) {
        showToast(error.message);
        appendReviewArtifactFailureEvidence(artifact, error, {
          title: `生成 PR 评论草稿失败：${artifact.id}`,
          action: "review-comments-draft",
          endpoint: "/api/review-comments",
          request: { id: artifact.id || "" },
          retry: draftReviewComments,
          safe: () => appendReviewArtifactContextToPrompt(artifact)
        });
      }
    });
    reviewArtifactList.appendChild(row);
  });
}

function renderVerification(verification) {
  if (!verification?.checks?.length) {
    state.pendingCommands = [];
    checksList.innerHTML = `
      <div class="check-row queued">
        <span></span>
        未发现可自动运行的检查命令
      </div>
    `;
    return;
  }
  const commandItems = normalizeCommandItems(verification.checks.map((check) => ({
    command: check.command || "",
    reason: "自动检查结果",
    policy: check.policy || null
  })));
  state.pendingCommands = commandItems;
  checksList.innerHTML = "";
  const toolbar = renderCommandToolbar(commandItems, { title: "自动检查命令" });
  if (toolbar) checksList.appendChild(toolbar);
  verification.checks.forEach((check) => {
    const commandText = check.command || "";
    const commandKey = commandResultKey(commandText);
    if (commandText) {
      state.commandResults[commandKey] = { status: "done", result: check, error: "" };
    }
    const row = document.createElement("div");
    row.className = "check-row queued command-row";
    row.dataset.commandKey = commandKey;
    row.innerHTML = `<span></span><code></code><small></small><button type="button" data-action="copy-command">复制</button><button type="button" data-action="detail">详情</button><button type="button" data-action="copy-output">复制输出</button><button type="button" data-action="prompt-command">加入提示词</button><button type="button" data-action="reference-command-files">引用文件</button><button type="button" data-action="run">重跑</button>`;
    row.querySelector("code").textContent = commandText || "检查命令";
    row.dataset.meta = [
      "自动检查结果",
      check.policy ? `policy: ${check.policy.risk} · ${check.policy.reason || ""}` : ""
    ].filter(Boolean).join(" · ");
    renderCommandRowStatus(row, commandText, commandText ? state.commandResults[commandKey] : { status: "done", result: check, error: "" });
    row.querySelector("[data-action='copy-command']").addEventListener("click", async () => {
      if (!commandText) {
        showToast("这条检查没有可复制命令。");
        return;
      }
      const copied = await copyText(commandText);
      appendToolCall({
        title: copied ? `已复制检查命令：${commandText}` : `复制检查命令失败：${commandText}`,
        label: "$",
        state: copied ? "完成" : "失败",
        body: copyLogBody(copied, commandText)
      });
      showToast(copied ? "检查命令已复制。" : copyFailureSummary());
    });
    row.querySelector("[data-action='run']").addEventListener("click", async () => {
      if (!commandText) {
        showToast("这条检查没有可重跑命令。");
        return;
      }
      await runSuggestedCommand(commandText, { single: true });
    });
    checksList.appendChild(row);
  });
}

function renderVerificationPlan(plan, { logCommands = false } = {}) {
  const commandItems = normalizeCommandItems(plan?.commands || []);
  if (!plan?.gates?.length && !commandItems.length) {
    state.pendingCommands = [];
    checksList.innerHTML = `
      <div class="check-row queued">
        <span></span>
        未生成验证门禁计划
      </div>
    `;
    return;
  }
  checksList.innerHTML = "";
  state.pendingCommands = commandItems;
  if (commandItems.length) {
    const toolbar = renderCommandToolbar(commandItems, { title: "快捷检查命令" });
    if (toolbar) checksList.appendChild(toolbar);
    commandItems.forEach((command) => {
      const commandText = command.command;
      const commandKey = commandResultKey(commandText);
      const row = document.createElement("div");
      row.className = "check-row queued command-row";
      row.dataset.commandKey = commandKey;
      row.innerHTML = `<span></span><code></code><small></small><button type="button" data-action="copy-command">复制</button><button type="button" data-action="detail" hidden>详情</button><button type="button" data-action="copy-output" hidden>复制输出</button><button type="button" data-action="prompt-command" hidden>加入提示词</button><button type="button" data-action="reference-command-files" hidden>引用文件</button><button type="button" data-action="run">运行</button>`;
      row.querySelector("code").textContent = commandText;
      row.dataset.meta = [
        command.reason || "验证门禁建议",
        command.policy ? `policy: ${command.policy.risk} · ${command.policy.reason || ""}` : ""
      ].filter(Boolean).join(" · ");
      renderCommandRowStatus(row, commandText, state.commandResults[commandKey] || null);
      row.querySelector("[data-action='copy-command']").addEventListener("click", async () => {
        const copied = await copyText(commandText);
        appendToolCall({
          title: copied ? `已复制快捷检查命令：${commandText}` : `复制快捷检查命令失败：${commandText}`,
          label: "$",
          state: copied ? "完成" : "失败",
          body: copyLogBody(copied, commandText)
        });
        showToast(copied ? "快捷检查命令已复制。" : copyFailureSummary());
      });
      row.querySelector("[data-action='run']").addEventListener("click", async () => {
        await runSuggestedCommand(commandText, { single: true });
      });
      checksList.appendChild(row);
      if (logCommands) {
        rememberCommand(commandText, {
          reason: command.reason || "验证门禁建议",
          source: "verification-plan"
        });
      }
    });
    if (logCommands) {
      appendToolCall({
        title: "快捷检查命令已发现",
        label: "$",
        state: `${commandItems.length} 条`,
        body: commandItems.map((item) => `$ ${item.command}${item.reason ? `\n  ${item.reason}` : ""}`).join("\n")
      });
    }
  }
  (plan.gates || []).forEach((gate) => {
    const row = document.createElement("div");
    const ok = ["ready", "passing", "clean"].includes(gate.status);
    row.className = `check-row verification-gate-row ${ok ? "passed" : "failed"}`;
    row.innerHTML = `<span></span><code></code><small></small>`;
    row.querySelector("code").textContent = gate.label || gate.id;
    row.querySelector("small").textContent = `${gate.status || "unknown"} · ${gate.evidence?.length || 0} evidence`;
    checksList.appendChild(row);
  });
}

function renderGit(git) {
  if (!gitStatus) return;
  if (!git?.available) {
    gitStatus.textContent = "Git：未检测到仓库";
    if (worktreeBtn) worktreeBtn.disabled = true;
    return;
  }
  const dirty = git.status?.length ? `${git.status.length} 个改动` : "干净";
  gitStatus.textContent = `Git：${git.branch || "detached"} · ${dirty}`;
  if (worktreeBtn) worktreeBtn.disabled = state.busy || Boolean(git.status?.length);
}

function taskEvidenceFiles(task = {}) {
  const files = [
    ...(task.changedFiles || []),
    ...(task.repairContext?.repair?.files || []),
    ...(task.repairContext?.apply?.changedFiles || []),
    ...(task.conflicts || []).map((item) => item.path).filter(Boolean)
  ];
  return [...new Set(files.map((file) => String(file || "").trim()).filter(Boolean))].slice(0, 16);
}

function buildTaskPromptContext(task = {}) {
  if (!task?.id) return "";
  const files = taskEvidenceFiles(task);
  const recommendedCapability = recommendedCapabilityFromState();
  const recommendedCapabilityContext = recommendedCapability ? buildCapabilityGapContext(recommendedCapability) : "";
  const taskBrowserTriage = task.repairContext?.diagnostics?.browserTriage || task.diagnostics?.browserTriage || state.lastDebugDiagnostics?.browserTriage || null;
  const taskBrowserTriageContext = formatBrowserTriageContinuation(taskBrowserTriage, { title: "任务关联浏览器异常分诊" });
  const checks = (task.checks || [])
    .slice(0, 12)
    .map((check, index) => `${index + 1}. ${check.exitCode === 0 ? "PASS" : "FAIL"} $ ${check.command || ""}${check.reason ? `\n   ${check.reason}` : ""}${check.output ? `\n   输出：${summarizeCommandOutput(check.output)}` : ""}`)
    .join("\n");
  const selectedHunks = Array.isArray(task.selectedHunks) && task.selectedHunks.length
    ? task.selectedHunks
      .slice(0, 12)
      .map((item) => `- ${item.path || "unknown"}：${item.selectedHunks || 0}/${item.totalHunks || "?"} hunk`)
      .join("\n")
    : "";
  const failedCommands = (task.failedCommands || [])
    .filter(Boolean)
    .slice(0, 8)
    .map((command) => `- $ ${command}`)
    .join("\n");
  const verificationCommands = [
    ...(task.verificationCommands || []),
    ...(task.checks || []).map((check) => check.command)
  ]
    .filter(Boolean)
    .filter((command, index, list) => list.indexOf(command) === index)
    .slice(0, 8)
    .map((command) => `- ${command}`)
    .join("\n");
  const repair = task.repairContext ? [
    `修复链：${task.repairContext.status || "unknown"}`,
    task.repairContext.recommendedAction?.command ? `推荐动作：${task.repairContext.recommendedAction.label || task.repairContext.recommendedAction.id || "debug action"} · $ ${task.repairContext.recommendedAction.command}` : "",
    task.repairContext.commandRun?.status ? `命令运行：${task.repairContext.commandRun.status} · exit ${task.repairContext.commandRun.exitCode ?? "?"} · ${task.repairContext.commandRun.outputSummary || ""}` : "",
    task.repairContext.command ? `失败命令：$ ${task.repairContext.command}` : "",
    task.repairContext.failure?.outputSummary ? `失败摘要：${task.repairContext.failure.outputSummary}` : "",
    task.repairContext.diagnostics?.summary ? `诊断摘要：${JSON.stringify(task.repairContext.diagnostics.summary)}` : ""
  ].filter(Boolean).join("\n") : "";
  return [
    "请基于这条历史任务证据继续推进当前代码修改或调试。",
    "",
    `任务 ID：${task.id}`,
    `任务状态：${task.status || "unknown"}`,
    task.prompt ? `原始需求：${task.prompt}` : "",
    task.checkpointId ? `Checkpoint：${task.checkpointId}` : "",
    files.length ? `相关文件：\n${files.map((file) => `@${file}`).join("\n")}` : "",
    selectedHunks ? `部分应用 hunk：\n${selectedHunks}` : "",
    checks ? `检查记录：\n${checks}` : "",
    failedCommands ? `失败命令：\n${failedCommands}` : "",
    verificationCommands ? `可重跑验证命令：\n${verificationCommands}` : "",
    repair ? `修复证据：\n${repair}` : "",
    taskBrowserTriageContext ? `页面调试线索：\n${taskBrowserTriageContext}` : "",
    recommendedCapabilityContext ? `推荐能力缺口：\n${recommendedCapabilityContext}` : "",
    task.git?.status?.length ? `Git 状态：${task.git.status.length} 个改动` : "",
    "",
    "要求：先读取相关文件；保留已有正确改动；优先结合推荐能力缺口和任务检查记录继续；给出最小 diff 和可运行验证命令。"
  ].filter(Boolean).join("\n");
}

function appendTaskContextToPrompt(task = {}) {
  const context = buildTaskPromptContext(task);
  if (!context) {
    showToast("暂无可加入提示词的任务证据。");
    return "";
  }
  const current = input.value.trim();
  input.value = [current, context].filter(Boolean).join("\n\n---\n\n");
  input.focus();
  scheduleReferencePreview({ immediate: true });
  appendToolCall({
    title: `任务证据已加入提示词：${task.id}`,
    label: "log",
    state: "ready",
    body: context.slice(0, 12000)
  });
  showToast("任务证据已加入提示词。");
  return context;
}

function runTaskContinuation(task = {}) {
  if (state.busy) {
    showToast("代理正在运行，请稍后再继续历史任务。");
    return "";
  }
  const context = buildTaskPromptContext(task);
  if (!context) {
    showToast("暂无可用于继续的任务证据。");
    return "";
  }
  const prompt = [
    context,
    "",
    "请现在直接基于这条历史任务证据继续推进：先读取相关文件，保留已有正确改动，生成最小 diff，并给出下一轮安全验证命令。"
  ].join("\n");
  input.value = prompt;
  scheduleReferencePreview({ immediate: true });
  appendToolCall({
    title: `已启动任务证据继续：${task.id}`,
    label: "log",
    state: "running",
    body: prompt.slice(0, 12000)
  });
  showToast("正在基于历史任务证据继续。");
  submitPromptForm();
  return prompt;
}

function referenceTaskFilesInPrompt(task = {}) {
  const files = taskEvidenceFiles(task);
  if (!files.length) {
    showToast("这条任务没有可引用的变更文件。");
    return [];
  }
  const current = input.value.trim();
  const currentLower = current.toLowerCase();
  const refs = files
    .map((file) => `@${file}`)
    .filter((ref) => !currentLower.includes(ref.toLowerCase()));
  input.value = [current, refs.join(" ")].filter(Boolean).join(current ? "\n" : "");
  input.focus();
  scheduleReferencePreview({ immediate: true });
  appendToolCall({
    title: `已引用任务文件：${task.id}`,
    label: "ctx",
    state: `${files.length} files`,
    body: files.map((file) => `@${file}`).join("\n")
  });
  showToast(`已引用 ${files.length} 个任务相关文件。`);
  return files;
}

async function stageTaskVerificationCommands(task = {}) {
  if (state.busy) {
    showToast("代理正在运行，请稍后再生成任务验证命令。");
    return [];
  }
  const previousCommands = (task.checks || [])
    .map((check) => check.command)
    .filter(Boolean);
  const commands = [
    ...(task.verificationCommands || []),
    ...(task.failedCommands || []),
    ...previousCommands,
    ...state.pendingCommands.map((item) => item.command || item)
  ].filter((command, index, list) => command && list.indexOf(command) === index);
  setBusy(true, "生成任务验证命令");
  try {
    const result = await api("/api/verification-plan", {
      method: "POST",
      body: JSON.stringify({ limit: 12, commands })
    });
    const planCommands = verificationPlanCommands(result.plan);
    if (!planCommands.length) {
      appendToolCall({
        title: `历史任务验证命令未生成：${task.id || "task"}`,
        label: "$",
        state: "跳过",
        body: JSON.stringify(result.plan || {}, null, 2).slice(0, 8000)
      });
      showToast("当前历史任务没有可复用验证命令。");
      setBusy(false, "无验证命令");
      return [];
    }
    renderVerificationPlan(result.plan, { logCommands: true });
    stageRepairVerificationCommands(planCommands, {
      title: "历史任务验证命令",
      successTitle: `历史任务验证命令已放入面板：${task.id || "task"}`,
      source: "task-history"
    });
    appendToolCall({
      title: `历史任务验证上下文：${task.id || "task"}`,
      label: "log",
      state: result.plan?.status || "ready",
      body: [
        task.prompt ? `任务：${task.prompt}` : "",
        task.status ? `状态：${task.status}` : "",
        recommendedCapabilityFromState()?.area ? `推荐缺口：${recommendedCapabilityFromState().area}` : "",
        "",
        commandItemsToText(planCommands)
      ].filter(Boolean).join("\n").slice(0, 12000)
    });
    setBusy(false, "任务验证命令已加入");
    return planCommands;
  } catch (error) {
    showToast(error.message);
    appendTaskFailureEvidence(task, error, {
      title: `历史任务验证命令生成失败：${task.id || "task"}`,
      action: "task-verification-commands",
      endpoint: "/api/verification-plan",
      request: {
        id: task.id || "",
        commands
      },
      retry: () => stageTaskVerificationCommands(task),
      safe: () => appendTaskContextToPrompt(task)
    });
    setBusy(false, "任务验证命令失败");
    return [];
  }
}

function buildTaskVerificationPrompt(task = {}) {
  const context = buildTaskPromptContext(task);
  if (!context) return "";
  const previousCommands = (task.checks || [])
    .map((check) => check.command)
    .filter(Boolean);
  const taskRecoveryCommands = [
    ...(task.verificationCommands || []),
    ...(task.failedCommands || [])
  ].filter(Boolean);
  const pendingCommands = (state.pendingCommands || [])
    .map((item) => item.command || item)
    .filter(Boolean);
  const fallbackCommands = [
    "node --check app.js",
    "node --check server.js",
    "node server.js --ui-smoke-test",
    "node server.js --api-smoke-section=debug"
  ];
  const commandLines = [...new Set([...taskRecoveryCommands, ...previousCommands, ...pendingCommands])]
    .filter(Boolean)
    .slice(0, 8);
  const commands = commandLines.length ? commandLines : fallbackCommands;
  return [
    context,
    "",
    "目标：把这条历史任务证据转成可验证修复闭环。",
    "",
    "建议验证命令：",
    ...commands.map((command) => `- ${command}`),
    "",
    "输出要求：",
    "1. 先判断历史任务中哪些改动、检查结果或失败输出仍然影响当前工作区。",
    "2. 如果需要改代码，请生成最小 diff，保留已有正确改动。",
    "3. 修复后必须说明历史检查、推荐能力缺口和当前验证命令的处理结果。",
    "4. 必须给出可在当前工作区安全运行的验证命令，并优先复用上面的命令。"
  ].filter(Boolean).join("\n");
}

function appendTaskVerificationPromptToPrompt(task = {}) {
  const prompt = buildTaskVerificationPrompt(task);
  if (!prompt) {
    showToast("暂无可生成验证提示的任务证据。");
    return "";
  }
  const current = input.value.trim();
  input.value = [current, prompt].filter(Boolean).join("\n\n---\n\n");
  input.focus();
  scheduleReferencePreview({ immediate: true });
  appendToolCall({
    title: `任务验证提示已加入提示词：${task.id || "task"}`,
    label: "log",
    state: "ready",
    body: prompt.slice(0, 12000)
  });
  showToast("任务验证提示已加入提示词。");
  return prompt;
}

function runTaskVerificationFix(task = {}) {
  if (state.busy) {
    showToast("代理正在运行，请稍后再启动任务验证修复。");
    return "";
  }
  const prompt = buildTaskVerificationPrompt(task);
  if (!prompt) {
    showToast("暂无可运行的任务验证修复提示。");
    return "";
  }
  input.value = prompt;
  scheduleReferencePreview({ immediate: true });
  appendToolCall({
    title: `已启动任务验证修复：${task.id || "task"}`,
    label: "log",
    state: "running",
    body: prompt.slice(0, 12000)
  });
  showToast("正在启动带验证要求的历史任务修复。");
  submitPromptForm();
  return prompt;
}

function appendTaskFailureEvidence(task = {}, error, {
  title = "历史任务动作失败",
  action = "task-action",
  endpoint = "/api/task",
  request = null,
  retry = null,
  safe = null
} = {}) {
  return appendActionFailureEvidence({
    kind: "task",
    action,
    targetName: task.id || task.prompt || "task",
    endpoint,
    request: request || { id: task.id || "" },
    item: {
      id: task.id || "",
      status: task.status || "",
      prompt: task.prompt || "",
      changedFiles: (task.changedFiles || []).slice(0, 12),
      checksOk: Boolean(task.checksOk),
      checkpointId: task.checkpointId || "",
      createdAt: task.createdAt || ""
    },
    error
  }, { title, label: "log", retry, safe });
}

function compactApprovalJson(value, max = 4000) {
  if (!value) return "";
  try {
    const text = JSON.stringify(value, null, 2);
    return text.length > max ? `${text.slice(0, max)}\n...` : text;
  } catch {
    return String(value).slice(0, max);
  }
}

function approvalTargetSummary(approval = {}) {
  const lines = [];
  if (approval.command) lines.push(`命令：$ ${approval.command}`);
  if (approval.mcp) {
    const serverName = approval.mcp.serverName || approval.mcp.server || "unknown-server";
    const toolName = approval.mcp.toolName || approval.mcp.tool || "unknown-tool";
    lines.push(`MCP 工具：${serverName}.${toolName}`);
  }
  if (approval.extension) {
    const extensionName = approval.extension.name || approval.extension.extensionName || "unknown-extension";
    const toolName = approval.extension.toolName || approval.extension.tool || "unknown-tool";
    lines.push(`扩展工具：${extensionName}.${toolName}`);
  }
  if (approval.packageId) lines.push(`发布包：${approval.packageId}`);
  if (approval.title) lines.push(`标题：${approval.title}`);
  return lines.join("\n");
}

function buildApprovalPromptContext(approval = {}) {
  if (!approval?.id) return "";
  const target = approvalTargetSummary(approval);
  const policy = approval.policy || approval.risk || approval.reason
    ? compactApprovalJson({
      risk: approval.risk || approval.policy?.risk || "unknown",
      reason: approval.reason || approval.policy?.reason || "",
      policy: approval.policy || null
    }, 3000)
    : "";
  const execution = approval.execution ? compactApprovalJson(approval.execution, 3000) : "";
  const argumentsContext = [
    approval.mcp?.arguments ? `MCP 参数：\n${compactApprovalJson(approval.mcp.arguments, 2500)}` : "",
    approval.extension?.arguments ? `扩展参数：\n${compactApprovalJson(approval.extension.arguments, 2500)}` : ""
  ].filter(Boolean).join("\n\n");
  return [
    "请基于这条审批/策略拦截记录继续推进当前编程或调试任务。",
    "",
    `审批 ID：${approval.id}`,
    `类型：${approval.type || "command"}`,
    `状态：${approval.status || "blocked"}`,
    approval.createdAt ? `创建时间：${approval.createdAt}` : "",
    approval.decidedAt ? `决策时间：${approval.decidedAt}` : "",
    approval.decisionNote ? `决策备注：${approval.decisionNote}` : "",
    target ? `目标动作：\n${target}` : "",
    approval.reason ? `拦截原因：${approval.reason}` : "",
    policy ? `策略证据：\n${policy}` : "",
    argumentsContext ? `调用参数：\n${argumentsContext}` : "",
    execution ? `执行/升级记录：\n${execution}` : "",
    `审批原始记录（截断）：\n${compactApprovalJson(approval, 8000)}`,
    "",
    "要求：",
    "1. 不要绕过本地安全策略，不要建议直接执行被拦截的危险命令。",
    "2. 优先生成等价的安全检查命令、只读诊断步骤或更小权限的替代方案。",
    "3. 如果确实需要外部授权，请列出人工确认清单、风险点和执行后应回填的证据。",
    "4. 给出下一步可在当前项目中继续验证的命令或代码修改方案。"
  ].filter(Boolean).join("\n");
}

function appendApprovalContextToPrompt(approval = {}) {
  const context = buildApprovalPromptContext(approval);
  if (!context) {
    showToast("暂无可加入提示词的审批上下文。");
    return "";
  }
  const current = input.value.trim();
  input.value = [current, context].filter(Boolean).join("\n\n---\n\n");
  input.focus();
  scheduleReferencePreview({ immediate: true });
  appendToolCall({
    title: `审批上下文已加入提示词：${approval.id}`,
    label: "policy",
    state: "ready",
    body: context.slice(0, 12000)
  });
  showToast("审批上下文已加入提示词，可继续生成安全替代方案。");
  return context;
}

function runApprovalSafeAlternative(approval = {}) {
  if (state.busy) {
    showToast("代理正在运行，请稍后再生成安全替代方案。");
    return "";
  }
  const context = buildApprovalPromptContext(approval);
  if (!context) {
    showToast("暂无可用于生成安全替代方案的审批上下文。");
    return "";
  }
  const prompt = [
    context,
    "",
    "请现在直接生成安全替代方案：如果需要改代码，请输出最小 diff；如果只需要排查，请输出可运行的安全检查命令和预期证据。"
  ].join("\n");
  input.value = prompt;
  scheduleReferencePreview({ immediate: true });
  appendToolCall({
    title: `已启动审批安全替代：${approval.id}`,
    label: "policy",
    state: "running",
    body: prompt.slice(0, 12000)
  });
  showToast("正在启动安全替代方案代理。");
  submitPromptForm();
  return prompt;
}

function approvalVerificationCommands(approval = {}) {
  const commands = [];
  const add = (command, reason = "") => {
    if (!command || commands.some((item) => item.command === command)) return;
    commands.push({ command, reason });
  };
  add("node --check app.js", "确认前端审批/修复入口语法可用。");
  add("node --check server.js", "确认审批 API 和安全策略语法可用。");
  add("node server.js --ui-smoke-test", "确认审批按钮、提示入口和前端 hook 仍可渲染。");
  if (approval.type === "remote_publish_plan") {
    add("node server.js --api-smoke-section=publish", "复查远端发布审批、PR readiness 和合并门禁。");
  } else if (approval.type === "mcp_tool_call" || approval.type === "extension_tool_call") {
    add("node server.js --api-smoke-section=integrations", "复查 MCP/扩展工具审批和受控执行链路。");
  } else {
    add("node server.js --api-smoke-section=core", "复查命令策略、审批状态流转和本地核心 API。");
  }
  return commands;
}

function stageApprovalVerificationCommands(approval = {}) {
  const commands = approvalVerificationCommands(approval);
  if (!commands.length) {
    showToast("暂无可排队的审批验证命令。");
    return [];
  }
  stageRepairVerificationCommands(commands, {
    title: `审批验证命令：${approval.id || approval.type || "approval"}`,
    successTitle: "审批验证命令已放入面板",
    source: "approval",
    note: "用于确认审批阻塞、替代方案或升级证据不会破坏本地写码/调试闭环。"
  });
  return commands;
}

function buildApprovalBlockerPrompt(approval = {}) {
  const context = buildApprovalPromptContext(approval);
  if (!context) return "";
  const commands = approvalVerificationCommands(approval);
  return [
    context,
    "",
    "请专注处理这条审批阻塞：",
    "- 判断它阻塞了哪一步写代码/调试工作流。",
    "- 不绕过安全策略，优先给出可本地执行的只读诊断、替代命令或更小权限方案。",
    "- 如果必须人工授权，列出授权前检查、执行人、执行后回填证据和回滚方式。",
    "- 如果需要改当前项目，请输出最小 diff，并保留审批、验证和恢复入口。",
    commands.length ? `建议复查命令：\n${commands.map((item) => `- ${item.command}${item.reason ? `：${item.reason}` : ""}`).join("\n")}` : ""
  ].filter(Boolean).join("\n");
}

function appendApprovalBlockerPromptToPrompt(approval = {}) {
  const prompt = buildApprovalBlockerPrompt(approval);
  if (!prompt) {
    showToast("暂无可生成阻塞提示的审批上下文。");
    return "";
  }
  const current = input.value.trim();
  input.value = [current, prompt].filter(Boolean).join("\n\n---\n\n");
  input.focus();
  scheduleReferencePreview({ immediate: true });
  appendToolCall({
    title: `审批阻塞提示已加入提示词：${approval.id}`,
    label: "policy",
    state: "ready",
    body: prompt.slice(0, 12000)
  });
  showToast("审批阻塞提示已加入提示词。");
  return prompt;
}

function runApprovalBlockerFix(approval = {}) {
  if (state.busy) {
    showToast("代理正在运行，请稍后再启动审批阻塞修复。");
    return "";
  }
  const prompt = buildApprovalBlockerPrompt(approval);
  if (!prompt) {
    showToast("暂无可用于修复的审批阻塞上下文。");
    return "";
  }
  input.value = prompt;
  scheduleReferencePreview({ immediate: true });
  appendToolCall({
    title: `已启动审批阻塞修复：${approval.id}`,
    label: "policy",
    state: "running",
    body: prompt.slice(0, 12000)
  });
  showToast("正在启动审批阻塞修复代理。");
  submitPromptForm();
  return prompt;
}

function appendApprovalEscalationEvidence(result = {}, approval = {}) {
  const mergedApproval = {
    ...approval,
    id: result.id || approval.id,
    type: result.type || approval.type,
    status: result.status || approval.status,
    execution: result.execution || approval.execution,
    escalation: result.escalation || approval.escalation
  };
  appendToolCall({
    title: `审批升级证据包：${mergedApproval.id || "unknown"}`,
    label: "policy",
    state: result.escalation?.status || "requires_external_escalation",
    body: JSON.stringify({
      approval: {
        id: mergedApproval.id,
        type: mergedApproval.type,
        status: mergedApproval.status,
        target: approvalTargetSummary(mergedApproval)
      },
      escalation: result.escalation || null,
      execution: result.execution || null,
      policy: result.policy || null
    }, null, 2).slice(0, 12000)
  });
  const article = log.lastElementChild;
  if (!article || !mergedApproval.id) return;
  const actions = document.createElement("div");
  actions.className = "debug-last-failed-actions";
  actions.innerHTML = `<button type="button" data-action="prompt">加入提示词</button><button type="button" data-action="commands">验证命令</button><button type="button" data-action="blocker">阻塞提示</button><button type="button" data-action="fix">直接修复</button><button type="button" data-action="safe">安全替代</button>`;
  actions.querySelector("[data-action='prompt']").addEventListener("click", () => {
    appendApprovalContextToPrompt(mergedApproval);
  });
  actions.querySelector("[data-action='commands']").addEventListener("click", () => {
    stageApprovalVerificationCommands(mergedApproval);
  });
  actions.querySelector("[data-action='blocker']").addEventListener("click", () => {
    appendApprovalBlockerPromptToPrompt(mergedApproval);
  });
  actions.querySelector("[data-action='fix']").addEventListener("click", () => {
    runApprovalBlockerFix(mergedApproval);
  });
  actions.querySelector("[data-action='safe']").addEventListener("click", () => {
    runApprovalSafeAlternative(mergedApproval);
  });
  article.appendChild(actions);
}

async function createApprovalEscalationEvidence(approval = {}) {
  const detail = approval.policy ? approval : await api(`/api/approval?id=${encodeURIComponent(approval.id)}`);
  const result = await api("/api/approval-escalation", {
    method: "POST",
    body: JSON.stringify({
      id: detail.id,
      reason: "用户从审批卡片生成外部受控沙箱升级证据包。"
    })
  });
  appendApprovalEscalationEvidence(result, detail);
  await refreshHealth();
  return result;
}

function appendApprovalPlanCard(plan = {}, {
  title = "工具调用审批",
  label = "policy"
} = {}) {
  appendToolCall({
    title,
    label,
    state: plan.status || plan.approval?.status || "approval_required",
    body: JSON.stringify(plan, null, 2).slice(0, 12000)
  });
  const approval = plan.approval || plan;
  const article = log.lastElementChild;
  if (!article || !approval?.id) return;
  const actions = document.createElement("div");
  actions.className = "debug-last-failed-actions";
  actions.innerHTML = `<button type="button" data-action="prompt">加入提示词</button><button type="button" data-action="commands">验证命令</button><button type="button" data-action="blocker">阻塞提示</button><button type="button" data-action="fix">直接修复</button><button type="button" data-action="safe">安全替代</button><button type="button" data-action="escalate">升级证据</button>`;
  actions.querySelector("[data-action='prompt']").addEventListener("click", () => {
    appendApprovalContextToPrompt(approval);
  });
  actions.querySelector("[data-action='commands']").addEventListener("click", () => {
    stageApprovalVerificationCommands(approval);
  });
  actions.querySelector("[data-action='blocker']").addEventListener("click", () => {
    appendApprovalBlockerPromptToPrompt(approval);
  });
  actions.querySelector("[data-action='fix']").addEventListener("click", () => {
    runApprovalBlockerFix(approval);
  });
  actions.querySelector("[data-action='safe']").addEventListener("click", () => {
    runApprovalSafeAlternative(approval);
  });
  actions.querySelector("[data-action='escalate']").addEventListener("click", async () => {
    try {
      await createApprovalEscalationEvidence(approval);
    } catch (error) {
      showToast(error.message);
      appendActionFailureEvidence({
        kind: "approval",
        action: "approval-escalation",
        targetName: approval.id,
        endpoint: "/api/approval-escalation",
        request: { id: approval.id },
        approval,
        error
      }, {
        title: `审批升级证据生成失败：${approval.id}`,
        label: "policy",
        retry: () => createApprovalEscalationEvidence(approval),
        safe: () => runApprovalSafeAlternative(approval)
      });
    }
  });
  article.appendChild(actions);
}

function appendApprovalExecutionCard(result = {}, approval = {}) {
  const mergedApproval = {
    ...approval,
    id: result.id || approval.id,
    type: result.type || approval.type,
    status: result.status || approval.status,
    execution: result.execution || approval.execution
  };
  appendToolCall({
    title: `审批执行结果：${mergedApproval.id || "unknown"}`,
    label: "policy",
    state: result.execution?.executed ? "executed" : "blocked",
    body: JSON.stringify({
      approval: {
        id: mergedApproval.id,
        type: mergedApproval.type,
        status: mergedApproval.status,
        target: approvalTargetSummary(mergedApproval)
      },
      execution: result.execution || null
    }, null, 2).slice(0, 12000)
  });
  const article = log.lastElementChild;
  if (!article || !mergedApproval.id) return;
  const actions = document.createElement("div");
  actions.className = "debug-last-failed-actions";
  actions.innerHTML = `<button type="button" data-action="prompt">加入提示词</button><button type="button" data-action="commands">验证命令</button><button type="button" data-action="blocker">阻塞提示</button><button type="button" data-action="fix">直接修复</button><button type="button" data-action="safe">安全替代</button><button type="button" data-action="escalate">升级证据</button>`;
  actions.querySelector("[data-action='prompt']").addEventListener("click", () => {
    appendApprovalContextToPrompt(mergedApproval);
  });
  actions.querySelector("[data-action='commands']").addEventListener("click", () => {
    stageApprovalVerificationCommands(mergedApproval);
  });
  actions.querySelector("[data-action='blocker']").addEventListener("click", () => {
    appendApprovalBlockerPromptToPrompt(mergedApproval);
  });
  actions.querySelector("[data-action='fix']").addEventListener("click", () => {
    runApprovalBlockerFix(mergedApproval);
  });
  actions.querySelector("[data-action='safe']").addEventListener("click", () => {
    runApprovalSafeAlternative(mergedApproval);
  });
  actions.querySelector("[data-action='escalate']").addEventListener("click", async () => {
    try {
      await createApprovalEscalationEvidence(mergedApproval);
    } catch (error) {
      showToast(error.message);
      appendActionFailureEvidence({
        kind: "approval",
        action: "approval-escalation",
        targetName: mergedApproval.id,
        endpoint: "/api/approval-escalation",
        request: { id: mergedApproval.id },
        approval: mergedApproval,
        error
      }, {
        title: `审批升级证据生成失败：${mergedApproval.id}`,
        label: "policy",
        retry: () => createApprovalEscalationEvidence(mergedApproval),
        safe: () => runApprovalSafeAlternative(mergedApproval)
      });
    }
  });
  article.appendChild(actions);
}

function normalizeActionFailureError(error) {
  if (!error) return null;
  return {
    name: error.name || "",
    message: error.message || String(error),
    stack: error.stack ? String(error.stack).slice(0, 4000) : ""
  };
}

function compactActionFailureEvidence(evidence = {}, max = 12000) {
  return JSON.stringify({
    kind: evidence.kind || "action",
    action: evidence.action || "",
    targetName: evidence.targetName || "",
    endpoint: evidence.endpoint || evidence.request?.endpoint || "",
    request: evidence.request || null,
    error: evidence.error || null,
    approval: evidence.approval ? {
      id: evidence.approval.id,
      type: evidence.approval.type,
      status: evidence.approval.status,
      risk: evidence.approval.risk,
      reason: evidence.approval.reason,
      target: approvalTargetSummary(evidence.approval)
    } : null,
    item: evidence.item || null,
    pendingDiff: state.pendingDiff?.patches?.length ? {
      patches: state.pendingDiff.patches.length,
      commands: (state.pendingCommands || []).map((item) => item.command || item).slice(0, 8)
    } : null
  }, null, 2).slice(0, max);
}

function buildActionFailureContext(evidence = {}) {
  const kind = evidence.kind || "action";
  const targetName = evidence.targetName || evidence.approval?.id || evidence.item?.name || "unknown";
  const errorMessage = evidence.error?.message || evidence.error || "unknown error";
  const requestContext = evidence.request || evidence.endpoint
    ? compactJson({
      endpoint: evidence.endpoint || evidence.request?.endpoint || "",
      request: evidence.request || null
    }, 4000)
    : "";
  const relatedContext = kind === "approval"
    ? buildApprovalPromptContext(evidence.approval || {})
    : kind === "extension" || kind === "mcp" || kind === "tool"
      ? buildCatalogEvidenceContext(kind === "tool" ? "tool" : kind, evidence.item || {})
      : "";
  return [
    "请基于这次界面动作失败证据继续推进当前编程或调试任务。",
    "",
    `失败类型：${kind}`,
    `动作：${evidence.action || "unknown"}`,
    `对象：${targetName}`,
    evidence.endpoint ? `接口：${evidence.endpoint}` : "",
    `失败原因：${errorMessage}`,
    requestContext ? `请求上下文：\n${requestContext}` : "",
    relatedContext ? `相关目录/审批上下文：\n${relatedContext.slice(0, 8000)}` : "",
    "",
    "失败证据 JSON：",
    compactActionFailureEvidence(evidence, 8000),
    "",
    "要求：先判断失败属于接口参数、审批状态、策略拒绝、目录过期、后端异常还是 UI 状态恢复问题；需要改代码时输出最小 diff；需要验证时优先给出可在当前项目安全运行的命令；不要绕过审批和本地安全策略。"
  ].filter(Boolean).join("\n");
}

function appendActionFailureEvidenceToPrompt(evidence = {}) {
  const context = buildActionFailureContext(evidence);
  if (!context) {
    showToast("暂无可加入提示词的动作失败证据。");
    return "";
  }
  const current = input.value.trim();
  input.value = [current, context].filter(Boolean).join("\n\n---\n\n");
  input.focus();
  scheduleReferencePreview({ immediate: true });
  appendToolCall({
    title: `动作失败证据已加入提示词：${evidence.action || evidence.targetName || "action"}`,
    label: evidence.kind === "mcp" ? "mcp" : evidence.kind === "extension" ? "extension" : evidence.kind === "approval" ? "policy" : "debug",
    state: "ready",
    body: context.slice(0, 12000)
  });
  showToast("动作失败证据已加入提示词。");
  return context;
}

function runActionFailureRepair(evidence = {}) {
  if (state.busy) {
    showToast("代理正在运行，请稍后再启动动作失败诊断修复。");
    return "";
  }
  const context = buildActionFailureContext(evidence);
  if (!context) {
    showToast("暂无可用于修复的动作失败证据。");
    return "";
  }
  const prompt = [
    context,
    "",
    "请现在直接基于这次动作失败证据修复交互闭环：优先补齐失败恢复、参数提示、审批安全替代、证据复用或可重试动作，并给出下一轮安全验证命令。"
  ].join("\n");
  input.value = prompt;
  scheduleReferencePreview({ immediate: true });
  appendToolCall({
    title: `已启动动作失败诊断修复：${evidence.action || evidence.targetName || "action"}`,
    label: evidence.kind === "mcp" ? "mcp" : evidence.kind === "extension" ? "extension" : evidence.kind === "approval" ? "policy" : "debug",
    state: "running",
    body: prompt.slice(0, 12000)
  });
  showToast("正在基于动作失败证据启动修复。");
  submitPromptForm();
  return prompt;
}

function actionFailureVerificationCommands(evidence = {}, {
  source = "action-failure"
} = {}) {
  const kind = String(evidence.kind || "").toLowerCase();
  const action = String(evidence.action || "");
  const commands = [
    { command: "node --check app.js", reason: "复查动作失败证据卡、重试/安全替代和命令面板入口的前端语法。", source },
    { command: "node --check server.js", reason: "复查动作对应 API、策略和失败证据后端语法。", source },
    { command: "node server.js --ui-smoke-test", reason: "复查通用动作失败证据、排队验证和诊断修复入口。", source },
    { command: "node server.js --api-smoke-section=debug", reason: "复查失败动作进入调试诊断和恢复链路。", source }
  ];
  if (["mcp", "extension", "tool", "asset"].includes(kind)) {
    commands.push({ command: "node server.js --api-smoke-section=integrations", reason: "复查扩展、MCP、工具目录和资产检查链路。", source });
  }
  if (["approval", "policy", "gate"].includes(kind) || /approval|policy|gate|permission/i.test(action)) {
    commands.push({ command: "node server.js --api-smoke-section=fast", reason: "复查核心、模型、写入、上下文和门禁组合链路。", source });
  }
  return normalizeCommandItems(commands).slice(0, 12);
}

function stageActionFailureVerificationCommands(evidence = {}, {
  title = "动作失败",
  source = "action-failure",
  note = ""
} = {}) {
  const commands = actionFailureVerificationCommands(evidence, { source });
  return stageRepairVerificationCommands(commands, {
    title: `${title}验证命令`,
    successTitle: "动作失败验证命令已放入面板",
    source,
    note: note || "动作失败会先复查语法、UI smoke、debug smoke，并按失败类型追加 integrations 或 fast smoke。"
  });
}

function appendActionFailureEvidence(evidence = {}, {
  title = "动作失败证据",
  label = "debug",
  retry = null,
  safe = null
} = {}) {
  const normalizedEvidence = {
    ...evidence,
    error: normalizeActionFailureError(evidence.error)
  };
  appendToolCall({
    title,
    label,
    state: "失败",
    body: buildActionFailureContext(normalizedEvidence).slice(0, 12000)
  });
  const article = log.lastElementChild;
  if (!article) return normalizedEvidence;
  const actions = document.createElement("div");
  actions.className = "debug-last-failed-actions";
  actions.innerHTML = `<button type="button" data-action="prompt">加入提示词</button><button type="button" data-action="stage-verification">排队验证</button><button type="button" data-action="retry" ${retry ? "" : "disabled"}>重试</button><button type="button" data-action="safe" ${safe ? "" : "disabled"}>安全替代</button><button type="button" data-action="repair">直接修复</button>`;
  actions.querySelector("[data-action='prompt']").addEventListener("click", () => {
    appendActionFailureEvidenceToPrompt(normalizedEvidence);
  });
  actions.querySelector("[data-action='stage-verification']").addEventListener("click", () => {
    stageActionFailureVerificationCommands(normalizedEvidence);
  });
  actions.querySelector("[data-action='retry']").addEventListener("click", async () => {
    if (!retry) return;
    try {
      showToast("正在重试失败动作。");
      await retry();
    } catch (retryError) {
      appendActionFailureEvidence({
        ...normalizedEvidence,
        action: `${normalizedEvidence.action || "action"} retry`,
        error: retryError
      }, { title: `${title} · 重试失败`, label, retry, safe });
    }
  });
  actions.querySelector("[data-action='safe']").addEventListener("click", async () => {
    if (!safe) return;
    try {
      await safe();
    } catch (safeError) {
      appendActionFailureEvidence({
        ...normalizedEvidence,
        action: `${normalizedEvidence.action || "action"} safe-alternative`,
        error: safeError
      }, { title: `${title} · 安全替代失败`, label, retry, safe });
    }
  });
  actions.querySelector("[data-action='repair']").addEventListener("click", () => {
    runActionFailureRepair(normalizedEvidence);
  });
  article.appendChild(actions);
  return normalizedEvidence;
}

function renderTasks(tasks = []) {
  if (!taskList) return;
  taskList.innerHTML = "";
  if (!tasks.length) {
    taskList.textContent = "暂无任务记录";
    return;
  }
  tasks.slice(0, 6).forEach((task) => {
    const row = document.createElement("div");
    row.className = `task-row ${task.checksOk ? "passed" : ""}`;
    row.innerHTML = `<div><strong></strong><small></small></div><span class="task-row-actions"><button type="button" data-action="detail">详情</button><button type="button" data-action="prompt">加入提示词</button><button type="button" data-action="commands">验证命令</button><button type="button" data-action="verification-prompt">验证提示</button><button type="button" data-action="verification-fix">验证修复</button><button type="button" data-action="continue">直接继续</button><button type="button" data-action="reference">引用文件</button></span>`;
    row.querySelector("strong").textContent = task.prompt || "(无提示词)";
    const selectedHunkCount = (task.selectedHunks || []).reduce((sum, item) => sum + Number(item.selectedHunks || 0), 0);
    const taskMeta = [
      task.status || "unknown",
      (task.changedFiles || []).length ? `${task.changedFiles.length} file(s)` : "无文件",
      selectedHunkCount ? `${selectedHunkCount} hunk(s)` : "",
      (task.failedCommands || []).length ? `${task.failedCommands.length} failed` : "",
      (task.verificationCommands || []).length ? `${task.verificationCommands.length} check(s)` : ""
    ].filter(Boolean).join(" · ");
    row.querySelector("small").textContent = taskMeta;
    const getDetail = async () => await api(`/api/task?id=${encodeURIComponent(task.id)}`);
    row.querySelector("[data-action='detail']").addEventListener("click", async () => {
      const viewTaskDetail = async () => {
        const detail = await getDetail();
        appendToolCall({
          title: `任务详情：${task.id}`,
          label: "log",
          state: "完成",
          body: JSON.stringify(detail, null, 2).slice(0, 12000)
        });
      };
      try {
        await viewTaskDetail();
      } catch (error) {
        showToast(error.message);
        appendTaskFailureEvidence(task, error, {
          title: `查看任务详情失败：${task.id || "task"}`,
          action: "task-detail",
          retry: viewTaskDetail,
          safe: () => appendTaskContextToPrompt(task)
        });
      }
    });
    row.querySelector("[data-action='prompt']").addEventListener("click", async () => {
      const promptTaskDetail = async () => appendTaskContextToPrompt(await getDetail());
      try {
        await promptTaskDetail();
      } catch (error) {
        showToast(error.message);
        appendTaskFailureEvidence(task, error, {
          title: `任务证据加入提示词失败：${task.id || "task"}`,
          action: "task-prompt",
          retry: promptTaskDetail,
          safe: () => appendTaskContextToPrompt(task)
        });
      }
    });
    row.querySelector("[data-action='commands']").addEventListener("click", async () => {
      const stageCommands = async () => stageTaskVerificationCommands(await getDetail());
      try {
        await stageCommands();
      } catch (error) {
        showToast(error.message);
        appendTaskFailureEvidence(task, error, {
          title: `历史任务验证命令失败：${task.id || "task"}`,
          action: "task-verification-commands",
          retry: stageCommands,
          safe: () => appendTaskContextToPrompt(task)
        });
      }
    });
    row.querySelector("[data-action='verification-prompt']").addEventListener("click", async () => {
      const promptTaskVerification = async () => appendTaskVerificationPromptToPrompt(await getDetail());
      try {
        await promptTaskVerification();
      } catch (error) {
        showToast(error.message);
        appendTaskFailureEvidence(task, error, {
          title: `任务验证提示生成失败：${task.id || "task"}`,
          action: "task-verification-prompt",
          retry: promptTaskVerification,
          safe: () => appendTaskContextToPrompt(task)
        });
      }
    });
    row.querySelector("[data-action='verification-fix']").addEventListener("click", async () => {
      const repairTaskVerification = async () => runTaskVerificationFix(await getDetail());
      try {
        await repairTaskVerification();
      } catch (error) {
        showToast(error.message);
        appendTaskFailureEvidence(task, error, {
          title: `任务验证修复启动失败：${task.id || "task"}`,
          action: "task-verification-fix",
          retry: repairTaskVerification,
          safe: () => appendTaskContextToPrompt(task)
        });
      }
    });
    row.querySelector("[data-action='continue']").addEventListener("click", async () => {
      const continueTask = async () => runTaskContinuation(await getDetail());
      try {
        await continueTask();
      } catch (error) {
        showToast(error.message);
        appendTaskFailureEvidence(task, error, {
          title: `历史任务继续失败：${task.id || "task"}`,
          action: "task-continue",
          retry: continueTask,
          safe: () => appendTaskContextToPrompt(task)
        });
      }
    });
    row.querySelector("[data-action='reference']").addEventListener("click", async () => {
      const referenceTaskFiles = async () => referenceTaskFilesInPrompt(await getDetail());
      try {
        await referenceTaskFiles();
      } catch (error) {
        showToast(error.message);
        appendTaskFailureEvidence(task, error, {
          title: `引用任务文件失败：${task.id || "task"}`,
          action: "task-reference-files",
          retry: referenceTaskFiles,
          safe: () => appendTaskContextToPrompt(task)
        });
      }
    });
    taskList.appendChild(row);
  });
}

function renderThreads(threads = []) {
  if (!threadList) return;
  threadList.innerHTML = "";
  if (!threads.length) {
    state.activeThreadId = "";
    const row = document.createElement("button");
    row.type = "button";
    row.className = "thread active";
    row.innerHTML = `<span class="status-dot live"></span><span><strong>当前会话</strong><small>尚未保存消息</small></span>`;
    row.addEventListener("click", () => {
      appendToolCall({ title: "当前会话", label: "thread", state: "active", body: "尚未创建可恢复会话 artifact。" });
    });
    threadList.appendChild(row);
    return;
  }
  if (!state.activeThreadId) {
    state.activeThreadId = threads[0]?.id || "";
  }
  threads.slice(0, 8).forEach((thread, index) => {
    const row = document.createElement("div");
    row.className = `thread ${thread.id === state.activeThreadId || (!state.activeThreadId && index === 0) ? "active" : ""}`;
    row.tabIndex = 0;
    row.setAttribute("role", "button");
    row.innerHTML = `<span class="status-dot ${thread.status === "awaiting_approval" ? "live" : "idle"}"></span><span><strong></strong><small></small></span><form class="thread-rename-form" hidden><input type="text" maxlength="120" aria-label="会话标题"><button type="submit">保存</button><button type="button" data-action="cancel-rename">取消</button></form><span class="thread-actions"><button type="button" data-action="prompt">加入提示词</button><button type="button" data-action="continue">直接继续</button><button type="button" data-action="rename">重命名</button><button type="button" data-action="fork">分叉</button><button type="button" data-action="pin"></button><button type="button" data-action="archive">归档</button></span>`;
    row.querySelector("strong").textContent = thread.title || "未命名会话";
    row.querySelector("small").textContent = `${thread.pinned ? "置顶 · " : ""}${thread.status || "active"} · ${thread.messageCount || 0} 条消息`;
    row.querySelector("[data-action='pin']").textContent = thread.pinned ? "取消置顶" : "置顶";
    const titleBlock = row.querySelector("span:nth-child(2)");
    const renameForm = row.querySelector(".thread-rename-form");
    const renameInput = renameForm?.querySelector("input");
    const renameButton = row.querySelector("[data-action='rename']");
    const cancelRenameButton = row.querySelector("[data-action='cancel-rename']");
    const setRenameMode = (enabled) => {
      if (!renameForm || !titleBlock || !renameInput) return;
      renameForm.hidden = !enabled;
      titleBlock.hidden = enabled;
      row.classList.toggle("renaming", enabled);
      if (enabled) {
        renameInput.value = thread.title || "未命名会话";
        setTimeout(() => {
          renameInput.focus();
          renameInput.select();
        }, 0);
      }
    };
    const submitRename = async () => {
      if (!renameInput) return;
      const title = renameInput.value.trim();
      if (!title) {
        showToast("会话标题不能为空。");
        renameInput.focus();
        return;
      }
      if (title === (thread.title || "未命名会话")) {
        setRenameMode(false);
        return;
      }
      if (renameButton) renameButton.disabled = true;
      try {
        const result = await api("/api/thread", {
          method: "PATCH",
          body: JSON.stringify({ id: thread.id, title })
        });
        renderThreads(result.threads || []);
        appendToolCall({
          title: `已重命名会话：${title}`,
          label: "thread",
          state: "完成",
          body: JSON.stringify(result.thread?.summary || {}, null, 2).slice(0, 12000)
        });
      } catch (error) {
        showToast(error.message);
        appendThreadFailureEvidence(thread, error, {
          title: `重命名会话失败：${thread.title || thread.id || "thread"}`,
          action: "thread-rename",
          endpoint: "/api/thread",
          request: { id: thread.id, title },
          retry: async () => {
            const result = await api("/api/thread", {
              method: "PATCH",
              body: JSON.stringify({ id: thread.id, title })
            });
            renderThreads(result.threads || []);
          }
        });
      } finally {
        if (renameButton) renameButton.disabled = false;
      }
    };
    const restoreThread = async () => {
      try {
        const detail = await api(`/api/thread?id=${encodeURIComponent(thread.id)}`);
        const previousThreadId = state.activeThreadId;
        state.activeThreadId = detail.id;
        renderMessages(detail.messages || []);
        if (previousThreadId !== state.activeThreadId) {
          clearCommandDebugState({ persist: false });
        }
        restoreCommandDebugState();
        renderThreads(threads);
        appendToolCall({
          title: `已恢复会话：${detail.title}`,
          label: "thread",
          state: detail.status || "active",
          body: JSON.stringify(detail.summary || detail, null, 2).slice(0, 12000)
        });
      } catch (error) {
        showToast(error.message);
        appendThreadFailureEvidence(thread, error, {
          title: `恢复会话失败：${thread.title || thread.id || "thread"}`,
          action: "thread-restore",
          endpoint: "/api/thread",
          request: { id: thread.id || "" },
          retry: restoreThread
        });
      }
    };
    row.addEventListener("click", restoreThread);
    row.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        restoreThread();
      }
    });
    row.querySelector("[data-action='prompt']").addEventListener("click", (event) => {
      event.stopPropagation();
      appendThreadContextToPrompt(thread);
    });
    row.querySelector("[data-action='continue']").addEventListener("click", (event) => {
      event.stopPropagation();
      runThreadContinuation(thread);
    });
    row.querySelector("[data-action='pin']").addEventListener("click", async (event) => {
      event.stopPropagation();
      try {
        const result = await api("/api/thread", {
          method: "PATCH",
          body: JSON.stringify({ id: thread.id, pinned: !thread.pinned })
        });
        renderThreads(result.threads || []);
      } catch (error) {
        showToast(error.message);
        appendThreadFailureEvidence(thread, error, {
          title: `置顶会话失败：${thread.title || thread.id || "thread"}`,
          action: "thread-pin",
          endpoint: "/api/thread",
          request: { id: thread.id, pinned: !thread.pinned },
          retry: async () => {
            const result = await api("/api/thread", {
              method: "PATCH",
              body: JSON.stringify({ id: thread.id, pinned: !thread.pinned })
            });
            renderThreads(result.threads || []);
          }
        });
      }
    });
    row.querySelector("[data-action='rename']").addEventListener("click", async (event) => {
      event.stopPropagation();
      setRenameMode(true);
    });
    renameForm?.addEventListener("click", (event) => event.stopPropagation());
    renameForm?.addEventListener("submit", (event) => {
      event.preventDefault();
      event.stopPropagation();
      submitRename();
    });
    renameInput?.addEventListener("keydown", (event) => {
      event.stopPropagation();
      if (event.key === "Escape") {
        event.preventDefault();
        setRenameMode(false);
      }
    });
    cancelRenameButton?.addEventListener("click", (event) => {
      event.stopPropagation();
      setRenameMode(false);
    });
    row.querySelector("[data-action='fork']").addEventListener("click", async (event) => {
      event.stopPropagation();
      try {
        const result = await api("/api/thread-fork", {
          method: "POST",
          body: JSON.stringify({ id: thread.id })
        });
        state.activeThreadId = result.thread?.id || "";
        renderMessages(result.thread?.messages || []);
        renderThreads(result.threads || []);
        appendToolCall({
          title: `已分叉会话：${result.thread?.title || ""}`,
          label: "thread",
          state: "active",
          body: JSON.stringify({ source: result.source, fork: result.thread?.summary }, null, 2).slice(0, 12000)
        });
      } catch (error) {
        showToast(error.message);
        appendThreadFailureEvidence(thread, error, {
          title: `分叉会话失败：${thread.title || thread.id || "thread"}`,
          action: "thread-fork",
          endpoint: "/api/thread-fork",
          request: { id: thread.id },
          retry: async () => {
            const result = await api("/api/thread-fork", {
              method: "POST",
              body: JSON.stringify({ id: thread.id })
            });
            state.activeThreadId = result.thread?.id || "";
            renderMessages(result.thread?.messages || []);
            renderThreads(result.threads || []);
          }
        });
      }
    });
    row.querySelector("[data-action='archive']").addEventListener("click", async (event) => {
      event.stopPropagation();
      try {
        const result = await api("/api/thread", {
          method: "PATCH",
          body: JSON.stringify({ id: thread.id, archived: true, status: "archived" })
        });
        if (state.activeThreadId === thread.id) state.activeThreadId = "";
        renderThreads(result.threads || []);
      } catch (error) {
        showToast(error.message);
        appendThreadFailureEvidence(thread, error, {
          title: `归档会话失败：${thread.title || thread.id || "thread"}`,
          action: "thread-archive",
          endpoint: "/api/thread",
          request: { id: thread.id, archived: true, status: "archived" },
          retry: async () => {
            const result = await api("/api/thread", {
              method: "PATCH",
              body: JSON.stringify({ id: thread.id, archived: true, status: "archived" })
            });
            if (state.activeThreadId === thread.id) state.activeThreadId = "";
            renderThreads(result.threads || []);
          }
        });
      }
    });
    threadList.appendChild(row);
  });
}

function buildCapabilityGapContext(capability = {}) {
  if (!capability?.area) return "";
  const taskPlan = capabilityTaskPlan(capability);
  return [
    "请基于这条 Codex 对标能力项继续改进当前项目，让它更适合真实写代码和调试程序。",
    "",
    `能力领域：${capability.area}`,
    `当前状态：${capability.status || "unknown"}`,
    capability.recommendationReason ? `推荐理由：${capability.recommendationReason}` : "",
    capability.next ? `下一步建议：${capability.next}` : "",
    taskPlan ? `\n建议补齐任务：\n${formatCapabilityTaskPlan(taskPlan)}` : "",
    "",
    "已有证据：",
    (capability.evidence || []).map((item) => `- ${item}`).join("\n") || "(无证据)",
    "",
    "要求：如果该能力未完全实现，请优先补齐最影响编码/调试体验的最小闭环；需要改代码时输出最小 diff；需要验证时给出安全检查命令；不要为了标记完成而绕开真实缺口。"
  ].filter(Boolean).join("\n");
}

function capabilityExternalDependency(capability = {}) {
  return Boolean(capability.externalDependency)
    || /(远端|真实 PR|push|provider|云端|凭据|认证|扩展市场|签名链|跨站点|账单直连|系统级沙箱)/i.test(`${capability.area || ""} ${capability.next || ""}`);
}

function capabilityTaskPlan(capability = {}) {
  if (!capability?.area) return null;
  if (capability.taskPlan && typeof capability.taskPlan === "object") {
    return {
      title: capability.taskPlan.title || `${capabilityExternalDependency(capability) ? "授权/替代路径" : "本地补齐闭环"} · ${capability.area}`,
      blocked: Boolean(capability.taskPlan.blocked ?? capabilityExternalDependency(capability)),
      objective: capability.taskPlan.objective || "",
      focusFiles: Array.isArray(capability.taskPlan.focusFiles) ? capability.taskPlan.focusFiles : capabilityFocusFiles(capability),
      acceptance: Array.isArray(capability.taskPlan.acceptance) ? capability.taskPlan.acceptance : [],
      verificationCommands: Array.isArray(capability.taskPlan.verificationCommands)
        ? capability.taskPlan.verificationCommands
        : capabilityVerificationCommandPlan(capability),
      externalPreparation: capability.taskPlan.externalPreparation || null,
      nextAction: capability.taskPlan.nextAction || capability.next || "",
      evidence: Array.isArray(capability.taskPlan.evidence) ? capability.taskPlan.evidence : (capability.evidence || []).slice(0, 6),
      policy: capability.taskPlan.policy || {}
    };
  }
  const externalBlocked = capabilityExternalDependency(capability);
  const verificationCommands = capabilityVerificationCommandPlan(capability);
  const acceptance = externalBlocked
    ? [
        "明确列出需要用户提供的授权、凭据、CLI 登录或远端权限。",
        "保留本地可替代验证路径，不把外部阻塞项伪装成已完成。",
        "拿到授权后能直接执行对应只读探测或发布前预检。"
      ]
    : [
        "补齐一个能从 UI 直接进入提示词、验证命令或修复代理的最小闭环。",
        "更新能力矩阵证据和 README，说明新链路如何帮助写代码/调试程序。",
        "至少通过语法检查、UI smoke 和相关 API smoke。"
      ];
  return {
    title: `${externalBlocked ? "授权/替代路径" : "本地补齐闭环"} · ${capability.area}`,
    blocked: externalBlocked,
    objective: externalBlocked
      ? "把外部依赖拆成可执行授权清单，并给出本地替代验证方式。"
      : "把这项能力推进到可演示、可验证、可恢复的开发调试闭环。",
    focusFiles: capabilityFocusFiles(capability),
    acceptance,
    verificationCommands,
    externalPreparation: externalBlocked ? {
      title: `本地准备清单 · ${capability.area}`,
      authorizationItems: [
        "明确需要用户提供的凭据、CLI 登录、远端平台权限和允许执行范围。",
        "确认哪些远端写入、工具调用或跨站点浏览器动作必须单独审批。"
      ],
      localReadinessCommands: verificationCommands.slice(0, 4),
      localArtifacts: capabilityFocusFiles(capability),
      prompt: `请为 ${capability.area} 生成授权准备和本地预检方案，不执行远端写入。`
    } : null,
    nextAction: capability.next || "",
    evidence: (capability.evidence || []).slice(0, 6)
  };
}

function capabilityFocusFiles(capability = {}) {
  const text = `${capability.area || ""} ${capability.next || ""}`;
  const files = new Set(["app.js", "server.js", "README.md"]);
  if (/浏览器|视觉|Trace|DOM|进程|调试|长任务/i.test(text)) {
    files.add("index.html");
    files.add("styles.css");
  }
  if (/界面|UI|按钮|面板|工作台|能力矩阵/i.test(text)) {
    files.add("index.html");
    files.add("styles.css");
  }
  if (/启动|端口|本地运行/i.test(text)) files.add("start.bat");
  return [...files];
}

function capabilityVerificationCommandPlan(capability = {}) {
  const text = `${capability.area || ""} ${capability.next || ""}`;
  const commands = [
    { command: "node --check app.js", reason: "前端工作台脚本语法检查" },
    { command: "node --check server.js", reason: "后端 API 和 smoke 脚本语法检查" },
    { command: "node server.js --ui-smoke-test", reason: "验证 UI hooks、按钮和样式入口仍完整" }
  ];
  const add = (command, reason) => {
    if (!commands.some((item) => item.command === command)) commands.push({ command, reason });
  };
  if (/浏览器|视觉|Trace|DOM|调试|进程|长任务/i.test(text)) {
    add("node server.js --api-smoke-section=debug", "验证调试诊断和修复上下文链路");
    add("node server.js --api-smoke-section=browser", "验证浏览器检查、Trace 和视觉入口");
  } else if (/工具|MCP|扩展|资产|模型|权限|审批|发布|PR|CI/i.test(text)) {
    add("node server.js --api-smoke-section=integrations", "验证工具、权限、远端和集成入口");
  } else {
    add("node server.js --api-smoke-section=debug", "验证编码/调试主闭环");
  }
  add("git diff --check -- app.js server.js README.md index.html styles.css", "检查补丁空白和格式问题");
  return commands;
}

function formatCapabilityTaskPlan(plan = {}) {
  if (!plan?.title) return "";
  return [
    `任务：${plan.title}`,
    `目标：${plan.objective || ""}`,
    plan.nextAction ? `下一步：${plan.nextAction}` : "",
    plan.focusFiles?.length ? `重点文件：${plan.focusFiles.map((file) => `@${file}`).join(" ")}` : "",
    plan.acceptance?.length ? `验收：\n${plan.acceptance.map((item) => `- ${item}`).join("\n")}` : "",
    plan.externalPreparation?.authorizationItems?.length ? `本地准备：\n${plan.externalPreparation.authorizationItems.map((item) => `- ${item}`).join("\n")}` : "",
    plan.externalPreparation?.localReadinessCommands?.length ? `本地预检：\n${plan.externalPreparation.localReadinessCommands.map((item) => `- ${item.command || item}`).join("\n")}` : "",
    plan.verificationCommands?.length ? `验证命令：\n${plan.verificationCommands.map((item) => `- ${item.command}${item.reason ? `：${item.reason}` : ""}`).join("\n")}` : ""
  ].filter(Boolean).join("\n");
}

function appendCapabilityTaskCard(capability = {}) {
  const plan = capabilityTaskPlan(capability);
  if (!plan) {
    showToast("暂无可生成的能力补齐任务。");
    return null;
  }
  appendToolCall({
    title: `能力补齐任务：${capability.area}`,
    label: plan.blocked ? "auth" : "audit",
    state: plan.blocked ? "blocked" : "ready",
    body: formatCapabilityTaskPlan(plan).slice(0, 12000)
  });
  showToast("能力补齐任务已生成。");
  return plan;
}

function stageCapabilityTaskCommands(capability = {}) {
  const plan = capabilityTaskPlan(capability);
  if (!plan?.verificationCommands?.length) {
    showToast("暂无可放入面板的能力任务验证命令。");
    return [];
  }
  return stageRepairVerificationCommands(plan.verificationCommands, {
    title: "能力任务验证命令",
    successTitle: `能力任务验证命令已放入面板：${capability.area || "能力差距"}`,
    source: "capability-task",
    note: formatCapabilityTaskPlan(plan)
  });
}

function stageExternalPreparationReadinessCommands(gapSummary = {}) {
  const preparation = gapSummary.externalPreparation || {};
  const commands = normalizeCommandItems(preparation.localReadinessCommands || []);
  if (!commands.length) {
    appendToolCall({
      title: "外部准备预检命令未生成",
      label: "$",
      state: "跳过",
      body: "当前外部授权准备清单没有本地可跑预检命令。"
    });
    showToast("暂无本地可跑预检命令。");
    return [];
  }
  return stageRepairVerificationCommands(commands, {
    title: "外部准备预检命令",
    successTitle: "外部准备预检命令已放入面板",
    source: "external-preparation",
    note: [
      "这些命令只做本地只读/安全预检，用于确认授权、CLI、目录和验证入口是否准备好。",
      preparation.firstAction ? `优先准备动作：${preparation.firstAction}` : "",
      preparation.authorizationItems?.length ? `授权准备：${preparation.authorizationItems.slice(0, 4).join(" / ")}` : ""
    ].filter(Boolean).join("\n")
  });
}

function appendCapabilityGapToPrompt(capability = {}) {
  const context = buildCapabilityGapContext(capability);
  if (!context) {
    showToast("暂无可加入提示词的能力差距。");
    return "";
  }
  const current = input.value.trim();
  input.value = [current, context].filter(Boolean).join("\n\n---\n\n");
  input.focus();
  scheduleReferencePreview({ immediate: true });
  appendToolCall({
    title: `能力差距已加入提示词：${capability.area}`,
    label: "audit",
    state: capability.status || "unknown",
    body: context.slice(0, 12000)
  });
  showToast("能力差距已加入提示词。");
  return context;
}

function runCapabilityGapRepair(capability = {}) {
  if (state.busy) {
    showToast("代理正在运行，请稍后再启动能力补齐。");
    return "";
  }
  const context = buildCapabilityGapContext(capability);
  if (!context) {
    showToast("暂无可用于补齐的能力差距。");
    return "";
  }
  const externalBlocked = capabilityExternalDependency(capability);
  const prompt = [
    context,
    "",
    externalBlocked
      ? "请现在基于这条外部受限能力生成本地准备闭环：列出授权、凭据、CLI 登录、风险边界和只读预检；不要假装已具备远端权限，也不要执行远端写入。"
      : "请现在直接基于这条能力差距继续改进：先判断当前项目相对 Codex 的真实缺口，优先补齐最小可验证闭环，更新必要文档，并给出/执行安全验证命令。"
  ].join("\n");
  input.value = prompt;
  scheduleReferencePreview({ immediate: true });
  appendToolCall({
    title: externalBlocked ? `已启动外部能力准备：${capability.area}` : `已启动能力差距补齐：${capability.area}`,
    label: externalBlocked ? "auth" : "audit",
    state: "running",
    body: prompt.slice(0, 12000)
  });
  showToast(externalBlocked ? "正在生成外部能力准备任务。" : "正在基于能力差距启动补齐任务。");
  submitPromptForm();
  return prompt;
}

function buildCapabilityGapListContext(gaps = [], {
  title = "能力缺口",
  mode = "local"
} = {}) {
  const list = Array.isArray(gaps) ? gaps.filter((gap) => gap?.area) : [];
  if (!list.length) return "";
  const externalMode = mode === "external";
  return [
    `请基于这组 ${title} 继续推进 Codex 对标。`,
    "",
    `缺口类型：${externalMode ? "外部授权/凭据阻塞" : "本地可继续补齐"}`,
    `缺口数量：${list.length}`,
    "",
    "缺口清单：",
    ...list.map((gap, index) => [
      `${index + 1}. ${gap.area} (${gap.status || "unknown"})`,
      gap.externalDependency ? "   - 需要外部授权/凭据或远端平台能力" : "   - 可优先在本地继续补齐",
      gap.next ? `   - 下一步：${gap.next}` : "",
      gap.taskPlan?.externalPreparation?.authorizationItems?.length ? `   - 授权准备：${gap.taskPlan.externalPreparation.authorizationItems.slice(0, 3).join(" / ")}` : "",
      gap.externalPreparation?.authorizationItems?.length ? `   - 授权准备：${gap.externalPreparation.authorizationItems.slice(0, 3).join(" / ")}` : "",
      gap.taskPlan?.externalPreparation?.localReadinessCommands?.length ? `   - 本地预检：${gap.taskPlan.externalPreparation.localReadinessCommands.slice(0, 3).map((item) => item.command || item).join(" / ")}` : "",
      gap.externalPreparation?.localReadinessCommands?.length ? `   - 本地预检：${gap.externalPreparation.localReadinessCommands.slice(0, 3).map((item) => item.command || item).join(" / ")}` : "",
      gap.evidence?.length ? `   - 证据：${gap.evidence.slice(0, 5).join(" / ")}` : ""
    ].filter(Boolean).join("\n")),
    "",
    externalMode
      ? "要求：不要假装已经具备外部权限；请整理需要用户授权、凭据、CLI 登录或远端平台配置的清单，并给出本地可替代验证路径。"
      : "要求：优先选择最影响写代码/调试体验的一项，做最小可验证改动；需要改代码时输出最小 diff，并给出或执行安全验证命令。"
  ].filter(Boolean).join("\n");
}

function appendCapabilityGapListToPrompt(gaps = [], options = {}) {
  const context = buildCapabilityGapListContext(gaps, options);
  if (!context) {
    showToast("暂无可加入提示词的能力缺口清单。");
    return "";
  }
  const current = input.value.trim();
  input.value = [current, context].filter(Boolean).join("\n\n---\n\n");
  input.focus();
  scheduleReferencePreview({ immediate: true });
  appendToolCall({
    title: `${options.title || "能力缺口"}已加入提示词`,
    label: "audit",
    state: options.mode === "external" ? "blocked" : "ready",
    body: context.slice(0, 12000)
  });
  showToast("能力缺口清单已加入提示词。");
  return context;
}

function runCapabilityGapListRepair(gaps = [], options = {}) {
  if (state.busy) {
    showToast("代理正在运行，请稍后再启动能力缺口补齐。");
    return "";
  }
  const context = buildCapabilityGapListContext(gaps, options);
  if (!context) {
    showToast("暂无可用于补齐的能力缺口清单。");
    return "";
  }
  const externalMode = options.mode === "external";
  const prompt = [
    context,
    "",
    externalMode
      ? "请现在把这些外部阻塞项整理成可执行授权清单：列出需要用户提供的凭据/CLI 登录/远端权限、当前本地替代能力，以及拿到授权后的验证命令。"
      : "请现在直接基于这些本地可补齐缺口继续改进：先选最影响编码/调试体验的一项，做最小可验证闭环，更新必要文档，并给出/执行安全验证命令。"
  ].join("\n");
  input.value = prompt;
  scheduleReferencePreview({ immediate: true });
  appendToolCall({
    title: externalMode ? "已启动外部阻塞授权清单" : "已启动本地能力缺口补齐",
    label: "audit",
    state: "running",
    body: prompt.slice(0, 12000)
  });
  showToast(externalMode ? "正在生成外部阻塞授权清单。" : "正在启动本地能力缺口补齐。");
  submitPromptForm();
  return prompt;
}

function recommendedCapabilityFromState() {
  const audit = state.lastCapabilityAudit || null;
  const capabilities = audit?.capabilities || [];
  const recommendedNext = audit?.recommendedNext?.capability ? audit.recommendedNext : selectCapabilityRecommendation(capabilities);
  return recommendedNext?.capability ? {
    ...recommendedNext.capability,
    recommendationReason: recommendedNext.reason || ""
  } : null;
}

function buildGoalContinuationPrompt(goal = {}, capability = recommendedCapabilityFromState()) {
  const verification = goal?.lastVerification
    ? `${goal.lastVerification.skipped ? "skipped" : goal.lastVerification.ok ? "passed" : "failed"} · ${goal.lastVerification.checkCount || 0} checks`
    : "none";
  const capabilityContext = capability ? buildCapabilityGapContext(capability) : "";
  const recovery = state.lastRecoverySummary || {};
  const gapSummary = recovery.capabilityGapSummary || state.lastCapabilityAudit?.gapSummary || null;
  const formatGapItems = (items = []) => (Array.isArray(items) ? items : [])
    .slice(0, 5)
    .map((item) => [
      `- ${item.area || "能力缺口"} (${item.status || "partial"})`,
      item.next ? `  next: ${item.next}` : "",
      item.focusFiles?.length ? `  files: ${item.focusFiles.join(", ")}` : "",
      item.externalPreparation?.authorizationItems?.length ? `  auth: ${item.externalPreparation.authorizationItems.slice(0, 3).join(" | ")}` : "",
      item.externalPreparation?.localReadinessCommands?.length ? `  readiness: ${item.externalPreparation.localReadinessCommands.slice(0, 3).map((command) => typeof command === "string" ? command : command.command).filter(Boolean).join(" | ")}` : "",
      item.verificationCommands?.length ? `  verify: ${item.verificationCommands.map((command) => typeof command === "string" ? command : command.command).filter(Boolean).join(" | ")}` : ""
    ].filter(Boolean).join("\n"))
    .join("\n");
  const externalPreparationContext = gapSummary?.externalPreparation ? [
    "外部缺口本地准备：",
    `- count: ${gapSummary.externalPreparation.count || gapSummary.externalBlockedCount || 0}`,
    gapSummary.externalPreparation.firstAction ? `- first: ${gapSummary.externalPreparation.firstAction}` : "",
    gapSummary.externalPreparation.authorizationItems?.length ? "- auth:\n" + gapSummary.externalPreparation.authorizationItems.map((item) => `  - ${item}`).join("\n") : "",
    gapSummary.externalPreparation.localReadinessCommands?.length ? "- readiness:\n" + gapSummary.externalPreparation.localReadinessCommands.map((command) => `  - ${command}`).join("\n") : ""
  ].filter(Boolean).join("\n") : "";
  const gapSummaryContext = gapSummary ? [
    `能力差距摘要：未完成 ${gapSummary.totalOutstanding || 0} 个；本地可补齐 ${gapSummary.localActionableCount || 0} 个；外部受限 ${gapSummary.externalBlockedCount || 0} 个。`,
    gapSummary.guidance || "",
    gapSummary.nextLocalAction?.area ? `优先本地动作：${gapSummary.nextLocalAction.area} - ${gapSummary.nextLocalAction.next || ""}` : "",
    gapSummary.topLocalGaps?.length ? "本地可补齐缺口：" : "",
    formatGapItems(gapSummary.topLocalGaps || []),
    gapSummary.topExternalGaps?.length ? "外部授权/平台受限缺口：" : "",
    formatGapItems(gapSummary.topExternalGaps || []),
    externalPreparationContext
  ].filter(Boolean).join("\n") : "";
  const recoveryLines = [
    ...(recovery.cues || []).map((item) => `- ${item}`),
    ...(recovery.blockers || []).map((item) => `- blocker: ${item}`),
    ...(recovery.nextActions || []).map((item) => `- next: ${item}`)
  ].slice(0, 12);
  const recoveryDetails = [
    recovery.lastFailedCommand ? `最近失败命令：\n$ ${recovery.lastFailedCommand}` : "",
    recovery.changedFiles?.length ? `最近变更文件：\n${recovery.changedFiles.map((file) => `@${file}`).join("\n")}` : "",
    recovery.selectedHunks?.length ? `最近部分应用 hunk：\n${recovery.selectedHunks.map((item) => `- ${item.path || "unknown"}：${item.selectedHunks || 0}/${item.totalHunks || "?"}`).join("\n")}` : "",
    recovery.failedCommands?.length ? `失败命令：\n${recovery.failedCommands.map((command) => `- ${command}`).join("\n")}` : "",
    recovery.verificationCommands?.length ? `可重跑验证命令：\n${recovery.verificationCommands.map((command) => `- ${command}`).join("\n")}` : ""
  ].filter(Boolean);
  const goalBrowserTriage = state.lastDebugDiagnostics?.browserTriage || recovery.browserTriage || null;
  const goalBrowserTriageContext = formatBrowserTriageContinuation(goalBrowserTriage, { title: "最近浏览器异常分诊" });
  return [
    "请基于当前可恢复状态继续推进，让这个项目更适合真实写代码和调试程序。",
    "",
    `目标：${goal?.objective || state.lastPrompt || "当前 Codex 对标改进目标"}`,
    `阶段：${goal?.phase || "idle"} / ${goal?.status || "idle"}`,
    `上次任务：${goal?.lastTaskId || "(无)"}`,
    `上次验证：${verification}`,
    goal?.pendingProposal?.id ? `待审批提案：${goal.pendingProposal.id}` : "",
    goal?.nextStep ? `记录的下一步：${goal.nextStep}` : "",
    recoveryLines.length ? "恢复摘要：" : "",
    recoveryLines.join("\n"),
    recoveryDetails.length ? "\n恢复明细：" : "",
    recoveryDetails.join("\n\n"),
    gapSummaryContext ? "\n能力差距摘要：" : "",
    gapSummaryContext,
    goalBrowserTriageContext ? "\n页面调试线索：" : "",
    goalBrowserTriageContext,
    "",
    capabilityContext ? "推荐能力缺口：" : "",
    capabilityContext,
    "",
    "要求：先核对当前工作树和必要文件；如果已有待审批 diff，先判断它是否仍适用；优先补齐推荐缺口中最影响编码/调试体验的最小闭环；需要改代码时输出最小 diff，并给出或执行安全验证命令。"
  ].filter(Boolean).join("\n");
}

function appendGoalContinuationToPrompt(goal = {}) {
  const prompt = buildGoalContinuationPrompt(goal);
  if (!prompt) {
    showToast("暂无可继续的目标状态。");
    return "";
  }
  const current = input.value.trim();
  input.value = [current, prompt].filter(Boolean).join("\n\n---\n\n");
  input.focus();
  scheduleReferencePreview({ immediate: true });
  appendToolCall({
    title: "可恢复状态已加入提示词",
    label: "goal",
    state: goal?.status || "ready",
    body: prompt.slice(0, 12000)
  });
  showToast("可恢复状态已加入提示词。");
  return prompt;
}

function runGoalContinuation(goal = {}) {
  if (state.busy) {
    showToast("代理正在运行，请稍后再继续目标。");
    return "";
  }
  const prompt = buildGoalContinuationPrompt(goal);
  if (!prompt) {
    showToast("暂无可继续的目标状态。");
    return "";
  }
  input.value = prompt;
  scheduleReferencePreview({ immediate: true });
  appendToolCall({
    title: "已启动可恢复状态继续",
    label: "goal",
    state: "running",
    body: prompt.slice(0, 12000)
  });
  showToast("正在基于可恢复状态继续。");
  submitPromptForm();
  return prompt;
}

async function stageCapabilityVerificationCommands(capability = {}) {
  if (state.busy) {
    showToast("代理正在运行，请稍后再生成能力验证命令。");
    return [];
  }
  setBusy(true, "生成能力验证命令");
  try {
    const result = await api("/api/verification-plan", {
      method: "POST",
      body: JSON.stringify({ limit: 12, commands: state.pendingCommands.map((item) => item.command || item) })
    });
    const commands = verificationPlanCommands(result.plan);
    if (!commands.length) {
      appendToolCall({
        title: `能力验证命令未生成：${capability.area || "能力差距"}`,
        label: "$",
        state: "跳过",
        body: JSON.stringify(result.plan || {}, null, 2).slice(0, 8000)
      });
      showToast("当前验证计划没有可复用命令。");
      setBusy(false, "无验证命令");
      return [];
    }
    renderVerificationPlan(result.plan, { logCommands: true });
    stageRepairVerificationCommands(commands, {
      title: "能力补齐验证命令",
      successTitle: `能力补齐验证命令已放入面板：${capability.area || "能力差距"}`,
      source: "capability-gap"
    });
    appendToolCall({
      title: `能力补齐验证上下文：${capability.area || "能力差距"}`,
      label: "audit",
      state: result.plan?.status || "ready",
      body: [
        capability.recommendationReason ? `推荐理由：${capability.recommendationReason}` : "",
        capability.next ? `下一步建议：${capability.next}` : "",
        "",
        commandItemsToText(commands)
      ].filter(Boolean).join("\n").slice(0, 12000)
    });
    setBusy(false, "验证命令已加入");
    return commands;
  } catch (error) {
    showToast(error.message);
    appendGateFailureEvidence(error, {
      title: `能力验证命令生成失败：${capability.area || "能力差距"}`,
      kind: "capability",
      endpoint: "/api/verification-plan",
      request: {
        capability: {
          area: capability.area || "",
          status: capability.status || "",
          next: capability.next || ""
        },
        commands: state.pendingCommands.map((item) => item.command || item)
      }
    });
    setBusy(false, "验证命令失败");
    return [];
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
  const scored = (Array.isArray(capabilities) ? capabilities : [])
    .filter((item) => item && item.status !== "implemented")
    .map((item) => {
      const externalDependency = capabilityExternalDependency(item);
      const statusScore = item.status === "missing" ? 1000 : item.status === "partial" ? 500 : 100;
      const impact = impactRank.get(item.area) || 50;
      return {
        capability: { ...item, externalDependency },
        score: statusScore + impact,
        externalDependency,
        reason: [
          externalDependency ? "外部授权缺口靠后，本地可执行能力优先" : "本地可执行能力优先",
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
  return top ? {
    status: top.capability.status || "partial",
    area: top.capability.area || "",
    score: top.score,
    reason: top.reason,
    capability: top.capability
  } : null;
}

function renderCapabilityComparison(audit) {
  const comparison = audit?.comparison;
  if (!comparison?.requirements?.length) return null;
  const gapSummary = audit?.gapSummary || {};
  const card = document.createElement("div");
  card.className = `capability-scorecard ${comparison.status || "partial"}`;
  const header = document.createElement("div");
  header.className = "capability-scorecard-header";
  const title = document.createElement("strong");
  title.textContent = "写代码/调试覆盖";
  const summary = document.createElement("span");
  summary.textContent = [
    `covered ${comparison.summary?.implemented || 0}`,
    `partial ${comparison.summary?.partial || 0}`,
    `missing ${comparison.summary?.missing || 0}`
  ].join(" · ");
  header.append(title, summary);
  const grid = document.createElement("div");
  grid.className = "capability-score-grid";
  comparison.requirements.slice(0, 5).forEach((requirement) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `capability-requirement ${requirement.status || "partial"}`;
    const reqTitle = document.createElement("strong");
    reqTitle.textContent = requirement.title || "对标需求";
    const reqMeta = document.createElement("small");
    const gapNames = (requirement.gaps || []).map((gap) => gap.area).slice(0, 2);
    reqMeta.textContent = gapNames.length
      ? `缺口：${gapNames.join("、")}`
      : "本地证据已覆盖";
    button.append(reqTitle, reqMeta);
    button.addEventListener("click", () => {
      appendToolCall({
        title: `Codex 对标需求：${requirement.title || requirement.id}`,
        label: "audit",
        state: requirement.status || "unknown",
        body: JSON.stringify(requirement, null, 2).slice(0, 12000)
      });
    });
    grid.appendChild(button);
  });
  const footer = document.createElement("small");
  footer.className = "capability-scorecard-footer";
  footer.textContent = gapSummary.totalOutstanding
    ? `未完成 ${gapSummary.totalOutstanding} 个；本地可补齐 ${gapSummary.localActionableCount || 0} 个；外部受限 ${gapSummary.externalBlockedCount || 0} 个。${gapSummary.nextLocalAction?.area ? ` 优先：${gapSummary.nextLocalAction.area}` : ""}`
    : comparison.externalBlockedGaps?.length
      ? `外部授权相关缺口 ${comparison.externalBlockedGaps.length} 个；本地可继续补齐 ${comparison.localActionableGaps?.length || 0} 个。`
    : "剩余缺口均可在本地继续收敛。";
  const actions = document.createElement("div");
  actions.className = "capability-score-actions";
  actions.innerHTML = `<button type="button" data-action="local-gaps" ${comparison.localActionableGaps?.length ? "" : "disabled"}>本地补齐</button><button type="button" data-action="external-gaps" ${comparison.externalBlockedGaps?.length ? "" : "disabled"}>授权清单</button>`;
  actions.querySelector("[data-action='local-gaps']").addEventListener("click", () => {
    runCapabilityGapListRepair(comparison.localActionableGaps || [], {
      title: "本地可补齐能力缺口",
      mode: "local"
    });
  });
  actions.querySelector("[data-action='external-gaps']").addEventListener("click", () => {
    appendCapabilityGapListToPrompt(comparison.externalBlockedGaps || [], {
      title: "外部授权阻塞能力缺口",
      mode: "external"
    });
  });
  card.append(header, grid, footer, actions);
  return card;
}

function renderCapabilities(audit) {
  if (!capabilityList) return;
  state.lastCapabilityAudit = audit || null;
  capabilityList.innerHTML = "";
  const capabilities = audit?.capabilities || [];
  if (!capabilities.length) {
    capabilityList.textContent = "暂无能力矩阵";
    return;
  }
  const statusRank = { missing: 0, partial: 1, implemented: 2 };
  const visibleCapabilities = [...capabilities]
    .sort((a, b) => {
      const aRank = statusRank[a.status] ?? 1;
      const bRank = statusRank[b.status] ?? 1;
      if (aRank !== bRank) return aRank - bRank;
      return String(a.area || "").localeCompare(String(b.area || ""), "zh-Hans-CN");
    })
    .slice(0, 10);
  const summary = audit?.summary || capabilities.reduce((acc, item) => {
    const status = item.status || "unknown";
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {});
  const summaryRow = document.createElement("div");
  summaryRow.className = "capability-summary";
  summaryRow.innerHTML = `<strong>缺口优先</strong><span></span>`;
  summaryRow.querySelector("span").textContent = [
    `partial ${summary.partial || 0}`,
    `missing ${summary.missing || 0}`,
    `implemented ${summary.implemented || 0}`
  ].join(" · ");
  capabilityList.appendChild(summaryRow);
  const comparisonCard = renderCapabilityComparison(audit);
  if (comparisonCard) capabilityList.appendChild(comparisonCard);
  if (audit?.gapSummary?.totalOutstanding) {
    const gapSummary = audit.gapSummary;
    const gapCard = document.createElement("div");
    gapCard.className = `capability-gap-summary ${gapSummary.status || "partial"}`;
    const localNames = (gapSummary.topLocalGaps || []).map((item) => item.area).filter(Boolean).slice(0, 3);
    const externalNames = (gapSummary.topExternalGaps || []).map((item) => item.area).filter(Boolean).slice(0, 3);
    gapCard.innerHTML = `
      <strong>剩余差距摘要</strong>
      <small></small>
      <span class="capability-actions">
        <button type="button" data-action="detail">详情</button>
        <button type="button" data-action="local">本地缺口</button>
        <button type="button" data-action="external">授权缺口</button>
        <button type="button" data-action="prepare">准备清单</button>
        <button type="button" data-action="readiness">预检命令</button>
      </span>
    `;
    gapCard.querySelector("small").textContent = [
      localNames.length ? `本地：${localNames.join("、")}` : "本地：暂无",
      externalNames.length ? `外部：${externalNames.join("、")}` : "外部：暂无",
      gapSummary.guidance || ""
    ].filter(Boolean).join(" · ");
    gapCard.querySelector("[data-action='detail']").addEventListener("click", (event) => {
      event.stopPropagation();
      appendToolCall({
        title: "能力差距摘要",
        label: "audit",
        state: gapSummary.status || "partial",
        body: JSON.stringify(gapSummary, null, 2).slice(0, 12000)
      });
    });
    gapCard.querySelector("[data-action='local']").addEventListener("click", (event) => {
      event.stopPropagation();
      runCapabilityGapListRepair(audit.comparison?.localActionableGaps || [], {
        title: "本地可补齐能力缺口",
        mode: "local"
      });
    });
    gapCard.querySelector("[data-action='external']").addEventListener("click", (event) => {
      event.stopPropagation();
      appendCapabilityGapListToPrompt(audit.comparison?.externalBlockedGaps || [], {
        title: "外部授权阻塞能力缺口",
        mode: "external"
      });
    });
    gapCard.querySelector("[data-action='prepare']").addEventListener("click", (event) => {
      event.stopPropagation();
      const preparation = gapSummary.externalPreparation || {};
      const context = [
        "请基于这份外部缺口本地准备清单继续推进 Codex 对标。",
        "",
        `外部缺口数量：${preparation.count || gapSummary.externalBlockedCount || 0}`,
        preparation.firstAction ? `优先准备动作：${preparation.firstAction}` : "",
        preparation.authorizationItems?.length ? "需要确认/准备：" : "",
        ...(preparation.authorizationItems || []).map((item) => `- ${item}`),
        preparation.localReadinessCommands?.length ? "\n本地可跑预检：" : "",
        ...(preparation.localReadinessCommands || []).map((command) => `- ${command}`),
        "",
        "要求：不要执行远端写入；先把授权、凭据、CLI 登录、风险边界和本地只读预检整理成可执行清单。"
      ].filter(Boolean).join("\n");
      const current = input.value.trim();
      input.value = [current, context].filter(Boolean).join("\n\n---\n\n");
      input.focus();
      scheduleReferencePreview({ immediate: true });
      appendToolCall({
        title: "外部缺口准备清单已加入提示词",
        label: "auth",
        state: "ready",
        body: context.slice(0, 12000)
      });
      showToast("外部缺口准备清单已加入提示词。");
    });
    gapCard.querySelector("[data-action='readiness']").addEventListener("click", (event) => {
      event.stopPropagation();
      stageExternalPreparationReadinessCommands(gapSummary);
    });
    gapCard.addEventListener("click", () => {
      appendToolCall({
        title: "能力差距摘要",
        label: "audit",
        state: gapSummary.status || "partial",
        body: JSON.stringify(gapSummary, null, 2).slice(0, 12000)
      });
    });
    capabilityList.appendChild(gapCard);
  }
  const recommendedNext = audit?.recommendedNext?.capability ? audit.recommendedNext : selectCapabilityRecommendation(capabilities);
  const recommendedCapability = recommendedNext?.capability
    ? {
      ...recommendedNext.capability,
      recommendationReason: recommendedNext.reason || ""
    }
    : null;
  if (recommendedCapability) {
    const recommendedExternal = capabilityExternalDependency(recommendedCapability);
    const recommendation = document.createElement("div");
    recommendation.className = `capability-recommendation ${recommendedCapability.status || "partial"}`;
    recommendation.innerHTML = `
      <div>
        <strong></strong>
        <small></small>
      </div>
      <span class="capability-actions">
        <button type="button" data-action="detail">详情</button>
        <button type="button" data-action="task">任务卡</button>
        <button type="button" data-action="prompt">加入提示词</button>
        <button type="button" data-action="commands">验证命令</button>
        <button type="button" data-action="repair">直接补齐</button>
      </span>
    `;
    recommendation.querySelector("strong").textContent = `推荐下一步 · ${recommendedCapability.area || "能力差距"}`;
    recommendation.querySelector("small").textContent = recommendedCapability.recommendationReason || recommendedCapability.next || "优先补齐最影响编码/调试体验的闭环。";
    recommendation.querySelector("[data-action='repair']").textContent = recommendedExternal ? "准备清单" : "直接补齐";
    recommendation.querySelector("[data-action='detail']").addEventListener("click", (event) => {
      event.stopPropagation();
      appendToolCall({
        title: `推荐能力差距：${recommendedCapability.area}`,
        label: "audit",
        state: recommendedCapability.status || "unknown",
        body: JSON.stringify({
          recommendedNext: audit?.recommendedNext || null,
          capability: recommendedCapability
        }, null, 2)
      });
    });
    recommendation.querySelector("[data-action='prompt']").addEventListener("click", (event) => {
      event.stopPropagation();
      appendCapabilityGapToPrompt(recommendedCapability);
    });
    recommendation.querySelector("[data-action='task']").addEventListener("click", (event) => {
      event.stopPropagation();
      appendCapabilityTaskCard(recommendedCapability);
    });
    recommendation.querySelector("[data-action='commands']").addEventListener("click", async (event) => {
      event.stopPropagation();
      stageCapabilityTaskCommands(recommendedCapability);
    });
    recommendation.querySelector("[data-action='repair']").addEventListener("click", (event) => {
      event.stopPropagation();
      runCapabilityGapRepair(recommendedCapability);
    });
    recommendation.addEventListener("click", () => {
      appendToolCall({
        title: `推荐能力差距：${recommendedCapability.area}`,
        label: "audit",
        state: recommendedCapability.status || "unknown",
        body: JSON.stringify({
          recommendedNext: audit?.recommendedNext || null,
          capability: recommendedCapability
        }, null, 2)
      });
    });
    capabilityList.appendChild(recommendation);
  }
  visibleCapabilities.forEach((capability) => {
    const externalBlocked = capabilityExternalDependency(capability);
    const row = document.createElement("div");
    row.className = `capability-row ${capability.status || "partial"}`;
    row.innerHTML = `<strong></strong><small></small><span class="capability-actions"><button type="button" data-action="detail">详情</button><button type="button" data-action="task">任务卡</button><button type="button" data-action="prompt">加入提示词</button><button type="button" data-action="commands">验证命令</button><button type="button" data-action="repair">直接补齐</button></span>`;
    row.querySelector("strong").textContent = capability.area || "能力";
    row.querySelector("small").textContent = `${capability.status || "unknown"} · ${capability.next || ""}`;
    row.querySelector("[data-action='repair']").textContent = externalBlocked ? "准备清单" : "直接补齐";
    row.querySelector("[data-action='detail']").addEventListener("click", (event) => {
      event.stopPropagation();
      appendToolCall({
        title: `能力详情：${capability.area}`,
        label: "audit",
        state: capability.status || "unknown",
        body: JSON.stringify(capability, null, 2)
      });
    });
    row.querySelector("[data-action='prompt']").addEventListener("click", (event) => {
      event.stopPropagation();
      appendCapabilityGapToPrompt(capability);
    });
    row.querySelector("[data-action='task']").addEventListener("click", (event) => {
      event.stopPropagation();
      appendCapabilityTaskCard(capability);
    });
    row.querySelector("[data-action='commands']").addEventListener("click", async (event) => {
      event.stopPropagation();
      stageCapabilityTaskCommands(capability);
    });
    row.querySelector("[data-action='repair']").addEventListener("click", (event) => {
      event.stopPropagation();
      runCapabilityGapRepair(capability);
    });
    row.addEventListener("click", () => {
      appendToolCall({
        title: `能力详情：${capability.area}`,
        label: "audit",
        state: capability.status || "unknown",
        body: JSON.stringify(capability, null, 2)
      });
    });
    capabilityList.appendChild(row);
  });
}

function catalogEvidenceTitle(kind, item = {}) {
  if (kind === "tool") return `工具目录证据：${item.name || "tool"}`;
  if (kind === "extension") return `扩展目录证据：${item.name || "extension"}`;
  if (kind === "mcp") return `MCP 目录证据：${item.name || "mcp-server"}`;
  return `目录证据：${item.name || "item"}`;
}

function catalogEvidenceLabel(kind) {
  if (kind === "tool") return "tool";
  if (kind === "extension") return "extension";
  if (kind === "mcp") return "mcp";
  return "catalog";
}

function compactCatalogEvidence(kind, item = {}, max = 12000) {
  return JSON.stringify({ kind, item }, null, 2).slice(0, max);
}

function catalogEvidenceGuidance(kind) {
  if (kind === "extension") {
    return "这是扩展目录证据。优先检查 manifest、信任状态、工具声明和审批策略；需要调用扩展工具时只生成审批示例或准备清单，不直接执行外部工具。";
  }
  if (kind === "mcp") {
    return "这是 MCP 目录证据。优先检查 server 配置、探测结果、资源/工具目录和审批边界；tools/call 必须走审批示例，不绕过权限直接执行。";
  }
  if (kind === "tool") {
    return "这是本地内置工具目录证据。优先补齐目录说明、参数 schema、验证入口或失败恢复路径，让工具更好服务写代码和调试。";
  }
  return "优先保持只读证据、审批边界和本地可验证路径。";
}

function buildCatalogEvidenceContext(kind, item = {}) {
  const name = item.name || (kind === "mcp" ? "mcp-server" : kind);
  const description = item.description || item.probe?.serverInfo?.name || "";
  const status = item.status || item.type || item.policy?.access || item.probe?.status || "unknown";
  const source = item.source || item.policy?.source || item.transport || "";
  const toolCount = kind === "mcp"
    ? item.probe?.counts?.tools || 0
    : Array.isArray(item.tools) ? item.tools.length : 0;
  const resourceCount = item.probe?.counts?.resources || 0;
  const promptCount = item.probe?.counts?.prompts || 0;
  const trustStatus = item.trust?.status || "";
  const requiresApproval = item.policy?.requiresApproval !== undefined
    ? item.policy.requiresApproval
    : kind === "mcp" || kind === "extension";
  return [
    "请基于这条工具/扩展/MCP 目录证据继续改进当前项目，让它更接近 Codex 的可操作编码与调试体验。",
    "",
    `类型：${kind}`,
    `名称：${name}`,
    `状态：${status}`,
    description ? `说明：${description}` : "",
    source ? `来源：${source}` : "",
    trustStatus ? `信任状态：${trustStatus}` : "",
    `审批要求：${requiresApproval ? "需要审批" : "无需审批"}`,
    toolCount ? `工具数量：${toolCount}` : "",
    resourceCount ? `资源数量：${resourceCount}` : "",
    promptCount ? `提示词数量：${promptCount}` : "",
    `动作语义：${catalogRepairActionLabel(kind)}${requiresApproval ? " / 审批示例" : ""}`,
    `安全边界：${catalogEvidenceGuidance(kind)}`,
    "",
    "目录证据 JSON：",
    compactCatalogEvidence(kind, item),
    "",
    kind === "extension" || kind === "mcp"
      ? "要求：不要假装已经拥有外部工具权限；请优先生成准备清单、审批示例、本地只读探测或目录修复建议；需要改代码时输出最小 diff，并给出安全验证命令。"
      : "要求：优先判断这项能力是否已经能支撑真实写代码/调试；如有缺口，补齐最小可验证闭环；需要调用工具时保留审批边界；需要改代码时输出最小 diff，并给出安全验证命令。"
  ].filter(Boolean).join("\n");
}

function appendCatalogEvidenceToPrompt(kind, item = {}) {
  const context = buildCatalogEvidenceContext(kind, item);
  if (!context) {
    showToast("暂无可加入提示词的目录证据。");
    return "";
  }
  const current = input.value.trim();
  input.value = [current, context].filter(Boolean).join("\n\n---\n\n");
  input.focus();
  scheduleReferencePreview({ immediate: true });
  appendToolCall({
    title: `${catalogEvidenceTitle(kind, item)}已加入提示词`,
    label: catalogEvidenceLabel(kind),
    state: item.status || item.policy?.access || item.probe?.status || "catalog",
    body: context.slice(0, 12000)
  });
  showToast("目录证据已加入提示词。");
  return context;
}

function runCatalogEvidenceRepair(kind, item = {}) {
  if (state.busy) {
    showToast("代理正在运行，请稍后再启动目录证据修复。");
    return "";
  }
  const context = buildCatalogEvidenceContext(kind, item);
  if (!context) {
    showToast("暂无可用于修复的目录证据。");
    return "";
  }
  const prompt = [
    context,
    "",
    kind === "extension" || kind === "mcp"
      ? "请现在基于这条目录证据继续改进：优先补齐准备清单、审批示例、目录探测、信任/权限说明或失败恢复证据；不要直接执行外部工具调用；更新必要文档，并执行或给出安全验证命令。"
      : "请现在直接基于这条目录证据继续改进：补齐工具在真实编码、调试、证据复用或审批闭环上的最大短板；保留安全边界，更新必要文档，并执行或给出安全验证命令。"
  ].join("\n");
  input.value = prompt;
  scheduleReferencePreview({ immediate: true });
  appendToolCall({
    title: `已启动目录证据修复：${item.name || kind}`,
    label: catalogEvidenceLabel(kind),
    state: "running",
    body: prompt.slice(0, 12000)
  });
  showToast("正在基于目录证据启动修复。");
  submitPromptForm();
  return prompt;
}

function mcpResourceTitle(detail = {}) {
  return `${detail.serverName || "mcp"} ${detail.uri || "resource"}`.trim();
}

function compactMcpResourceEvidence(detail = {}, max = 12000) {
  return JSON.stringify({
    serverName: detail.serverName,
    uri: detail.uri,
    policy: detail.policy,
    contents: detail.contents,
    errors: detail.errors
  }, null, 2).slice(0, max);
}

function buildMcpResourceEvidenceContext(detail = {}) {
  const contents = detail.contents || [];
  if (!detail.serverName && !detail.uri && !contents.length) return "";
  const textBlocks = contents
    .map((item, index) => {
      const text = item.text || item.blob || item.mimeType || "";
      return text ? `### content ${index + 1}\n${String(text).slice(0, 6000)}` : "";
    })
    .filter(Boolean)
    .join("\n\n");
  return [
    "请基于这份 MCP resource 内容继续排查、集成或修复当前项目。",
    "",
    `MCP server：${detail.serverName || ""}`,
    `Resource URI：${detail.uri || ""}`,
    detail.policy ? `策略：${JSON.stringify(detail.policy)}` : "",
    "",
    "Resource 内容：",
    textBlocks || compactMcpResourceEvidence(detail, 8000),
    "",
    "要求：先判断这份 resource 是否包含代码、配置、接口 schema、文档或调试线索；如果需要改当前项目，请输出最小 diff；如果需要调用 MCP tool，必须保留审批边界；给出安全验证命令。"
  ].filter(Boolean).join("\n");
}

function appendMcpResourceEvidenceToPrompt(detail = {}) {
  const context = buildMcpResourceEvidenceContext(detail);
  if (!context) {
    showToast("暂无可加入提示词的 MCP 资源证据。");
    return "";
  }
  const current = input.value.trim();
  input.value = [current, context].filter(Boolean).join("\n\n---\n\n");
  input.focus();
  scheduleReferencePreview({ immediate: true });
  appendToolCall({
    title: `MCP 资源证据已加入提示词：${mcpResourceTitle(detail)}`,
    label: "mcp",
    state: "ready",
    body: context.slice(0, 12000)
  });
  showToast("MCP 资源证据已加入提示词。");
  return context;
}

function runMcpResourceEvidenceRepair(detail = {}) {
  if (state.busy) {
    showToast("代理正在运行，请稍后再处理 MCP 资源。");
    return "";
  }
  const context = buildMcpResourceEvidenceContext(detail);
  if (!context) {
    showToast("暂无可用于处理的 MCP 资源证据。");
    return "";
  }
  const prompt = [
    context,
    "",
    "请现在直接基于这份 MCP resource 继续处理：优先把 resource 中的可用线索转成代码修复、配置补齐、接口适配或下一步安全验证。"
  ].join("\n");
  input.value = prompt;
  scheduleReferencePreview({ immediate: true });
  appendToolCall({
    title: `已启动 MCP 资源处理：${mcpResourceTitle(detail)}`,
    label: "mcp",
    state: "running",
    body: prompt.slice(0, 12000)
  });
  showToast("正在基于 MCP 资源启动处理。");
  submitPromptForm();
  return prompt;
}

function appendMcpResourceEvidenceCard(detail = {}) {
  appendToolCall({
    title: `MCP 资源读取：${mcpResourceTitle(detail)}`,
    label: "mcp",
    state: detail.contents?.length ? "完成" : "empty",
    body: compactMcpResourceEvidence(detail)
  });
  const article = log.lastElementChild;
  if (!article) return;
  const actions = document.createElement("div");
  actions.className = "debug-last-failed-actions";
  actions.innerHTML = `<button type="button" data-action="prompt">加入提示词</button><button type="button" data-action="repair">直接处理</button>`;
  actions.querySelector("[data-action='prompt']").addEventListener("click", () => {
    appendMcpResourceEvidenceToPrompt(detail);
  });
  actions.querySelector("[data-action='repair']").addEventListener("click", () => {
    runMcpResourceEvidenceRepair(detail);
  });
  article.appendChild(actions);
}

function appendCatalogDetailCard(kind, item = {}) {
  appendToolCall({
    title: catalogEvidenceTitle(kind, item),
    label: catalogEvidenceLabel(kind),
    state: item.status || item.policy?.source || item.type || item.probe?.status || "catalog",
    body: JSON.stringify(item, null, 2).slice(0, 12000)
  });
}

function catalogRepairActionLabel(kind) {
  if (kind === "extension" || kind === "mcp") return "准备清单";
  if (kind === "asset") return "处理资产";
  return "目录修复";
}

function catalogCallActionLabel(kind) {
  if (kind === "extension") return "审批示例";
  if (kind === "mcp") return "审批示例";
  return "调用示例";
}

function renderToolCatalog(catalog) {
  if (!toolCatalogList) return;
  toolCatalogList.innerHTML = "";
  const tools = catalog?.tools || [];
  if (!tools.length) {
    toolCatalogList.textContent = "暂无工具目录";
    return;
  }
  tools.slice(0, 8).forEach((tool) => {
    const row = document.createElement("div");
    row.className = "capability-row implemented";
    row.innerHTML = `<strong></strong><small></small><span class="capability-actions"><button type="button" data-action="detail">详情</button><button type="button" data-action="prompt">加入提示词</button><button type="button" data-action="repair">${catalogRepairActionLabel("tool")}</button></span>`;
    row.querySelector("strong").textContent = tool.name || "tool";
    row.querySelector("small").textContent = `${tool.policy?.access || "unknown"} · ${tool.description || ""}`;
    row.querySelector("[data-action='detail']").addEventListener("click", (event) => {
      event.stopPropagation();
      appendCatalogDetailCard("tool", tool);
    });
    row.querySelector("[data-action='prompt']").addEventListener("click", (event) => {
      event.stopPropagation();
      appendCatalogEvidenceToPrompt("tool", tool);
    });
    row.querySelector("[data-action='repair']").addEventListener("click", (event) => {
      event.stopPropagation();
      runCatalogEvidenceRepair("tool", tool);
    });
    row.addEventListener("click", () => appendCatalogDetailCard("tool", tool));
    toolCatalogList.appendChild(row);
  });
}

function renderExtensionCatalog(catalog) {
  if (!extensionCatalogList) return;
  extensionCatalogList.innerHTML = "";
  const extensions = catalog?.extensions || [];
  if (!extensions.length) {
    extensionCatalogList.textContent = "暂无本地扩展";
    return;
  }
  extensions.slice(0, 8).forEach((extension) => {
    const row = document.createElement("div");
    row.className = "capability-row partial";
    row.innerHTML = `<strong></strong><small></small><span class="capability-actions"><button type="button" data-action="detail">详情</button><button type="button" data-action="prompt">加入提示词</button><button type="button" data-action="repair">${catalogRepairActionLabel("extension")}</button><button type="button" data-action="call">${catalogCallActionLabel("extension")}</button></span>`;
    row.querySelector("strong").textContent = extension.name || "extension";
    row.querySelector("small").textContent = `${extension.type || "extension"} · ${extension.policy?.access || "declared"} · ${extension.trust?.status || "trust-unknown"} · ${(extension.tools || []).length} 工具 · ${extension.description || ""}`;
    row.querySelector("[data-action='detail']").addEventListener("click", (event) => {
      event.stopPropagation();
      appendCatalogDetailCard("extension", extension);
    });
    row.querySelector("[data-action='prompt']").addEventListener("click", (event) => {
      event.stopPropagation();
      appendCatalogEvidenceToPrompt("extension", extension);
    });
    row.querySelector("[data-action='repair']").addEventListener("click", (event) => {
      event.stopPropagation();
      runCatalogEvidenceRepair("extension", extension);
    });
    row.addEventListener("click", () => appendCatalogDetailCard("extension", extension));
    const callButton = row.querySelector("[data-action='call']");
    callButton.disabled = !(extension.tools || []).length;
    callButton.addEventListener("click", async (event) => {
      event.stopPropagation();
      const tool = (extension.tools || [])[0] || {};
      const request = { extensionName: extension.name, toolName: tool.name, arguments: {} };
      const runCall = async () => {
        const plan = await api("/api/extension-tool-call", {
          method: "POST",
          body: JSON.stringify(request)
        });
        appendApprovalPlanCard(plan, {
          title: `扩展工具调用审批：${extension.name}.${tool.name}`,
          label: "extension",
        });
        await refreshHealth();
      };
      try {
        await runCall();
      } catch (error) {
        showToast(error.message);
        appendActionFailureEvidence({
          kind: "extension",
          action: "extension-tool-call",
          targetName: `${extension.name || "extension"}.${tool.name || "tool"}`,
          endpoint: "/api/extension-tool-call",
          request,
          item: extension,
          error
        }, {
          title: `扩展工具调用失败：${extension.name}`,
          label: "extension",
          retry: runCall,
          safe: () => runCatalogEvidenceRepair("extension", extension)
        });
      }
    });
    extensionCatalogList.appendChild(row);
  });
}

function renderMcpCatalog(catalog) {
  if (!mcpCatalogList) return;
  mcpCatalogList.innerHTML = "";
  const servers = catalog?.servers || [];
  if (!servers.length) {
    mcpCatalogList.textContent = "暂无 MCP 配置";
    return;
  }
  servers.slice(0, 8).forEach((server) => {
    const row = document.createElement("div");
    const probe = server.probe || {};
    row.className = `capability-row ${server.disabled ? "missing" : probe.status === "probed" ? "implemented" : "partial"}`;
    row.innerHTML = `<strong></strong><small></small><span class="capability-actions"><button type="button" data-action="detail">详情</button><button type="button" data-action="resource">读资源</button><button type="button" data-action="prompt">加入提示词</button><button type="button" data-action="repair">${catalogRepairActionLabel("mcp")}</button><button type="button" data-action="call">${catalogCallActionLabel("mcp")}</button></span>`;
    row.querySelector("strong").textContent = server.name || "mcp-server";
    const probeText = probe.status
      ? ` · ${probe.status}${probe.counts ? ` · ${probe.counts.tools || 0} 工具 / ${probe.counts.resources || 0} 资源` : ""}`
      : "";
    row.querySelector("small").textContent = `${server.transport || "stdio"} · ${server.status || "configured"}${probeText} · ${server.source || ""}`;
    row.querySelector("[data-action='detail']").addEventListener("click", (event) => {
      event.stopPropagation();
      appendCatalogDetailCard("mcp", server);
    });
    row.querySelector("[data-action='prompt']").addEventListener("click", (event) => {
      event.stopPropagation();
      appendCatalogEvidenceToPrompt("mcp", server);
    });
    row.querySelector("[data-action='repair']").addEventListener("click", (event) => {
      event.stopPropagation();
      runCatalogEvidenceRepair("mcp", server);
    });
    row.addEventListener("click", () => appendCatalogDetailCard("mcp", server));
    const resourceButton = row.querySelector("[data-action='resource']");
    resourceButton.disabled = probe.status !== "probed" || !probe.resources?.length;
    resourceButton.addEventListener("click", async (event) => {
      event.stopPropagation();
      const resource = (probe.resources || [])[0] || {};
      const request = { serverName: server.name, uri: resource.uri };
      const readResource = async () => {
        const detail = await api("/api/mcp-resource", {
          method: "POST",
          body: JSON.stringify(request)
        });
        appendMcpResourceEvidenceCard({
          ...detail,
          serverName: server.name,
          uri: resource.uri
        });
      };
      try {
        await readResource();
      } catch (error) {
        showToast(error.message);
        appendActionFailureEvidence({
          kind: "mcp",
          action: "mcp-resource-read",
          targetName: `${server.name || "mcp"}.${resource.uri || "resource"}`,
          endpoint: "/api/mcp-resource",
          request,
          item: server,
          error
        }, {
          title: `MCP 资源读取失败：${server.name}`,
          label: "mcp",
          retry: readResource,
          safe: () => runCatalogEvidenceRepair("mcp", server)
        });
      }
    });
    const callButton = row.querySelector("[data-action='call']");
    callButton.disabled = probe.status !== "probed" || !probe.tools?.length;
    callButton.addEventListener("click", async (event) => {
      event.stopPropagation();
      const tool = (probe.tools || [])[0] || {};
      const request = { serverName: server.name, toolName: tool.name, arguments: {} };
      const runCall = async () => {
        const plan = await api("/api/mcp-tool-call", {
          method: "POST",
          body: JSON.stringify(request)
        });
        appendApprovalPlanCard(plan, {
          title: `MCP 工具调用审批：${server.name}.${tool.name}`,
          label: "mcp",
        });
        await refreshHealth();
      };
      try {
        await runCall();
      } catch (error) {
        showToast(error.message);
        appendActionFailureEvidence({
          kind: "mcp",
          action: "mcp-tool-call",
          targetName: `${server.name || "mcp"}.${tool.name || "tool"}`,
          endpoint: "/api/mcp-tool-call",
          request,
          item: server,
          error
        }, {
          title: `MCP 工具调用失败：${server.name}`,
          label: "mcp",
          retry: runCall,
          safe: () => runCatalogEvidenceRepair("mcp", server)
        });
      }
    });
    mcpCatalogList.appendChild(row);
  });
}

function compactAssetEvidence(asset = {}, detail = null, max = 12000) {
  return JSON.stringify({
    asset,
    detail
  }, null, 2).slice(0, max);
}

async function inspectAsset(asset = {}) {
  if (!asset?.path) throw new Error("资产缺少 path。");
  return api(`/api/asset-inspect?path=${encodeURIComponent(asset.path)}`);
}

function buildAssetEvidenceContext(asset = {}, detail = null) {
  if (!asset?.path) return "";
  return [
    "请基于这个工作区资产继续排查、解释或修改当前项目。",
    "",
    `资产路径：${asset.path}`,
    `资产类型：${asset.type || "unknown"}`,
    asset.ext ? `扩展名：${asset.ext}` : "",
    asset.size ? `大小：${formatBytes(asset.size)}` : "",
    "",
    "资产检查摘要：",
    compactAssetEvidence(asset, detail),
    "",
    "要求：优先使用 @file 引用读取原始资产；如果资产暴露 UI、数据、文档或多媒体处理问题，请输出最小 diff 或下一步安全验证命令。"
  ].filter(Boolean).join("\n");
}

function appendAssetFailureEvidence(asset = {}, error, {
  title = "资产处理失败",
  action = "asset-inspect",
  retry = null
} = {}) {
  return appendActionFailureEvidence({
    kind: "asset",
    action,
    targetName: asset.path || "asset",
    endpoint: asset.path ? `/api/asset-inspect?path=${encodeURIComponent(asset.path)}` : "/api/asset-inspect",
    request: { path: asset.path || "" },
    item: asset,
    error
  }, {
    title,
    label: "asset",
    retry,
    safe: asset.path ? () => referenceFileInPrompt(asset.path, { titlePrefix: "已引用资产文件" }) : null
  });
}

async function appendAssetEvidenceToPrompt(asset = {}) {
  const retry = () => appendAssetEvidenceToPrompt(asset);
  try {
    const detail = await inspectAsset(asset);
    const context = buildAssetEvidenceContext(asset, detail);
    if (!context) {
      showToast("暂无可加入提示词的资产证据。");
      return "";
    }
    const current = input.value.trim();
    input.value = [current, context].filter(Boolean).join("\n\n---\n\n");
    input.focus();
    scheduleReferencePreview({ immediate: true });
    appendToolCall({
      title: `资产证据已加入提示词：${asset.path}`,
      label: "asset",
      state: detail.type || asset.type || "ready",
      body: context.slice(0, 12000)
    });
    showToast("资产证据已加入提示词。");
    return context;
  } catch (error) {
    showToast(error.message);
    appendAssetFailureEvidence(asset, error, {
      title: `资产证据加入失败：${asset.path || "asset"}`,
      action: "asset-prompt",
      retry
    });
    return "";
  }
}

async function runAssetEvidenceRepair(asset = {}) {
  if (state.busy) {
    showToast("代理正在运行，请稍后再启动资产处理。");
    return "";
  }
  const retry = () => runAssetEvidenceRepair(asset);
  try {
    const detail = await inspectAsset(asset);
    const context = buildAssetEvidenceContext(asset, detail);
    if (!context) {
      showToast("暂无可用于处理的资产证据。");
      return "";
    }
    const prompt = [
      context,
      "",
      "请现在直接基于这个资产继续处理：判断它对当前编码/调试任务的价值，必要时修改代码接入、解析、展示或验证该资产，并给出安全验证命令。"
    ].join("\n");
    input.value = prompt;
    scheduleReferencePreview({ immediate: true });
    appendToolCall({
      title: `已启动资产证据处理：${asset.path}`,
      label: "asset",
      state: "running",
      body: prompt.slice(0, 12000)
    });
    showToast("正在基于资产证据启动处理任务。");
    submitPromptForm();
    return prompt;
  } catch (error) {
    showToast(error.message);
    appendAssetFailureEvidence(asset, error, {
      title: `资产证据处理失败：${asset.path || "asset"}`,
      action: "asset-repair",
      retry
    });
    return "";
  }
}

function renderAssetCatalog(catalog) {
  if (!assetCatalogList) return;
  assetCatalogList.innerHTML = "";
  const assets = catalog?.assets || [];
  if (!assets.length) {
    assetCatalogList.textContent = "暂无多模态资产";
    return;
  }
  assets.slice(0, 8).forEach((asset) => {
    const row = document.createElement("div");
    row.className = "capability-row partial";
    row.innerHTML = `<strong></strong><small></small><span class="capability-actions"><button type="button" data-action="detail">详情</button><button type="button" data-action="reference">引用文件</button><button type="button" data-action="prompt">加入提示词</button><button type="button" data-action="repair">直接处理</button></span>`;
    row.querySelector("strong").textContent = asset.path || "asset";
    row.querySelector("small").textContent = `${asset.type || "asset"} · ${asset.ext || ""} · ${Math.round((asset.size || 0) / 1024)} KB`;
    const showDetail = async () => {
      try {
        const detail = await inspectAsset(asset);
        appendToolCall({
          title: `资产检查：${asset.path}`,
          label: "asset",
          state: detail.type || "inspected",
          body: JSON.stringify(detail, null, 2).slice(0, 12000)
        });
      } catch (error) {
        showToast(error.message);
        appendAssetFailureEvidence(asset, error, {
          title: `资产检查失败：${asset.path}`,
          action: "asset-detail",
          retry: showDetail
        });
      }
    };
    row.querySelector("[data-action='detail']").addEventListener("click", async (event) => {
      event.stopPropagation();
      await showDetail();
    });
    row.querySelector("[data-action='reference']").addEventListener("click", (event) => {
      event.stopPropagation();
      referenceFileInPrompt(asset.path, { titlePrefix: "已引用资产文件" });
    });
    row.querySelector("[data-action='prompt']").addEventListener("click", async (event) => {
      event.stopPropagation();
      await appendAssetEvidenceToPrompt(asset);
    });
    row.querySelector("[data-action='repair']").addEventListener("click", async (event) => {
      event.stopPropagation();
      await runAssetEvidenceRepair(asset);
    });
    row.addEventListener("click", async () => {
      await showDetail();
    });
    assetCatalogList.appendChild(row);
  });
}

function renderGoal(goal) {
  if (!goalState) return;
  const objective = goal?.objective || "暂无目标";
  const phase = goal?.phase || "idle";
  const status = goal?.status || "idle";
  const nextStep = goal?.nextStep || "输入任务并运行代理。";
  const recovery = state.lastRecoverySummary || {};
  const gapSummary = recovery.capabilityGapSummary || state.lastCapabilityAudit?.gapSummary || null;
  const externalPreparation = gapSummary?.externalPreparation || null;
  const verification = goal?.lastVerification
    ? `验证：${goal.lastVerification.skipped ? "跳过" : goal.lastVerification.ok ? "通过" : "失败"} · ${goal.lastVerification.checkCount || 0} 项`
    : "验证：暂无";
  goalState.querySelector("p").textContent = objective;
  goalState.querySelector("small").textContent = `${phase} / ${status} · ${verification} · 下一步：${nextStep}`;
  let recoveryBox = goalState.querySelector(".goal-recovery-summary");
  if (!recoveryBox) {
    recoveryBox = document.createElement("div");
    recoveryBox.className = "goal-recovery-summary";
    goalState.appendChild(recoveryBox);
  }
  const recoveryItems = [
    ...(recovery.cues || []),
    gapSummary ? `能力缺口：本地 ${gapSummary.localActionableCount || 0} / 外部 ${gapSummary.externalBlockedCount || 0}` : "",
    externalPreparation?.authorizationItems?.length ? `外部准备：${externalPreparation.authorizationItems.length}` : "",
    externalPreparation?.localReadinessCommands?.length ? `本地预检：${externalPreparation.localReadinessCommands.length}` : "",
    recovery.lastFailedCommand ? `失败命令：${recovery.lastFailedCommand}` : "",
    recovery.changedFiles?.length ? `变更文件：${recovery.changedFiles.length}` : "",
    recovery.verificationCommands?.length ? `验证命令：${recovery.verificationCommands.length}` : "",
    ...(recovery.nextActions || []).slice(0, 2).map((item) => `下一步：${item}`)
  ].filter(Boolean).slice(0, 8);
  recoveryBox.innerHTML = recoveryItems.length
    ? recoveryItems.map((item) => `<span></span>`).join("")
    : `<span>暂无恢复线索</span>`;
  recoveryBox.querySelectorAll("span").forEach((item, index) => {
    item.textContent = recoveryItems[index] || "暂无恢复线索";
  });
  let actions = goalState.querySelector(".goal-actions");
  if (!actions) {
    actions = document.createElement("div");
    actions.className = "goal-actions";
    actions.innerHTML = `
      <button type="button" data-goal-action="prompt">加入提示词</button>
      <button type="button" data-goal-action="commands">验证命令</button>
      <button type="button" data-goal-action="readiness">预检命令</button>
      <button type="button" data-goal-action="continue">继续目标</button>
    `;
    goalState.appendChild(actions);
  }
  const capability = recommendedCapabilityFromState();
  const canContinue = Boolean(goal?.objective || state.lastPrompt || capability);
  const recoveryCommands = normalizeCommandItems((recovery.verificationCommands || []).map((command) => ({
    command,
    reason: "从可恢复状态恢复的最近验证命令。"
  })));
  actions.querySelector("[data-goal-action='prompt']").disabled = !canContinue;
  actions.querySelector("[data-goal-action='commands']").disabled = !capability && !recoveryCommands.length;
  actions.querySelector("[data-goal-action='readiness']").disabled = !externalPreparation?.localReadinessCommands?.length;
  actions.querySelector("[data-goal-action='continue']").disabled = !canContinue;
  actions.querySelector("[data-goal-action='prompt']").onclick = () => appendGoalContinuationToPrompt(goal);
  actions.querySelector("[data-goal-action='commands']").onclick = async () => {
    if (recoveryCommands.length) {
      stageRepairVerificationCommands(recoveryCommands, {
        title: "可恢复状态验证命令",
        successTitle: "可恢复状态验证命令已放入面板",
        source: "goal-recovery"
      });
      return;
    }
    await stageCapabilityVerificationCommands(capability || {});
  };
  actions.querySelector("[data-goal-action='readiness']").onclick = () => {
    stageExternalPreparationReadinessCommands(gapSummary || {});
  };
  actions.querySelector("[data-goal-action='continue']").onclick = () => runGoalContinuation(goal);
}

function restorePendingProposal(goal) {
  const proposal = goal?.pendingProposal;
  if (!proposal?.diff || proposal.id === state.restoredProposalId || state.pendingDiff) return;
  state.restoredProposalId = proposal.id;
  state.lastPrompt = proposal.prompt || goal.lastPrompt || "";
  state.pendingDiff = proposal.diff || "";
  renderPlan(proposal.plan || []);
  renderDiff(proposal.patches || []);
  renderCommands(proposal.commands || []);
  renderReview(proposal.review || []);
  appendMessage("agent", `已恢复待审批方案：${proposal.type === "repair" ? "修复 diff" : "代理 diff"}。`);
}

function buildQueuePromptContext(item = {}) {
  if (!item?.id && !item?.prompt) return "";
  const recommendedCapability = recommendedCapabilityFromState();
  const recommendedCapabilityContext = recommendedCapability ? buildCapabilityGapContext(recommendedCapability) : "";
  const queueBrowserTriageContext = formatBrowserTriageContinuation(item.browserTriage || state.lastDebugDiagnostics?.browserTriage || null, { title: "队列关联浏览器异常分诊" });
  return [
    "请基于这条队列任务继续当前编码/调试工作。",
    "",
    `队列 ID：${item.id || ""}`,
    `状态：${item.status || "queued"}`,
    `隔离组：${item.isolationGroup || "default"}`,
    `优先级：${item.priority || 0}`,
    `重试：${item.retryCount || 0}/${item.retryLimit || 0}`,
    item.createdAt ? `创建时间：${item.createdAt}` : "",
    "",
    "队列任务提示词：",
    item.prompt || "(无提示词)",
    queueBrowserTriageContext ? `页面调试线索：\n${queueBrowserTriageContext}` : "",
    recommendedCapabilityContext ? `推荐能力缺口：\n${recommendedCapabilityContext}` : "",
    "",
    "队列证据 JSON：",
    JSON.stringify(item, null, 2).slice(0, 8000),
    "",
    "要求：先核对当前工作树和必要文件；如果队列任务已经过期，请以当前状态为准调整；优先结合推荐能力缺口完成最小可验证改动，并给出或执行安全验证命令。"
  ].filter(Boolean).join("\n");
}

function appendQueueContextToPrompt(item = {}) {
  const context = buildQueuePromptContext(item);
  if (!context) {
    showToast("暂无可加入提示词的队列任务。");
    return "";
  }
  const current = input.value.trim();
  input.value = [current, context].filter(Boolean).join("\n\n---\n\n");
  input.focus();
  scheduleReferencePreview({ immediate: true });
  appendToolCall({
    title: `队列任务已加入提示词：${item.id || "queued"}`,
    label: "queue",
    state: item.status || "queued",
    body: context.slice(0, 12000)
  });
  showToast("队列任务已加入提示词。");
  return context;
}

async function runQueueContinuation(item = {}) {
  if (state.busy) {
    showToast("代理正在运行，请稍后再继续队列任务。");
    return "";
  }
  let activeItem = item;
  try {
    if (item.status === "queued" && item.id) {
      activeItem = await api("/api/queue", {
        method: "PATCH",
        body: JSON.stringify({ id: item.id, status: "active" })
      });
      await refreshHealth();
    }
    const context = buildQueuePromptContext(activeItem);
    if (!context) {
      showToast("暂无可用于继续的队列任务。");
      return "";
    }
    const prompt = [
      context,
      "",
      "请现在直接基于这条队列任务继续推进：读取必要文件，保留已有正确改动，完成下一步最小可验证修复或增强。"
    ].join("\n");
    input.value = prompt;
    scheduleReferencePreview({ immediate: true });
    appendToolCall({
      title: `已启动队列任务继续：${activeItem.id || "queued"}`,
      label: "queue",
      state: "running",
      body: prompt.slice(0, 12000)
    });
    showToast("正在基于队列任务启动继续任务。");
    submitPromptForm();
    return prompt;
  } catch (error) {
    showToast(error.message);
    appendActionFailureEvidence({
      kind: "queue",
      action: "queue-continuation",
      targetName: item.id || item.prompt || "queued",
      endpoint: "/api/queue",
      request: { id: item.id || "", status: item.status || "" },
      item,
      error
    }, {
      title: "队列任务继续失败",
      label: "queue",
      retry: () => runQueueContinuation(item),
      safe: () => appendQueueContextToPrompt(item)
    });
    return "";
  }
}

async function stageQueueVerificationCommands(item = {}) {
  if (state.busy) {
    showToast("代理正在运行，请稍后再生成队列验证命令。");
    return [];
  }
  const commands = [
    ...state.pendingCommands.map((command) => command.command || command)
  ];
  setBusy(true, "生成队列验证命令");
  try {
    const result = await api("/api/verification-plan", {
      method: "POST",
      body: JSON.stringify({ limit: 12, commands })
    });
    const planCommands = verificationPlanCommands(result.plan);
    if (!planCommands.length) {
      appendToolCall({
        title: `队列任务验证命令未生成：${item.id || "queued"}`,
        label: "$",
        state: "跳过",
        body: JSON.stringify(result.plan || {}, null, 2).slice(0, 8000)
      });
      showToast("当前队列任务没有可复用验证命令。");
      setBusy(false, "无验证命令");
      return [];
    }
    renderVerificationPlan(result.plan, { logCommands: true });
    stageRepairVerificationCommands(planCommands, {
      title: "队列任务验证命令",
      successTitle: `队列任务验证命令已放入面板：${item.id || "queued"}`,
      source: "queue-task"
    });
    const recommendedCapability = recommendedCapabilityFromState();
    appendToolCall({
      title: `队列任务验证上下文：${item.id || "queued"}`,
      label: "queue",
      state: result.plan?.status || "ready",
      body: [
        item.prompt ? `队列任务：${item.prompt}` : "",
        item.status ? `状态：${item.status}` : "",
        recommendedCapability?.area ? `推荐缺口：${recommendedCapability.area}` : "",
        "",
        commandItemsToText(planCommands)
      ].filter(Boolean).join("\n").slice(0, 12000)
    });
    setBusy(false, "队列验证命令已加入");
    return planCommands;
  } catch (error) {
    showToast(error.message);
    appendActionFailureEvidence({
      kind: "queue",
      action: "queue-verification-commands",
      targetName: item.id || item.prompt || "queued",
      endpoint: "/api/verification-plan",
      request: {
        id: item.id || "",
        commands
      },
      item,
      error
    }, {
      title: `队列验证命令生成失败：${item.id || "queued"}`,
      label: "queue",
      retry: () => stageQueueVerificationCommands(item),
      safe: () => appendQueueContextToPrompt(item)
    });
    setBusy(false, "队列验证命令失败");
    return [];
  }
}

function renderQueue(queue = []) {
  if (!queueList) return;
  queueList.innerHTML = "";
  if (!queue.length) {
    queueList.innerHTML = `<div class="empty-state">暂无排队任务。</div>`;
    return;
  }
  queue.slice(0, 6).forEach((item) => {
    const row = document.createElement("div");
    row.className = `queue-row ${item.status || "queued"}`;
    row.innerHTML = `<strong></strong><small></small><span class="queue-row-actions"><button type="button" data-action="prompt">加入提示词</button><button type="button" data-action="commands">验证命令</button><button type="button" data-action="continue">直接继续</button><button type="button" data-action="toggle"></button><button type="button" data-action="retry">重试</button></span>`;
    row.querySelector("strong").textContent = item.prompt || "(无提示词)";
    row.querySelector("small").textContent = `${item.status || "queued"} · ${item.isolationGroup || "default"} · P${item.priority || 0} · retry ${item.retryCount || 0}/${item.retryLimit || 0} · ${item.createdAt?.slice(0, 19) || ""}`;
    row.querySelector("[data-action='toggle']").textContent = item.status === "active" ? "完成+下个" : "激活";
    row.querySelector("[data-action='prompt']").addEventListener("click", () => {
      appendQueueContextToPrompt(item);
    });
    row.querySelector("[data-action='continue']").addEventListener("click", () => {
      runQueueContinuation(item);
    });
    row.querySelector("[data-action='commands']").addEventListener("click", async () => {
      await stageQueueVerificationCommands(item);
    });
    row.querySelector("[data-action='toggle']").addEventListener("click", async () => {
      const nextStatus = item.status === "active" ? "done" : "active";
      try {
        await api("/api/queue", {
          method: "PATCH",
          body: JSON.stringify({ id: item.id, status: nextStatus, autoNext: nextStatus === "done" })
        });
        if (nextStatus === "active") {
          input.value = item.prompt || "";
          state.lastPrompt = item.prompt || "";
        }
        await refreshHealth();
      } catch (error) {
        showToast(error.message);
        appendActionFailureEvidence({
          kind: "queue",
          action: "queue-toggle",
          targetName: item.id || item.prompt || "queued",
          endpoint: "/api/queue",
          request: { id: item.id, status: nextStatus, autoNext: nextStatus === "done" },
          item,
          error
        }, {
          title: `队列状态更新失败：${item.id || "queued"}`,
          label: "queue",
          retry: async () => {
            await api("/api/queue", {
              method: "PATCH",
              body: JSON.stringify({ id: item.id, status: nextStatus, autoNext: nextStatus === "done" })
            });
            await refreshHealth();
          },
          safe: () => appendQueueContextToPrompt(item)
        });
      }
    });
    row.querySelector("[data-action='retry']").addEventListener("click", async () => {
      try {
        await api("/api/queue", {
          method: "PATCH",
          body: JSON.stringify({ id: item.id, status: "retry" })
        });
        await refreshHealth();
      } catch (error) {
        showToast(error.message);
        appendActionFailureEvidence({
          kind: "queue",
          action: "queue-retry",
          targetName: item.id || item.prompt || "queued",
          endpoint: "/api/queue",
          request: { id: item.id, status: "retry" },
          item,
          error
        }, {
          title: `队列重试失败：${item.id || "queued"}`,
          label: "queue",
          retry: async () => {
            await api("/api/queue", {
              method: "PATCH",
              body: JSON.stringify({ id: item.id, status: "retry" })
            });
            await refreshHealth();
          },
          safe: () => appendQueueContextToPrompt(item)
        });
      }
    });
    queueList.appendChild(row);
  });
}

function buildProcessEvidenceContext(item = {}, { title = "受管进程证据" } = {}) {
  if (!item?.id && !item?.command && !item?.processId) return "";
  const probe = item.probe ? [
    `probe status: ${item.probe.status || ""}`,
    item.probe.url ? `probe url: ${item.probe.url}` : "",
    item.probe.statusCode ? `probe HTTP: ${item.probe.statusCode}` : "",
    item.probe.error ? `probe error: ${item.probe.error}` : ""
  ].filter(Boolean).join("\n") : "";
  const health = item.health || item.rules ? JSON.stringify({
    health: item.health || null,
    ok: item.ok,
    rules: item.rules || null
  }, null, 2).slice(0, 4000) : "";
  return [
    "请基于这条受管进程/开发服务证据继续排查并修复当前项目。",
    "",
    `证据类型：${title}`,
    `进程 ID：${item.id || item.processId || ""}`,
    item.command ? `命令：$ ${item.command}` : "",
    `状态：${item.status || "unknown"}`,
    item.pid ? `PID：${item.pid}` : "",
    item.exitCode === null || item.exitCode === undefined ? "" : `退出码：${item.exitCode}`,
    item.active === undefined ? "" : `active：${Boolean(item.active)}`,
    item.policy ? `策略：${item.policy.risk || ""} · ${item.policy.reason || ""}` : "",
    probe ? `探针：\n${probe}` : "",
    health ? `健康规则：\n${health}` : "",
    item.logPath ? `日志：${item.logPath}` : "",
    item.artifactPath ? `artifact：${item.artifactPath}` : "",
    item.outputBytes ? `输出大小：${formatBytes(item.outputBytes)}` : "",
    "",
    "输出尾部：",
    (item.outputTail || item.context || item.text || "(无输出)").slice(0, 8000),
    "",
    "要求：先判断开发服务失败或不健康的根因；需要改代码时输出最小 diff；需要排查时给出安全命令；不要绕过本地进程策略。"
  ].filter(Boolean).join("\n");
}

function appendProcessEvidenceToPrompt(item = {}, options = {}) {
  const context = buildProcessEvidenceContext(item, options);
  if (!context) {
    showToast("暂无可加入提示词的进程证据。");
    return "";
  }
  const current = input.value.trim();
  input.value = [current, context].filter(Boolean).join("\n\n---\n\n");
  input.focus();
  scheduleReferencePreview({ immediate: true });
  appendToolCall({
    title: `进程证据已加入提示词：${item.command || item.id || item.processId}`,
    label: "proc",
    state: "ready",
    body: context.slice(0, 12000)
  });
  showToast("进程证据已加入提示词。");
  return context;
}

function runProcessEvidenceRepair(item = {}, options = {}) {
  if (state.busy) {
    showToast("代理正在运行，请稍后再启动进程修复。");
    return "";
  }
  const context = buildProcessEvidenceContext(item, options);
  if (!context) {
    showToast("暂无可用于修复的进程证据。");
    return "";
  }
  const prompt = [
    context,
    "",
    "请现在直接基于这条进程证据继续修复：优先解释服务失败/探针异常原因，输出最小 diff 或下一步安全验证命令。"
  ].join("\n");
  input.value = prompt;
  scheduleReferencePreview({ immediate: true });
  appendToolCall({
    title: `已启动进程证据修复：${item.command || item.id || item.processId}`,
    label: "proc",
    state: "running",
    body: prompt.slice(0, 12000)
  });
  showToast("正在基于进程证据启动修复。");
  submitPromptForm();
  return prompt;
}

function appendProcessFailureEvidence(error, {
  title = "受管进程操作失败",
  action = "process-action",
  endpoint = "",
  request = null,
  item = {},
  retry = null
} = {}) {
  const evidence = {
    ...item,
    id: item.id || item.processId || "",
    processId: item.processId || item.id || "",
    command: item.command || request?.command || "",
    status: item.status || "failed",
    policy: item.policy || null,
    probe: item.probe || null,
    outputTail: item.outputTail || "",
    error: normalizeActionFailureError(error),
    endpoint,
    request,
    action,
    workspace: workspaceStatus?.textContent || ""
  };
  return appendActionFailureEvidence({
    kind: "process",
    action,
    targetName: evidence.command || evidence.id || "process",
    endpoint,
    request,
    item: evidence,
    error
  }, {
    title,
    label: "proc",
    retry,
    safe: () => appendProcessEvidenceToPrompt(evidence, { title })
  });
}

function processProbeUrl(item = {}) {
  return item.probe?.url || item.url || item.finalUrl || "";
}

async function runProcessBrowserEvidence(item = {}, { mode = "check", title = "受管进程" } = {}) {
  const targetUrl = processProbeUrl(item);
  if (!targetUrl) {
    showToast("这条进程证据没有可检查的页面 URL。");
    appendToolCall({
      title: `进程页面调试跳过：${item.command || item.id || title}`,
      label: "proc",
      state: "跳过",
      body: JSON.stringify({
        id: item.id || item.processId || "",
        command: item.command || "",
        probe: item.probe || null
      }, null, 2).slice(0, 4000)
    });
    return null;
  }
  if (state.busy) {
    showToast("代理正在运行，请稍后再做页面调试。");
    return null;
  }
  if (browserCheckUrlInput) browserCheckUrlInput.value = targetUrl;
  if (mode === "debug") {
    setBusy(true, "一键调试进程页面");
    try {
      const [health, check, trace] = await Promise.all([
        item.id
          ? api(`/api/process-health?id=${encodeURIComponent(item.id)}&limit=20`).catch((error) => ({ ok: false, error: error.message }))
          : Promise.resolve(null),
        api("/api/browser-check", {
          method: "POST",
          body: JSON.stringify({ url: targetUrl })
        }),
        api("/api/browser-trace", {
          method: "POST",
          body: JSON.stringify({ url: targetUrl, waitMs: 1500 })
        })
      ]);
      const result = {
        ok: Boolean(check?.ok && trace?.ok),
        url: targetUrl,
        finalUrl: trace?.finalUrl || check?.finalUrl || targetUrl,
        title: trace?.title || check?.title || "进程页面调试",
        status: check?.status || trace?.status || "",
        process: {
          id: item.id || item.processId || "",
          command: item.command || "",
          status: item.status || "",
          probe: item.probe || null
        },
        health,
        check,
        trace,
        summary: {
          healthy: health?.summary?.healthy || 0,
          processRows: health?.rows?.length || 0,
          httpStatus: check?.status || "",
          traceConsole: trace?.summary?.console || 0,
          traceExceptions: trace?.summary?.exceptions || 0,
          traceNetwork: trace?.summary?.network || 0
        },
        artifactPath: trace?.artifactPath || check?.artifactPath || "",
        policy: {
          access: "managed-process-browser-debug",
          executesCommands: false,
          startsProcesses: false,
          localUrlOnly: true
        }
      };
      renderBrowserEvidenceRow(result, {
        title: "进程页面一键调试",
        kind: "process-browser-debug",
        label: "debug",
        state: result.ok ? "完成" : "异常",
        heading: item.command || targetUrl,
        summary: [
          health ? `${health.summary?.healthy || 0} healthy` : "no health",
          `HTTP ${check?.status || "-"}`,
          `${trace?.summary?.console || 0} console`,
          `${trace?.summary?.exceptions || 0} exceptions`,
          trace?.artifactPath || "no trace"
        ]
      });
      appendToolCall({
        title: `进程页面一键调试：${item.command || item.id || targetUrl}`,
        label: "debug",
        state: result.ok ? "完成" : "异常",
        body: JSON.stringify(result, null, 2).slice(0, 12000)
      });
      appendProcessBrowserDebugRecovery(result, { title: "进程页面一键调试" });
      setBusy(false, result.ok ? "页面调试完成" : "页面调试异常");
      return result;
    } catch (error) {
      showToast(error.message);
      appendBrowserFailureEvidence(error, {
        title: "进程页面一键调试失败",
        kind: "process-browser-debug-failure",
        label: "debug",
        url: targetUrl,
        body: {
          process: {
            id: item.id || item.processId || "",
            command: item.command || "",
            status: item.status || "",
            probe: item.probe || null
          }
        }
      });
      setBusy(false, "页面调试失败");
      return null;
    }
  }
  const isTrace = mode === "trace";
  setBusy(true, isTrace ? "采集进程页面 Trace" : "检查进程页面");
  try {
    const result = await api(isTrace ? "/api/browser-trace" : "/api/browser-check", {
      method: "POST",
      body: JSON.stringify({ url: targetUrl })
    });
    if (isTrace) {
      renderBrowserTrace(result);
    } else {
      renderBrowserCheck(result);
    }
    appendToolCall({
      title: `${isTrace ? "进程页面 Trace" : "进程页面检查"}：${item.command || item.id || targetUrl}`,
      label: isTrace ? "trace" : "browser",
      state: result.ok ? "完成" : "异常",
      body: JSON.stringify({
        process: {
          id: item.id || item.processId || "",
          command: item.command || "",
          status: item.status || "",
          probe: item.probe || null
        },
        browser: result
      }, null, 2).slice(0, 12000)
    });
    setBusy(false, result.ok ? (isTrace ? "Trace 完成" : "页面正常") : (isTrace ? "Trace 异常" : "页面异常"));
    return result;
  } catch (error) {
    showToast(error.message);
    appendBrowserFailureEvidence(error, {
      title: isTrace ? "进程页面 Trace 失败" : "进程页面检查失败",
      kind: isTrace ? "process-browser-trace-failure" : "process-browser-check-failure",
      label: isTrace ? "trace" : "browser",
      url: targetUrl,
      body: {
        process: {
          id: item.id || item.processId || "",
          command: item.command || "",
          status: item.status || "",
          probe: item.probe || null
        }
      }
    });
    setBusy(false, isTrace ? "Trace 失败" : "检查失败");
    return null;
  }
}

function browserEvidenceUrl(result = {}) {
  return result.finalUrl || result.url || result.targetUrl || "";
}

function browserEvidenceArtifactFiles(result = {}) {
  return [
    result.artifactPath,
    result.path,
    result.diffPath,
    result.comparison?.diffPath
  ]
    .filter(Boolean)
    .map((file) => String(file).replaceAll("\\", "/"))
    .filter((file, index, files) => files.indexOf(file) === index)
    .slice(0, 6);
}

function browserTraceTriage(result = {}) {
  const trace = result.trace && typeof result.trace === "object" ? result.trace : result;
  const check = result.check && typeof result.check === "object" ? result.check : null;
  const health = result.health && typeof result.health === "object" ? result.health : null;
  const findings = [];
  const addFinding = (severity, area, message, evidence = "") => {
    findings.push({ severity, area, message, evidence: String(evidence || "").slice(0, 500) });
  };
  if (check && check.ok === false) {
    addFinding("error", "page-check", `页面检查未通过${check.status ? `：HTTP ${check.status}` : ""}`, check.error || check.reason || check.finalUrl || "");
  }
  if (health && health.ok === false) {
    addFinding("error", "process-health", "受管进程健康探针未通过", JSON.stringify({ summary: health.summary, rules: health.rules }).slice(0, 500));
  }
  (Array.isArray(trace.exceptions) ? trace.exceptions : [])
    .slice(0, 6)
    .forEach((item) => addFinding("error", "exception", item.text || item.message || "页面运行时异常", item.stack || item.url || ""));
  (Array.isArray(trace.console) ? trace.console : [])
    .filter((item) => /error|warning|warn/i.test(item.type || item.level || ""))
    .slice(0, 8)
    .forEach((item) => addFinding(/error/i.test(item.type || item.level || "") ? "error" : "warn", "console", item.text || item.message || "console 异常输出", item.location || item.url || ""));
  (Array.isArray(trace.network) ? trace.network : [])
    .filter((item) => item.failed || Number(item.status) >= 400)
    .slice(0, 8)
    .forEach((item) => addFinding(Number(item.status) >= 500 || item.failed ? "error" : "warn", "network", `${item.method || "GET"} ${item.url || item.requestUrl || ""}`.trim(), item.errorText || item.failure || item.status || ""));
  if (!findings.length && result.ok !== false && trace?.ok !== false) {
    addFinding("pass", "browser", "未发现明显浏览器异常，可继续做目标功能验证。", trace?.finalUrl || result.finalUrl || result.url || "");
  }
  const priority = { error: 3, warn: 2, review: 1, pass: 0 };
  findings.sort((a, b) => (priority[b.severity] || 0) - (priority[a.severity] || 0));
  const nextActions = findings.some((item) => item.severity === "error")
    ? [
      "优先处理 error 级 exception、console error 或 5xx/failed network。",
      "修复后重新运行页面检查和 Trace，确认异常数量归零。",
      "如果异常来自后端 API，同时运行服务端语法和 debug smoke。"
    ]
    : findings.some((item) => item.severity === "warn")
      ? [
        "先复核 warning 是否影响当前功能路径。",
        "修复后重跑页面 Trace，并保留 warning 处置说明。",
        "没有代码改动时，把这条分诊证据作为环境/误报依据。"
      ]
      : [
        "继续验证用户目标功能路径。",
        "需要视觉或 DOM 断言时再跑截图、DOM 或视觉检查。",
        "保持本地页面 URL 和进程健康证据可追溯。"
      ];
  return {
    status: findings.some((item) => item.severity === "error") ? "error"
      : findings.some((item) => item.severity === "warn") ? "warn"
        : "pass",
    counts: findings.reduce((acc, item) => {
      acc[item.severity] = (acc[item.severity] || 0) + 1;
      return acc;
    }, {}),
    findings: findings.slice(0, 16),
    nextActions
  };
}

function compactBrowserEvidence(result = {}) {
  const traceFailures = Array.isArray(result.network)
    ? result.network.filter((item) => item.failed || Number(item.status) >= 400).slice(0, 12)
    : [];
  const nestedTrace = result.trace && typeof result.trace === "object" ? result.trace : null;
  const nestedCheck = result.check && typeof result.check === "object" ? result.check : null;
  const nestedHealth = result.health && typeof result.health === "object" ? result.health : null;
  const nestedTraceFailures = Array.isArray(nestedTrace?.network)
    ? nestedTrace.network.filter((item) => item.failed || Number(item.status) >= 400).slice(0, 12)
    : [];
  const triage = browserTraceTriage(result);
  return {
    ok: result.ok,
    status: result.status || result.audit?.status || "",
    url: result.url || "",
    finalUrl: result.finalUrl || "",
    title: result.title || result.name || "",
    elapsedMs: result.elapsedMs,
    dimensions: result.width || result.height ? `${result.width || "-"}x${result.height || "-"}` : "",
    bytes: result.bytes,
    size: result.size,
    artifactPath: result.artifactPath || "",
    path: result.path || "",
    diffPath: result.diffPath || result.comparison?.diffPath || "",
    counts: result.counts || null,
    selectors: Array.isArray(result.selectors) ? result.selectors.slice(0, 20) : [],
    summary: result.summary || null,
    audit: result.audit || null,
    diffs: Array.isArray(result.diffs) ? result.diffs.slice(0, 20) : [],
    actions: Array.isArray(result.actions) ? result.actions.slice(0, 20) : [],
    comparison: result.comparison || null,
    console: Array.isArray(result.console) ? result.console.slice(0, 12) : [],
    exceptions: Array.isArray(result.exceptions) ? result.exceptions.slice(0, 12) : [],
    failedNetwork: traceFailures,
    triage,
    process: result.process || null,
    health: nestedHealth ? {
      summary: nestedHealth.summary || null,
      rules: nestedHealth.rules || null,
      rows: Array.isArray(nestedHealth.rows)
        ? nestedHealth.rows.slice(0, 6).map((row) => ({
          id: row.id,
          command: row.command,
          status: row.status,
          ok: row.ok,
          health: row.health,
          probe: row.probe,
          rules: row.rules
        }))
        : [],
      error: nestedHealth.error || ""
    } : null,
    browserCheck: nestedCheck ? {
      ok: nestedCheck.ok,
      status: nestedCheck.status || "",
      finalUrl: nestedCheck.finalUrl || nestedCheck.url || "",
      title: nestedCheck.title || "",
      counts: nestedCheck.counts || null,
      error: nestedCheck.error || nestedCheck.reason || ""
    } : null,
    browserTrace: nestedTrace ? {
      ok: nestedTrace.ok,
      status: nestedTrace.status || "",
      finalUrl: nestedTrace.finalUrl || nestedTrace.url || "",
      title: nestedTrace.title || "",
      artifactPath: nestedTrace.artifactPath || "",
      summary: nestedTrace.summary || null,
      console: Array.isArray(nestedTrace.console) ? nestedTrace.console.slice(0, 12) : [],
      exceptions: Array.isArray(nestedTrace.exceptions) ? nestedTrace.exceptions.slice(0, 12) : [],
      failedNetwork: nestedTraceFailures,
      triage,
      error: nestedTrace.error || nestedTrace.reason || ""
    } : null,
    errors: Array.isArray(result.errors) ? result.errors.slice(0, 20) : [],
    error: result.error || result.reason || "",
    policy: result.policy || null
  };
}

function buildBrowserEvidenceContext(result = {}, { title = "浏览器证据", kind = "browser" } = {}) {
  if (!result || typeof result !== "object") return "";
  const url = browserEvidenceUrl(result);
  const compact = compactBrowserEvidence(result);
  const triage = browserTraceTriage(result);
  const statusText = result.ok ? "通过/完成" : "失败/异常";
  const body = JSON.stringify(compact, null, 2).slice(0, 10000);
  return [
    "请基于这条本地浏览器调试证据继续排查并修复当前项目。",
    "",
    `证据类型：${title}`,
    `证据分类：${kind}`,
    url ? `页面 URL：${url}` : "",
    `状态：${statusText}`,
    result.artifactPath ? `artifact：${result.artifactPath}` : "",
    result.path ? `截图/文件：${result.path}` : "",
    result.diffPath || result.comparison?.diffPath ? `视觉 diff：${result.diffPath || result.comparison?.diffPath}` : "",
    `异常分诊：${triage.status} · ${triage.findings.length} findings`,
    "",
    "浏览器异常分诊：",
    triage.findings.map((item) => `- [${item.severity}] ${item.area}: ${item.message}${item.evidence ? ` (${item.evidence})` : ""}`).join("\n"),
    "",
    "浏览器证据摘要：",
    body,
    "",
    "要求：先判断页面、DOM、Trace、截图或视觉断言暴露的根因；需要改代码时输出最小 diff；需要验证时给出安全的本地命令或浏览器检查；不要绕过本地 URL 与浏览器策略。"
  ].filter(Boolean).join("\n");
}

function appendBrowserEvidenceToPrompt(result = {}, options = {}) {
  const context = buildBrowserEvidenceContext(result, options);
  if (!context) {
    showToast("暂无可加入提示词的浏览器证据。");
    return "";
  }
  const current = input.value.trim();
  input.value = [current, context].filter(Boolean).join("\n\n---\n\n");
  input.focus();
  scheduleReferencePreview({ immediate: true });
  appendToolCall({
    title: `浏览器证据已加入提示词：${options.title || browserEvidenceUrl(result) || "页面证据"}`,
    label: options.kind || "browser",
    state: "ready",
    body: context.slice(0, 12000)
  });
  showToast("浏览器证据已加入提示词。");
  return context;
}

function runBrowserEvidenceRepair(result = {}, options = {}) {
  if (state.busy) {
    showToast("代理正在运行，请稍后再启动浏览器证据修复。");
    return "";
  }
  const context = buildBrowserEvidenceContext(result, options);
  if (!context) {
    showToast("暂无可用于修复的浏览器证据。");
    return "";
  }
  const prompt = [
    context,
    "",
    "请现在直接基于这条浏览器证据继续修复：优先定位前端运行时异常、DOM/可访问性缺口、视觉回归或截图问题，并输出最小 diff 或下一步安全验证命令。"
  ].join("\n");
  input.value = prompt;
  scheduleReferencePreview({ immediate: true });
  appendToolCall({
    title: `已启动浏览器证据修复：${options.title || browserEvidenceUrl(result) || "页面证据"}`,
    label: options.kind || "browser",
    state: "running",
    body: prompt.slice(0, 12000)
  });
  showToast("正在基于浏览器证据启动修复。");
  submitPromptForm();
  return prompt;
}

function browserSourceLocations(result = {}, limit = 16) {
  const sources = [];
  const push = (items) => {
    if (Array.isArray(items)) sources.push(...items);
  };
  push(result.browserSourceLocations);
  push(result.sourceLocations);
  push(result.sourceEvidence?.browserSourceLocations);
  push(result.sourceEvidence?.sourceLocations);
  push(result.debugContext?.browserSourceLocations);
  push(result.diagnostics?.browserSourceLocations);
  push(result.browserTrace?.browserSourceLocations);
  push(result.trace?.browserSourceLocations);
  for (const item of result.exceptions || []) push(item.sourceLocations);
  for (const item of result.console || []) push(item.sourceLocations);
  for (const item of result.browserTrace?.exceptions || []) push(item.sourceLocations);
  for (const item of result.browserTrace?.console || []) push(item.sourceLocations);
  for (const item of result.trace?.exceptions || []) push(item.sourceLocations);
  for (const item of result.trace?.console || []) push(item.sourceLocations);
  const seen = new Set();
  return sources
    .filter((item) => item && (item.path || item.file))
    .map((item) => ({
      path: String(item.path || item.file || "").replaceAll("\\", "/"),
      line: Math.max(1, Number.parseInt(item.line, 10) || 1),
      column: Math.max(0, Number.parseInt(item.column, 10) || 0),
      text: String(item.text || item.message || "").trim().slice(0, 400)
    }))
    .filter((item) => {
      if (!item.path) return false;
      const key = `${item.path.toLowerCase()}:${item.line}:${item.column}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit);
}

async function fetchBrowserSourceContexts(result = {}, { contextLines = 6, limit = 8 } = {}) {
  const locations = browserSourceLocations(result, limit);
  if (!locations.length) return { contexts: [], summary: { requested: 0, returned: 0, errors: 0 } };
  return await api("/api/source-context", {
    method: "POST",
    body: JSON.stringify({ locations, contextLines, limit })
  });
}

function browserSourceVerificationCommands(result = {}, options = {}) {
  return browserEvidenceVerificationCommands(result, {
    source: options.source || "browser-source-context",
    includeBrowserSmoke: true
  });
}

function buildBrowserSourceContextPrompt(result = {}, options = {}, contexts = []) {
  const locations = browserSourceLocations(result);
  const sourceBlock = formatCommandSourceContexts(contexts);
  const triage = browserTraceTriage(result);
  const commands = browserSourceVerificationCommands(result, options);
  const url = browserEvidenceUrl(result);
  return [
    "请基于浏览器异常映射到的源码上下文继续修复当前项目。",
    "",
    `证据类型：${options.title || "浏览器源码定位"}`,
    `证据分类：${options.kind || "browser-source-context"}`,
    url ? `页面 URL：${url}` : "",
    `异常分诊：${triage.status} · ${triage.findings.length} findings`,
    locations.length ? `源码位置：\n${formatCommandSourceLocations(locations)}` : "源码位置：未识别到浏览器源码位置。",
    sourceBlock ? `源码上下文：\n${sourceBlock}` : "源码上下文：未读取到可用片段。",
    triage.findings.length ? `浏览器分诊发现：\n${triage.findings.map((item) => `- [${item.severity}] ${item.area}: ${item.message}${item.evidence ? ` (${item.evidence})` : ""}`).join("\n")}` : "",
    "",
    "修复后验证命令：",
    commands.map((item) => `- ${item.command}${item.reason ? `：${item.reason}` : ""}`).join("\n"),
    "",
    "要求：优先围绕上述源码行号定位前端运行时异常或页面行为根因；需要改代码时输出最小 diff；修复后先跑语法检查、UI smoke、debug smoke，再复查浏览器 Trace。"
  ].filter(Boolean).join("\n");
}

async function appendBrowserSourcePromptToPrompt(result = {}, options = {}) {
  try {
    const sourceLocations = browserSourceLocations(result);
    if (!sourceLocations.length) {
      showToast("这条浏览器证据没有可用的源码定位。");
      return "";
    }
    const contextResult = await fetchBrowserSourceContexts(result, { contextLines: 6, limit: 8 });
    const prompt = buildBrowserSourceContextPrompt(result, options, contextResult.contexts);
    const current = input.value.trim();
    input.value = [current, prompt].filter(Boolean).join("\n\n---\n\n");
    input.focus();
    scheduleReferencePreview({ immediate: true });
    appendToolCall({
      title: `浏览器源码修复提示已加入：${options.title || browserEvidenceUrl(result) || "页面证据"}`,
      label: options.kind || "browser-source",
      state: `${contextResult.contexts?.length || 0} contexts`,
      body: prompt.slice(0, 12000)
    });
    showToast("浏览器源码修复提示已加入提示词。");
    return prompt;
  } catch (error) {
    appendDebugEvidence("浏览器源码修复提示生成失败", "失败", error.message);
    showToast(error.message);
    return "";
  }
}

async function runBrowserSourceContextRepair(result = {}, options = {}) {
  if (state.busy) {
    showToast("代理正在运行，请稍后再启动浏览器源码修复。");
    return "";
  }
  const locations = browserSourceLocations(result);
  if (!locations.length) {
    showToast("这条浏览器证据没有可用于源码修复的位置。");
    return "";
  }
  try {
    const contextResult = await fetchBrowserSourceContexts(result, { contextLines: 6, limit: 8 });
    const prompt = buildBrowserSourceContextPrompt(result, options, contextResult.contexts);
    const verificationCommands = browserSourceVerificationCommands(result, options);
    const draft = await api("/api/source-context-repair-draft", {
      method: "POST",
      body: JSON.stringify({
        prompt,
        command: browserEvidenceUrl(result) ? `browser trace ${browserEvidenceUrl(result)}` : "browser trace",
        result: compactBrowserEvidence(result),
        diagnostics: {
          browserTriage: browserTraceTriage(result),
          browserSourceLocations: locations
        },
        locations,
        contextLines: 6,
        limit: 8
      })
    });
    const chain = createRepairEvidenceChain({
      source: "browser-source-context",
      command: browserEvidenceUrl(result) || options.title || "browser source context",
      result: compactBrowserEvidence(result),
      diagnostics: { browserTriage: browserTraceTriage(result), browserSourceLocations: locations },
      prompt
    });
    updateRepairEvidenceChain({
      id: chain.id,
      status: "repairing",
      repair: {
        source: "browser-source-context",
        status: draft.diff ? "awaiting_approval" : "no_safe_repair",
        sourceLocations: locations,
        sourceContextCount: draft.sourceContextSummary?.returned ?? contextResult.contexts?.length ?? 0,
        promptSummary: prompt.slice(0, 1200),
        hasDiff: Boolean(draft.diff),
        files: repairChainFiles(draft),
        commandCount: draft.commands?.length || 0,
        reviewCount: draft.review?.length || 0,
        proposalId: draft.proposal?.id || draft.goal?.pendingProposalId || ""
      },
      verification: {
        status: "planned",
        commands: draft.commands?.length ? draft.commands : verificationCommands,
        source: "browser-source-context"
      }
    }, { title: draft.diff ? "浏览器源码修复草稿已加入证据链" : "浏览器源码修复未生成安全 diff" });
    stageRepairVerificationCommands(draft.commands?.length ? draft.commands : verificationCommands, {
      title: "浏览器源码修复验证命令",
      successTitle: "浏览器源码修复验证命令已放入命令面板",
      source: "browser-source-context",
      note: "浏览器源码修复会先复查语法、UI smoke、debug smoke，再复查浏览器自动化能力。"
    });
    if (draft.diff) {
      state.pendingDiff = draft.diff;
      renderPlan(draft.plan || []);
      renderDiff(draft.patches || []);
      renderReview(draft.review || []);
    } else {
      input.value = prompt;
      scheduleReferencePreview({ immediate: true });
    }
    appendToolCall({
      title: draft.diff ? `浏览器源码修复草稿已生成：${options.title || browserEvidenceUrl(result) || "页面证据"}` : `浏览器源码修复提示已生成：${options.title || browserEvidenceUrl(result) || "页面证据"}`,
      label: options.kind || "browser-source",
      state: draft.proposal?.id || draft.goal?.pendingProposalId || `${contextResult.contexts?.length || 0} contexts`,
      body: JSON.stringify({
        proposalId: draft.proposal?.id || draft.goal?.pendingProposalId || "",
        type: draft.proposal?.type || "source_context_repair",
        sourceContextSummary: draft.sourceContextSummary || contextResult.summary || null,
        locations,
        files: repairChainFiles(draft),
        commands: draft.commands || verificationCommands,
        policy: draft.policy || null,
        reply: draft.reply || "",
        fallbackPrompt: draft.diff ? "" : prompt
      }, null, 2).slice(0, 12000)
    });
    showToast(draft.diff ? "浏览器源码修复草稿已生成，可复核后批准写入。" : "浏览器源码修复未生成 diff，已保留提示词。");
    return draft.diff ? draft.diff : prompt;
  } catch (error) {
    appendDebugEvidence("浏览器源码修复启动失败", "失败", error.message);
    stageRepairVerificationCommands(browserSourceVerificationCommands(result, options), {
      title: "浏览器源码修复失败后验证命令",
      successTitle: "浏览器源码修复失败后验证命令已放入命令面板",
      source: "browser-source-context-failure"
    });
    showToast(error.message);
    return "";
  }
}

function processBrowserDebugVerificationCommands(result = {}) {
  const url = browserEvidenceUrl(result);
  const commands = [
    { command: "node --check app.js", reason: "复查前端入口语法。", source: "process-browser-debug-recovery" },
    { command: "node --check server.js", reason: "复查后端入口语法。", source: "process-browser-debug-recovery" },
    { command: "node server.js --ui-smoke-test", reason: "复查前端按钮、证据卡和调试入口。", source: "process-browser-debug-recovery" },
    { command: "node server.js --api-smoke-section=debug", reason: "复查调试诊断、页面 Trace 和失败恢复链路。", source: "process-browser-debug-recovery" }
  ];
  if (url) {
    commands.push({
      command: "node server.js --api-smoke-section=browser",
      reason: `修复后复查本地浏览器检查能力，再用页面面板复查 ${url}。`,
      source: "process-browser-debug-recovery"
    });
  }
  return normalizeCommandItems(commands);
}

function processBrowserDebugNeedsRecovery(result = {}) {
  const trace = result.trace || result.browserTrace || null;
  const check = result.check || result.browserCheck || null;
  const health = result.health || null;
  const summary = result.summary || {};
  const exceptions = Number(summary.traceExceptions ?? trace?.summary?.exceptions ?? 0);
  const consoleCount = Number(summary.traceConsole ?? trace?.summary?.console ?? 0);
  const failedNetwork = Array.isArray(trace?.network)
    ? trace.network.some((item) => item.failed || Number(item.status) >= 400)
    : false;
  return !result.ok
    || check?.ok === false
    || trace?.ok === false
    || health?.ok === false
    || exceptions > 0
    || failedNetwork
    || consoleCount > 0;
}

function buildProcessBrowserDebugRecoveryContext(result = {}, { title = "进程页面一键调试" } = {}) {
  if (!result || typeof result !== "object") return "";
  const compact = compactBrowserEvidence(result);
  const commands = processBrowserDebugVerificationCommands(result);
  const url = browserEvidenceUrl(result);
  const trace = result.trace || result.browserTrace || null;
  const check = result.check || result.browserCheck || null;
  const health = result.health || null;
  const process = result.process || {};
  const triage = browserTraceTriage(result);
  const nextActions = [
    ...triage.nextActions,
    processBrowserDebugNeedsRecovery(result)
      ? "先查看 Trace 的 console、exception、失败网络和 HTTP 状态，定位页面异常根因。"
      : "当前页面调试未发现明显异常，可继续做目标功能验证。",
    "需要改代码时输出最小 diff，经审批写入后再运行复查命令。",
    url ? `修复后重新运行页面检查和 Trace：${url}` : "修复后重新运行页面检查和 Trace。"
  ];
  return [
    "请基于这次启动后页面调试恢复证据继续排查并修复当前项目。",
    "",
    `证据类型：${title}`,
    `状态：${result.ok ? "passed" : "needs_recovery"}`,
    url ? `页面 URL：${url}` : "",
    process.command ? `启动命令：$ ${process.command}` : "",
    process.id ? `进程 ID：${process.id}` : "",
    check?.status ? `页面 HTTP：${check.status}` : "",
    trace?.artifactPath ? `Trace artifact：@${trace.artifactPath}` : "",
    result.artifactPath && result.artifactPath !== trace?.artifactPath ? `artifact：@${result.artifactPath}` : "",
    health?.summary ? `进程健康：${JSON.stringify(health.summary)}` : "",
    `异常分诊：${triage.status} · ${JSON.stringify(triage.counts)}`,
    "",
    "浏览器异常分诊：",
    triage.findings.map((item) => `- [${item.severity}] ${item.area}: ${item.message}${item.evidence ? ` (${item.evidence})` : ""}`).join("\n"),
    "",
    "调试摘要：",
    JSON.stringify(compact, null, 2).slice(0, 10000),
    "",
    "建议复查命令：",
    commands.length ? commands.map((item) => `- ${item.command}${item.reason ? `：${item.reason}` : ""}`).join("\n") : "- 无",
    "",
    "下一步：",
    nextActions.map((item) => `- ${item}`).join("\n")
  ].filter((line) => line !== "").join("\n");
}

function appendProcessBrowserDebugRecovery(result = {}, options = {}) {
  if (!result || typeof result !== "object") return "";
  const commands = processBrowserDebugVerificationCommands(result);
  const context = buildProcessBrowserDebugRecoveryContext(result, options);
  appendToolCall({
    title: "启动后页面调试恢复",
    label: "debug",
    state: browserTraceTriage(result).status === "pass" && !processBrowserDebugNeedsRecovery(result) ? "ready" : "needs-recovery",
    body: context.slice(0, 12000)
  });
  const actions = document.createElement("div");
  actions.className = "debug-last-failed-actions";
  actions.innerHTML = `<button type="button" data-action="prompt">加入提示词</button><button type="button" data-action="stage" ${commands.length ? "" : "disabled"}>复查命令</button><button type="button" data-action="trace">再跑 Trace</button><button type="button" data-action="repair">验证修复</button>`;
  actions.querySelector("[data-action='prompt']").addEventListener("click", () => {
    const current = input.value.trim();
    input.value = [current, context].filter(Boolean).join("\n\n---\n\n");
    input.focus();
    scheduleReferencePreview({ immediate: true });
    appendToolCall({
      title: "启动后页面调试恢复已加入提示词",
      label: "debug",
      state: "ready",
      body: context.slice(0, 12000)
    });
    showToast("启动后页面调试恢复证据已加入提示词。");
  });
  actions.querySelector("[data-action='stage']").addEventListener("click", () => {
    stageRepairVerificationCommands(commands, {
      title: "启动后页面复查命令",
      successTitle: "启动后页面复查命令已放入命令面板",
      source: "process-browser-debug-recovery"
    });
  });
  actions.querySelector("[data-action='trace']").addEventListener("click", () => {
    runBrowserEvidenceFollowup(result, "trace", {
      title: options.title || "启动后页面调试恢复",
      kind: "process-browser-debug-recovery"
    });
  });
  actions.querySelector("[data-action='repair']").addEventListener("click", () => {
    runBrowserVerificationFix(result, {
      title: options.title || "启动后页面调试恢复",
      kind: "process-browser-debug-recovery"
    });
  });
  log.lastElementChild?.appendChild(actions);
  if (processBrowserDebugNeedsRecovery(result)) {
    stageRepairVerificationCommands(commands, {
      title: "启动后页面复查命令",
      successTitle: "启动后页面复查命令已放入命令面板",
      source: "process-browser-debug-recovery",
      note: "启动后页面调试未生成复查命令。"
    });
  }
  return context;
}

function buildBrowserVerificationPrompt(result = {}, options = {}) {
  const context = buildBrowserEvidenceContext(result, options);
  if (!context) return "";
  const url = browserEvidenceUrl(result);
  const artifactFiles = browserEvidenceArtifactFiles(result);
  const commands = browserEvidenceVerificationCommands(result).map((item) => item.command);
  return [
    context,
    "",
    "目标：把这条页面/浏览器证据转成可验证修复闭环。",
    artifactFiles.length ? `优先读取这些浏览器证据 artifact：\n${artifactFiles.map((file) => `@${file}`).join("\n")}` : "",
    url ? `修复后优先复查页面：${url}` : "",
    "",
    "建议验证命令：",
    ...commands.map((command) => `- ${command}`),
    "",
    "建议浏览器复查：",
    url ? `- 页面检查：${url}` : "- 页面检查：复用本次证据里的本地 URL",
    url ? `- 页面 Trace：${url}` : "- 页面 Trace：复用本次证据里的本地 URL",
    "",
    "输出要求：",
    "1. 先判断页面异常来自前端运行时、DOM 结构、可访问性、网络请求、截图差异还是视觉回归。",
    "2. 如果需要改代码，请生成最小 diff，避免无关重构。",
    "3. 修复后必须说明应运行哪些本地命令和页面复查动作。",
    "4. 如果证据是误报或环境问题，请说明依据，并给出下一步只读复查命令。"
  ].filter(Boolean).join("\n");
}

function browserEvidenceVerificationCommands(result = {}, {
  source = "browser-evidence",
  includeBrowserSmoke = true
} = {}) {
  const url = browserEvidenceUrl(result);
  const commands = [
    { command: "node --check app.js", reason: "复查前端入口语法。", source },
    { command: "node --check server.js", reason: "复查后端入口语法。", source },
    { command: "node server.js --ui-smoke-test", reason: "复查前端按钮、证据卡和浏览器调试入口。", source },
    { command: "node server.js --api-smoke-section=debug", reason: "复查调试诊断、浏览器异常分诊和失败恢复链路。", source }
  ];
  if (includeBrowserSmoke || url) {
    commands.push({
      command: "node server.js --api-smoke-section=browser",
      reason: url ? `复查本地浏览器自动化能力，再用页面面板复查 ${url}。` : "复查本地浏览器检查、Trace、截图和视觉断言能力。",
      source
    });
  }
  return normalizeCommandItems(commands);
}

function stageBrowserEvidenceVerificationCommands(result = {}, {
  title = "浏览器证据",
  source = "browser-evidence",
  note = ""
} = {}) {
  const commands = browserEvidenceVerificationCommands(result, { source });
  return stageRepairVerificationCommands(commands, {
    title: `${title}复查命令`,
    successTitle: `${title}复查命令已放入命令面板`,
    source,
    note: note || "浏览器证据会先复查语法、UI smoke、debug smoke，再复查浏览器自动化能力。"
  });
}

function appendBrowserVerificationPromptToPrompt(result = {}, options = {}) {
  const prompt = buildBrowserVerificationPrompt(result, options);
  if (!prompt) {
    showToast("暂无可生成验证提示的浏览器证据。");
    return "";
  }
  const current = input.value.trim();
  input.value = [current, prompt].filter(Boolean).join("\n\n---\n\n");
  input.focus();
  scheduleReferencePreview({ immediate: true });
  appendToolCall({
    title: `浏览器证据验证提示已加入提示词：${options.title || browserEvidenceUrl(result) || "页面证据"}`,
    label: options.kind || "browser",
    state: "ready",
    body: prompt.slice(0, 12000)
  });
  showToast("浏览器证据验证提示已加入提示词。");
  return prompt;
}

function runBrowserVerificationFix(result = {}, options = {}) {
  if (state.busy) {
    showToast("代理正在运行，请稍后再启动浏览器验证修复。");
    return "";
  }
  const prompt = buildBrowserVerificationPrompt(result, options);
  if (!prompt) {
    showToast("暂无可运行的浏览器验证修复提示。");
    return "";
  }
  input.value = prompt;
  scheduleReferencePreview({ immediate: true });
  appendToolCall({
    title: `已启动浏览器证据验证修复：${options.title || browserEvidenceUrl(result) || "页面证据"}`,
    label: options.kind || "browser",
    state: "running",
    body: prompt.slice(0, 12000)
  });
  showToast("正在启动带验证要求的页面修复。");
  submitPromptForm();
  return prompt;
}

async function runBrowserEvidenceFollowup(result = {}, mode = "trace", options = {}) {
  const targetUrl = browserEvidenceUrl(result);
  if (!targetUrl) {
    showToast("这条浏览器证据没有可继续检查的页面 URL。");
    appendToolCall({
      title: `浏览器后续检查跳过：${options.title || "浏览器证据"}`,
      label: "browser",
      state: "跳过",
      body: JSON.stringify(compactBrowserEvidence(result), null, 2).slice(0, 4000)
    });
    return null;
  }
  if (state.busy) {
    showToast("代理正在运行，请稍后再做浏览器后续检查。");
    return null;
  }
  if (browserCheckUrlInput) browserCheckUrlInput.value = targetUrl;
  const selector = browserSelectorInput?.value.trim() || "";
  const config = {
    trace: {
      endpoint: "/api/browser-trace",
      label: "trace",
      busy: "采集后续 Trace",
      title: "后续 Trace",
      body: { url: targetUrl, waitMs: 1500 },
      render: renderBrowserTrace
    },
    screenshot: {
      endpoint: "/api/browser-screenshot",
      label: "visual",
      busy: "生成后续截图",
      title: "后续截图",
      body: { url: targetUrl, selector },
      render: renderBrowserScreenshot
    },
    visual: {
      endpoint: "/api/browser-visual",
      label: "visual",
      busy: "运行后续视觉断言",
      title: "后续视觉断言",
      body: { url: targetUrl, selector, threshold: 0, maxMismatchRatio: 0 },
      render: renderBrowserVisual
    }
  }[mode];
  if (!config) return null;
  setBusy(true, config.busy);
  try {
    const followup = await api(config.endpoint, {
      method: "POST",
      body: JSON.stringify(config.body)
    });
    const enriched = {
      ...followup,
      sourceEvidence: compactBrowserEvidence(result),
      followup: {
        mode,
        endpoint: config.endpoint,
        requestedAt: new Date().toISOString()
      }
    };
    config.render(enriched);
    appendToolCall({
      title: `${config.title}：${targetUrl}`,
      label: config.label,
      state: enriched.ok ? "完成" : "异常",
      body: JSON.stringify(enriched, null, 2).slice(0, 12000)
    });
    setBusy(false, enriched.ok ? `${config.title}完成` : `${config.title}异常`);
    return enriched;
  } catch (error) {
    const failureKind = {
      trace: "browser-followup-trace-failure",
      screenshot: "browser-followup-screenshot-failure",
      visual: "browser-followup-visual-failure"
    }[mode] || `browser-followup-${mode}-failure`;
    showToast(error.message);
    appendBrowserFailureEvidence(error, {
      title: `${config.title}失败`,
      kind: failureKind,
      label: config.label,
      url: targetUrl,
      selector,
      body: {
        sourceEvidence: compactBrowserEvidence(result),
        request: config.body
      }
    });
    setBusy(false, `${config.title}失败`);
    return null;
  }
}

function referenceBrowserEvidenceFilesInPrompt(result = {}, { title = "浏览器证据" } = {}) {
  const files = browserEvidenceArtifactFiles(result);
  if (!files.length) {
    showToast("这条浏览器证据没有可引用的 artifact 文件。");
    appendToolCall({
      title: `浏览器证据未发现 artifact：${title}`,
      label: "ctx",
      state: "跳过",
      body: JSON.stringify(compactBrowserEvidence(result), null, 2).slice(0, 4000)
    });
    return [];
  }
  const existing = input.value.trim();
  const existingLower = existing.toLowerCase();
  const additions = files
    .map((file) => `@${file}`)
    .filter((ref) => !existingLower.includes(ref.toLowerCase()));
  input.value = [existing, additions.join(" ")].filter(Boolean).join(existing ? "\n" : "");
  input.focus();
  scheduleReferencePreview({ immediate: true });
  appendToolCall({
    title: `已引用浏览器证据文件：${title}`,
    label: "ctx",
    state: `${files.length} files`,
    body: files.map((file) => `@${file}`).join("\n")
  });
  showToast(`已引用 ${files.length} 个浏览器证据文件。`);
  return files;
}

function appendBrowserFailureEvidence(error, {
  title = "浏览器检查失败",
  kind = "browser-failure",
  label = "browser",
  url = "",
  selector = "",
  actions = [],
  body = null
} = {}) {
  const message = error?.message || String(error || "unknown error");
  const evidence = {
    ok: false,
    status: "request_failed",
    url,
    targetUrl: url,
    selector,
    actions,
    error: message,
    reason: message,
    body,
    generatedAt: new Date().toISOString()
  };
  renderBrowserEvidenceRow(evidence, {
    title,
    kind,
    label,
    state: "失败",
    heading: `${title}${url ? `：${url}` : ""}`,
    summary: [
      "request failed",
      selector ? `selector ${selector}` : "",
      message
    ]
  });
  stageBrowserEvidenceVerificationCommands(evidence, {
    title,
    source: `${kind}-recovery`,
    note: "浏览器 API 请求失败后仍可先运行本地语法、UI、debug 和 browser smoke，确认调试链路本身健康。"
  });
  appendToolCall({
    title: `${title}${url ? `：${url}` : ""}`,
    label,
    state: "失败",
    body: JSON.stringify(compactBrowserEvidence(evidence), null, 2).slice(0, 12000)
  });
  return evidence;
}

function semanticEvidenceFiles(evidence = {}) {
  const files = new Map();
  const visit = (value) => {
    if (!value) return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (typeof value === "object") {
      const pathValue = value.path || value.file || value.source || value.target;
      if (typeof pathValue === "string" && /\.[A-Za-z0-9]+$/.test(pathValue)) {
        const normalized = pathValue.replaceAll("\\", "/");
        files.set(normalized.toLowerCase(), normalized);
      }
      Object.values(value).forEach(visit);
    }
  };
  visit(evidence);
  return [...files.values()].slice(0, 12);
}

function compactSemanticEvidence(evidence = {}, max = 12000) {
  return JSON.stringify(evidence, null, 2).slice(0, max);
}

function buildSemanticEvidenceContext(evidence = {}, { title = "语义证据", kind = "semantic" } = {}) {
  if (!evidence || typeof evidence !== "object") return "";
  const files = semanticEvidenceFiles(evidence);
  return [
    "请基于这条代码智能/语义分析证据继续排查并修复当前项目。",
    "",
    `证据类型：${title}`,
    `证据分类：${kind}`,
    files.length ? `相关文件：${files.join(", ")}` : "",
    "",
    "语义证据摘要：",
    compactSemanticEvidence(evidence),
    "",
    "要求：优先处理重复声明、未解析导入、缺失路由、循环依赖、影响面风险或 readiness blocker；需要改代码时输出最小 diff；需要验证时给出安全命令。"
  ].filter(Boolean).join("\n");
}

function appendSemanticEvidenceToPrompt(evidence = {}, options = {}) {
  const context = buildSemanticEvidenceContext(evidence, options);
  if (!context) {
    showToast("暂无可加入提示词的语义证据。");
    return "";
  }
  const current = input.value.trim();
  input.value = [current, context].filter(Boolean).join("\n\n---\n\n");
  input.focus();
  scheduleReferencePreview({ immediate: true });
  appendToolCall({
    title: `语义证据已加入提示词：${options.title || "代码智能"}`,
    label: options.kind || "semantic",
    state: "ready",
    body: context.slice(0, 12000)
  });
  showToast("语义证据已加入提示词。");
  return context;
}

function referenceSemanticEvidenceFilesInPrompt(evidence = {}, { title = "语义证据" } = {}) {
  const files = semanticEvidenceFiles(evidence);
  if (!files.length) {
    showToast("这条语义证据没有识别到可引用文件。");
    appendToolCall({
      title: `语义证据未识别到文件：${title}`,
      label: "ctx",
      state: "跳过",
      body: compactSemanticEvidence(evidence, 4000)
    });
    return [];
  }
  const existing = input.value.trim();
  const existingLower = existing.toLowerCase();
  const additions = files
    .map((file) => `@${file}`)
    .filter((ref) => !existingLower.includes(ref.toLowerCase()));
  input.value = [existing, additions.join(" ")].filter(Boolean).join(existing ? "\n" : "");
  input.focus();
  scheduleReferencePreview({ immediate: true });
  appendToolCall({
    title: `已引用语义证据文件：${title}`,
    label: "ctx",
    state: `${files.length} files`,
    body: files.map((file) => `@${file}`).join("\n")
  });
  showToast(`已引用 ${files.length} 个语义证据文件。`);
  return files;
}

function runSemanticEvidenceRepair(evidence = {}, options = {}) {
  if (state.busy) {
    showToast("代理正在运行，请稍后再启动语义证据修复。");
    return "";
  }
  const context = buildSemanticEvidenceContext(evidence, options);
  if (!context) {
    showToast("暂无可用于修复的语义证据。");
    return "";
  }
  const prompt = [
    context,
    "",
    "请现在直接基于这条语义证据继续修复：先判断最可能影响写代码/调试体验的 blocker，输出最小 diff，并给出修复后的安全验证命令。"
  ].join("\n");
  input.value = prompt;
  scheduleReferencePreview({ immediate: true });
  appendToolCall({
    title: `已启动语义证据修复：${options.title || "代码智能"}`,
    label: options.kind || "semantic",
    state: "running",
    body: prompt.slice(0, 12000)
  });
  showToast("正在基于语义证据启动修复。");
  submitPromptForm();
  return prompt;
}

function semanticEvidenceVerificationCommands(evidence = {}, {
  source = "semantic-evidence",
  includeFallback = false
} = {}) {
  const commands = [];
  const visit = (value) => {
    if (!value) return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (typeof value !== "object") return;
    if (Array.isArray(value.verificationCommands)) {
      value.verificationCommands.forEach((item) => commands.push(item));
    }
    Object.values(value).forEach(visit);
  };
  visit(evidence);
  if (includeFallback) {
    commands.push(
      { command: "node --check app.js", reason: "复查前端工作台语法。", source },
      { command: "node --check server.js", reason: "复查后端 API 和语义分析入口语法。", source },
      { command: "node server.js --ui-smoke-test", reason: "复查语义证据卡、按钮和命令面板入口。", source },
      { command: "node server.js --api-smoke-section=semantic", reason: "复查语义索引、定义、引用、影响面和重命名预览。", source },
      { command: "node server.js --api-smoke-section=debug", reason: "复查语义诊断与调试诊断的恢复链路。", source }
    );
  }
  return normalizeCommandItems(commands).slice(0, 12);
}

function stageSemanticEvidenceVerificationCommands(evidence = {}, {
  title = "语义证据",
  source = "semantic-evidence",
  includeFallback = true,
  note = ""
} = {}) {
  const commands = semanticEvidenceVerificationCommands(evidence, { source, includeFallback });
  return stageRepairVerificationCommands(commands, {
    title: `${title}验证命令`,
    successTitle: title === "语义证据" ? "语义证据验证命令已放入面板" : `${title}验证命令已放入面板`,
    source,
    note: note || "语义证据会先复查语法、UI smoke、semantic smoke 和 debug smoke。"
  });
}

function semanticSymbolImpactEvidence(evidence = {}) {
  const impact = evidence?.symbolImpact && typeof evidence.symbolImpact === "object"
    ? evidence.symbolImpact
    : evidence;
  const hasImpact =
    Array.isArray(impact?.editTargets)
    || impact?.definition
    || impact?.references
    || impact?.impact
    || Array.isArray(impact?.verificationCommands);
  return hasImpact ? impact : null;
}

function semanticRenamePreviewEvidence(evidence = {}) {
  const rename = evidence?.renamePreview && typeof evidence.renamePreview === "object"
    ? evidence.renamePreview
    : evidence;
  const hasPreview =
    Array.isArray(rename?.locations)
    || Array.isArray(rename?.replacementConflicts)
    || Array.isArray(rename?.warnings)
    || (rename?.symbol && rename?.newName);
  return hasPreview ? rename : null;
}

function formatSemanticSymbolImpactSummary(symbolImpact = {}) {
  if (!symbolImpact) return "";
  const editTargets = (symbolImpact.editTargets || [])
    .slice(0, 10)
    .map((item) => {
      const location = [item.path || item.file || "", item.line || item.startLine || ""].filter(Boolean).join(":");
      const label = item.name || item.symbol || item.kind || "target";
      return `- ${location || label}${location ? ` · ${label}` : ""}`;
    })
    .join("\n");
  const definitions = (symbolImpact.definitions || symbolImpact.definition?.definitions || [])
    .slice(0, 8)
    .map((item) => `- ${[item.path || item.file || "", item.line || item.startLine || ""].filter(Boolean).join(":")} ${item.name || item.symbol || ""}`.trim())
    .join("\n");
  const references = (symbolImpact.references?.matches || symbolImpact.references || [])
    .slice(0, 12)
    .map((item) => `- ${[item.path || item.file || "", item.line || item.startLine || ""].filter(Boolean).join(":")} ${item.text || item.name || item.symbol || ""}`.trim())
    .join("\n");
  const dependents = (symbolImpact.impact?.dependents || [])
    .slice(0, 8)
    .map((item) => `- ${item.path || item.file || item}`)
    .join("\n");
  const callers = (symbolImpact.impact?.callers || [])
    .slice(0, 8)
    .map((item) => `- ${[item.path || item.file || "", item.line || item.startLine || ""].filter(Boolean).join(":")} ${item.name || item.caller || ""}`.trim())
    .join("\n");
  return [
    symbolImpact.summary ? `影响摘要：${JSON.stringify(symbolImpact.summary)}` : "",
    editTargets ? `建议编辑目标：\n${editTargets}` : "",
    definitions ? `定义位置：\n${definitions}` : "",
    references ? `引用位置：\n${references}` : "",
    dependents ? `依赖文件：\n${dependents}` : "",
    callers ? `调用点：\n${callers}` : "",
    symbolImpact.policy ? `只读策略：${JSON.stringify(symbolImpact.policy)}` : ""
  ].filter(Boolean).join("\n\n");
}

function formatSemanticRenamePreviewSummary(renamePreview = {}) {
  if (!renamePreview) return "";
  const locations = (renamePreview.locations || [])
    .slice(0, 12)
    .map((item) => {
      const location = [item.path || "", item.line || ""].filter(Boolean).join(":");
      return `- ${location} · ${item.role || item.kind || "reference"} · ${item.before || ""}${item.after ? ` => ${item.after}` : ""}`.trim();
    })
    .join("\n");
  const conflicts = (renamePreview.replacementConflicts || [])
    .slice(0, 8)
    .map((item) => `- ${[item.path || "", item.line || ""].filter(Boolean).join(":")} ${item.kind || ""} ${item.name || ""}`.trim())
    .join("\n");
  return [
    renamePreview.summary ? `重命名摘要：${JSON.stringify(renamePreview.summary)}` : "",
    renamePreview.symbol || renamePreview.newName ? `重命名：${renamePreview.symbol || "(unknown)"} -> ${renamePreview.newName || "(missing)"}` : "",
    locations ? `候选替换位置：\n${locations}` : "",
    conflicts ? `命名冲突：\n${conflicts}` : "",
    renamePreview.warnings?.length ? `风险警告：${renamePreview.warnings.join(", ")}` : "",
    renamePreview.policy ? `只读策略：${JSON.stringify(renamePreview.policy)}` : ""
  ].filter(Boolean).join("\n\n");
}

function buildSemanticSymbolImpactPrompt(evidence = {}, options = {}) {
  const symbolImpact = semanticSymbolImpactEvidence(evidence);
  if (!symbolImpact) return "";
  const context = buildSemanticEvidenceContext(evidence, options);
  const files = semanticEvidenceFiles(symbolImpact);
  const commands = semanticEvidenceVerificationCommands(symbolImpact);
  return [
    context,
    "",
    "目标：基于符号定义、引用和影响范围完成一次 Codex 式代码修复闭环。",
    "",
    formatSemanticSymbolImpactSummary(symbolImpact),
    files.length ? `优先读取这些影响文件：\n${files.map((file) => `@${file}`).join("\n")}` : "",
    commands.length ? `建议验证命令：\n${commands.map((item) => `- ${item.command}${item.reason ? `：${item.reason}` : ""}`).join("\n")}` : "",
    "",
    "输出要求：",
    "1. 先确认目标符号的定义、引用和影响文件是否仍与当前代码一致。",
    "2. 如果需要改代码，只修改 editTargets 或直接受影响的文件，避免无关重构。",
    "3. 修复后必须说明定义、引用、调用点和依赖文件是否仍然一致。",
    "4. 必须运行或列出上面的验证命令；没有命令时至少给出语法检查和相关 smoke。"
  ].filter(Boolean).join("\n");
}

function buildSemanticRenamePreviewPrompt(evidence = {}, options = {}) {
  const renamePreview = semanticRenamePreviewEvidence(evidence);
  if (!renamePreview) return "";
  const context = buildSemanticEvidenceContext(evidence, options);
  const files = semanticEvidenceFiles(renamePreview);
  const commands = semanticEvidenceVerificationCommands(renamePreview);
  return [
    context,
    "",
    "目标：基于只读重命名预览完成一次安全重构闭环。",
    "",
    formatSemanticRenamePreviewSummary(renamePreview),
    files.length ? `优先读取这些待改文件：\n${files.map((file) => `@${file}`).join("\n")}` : "",
    commands.length ? `建议验证命令：\n${commands.map((item) => `- ${item.command}${item.reason ? `：${item.reason}` : ""}`).join("\n")}` : "",
    "",
    "输出要求：",
    "1. 先核对候选替换位置、命名冲突和风险警告，不要跨越预览范围盲改。",
    "2. 如果执行重命名，请生成最小 diff，并保留未命中的位置作为人工复核项。",
    "3. 修复后必须说明定义、导入、导出、调用点和候选替换位置是否一致。",
    "4. 必须运行或列出上面的验证命令；没有命令时至少给出语法检查和 semantic smoke。"
  ].filter(Boolean).join("\n");
}

function stageSemanticSymbolImpactCommands(evidence = {}, options = {}) {
  const symbolImpact = semanticSymbolImpactEvidence(evidence);
  const commands = semanticEvidenceVerificationCommands(symbolImpact || evidence);
  const staged = stageRepairVerificationCommands(commands, {
    title: "符号影响验证命令",
    successTitle: `符号影响验证命令已放入面板：${options.title || "代码智能"}`,
    source: "semantic-symbol-impact",
    note: "这条符号影响证据没有提供验证命令。"
  });
  if (symbolImpact && staged.length) {
    const chain = createRepairEvidenceChain({
      source: "semantic-symbol-impact",
      prompt: buildSemanticSymbolImpactPrompt(evidence, options)
    });
    updateRepairEvidenceChain({
      ...chain,
      status: "verification_staged",
      repair: {
        reply: "已根据符号影响范围排队验证命令。",
        hasDiff: false,
        files: semanticEvidenceFiles(symbolImpact),
        commandCount: staged.length,
        reviewCount: 0
      },
      verification: {
        ok: false,
        skipped: false,
        checkCount: staged.length,
        failedCommands: []
      }
    }, { title: "符号影响修复证据链已创建" });
  }
  return staged;
}

function stageSemanticRenamePreviewCommands(evidence = {}, options = {}) {
  const renamePreview = semanticRenamePreviewEvidence(evidence);
  const commands = semanticEvidenceVerificationCommands(renamePreview || evidence);
  const staged = stageRepairVerificationCommands(commands, {
    title: "重命名预览验证命令",
    successTitle: `重命名预览验证命令已放入面板：${options.title || "代码智能"}`,
    source: "semantic-rename-preview",
    note: "这条重命名预览证据没有提供验证命令。"
  });
  if (renamePreview && staged.length) {
    const chain = createRepairEvidenceChain({
      source: "semantic-rename-preview",
      prompt: buildSemanticRenamePreviewPrompt(evidence, options)
    });
    updateRepairEvidenceChain({
      ...chain,
      status: "verification_staged",
      repair: {
        reply: "已根据重命名预览排队验证命令。",
        hasDiff: false,
        files: semanticEvidenceFiles(renamePreview),
        commandCount: staged.length,
        reviewCount: renamePreview.warnings?.length || 0
      },
      verification: {
        ok: false,
        skipped: false,
        checkCount: staged.length,
        failedCommands: []
      }
    }, { title: "重命名预览修复证据链已创建" });
  }
  return staged;
}

function appendSemanticSymbolImpactPromptToPrompt(evidence = {}, options = {}) {
  const prompt = buildSemanticSymbolImpactPrompt(evidence, options);
  if (!prompt) {
    showToast("暂无可生成符号影响提示的语义证据。");
    return "";
  }
  const current = input.value.trim();
  input.value = [current, prompt].filter(Boolean).join("\n\n---\n\n");
  input.focus();
  scheduleReferencePreview({ immediate: true });
  appendToolCall({
    title: `符号影响修复提示已加入提示词：${options.title || "代码智能"}`,
    label: options.kind || "symbol",
    state: "ready",
    body: prompt.slice(0, 12000)
  });
  showToast("符号影响修复提示已加入提示词。");
  return prompt;
}

function appendSemanticRenamePreviewPromptToPrompt(evidence = {}, options = {}) {
  const prompt = buildSemanticRenamePreviewPrompt(evidence, options);
  if (!prompt) {
    showToast("暂无可生成重命名预览提示的语义证据。");
    return "";
  }
  const current = input.value.trim();
  input.value = [current, prompt].filter(Boolean).join("\n\n---\n\n");
  input.focus();
  scheduleReferencePreview({ immediate: true });
  appendToolCall({
    title: `重命名预览提示已加入提示词：${options.title || "代码智能"}`,
    label: options.kind || "rename",
    state: "ready",
    body: prompt.slice(0, 12000)
  });
  showToast("重命名预览提示已加入提示词。");
  return prompt;
}

function runSemanticSymbolImpactFix(evidence = {}, options = {}) {
  if (state.busy) {
    showToast("代理正在运行，请稍后再启动符号影响修复。");
    return "";
  }
  const prompt = buildSemanticSymbolImpactPrompt(evidence, options);
  if (!prompt) {
    showToast("暂无可用于修复的符号影响证据。");
    return "";
  }
  const commands = stageSemanticSymbolImpactCommands(evidence, options);
  const chain = updateRepairEvidenceChain({
    source: "semantic-symbol-impact",
    status: "repair_requested",
    prompt,
    repair: {
      reply: "已基于符号影响范围启动修复。",
      hasDiff: false,
      files: semanticEvidenceFiles(semanticSymbolImpactEvidence(evidence) || evidence),
      commandCount: commands.length,
      reviewCount: 0
    }
  }, { title: "符号影响修复证据链已续写" });
  input.value = prompt;
  scheduleReferencePreview({ immediate: true });
  appendToolCall({
    title: `已启动符号影响修复：${options.title || "代码智能"}`,
    label: options.kind || "symbol",
    state: "running",
    body: [summarizeRepairEvidenceChain(chain), "", prompt].filter(Boolean).join("\n").slice(0, 12000)
  });
  showToast("正在基于符号影响范围启动修复。");
  submitPromptForm();
  return prompt;
}

function runSemanticRenamePreviewFix(evidence = {}, options = {}) {
  if (state.busy) {
    showToast("代理正在运行，请稍后再启动重命名预览修复。");
    return "";
  }
  const prompt = buildSemanticRenamePreviewPrompt(evidence, options);
  if (!prompt) {
    showToast("暂无可用于修复的重命名预览证据。");
    return "";
  }
  const commands = stageSemanticRenamePreviewCommands(evidence, options);
  const chain = updateRepairEvidenceChain({
    source: "semantic-rename-preview",
    status: "repair_requested",
    prompt,
    repair: {
      reply: "已基于重命名预览启动修复。",
      hasDiff: false,
      files: semanticEvidenceFiles(semanticRenamePreviewEvidence(evidence) || evidence),
      commandCount: commands.length,
      reviewCount: semanticRenamePreviewEvidence(evidence)?.warnings?.length || 0
    }
  }, { title: "重命名预览修复证据链已续写" });
  input.value = prompt;
  scheduleReferencePreview({ immediate: true });
  appendToolCall({
    title: `已启动重命名预览修复：${options.title || "代码智能"}`,
    label: options.kind || "rename",
    state: "running",
    body: [summarizeRepairEvidenceChain(chain), "", prompt].filter(Boolean).join("\n").slice(0, 12000)
  });
  showToast("正在基于重命名预览启动修复。");
  submitPromptForm();
  return prompt;
}

async function createSemanticRenameDraft(evidence = {}, options = {}) {
  if (state.busy) {
    showToast("代理正在运行，请稍后再生成重命名草稿。");
    return null;
  }
  const renamePreview = semanticRenamePreviewEvidence(evidence);
  if (!renamePreview?.symbol || !renamePreview?.newName) {
    showToast("暂无可生成草稿的重命名预览证据。");
    return null;
  }
  setBusy(true, "生成重命名草稿");
  try {
    const result = await api("/api/semantic-rename-draft", {
      method: "POST",
      body: JSON.stringify({
        symbol: renamePreview.symbol,
        newName: renamePreview.newName,
        path: renamePreview.path || "",
        limit: 80,
        contextLines: 3,
        prompt: buildSemanticRenamePreviewPrompt(evidence, options)
      })
    });
    state.pendingDiff = result.proposal?.diff || "";
    renderPlan(result.proposal?.plan || []);
    renderDiff(result.proposal?.patches || []);
    renderReview(result.proposal?.review || []);
    renderCommands(result.proposal?.commands || []);
    const chain = updateRepairEvidenceChain({
      source: "semantic-rename-draft",
      status: "awaiting_approval",
      prompt: result.proposal?.prompt || "",
      repair: {
        reply: result.proposal?.reply || "已生成重命名 diff 草稿。",
        hasDiff: Boolean(result.proposal?.diff),
        files: (result.proposal?.patches || []).map((item) => item.path).filter(Boolean),
        commandCount: result.proposal?.commands?.length || 0,
        reviewCount: result.proposal?.review?.length || 0
      },
      verification: {
        ok: false,
        skipped: false,
        checkCount: result.proposal?.commands?.length || 0,
        failedCommands: []
      }
    }, { title: "重命名草稿已加入修复证据链" });
    appendToolCall({
      title: `重命名 diff 草稿已生成：${renamePreview.symbol} -> ${renamePreview.newName}`,
      label: options.kind || "rename",
      state: "待审批",
      body: JSON.stringify({
        summary: result.summary,
        proposalId: result.proposal?.id,
        files: result.proposal?.patches?.map((item) => item.path),
        commands: result.proposal?.commands,
        repairChain: summarizeRepairEvidenceChain(chain),
        policy: result.policy
      }, null, 2).slice(0, 12000)
    });
    appendMessage("agent", result.proposal?.reply || "重命名 diff 草稿已放入预览区，可复核后批准写入。");
    setBusy(false, "重命名草稿待审批");
    return result;
  } catch (error) {
    showToast(error.message);
    appendSemanticFailureEvidence(error, {
      title: "生成重命名草稿失败证据",
      kind: options.kind || "rename",
      endpoint: "/api/semantic-rename-draft",
      request: {
        symbol: renamePreview.symbol,
        newName: renamePreview.newName,
        path: renamePreview.path || "",
        limit: 80,
        contextLines: 3
      }
    });
    setBusy(false, "重命名草稿失败");
    return null;
  }
}

function buildSemanticVerificationPrompt(evidence = {}, options = {}) {
  const context = buildSemanticEvidenceContext(evidence, options);
  if (!context) return "";
  const files = semanticEvidenceFiles(evidence);
  const evidenceCommands = semanticEvidenceVerificationCommands(evidence);
  const browserTriageContext = formatBrowserTriageContinuation(evidence.browserTriage || evidence.diagnostics?.browserTriage || state.lastDebugDiagnostics?.browserTriage || null, { title: "语义证据关联浏览器异常分诊" });
  const commands = evidenceCommands.length ? evidenceCommands : semanticEvidenceVerificationCommands(evidence, {
    source: "semantic-verification-fallback",
    includeFallback: true
  });
  return [
    context,
    "",
    "目标：把这条语义诊断证据转成可验证修复闭环。",
    files.length ? `优先读取这些相关文件：\n${files.map((file) => `@${file}`).join("\n")}` : "",
    browserTriageContext ? `页面调试线索：\n${browserTriageContext}` : "",
    "",
    "建议验证命令：",
    ...commands.map((item) => `- ${item.command}${item.reason ? `：${item.reason}` : ""}`),
    "",
    "输出要求：",
    "1. 先判断语义诊断是否代表真实 bug、重复实现、未解析依赖或前端/API 契约缺口。",
    "2. 如果需要改代码，请生成最小 diff，避免无关重构。",
    "3. 修复后必须说明应运行哪些验证命令，并优先复用上面的安全检查。",
    "4. 如果诊断是误报，请说明证据，并给出保持现状的验证方式。"
  ].filter(Boolean).join("\n");
}

function appendSemanticVerificationPromptToPrompt(evidence = {}, options = {}) {
  const prompt = buildSemanticVerificationPrompt(evidence, options);
  if (!prompt) {
    showToast("暂无可生成验证提示的语义证据。");
    return "";
  }
  const current = input.value.trim();
  input.value = [current, prompt].filter(Boolean).join("\n\n---\n\n");
  input.focus();
  scheduleReferencePreview({ immediate: true });
  appendToolCall({
    title: `语义诊断验证提示已加入提示词：${options.title || "代码智能"}`,
    label: options.kind || "semantic",
    state: "ready",
    body: prompt.slice(0, 12000)
  });
  showToast("语义诊断验证提示已加入提示词。");
  return prompt;
}

function runSemanticVerificationFix(evidence = {}, options = {}) {
  if (state.busy) {
    showToast("代理正在运行，请稍后再启动语义验证修复。");
    return "";
  }
  const prompt = buildSemanticVerificationPrompt(evidence, options);
  if (!prompt) {
    showToast("暂无可运行的语义验证修复提示。");
    return "";
  }
  input.value = prompt;
  scheduleReferencePreview({ immediate: true });
  appendToolCall({
    title: `已启动语义诊断验证修复：${options.title || "代码智能"}`,
    label: options.kind || "semantic",
    state: "running",
    body: prompt.slice(0, 12000)
  });
  showToast("正在启动带验证要求的语义修复。");
  submitPromptForm();
  return prompt;
}

function appendSemanticEvidenceCard(evidence = {}, {
  title = "语义证据",
  kind = "semantic",
  state: status = "完成",
  body = ""
} = {}) {
  appendToolCall({
    title,
    label: kind,
    state: status,
    body: body || compactSemanticEvidence(evidence)
  });
  const article = log.lastElementChild;
  if (!article) return;
  const actions = document.createElement("div");
  actions.className = "debug-last-failed-actions";
  actions.innerHTML = `<button type="button" data-action="prompt">加入提示词</button><button type="button" data-action="reference">引用文件</button><button type="button" data-action="stage-verification">排队验证</button><button type="button" data-action="verification-prompt">验证提示</button><button type="button" data-action="verification-fix">验证修复</button><button type="button" data-action="symbol-impact-prompt">影响提示</button><button type="button" data-action="symbol-impact-fix">影响修复</button><button type="button" data-action="rename-preview-prompt">重命名提示</button><button type="button" data-action="rename-preview-fix">重命名修复</button><button type="button" data-action="rename-draft">重命名草稿</button><button type="button" data-action="repair">直接修复</button>`;
  actions.querySelector("[data-action='prompt']").addEventListener("click", () => {
    appendSemanticEvidenceToPrompt(evidence, { title, kind });
  });
  actions.querySelector("[data-action='reference']").addEventListener("click", () => {
    referenceSemanticEvidenceFilesInPrompt(evidence, { title });
  });
  actions.querySelector("[data-action='stage-verification']").addEventListener("click", () => {
    stageSemanticEvidenceVerificationCommands(evidence, {
      title,
      source: "semantic-evidence-card",
      includeFallback: true
    });
  });
  actions.querySelector("[data-action='verification-prompt']").addEventListener("click", () => {
    appendSemanticVerificationPromptToPrompt(evidence, { title, kind });
  });
  actions.querySelector("[data-action='verification-fix']").addEventListener("click", () => {
    runSemanticVerificationFix(evidence, { title, kind });
  });
  actions.querySelector("[data-action='symbol-impact-prompt']").addEventListener("click", () => {
    appendSemanticSymbolImpactPromptToPrompt(evidence, { title, kind });
  });
  actions.querySelector("[data-action='symbol-impact-fix']").addEventListener("click", () => {
    runSemanticSymbolImpactFix(evidence, { title, kind });
  });
  actions.querySelector("[data-action='rename-preview-prompt']").addEventListener("click", () => {
    appendSemanticRenamePreviewPromptToPrompt(evidence, { title, kind });
  });
  actions.querySelector("[data-action='rename-preview-fix']").addEventListener("click", () => {
    runSemanticRenamePreviewFix(evidence, { title, kind });
  });
  actions.querySelector("[data-action='rename-draft']").addEventListener("click", () => {
    createSemanticRenameDraft(evidence, { title, kind });
  });
  actions.querySelector("[data-action='repair']").addEventListener("click", () => {
    runSemanticEvidenceRepair(evidence, { title, kind });
  });
  article.appendChild(actions);
}

function appendSemanticFailureEvidence(error, {
  title = "语义分析失败证据",
  kind = "semantic-failure",
  endpoint = "",
  request = null
} = {}) {
  const message = error?.message || String(error || "unknown error");
  const evidence = {
    status: "failed",
    generatedAt: new Date().toISOString(),
    endpoint,
    request,
    error: message,
    workspace: workspaceStatus?.textContent || "",
    lastPrompt: state.lastPrompt || input.value.trim(),
    pendingDiff: {
      bytes: String(state.pendingDiff || "").length,
      files: (state.pendingPatches || []).map((patch) => ({ path: patch.path })).filter((item) => item.path).slice(0, 20)
    },
    context: {
      activeThreadId: state.activeThreadId || "",
      hasDebugDiagnostics: Boolean(state.lastDebugDiagnostics),
      hasRepairChain: Boolean(state.activeRepairChain)
    }
  };
  appendSemanticEvidenceCard(evidence, {
    title,
    kind,
    state: "失败",
    body: compactSemanticEvidence(evidence)
  });
  stageSemanticEvidenceVerificationCommands(evidence, {
    title,
    source: `${kind}-recovery`,
    includeFallback: true,
    note: "语义接口请求失败后仍可先运行本地语法、UI、semantic 和 debug smoke，确认代码智能链路本身健康。"
  });
  return evidence;
}

async function analyzePendingDiffImpact() {
  const paths = pendingDiffImpactPaths();
  const diffText = combinedPendingDiff() || state.pendingDiff || "";
  if (!paths.length && !diffText.trim()) {
    showToast("当前没有待审批 diff 可分析。");
    appendToolCall({
      title: "待审批 diff 影响面跳过",
      label: "impact",
      state: "跳过",
      body: "当前没有待审批 diff。"
    });
    return null;
  }
  setBusy(true, "分析待审批 diff");
  try {
    const result = await api("/api/semantic-impact", {
      method: "POST",
      body: JSON.stringify({ paths, limit: 80, includeContext: true })
    });
    const total = summarizeDiffPatches(state.pendingPatches || []);
    const verificationCommands = pendingDiffImpactVerificationCommands(paths);
    const evidence = {
      generatedAt: result.generatedAt,
      source: "pending-diff",
      semanticSource: result.source,
      pendingDiff: {
        bytes: String(diffText || "").length,
        patchCount: state.pendingPatches?.length || 0,
        additions: total.additions,
        deletions: total.deletions,
        files: paths
      },
      summary: result.summary,
      editTargets: result.targetSummaries?.slice(0, 30),
      impact: {
        targetSummaries: result.targetSummaries?.slice(0, 30),
        dependents: result.dependents?.slice(0, 30),
        callers: result.callers?.slice(0, 30),
        routes: result.routes?.slice(0, 20),
        selectors: result.selectors?.slice(0, 20),
        warnings: result.warnings
      },
      verificationCommands,
      policy: {
        readsOnly: true,
        source: "pending-diff-impact",
        pathsExplicitlyFromPendingDiff: true,
        writesFiles: false
      }
    };
    appendSemanticEvidenceCard(evidence, {
      title: "待审批 diff 影响面已生成",
      kind: "pending-impact",
      state: result.warnings?.length ? "review" : "完成",
      body: compactSemanticEvidence(evidence)
    });
    stageRepairVerificationCommands(verificationCommands, {
      title: "待审批 diff 影响面验证命令",
      successTitle: "待审批 diff 影响面验证命令已放入面板",
      source: "pending-diff-impact",
      note: "待审批 diff 影响面没有可排队的验证命令。"
    });
    setBusy(false, "待审批影响面完成");
    return evidence;
  } catch (error) {
    showToast(error.message);
    appendSemanticFailureEvidence(error, {
      title: "生成待审批 diff 影响面失败证据",
      kind: "pending-impact",
      endpoint: "/api/semantic-impact",
      request: {
        paths,
        limit: 80,
        includeContext: true,
        pendingDiffBytes: String(diffText || "").length
      }
    });
    setBusy(false, "待审批影响面失败");
    return null;
  }
}

function compactGateEvidence(evidence = {}, max = 12000) {
  return JSON.stringify(evidence, null, 2).slice(0, max);
}

function gateEvidenceCommands(evidence = {}) {
  const commands = [];
  const addCommand = (value) => {
    const command = typeof value === "string" ? value : value?.command;
    if (!command || typeof command !== "string") return;
    if (!commands.some((item) => commandResultKey(item.command || item) === commandResultKey(command))) {
      commands.push(typeof value === "string" ? { command } : { ...value, command });
    }
  };
  const visit = (value) => {
    if (!value) return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (typeof value === "object") {
      if (value.command) addCommand(value);
      Object.values(value).forEach(visit);
    }
  };
  visit(evidence.verificationPlan || evidence.plan || evidence);
  return normalizeCommandItems(commands).slice(0, 20);
}

function gateEvidenceArtifactFiles(evidence = {}) {
  const files = new Set();
  const addPath = (value) => {
    const text = String(value || "").replaceAll("\\", "/").trim();
    if (!text || /^[a-z]+:\/\//i.test(text)) return;
    if (text.includes("..")) return;
    if (/\.(?:md|json|txt|log|diff|patch)$/i.test(text)) files.add(text);
  };
  const visit = (value, key = "") => {
    if (!value) return;
    if (typeof value === "string") {
      if (/path|file|body|summary|plan|artifact|dir/i.test(key)) addPath(value);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item) => visit(item, key));
      return;
    }
    if (typeof value === "object") {
      Object.entries(value).forEach(([childKey, childValue]) => visit(childValue, childKey));
    }
  };
  visit(evidence);
  return [...files].slice(0, 12);
}

function referenceGateEvidenceFilesInPrompt(evidence = {}, { title = "门禁证据" } = {}) {
  const files = gateEvidenceArtifactFiles(evidence);
  if (!files.length) {
    showToast("这条门禁证据没有可引用的本地文件。");
    appendToolCall({
      title: `门禁证据没有可引用文件：${title}`,
      label: "ctx",
      state: "跳过",
      body: compactGateEvidence(evidence, 4000)
    });
    return [];
  }
  const current = input.value.trim();
  const currentLower = current.toLowerCase();
  const refs = files
    .map((file) => `@${file}`)
    .filter((ref) => !currentLower.includes(ref.toLowerCase()));
  input.value = [current, refs.join(" ")].filter(Boolean).join(current ? "\n" : "");
  input.focus();
  scheduleReferencePreview({ immediate: true });
  appendToolCall({
    title: `已引用门禁证据文件：${title}`,
    label: "ctx",
    state: `${files.length} files`,
    body: files.map((file) => `@${file}`).join("\n")
  });
  showToast(`已引用 ${files.length} 个门禁证据文件。`);
  return files;
}

function buildGateEvidenceContext(evidence = {}, { title = "门禁证据", kind = "gate" } = {}) {
  if (!evidence || typeof evidence !== "object") return "";
  const commands = gateEvidenceCommands(evidence);
  const artifactFiles = gateEvidenceArtifactFiles(evidence);
  return [
    "请基于这条验证门禁/CI/PR/权限证据继续排查并修复当前项目。",
    "",
    `证据类型：${title}`,
    `证据分类：${kind}`,
    commands.length ? `可复用检查命令：${commands.map((item) => item.command).join(" | ")}` : "",
    artifactFiles.length ? `相关本地文件：\n${artifactFiles.map((file) => `@${file}`).join("\n")}` : "",
    "",
    "门禁证据摘要：",
    compactGateEvidence(evidence),
    "",
    "要求：先判断 blockers、warnings、CI 失败、权限策略或 PR readiness 缺口；需要改代码时输出最小 diff；需要验证时优先复用证据中的安全检查命令。"
  ].filter(Boolean).join("\n");
}

function appendGateEvidenceToPrompt(evidence = {}, options = {}) {
  const context = buildGateEvidenceContext(evidence, options);
  if (!context) {
    showToast("暂无可加入提示词的门禁证据。");
    return "";
  }
  const current = input.value.trim();
  input.value = [current, context].filter(Boolean).join("\n\n---\n\n");
  input.focus();
  scheduleReferencePreview({ immediate: true });
  appendToolCall({
    title: `门禁证据已加入提示词：${options.title || "门禁证据"}`,
    label: options.kind || "gate",
    state: "ready",
    body: context.slice(0, 12000)
  });
  showToast("门禁证据已加入提示词。");
  return context;
}

function buildGateVerificationPrompt(evidence = {}, options = {}) {
  const context = buildGateEvidenceContext(evidence, options);
  if (!context) return "";
  const browserTriageContext = formatBrowserTriageContinuation(evidence.browserTriage || evidence.diagnostics?.browserTriage || state.lastDebugDiagnostics?.browserTriage || null, { title: "门禁关联浏览器异常分诊" });
  const commandLines = gateEvidenceVerificationCommands(evidence).map((item) => item.command);
  return [
    context,
    "",
    "目标：把这条门禁/CI/PR/权限证据转成可验证修复闭环。",
    browserTriageContext ? `页面调试线索：\n${browserTriageContext}` : "",
    "",
    "建议验证命令：",
    ...commandLines.map((command) => `- ${command}`),
    "",
    "输出要求：",
    "1. 先判断 blocker 来自验证计划、CI 状态、PR readiness、审批、权限策略还是远端发布预检。",
    "2. 如果需要改代码，请生成最小 diff，避免无关重构和真实远端写入。",
    "3. 修复后必须说明应运行哪些本地验证命令，并优先复用上面的安全检查。",
    "4. 如果门禁证据只是未授权或外部凭据缺失，请保留安全边界，输出可执行的本地替代验证。"
  ].filter(Boolean).join("\n");
}

function gateEvidenceBlockerSummary(evidence = {}) {
  const blockers = [];
  const warnings = [];
  const add = (target, value, prefix = "") => {
    if (!value) return;
    if (Array.isArray(value)) {
      value.forEach((item) => add(target, item, prefix));
      return;
    }
    const text = typeof value === "string"
      ? value
      : value?.message || value?.reason || value?.label || value?.id || JSON.stringify(value);
    const line = [prefix, text].filter(Boolean).join(": ").trim();
    if (line && !target.includes(line)) target.push(line);
  };
  add(blockers, evidence.blockers);
  add(warnings, evidence.warnings);
  add(blockers, evidence.readiness?.blockers, "readiness");
  add(warnings, evidence.readiness?.warnings, "readiness");
  add(blockers, evidence.ci?.blockers, "ci");
  add(blockers, evidence.preflight?.blockers, "preflight");
  (evidence.gates || []).forEach((gate) => {
    if (gate?.status === "block") add(blockers, gate.evidence, gate.label || gate.id || "gate");
    if (gate?.status === "warn") add(warnings, gate.evidence, gate.label || gate.id || "gate");
  });
  return {
    blockers: blockers.slice(0, 12),
    warnings: warnings.slice(0, 12)
  };
}

function buildGateBlockerPrompt(evidence = {}, options = {}) {
  const context = buildGateEvidenceContext(evidence, options);
  if (!context) return "";
  const summary = gateEvidenceBlockerSummary(evidence);
  const commands = gateEvidenceVerificationCommands(evidence);
  const artifactFiles = gateEvidenceArtifactFiles(evidence);
  return [
    "请优先处理这条门禁/PR readiness 证据里的阻塞项。",
    "",
    `证据类型：${options.title || "门禁证据"}`,
    `证据分类：${options.kind || "gate"}`,
    summary.blockers.length ? `阻塞项：\n${summary.blockers.map((item) => `- ${item}`).join("\n")}` : "阻塞项：未发现明确 blocker。",
    summary.warnings.length ? `警告项：\n${summary.warnings.map((item) => `- ${item}`).join("\n")}` : "",
    artifactFiles.length ? `相关本地文件：\n${artifactFiles.map((file) => `@${file}`).join("\n")}` : "",
    commands.length ? `建议验证命令：\n${commands.map((item) => `- ${item.command}${item.reason ? `：${item.reason}` : ""}`).join("\n")}` : "",
    "",
    "要求：如果 blocker 来自本地代码、验证失败或配置缺口，请给出最小修复 diff；如果 blocker 来自远端权限、认证或外部平台，请保留安全边界，给出本地替代预检和授权清单。",
    "",
    context
  ].filter(Boolean).join("\n");
}

function appendGateBlockerPromptToPrompt(evidence = {}, options = {}) {
  const prompt = buildGateBlockerPrompt(evidence, options);
  if (!prompt) {
    showToast("暂无可生成阻塞提示的门禁证据。");
    return "";
  }
  const current = input.value.trim();
  input.value = [current, prompt].filter(Boolean).join("\n\n---\n\n");
  input.focus();
  scheduleReferencePreview({ immediate: true });
  appendToolCall({
    title: `门禁阻塞提示已加入提示词：${options.title || "门禁证据"}`,
    label: options.kind || "gate",
    state: "ready",
    body: prompt.slice(0, 12000)
  });
  showToast("门禁阻塞提示已加入提示词。");
  return prompt;
}

function gateEvidenceVerificationCommands(evidence = {}, {
  source = "gate-evidence",
  includeFallback = true
} = {}) {
  const commands = [...gateEvidenceCommands(evidence)];
  if (includeFallback) {
    commands.push(
      { command: "node --check app.js", reason: "复查门禁失败证据卡、排队验证和验证修复入口的前端语法。", source },
      { command: "node --check server.js", reason: "复查验证计划、CI、PR readiness、权限矩阵和合并门禁接口的后端语法。", source },
      { command: "node server.js --ui-smoke-test", reason: "复查门禁证据、失败卡、排队验证和命令面板入口。", source },
      { command: "node server.js --api-smoke-section=fast", reason: "复查核心、上下文、写入和门禁组合链路。", source },
      { command: "node server.js --api-smoke-section=debug", reason: "复查门禁失败后进入调试诊断和验证修复链路。", source }
    );
  }
  return normalizeCommandItems(commands).slice(0, 12);
}

function stageGateEvidenceVerificationCommands(evidence = {}, {
  title = "门禁证据",
  source = "gate-evidence",
  includeFallback = true,
  note = ""
} = {}) {
  const commands = gateEvidenceVerificationCommands(evidence, { source, includeFallback });
  const successTitle = title === "门禁请求失败"
    ? "门禁请求失败验证命令已放入面板"
    : `${title}验证命令已放入面板`;
  return stageRepairVerificationCommands(commands, {
    title: `${title}验证命令`,
    successTitle,
    source,
    note: note || "门禁证据会先复查语法、UI smoke、fast smoke 和 debug smoke。"
  });
}

function appendGateVerificationPromptToPrompt(evidence = {}, options = {}) {
  const prompt = buildGateVerificationPrompt(evidence, options);
  if (!prompt) {
    showToast("暂无可生成验证提示的门禁证据。");
    return "";
  }
  const current = input.value.trim();
  input.value = [current, prompt].filter(Boolean).join("\n\n---\n\n");
  input.focus();
  scheduleReferencePreview({ immediate: true });
  appendToolCall({
    title: `门禁验证提示已加入提示词：${options.title || "门禁证据"}`,
    label: options.kind || "gate",
    state: "ready",
    body: prompt.slice(0, 12000)
  });
  showToast("门禁验证提示已加入提示词。");
  return prompt;
}

function runGateVerificationFix(evidence = {}, options = {}) {
  if (state.busy) {
    showToast("代理正在运行，请稍后再启动门禁验证修复。");
    return "";
  }
  const prompt = buildGateVerificationPrompt(evidence, options);
  if (!prompt) {
    showToast("暂无可运行的门禁验证修复提示。");
    return "";
  }
  input.value = prompt;
  scheduleReferencePreview({ immediate: true });
  appendToolCall({
    title: `已启动门禁验证修复：${options.title || "门禁证据"}`,
    label: options.kind || "gate",
    state: "running",
    body: prompt.slice(0, 12000)
  });
  showToast("正在启动带验证要求的门禁修复。");
  submitPromptForm();
  return prompt;
}

function stageGateEvidenceCommands(evidence = {}, { title = "门禁证据" } = {}) {
  const commands = gateEvidenceCommands(evidence);
  if (!commands.length) {
    showToast("这条门禁证据没有可复用检查命令。");
    appendToolCall({
      title: `门禁证据没有检查命令：${title}`,
      label: "$",
      state: "跳过",
      body: compactGateEvidence(evidence, 4000)
    });
    return [];
  }
  const existing = normalizeCommandItems(state.pendingCommands || []);
  const merged = [
    ...commands,
    ...existing.filter((item) => !commands.some((command) => commandResultKey(command.command) === commandResultKey(item.command)))
  ];
  renderCommands(merged);
  commands.forEach((item) => rememberCommand(item.command, { reason: title, source: "gate-evidence" }));
  appendToolCall({
    title: `门禁检查命令已放入面板：${title}`,
    label: "$",
    state: `${commands.length} commands`,
    body: commandItemsToText(commands)
  });
  showToast(`已加入 ${commands.length} 条门禁检查命令。`);
  return commands;
}

function runGateEvidenceRepair(evidence = {}, options = {}) {
  if (state.busy) {
    showToast("代理正在运行，请稍后再启动门禁证据修复。");
    return "";
  }
  const context = buildGateEvidenceContext(evidence, options);
  if (!context) {
    showToast("暂无可用于修复的门禁证据。");
    return "";
  }
  const prompt = [
    context,
    "",
    "请现在直接基于这条门禁证据继续修复：优先解除 blocker、失败检查或 readiness 缺口，输出最小 diff，并给出修复后的安全验证命令。"
  ].join("\n");
  input.value = prompt;
  scheduleReferencePreview({ immediate: true });
  appendToolCall({
    title: `已启动门禁证据修复：${options.title || "门禁证据"}`,
    label: options.kind || "gate",
    state: "running",
    body: prompt.slice(0, 12000)
  });
  showToast("正在基于门禁证据启动修复。");
  submitPromptForm();
  return prompt;
}

async function appendRemotePublishContinuationCard(packageId = "") {
  const result = await api("/api/remote-publish-continuation", {
    method: "POST",
    body: JSON.stringify({ id: packageId || "", limit: 8 })
  });
  const continuation = result.continuation || {};
  const evidence = {
    status: continuation.status,
    packageId: continuation.packageId,
    package: continuation.package,
    approval: continuation.approval,
    preflight: continuation.preflight,
    manualSteps: continuation.manualSteps,
    evidenceTemplate: continuation.evidenceTemplate,
    verificationCommands: continuation.verificationCommands,
    paths: continuation.paths,
    policy: continuation.policy
  };
  appendGateEvidenceCard(evidence, {
    title: "远端发布继续包已生成",
    kind: "release",
    state: continuation.status || "needs_attention",
    body: compactGateEvidence(evidence)
  });
  return continuation;
}

async function appendRemotePublishEvidenceCard(packageId = "", evidence = null) {
  const result = await api("/api/remote-publish-evidence", {
    method: "POST",
    body: JSON.stringify({ id: packageId || "", evidence, limit: 8 })
  });
  const remoteEvidence = result.evidence || {};
  appendGateEvidenceCard(remoteEvidence, {
    title: "外部发布证据已回填",
    kind: "release",
    state: remoteEvidence.status || "needs_attention",
    body: compactGateEvidence(remoteEvidence)
  });
  if (remoteEvidence.verificationCommands?.length) {
    stageGateEvidenceVerificationCommands(remoteEvidence, {
      title: "外部发布证据回填",
      source: "remote-publish-evidence"
    });
  }
  return remoteEvidence;
}

function appendRemotePublishContinuationPrompt(continuation = {}) {
  const evidence = {
    status: continuation.status,
    packageId: continuation.packageId,
    approval: continuation.approval,
    preflight: continuation.preflight,
    manualSteps: continuation.manualSteps,
    evidenceTemplate: continuation.evidenceTemplate,
    verificationCommands: continuation.verificationCommands,
    paths: continuation.paths,
    policy: continuation.policy
  };
  const prompt = [
    "请基于这份远端发布继续包继续当前交付/调试工作。",
    "",
    `发布包：${continuation.packageId || ""}`,
    `状态：${continuation.status || ""}`,
    continuation.paths?.continuation ? `继续包：@${continuation.paths.continuation}` : "",
    continuation.paths?.evidenceTemplate ? `回填模板：@${continuation.paths.evidenceTemplate}` : "",
    "",
    "目标：",
    "- 如果外部远端动作尚未执行，请明确授权、执行人、执行顺序和回滚方式。",
    "- 如果外部远端动作已经人工执行，请把 remoteUrl / PR/MR 编号 / CI 链接 / 评论链接 / 输出摘要回填到模板。",
    "- 回填后继续运行本地验证命令，并根据结果更新 PR readiness、合并门禁或交付草稿。",
    "",
    "远端发布继续包证据：",
    compactGateEvidence(evidence)
  ].filter(Boolean).join("\n");
  const current = input.value.trim();
  input.value = [current, prompt].filter(Boolean).join("\n\n---\n\n");
  input.focus();
  scheduleReferencePreview({ immediate: true });
  appendToolCall({
    title: `发布回填提示已加入提示词：${continuation.packageId || "remote publish"}`,
    label: "release",
    state: "ready",
    body: prompt.slice(0, 12000)
  });
  showToast("发布回填提示已加入提示词。");
  return prompt;
}

function appendGateEvidenceCard(evidence = {}, {
  title = "门禁证据",
  kind = "gate",
  state: status = "完成",
  body = "",
  includeCommands = true
} = {}) {
  appendToolCall({
    title,
    label: kind,
    state: status,
    body: body || compactGateEvidence(evidence)
  });
  const article = log.lastElementChild;
  if (!article) return;
  const actions = document.createElement("div");
  actions.className = "debug-last-failed-actions";
  const packageId = evidence.packageId || evidence.package?.id || evidence.latest?.id || evidence.latest?.plan?.package?.id || evidence.preflight?.package?.id || "";
  const releaseActions = kind === "release"
    ? `<button type="button" data-action="release-continuation" ${packageId || evidence.summary?.total ? "" : "disabled"}>继续包</button><button type="button" data-action="release-prompt" ${packageId || evidence.paths?.evidenceTemplate ? "" : "disabled"}>发布回填提示</button><button type="button" data-action="release-evidence" ${packageId || evidence.paths?.evidenceTemplate ? "" : "disabled"}>回填证据</button>`
    : "";
  actions.innerHTML = `<button type="button" data-action="prompt">加入提示词</button><button type="button" data-action="reference" ${gateEvidenceArtifactFiles(evidence).length ? "" : "disabled"}>引用文件</button><button type="button" data-action="stage" ${includeCommands && gateEvidenceCommands(evidence).length ? "" : "disabled"}>加入命令</button><button type="button" data-action="stage-verification">排队验证</button><button type="button" data-action="blocker-prompt">阻塞提示</button><button type="button" data-action="verification-prompt">验证提示</button><button type="button" data-action="verification-fix">验证修复</button>${releaseActions}<button type="button" data-action="repair">直接修复</button>`;
  actions.querySelector("[data-action='prompt']").addEventListener("click", () => {
    appendGateEvidenceToPrompt(evidence, { title, kind });
  });
  actions.querySelector("[data-action='reference']").addEventListener("click", () => {
    referenceGateEvidenceFilesInPrompt(evidence, { title });
  });
  actions.querySelector("[data-action='stage']").addEventListener("click", () => {
    stageGateEvidenceCommands(evidence, { title });
  });
  actions.querySelector("[data-action='stage-verification']").addEventListener("click", () => {
    stageGateEvidenceVerificationCommands(evidence, { title });
  });
  actions.querySelector("[data-action='blocker-prompt']").addEventListener("click", () => {
    appendGateBlockerPromptToPrompt(evidence, { title, kind });
  });
  actions.querySelector("[data-action='verification-prompt']").addEventListener("click", () => {
    appendGateVerificationPromptToPrompt(evidence, { title, kind });
  });
  actions.querySelector("[data-action='verification-fix']").addEventListener("click", () => {
    runGateVerificationFix(evidence, { title, kind });
  });
  actions.querySelector("[data-action='release-continuation']")?.addEventListener("click", async () => {
    try {
      await appendRemotePublishContinuationCard(packageId);
    } catch (error) {
      showToast(error.message);
      appendGateFailureEvidence(error, {
        title: "生成远端发布继续包失败",
        kind: "release",
        endpoint: "/api/remote-publish-continuation",
        request: { id: packageId || "", limit: 8 }
      });
    }
  });
  actions.querySelector("[data-action='release-prompt']")?.addEventListener("click", async () => {
    try {
      const continuation = evidence.evidenceTemplate ? evidence : await appendRemotePublishContinuationCard(packageId);
      appendRemotePublishContinuationPrompt(continuation);
    } catch (error) {
      showToast(error.message);
      appendGateFailureEvidence(error, {
        title: "生成远端发布回填提示失败",
        kind: "release",
        endpoint: "/api/remote-publish-continuation",
        request: { id: packageId || "", limit: 8 }
      });
    }
  });
  actions.querySelector("[data-action='release-evidence']")?.addEventListener("click", async () => {
    try {
      await appendRemotePublishEvidenceCard(packageId, evidence.evidenceTemplate || null);
    } catch (error) {
      showToast(error.message);
      appendGateFailureEvidence(error, {
        title: "远端发布证据回填失败",
        kind: "release",
        endpoint: "/api/remote-publish-evidence",
        request: { id: packageId || "", hasEvidenceTemplate: Boolean(evidence.evidenceTemplate) }
      });
    }
  });
  actions.querySelector("[data-action='repair']").addEventListener("click", () => {
    runGateEvidenceRepair(evidence, { title, kind });
  });
  article.appendChild(actions);
}

function buildGateFailureEvidence(error, {
  title = "门禁请求失败",
  kind = "gate",
  endpoint = "",
  request = null,
  extra = {}
} = {}) {
  return {
    status: "failed",
    generatedAt: new Date().toISOString(),
    title,
    kind,
    endpoint,
    request,
    error: normalizeActionFailureError(error),
    workspace: workspaceStatus?.textContent || "",
    lastPrompt: state.lastPrompt || input.value.trim(),
    pendingCommands: (state.pendingCommands || []).map((item) => item.command || item).slice(0, 12),
    pendingDiff: state.pendingDiff?.patches?.length ? {
      patches: state.pendingDiff.patches.length,
      commands: (state.pendingCommands || []).map((item) => item.command || item).slice(0, 8)
    } : null,
    ...extra
  };
}

function appendGateFailureEvidence(error, options = {}) {
  const evidence = buildGateFailureEvidence(error, options);
  appendGateEvidenceCard(evidence, {
    title: options.title || "门禁请求失败",
    kind: options.kind || "gate",
    state: "失败",
    body: buildGateEvidenceContext(evidence, {
      title: options.title || "门禁请求失败",
      kind: options.kind || "gate"
    }).slice(0, 12000),
    includeCommands: false
  });
  stageGateEvidenceVerificationCommands(evidence, {
    title: options.title || "门禁请求失败",
    source: "gate-failure"
  });
  return evidence;
}

function renderBrowserEvidenceRow(result, {
  title,
  kind = "browser",
  label = "browser",
  state,
  heading,
  summary = []
} = {}) {
  if (!browserCheckResult) return;
  browserCheckResult.innerHTML = "";
  const row = document.createElement("div");
  row.className = `queue-row ${result.ok ? "done" : "failed"}`;
  const artifactFiles = browserEvidenceArtifactFiles(result);
  const sourceLocations = browserSourceLocations(result);
  row.innerHTML = `<strong></strong><small></small><span class="queue-row-actions"><button type="button" data-action="detail">详情</button><button type="button" data-action="follow-trace">Trace</button><button type="button" data-action="follow-screenshot">截图</button><button type="button" data-action="follow-visual">视觉</button><button type="button" data-action="prompt">加入提示词</button><button type="button" data-action="reference" ${artifactFiles.length ? "" : "disabled"}>引用文件</button><button type="button" data-action="source-prompt" ${sourceLocations.length ? "" : "disabled"}>源码提示</button><button type="button" data-action="source-fix" ${sourceLocations.length ? "" : "disabled"}>源码修复</button><button type="button" data-action="verification-prompt">验证提示</button><button type="button" data-action="verification-fix">验证修复</button><button type="button" data-action="repair">直接修复</button></span>`;
  row.querySelector("strong").textContent = heading || result.title || result.name || browserEvidenceUrl(result) || title || "浏览器证据";
  row.querySelector("small").textContent = summary.filter(Boolean).join(" · ");
  row.querySelector("[data-action='detail']").addEventListener("click", () => {
    appendToolCall({
      title: `${title}：${browserEvidenceUrl(result) || result.path || result.name || ""}`,
      label,
      state: state || (result.ok ? "完成" : "失败"),
      body: JSON.stringify(result, null, 2).slice(0, 12000)
    });
  });
  row.querySelector("[data-action='follow-trace']").addEventListener("click", () => {
    runBrowserEvidenceFollowup(result, "trace", { title, kind });
  });
  row.querySelector("[data-action='follow-screenshot']").addEventListener("click", () => {
    runBrowserEvidenceFollowup(result, "screenshot", { title, kind });
  });
  row.querySelector("[data-action='follow-visual']").addEventListener("click", () => {
    runBrowserEvidenceFollowup(result, "visual", { title, kind });
  });
  row.querySelector("[data-action='prompt']").addEventListener("click", () => {
    appendBrowserEvidenceToPrompt(result, { title, kind });
  });
  row.querySelector("[data-action='reference']").addEventListener("click", () => {
    referenceBrowserEvidenceFilesInPrompt(result, { title });
  });
  row.querySelector("[data-action='source-prompt']").addEventListener("click", () => {
    appendBrowserSourcePromptToPrompt(result, { title, kind });
  });
  row.querySelector("[data-action='source-fix']").addEventListener("click", () => {
    runBrowserSourceContextRepair(result, { title, kind });
  });
  row.querySelector("[data-action='verification-prompt']").addEventListener("click", () => {
    appendBrowserVerificationPromptToPrompt(result, { title, kind });
  });
  row.querySelector("[data-action='verification-fix']").addEventListener("click", () => {
    runBrowserVerificationFix(result, { title, kind });
  });
  row.querySelector("[data-action='repair']").addEventListener("click", () => {
    runBrowserEvidenceRepair(result, { title, kind });
  });
  browserCheckResult.appendChild(row);
}

function renderProcesses(processes = []) {
  if (!processList) return;
  processList.innerHTML = "";
  if (!processes.length) {
    processList.innerHTML = `<div class="empty-state">暂无受管进程。</div>`;
    return;
  }
  processes.slice(0, 6).forEach((item) => {
    const row = document.createElement("div");
    row.className = `queue-row ${item.status === "running" ? "active" : "done"}`;
    const probeUrl = processProbeUrl(item);
    row.innerHTML = `<strong></strong><small></small><span class="queue-row-actions"><button type="button" data-action="primary"></button><button type="button" data-action="browser-debug" ${probeUrl ? "" : "disabled"}>调试</button><button type="button" data-action="browser-check" ${probeUrl ? "" : "disabled"}>查页面</button><button type="button" data-action="browser-trace" ${probeUrl ? "" : "disabled"}>Trace</button><button type="button" data-action="prompt">加入提示词</button><button type="button" data-action="repair">直接修复</button></span>`;
    row.querySelector("strong").textContent = item.command || item.id;
    row.querySelector("small").textContent = [
      item.status || "unknown",
      `pid ${item.pid || "-"}`,
      `policy: ${item.policy?.risk || "-"}`,
      item.probe ? `probe: ${item.probe.status} ${item.probe.url}` : ""
    ].filter(Boolean).join(" · ");
    const button = row.querySelector("[data-action='primary']");
    button.textContent = item.status === "running" ? "停止" : "输出";
    const runPrimaryProcessAction = async () => {
      try {
        if (item.status === "running") {
          const stopped = await api(`/api/processes?id=${encodeURIComponent(item.id)}`, { method: "DELETE" });
          appendToolCall({
            title: `已停止进程：${item.command}`,
            label: "proc",
            state: stopped.status,
            body: stopped.outputTail || "(无输出)"
          });
          await refreshHealth();
        } else {
          appendToolCall({
            title: `进程输出：${item.command}`,
            label: "proc",
            state: item.status || "unknown",
            body: [
              item.probe ? `probe: ${item.probe.status} · ${item.probe.url}${item.probe.statusCode ? ` · HTTP ${item.probe.statusCode}` : ""}` : "",
              "",
              item.outputTail || "(无输出)"
            ].filter((line) => line !== "").join("\n")
          });
        }
      } catch (error) {
        showToast(error.message);
        appendProcessFailureEvidence(error, {
          title: `${item.status === "running" ? "停止进程失败" : "读取进程输出失败"}：${item.command || item.id || "process"}`,
          action: item.status === "running" ? "process-stop" : "process-output",
          endpoint: "/api/processes",
          request: { id: item.id || "", method: item.status === "running" ? "DELETE" : "local-output" },
          item,
          retry: runPrimaryProcessAction,
          safe: () => appendProcessEvidenceToPrompt(item, { title: "受管进程" })
        });
      }
    };
    button.addEventListener("click", runPrimaryProcessAction);
    row.querySelector("[data-action='browser-debug']").addEventListener("click", () => {
      runProcessBrowserEvidence(item, { mode: "debug", title: "受管进程" });
    });
    row.querySelector("[data-action='browser-check']").addEventListener("click", () => {
      runProcessBrowserEvidence(item, { mode: "check", title: "受管进程" });
    });
    row.querySelector("[data-action='browser-trace']").addEventListener("click", () => {
      runProcessBrowserEvidence(item, { mode: "trace", title: "受管进程" });
    });
    row.querySelector("[data-action='prompt']").addEventListener("click", () => {
      appendProcessEvidenceToPrompt(item, { title: "受管进程" });
    });
    row.querySelector("[data-action='repair']").addEventListener("click", () => {
      runProcessEvidenceRepair(item, { title: "受管进程" });
    });
    processList.appendChild(row);
  });
}

function renderProcessSearch(result) {
  if (!processList) return;
  processList.innerHTML = "";
  const matches = result?.matches || [];
  if (!matches.length) {
    processList.innerHTML = `<div class="empty-state">未找到匹配的进程输出。</div>`;
    return;
  }
  matches.slice(0, 8).forEach((match) => {
    const row = document.createElement("div");
    row.className = "queue-row done";
    row.innerHTML = `<strong></strong><small></small><span class="queue-row-actions"><button type="button" data-action="detail">详情</button><button type="button" data-action="prompt">加入提示词</button><button type="button" data-action="repair">直接修复</button></span>`;
    row.querySelector("strong").textContent = match.command || match.processId;
    row.querySelector("small").textContent = `${match.status || "unknown"} · index ${match.index}`;
    row.querySelector("[data-action='detail']").addEventListener("click", () => {
      appendToolCall({
        title: `进程日志搜索：${result.query}`,
        label: "proc",
        state: `${result.matchCount || 0} matches`,
        body: JSON.stringify(match, null, 2)
      });
    });
    row.querySelector("[data-action='prompt']").addEventListener("click", () => {
      appendProcessEvidenceToPrompt({
        ...match,
        id: match.processId,
        outputTail: match.context || match.text || ""
      }, { title: `进程日志搜索：${result.query}` });
    });
    row.querySelector("[data-action='repair']").addEventListener("click", () => {
      runProcessEvidenceRepair({
        ...match,
        id: match.processId,
        outputTail: match.context || match.text || ""
      }, { title: `进程日志搜索：${result.query}` });
    });
    processList.appendChild(row);
  });
}

function renderProcessHistory(result) {
  if (!processList) return;
  processList.innerHTML = "";
  const history = result?.history || [];
  if (!history.length) {
    processList.innerHTML = `<div class="empty-state">暂无进程历史 artifact。</div>`;
    return;
  }
  history.slice(0, 8).forEach((item) => {
    const row = document.createElement("div");
    row.className = `queue-row ${item.active ? "active" : "done"}`;
    const probeUrl = processProbeUrl(item);
    row.innerHTML = `<strong></strong><small></small><span class="queue-row-actions"><button type="button" data-action="replay">回放</button><button type="button" data-action="browser-check" ${probeUrl ? "" : "disabled"}>查页面</button><button type="button" data-action="browser-trace" ${probeUrl ? "" : "disabled"}>Trace</button><button type="button" data-action="prompt">加入提示词</button><button type="button" data-action="repair">直接修复</button></span>`;
    row.querySelector("strong").textContent = item.command || item.id;
    row.querySelector("small").textContent = [
      item.status || "unknown",
      item.exitCode === null || item.exitCode === undefined ? "" : `exit ${item.exitCode}`,
      item.updatedAt || item.stoppedAt || item.startedAt || "",
      item.logPath || ""
    ].filter(Boolean).join(" · ");
    row.querySelector("[data-action='replay']").addEventListener("click", () => {
      appendToolCall({
        title: `进程历史：${item.command || item.id}`,
        label: "hist",
        state: item.status || "unknown",
        body: [
          `id: ${item.id}`,
          `log: ${item.logPath || "(none)"}`,
          `artifact: ${item.artifactPath || "(none)"}`,
          item.probe ? `probe: ${item.probe.status} · ${item.probe.url || ""}` : "",
          "",
          item.outputTail || "(无输出)"
        ].filter((line) => line !== "").join("\n")
      });
    });
    row.querySelector("[data-action='browser-check']").addEventListener("click", () => {
      runProcessBrowserEvidence(item, { mode: "check", title: "进程历史" });
    });
    row.querySelector("[data-action='browser-trace']").addEventListener("click", () => {
      runProcessBrowserEvidence(item, { mode: "trace", title: "进程历史" });
    });
    row.querySelector("[data-action='prompt']").addEventListener("click", () => {
      appendProcessEvidenceToPrompt(item, { title: "进程历史" });
    });
    row.querySelector("[data-action='repair']").addEventListener("click", () => {
      runProcessEvidenceRepair(item, { title: "进程历史" });
    });
    processList.appendChild(row);
  });
}

function renderBrowserCheck(result) {
  if (!browserCheckResult) return;
  if (!result) {
    browserCheckResult.innerHTML = `<div class="empty-state">本地页面检查结果会显示在这里。</div>`;
    return;
  }
  renderBrowserEvidenceRow(result, {
    title: "页面检查",
    kind: "browser-check",
    label: "browser",
    state: result.ok ? "通过" : "失败",
    heading: result.title || result.finalUrl || result.url || "页面检查",
    summary: [
      `HTTP ${result.status || "-"}`,
      `${result.elapsedMs || 0}ms`,
      `${result.counts?.buttons || 0} buttons`,
      `${result.counts?.forms || 0} forms`
    ]
  });
}

function renderBrowserBaseline(result) {
  if (!browserCheckResult) return;
  renderBrowserEvidenceRow(result, {
    title: "页面基线",
    kind: "browser-baseline",
    label: "visual",
    state: result.status || "unknown",
    heading: result.name || result.url || "页面基线",
    summary: [
      result.status || "unknown",
      `${result.diffs?.length || 0} diffs`,
      result.updated ? "baseline saved" : "baseline checked"
    ]
  });
}

function renderBrowserScreenshot(result) {
  if (!browserCheckResult) return;
  renderBrowserEvidenceRow(result, {
    title: "页面截图",
    kind: "browser-screenshot",
    label: "visual",
    state: result.ok ? "完成" : "失败",
    heading: result.path || result.url || "页面截图",
    summary: [
      `${result.width || "-"}x${result.height || "-"}`,
      `${Math.round((result.size || 0) / 1024)} KB`,
      result.policy?.screenshots ? "screenshot saved" : "no screenshot"
    ]
  });
}

function renderBrowserAudit(result) {
  if (!browserCheckResult) return;
  const issueCount = Array.isArray(result.audit?.issues) ? result.audit.issues.length : 0;
  renderBrowserEvidenceRow(result, {
    title: "页面可访问性审计",
    kind: "browser-audit",
    label: "a11y",
    state: result.audit?.status || "unknown",
    heading: result.title || result.finalUrl || result.url || "页面可访问性审计",
    summary: [
      result.audit?.status || "unknown",
      `${issueCount} issues`,
      result.audit?.title ? "title" : "no title",
      result.audit?.lang ? `lang ${result.audit.lang}` : "no lang"
    ]
  });
}

function renderBrowserDom(result) {
  if (!browserCheckResult) return;
  renderBrowserEvidenceRow(result, {
    title: "DOM 快照",
    kind: "browser-dom",
    label: "dom",
    state: result.ok ? "完成" : "失败",
    heading: result.title || result.url || "DOM 快照",
    summary: [
      `${Math.round((result.bytes || 0) / 1024)} KB DOM`,
      `${result.selectors?.length || 0} selectors`,
      `${result.counts?.buttons || 0} buttons`
    ]
  });
}

function renderBrowserTrace(result) {
  if (!browserCheckResult) return;
  renderBrowserEvidenceRow(result, {
    title: "浏览器 Trace",
    kind: "browser-trace",
    label: "trace",
    state: result.ok ? "完成" : "异常",
    heading: result.title || result.finalUrl || result.url || "浏览器 Trace",
    summary: [
      `${result.summary?.console || 0} console`,
      `${result.summary?.exceptions || 0} exceptions`,
      `${result.summary?.network || 0} requests`,
      result.artifactPath || "no artifact"
    ]
  });
}

function renderBrowserInteract(result) {
  if (!browserCheckResult) return;
  renderBrowserEvidenceRow(result, {
    title: "DOM 交互",
    kind: "browser-interact",
    label: "dom",
    state: result.ok ? "完成" : "失败",
    heading: result.title || result.finalUrl || result.url || "DOM 交互",
    summary: [
      `${result.actions?.length || 0} actions`,
      `${Math.round((result.bytes || 0) / 1024)} KB DOM`,
      `${result.selectors?.length || 0} selectors`
    ]
  });
}

function renderBrowserSession(result) {
  if (!browserCheckResult) return;
  renderBrowserEvidenceRow(result, {
    title: "浏览器会话",
    kind: "browser-session",
    label: "dom",
    state: result.ok ? "完成" : "失败",
    heading: result.name || result.finalUrl || result.url || "浏览器会话",
    summary: [
      `${result.stepCount || 0} steps`,
      `${result.actionCount || 0} actions`,
      result.artifactPath || "no artifact"
    ]
  });
}

function renderBrowserVisual(result) {
  if (!browserCheckResult) return;
  renderBrowserEvidenceRow(result, {
    title: "视觉断言",
    kind: "browser-visual",
    label: "visual",
    state: result.ok ? "通过" : "失败",
    heading: result.name || result.url || "视觉断言",
    summary: [
      result.status || "unknown",
      `${result.comparison?.mismatchedPixels || 0} px diff`,
      `${((result.comparison?.mismatchRatio || 0) * 100).toFixed(3)}%`,
      result.updated ? "baseline saved" : "baseline checked"
    ]
  });
}

function renderDebugDiagnostics(result, { persist = true } = {}) {
  if (!debugDiagnosticsPanel) return;
  if (!result) {
    state.lastDebugDiagnostics = null;
    debugDiagnosticsPanel.innerHTML = `<div class="debug-diagnostics-head"><strong>调试诊断</strong><label><input id="debugRunChecks" type="checkbox" />运行安全检查</label></div><div class="debug-last-failed-command" hidden></div><div class="empty-state">点击“一键诊断”后，这里会聚合检查命令、进程健康、页面 Trace 和代码诊断。</div>`;
    renderLastFailedCommandCard();
    if (persist) saveCommandDebugState();
    return;
  }
  state.lastDebugDiagnostics = result;
  if (persist) saveCommandDebugState();
  const statusLabel = result.status === "failing" ? "失败" : result.status === "needs_attention" ? "需关注" : "就绪";
  const findings = result.findings || [];
  const actions = result.nextActions || [];
  const hasRunnableAction = actions.some((action) => String(action.command || "").trim());
  const hasLastFailedCommand = Boolean(state.lastFailedCommand?.command);
  const hasBrowserSourceLocations = Boolean(browserSourceLocations(result).length);
  debugDiagnosticsPanel.innerHTML = `
    <div class="debug-diagnostics-head">
      <strong>调试诊断 · ${statusLabel}</strong>
      <div class="debug-diagnostics-controls">
        <label>
          <input id="debugRunChecks" type="checkbox" ${result.summary?.checksRun ? "checked" : ""} />
          运行安全检查
        </label>
        <button type="button" data-debug-action="copy-bundle">复制诊断包</button>
        <button type="button" data-debug-action="prompt-bundle">加入提示词</button>
        <button type="button" data-debug-action="reference-files">引用文件</button>
        <button type="button" data-debug-action="stage-actions" ${hasRunnableAction ? "" : "disabled"}>排队建议</button>
        <button type="button" data-debug-action="run-recommended" ${hasRunnableAction ? "" : "disabled"}>运行推荐动作</button>
        <button type="button" data-debug-action="browser-source-prompt" ${hasBrowserSourceLocations ? "" : "disabled"}>源码提示</button>
        <button type="button" data-debug-action="browser-source-fix" ${hasBrowserSourceLocations ? "" : "disabled"}>源码修复</button>
        <button type="button" data-debug-action="fix-last-failed" ${hasLastFailedCommand ? "" : "disabled"}>修复失败命令</button>
        <button type="button" data-debug-action="run-plan" ${result.verificationPlan?.commands?.length ? "" : "disabled"}>运行验证计划</button>
        <button type="button" data-debug-action="draft-fix">生成修复提示</button>
        <button type="button" data-debug-action="run-fix">直接修复</button>
      </div>
    </div>
    <div class="debug-summary">
      <span>${result.summary?.errors || 0} errors</span>
      <span>${result.summary?.warnings || 0} warnings</span>
      <span>${result.summary?.safeCommands || 0} checks</span>
      <span>${result.summary?.processRows || 0} processes</span>
      <span>${result.summary?.traceCaptured ? "trace" : "no trace"}</span>
      <span>${result.browserTriage?.status ? `triage: ${result.browserTriage.status}` : "no triage"}</span>
      <span>${result.browserSourceLocations?.length ? `source: ${result.browserSourceLocations.length}` : "no source"}</span>
    </div>
    <div class="debug-last-failed-command" hidden></div>
    <div class="debug-finding-list"></div>
    <div class="debug-evidence-list"></div>
    <div class="debug-action-list"></div>
  `;
  renderLastFailedCommandCard(result);

  debugDiagnosticsPanel.querySelector("[data-debug-action='copy-bundle']")?.addEventListener("click", async () => {
    const bundle = buildDebugBundle(result);
    const copied = await copyText(bundle);
    appendDebugEvidence(
      copied ? "诊断包已复制" : "诊断包复制失败",
      copied ? "完成" : "失败",
      copied ? "完整诊断 JSON 已复制到剪贴板，可直接粘给修复代理或 issue。" : `${copyFailureSummary()}\n\n${bundle}`
    );
    showToast(copied ? "诊断包已复制。" : copyFailureSummary());
  });

  debugDiagnosticsPanel.querySelector("[data-debug-action='prompt-bundle']")?.addEventListener("click", () => {
    appendDebugContextToPrompt(result);
  });

  debugDiagnosticsPanel.querySelector("[data-debug-action='reference-files']")?.addEventListener("click", () => {
    referenceDebugEvidenceFilesInPrompt(result);
  });

  debugDiagnosticsPanel.querySelector("[data-debug-action='stage-actions']")?.addEventListener("click", () => {
    stageDebugActionCommands(actions);
  });

  debugDiagnosticsPanel.querySelector("[data-debug-action='run-recommended']")?.addEventListener("click", async () => {
    await runRecommendedDebugAction(result);
  });

  debugDiagnosticsPanel.querySelector("[data-debug-action='browser-source-prompt']")?.addEventListener("click", () => {
    appendBrowserSourcePromptToPrompt(result, { title: "调试诊断浏览器源码定位", kind: "debug-browser-source" });
  });

  debugDiagnosticsPanel.querySelector("[data-debug-action='browser-source-fix']")?.addEventListener("click", () => {
    runBrowserSourceContextRepair(result, { title: "调试诊断浏览器源码定位", kind: "debug-browser-source" });
  });

  debugDiagnosticsPanel.querySelector("[data-debug-action='fix-last-failed']")?.addEventListener("click", () => {
    runLastFailedCommandVerificationFix();
  });

  debugDiagnosticsPanel.querySelector("[data-debug-action='run-plan']")?.addEventListener("click", async () => {
    if (state.busy) {
      showToast("代理正在运行，请稍后再执行验证计划。");
      return;
    }
    setBusy(true, "运行验证计划");
    try {
      const ok = await runVerificationPlanCommands(result.verificationPlan);
      setBusy(false, ok ? "验证通过" : "验证失败");
      showToast(ok ? "验证计划命令全部通过。" : "验证计划已停在失败命令。");
    } catch (error) {
      appendDebugEvidence("验证计划运行失败", "失败", error.message);
      showToast(error.message);
      appendGateFailureEvidence(error, {
        title: "调试验证计划运行失败证据",
        kind: "debug",
        endpoint: "/api/command",
        request: {
          source: "debug-diagnostics-run-plan",
          commands: verificationPlanCommands(result.verificationPlan).map((item) => item.command || item).slice(0, 12)
        },
        extra: {
          diagnosticsStatus: result.status || result.diagnostics?.status || "",
          summary: result.summary || result.diagnostics?.summary || null
        }
      });
      setBusy(false, "验证失败");
    }
  });

  debugDiagnosticsPanel.querySelector("[data-debug-action='draft-fix']")?.addEventListener("click", () => {
    const prompt = buildDebugFixPrompt(result);
    if (!prompt) {
      showToast("暂无可生成的诊断提示。");
      return;
    }
    input.value = prompt;
    input.focus();
    scheduleReferencePreview({ immediate: true });
    appendDebugEvidence("已生成带诊断的修复提示", "ready", prompt);
    showToast("修复提示已填入输入框。");
  });

  debugDiagnosticsPanel.querySelector("[data-debug-action='run-fix']")?.addEventListener("click", () => {
    if (state.busy) {
      showToast("代理正在运行，请稍后再发起修复。");
      return;
    }
    const prompt = buildDebugFixPrompt(result);
    if (!prompt) {
      showToast("暂无可运行的诊断修复提示。");
      return;
    }
    input.value = prompt;
    scheduleReferencePreview({ immediate: true });
    appendDebugEvidence("已生成并启动诊断修复", "running", prompt);
    showToast("正在启动带诊断上下文的修复代理。");
    submitPromptForm();
  });

  const findingList = debugDiagnosticsPanel.querySelector(".debug-finding-list");
  if (!findings.length) {
    findingList.innerHTML = `<div class="debug-finding info"><strong>未发现明显阻塞项</strong><small>当前聚合证据没有暴露失败信号。</small></div>`;
  } else {
    findings.slice(0, 8).forEach((finding) => {
      const row = document.createElement("div");
      row.className = `debug-finding ${finding.severity || "info"}`;
      row.innerHTML = `<strong></strong><small></small>`;
      row.querySelector("strong").textContent = `${finding.area || "debug"} · ${finding.message || ""}`;
      row.querySelector("small").textContent = (finding.evidence || []).join(" · ").slice(0, 360) || "无额外证据";
      findingList.appendChild(row);
    });
  }

  const evidenceList = debugDiagnosticsPanel.querySelector(".debug-evidence-list");
  const evidenceButtons = [
    {
      label: "检查计划",
      state: `${result.verificationPlan?.commands?.length || 0} checks`,
      enabled: Boolean(result.verificationPlan),
      value: result.verificationPlan
    },
    {
      label: "进程健康",
      state: `${result.processHealth?.summary?.total || 0} processes`,
      enabled: Boolean(result.processHealth),
      value: result.processHealth
    },
    {
      label: "页面 Trace",
      state: result.browserTrace?.artifactPath || (result.browserTrace ? "captured" : "none"),
      enabled: Boolean(result.browserTrace),
      value: result.browserTrace
    },
    {
      label: "异常分诊",
      state: result.browserTriage?.status || "none",
      enabled: Boolean(result.browserTriage),
      value: result.browserTriage
    },
    {
      label: "源码定位",
      state: `${result.browserSourceLocations?.length || 0} locations`,
      enabled: Boolean(result.browserSourceLocations?.length),
      value: result.browserSourceLocations || []
    },
    {
      label: "语义诊断",
      state: `${result.summary?.semanticIssues || 0} issues`,
      enabled: Boolean(result.semanticDiagnostics),
      value: result.semanticDiagnostics
    }
  ];
  evidenceButtons.forEach((item) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = item.label;
    button.disabled = !item.enabled;
    button.title = item.enabled ? item.state : "暂无证据";
    button.addEventListener("click", () => {
      appendDebugEvidence(`调试证据：${item.label}`, item.state, item.value || {});
    });
    evidenceList.appendChild(button);
  });

  const actionList = debugDiagnosticsPanel.querySelector(".debug-action-list");
  actions.forEach((action) => {
    const command = String(action.command || "").trim();
    const kind = String(action.kind || (command ? "command" : "inspect"));
    const evidenceText = (action.evidence || []).slice(0, 4).join(" · ");
    const metaText = [
      action.priority ? `P${action.priority}` : "",
      kind,
      action.target ? `target: ${action.target}` : "",
      evidenceText ? `evidence: ${evidenceText}` : ""
    ].filter(Boolean).join(" · ");
    const row = document.createElement("div");
    row.className = `debug-action-row ${command ? "runnable" : ""} debug-action-${kind}`;
    row.innerHTML = `
      <div>
        <strong></strong>
        <small></small>
        <span class="debug-action-meta"></span>
      </div>
      <button type="button" data-action="detail">详情</button>
      <button type="button" data-action="stage" ${command ? "" : "hidden"}>放入面板</button>
      <button type="button" data-action="copy" ${command ? "" : "hidden"}>复制</button>
      <button type="button" data-action="run" ${command ? "" : "hidden"}>运行</button>
    `;
    row.querySelector("strong").textContent = action.label || action.id || "建议动作";
    row.querySelector("small").textContent = action.description || (command ? command : "查看建议详情");
    row.querySelector(".debug-action-meta").textContent = metaText || "无额外证据";
    row.querySelector("[data-action='detail']").addEventListener("click", () => {
      appendToolCall({
        title: `调试建议：${action.label || action.id}`,
        label: "debug",
        state: command ? "可运行" : "建议",
        body: [
          action.priority ? `priority: ${action.priority}` : "",
          kind ? `kind: ${kind}` : "",
          action.target ? `target: ${action.target}` : "",
          action.description || "",
          action.evidence?.length ? `evidence:\n${action.evidence.map((item) => `- ${item}`).join("\n")}` : "",
          command ? `command: ${command}` : ""
        ].filter(Boolean).join("\n")
      });
    });
    row.querySelector("[data-action='stage']")?.addEventListener("click", () => {
      stageDebugActionCommand(action);
    });
    row.querySelector("[data-action='copy']")?.addEventListener("click", async () => {
      const copied = await copyText(command);
      appendToolCall({
        title: copied ? `已复制下一步验证命令：${action.label || action.id}` : `复制下一步验证命令失败：${action.label || action.id}`,
        label: "$",
        state: copied ? "完成" : "失败",
        body: copyLogBody(copied, command)
      });
      showToast(copied ? "下一步命令已复制。" : copyFailureSummary());
    });
    row.querySelector("[data-action='run']")?.addEventListener("click", async () => {
      if (state.busy) {
        showToast("代理正在运行，请稍后再运行命令。");
        return;
      }
      stageDebugActionCommand(action);
      setBusy(true, "运行下一步验证");
      const ok = await runSuggestedCommand(command, { single: true });
      setBusy(false, ok ? "验证通过" : "验证失败");
    });
    actionList.appendChild(row);
  });
}

function renderApprovals(approvals = []) {
  if (!approvalList) return;
  approvalList.innerHTML = "";
  if (!approvals.length) {
    approvalList.innerHTML = `<div class="empty-state">暂无审批请求。</div>`;
    return;
  }
  approvals.slice(0, 6).forEach((approval) => {
    const row = document.createElement("div");
    row.className = `queue-row approval-row ${approval.status === "approved" ? "complete" : "failed"}`;
    row.innerHTML = `<div><strong></strong><small></small></div><span class="approval-row-actions"><button type="button" data-action="view">查看</button><button type="button" data-action="prompt">加入提示词</button><button type="button" data-action="commands">验证命令</button><button type="button" data-action="blocker">阻塞提示</button><button type="button" data-action="fix">直接修复</button><button type="button" data-action="run-safe">直接替代</button><button type="button" data-action="escalate">升级证据</button><button type="button" data-action="approve">批准</button><button type="button" data-action="reject">拒绝</button><button type="button" data-action="execute">执行</button></span>`;
    row.querySelector("strong").textContent = approval.command || approval.type || approval.id;
    row.querySelector("small").textContent = `${approval.type || "command"} · ${approval.status || "blocked"} · ${approval.risk || "blocked"} · ${approval.reason || ""}`;
    const getDetail = async () => await api(`/api/approval?id=${encodeURIComponent(approval.id)}`);
    row.querySelector("[data-action='view']").addEventListener("click", async () => {
      try {
        const detail = await getDetail();
        appendToolCall({
          title: `审批请求：${approval.id}`,
          label: "policy",
          state: detail.status || "blocked",
          body: JSON.stringify(detail, null, 2).slice(0, 12000)
        });
      } catch (error) {
        showToast(error.message);
        appendActionFailureEvidence({
          kind: "approval",
          action: "approval-view",
          targetName: approval.id,
          endpoint: "/api/approval",
          request: { id: approval.id },
          approval,
          error
        }, {
          title: `审批查看失败：${approval.id}`,
          label: "policy",
          retry: async () => {
            const detail = await getDetail();
            appendToolCall({
              title: `审批请求：${approval.id}`,
              label: "policy",
              state: detail.status || "blocked",
              body: JSON.stringify(detail, null, 2).slice(0, 12000)
            });
          },
          safe: () => runApprovalSafeAlternative(approval)
        });
      }
    });
    row.querySelector("[data-action='prompt']").addEventListener("click", async () => {
      try {
        appendApprovalContextToPrompt(await getDetail());
      } catch (error) {
        showToast(error.message);
        appendActionFailureEvidence({
          kind: "approval",
          action: "approval-prompt",
          targetName: approval.id,
          endpoint: "/api/approval",
          request: { id: approval.id },
          approval,
          error
        }, {
          title: `审批上下文加入失败：${approval.id}`,
          label: "policy",
          retry: async () => appendApprovalContextToPrompt(await getDetail()),
          safe: () => runApprovalSafeAlternative(approval)
        });
      }
    });
    row.querySelector("[data-action='commands']").addEventListener("click", async () => {
      try {
        stageApprovalVerificationCommands(await getDetail());
      } catch (error) {
        showToast(error.message);
        appendActionFailureEvidence({
          kind: "approval",
          action: "approval-verification-commands",
          targetName: approval.id,
          endpoint: "/api/approval",
          request: { id: approval.id },
          approval,
          error
        }, {
          title: `审批验证命令生成失败：${approval.id}`,
          label: "policy",
          retry: async () => stageApprovalVerificationCommands(await getDetail()),
          safe: () => runApprovalSafeAlternative(approval)
        });
      }
    });
    row.querySelector("[data-action='blocker']").addEventListener("click", async () => {
      try {
        appendApprovalBlockerPromptToPrompt(await getDetail());
      } catch (error) {
        showToast(error.message);
        appendActionFailureEvidence({
          kind: "approval",
          action: "approval-blocker-prompt",
          targetName: approval.id,
          endpoint: "/api/approval",
          request: { id: approval.id },
          approval,
          error
        }, {
          title: `审批阻塞提示生成失败：${approval.id}`,
          label: "policy",
          retry: async () => appendApprovalBlockerPromptToPrompt(await getDetail()),
          safe: () => runApprovalSafeAlternative(approval)
        });
      }
    });
    row.querySelector("[data-action='fix']").addEventListener("click", async () => {
      try {
        runApprovalBlockerFix(await getDetail());
      } catch (error) {
        showToast(error.message);
        appendActionFailureEvidence({
          kind: "approval",
          action: "approval-blocker-fix",
          targetName: approval.id,
          endpoint: "/api/approval",
          request: { id: approval.id },
          approval,
          error
        }, {
          title: `审批阻塞修复启动失败：${approval.id}`,
          label: "policy",
          retry: async () => runApprovalBlockerFix(await getDetail()),
          safe: () => runApprovalSafeAlternative(approval)
        });
      }
    });
    row.querySelector("[data-action='run-safe']").addEventListener("click", async () => {
      try {
        runApprovalSafeAlternative(await getDetail());
      } catch (error) {
        showToast(error.message);
        appendActionFailureEvidence({
          kind: "approval",
          action: "approval-safe-alternative",
          targetName: approval.id,
          endpoint: "/api/approval",
          request: { id: approval.id },
          approval,
          error
        }, {
          title: `审批安全替代失败：${approval.id}`,
          label: "policy",
          retry: async () => runApprovalSafeAlternative(await getDetail()),
          safe: () => runApprovalSafeAlternative(approval)
        });
      }
    });
    row.querySelector("[data-action='escalate']").addEventListener("click", async () => {
      try {
        await createApprovalEscalationEvidence(await getDetail());
      } catch (error) {
        showToast(error.message);
        appendActionFailureEvidence({
          kind: "approval",
          action: "approval-escalation",
          targetName: approval.id,
          endpoint: "/api/approval-escalation",
          request: { id: approval.id },
          approval,
          error
        }, {
          title: `审批升级证据生成失败：${approval.id}`,
          label: "policy",
          retry: async () => createApprovalEscalationEvidence(await getDetail()),
          safe: () => runApprovalSafeAlternative(approval)
        });
      }
    });
    row.querySelector("[data-action='approve']").addEventListener("click", async () => {
      const request = { id: approval.id, decision: "approved", note: "Approved from UI; execution remains disabled." };
      const approve = async () => {
        const decision = await api("/api/approval", {
          method: "PATCH",
          body: JSON.stringify(request)
        });
        appendToolCall({
          title: `审批已批准：${approval.id}`,
          label: "policy",
          state: decision.status || "approved",
          body: JSON.stringify(decision, null, 2).slice(0, 12000)
        });
        await refreshHealth();
      };
      try {
        await approve();
      } catch (error) {
        showToast(error.message);
        appendActionFailureEvidence({
          kind: "approval",
          action: "approval-approve",
          targetName: approval.id,
          endpoint: "/api/approval",
          request,
          approval,
          error
        }, {
          title: `审批批准失败：${approval.id}`,
          label: "policy",
          retry: approve,
          safe: () => runApprovalSafeAlternative(approval)
        });
      }
    });
    row.querySelector("[data-action='reject']").addEventListener("click", async () => {
      const request = { id: approval.id, decision: "rejected", note: "Rejected from UI." };
      const reject = async () => {
        const decision = await api("/api/approval", {
          method: "PATCH",
          body: JSON.stringify(request)
        });
        appendToolCall({
          title: `审批已拒绝：${approval.id}`,
          label: "policy",
          state: decision.status || "rejected",
          body: JSON.stringify(decision, null, 2).slice(0, 12000)
        });
        await refreshHealth();
      };
      try {
        await reject();
      } catch (error) {
        showToast(error.message);
        appendActionFailureEvidence({
          kind: "approval",
          action: "approval-reject",
          targetName: approval.id,
          endpoint: "/api/approval",
          request,
          approval,
          error
        }, {
          title: `审批拒绝失败：${approval.id}`,
          label: "policy",
          retry: reject,
          safe: () => runApprovalSafeAlternative(approval)
        });
      }
    });
    row.querySelector("[data-action='execute']").addEventListener("click", async () => {
      const request = { id: approval.id };
      const execute = async () => {
        const result = await api("/api/approval-execute", {
          method: "POST",
          body: JSON.stringify(request)
        });
        appendApprovalExecutionCard(result, approval);
        await refreshHealth();
      };
      try {
        await execute();
      } catch (error) {
        showToast(error.message);
        appendActionFailureEvidence({
          kind: "approval",
          action: "approval-execute",
          targetName: approval.id,
          endpoint: "/api/approval-execute",
          request,
          approval,
          error
        }, {
          title: `审批执行失败：${approval.id}`,
          label: "policy",
          retry: execute,
          safe: () => runApprovalSafeAlternative(approval)
        });
      }
    });
    approvalList.appendChild(row);
  });
}

async function refreshHealth() {
  const data = await api("/api/health");
  repoName.textContent = data.workspaceName;
  const modelLabel = data.modelRuntime?.candidates?.length > 1
    ? `${data.model} · fallback ${data.modelRuntime.candidates.length}`
    : data.model || "deepseek-v4-pro";
  branchName.textContent = data.hasApiKey ? `模型：${modelLabel}` : "DeepSeek：缺少 DEEPSEEK_API_KEY";
  workspaceStatus.textContent = data.workspace;
  workspaceInput.value = data.workspace;
  runState.lastChild.textContent = data.hasApiKey ? "待命" : "缺少密钥";
  renderCheckpoints(data.checkpoints || []);
  renderGit(data.git);
  renderThreads(data.threads || []);
  renderTasks(data.tasks || []);
  renderCapabilities(data.capabilities);
  renderToolCatalog(data.tools);
  renderExtensionCatalog(data.extensions);
  renderMcpCatalog(data.mcp);
  renderAssetCatalog(data.assets);
  state.lastRecoverySummary = data.recoverySummary || null;
  renderGoal(data.goal);
  restorePendingProposal(data.goal);
  renderReviewArtifacts(data.reviews || []);
  renderApprovals(data.approvals || []);
  renderQueue(data.queue || []);
  renderProcesses(data.processes || []);
  state.runtimeUrl = data.runtimeUrl || null;
  if (browserCheckUrlInput && data.runtimeUrl?.browserCheckUrl && !browserCheckUrlInput.value.trim()) {
    browserCheckUrlInput.value = data.runtimeUrl.browserCheckUrl;
  }
  state.contextSnapshot = data.contextSnapshot || null;
  state.contextRollup = data.contextRollup || null;
  restoreCommandDebugState();
}

async function refreshToolCatalog() {
  const data = await api("/api/tools");
  renderToolCatalog(data);
}

async function refreshExtensionCatalog() {
  const data = await api("/api/extensions");
  renderExtensionCatalog(data);
}

async function refreshMcpCatalog() {
  const data = await api("/api/mcp");
  renderMcpCatalog(data);
}

mcpProbeBtn?.addEventListener("click", async () => {
  setBusy(true);
  const runProbe = async () => {
    const data = await api("/api/mcp?probe=1");
    renderMcpCatalog(data);
    appendToolCall({
      title: "MCP 探测完成",
      label: "mcp",
      state: "完成",
      body: JSON.stringify(data.summary || {}, null, 2)
    });
  };
  try {
    await runProbe();
  } catch (error) {
    showToast(error.message);
    appendActionFailureEvidence({
      kind: "mcp",
      action: "mcp-probe",
      targetName: "MCP 服务 / 探测",
      endpoint: "/api/mcp?probe=1",
      request: { probe: true },
      item: { name: "MCP 服务 / 探测", status: "failed", source: ".forge/mcp + .mcp.json" },
      error
    }, {
      title: "MCP 探测失败",
      label: "mcp",
      retry: runProbe,
      safe: () => appendCatalogEvidenceToPrompt("mcp", {
        name: "MCP 服务 / 探测",
        status: "failed",
        source: ".forge/mcp + .mcp.json",
        probe: { status: "failed", error: error.message }
      })
    });
  } finally {
    setBusy(false);
  }
});

async function refreshAssetCatalog() {
  const data = await api("/api/assets");
  renderAssetCatalog(data);
}

async function refreshThreads() {
  const data = await api("/api/threads");
  renderThreads(data.threads || []);
}

async function refreshFiles() {
  const data = await api("/api/files");
  renderFiles(data.files);
  const used = Math.min(100, Math.round((data.contextBytes / data.contextLimitBytes) * 100));
  contextMeter.style.width = `${used}%`;
  const repoSummary = summarizeRepoMap(data.repoMap);
  const snapshotSummary = state.contextSnapshot?.generatedAt
    ? `；摘要 ${state.contextSnapshot.fileCount || 0} 文件 · ${new Date(state.contextSnapshot.generatedAt).toLocaleString()}`
    : "";
  const rollupSummary = state.contextRollup?.generatedAt
    ? `；滚动 ${state.contextRollup.summary?.entries || 0} 条`
    : "";
  contextText.textContent = `${data.files.length} 个文本文件，约 ${Math.round(data.contextBytes / 1024)} KB 上下文${repoSummary ? `；${repoSummary}` : ""}${snapshotSummary}${rollupSummary}`;
}

async function refreshAll() {
  try {
    await refreshHealth();
    await refreshToolCatalog();
    await refreshExtensionCatalog();
    await refreshMcpCatalog();
    await refreshAssetCatalog();
    await refreshThreads();
    await refreshFiles();
  } catch (error) {
    runState.lastChild.textContent = "后端离线";
    workspaceStatus.textContent = "请先运行 node server.js";
    showToast(error.message);
    appendActionFailureEvidence({
      kind: "refresh",
      action: "refresh-all",
      targetName: "workspace-bootstrap",
      endpoint: "/api/health + catalogs + files",
      request: {
        activeThreadId: state.activeThreadId || "",
        workspace: workspaceStatus?.textContent || ""
      },
      item: {
        lastPrompt: state.lastPrompt || "",
        pendingDiffBytes: String(state.pendingDiff || "").length,
        pendingCommandCount: (state.pendingCommands || []).length
      },
      error
    }, {
      title: "刷新工作台失败证据",
      label: "net",
      retry: refreshAll
    });
  }
}

async function startNewThread({ announce = true } = {}) {
  const result = await api("/api/thread", {
    method: "POST",
    body: JSON.stringify({
      title: "新会话",
      messages: announce ? [{ role: "agent", text: "新会话已创建。描述你想对当前工作区做的改动即可。" }] : []
    })
  });
  state.activeThreadId = result.thread?.id || "";
  renderMessages(result.thread?.messages || []);
  renderThreads(result.threads || []);
  renderPlan([]);
  renderDiff([]);
  renderCommands([]);
  renderReview([]);
  state.pendingPatches = [];
  state.pendingDiff = "";
  state.pendingCommands = [];
  state.lastPrompt = "";
  clearCommandDebugState();
  return result.thread;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const prompt = input.value.trim();
  if (!prompt) {
    showToast("请先描述一个具体的代码改动。");
    input.focus();
    return;
  }

  if (!state.activeThreadId) {
    const thread = await startNewThread({ announce: false });
    state.activeThreadId = thread?.id || "";
  }
  appendMessage("user", prompt);
  state.lastPrompt = prompt;
  input.value = "";
  resizePromptInput();
  setBusy(true);
  renderPlan(["列出工作区文件", "按需读取/搜索关键文件", "生成 unified diff、审查和检查命令"]);
  renderReview([]);
  appendToolCall({
    title: "读取工作区上下文",
    label: "ctx",
    state: "运行中",
    body: `${state.files.length} 个候选文件`
  });
  const debugContext = buildAgentDebugContext();
  if (debugContext) {
    appendToolCall({
      title: "已附加最近调试诊断",
      label: "debug",
      state: debugContext.status || "attached",
      body: JSON.stringify({
        generatedAt: debugContext.generatedAt,
        status: debugContext.status,
        summary: debugContext.summary,
        findings: debugContext.findings,
        nextActions: debugContext.nextActions
      }, null, 2).slice(0, 8000)
    });
  }

  try {
    const result = await runAgentRequest(prompt, debugContext);
    appendMessage("agent", result.reply);
    renderPlan(result.plan);
    state.pendingDiff = result.diff || "";
    renderDiff(result.patches);
    renderCommands(result.commands);
    renderReview(result.review || []);
    persistActiveThread();
    const toolLogText = (result.toolLog || [])
      .map((item) => `${item.name} ${JSON.stringify(item.args)}`)
      .join("\n");
    const promptReferenceText = (result.promptReferences?.references || [])
      .map((item) => `${item.path} (${item.size} bytes)`)
      .join("\n");
    const missingReferenceText = (result.promptReferences?.missing || [])
      .map((item) => `@${item.path} · ${item.reason || "未匹配"}`)
      .join("\n");
    appendToolCall({
      title: "模型工具循环完成",
      label: "ai",
      state: "完成",
      body: [
        `模型：${result.model}`,
        `fallback：${(result.modelRuntime?.lastFallbacks || []).length} 次`,
        `引用文件：${(result.promptReferences?.references || []).length} 个`,
        promptReferenceText ? `\n${promptReferenceText}` : "",
        `未命中引用：${(result.promptReferences?.missing || []).length} 个`,
        missingReferenceText ? `\n${missingReferenceText}` : "",
        `工具调用：${(result.toolLog || []).length} 次`,
        `流式事件：${(result.streamLog || []).length} 个`,
        `建议修改：${result.patches.length} 个文件`,
        `检查命令：${result.commands.length} 条`,
        `审查发现：${(result.review || []).length} 条`,
        toolLogText ? `\n${toolLogText}` : ""
      ].filter(Boolean).join("\n")
    });
    setBusy(false, "待审批");
  } catch (error) {
    appendMessage("agent", `请求失败：${error.message}`);
    appendAgentFailureEvidence(error, {
      prompt,
      debugContext,
      endpoint: error.endpoint || "/api/agent-stream",
      streamLog: error.streamLog || []
    });
    setBusy(false, "失败");
  }
});

input?.addEventListener("input", () => {
  scheduleReferencePreview();
});

workspaceForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const workspace = workspaceInput.value.trim();
  if (!workspace) {
    showToast("请输入工作目录路径。");
    return;
  }
  setBusy(true, "切换中");
  try {
    const result = await api("/api/workspace", {
      method: "POST",
      body: JSON.stringify({ workspace })
    });
    workspaceInput.value = result.workspace;
    appendToolCall({
      title: "已切换工作目录",
      label: "dir",
      state: "完成",
      body: result.workspace
    });
    state.pendingPatches = [];
    state.pendingDiff = "";
    state.pendingCommands = [];
    state.lastPrompt = "";
    clearCommandDebugState();
    renderPlan([]);
    renderDiff([]);
    renderCommands([]);
    renderReview([]);
    await refreshAll();
    setBusy(false, "待命");
  } catch (error) {
    showToast(error.message);
    appendWorkspaceSafetyFailureEvidence(error, {
      title: "切换工作目录失败证据",
      label: "dir",
      action: "workspace-switch",
      workspace,
      currentWorkspace: workspaceStatus?.textContent || "",
      pendingDiff: state.pendingDiff,
      pendingPatches: state.pendingPatches,
      lastPrompt: state.lastPrompt
    });
    setBusy(false, "切换失败");
  }
});

worktreeBtn?.addEventListener("click", async () => {
  setBusy(true, "创建中");
  try {
    const result = await api("/api/worktree", {
      method: "POST",
      body: JSON.stringify({ prompt: state.lastPrompt || input.value.trim() })
    });
    workspaceInput.value = result.workspace;
    appendToolCall({
      title: "已创建隔离 worktree",
      label: "git",
      state: "完成",
      body: `branch：${result.branch}\nworkspace：${result.workspace}\n\n${result.output || ""}`
    });
    state.pendingPatches = [];
    state.pendingDiff = "";
    state.pendingCommands = [];
    renderPlan([]);
    renderDiff([]);
    renderCommands([]);
    renderReview([]);
    await refreshAll();
    setBusy(false, "待命");
  } catch (error) {
    showToast(error.message);
    appendWorkspaceSafetyFailureEvidence(error, {
      title: "创建隔离 worktree 失败证据",
      label: "git",
      action: "worktree-create",
      workspace: workspaceStatus?.textContent || workspaceInput?.value.trim() || "",
      currentWorkspace: workspaceStatus?.textContent || "",
      checkpoints: state.checkpoints,
      pendingDiff: state.pendingDiff,
      pendingPatches: state.pendingPatches,
      lastPrompt: state.lastPrompt || input.value.trim()
    });
    setBusy(false, "失败");
  }
});

contextSnapshotBtn?.addEventListener("click", async () => {
  setBusy(true, "保存摘要");
  try {
    const result = await api("/api/context-snapshot", { method: "POST" });
    state.contextSnapshot = result.snapshot || null;
    appendContextEvidenceCard("snapshot", result);
    await refreshHealth();
    await refreshFiles();
    setBusy(false, "摘要已保存");
  } catch (error) {
    showToast(error.message);
    appendContextFailureEvidence("snapshot", error, {
      endpoint: "/api/context-snapshot",
      request: { method: "POST" }
    });
    setBusy(false, "摘要失败");
  }
});

contextCompactBtn?.addEventListener("click", async () => {
  setBusy(true, "压缩上下文");
  try {
    const result = await api("/api/context-compact", { method: "POST" });
    appendContextEvidenceCard("compact", result);
    await refreshHealth();
    setBusy(false, "压缩已保存");
  } catch (error) {
    showToast(error.message);
    appendContextFailureEvidence("compact", error, {
      endpoint: "/api/context-compact",
      request: { method: "POST" }
    });
    setBusy(false, "压缩失败");
  }
});

contextRollupBtn?.addEventListener("click", async () => {
  setBusy(true, "生成滚动摘要");
  try {
    const result = await api("/api/context-rollup", {
      method: "POST",
      body: JSON.stringify({ limit: 24 })
    });
    state.contextRollup = result.rollup || null;
    appendContextEvidenceCard("rollup", result);
    await refreshHealth();
    await refreshFiles();
    setBusy(false, "滚动摘要已保存");
  } catch (error) {
    showToast(error.message);
    appendContextFailureEvidence("rollup", error, {
      endpoint: "/api/context-rollup",
      request: { method: "POST", body: { limit: 24 } }
    });
    setBusy(false, "滚动摘要失败");
  }
});

modelPolicyBtn?.addEventListener("click", async () => {
  setBusy(true, "读取模型策略");
  try {
    const result = await api("/api/model-policy", {
      method: "POST",
      body: JSON.stringify({ includeRecent: true })
    });
    appendModelEvidenceCard("policy", result);
    setBusy(false, "模型策略完成");
  } catch (error) {
    showToast(error.message);
    appendModelFailureEvidence("policy", error, {
      endpoint: "/api/model-policy",
      request: { includeRecent: true }
    });
    setBusy(false, "模型策略失败");
  }
});

modelUsageBtn?.addEventListener("click", async () => {
  setBusy(true, "读取模型用量");
  try {
    const result = await api("/api/model-usage");
    appendModelEvidenceCard("usage", result);
    setBusy(false, "模型用量完成");
  } catch (error) {
    showToast(error.message);
    appendModelFailureEvidence("usage", error, {
      endpoint: "/api/model-usage"
    });
    setBusy(false, "模型用量失败");
  }
});

modelBudgetBtn?.addEventListener("click", async () => {
  setBusy(true, "读取模型预算");
  try {
    const result = await api("/api/model-budget");
    appendModelEvidenceCard("budget", result);
    setBusy(false, "模型预算完成");
  } catch (error) {
    showToast(error.message);
    appendModelFailureEvidence("budget", error, {
      endpoint: "/api/model-budget"
    });
    setBusy(false, "模型预算失败");
  }
});

modelCostBtn?.addEventListener("click", async () => {
  setBusy(true, "读取模型成本");
  try {
    const result = await api("/api/model-cost");
    appendModelEvidenceCard("cost", result);
    setBusy(false, "模型成本完成");
  } catch (error) {
    showToast(error.message);
    appendModelFailureEvidence("cost", error, {
      endpoint: "/api/model-cost"
    });
    setBusy(false, "模型成本失败");
  }
});

modelCostPolicyBtn?.addEventListener("click", async () => {
  setBusy(true, "读取价格表 schema");
  try {
    const result = await api("/api/model-cost-policy");
    appendModelEvidenceCard("cost-policy", result);
    setBusy(false, "价格表完成");
  } catch (error) {
    showToast(error.message);
    appendModelFailureEvidence("cost-policy", error, {
      endpoint: "/api/model-cost-policy"
    });
    setBusy(false, "价格表失败");
  }
});

modelBillingBtn?.addEventListener("click", async () => {
  setBusy(true, "核对模型账单");
  try {
    const result = await api("/api/model-billing");
    appendModelEvidenceCard("billing", result);
    setBusy(false, "账单核对完成");
  } catch (error) {
    showToast(error.message);
    appendModelFailureEvidence("billing", error, {
      endpoint: "/api/model-billing"
    });
    setBusy(false, "账单核对失败");
  }
});

semanticIndexBtn?.addEventListener("click", async () => {
  setBusy(true, "索引中");
  try {
    const result = await api("/api/semantic-index", { method: "POST" });
    const search = await api("/api/semantic-search", {
      method: "POST",
      body: JSON.stringify({ query: "api", kind: "route", limit: 20 })
    });
    const references = await api("/api/semantic-references", {
      method: "POST",
      body: JSON.stringify({ symbol: "buildSemanticIndex", limit: 12, contextLines: 2 })
    });
    const evidence = {
      generatedAt: result.index?.generatedAt,
      indexedFiles: result.index?.indexedFiles,
      summary: result.index?.summary,
      declarations: result.index?.declarations?.slice(0, 40),
      routes: result.index?.routes?.slice(0, 30),
      selectors: result.index?.selectors?.slice(0, 30),
      routeSearch: search.matches?.slice(0, 20),
      referenceSample: references.matches?.slice(0, 8)
    };
    appendSemanticEvidenceCard(evidence, {
      title: "语义索引已生成",
      kind: "index",
      state: "完成",
      body: compactSemanticEvidence(evidence)
    });
    setBusy(false, "索引已生成");
  } catch (error) {
    showToast(error.message);
    appendSemanticFailureEvidence(error, {
      title: "生成语义索引失败证据",
      kind: "index",
      endpoint: "/api/semantic-index",
      request: {
        followUps: [
          { endpoint: "/api/semantic-search", body: { query: "api", kind: "route", limit: 20 } },
          { endpoint: "/api/semantic-references", body: { symbol: "buildSemanticIndex", limit: 12, contextLines: 2 } }
        ]
      }
    });
    setBusy(false, "索引失败");
  }
});

codeIntelligenceBtn?.addEventListener("click", async () => {
  setBusy(true, "生成代码智能");
  try {
    const result = await api("/api/code-intelligence", {
      method: "POST",
      body: JSON.stringify({ limit: 32, includeDiagnostics: true })
    });
    const evidence = {
      generatedAt: result.overview?.generatedAt,
      summary: result.overview?.summary,
      readiness: result.overview?.readiness,
      typecheck: result.overview?.typecheck ? {
        packageManager: result.overview.typecheck.packageManager,
        tsconfigs: result.overview.typecheck.tsconfigs,
        hasTsFiles: result.overview.typecheck.hasTsFiles,
        localCompiler: result.overview.typecheck.localCompiler,
        commands: result.overview.typecheck.commands?.slice(0, 8),
        policy: result.overview.typecheck.policy
      } : null,
      entrypoints: result.overview?.entrypoints?.slice(0, 20),
      apiSurface: {
        byMethod: result.overview?.apiSurface?.byMethod,
        topRouteFiles: result.overview?.apiSurface?.topRouteFiles,
        serverRoutes: result.overview?.apiSurface?.serverRoutes?.slice(0, 30),
        clientFetches: result.overview?.apiSurface?.clientFetches?.slice(0, 30)
      },
      symbolSurface: {
        declarationsByKind: result.overview?.symbolSurface?.declarationsByKind,
        outlineByKind: result.overview?.symbolSurface?.outlineByKind,
        topDeclarationFiles: result.overview?.symbolSurface?.topDeclarationFiles,
        largestSymbols: result.overview?.symbolSurface?.largestSymbols?.slice(0, 20),
        topCalls: result.overview?.symbolSurface?.topCalls?.slice(0, 20)
      },
      dependencyHotspots: result.overview?.dependencySurface?.hotspots?.slice(0, 24),
      diagnostics: result.overview?.diagnostics
    };
    appendSemanticEvidenceCard(evidence, {
      title: "代码智能概览已生成",
      kind: "intel",
      state: result.overview?.readiness?.some((item) => item.status === "blocker" || item.status === "warning") ? "review" : "完成",
      body: compactSemanticEvidence(evidence)
    });
    setBusy(false, "代码智能完成");
  } catch (error) {
    showToast(error.message);
    appendSemanticFailureEvidence(error, {
      title: "生成代码智能失败证据",
      kind: "intel",
      endpoint: "/api/code-intelligence",
      request: { limit: 32, includeDiagnostics: true }
    });
    setBusy(false, "代码智能失败");
  }
});

symbolOutlineBtn?.addEventListener("click", async () => {
  setBusy(true, "查询符号大纲");
  try {
    const outline = await api("/api/symbol-outline", {
      method: "POST",
      body: JSON.stringify({ path: "server.js", limit: 40, includeContext: false })
    });
    const definition = await api("/api/semantic-definition", {
      method: "POST",
      body: JSON.stringify({ symbol: "buildSemanticIndex", path: "server.js", contextLines: 2 })
    });
    const symbolImpact = await api("/api/semantic-symbol-impact", {
      method: "POST",
      body: JSON.stringify({ symbol: "buildSemanticIndex", path: "server.js", limit: 30, contextLines: 2 })
    });
    const renamePreview = await api("/api/semantic-rename-preview", {
      method: "POST",
      body: JSON.stringify({ symbol: "buildSemanticIndex", newName: "buildSemanticIndexNext", path: "server.js", limit: 30, contextLines: 2 })
    });
    const evidence = {
      outlineSummary: outline.summary,
      symbols: outline.symbols?.slice(0, 40),
      definition: {
        matchCount: definition.matchCount,
        definitions: definition.definitions?.slice(0, 10)
      },
      symbolImpact: {
        summary: symbolImpact.summary,
        editTargets: symbolImpact.editTargets?.slice(0, 12),
        definitions: symbolImpact.definition?.definitions?.slice(0, 8),
        references: symbolImpact.references?.matches?.slice(0, 16),
        impact: {
          targetSummaries: symbolImpact.impact?.targetSummaries?.slice(0, 12),
          dependents: symbolImpact.impact?.dependents?.slice(0, 12),
          callers: symbolImpact.impact?.callers?.slice(0, 12)
        },
        verificationCommands: symbolImpact.verificationCommands?.slice(0, 8),
        policy: symbolImpact.policy
      },
      renamePreview: {
        symbol: renamePreview.symbol,
        newName: renamePreview.newName,
        summary: renamePreview.summary,
        files: renamePreview.files?.slice(0, 12),
        locations: renamePreview.locations?.slice(0, 16),
        replacementConflicts: renamePreview.replacementConflicts?.slice(0, 8),
        warnings: renamePreview.warnings,
        verificationCommands: renamePreview.verificationCommands?.slice(0, 8),
        policy: renamePreview.policy
      }
    };
    appendSemanticEvidenceCard(evidence, {
      title: "符号大纲与定义已查询",
      kind: "outline",
      state: "完成",
      body: compactSemanticEvidence(evidence)
    });
    setBusy(false, "符号大纲完成");
  } catch (error) {
    showToast(error.message);
    appendSemanticFailureEvidence(error, {
      title: "查询符号大纲失败证据",
      kind: "outline",
      endpoint: "/api/symbol-outline",
      request: {
        outline: { path: "server.js", limit: 40, includeContext: false },
        definition: { symbol: "buildSemanticIndex", path: "server.js", contextLines: 2 },
        symbolImpact: { symbol: "buildSemanticIndex", path: "server.js", limit: 30, contextLines: 2 },
        renamePreview: { symbol: "buildSemanticIndex", newName: "buildSemanticIndexNext", path: "server.js", limit: 30, contextLines: 2 }
      }
    });
    setBusy(false, "符号大纲失败");
  }
});

semanticDiagnosticsBtn?.addEventListener("click", async () => {
  setBusy(true, "诊断中");
  try {
    const result = await api("/api/semantic-diagnostics", {
      method: "POST",
      body: JSON.stringify({ limit: 80, includeContext: true })
    });
    const evidence = {
      generatedAt: result.generatedAt,
      checked: result.checked,
      summary: result.summary,
      diagnostics: result.diagnostics?.slice(0, 30)
    };
    appendSemanticEvidenceCard(evidence, {
      title: "语义诊断已生成",
      kind: "diag",
      state: "完成",
      body: compactSemanticEvidence(evidence)
    });
    setBusy(false, "诊断完成");
  } catch (error) {
    showToast(error.message);
    appendSemanticFailureEvidence(error, {
      title: "生成语义诊断失败证据",
      kind: "diag",
      endpoint: "/api/semantic-diagnostics",
      request: { limit: 80, includeContext: true }
    });
    setBusy(false, "诊断失败");
  }
});

semanticImpactBtn?.addEventListener("click", async () => {
  setBusy(true, "分析影响面");
  try {
    const result = await api("/api/semantic-impact", {
      method: "POST",
      body: JSON.stringify({ limit: 80, includeContext: true })
    });
    const evidence = {
      generatedAt: result.generatedAt,
      source: result.source,
      summary: result.summary,
      targets: result.targetSummaries?.slice(0, 30),
      dependents: result.dependents?.slice(0, 30),
      callers: result.callers?.slice(0, 30),
      routes: result.routes?.slice(0, 20),
      selectors: result.selectors?.slice(0, 20),
      warnings: result.warnings
    };
    appendSemanticEvidenceCard(evidence, {
      title: "语义影响面已生成",
      kind: "impact",
      state: "完成",
      body: compactSemanticEvidence(evidence)
    });
    setBusy(false, "影响面完成");
  } catch (error) {
    showToast(error.message);
    appendSemanticFailureEvidence(error, {
      title: "生成语义影响面失败证据",
      kind: "impact",
      endpoint: "/api/semantic-impact",
      request: { limit: 80, includeContext: true }
    });
    setBusy(false, "影响面失败");
  }
});

pendingDiffImpactBtn?.addEventListener("click", analyzePendingDiffImpact);
preApplyReviewBtn?.addEventListener("click", () => runPreApplyReview({ allowPartial: false }));

dependencyGraphBtn?.addEventListener("click", async () => {
  setBusy(true, "生成依赖图");
  try {
    const result = await api("/api/dependency-graph", {
      method: "POST",
      body: JSON.stringify({ limit: 120, includeExternal: true })
    });
    const evidence = {
      generatedAt: result.generatedAt,
      summary: result.summary,
      nodes: result.nodes?.slice(0, 40),
      edges: result.edges?.slice(0, 60),
      cycles: result.cycles?.slice(0, 20),
      unresolved: result.unresolved?.slice(0, 30),
      external: result.external?.slice(0, 30)
    };
    appendSemanticEvidenceCard(evidence, {
      title: "依赖图已生成",
      kind: "graph",
      state: result.summary?.cycles ? "review" : "完成",
      body: compactSemanticEvidence(evidence)
    });
    setBusy(false, "依赖图完成");
  } catch (error) {
    showToast(error.message);
    appendSemanticFailureEvidence(error, {
      title: "生成依赖图失败证据",
      kind: "graph",
      endpoint: "/api/dependency-graph",
      request: { limit: 120, includeExternal: true }
    });
    setBusy(false, "依赖图失败");
  }
});

queueBtn?.addEventListener("click", async () => {
  const prompt = input.value.trim() || state.lastPrompt;
  if (!prompt) {
    showToast("请输入要排队的任务描述。");
    return;
  }
  setBusy(true, "入队中");
  try {
    const item = await api("/api/queue", {
      method: "POST",
      body: JSON.stringify({ prompt, priority: 0, retryLimit: 1 })
    });
    appendToolCall({
      title: "任务已加入队列",
      label: "queue",
      state: "完成",
      body: `${item.id}\n${item.prompt}`
    });
    await refreshHealth();
    setBusy(false, "待命");
  } catch (error) {
    showToast(error.message);
    appendActionFailureEvidence({
      kind: "queue",
      action: "queue-create",
      targetName: "new-queued-task",
      endpoint: "/api/queue",
      request: { prompt, priority: 0, retryLimit: 1 },
      item: {
        prompt,
        status: "create_failed",
        isolationGroup: "default"
      },
      error
    }, {
      title: "任务入队失败证据",
      label: "queue",
      retry: async () => {
        const item = await api("/api/queue", {
          method: "POST",
          body: JSON.stringify({ prompt, priority: 0, retryLimit: 1 })
        });
        appendToolCall({
          title: "任务已加入队列",
          label: "queue",
          state: "完成",
          body: `${item.id}\n${item.prompt}`
        });
        await refreshHealth();
      },
      safe: () => appendQueueContextToPrompt({ prompt, status: "queued", isolationGroup: "default", priority: 0, retryLimit: 1 })
    });
    setBusy(false, "入队失败");
  }
});

queueIsolationBtn?.addEventListener("click", async () => {
  setBusy(true, "读取队列隔离");
  try {
    const result = await api("/api/queue-isolation?limit=50");
    const evidence = {
      ...result,
      status: result.summary?.queuedBlockedByIsolation > 0 || result.summary?.activeConflictGroups > 0 ? "needs_attention" : "pass",
      gates: [
        {
          name: "队列隔离",
          status: result.summary?.activeConflictGroups > 0 ? "block" : result.summary?.queuedBlockedByIsolation > 0 ? "warn" : "pass",
          message: `${result.summary?.activeGroups || 0} active groups · ${result.summary?.queuedBlockedByIsolation || 0} blocked queued tasks`,
          evidence: (result.rows || []).slice(0, 8).map((row) => [
            row.isolationGroup,
            row.active?.length ? `active: ${row.active.map((item) => item.id).join(", ")}` : "",
            row.queued?.length ? `queued: ${row.queued.map((item) => item.id).join(", ")}` : "",
            row.blockedActivations?.length ? `blocked: ${row.blockedActivations.map((item) => item.id).join(", ")}` : ""
          ].filter(Boolean).join(" · "))
        }
      ],
      blockers: (result.rows || []).flatMap((row) => row.blockedActivations || []).map((item) => item.reason || item.id).filter(Boolean),
      nextActions: result.summary?.queuedBlockedByIsolation > 0
        ? ["完成或跳过当前 active 队列项", "调整后续任务 isolationGroup", "直接继续未阻塞的队列项"]
        : ["队列隔离正常，可继续激活下一项任务"]
    };
    appendGateEvidenceCard(evidence, {
      title: "队列隔离报告已读取",
      kind: "queue",
      state: `${result.summary?.activeGroups || 0} active groups`,
      includeCommands: false,
      body: JSON.stringify({
        generatedAt: result.generatedAt,
        summary: result.summary,
        policy: result.policy,
        rows: result.rows?.map((row) => ({
          isolationGroup: row.isolationGroup,
          active: row.active?.map((item) => item.id),
          queued: row.queued?.map((item) => item.id),
          blockedActivations: row.blockedActivations
        }))
      }, null, 2).slice(0, 12000)
    });
    setBusy(false, "队列隔离完成");
  } catch (error) {
    showToast(error.message);
    appendGateFailureEvidence(error, {
      title: "读取队列隔离失败证据",
      kind: "queue",
      endpoint: "/api/queue-isolation",
      request: { limit: 50 },
      retry: async () => {
        const result = await api("/api/queue-isolation?limit=50");
        appendGateEvidenceCard({
          ...result,
          status: result.summary?.queuedBlockedByIsolation > 0 || result.summary?.activeConflictGroups > 0 ? "needs_attention" : "pass",
          blockers: (result.rows || []).flatMap((row) => row.blockedActivations || []).map((item) => item.reason || item.id).filter(Boolean)
        }, {
          title: "队列隔离报告已读取",
          kind: "queue",
          state: `${result.summary?.activeGroups || 0} active groups`,
          includeCommands: false,
          body: JSON.stringify({
            generatedAt: result.generatedAt,
            summary: result.summary,
            policy: result.policy
          }, null, 2).slice(0, 12000)
        });
      }
    });
    setBusy(false, "队列隔离失败");
  }
});

async function applyPendingDiff({ allowPartial = false } = {}) {
  if (!state.pendingDiff) {
    showToast("当前没有可写入的 diff。");
    return;
  }
  const selectedDiff = allowPartial ? collectSelectedDiff() : null;
  if (allowPartial && !selectedDiff.diff.trim()) {
    showToast("请至少选择一个 hunk 再部分应用。");
    return;
  }
  const applyDiff = allowPartial ? selectedDiff.diff : state.pendingDiff;
  const applyPatches = state.pendingPatches || [];
  const applyCommands = state.pendingCommands || [];
  const applyRepairContext = state.activeRepairChain;
  const applyPrompt = state.lastPrompt;
  const preApplyReady = await ensurePreApplyReviewBeforeApply({ allowPartial });
  if (!preApplyReady) return;
  setBusy(true);
  try {
    const result = await api("/api/apply", {
      method: "POST",
      body: JSON.stringify({
        diff: applyDiff,
        prompt: applyPrompt,
        commands: applyCommands,
        repairContext: applyRepairContext,
        allowPartial,
        selectedHunks: selectedDiff?.summary || []
      })
    });
    if (result.status === "conflict") {
      let conflictPreview = null;
      try {
        conflictPreview = await api("/api/diff-conflicts", {
          method: "POST",
          body: JSON.stringify({ diff: applyDiff })
        });
      } catch (error) {
        conflictPreview = { error: error.message };
      }
      renderConflictResolution(conflictPreview);
      appendToolCall({
        title: "diff 存在冲突，未写入",
        label: "fs",
        state: "冲突",
        body: JSON.stringify({
          summary: result.analysis?.summary,
          conflicts: result.conflicts,
          conflictPreview,
          policy: result.policy
        }, null, 2).slice(0, 12000)
      });
      appendMessage("agent", conflictPreview?.conflictPreviews?.length
        ? "diff 冲突预检未通过，已阻止写入；请在冲突解决面板编辑 resolved 文本后生成待审批草稿。"
        : "diff 冲突预检未通过，已阻止写入。可修正 diff，或点击“部分应用”只写入无冲突文件。");
      setBusy(false, "冲突未写入");
      return;
    }
    appendToolCall({
      title: allowPartial ? "diff 已部分写入工作区" : "diff 已写入工作区",
      label: "fs",
      state: result.status || "完成",
        body: [
          `checkpoint：${result.checkpoint.id}`,
          selectedDiff?.summary?.length ? `selectedHunks：${selectedDiff.summary.map((item) => `${item.path} ${item.selectedHunks}/${item.totalHunks}`).join(", ")}` : "",
          result.conflicts?.length ? `conflicts：${result.conflicts.map((item) => item.path).join(", ")}` : "",
          "",
        result.applied.map((item) => item.path).join("\n")
      ].filter((line) => line !== "").join("\n")
    });
    renderVerification(result.verification);
    appendApplyVerificationRecovery(result);
    if (state.activeRepairChain) {
      updateRepairEvidenceChain({
        status: result.verification?.skipped
          ? "applied_unverified"
          : result.verification?.ok
            ? "verified"
            : result.repair?.diff
              ? "repair_suggested"
              : "verification_failed",
        apply: {
          status: result.status || "",
          checkpointId: result.checkpoint?.id || "",
          changedFiles: (result.applied || []).map((item) => item.path),
          taskId: result.task?.id || ""
        },
        verification: {
          ok: Boolean(result.verification?.ok),
          skipped: Boolean(result.verification?.skipped),
          checkCount: result.verification?.checks?.length || 0,
          failedCommands: (result.verification?.checks || []).filter((check) => check.exitCode !== 0).map((check) => check.command).slice(0, 6),
          recovery: result.recovery || null
        }
      }, { title: "修复验证证据链" });
    }
    if (result.repair?.diff) {
      const failedCheck = (result.verification?.checks || []).find((check) => check.exitCode !== 0) || null;
      updateRepairEvidenceChain({
        source: "apply-verification",
        status: "awaiting_approval",
        command: failedCheck?.command || state.activeRepairChain?.command || "",
        failure: failedCheck ? {
          exitCode: failedCheck.exitCode,
          blocked: false,
          outputSummary: summarizeCommandOutput(failedCheck.output || ""),
          output: String(failedCheck.output || "").slice(0, 8000),
          policy: failedCheck.policy || null
        } : state.activeRepairChain?.failure || null,
        repair: {
          reply: result.repair.reply || "",
          hasDiff: Boolean(result.repair.diff),
          files: repairChainFiles(result.repair),
          commandCount: result.repair.commands?.length || 0,
          reviewCount: result.repair.review?.length || 0
        }
      }, { title: "自动检查失败，修复证据链已续写" });
      state.pendingDiff = result.repair.diff;
      renderPlan(result.repair.plan || []);
      renderDiff(result.repair.patches || []);
      renderReview(result.repair.review || []);
      stageRepairVerificationCommands(result.repair.commands || [], {
        title: "修复后验证命令",
        successTitle: "修复后验证命令已放入命令面板",
        source: "apply-verification-repair",
        note: "自动检查失败后生成了修复候选，但没有附带验证命令。"
      });
      appendToolCall({
        title: "自动检查失败，已生成修复候选",
        label: "repair",
        state: result.status || "待审批",
        body: JSON.stringify({
          reply: result.repair.reply || "",
          plan: result.repair.plan || [],
          review: result.repair.review || [],
          commands: result.repair.commands || [],
          repairError: result.repairError || ""
        }, null, 2).slice(0, 12000)
      });
      appendMessage("agent", `${result.repair.reply} 修复 diff、计划和建议命令已放入预览区，可再次批准写入并继续验证。`);
      setBusy(false, "待修复审批");
    } else {
      state.pendingPatches = [];
      state.pendingDiff = "";
      renderDiff([]);
      const verifyMessage = result.verification?.skipped
        ? "写入完成，但未发现可自动运行的安全检查命令；任务已按未验证记录。"
        : result.verification?.ok
          ? "自动检查通过，任务已记录。"
          : "自动检查未通过，且没有生成可安全应用的修复 diff。";
      appendMessage("agent", verifyMessage);
      if (result.verification?.skipped || (!result.verification?.ok && !result.repair?.diff)) {
        stageRepairVerificationCommands(result.recovery?.verificationCommands || [], {
          title: "写入后复查命令",
          successTitle: "写入后复查命令已放入命令面板",
          source: "apply-verification-recovery",
          note: "这次写入没有生成可复用的写入后复查命令。"
        });
      }
      if (!result.verification?.skipped && !result.verification?.ok) {
        appendApplyFailureEvidence(result, {
          title: "写入后验证失败证据",
          diff: applyDiff,
          patches: applyPatches,
          commands: applyCommands,
          allowPartial,
          repairContext: applyRepairContext,
          prompt: applyPrompt
        });
      }
      setBusy(false, result.verification?.skipped ? "未验证" : result.verification?.ok ? "已验证" : "检查失败");
    }
    if (result.git) renderGit(result.git);
    await refreshHealth();
    await refreshFiles();
  } catch (error) {
    showToast(error.message);
    appendApplyFailureEvidence(error, {
      title: "写入请求失败证据",
      diff: applyDiff,
      patches: applyPatches,
      commands: applyCommands,
      allowPartial,
      repairContext: applyRepairContext,
      prompt: applyPrompt
    });
    setBusy(false, "写入失败");
  }
}

approveBtn.addEventListener("click", async () => {
  await applyPendingDiff({ allowPartial: false });
});

approvePartialBtn?.addEventListener("click", async () => {
  await applyPendingDiff({ allowPartial: true });
});

copyAllDiffBtn?.addEventListener("click", async () => {
  const diff = combinedPendingDiff() || state.pendingDiff || "";
  if (!diff.trim()) {
    showToast("当前没有可复制的 diff。");
    return;
  }
  const copied = await copyText(diff);
  appendToolCall({
    title: copied ? "已复制全部 diff" : "复制全部 diff 失败",
    label: "diff",
    state: copied ? "完成" : "失败",
    body: copyLogBody(copied, diff.slice(0, 8000))
  });
  showToast(copied ? "全部 diff 已复制。" : copyFailureSummary());
});

toggleAllDiffBtn?.addEventListener("click", () => {
  const files = [...diffList.querySelectorAll(".diff-file")];
  if (!files.length) {
    showToast("当前没有可折叠的 diff。");
    return;
  }
  const shouldCollapse = files.some((item) => !item.classList.contains("collapsed"));
  setAllDiffFilesCollapsed(shouldCollapse);
});

conflictResolutionPanel?.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const action = button.dataset.action;
  if (action === "prompt-conflicts") {
    appendConflictResolutionToPrompt();
    return;
  }
  if (action === "repair-conflicts") {
    runConflictResolutionRepair();
    return;
  }
  if (action === "create-resolution-draft") {
    await createConflictResolutionDraftFromPanel();
    return;
  }
  const row = button.closest(".conflict-resolution-row");
  if (!row) return;
  const index = Number(row.dataset.index || 0);
  const conflict = state.conflictPreview?.conflictPreviews?.[index] || {};
  const textarea = row.querySelector("textarea");
  if (!textarea) return;
  if (action === "use-current") textarea.value = (conflict.current || []).join("\n");
  if (action === "use-proposed") textarea.value = (conflict.proposed || []).join("\n");
});

rollbackBtn.addEventListener("click", async () => {
  const checkpointId = state.checkpoints[0];
  if (!checkpointId) {
    showToast("当前没有可回滚的 checkpoint。");
    return;
  }
  setBusy(true);
  try {
    const result = await api("/api/rollback", {
      method: "POST",
      body: JSON.stringify({ checkpointId })
    });
    appendToolCall({
      title: "已回滚 checkpoint",
      label: "undo",
      state: "完成",
      body: `${result.id}\n\n${result.restored.join("\n")}`
    });
    await refreshHealth();
    await refreshFiles();
    setBusy(false, "已回滚");
  } catch (error) {
    showToast(error.message);
    appendWorkspaceSafetyFailureEvidence(error, {
      title: "checkpoint 回滚失败证据",
      label: "undo",
      action: "checkpoint-rollback",
      checkpointId,
      currentWorkspace: workspaceStatus?.textContent || "",
      checkpoints: state.checkpoints,
      pendingDiff: state.pendingDiff,
      pendingPatches: state.pendingPatches,
      lastPrompt: state.lastPrompt
    });
    setBusy(false, "回滚失败");
  }
});

async function runSuggestedCommand(command, { single = false } = {}) {
  updateCommandRunState(command, { status: "running", result: null, error: "", startedAt: new Date().toISOString() });
  appendToolCall({ title: `${single ? "单条运行" : "运行命令"}：${command}`, label: "$", state: "运行中", body: "" });
  try {
    const result = await api("/api/command", {
      method: "POST",
      body: JSON.stringify({ command })
    });
    updateCommandRunState(command, { status: "done", result, error: "" });
    appendToolCall({
      title: `命令完成：${command}`,
      label: "$",
      state: result.exitCode === 0 ? "完成" : result.blocked ? "已拒绝" : "失败",
      body: [
        result.policy ? `policy: ${result.policy.risk} · ${result.policy.reason}` : "",
        result.approval ? `approval: ${result.approval.id}` : "",
        "",
        result.output || "(无输出)"
      ].join("\n").trim()
    });
    if (result.exitCode === 0) return true;
    if (result.blocked) {
      appendMessage("agent", `命令被安全策略拒绝：${result.policy?.reason || "未通过策略"}`);
      return false;
    }
    let diagnostics = result.diagnostics || null;
    if (!diagnostics) {
      try {
        const diagnosticsResponse = await api("/api/debug-diagnostics", {
          method: "POST",
          body: JSON.stringify({
            url: browserCheckUrlInput?.value.trim() || "",
            includeTrace: Boolean(browserCheckUrlInput?.value.trim()),
            runChecks: false,
            limit: 12,
            commands: [command]
          })
        });
        diagnostics = diagnosticsResponse.diagnostics;
      } catch (error) {
        appendGateFailureEvidence(error, {
          title: "失败命令诊断失败",
          kind: "debug",
          endpoint: "/api/debug-diagnostics",
          request: {
            url: browserCheckUrlInput?.value.trim() || "",
            includeTrace: Boolean(browserCheckUrlInput?.value.trim()),
            runChecks: false,
            limit: 12,
            commands: [command]
          },
          extra: {
            command,
            commandResult: result
          }
        });
      }
    }
    if (diagnostics) {
      renderDebugDiagnostics(diagnostics);
      appendToolCall({
        title: `失败命令诊断：${command}`,
        label: "debug",
        state: diagnostics.status || "unknown",
        body: JSON.stringify({
          summary: diagnostics.summary,
          findings: diagnostics.findings,
          nextActions: diagnostics.nextActions,
          policy: diagnostics.policy
        }, null, 2).slice(0, 12000)
      });
    }
    const repair = await api("/api/repair-command", {
      method: "POST",
      body: JSON.stringify({
        prompt: state.lastPrompt || input.value.trim(),
        command,
        result,
        diagnostics
      })
    });
    if (repair.diff) {
      const repairChain = createRepairEvidenceChain({
        source: "failed-command",
        command,
        result,
        diagnostics,
        prompt: state.lastPrompt || input.value.trim()
      });
      updateRepairEvidenceChain({
        ...repairChain,
        status: "awaiting_approval",
        repair: {
          reply: repair.reply || "",
          hasDiff: Boolean(repair.diff),
          files: repairChainFiles(repair),
          commandCount: repair.commands?.length || 0,
          reviewCount: repair.review?.length || 0,
          proposalId: repair.proposal?.id || repair.goal?.pendingProposalId || ""
        }
      }, { title: "失败命令修复候选已加入证据链" });
      state.pendingDiff = repair.diff;
      renderDiff(repair.patches || []);
      renderReview(repair.review || []);
      stageRepairVerificationCommands(repair.commands || [], {
        title: "失败命令修复验证命令",
        successTitle: "失败命令修复验证命令已放入命令面板",
        source: "failed-command-repair",
        note: "失败命令修复候选没有附带验证命令。"
      });
      appendToolCall({
        title: "失败命令修复草稿已生成",
        label: "repair",
        state: repair.proposal?.id || repair.goal?.pendingProposalId || "awaiting_approval",
        body: JSON.stringify({
          proposalId: repair.proposal?.id || repair.goal?.pendingProposalId || "",
          type: repair.proposal?.type || "failed_command_repair",
          command,
          files: repairChainFiles(repair),
          commands: repair.commands || [],
          policy: repair.policy || null,
          recovery: repair.recovery || null
        }, null, 2).slice(0, 12000)
      });
      appendMessage("agent", `${repair.reply} 失败命令修复 diff 已生成待审批草稿，可复核后批准写入。`);
    } else {
      createRepairEvidenceChain({
        source: "failed-command",
        command,
        result,
        diagnostics,
        prompt: state.lastPrompt || input.value.trim()
      });
      updateRepairEvidenceChain({
        status: "no_safe_repair",
        repair: {
          reply: repair.reply || "",
          hasDiff: false,
          files: [],
          commandCount: repair.commands?.length || 0,
          reviewCount: repair.review?.length || 0
        }
      }, { title: "失败命令未生成安全修复" });
      appendMessage("agent", repair.reply || "命令失败，但没有生成可安全应用的修复 diff。");
    }
    return false;
  } catch (error) {
    updateCommandRunState(command, { status: "done", result: { exitCode: 1, output: error.message }, error: error.message });
    appendActionFailureEvidence({
      kind: "command",
      action: "command-run-or-repair",
      targetName: command,
      endpoint: "/api/command",
      request: { command },
      item: {
        command,
        lastPrompt: state.lastPrompt || input.value.trim(),
        lastKnownRun: state.commandResults[commandResultKey(command)] || null
      },
      error
    }, {
      title: `命令失败：${command}`,
      label: "$",
      retry: () => runSuggestedCommand(command, { single }),
      safe: () => appendCommandVerificationPromptToPrompt(command, state.commandResults[commandResultKey(command)] || null)
    });
    return false;
  }
}

async function runCommandBatch(commands = [], { title = "建议命令", stopOnFailure = true } = {}) {
  const items = normalizeCommandItems(commands);
  if (!items.length) {
    showToast("当前没有可运行命令。");
    return false;
  }
  appendToolCall({
    title: `开始批量运行：${title}`,
    label: "$",
    state: "运行中",
    body: commandItemsToText(items)
  });
  let stoppedAt = "";
  for (const item of items) {
    const ok = await runSuggestedCommand(item.command);
    if (!ok && stopOnFailure) {
      stoppedAt = item.command;
      break;
    }
  }
  const summary = summarizeCommandBatch(items);
  const ok = summary.failed === 0 && summary.blocked === 0 && summary.running === 0 && summary.queued === 0;
  recordRepairVerificationFromBatch(items, { title, stoppedAt, ok });
  appendToolCall({
    title: `批量命令摘要：${title}`,
    label: "$",
    state: ok ? "完成" : "失败",
    body: [
      formatCommandBatchSummary(items),
      stoppedAt ? `stoppedAt: ${stoppedAt}` : "",
      "",
      commandBatchEvidence(items)
    ].filter((line) => line !== "").join("\n")
  });
  showToast(ok ? "全部命令已通过。" : "命令批量运行已停止，查看摘要。");
  return ok;
}

runCommandsBtn.addEventListener("click", async () => {
  if (!state.pendingCommands.length) {
    showToast("当前没有建议命令。");
    return;
  }
  setBusy(true, "运行命令");
  const ok = await runCommandBatch(state.pendingCommands, { title: "建议命令" });
  setBusy(false, ok ? "命令通过" : "命令失败");
});

manualCommandForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const command = manualCommandInput?.value.trim() || "";
  resetManualCommandHistoryNavigation();
  const item = stageManualCommand(command, { focus: false });
  if (!item) return;
  if (state.busy) {
    showToast("代理正在运行，已先加入面板。");
    return;
  }
  setBusy(true, "运行手动验证");
  const ok = await runSuggestedCommand(item.command, { single: true });
  setBusy(false, ok ? "验证通过" : "验证失败");
});

manualCommandStageBtn?.addEventListener("click", () => {
  resetManualCommandHistoryNavigation();
  stageManualCommand(manualCommandInput?.value || "");
});

manualCommandInput?.addEventListener("keydown", handleManualCommandInputKeydown);
manualCommandInput?.addEventListener("input", resetManualCommandHistoryNavigation);

reviewBtn?.addEventListener("click", async () => {
  setBusy(true, "复核中");
  try {
    const result = await api("/api/review", {
      method: "POST",
      body: JSON.stringify({ prompt: state.lastPrompt || input.value.trim() })
    });
    renderReview(result.review || []);
    renderCommands(result.commands || []);
    appendMessage("agent", result.reply || "代码审查完成。");
    if (result.artifact) {
      appendToolCall({
        title: "审查 artifact 已保存",
        label: "review",
        state: "完成",
        body: `id: ${result.artifact.id}\npath: ${result.artifact.path || "(未返回路径)"}\n发现：${result.artifact.findingCount || 0}\n命令：${result.artifact.commandCount || 0}`
      });
    }
    appendToolCall({
      title: "当前 Git diff 证据",
      label: "git",
      state: result.evidence?.diff ? "完成" : "跳过",
      body: [
        result.evidence?.stat || "(无 diff stat)",
        "",
        (result.evidence?.diff || "").slice(0, 12000)
      ].join("\n")
    });
    await refreshHealth();
    setBusy(false, "已复核");
  } catch (error) {
    showToast(error.message);
    appendGateFailureEvidence(error, {
      title: "复核当前改动失败",
      kind: "review",
      endpoint: "/api/review",
      request: { prompt: state.lastPrompt || input.value.trim() },
      extra: {
        pendingDiff: {
          bytes: String(state.pendingDiff || "").length,
          files: (state.pendingPatches || []).map((patch) => patch.path).filter(Boolean).slice(0, 20)
        }
      }
    });
    setBusy(false, "复核失败");
  }
});

verificationPlanBtn?.addEventListener("click", async () => {
  setBusy(true, "生成验证门禁");
  try {
    const result = await api("/api/verification-plan", {
      method: "POST",
      body: JSON.stringify({ limit: 12, commands: state.pendingCommands.map((item) => item.command || item) })
    });
    renderVerificationPlan(result.plan, { logCommands: true });
    appendGateEvidenceCard(result.plan || {}, {
      title: "验证门禁计划已生成",
      kind: "verify",
      state: result.plan?.status || "unknown",
      body: compactGateEvidence(result.plan || {})
    });
    setBusy(false, result.plan?.status === "ready" ? "门禁就绪" : "门禁待处理");
  } catch (error) {
    showToast(error.message);
    appendGateFailureEvidence(error, {
      title: "验证门禁计划失败",
      kind: "verify",
      endpoint: "/api/verification-plan",
      request: { limit: 12, commands: state.pendingCommands.map((item) => item.command || item) }
    });
    setBusy(false, "门禁失败");
  }
});

ciStatusBtn?.addEventListener("click", async () => {
  setBusy(true, "读取 CI 状态");
  try {
    const result = await api("/api/ci-status", {
      method: "POST",
      body: JSON.stringify({ limit: 20, persist: true })
    });
    const evidence = {
      generatedAt: result.status?.generatedAt,
      status: result.status?.status,
      provider: result.status?.provider,
      summary: result.status?.summary,
      ci: result.status?.ci,
      remote: {
        provider: result.status?.remote?.provider,
        available: result.status?.remote?.available,
        authenticated: result.status?.remote?.authenticated,
        reason: result.status?.remote?.reason,
        checks: result.status?.remote?.checks
      },
      verificationPlan: result.status?.verificationPlan,
      blockers: result.status?.blockers,
      policy: result.status?.policy,
      artifact: result.status?.artifact
    };
    appendGateEvidenceCard(evidence, {
      title: "CI 状态汇总已生成",
      kind: "ci",
      state: result.status?.status || "unknown",
      body: compactGateEvidence(evidence)
    });
    renderVerificationPlan(result.status?.verificationPlan);
    setBusy(false, result.status?.status === "ready" ? "CI 就绪" : "CI 待处理");
  } catch (error) {
    showToast(error.message);
    appendGateFailureEvidence(error, {
      title: "CI 状态读取失败",
      kind: "ci",
      endpoint: "/api/ci-status",
      request: { limit: 20, persist: true }
    });
    setBusy(false, "CI 状态失败");
  }
});

debugDiagnosticsBtn?.addEventListener("click", async () => {
  const targetUrl = browserCheckUrlInput?.value.trim();
  const runChecks = Boolean(debugDiagnosticsPanel?.querySelector("#debugRunChecks")?.checked || debugRunChecks?.checked);
  setBusy(true, "调试诊断");
  try {
    const diagnosticsResponse = await api("/api/debug-diagnostics", {
      method: "POST",
      body: JSON.stringify({
        url: targetUrl,
        includeTrace: Boolean(targetUrl),
        runChecks,
        limit: 20,
        commands: state.pendingCommands.map((item) => item.command || item)
      })
    });
    renderDebugDiagnostics(diagnosticsResponse.diagnostics);
    renderVerificationPlan(diagnosticsResponse.diagnostics?.verificationPlan);
    if (diagnosticsResponse.diagnostics?.verificationPlan?.commands?.length) {
      renderCommands(diagnosticsResponse.diagnostics.verificationPlan.commands);
    }
    if (diagnosticsResponse.diagnostics?.browserTrace) {
      renderBrowserTrace(diagnosticsResponse.diagnostics.browserTrace);
    }
    appendToolCall({
      title: "一键调试诊断完成",
      label: "debug",
      state: diagnosticsResponse.diagnostics?.status || "unknown",
      body: JSON.stringify({
        generatedAt: diagnosticsResponse.diagnostics?.generatedAt,
        status: diagnosticsResponse.diagnostics?.status,
        summary: diagnosticsResponse.diagnostics?.summary,
        findings: diagnosticsResponse.diagnostics?.findings,
        browserTriage: diagnosticsResponse.diagnostics?.browserTriage,
        browserSourceLocations: diagnosticsResponse.diagnostics?.browserSourceLocations,
        nextActions: diagnosticsResponse.diagnostics?.nextActions,
        policy: diagnosticsResponse.diagnostics?.policy
      }, null, 2).slice(0, 12000)
    });
    setBusy(false, diagnosticsResponse.diagnostics?.status === "ready" ? "诊断通过" : "诊断完成");
  } catch (error) {
    showToast(error.message);
    appendGateFailureEvidence(error, {
      title: "一键调试诊断失败",
      kind: "debug",
      endpoint: "/api/debug-diagnostics",
      request: {
        url: targetUrl,
        includeTrace: Boolean(targetUrl),
        runChecks,
        limit: 20,
        commands: state.pendingCommands.map((item) => item.command || item)
      }
    });
    setBusy(false, "诊断失败");
  }
});

policyAuditBtn?.addEventListener("click", async () => {
  setBusy(true, "生成权限审计");
  try {
    const result = await api("/api/policy-audit", {
      method: "POST",
      body: JSON.stringify({ limit: 20, sampleCommands: state.pendingCommands.map((item) => item.command || item) })
    });
    appendGateEvidenceCard(result.audit || {}, {
      title: "权限策略审计已生成",
      kind: "policy",
      state: result.audit?.summary?.findings ? "review" : "ok",
      body: compactGateEvidence(result.audit || {}),
      includeCommands: false
    });
    setBusy(false, "权限审计完成");
  } catch (error) {
    showToast(error.message);
    appendGateFailureEvidence(error, {
      title: "权限策略审计失败",
      kind: "policy",
      endpoint: "/api/policy-audit",
      request: { limit: 20, sampleCommands: state.pendingCommands.map((item) => item.command || item) }
    });
    setBusy(false, "权限审计失败");
  }
});

permissionMatrixBtn?.addEventListener("click", async () => {
  setBusy(true, "读取权限矩阵");
  try {
    const result = await api("/api/permission-matrix", {
      method: "POST",
      body: JSON.stringify({ limit: 40 })
    });
    appendGateEvidenceCard(result.matrix || {}, {
      title: "权限矩阵已生成",
      kind: "matrix",
      state: `${result.matrix?.summary?.providers || 0} providers`,
      body: compactGateEvidence(result.matrix || {}),
      includeCommands: false
    });
    setBusy(false, "权限矩阵完成");
  } catch (error) {
    showToast(error.message);
    appendGateFailureEvidence(error, {
      title: "权限矩阵失败",
      kind: "matrix",
      endpoint: "/api/permission-matrix",
      request: { limit: 40 }
    });
    setBusy(false, "权限矩阵失败");
  }
});

extensionTrustBtn?.addEventListener("click", async () => {
  setBusy(true, "读取扩展信任");
  try {
    const result = await api("/api/extension-trust", {
      method: "POST",
      body: JSON.stringify({ limit: 40 })
    });
    appendGateEvidenceCard(result.trust || {}, {
      title: "扩展 Trust 审计已生成",
      kind: "trust",
      state: `${result.trust?.summary?.total || 0} extensions`,
      body: compactGateEvidence(result.trust || {}),
      includeCommands: false
    });
    setBusy(false, "扩展信任完成");
  } catch (error) {
    showToast(error.message);
    appendGateFailureEvidence(error, {
      title: "扩展 Trust 审计失败",
      kind: "trust",
      endpoint: "/api/extension-trust",
      request: { limit: 40 }
    });
    setBusy(false, "扩展信任失败");
  }
});

prReadinessBtn?.addEventListener("click", async () => {
  setBusy(true, "检查 PR");
  try {
    const readiness = await api("/api/pr-readiness", {
      method: "POST",
      body: JSON.stringify({ prompt: state.lastPrompt || input.value.trim() })
    });
    const remoteStatus = await api("/api/remote-pr-status").catch(() => readiness.remote || null);
    const remote = remoteStatus || readiness.remote || {};
    const evidence = {
      provider: readiness.provider,
      status: readiness.status,
      remotes: readiness.remotes,
      ci: readiness.ci,
      verificationPlan: readiness.verificationPlan,
      remote,
      blockers: readiness.blockers,
      warnings: readiness.warnings,
      policy: readiness.policy,
      draft: readiness.draft
    };
    appendGateEvidenceCard(evidence, {
      title: "PR readiness 已生成",
      kind: "pr",
      state: readiness.status || "unknown",
      body: [
        `provider: ${readiness.provider || "unknown"}`,
        `remotes: ${readiness.remotes?.length || 0}`,
        `ci: ${readiness.ci?.length || 0}`,
        `verification gates: ${readiness.verificationPlan?.summary?.gates || 0}`,
        `remote: ${remote.available ? "available" : "unavailable"}`,
        remote.reason ? `remote reason: ${remote.reason}` : "",
        `blockers: ${readiness.blockers?.length || 0}`,
        "",
        readiness.draft?.body || ""
      ].join("\n").slice(0, 12000)
    });
    renderVerificationPlan(readiness.verificationPlan);
    setBusy(false, readiness.status === "ready" ? "PR 就绪" : "PR 待处理");
  } catch (error) {
    showToast(error.message);
    appendGateFailureEvidence(error, {
      title: "PR readiness 检查失败",
      kind: "pr",
      endpoint: "/api/pr-readiness",
      request: { prompt: state.lastPrompt || input.value.trim() }
    });
    setBusy(false, "PR 检查失败");
  }
});

mergeGateBtn?.addEventListener("click", async () => {
  setBusy(true, "读取合并门禁");
  try {
    const result = await api("/api/merge-gate", {
      method: "POST",
      body: JSON.stringify({ prompt: state.lastPrompt || input.value.trim(), limit: 12 })
    });
    const evidence = {
      generatedAt: result.gate?.generatedAt,
      status: result.gate?.status,
      summary: result.gate?.summary,
      gates: result.gate?.gates,
      blockers: result.gate?.blockers,
      warnings: result.gate?.warnings,
      remote: result.gate?.remote,
      publishPackage: result.gate?.publishPackage,
      verificationPlan: result.gate?.verificationPlan,
      policy: result.gate?.policy
    };
    appendGateEvidenceCard(evidence, {
      title: "合并门禁已生成",
      kind: "gate",
      state: result.gate?.status || "unknown",
      body: compactGateEvidence(evidence)
    });
    renderVerificationPlan(result.gate?.verificationPlan);
    setBusy(false, result.gate?.status === "ready" ? "合并就绪" : "合并待处理");
  } catch (error) {
    showToast(error.message);
    appendGateFailureEvidence(error, {
      title: "合并门禁失败",
      kind: "gate",
      endpoint: "/api/merge-gate",
      request: { prompt: state.lastPrompt || input.value.trim(), limit: 12 }
    });
    setBusy(false, "合并门禁失败");
  }
});

remotePublishPlanBtn?.addEventListener("click", async () => {
  setBusy(true, "生成发布审批");
  try {
    const plan = await api("/api/remote-publish-plan", {
      method: "POST",
      body: JSON.stringify({ prompt: state.lastPrompt || input.value.trim() })
    });
    const evidence = {
      status: plan.status,
      provider: plan.provider,
      package: plan.package,
      approval: plan.approval,
      policy: plan.policy,
      readiness: plan.readiness,
      commands: plan.commands,
      notes: plan.notes
    };
    appendGateEvidenceCard(evidence, {
      title: "远端发布审批计划已生成",
      kind: "release",
      state: plan.status || "approval_required",
      body: [
        `provider: ${plan.provider || "unknown"}`,
        `commands: ${plan.commands?.length || 0}`,
        `approval: ${plan.approval?.id || ""}`,
        "",
        compactGateEvidence(evidence)
      ].join("\n").slice(0, 12000)
    });
    await refreshHealth();
    setBusy(false, "待审批");
  } catch (error) {
    showToast(error.message);
    appendGateFailureEvidence(error, {
      title: "生成远端发布审批失败",
      kind: "release",
      endpoint: "/api/remote-publish-plan",
      request: { prompt: state.lastPrompt || input.value.trim() }
    });
    setBusy(false, "审批失败");
  }
});

remotePublishPackagesBtn?.addEventListener("click", async () => {
  setBusy(true, "读取发布包");
  try {
    const result = await api("/api/remote-publish-packages?limit=8");
    let detail = null;
    if (result.packages?.[0]?.id) {
      detail = await api(`/api/remote-publish-package?id=${encodeURIComponent(result.packages[0].id)}`).catch(() => null);
    }
    const evidence = {
      summary: result.summary,
      packages: result.packages,
      latest: detail ? {
        id: detail.id,
        policy: detail.policy,
        paths: detail.paths,
        plan: {
          status: detail.plan?.status,
          provider: detail.plan?.provider,
          commands: detail.plan?.commands,
          readiness: detail.plan?.readiness
        },
        prBodyPreview: detail.prBody?.slice(0, 2000),
        reviewSummaryPreview: detail.reviewSummary?.slice(0, 2000)
      } : null,
      policy: result.policy
    };
    appendGateEvidenceCard(evidence, {
      title: "远端发布包索引已读取",
      kind: "release",
      state: `${result.summary?.total || 0} packages`,
      body: compactGateEvidence(evidence)
    });
    setBusy(false, "发布包完成");
  } catch (error) {
    showToast(error.message);
    appendGateFailureEvidence(error, {
      title: "读取远端发布包失败",
      kind: "release",
      endpoint: "/api/remote-publish-packages",
      request: { limit: 8 }
    });
    setBusy(false, "发布包失败");
  }
});

remotePublishPreflightBtn?.addEventListener("click", async () => {
  setBusy(true, "发布预检");
  try {
    const packages = await api("/api/remote-publish-packages?limit=1");
    const id = packages.packages?.[0]?.id || "";
    const result = await api("/api/remote-publish-preflight", {
      method: "POST",
      body: JSON.stringify({ id, limit: 8 })
    });
    const evidence = {
      summary: result.preflight?.summary,
      package: result.preflight?.package,
      approval: result.preflight?.approval,
      cli: result.preflight?.cli,
      git: result.preflight?.git,
      remote: {
        provider: result.preflight?.remote?.provider,
        available: result.preflight?.remote?.available,
        authenticated: result.preflight?.remote?.authenticated,
        reason: result.preflight?.remote?.reason
      },
      commandChecks: result.preflight?.commandChecks,
      blockers: result.preflight?.blockers,
      policy: result.preflight?.policy
    };
    appendGateEvidenceCard(evidence, {
      title: "远端发布预检已生成",
      kind: "release",
      state: result.preflight?.status || "unknown",
      body: compactGateEvidence(evidence)
    });
    setBusy(false, result.preflight?.status === "ready_for_external_execution" ? "预检通过" : "预检待处理");
  } catch (error) {
    showToast(error.message);
    appendGateFailureEvidence(error, {
      title: "远端发布预检失败",
      kind: "release",
      endpoint: "/api/remote-publish-preflight",
      request: { limit: 8 }
    });
    setBusy(false, "预检失败");
  }
});

function buildHandoffPromptContext(handoff = {}) {
  if (!handoff?.id && !handoff?.body) return "";
  const taskLines = (handoff.tasks || []).slice(0, 8).map((task) => `- ${task.status || "unknown"} · ${task.id || ""} · ${task.prompt || ""}`);
  return [
    "请基于这份 PR/交付草稿继续当前编码、调试或交付准备工作。",
    "",
    `草稿 ID：${handoff.id || ""}`,
    `标题：${handoff.title || ""}`,
    handoff.path ? `路径：${handoff.path}` : "",
    handoff.git?.branch ? `分支：${handoff.git.branch}` : "",
    handoff.policy ? `策略：light=${Boolean(handoff.policy.light)} · fullDiff=${Boolean(handoff.policy.includesFullDiff)}` : "",
    "",
    "近期任务：",
    taskLines.length ? taskLines.join("\n") : "- 无",
    "",
    "交付草稿 Markdown：",
    String(handoff.body || "").slice(0, 12000),
    "",
    "要求：先核对当前工作树、diff 和验证状态；如果草稿暴露遗漏、失败检查或交付 blocker，请优先修复；需要改代码时输出最小 diff，并给出或执行安全验证命令。"
  ].filter(Boolean).join("\n");
}

function handoffVerificationCommands(handoff = {}) {
  const commands = [];
  const add = (command, reason = "") => {
    const text = typeof command === "string" ? command : command?.command;
    const normalized = String(text || "").trim();
    if (!normalized || commands.some((item) => item.command === normalized)) return;
    commands.push({
      command: normalized,
      reason: reason || (typeof command === "object" ? command.reason : "") || "交付前复查命令。"
    });
  };
  (handoff.tasks || []).forEach((task) => {
    (task.verificationCommands || []).forEach((command) => add(command, `交付草稿任务复查：${task.id || "task"}`));
    (task.failedCommands || []).forEach((command) => add(command, `交付前优先重跑失败命令：${task.id || "task"}`));
    (task.checks || []).forEach((check) => add(check.command, check.reason || `交付草稿历史检查：${task.id || "task"}`));
  });
  (state.pendingCommands || []).forEach((item) => add(item, item.reason || "当前命令面板里的待复查命令。"));
  [
    { command: "node --check app.js", reason: "交付前复查前端脚本语法。" },
    { command: "node --check server.js", reason: "交付前复查后端脚本语法。" },
    { command: "node server.js --ui-smoke-test", reason: "交付前复查工作台 UI 入口。" },
    { command: "node server.js --api-smoke-section=core", reason: "交付前复查核心 API 能力。" }
  ].forEach((item) => add(item));
  return normalizeCommandItems(commands).slice(0, 12);
}

function stageHandoffVerificationCommands(handoff = {}) {
  const commands = handoffVerificationCommands(handoff);
  if (!commands.length) {
    appendToolCall({
      title: "交付草稿验证命令未生成",
      label: "$",
      state: "跳过",
      body: "这份交付草稿没有可复用的验证命令。"
    });
    showToast("暂无可放入面板的交付验证命令。");
    return [];
  }
  return stageRepairVerificationCommands(commands, {
    title: "交付草稿验证命令",
    successTitle: "交付草稿验证命令已放入面板",
    source: "handoff",
    note: "交付草稿会优先复用历史任务检查、失败命令和当前命令面板，再补充语法/UI/core smoke。"
  });
}

function buildHandoffVerificationPrompt(handoff = {}) {
  const context = buildHandoffPromptContext(handoff);
  if (!context) return "";
  const commands = handoffVerificationCommands(handoff);
  return [
    context,
    "",
    "目标：把这份交付草稿转成可验证的收尾任务。",
    "",
    commands.length ? "建议交付前验证命令：" : "建议交付前验证命令：暂无可复用命令，请先生成验证门禁或运行核心 smoke。",
    ...commands.map((item) => `- ${item.command}${item.reason ? `：${item.reason}` : ""}`),
    "",
    "要求：先确认草稿中的 diff、任务证据和验证状态是否仍匹配当前工作树；如果存在失败检查或遗漏说明，请优先修复；如果没有失败，也请判断这些命令是否足够支撑交付。"
  ].filter(Boolean).join("\n");
}

function appendHandoffVerificationPromptToPrompt(handoff = {}) {
  const prompt = buildHandoffVerificationPrompt(handoff);
  if (!prompt) {
    showToast("暂无可生成验证提示的交付草稿。");
    return "";
  }
  const current = input.value.trim();
  input.value = [current, prompt].filter(Boolean).join("\n\n---\n\n");
  input.focus();
  scheduleReferencePreview({ immediate: true });
  appendToolCall({
    title: "交付草稿验证提示已加入提示词",
    label: "pr",
    state: "ready",
    body: prompt.slice(0, 12000)
  });
  showToast("交付草稿验证提示已加入提示词。");
  return prompt;
}

function appendHandoffEvidenceCard(handoff = {}) {
  appendToolCall({
    title: "PR/交付草稿已生成",
    label: "pr",
    state: "完成",
    body: `path: ${handoff.path || ""}\n\n${String(handoff.body || "").slice(0, 12000)}`
  });
  const context = buildHandoffPromptContext(handoff);
  if (!context) return;
  const actions = document.createElement("div");
  actions.className = "debug-last-failed-actions";
  actions.innerHTML = `<button type="button" data-action="prompt">加入提示词</button><button type="button" data-action="commands">验证命令</button><button type="button" data-action="verification-prompt">验证提示</button><button type="button" data-action="continue">直接继续</button>`;
  actions.querySelector("[data-action='prompt']").addEventListener("click", () => {
    const current = input.value.trim();
    input.value = [current, context].filter(Boolean).join("\n\n---\n\n");
    input.focus();
    scheduleReferencePreview({ immediate: true });
    appendToolCall({
      title: "交付草稿已加入提示词",
      label: "pr",
      state: "ready",
      body: context.slice(0, 12000)
    });
    showToast("交付草稿已加入提示词。");
  });
  actions.querySelector("[data-action='commands']").addEventListener("click", () => {
    stageHandoffVerificationCommands(handoff);
  });
  actions.querySelector("[data-action='verification-prompt']").addEventListener("click", () => {
    appendHandoffVerificationPromptToPrompt(handoff);
  });
  actions.querySelector("[data-action='continue']").addEventListener("click", () => {
    if (state.busy) {
      showToast("代理正在运行，请稍后再继续交付草稿。");
      return;
    }
    const prompt = [
      context,
      "",
      "请现在直接基于这份交付草稿继续推进：优先补齐交付前 blocker、失败验证或遗漏说明，并给出下一轮安全验证命令。"
    ].join("\n");
    input.value = prompt;
    scheduleReferencePreview({ immediate: true });
    appendToolCall({
      title: "已启动交付草稿继续",
      label: "pr",
      state: "running",
      body: prompt.slice(0, 12000)
    });
    showToast("正在基于交付草稿启动继续任务。");
    submitPromptForm();
  });
  log.lastElementChild?.appendChild(actions);
}

handoffBtn?.addEventListener("click", async () => {
  setBusy(true, "生成中");
  try {
    const handoff = await api("/api/handoff", {
      method: "POST",
      body: JSON.stringify({ prompt: state.lastPrompt || input.value.trim() })
    });
    appendHandoffEvidenceCard(handoff);
    setBusy(false, "已生成");
  } catch (error) {
    showToast(error.message);
    appendGateFailureEvidence(error, {
      title: "生成交付草稿失败",
      kind: "pr",
      endpoint: "/api/handoff",
      request: { prompt: state.lastPrompt || input.value.trim() }
    });
    setBusy(false, "生成失败");
  }
});

async function startManagedProcessCommand(command, { clearInput = true, titlePrefix = "" } = {}) {
  const commandText = String(command || "").trim();
  if (!commandText) {
    showToast("请输入要启动的受管进程命令。");
    return null;
  }
  const process = await api("/api/processes", {
    method: "POST",
    body: JSON.stringify({ command: commandText })
  });
  appendToolCall({
    title: process.blocked
      ? `${titlePrefix}进程命令已拒绝：${commandText}`
      : `${titlePrefix}已启动受管进程：${commandText}`,
    label: "proc",
    state: process.status || "unknown",
    body: [
      process.id ? `id: ${process.id}` : "",
      process.pid ? `pid: ${process.pid}` : "",
      process.policy ? `policy: ${process.policy.risk} · ${process.policy.reason}` : "",
      process.probe ? `probe: ${process.probe.status} · ${process.probe.url}` : "",
      process.approval ? `approval: ${process.approval.id}` : "",
      "",
      process.outputTail || "(暂无输出)"
    ].filter((line) => line !== "").join("\n")
  });
  if (!process.blocked && clearInput && processCommandInput) processCommandInput.value = "";
  await refreshHealth();
  return process;
}

async function waitForManagedProcessProbe(process = {}, { attempts = 12, delayMs = 750 } = {}) {
  if (!process?.id) return process;
  let latest = process;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const result = await api(`/api/process-health?id=${encodeURIComponent(process.id)}&limit=20`).catch(() => null);
    latest = result?.rows?.find((item) => item.id === process.id) || latest;
    const url = processProbeUrl(latest);
    if (url) {
      if (browserCheckUrlInput) browserCheckUrlInput.value = url;
      appendToolCall({
        title: `启动页面 URL 已识别：${latest.command || process.command || process.id}`,
        label: "proc",
        state: latest.probe?.status || "ready",
        body: JSON.stringify({
          id: latest.id,
          command: latest.command,
          status: latest.status,
          probe: latest.probe,
          url,
          policy: {
            access: "managed-process-probe",
            startsProcesses: false,
            browserCheckReady: true
          }
        }, null, 2).slice(0, 8000)
      });
      showToast(latest.probe?.ok ? "启动页已就绪，可直接页面调试。" : "已识别启动页 URL，可继续检查。");
      return latest;
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  appendToolCall({
    title: `启动页面 URL 未识别：${process.command || process.id}`,
    label: "proc",
    state: "no-probe",
    body: JSON.stringify({
      id: process.id,
      command: process.command,
      status: process.status,
      probe: process.probe || null
    }, null, 2).slice(0, 4000)
  });
  return latest;
}

async function discoverStartupCommand({ start = false, debug = false } = {}) {
  setBusy(true, debug ? "发现并调试" : start ? "发现并启动" : "发现启动命令");
  try {
    const result = await api("/api/process-startup-commands?limit=8");
    const first = result.commands?.[0] || null;
    if (first?.command && processCommandInput) {
      processCommandInput.value = first.command;
      processCommandInput.focus();
    }
    appendToolCall({
      title: first?.command ? `启动命令已发现：${first.command}` : "启动命令未发现",
      label: "proc",
      state: `${result.commands?.length || 0} commands`,
      body: JSON.stringify({
        runtimeUrl: result.runtimeUrl || null,
        packageManager: result.packageManager,
        scripts: result.scripts,
        commands: result.commands,
        policy: result.policy
      }, null, 2).slice(0, 12000)
    });
    if (start && first?.command) {
      const process = await startManagedProcessCommand(first.command, {
        clearInput: true,
        titlePrefix: debug ? "发现并调试 · " : "发现并启动 · "
      });
      const probedProcess = process?.blocked ? process : await waitForManagedProcessProbe(process);
      if (debug && !process?.blocked && processProbeUrl(probedProcess)) {
        setBusy(false, "启动后调试");
        const debugResult = await runProcessBrowserEvidence(probedProcess, { mode: "debug", title: "发现并调试" });
        appendToolCall({
          title: `发现并调试完成：${first.command}`,
          label: "debug",
          state: debugResult?.ok ? "完成" : "异常",
          body: JSON.stringify({
            command: first.command,
            processId: probedProcess?.id || "",
            url: processProbeUrl(probedProcess),
            debug: debugResult ? {
              ok: debugResult.ok,
              status: debugResult.status,
              finalUrl: debugResult.finalUrl,
              summary: debugResult.summary,
              artifactPath: debugResult.artifactPath
            } : null,
            policy: {
              action: "discover-start-debug",
              startsProcesses: true,
              browserTrace: true,
              localUrlOnly: true
            }
          }, null, 2).slice(0, 8000)
        });
        return { result, process: probedProcess, debug: debugResult };
      }
      if (debug && !process?.blocked) {
        appendToolCall({
          title: `发现并调试未找到页面 URL：${first.command}`,
          label: "debug",
          state: "no-url",
          body: JSON.stringify({
            command: first.command,
            process: probedProcess,
            policy: {
              action: "discover-start-debug",
              startsProcesses: true,
              browserTrace: false,
              reason: "managed process did not expose a probe URL"
            }
          }, null, 2).slice(0, 8000)
        });
      }
      showToast(process?.blocked ? "推荐启动命令已进入审批/拒绝状态。" : "已发现并启动推荐命令。");
      setBusy(false, process?.blocked ? "已拒绝" : debug ? "未识别 URL" : "已启动");
      return { result, process: probedProcess };
    }
    showToast(first?.command ? "已填入推荐启动命令。" : "没有发现可安全启动的命令。");
    setBusy(false, first?.command ? "已发现" : "未发现");
    return { result, process: null };
  } catch (error) {
    showToast(error.message);
    appendProcessFailureEvidence(error, {
      title: debug ? "发现并调试失败" : start ? "发现并启动失败" : "启动命令发现失败",
      action: debug ? "process-discover-start-debug" : start ? "process-discover-and-start" : "process-startup-discovery",
      endpoint: start ? "/api/process-startup-commands -> /api/processes" : "/api/process-startup-commands",
      request: { limit: 8, start, debug },
      item: { command: "process-startup-commands", status: "failed" },
      retry: async () => discoverStartupCommand({ start, debug })
    });
    setBusy(false, debug ? "调试失败" : start ? "启动失败" : "发现失败");
    return null;
  }
}

processForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const command = processCommandInput?.value.trim();
  if (!command) {
    showToast("请输入要启动的受管进程命令。");
    return;
  }
  setBusy(true, "启动进程");
  try {
    const process = await startManagedProcessCommand(command);
    setBusy(false, process?.blocked ? "已拒绝" : "已启动");
  } catch (error) {
    showToast(error.message);
    appendProcessFailureEvidence(error, {
      title: `启动进程失败：${command}`,
      action: "process-start",
      endpoint: "/api/processes",
      request: { command },
      item: { command, status: "failed" },
      retry: async () => startManagedProcessCommand(command)
    });
    setBusy(false, "启动失败");
  }
});

processDiscoverBtn?.addEventListener("click", async () => {
  await discoverStartupCommand({ start: false });
});

processStartDiscoveredBtn?.addEventListener("click", async () => {
  await discoverStartupCommand({ start: true });
});

processStartDebugBtn?.addEventListener("click", async () => {
  await discoverStartupCommand({ start: true, debug: true });
});

processSearchForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const query = processSearchInput?.value.trim();
  if (!query) {
    showToast("请输入进程输出搜索关键词。");
    return;
  }
  setBusy(true, "搜索进程输出");
  try {
    const result = await api(`/api/process-search?q=${encodeURIComponent(query)}`);
    renderProcessSearch(result);
    appendToolCall({
      title: `进程输出搜索：${query}`,
      label: "proc",
      state: `${result.matchCount || 0} matches`,
      body: JSON.stringify(result, null, 2).slice(0, 12000)
    });
    setBusy(false, result.matchCount ? "找到进程输出" : "无匹配输出");
  } catch (error) {
    showToast(error.message);
    appendProcessFailureEvidence(error, {
      title: "进程输出搜索失败",
      action: "process-search",
      endpoint: "/api/process-search",
      request: { q: query },
      item: { command: `search: ${query}`, status: "failed", outputTail: "" },
      retry: async () => {
        const result = await api(`/api/process-search?q=${encodeURIComponent(query)}`);
        renderProcessSearch(result);
        appendToolCall({
          title: `进程输出搜索：${query}`,
          label: "proc",
          state: `${result.matchCount || 0} matches`,
          body: JSON.stringify(result, null, 2).slice(0, 12000)
        });
      }
    });
    setBusy(false, "搜索失败");
  }
});

processHistoryBtn?.addEventListener("click", async () => {
  setBusy(true, "读取进程历史");
  try {
    const result = await api("/api/process-history?limit=20");
    renderProcessHistory(result);
    appendToolCall({
      title: "进程历史已读取",
      label: "hist",
      state: `${result.count || 0} artifacts`,
      body: JSON.stringify({
        generatedAt: result.generatedAt,
        count: result.count,
        policy: result.policy,
        history: result.history?.map((item) => ({
          id: item.id,
          command: item.command,
          status: item.status,
          logPath: item.logPath,
          artifactPath: item.artifactPath,
          outputBytes: item.outputBytes
        }))
      }, null, 2).slice(0, 12000)
    });
    setBusy(false, "历史已读取");
  } catch (error) {
    showToast(error.message);
    appendProcessFailureEvidence(error, {
      title: "读取进程历史失败",
      action: "process-history",
      endpoint: "/api/process-history",
      request: { limit: 20 },
      item: { command: "process-history", status: "failed" },
      retry: async () => {
        const result = await api("/api/process-history?limit=20");
        renderProcessHistory(result);
        appendToolCall({
          title: "进程历史已读取",
          label: "hist",
          state: `${result.count || 0} artifacts`,
          body: JSON.stringify(result, null, 2).slice(0, 12000)
        });
      }
    });
    setBusy(false, "历史失败");
  }
});

processHealthBtn?.addEventListener("click", async () => {
  setBusy(true, "探测进程健康");
  try {
    const result = await api("/api/process-health?limit=20");
    renderProcesses(result.rows || []);
    appendToolCall({
      title: "进程健康探针已读取",
      label: "proc",
      state: `${result.summary?.healthy || 0} healthy`,
      body: JSON.stringify({
        generatedAt: result.generatedAt,
        count: result.count,
        summary: result.summary,
        rules: result.rules,
        policy: result.policy,
        rows: result.rows?.map((item) => ({
          id: item.id,
          command: item.command,
          active: item.active,
          status: item.status,
          health: item.health,
          ok: item.ok,
          probe: item.probe,
          rules: item.rules,
          logPath: item.logPath,
          artifactPath: item.artifactPath,
          outputBytes: item.outputBytes
        }))
      }, null, 2).slice(0, 12000)
    });
    setBusy(false, "健康探针完成");
  } catch (error) {
    showToast(error.message);
    appendProcessFailureEvidence(error, {
      title: "读取进程健康失败",
      action: "process-health",
      endpoint: "/api/process-health",
      request: { limit: 20 },
      item: { command: "process-health", status: "failed" },
      retry: async () => {
        const result = await api("/api/process-health?limit=20");
        renderProcesses(result.rows || []);
        appendToolCall({
          title: "进程健康探针已读取",
          label: "proc",
          state: `${result.summary?.healthy || 0} healthy`,
          body: JSON.stringify(result, null, 2).slice(0, 12000)
        });
      }
    });
    setBusy(false, "健康探针失败");
  }
});

browserCheckForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const targetUrl = browserCheckUrlInput?.value.trim();
  if (!targetUrl) {
    showToast("请输入本地页面 URL。");
    return;
  }
  setBusy(true, "检查页面");
  try {
    const result = await api("/api/browser-check", {
      method: "POST",
      body: JSON.stringify({ url: targetUrl })
    });
    renderBrowserCheck(result);
    appendToolCall({
      title: `页面检查：${targetUrl}`,
      label: "browser",
      state: result.ok ? "通过" : "失败",
      body: JSON.stringify(result, null, 2).slice(0, 12000)
    });
    setBusy(false, result.ok ? "页面正常" : "页面异常");
  } catch (error) {
    showToast(error.message);
    appendBrowserFailureEvidence(error, {
      title: "页面检查失败",
      kind: "browser-check-failure",
      label: "browser",
      url: targetUrl
    });
    setBusy(false, "检查失败");
  }
});

browserBaselineBtn?.addEventListener("click", async () => {
  const targetUrl = browserCheckUrlInput?.value.trim();
  if (!targetUrl) {
    showToast("请输入本地页面 URL。");
    return;
  }
  setBusy(true, "对比基线");
  try {
    const result = await api("/api/browser-baseline", {
      method: "POST",
      body: JSON.stringify({ url: targetUrl })
    });
    renderBrowserBaseline(result);
    appendToolCall({
      title: `页面结构基线：${targetUrl}`,
      label: "visual",
      state: result.status || "unknown",
      body: JSON.stringify(result, null, 2).slice(0, 12000)
    });
    setBusy(false, result.ok ? "基线通过" : "基线变化");
  } catch (error) {
    showToast(error.message);
    appendBrowserFailureEvidence(error, {
      title: "页面基线失败",
      kind: "browser-baseline-failure",
      label: "visual",
      url: targetUrl
    });
    setBusy(false, "基线失败");
  }
});

browserScreenshotBtn?.addEventListener("click", async () => {
  const targetUrl = browserCheckUrlInput?.value.trim();
  const selector = browserSelectorInput?.value.trim();
  if (!targetUrl) {
    showToast("请输入本地页面 URL。");
    return;
  }
  setBusy(true, "生成截图");
  try {
    const result = await api("/api/browser-screenshot", {
      method: "POST",
      body: JSON.stringify({ url: targetUrl, selector })
    });
    renderBrowserScreenshot(result);
    appendToolCall({
      title: `页面截图：${targetUrl}`,
      label: "visual",
      state: result.ok ? "完成" : "失败",
      body: JSON.stringify(result, null, 2).slice(0, 12000)
    });
    setBusy(false, result.ok ? "截图完成" : "截图失败");
  } catch (error) {
    showToast(error.message);
    appendBrowserFailureEvidence(error, {
      title: "页面截图失败",
      kind: "browser-screenshot-failure",
      label: "visual",
      url: targetUrl,
      selector
    });
    setBusy(false, "截图失败");
  }
});

browserAuditBtn?.addEventListener("click", async () => {
  const targetUrl = browserCheckUrlInput?.value.trim();
  if (!targetUrl) {
    showToast("请输入本地页面 URL。");
    return;
  }
  setBusy(true, "审计页面");
  try {
    const result = await api("/api/browser-audit", {
      method: "POST",
      body: JSON.stringify({ url: targetUrl })
    });
    renderBrowserAudit(result);
    appendToolCall({
      title: `页面可访问性审计：${targetUrl}`,
      label: "a11y",
      state: result.audit?.status || "unknown",
      body: JSON.stringify(result, null, 2).slice(0, 12000)
    });
    setBusy(false, result.audit?.status === "pass" ? "审计通过" : "审计完成");
  } catch (error) {
    showToast(error.message);
    appendBrowserFailureEvidence(error, {
      title: "页面可访问性审计失败",
      kind: "browser-audit-failure",
      label: "a11y",
      url: targetUrl
    });
    setBusy(false, "审计失败");
  }
});

browserDomBtn?.addEventListener("click", async () => {
  const targetUrl = browserCheckUrlInput?.value.trim();
  if (!targetUrl) {
    showToast("请输入本地页面 URL。");
    return;
  }
  setBusy(true, "读取 DOM");
  try {
    const result = await api("/api/browser-dom", {
      method: "POST",
      body: JSON.stringify({
        url: targetUrl,
        selectors: ["body", "button", "form", "input", "#promptForm", "#browserCheckForm"]
      })
    });
    renderBrowserDom(result);
    appendToolCall({
      title: `DOM 快照：${targetUrl}`,
      label: "dom",
      state: result.ok ? "完成" : "失败",
      body: JSON.stringify(result, null, 2).slice(0, 12000)
    });
    setBusy(false, result.ok ? "DOM 完成" : "DOM 失败");
  } catch (error) {
    showToast(error.message);
    appendBrowserFailureEvidence(error, {
      title: "DOM 快照失败",
      kind: "browser-dom-failure",
      label: "dom",
      url: targetUrl,
      body: {
        selectors: ["body", "button", "form", "input", "#promptForm", "#browserCheckForm"]
      }
    });
    setBusy(false, "DOM 失败");
  }
});

browserTraceBtn?.addEventListener("click", async () => {
  const targetUrl = browserCheckUrlInput?.value.trim();
  if (!targetUrl) {
    showToast("请输入本地页面 URL。");
    return;
  }
  setBusy(true, "采集 Trace");
  try {
    const result = await api("/api/browser-trace", {
      method: "POST",
      body: JSON.stringify({ url: targetUrl, waitMs: 1500 })
    });
    renderBrowserTrace(result);
    appendToolCall({
      title: `浏览器 Trace：${targetUrl}`,
      label: "trace",
      state: result.ok ? "完成" : "异常",
      body: JSON.stringify(result, null, 2).slice(0, 12000)
    });
    setBusy(false, result.ok ? "Trace 完成" : "Trace 异常");
  } catch (error) {
    showToast(error.message);
    appendBrowserFailureEvidence(error, {
      title: "浏览器 Trace 失败",
      kind: "browser-trace-failure",
      label: "trace",
      url: targetUrl
    });
    setBusy(false, "Trace 失败");
  }
});

browserInteractBtn?.addEventListener("click", async () => {
  const targetUrl = browserCheckUrlInput?.value.trim();
  if (!targetUrl) {
    showToast("请输入本地页面 URL。");
    return;
  }
  setBusy(true, "执行交互");
  try {
    const result = await api("/api/browser-interact", {
      method: "POST",
      body: JSON.stringify({
        url: targetUrl,
        actions: [
          { type: "wait", selector: "body" },
          { type: "navigate", value: `${targetUrl}${targetUrl.includes("?") ? "&" : "?"}browser-interact-nav=1` },
          { type: "waitUrl", value: "browser-interact-nav=1" },
          { type: "waitNetwork" },
          { type: "upload", selector: "#browserSmokeFile", value: "README.md" },
          { type: "hover", selector: "#refreshFilesBtn" },
          { type: "dblclick", selector: "#refreshFilesBtn" },
          { type: "clear", selector: "#browserCheckUrlInput" },
          { type: "type", selector: "#browserCheckUrlInput", value: "browser-interact-smoke" },
          { type: "waitValue", selector: "#browserCheckUrlInput", value: "browser-interact-smoke" },
          { type: "press", selector: "#browserCheckUrlInput", key: "Enter" },
          { type: "check", selector: "#browserSmokeCheck" },
          { type: "uncheck", selector: "#browserSmokeCheck" }
        ],
        selectors: ["body", "button", "#refreshFilesBtn", "#browserCheckForm", "#browserSmokeCheck"]
      })
    });
    renderBrowserInteract(result);
    appendToolCall({
      title: `DOM 交互：${targetUrl}`,
      label: "dom",
      state: result.ok ? "完成" : "失败",
      body: JSON.stringify(result, null, 2).slice(0, 12000)
    });
    setBusy(false, result.ok ? "交互完成" : "交互失败");
  } catch (error) {
    showToast(error.message);
    appendBrowserFailureEvidence(error, {
      title: "DOM 交互失败",
      kind: "browser-interact-failure",
      label: "dom",
      url: targetUrl,
      actions: [
        { type: "wait", selector: "body" },
        { type: "navigate", value: `${targetUrl}${targetUrl.includes("?") ? "&" : "?"}browser-interact-nav=1` },
        { type: "waitUrl", value: "browser-interact-nav=1" },
        { type: "waitNetwork" },
        { type: "upload", selector: "#browserSmokeFile", value: "README.md" },
        { type: "hover", selector: "#refreshFilesBtn" },
        { type: "dblclick", selector: "#refreshFilesBtn" },
        { type: "clear", selector: "#browserCheckUrlInput" },
        { type: "type", selector: "#browserCheckUrlInput", value: "browser-interact-smoke" },
        { type: "waitValue", selector: "#browserCheckUrlInput", value: "browser-interact-smoke" },
        { type: "press", selector: "#browserCheckUrlInput", key: "Enter" },
        { type: "check", selector: "#browserSmokeCheck" },
        { type: "uncheck", selector: "#browserSmokeCheck" }
      ]
    });
    setBusy(false, "交互失败");
  }
});

browserSessionBtn?.addEventListener("click", async () => {
  const targetUrl = browserCheckUrlInput?.value.trim();
  if (!targetUrl) {
    showToast("请输入本地页面 URL。");
    return;
  }
  setBusy(true, "执行会话");
  try {
    const result = await api("/api/browser-session", {
      method: "POST",
      body: JSON.stringify({
        url: targetUrl,
        name: "sidebar browser session",
        steps: [{
          name: "session-smoke",
          actions: [
            { type: "wait", selector: "body" },
            { type: "type", selector: "#browserCheckUrlInput", value: "browser-session-smoke" },
            { type: "upload", selector: "#browserSmokeFile", value: "README.md" }
          ]
        }],
        selectors: ["body", "#browserCheckUrlInput", "[data-forge-upload=\"README.md\"]", "[value=\"browser-session-smoke\"]"]
      })
    });
    renderBrowserSession(result);
    appendToolCall({
      title: `浏览器会话：${targetUrl}`,
      label: "dom",
      state: result.ok ? "完成" : "失败",
      body: JSON.stringify(result, null, 2).slice(0, 12000)
    });
    setBusy(false, result.ok ? "会话完成" : "会话失败");
  } catch (error) {
    showToast(error.message);
    appendBrowserFailureEvidence(error, {
      title: "浏览器会话失败",
      kind: "browser-session-failure",
      label: "dom",
      url: targetUrl,
      actions: [
        { type: "wait", selector: "body" },
        { type: "type", selector: "#browserCheckUrlInput", value: "browser-session-smoke" },
        { type: "upload", selector: "#browserSmokeFile", value: "README.md" }
      ]
    });
    setBusy(false, "会话失败");
  }
});

browserVisualBtn?.addEventListener("click", async () => {
  const targetUrl = browserCheckUrlInput?.value.trim();
  const selector = browserSelectorInput?.value.trim();
  if (!targetUrl) {
    showToast("请输入本地页面 URL。");
    return;
  }
  setBusy(true, "视觉断言");
  try {
    const result = await api("/api/browser-visual", {
      method: "POST",
      body: JSON.stringify({ url: targetUrl, threshold: 0, maxMismatchRatio: 0, selector })
    });
    renderBrowserVisual(result);
    appendToolCall({
      title: `像素级视觉断言：${targetUrl}`,
      label: "visual",
      state: result.ok ? "通过" : "失败",
      body: JSON.stringify(result, null, 2).slice(0, 12000)
    });
    setBusy(false, result.ok ? "视觉通过" : "视觉变化");
  } catch (error) {
    showToast(error.message);
    appendBrowserFailureEvidence(error, {
      title: "视觉断言失败",
      kind: "browser-visual-failure",
      label: "visual",
      url: targetUrl,
      selector
    });
    setBusy(false, "视觉失败");
  }
});

newTaskBtn.addEventListener("click", async () => {
  setBusy(true, "创建会话");
  try {
    await startNewThread();
    setBusy(false, "待命");
  } catch (error) {
    showToast(error.message);
    appendThreadFailureEvidence({
      id: "",
      title: "新会话",
      status: "create_failed",
      messageCount: state.threadMessages?.length || 0
    }, error, {
      title: "创建会话失败",
      action: "thread-create",
      endpoint: "/api/thread",
      request: { title: "新会话", messages: state.threadMessages?.slice(-20) || [] },
      retry: () => startNewThread()
    });
    setBusy(false, "创建失败");
  }
});

replayBtn.addEventListener("click", refreshAll);
attachBtn.addEventListener("click", async () => {
  await refreshFiles();
  showToast("上下文已重新加载。");
});
refreshFilesBtn.addEventListener("click", refreshFiles);

input.addEventListener("keydown", handlePromptInputKeydown);
input.addEventListener("input", resizePromptInput);
resizePromptInput();

refreshAll();
