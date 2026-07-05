# Forge Code

Forge Code 是一个本地运行的真实编码代理工作台。前端负责会话、计划审批、Diff 预览、自动验证、修复建议、checkpoint 回滚、Git/worktree 状态和命令面板；后端使用原生 Node.js 提供工作区文件读取、工具调用式 agent loop、unified diff 应用、审批后写入、命令执行、任务日志，并通过 `DEEPSEEK_API_KEY` 调用 `deepseek-v4-pro`。

## 运行方式

PowerShell:

```powershell
$env:DEEPSEEK_API_KEY="你的 DeepSeek API Key"
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
- 支持生成 PR/交付草稿，汇总工作区、分支、改动文件、检查记录、任务证据和 diff。
- 可以点击“运行建议命令”在工作区内执行白名单内的检查命令。
- 支持点击左侧文件列表查看文件内容。

## Codex 对标进展

- **执行闭环**：从“生成 diff”升级为“批准写入 -> 自动检查 -> 失败生成修复 diff -> 再次审批”。
- **命令自修复**：建议命令手动运行失败后，可基于失败输出继续生成修复 diff。
- **审查输出**：模型返回 `review` 数组，前端展示风险、测试缺口和关键验证点。
- **Git 隔离**：支持读取 Git 分支/改动状态，并在干净仓库中创建 `forge/...` 任务 worktree。
- **任务证据**：`.forge/tasks` 保存写入、检查和修复证据，便于回看任务历史。
- **审查闭环**：新增 `/api/review` 和 `/api/diff`，可基于当前 Git diff 输出审查发现和建议检查命令。
- **任务队列**：新增 `/api/queue`，支持本地排队、激活和完成任务。
- **交付草稿**：新增 `/api/handoff`，生成 `.forge/handoffs/*.md` 交付说明。
- **上下文索引**：新增仓库地图、符号索引和按行读取工具，减少大文件整段读取和误改概率。
- **安全收口**：命令执行限制在检查类白名单；没有可安全运行的检查命令时标记为 `applied_unverified`，不会误报失败。

## 本地检查

```powershell
node --check server.js
node --check app.js
node server.js --smoke-test
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
- `.forge/queue` 存储本地任务队列，`.forge/handoffs` 存储 PR/交付草稿。
- 命令执行是真实本地执行，但后端只允许检查类命令通过白名单。
- 创建隔离 worktree 要求当前工作区是 Git 仓库且没有未提交改动；否则会拒绝创建。

## 文件说明

- `server.js`：零依赖 Node 后端和 DeepSeek 接入。
- `index.html`：产品结构。
- `styles.css`：视觉系统和响应式布局。
- `app.js`：前端状态管理和 API 调用。
