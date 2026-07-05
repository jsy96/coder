import http from "node:http";
import crypto from "node:crypto";
import { exec, spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";

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
const MAX_SEMANTIC_FILE_BYTES = 512 * 1024;
const MAX_AGENT_TURNS = 8;
const CHECKPOINT_DIR = path.join(APP_ROOT, ".forge", "checkpoints");
const TASK_LOG_DIR = path.join(APP_ROOT, ".forge", "tasks");
const WORKTREE_DIR = path.join(APP_ROOT, ".forge", "worktrees");
const QUEUE_DIR = path.join(APP_ROOT, ".forge", "queue");
const HANDOFF_DIR = path.join(APP_ROOT, ".forge", "handoffs");
const REVIEW_DIR = path.join(APP_ROOT, ".forge", "reviews");
const STATE_DIR = path.join(APP_ROOT, ".forge", "state");
const GOAL_STATE_PATH = path.join(STATE_DIR, "goal.json");
const CONTEXT_SNAPSHOT_PATH = path.join(STATE_DIR, "context-snapshot.json");
const SEMANTIC_INDEX_PATH = path.join(STATE_DIR, "semantic-index.json");
const APPROVAL_DIR = path.join(APP_ROOT, ".forge", "approvals");
const EXTENSION_DIR = path.join(APP_ROOT, ".forge", "extensions");
const MCP_DIR = path.join(APP_ROOT, ".forge", "mcp");
const BROWSER_BASELINE_DIR = path.join(APP_ROOT, ".forge", "browser-baselines");
const BROWSER_SCREENSHOT_DIR = path.join(APP_ROOT, ".forge", "browser-screenshots");
const BROWSER_VISUAL_DIR = path.join(APP_ROOT, ".forge", "browser-visual-baselines");
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
  /^node [\w./\\-]+ --smoke-test$/i,
  /^node [\w./\\-]+ --mcp-smoke-server$/i
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
    if (stat.size > MAX_SEMANTIC_FILE_BYTES) continue;
    const relativePath = toPosix(path.join(base, entry.name));
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
      "full audio/video transcription without local engine",
      "full PDF layout extraction",
      "legacy Office binary parsing"
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

function extractReadableStrings(buffer, limit = 80) {
  return (buffer.toString("latin1").match(/[ -~]{5,}/g) || [])
    .map((item) => item.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(0, limit);
}

function decodeXmlEntities(text = "") {
  return String(text || "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'");
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

function inspectPdfBuffer(buffer) {
  const latin1 = buffer.toString("latin1");
  const literalStrings = [...latin1.matchAll(/\(([^()]{2,500})\)\s*T[jJ]/g)]
    .map((match) => match[1].replace(/\\([()\\])/g, "$1").replace(/\\n/g, "\n").replace(/\\r/g, "\r").replace(/\\t/g, "\t"))
    .map((item) => item.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(0, 80);
  return {
    format: "pdf",
    pagesEstimated: (latin1.match(/\/Type\s*\/Page\b/g) || []).length,
    textSample: literalStrings.join(" ").slice(0, 8000),
    strings: extractReadableStrings(buffer, 40)
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
  if (ext === ".svg") return { format: "svg", width: 0, height: 0, channels: "vector" };
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

async function inspectImageOcr(fullPath, ext) {
  if (![".png", ".jpg", ".jpeg", ".tif", ".tiff", ".bmp"].includes(ext)) {
    return {
      available: false,
      engine: "tesseract",
      reason: "unsupported image format for local OCR probe"
    };
  }
  const cli = await runLocalCommand("tesseract --version", { cwd: APP_ROOT, timeout: 5000, maxBuffer: 128 * 1024 });
  if (!cli.ok) {
    return {
      available: false,
      engine: "tesseract",
      reason: "tesseract CLI not installed or not on PATH"
    };
  }
  const result = await runLocalCommand(`tesseract "${fullPath.replace(/"/g, "\"\"")}" stdout --psm 6`, {
    cwd: APP_ROOT,
    timeout: 15000,
    maxBuffer: 512 * 1024
  });
  return {
    available: result.ok,
    engine: "tesseract",
    textSample: result.ok ? result.output.slice(0, 4000) : "",
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
  if (!audioLike) {
    return { available: false, enabled: false, engine: "whisper", reason: "unsupported media extension" };
  }
  const whisper = await runLocalProcess("whisper", ["--help"], { cwd: APP_ROOT, timeout: 5000, maxBuffer: 128 * 1024 });
  if (!whisper.ok) {
    return {
      available: false,
      enabled: false,
      engine: "whisper",
      reason: "whisper CLI not installed or not on PATH"
    };
  }
  if (process.env.FORGE_ENABLE_MEDIA_TRANSCRIPTION !== "1") {
    return {
      available: true,
      enabled: false,
      engine: "whisper",
      reason: "set FORGE_ENABLE_MEDIA_TRANSCRIPTION=1 to run local transcription"
    };
  }
  if (stat.size > 25 * 1024 * 1024) {
    return {
      available: true,
      enabled: false,
      engine: "whisper",
      reason: "media file exceeds 25MB transcription limit"
    };
  }
  const outputDir = path.join(APP_ROOT, ".forge", "media-transcripts");
  await fs.mkdir(outputDir, { recursive: true });
  const result = await runLocalProcess("whisper", [
    fullPath,
    "--model", process.env.FORGE_WHISPER_MODEL || "tiny",
    "--output_format", "txt",
    "--output_dir", outputDir,
    "--fp16", "False"
  ], { cwd: APP_ROOT, timeout: 180000, maxBuffer: 1024 * 1024 });
  const transcriptPath = path.join(outputDir, `${path.parse(fullPath).name}.txt`);
  const text = await fs.readFile(transcriptPath, "utf8").catch(() => "");
  return {
    available: result.ok,
    enabled: true,
    engine: "whisper",
    transcriptPath: text ? transcriptPath : "",
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
      ocr: await inspectImageOcr(full, ext),
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
  }
  if (type === "document") {
    const document = [".docx", ".pptx", ".xlsx"].includes(ext)
      ? inspectOfficeOpenXml(data, ext)
      : ext === ".pdf"
        ? inspectPdfBuffer(data)
        : {
            format: ext.slice(1),
            pagesEstimated: 0,
            strings: extractReadableStrings(data, 40),
            warning: "legacy Office binary text extraction is limited"
          };
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
    calls: [],
    selectors: [],
    routes: [],
    entrypoints: []
  };

  const addDeclaration = (kind, name, line) => {
    if (!name || record.declarations.length >= 80) return;
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
      const apiFetch = /\bfetch\(\s*["'`]([^"'`]+)["'`]/.exec(line);

      if (importFrom) addImport(importFrom[2], lineNumber, importFrom[1].match(/[A-Za-z_$][\w$]*/g) || []);
      if (importBare) addImport(importBare[1], lineNumber);
      if (requireCall) addImport(requireCall[1], lineNumber);
      if (exportNamed) addExport(exportNamed[1], lineNumber);
      if (exportList) {
        for (const name of exportList[1].match(/[A-Za-z_$][\w$]*/g) || []) addExport(name, lineNumber);
      }
      if (route) record.routes.push({ method: route[1].toUpperCase(), path: route[2], line: lineNumber });
      if (apiFetch) record.routes.push({ method: "FETCH", path: apiFetch[1], line: lineNumber });
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
  for (const match of content.matchAll(/\b([A-Za-z_$][\w$]*)\s*\(/g)) {
    const name = match[1];
    if (["if", "for", "while", "switch", "catch", "function", "return", "typeof"].includes(name)) continue;
    record.calls.push({ name, line: findLineNumber(lines, match.index || 0) });
    if (record.calls.length >= 120) break;
  }

  record.imports = record.imports.slice(0, 80);
  record.exports = record.exports.slice(0, 80);
  record.declarations = record.declarations.slice(0, 80);
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
  const callGraph = {};

  for (const file of files) {
    const content = await readWorkspaceFile(file.path).catch(() => "");
    const record = extractSemanticSignals(file.path, content);
    if (!record) continue;
    records.push(record);
    for (const declaration of record.declarations) declarations.push({ ...declaration, path: file.path });
    for (const item of record.imports) imports.push({ ...item, path: file.path });
    for (const route of record.routes) routes.push({ ...route, path: file.path });
    for (const selector of record.selectors) selectors.push({ ...selector, path: file.path });
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
      callEdges: Object.values(callGraph).reduce((total, calls) => total + calls.length, 0)
    },
    records: records.slice(0, 240),
    declarations: declarations.slice(0, 400),
    imports: imports.slice(0, 300),
    routes: routes.slice(0, 200),
    selectors: selectors.slice(0, 240),
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
    if (matches.length < max) matches.push(item);
  };

  for (const item of index.declarations || []) {
    if (!wants("declaration", "symbol")) continue;
    if (semanticMatch(item.name, term) || semanticMatch(item.kind, term) || semanticMatch(item.path, term)) {
      push({ kind: "declaration", path: item.path, line: item.line, name: item.name, type: item.kind });
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
  await fs.mkdir(STATE_DIR, { recursive: true });
  await fs.writeFile(CONTEXT_SNAPSHOT_PATH, JSON.stringify(snapshot, null, 2), "utf8");
  return snapshot;
}

async function readContextSnapshot() {
  const snapshot = JSON.parse(await fs.readFile(CONTEXT_SNAPSHOT_PATH, "utf8").catch(() => "null"));
  if (!snapshot || snapshot.workspace !== currentWorkspace) return null;
  return snapshot;
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
      value: ["type", "select", "waittext", "waitvalue", "navigate", "waiturl"].includes(action.type) ? action.value : "",
      key: action.type === "press" ? action.key : "",
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
        allowedActions: domInteraction ? ["wait", "click", "dblClick", "hover", "clear", "type", "press", "select", "check", "uncheck", "waitText", "waitValue", "navigate", "waitUrl", "waitNetwork"] : undefined
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
  const allowedTypes = new Set(["wait", "click", "dblclick", "hover", "clear", "type", "press", "select", "check", "uncheck", "waittext", "waitvalue", "navigate", "waiturl", "waitnetwork"]);
  const selectorlessTypes = new Set(["navigate", "waiturl", "waitnetwork"]);
  return actions.slice(0, 20).map((action) => ({
    type: String(action?.type || "").trim().toLowerCase(),
    selector: String(action?.selector || "").trim().slice(0, 240),
    value: String(action?.value ?? "").slice(0, 2000),
    key: String(action?.key ?? action?.value ?? "").trim().slice(0, 80),
    timeoutMs: Math.min(10000, Math.max(100, Number(action?.timeoutMs) || 3000))
  })).filter((action) => {
    if (!allowedTypes.has(action.type)) return false;
    if (!selectorlessTypes.has(action.type) && !action.selector) return false;
    if (action.type === "press") return Boolean(action.key);
    if (action.type === "waittext" || action.type === "waitvalue" || action.type === "navigate" || action.type === "waiturl") return Boolean(action.value);
    return true;
  });
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
      } else if (action.type === "press") {
        element.scrollIntoView({ block: "center", inline: "center" });
        element.focus();
        for (const eventType of ["keydown", "keypress", "keyup"]) {
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
        value: ["type", "select", "waittext", "waitvalue", "navigate", "waiturl"].includes(action.type) ? action.value : "",
        key: action.type === "press" ? action.key : "",
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

async function interactBrowserDom(rawUrl, { actions = [], selectors = [], width = 1365, height = 768 } = {}) {
  const url = normalizeLocalBrowserTarget(rawUrl);
  const browserPaths = await listBrowserExecutables();
  if (!browserPaths.length) throw new Error("未找到可用的 Edge/Chrome 浏览器。");
  const safeActions = sanitizeBrowserActions(actions);
  const safeWidth = Math.min(3840, Math.max(320, Number(width) || 1365));
  const safeHeight = Math.min(2160, Math.max(240, Number(height) || 768));
  await fs.mkdir(BROWSER_SCREENSHOT_DIR, { recursive: true });
  const errors = [];
  const attempts = browserPaths
    .flatMap((browserPath) => ["--headless=new", "--headless"].map((headlessArg) => ({ browserPath, headlessArg })))
    .slice(0, 2);
  for (const { browserPath, headlessArg } of attempts) {
      const port = 9222 + Math.floor(Math.random() * 20000);
      const id = `${new Date().toISOString().replace(/[:.]/g, "-")}-${browserBaselineId(url).slice(0, 24)}-${errors.length}`;
      const profilePath = path.join(BROWSER_SCREENSHOT_DIR, `${id}-interact-profile`);
      let session = null;
      let client = null;
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
          url
        ], 12000), 14000, "浏览器交互会话启动超时。");
        const webSocketUrl = await waitForDevtoolsEndpoint(port, 6000);
        client = await createCdpClient(webSocketUrl);
        await client.send("Page.enable", {}, { timeoutMs: 5000 });
        await client.send("Runtime.enable", {}, { timeoutMs: 5000 });
        await client.send("Page.navigate", { url }, { timeoutMs: 5000 });
        await sleep(700);
        const result = await cdpEvaluate(client, browserInteractionScript(safeActions), { timeoutMs: 8000 });
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
            allowedActions: ["wait", "click", "dblClick", "hover", "clear", "type", "press", "select", "check", "uncheck", "waitText", "waitValue", "navigate", "waitUrl", "waitNetwork"]
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

async function captureBrowserScreenshot(rawUrl, { width = 1365, height = 768 } = {}) {
  const url = normalizeLocalBrowserTarget(rawUrl);
  const browserPaths = await listBrowserExecutables();
  if (!browserPaths.length) throw new Error("未找到可用的 Edge/Chrome 浏览器。");
  const safeWidth = Math.min(3840, Math.max(320, Number(width) || 1365));
  const safeHeight = Math.min(2160, Math.max(240, Number(height) || 768));
  await fs.mkdir(BROWSER_SCREENSHOT_DIR, { recursive: true });
  const idBase = `${new Date().toISOString().replace(/[:.]/g, "-")}-${browserBaselineId(url).slice(0, 24)}`;
  const errors = [];
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
        const shot = await client.send("Page.captureScreenshot", {
          format: "png",
          fromSurface: true,
          captureBeyondViewport: false
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
          capturedAt: new Date().toISOString(),
          policy: {
            access: "local-url-only",
            scope: "localhost",
            screenshots: true,
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
  throw new Error(`浏览器截图失败：\n${errors.join("\n").slice(0, 12000)}`);
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

async function compareBrowserVisual(rawUrl, { update = false, width = 1365, height = 768, threshold = 0, maxMismatchRatio = 0, name = "", screenshotPath = "" } = {}) {
  const url = normalizeLocalBrowserTarget(rawUrl);
  const reusedScreenshotPath = resolveAppRelativePath(screenshotPath, BROWSER_SCREENSHOT_DIR);
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
      capturedAt: new Date().toISOString(),
      policy: {
        access: "local-url-only",
        scope: "localhost",
        screenshots: true,
        domInteraction: false,
        reusedScreenshot: true
      }
    }
    : await captureBrowserScreenshot(url, { width, height });
  const currentPath = path.join(APP_ROOT, screenshot.path);
  const currentBuffer = await fs.readFile(currentPath);
  const currentPng = parsePng(currentBuffer);
  const id = browserBaselineId(screenshot.url);
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
      const output = Buffer.concat([...stdout, ...stderr]).toString("utf8").trim();
      const clipped = output.slice(0, options.maxBuffer || 256 * 1024);
      finish({ ok: code === 0, exitCode: code ?? 0, output: clipped });
    });
  });
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

  const status = statusResult.output ? statusResult.output.split(/\r?\n/).slice(0, 80) : [];
  const remotes = remoteResult.output
    ? remoteResult.output.split(/\r?\n/)
      .map((line) => /^(\S+)\s+(\S+)\s+\((fetch|push)\)$/.exec(line))
      .filter(Boolean)
      .map((match) => ({ name: match[1], url: match[2], direction: match[3], provider: inferGitProvider(match[2]) }))
    : [];
  return {
    available: true,
    branch: branchResult.output,
    root: rootResult.output,
    status,
    changedFiles: status.map((line) => line.slice(3).trim()).filter(Boolean),
    remotes,
    upstream: upstreamResult.ok ? upstreamResult.output : ""
  };
}

function inferGitProvider(remoteUrl = "") {
  const value = String(remoteUrl || "").toLowerCase();
  if (value.includes("github.com")) return "github";
  if (value.includes("gitlab.com")) return "gitlab";
  if (value.includes("bitbucket.org")) return "bitbucket";
  if (value.includes("dev.azure.com") || value.includes("visualstudio.com")) return "azure-devops";
  return value ? "custom" : "";
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

async function readRemotePrStatus(git = null) {
  const summary = git || await getGitSummary();
  const provider = summary.remotes?.find((item) => item.direction === "push")?.provider
    || summary.remotes?.[0]?.provider
    || "";
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
  const evidence = await getCurrentDiff();
  const git = deep ? await getGitSummary() : evidence.git;
  const ci = await findCiConfigs();
  const tasks = await listTaskLogs(5);
  const checks = tasks.flatMap((task) => task.checks || []).slice(0, 12);
  const reviews = await listReviewArtifacts(5);
  const provider = git.remotes?.find((item) => item.direction === "push")?.provider
    || git.remotes?.[0]?.provider
    || "";
  const remote = deep
    ? await readRemotePrStatus(git)
    : {
      provider,
      available: false,
      authenticated: false,
      reason: "默认 PR readiness 跳过远端 CLI 探测；使用 /api/pr-readiness?deep=1 执行远端 PR/CI 读取。",
      pr: null,
      checks: [],
      policy: { access: "remote-read-only", pushes: false, createsRemotePr: false, skipped: true }
    };
  const title = String(prompt || tasks[0]?.prompt || `Forge changes on ${git.branch || "workspace"}`).trim();
  const changedFiles = git.changedFiles || [];
  const blockers = [];
  if (!git.available) blockers.push("当前工作区不是 Git 仓库。");
  if (!git.remotes?.length) blockers.push("未发现 Git remote，无法判断真实 PR 目标。");
  if (!ci.length) blockers.push("未发现本地 CI 配置。");
  if (!remote.available) blockers.push(`远端 PR/CI 状态不可用：${remote.reason}`);
  if (remote.summary?.failingChecks) blockers.push(`${remote.summary.failingChecks} 个远端检查未通过或未完成。`);
  const failingChecks = checks.filter((check) => check.exitCode !== 0);
  if (failingChecks.length) blockers.push(`${failingChecks.length} 个最近检查失败。`);
  const body = [
    "## Summary",
    markdownList([
      `Workspace: ${currentWorkspace}`,
      `Branch: ${git.branch || "n/a"}`,
      `Remote provider: ${provider || "unknown"}`,
      `Changed files: ${changedFiles.length}`
    ]),
    "",
    "## Changed Files",
    markdownList(changedFiles),
    "",
    "## Verification",
    checks.length
      ? checks.map((check) => `- ${check.exitCode === 0 ? "PASS" : "FAIL"} \`${check.command}\`${check.reason ? ` - ${check.reason}` : ""}`).join("\n")
      : "- No local check evidence recorded yet.",
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
    git,
    remotes: git.remotes || [],
    ci,
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
      readsRemoteCi: Boolean(remote.available)
      ,
      deep
    }
  };
}

async function buildRemotePublishPlan(prompt = "") {
  const readiness = await buildPullRequestReadiness(prompt);
  const git = readiness.git || await getGitSummary();
  const provider = readiness.provider || "";
  const branch = git.branch || "current-branch";
  const pushRemote = git.remotes?.find((item) => item.direction === "push")?.name
    || git.remotes?.[0]?.name
    || "origin";
  const commands = [];
  const notes = [];
  const title = readiness.draft?.title || String(prompt || `Forge changes on ${branch}`).trim();
  const body = readiness.draft?.body || "";

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
        command: `gh pr comment ${readiness.remote.pr.number} --body-file <review-summary.md>`,
        risk: "high",
        requiresApproval: true,
        reason: "Writes a review/update comment to an existing GitHub PR."
      });
    } else {
      commands.push({
        id: "create-pr",
        label: "Create GitHub PR",
        command: `gh pr create --draft --title "${title.replace(/"/g, "\\\"")}" --body-file <pr-body.md>`,
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
        command: `glab mr note ${readiness.remote.pr.number} --message "$(Get-Content <review-summary.md> -Raw)"`,
        risk: "high",
        requiresApproval: true,
        reason: "Writes a review/update note to an existing GitLab MR."
      });
    } else {
      commands.push({
        id: "create-mr",
        label: "Create GitLab MR",
        command: `glab mr create --draft --title "${title.replace(/"/g, "\\\"")}" --description "$(Get-Content <pr-body.md> -Raw)"`,
        risk: "high",
        requiresApproval: true,
        reason: "Creates a remote GitLab MR from the current branch."
      });
    }
  } else {
    notes.push(provider ? `Remote provider ${provider} is not supported for publish planning yet.` : "No recognized remote provider for PR/MR creation.");
  }

  const plan = {
    generatedAt: new Date().toISOString(),
    workspace: currentWorkspace,
    status: commands.length ? "approval_required" : "needs_attention",
    provider,
    title,
    body,
    readiness: {
      status: readiness.status,
      blockers: readiness.blockers || [],
      remoteAvailable: Boolean(readiness.remote?.available),
      changedFiles: readiness.evidence?.changedFiles || []
    },
    commands,
    notes,
    policy: {
      access: "approval-plan-only",
      executesCommands: false,
      pushes: false,
      createsRemotePr: false,
      writesRemoteComments: false,
      requiresExplicitApproval: true
    }
  };
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

function normalizeQueuePriority(value = 0) {
  return Math.min(100, Math.max(-100, Number(value) || 0));
}

async function enqueueTask(prompt = "", options = {}) {
  const text = String(prompt || "").trim();
  if (!text) throw new Error("缺少可入队的任务描述。");
  await fs.mkdir(QUEUE_DIR, { recursive: true });
  const id = new Date().toISOString().replace(/[:.]/g, "-");
  const priority = normalizeQueuePriority(options.priority);
  const retryLimit = Math.min(10, Math.max(0, Number(options.retryLimit) || 0));
  const item = {
    id,
    prompt: text,
    workspace: currentWorkspace,
    status: "queued",
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
  const next = queue.find((item) => item.status === "queued");
  if (!next) return null;
  return updateQueuedTask(next.id, "active");
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
  if (approval.type === "process") {
    const policy = evaluateProcessPolicy(approval.command || "");
    if (!policy.allowed) {
      const updated = {
        ...approval,
        execution: {
          allowedByApproval: true,
          executed: false,
          blocked: true,
          policy,
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
    const updated = {
      ...approval,
      execution: {
        allowedByApproval: true,
        executed: false,
        blocked: true,
        policy,
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
  const [branchResult, rootResult, statusResult, diff, stat] = await Promise.all([
    runLocalProcess("git", ["branch", "--show-current"], { timeout: 2000, maxBuffer: 4096 }),
    runLocalProcess("git", ["rev-parse", "--show-toplevel"], { timeout: 2000, maxBuffer: 4096 }),
    runLocalProcess("git", ["status", "--short", "--untracked-files=no"], { timeout: 3000, maxBuffer: 16000 }),
    runLocalProcess("git", ["diff", "--no-ext-diff", "--", "."], {
      timeout: 10000,
      maxBuffer: 160000
    }),
    runLocalProcess("git", ["diff", "--no-ext-diff", "--stat", "--", "."], {
      timeout: 5000,
      maxBuffer: 32000
    })
  ]);
  const status = statusResult.output ? statusResult.output.split(/\r?\n/).slice(0, 80) : [];
  const git = {
    available: true,
    branch: branchResult.output,
    root: rootResult.output,
    status,
    changedFiles: status.map((line) => line.slice(3).trim()).filter(Boolean),
    remotes: [],
    upstream: "",
    light: true
  };
  const truncated = diff.output.length >= 160000;
  return {
    available: true,
    diff: diff.output.slice(0, 120000),
    stat: stat.output,
    git,
    truncated,
    warnings: [
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

async function buildCapabilityAudit({ light = false } = {}) {
  const git = light
    ? { available: false, branch: "", root: "", status: [], changedFiles: [], remotes: [], upstream: "", skipped: "light capability audit" }
    : await getGitSummary();
  const tasks = light ? [] : await listTaskLogs(5);
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
  const capabilities = [
    {
      area: "上下文索引",
      status: "implemented",
      evidence: ["repo_map", "read_file_range", "search_files", "/api/semantic-index", "/api/semantic-search", "/api/semantic-references", ".forge/state/semantic-index.json"],
      next: "已补本地语义索引、语义检索和符号引用跳转；可继续升级为真实 LSP/TypeScript AST 解析。"
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
      evidence: ["/api/review", "/api/reviews", "/api/review-comments", ".forge/reviews"],
      next: "已补审查 artifact 和 PR 行级评论草稿导出；可继续接入真实 PR review 发布。"
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
      next: "已支持优先级、重试计数和完成后自动激活下一项；可继续支持并发隔离。"
    },
    {
      area: "可恢复状态",
      status: "implemented",
      evidence: [".forge/state/goal.json", ".forge/state/context-snapshot.json", "/api/context-snapshot", goal.phase || "idle"],
      next: "已补可恢复目标状态、跨会话上下文摘要和语义索引持久化；可继续增加自动压缩策略。"
    },
    {
      area: "长任务管理",
      status: "implemented",
      evidence: ["/api/processes", `${managedProcessCount} 个受管进程`],
      next: "可继续增加日志搜索和更丰富的健康探针。"
    },
    {
      area: "交付草稿",
      status: "implemented",
      evidence: ["/api/handoff", ".forge/handoffs"],
      next: "可继续接入真实 PR 创建、推送和评论同步。"
    },
    {
      area: "远端 PR 与 CI 集成",
      status: "partial",
      evidence: ["/api/pr-readiness", "/api/remote-pr-status", "/api/remote-publish-plan", "GitHub gh / GitLab glab 只读探测", "Git remote/provider 发现", "本地 CI 配置发现", "PR 草稿元数据", "远端写入审批计划", "不执行 git push/真实 PR 创建"],
      next: "已补远端 PR/CI 只读状态探测和发布审批计划；继续接入真实 PR 创建、评论回写和更多 provider。"
    },
    {
      area: "真实远端发布与平台同步",
      status: "partial",
      evidence: ["/api/remote-publish-plan", ".forge/approvals", "远端 push/PR/comment 候选命令审批记录", "未执行 git push", "未创建真实远端 PR", "未同步代码托管平台评论"],
      next: "已补远端发布审批计划；需要平台凭据和明确授权后接入实际 PR 发布、push、CI 必过门禁和 review 评论同步。"
    },
    {
      area: "权限与命令策略",
      status: approvals.length ? "partial" : "implemented",
      evidence: ["evaluateCommandPolicy", "evaluateProcessPolicy", "/api/approval decision", "/api/approval-execute", "/api/mcp-tool-call", ".forge/approvals", `${approvals.length} 个近期审批请求`],
      next: "已补审批请求的批准/拒绝状态流转、受控执行尝试和 MCP tools/call 审批执行；仍缺完整系统级沙箱升级执行。"
    },
    {
      area: "工具生态",
      status: "partial",
      evidence: [`内置工具 ${getAgentTools().length} 个`, `本地扩展 ${extensions.summary.total} 个`, `MCP server ${mcp.summary.total} 个`, "/api/tools", "/api/extensions", "/api/mcp", "/api/mcp?probe=1", "/api/mcp-tool-call"],
      next: "已暴露本地工具目录、扩展注册表、MCP server 发现、本地 MCP 握手/目录枚举和审批后的 tools/call；继续补远端扩展市场和更多 provider。"
    },
    {
      area: "外部工具与浏览器自动化",
      status: "partial",
      evidence: ["/api/mcp", "/api/mcp?probe=1", "/api/mcp-tool-call", "/api/browser-check", "/api/browser-interact", "/api/browser-visual", "本地 MCP 只读握手与目录枚举", "审批后 MCP tools/call", "受控浏览器截图/DOM/交互/视觉回归"],
      next: "已补 MCP 本地探测、审批后工具调用和受控浏览器自动化；继续接入复杂鼠标键盘序列、远端 MCP 和 provider 级权限模型。"
    },
    {
      area: "多模态与浏览器执行",
      status: "partial",
      evidence: [`资产 ${assets.summary.total} 个`, "/api/assets", "/api/asset-inspect", "/api/browser-interact", "/api/browser-visual", "CSV/TSV/JSONL 抽样", "图片尺寸检查", "PNG 像素视觉摘要", "OCR CLI 探测", "媒体元数据解析", "Whisper 转写引擎探测", "OOXML 文本抽取", "PDF 字符串/Page 估算"],
      next: "已补工作区资产索引、内容抽样、图片视觉摘要、媒体元数据和转写探测；继续补真实音视频转写执行和更完整 OCR/PDF layout。"
    },
    {
      area: "浏览器自动化与视觉回归",
      status: "partial",
      evidence: ["/api/browser-check", "/api/browser-baseline", "/api/browser-screenshot", "/api/browser-interact", "/api/browser-visual", "本地 URL 状态/标题/结构检查", "页面结构基线对比", "真实浏览器截图产物", "hover/dblclick/clear/check/waitValue/navigate/waitUrl/waitNetwork 受控 DOM 交互", "像素级视觉回归断言"],
      next: "已补页面结构基线、真实浏览器截图、扩展 DOM 交互、跨页面导航、网络静默等待和像素级视觉断言；继续补文件上传与更完整多页面会话。"
    },
    {
      area: "真实浏览器交互与截图",
      status: "partial",
      evidence: ["/api/browser-screenshot", "/api/browser-dom", "/api/browser-interact", "/api/browser-visual", ".forge/browser-screenshots", ".forge/browser-visual-baselines", "wait/click/dblclick/hover/clear/type/press/select/check/uncheck/waitText/waitValue/navigate/waitUrl/waitNetwork 步骤审计"],
      next: "已补真实浏览器截图、DOM 快照、扩展受控交互、跨页面导航、网络等待和像素/布局断言；继续补文件上传和更完整多页面会话。"
    },
    {
      area: "浏览器 DOM 交互",
      status: "implemented",
      evidence: ["/api/browser-interact", "/api/browser-dom", "渲染后 DOM 快照", "简单选择器计数", "wait/click/dblclick/hover/clear/type/press/select/check/uncheck/waitText/waitValue/navigate/waitUrl/waitNetwork", "交互步骤审计", "隔离浏览器 profile"],
      next: "已补跨页面导航和网络静默等待；可继续增加鼠标坐标、文件上传和更完整多页面会话。"
    },
    {
      area: "像素级视觉断言",
      status: "implemented",
      evidence: ["/api/browser-visual", ".forge/browser-visual-baselines", "PNG 像素解码", "尺寸差异检测", "threshold/maxMismatchRatio 阈值比较", "mismatch samples", "可视化 diff PNG"],
      next: "已补视觉 diff PNG 证据；可继续做按选择器裁剪区域断言。"
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
      "MCP tool invocation bridge",
      "remote MCP probing",
      "plugin/skill packages",
      "writable tool policies"
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
      "runtime extension loading",
      "extension tool invocation",
      "remote extension marketplace",
      "signed extension trust policy"
    ]
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
  const result = server.transport === "http" || server.url
    ? await callMcpHttpMethod(server, "tools/call", params)
    : await callMcpStdioMethod(server, "tools/call", params);
  return {
    serverName: server.name,
    toolName: safeToolName,
    result,
    calledAt: new Date().toISOString()
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
      probe: await probeMcpServer(server).catch((error) => summarizeMcpProbe({ status: "error", error: error.message }))
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
  if (name === "semantic_index") {
    return JSON.stringify(await buildSemanticIndex());
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
      const deep = url.searchParams.get("deep") === "1";
      const lightGit = { available: false, branch: "", root: "", status: [], changedFiles: [], remotes: [], upstream: "", skipped: "Use /api/health?deep=1 for git status." };
      const lightAssets = { summary: { total: 0, image: 0, document: 0, data: 0, media: 0 }, assets: [] };
      const [checkpoints, git, tasks, queue, reviews, approvals, processes, extensions, mcp, assets, contextSnapshot, goal, capabilities] = await Promise.all([
        listCheckpoints(),
        deep ? getGitSummary() : Promise.resolve(lightGit),
        listTaskLogs(),
        listQueuedTasks(),
        listReviewArtifacts(),
        listApprovalRequests(),
        listManagedProcesses({ probe: deep }),
        listExtensions(),
        discoverMcpServers(),
        deep ? buildAssetCatalog() : Promise.resolve(lightAssets),
        readContextSnapshot(),
        readGoalState(),
        buildCapabilityAudit({ light: !deep })
      ]);
      return send(res, 200, {
        ok: true,
        deep,
        model: modelRuntime.lastModel || MODEL_CANDIDATES[0] || DEFAULT_MODEL,
        modelRuntime,
        hasApiKey: Boolean(process.env.DEEPSEEK_API_KEY),
        ...getWorkspaceInfo(),
        checkpoints,
        git,
        tasks,
        queue,
        reviews,
        approvals,
        processes,
        tools: buildToolCatalog(),
        extensions,
        mcp,
        assets,
        contextSnapshot,
        goal,
        capabilities
      });
    }

    if (req.method === "GET" && url.pathname === "/api/context-snapshot") {
      return send(res, 200, { snapshot: await readContextSnapshot() });
    }

    if (req.method === "POST" && url.pathname === "/api/context-snapshot") {
      return send(res, 200, { snapshot: await buildContextSnapshot({ deep: url.searchParams.get("deep") === "1" }) });
    }

    if (req.method === "GET" && url.pathname === "/api/semantic-index") {
      const cached = await readSemanticIndex();
      return send(res, 200, { index: cached || await buildSemanticIndex() });
    }

    if (req.method === "POST" && url.pathname === "/api/semantic-index") {
      return send(res, 200, { index: await buildSemanticIndex({ persist: true }) });
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

    if (req.method === "GET" && url.pathname === "/api/capabilities") {
      return send(res, 200, await buildCapabilityAudit({ light: url.searchParams.get("deep") !== "1" }));
    }

    if (req.method === "GET" && url.pathname === "/api/tools") {
      return send(res, 200, buildToolCatalog());
    }

    if (req.method === "GET" && url.pathname === "/api/extensions") {
      return send(res, 200, await listExtensions());
    }

    if (req.method === "GET" && url.pathname === "/api/mcp") {
      return send(res, 200, await discoverMcpServers({ probe: url.searchParams.get("probe") === "1" }));
    }

    if (req.method === "POST" && url.pathname === "/api/mcp-tool-call") {
      return send(res, 200, await createMcpToolCallApproval(await readJson(req)));
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

    if (req.method === "POST" && url.pathname === "/api/browser-baseline") {
      const { url: targetUrl = "", update = false, name = "" } = await readJson(req);
      return send(res, 200, await compareBrowserBaseline(targetUrl, { update: Boolean(update), name }));
    }

    if (req.method === "POST" && url.pathname === "/api/browser-screenshot") {
      const { url: targetUrl = "", width = 1365, height = 768 } = await readJson(req);
      return send(res, 200, await captureBrowserScreenshot(targetUrl, { width, height }));
    }

    if (req.method === "POST" && url.pathname === "/api/browser-dom") {
      const { url: targetUrl = "", selectors = [] } = await readJson(req);
      return send(res, 200, await captureBrowserDom(targetUrl, { selectors }));
    }

    if (req.method === "POST" && url.pathname === "/api/browser-interact") {
      const {
        url: targetUrl = "",
        actions = [],
        selectors = [],
        width = 1365,
        height = 768
      } = await readJson(req);
      return send(res, 200, await interactBrowserDom(targetUrl, { actions, selectors, width, height }));
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
        screenshotPath = ""
      } = await readJson(req);
      return send(res, 200, await compareBrowserVisual(targetUrl, {
        update: Boolean(update),
        width,
        height,
        threshold,
        maxMismatchRatio,
        name,
        screenshotPath
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

    if (req.method === "POST" && url.pathname === "/api/workspace") {
      const { workspace } = await readJson(req);
      return send(res, 200, await setWorkspace(workspace));
    }

    if (req.method === "POST" && url.pathname === "/api/worktree") {
      const { prompt = "" } = await readJson(req);
      return send(res, 200, await createTaskWorktree(prompt));
    }

    if (req.method === "POST" && url.pathname === "/api/queue") {
      const { prompt = "", priority = 0, retryLimit = 0 } = await readJson(req);
      const item = await enqueueTask(prompt, { priority, retryLimit });
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
      const { id = "", status = "", priority, retryLimit, autoNext = false } = await readJson(req);
      const item = await updateQueuedTask(id, status, { priority, retryLimit });
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
  let response;
  const controller = new AbortController();
  const timeoutMs = Number(options.timeoutMs) || 30000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    response = await fetch(`${baseUrl}${route}`, {
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
      ...options,
      signal: options.signal || controller.signal
    });
  } catch (error) {
    throw new Error(`${route} failed before response after ${timeoutMs}ms: ${error.message}`);
  } finally {
    clearTimeout(timer);
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`${route} failed: ${response.status} ${data.error || ""}`);
  }
  return data;
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
    "prReadinessBtn",
    "remotePublishPlanBtn",
    "contextSnapshotBtn",
    "semanticIndexBtn",
    "goalState",
    "capabilityList",
    "toolCatalogList",
    "extensionCatalogList",
    "mcpProbeBtn",
    "mcpCatalogList",
    "assetCatalogList",
    "approvalList",
    "queueList",
    "processForm",
    "processList",
    "browserCheckForm",
    "browserCheckUrlInput",
    "browserSmokeCheck",
    "browserBaselineBtn",
    "browserScreenshotBtn",
    "browserDomBtn",
    "browserInteractBtn",
    "browserVisualBtn",
    "browserCheckResult"
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
    "/api/context-snapshot",
    "/api/semantic-index",
    "/api/semantic-search",
    "/api/semantic-references",
    "/api/pr-readiness",
    "/api/remote-pr-status",
    "/api/remote-publish-plan",
    "function renderBrowserCheck",
    "function renderBrowserBaseline",
    "function renderBrowserScreenshot",
    "function renderBrowserDom",
    "function renderBrowserInteract",
    "function renderBrowserVisual",
    "/api/health",
    "/api/tools",
    "/api/extensions",
    "/api/mcp",
    "/api/mcp?probe=1",
    "/api/mcp-tool-call",
    "/api/assets",
    "/api/asset-inspect",
    "/api/browser-check",
    "/api/browser-baseline",
    "/api/browser-screenshot",
    "/api/browser-dom",
    "/api/browser-interact",
    "/api/browser-visual",
    "/api/approval?id=",
    "/api/approval",
    "/api/approval-execute",
    "/api/review-comments",
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

async function runApiSmokeTest() {
  const originalWorkspace = currentWorkspace;
  currentWorkspace = APP_ROOT;
  const originalGoalState = await fs.readFile(GOAL_STATE_PATH, "utf8").catch(() => null);
  const originalContextSnapshot = await fs.readFile(CONTEXT_SNAPSHOT_PATH, "utf8").catch(() => null);
  const originalSemanticIndex = await fs.readFile(SEMANTIC_INDEX_PATH, "utf8").catch(() => null);
  const originalApprovals = await snapshotApprovalDir();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const cleanup = {
    queuePath: "",
    extraQueuePath: "",
    handoffPath: "",
    processFixturePath: "",
    extensionFixtureDir: "",
    mcpFixturePath: "",
    assetFixturePath: "",
    dataAssetFixturePath: "",
    documentAssetFixturePath: "",
    mediaAssetFixturePath: "",
    browserBaselinePath: "",
    browserScreenshotPath: "",
    browserVisualBaselinePath: "",
    browserVisualMetaPath: "",
    browserVisualDiffBaselinePath: "",
    browserVisualDiffMetaPath: "",
    browserVisualDiffPath: "",
    browserVisualScreenshotPaths: [],
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

    const browserCheck = await requestJson(baseUrl, "/api/browser-check", {
      method: "POST",
      body: JSON.stringify({ url: `${baseUrl}/` })
    });
    assertSmoke(browserCheck.ok === true, "browser check did not return ok=true for local app");
    assertSmoke(browserCheck.title, "browser check missing page title");
    assertSmoke(browserCheck.policy?.access === "local-url-only", "browser check missing local-url-only policy");

    const browserBaseline = await requestJson(baseUrl, "/api/browser-baseline", {
      method: "POST",
      body: JSON.stringify({ url: `${baseUrl}/`, name: "api smoke app shell" })
    });
    assertSmoke(browserBaseline.ok === true, "browser baseline did not create cleanly");
    assertSmoke(browserBaseline.updated === true, "browser baseline did not save initial fingerprint");
    cleanup.browserBaselinePath = path.join(APP_ROOT, browserBaseline.baselinePath);
    const browserBaselineMatch = await requestJson(baseUrl, "/api/browser-baseline", {
      method: "POST",
      body: JSON.stringify({ url: `${baseUrl}/` })
    });
    assertSmoke(browserBaselineMatch.status === "matched", "browser baseline did not match saved fingerprint");
    assertSmoke(browserBaselineMatch.diffs.length === 0, "browser baseline reported unexpected diffs");

    const browserScreenshot = await requestJson(baseUrl, "/api/browser-screenshot", {
      method: "POST",
      timeoutMs: 90000,
      body: JSON.stringify({ url: `${baseUrl}/`, width: 800, height: 600 })
    });
    assertSmoke(browserScreenshot.ok === true, "browser screenshot did not complete");
    assertSmoke(browserScreenshot.path.endsWith(".png"), "browser screenshot did not return png path");
    assertSmoke(browserScreenshot.size > 0, "browser screenshot was empty");
    cleanup.browserScreenshotPath = path.join(APP_ROOT, browserScreenshot.path);

    const browserDom = await requestJson(baseUrl, "/api/browser-dom", {
      method: "POST",
      timeoutMs: 90000,
      body: JSON.stringify({ url: `${baseUrl}/`, selectors: ["body", "#promptForm", "#browserCheckForm", "button"] })
    });
    assertSmoke(browserDom.ok === true, "browser DOM snapshot did not complete");
    assertSmoke(browserDom.bytes > 0, "browser DOM snapshot was empty");
    assertSmoke(browserDom.selectors.some((item) => item.selector === "#promptForm" && item.count >= 1), "browser DOM selector count missing #promptForm");

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
          { type: "click", selector: "#browserCheckUrlInput" },
          { type: "type", selector: "#browserCheckUrlInput", value: "api-smoke-interaction" },
          { type: "waitValue", selector: "#browserCheckUrlInput", value: "api-smoke-interaction" },
          { type: "clear", selector: "#browserCheckUrlInput" },
          { type: "type", selector: "#browserCheckUrlInput", value: "api-smoke-interaction" },
          { type: "press", selector: "#browserCheckUrlInput", key: "Enter" },
          { type: "waitText", selector: "#browserCheckUrlInput", value: "api-smoke-interaction" },
          { type: "hover", selector: "#refreshFilesBtn" },
          { type: "dblclick", selector: "#refreshFilesBtn" },
          { type: "select", selector: "#browserCheckUrlInput", value: "api-smoke-selected" },
          { type: "check", selector: "#browserSmokeCheck" },
          { type: "uncheck", selector: "#browserSmokeCheck" }
        ],
        selectors: ["body", "#browserCheckUrlInput", "[value=\"api-smoke-selected\"]", "#browserSmokeCheck"]
      })
    });
    assertSmoke(browserInteract.ok === true, "browser interaction did not complete");
    assertSmoke(browserInteract.policy?.domInteraction === true, "browser interaction missing DOM interaction policy evidence");
    assertSmoke(browserInteract.actions.length === 16, "browser interaction did not audit all actions");
    assertSmoke(browserInteract.policy?.allowedActions?.includes("waitText"), "browser interaction missing expanded action policy evidence");
    assertSmoke(browserInteract.policy?.allowedActions?.includes("waitValue"), "browser interaction missing waitValue policy evidence");
    assertSmoke(browserInteract.actions.some((item) => item.type === "press" && item.key === "Enter"), "browser interaction did not audit key press");
    assertSmoke(browserInteract.actions.some((item) => item.type === "hover"), "browser interaction did not audit hover action");
    assertSmoke(browserInteract.actions.some((item) => item.type === "dblclick"), "browser interaction did not audit double click action");
    assertSmoke(browserInteract.actions.some((item) => item.type === "clear"), "browser interaction did not audit clear action");
    assertSmoke(browserInteract.actions.some((item) => item.type === "navigate" && item.value.includes("api-smoke-nav=1")), "browser interaction did not audit navigate action");
    assertSmoke(browserInteract.actions.some((item) => item.type === "waiturl" && item.value === "api-smoke-nav=1"), "browser interaction did not audit waitUrl action");
    assertSmoke(browserInteract.actions.some((item) => item.type === "waitnetwork"), "browser interaction did not audit waitNetwork action");
    assertSmoke(browserInteract.actions.some((item) => item.type === "waitvalue" && item.value === "api-smoke-interaction"), "browser interaction did not audit waitValue action");
    assertSmoke(browserInteract.actions.some((item) => item.type === "check"), "browser interaction did not audit check action");
    assertSmoke(browserInteract.actions.some((item) => item.type === "uncheck"), "browser interaction did not audit uncheck action");
    assertSmoke(browserInteract.actions.some((item) => item.type === "select" && item.value === "api-smoke-selected"), "browser interaction did not audit select action");
    assertSmoke(browserInteract.selectors.some((item) => item.selector === "[value=\"api-smoke-selected\"]" && item.count >= 1), "browser interaction did not persist selected value in DOM evidence");

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

    const files = await requestJson(baseUrl, "/api/files");
    assertSmoke(Array.isArray(files.files), "files did not include file list");
    assertSmoke(files.repoMap && typeof files.repoMap === "object", "files did not include repoMap");

    const semanticIndex = await requestJson(baseUrl, "/api/semantic-index", { method: "POST" });
    assertSmoke(semanticIndex.index?.indexedFiles >= 1, "semantic index missing indexed files");
    assertSmoke(semanticIndex.index?.summary?.declarations >= 1, "semantic index missing declarations");
    assertSmoke(Array.isArray(semanticIndex.index?.imports), "semantic index missing imports");
    const semanticIndexRead = await requestJson(baseUrl, "/api/semantic-index");
    assertSmoke(semanticIndexRead.index?.generatedAt, "semantic index did not persist");
    const semanticSearch = await requestJson(baseUrl, "/api/semantic-search", {
      method: "POST",
      body: JSON.stringify({ query: "buildSemanticIndex", kind: "declaration", limit: 10 })
    });
    assertSmoke(semanticSearch.matchCount >= 1, "semantic search did not find declaration");
    assertSmoke(semanticSearch.matches.some((item) => item.path === "server.js"), "semantic search missing server.js match");
    const semanticReferences = await requestJson(baseUrl, "/api/semantic-references", {
      method: "POST",
      body: JSON.stringify({ symbol: "buildSemanticIndex", limit: 20, contextLines: 3 })
    });
    assertSmoke(semanticReferences.matchCount >= 1, "semantic references did not find symbol");
    assertSmoke(semanticReferences.declarations.some((item) => item.path === "server.js" && item.context.includes("buildSemanticIndex")), "semantic references missing declaration context");

    const capabilities = await requestJson(baseUrl, "/api/capabilities");
    assertSmoke(capabilities.capabilities.some((item) => item.area === "可恢复状态"), "capabilities endpoint missing resumable state");
    assertSmoke(capabilities.capabilities.some((item) => item.area === "模型运行层"), "capabilities endpoint missing model runtime layer");
    assertSmoke(capabilities.capabilities.some((item) => item.status !== "implemented"), "capabilities endpoint should expose remaining gaps");

    const tools = await requestJson(baseUrl, "/api/tools");
    assertSmoke(tools.tools.some((item) => item.name === "repo_map"), "tools endpoint missing repo_map");
    assertSmoke(tools.tools.some((item) => item.name === "semantic_index"), "tools endpoint missing semantic_index");
    assertSmoke(tools.tools.some((item) => item.name === "semantic_search"), "tools endpoint missing semantic_search");
    assertSmoke(tools.tools.some((item) => item.name === "semantic_references"), "tools endpoint missing semantic_references");
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
          command: process.execPath,
          args: [path.join(APP_ROOT, "server.js"), "--mcp-smoke-server"],
          env: { API_SMOKE_MCP: "1" }
        }
      }
    }, null, 2));
    const mcp = await requestJson(baseUrl, "/api/mcp");
    assertSmoke(mcp.servers.some((item) => item.name === "api-smoke-mcp"), "MCP endpoint missing fixture server");
    assertSmoke(mcp.summary.stdio >= 1, "MCP endpoint missing stdio summary");
    const mcpProbe = await requestJson(baseUrl, "/api/mcp?probe=1");
    const probedMcp = mcpProbe.servers.find((item) => item.name === "api-smoke-mcp");
    assertSmoke(probedMcp?.probe?.status === "probed", `MCP probe did not complete handshake: ${JSON.stringify(probedMcp?.probe || mcpProbe.errors || mcpProbe).slice(0, 1000)}`);
    assertSmoke(probedMcp?.probe?.counts?.tools === 1, "MCP probe missing tool listing");
    assertSmoke(probedMcp?.probe?.counts?.resources === 1, "MCP probe missing resource listing");
    assertSmoke(probedMcp?.probe?.counts?.prompts === 1, "MCP probe missing prompt listing");
    assertSmoke(mcpProbe.summary.probed >= 1, "MCP probe summary missing probed count");
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
    const approvedMcpToolCall = await requestJson(baseUrl, "/api/approval", {
      method: "PATCH",
      body: JSON.stringify({ id: mcpToolCallPlan.approval.id, decision: "approved", note: "api smoke MCP tool approval" })
    });
    assertSmoke(approvedMcpToolCall.status === "approved", "MCP tool approval did not update status");
    const mcpToolExecution = await requestJson(baseUrl, "/api/approval-execute", {
      method: "POST",
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

    cleanup.assetFixturePath = path.join(currentWorkspace, `.forge-asset-smoke-${Date.now()}.png`);
    await fs.writeFile(cleanup.assetFixturePath, createSmokePngBuffer({ r: 255, g: 0, b: 0, a: 255 }));
    cleanup.dataAssetFixturePath = path.join(currentWorkspace, `.forge-asset-smoke-${Date.now()}.csv`);
    await fs.writeFile(cleanup.dataAssetFixturePath, "name,value\nalpha,1\nbeta,2\n", "utf8");
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
    cleanup.mediaAssetFixturePath = path.join(currentWorkspace, `.forge-asset-smoke-${Date.now()}.wav`);
    await fs.writeFile(cleanup.mediaAssetFixturePath, createSmokeWavBuffer());
    const assets = await requestJson(baseUrl, "/api/assets");
    const assetFixtureName = toPosix(path.relative(currentWorkspace, cleanup.assetFixturePath));
    const dataAssetFixtureName = toPosix(path.relative(currentWorkspace, cleanup.dataAssetFixturePath));
    const documentAssetFixtureName = toPosix(path.relative(currentWorkspace, cleanup.documentAssetFixturePath));
    const mediaAssetFixtureName = toPosix(path.relative(currentWorkspace, cleanup.mediaAssetFixturePath));
    assertSmoke(assets.assets.some((item) => item.path === assetFixtureName && item.type === "image"), "assets endpoint missing image fixture");
    assertSmoke(assets.assets.some((item) => item.path === dataAssetFixtureName && item.type === "data"), "assets endpoint missing data fixture");
    assertSmoke(assets.assets.some((item) => item.path === documentAssetFixtureName && item.type === "document"), "assets endpoint missing document fixture");
    assertSmoke(assets.assets.some((item) => item.path === mediaAssetFixtureName && item.type === "media"), "assets endpoint missing media fixture");
    assertSmoke(assets.policy?.access === "metadata-and-inspection", "assets endpoint missing inspection policy");
    const imageInspection = await requestJson(baseUrl, `/api/asset-inspect?path=${encodeURIComponent(assetFixtureName)}`);
    assertSmoke(imageInspection.image?.format === "png", "asset inspection did not read png header");
    assertSmoke(imageInspection.image?.width === 1 && imageInspection.image?.height === 1, "asset inspection did not read png dimensions");
    assertSmoke(imageInspection.vision?.available === true, "asset inspection did not generate image vision summary");
    assertSmoke(imageInspection.vision?.summary?.dominantColors?.[0]?.color, "asset inspection missing dominant color");
    assertSmoke(imageInspection.ocr?.engine === "tesseract", "asset inspection missing OCR capability probe");
    const dataInspection = await requestJson(baseUrl, `/api/asset-inspect?path=${encodeURIComponent(dataAssetFixtureName)}`);
    assertSmoke(dataInspection.data?.headers?.includes("name"), "asset inspection did not parse csv headers");
    assertSmoke(dataInspection.data?.rows?.length >= 2, "asset inspection did not parse csv rows");
    const documentInspection = await requestJson(baseUrl, `/api/asset-inspect?path=${encodeURIComponent(documentAssetFixtureName)}`);
    assertSmoke(documentInspection.document?.packageType === "office-open-xml", "asset inspection did not identify OOXML document");
    assertSmoke(documentInspection.document?.textSample?.includes("Forge DOCX smoke text"), "asset inspection did not extract docx text");
    const mediaInspection = await requestJson(baseUrl, `/api/asset-inspect?path=${encodeURIComponent(mediaAssetFixtureName)}`);
    assertSmoke(mediaInspection.media?.format === "wav", "asset inspection did not parse wav media");
    assertSmoke(mediaInspection.media?.durationSeconds > 0, "asset inspection did not calculate media duration");
    assertSmoke(mediaInspection.transcription?.engine === "whisper", "asset inspection missing transcription engine probe");

    const queued = await requestJson(baseUrl, "/api/queue", {
      method: "POST",
      body: JSON.stringify({ prompt: "api smoke queued task", priority: 3, retryLimit: 2 })
    });
    assertSmoke(queued.id && queued.status === "queued", "queue create failed");
    assertSmoke(queued.priority === 3 && queued.retryLimit === 2, "queue create missing priority/retry metadata");
    cleanup.queuePath = path.join(QUEUE_DIR, `${queued.id}.json`);
    const queuedNext = await requestJson(baseUrl, "/api/queue", {
      method: "POST",
      body: JSON.stringify({ prompt: "api smoke next queued task", priority: 9, retryLimit: 1 })
    });
    cleanup.extraQueuePath = path.join(QUEUE_DIR, `${queuedNext.id}.json`);

    const active = await requestJson(baseUrl, "/api/queue", {
      method: "PATCH",
      body: JSON.stringify({ id: queued.id, status: "active" })
    });
    assertSmoke(active.status === "active", "queue activate failed");
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

    const queuedHealth = await requestJson(baseUrl, "/api/health");
    assertSmoke(queuedHealth.goal?.status === "active", "queue activation did not update goal state");

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

    const processSmokePort = 47000 + Math.floor(Math.random() * 1000);
    cleanup.processFixturePath = path.join(currentWorkspace, ".forge-process-smoke.js");
    await fs.writeFile(cleanup.processFixturePath, [
      "import http from 'node:http';",
      "const server = http.createServer((req, res) => res.end('forge process smoke'));",
      `server.listen(${processSmokePort}, '127.0.0.1', () => {`,
      "  const { port } = server.address();",
      "  console.log(`http://127.0.0.1:${port}`);",
      "  setTimeout(() => server.close(() => process.exit(0)), 12000);",
      "});",
      ""
    ].join("\n"), "utf8");
    const startedProcess = await requestJson(baseUrl, "/api/processes", {
      method: "POST",
      body: JSON.stringify({ command: "node .forge-process-smoke.js" })
    });
    assertSmoke(startedProcess.id && ["running", "exited"].includes(startedProcess.status), "managed process did not start");
    cleanup.processId = startedProcess.id;
    const startedEntry = managedProcesses.get(startedProcess.id);
    if (startedEntry) {
      startedEntry.probe = {
        port: processSmokePort,
        url: `http://127.0.0.1:${processSmokePort}`,
        status: "unknown",
        ok: false,
        statusCode: null,
        lastCheckedAt: "",
        lastError: ""
      };
    }

    let runningProcess = null;
    for (let attempt = 0; attempt < 60; attempt += 1) {
      await sleep(300);
      const runningProcesses = await requestJson(baseUrl, "/api/processes");
      runningProcess = runningProcesses.processes.find((item) => item.id === startedProcess.id);
      if (runningProcess?.probe?.status === "healthy") break;
    }
    assertSmoke(runningProcess, "started process missing from process list");
    assertSmoke(runningProcess.probe?.status === "healthy", "managed process probe did not become healthy");

    const processEntry = managedProcesses.get(startedProcess.id);
    if (processEntry) await waitForProcessExit(processEntry, 20000);
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

    const contextSnapshot = await requestJson(baseUrl, "/api/context-snapshot", { method: "POST" });
    assertSmoke(contextSnapshot.snapshot?.workspace === APP_ROOT, "context snapshot missing workspace");
    assertSmoke(contextSnapshot.snapshot?.fileCount >= 1, "context snapshot missing files");
    const contextSnapshotRead = await requestJson(baseUrl, "/api/context-snapshot");
    assertSmoke(contextSnapshotRead.snapshot?.generatedAt, "context snapshot did not persist");
    const healthWithSnapshot = await requestJson(baseUrl, "/api/health");
    assertSmoke(healthWithSnapshot.contextSnapshot?.generatedAt, "health missing context snapshot");

    const prReadiness = await requestJson(baseUrl, "/api/pr-readiness", {
      method: "POST",
      body: JSON.stringify({ prompt: "api smoke PR readiness" })
    });
    assertSmoke(prReadiness.policy?.pushes === false, "PR readiness should not push to remote");
    assertSmoke(prReadiness.policy?.createsRemotePr === false, "PR readiness should not create remote PR");
    assertSmoke(prReadiness.remote && typeof prReadiness.remote === "object", "PR readiness missing remote status");
    assertSmoke(Array.isArray(prReadiness.remotes), "PR readiness missing remotes array");
    assertSmoke(Array.isArray(prReadiness.ci), "PR readiness missing CI config array");
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
    assertSmoke(remotePublishPlan.approval?.id, "remote publish plan missing approval request");
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
      checked: ["health", "files", "capabilities", "tools", "extensions", "mcp", "mcp-probe", "mcp-tool-call", "assets", "asset-inspect", "browser-check", "browser-baseline", "browser-screenshot", "browser-dom", "browser-interact", "browser-visual", "model-runtime", "queue", "goal-state", "context-snapshot", "semantic-index", "semantic-search", "semantic-references", "reviews", "approvals", "approval-decision", "approval-execute", "command-policy", "processes", "process-lifecycle", "diff", "handoff", "pr-readiness", "remote-pr-status", "remote-publish-plan"],
      queueId: queued.id,
      handoffId: handoff.id
    }));
  } finally {
    if (cleanup.processId) await stopManagedProcess(cleanup.processId).catch(() => {});
    if (cleanup.processFixturePath) await fs.rm(cleanup.processFixturePath, { force: true }).catch(() => {});
    if (cleanup.extensionFixtureDir) await fs.rm(cleanup.extensionFixtureDir, { recursive: true, force: true }).catch(() => {});
    if (cleanup.mcpFixturePath) await fs.rm(cleanup.mcpFixturePath, { force: true }).catch(() => {});
    if (cleanup.assetFixturePath) await fs.rm(cleanup.assetFixturePath, { force: true }).catch(() => {});
    if (cleanup.dataAssetFixturePath) await fs.rm(cleanup.dataAssetFixturePath, { force: true }).catch(() => {});
    if (cleanup.documentAssetFixturePath) await fs.rm(cleanup.documentAssetFixturePath, { force: true }).catch(() => {});
    if (cleanup.mediaAssetFixturePath) await fs.rm(cleanup.mediaAssetFixturePath, { force: true }).catch(() => {});
    if (cleanup.browserBaselinePath) await fs.rm(cleanup.browserBaselinePath, { force: true }).catch(() => {});
    if (cleanup.browserScreenshotPath) await fs.rm(cleanup.browserScreenshotPath, { force: true }).catch(() => {});
    if (cleanup.browserVisualBaselinePath) await fs.rm(cleanup.browserVisualBaselinePath, { force: true }).catch(() => {});
    if (cleanup.browserVisualMetaPath) await fs.rm(cleanup.browserVisualMetaPath, { force: true }).catch(() => {});
    if (cleanup.browserVisualDiffBaselinePath) await fs.rm(cleanup.browserVisualDiffBaselinePath, { force: true }).catch(() => {});
    if (cleanup.browserVisualDiffMetaPath) await fs.rm(cleanup.browserVisualDiffMetaPath, { force: true }).catch(() => {});
    if (cleanup.browserVisualDiffPath) await fs.rm(cleanup.browserVisualDiffPath, { force: true }).catch(() => {});
    for (const screenshotPath of cleanup.browserVisualScreenshotPaths) {
      await fs.rm(screenshotPath, { force: true }).catch(() => {});
    }
    if (cleanup.queuePath) await fs.rm(cleanup.queuePath, { force: true }).catch(() => {});
    if (cleanup.extraQueuePath) await fs.rm(cleanup.extraQueuePath, { force: true }).catch(() => {});
    if (cleanup.handoffPath) await fs.rm(cleanup.handoffPath, { force: true }).catch(() => {});
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
    if (originalSemanticIndex === null) {
      await fs.rm(SEMANTIC_INDEX_PATH, { force: true }).catch(() => {});
    } else {
      await fs.mkdir(STATE_DIR, { recursive: true });
      await fs.writeFile(SEMANTIC_INDEX_PATH, originalSemanticIndex, "utf8");
    }
    currentWorkspace = originalWorkspace;
    server.closeIdleConnections?.();
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
  }
}

if (process.argv.includes("--mcp-smoke-server")) {
  runMcpSmokeServer();
} else if (process.argv.includes("--api-smoke-test")) {
  runApiSmokeTest().then(() => {
    process.exit(0);
  }).catch((error) => {
    console.error(error);
    process.exit(1);
  });
} else if (process.argv.includes("--ui-smoke-test")) {
  runUiSmokeTest().then(() => {
    process.exit(0);
  }).catch((error) => {
    console.error(error);
    process.exit(1);
  });
} else if (process.argv.includes("--smoke-test")) {
  runSmokeTest().then(() => {
    process.exit(0);
  }).catch((error) => {
    console.error(error);
    process.exit(1);
  });
} else {
  server.listen(PORT, "127.0.0.1", () => {
    console.log(`Forge Code running at http://127.0.0.1:${PORT}`);
    console.log(`Workspace: ${currentWorkspace}`);
    console.log(`DeepSeek key: ${process.env.DEEPSEEK_API_KEY ? "configured" : "missing"}`);
  });
}
