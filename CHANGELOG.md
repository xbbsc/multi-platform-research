# 更新日志（Changelog）

本项目遵循 [语义化版本](https://semver.org/lang/zh-CN/) 与 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 格式。

## [Unreleased]

### Fixed 修复

- **新用户首次安装的文档路径错误**：`README.md` 安装章节与 `references/env-pitfalls.md` A1 的示例 profile 仍写旧默认 `~/.workbuddy/cdp-chrome-profile`，而 v0.3 起脚本实际默认是 `~/.multi-platform-research/chrome-profile`（旧路径存在则自动沿用）。照文档手动启动浏览器的用户会与 `start_browser.mjs` 落在两个不同 profile，白丢一次登录态。已统一为真实默认值，A1 并补一句「优先用 `start_browser.mjs`」。

## [1.0.0] - 2026-10-23

主题：**生态**——让外部用户有理由、有路径参与进来。

### Added 新增

- **GitHub Actions 定时体检上线**（`.github/workflows/probe.yml`，2026-10-23 经 contents API 补推合入 main）：每周一自动跑静态组，手动可触发附带 headless Chrome 的浏览器组（即 Linux 无头环境的跨平台验证）；报告写 workflow summary + artifact 保留 90 天。注意 tag `v0.3.0` 不含该文件，从 v1.0.0 起完整。
- **`CONTRIBUTING.md` 贡献指南**：三类贡献路径（playbook 修正 / 脚本 / 文档），playbook 修正 PR 的硬性验证规范（更新「最后验证日期」+ 附 probe 证据 + 说明复现环境 + 区分环境限制与知识腐化）。
- **Issue / PR 模板**：「平台知识失效」报告表单（平台 / 症状 / probe 输出 / 环境）；PR 模板含验证信息必填与自查清单。外部贡献的入口设施至此闭环。
- **`references/extending-platforms.md` 新平台扩展指南**：接入决策清单、五步法（访问模型侦察 → playbook 章节 → probe 检查项 → 登录判据 → 文档勾连）、关键性判定原则（环境限制 vs 知识腐化，含 2026-10-23 B站 API 案例解析）、速率自律边界。
- **`examples/` 合成数据示例库**：漏斗搜索 JSON（B站 / 小红书，含 `xsec_token` 占位）、深挖详情 JSON（含评论区）、带来源标注与三态核验表的报告片段——新用户不用跑一遍真实调研也能看懂每一步产出什么。
- **README 首屏视觉与英文摘要**：新增 1280×640 Social preview（`assets/social-preview.svg` 可编辑源文件 + PNG），README 顶部嵌入 banner 并加英文摘要段；仓库 About 封面请到 Settings → Social preview 上传 `assets/social-preview.png`。

### Fixed 修复

- `probe_platforms.mjs` 失败模式区分：B站 view API 返回 HTML 风控页（海外 IP 常见，如 GitHub Actions runner）改判为**非关键** FAIL（环境限制而非平台知识腐化）；JSON 响应异常仍为关键项。CI 首跑验证通过，第二跑 success。

### Changed 变更

- **README 首屏重写**：顶部嵌入 Social preview banner；正文前加英文摘要段（英文读者先看懂「这是什么、解决什么问题」再决定是否往下读）；「贡献」章节改为指向 `CONTRIBUTING.md` 与 Issue 表单；目录树补 `assets/`、`examples/`、`.github/` 三处新目录，避免文档与仓库结构脱节。
- **`SKILL.md` 参考表补两行**：`references/extending-platforms.md`（要接新平台时读）与 `examples/`（想知道每步产出长什么样时读），让 skill 主入口能直接索引到 v1.0 新增资产。

## [0.3.0] - 2026-10-22

主题：**可带走**——换一台 mac / linux，从零到第一次成功。

### Added 新增

- **`scripts/start_browser.mjs` 跨平台启动器**：一条命令完成「找浏览器 → 拉起 → 自检 CDP 就绪」。
  - macOS / Linux / Windows 自动探测 Chrome 路径，Edge（Chromium 内核）兜底，探测过程如实报告；
  - **幂等**：目标端口已有调试浏览器直接报 `reused:true` 退出，不重复拉起；
  - **profile 智能回退**：旧默认 `~/.workbuddy/cdp-chrome-profile` 存在则沿用（保住既有登录态，免二次扫码），否则用中立的 `~/.multi-platform-research/chrome-profile`；
  - `detached` 独立进程（标准终端 / CI 中脚本退出浏览器不死）；`--headless`（无显示器环境）、`--stay`（监护模式：就绪后挂住不退出，供 WorkBuddy 等「命令结束回收进程树」的托管环境以后台任务方式长驻）、`--port/--profile/--url`；
  - 输出末行 JSON（chromePath/profile/pid/ready）供 agent 程序化消费。Windows 11 实测：自动定位 Chrome 155、legacy profile 回退命中、CDP 自检就绪、幂等命中均通过。
- **GitHub Actions 定时体检**（`.github/workflows/probe.yml`）：每周一自动跑静态组体检；可手动触发附带 headless Chrome 的浏览器组（同时即是对启动器 + 体检脚本在 Linux 无头环境的跨平台验证；CI profile 无登录态，小红书/抖音项如实 SKIP）。报告写 workflow summary + artifact 保留 90 天；关键项 FAIL → job 失败（平台知识腐化的预期信号）。README 新增 CI 徽章。
- `probe_platforms.mjs` 新增 `--md <file>`：同步输出 Markdown 摘要（CI summary / 直接贴报告用）。
- **方法论三补丁**（`references/evidence-standards.md`）：
  - **核验裁决规则**：两个来源打架时的优先级链（一手>二手、官方>个人、新>旧、量级差异优先怀疑笼统方），无法裁决 → 并列呈现标注矛盾，绝不制造虚假一致；裁决理由必须写入核验表；
  - **幸存者偏差声明**（新增第 2 节「采样方法论」）：互动量漏斗的系统偏差 + 三条强制对策（时间加权采样：top N 外固定追加最新发布组；关键结论双源支撑；局限声明必含采样偏差）；
  - **采样终止条件**：信息饱和（连续 5 样本无新信息类别即停）、配额上限（单平台 top 10 + 新帖 5）、矛盾扩采样（唯一可突破配额的情形，最多 +5 篇定向）。
- env-pitfalls 新增 B1b：`detached` 子进程在托管环境仍被回收的现象、根因（Windows Job Object）与 `--stay` 解法。

### Fixed 修复

- `cdp_session.mjs` `resolveTarget` URL 子串命中多个标签页时**静默选第一个** → 改为歧义报错并列出全部候选（取错页是静默数据污染）。实测：两个 about:blank 场景正确报错、列出候选、exit 1。
- `probe_platforms.mjs` 浏览器组导航命令等待 load 事件，瀑布流慢载页（小红书）会超时误报 → 导航改为不等 load（超时吞掉），页面真实状态由后续 eval 探测判定，数据说话。

### Changed 变更

- `cdp_session.mjs` 新增 `eval <目标> --file <script.js>`：复杂 JS 从文件执行（多行、中文、混合引号免 shell 转义）——终结 PowerShell/Windows 引号转义地狱（实战反复手工绕过的坑，现固化为一等命令）。
- `cdp_session.mjs` 新增全局 `--json`：`list` 输出 `{tabs, pages:[{id,fullId,title,url}]}` 纯结构化、`eval` 输出 `{value}` 包裹，供 agent 程序化消费（此前 list 是「tabs: N」混合文本）。
- `probe_platforms.mjs` 浏览器组改用**单个复用的工作 tab**（失活自动重建）——此前每次导航新建 tab，一次全量体检留 7 个 tab 污染浏览器状态；现仅 +1。体检脚本自抓出自身重构引入的 sessionId 解构 bug（CDP -32600）并当场修复——「体检→诊断→修正」闭环第二次实战验证。
- 小红书搜索页新基线（2026-10-22 实测，playbooks 第 2 节）：登录态连续访问后搜索页可进入「URL 已切换但 load 永不完成」的节流状态（navigate/eval 挂起），同期首页正常；处置=隔时段复测/人工确认/复核登录态，不连环硬闯。体检报告对 timeout 类 FAIL 自动附加此诊断提示。
- SKILL.md P0 预检与脚本节改用 `start_browser.mjs`；`agent-integration.md` 环境准备同步（手动命令降为备选）；默认 profile 文档路径更新为 `~/.multi-platform-research/chrome-profile`（已有 `~/.workbuddy/` profile 的用户自动沿用，不受影响）。

## [0.2.0] - 2026-10-21

### Added 新增

- **`scripts/probe_platforms.mjs` 平台体检脚本**：一键验证五平台知识是否仍然有效——静态组（B站公开 API / B站搜索页 / r.jina.ai 降级通道 / 知乎直抓行为基线）+ 浏览器组（B站搜索卡片 DOM / 小红书登录态与搜索卡片含 xsec_token 校验 / 抖音登录态与搜索卡片 / 知乎搜索 DOM）。未登录平台自动 SKIP 不撞墙；导航间隔遵守 ≥7s 速率自律；关键项 FAIL 时退出码 1（供 CI 与 P0 环境预检消费）。
- **`references/agent-integration.md` 通用 agent 落地指南**：P0–P5 所需能力的映射表（WebSearch/WebFetch/多模态/子代理各有降级路径）、跨平台浏览器启动命令、最小工作流示例、与 WorkBuddy 专属概念的对照表。本 skill 正式支持非 WorkBuddy 环境。
- README 新增「快速开始」终端实录（macOS/Linux/Windows 三平台启动命令）与 shields.io 徽章。
- `verify_login.mjs` 新增 **likely-expired 判定**：strong cookie 在 profile 留存但页面弹出登录窗 → 登录态已过期需重新扫码（此前只输出 unknown，丢失诊断信息）。
- 中间数据 schema 新增通用字段：`platform`（bili/xhs/douyin/zhihu/web）、`crawledAt`（ISO 8601 抓取时间戳，互动型数据必填）、`likeLabel`（like/view/agree 语义声明）。理由：互动量是活数据，「互动量 + 抓取时间戳」组合才是稳定核查锚点。

### Fixed 修复

- `verify_login.mjs` 多标签页时 `domMarks` 被循环后写覆盖先写的 bug → 改为汇总对象（任一页命中即 true）+ `domMarksPerPage` 逐页明细。
- README「License」节与仓库状态脱节（已加 MIT 却仍写"建议自行添加 LICENSE"）。

### Changed 变更

- `verify_login.mjs` 输出新增 `domMarksPerPage` 字段；`domMarks` 语义由"最后一页的判定"变为"逐页汇总（任一页命中）"——直接消费 `domMarks` 的下游逻辑请复核（一般场景行为更准确，无需改动）。
- 质量门禁第 3 条由「互动量必录」升级为「互动量 + 时间戳必录」。
- 合规措辞统一：「反风控节奏」→「礼貌访问节奏 / 速率自律」（实质不变：导航间隔 ≥7s、触发风控信号即停）。
- README 合规节新增登录 profile 安全提示（含登录 cookie：勿共享、勿提交 git）。

## [0.1.0] - 2026-10-21

### Added 新增

- 初始发布。P0–P5 六阶段调研流程与 11 条硬规则（诚实降级 / JSON 落盘 / 回读校验 / 速率自律 / 登录墙决策树 / 永不关最后标签页等）。
- 五平台打法册（`platform-playbooks.md`）：官网静态轨道 / B站 / 小红书 / 抖音 / 知乎，每条知识标注最后验证日期。
- 17 条实测环境坑库（`env-pitfalls.md`）：Chrome 155+ CDP 安全变更、沙箱进程生命周期、代理劫持、HttpOnly cookie、PowerShell UTF-16 等。
- 证据标准（`evidence-standards.md`）：平台图标标注体系、三态交叉核验表、中间数据 schema、质量门禁、P5 收尾检查单。
- 三个 CDP 脚本：`cdp_session.mjs`（直连控制器，兼容 Chrome 155+）、`verify_login.mjs`（cookie+DOM 双判据）、`download_images.mjs`（带 Referer 批量下载）。
- 报告骨架（`assets/report-template.md`）、MIT License。
