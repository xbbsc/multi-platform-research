---
name: multi-platform-research
description: "多平台深度检索调研方法论：跨 B站/小红书/抖音/知乎/微信公众号与官方网站检索、理解内容并产出可溯源的结构化调研成果。适用于备赛/选品/口碑等主题情报搜集、特定平台笔记/视频/评论区内容深度提取、登录墙平台的扫码登录态检索、图片型笔记的多模态文字提取，以及要求每条结论可核验来源的成文报告。触发示例：多平台检索某主题并成文、去小红书/抖音/B站/知乎搜某话题、深度调研某主题、提取某平台内容、备赛攻略搜集、登录后帮查某内容。Multi-platform deep research: search and digest Bilibili, Xiaohongshu, Douyin, Zhihu, WeChat and official sources into source-annotated, cross-verified research deliverables, with login-wall decision tree, funnel evidence collection and multimodal OCR of image-based posts."
agent_created: true
---

# 多平台深度调研（multi-platform-research）

把「多平台检索 → 结构化取证 → 交叉核验 → 可溯源成文」固化为标准流程。本技能源于一次完整的三轨调研实战（官网一手源 + B站视频深挖 + 小红书/抖音登录态深挖 + 图片帖 OCR），所有步骤、脚本与环境坑均在 Windows 11 + Chrome 155 + Node 22 环境实测验证。

## 目标与产出

- **目标**：对任意主题完成多平台检索与内容理解，产出每条结论都带可核验来源的调研纪要与成文底稿。
- **产出契约**：① 过程资产全部落盘于工作区 `research/` 目录（JSON 数据、截图、OCR 图片、过程纪要）；② 最终交付 1 份带来源标注的成文底稿（Markdown）；③ 可选：引用 `workbuddy-docx` 技能生成排版 Word（本技能不做排版，只做薄引用交接）。

## 适用与不适用

**适用**：备赛/活动情报、产品/院校/城市口碑调研、特定平台笔记/视频/评论区深度提取、登录墙平台内容获取（用户本人扫码）、图片型笔记文字提取、需来源可核验的成文报告。

**不适用**：一次 WebSearch 可回答的事实性问题；学术文献检索（用 literature-search）；需要绕过付费/权限内容或批量抓取商用数据的场景（明确拒绝）。

## 硬规则（全程不变式，违反即失败）

1. **诚实降级**：打不开、搜不到、被登录墙拦截，一律如实记录状态，严禁编造内容或猜测数据。
2. **中间数据 JSON 落盘**：每个检索阶段的原始数据写入 `research/` 下的 JSON 文件；stdout 仅用于状态汇报，不是数据存储。脚本直接 `fs.writeFileSync` 写文件（UTF-8），不依赖 stdout 重定向（PowerShell 5.1 重定向默认 UTF-16 会毁掉中文）。
3. **回读校验铁律**：关键文件写入后必须回读确认存在与内容；最终交付物必须在成品内部（如 docx 的 document.xml）验证关键词在位。
4. **反风控节奏**：页面导航间隔 ≥7 秒（推荐 7–11s 随机），不短时密集开页；触发风控信号（验证码、403、空白页）立即停下如实报告，不换姿势硬闯。
5. **登录墙不硬闯**：先试无登录访问 → 被拦则记录并降级到搜索引擎索引/转载渠道 → 确需一手数据时，由**用户本人**在隔离 profile 浏览器里扫码登录；本技能永不接触账号密码，不使用第三方代登录。
6. **永不关闭最后一个标签页**：关闭最后一个 page 会导致整个浏览器退出。脚本刻意不提供 close 命令；用「复用/新建标签页 + 导航」替代关闭。
7. **本地端口访问一律绕过系统代理**：curl 加 `--noproxy '*'`；Node 的 fetch 天然不走 HTTP_PROXY 环境变量（这是选它做 CDP 控制与 CDN 下载的原因之一）。
8. **浏览器与控制脚本同网络命名空间**：调试浏览器和所有 node 控制脚本必须在同一会话、同以禁用沙箱方式运行；沙箱隔离是「连不上 9222」的头号根因。
9. **每条结论带来源标注**：遵循 `references/evidence-standards.md` 的标注体系；无法核实的明确标注「未能复核」，二手转载与一手来源区分标注。
10. **修改既有文件一律另存新文件**：不覆盖用户既有文件与先前版本产物。
11. **一手数据优先、官方 API 回验**：有官方公开 API 可核对的数据（如 B站视频数据）必须回验后再写进结论。

## 流程总览（P0–P5）

### P0 任务拆解与路由
1. 明确调研问题清单与交付物定义；确定目标平台与每平台的访问策略（静态可取 / 需浏览器 / 需登录）。
2. 建 `research/` 工作目录；约定产物命名（如 `xhs_search_results.json`）。
3. 子代理并行设计：每条轨道（P1 静态 / P2 视频平台 / P3 社交平台）派一个子代理，prompt 必须**自包含**——目标、方法约束（引用硬规则）、输出格式、来源 URL 要求、关键词建议全部写明，不依赖对话上下文。
4. 环境预检：确认调试浏览器可用（启动命令见 `references/env-pitfalls.md` 条目 A1），运行 `scripts/cdp_session.mjs list` 确认 CDP 通道。

### P1 一手源侦察（静态轨道）
- 方法：WebSearch（多组关键词变体 + `site:` 限定）+ WebFetch + `r.jina.ai` 前缀抓取。
- 优先级：官方机构原文 > 院校/机构官网原创 > 权威媒体报道 > 转载（转载必须标注转自何处）。
- 留意存档原件（docx/xls/pdf），含金量常高于网页转述。
- 详见 `references/platform-playbooks.md` 第 0 节。

### P2 视频平台深挖（B站）
- 漏斗：站内搜索（DOM 提取，勿用需 wbi 签名的搜索 API）→ 全量卡片 JSON → 按播放量/相关度筛 top N → 逐个深挖。
- 深挖三件套：**逐帧采样**（video.currentTime 跳播 + 截图，读 PPT 内容）、**评论区**（高赞评论常是干货富矿）、**AI 字幕**尽力获取。
- 数据回验：`api.bilibili.com/x/web-interface/view?bvid=` 公开 API 核对标题/UP主/播放量。
- 详见 playbooks 第 1 节。

### P3 社交平台深挖（小红书 / 抖音 / 知乎）
- **登录墙决策树**（每平台独立执行）：无登录试探 → 被拦记录并降级（搜索引擎索引 `site:` 限定 / 转载渠道）→ 向用户说明并请求扫码登录（隔离 profile，登录态留存可复用）→ 登录后截图验证（cookie 可能 HttpOnly，界面为准）→ 带登录态执行漏斗。
- **漏斗取证**：多关键词站内搜索 → 卡片全量 JSON（含带 token 的完整链接）→ 按互动量（赞/藏/播放/赞同）排序 → 深挖 top N：正文 + 互动数据 + 评论区热评。
- **DOM probe 循环**：选择器失效时，截图看真实状态 + dump 局部 DOM → 修正选择器 → 重试。各平台已知 DOM 特征与坑见 playbooks 第 2–4 节。
- 三个平台的访问模型、入口 URL、提取方法、坑位清单全部在 playbooks。

### P4 图片型内容转写（多模态 OCR）
- 识别图片型笔记：正文极短且自述「内容详见图片/写在图里」。
- 流程：页面 DOM 抽取 img 列表 → 按宽度/URL 路径特征筛出笔记原图（排除头像、图标、推荐流封面）→ `scripts/download_images.mjs` 带 Referer 下载 → 用多模态能力逐页读图转写 → 转写稿落盘。
- 顺带做**洗稿检测**：与已知原创内容逐段比对，二创洗稿帖不作为独立来源收录，如实标注。
- 详见 playbooks 第 5 节。

### P5 交叉核验与成文
1. 汇合三轨发现，执行**三态交叉核验**：新证据 vs 既有结论 → 证实 / 修正 / 未能复核，产出核验表（格式见 evidence-standards.md）。
2. 按来源标注体系成文：每条有来源的要点旁附灰色来源行（平台图标 + 明文 URL + 作者/互动量），文首给标注图例。
3. 全文质量自检：抽样回查 5–10 条链接可达性；关键词回读校验成品文件。
4. （可选）Word 排版交接：调用 `workbuddy-docx` 技能，传入成文底稿路径；转换器不支持超链接时以明文 URL 呈现来源。

## 脚本使用

```bash
# 启动调试浏览器（先决条件；独立 profile 不影响用户日常浏览器，登录态留存）
# "<chrome路径>" --remote-debugging-port=9222 --user-data-dir="<隔离profile目录>" --no-first-run "about:blank"
# 注意：浏览器与下方所有脚本同会话、禁用沙箱运行

node scripts/cdp_session.mjs list                        # 列出标签页
node scripts/cdp_session.mjs new <url>                   # 新建标签页并导航
node scripts/cdp_session.mjs nav <targetId|url子串> <url> # 导航已有标签页
node scripts/cdp_session.mjs eval <targetId|url子串> "<js>" # 页面内执行 JS
node scripts/cdp_session.mjs shot <targetId|url子串> <out.png> # 截图

node scripts/verify_login.mjs xhs|douyin|zhihu           # 登录态判定（JSON 输出）
node scripts/download_images.mjs --list <imglist.json> --out-dir <dir> [--referer <url>] [--min-width N]
```

`scripts/cdp_session.mjs` 直连 CDP（从 `/json/version` 动态取带 browser ID 的 WebSocket 端点，兼容 Chrome 155+），不依赖任何中间代理，天然绕过环境代理劫持。

## 参考文档（按需加载）

| 文件 | 何时读 |
|---|---|
| `references/platform-playbooks.md` | 进入 P1–P4 任一阶段前；含各平台访问模型、入口、提取法、坑位与最后验证日期 |
| `references/env-pitfalls.md` | 启动浏览器 / CDP 连接失败 / 数据异常时排查；17 条「症状→根因→解法」 |
| `references/evidence-standards.md` | P5 成文前；标注体系、三态核验格式、JSON schema、质量门禁 |
| `assets/report-template.md` | P5 成文时；带来源标注的报告骨架 |

## 平台对抗性声明

平台 DOM 结构与接口随时可能改版。playbooks 中所有选择器与入口 URL 均标注「最后验证日期」；使用前先按 DOM probe 循环验证，失效则修正并更新日期。本技能的立场是**合规采集**：控制节奏、尊重登录墙、不用技术手段绕过付费或权限内容、不进行批量商业化抓取。
