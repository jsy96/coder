import http from "node:http";
import { exec } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const APP_ROOT = path.dirname(__filename);
const DEFAULT_WORKSPACE = "D:\\cc-picture\\aaa\\coder-workspace";
const INITIAL_WORKSPACE = path.resolve(process.env.FORGE_WORKSPACE || DEFAULT_WORKSPACE);
let currentWorkspace = INITIAL_WORKSPACE;
const PORT = Number(process.env.PORT || 4173);
const MODEL = "deepseek-v4-pro";
const CONTEXT_LIMIT_BYTES = 220 * 1024;
const MAX_FILE_BYTES = 120 * 1024;
const MAX_AGENT_TURNS = 8;
const CHECKPOINT_DIR = path.join(APP_ROOT, ".forge", "checkpoints");
const TASK_LOG_DIR = path.join(APP_ROOT, ".forge", "tasks");
const WORKTREE_DIR = path.join(APP_ROOT, ".forge", "worktrees");
const QUEUE_DIR = path.join(APP_ROOT, ".forge", "queue");
const HANDOFF_DIR = path.join(APP_ROOT, ".forge", "handoffs");
const SKIP_DIRS = new Set([".git", ".forge", "node_modules", "dist", "build", ".next", ".turbo", "coverage"]);
const SKIP_FILES = new Set([".env", ".env.local"]);
const TEXT_EXTS = new Set([
  ".c", ".cc", ".cpp", ".cs", ".css", ".go", ".h", ".html", ".java", ".js", ".json", ".jsx",
  ".md", ".mjs", ".php", ".py", ".rb", ".rs", ".scss", ".sh", ".sql", ".ts", ".tsx", ".txt",
  ".vue", ".xml", ".yaml", ".yml"
]);
const CHECK_SCRIPT_NAMES = ["check", "test", "lint", "build"];
const SAFE_COMMAND_PATTERNS = [
  /^npm (?:run )?(?:check|test|lint|build)(?:\s+--\s*[\w:./=-]+)?$/i,
  /^npm test(?:\s+--\s*[\w:./=-]+)?$/i,
  /^pnpm (?:run )?(?:check|test|lint|build)(?:\s+--\s*[\w:./=-]+)?$/i,
  /^yarn (?:run )?(?:check|test|lint|build)(?:\s+[\w:./=-]+)?$/i,
  /^node --check [\w./\\-]+$/i,
  /^node [\w./\\-]+ --smoke-test$/i
];

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

function isSafeCommand(command) {
  const text = String(command || "").trim();
  if (!text || text.length > 220) return false;
  if (/[;&|`<>]/.test(text)) return false;
  if (/\b(?:rm|del|rmdir|remove-item|format|curl|wget|invoke-webrequest|set-content|out-file)\b/i.test(text)) {
    return false;
  }
  return SAFE_COMMAND_PATTERNS.some((pattern) => pattern.test(text));
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
    if (!text || seen.has(text) || !isSafeCommand(text)) return;
    seen.add(text);
    checks.push({ command: text, reason });
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
  if (!isSafeCommand(command)) {
    throw new Error("命令未通过安全白名单，已拒绝执行。");
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
        output: [stdout, stderr].filter(Boolean).join("\n").slice(0, 20000)
      });
    });
  });
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
    const result = await executeCommand(command);
    checks.push({
      command,
      reason: item.reason || "",
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
    return {
      reply: "当前没有 Git diff 可审查。",
      plan: [],
      diff: "",
      review: [],
      commands: [],
      evidence
    };
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
  return { ...payload, diff: "", patches: [], commands, evidence };
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
  const response = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.15,
      response_format: tools ? undefined : { type: "json_object" },
      tools,
      tool_choice: tools ? "auto" : undefined,
      messages
    })
  });
  if (!response.ok) {
    const details = await response.text();
    throw new Error(`DeepSeek 请求失败：${response.status} ${details.slice(0, 500)}`);
  }
  const data = await response.json();
  const message = data.choices?.[0]?.message;
  if (!message) throw new Error("DeepSeek 没有返回消息。");
  return message;
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
  const tools = [
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
      return send(res, 200, {
        ok: true,
        model: MODEL,
        hasApiKey: Boolean(process.env.DEEPSEEK_API_KEY),
        ...getWorkspaceInfo(),
        checkpoints: await listCheckpoints(),
        git: await getGitSummary(),
        tasks: await listTaskLogs(),
        queue: await listQueuedTasks()
      });
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
      return send(res, 200, await enqueueTask(prompt));
    }

    if (req.method === "PATCH" && url.pathname === "/api/queue") {
      const { id = "", status = "" } = await readJson(req);
      return send(res, 200, await updateQueuedTask(id, status));
    }

    if (req.method === "GET" && url.pathname === "/api/queue") {
      return send(res, 200, { queue: await listQueuedTasks() });
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
      const result = await runAgentLoop(prompt);
      return send(res, 200, { ...result, model: MODEL });
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
      return send(res, 200, await executeCommand(command));
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
    model: MODEL,
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

async function runApiSmokeTest() {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  try {
    const health = await requestJson(baseUrl, "/api/health");
    assertSmoke(health.ok === true, "health did not return ok=true");
    assertSmoke(Array.isArray(health.queue), "health did not include queue");

    const files = await requestJson(baseUrl, "/api/files");
    assertSmoke(Array.isArray(files.files), "files did not include file list");
    assertSmoke(files.repoMap && typeof files.repoMap === "object", "files did not include repoMap");

    const queued = await requestJson(baseUrl, "/api/queue", {
      method: "POST",
      body: JSON.stringify({ prompt: "api smoke queued task" })
    });
    assertSmoke(queued.id && queued.status === "queued", "queue create failed");

    const active = await requestJson(baseUrl, "/api/queue", {
      method: "PATCH",
      body: JSON.stringify({ id: queued.id, status: "active" })
    });
    assertSmoke(active.status === "active", "queue activate failed");

    const queue = await requestJson(baseUrl, "/api/queue");
    assertSmoke(queue.queue.some((item) => item.id === queued.id), "queue list missing created item");

    const diff = await requestJson(baseUrl, "/api/diff");
    assertSmoke(typeof diff.available === "boolean", "diff endpoint missing availability flag");

    const handoff = await requestJson(baseUrl, "/api/handoff", {
      method: "POST",
      body: JSON.stringify({ prompt: "api smoke handoff" })
    });
    assertSmoke(handoff.id && handoff.body.includes("## Summary"), "handoff draft failed");

    console.log(JSON.stringify({
      ok: true,
      apiSmoke: true,
      checked: ["health", "files", "queue", "diff", "handoff"],
      queueId: queued.id,
      handoffId: handoff.id
    }));
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

if (process.argv.includes("--api-smoke-test")) {
  runApiSmokeTest().catch((error) => {
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
