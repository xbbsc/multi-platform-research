# 贡献指南（Contributing）

> **English**: Contributions are welcome! The highest-value contribution is fixing rotted platform knowledge (DOM selectors, entry URLs, behavior baselines) — run `scripts/probe_platforms.mjs`, reproduce the failure locally, then PR the playbook fix with evidence. See below; Chinese is the working language of this repo.

感谢你对本项目的兴趣。这是一个「方法论 + 工具箱」性质的 agent skill，最怕的不是代码 bug，而是**平台知识悄悄过期**——所以本项目最欢迎、也最需要的贡献就是帮助我们保持平台知识的鲜度。

## 三类贡献（按当前需求排序）

### A. 修正失效的平台知识（最有价值）⭐

平台的 DOM 结构、入口 URL、行为基线随时在变。当你发现：

- `probe_platforms.mjs` 某项 FAIL（且排除环境限制，见下）；
- 按 playbook 的选择器/入口拿不到预期的数据；
- 登录墙行为与 playbook 记载不符；

请帮我们修正 `references/platform-playbooks.md`。**playbook 修正 PR 有硬要求**（也是 CI 之外这套体系能活着的根基）：

1. **更新对应章节的「最后验证日期」**，并写明你验证的环境（操作系统 / 网络环境 / 是否登录态）；
2. **附证据**：probe 输出的关键行、或一张截图（放 PR 描述里即可，不要提交大文件）；
3. **区分「环境限制」与「知识腐化」**：海外 IP 风控、无登录态导致的 SKIP/拦截属于前者，请在 PR 里说明你复现时的环境，避免把环境问题写进平台基线；
4. 如果需要新增/修改体检项，同步改 `scripts/probe_platforms.mjs` 并在本地跑一遍静态组（`--static-only`）确认无回归。

### B. 脚本与工具

- 脚本 bug 修复（cdp_session / start_browser / verify_login / probe_platforms / download_images）；
- 跨平台验证与修复（尤其 macOS / Linux 上 `start_browser.mjs` 的路径探测）——欢迎直接改 + 附你机器的实测输出；
- 新平台接入：请先读 [`references/extending-platforms.md`](references/extending-platforms.md)，按其中的五步法执行并在 PR 里给出体检项与 playbook 章节草稿。

### C. 文档与示例

- 修正过时表述、补充 agent-integration 的适配经验、扩充 `examples/` 合成示例；
- 中英双语的术语校对。

## 环境准备

- Node.js ≥ 22（脚本只用原生 `WebSocket` / `fetch`，**无需 npm install**）；
- Chrome 或 Edge（`scripts/start_browser.mjs` 会自动定位）；
- Windows / macOS / Linux 均可开发；CI 在 ubuntu-latest 上每周跑静态组体检。

```bash
# 语法校验（每个改过的脚本）
node --check scripts/xxx.mjs

# 平台体检回归（改 probe/playbook 前后各跑一次）
node scripts/probe_platforms.mjs --static-only
```

## 提交规范

- Conventional Commits：`feat: / fix: / docs: / ci: / chore:`；
- 一个 commit 只做一件事；
- 说明「怎么验证的」（跑过什么命令、什么环境）。

## 提交 PR

1. Fork → 建 feature 分支 → 提交；
2. PR 描述会套用模板；**playbook 修正类请务必填全模板中的「验证信息」部分**，证据不足的 PR 我们会先请补充再合入；
3. 平台失效但自己没空修？开 issue（选「平台知识失效」模板），贴上 probe 输出，同样非常有价值。

## 伦理边界（也是本项目的立场）

- 礼貌访问：遵守脚本内置的 ≥7 秒导航间隔，不提交加速批量抓取的功能；
- 不绕过登录墙/付费墙：登录由用户本人在自己设备上完成，tool 不收集凭据；
- 不提交任何真实 cookie、token、profile 目录或含个人信息的调研数据；示例一律用合成数据。

## License

提交即表示你同意以 [MIT](LICENSE) 授权你的贡献。
