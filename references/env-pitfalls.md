# 环境坑库（Env Pitfalls）

> 实测环境：Windows 11 + Chrome 155 + Node 22 + WorkBuddy 沙箱。每条为「症状 → 根因 → 解法」。排查 CDP/浏览器问题时按编号顺序过一遍，命中率极高。
> 最后验证：2026-10-21

## A. Chrome / CDP 连接

### A1. 调试浏览器启动命令（先决条件）
- **症状**：CDP 连不上（connection refused / ws-fail）。
- **根因**：浏览器没以调试模式启动，或启动方式不对。
- **解法**：用独立 profile 启动（登录态留存、不影响日常浏览器）：
  ```bash
  "<chrome路径>" --remote-debugging-port=9222 \
    --user-data-dir="<隔离目录，如 ~/.workbuddy/cdp-chrome-profile>" \
    --no-first-run --no-default-browser-check --window-size=1400,900 "about:blank"
  ```
  启动后先留一个 about:blank 页驻守（见 B2）。

### A2. Chrome 155+ 拒绝无 browser ID 的 WebSocket 端点
- **症状**：连 `ws://127.0.0.1:9222/devtools/browser` 握手失败（non-101）。
- **根因**：新版 Chrome 安全变更，要求端点带 browser ID。
- **解法**：先 `GET http://127.0.0.1:9222/json/version`，取 `webSocketDebuggerUrl`（自带 ID）使用；`scripts/cdp_session.mjs` 已内置。

### A3. Chrome 155+ 的 `PUT /json/new?url=` 只建页不导航
- **症状**：新标签页停留在 about:blank。
- **根因**：HTTP 接口行为变更。
- **解法**：CDP 全流程——`Target.createTarget`（about:blank）→ `Target.attachToTarget(flatten)` → `Page.navigate`。cdp_session.mjs 的 `new` 命令已内置。

### A4. cdp-proxy 类中间层不可靠
- **症状**：proxy 反复「连上即死」或返回旧会话数据。
- **根因**：重复启动端口冲突；陈旧实例缓存旧浏览器会话的 ID。
- **解法**：弃用中间层，`scripts/cdp_session.mjs` 直连。本库所有方案均基于直连。

## B. 进程生命周期（WorkBuddy 沙箱）

### B1. 沙箱会回收后台浏览器/长驻进程
- **症状**：`run_in_background` 启动的 Chrome / node 进程在任务结束后消失。
- **根因**：沙箱生命周期绑定任务。
- **解法**：浏览器与控制脚本**同一会话、以禁用沙箱方式**运行；接受「会话结束浏览器回收」的事实，把所有数据先落盘。

### B2. 关闭最后一个标签页会杀死整个浏览器
- **症状**：`Target.closeTarget` 后浏览器退出，后续全挂。
- **根因**：最后一个 page 关闭 = 窗口关闭。
- **解法**：**永不关闭最后一个 page**；启动时留一个 about:blank 驻守；清理用「复用 + 导航」替代关闭。cdp_session.mjs 刻意不提供 close 命令。

### B3. 浏览器与脚本网络命名空间隔离
- **症状**：同一机器上，A 会话启动的浏览器在 B 会话的脚本里连不上 9222。
- **根因**：工具调用间的沙箱网络隔离。
- **解法**：浏览器与所有 node 控制脚本必须在**同一会话、同样禁用沙箱**运行。

## C. 网络与代理

### C1. 系统环境代理劫持 localhost 请求
- **症状**：curl 本地端口返回奇怪错误（如 upstream connect failed），像是服务挂了其实没挂。
- **根因**：环境变量 `HTTP_PROXY`（实测指向 127.0.0.1:58009）转述了请求。
- **解法**：本地端口 curl 一律加 `--noproxy '*'`；或直接用 Node fetch（undici 天然不走 HTTP_PROXY）。诊断前先 `echo $HTTP_PROXY`。

### C2. 页面上下文 fetch 被 CORS 拦截
- **症状**：在笔记页 eval 里 fetch 图片/接口，全部 CORS 报错。
- **根因**：浏览器同源策略。
- **解法**：页面内只做 DOM 抽取（URL 列表落盘），二进制下载交给 Node 侧 `scripts/download_images.mjs`（带 Referer 头）。

### C3. 官方 API 调用规范
- **解法**：带 `User-Agent` + `Referer` 头 + `--noproxy '*'`；被签名挡住（如 B站搜索 wbi）就换页面 DOM 或搜索引擎路径，不硬闯。

## D. 平台行为

### D1. 反风控节奏参数（实测安全值）
- **解法**：导航间隔 ≥7s（推荐 7–11s 随机）；单轮深挖 10–12 页为宜；验证码/403/连续空白页 = 立即停下如实报告。
- **红线**：不硬闯登录墙、不绕过付费/权限内容、不批量商业化抓取。

### D2. HttpOnly cookie 不可见
- **症状**：`document.cookie` 里看不到登录 session（如小红书 `web_session`）。
- **解法**：CDP `Storage.getCookies`（浏览器级全量）+ UI 截图（头像/登录弹窗）双判据；`scripts/verify_login.mjs` 已内置。

### D3. 小红书笔记链接必须带 xsec_token
- **症状**：`/explore/<id>` 直链打不开或被拦。
- **解法**：永远使用搜索结果卡片返回的完整带 token 链接，落盘时原样保留 href。

### D4. 旧标签页截图挂起
- **症状**：`Page.captureScreenshot` 在某标签页永不返回（SIGTERM 超时）。
- **解法**：弃用该标签页，新建标签页重导航；所有 CDP 调用带超时保护。

### D5. 抖音需主动点击登录按钮
- **解法**：首页不会自动弹登录窗；eval 点击右上角「登录」后再让用户扫码。

### D6. DOM class 随机化（抖音尤甚）
- **解法**：永不写死 class 选择器；用稳定特征（`a[href*="/video/"]`、`a[href*="/user/"]`、语义属性）+ probe-dump-适配循环。

### D7. 移动端仿真改善小红书笔记页渲染
- **解法**：`Emulation.setDeviceMetricsOverride {width:500, height:900, deviceScaleFactor:2, mobile:true}` 后再导航/提取。

## E. 工具链与产物

### E1. PowerShell 5.1 重定向默认 UTF-16
- **症状**：`node xxx > log.txt` 后文件被识别为二进制、中文乱码。
- **解法**：脚本内直接 `fs.writeFileSync(..., 'utf-8')` 写文件，不依赖 stdout 重定向传中文数据。

### E2. 成品文件被预览占用导致转换写入失败
- **症状**：转换器报 unsaved changes，且目标 docx 实际未更新（mtime 不变）。
- **解法**：对已打开的文件重新生成时，**换新文件名输出**；生成后按 mtime + 内容关键词双重回读校验。

### E3. 会话转录恢复子代理产出
- **症状**：需要找回子代理的长篇调研结论但上下文已压缩。
- **解法**：扫描会话 jsonl 转录文件，记录类型为 `function_call_result`（不是 tool_result）；按内容标记词（如「全景清单」）定位后整段提取。

### E4. 一切写入必须回读校验
- **解法**：文件写入后回读（存在性 + 大小 + 关键内容）；Windows 桌面重定向等场景下「命令没报错」≠「文件已生成」。这是全流程铁律。
