# 新平台扩展指南（Extending Platforms）

本 skill 的方法论是平台无关的，但平台知识不是——本文教你怎么把一个新平台安全地接进来。动手前先读一遍 [`platform-playbooks.md`](platform-playbooks.md) 的任一章节感受格式，再读 [`evidence-standards.md`](evidence-standards.md) 的关键性判定与采样方法论。

## 0. 先决策：这个平台值不值得接

满足得越多，越值得：

| 判据 | 说明 |
|---|---|
| 信源质量 | 目标调研主题在该平台有一手、高信息密度的内容（而非纯情绪帖） |
| 可访问性 | 存在合法可用的访问模型（静态可读 / 用户本人登录后可读）；**纯付费墙/强对抗平台不接** |
| 可自动化 | 能用「probe → dump → 适配」循环稳定提取，而不是每页都要人工处理 |
| 可体检 | 至少能设计出一个可重复运行的 probe 检查项（静态组或浏览器组） |

> 反例：如果平台的核心内容只在 App 内可见，Web 端只是引流壳——放弃。

## 1. 访问模型侦察（P3 登录墙决策树的实测版）

按顺序探测，把每一步结果记下来——这就是 playbook 章节的骨架：

```bash
# 1) 静态组：搜索引擎索引与直抓
#    WebSearch: site:<platform-domain> + 主题词，看索引是否充分
#    Node 直抓 / r.jina.ai 转取：注意 403、风控 HTML、速率限制
# 2) 浏览器组：无登录打开核心页面（搜索页 / 列表页 / 详情页各一）
node scripts/start_browser.mjs          # 起浏览器（幂等）
node scripts/cdp_session.mjs new "<核心页面URL>"
node scripts/cdp_session.mjs shot "<url子串>" probe.png
node scripts/cdp_session.mjs eval "<url子串>" --file my_probe.js   # dump DOM 结构
# 3) 记录：无登录能看到什么？何时弹登录墙？弹墙后内容是否还渲染（知乎式）还是彻底空白？
```

产出：该平台的访问模型结论（**静态优先 / 登录态浏览器 / 匿名浏览器**三选一为主，降级路径为辅）。

## 2. playbook 章节草稿

在 `references/platform-playbooks.md` 追加章节，**必须**对齐现有结构（缺一不可，这是 PR 评审标准）：

```markdown
## N. <平台名>（P3 社交平台 / P2 视频平台）

最后验证：YYYY-MM-DD（静态轨道 / 浏览器轨道分开标）

### 访问模型与登录墙
- （第 1 步的结论，含降级路径）
- **登录态**（如需要）：strong cookie 名 + 判据（见第 4 步）

### 漏斗搜索
- 入口 URL 模板、卡片 DOM 特征（写「当时实测」+ 日期，不写死保证）、每关键词样本量

### 深挖与坑位
- 已踩过的坑（症状→根因→解法），引用 env-pitfalls 条目
```

## 3. 给体检脚本加检查项

在 `scripts/probe_platforms.mjs` 的 `runStatic()` 或 `runBrowser()` 追加检查项，命名 `<平台>-<能力>-<组>`（如 `bili-view-api`、`xhs-search-card`）。

**关键性判定原则**（决定该项 FAIL 是否拉红 CI 徽章）：

- **关键**：结构性失败——JSON 接口返回异常数据、页面结构大改导致提取器语义失效、入口 404。这代表「平台知识腐化」，必须修 playbook。
- **非关键**：环境性失败——IP 级风控返回 HTML 壳、无登录态被拦截、海外 runner 地域限制。这代表「换环境就能过」，FAIL 但不阻断（`record(..., 'fail', detail, false)`）。
- 案例：2026-10-23 首次 CI 运行，B站 view API 对海外 runner 返回 HTML 风控页，初版按关键项处理导致徽章变红——修正为「HTML 壳 = 非关键；JSON 异常 = 关键」。你为新平台设计检查项时，请先想清楚它的失败模式各属于哪类。

## 4. 登录态判据（若平台需要登录）

在 `scripts/verify_login.mjs` 的 `PLATFORMS` 表添加三元组：

- `strongCookie`：登录后必然出现、登出必然消失的 cookie 名（HttpOnly 的优先，配合浏览器级 `Storage.getCookies` 兜底）；
- `loginModal`：未登录时必然出现的选择器（登录弹窗/按钮）；
- `avatarMark`：已登录时出现的选择器（头像/昵称节点）。

判定链已内置：`likely-logged-in / likely-logged-out / likely-expired / unknown`，不要改动语义。

## 5. 文档勾连（PR 完整性检查）

- [ ] `references/platform-playbooks.md` 新章节（含验证日期）
- [ ] `scripts/probe_platforms.mjs` 检查项 + `--browser-only` skip 清单同步
- [ ] `scripts/verify_login.mjs` 判据（若需登录）
- [ ] `SKILL.md` P3 平台清单
- [ ] `README.md` 平台表 + 目录结构
- [ ] `CHANGELOG.md` Unreleased 段
- [ ] 本地 `--static-only` 回归通过；有浏览器时 `--browser-only` 也跑一遍

## 速率自律（硬规则，不因新平台放宽）

导航间隔 ≥7 秒（7–11s 随机）、触发验证码/403 立即停下如实报告、绝不换姿势硬闯、登录由用户本人扫码。新平台接入不是对抗竞赛——**被礼貌拒绝时如实记录，就是对所有用户最好的保护**。
