<!--
感谢提交 PR！playbook 修正类请务必填写「验证信息」——这是本仓库维持平台知识鲜度的根基。
-->

## 变更类型

<!-- 勾选一项或多项 -->

- [ ] 🔧 **playbook 修正**（平台知识失效后的修复——最高价值贡献）
- [ ] 🧰 脚本修复 / 新功能（scripts/*.mjs）
- [ ] 🌱 新平台接入（参照 references/extending-platforms.md）
- [ ] 📝 文档 / 示例
- [ ] 🧪 CI / 体检项调整

## 改了什么

<!-- 一两句话概括 -->

## 验证信息（playbook 修正 / 新平台 / probe 改动必填）

| 项 | 内容 |
|---|---|
| 涉及平台 | <!-- bili / xhs / douyin / zhihu / other --> |
| 验证日期 | <!-- YYYY-MM-DD --> |
| 复现环境 | <!-- OS / 网络环境（境内/境外/代理）/ 是否登录态 --> |
| probe 证据 | <!-- 粘贴 probe_platforms.mjs 输出的关键行，或截图说明 --> |
| 环境限制说明 | <!-- 该失败是否可能只在你当前网络/登录态下出现？如何排除？ --> |

## 自查清单

- [ ] 改动的脚本已过 `node --check`
- [ ] `probe_platforms.mjs --static-only` 本地跑过且无新增关键 FAIL
- [ ] 相关文档已勾连（playbooks 的「最后验证日期」已更新 / SKILL.md / README 的目录与平台表）
- [ ] CHANGELOG.md 的 Unreleased 段已加条目
- [ ] 未提交任何真实 cookie / token / 个人数据；示例均为合成数据
