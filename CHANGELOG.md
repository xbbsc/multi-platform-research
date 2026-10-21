# 更新日志（Changelog）

本项目遵循 [语义化版本](https://semver.org/lang/zh-CN/) 与 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 格式。

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
