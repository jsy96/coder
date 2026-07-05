const log = document.querySelector("#log");
const form = document.querySelector("#promptForm");
const workspaceForm = document.querySelector("#workspaceForm");
const processForm = document.querySelector("#processForm");
const browserCheckForm = document.querySelector("#browserCheckForm");
const workspaceInput = document.querySelector("#workspaceInput");
const processCommandInput = document.querySelector("#processCommandInput");
const browserCheckUrlInput = document.querySelector("#browserCheckUrlInput");
const input = document.querySelector("#promptInput");
const toast = document.querySelector("#toast");
const replayBtn = document.querySelector("#replayBtn");
const approveBtn = document.querySelector("#approveBtn");
const rollbackBtn = document.querySelector("#rollbackBtn");
const attachBtn = document.querySelector("#attachBtn");
const refreshFilesBtn = document.querySelector("#refreshFilesBtn");
const newTaskBtn = document.querySelector("#newTaskBtn");
const runAgentBtn = document.querySelector("#runAgentBtn");
const runCommandsBtn = document.querySelector("#runCommandsBtn");
const startProcessBtn = document.querySelector("#startProcessBtn");
const browserBaselineBtn = document.querySelector("#browserBaselineBtn");
const browserScreenshotBtn = document.querySelector("#browserScreenshotBtn");
const worktreeBtn = document.querySelector("#worktreeBtn");
const reviewBtn = document.querySelector("#reviewBtn");
const queueBtn = document.querySelector("#queueBtn");
const handoffBtn = document.querySelector("#handoffBtn");
const planSteps = document.querySelector("#planSteps");
const goalState = document.querySelector("#goalState");
const diffList = document.querySelector("#diffList");
const diffSummary = document.querySelector("#diffSummary");
const checksList = document.querySelector("#checksList");
const reviewList = document.querySelector("#reviewList");
const reviewArtifactList = document.querySelector("#reviewArtifactList");
const approvalList = document.querySelector("#approvalList");
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
const taskList = document.querySelector("#taskList");
const capabilityList = document.querySelector("#capabilityList");
const toolCatalogList = document.querySelector("#toolCatalogList");
const extensionCatalogList = document.querySelector("#extensionCatalogList");
const mcpCatalogList = document.querySelector("#mcpCatalogList");
const assetCatalogList = document.querySelector("#assetCatalogList");
const runState = document.querySelector("#runState");

const state = {
  files: [],
  pendingPatches: [],
  pendingDiff: "",
  pendingCommands: [],
  lastPrompt: "",
  checkpoints: [],
  restoredProposalId: "",
  busy: false
};

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

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove("show"), 2600);
}

function setBusy(value, label = "待命") {
  state.busy = value;
  runAgentBtn.disabled = value;
  approveBtn.disabled = value;
  rollbackBtn.disabled = value;
  runCommandsBtn.disabled = value;
  if (startProcessBtn) startProcessBtn.disabled = value;
  if (reviewBtn) reviewBtn.disabled = value;
  if (worktreeBtn) worktreeBtn.disabled = value;
  if (queueBtn) queueBtn.disabled = value;
  if (handoffBtn) handoffBtn.disabled = value;
  runState.lastChild.textContent = value ? "运行中" : label;
}

function appendMessage(role, text) {
  const article = document.createElement("article");
  article.className = `message ${role}`;
  article.innerHTML = `<span>${role === "user" ? "你" : "Forge"}</span><p></p>`;
  article.querySelector("p").textContent = text;
  log.appendChild(article);
  log.scrollTop = log.scrollHeight;
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

function renderFiles(files = []) {
  state.files = files;
  fileList.innerHTML = "";
  if (!files.length) {
    fileList.textContent = "没有找到可读取的文本文件";
    return;
  }
  files.slice(0, 80).forEach((file) => {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "file-row";
    row.textContent = file.path;
    row.addEventListener("click", async () => {
      try {
        const data = await api(`/api/file?path=${encodeURIComponent(file.path)}`);
        appendToolCall({
          title: `读取文件：${file.path}`,
          label: "cat",
          state: "完成",
          body: data.content.slice(0, 5000)
        });
      } catch (error) {
        showToast(error.message);
      }
    });
    fileList.appendChild(row);
  });
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

function renderDiff(patches = []) {
  state.pendingPatches = patches;
  diffList.innerHTML = "";
  if (!patches.length) {
    diffSummary.textContent = "暂无修改";
    diffList.innerHTML = `<div class="empty-state">本次没有建议写入的 diff。</div>`;
    return;
  }
  diffSummary.textContent = `${patches.length} 个文件`;
  patches.forEach((patch) => {
    const item = document.createElement("div");
    item.className = "diff-file";
    item.innerHTML = `<header></header><pre></pre>`;
    item.querySelector("header").textContent = patch.path;
    item.querySelector("pre").textContent = patch.diff || "新文件或完整替换内容将在批准后写入。";
    diffList.appendChild(item);
  });
}

function renderCheckpoints(checkpoints = []) {
  state.checkpoints = checkpoints;
  rollbackBtn.textContent = checkpoints.length ? `回滚 ${checkpoints[0].slice(0, 19)}` : "回滚";
}

function renderCommands(commands = []) {
  state.pendingCommands = commands;
  checksList.innerHTML = "";
  if (!commands.length) {
    checksList.innerHTML = `
      <div class="check-row queued">
        <span></span>
        DeepSeek 未建议运行命令
      </div>
    `;
    return;
  }
  commands.forEach((command) => {
    const row = document.createElement("div");
    row.className = "check-row queued command-row";
    row.innerHTML = `<span></span><code></code><small></small>`;
    row.querySelector("code").textContent = command.command || command;
    const policy = command.policy;
    row.querySelector("small").textContent = [
      command.reason || "",
      policy ? `policy: ${policy.risk} · ${policy.reason}` : ""
    ].filter(Boolean).join(" · ");
    checksList.appendChild(row);
  });
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
    row.innerHTML = `<strong></strong><p></p><small></small>`;
    row.querySelector("strong").textContent = item.severity || "info";
    row.querySelector("p").textContent = item.message || "";
    row.querySelector("small").textContent = [item.file, item.line].filter(Boolean).join(":");
    reviewList.appendChild(row);
  });
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
    row.innerHTML = `<strong></strong><small></small><button type="button">查看</button>`;
    row.querySelector("strong").textContent = artifact.summary || artifact.prompt || artifact.id;
    row.querySelector("small").textContent = `${artifact.findingCount || 0} 条发现 · ${artifact.commandCount || 0} 条命令 · ${artifact.createdAt?.slice(0, 19) || ""}`;
    row.querySelector("button").addEventListener("click", async () => {
      try {
        const detail = await api(`/api/review-artifact?id=${encodeURIComponent(artifact.id)}`);
        appendToolCall({
          title: `审查记录：${artifact.id}`,
          label: "review",
          state: "完成",
          body: JSON.stringify(detail, null, 2).slice(0, 12000)
        });
      } catch (error) {
        showToast(error.message);
      }
    });
    reviewArtifactList.appendChild(row);
  });
}

function renderVerification(verification) {
  if (!verification?.checks?.length) {
    checksList.innerHTML = `
      <div class="check-row queued">
        <span></span>
        未发现可自动运行的检查命令
      </div>
    `;
    return;
  }
  checksList.innerHTML = "";
  verification.checks.forEach((check) => {
    const row = document.createElement("div");
    row.className = `check-row command-row ${check.exitCode === 0 ? "passed" : "failed"}`;
    row.innerHTML = `<span></span><code></code><small></small>`;
    row.querySelector("code").textContent = check.command;
    row.querySelector("small").textContent = [
      check.exitCode === 0 ? "通过" : `失败 exit ${check.exitCode}`,
      check.policy ? `policy: ${check.policy.risk}` : ""
    ].filter(Boolean).join(" · ");
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
    row.innerHTML = `<strong></strong><small></small>`;
    row.querySelector("strong").textContent = task.prompt || "(无提示词)";
    row.querySelector("small").textContent = `${task.status || "unknown"} · ${(task.changedFiles || []).join(", ") || "无文件"}`;
    row.addEventListener("click", async () => {
      try {
        const detail = await api(`/api/task?id=${encodeURIComponent(task.id)}`);
        appendToolCall({
          title: `任务详情：${task.id}`,
          label: "log",
          state: "完成",
          body: JSON.stringify(detail, null, 2).slice(0, 12000)
        });
      } catch (error) {
        showToast(error.message);
      }
    });
    taskList.appendChild(row);
  });
}

function renderCapabilities(audit) {
  if (!capabilityList) return;
  capabilityList.innerHTML = "";
  const capabilities = audit?.capabilities || [];
  if (!capabilities.length) {
    capabilityList.textContent = "暂无能力矩阵";
    return;
  }
  capabilities.slice(0, 8).forEach((capability) => {
    const row = document.createElement("div");
    row.className = `capability-row ${capability.status || "partial"}`;
    row.innerHTML = `<strong></strong><small></small>`;
    row.querySelector("strong").textContent = capability.area || "能力";
    row.querySelector("small").textContent = `${capability.status || "unknown"} · ${capability.next || ""}`;
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
    row.innerHTML = `<strong></strong><small></small>`;
    row.querySelector("strong").textContent = tool.name || "tool";
    row.querySelector("small").textContent = `${tool.policy?.access || "unknown"} · ${tool.description || ""}`;
    row.addEventListener("click", () => {
      appendToolCall({
        title: `工具详情：${tool.name}`,
        label: "tool",
        state: tool.policy?.source || "builtin",
        body: JSON.stringify(tool, null, 2)
      });
    });
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
    row.innerHTML = `<strong></strong><small></small>`;
    row.querySelector("strong").textContent = extension.name || "extension";
    row.querySelector("small").textContent = `${extension.type || "extension"} · ${extension.policy?.access || "declared"} · ${extension.description || ""}`;
    row.addEventListener("click", () => {
      appendToolCall({
        title: `扩展详情：${extension.name}`,
        label: "extension",
        state: extension.type || "local",
        body: JSON.stringify(extension, null, 2)
      });
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
    row.className = `capability-row ${server.disabled ? "missing" : "partial"}`;
    row.innerHTML = `<strong></strong><small></small>`;
    row.querySelector("strong").textContent = server.name || "mcp-server";
    row.querySelector("small").textContent = `${server.transport || "stdio"} · ${server.status || "configured"} · ${server.source || ""}`;
    row.addEventListener("click", () => {
      appendToolCall({
        title: `MCP 详情：${server.name}`,
        label: "mcp",
        state: server.status || "configured",
        body: JSON.stringify(server, null, 2)
      });
    });
    mcpCatalogList.appendChild(row);
  });
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
    row.innerHTML = `<strong></strong><small></small>`;
    row.querySelector("strong").textContent = asset.path || "asset";
    row.querySelector("small").textContent = `${asset.type || "asset"} · ${asset.ext || ""} · ${Math.round((asset.size || 0) / 1024)} KB`;
    row.addEventListener("click", () => {
      appendToolCall({
        title: `资产详情：${asset.path}`,
        label: "asset",
        state: asset.type || "metadata",
        body: JSON.stringify(asset, null, 2)
      });
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
  const verification = goal?.lastVerification
    ? `验证：${goal.lastVerification.skipped ? "跳过" : goal.lastVerification.ok ? "通过" : "失败"} · ${goal.lastVerification.checkCount || 0} 项`
    : "验证：暂无";
  goalState.querySelector("p").textContent = objective;
  goalState.querySelector("small").textContent = `${phase} / ${status} · ${verification} · 下一步：${nextStep}`;
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
    row.innerHTML = `<strong></strong><small></small><button type="button"></button>`;
    row.querySelector("strong").textContent = item.prompt || "(无提示词)";
    row.querySelector("small").textContent = `${item.status || "queued"} · ${item.createdAt?.slice(0, 19) || ""}`;
    row.querySelector("button").textContent = item.status === "active" ? "完成" : "激活";
    row.querySelector("button").addEventListener("click", async () => {
      const nextStatus = item.status === "active" ? "done" : "active";
      try {
        await api("/api/queue", {
          method: "PATCH",
          body: JSON.stringify({ id: item.id, status: nextStatus })
        });
        if (nextStatus === "active") {
          input.value = item.prompt || "";
          state.lastPrompt = item.prompt || "";
        }
        await refreshHealth();
      } catch (error) {
        showToast(error.message);
      }
    });
    queueList.appendChild(row);
  });
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
    row.innerHTML = `<strong></strong><small></small><button type="button"></button>`;
    row.querySelector("strong").textContent = item.command || item.id;
    row.querySelector("small").textContent = [
      item.status || "unknown",
      `pid ${item.pid || "-"}`,
      `policy: ${item.policy?.risk || "-"}`,
      item.probe ? `probe: ${item.probe.status} ${item.probe.url}` : ""
    ].filter(Boolean).join(" · ");
    const button = row.querySelector("button");
    button.textContent = item.status === "running" ? "停止" : "输出";
    button.addEventListener("click", async () => {
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
      }
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
  browserCheckResult.innerHTML = "";
  const row = document.createElement("div");
  row.className = `queue-row ${result.ok ? "done" : "failed"}`;
  row.innerHTML = `<strong></strong><small></small><button type="button">详情</button>`;
  row.querySelector("strong").textContent = result.title || result.finalUrl || result.url || "页面检查";
  row.querySelector("small").textContent = [
    `HTTP ${result.status || "-"}`,
    `${result.elapsedMs || 0}ms`,
    `${result.counts?.buttons || 0} buttons`,
    `${result.counts?.forms || 0} forms`
  ].join(" · ");
  row.querySelector("button").addEventListener("click", () => {
    appendToolCall({
      title: `页面检查：${result.finalUrl || result.url}`,
      label: "browser",
      state: result.ok ? "通过" : "失败",
      body: JSON.stringify(result, null, 2).slice(0, 12000)
    });
  });
  browserCheckResult.appendChild(row);
}

function renderBrowserBaseline(result) {
  if (!browserCheckResult) return;
  browserCheckResult.innerHTML = "";
  const row = document.createElement("div");
  row.className = `queue-row ${result.ok ? "done" : "failed"}`;
  row.innerHTML = `<strong></strong><small></small><button type="button">详情</button>`;
  row.querySelector("strong").textContent = result.name || result.url || "页面基线";
  row.querySelector("small").textContent = [
    result.status || "unknown",
    `${result.diffs?.length || 0} diffs`,
    result.updated ? "baseline saved" : "baseline checked"
  ].join(" · ");
  row.querySelector("button").addEventListener("click", () => {
    appendToolCall({
      title: `页面基线：${result.url}`,
      label: "visual",
      state: result.status || "unknown",
      body: JSON.stringify(result, null, 2).slice(0, 12000)
    });
  });
  browserCheckResult.appendChild(row);
}

function renderBrowserScreenshot(result) {
  if (!browserCheckResult) return;
  browserCheckResult.innerHTML = "";
  const row = document.createElement("div");
  row.className = `queue-row ${result.ok ? "done" : "failed"}`;
  row.innerHTML = `<strong></strong><small></small><button type="button">详情</button>`;
  row.querySelector("strong").textContent = result.path || result.url || "页面截图";
  row.querySelector("small").textContent = [
    `${result.width || "-"}x${result.height || "-"}`,
    `${Math.round((result.size || 0) / 1024)} KB`,
    result.policy?.screenshots ? "screenshot saved" : "no screenshot"
  ].join(" · ");
  row.querySelector("button").addEventListener("click", () => {
    appendToolCall({
      title: `页面截图：${result.url}`,
      label: "visual",
      state: result.ok ? "完成" : "失败",
      body: JSON.stringify(result, null, 2).slice(0, 12000)
    });
  });
  browserCheckResult.appendChild(row);
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
    row.className = "queue-row failed";
    row.innerHTML = `<strong></strong><small></small><button type="button">查看</button>`;
    row.querySelector("strong").textContent = approval.command || approval.type || approval.id;
    row.querySelector("small").textContent = `${approval.type || "command"} · ${approval.risk || "blocked"} · ${approval.reason || ""}`;
    row.querySelector("button").addEventListener("click", async () => {
      try {
        const detail = await api(`/api/approval?id=${encodeURIComponent(approval.id)}`);
        appendToolCall({
          title: `审批请求：${approval.id}`,
          label: "policy",
          state: detail.status || "blocked",
          body: JSON.stringify(detail, null, 2).slice(0, 12000)
        });
      } catch (error) {
        showToast(error.message);
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
  renderTasks(data.tasks || []);
  renderCapabilities(data.capabilities);
  renderToolCatalog(data.tools);
  renderExtensionCatalog(data.extensions);
  renderMcpCatalog(data.mcp);
  renderAssetCatalog(data.assets);
  renderGoal(data.goal);
  restorePendingProposal(data.goal);
  renderReviewArtifacts(data.reviews || []);
  renderApprovals(data.approvals || []);
  renderQueue(data.queue || []);
  renderProcesses(data.processes || []);
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

async function refreshAssetCatalog() {
  const data = await api("/api/assets");
  renderAssetCatalog(data);
}

async function refreshFiles() {
  const data = await api("/api/files");
  renderFiles(data.files);
  const used = Math.min(100, Math.round((data.contextBytes / data.contextLimitBytes) * 100));
  contextMeter.style.width = `${used}%`;
  const repoSummary = summarizeRepoMap(data.repoMap);
  contextText.textContent = `${data.files.length} 个文本文件，约 ${Math.round(data.contextBytes / 1024)} KB 上下文${repoSummary ? `；${repoSummary}` : ""}`;
}

async function refreshAll() {
  try {
    await refreshHealth();
    await refreshToolCatalog();
    await refreshExtensionCatalog();
    await refreshMcpCatalog();
    await refreshAssetCatalog();
    await refreshFiles();
  } catch (error) {
    runState.lastChild.textContent = "后端离线";
    workspaceStatus.textContent = "请先运行 node server.js";
    showToast(error.message);
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const prompt = input.value.trim();
  if (!prompt) {
    showToast("请先描述一个具体的代码改动。");
    input.focus();
    return;
  }

  appendMessage("user", prompt);
  state.lastPrompt = prompt;
  input.value = "";
  setBusy(true);
  renderPlan(["列出工作区文件", "按需读取/搜索关键文件", "生成 unified diff、审查和检查命令"]);
  renderReview([]);
  appendToolCall({
    title: "读取工作区上下文",
    label: "ctx",
    state: "运行中",
    body: `${state.files.length} 个候选文件`
  });

  try {
    const result = await api("/api/agent", {
      method: "POST",
      body: JSON.stringify({ prompt })
    });
    appendMessage("agent", result.reply);
    renderPlan(result.plan);
    state.pendingDiff = result.diff || "";
    renderDiff(result.patches);
    renderCommands(result.commands);
    renderReview(result.review || []);
    const toolLogText = (result.toolLog || [])
      .map((item) => `${item.name} ${JSON.stringify(item.args)}`)
      .join("\n");
    appendToolCall({
      title: "模型工具循环完成",
      label: "ai",
      state: "完成",
      body: [
        `模型：${result.model}`,
        `fallback：${(result.modelRuntime?.lastFallbacks || []).length} 次`,
        `工具调用：${(result.toolLog || []).length} 次`,
        `建议修改：${result.patches.length} 个文件`,
        `检查命令：${result.commands.length} 条`,
        `审查发现：${(result.review || []).length} 条`,
        toolLogText ? `\n${toolLogText}` : ""
      ].filter(Boolean).join("\n")
    });
    setBusy(false, "待审批");
  } catch (error) {
    appendMessage("agent", `请求失败：${error.message}`);
    setBusy(false, "失败");
  }
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
    renderPlan([]);
    renderDiff([]);
    renderCommands([]);
    renderReview([]);
    await refreshAll();
    setBusy(false, "待命");
  } catch (error) {
    showToast(error.message);
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
    appendToolCall({ title: "创建隔离 worktree 失败", label: "git", state: "失败", body: error.message });
    setBusy(false, "失败");
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
      body: JSON.stringify({ prompt })
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
    setBusy(false, "入队失败");
  }
});

approveBtn.addEventListener("click", async () => {
  if (!state.pendingDiff) {
    showToast("当前没有可写入的 diff。");
    return;
  }
  setBusy(true);
  try {
    const result = await api("/api/apply", {
      method: "POST",
      body: JSON.stringify({
        diff: state.pendingDiff,
        prompt: state.lastPrompt,
        commands: state.pendingCommands
      })
    });
    appendToolCall({
      title: "diff 已写入工作区",
      label: "fs",
      state: "完成",
      body: `checkpoint：${result.checkpoint.id}\n\n${result.applied.map((item) => item.path).join("\n")}`
    });
    renderVerification(result.verification);
    if (result.repair?.diff) {
      state.pendingDiff = result.repair.diff;
      renderDiff(result.repair.patches || []);
      renderReview(result.repair.review || []);
      appendMessage("agent", `${result.repair.reply} 修复 diff 已放入预览区，可再次批准写入。`);
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
      setBusy(false, result.verification?.skipped ? "未验证" : result.verification?.ok ? "已验证" : "检查失败");
    }
    if (result.git) renderGit(result.git);
    await refreshHealth();
    await refreshFiles();
  } catch (error) {
    showToast(error.message);
    setBusy(false, "写入失败");
  }
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
    setBusy(false, "回滚失败");
  }
});

runCommandsBtn.addEventListener("click", async () => {
  if (!state.pendingCommands.length) {
    showToast("当前没有建议命令。");
    return;
  }
  setBusy(true);
  for (const item of state.pendingCommands) {
    const command = item.command || item;
    appendToolCall({ title: `运行命令：${command}`, label: "$", state: "运行中", body: "" });
    try {
      const result = await api("/api/command", {
        method: "POST",
        body: JSON.stringify({ command })
      });
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
      if (result.exitCode !== 0) {
        if (result.blocked) {
          appendMessage("agent", `命令被安全策略拒绝：${result.policy?.reason || "未通过策略"}`);
          break;
        }
        const repair = await api("/api/repair-command", {
          method: "POST",
          body: JSON.stringify({
            prompt: state.lastPrompt || input.value.trim(),
            command,
            result
          })
        });
        if (repair.diff) {
          state.pendingDiff = repair.diff;
          renderDiff(repair.patches || []);
          renderReview(repair.review || []);
          renderCommands(repair.commands || []);
          appendMessage("agent", `${repair.reply} 修复 diff 已放入预览区，可批准写入。`);
        } else {
          appendMessage("agent", repair.reply || "命令失败，但没有生成可安全应用的修复 diff。");
        }
        break;
      }
    } catch (error) {
      appendToolCall({ title: `命令失败：${command}`, label: "$", state: "失败", body: error.message });
      break;
    }
  }
  setBusy(false, "待命");
});

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
    appendToolCall({ title: "复核当前改动失败", label: "review", state: "失败", body: error.message });
    setBusy(false, "复核失败");
  }
});

handoffBtn?.addEventListener("click", async () => {
  setBusy(true, "生成中");
  try {
    const handoff = await api("/api/handoff", {
      method: "POST",
      body: JSON.stringify({ prompt: state.lastPrompt || input.value.trim() })
    });
    appendToolCall({
      title: "PR/交付草稿已生成",
      label: "pr",
      state: "完成",
      body: `path: ${handoff.path}\n\n${handoff.body.slice(0, 12000)}`
    });
    setBusy(false, "已生成");
  } catch (error) {
    showToast(error.message);
    appendToolCall({ title: "生成交付草稿失败", label: "pr", state: "失败", body: error.message });
    setBusy(false, "生成失败");
  }
});

processForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const command = processCommandInput?.value.trim();
  if (!command) {
    showToast("请输入要启动的受管进程命令。");
    return;
  }
  setBusy(true, "启动进程");
  try {
    const process = await api("/api/processes", {
      method: "POST",
      body: JSON.stringify({ command })
    });
    appendToolCall({
      title: process.blocked ? `进程命令已拒绝：${command}` : `已启动受管进程：${command}`,
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
    if (!process.blocked && processCommandInput) processCommandInput.value = "";
    await refreshHealth();
    setBusy(false, process.blocked ? "已拒绝" : "已启动");
  } catch (error) {
    showToast(error.message);
    appendToolCall({ title: `启动进程失败：${command}`, label: "proc", state: "失败", body: error.message });
    setBusy(false, "启动失败");
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
    appendToolCall({ title: `页面检查失败：${targetUrl}`, label: "browser", state: "失败", body: error.message });
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
    appendToolCall({ title: `页面基线失败：${targetUrl}`, label: "visual", state: "失败", body: error.message });
    setBusy(false, "基线失败");
  }
});

browserScreenshotBtn?.addEventListener("click", async () => {
  const targetUrl = browserCheckUrlInput?.value.trim();
  if (!targetUrl) {
    showToast("请输入本地页面 URL。");
    return;
  }
  setBusy(true, "生成截图");
  try {
    const result = await api("/api/browser-screenshot", {
      method: "POST",
      body: JSON.stringify({ url: targetUrl })
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
    appendToolCall({ title: `页面截图失败：${targetUrl}`, label: "visual", state: "失败", body: error.message });
    setBusy(false, "截图失败");
  }
});

newTaskBtn.addEventListener("click", () => {
  log.innerHTML = "";
  state.pendingPatches = [];
  state.pendingDiff = "";
  state.pendingCommands = [];
  state.lastPrompt = "";
  renderPlan([]);
  renderDiff([]);
  renderCommands([]);
  renderReview([]);
  appendMessage("agent", "新会话已创建。描述你想对当前工作区做的改动即可。");
});

replayBtn.addEventListener("click", refreshAll);
attachBtn.addEventListener("click", async () => {
  await refreshFiles();
  showToast("上下文已重新加载。");
});
refreshFilesBtn.addEventListener("click", refreshFiles);

input.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
    form.requestSubmit();
  }
});

refreshAll();
