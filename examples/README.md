# 示例库（Examples）

> **声明：本目录所有数据均为合成示例**，用于演示中间产物的结构与标注规范——作者、标题、链接、token、互动量全部虚构，不指向任何真实笔记/视频/用户。真实调研产出的敏感信息（cookie、token、可识别个人信息的正文）**严禁**提交到仓库。

## 文件清单

| 文件 | 演示什么 | 对应规范 |
|---|---|---|
| [`bili_search_results.json`](bili_search_results.json) | P2 视频平台漏斗搜索结果：多关键词合流 + 互动量排序前的全量落盘 | `evidence-standards.md` §2 漏斗搜索结果 schema |
| [`xhs_search_results.json`](xhs_search_results.json) | P3 社交平台搜索卡片：含 `xsec_token` 占位、`extra` 互动明细 | 同上 |
| [`xhs_details.json`](xhs_details.json) | P3 深挖详情：正文 + 评论区热评 + 抓取时间戳 | 同上 §2 深挖详情 schema |
| [`report-excerpt.md`](report-excerpt.md) | P5 成文片段：来源标注行、三态交叉核验表、局限声明 | 同上 §1 标注体系 / §2 核验裁决 / `assets/report-template.md` |

## 阅读顺序建议

1. 先看两份 `*_search_results.json`——理解「宽搜索、全量落盘」长什么样（注意 `platform` / `crawledAt` / `likeLabel` 三个通用字段：互动量是活数据，**互动量 + 抓取时间戳**才是可回查的稳定锚点）；
2. 再看 `xhs_details.json`——深挖阶段每条 top 样本会展开成什么；
3. 最后看 `report-excerpt.md`——这些 JSON 如何变成「每条结论可溯源」的成文。

## 自己跑出真实数据

```bash
node scripts/start_browser.mjs     # 起调试浏览器
# ……按 SKILL.md P2/P3 执行漏斗搜索（JSON 落盘到你的工作区 research/ 目录，勿提交）
node scripts/probe_platforms.mjs   # 先体检，确认平台知识当下有效
```
