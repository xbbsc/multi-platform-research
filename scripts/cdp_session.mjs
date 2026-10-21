#!/usr/bin/env node
// 直连 CDP 通用控制器（无中间代理层，兼容 Chrome 155+）
// 依赖：Node 22+（原生 WebSocket / fetch，无需 npm install）
//
// 用法：
//   node cdp_session.mjs list                                  列出标签页
//   node cdp_session.mjs new <url>                             新建标签页并导航
//   node cdp_session.mjs nav <targetId|url子串> <url>          导航已有标签页
//   node cdp_session.mjs eval <targetId|url子串> "<js表达式>"  页面内执行 JS（awaitPromise）
//   node cdp_session.mjs shot <targetId|url子串> <out.png> [等待秒]  截图落盘
//
// 端口：默认 9222，环境变量 CDP_PORT 可覆盖
// 铁律：刻意不提供 close 命令——关闭最后一个标签页会杀死整个浏览器（见 env-pitfalls.md B2）
// 说明：从 /json/version 动态取带 browser ID 的 WS 端点（Chrome 155 安全变更）；
//       Node fetch 不走 HTTP_PROXY 环境变量，天然绕过系统代理劫持。

import fs from 'node:fs';
import path from 'node:path';

const PORT = process.env.CDP_PORT || 9222;
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---------- CDP 连接 ----------
async function connect() {
  const ver = await fetch(`http://127.0.0.1:${PORT}/json/version`).then(r => r.json());
  const wsUrl = `ws://127.0.0.1:${PORT}` + new URL(ver.webSocketDebuggerUrl).pathname;
  const ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => {
    ws.onopen = res;
    ws.onerror = () => rej(new Error('ws-fail: 无法连接调试端口 ' + PORT + '（浏览器是否以 --remote-debugging-port 启动？）'));
  });
  return ws;
}

let __id = 0;
function send(ws, method, params = {}, sessionId, timeout = 15000) {
  const id = ++__id;
  const msg = JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) });
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout: ' + method)), timeout);
    const onMsg = ev => {
      const m = JSON.parse(ev.data.toString());
      if (m.id === id) {
        clearTimeout(t);
        ws.removeEventListener('message', onMsg);
        m.error ? reject(new Error(method + ' → ' + JSON.stringify(m.error))) : resolve(m.result);
      }
    };
    ws.addEventListener('message', onMsg);
    ws.send(msg);
  });
}

// ---------- 目标解析：完整 id / 前缀（≥8位）/ URL 子串 ----------
function resolveTarget(targetInfos, key) {
  if (!key) throw new Error('缺少目标标识（targetId / url子串）');
  const pages = targetInfos.filter(t => t.type === 'page');
  let hit = pages.find(t => t.targetId === key)
    || pages.find(t => t.targetId.startsWith(key))
    || pages.find(t => t.url.includes(key));
  if (!hit) throw new Error('未匹配到标签页: ' + key + '（先运行 list 查看）');
  return hit;
}

async function attachAndEnable(ws, targetId) {
  const { sessionId } = await send(ws, 'Target.attachToTarget', { targetId, flatten: true });
  await send(ws, 'Page.enable', {}, sessionId).catch(() => {});
  await send(ws, 'Runtime.enable', {}, sessionId).catch(() => {});
  return sessionId;
}

// ---------- 命令 ----------
const [, , cmd, ...args] = process.argv;
if (!cmd) {
  console.log('用法: node cdp_session.mjs list | new <url> | nav <目标> <url> | eval <目标> "<js>" | shot <目标> <out.png> [等待秒]');
  console.log('铁律: 本脚本不提供 close 命令（关最后一个标签页会杀死浏览器）');
  process.exit(0);
}

const ws = await connect();

try {
  if (cmd === 'list') {
    const { targetInfos } = await send(ws, 'Target.getTargets');
    const pages = targetInfos.filter(t => t.type === 'page');
    console.log('tabs:', pages.length);
    for (const t of pages) {
      console.log(JSON.stringify({ id: t.targetId.slice(0, 12), title: t.title.slice(0, 30), url: t.url.slice(0, 70) }));
    }
  } else if (cmd === 'new') {
    const url = args[0];
    if (!url) throw new Error('new 需要 <url>');
    const { targetId } = await send(ws, 'Target.createTarget', { url: 'about:blank' });
    const sessionId = await attachAndEnable(ws, targetId);
    await send(ws, 'Page.navigate', { url }, sessionId);
    await sleep(2000);
    const loc = await send(ws, 'Runtime.evaluate', { expression: 'location.href', returnByValue: true }, sessionId);
    console.log(JSON.stringify({ targetId: targetId.slice(0, 12), fullId: targetId, nowAt: loc.result.value }));
  } else if (cmd === 'nav') {
    const [key, url] = args;
    if (!key || !url) throw new Error('nav 需要 <目标> <url>');
    const { targetInfos } = await send(ws, 'Target.getTargets');
    const t = resolveTarget(targetInfos, key);
    const sessionId = await attachAndEnable(ws, t.targetId);
    await send(ws, 'Page.navigate', { url }, sessionId);
    await sleep(2000);
    const loc = await send(ws, 'Runtime.evaluate', { expression: 'location.href', returnByValue: true }, sessionId);
    console.log(JSON.stringify({ targetId: t.targetId.slice(0, 12), nowAt: loc.result.value }));
  } else if (cmd === 'eval') {
    const [key, expr] = args;
    if (!key || !expr) throw new Error('eval 需要 <目标> "<js表达式>"');
    const { targetInfos } = await send(ws, 'Target.getTargets');
    const t = resolveTarget(targetInfos, key);
    const sessionId = await attachAndEnable(ws, t.targetId);
    const r = await send(ws, 'Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, sessionId, 25000);
    if (r.exceptionDetails) throw new Error('page-err: ' + JSON.stringify(r.exceptionDetails).slice(0, 400));
    console.log(typeof r.result.value === 'string' ? r.result.value : JSON.stringify(r.result.value));
  } else if (cmd === 'shot') {
    const [key, out, waitSec] = args;
    if (!key || !out) throw new Error('shot 需要 <目标> <out.png>');
    const { targetInfos } = await send(ws, 'Target.getTargets');
    const t = resolveTarget(targetInfos, key);
    const sessionId = await attachAndEnable(ws, t.targetId);
    if (waitSec) await sleep(Number(waitSec) * 1000);
    const shot = await send(ws, 'Page.captureScreenshot', { format: 'png' }, sessionId, 20000);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, Buffer.from(shot.data, 'base64'));
    console.log(JSON.stringify({ saved: out, sizeKB: Math.round(fs.statSync(out).size / 1024) }));
  } else {
    throw new Error('未知命令: ' + cmd);
  }
} finally {
  ws.close();
}
