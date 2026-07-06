const log = document.querySelector("#log");
const form = document.querySelector("#promptForm");
const workspaceForm = document.querySelector("#workspaceForm");
const processForm = document.querySelector("#processForm");
const processSearchForm = document.querySelector("#processSearchForm");
const processSearchBtn = document.querySelector("#processSearchBtn");
const processHistoryBtn = document.querySelector("#processHistoryBtn");
const processHealthBtn = document.querySelector("#processHealthBtn");
const queueIsolationBtn = document.querySelector("#queueIsolationBtn");
const browserCheckForm = document.querySelector("#browserCheckForm");
const workspaceInput = document.querySelector("#workspaceInput");
const processCommandInput = document.querySelector("#processCommandInput");
const processSearchInput = document.querySelector("#processSearchInput");
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
const startProcessBtn = document.querySelector("#startProcessBtn");
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
const conflictResolutionPanel = document.querySelector("#conflictResolutionPanel");
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
const threadList = document.querySelector("#threadList");
const taskList = document.querySelector("#taskList");
const capabilityList = document.querySelector("#capabilityList");
const toolCatalogList = document.querySelector("#toolCatalogList");
const extensionCatalogList = document.querySelector("#extensionCatalogList");
const mcpCatalogList = document.querySelector("#mcpCatalogList");
const mcpProbeBtn = document.querySelector("#mcpProbeBtn");
const assetCatalogList = document.querySelector("#assetCatalogList");
const runState = document.querySelector("#runState");

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
  contextRollup: null
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

async function runAgentRequest(prompt) {
  if (!window.ReadableStream) {
    return await api("/api/agent", {
      method: "POST",
      body: JSON.stringify({ prompt })
    });
  }
  let finalResult = null;
  const streamLog = [];
  const response = await fetch("/api/agent-stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt })
  });
  await consumeSse(response, (event, data) => {
    streamLog.push({ event, data });
    if (event === "start") setBusy(true, "流式启动");
    if (event === "goal") renderPlan(["流式代理启动", "读取上下文", "生成 diff 和审查"]);
    if (event === "context") {
      appendToolCall({
        title: "流式上下文事件",
        label: "stream",
        state: `${data.fileCount || 0} files`,
        body: JSON.stringify(data, null, 2)
      });
    }
    if (event === "token") setBusy(true, `token ${data.index || streamLog.length}`);
    if (event === "result") finalResult = data;
    if (event === "error") throw new Error(data.message || "流式代理失败");
  });
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
  if (approvePartialBtn) approvePartialBtn.disabled = value;
  rollbackBtn.disabled = value;
  runCommandsBtn.disabled = value;
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
  renderConflictResolution(null);
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

function renderConflictResolution(preview = null) {
  state.conflictPreview = preview;
  if (!conflictResolutionPanel) return;
  const conflicts = preview?.conflictPreviews || [];
  conflictResolutionPanel.classList.toggle("hidden", !conflicts.length);
  conflictResolutionPanel.innerHTML = "";
  if (!conflicts.length) return;
  const header = document.createElement("div");
  header.className = "conflict-resolution-head";
  header.innerHTML = `<strong>冲突解决</strong><button type="button" data-action="create-resolution-draft">生成解决草稿</button>`;
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

async function createConflictResolutionDraftFromPanel() {
  const conflicts = state.conflictPreview?.conflictPreviews || [];
  if (!state.pendingDiff || !conflicts.length || !conflictResolutionPanel) {
    showToast("当前没有可解决的冲突。");
    return;
  }
  const rows = [...conflictResolutionPanel.querySelectorAll(".conflict-resolution-row")];
  const resolutions = rows.map((row) => {
    const index = Number(row.dataset.index || 0);
    const conflict = conflicts[index] || {};
    return {
      path: conflict.path,
      hunk: conflict.hunk,
      oldStart: conflict.oldStart,
      resolved: row.querySelector("textarea")?.value || ""
    };
  }).filter((item) => item.path);
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
    appendToolCall({ title: "生成冲突解决草稿失败", label: "merge", state: "失败", body: error.message });
    setBusy(false, "冲突解决失败");
  }
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
    row.innerHTML = `<strong></strong><small></small><button type="button" data-action="view">查看</button><button type="button" data-action="comments">评论草稿</button>`;
    row.querySelector("strong").textContent = artifact.summary || artifact.prompt || artifact.id;
    row.querySelector("small").textContent = `${artifact.findingCount || 0} 条发现 · ${artifact.commandCount || 0} 条命令 · ${artifact.createdAt?.slice(0, 19) || ""}`;
    row.querySelector("[data-action='view']").addEventListener("click", async () => {
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
    row.querySelector("[data-action='comments']").addEventListener("click", async () => {
      try {
        const draft = await api("/api/review-comments", {
          method: "POST",
          body: JSON.stringify({ id: artifact.id })
        });
        appendToolCall({
          title: `PR 评论草稿：${artifact.id}`,
          label: "review",
          state: draft.status || "drafted",
          body: JSON.stringify(draft, null, 2).slice(0, 12000)
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

function renderVerificationPlan(plan) {
  if (!plan?.gates?.length) {
    checksList.innerHTML = `
      <div class="check-row queued">
        <span></span>
        未生成验证门禁计划
      </div>
    `;
    return;
  }
  checksList.innerHTML = "";
  plan.gates.forEach((gate) => {
    const row = document.createElement("div");
    const ok = ["ready", "passing", "clean"].includes(gate.status);
    row.className = `check-row command-row ${ok ? "passed" : "failed"}`;
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

function renderThreads(threads = []) {
  if (!threadList) return;
  threadList.innerHTML = "";
  if (!threads.length) {
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
  threads.slice(0, 8).forEach((thread, index) => {
    const row = document.createElement("div");
    row.className = `thread ${thread.id === state.activeThreadId || (!state.activeThreadId && index === 0) ? "active" : ""}`;
    row.tabIndex = 0;
    row.setAttribute("role", "button");
    row.innerHTML = `<span class="status-dot ${thread.status === "awaiting_approval" ? "live" : "idle"}"></span><span><strong></strong><small></small></span><span class="thread-actions"><button type="button" data-action="rename">重命名</button><button type="button" data-action="fork">分叉</button><button type="button" data-action="pin"></button><button type="button" data-action="archive">归档</button></span>`;
    row.querySelector("strong").textContent = thread.title || "未命名会话";
    row.querySelector("small").textContent = `${thread.pinned ? "置顶 · " : ""}${thread.status || "active"} · ${thread.messageCount || 0} 条消息`;
    row.querySelector("[data-action='pin']").textContent = thread.pinned ? "取消置顶" : "置顶";
    const restoreThread = async () => {
      try {
        const detail = await api(`/api/thread?id=${encodeURIComponent(thread.id)}`);
        state.activeThreadId = detail.id;
        renderMessages(detail.messages || []);
        renderThreads(threads);
        appendToolCall({
          title: `已恢复会话：${detail.title}`,
          label: "thread",
          state: detail.status || "active",
          body: JSON.stringify(detail.summary || detail, null, 2).slice(0, 12000)
        });
      } catch (error) {
        showToast(error.message);
      }
    };
    row.addEventListener("click", restoreThread);
    row.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        restoreThread();
      }
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
      }
    });
    row.querySelector("[data-action='rename']").addEventListener("click", async (event) => {
      event.stopPropagation();
      const title = window.prompt("重命名会话", thread.title || "未命名会话");
      if (!title || !title.trim()) return;
      try {
        const result = await api("/api/thread", {
          method: "PATCH",
          body: JSON.stringify({ id: thread.id, title: title.trim() })
        });
        renderThreads(result.threads || []);
        appendToolCall({
          title: `已重命名会话：${title.trim()}`,
          label: "thread",
          state: "完成",
          body: JSON.stringify(result.thread?.summary || {}, null, 2).slice(0, 12000)
        });
      } catch (error) {
        showToast(error.message);
      }
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
      }
    });
    threadList.appendChild(row);
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
    row.innerHTML = `<strong></strong><small></small><button type="button" data-action="resource">读资源</button><button type="button" data-action="call">调用示例</button>`;
    row.querySelector("strong").textContent = extension.name || "extension";
    row.querySelector("small").textContent = `${extension.type || "extension"} · ${extension.policy?.access || "declared"} · ${extension.trust?.status || "trust-unknown"} · ${(extension.tools || []).length} 工具 · ${extension.description || ""}`;
    row.addEventListener("click", () => {
      appendToolCall({
        title: `扩展详情：${extension.name}`,
        label: "extension",
        state: extension.type || "local",
        body: JSON.stringify(extension, null, 2)
      });
    });
    const resourceButton = row.querySelector("[data-action='resource']");
    resourceButton.disabled = probe.status !== "probed" || !probe.resources?.length;
    resourceButton.addEventListener("click", async (event) => {
      event.stopPropagation();
      try {
        const resource = probe.resources[0];
        const detail = await api("/api/mcp-resource", {
          method: "POST",
          body: JSON.stringify({ serverName: server.name, uri: resource.uri })
        });
        appendToolCall({
          title: `MCP 资源读取：${server.name}`,
          label: "mcp",
          state: detail.contents?.length ? "完成" : "empty",
          body: JSON.stringify(detail, null, 2).slice(0, 12000)
        });
      } catch (error) {
        appendToolCall({ title: `MCP 资源读取失败：${server.name}`, label: "mcp", state: "失败", body: error.message });
      }
    });
    const callButton = row.querySelector("[data-action='call']");
    callButton.disabled = !(extension.tools || []).length;
    callButton.addEventListener("click", async (event) => {
      event.stopPropagation();
      try {
        const tool = extension.tools[0];
        const plan = await api("/api/extension-tool-call", {
          method: "POST",
          body: JSON.stringify({ extensionName: extension.name, toolName: tool.name, arguments: {} })
        });
        appendToolCall({
          title: `扩展工具调用审批：${extension.name}.${tool.name}`,
          label: "extension",
          state: plan.status || "approval_required",
          body: JSON.stringify(plan, null, 2).slice(0, 12000)
        });
        await refreshHealth();
      } catch (error) {
        appendToolCall({ title: `扩展工具调用失败：${extension.name}`, label: "extension", state: "失败", body: error.message });
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
    row.innerHTML = `<strong></strong><small></small><button type="button" data-action="call">调用示例</button>`;
    row.querySelector("strong").textContent = server.name || "mcp-server";
    const probeText = probe.status
      ? ` · ${probe.status}${probe.counts ? ` · ${probe.counts.tools || 0} 工具 / ${probe.counts.resources || 0} 资源` : ""}`
      : "";
    row.querySelector("small").textContent = `${server.transport || "stdio"} · ${server.status || "configured"}${probeText} · ${server.source || ""}`;
    row.addEventListener("click", () => {
      appendToolCall({
        title: `MCP 详情：${server.name}`,
        label: "mcp",
        state: server.status || "configured",
        body: JSON.stringify(server, null, 2)
      });
    });
    const callButton = row.querySelector("[data-action='call']");
    callButton.disabled = probe.status !== "probed" || !probe.tools?.length;
    callButton.addEventListener("click", async (event) => {
      event.stopPropagation();
      try {
        const tool = probe.tools[0];
        const plan = await api("/api/mcp-tool-call", {
          method: "POST",
          body: JSON.stringify({ serverName: server.name, toolName: tool.name, arguments: {} })
        });
        appendToolCall({
          title: `MCP 工具调用审批：${server.name}.${tool.name}`,
          label: "mcp",
          state: plan.status || "approval_required",
          body: JSON.stringify(plan, null, 2).slice(0, 12000)
        });
        await refreshHealth();
      } catch (error) {
        appendToolCall({ title: `MCP 工具调用失败：${server.name}`, label: "mcp", state: "失败", body: error.message });
      }
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
    row.addEventListener("click", async () => {
      try {
        const detail = await api(`/api/asset-inspect?path=${encodeURIComponent(asset.path)}`);
        appendToolCall({
          title: `资产检查：${asset.path}`,
          label: "asset",
          state: detail.type || "inspected",
          body: JSON.stringify(detail, null, 2).slice(0, 12000)
        });
      } catch (error) {
        appendToolCall({
          title: `资产检查失败：${asset.path}`,
          label: "asset",
          state: "失败",
          body: error.message
        });
      }
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
    row.innerHTML = `<strong></strong><small></small><button type="button" data-action="toggle"></button><button type="button" data-action="retry">重试</button>`;
    row.querySelector("strong").textContent = item.prompt || "(无提示词)";
    row.querySelector("small").textContent = `${item.status || "queued"} · ${item.isolationGroup || "default"} · P${item.priority || 0} · retry ${item.retryCount || 0}/${item.retryLimit || 0} · ${item.createdAt?.slice(0, 19) || ""}`;
    row.querySelector("[data-action='toggle']").textContent = item.status === "active" ? "完成+下个" : "激活";
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
    row.innerHTML = `<strong></strong><small></small><button type="button">详情</button>`;
    row.querySelector("strong").textContent = match.command || match.processId;
    row.querySelector("small").textContent = `${match.status || "unknown"} · index ${match.index}`;
    row.querySelector("button").addEventListener("click", () => {
      appendToolCall({
        title: `进程日志搜索：${result.query}`,
        label: "proc",
        state: `${result.matchCount || 0} matches`,
        body: JSON.stringify(match, null, 2)
      });
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
    row.innerHTML = `<strong></strong><small></small><button type="button">回放</button>`;
    row.querySelector("strong").textContent = item.command || item.id;
    row.querySelector("small").textContent = [
      item.status || "unknown",
      item.exitCode === null || item.exitCode === undefined ? "" : `exit ${item.exitCode}`,
      item.updatedAt || item.stoppedAt || item.startedAt || "",
      item.logPath || ""
    ].filter(Boolean).join(" · ");
    row.querySelector("button").addEventListener("click", () => {
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

function renderBrowserDom(result) {
  if (!browserCheckResult) return;
  browserCheckResult.innerHTML = "";
  const row = document.createElement("div");
  row.className = `queue-row ${result.ok ? "done" : "failed"}`;
  row.innerHTML = `<strong></strong><small></small><button type="button">详情</button>`;
  row.querySelector("strong").textContent = result.title || result.url || "DOM 快照";
  row.querySelector("small").textContent = [
    `${Math.round((result.bytes || 0) / 1024)} KB DOM`,
    `${result.selectors?.length || 0} selectors`,
    `${result.counts?.buttons || 0} buttons`
  ].join(" · ");
  row.querySelector("button").addEventListener("click", () => {
    appendToolCall({
      title: `DOM 快照：${result.url}`,
      label: "dom",
      state: result.ok ? "完成" : "失败",
      body: JSON.stringify(result, null, 2).slice(0, 12000)
    });
  });
  browserCheckResult.appendChild(row);
}

function renderBrowserTrace(result) {
  if (!browserCheckResult) return;
  browserCheckResult.innerHTML = "";
  const row = document.createElement("div");
  row.className = `queue-row ${result.ok ? "done" : "failed"}`;
  row.innerHTML = `<strong></strong><small></small><button type="button">详情</button>`;
  row.querySelector("strong").textContent = result.title || result.finalUrl || result.url || "浏览器 Trace";
  row.querySelector("small").textContent = [
    `${result.summary?.console || 0} console`,
    `${result.summary?.exceptions || 0} exceptions`,
    `${result.summary?.network || 0} requests`,
    result.artifactPath || "no artifact"
  ].join(" · ");
  row.querySelector("button").addEventListener("click", () => {
    appendToolCall({
      title: `浏览器 Trace：${result.finalUrl || result.url}`,
      label: "trace",
      state: result.ok ? "完成" : "异常",
      body: JSON.stringify(result, null, 2).slice(0, 12000)
    });
  });
  browserCheckResult.appendChild(row);
}

function renderBrowserInteract(result) {
  if (!browserCheckResult) return;
  browserCheckResult.innerHTML = "";
  const row = document.createElement("div");
  row.className = `queue-row ${result.ok ? "done" : "failed"}`;
  row.innerHTML = `<strong></strong><small></small><button type="button">详情</button>`;
  row.querySelector("strong").textContent = result.title || result.finalUrl || result.url || "DOM 交互";
  row.querySelector("small").textContent = [
    `${result.actions?.length || 0} actions`,
    `${Math.round((result.bytes || 0) / 1024)} KB DOM`,
    `${result.selectors?.length || 0} selectors`
  ].join(" · ");
  row.querySelector("button").addEventListener("click", () => {
    appendToolCall({
      title: `DOM 交互：${result.url}`,
      label: "dom",
      state: result.ok ? "完成" : "失败",
      body: JSON.stringify(result, null, 2).slice(0, 12000)
    });
  });
  browserCheckResult.appendChild(row);
}

function renderBrowserSession(result) {
  if (!browserCheckResult) return;
  browserCheckResult.innerHTML = "";
  const row = document.createElement("div");
  row.className = `queue-row ${result.ok ? "done" : "failed"}`;
  row.innerHTML = `<strong></strong><small></small><button type="button">详情</button>`;
  row.querySelector("strong").textContent = result.name || result.finalUrl || result.url || "浏览器会话";
  row.querySelector("small").textContent = [
    `${result.stepCount || 0} steps`,
    `${result.actionCount || 0} actions`,
    result.artifactPath || "no artifact"
  ].join(" · ");
  row.querySelector("button").addEventListener("click", () => {
    appendToolCall({
      title: `浏览器会话：${result.url}`,
      label: "dom",
      state: result.ok ? "完成" : "失败",
      body: JSON.stringify(result, null, 2).slice(0, 12000)
    });
  });
  browserCheckResult.appendChild(row);
}

function renderBrowserVisual(result) {
  if (!browserCheckResult) return;
  browserCheckResult.innerHTML = "";
  const row = document.createElement("div");
  row.className = `queue-row ${result.ok ? "done" : "failed"}`;
  row.innerHTML = `<strong></strong><small></small><button type="button">详情</button>`;
  row.querySelector("strong").textContent = result.name || result.url || "视觉断言";
  row.querySelector("small").textContent = [
    result.status || "unknown",
    `${result.comparison?.mismatchedPixels || 0} px diff`,
    `${((result.comparison?.mismatchRatio || 0) * 100).toFixed(3)}%`,
    result.updated ? "baseline saved" : "baseline checked"
  ].join(" · ");
  row.querySelector("button").addEventListener("click", () => {
    appendToolCall({
      title: `视觉断言：${result.url}`,
      label: "visual",
      state: result.ok ? "通过" : "失败",
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
    row.className = `queue-row ${approval.status === "approved" ? "complete" : "failed"}`;
    row.innerHTML = `<strong></strong><small></small><button type="button" data-action="view">查看</button><button type="button" data-action="approve">批准</button><button type="button" data-action="reject">拒绝</button><button type="button" data-action="execute">执行</button>`;
    row.querySelector("strong").textContent = approval.command || approval.type || approval.id;
    row.querySelector("small").textContent = `${approval.type || "command"} · ${approval.status || "blocked"} · ${approval.risk || "blocked"} · ${approval.reason || ""}`;
    row.querySelector("[data-action='view']").addEventListener("click", async () => {
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
    row.querySelector("[data-action='approve']").addEventListener("click", async () => {
      try {
        const decision = await api("/api/approval", {
          method: "PATCH",
          body: JSON.stringify({ id: approval.id, decision: "approved", note: "Approved from UI; execution remains disabled." })
        });
        appendToolCall({
          title: `审批已批准：${approval.id}`,
          label: "policy",
          state: decision.status || "approved",
          body: JSON.stringify(decision, null, 2).slice(0, 12000)
        });
        await refreshHealth();
      } catch (error) {
        showToast(error.message);
      }
    });
    row.querySelector("[data-action='reject']").addEventListener("click", async () => {
      try {
        const decision = await api("/api/approval", {
          method: "PATCH",
          body: JSON.stringify({ id: approval.id, decision: "rejected", note: "Rejected from UI." })
        });
        appendToolCall({
          title: `审批已拒绝：${approval.id}`,
          label: "policy",
          state: decision.status || "rejected",
          body: JSON.stringify(decision, null, 2).slice(0, 12000)
        });
        await refreshHealth();
      } catch (error) {
        showToast(error.message);
      }
    });
    row.querySelector("[data-action='execute']").addEventListener("click", async () => {
      try {
        const result = await api("/api/approval-execute", {
          method: "POST",
          body: JSON.stringify({ id: approval.id })
        });
        appendToolCall({
          title: `审批执行结果：${approval.id}`,
          label: "policy",
          state: result.execution?.executed ? "executed" : "blocked",
          body: JSON.stringify(result, null, 2).slice(0, 12000)
        });
        await refreshHealth();
      } catch (error) {
        showToast(error.message);
        appendToolCall({ title: `审批执行失败：${approval.id}`, label: "policy", state: "失败", body: error.message });
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
  renderGoal(data.goal);
  restorePendingProposal(data.goal);
  renderReviewArtifacts(data.reviews || []);
  renderApprovals(data.approvals || []);
  renderQueue(data.queue || []);
  renderProcesses(data.processes || []);
  state.contextSnapshot = data.contextSnapshot || null;
  state.contextRollup = data.contextRollup || null;
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
  try {
    const data = await api("/api/mcp?probe=1");
    renderMcpCatalog(data);
    appendToolCall({
      title: "MCP 探测完成",
      label: "mcp",
      state: "完成",
      body: JSON.stringify(data.summary || {}, null, 2)
    });
  } catch (error) {
    appendToolCall({ title: "MCP 探测失败", label: "mcp", state: "失败", body: error.message });
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
    const result = await runAgentRequest(prompt);
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
    appendToolCall({
      title: "模型工具循环完成",
      label: "ai",
      state: "完成",
      body: [
        `模型：${result.model}`,
        `fallback：${(result.modelRuntime?.lastFallbacks || []).length} 次`,
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

contextSnapshotBtn?.addEventListener("click", async () => {
  setBusy(true, "保存摘要");
  try {
    const result = await api("/api/context-snapshot", { method: "POST" });
    state.contextSnapshot = result.snapshot || null;
    appendToolCall({
      title: "上下文摘要已保存",
      label: "context",
      state: "完成",
      body: JSON.stringify(result.snapshot, null, 2).slice(0, 12000)
    });
    await refreshHealth();
    await refreshFiles();
    setBusy(false, "摘要已保存");
  } catch (error) {
    showToast(error.message);
    appendToolCall({ title: "保存上下文摘要失败", label: "context", state: "失败", body: error.message });
    setBusy(false, "摘要失败");
  }
});

contextCompactBtn?.addEventListener("click", async () => {
  setBusy(true, "压缩上下文");
  try {
    const result = await api("/api/context-compact", { method: "POST" });
    appendToolCall({
      title: "上下文压缩已保存",
      label: "compact",
      state: "完成",
      body: JSON.stringify(result.compact, null, 2).slice(0, 12000)
    });
    await refreshHealth();
    setBusy(false, "压缩已保存");
  } catch (error) {
    showToast(error.message);
    appendToolCall({ title: "上下文压缩失败", label: "compact", state: "失败", body: error.message });
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
    appendToolCall({
      title: "上下文滚动摘要已保存",
      label: "rollup",
      state: "完成",
      body: JSON.stringify(result.rollup, null, 2).slice(0, 12000)
    });
    await refreshHealth();
    await refreshFiles();
    setBusy(false, "滚动摘要已保存");
  } catch (error) {
    showToast(error.message);
    appendToolCall({ title: "上下文滚动摘要失败", label: "rollup", state: "失败", body: error.message });
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
    appendToolCall({
      title: "模型策略已生成",
      label: "model",
      state: result.policy?.status || "unknown",
      body: JSON.stringify({
        generatedAt: result.policy?.generatedAt,
        status: result.policy?.status,
        endpoint: result.policy?.endpoint,
        runtime: result.policy?.runtime,
        budgetPolicy: result.policy?.budgetPolicy,
        guardrails: result.policy?.guardrails,
        remainingGaps: result.policy?.remainingGaps
      }, null, 2).slice(0, 12000)
    });
    setBusy(false, "模型策略完成");
  } catch (error) {
    showToast(error.message);
    appendToolCall({ title: "读取模型策略失败", label: "model", state: "失败", body: error.message });
    setBusy(false, "模型策略失败");
  }
});

modelUsageBtn?.addEventListener("click", async () => {
  setBusy(true, "读取模型用量");
  try {
    const result = await api("/api/model-usage");
    appendToolCall({
      title: "模型用量账本已读取",
      label: "model",
      state: `${result.usage?.summary?.requestCount || 0} requests`,
      body: JSON.stringify({
        generatedAt: result.usage?.generatedAt,
        endpoint: result.usage?.endpoint,
        summary: result.usage?.summary,
        totals: result.usage?.totals,
        recent: result.usage?.recent?.slice(0, 12),
        policy: result.usage?.policy
      }, null, 2).slice(0, 12000)
    });
    setBusy(false, "模型用量完成");
  } catch (error) {
    showToast(error.message);
    appendToolCall({ title: "读取模型用量失败", label: "model", state: "失败", body: error.message });
    setBusy(false, "模型用量失败");
  }
});

modelBudgetBtn?.addEventListener("click", async () => {
  setBusy(true, "读取模型预算");
  try {
    const result = await api("/api/model-budget");
    appendToolCall({
      title: "模型预算预检已读取",
      label: "model",
      state: result.budget?.status || "unknown",
      body: JSON.stringify({
        generatedAt: result.budget?.generatedAt,
        status: result.budget?.status,
        blocksModelCall: result.budget?.blocksModelCall,
        checks: result.budget?.checks,
        usage: result.budget?.usage,
        policy: result.budget?.policy,
        message: result.budget?.message
      }, null, 2).slice(0, 12000)
    });
    setBusy(false, "模型预算完成");
  } catch (error) {
    showToast(error.message);
    appendToolCall({ title: "读取模型预算失败", label: "model", state: "失败", body: error.message });
    setBusy(false, "模型预算失败");
  }
});

modelCostBtn?.addEventListener("click", async () => {
  setBusy(true, "读取模型成本");
  try {
    const result = await api("/api/model-cost");
    appendToolCall({
      title: "模型成本估算已读取",
      label: "model",
      state: result.cost?.status || "unknown",
      body: JSON.stringify({
        generatedAt: result.cost?.generatedAt,
        status: result.cost?.status,
        currency: result.cost?.currency,
        configured: result.cost?.configured,
        estimatedCost: result.cost?.estimatedCost,
        pricedModelCount: result.cost?.pricedModelCount,
        unpricedModelCount: result.cost?.unpricedModelCount,
        rows: result.cost?.rows,
        policy: result.cost?.policy,
        notes: result.cost?.notes,
        error: result.cost?.error
      }, null, 2).slice(0, 12000)
    });
    setBusy(false, "模型成本完成");
  } catch (error) {
    showToast(error.message);
    appendToolCall({ title: "读取模型成本失败", label: "model", state: "失败", body: error.message });
    setBusy(false, "模型成本失败");
  }
});

modelCostPolicyBtn?.addEventListener("click", async () => {
  setBusy(true, "读取价格表 schema");
  try {
    const result = await api("/api/model-cost-policy");
    appendToolCall({
      title: "模型价格表 schema 已读取",
      label: "model",
      state: result.policy?.valid ? "valid" : "invalid",
      body: JSON.stringify({
        envVar: result.policy?.envVar,
        configured: result.policy?.configured,
        valid: result.policy?.valid,
        parsed: result.policy?.parsed,
        schema: result.policy?.schema,
        exampleJson: result.policy?.exampleJson,
        policy: result.policy?.policy,
        notes: result.policy?.notes
      }, null, 2).slice(0, 12000)
    });
    setBusy(false, "价格表完成");
  } catch (error) {
    showToast(error.message);
    appendToolCall({ title: "读取价格表失败", label: "model", state: "失败", body: error.message });
    setBusy(false, "价格表失败");
  }
});

modelBillingBtn?.addEventListener("click", async () => {
  setBusy(true, "核对模型账单");
  try {
    const result = await api("/api/model-billing");
    appendToolCall({
      title: "模型账单核对已读取",
      label: "model",
      state: result.billing?.status || "unknown",
      body: JSON.stringify({
        generatedAt: result.billing?.generatedAt,
        status: result.billing?.status,
        configured: result.billing?.configured,
        currency: result.billing?.currency,
        period: result.billing?.period,
        estimatedCost: result.billing?.estimatedCost,
        actualCost: result.billing?.actualCost,
        variance: result.billing?.variance,
        rows: result.billing?.rows,
        billing: result.billing?.billing,
        policy: result.billing?.policy,
        notes: result.billing?.notes,
        error: result.billing?.error
      }, null, 2).slice(0, 12000)
    });
    setBusy(false, "账单核对完成");
  } catch (error) {
    showToast(error.message);
    appendToolCall({ title: "读取账单核对失败", label: "model", state: "失败", body: error.message });
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
    appendToolCall({
      title: "语义索引已生成",
      label: "index",
      state: "完成",
      body: JSON.stringify({
        generatedAt: result.index?.generatedAt,
        indexedFiles: result.index?.indexedFiles,
        summary: result.index?.summary,
        declarations: result.index?.declarations?.slice(0, 40),
        routes: result.index?.routes?.slice(0, 30),
        selectors: result.index?.selectors?.slice(0, 30),
        routeSearch: search.matches?.slice(0, 20),
        referenceSample: references.matches?.slice(0, 8)
      }, null, 2).slice(0, 12000)
    });
    setBusy(false, "索引已生成");
  } catch (error) {
    showToast(error.message);
    appendToolCall({ title: "生成语义索引失败", label: "index", state: "失败", body: error.message });
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
    appendToolCall({
      title: "代码智能概览已生成",
      label: "intel",
      state: result.overview?.readiness?.some((item) => item.status === "blocker" || item.status === "warning") ? "review" : "完成",
      body: JSON.stringify({
        generatedAt: result.overview?.generatedAt,
        summary: result.overview?.summary,
        readiness: result.overview?.readiness,
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
      }, null, 2).slice(0, 12000)
    });
    setBusy(false, "代码智能完成");
  } catch (error) {
    showToast(error.message);
    appendToolCall({ title: "生成代码智能失败", label: "intel", state: "失败", body: error.message });
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
    appendToolCall({
      title: "符号大纲与定义已查询",
      label: "outline",
      state: "完成",
      body: JSON.stringify({
        outlineSummary: outline.summary,
        symbols: outline.symbols?.slice(0, 40),
        definition: {
          matchCount: definition.matchCount,
          definitions: definition.definitions?.slice(0, 10)
        }
      }, null, 2).slice(0, 12000)
    });
    setBusy(false, "符号大纲完成");
  } catch (error) {
    showToast(error.message);
    appendToolCall({ title: "查询符号大纲失败", label: "outline", state: "失败", body: error.message });
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
    appendToolCall({
      title: "语义诊断已生成",
      label: "diag",
      state: "完成",
      body: JSON.stringify({
        generatedAt: result.generatedAt,
        checked: result.checked,
        summary: result.summary,
        diagnostics: result.diagnostics?.slice(0, 30)
      }, null, 2).slice(0, 12000)
    });
    setBusy(false, "诊断完成");
  } catch (error) {
    showToast(error.message);
    appendToolCall({ title: "生成语义诊断失败", label: "diag", state: "失败", body: error.message });
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
    appendToolCall({
      title: "语义影响面已生成",
      label: "impact",
      state: "完成",
      body: JSON.stringify({
        generatedAt: result.generatedAt,
        source: result.source,
        summary: result.summary,
        targets: result.targetSummaries?.slice(0, 30),
        dependents: result.dependents?.slice(0, 30),
        callers: result.callers?.slice(0, 30),
        routes: result.routes?.slice(0, 20),
        selectors: result.selectors?.slice(0, 20),
        warnings: result.warnings
      }, null, 2).slice(0, 12000)
    });
    setBusy(false, "影响面完成");
  } catch (error) {
    showToast(error.message);
    appendToolCall({ title: "生成语义影响面失败", label: "impact", state: "失败", body: error.message });
    setBusy(false, "影响面失败");
  }
});

dependencyGraphBtn?.addEventListener("click", async () => {
  setBusy(true, "生成依赖图");
  try {
    const result = await api("/api/dependency-graph", {
      method: "POST",
      body: JSON.stringify({ limit: 120, includeExternal: true })
    });
    appendToolCall({
      title: "依赖图已生成",
      label: "graph",
      state: result.summary?.cycles ? "review" : "完成",
      body: JSON.stringify({
        generatedAt: result.generatedAt,
        summary: result.summary,
        nodes: result.nodes?.slice(0, 40),
        edges: result.edges?.slice(0, 60),
        cycles: result.cycles?.slice(0, 20),
        unresolved: result.unresolved?.slice(0, 30),
        external: result.external?.slice(0, 30)
      }, null, 2).slice(0, 12000)
    });
    setBusy(false, "依赖图完成");
  } catch (error) {
    showToast(error.message);
    appendToolCall({ title: "生成依赖图失败", label: "graph", state: "失败", body: error.message });
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
    setBusy(false, "入队失败");
  }
});

queueIsolationBtn?.addEventListener("click", async () => {
  setBusy(true, "读取队列隔离");
  try {
    const result = await api("/api/queue-isolation?limit=50");
    appendToolCall({
      title: "队列隔离报告已读取",
      label: "queue",
      state: `${result.summary?.activeGroups || 0} active groups`,
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
    appendToolCall({ title: "读取队列隔离失败", label: "queue", state: "失败", body: error.message });
    setBusy(false, "队列隔离失败");
  }
});

async function applyPendingDiff({ allowPartial = false } = {}) {
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
        commands: state.pendingCommands,
        allowPartial
      })
    });
    if (result.status === "conflict") {
      let conflictPreview = null;
      try {
        conflictPreview = await api("/api/diff-conflicts", {
          method: "POST",
          body: JSON.stringify({ diff: state.pendingDiff })
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
        result.conflicts?.length ? `conflicts：${result.conflicts.map((item) => item.path).join(", ")}` : "",
        "",
        result.applied.map((item) => item.path).join("\n")
      ].filter((line) => line !== "").join("\n")
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
}

approveBtn.addEventListener("click", async () => {
  await applyPendingDiff({ allowPartial: false });
});

approvePartialBtn?.addEventListener("click", async () => {
  await applyPendingDiff({ allowPartial: true });
});

conflictResolutionPanel?.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const action = button.dataset.action;
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

verificationPlanBtn?.addEventListener("click", async () => {
  setBusy(true, "生成验证门禁");
  try {
    const result = await api("/api/verification-plan", {
      method: "POST",
      body: JSON.stringify({ limit: 12, commands: state.pendingCommands.map((item) => item.command || item) })
    });
    renderVerificationPlan(result.plan);
    appendToolCall({
      title: "验证门禁计划已生成",
      label: "verify",
      state: result.plan?.status || "unknown",
      body: JSON.stringify(result.plan, null, 2).slice(0, 12000)
    });
    setBusy(false, result.plan?.status === "ready" ? "门禁就绪" : "门禁待处理");
  } catch (error) {
    showToast(error.message);
    appendToolCall({ title: "验证门禁计划失败", label: "verify", state: "失败", body: error.message });
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
    appendToolCall({
      title: "CI 状态汇总已生成",
      label: "ci",
      state: result.status?.status || "unknown",
      body: JSON.stringify({
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
      }, null, 2).slice(0, 12000)
    });
    renderVerificationPlan(result.status?.verificationPlan);
    setBusy(false, result.status?.status === "ready" ? "CI 就绪" : "CI 待处理");
  } catch (error) {
    showToast(error.message);
    appendToolCall({ title: "CI 状态读取失败", label: "ci", state: "失败", body: error.message });
    setBusy(false, "CI 状态失败");
  }
});

policyAuditBtn?.addEventListener("click", async () => {
  setBusy(true, "生成权限审计");
  try {
    const result = await api("/api/policy-audit", {
      method: "POST",
      body: JSON.stringify({ limit: 20, sampleCommands: state.pendingCommands.map((item) => item.command || item) })
    });
    appendToolCall({
      title: "权限策略审计已生成",
      label: "policy",
      state: result.audit?.summary?.findings ? "review" : "ok",
      body: JSON.stringify(result.audit, null, 2).slice(0, 12000)
    });
    setBusy(false, "权限审计完成");
  } catch (error) {
    showToast(error.message);
    appendToolCall({ title: "权限策略审计失败", label: "policy", state: "失败", body: error.message });
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
    appendToolCall({
      title: "权限矩阵已生成",
      label: "matrix",
      state: `${result.matrix?.summary?.providers || 0} providers`,
      body: JSON.stringify(result.matrix, null, 2).slice(0, 12000)
    });
    setBusy(false, "权限矩阵完成");
  } catch (error) {
    showToast(error.message);
    appendToolCall({ title: "权限矩阵失败", label: "matrix", state: "失败", body: error.message });
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
    appendToolCall({
      title: "扩展 Trust 审计已生成",
      label: "trust",
      state: `${result.trust?.summary?.total || 0} extensions`,
      body: JSON.stringify(result.trust, null, 2).slice(0, 12000)
    });
    setBusy(false, "扩展信任完成");
  } catch (error) {
    showToast(error.message);
    appendToolCall({ title: "扩展 Trust 审计失败", label: "trust", state: "失败", body: error.message });
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
    appendToolCall({
      title: "PR readiness 已生成",
      label: "pr",
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
    appendToolCall({ title: "PR readiness 检查失败", label: "pr", state: "失败", body: error.message });
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
    appendToolCall({
      title: "合并门禁已生成",
      label: "gate",
      state: result.gate?.status || "unknown",
      body: JSON.stringify({
        generatedAt: result.gate?.generatedAt,
        status: result.gate?.status,
        summary: result.gate?.summary,
        gates: result.gate?.gates,
        blockers: result.gate?.blockers,
        warnings: result.gate?.warnings,
        remote: result.gate?.remote,
        publishPackage: result.gate?.publishPackage,
        policy: result.gate?.policy
      }, null, 2).slice(0, 12000)
    });
    renderVerificationPlan(result.gate?.verificationPlan);
    setBusy(false, result.gate?.status === "ready" ? "合并就绪" : "合并待处理");
  } catch (error) {
    showToast(error.message);
    appendToolCall({ title: "合并门禁失败", label: "gate", state: "失败", body: error.message });
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
    appendToolCall({
      title: "远端发布审批计划已生成",
      label: "release",
      state: plan.status || "approval_required",
      body: [
        `provider: ${plan.provider || "unknown"}`,
        `commands: ${plan.commands?.length || 0}`,
        `approval: ${plan.approval?.id || ""}`,
        "",
        JSON.stringify({
          policy: plan.policy,
          readiness: plan.readiness,
          commands: plan.commands,
          notes: plan.notes
        }, null, 2)
      ].join("\n").slice(0, 12000)
    });
    await refreshHealth();
    setBusy(false, "待审批");
  } catch (error) {
    showToast(error.message);
    appendToolCall({ title: "生成远端发布审批失败", label: "release", state: "失败", body: error.message });
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
    appendToolCall({
      title: "远端发布包索引已读取",
      label: "release",
      state: `${result.summary?.total || 0} packages`,
      body: JSON.stringify({
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
      }, null, 2).slice(0, 12000)
    });
    setBusy(false, "发布包完成");
  } catch (error) {
    showToast(error.message);
    appendToolCall({ title: "读取远端发布包失败", label: "release", state: "失败", body: error.message });
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
    appendToolCall({
      title: "远端发布预检已生成",
      label: "release",
      state: result.preflight?.status || "unknown",
      body: JSON.stringify({
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
      }, null, 2).slice(0, 12000)
    });
    setBusy(false, result.preflight?.status === "ready_for_external_execution" ? "预检通过" : "预检待处理");
  } catch (error) {
    showToast(error.message);
    appendToolCall({ title: "远端发布预检失败", label: "release", state: "失败", body: error.message });
    setBusy(false, "预检失败");
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
    appendToolCall({ title: "进程输出搜索失败", label: "proc", state: "失败", body: error.message });
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
    appendToolCall({ title: "读取进程历史失败", label: "hist", state: "失败", body: error.message });
    setBusy(false, "历史失败");
  }
});

processHealthBtn?.addEventListener("click", async () => {
  setBusy(true, "探测进程健康");
  try {
    const result = await api("/api/process-health?limit=20");
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
    appendToolCall({ title: "读取进程健康失败", label: "proc", state: "失败", body: error.message });
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
    appendToolCall({ title: `页面截图失败：${targetUrl}`, label: "visual", state: "失败", body: error.message });
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
    appendToolCall({
      title: `页面可访问性审计：${targetUrl}`,
      label: "a11y",
      state: result.audit?.status || "unknown",
      body: JSON.stringify(result, null, 2).slice(0, 12000)
    });
    setBusy(false, result.audit?.status === "pass" ? "审计通过" : "审计完成");
  } catch (error) {
    showToast(error.message);
    appendToolCall({ title: `页面可访问性审计失败：${targetUrl}`, label: "a11y", state: "失败", body: error.message });
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
    appendToolCall({ title: `DOM 快照失败：${targetUrl}`, label: "dom", state: "失败", body: error.message });
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
    appendToolCall({ title: `浏览器 Trace 失败：${targetUrl}`, label: "trace", state: "失败", body: error.message });
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
    appendToolCall({ title: `DOM 交互失败：${targetUrl}`, label: "dom", state: "失败", body: error.message });
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
    appendToolCall({ title: `浏览器会话失败：${targetUrl}`, label: "dom", state: "失败", body: error.message });
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
    appendToolCall({ title: `视觉断言失败：${targetUrl}`, label: "visual", state: "失败", body: error.message });
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
    appendToolCall({ title: "创建会话失败", label: "thread", state: "失败", body: error.message });
    setBusy(false, "创建失败");
  }
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
