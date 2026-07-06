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
- 支持本地任务队列，可先排队多个 prompt，再按隔离组逐个激活处理。
- 支持可恢复目标状态，记录当前目标、阶段、最近验证、待审批 diff 和建议下一步。
- 支持生成 PR/交付草稿，汇总工作区、分支、改动文件、检查记录、任务证据和 diff。
- 可以点击“运行建议命令”在工作区内执行白名单内的检查命令。
- 支持启动、查看和停止受管开发服务进程，例如 `npm run dev`、`npm start`。
- 支持点击左侧文件列表查看文件内容。

## Codex 对标进展

- **执行闭环**：从“生成 diff”升级为“批准写入 -> 自动检查 -> 失败生成修复 diff -> 再次审批”。
- **写入冲突保护**：`/api/apply` 先做 diff 冲突预检，默认冲突时零写入；需要时可显式“部分应用”无冲突文件或同文件内无冲突 hunk，并保留文件/hunk 冲突清单。`/api/diff-conflicts` 和 `diff_conflicts` 只读工具可输出 CURRENT/PROPOSED 冲突预览；`/api/conflict-resolution-draft` 可把 resolved 文本转换成新的待审批 diff，不直接修改文件。
- **命令自修复**：建议命令手动运行失败后，可基于失败输出继续生成修复 diff。
- **审查输出**：模型返回 `review` 数组，前端展示风险、测试缺口和关键验证点。
- **Git 隔离**：支持读取 Git 分支/改动状态，并在干净仓库中创建 `forge/...` 任务 worktree。
- **任务证据**：`.forge/tasks` 保存写入、检查和修复证据，便于回看任务历史。
- **可恢复会话线程**：新增 `/api/threads`、`/api/thread`、`/api/thread-fork` 和侧栏“最近会话”，把本地会话消息保存到 `.forge/threads`，支持新建线程、更新消息、重命名、分叉上下文、置顶排序、归档过滤、按工作区列出和点击恢复；线程 artifact 不写业务文件。
- **审查闭环**：新增 `/api/review`、`/api/reviews`、`/api/review-artifact`、`/api/review-comments` 和 `/api/diff`，可基于当前 Git diff 输出审查发现、建议检查命令、PR 行级评论草稿，并持久化审查 artifact。
- **任务队列**：新增 `/api/queue` 和 `/api/queue-isolation`，支持本地排队、优先级、重试计数、隔离组并发保护、激活、完成和自动激活下一项任务。
- **可恢复状态**：新增 `.forge/state/goal.json`，健康接口返回当前目标、阶段、最近验证、待审批 proposal 和下一步。
- **交付草稿**：新增 `/api/handoff`，生成 `.forge/handoffs/*.md` 交付说明。
- **PR readiness**：新增 `/api/pr-readiness`、`/api/remote-pr-status`、`/api/ci-status` 和“PR 检查”“CI 状态”按钮，只读发现 Git remote/provider、本地 CI 配置、diff/review/check 证据；可通过已认证 `gh`/`glab` 读取远端 PR/CI 状态，并生成可复制 PR 草稿；不会执行 `git push` 或创建真实远端 PR。
- **合并门禁**：新增 `/api/merge-gate`、`merge_gate` 只读工具和“合并门禁”按钮，聚合 PR readiness、CI 状态、审查 artifact、审批状态和远端发布预检，输出 pass/warn/block gate；不执行命令、不推送、不创建 PR。
- **验证门禁计划**：新增 `/api/verification-plan`、`/api/ci-status`、`verification_plan` / `ci_status` 只读工具和“验证门禁”“CI 状态”按钮，将安全检查命令、CI 配置、最近验证结果、远端只读检查和变更范围汇总为 PR 前置门禁清单；该计划不执行命令。
- **远端发布审批**：新增 `/api/remote-publish-plan`、`/api/remote-publish-packages`、`/api/remote-publish-package` 和“发布审批”“发布包”按钮，生成 `git push`、`gh/glab pr/mr create`、PR/MR 评论回写候选动作，把 PR body、review summary 和计划写入 `.forge/remote-publish` 并在 `.forge/approvals` 中登记；这些端点只生成/读取审批包，不执行远端写入。
- **远端发布预检**：新增 `/api/remote-publish-preflight`、`remote_publish_preflight` 只读工具和“发布预检”按钮，针对发布包汇总审批状态、Git 远端、CLI 安装/认证、命令风险和阻塞项，不执行 push、建 PR 或远端评论。
- **上下文摘要**：新增 `/api/context-snapshot` 和“保存上下文摘要”按钮，将仓库文件规模、扩展名分布、脚本、符号线索、Git 状态和资产摘要落盘到 `.forge/state/context-snapshot.json`，用于跨会话恢复。
- **上下文压缩**：新增 `/api/context-compact` 和“压缩上下文”按钮，将目标状态、仓库摘要、关键符号、Git 轻量证据、最近任务/审查/审批压缩为 `.forge/state/context-compact.json`；目标状态和任务日志变化后也会自动刷新轻量压缩 artifact，用于长会话恢复与交接。
- **上下文滚动摘要**：新增 `/api/context-rollup`、`context_rollup` 只读工具和“滚动摘要”按钮，将目标、任务、审查、审批和 Git 变化整理为 `.forge/state/context-rollup.json` 中可检索的恢复切片。
- **语义索引**：新增 `/api/semantic-index`、`/api/semantic-search`、`/api/semantic-references`、`semantic_index` / `semantic_search` / `semantic_references` 只读工具和“生成语义索引”按钮，抽取并检索声明、导入、导出、路由、选择器、调用线索和符号引用上下文，可持久化到 `.forge/state/semantic-index.json`。
- **代码智能概览**：新增 `/api/code-intelligence`、`code_intelligence` 只读工具和“代码智能”按钮，把语义索引、依赖图和语义诊断汇总为入口文件、API 面、符号热点、依赖热点与 readiness 风险视图；语义索引同时抽取零依赖符号大纲，记录函数/类/方法的起止行、参数、容器和签名。
- **符号大纲与定义查询**：新增 `/api/symbol-outline`、`/api/semantic-definition`、`symbol_outline` / `semantic_definition` 只读工具和“符号大纲”按钮，可按文件/关键词检索符号范围，并按符号名或文件行号返回定义位置与附近上下文。
- **语义诊断**：新增 `/api/semantic-diagnostics`、`semantic_diagnostics` 只读工具和“语义诊断”按钮，基于语义索引发现重复声明、未解析本地导入、前端 API 调用缺口和重复路由，并可返回附近代码上下文。
- **语义影响面**：新增 `/api/semantic-impact`、`semantic_impact` 只读工具和“影响面”按钮，可基于当前 Git diff 或显式路径找出变更文件的依赖方、调用方、路由、选择器和局部调用图。
- **依赖图**：新增 `/api/dependency-graph`、`dependency_graph` 只读工具和“依赖图”按钮，基于语义索引生成本地 import 图、未解析导入、外部依赖和循环依赖组件。
- **上下文索引**：新增仓库地图、符号索引和按行读取工具，减少大文件整段读取和误改概率。
- **安全收口**：命令执行先经过可审计 policy 分类，返回允许/拒绝、风险等级和原因；没有可安全运行的检查命令时标记为 `applied_unverified`，不会误报失败。
- **审批请求**：被 policy 拒绝的命令和进程会写入 `.forge/approvals`，并在侧栏展示为可查看、可批准、可拒绝、可执行的审计记录；执行已批准请求时仍会重新检查本地安全策略，远端发布计划不会被自动执行。
- **权限矩阵**：新增 `/api/permission-matrix`、`permission_matrix` 只读工具和“权限矩阵”按钮，按 workspace、local-shell、model、browser、extension、MCP、git-remote 等 provider/action 汇总访问级别、审批要求、命令执行、文件写入、远端写入和关键 guardrails。
- **长任务管理**：新增 `/api/processes`、`/api/process-health`、`/api/process-search` 和 `/api/process-history`，可按 policy 启动受管开发服务、识别本地端口、独立汇总 HTTP 健康探针、持久化 `.forge/process-logs` 日志 artifact、搜索/查看输出尾部、回放历史进程并停止进程。
- **长任务健康规则**：`/api/process-health` 会只读加载当前工作区 `.forge/process-health-rules.json`，按命令片段匹配受管进程，校验期望 HTTP 状态码和输出证据，并把规则命中/失败汇总到健康报告；不启动、停止或修改进程。
- **能力矩阵**：新增 `/api/capabilities` 和侧栏“Codex 对标”，展示已实现、部分实现和缺失能力。
- **工具目录**：新增 `/api/tools` 和侧栏“工具目录”，展示内置 agent 工具、本地扩展工具桥接、参数 schema 和只读策略。
- **扩展目录**：新增 `/api/extensions` 和侧栏“扩展目录”，扫描 `.forge/extensions/{skills,plugins}` 下的本地 manifest，展示技能/插件声明、能力和审批策略。
- **扩展 Trust 审计**：新增 `/api/extension-trust`、`extension_trust` 只读工具和扩展区“Trust”按钮，对本地扩展 manifest 计算 SHA-256，展示 checksum pin、本地公钥签名校验、审批要求和未接入远端签名市场的 guardrails。
- **扩展工具调用审批**：新增 `/api/extension-tool-call`，把本地扩展声明的工具映射到内置只读工具；调用先写入 `.forge/approvals`，批准后才通过 `/api/approval-execute` 执行。
- **权限策略审计**：新增 `/api/policy-audit`、`policy_audit` 只读工具和“权限审计”按钮，汇总命令/进程策略、审批状态、工具访问级别、guardrails 和当前权限缺口；不会执行命令或改变审批状态。
- **MCP 发现与探测**：新增 `/api/mcp?probe=1` 和侧栏“MCP 服务 / 探测”，只读发现 `.forge/mcp/servers.json`、应用根目录 `.mcp.json` 与工作区 `.mcp.json` 中声明的 MCP server，并对策略允许的本地 MCP 做短时握手、工具、资源和提示词枚举；`/api/mcp-resource` 和 `mcp_resource` 只读读取 MCP resource 内容，不执行 `tools/call`。
- **MCP 工具调用审批**：新增 `/api/mcp-tool-call`，先校验本地 MCP server、工具目录和参数大小，再写入 `.forge/approvals`；只有批准后通过 `/api/approval-execute` 执行 `tools/call`。
- **资产目录**：新增 `/api/assets` 和侧栏“资产目录”，索引工作区图片、PDF/Office、CSV/JSONL 和媒体文件的元数据，为多模态处理闭环打底。
- **资产内容检查**：新增 `/api/asset-inspect`，支持图片头部尺寸、PNG 像素视觉摘要、SVG title/desc/text/aria-label 本地文本提取、Tesseract OCR 执行开关、缓存 artifact 和引擎探测、CSV/TSV/JSONL 抽样、Parquet footer metadata 探测、DOCX/PPTX/XLSX OOXML 文本抽取、旧版 DOC/XLS/PPT CFBF 文本探测、PDF 页框/文本块/FlateDecode layout 抽取、WAV/MP3/MP4/WebM 媒体元数据解析，以及 Whisper 转写执行开关、缓存 artifact 和引擎探测。
- **页面检查**：新增 `/api/browser-check` 和侧栏“页面检查”，仅允许本机 URL，采集状态码、标题、基础 heading/form/button 结构和本地访问策略证据。
- **页面可访问性审计**：新增 `/api/browser-audit` 和“审计”按钮，对本地页面做静态 HTML/a11y 审计，输出 title/lang/H1/heading、图片 alt、输入框/按钮可访问名称和问题清单；不执行远端访问。
- **页面结构基线**：新增 `/api/browser-baseline` 和“基线”按钮，保存本地页面标题、heading 和 form/button/input/image 计数指纹，并在后续检查中输出结构 diff。
- **真实页面截图**：新增 `/api/browser-screenshot` 和“截图”按钮，调用本机 Edge/Chrome headless 为本地 URL 生成 PNG 证据，支持按 CSS 选择器裁剪，产物保存在 `.forge/browser-screenshots`。
- **DOM 快照**：新增 `/api/browser-dom` 和“DOM”按钮，使用真实浏览器渲染本地页面后导出 DOM，支持简单 `#id`、`.class`、tag 和 `[attr=value]` 选择器计数。
- **浏览器 Trace**：新增 `/api/browser-trace` 和“Trace”按钮，使用本地浏览器采集 console、Runtime exception、Network response/failure 摘要，并保存 `.forge/browser-traces` 证据 artifact。
- **DOM 交互**：新增 `/api/browser-interact` 和“交互”按钮，通过 Chrome DevTools Protocol 在隔离 profile 中执行 `wait`、`click`、`dblClick`、`hover`、`clear`、`type`、`press`、`keyDown`、`keyUp`、`select`、`check`、`uncheck`、`waitText`、`waitValue`、`navigate`、`waitUrl`、`waitNetwork`、`upload`、`mouseMove`、`mouseDown`、`mouseUp`、`mouseClick`、`drag`、`wheel`、`scroll`，并返回交互后的 DOM 与步骤审计。
- **浏览器会话 artifact**：新增 `/api/browser-session`，在同一隔离 profile 内执行多步骤本地页面会话，保存 `.forge/browser-sessions` 审计 artifact。
- **像素级视觉断言**：新增 `/api/browser-visual` 和“视觉”按钮，保存整页或选择器裁剪 PNG 视觉基线，并执行尺寸、像素 diff、阈值、mismatch sample 和可视化 diff PNG 对比。
- **模型运行层**：支持 `FORGE_MODELS` 逗号分隔候选模型，模型请求失败时按顺序 fallback，并在健康接口和会话日志记录请求数、成功/失败数、最近模型、fallback、延迟和最近调用遥测；新增 `/api/agent-stream` SSE 阶段流和 provider token delta 转发、`/api/model-policy`、`/api/model-usage`、`/api/model-budget`、`/api/model-cost`、`/api/model-cost-policy`、`/api/model-billing`、`model_policy` / `model_usage` / `model_budget` / `model_cost` / `model_cost_policy` / `model_billing` 只读工具、“模型策略”“模型用量”“模型预算”“模型成本”“价格表”和“账单核对”按钮，展示候选模型、fallback 顺序、endpoint host、token usage 持久化账本、`FORGE_MODEL_REQUEST_LIMIT` / `FORGE_MODEL_TOKEN_LIMIT` 调用前预算预检、基于 `FORGE_MODEL_COST_POLICY` 的用户配置价格表 schema/校验/成本估算、基于 `FORGE_MODEL_BILLING_JSON` 或 `.forge/state/model-billing.json` 的用户提供账单核对、密钥脱敏和 provider 配置只读 guardrails，不发起模型请求。

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
- `.forge/approvals` 存储被命令/进程 policy 拒绝的审批请求审计记录和批准/拒绝状态。
- 命令执行是真实本地执行，但后端会先进行命令 policy 评估，只允许检查/构建类命令通过，并把风险等级和拒绝原因返回给前端。
- 受管进程同样经过 policy 评估，只允许开发服务类命令；会从命令或输出识别 `localhost` 端口并执行轻量健康探测，输出只保留尾部供界面查看。
- 创建隔离 worktree 要求当前工作区是 Git 仓库且没有未提交改动；否则会拒绝创建。

## 文件说明

- `server.js`：零依赖 Node 后端和 DeepSeek-compatible 模型接入。
- `index.html`：产品结构。
- `styles.css`：视觉系统和响应式布局。
- `app.js`：前端状态管理和 API 调用。
