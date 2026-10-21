#!/usr/bin/env node
// 批量图片下载：Node fetch + Referer（绕过页面 CORS 与系统代理）
// 依赖：Node 22+（原生 fetch 不走 HTTP_PROXY 环境变量）
//
// 用法：
//   node download_images.mjs --list <imglist.json> --out-dir <dir>
//        [--referer <url>] [--min-width N] [--contains <url子串>] [--prefix <前缀>]
//
// imglist.json 格式（DOM 抽取产物）：
//   [ {"src":"https://...","dataSrc":"","w":1080}, ... ]
//
// 行为：
//   过滤（data:URI / min-width / contains）→ 逐张下载（默认 300ms 间隔）→
//   按 <prefix>00.ext 落盘 → 逐张摘要 + TOTAL 行 + <prefix>_manifest.json
//
// 为什么不用页面内 fetch：页面上下文会被 CORS 拦截（env-pitfalls.md C2）；
// Node 侧带 Referer 头下载实测稳定（如 Referer: https://www.xiaohongshu.com/）。

import fs from 'node:fs';
import path from 'node:path';

function arg(name, def = undefined) {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 ? process.argv[i + 1] : def;
}

const listFile = arg('list');
const outDir = arg('out-dir', '.');
const referer = arg('referer', '');
const minWidth = Number(arg('min-width', 0));
const contains = arg('contains', '');
const prefix = arg('prefix', 'img');

if (!listFile) {
  console.log('用法: node download_images.mjs --list <imglist.json> --out-dir <dir> [--referer <url>] [--min-width N] [--contains <子串>] [--prefix p]');
  process.exit(1);
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36';

// Referer 自动推断：小红书 CDN → 小红书站内
function autoReferer(u) {
  if (referer) return referer;
  if (/xhscdn|xiaohongshu/.test(u)) return 'https://www.xiaohongshu.com/';
  return 'https://www.google.com/';
}

const list = JSON.parse(fs.readFileSync(listFile, 'utf-8'));
let urls = list
  .map(i => (i.src || i.dataSrc || '').trim())
  .filter(u => u && !u.startsWith('data:'));

if (minWidth > 0) {
  const wOk = new Set(list.filter(i => Number(i.w) >= minWidth).map(i => (i.src || i.dataSrc || '').trim()));
  urls = urls.filter(u => wOk.has(u));
}
if (contains) urls = urls.filter(u => u.includes(contains));

fs.mkdirSync(outDir, { recursive: true });

let saved = 0;
const manifest = [];
for (let k = 0; k < urls.length; k++) {
  const u = urls[k];
  try {
    const r = await fetch(u, { headers: { 'Referer': autoReferer(u), 'User-Agent': UA } });
    if (!r.ok) {
      console.log(`img${String(k).padStart(2, '0')} FAIL ${r.status}`);
      continue;
    }
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length < 2048) { // 小于 2KB 基本是图标/占位图
      console.log(`img${String(k).padStart(2, '0')} SKIP tiny ${buf.length}B`);
      continue;
    }
    const ext = u.includes('.webp') || u.includes('webp') ? 'webp' : (u.includes('.png') ? 'png' : 'jpg');
    const file = path.join(outDir, `${prefix}${String(k).padStart(2, '0')}.${ext}`);
    fs.writeFileSync(file, buf);
    saved++;
    manifest.push({ index: k, file: path.basename(file), bytes: buf.length, url: u });
    console.log(`img${String(k).padStart(2, '0')} ${path.basename(file)} ${(buf.length / 1024).toFixed(0)}KB`);
    await new Promise(r => setTimeout(r, 300)); // 下载间隔，礼貌抓取
  } catch (e) {
    console.log(`img${String(k).padStart(2, '0')} ERR ${e.message.slice(0, 100)}`);
  }
}

fs.writeFileSync(path.join(outDir, `${prefix}_manifest.json`), JSON.stringify(manifest, null, 2), 'utf-8');
console.log(`TOTAL ${saved} / ${urls.length}`);
console.log('提示: 用 Read 工具直接读图（多模态）逐页转写；原图筛选技巧见 platform-playbooks.md 第 5 节。');
