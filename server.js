import http from "node:http";
import { exec, spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const APP_ROOT = path.dirname(__filename);
const DEFAULT_WORKSPACE = "D:\\cc-picture\\aaa\\coder-workspace";
const INITIAL_WORKSPACE = path.resolve(process.env.FORGE_WORKSPACE || DEFAULT_WORKSPACE);
let currentWorkspace = INITIAL_WORKSPACE;
const PORT = Number(process.env.PORT || 4173);
const DEFAULT_MODEL = "deepseek-v4-pro";
const MODEL_API_URL = process.env.FORGE_MODEL_API_URL || "https://api.deepseek.com/chat/completions";
const MODEL_CANDIDATES = (process.env.FORGE_MODELS || process.env.DEEPSEEK_MODEL || DEFAULT_MODEL)
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);
let modelRuntime = {
  provider: "deepseek-compatible",
  endpoint: MODEL_API_URL,
  candidates: MODEL_CANDIDATES,
  lastModel: "",
  lastFallbacks: [],
  lastError: "",
  lastUsedAt: ""
};

function currentModelName() {
  return modelRuntime.lastModel || MODEL_CANDIDATES[0] || DEFAULT_MODEL;
}
const CONTEXT_LIMIT_BYTES = 220 * 1024;
const MAX_FILE_BYTES = 120 * 1024;
const MAX_AGENT_TURNS = 8;
const CHECKPOINT_DIR = path.join(APP_ROOT, ".forge", "checkpoints");
const TASK_LOG_DIR = path.join(APP_ROOT, ".forge", "tasks");
const WORKTREE_DIR = path.join(APP_ROOT, ".forge", "worktrees");
const QUEUE_DIR = path.join(APP_ROOT, ".forge", "queue");
const HANDOFF_DIR = path.join(APP_ROOT, ".forge", "handoffs");
const REVIEW_DIR = path.join(APP_ROOT, ".forge", "reviews");
const STATE_DIR = path.join(APP_ROOT, ".forge", "state");
const GOAL_STATE_PATH = path.join(STATE_DIR, "goal.json");
const APPROVAL_DIR = path.join(APP_ROOT, ".forge", "approvals");
const EXTENSION_DIR = path.join(APP_ROOT, ".forge", "extensions");
const MCP_DIR = path.join(APP_ROOT, ".forge", "mcp");
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
const CHECK_SCRIPT_NAMES = ["check", "test", "lint", "build"];
const SAFE_COMMAND_PATTERNS = [
  /^npm (?:run )?(?:check|test|lint|build)(?:\s+--\s*[\w:./=-]+)?$/i,
  /^npm test(?:\s+--\s*[\w:./=-]+)?$/i,
  /^pnpm (?:run )?(?:check|test|lint|build)(?:\s+--\s*[\w:./=-]+)?$/i,
  /^yarn (?:run )?(?:check|test|lint|build)(?:\s+[\w:./=-]+)?$/i,
  /^node --check [\w./\\-]+$/i,
  /^node [\w./\\-]+ --smoke-test$/i
];
const PROCESS_COMMAND_PATTERNS = [
  /^npm (?:run )?(?:dev|start|serve|preview)(?:\s+--\s*[\w:./=-]+)?$/i,
  /^pnpm (?:run )?(?:dev|start|serve|preview)(?:\s+[\w:./=-]+)?$/i,
  /^yarn (?:run )?(?:dev|start|serve|preview)(?:\s+[\w:./=-]+)?$/i,
  /^node [\w./\\-]+$/i
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
      access: "metadata-only",
      scope: "currentWorkspace",
      readsContent: false
    },
    gaps: [
      "PDF and Office text extraction",
      "image OCR and vision summaries",
      "audio/video transcription",
      "visual regression screenshots"
    ]
  };
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
  const match = /^(?:npm|pnpm|yarn)\s+(?:run\s+)?(check|test|lint|build)\b/i.exec(text);
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

  const files = await listFiles();
  for (const file of files.slice(0, 40)) {
    if ([".js", ".mjs", ".cjs"].includes(path.extname(file.path).toLowerCase())) {
      add(`node --check ${file.path}`, "JavaScript 语法检查");
    }
  }

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
  return executeCommand(command);
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
    outputTail: entry.output.slice(-12000)
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
    entry.probe = {
      ...entry.probe,
      status: response.ok ? "healthy" : "unhealthy",
      ok: response.ok,
      statusCode: response.status,
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
    probe: inferProcessProbe({ command: policy.command, output: "" }),
    policy,
    child
  };
  const appendOutput = (chunk) => {
    entry.output = `${entry.output}${chunk.toString("utf8")}`.slice(-30000);
    if (!entry.probe) entry.probe = inferProcessProbe(entry);
  };
  child.stdout?.on("data", appendOutput);
  child.stderr?.on("data", appendOutput);
  child.on("close", (code) => {
    entry.status = "exited";
    entry.exitCode = code ?? 0;
    entry.stoppedAt = new Date().toISOString();
  });
  child.on("error", (error) => {
    entry.status = "error";
    entry.exitCode = 1;
    entry.stoppedAt = new Date().toISOString();
    appendOutput(error.message);
  });
  managedProcesses.set(id, entry);
  return summarizeManagedProcess(entry);
}

async function stopManagedProcess(id) {
  if (!/^[\w.-]+$/.test(String(id || ""))) throw new Error("process id 非法。");
  const entry = managedProcesses.get(id);
  if (!entry) throw new Error("未找到受管进程。");
  if (entry.workspace !== currentWorkspace) {
    throw new Error("该受管进程不属于当前工作目录。");
  }
  if (entry.status === "running") {
    entry.status = "stopping";
    entry.stoppedAt = new Date().toISOString();
    if (process.platform === "win32" && entry.child?.pid) {
      await new Promise((resolve) => {
        exec(`taskkill /PID ${entry.child.pid} /T /F`, { windowsHide: true }, () => resolve());
      });
    } else {
      try {
        process.kill(-entry.child.pid, "SIGTERM");
      } catch {
        entry.child.kill("SIGTERM");
      }
    }
    await waitForProcessExit(entry);
  }
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
        output: [stdout, stderr].filter(Boolean).join("\n").trim()
      });
    });
  });
}

async function getGitSummary() {
  const inside = await runLocalCommand("git rev-parse --is-inside-work-tree", { timeout: 5000 });
  if (!inside.ok || inside.output.split(/\r?\n/)[0] !== "true") {
    return { available: false, branch: "", root: "", status: [], changedFiles: [] };
  }

  const branchResult = await runLocalCommand("git branch --show-current", { timeout: 5000 });
  const rootResult = await runLocalCommand("git rev-parse --show-toplevel", { timeout: 5000 });
  const statusResult = await runLocalCommand("git status --short", { timeout: 5000 });

  const status = statusResult.output ? statusResult.output.split(/\r?\n/).slice(0, 80) : [];
  return {
    available: true,
    branch: branchResult.output,
    root: rootResult.output,
    status,
    changedFiles: status.map((line) => line.slice(3).trim()).filter(Boolean)
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
  return task;
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
  return state;
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
      checksOk: Boolean(task.checksOk)
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

async function enqueueTask(prompt = "") {
  const text = String(prompt || "").trim();
  if (!text) throw new Error("缺少可入队的任务描述。");
  await fs.mkdir(QUEUE_DIR, { recursive: true });
  const id = new Date().toISOString().replace(/[:.]/g, "-");
  const item = {
    id,
    prompt: text,
    workspace: currentWorkspace,
    status: "queued",
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
      createdAt: item.createdAt || ""
    });
  }
  return items.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt))).slice(0, limit);
}

async function updateQueuedTask(id, status) {
  if (!/^[\w.-]+$/.test(String(id || ""))) throw new Error("queue id 非法。");
  const allowed = new Set(["queued", "active", "done", "skipped"]);
  if (!allowed.has(status)) throw new Error("queue status 非法。");
  const full = path.join(QUEUE_DIR, `${id}.json`);
  const item = JSON.parse(await fs.readFile(full, "utf8"));
  if (item.workspace !== currentWorkspace) {
    throw new Error("该队列任务不属于当前工作目录。");
  }
  item.status = status;
  item.updatedAt = new Date().toISOString();
  await fs.writeFile(full, JSON.stringify(item, null, 2), "utf8");
  return item;
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

async function readApprovalRequest(id) {
  if (!/^[\w.-]+$/.test(String(id || ""))) throw new Error("approval id 非法。");
  const approval = JSON.parse(await fs.readFile(path.join(APPROVAL_DIR, `${id}.json`), "utf8"));
  if (approval.workspace !== currentWorkspace) {
    throw new Error("该审批请求不属于当前工作目录。");
  }
  return approval;
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

async function getCurrentDiff() {
  const git = await getGitSummary();
  if (!git.available) {
    return { available: false, diff: "", stat: "", git };
  }
  const diff = await runLocalCommand("git diff -- .", {
    timeout: 10000,
    maxBuffer: 1024 * 1024
  });
  const stat = await runLocalCommand("git diff --stat -- .", {
    timeout: 10000,
    maxBuffer: 256 * 1024
  });
  return {
    available: true,
    diff: diff.output.slice(0, 120000),
    stat: stat.output,
    git
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

async function createHandoffDraft(prompt = "") {
  await fs.mkdir(HANDOFF_DIR, { recursive: true });
  const evidence = await getCurrentDiff();
  const git = evidence.git || await getGitSummary();
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
    evidence.diff || "(no git diff available)",
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
    evidence
  };
}

async function buildCapabilityAudit() {
  const git = await getGitSummary();
  const tasks = await listTaskLogs(5);
  const queue = await listQueuedTasks(5);
  const reviews = await listReviewArtifacts(5);
  const approvals = await listApprovalRequests(5);
  const extensions = await listExtensions();
  const mcp = await discoverMcpServers();
  const assets = await buildAssetCatalog();
  const goal = await readGoalState();
  const capabilities = [
    {
      area: "上下文索引",
      status: "implemented",
      evidence: ["repo_map", "read_file_range", "search_files"],
      next: "后续可接入 AST/LSP 级语义索引。"
    },
    {
      area: "审批写入与回滚",
      status: "implemented",
      evidence: ["/api/apply", "/api/rollback", ".forge/checkpoints"],
      next: "可继续增强冲突处理和部分应用。"
    },
    {
      area: "验证与修复闭环",
      status: "implemented",
      evidence: ["discoverCheckCommands", "runCheckCommands", "generateRepairDiff"],
      next: "可继续接入 CI 状态和浏览器 E2E。"
    },
    {
      area: "代码审查证据",
      status: "implemented",
      evidence: ["/api/review", "/api/reviews", ".forge/reviews"],
      next: "可继续升级为行级评论和 PR review 输出。"
    },
    {
      area: "Git 隔离",
      status: git.available ? "implemented" : "partial",
      evidence: ["/api/worktree", git.available ? git.branch || "git repo" : "当前工作区未检测到 Git"],
      next: "可继续接入远端 PR 创建和 CI 检查。"
    },
    {
      area: "任务队列",
      status: "implemented",
      evidence: ["/api/queue", `${queue.length} 个当前队列项`],
      next: "可继续支持优先级、自动续跑和并发隔离。"
    },
    {
      area: "可恢复状态",
      status: "implemented",
      evidence: [".forge/state/goal.json", goal.phase || "idle"],
      next: "可继续增加上下文压缩和跨会话摘要。"
    },
    {
      area: "长任务管理",
      status: "implemented",
      evidence: ["/api/processes", `${(await listManagedProcesses()).length} 个受管进程`],
      next: "可继续增加日志搜索和更丰富的健康探针。"
    },
    {
      area: "交付草稿",
      status: "implemented",
      evidence: ["/api/handoff", ".forge/handoffs"],
      next: "可继续接入真实 PR 创建、推送和评论同步。"
    },
    {
      area: "权限与命令策略",
      status: approvals.length ? "partial" : "implemented",
      evidence: ["evaluateCommandPolicy", "evaluateProcessPolicy", ".forge/approvals", `${approvals.length} 个近期审批请求`],
      next: "仍缺完整沙箱和真实升级审批执行；当前已记录被拒绝动作的审计证据。"
    },
    {
      area: "工具生态",
      status: "partial",
      evidence: [`内置工具 ${getAgentTools().length} 个`, `本地扩展 ${extensions.summary.total} 个`, `MCP server ${mcp.summary.total} 个`, "/api/tools", "/api/extensions", "/api/mcp"],
      next: "已暴露本地工具目录、扩展注册表和 MCP server 发现；继续补浏览器和多模态文档工具。"
    },
    {
      area: "外部工具与浏览器自动化",
      status: "partial",
      evidence: ["/api/mcp", "未接入 browser automation", "未接入多模态文档/图片工具"],
      next: "下一步接入浏览器自动化和多模态文件处理。"
    },
    {
      area: "多模态与浏览器执行",
      status: "partial",
      evidence: [`资产 ${assets.summary.total} 个`, "/api/assets", "未接入 browser automation", "未接入视觉回归验证"],
      next: "已补工作区资产索引；继续补浏览器控制、页面截图验证和文档/图片内容解析。"
    },
    {
      area: "浏览器自动化与视觉回归",
      status: "missing",
      evidence: ["未接入 browser automation", "未接入页面截图验证", "未接入视觉回归断言"],
      next: "补本地浏览器控制、截图采样和 UI 视觉 smoke。"
    },
    {
      area: "模型运行层",
      status: modelRuntime.candidates.length > 1 ? "implemented" : "partial",
      evidence: [
        `候选模型：${modelRuntime.candidates.join(", ")}`,
        modelRuntime.lastModel ? `最近使用：${modelRuntime.lastModel}` : "尚未发起模型请求"
      ],
      next: modelRuntime.candidates.length > 1
        ? "可继续增加流式输出、成本/延迟策略和供应商级路由。"
        : "可通过 FORGE_MODELS 配置多模型 fallback，后续再增加流式输出和成本/延迟策略。"
    }
  ];
  const summary = capabilities.reduce((acc, item) => {
    acc[item.status] = (acc[item.status] || 0) + 1;
    return acc;
  }, {});
  return {
    generatedAt: new Date().toISOString(),
    workspace: currentWorkspace,
    summary,
    capabilities,
    recentEvidence: { tasks, reviews, approvals, extensions: extensions.summary, mcp: mcp.summary, assets: assets.summary, goal }
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

function buildToolCatalog() {
  const tools = getAgentTools().map((tool) => ({
    name: tool.function.name,
    description: tool.function.description,
    parameters: tool.function.parameters,
    policy: {
      access: "read-only",
      scope: "currentWorkspace",
      source: "builtin"
    }
  }));
  return {
    generatedAt: new Date().toISOString(),
    workspace: currentWorkspace,
    summary: {
      total: tools.length,
      builtin: tools.length,
      external: 0
    },
    tools,
    gaps: [
      "MCP server discovery",
      "browser automation",
      "plugin/skill packages",
      "multimodal document/image tools"
    ]
  };
}

function parseExtensionManifest(raw, source, type) {
  const manifest = typeof raw === "string" ? JSON.parse(raw) : raw;
  const name = String(manifest.name || path.basename(source, path.extname(source))).trim();
  if (!name) throw new Error("extension manifest missing name");
  return {
    name,
    type: manifest.type || type,
    version: manifest.version || "",
    description: manifest.description || "",
    entry: manifest.entry || "",
    capabilities: Array.isArray(manifest.capabilities) ? manifest.capabilities : [],
    tools: Array.isArray(manifest.tools) ? manifest.tools : [],
    policy: {
      access: manifest.policy?.access || "declared",
      source: "local-extension",
      scope: manifest.policy?.scope || "currentWorkspace",
      requiresApproval: manifest.policy?.requiresApproval !== false
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
    return acc;
  }, { total: 0, skill: 0, plugin: 0 });
  return {
    generatedAt: new Date().toISOString(),
    workspace: currentWorkspace,
    root: toPosix(path.relative(APP_ROOT, EXTENSION_DIR)),
    summary,
    extensions,
    errors,
    gaps: [
      "MCP server discovery",
      "browser automation",
      "remote extension marketplace",
      "multimodal document/image tools"
    ]
  };
}

function normalizeMcpServer(name, config = {}, source) {
  const command = typeof config.command === "string" ? config.command : "";
  const args = Array.isArray(config.args) ? config.args.map(String) : [];
  const url = typeof config.url === "string" ? config.url : "";
  const transport = config.transport || (url ? "http" : "stdio");
  const env = config.env && typeof config.env === "object" ? Object.keys(config.env).sort() : [];
  return {
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
}

async function readMcpConfigFile(filePath, source) {
  const raw = await fs.readFile(filePath, "utf8");
  const parsed = JSON.parse(raw);
  const candidates = parsed.mcpServers || parsed.servers || parsed;
  if (!candidates || typeof candidates !== "object" || Array.isArray(candidates)) return [];
  return Object.entries(candidates)
    .filter(([, config]) => config && typeof config === "object")
    .map(([name, config]) => normalizeMcpServer(name, config, source));
}

async function discoverMcpServers() {
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
  const summary = servers.reduce((acc, server) => {
    acc.total += 1;
    acc[server.transport] = (acc[server.transport] || 0) + 1;
    if (server.disabled) acc.disabled += 1;
    return acc;
  }, { total: 0, stdio: 0, http: 0, disabled: 0 });
  return {
    generatedAt: new Date().toISOString(),
    workspace: currentWorkspace,
    sources: sources.map((filePath) => toPosix(path.relative(APP_ROOT, filePath))),
    summary,
    servers,
    errors,
    gaps: [
      "runtime MCP connection handshake",
      "resource and tool listing",
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

async function callDeepSeekMessages(messages, tools) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new Error("缺少 DEEPSEEK_API_KEY。请先在环境变量中配置 DeepSeek API Key。");
  }
  const fallbacks = [];
  let lastError = "";
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
          messages
        })
      });
      if (!response.ok) {
        const details = await response.text();
        throw new Error(`${response.status} ${details.slice(0, 500)}`);
      }
      const data = await response.json();
      const message = data.choices?.[0]?.message;
      if (!message) throw new Error("DeepSeek 没有返回消息。");
      modelRuntime = {
        ...modelRuntime,
        candidates: MODEL_CANDIDATES,
        lastModel: model,
        lastFallbacks: fallbacks,
        lastError: "",
        lastUsedAt: new Date().toISOString()
      };
      return { ...message, _model: model, _fallbacks: fallbacks };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      fallbacks.push({ model, error: lastError });
    }
  }
  modelRuntime = {
    ...modelRuntime,
    candidates: MODEL_CANDIDATES,
    lastFallbacks: fallbacks,
    lastError,
    lastUsedAt: new Date().toISOString()
  };
  throw new Error(`模型请求失败：${fallbacks.map((item) => `${item.model}: ${item.error}`).join(" | ")}`);
}

async function generateRepairDiff({ prompt, applied, checks }) {
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

async function repairFromFailedCommand({ prompt = "", command = "", result = null }) {
  if (!result || result.exitCode === 0) {
    return { reply: "命令通过，无需修复。", plan: [], diff: "", review: [], commands: [], patches: [] };
  }
  return await generateRepairDiff({
    prompt,
    applied: [],
    checks: [{
      command,
      reason: "手动运行检查失败",
      exitCode: result.exitCode,
      output: result.output || ""
    }]
  });
}

async function runAgentLoop(prompt) {
  const files = await listFiles();
  const toolLog = [];
  const tools = getAgentTools();

  const messages = [
    {
      role: "system",
      content: [
        "你是 Forge Code 的编码代理。你必须先通过工具读取/搜索相关文件，再给出可审阅修改。",
        "你只能使用工具读取上下文，不能猜测文件内容。优先用 repo_map 建立仓库地图，再用 search_files/read_file_range/read_file 精确读取。",
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
      content: `用户需求：${prompt}\n\n工作区文件摘要：\n${files.slice(0, 180).map((file) => `${file.path} (${file.size} bytes)`).join("\n")}`
    }
  ];

  for (let turn = 0; turn < MAX_AGENT_TURNS; turn += 1) {
    const message = await callDeepSeekMessages(messages, tools);
    messages.push(message);
    const toolCalls = message.tool_calls || [];
    if (!toolCalls.length) {
      let finalPayload;
      try {
        finalPayload = normalizeAgentPayload(message.content);
      } catch (error) {
        finalPayload = await forceFinalJson(messages, error instanceof Error ? error.message : String(error));
      }
      const patches = finalPayload.diff ? await previewUnifiedDiff(finalPayload.diff) : [];
      const checks = await discoverCheckCommands(finalPayload.commands);
      return { ...finalPayload, patches, commands: checks, toolLog };
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
  const finalMessage = await callDeepSeekMessages(messages, null);
  const finalPayload = normalizeAgentPayload(finalMessage.content);
  const patches = finalPayload.diff ? await previewUnifiedDiff(finalPayload.diff) : [];
  const checks = await discoverCheckCommands(finalPayload.commands);
  return { ...finalPayload, patches, commands: checks, toolLog };
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
      const capabilities = await buildCapabilityAudit();
      return send(res, 200, {
        ok: true,
        model: modelRuntime.lastModel || MODEL_CANDIDATES[0] || DEFAULT_MODEL,
        modelRuntime,
        hasApiKey: Boolean(process.env.DEEPSEEK_API_KEY),
        ...getWorkspaceInfo(),
        checkpoints: await listCheckpoints(),
        git: await getGitSummary(),
        tasks: await listTaskLogs(),
        queue: await listQueuedTasks(),
        reviews: await listReviewArtifacts(),
        approvals: await listApprovalRequests(),
        processes: await listManagedProcesses({ probe: true }),
        tools: buildToolCatalog(),
        extensions: await listExtensions(),
        mcp: await discoverMcpServers(),
        assets: await buildAssetCatalog(),
        goal: await readGoalState(),
        capabilities
      });
    }

    if (req.method === "GET" && url.pathname === "/api/capabilities") {
      return send(res, 200, await buildCapabilityAudit());
    }

    if (req.method === "GET" && url.pathname === "/api/tools") {
      return send(res, 200, buildToolCatalog());
    }

    if (req.method === "GET" && url.pathname === "/api/extensions") {
      return send(res, 200, await listExtensions());
    }

    if (req.method === "GET" && url.pathname === "/api/mcp") {
      return send(res, 200, await discoverMcpServers());
    }

    if (req.method === "GET" && url.pathname === "/api/assets") {
      return send(res, 200, await buildAssetCatalog());
    }

    if (req.method === "GET" && url.pathname === "/api/approvals") {
      return send(res, 200, { approvals: await listApprovalRequests() });
    }

    if (req.method === "GET" && url.pathname === "/api/approval") {
      return send(res, 200, await readApprovalRequest(url.searchParams.get("id") || ""));
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
      const { prompt = "" } = await readJson(req);
      const item = await enqueueTask(prompt);
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
      const { id = "", status = "" } = await readJson(req);
      const item = await updateQueuedTask(id, status);
      await writeGoalState({
        objective: item.prompt || "",
        phase: status === "done" ? "completed" : status,
        status,
        lastPrompt: item.prompt || "",
        nextStep: status === "active"
          ? "运行代理处理当前激活任务。"
          : status === "done"
            ? "任务已完成，可查看任务日志或生成交付草稿。"
            : "继续处理队列任务。"
      });
      return send(res, 200, item);
    }

    if (req.method === "GET" && url.pathname === "/api/queue") {
      return send(res, 200, { queue: await listQueuedTasks() });
    }

    if (req.method === "GET" && url.pathname === "/api/processes") {
      return send(res, 200, { processes: await listManagedProcesses({ probe: true }) });
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
      const content = await readWorkspaceFile(relativePath);
      return send(res, 200, { path: relativePath, content });
    }

    if (req.method === "GET" && url.pathname === "/api/checkpoints") {
      return send(res, 200, { checkpoints: await listCheckpoints() });
    }

    if (req.method === "POST" && url.pathname === "/api/agent") {
      const { prompt } = await readJson(req);
      if (!prompt || typeof prompt !== "string") throw new Error("缺少 prompt。");
      await writeGoalState({
        objective: prompt,
        phase: "agent_running",
        status: "running",
        lastPrompt: prompt,
        nextStep: "等待代理生成计划、diff、审查发现和建议命令。"
      });
      const result = await runAgentLoop(prompt);
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
      return send(res, 200, {
        ...result,
        model: currentModelName(),
        modelRuntime: {
          ...modelRuntime,
          lastFallbacks: modelRuntime.lastFallbacks.slice(-3)
        }
      });
    }

    if (req.method === "POST" && url.pathname === "/api/apply") {
      const { diff, prompt = "", commands = [] } = await readJson(req);
      if (!diff || typeof diff !== "string") throw new Error("缺少 diff。");
      const parsed = parseUnifiedDiff(diff);
      const patches = parsed.map((patch) => ({ path: patch.path }));
      const checkpoint = await createCheckpoint(patches);
      const applied = [];
      for (const filePatch of parsed) {
        const full = safePath(filePatch.path);
        const before = await fs.readFile(full, "utf8").catch(() => "");
        const after = applyUnifiedDiffToContent(before, filePatch);
        await fs.mkdir(path.dirname(full), { recursive: true });
        await fs.writeFile(full, after, "utf8");
        applied.push({ path: filePatch.path, diff: renderSingleFileDiff(filePatch) });
      }
      const checkCommands = await discoverCheckCommands(commands);
      const verification = await runCheckCommands(checkCommands);
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
      const git = await getGitSummary();
      const status = verification.skipped
        ? "applied_unverified"
        : verification.ok
          ? "verified"
          : repair?.diff
            ? "repair_suggested"
            : "failed";
      const task = await writeTaskLog({
        prompt,
        status,
        checkpointId: checkpoint.id,
        changedFiles: applied.map((item) => item.path),
        checksOk: verification.ok && !verification.skipped,
        checks: verification.checks,
        repairDiff: repair?.diff || "",
        repairReview: repair?.review || [],
        repairError,
        git
      });
      await writeGoalState({
        objective: prompt,
        phase: status,
        status,
        lastPrompt: prompt,
        lastTaskId: task.id,
        lastVerification: {
          ok: verification.ok,
          skipped: verification.skipped,
          checkCount: verification.checks.length
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
        nextStep: status === "verified"
          ? "生成交付草稿或继续下一项任务。"
          : status === "repair_suggested"
            ? "审查修复 diff 并再次批准写入。"
            : status === "applied_unverified"
              ? "手动运行建议命令或补充检查命令。"
              : "查看失败输出并生成修复。"
      });
      return send(res, 200, { applied, checkpoint, verification, repair, repairError, git, task });
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
      const { prompt = "", command = "", result = null } = await readJson(req);
      if (!command || typeof command !== "string") throw new Error("缺少 command。");
      return send(res, 200, await repairFromFailedCommand({ prompt, command, result }));
    }

    if (req.method === "GET" && url.pathname === "/api/diff") {
      return send(res, 200, await getCurrentDiff());
    }

    if (req.method === "POST" && url.pathname === "/api/review") {
      const { prompt = "" } = await readJson(req);
      return send(res, 200, await reviewCurrentChanges(prompt));
    }

    if (req.method === "POST" && url.pathname === "/api/handoff") {
      const { prompt = "" } = await readJson(req);
      return send(res, 200, await createHandoffDraft(prompt));
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

    sendError(res, 404, "API 不存在。");
  } catch (error) {
    sendError(res, 400, error);
  }
}

const server = http.createServer((req, res) => {
  if (req.url?.startsWith("/api/")) {
    handleApi(req, res);
    return;
  }
  handleStatic(req, res);
});

async function runSmokeTest() {
  const context = await collectContext();
  const repoMap = await buildRepoMap();
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
    git: await getGitSummary(),
    tasks: await listTaskLogs(),
    queue: await listQueuedTasks()
  }));
}

async function requestJson(baseUrl, route, options = {}) {
  const response = await fetch(`${baseUrl}${route}`, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`${route} failed: ${response.status} ${data.error || ""}`);
  }
  return data;
}

function assertSmoke(condition, message) {
  if (!condition) throw new Error(message);
}

function assertIncludes(source, needle, message) {
  assertSmoke(source.includes(needle), message || `missing ${needle}`);
}

async function runUiSmokeTest() {
  const [html, app, css] = await Promise.all([
    fs.readFile(path.join(APP_ROOT, "index.html"), "utf8"),
    fs.readFile(path.join(APP_ROOT, "app.js"), "utf8"),
    fs.readFile(path.join(APP_ROOT, "styles.css"), "utf8")
  ]);
  const htmlIds = [
    "promptForm",
    "approveBtn",
    "reviewBtn",
    "goalState",
    "capabilityList",
    "toolCatalogList",
    "extensionCatalogList",
    "mcpCatalogList",
    "assetCatalogList",
    "approvalList",
    "queueList",
    "processForm",
    "processList"
  ];
  for (const id of htmlIds) {
    assertIncludes(html, `id="${id}"`, `index.html missing #${id}`);
    assertIncludes(app, `#${id}`, `app.js missing #${id} binding`);
  }
  const appHooks = [
    "function renderCapabilities",
    "function renderToolCatalog",
    "function renderExtensionCatalog",
    "function renderMcpCatalog",
    "function renderAssetCatalog",
    "function renderGoal",
    "function restorePendingProposal",
    "function renderApprovals",
    "function renderProcesses",
    "/api/health",
    "/api/tools",
    "/api/extensions",
    "/api/mcp",
    "/api/assets",
    "/api/approval?id=",
    "/api/processes"
  ];
  for (const hook of appHooks) {
    assertIncludes(app, hook, `app.js missing ${hook}`);
  }
  const cssClasses = [
    ".capability-list",
    ".capability-row",
    ".goal-state",
    ".process-form",
    ".queue-row"
  ];
  for (const className of cssClasses) {
    assertIncludes(css, className, `styles.css missing ${className}`);
  }
  console.log(JSON.stringify({
    ok: true,
    uiSmoke: true,
    checked: {
      htmlIds,
      appHooks,
      cssClasses
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

async function runApiSmokeTest() {
  const originalWorkspace = currentWorkspace;
  currentWorkspace = APP_ROOT;
  const originalGoalState = await fs.readFile(GOAL_STATE_PATH, "utf8").catch(() => null);
  const originalApprovals = await snapshotApprovalDir();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const cleanup = {
    queuePath: "",
    handoffPath: "",
    processFixturePath: "",
    extensionFixtureDir: "",
    mcpFixturePath: "",
    assetFixturePath: "",
    processId: ""
  };
  try {
    const health = await requestJson(baseUrl, "/api/health");
    assertSmoke(health.ok === true, "health did not return ok=true");
    assertSmoke(Array.isArray(health.queue), "health did not include queue");
    assertSmoke(Array.isArray(health.reviews), "health did not include review artifacts");
    assertSmoke(Array.isArray(health.approvals), "health did not include approval requests");
    assertSmoke(Array.isArray(health.processes), "health did not include managed processes");
    assertSmoke(health.goal && typeof health.goal === "object", "health did not include resumable goal state");
    assertSmoke(Array.isArray(health.capabilities?.capabilities), "health did not include capability audit");
    assertSmoke(Array.isArray(health.modelRuntime?.candidates), "health did not include model runtime candidates");
    assertSmoke(Array.isArray(health.tools?.tools), "health did not include tool catalog");
    assertSmoke(Array.isArray(health.extensions?.extensions), "health did not include extension catalog");
    assertSmoke(Array.isArray(health.mcp?.servers), "health did not include MCP catalog");
    assertSmoke(Array.isArray(health.assets?.assets), "health did not include asset catalog");

    const files = await requestJson(baseUrl, "/api/files");
    assertSmoke(Array.isArray(files.files), "files did not include file list");
    assertSmoke(files.repoMap && typeof files.repoMap === "object", "files did not include repoMap");

    const capabilities = await requestJson(baseUrl, "/api/capabilities");
    assertSmoke(capabilities.capabilities.some((item) => item.area === "可恢复状态"), "capabilities endpoint missing resumable state");
    assertSmoke(capabilities.capabilities.some((item) => item.area === "模型运行层"), "capabilities endpoint missing model runtime layer");
    assertSmoke(capabilities.capabilities.some((item) => item.status === "missing"), "capabilities endpoint should expose remaining gaps");

    const tools = await requestJson(baseUrl, "/api/tools");
    assertSmoke(tools.tools.some((item) => item.name === "repo_map"), "tools endpoint missing repo_map");
    assertSmoke(tools.tools.every((item) => item.policy?.access === "read-only"), "tools endpoint missing read-only policy");

    cleanup.extensionFixtureDir = path.join(EXTENSION_DIR, "skills", "api-smoke-skill");
    await fs.mkdir(cleanup.extensionFixtureDir, { recursive: true });
    await fs.writeFile(path.join(cleanup.extensionFixtureDir, "manifest.json"), JSON.stringify({
      name: "api-smoke-skill",
      type: "skill",
      version: "0.0.0",
      description: "API smoke extension fixture",
      capabilities: ["smoke-test"],
      tools: [{ name: "smoke_probe", description: "Fixture tool declaration" }],
      policy: { access: "read-only", scope: "currentWorkspace", requiresApproval: true }
    }, null, 2));
    const extensions = await requestJson(baseUrl, "/api/extensions");
    assertSmoke(extensions.extensions.some((item) => item.name === "api-smoke-skill"), "extensions endpoint missing fixture skill");
    assertSmoke(extensions.summary.skill >= 1, "extensions endpoint missing skill summary");

    cleanup.mcpFixturePath = path.join(MCP_DIR, "servers.json");
    await fs.mkdir(MCP_DIR, { recursive: true });
    const originalMcpFixture = await fs.readFile(cleanup.mcpFixturePath, "utf8").catch(() => null);
    if (originalMcpFixture !== null) {
      cleanup.mcpFixturePath = "";
      throw new Error("api smoke refused to overwrite existing MCP fixture");
    }
    await fs.writeFile(path.join(MCP_DIR, "servers.json"), JSON.stringify({
      mcpServers: {
        "api-smoke-mcp": {
          command: "node",
          args: ["server.js", "--smoke-test"],
          env: { API_SMOKE_MCP: "1" }
        }
      }
    }, null, 2));
    const mcp = await requestJson(baseUrl, "/api/mcp");
    assertSmoke(mcp.servers.some((item) => item.name === "api-smoke-mcp"), "MCP endpoint missing fixture server");
    assertSmoke(mcp.summary.stdio >= 1, "MCP endpoint missing stdio summary");

    cleanup.assetFixturePath = path.join(currentWorkspace, `.forge-asset-smoke-${Date.now()}.png`);
    await fs.writeFile(cleanup.assetFixturePath, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    const assets = await requestJson(baseUrl, "/api/assets");
    const assetFixtureName = toPosix(path.relative(currentWorkspace, cleanup.assetFixturePath));
    assertSmoke(assets.assets.some((item) => item.path === assetFixtureName && item.type === "image"), "assets endpoint missing image fixture");
    assertSmoke(assets.policy?.access === "metadata-only", "assets endpoint missing metadata-only policy");

    const queued = await requestJson(baseUrl, "/api/queue", {
      method: "POST",
      body: JSON.stringify({ prompt: "api smoke queued task" })
    });
    assertSmoke(queued.id && queued.status === "queued", "queue create failed");
    cleanup.queuePath = path.join(QUEUE_DIR, `${queued.id}.json`);

    const active = await requestJson(baseUrl, "/api/queue", {
      method: "PATCH",
      body: JSON.stringify({ id: queued.id, status: "active" })
    });
    assertSmoke(active.status === "active", "queue activate failed");

    const queue = await requestJson(baseUrl, "/api/queue");
    assertSmoke(queue.queue.some((item) => item.id === queued.id), "queue list missing created item");

    const queuedHealth = await requestJson(baseUrl, "/api/health");
    assertSmoke(queuedHealth.goal?.status === "active", "queue activation did not update goal state");

    const reviews = await requestJson(baseUrl, "/api/reviews");
    assertSmoke(Array.isArray(reviews.reviews), "reviews endpoint did not include artifact list");

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

    cleanup.processFixturePath = path.join(currentWorkspace, ".forge-process-smoke.js");
    await fs.writeFile(cleanup.processFixturePath, [
      "import http from 'node:http';",
      "const server = http.createServer((req, res) => res.end('forge process smoke'));",
      "server.listen(0, '127.0.0.1', () => {",
      "  const { port } = server.address();",
      "  console.log(`http://127.0.0.1:${port}`);",
      "  setTimeout(() => server.close(() => process.exit(0)), 1500);",
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
    for (let attempt = 0; attempt < 12; attempt += 1) {
      await sleep(250);
      const runningProcesses = await requestJson(baseUrl, "/api/processes");
      runningProcess = runningProcesses.processes.find((item) => item.id === startedProcess.id);
      if (runningProcess?.probe?.status === "healthy") break;
    }
    assertSmoke(runningProcess, "started process missing from process list");
    assertSmoke(runningProcess.probe?.status === "healthy", "managed process probe did not become healthy");

    const processEntry = managedProcesses.get(startedProcess.id);
    if (processEntry) await waitForProcessExit(processEntry);
    const exitedProcesses = await requestJson(baseUrl, "/api/processes");
    const exitedProcess = exitedProcesses.processes.find((item) => item.id === startedProcess.id);
    assertSmoke(exitedProcess && exitedProcess.status === "exited", "managed process did not record exit");

    const diff = await requestJson(baseUrl, "/api/diff");
    assertSmoke(typeof diff.available === "boolean", "diff endpoint missing availability flag");

    const handoff = await requestJson(baseUrl, "/api/handoff", {
      method: "POST",
      body: JSON.stringify({ prompt: "api smoke handoff" })
    });
    assertSmoke(handoff.id && handoff.body.includes("## Summary"), "handoff draft failed");
    cleanup.handoffPath = handoff.path;

    console.log(JSON.stringify({
      ok: true,
      apiSmoke: true,
      checked: ["health", "files", "capabilities", "tools", "extensions", "mcp", "assets", "model-runtime", "queue", "goal-state", "reviews", "approvals", "command-policy", "processes", "process-lifecycle", "diff", "handoff"],
      queueId: queued.id,
      handoffId: handoff.id
    }));
  } finally {
    if (cleanup.processId) await stopManagedProcess(cleanup.processId).catch(() => {});
    if (cleanup.processFixturePath) await fs.rm(cleanup.processFixturePath, { force: true }).catch(() => {});
    if (cleanup.extensionFixtureDir) await fs.rm(cleanup.extensionFixtureDir, { recursive: true, force: true }).catch(() => {});
    if (cleanup.mcpFixturePath) await fs.rm(cleanup.mcpFixturePath, { force: true }).catch(() => {});
    if (cleanup.assetFixturePath) await fs.rm(cleanup.assetFixturePath, { force: true }).catch(() => {});
    if (cleanup.queuePath) await fs.rm(cleanup.queuePath, { force: true }).catch(() => {});
    if (cleanup.handoffPath) await fs.rm(cleanup.handoffPath, { force: true }).catch(() => {});
    await restoreApprovalDir(originalApprovals);
    if (originalGoalState === null) {
      await fs.rm(GOAL_STATE_PATH, { force: true }).catch(() => {});
    } else {
      await fs.mkdir(STATE_DIR, { recursive: true });
      await fs.writeFile(GOAL_STATE_PATH, originalGoalState, "utf8");
    }
    currentWorkspace = originalWorkspace;
    server.closeIdleConnections?.();
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
  }
}

if (process.argv.includes("--api-smoke-test")) {
  runApiSmokeTest().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
} else if (process.argv.includes("--ui-smoke-test")) {
  runUiSmokeTest().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
} else if (process.argv.includes("--smoke-test")) {
  runSmokeTest().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
} else {
  server.listen(PORT, "127.0.0.1", () => {
    console.log(`Forge Code running at http://127.0.0.1:${PORT}`);
    console.log(`Workspace: ${currentWorkspace}`);
    console.log(`DeepSeek key: ${process.env.DEEPSEEK_API_KEY ? "configured" : "missing"}`);
  });
}
