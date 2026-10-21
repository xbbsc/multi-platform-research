# multi-platform-research

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%E2%89%A522-blue)](https://nodejs.org/)
[![CDP](https://img.shields.io/badge/CDP-Chrome_155%2B-green)](https://chromedevtools.github.io/devtools-protocol/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen)](CONTRIBUTING.md)

多平台深度检索调研技能（Agent Skill）——把「多平台检索 → 结构化取证 → 交叉核验 → 可溯源成文」固化为可复用的标准流程。

> 源自一次真实的三轨调研实战（官方一手源 + B站视频逐帧分析 + 小红书/抖音登录态深挖 + 图片帖多模态 OCR），所有方法、脚本与环境坑均在 Windows 11 + Chrome 155 + Node 22 实测验证。

## 两种用法

- **作为 WorkBuddy skill 安装**：复制本目录到 `~/.workbuddy/skills/`，对话中自然语言触发（见下文「使用」）；
- **作为通用 agent 的方法论 + 工具箱**：不依赖 WorkBuddy。任何具备「浏览器控制 + 网页抓取 + 多模态读图」能力的 agent（Claude Code、Cursor 等）都可执行 P0–P5 流程，落地映射见 [`references/agent-integration.md`](references/agent-integration.md)。

## 它解决什么问题

让 AI 调研 agent 不再"泛泛搜索、泛泛而谈"，而是：

- **漏斗取证**：多关键词宽搜索 → 全量数据 JSON 落盘（含抓取时间戳）→ 按互动量筛 top N → 逐条深挖正文与评论区；
- **登录墙决策树**：无登录试探 → 如实记录 → 搜索引擎索引降级 → 用户本人扫码登录（隔离 profile，登录态留存复用），绝不硬闯、绝不编造；
- **DOM probe 循环**：平台改版/选择器失效时，截图 + DOM dump + 修正 + 重试，而不是盲试；
- **多模态 OCR**：图片型笔记自动识别、下载原图、逐页读图转写，顺带检测洗稿二创；
- **三态交叉核验**：新证据与既有结论对照，分「证实 / 修正 / 未能复核」，二手与一手严格区分；
- **全程来源标注**：每条结论旁附平台图标 + 明文 URL + 作者/互动量，打印件也能逐条核验。

## 支持的平台

| 平台 | 访问模型 | 深挖能力 | 登录 |
|---|---|---|---|
| 官网/权威机构 | 静态抓取（WebSearch + WebFetch + r.jina.ai） | 一手文档、存档原件 | 不需要 |
| B站 | 无登录可搜可看可读评论 | 逐帧采样读 PPT、评论区、AI 字幕 | 不需要 |
| 小红书 | 无登录被拦截 | 站内搜索、笔记正文、赞藏评、图片原图 | 扫码（用户本人） |
| 抖音 | 无登录限制多 | 站内搜索、视频文案、评论区 | 扫码（用户本人） |
| 知乎 | 静态优先，问题页多数可读 | 问题/回答、赞同数漏斗 | 一般不需要 |

> 平台 DOM 与接口随时可能改版。运行 [`scripts/probe_platforms.mjs`](scripts/probe_platforms.mjs) 一键体检各平台知识是否仍然有效，再开始正式调研。

## 安装

依赖：

- **Node.js ≥ 22**（依赖原生 `WebSocket` 与 `fetch`，无需 npm install）
- **Chrome / Edge**（以 `--remote-debugging-port=9222` 启动调试实例）
- WorkBuddy 环境（可选；非 WorkBuddy 用户见 [`references/agent-integration.md`](references/agent-integration.md)）

把本目录复制到 WorkBuddy 用户级技能目录：

```
~/.workbuddy/skills/multi-platform-research/
```

**安全提示**：调试浏览器使用独立 profile（如 `~/.workbuddy/cdp-chrome-profile`），其中保存了各平台登录 cookie——请勿共享此目录、勿将其提交到任何 git 仓库、勿授权不可信脚本读取。

## 快速开始

从零到第一次拿到截图与体检报告（终端实录）：

```bash
# 1. 启动调试浏览器（独立 profile；按系统选一行）
# macOS:
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --remote-debugging-port=9222 --user-data-dir="$HOME/.workbuddy/cdp-chrome-profile" --no-first-run --no-default-browser-check "about:blank" &
# Linux:
google-chrome --remote-debugging-port=9222 --user-data-dir="$HOME/.workbuddy/cdp-chrome-profile" --no-first-run --no-default-browser-check "about:blank" &
# Windows (PowerShell):
# & "C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222 --user-data-dir="$HOME\.workbuddy\cdp-chrome-profile" --no-first-run --no-default-browser-check "about:blank"

# 2. 确认 CDP 通道已就绪
node scripts/cdp_session.mjs list

# 3. 新开标签页、导航、截图
node scripts/cdp_session.mjs new "https://search.bilibili.com/all?keyword=%E8%B0%83%E7%A0%94"
node scripts/cdp_session.mjs shot "bilibili" screenshot.png

# 4. 平台体检：验证各平台知识当下是否有效（浏览器不开则只跑静态组）
node scripts/probe_platforms.mjs
```

体检报告（PASS/FAIL/SKIP 逐项 + JSON 落盘）是判断「该不该继续调研」与「playbooks 是否需要修正」的依据。

## 使用

安装后，在 WorkBuddy 对话中用自然语言触发，例如：

- 「多平台检索 XX 主题的资料并成文」
- 「去小红书 / 抖音 / B站 / 知乎搜 XX，把高赞内容整理出来」
- 「深度调研 XX，我要能核验来源的版本」
- 「登录后帮我查小红书上关于 XX 的笔记」

Agent 会自动进入 P0–P5 六阶段流程：任务拆解路由 → 一手源侦察 → 视频平台深挖 → 社交平台深挖 → 图片帖 OCR → 交叉核验与成文。

## 目录结构

```
multi-platform-research/
├── SKILL.md                       # 主流程：P0–P5 + 11 条硬规则
├── README.md                      # 本文件
├── CHANGELOG.md                   # 版本历史
├── references/
│   ├── platform-playbooks.md      # 各平台打法：访问模型/入口/提取法/坑位（含最后验证日期）
│   ├── env-pitfalls.md            # 17 条 Windows/CDP 环境坑：症状→根因→解法
│   ├── evidence-standards.md      # 来源标注体系、三态核验格式、JSON schema、质量门禁
│   └── agent-integration.md       # 非 WorkBuddy 环境的落地映射
├── scripts/
│   ├── cdp_session.mjs            # 直连 CDP 通用控制器（list/new/nav/eval/shot）
│   ├── verify_login.mjs           # 三平台登录态判定（cookie + DOM 双判据 + 过期判定）
│   ├── probe_platforms.mjs        # 平台体检：一键验证各平台知识是否仍有效
│   └── download_images.mjs        # 带 Referer 的批量图片下载（供多模态读取）
└── assets/
    └── report-template.md         # 带来源标注的报告骨架
```

## 设计取舍

- **不写死 DOM 选择器**：平台改版即失效。playbooks 固化的是「probe → dump → 适配」的探测方法，每条知识标注「最后验证日期」，并配套 `probe_platforms.mjs` 定期体检。
- **直连 CDP 而非中间代理**：省掉一层会缓存旧会话、会崩的 proxy；`fetch('/json/version')` 动态取带 browser ID 的 WebSocket 端点，天然兼容 Chrome 155+ 的安全变更。
- **主题无关**：skill 只沉淀方法与坑位，不内置任何特定选题的来源清单。

## 合规与伦理

本技能面向**个人学习与研究用途**的合规采集：

- 登录一律由用户本人在自己的设备上扫码完成，skill 不收集、不存储账号凭据；
- 尊重平台登录墙与权限体系，不绕过付费内容、不批量商业化抓取；
- 内置礼貌访问节奏（导航间隔 ≥7 秒的速率自律），降低对目标平台的干扰；
- 调研结论必须可溯源，无法核实的明确标注「未能复核」，禁止编造；
- **登录 profile 安全**：隔离 profile 含登录 cookie，勿共享、勿提交 git、勿授权不可信脚本读取。

平台页面结构与接口可能随时间变化，使用前请运行体检脚本并自行复核。

## License

[MIT](LICENSE) © 2026 xbbsc
