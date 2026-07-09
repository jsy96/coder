# Forge Code

Forge Code 是一个本地运行的真实编码代理工作台。前端负责会话、计划审批、Diff 预览、自动验证、修复建议、checkpoint 回滚、Git/worktree 状态和命令面板；后端使用原生 Node.js 提供工作区文件读取、工具调用式 agent loop、unified diff 应用、审批后写入、命令执行、任务日志，并通过 `DEEPSEEK_API_KEY` 调用 `deepseek-v4-pro`。

## 运行方式

最简单的方式是双击项目根目录的 `start.bat`：

```text
D:\cc-picture\aaa\coder\start.bat
```

启动脚本会自动检查 Node.js、提示输入 `DEEPSEEK_API_KEY`、默认把当前项目目录作为工作区，并从 `4173` 开始寻找可用端口。如果 `4173` 已被占用，会自动切到后续可用端口；请以终端里最终输出的 `FORGE_URL=...` 或 `Forge Code running at ...` 为准打开页面，避免误进旧服务。

PowerShell:

```powershell
$env:DEEPSEEK_API_KEY="你的 DeepSeek API Key"
# 可选：按顺序配置模型 fallback
$env:FORGE_MODELS="deepseek-v4-pro,deepseek-chat"
# 可选：指向 DeepSeek-compatible Chat Completions endpoint
$env:FORGE_MODEL_API_URL="https://api.deepseek.com/chat/completions"
node server.js
```

默认工作目录是当前应用目录：

```text
D:\cc-picture\aaa\coder
```

然后打开终端最终输出的地址，默认通常是：

```text
http://127.0.0.1:4173
```

如果默认端口已被占用，启动脚本或服务端会自动尝试后续端口，例如 `http://127.0.0.1:4174`。也可以先运行下面的检查确认端口冲突自动切换逻辑：

```powershell
node server.js --port-conflict-smoke-test
```

如果要让 Forge Code 启动时操作另一个代码目录：

```powershell
$env:DEEPSEEK_API_KEY="你的 DeepSeek API Key"
$env:FORGE_WORKSPACE="D:\path\to\your\repo"
node server.js
```

也可以在界面左侧“仓库”卡片中直接输入本地目录路径并点击“切换”。切换后，文件列表、上下文、checkpoint 和后续命令都会基于新的工作目录。

## 推荐调试流程

1. 输入需求，让代理先生成计划和 diff，确认后点击“批准写入”。
   - 提示词输入框会随长任务描述自动增高，支持 Enter 发送、Shift+Enter 换行、Ctrl/Cmd+Enter 强制发送，并会避开中文输入法组合态误触。
2. 点击“运行建议命令”批量执行白名单内检查命令，或在命令列表里点击单条“运行/重跑”。
3. 如果命令失败，Forge Code 会自动聚合失败输出、验证计划、进程健康、语义诊断和可选页面 Trace，并把诊断证据交给修复代理生成下一轮修复 diff。
4. 命令列表会内联显示 running/pass/fail、exit code 和输出摘要；点击“详情”可把完整输出展开到日志区。
5. 点击“一键诊断”可以手动刷新调试面板；勾选“运行安全检查”后会执行可审计的本地检查命令。
6. 下一轮普通代理请求会自动附加最近一次调试诊断摘要，让模型直接看到失败信号、进程健康、页面 Trace 和建议动作，不必手动复制。
7. 在调试面板中点击“引用文件”，会从诊断包、进程健康、页面 Trace 和语义诊断里提取工作区文件并追加为 `@file`，再交给修复代理读取；点击“排队建议”会把所有可运行诊断建议按优先级去重后放入命令面板，点击“运行推荐动作”会自动执行第一条可运行的诊断建议；如果已有最近失败命令，点击“修复失败命令”会直接生成带失败输出和验证要求的修复任务；最近失败命令卡片还会显示失败恢复链，支持一键把“复现 -> 修复 -> 复查”命令放入命令面板或直接运行复查链；点击“生成修复提示”，可把带诊断摘要、主要发现、建议动作和验证命令的修复任务填入输入框；点击“直接修复”会生成同一份提示并立即启动带诊断上下文的代理。
8. 在调试面板中点击“复制诊断包”，可把完整诊断 JSON 复制到剪贴板，便于粘给修复代理、issue 或交接记录。
9. 调试面板里的“检查计划”“进程健康”“页面 Trace”“语义诊断”按钮会把对应证据展开到日志区，方便快速定位问题。

## 当前能力

- 读取当前工作区文本文件，并构建发送给 DeepSeek 的上下文。
- 通过 `repo_map`、`list_files`、`read_file`、`read_file_range`、`search_files` 组成多轮工具调用式 agent loop。
- 自动生成仓库地图、文件类型统计、package scripts 和 JS/CSS/HTML 符号索引，帮助模型先定位再读取。
- 调用 `deepseek-v4-pro` 生成中文计划、unified diff、审查发现和建议检查命令。
- 在右侧展示 Diff 预览；只有点击“批准写入”后才会修改文件。
- 批准写入前自动创建 checkpoint，可以在界面中一键回滚最近一次写入。
- 批准写入后自动发现并运行安全检查命令，例如 `node --check`、`node server.js --smoke-test`、`npm run check`。
- 如果检查失败，会把失败输出和已修改文件交给修复代理生成下一轮修复 diff；修复 diff 仍需用户批准后才会写入。
- 手动运行建议命令失败时，会先自动附加只读调试诊断，再把失败输出和诊断证据交给修复代理生成修复 diff。
- 支持 Git 状态检测；在干净 Git 仓库中可以创建隔离 worktree 和任务分支。
- 每次写入后会记录任务日志，包括 prompt、checkpoint、修改文件、检查结果、修复建议和 Git 状态。
- 支持点击任务日志查看完整任务证据；支持基于当前 Git diff 一键复核改动。
- Diff 预览支持复制全部 diff 或单个文件 diff，便于二次审查、粘贴到 issue 或交给外部工具。
- 支持本地任务队列，可先排队多个 prompt，再按隔离组逐个激活处理。
- 支持可恢复目标状态，记录当前目标、阶段、最近验证、待审批 diff 和建议下一步。
- 支持生成 PR/交付草稿，汇总工作区、分支、改动文件、检查记录、任务证据和 diff。
- 可以批量运行建议命令，也可以单条运行/重跑；命令列表会保留最近一次 exit code、输出摘要和详情入口。
- 支持启动、查看和停止受管开发服务进程，例如 `npm run dev`、`npm start`。
- 支持点击左侧文件列表查看文件内容，也可以点“引用”把文件路径追加到提示词输入框，快速指定编辑/排查上下文。

## Codex 对标进展

- **执行闭环**：从“生成 diff”升级为“批准写入 -> 自动检查 -> 失败生成修复 diff / 计划 / 建议命令 -> 再次审批验证”；`/api/apply` 会返回结构化 `recovery`，记录 checkpoint、已写入文件、失败检查、下一步动作和写入后复查命令，前端会展示“写入后验证恢复”证据卡，可加入提示词、放入命令面板、直接运行复查或启动诊断修复。写入请求异常或写入后验证失败但没有修复 diff 时，也会保留原始 diff、待写入文件、验证命令、失败检查、当前 `@file` 命中/缺失边界、当前调试目标、浏览器异常分诊和修复证据链，生成可加入提示词、重试/部分应用或诊断修复的证据卡。
- **写入冲突保护**：`/api/apply` 先做 diff 冲突预检，默认冲突时零写入；需要时可显式“部分应用”无冲突文件或同文件内无冲突 hunk，并保留文件/hunk 冲突清单；前端 diff 预览会把每个 hunk 拆成可勾选项，支持按文件全选/取消，部分应用时只提交选中的 hunk 并在写入证据里记录 selectedHunks。`/api/diff-conflicts` 和 `diff_conflicts` 只读工具可输出 CURRENT/PROPOSED 冲突预览；冲突面板可把冲突证据加入提示词或直接启动冲突修复，并会带入当前调试目标与最近浏览器异常分诊，避免处理过期 diff / hunk 冲突时丢失正在排查的页面 URL、目标进程和复查命令；`/api/conflict-resolution-draft` 可把 resolved 文本转换成新的待审批 diff，不直接修改文件；冲突解决草稿生成失败时会保留 resolved 摘要、冲突预览和请求上下文，支持加入提示词、重试或回到冲突修复。
- **命令自修复**：建议命令手动运行失败后，可基于失败输出继续生成修复 diff。
- **修复证据链**：手动命令失败、诊断包、修复候选 diff、批准写入和后续验证会串成同一条 repair chain，并随 `/api/apply` 写入任务日志；修复候选返回的验证命令会自动进入命令面板和最近命令历史，便于回看并继续执行“失败 -> 修复 -> 验证”的完整链路。
- **命令面板反馈**：建议命令和写入后的自动检查结果都支持单条运行/重跑、手动输入安全验证命令、输入框上下键翻最近命令、最近命令填入/加入/重跑、固定常用命令、清空未固定命令、复制命令、复制输出、把单条或整组命令证据加入提示词、把整组命令状态生成“验证提示”、基于整组命令证据直接启动修复、从命令输出识别并引用相关文件、失败命令结束后自动提示已识别的相关 `@file`、从整组命令输出一键引用相关 `@file`、在批量证据中自动汇总相关 `@file`，并把失败分类、源码位置、恢复链和最近浏览器异常分诊放入批量修复上下文；复制全部命令、只重跑失败命令和批量运行摘要，行内展示 running/pass/fail、exit code 和输出摘要，并提供“详情”回看完整输出；复制命令、输出、diff 或诊断包会先用 Clipboard API，失败后自动回退到 textarea 复制，并在 toast 和日志里记录最近复制方式或失败原因；命令执行、诊断或修复请求失败时会保留命令、最近运行状态、prompt 和诊断请求参数，生成可加入提示词、重试或生成验证修复提示的失败证据卡；通用动作失败卡还会带上当前 `@file` 命中/缺失边界、当前调试目标和浏览器异常分诊，并可一键把语法、UI、debug 以及按类型补充的 integrations/fast smoke 排入命令面板，避免失败入口只剩错误文本。
- **Diff 审阅动作**：Diff 预览区展示待审批总文件数和增删行统计，单文件也显示 +/− 行数；支持引用 diff 文件到提示词、读取原文件、全部折叠/展开、单文件折叠/展开、“复制全部”和单文件“复制”，复制结果会写入日志证据，方便外部审查和问题复现；读取原文件失败时会保留文件路径、请求参数和错误栈，生成可重试、可引用文件或直接修复的失败证据卡。
- **失败命令诊断**：`/api/command` 在白名单命令失败时会自动附加只读调试诊断；前端会展示“失败命令诊断”证据，并把诊断包传给 `/api/repair-command`，让修复代理不仅看到 stderr/stdout，也能看到检查计划、进程健康、页面 Trace 和语义诊断；`/api/repair-command` 生成 diff 时会同步写入 `failed_command_repair` 待审批草稿，不直接改文件，前端会展示“失败命令修复草稿已生成”的 proposal id、策略、恢复链和验证命令，刷新后也可从 pending proposal 恢复审批；源码定位按钮会读取具体行号上下文并调用 `/api/source-context-repair-draft` 生成 `source_context_repair` 待审批草稿，让修复围绕失败行附近做更小的 diff；最近失败命令卡片和普通命令面板里的每条失败命令行都能直接“源码定位 / 源码提示 / 源码修复”，不用先切换到单独诊断卡；失败命令还可一键生成“验证提示”或直接启动“验证修复”，把输出、相关文件、诊断建议和可复用检查命令整理成下一轮可验证修复任务；诊断请求本身失败时会作为门禁失败证据保留下来，避免命令修复链路静默断开。
- **最近失败命令**：调试诊断面板会固定展示最近一次失败命令，支持查看详情、复制命令/输出、把失败命令 transcript 加入提示词、从 stderr/stdout 一键引用相关 `@file`、生成验证提示、重跑、从面板顶栏直接“修复失败命令”，或从卡片启动带失败输出的修复代理，并会按工作区/会话在浏览器本地恢复最近命令结果，避免刷新页面后丢失 stderr 和复现入口；最近一次“一键诊断”的压缩诊断包也会本地恢复，包含检查计划、进程健康摘要、页面 Trace 摘要、浏览器异常分诊和语义诊断摘要，刷新后仍可继续加入提示词、引用证据或启动验证修复。
- **一键调试工作台**：新增“一键诊断”面板，可聚合验证计划、CI 状态、受管进程健康、浏览器 Trace、语义诊断和建议动作；带命令的下一步建议可批量“排队建议”、直接放入命令面板、复制、单条运行，或通过“运行推荐动作”自动执行第一条可运行建议，并把命令运行状态、exit code 和输出摘要沉淀到可恢复修复证据链；下一轮代理请求会自动附加最近诊断摘要，减少手动复制诊断包的来回；支持直接运行诊断给出的验证计划、生成带诊断上下文的修复提示或直接启动诊断修复代理、复制完整诊断包、把诊断上下文加入提示词，并可展开检查计划、进程健康、浏览器分诊、页面 Trace、浏览器异常源码定位和语义诊断等证据；当 Trace 或诊断映射出 `browserSourceLocations` 时，浏览器证据卡和诊断面板会直接提供“源码提示 / 源码修复”，先读取源码行号上下文，再调用 `/api/source-context-repair-draft` 生成 `source_context_repair` 待审批草稿，并把语法、UI、debug 和 browser smoke 验证命令放回命令面板；复制诊断包、恢复诊断包和加入提示词都会包含 `browserTriage`、`browserSourceLocations` 的状态、统计、分诊发现、源码文件行号和下一步动作，便于手动交接、刷新恢复或复现；代理/SSE 请求失败时会把调试诊断识别到的相关文件显示在失败证据里，并提供“引用文件”入口，让下一轮修复优先读取这些 `@file`；诊断请求失败或诊断面板里的验证计划运行失败时，也会保留目标 URL、检查开关、待运行命令、诊断摘要和错误栈，生成可继续修复的门禁失败证据卡。
- **审查输出**：模型返回 `review` 数组，前端展示风险、测试缺口和关键验证点；每条审查发现可一键生成修复提示或直接启动修复代理，自动带上文件、行号和原始任务上下文；当前 diff 复核请求失败时会保留 prompt、待审批 diff 摘要和请求上下文，生成可继续修复的审查失败证据，并自动把语法检查、UI smoke、coding smoke 和 debug smoke 放回命令面板。
- **Git 隔离**：支持读取 Git 分支/改动状态，并在干净仓库中创建 `forge/...` 任务 worktree；创建失败时会保留当前工作区、待审批 diff、上一轮需求、当前 `@file` 命中/缺失边界、当前调试目标、浏览器异常分诊和失败原因，生成可加入提示词或直接诊断修复的安全证据卡。
- **任务证据**：`.forge/tasks` 保存写入、检查和修复证据；历史任务可查看详情、把任务证据加入提示词、将历史检查、失败命令、选中 hunk、可重跑验证命令、当前调试目标、页面异常分诊和当前推荐缺口放入命令面板或继续提示，生成带历史检查和推荐能力缺口的任务验证提示，直接启动任务验证修复、直接启动基于历史证据的继续修复，或一键引用任务涉及的变更文件；读取详情、加入提示词、生成验证命令/验证提示、继续任务或引用文件失败时会保留任务 ID、状态、变更文件和错误栈，生成可加入提示词、重试或直接修复的失败证据卡，便于从上一轮继续调试。
- **可恢复会话线程**：新增 `/api/threads`、`/api/thread`、`/api/thread-fork` 和侧栏“最近会话”，把本地会话消息保存到 `.forge/threads`，支持新建线程、更新消息、列表内联重命名、分叉上下文、置顶排序、归档过滤、按工作区列出和点击恢复；历史线程可一键加入提示词或直接启动继续修复，自动带最近消息、状态和待审批提案线索；恢复、置顶、重命名、分叉、归档或创建会话失败时会保留线程摘要、请求参数和错误栈，生成可重试、可加入提示词或继续修复的线程失败证据卡；线程 artifact 不写业务文件。
- **审查闭环**：新增 `/api/review`、`/api/reviews`、`/api/review-artifact`、`/api/review-comments` 和 `/api/diff`，可基于当前 Git diff 输出审查发现、建议检查命令、PR 行级评论草稿，并持久化审查 artifact；历史审查记录可加入提示词、把审查验证命令排入命令面板、生成带验证命令和页面异常分诊的审查验证提示、直接启动审查验证修复，或直接启动基于审查证据的修复；PR 评论草稿可继续加入提示词、把评论验证命令排入命令面板、生成带页面异常分诊的 PR 评论验证提示、直接启动 PR 评论验证修复，或直接按评论启动修复；查看历史审查、读取审查证据、生成验证提示、生成评论草稿或直接修复失败时，会保留 artifact 摘要、发现/命令数量、请求参数和错误栈，生成可重试、可加入提示词或直接修复的失败证据卡，同时自动排入本地复查命令，避免审查链路中断后只剩错误日志。
- **任务队列**：新增 `/api/queue` 和 `/api/queue-isolation`，支持本地排队、优先级、重试计数、隔离组并发保护、激活、完成和自动激活下一项任务；队列行可加入提示词、把当前验证计划命令放入命令面板，或结合当前推荐能力缺口和最近页面异常分诊直接启动继续任务，必要时先安全激活队列项；入队、激活、完成、重试、验证命令生成或继续失败时会保留队列项、请求参数和错误证据，生成可加入提示词、重试或继续修复的动作失败卡；隔离报告会作为门禁证据展示，可加入提示词或直接基于阻塞队列启动修复；隔离报告读取失败时也会生成门禁失败证据卡，保留 endpoint、limit 和错误栈，避免队列调试入口静默断开。
- **可恢复状态**：新增 `.forge/state/goal.json`，健康接口返回当前目标、阶段、最近验证、待审批 proposal、下一步和 `recoverySummary` 结构化恢复线索；可恢复状态卡片会展示待审批提案、最近任务、验证状态、推荐缺口、最近失败命令、变更文件、选中 hunk、验证命令、能力缺口数量、外部准备项、本地预检命令和下一步摘要，并在“继续目标”提示里带入这些 cues/blockers/nextActions、恢复明细、当前调试目标和最近浏览器异常分诊；也支持把最近验证命令或外部准备清单里的本地预检命令直接放回命令面板，或从“推荐缺口 + 上次验证结果”继续任务。
- **交付草稿**：新增 `/api/handoff`，生成 `.forge/handoffs/*.md` 交付说明；草稿生成后可一键加入提示词、把历史任务检查/失败命令、当前调试目标验证命令、最近调试诊断验证计划和当前命令面板合并成交付前验证命令，或生成带调试目标、浏览器异常分诊和验证命令的交付验证提示并直接继续处理交付 blocker、失败验证和遗漏说明；草稿生成失败时会保留 prompt、当前待审批 diff、命令清单和错误栈，生成可直接修复的门禁失败证据。
- **PR readiness**：新增 `/api/pr-readiness`、`/api/remote-pr-status`、`/api/ci-status` 和“PR 检查”“CI 状态”按钮，只读发现 Git remote/provider、本地 CI 配置、diff/review/check 证据；可通过已认证 `gh`/`glab` 读取远端 PR/CI 状态，并生成可复制 PR 草稿；Gitee remote 会被识别为 `gitee` 并走手工 continuation evidence 路径，生成仓库 URL、PR/CI/评论回填要求和本地 publish/gates 复查命令，不再落到泛化 `custom` provider；不会执行 `git push` 或创建真实远端 PR；PR readiness 证据可一键加入提示词、生成聚焦 blockers/warnings 的阻塞提示、生成带本地检查命令的门禁验证提示、把检查命令放入命令面板、直接启动门禁验证修复或直接启动门禁修复；PR/CI 请求失败时会生成带 endpoint、prompt、待审批 diff 和命令清单的失败证据卡。
- **合并门禁**：新增 `/api/merge-gate`、`merge_gate` 只读工具和“合并门禁”按钮，聚合 PR readiness、CI 状态、审查 artifact、审批状态和远端发布预检，输出 pass/warn/block gate；不执行命令、不推送、不创建 PR；合并门禁结果可一键加入提示词、复用检查命令、生成聚焦 blockers/warnings 的阻塞提示、生成带页面异常分诊的门禁验证提示、直接启动门禁验证修复或直接启动基于 blocker 的修复代理；合并门禁请求失败时同样保留请求参数和当前工作上下文，方便直接进入可验证修复。
- **验证门禁计划**：新增 `/api/verification-plan`、`/api/ci-status`、`verification_plan` / `ci_status` 只读工具和“验证门禁”“CI 状态”按钮，将安全检查命令、CI 配置、最近验证结果、远端只读检查和变更范围汇总为 PR 前置门禁清单；该计划不执行命令；门禁/CI/权限证据可一键加入提示词、生成带安全检查命令的验证提示、复用安全检查命令、排队验证命令、直接启动门禁验证修复或直接启动修复；门禁/CI/权限矩阵/Trust 请求失败时不再只弹错误，而是生成可加入提示词、引用上下文、自动排入语法/UI/fast/debug 复查命令并直接进入验证修复的失败证据卡。
- **快捷检查命令**：“验证门禁”会把自动发现的安全检查命令直接渲染成可复制、可运行、可批量运行的命令行，并同步进入最近命令历史，减少手动拼命令。
- **远端发布审批**：新增 `/api/remote-publish-plan`、`/api/remote-publish-packages`、`/api/remote-publish-package` 和“发布审批”“发布包”按钮，生成 `git push`、`gh/glab pr/mr create`、PR/MR 评论回写候选动作，把 PR body、review summary 和计划写入 `.forge/remote-publish` 并在 `.forge/approvals` 中登记；这些端点只生成/读取审批包，不执行远端写入；发布审批和发布包结果可作为门禁证据加入提示词、引用 `pr-body.md` / `review-summary.md` / `plan.json` 等本地文件、复用候选命令、生成继续包/发布回填提示，或直接启动发布阻塞修复。
- **远端发布预检与继续包**：新增 `/api/remote-publish-preflight`、`/api/remote-publish-continuation`、`/api/remote-publish-evidence`、`remote_publish_preflight` 和 `remote_publish_continuation`，针对发布包汇总审批状态、Git 远端、CLI 安装/认证、命令风险和阻塞项，并生成 `continuation.md` 与 `external-evidence-template.json`，用于人工执行远端动作后回填执行人、时间、远端 URL、PR/MR 编号、CI 链接、评论链接、输出摘要、回滚方案和后续验证命令；Gitee 发布包会标记 `manualProvider`，生成 `manual:gitee-pr` / `manual:gitee-comment` 步骤和 Gitee 仓库 URL，明确要求人工在 Gitee 完成 PR 或评论后回填证据模板；回填后 `/api/remote-publish-evidence` 会校验必填证据、生成 `external-evidence.json` 与 `external-evidence-summary.md`，并把 publish/gates/core 复查命令回排到本地门禁链路；包索引会展示回填证据状态、远端 URL、PR/CI/评论链接摘要，合并门禁会新增 `remote-publish-external-evidence` gate，把回填后的远端证据纳入交付判断；这些入口不执行 push、建 PR 或远端评论；预检、继续包和回填证据结果可一键加入提示词、引用本地 artifact、排队本地复查命令、生成发布回填提示或直接基于 blockers 启动修复；发布审批、发布包读取、预检、继续包和证据回填请求失败时会保留发布包/审批上下文和请求参数，继续生成可修复证据。
- **上下文摘要**：新增 `/api/context-snapshot` 和“保存上下文摘要”按钮，将仓库文件规模、扩展名分布、脚本、符号线索、Git 状态和资产摘要落盘到 `.forge/state/context-snapshot.json`，用于跨会话恢复；摘要结果可一键加入提示词、把上下文验证命令排入命令面板，或直接启动基于当前工作树复核的继续任务。
- **上下文压缩**：新增 `/api/context-compact` 和“压缩上下文”按钮，将目标状态、仓库摘要、关键符号、Git 轻量证据、最近任务/审查/审批压缩为 `.forge/state/context-compact.json`；目标状态和任务日志变化后也会自动刷新轻量压缩 artifact，用于长会话恢复与交接；会话继续、队列继续、任务继续和目标继续都会补入最近浏览器异常分诊，避免页面调试线索在跨轮恢复时丢失；压缩结果可一键加入提示词、排队验证命令或直接继续修复。
- **上下文滚动摘要**：新增 `/api/context-rollup`、`context_rollup` 只读工具和“滚动摘要”按钮，将目标、任务、审查、审批和 Git 变化整理为 `.forge/state/context-rollup.json` 中可检索的恢复切片；上下文摘要、压缩和滚动摘要结果可一键加入提示词、排队验证命令或直接启动上下文继续任务；这些上下文 artifact 生成失败时也会保留端点、请求参数、当前工作区、待审批 diff 和上下文状态，生成可继续处理的证据卡，并自动排入语法、UI、fast 和 debug 复查命令。
- **语义索引**：新增 `/api/semantic-index`、`/api/semantic-search`、`/api/semantic-references`、`semantic_index` / `semantic_search` / `semantic_references` 只读工具和“生成语义索引”按钮，抽取并检索声明、导入、导出、路由、选择器、调用线索和符号引用上下文，可持久化到 `.forge/state/semantic-index.json`。
- **代码智能概览**：新增 `/api/code-intelligence`、`code_intelligence` 只读工具和“代码智能”按钮，把语义索引、依赖图、语义诊断和 TypeScript 类型检查发现汇总为入口文件、API 面、符号热点、依赖热点、typecheck 候选命令与 readiness 风险视图；语义索引同时抽取零依赖符号大纲，记录函数/类/方法的起止行、参数、容器和签名；语义索引、代码智能、符号大纲、语义诊断、影响面和依赖图结果可一键加入提示词、引用相关文件、生成带安全检查命令和页面异常分诊的验证提示、把语义/调试复查命令放回命令面板、直接启动语义验证修复，或直接启动基于语义证据的修复代理；这些代码智能入口失败时也会生成同样的语义失败证据卡，保留接口、请求参数、当前 diff 和上下文状态，并自动排入语法检查、UI smoke、semantic smoke 和 debug smoke，避免代码智能链路失败后只剩错误日志。
- **符号大纲与定义查询**：新增 `/api/symbol-outline`、`/api/semantic-definition`、`/api/semantic-symbol-impact`、`/api/semantic-rename-preview`、`/api/semantic-rename-draft`、`symbol_outline` / `semantic_definition` / `semantic_symbol_impact` / `semantic_rename_preview` / `semantic_rename_draft` 工具和“符号大纲”按钮，可按文件/关键词检索符号范围，并按符号名或文件行号返回定义位置、引用、调用点、影响文件、重命名候选替换位置、命名冲突和建议验证命令；前端语义证据卡支持把符号影响或重命名预览验证命令直接放入命令面板，也支持基于 edit targets、定义、引用、调用点、依赖文件和重命名风险生成“影响提示”“重命名提示”、生成待审批重命名 diff 草稿或直接启动对应修复，并沉淀修复证据链；重命名草稿只更新 pending proposal，不直接写入目标文件，仍需走现有 diff 审批写入流程。
- **语义诊断**：新增 `/api/semantic-diagnostics`、`semantic_diagnostics` 只读工具和“语义诊断”按钮，基于语义索引发现重复声明、未解析本地导入、前端 API 调用缺口、前后端 API 方法不匹配（如前端 POST 调 GET-only 路由）和重复路由，并可返回附近代码上下文。
- **语义影响面**：新增 `/api/semantic-impact`、`semantic_impact` 只读工具和“影响面”按钮，可基于当前 Git diff、显式路径或待审批 diff 找出变更文件的依赖方、调用方、路由、选择器和局部调用图；Diff 预览区新增“分析影响”和“预审查”，会在批准写入前从 pending patches 抽取目标文件、生成影响证据卡/预应用审查清单，并把语义/前端烟测命令放入验证面板；直接点“批准写入”时，如果当前 diff 还没有完成同一轮预审查，会先自动生成只读预审查证据再继续 apply，避免盲写。
- **依赖图**：新增 `/api/dependency-graph`、`dependency_graph` 只读工具和“依赖图”按钮，基于语义索引生成本地 import 图、未解析导入、外部依赖和循环依赖组件。
- **上下文索引**：新增仓库地图、符号索引、按行读取工具和 TypeScript 类型检查命令发现，减少大文件整段读取、误改和修复后漏跑类型检查的概率。
- **文件引用入口**：左侧文件列表支持一键把 `@path/to/file` 追加到当前提示词；输入框会在提交前实时预览 `@file` 命中/未命中和引用字节数；后端会安全匹配工作区内已知文件并在代理生成 diff 前预读这些引用文件，前端会显示实际命中的引用文件证据；文件读取失败会保留路径、接口参数和错误栈，支持重试、引用文件或直接修复；路径拼错或未命中时会显示 missing reference 警告、最可能的候选文件和一键替换按钮，并可一键把未命中证据加入提示词或直接启动引用修复，避免代理假装读过不存在的文件。
- **安全收口**：命令执行先经过可审计 policy 分类，返回允许/拒绝、风险等级和原因；没有可安全运行的检查命令时标记为 `applied_unverified`，不会误报失败。
- **审批请求**：被 policy 拒绝的命令和进程会写入 `.forge/approvals`，并在侧栏展示为可查看、可批准、可拒绝、可执行的审计记录；每条审批可一键把策略原因、目标动作、执行/升级记录、当前 `@file` 命中/缺失边界、当前调试目标和浏览器异常分诊加入提示词，把语法/UI/core/publish/integrations 等审批验证命令放入命令面板，生成聚焦阻塞原因的“阻塞提示”，也可直接启动代理生成安全替代或审批阻塞修复方案；新增 `/api/approval-escalation` 和“升级证据”按钮，可为被拦截命令、进程、远端发布计划或工具调用生成 `.forge/escalations` 外部受控沙箱升级证据包，不在本地绕过策略或执行危险命令；查看、批准、拒绝、升级或执行失败时会保留请求参数、审批状态和错误栈，生成可加入提示词、重试、安全替代或直接修复的动作失败证据卡；执行已批准请求时仍会重新检查本地安全策略，执行结果卡也可继续加入提示词、排队验证命令、生成阻塞提示、安全替代或升级证据，远端发布计划不会被自动执行。
- **权限矩阵**：新增 `/api/permission-matrix`、`permission_matrix` 只读工具和“权限矩阵”按钮，按 workspace、local-shell、model、browser、extension、MCP、git-remote 等 provider/action 汇总访问级别、审批要求、命令执行、文件写入、远端写入和关键 guardrails；远端发布权限已拆成 `read_pr_ci`、`push_branch`、`create_gitee_pr_manual` / `create_pr`、`comment_gitee_pr_manual` / `comment_pr`、`ingest_external_evidence` 等动作，Gitee 会标记为 `manualProvider`，所有 push、建 PR、评论远端写入在本地仍保持 `writesRemote=false`，只通过继续包和 `/api/remote-publish-evidence` 回填外部执行证据。
- **长任务管理**：新增 `/api/processes`、`/api/process-startup-commands`、`/api/process-health`、`/api/process-search`、`/api/process-history`、`/api/runtime-url` 和 `/api/debug-target`，可按 policy 启动受管开发服务、从 `package.json` 和常见入口只读发现推荐启动命令、识别本地端口、把当前真实运行 URL 持久化到 `.forge/state/runtime-url.json`、独立汇总 HTTP 健康探针、持久化 `.forge/process-logs` 日志 artifact、搜索/查看输出尾部、回放历史进程并停止进程；健康接口和启动命令发现会返回 `runtimeUrl`，前端会自动把真实 URL 填入页面调试输入框，避免端口自动切换后误连旧服务；`/api/debug-target` 会把运行 URL、受管进程探针、诊断摘要、验证命令和下一步动作聚合成“当前调试目标”，前端一键诊断会优先展示这个目标并可直接加入提示词；进程区支持“发现”填入推荐命令，“发现并启动”把推荐命令直接送入受管进程启动路径，也支持“发现并调试”在启动后等待探针 URL，自动串起页面检查和浏览器 Trace；进程列表、启动命令发现、健康探针、日志搜索命中和历史 artifact 可一键加入提示词、直接启动基于进程证据的修复，或把探针 URL 直接送入页面检查 / 浏览器 Trace；受管进程行支持“一键调试”，自动串起进程健康、页面检查和浏览器 Trace，生成可加入提示词、引用 artifact、生成带安全检查和页面复查要求的验证提示、直接启动浏览器验证修复，或直接修复的页面调试证据卡；一键调试完成后还会沉淀“启动后页面调试恢复”卡，合并健康探针、页面检查、Trace 异常、浏览器异常分诊、下一步动作和复查命令，可加入提示词、放入命令面板、重跑 Trace 或启动验证修复；启动命令发现、发现并启动、发现并调试、启动/停止进程、读取进程输出、搜索日志、读取历史或健康探针失败时，会把命令、endpoint、请求参数、策略/探针上下文和错误栈转成可加入提示词、重试或直接修复的进程失败证据卡。
- **会话续写上下文**：历史会话的“加入提示词 / 继续会话”现在会同时带上最近消息、当前输入里的 `@file` 命中与缺失边界、当前调试目标、浏览器异常分诊和待审批提案线索；任务、队列、目标继续、冲突修复、审查、PR 评论和交付草稿也复用同一套 `@file` / 调试目标摘要，提醒代理先读取当前工作树，不把未命中的文件引用当成已读上下文，减少续写时改错文件或连错端口。
- **长任务健康规则**：`/api/process-health` 会只读加载当前工作区 `.forge/process-health-rules.json`，按命令片段匹配受管进程，校验期望 HTTP 状态码、探针 URL、探针响应正文、输出日志证据、输出/响应正则匹配，以及不应出现的错误文本或错误正则（如 `SyntaxError`、`EADDRINUSE`、`fatal`），并把规则命中、失败原因和观察值汇总到健康报告；不启动、停止或修改进程。
- **一键调试推荐动作**：`/api/debug-diagnostics` 的 `nextActions` 会按优先级排序，并为每条建议带上 `kind`、`target`、证据摘要和可执行命令；`/api/debug-target` 会在此基础上自动选择显式 URL、健康受管进程探针或当前 runtime URL，聚合 `target`、`summary`、`verificationCommands` 和嵌入式 diagnostics，避免端口切换或多进程场景下手动判断该调试哪个页面；当页面 Trace 可用时会生成 `browserTriage`，把 runtime exception、console error/warn 和失败网络请求转成 error/warn/pass 分诊，并把 Runtime exception / console stack URL 映射为工作区内 `browserSourceLocations`，生成“定位浏览器异常源码”高优先级建议；前端调试面板会显示“当前调试目标”卡片和这些证据，可一键检查页面、采集 Trace、执行完整复查、放入命令面板、复制、运行、加入提示词，或沉淀到修复证据链；“源码提示 / 源码修复”会把这些浏览器源码位置批量读取为源码上下文，生成可继续编辑的修复提示或待审批 diff 草稿，避免页面异常排查停留在 Trace 文本；“生成修复提示 / 直接修复”也会把当前调试目标、分诊发现、源码位置、分诊下一步、页面复查要求和推荐 smoke 命令带入提示词，并把 `browserTriage` / `browserSourceLocations` 作为结构化 `debugContext` 传给修复代理，让代理按浏览器异常优先级闭环处理。
- **能力补齐任务卡**：Codex 对标推荐项和每条能力缺口都新增结构化 `taskPlan`，后端能力审计会返回目标、重点文件、验收条件、外部授权判断、验证命令和只读策略，前端“任务卡 / 验证命令 / 直接补齐或准备清单”复用同一份证据；推荐下一步会优先选择无需远端凭据、可在本地立即验证/修复的能力缺口，同时保留远端 PR、发布、provider 权限等授权清单，避免把外部阻塞项误当成当前可执行任务；“验证命令”会优先使用这张任务卡的语法检查、UI smoke、debug/browser、semantic、gates、publish 或 integrations smoke 组合，减少用户从能力矩阵到真实补齐任务之间的手动拆解。
- **失败命令分类**：`/api/command` 对非零退出命令会返回 `failureAnalysis` 和 `recoveryChain`，自动识别语法错误、模块解析、包管理器损坏、端口占用、权限、缺文件、测试失败、lint 和超时等常见类型，并生成“复现原命令 -> 修复/替代验证 -> 重跑原命令 -> 语法检查 -> debug smoke”的可执行复查链；当 `npm` / `pnpm` / `yarn` 自身入口损坏时，会优先给出 `node` 直跑和 `validate.bat` 等不依赖包管理器的验证替代路径；最近失败命令卡片会直接显示分类、相关文件数量、首条下一步建议和复查链数量，详情、验证提示和修复证据链也会带上分类、相关文件线索、恢复链和下一步排查建议；debug smoke 会覆盖语法、模块解析、缺文件、端口占用、包管理器损坏和恢复链等典型失败样本。
- **批量源码上下文**：命令面板工具条新增“源码上下文”和“源码修复”入口，会汇总所有失败命令的 `sourceLocations`、失败分类和附近源码片段；既可一键加入提示词，也可直接调用 `/api/source-context-repair-draft` 生成待审批的批量源码修复草稿，并把“重跑原失败命令 -> 语法检查 -> debug smoke”的验证链放回命令面板；如果接口或模型请求失败，前端会把失败命令、源码定位、错误原因和可重跑验证命令回填到提示词并保留证据卡，同时把验证命令放回命令面板，避免调试链路中断后丢上下文；该接口还支持只读 `dryRun`，用于 smoke 覆盖源码读取、策略和验证命令，不依赖真实模型请求。
- **能力矩阵**：新增 `/api/capabilities` 和侧栏“Codex 对标”，按 partial/missing 缺口优先展示已实现、部分实现和缺失能力，并显示状态汇总；能力审计会额外输出“读懂项目上下文 / 安全改代码 / 运行与调试闭环 / 审查与交付 / 工具与多模态”五条写代码与调试主链路的覆盖度、证据、缺口和是否依赖外部授权；同时返回 `gapSummary`，汇总未完成总数、本地可补齐数量、外部授权受限数量、推荐缺口、优先本地动作和前几项本地/外部缺口；当剩余项都依赖外部授权时，还会返回 `externalPreparation`，把远端 PR、push、provider、MCP、跨站点浏览器、账单或系统级沙箱等事项拆成本地准备清单、授权边界和可运行预检命令；覆盖卡片和“剩余差距摘要”可直接启动“本地补齐”，也可把外部阻塞项作为“授权清单”或“准备清单”加入提示词，或把外部准备清单里的本地只读预检命令一键放入命令面板，避免把外部阻塞误当成本地已完成；“继续目标”提示会带入这份摘要，让下一轮优先推进可在本地验证的能力闭环；顶部会给出“推荐下一步”缺口，按真实写代码/调试影响排序；每条能力差距都可查看详情、加入提示词、把当前验证计划命令放入命令面板，或直接启动“补齐到更像 Codex”的改进任务。
- **工具目录**：新增 `/api/tools` 和侧栏“工具目录”，展示内置 agent 工具、本地扩展工具桥接、参数 schema 和只读策略；工具行可查看详情、加入提示词或启动“目录修复”，用于补齐工具说明、参数 schema、验证入口和失败恢复路径。
- **扩展目录**：新增 `/api/extensions` 和侧栏“扩展目录”，扫描 `.forge/extensions/{skills,plugins}` 下的本地 manifest，展示技能/插件声明、能力和审批策略；扩展行可查看详情、加入提示词、生成“准备清单”，或生成工具调用“审批示例”，不会绕过审批直接执行扩展工具。
- **扩展 Trust 审计**：新增 `/api/extension-trust`、`extension_trust` 只读工具和扩展区“Trust”按钮，对本地扩展 manifest 计算 SHA-256，展示 checksum pin、本地公钥签名校验、审批要求和未接入远端签名市场的 guardrails；审计结果会作为门禁证据卡展示，可一键加入提示词或直接启动基于 trust gap 的修复任务。
- **扩展工具调用审批**：新增 `/api/extension-tool-call`，把本地扩展声明的工具映射到内置只读工具；调用先写入 `.forge/approvals`，批准后才通过 `/api/approval-execute` 执行；审批计划卡可一键加入提示词或直接生成安全替代方案；扩展调用失败会保留 manifest、工具名、请求参数和错误证据，并提供加入提示词、重试、目录修复和直接诊断修复入口。
- **权限策略审计**：新增 `/api/policy-audit`、`policy_audit` 只读工具和“权限审计”按钮，汇总命令/进程策略、审批状态、工具访问级别、guardrails 和当前权限缺口；不会执行命令或改变审批状态。
- **MCP 发现与探测**：新增 `/api/mcp?probe=1` 和侧栏“MCP 服务 / 探测”，只读发现 `.forge/mcp/servers.json`、应用根目录 `.mcp.json` 与工作区 `.mcp.json` 中声明的 MCP server，并对策略允许的本地 MCP 做短时握手、工具、资源和提示词枚举；MCP 行可查看详情、读取首个资源、加入提示词或生成“准备清单”，用于整理 server 配置、资源/工具目录、审批边界和本地探测证据；`/api/mcp-resource` 和 `mcp_resource` 只读读取 MCP resource 内容，不执行 `tools/call`，读取结果可一键加入提示词或启动基于 resource 内容的处理/修复任务；MCP 探测、资源读取或工具调用审批失败都会生成可重试、可加入提示词、可回到目录修复的动作失败证据卡。
- **MCP 工具调用审批**：新增 `/api/mcp-tool-call`，先校验本地 MCP server、工具目录和参数大小，再写入 `.forge/approvals`；只有批准后通过 `/api/approval-execute` 执行 `tools/call`；前端“审批示例”会生成审批计划而不是直接执行，审批计划卡可一键加入提示词或直接生成安全替代方案；MCP 工具调用失败会保留 server、工具名、参数和探测目录证据，支持重试、目录修复和直接诊断修复。
- **资产目录**：新增 `/api/assets` 和侧栏“资产目录”，索引工作区图片、PDF/Office、CSV/JSONL 和媒体文件的元数据；资产行支持查看检查详情、作为 `@file` 引用加入提示词、把检查摘要加入提示词，或直接启动基于资产证据的处理/修复任务；资产检查、加入提示词或直接处理失败时，会保留资产路径、检查 endpoint 和错误栈，生成可重试、可引用原文件或直接修复的资产失败证据卡。
- **资产内容检查**：新增 `/api/asset-inspect`，支持图片头部尺寸、PNG 像素视觉摘要、SVG title/desc/text/aria-label 本地文本提取、Tesseract OCR 执行开关、缓存 artifact 和引擎探测、CSV/TSV/JSONL 抽样、Parquet footer metadata 探测、DOCX/PPTX/XLSX OOXML 文本抽取、旧版 DOC/XLS/PPT CFBF 文本探测、PDF 页框/文本块/FlateDecode layout 抽取、WAV/MP3/MP4/WebM 媒体元数据解析，以及 Whisper 转写执行开关、缓存 artifact 和引擎探测。
- **页面检查**：新增 `/api/browser-check` 和侧栏“页面检查”，仅允许本机 URL，采集状态码、标题、基础 heading/form/button 结构和本地访问策略证据；页面检查、审计、基线、截图、DOM、Trace、交互、会话和视觉断言结果都可一键加入提示词、引用截图/Trace/视觉 diff artifact 文件，或直接启动基于浏览器证据的修复代理；浏览器证据行可继续一键升级为 Trace、截图或视觉断言，并保留上一条证据作为 sourceEvidence；浏览器 API 请求失败也会生成同样的可操作证据卡，并自动把语法检查、UI smoke、debug smoke 和 browser smoke 放回命令面板，避免错误只停留在日志里。
- **页面可访问性审计**：新增 `/api/browser-audit` 和“审计”按钮，对本地页面做静态 HTML/a11y 审计，输出 title/lang/H1/heading、图片 alt、输入框/按钮可访问名称和问题清单；不执行远端访问。
- **页面结构基线**：新增 `/api/browser-baseline` 和“基线”按钮，保存本地页面标题、heading 和 form/button/input/image 计数指纹，并在后续检查中输出结构 diff。
- **真实页面截图**：新增 `/api/browser-screenshot` 和“截图”按钮，调用本机 Edge/Chrome headless 为本地 URL 生成 PNG 证据，支持按 CSS 选择器裁剪，产物保存在 `.forge/browser-screenshots`。
- **DOM 快照**：新增 `/api/browser-dom` 和“DOM”按钮，使用真实浏览器渲染本地页面后导出 DOM，支持简单 `#id`、`.class`、tag 和 `[attr=value]` 选择器计数。
- **浏览器 Trace**：新增 `/api/browser-trace` 和“Trace”按钮，使用本地浏览器采集 console、Runtime exception、Network response/failure 摘要，并保存 `.forge/browser-traces` 证据 artifact。
- **DOM 交互**：新增 `/api/browser-interact` 和“交互”按钮，通过 Chrome DevTools Protocol 在隔离 profile 中执行 `wait`、`click`、`dblClick`、`hover`、`clear`、`type`、`press`、`keyDown`、`keyUp`、`select`、`check`、`uncheck`、`waitText`、`waitValue`、`navigate`、`waitUrl`、`waitNetwork`、`upload`、`mouseMove`、`mouseDown`、`mouseUp`、`mouseClick`、`drag`、`wheel`、`scroll`，并返回交互后的 DOM 与步骤审计。
- **浏览器会话 artifact**：新增 `/api/browser-session`，在同一隔离 profile 内执行多步骤本地页面会话，保存 `.forge/browser-sessions` 审计 artifact。
- **像素级视觉断言**：新增 `/api/browser-visual` 和“视觉”按钮，保存整页或选择器裁剪 PNG 视觉基线，并执行尺寸、像素 diff、阈值、mismatch sample 和可视化 diff PNG 对比。
- **模型运行层**：支持 `FORGE_MODELS` 逗号分隔候选模型，模型请求失败时按顺序 fallback，并在健康接口和会话日志记录请求数、成功/失败数、最近模型、fallback、延迟和最近调用遥测；新增 `/api/agent-stream` SSE 阶段流和 provider token delta 转发、`/api/model-policy`、`/api/model-usage`、`/api/model-budget`、`/api/model-cost`、`/api/model-cost-policy`、`/api/model-billing`、`model_policy` / `model_usage` / `model_budget` / `model_cost` / `model_cost_policy` / `model_billing` 只读工具、“模型策略”“模型用量”“模型预算”“模型成本”“价格表”和“账单核对”按钮，展示候选模型、fallback 顺序、endpoint host、token usage 持久化账本、`FORGE_MODEL_REQUEST_LIMIT` / `FORGE_MODEL_TOKEN_LIMIT` 调用前预算预检、基于 `FORGE_MODEL_COST_POLICY` 的用户配置价格表 schema/校验/成本估算、基于 `FORGE_MODEL_BILLING_JSON` 或 `.forge/state/model-billing.json` 的用户提供账单核对、密钥脱敏和 provider 配置只读 guardrails，不发起模型请求；模型证据卡可一键加入提示词、把模型验证命令排入命令面板、生成带安全检查命令的模型验证提示、直接启动模型验证修复，或直接启动模型 fallback、预算、成本和账单核对优化任务；模型策略/用量/预算/成本/价格表/账单读取失败时会保留 endpoint、请求参数、模型运行遥测、当前 prompt 和待审批 diff，生成可加入提示词、验证修复或直接优化的失败证据卡，并自动排入语法、UI、model 和 debug 复查命令；代理/SSE 请求失败会保留原始 prompt、当前 `@file` 命中/缺失边界、当前调试目标、浏览器异常分诊、最近流式事件和调试上下文，提供加入提示词、引用相关文件、把代理失败验证命令排入命令面板、生成代理失败验证提示、直接启动代理失败验证修复、重试和诊断修复入口。

## 本地检查

```powershell
node --check server.js
node --check app.js
node server.js --smoke-test
node server.js --ui-smoke-test
node server.js --api-smoke-test
```

全量 `api-smoke-test` 覆盖面很大，日常调试可以先跑分段 smoke，失败定位会快很多：

```bash
npm run api-smoke:fast
npm run api-smoke:coding
npm run api-smoke:debug
npm run api-smoke:integrations
npm run api-smoke:publish
```

Windows 下也可以直接双击项目根目录的 `validate.bat`；它只依赖 `node`，会依次运行语法检查、UI smoke 和常用 API 分段 smoke，适合 `npm` 环境损坏时继续验证。在命令面板或 CI/脚本里运行时使用无交互模式：

```bat
validate.bat --no-pause
```

Forge Code 的“验证门禁”和“一键诊断”也会优先推荐这些 `node server.js --api-smoke-section=...` 分段命令，所以在界面里点击“运行验证计划”时，会先得到更快、更容易定位失败的检查链路。

命令面板会识别 `fast` 和 `debug` 分段 smoke，并在工具栏显示“快速 smoke / 调试 smoke”快捷按钮；日常改代码时可以先跑对应分段，再决定是否运行全部检查。

也可以手动指定分段：

```bash
node server.js --api-smoke-section=core,semantic,apply
```

可用分段包括 `core`、`browser`、`semantic`、`model`、`extensions`、`mcp`、`assets`、`apply`、`runtime`、`context`、`gates`、`remote`；常用别名包括 `fast`、`coding`、`debug`、`integrations`、`publish`、`all`。

## 安全边界

- 后端只监听 `127.0.0.1`。
- 文件读写会限制在默认工作目录、`FORGE_WORKSPACE` 指定目录，或界面中切换后的当前工作目录内。
- 运行时可以通过界面切换工作目录；后端会校验目标路径必须存在且是文件夹。
- checkpoint 会绑定创建时的工作目录，避免在切换目录后误回滚到其他项目；工作区切换或 checkpoint 回滚失败时会保留目标路径、当前工作区、checkpoint、待审批 diff、上一轮需求、当前 `@file` 命中/缺失边界、当前调试目标和浏览器异常分诊，生成可加入提示词、排队验证命令或直接诊断修复的安全证据卡。
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
