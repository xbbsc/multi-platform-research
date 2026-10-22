# 通用 Agent 环境落地指南（Agent Integration）

> 本 skill 的方法论与脚本不绑定 WorkBuddy。本文档把 SKILL.md 的 P0–P5 流程翻译成任意具备基础能力的 agent 都能执行的步骤——Claude Code、Cursor、或任何「能跑命令行 + 控制浏览器 + 读写文件」的 agent 环境。

## 1. 能力需求映射

| P0–P5 需要的能力 | WorkBuddy 中的对应 | 其他环境的最低要求 |
|---|---|---|
| 跑命令行脚本 | Bash / PowerShell 工具 | 任意 shell 执行能力 |
| 浏览器控制 | CDP 脚本（本 skill 自带，无需 MCP） | Node 22+ 可执行即可，无浏览器插件要求 |
| 网络搜索 | WebSearch 工具 | 任意 web search 能力；没有则降级为「搜索引擎网页版 + CDP 阅读」 |
| 网页抓取（静态） | WebFetch 工具 | 任意 URL→文本能力；没有则全部走 CDP 浏览器轨道 |
| 读图（多模态） | Read 工具直读截图/图片 | 需 vision 能力；没有则跳过 P4 并如实标注「图片内容未转写」 |
| 并行子任务 | 子代理（subagent） | 可选。没有就单线程顺序执行三轨（P1→P2→P3），总时长变长、结果不变 |
| Word 排版交接 | workbuddy-docx 技能 | 可选。P5 产出 Markdown 底稿即为交付物，排版交给任何 Word/Pandoc 方案 |

**核心结论：只有「shell 执行」是硬依赖，其余都有明确的降级路径。** 检索与取证的全部直接动手环节都由本 skill 的脚本完成（CDP 直连，无需 MCP/插件/网络中间层）。

## 2. 环境准备（跨平台）

```bash
# 1) Node.js ≥ 22（原生 WebSocket / fetch，无需 npm install）
node --version

# 2) 调试浏览器：一条命令（推荐）——自动探测 Chrome/Edge（macOS/Linux/Windows）、
#    幂等启动、轮询 CDP 就绪；独立 profile 登录态留存、不影响日常浏览器
node scripts/start_browser.mjs
#    选项：--headless（无显示器/CI）、--stay（挂住保活，托管环境用）、--port/--profile/--url

#    手动启动（等价备选，脚本不可用时）：
#    macOS:
#    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --remote-debugging-port=9222 --user-data-dir="$HOME/.multi-platform-research/chrome-profile" --no-first-run --no-default-browser-check "about:blank" &
#    Linux:
#    google-chrome --remote-debugging-port=9222 --user-data-dir="$HOME/.multi-platform-research/chrome-profile" --no-first-run --no-default-browser-check "about:blank" &
#    Windows (PowerShell):
#    & "C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222 --user-data-dir="$HOME\.multi-platform-research\chrome-profile" --no-first-run --no-default-browser-check "about:blank"

# 3) 验证通道 + 平台体检
node scripts/cdp_session.mjs list
node scripts/probe_platforms.mjs --md probe_report.md
```

注意事项：

- **系统代理**：本 skill 脚本用 Node 原生 fetch，**不读** `HTTP_PROXY` 环境变量——这既是优点（本地 9222 端口不被代理劫持）也是限制（海外服务如 r.jina.ai 需代理时，脚本会如实报告，`probe_platforms.mjs` 的体检报告会注明）。curl 调用请始终加 `--noproxy '*'` 访问本地端口。
- **沙箱类环境**（如 WorkBuddy 沙箱、容器 CI）：调试浏览器与所有 node 脚本必须同进程命名空间运行，否则「连不上 9222」。详见 `references/env-pitfalls.md` B 组。
- **登录 profile 安全**：`--user-data-dir` 指向的目录保存登录 cookie，勿共享、勿提交 git、勿授权不可信脚本读取。

## 3. 最小工作流示例（以「小红书主题调研」为例）

```text
1. probe：node scripts/probe_platforms.mjs          → 确认 xhs 组 PASS（已登录）或 SKIP（未登录）
2. 登录：无登录态 → node scripts/cdp_session.mjs new "https://www.xiaohongshu.com"
   （人工扫码；登录态留存 profile，下次免扫码）
   验证：node scripts/verify_login.mjs xhs
3. 搜索：node scripts/cdp_session.mjs new "https://www.xiaohongshu.com/search_result?keyword=<URL编码>"
   → eval 提取卡片（title/author/like/完整 href 含 xsec_token）→ JSON 落盘（含 platform/crawledAt/likeLabel）
4. 深挖：按互动量筛 top N → 逐篇导航（间隔 ≥7s）→ eval 提取正文/互动数/评论 → *_details.json
5. 成文：按 assets/report-template.md 骨架，每条要点旁附来源行（图标+明文URL+互动量+crawledAt）
6. 核验：三态交叉核验表 + 局限声明 → 交付 Markdown 底稿
```

每一步的坑位与选择器特征都在 `references/platform-playbooks.md` 对应小节；脚本报错优先查 `references/env-pitfalls.md`。

## 4. 降级策略速查

| 缺失能力 | 降级方案 | 如实标注义务 |
|---|---|---|
| 无 vision（读不了图） | P4 图片型笔记跳过转写，仅登记存在与链接 | 报告「图片内容未转写」 |
| 无 web search | 全部走 CDP 浏览器轨道（各平台站内搜索） | 无 |
| 无静态抓取工具 | r.jina.ai 不可用时用 CDP 打开页面 eval 取正文 | 无 |
| 无并行子代理 | 三轨顺序执行 | 无（仅速度差异） |
| 浏览器无法启动 | 静态组体检照跑；浏览器组全 SKIP；登录墙平台如实降级为搜索引擎索引 | 报告「浏览器轨道不可用」 |

## 5. 与 WorkBuddy 专属概念的对照

| SKILL.md 概念 | 说明 | 通用环境等价物 |
|---|---|---|
| 「沙箱」「禁用沙箱运行」 | WorkBuddy 工具层的进程隔离机制（env-pitfalls B 组） | 直接跑即可；若你的环境也有沙箱，同理会遇到 B1/B3 |
| 「子代理」「自包含 prompt」 | WorkBuddy 的 subagent 并行机制 | 顺序执行，或你的环境里的任何并行任务机制 |
| 「Read 工具」「回读校验」 | 读写文件 + 读后验证 | 任意文件读写能力；「回读」是必须保留的纪律（E4） |
| 「workbuddy-docx 交接」 | Word 排版技能 | Pandoc / python-docx / 人工排版，均消费 P5 的 Markdown 底稿 |
