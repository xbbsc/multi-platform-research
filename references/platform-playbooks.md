# 平台打法册（Platform Playbooks）

> 所有选择器、入口 URL 与接口均标注**最后验证日期**。平台随时改版：使用前先用 DOM probe 循环（截图看状态 + dump 局部 DOM → 修正 → 重试）验证，失效即修正并更新日期。
>
> 通用前提：调试浏览器以独立 profile 启动（不影响用户日常浏览器，登录态留存）；浏览器与所有控制脚本**同会话、禁用沙箱**运行；导航间隔 ≥7 秒。

---

## 0. 通用一手源（P1 静态轨道）

最后验证：2026-10-20

- **方法组合**：WebSearch（多组关键词变体 + `site:` 限定）→ WebFetch 直取 → 抓取失败时用 `https://r.jina.ai/<完整URL>` 转取（对反爬站点、公众号文章有效）。
- **关键词矩阵**：主题词 × （经验 / 攻略 / 避坑 / 评委 / 获奖 / 通知 / 届数）交叉组合，每组都要跑。
- **来源优先级**：官方机构原文 > 机构官网原创 > 权威媒体 > 转载。转载必须标注「转自何处」。
- **存档原件金矿**：官方评分细则、通知往往以 docx/xls/pdf 存档在各机构官网，含金量高于网页转述，直接链接到原件供核验。
- **公众号文章**：多数反爬，r.jina.ai 可取；WebSearch 用 `site:mp.weixin.qq.com` 定位。

---

## 1. B站（P2 视频平台）

最后验证：2026-10-20

### 访问模型
无登录可搜索、看视频、读评论区。独立 profile 无登录态即可完整执行。

### 漏斗搜索
- 入口：`https://search.bilibili.com/all?keyword=<URL编码>`。
- **勿用搜索 API**：`api.bilibili.com/x/web-interface/search/type` 需要 wbi 签名，脚本直调会被风控（返回 -412 或空）。
- DOM 提取卡片：probe 循环定位视频卡片（一般含 `a[href*="/video/BV"]`），字段：标题、UP主、播放量、弹幕数、时长、发布时间、BV 号。
- 全量落盘 `bili_search_results.json` 后，按播放量 × 关键词相关度人工筛 top N（建议 5–8 个）。

### 深挖三件套
1. **逐帧采样读 PPT**（经验分享/答辩实录类视频的核心手法）：
   ```js
   // 在视频页 eval：把 video 跳到进度 p（0~1）处
   const v = document.querySelector('video');
   v.currentTime = v.duration * p;
   'seeked to ' + v.currentTime;
   ```
   随后等待 2–3 秒再 `shot` 截图，多模态读图提取 PPT 要点。建议采样 25% / 50% / 75% 起步，信息密度高则加密。
2. **评论区**：滚动加载或直接读已渲染评论项；置顶评论与高赞评论常含经验干货、评委偏好、避坑提醒——与视频本体同等重要。
3. **字幕**：部分视频有 AI 字幕/CC 字幕，尽力获取；失败不恋战。

### 数据回验（官方公开 API）
```bash
curl --noproxy '*' "https://api.bilibili.com/x/web-interface/view?bvid=<BV>" \
  -H "User-Agent: Mozilla/5.0" -H "Referer: https://www.bilibili.com"
```
返回 `data.title / data.owner.name / data.stat.view`。写进结论的任何视频数据都应经此回验。注意 `curl` 必须 `--noproxy '*'`（或用 Node fetch，天然绕过环境代理）。

### 坑位
- 搜索 API 风控（见上）；BV 号可直接拼 `bilibili.com/video/<BV>` 访问。
- 评论区 DOM 结构多变，probe 循环定位；加载更多评论需滚动触发。

---

## 2. 小红书（P3 社交平台）

最后验证：2026-10-21

### 访问模型与登录墙
- **无登录**：站内搜索被服务端拦截；笔记直链缺 `xsec_token` 会失败。
- **降级路径**：WebSearch `site:xiaohongshu.com <关键词>` + 转载渠道（第三方全文转载站），获取二手内容并如实标注「二手」。
- **登录**：用户本人在隔离 profile 浏览器扫码（支持 App 或微信扫码）。首页打开即弹登录窗；登录态留存 profile，之后免扫码。

### 登录态验证
- `web_session` 等 cookie 是 **HttpOnly**，`document.cookie` 看不到——用 `scripts/verify_login.mjs xhs`（走 CDP Storage.getCookies 全量 cookie + DOM 标记双判据）+ **人工读截图**（右上角头像出现、无登录弹窗）确认。

### 漏斗搜索
- 入口：`https://www.xiaohongshu.com/search_result?keyword=<URL编码>`（登录态）。
- 卡片提取：probe 循环。已验证的可用特征（2026-10-21）：结果卡片为含 `/search_result/<id>?xsec_token=...` 或 `/explore/<id>` 链接的容器；提取 title / author / like 数 / **完整 href（必须带 xsec_token 原样保留）**。
- 每关键词约 20 卡片、5 组关键词落盘 `xhs_search_results.json`；按赞数排序筛 top N。

### 深挖笔记
- 导航到卡片携带的完整带 token 链接；**移动端仿真显著改善渲染**：
  ```js
  Emulation.setDeviceMetricsOverride { width: 500, height: 900, deviceScaleFactor: 2, mobile: true }
  ```
- 提取：正文 desc、点赞/收藏/评论数、评论列表（probe 循环定位评论项；高赞在前）。
- 先 `eval` 点击「关闭/取消」类弹窗再提取。
- 导航间隔 ≥7s；一组深挖 10–12 篇为宜。

### 图片型笔记 OCR（衔接 P4）
- 识别特征：正文极短且自述「内容详见图片 / 文字都写在 P2-P5」。
- DOM 抽取全部 `img`（`currentSrc || src || data-src`，记录 `naturalWidth`）落盘 `_imglist.json`。
- **筛原图**：优先 `sns-webpic` CDN 域 + 宽度 ≥1080 或 URL 含 `notes_pre_post` 路径；排除头像、图标、推荐流封面（窄图/小体积）。
- **下载必须走 Node 侧**（`scripts/download_images.mjs`，Referer: `https://www.xiaohongshu.com/`）：页面内 fetch 被 CORS 拦截，不可用。
- webp 图片可直接用多模态读图逐页转写。

### 坑位
- 旧标签页可能出现截图挂起（Page.captureScreenshot 不返回）→ 关旧开新；脚本内对每次 CDP 调用设超时。
- 笔记直链无 token 打不开 → 永远用搜索结果里带 token 的完整链接。
- 「展开全文」按钮：正文超长时需 eval 点击后再取全文。

---

## 3. 抖音（P3 社交平台）

最后验证：2026-10-21

### 访问模型与登录墙
- **无登录**：可浏览精选流，搜索受限、内容加载不完整。
- **登录**：打开首页后需 JS 点击右上角「登录」按钮才弹二维码（不会自动弹）；用户用抖音 App 扫码。登录态留存 profile。

### 漏斗搜索
- 入口：`https://www.douyin.com/search/<URL编码关键词>?type=video`（登录态）。
- 卡片提取：probe 循环。已验证的可用特征（2026-10-21）：视频链接 `a[href*="/video/"]`；逐层向上找含标题/作者的容器。**class 名经常轮换，勿写死**。
- 每关键词 10–16 个卡片落盘 `dy_search_results.json`；按赞数筛 top N（建议 5 个）。

### 深挖视频页
- 提取：视频描述文案、点赞/评论/收藏数（probe 定位数字统计区）、评论区。
- **评论区结构**（2026-10-21 验证）：作者名在 `a[href*="/user/"]` 内；评论正文在该项的第二个子块。选择器失效一律 probe-dump-适配。
- 视频页加载重，等待 ≥8s 再提取；导航间隔 ≥9s。

### 坑位
- DOM 高度混淆（`class` 为随机串），probe 循环是唯一可靠方法。
- 搜索结果偶发插入「猜你想搜」非结果卡片，按 href 特征过滤。

---

## 4. 知乎（P3 社交平台）

最后验证：2026-10-21（静态轨道 + 浏览器轨道均经 probe_platforms.mjs 实测）

### 访问模型与登录墙（2026-10-21 实测基线）
- **搜索页已强制登录**：匿名访问即弹全屏登录窗，关闭后结果区不渲染（显示「未搜索」）；**热榜页 302 跳登录页**。站内搜索只能走静态轨道（WebSearch `site:zhihu.com`）或登录态。
- **问题页直链匿名可读**：回答正文可提取，伴生可关闭的登录浮层（先 `eval` 点击关闭再提取，手法同小红书弹窗）。静态轨道「WebSearch 找问题 URL → 读问题页」依然成立。
- **脚本化直抓易 403** → 浏览器轨道或 `https://r.jina.ai/<url>` 转取（jina 本机不可达时，agent 环境走 WebFetch 服务端）。
- **登录态**（如已登录）：`z_c0` cookie 为登录判据（verify_login.mjs zhihu）。
- 以上基线由 `scripts/probe_platforms.mjs` 的 `zhihu-question-dom` / `zhihu-search-policy` 项持续体检。

### 漏斗取证
- **静态轨道**：WebSearch `site:zhihu.com <关键词>` → 收集问题 URL → r.jina.ai 逐个取全文 → 提取问题标题、高赞回答要点、赞同数。
- **浏览器轨道**：导航问题页 → 回答默认按赞同排序 → probe 提取：回答正文（`.RichContent-inner` 特征）、赞同数（`.VoteButton` 特征）、作者（`.AuthorInfo-name` 特征）→ 落盘 `zhihu_question_<id>.json` → 按赞同数漏斗。
- **质量信号**：赞同数为主，辅以评论数、作者认证/背景说明。
- 内容特征：知乎适合「方法论长文、亲历者复盘、行业视角」，与小红书的碎片经验互补。

### 坑位
- 盐选/折叠内容被挡 → 如实记录「该回答需登录/付费」，不猜测内容。
- r.jina.ai 有速率限制，逐个取、间隔执行。

---

## 5. 图片型内容转写通用法（P4）

最后验证：2026-10-21

1. **识别**：正文极短 + 自述「内容在图里」。
2. **抽取**：页面 eval 收集所有 img（src / data-src / naturalWidth）→ JSON 落盘。
3. **筛选**：按宽度（≥1080 优先）、URL 路径特征（如 `notes_pre_post`）、体积综合判断笔记原图；推荐流封面、头像、图标一律排除。
4. **下载**：`scripts/download_images.mjs`（Node fetch + Referer，绕 CORS）。
5. **转写**：多模态逐页读图 → 结构化转写稿落盘（标注「图片页码 + 原帖链接 + 赞藏数」）。
6. **洗稿检测**：与已知原创逐段比对；结构雷同（Timeline 逐条对应、段落顺序一致）→ 判定二创洗稿，不作独立来源收录，仅作旁证标注。
