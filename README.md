# Forge Code

Forge Code 是一个本地运行的真实编码代理工作台。前端负责会话、计划审批、Diff 预览、自动验证、修复建议、checkpoint 回滚、Git/worktree 状态和命令面板；后端使用原生 Node.js 提供工作区文件读取、工具调用式 agent loop、unified diff 应用、审批后写入、命令执行、任务日志，并通过 `DEEPSEEK_API_KEY` 调用 `deepseek-v4-pro`。

## 运行方式

PowerShell:

```powershell
$env:DEEPSEEK_API_KEY="你的 DeepSeek API Key"
# 可选：按顺序配置模型 fallback
$env:FORGE_MODELS="deepseek-v4-pro,deepseek-chat"
# 可选：指向 DeepSeek-compatible Chat Completions endpoint
$env:FORGE_MODEL_API_URL="https://api.deepseek.com/chat/completions"
node server.js
```

默认工作目录是：

```text
D:\cc-picture\aaa\coder-workspace
```

然后打开：

```text
http://127.0.0.1:4173
```

如果要让 Forge Code 启动时操作另一个代码目录：

```powershell
$env:DEEPSEEK_API_KEY="你的 DeepSeek API Key"
$env:FORGE_WORKSPACE="D:\path\to\your\repo"
node server.js
```

也可以在界面左侧“仓库”卡片中直接输入本地目录路径并点击“切换”。切换后，文件列表、上下文、checkpoint 和后续命令都会基于新的工作目录。

## 当前能力

- 读取当前工作区文本文件，并构建发送给 DeepSeek 的上下文。
- 通过 `repo_map`、`list_files`、`read_file`、`read_file_range`、`search_files` 组成多轮工具调用式 agent loop。
- 自动生成仓库地图、文件类型统计、package scripts 和 JS/CSS/HTML 符号索引，帮助模型先定位再读取。
- 调用 `deepseek-v4-pro` 生成中文计划、unified diff、审查发现和建议检查命令。
- 在右侧展示 Diff 预览；只有点击“批准写入”后才会修改文件。
- 批准写入前自动创建 checkpoint，可以在界面中一键回滚最近一次写入。
- 批准写入后自动发现并运行安全检查命令，例如 `node --check`、`node server.js --smoke-test`、`npm run check`。
- 如果检查失败，会把失败输出和已修改文件交给修复代理生成下一轮修复 diff；修复 diff 仍需用户批准后才会写入。
- 手动运行建议命令失败时，也会把命令输出交给修复代理生成修复 diff。
- 支持 Git 状态检测；在干净 Git 仓库中可以创建隔离 worktree 和任务分支。
- 每次写入后会记录任务日志，包括 prompt、checkpoint、修改文件、检查结果、修复建议和 Git 状态。
- 支持点击任务日志查看完整任务证据；支持基于当前 Git diff 一键复核改动。
- 支持本地任务队列，可先排队多个 prompt，再逐个激活处理。
- 支持可恢复目标状态，记录当前目标、阶段、最近验证、待审批 diff 和建议下一步。
- 支持生成 PR/交付草稿，汇总工作区、分支、改动文件、检查记录、任务证据和 diff。
- 可以点击“运行建议命令”在工作区内执行白名单内的检查命令。
- 支持启动、查看和停止受管开发服务进程，例如 `npm run dev`、`npm start`。
- 支持点击左侧文件列表查看文件内容。

## Codex 对标进展

- **执行闭环**：从“生成 diff”升级为“批准写入 -> 自动检查 -> 失败生成修复 diff -> 再次审批”。
- **命令自修复**：建议命令手动运行失败后，可基于失败输出继续生成修复 diff。
- **审查输出**：模型返回 `review` 数组，前端展示风险、测试缺口和关键验证点。
- **Git 隔离**：支持读取 Git 分支/改动状态，并在干净仓库中创建 `forge/...` 任务 worktree。
- **任务证据**：`.forge/tasks` 保存写入、检查和修复证据，便于回看任务历史。
- **审查闭环**：新增 `/api/review`、`/api/reviews`、`/api/review-artifact` 和 `/api/diff`，可基于当前 Git diff 输出审查发现、建议检查命令，并持久化审查 artifact。
- **任务队列**：新增 `/api/queue`，支持本地排队、激活和完成任务。
- **可恢复状态**：新增 `.forge/state/goal.json`，健康接口返回当前目标、阶段、最近验证、待审批 proposal 和下一步。
- **交付草稿**：新增 `/api/handoff`，生成 `.forge/handoffs/*.md` 交付说明。
- **上下文索引**：新增仓库地图、符号索引和按行读取工具，减少大文件整段读取和误改概率。
- **安全收口**：命令执行先经过可审计 policy 分类，返回允许/拒绝、风险等级和原因；没有可安全运行的检查命令时标记为 `applied_unverified`，不会误报失败。
- **审批请求**：被 policy 拒绝的命令和进程会写入 `.forge/approvals`，并在侧栏展示为可查看的审计记录。
- **长任务管理**：新增 `/api/processes`，可按 policy 启动受管开发服务、识别本地端口、探测健康状态、查看输出尾部并停止进程。
- **能力矩阵**：新增 `/api/capabilities` 和侧栏“Codex 对标”，展示已实现、部分实现和缺失能力。
- **工具目录**：新增 `/api/tools` 和侧栏“工具目录”，展示内置 agent 工具、参数 schema 和只读策略。
- **扩展目录**：新增 `/api/extensions` 和侧栏“扩展目录”，扫描 `.forge/extensions/{skills,plugins}` 下的本地 manifest，展示技能/插件声明、能力和审批策略。
- **MCP 发现**：新增 `/api/mcp` 和侧栏“MCP 服务”，只读发现 `.forge/mcp/servers.json`、应用根目录 `.mcp.json` 与工作区 `.mcp.json` 中声明的 MCP server。
- **资产目录**：新增 `/api/assets` 和侧栏“资产目录”，只读索引工作区图片、PDF/Office、CSV/JSONL 和媒体文件的元数据，为多模态处理闭环打底。
- **页面检查**：新增 `/api/browser-check` 和侧栏“页面检查”，仅允许本机 URL，采集状态码、标题、基础 heading/form/button 结构和本地访问策略证据。
- **页面结构基线**：新增 `/api/browser-baseline` 和“基线”按钮，保存本地页面标题、heading 和 form/button/input/image 计数指纹，并在后续检查中输出结构 diff。
- **真实页面截图**：新增 `/api/browser-screenshot` 和“截图”按钮，调用本机 Edge/Chrome headless 为本地 URL 生成 PNG 证据，产物保存在 `.forge/browser-screenshots`。
- **模型运行层**：支持 `FORGE_MODELS` 逗号分隔候选模型，模型请求失败时按顺序 fallback，并在健康接口和会话日志记录运行时证据。

## 本地检查

```powershell
node --check server.js
node --check app.js
node server.js --smoke-test
node server.js --ui-smoke-test
node server.js --api-smoke-test
```

## 安全边界

- 后端只监听 `127.0.0.1`。
- 文件读写会限制在默认工作目录、`FORGE_WORKSPACE` 指定目录，或界面中切换后的当前工作目录内。
- 运行时可以通过界面切换工作目录；后端会校验目标路径必须存在且是文件夹。
- checkpoint 会绑定创建时的工作目录，避免在切换目录后误回滚到其他项目。
- `.git`、`node_modules`、构建产物和 `.env` 默认不会进入上下文。
- `.forge/checkpoints` 存储写入前快照，默认不会进入上下文。
- `.forge/tasks` 存储任务证据，`.forge/worktrees` 存储由界面创建的隔离任务 worktree。
- `.forge/queue` 存储本地任务队列，`.forge/reviews` 存储审查 artifact，`.forge/handoffs` 存储 PR/交付草稿。
- `.forge/state/goal.json` 存储当前工作区的可恢复目标状态。
- `.forge/approvals` 存储被命令/进程 policy 拒绝的审批请求审计记录。
- 命令执行是真实本地执行，但后端会先进行命令 policy 评估，只允许检查/构建类命令通过，并把风险等级和拒绝原因返回给前端。
- 受管进程同样经过 policy 评估，只允许开发服务类命令；会从命令或输出识别 `localhost` 端口并执行轻量健康探测，输出只保留尾部供界面查看。
- 创建隔离 worktree 要求当前工作区是 Git 仓库且没有未提交改动；否则会拒绝创建。

## 文件说明

- `server.js`：零依赖 Node 后端和 DeepSeek-compatible 模型接入。
- `index.html`：产品结构。
- `styles.css`：视觉系统和响应式布局。
- `app.js`：前端状态管理和 API 调用。
