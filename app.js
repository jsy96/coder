const log = document.querySelector("#log");
const form = document.querySelector("#promptForm");
const workspaceForm = document.querySelector("#workspaceForm");
const workspaceInput = document.querySelector("#workspaceInput");
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
const worktreeBtn = document.querySelector("#worktreeBtn");
const reviewBtn = document.querySelector("#reviewBtn");
const queueBtn = document.querySelector("#queueBtn");
const handoffBtn = document.querySelector("#handoffBtn");
const planSteps = document.querySelector("#planSteps");
const diffList = document.querySelector("#diffList");
const diffSummary = document.querySelector("#diffSummary");
const checksList = document.querySelector("#checksList");
const reviewList = document.querySelector("#reviewList");
const queueList = document.querySelector("#queueList");
const fileList = document.querySelector("#fileList");
const repoName = document.querySelector("#repoName");
const branchName = document.querySelector("#branchName");
const workspaceStatus = document.querySelector("#workspaceStatus");
const contextMeter = document.querySelector("#contextMeter");
const contextText = document.querySelector("#contextText");
const gitStatus = document.querySelector("#gitStatus");
const taskList = document.querySelector("#taskList");
const runState = document.querySelector("#runState");

const state = {
  files: [],
  pendingPatches: [],
  pendingDiff: "",
  pendingCommands: [],
  lastPrompt: "",
  checkpoints: [],
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
    row.querySelector("small").textContent = command.reason || "";
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
    row.querySelector("small").textContent = check.exitCode === 0 ? "通过" : `失败 exit ${check.exitCode}`;
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

async function refreshHealth() {
  const data = await api("/api/health");
  repoName.textContent = data.workspaceName;
  branchName.textContent = data.hasApiKey ? "DeepSeek：已配置" : "DeepSeek：缺少 DEEPSEEK_API_KEY";
  workspaceStatus.textContent = data.workspace;
  workspaceInput.value = data.workspace;
  runState.lastChild.textContent = data.hasApiKey ? "待命" : "缺少密钥";
  renderCheckpoints(data.checkpoints || []);
  renderGit(data.git);
  renderTasks(data.tasks || []);
  renderQueue(data.queue || []);
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
      title: "DeepSeek 工具循环完成",
      label: "ai",
      state: "完成",
      body: `模型：${result.model}\n工具调用：${(result.toolLog || []).length} 次\n建议修改：${result.patches.length} 个文件\n检查命令：${result.commands.length} 条\n审查发现：${(result.review || []).length} 条${toolLogText ? `\n\n${toolLogText}` : ""}`
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
        state: result.exitCode === 0 ? "完成" : "失败",
        body: result.output || "(无输出)"
      });
      if (result.exitCode !== 0) {
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
