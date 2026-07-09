#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const APP_ROOT = path.resolve(path.dirname(__filename), "..");
const workspace = path.resolve(process.env.FORGE_WORKSPACE || APP_ROOT);
const MAX_READ_BYTES = 80 * 1024;

const TEXT_EXTS = new Set([
  ".c", ".cc", ".cpp", ".cs", ".css", ".go", ".h", ".html", ".java", ".js", ".json", ".jsx",
  ".md", ".mjs", ".php", ".py", ".rb", ".rs", ".scss", ".sh", ".sql", ".ts", ".tsx", ".txt",
  ".vue", ".xml", ".yaml", ".yml"
]);

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function rpcResult(id, result = {}) {
  send({ jsonrpc: "2.0", id, result });
}

function rpcError(id, code, message) {
  send({ jsonrpc: "2.0", id, error: { code, message } });
}

function insideWorkspace(fullPath) {
  const relative = path.relative(workspace, fullPath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function safeWorkspacePath(input = "") {
  const normalized = String(input || "").replace(/\\/g, "/").replace(/^\/+/, "");
  const full = path.resolve(workspace, normalized);
  if (!insideWorkspace(full)) throw new Error("Path is outside the configured workspace.");
  return full;
}

function toWorkspacePath(fullPath) {
  return path.relative(workspace, fullPath).replace(/\\/g, "/") || ".";
}

async function readTextFile(relativePath, maxBytes = MAX_READ_BYTES) {
  const full = safeWorkspacePath(relativePath);
  const stat = await fs.stat(full);
  if (!stat.isFile()) throw new Error("Path is not a file.");
  if (stat.size > maxBytes) {
    const handle = await fs.open(full, "r");
    try {
      const buffer = Buffer.alloc(maxBytes);
      const { bytesRead } = await handle.read(buffer, 0, maxBytes, 0);
      return `${buffer.subarray(0, bytesRead).toString("utf8")}\n\n[truncated at ${maxBytes} bytes]`;
    } finally {
      await handle.close();
    }
  }
  return fs.readFile(full, "utf8");
}

async function walkFiles(dir, { query = "", limit = 40, depth = 0 } = {}) {
  if (depth > 4) return [];
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  const results = [];
  for (const entry of entries) {
    if (results.length >= limit) break;
    if (entry.name === ".git" || entry.name === ".forge" || entry.name === "node_modules") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...await walkFiles(full, { query, limit: limit - results.length, depth: depth + 1 }));
      continue;
    }
    if (!entry.isFile()) continue;
    const relative = toWorkspacePath(full);
    const ext = path.extname(entry.name).toLowerCase();
    if (query && !relative.toLowerCase().includes(query.toLowerCase())) continue;
    if (!TEXT_EXTS.has(ext)) continue;
    results.push(relative);
  }
  return results;
}

async function workspaceSearch(args = {}) {
  const query = String(args.query || "").trim();
  const limit = Math.min(80, Math.max(1, Number(args.limit) || 40));
  const files = await walkFiles(workspace, { query, limit });
  return {
    workspace,
    query,
    count: files.length,
    files
  };
}

async function workspaceRead(args = {}) {
  const file = String(args.path || args.file || "").trim();
  if (!file) throw new Error("path is required.");
  const text = await readTextFile(file);
  return {
    path: file,
    text
  };
}

async function readResource(uri = "") {
  if (uri === "forge://workspace/readme") {
    return {
      contents: [{
        uri,
        mimeType: "text/markdown",
        text: await readTextFile("README.md").catch((error) => `README.md unavailable: ${error.message}`)
      }]
    };
  }
  if (uri === "forge://workspace/package") {
    return {
      contents: [{
        uri,
        mimeType: "application/json",
        text: await readTextFile("package.json").catch((error) => `package.json unavailable: ${error.message}`)
      }]
    };
  }
  throw new Error(`Unknown resource: ${uri}`);
}

async function handleRequest(message) {
  if (!message || typeof message !== "object") return;
  const { id, method, params = {} } = message;
  try {
    if (method === "initialize") {
      rpcResult(id, {
        protocolVersion: "2024-11-05",
        capabilities: {
          tools: {},
          resources: {},
          prompts: {}
        },
        serverInfo: {
          name: "forge-local-workspace",
          version: "0.1.0"
        }
      });
      return;
    }
    if (method === "tools/list") {
      rpcResult(id, {
        tools: [
          {
            name: "workspace_search",
            description: "Search text-like project files by path fragment. Read-only.",
            inputSchema: {
              type: "object",
              properties: {
                query: { type: "string" },
                limit: { type: "number" }
              }
            }
          },
          {
            name: "workspace_read",
            description: "Read a small text file from the current workspace. Read-only.",
            inputSchema: {
              type: "object",
              required: ["path"],
              properties: {
                path: { type: "string" }
              }
            }
          }
        ]
      });
      return;
    }
    if (method === "tools/call") {
      const name = String(params.name || "");
      const args = params.arguments && typeof params.arguments === "object" ? params.arguments : {};
      const payload = name === "workspace_search"
        ? await workspaceSearch(args)
        : name === "workspace_read"
          ? await workspaceRead(args)
          : null;
      if (!payload) throw new Error(`Unknown tool: ${name}`);
      rpcResult(id, {
        content: [{
          type: "text",
          text: JSON.stringify(payload, null, 2)
        }]
      });
      return;
    }
    if (method === "resources/list") {
      rpcResult(id, {
        resources: [
          {
            uri: "forge://workspace/readme",
            name: "Project README",
            description: "Current project README.md.",
            mimeType: "text/markdown"
          },
          {
            uri: "forge://workspace/package",
            name: "Package Manifest",
            description: "Current project package.json.",
            mimeType: "application/json"
          }
        ]
      });
      return;
    }
    if (method === "resources/read") {
      rpcResult(id, await readResource(String(params.uri || "")));
      return;
    }
    if (method === "prompts/list") {
      rpcResult(id, {
        prompts: [{
          name: "debug_local_project",
          description: "Collect local project context before debugging.",
          arguments: [{
            name: "target",
            description: "Optional file, command, or bug target.",
            required: false
          }]
        }]
      });
      return;
    }
    if (method === "prompts/get") {
      rpcResult(id, {
        description: "Local debugging prompt for Forge Code.",
        messages: [{
          role: "user",
          content: {
            type: "text",
            text: `Inspect the current workspace before debugging. Target: ${params.arguments?.target || "not specified"}`
          }
        }]
      });
      return;
    }
    if (id !== undefined) rpcError(id, -32601, `Method not found: ${method}`);
  } catch (error) {
    if (id !== undefined) rpcError(id, -32000, error.message || String(error));
  }
}

let buffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  while (buffer.includes("\n")) {
    const index = buffer.indexOf("\n");
    const line = buffer.slice(0, index).trim();
    buffer = buffer.slice(index + 1);
    if (!line) continue;
    try {
      handleRequest(JSON.parse(line));
    } catch (error) {
      send({ jsonrpc: "2.0", error: { code: -32700, message: error.message || String(error) } });
    }
  }
});

