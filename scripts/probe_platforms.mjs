#!/usr/bin/env node
// 平台体检脚本（Platform Health Probe）——一键验证本 skill 依赖的平台知识是否仍然有效
// 依赖：Node 22+（原生 fetch / WebSocket）。浏览器组可选：调试浏览器在 9222 才执行，否则如实 skip。
//
// 用法：
//   node probe_platforms.mjs                    # 全量体检（静态 + 浏览器组）
//   node probe_platforms.mjs --static-only      # 只跑静态组（无浏览器也能跑）
//   node probe_platforms.mjs --browser-only     # 只跑浏览器组
//   node probe_platforms.mjs --out research/probe_report.json
//
// 行为：
//   静态组：B站公开 API / B站搜索页可达性 / r.jina.ai 转取服务 / 知乎直抓行为基线
//   浏览器组：B站搜索卡片 DOM / 小红书登录态+搜索卡片(xsec_token) / 抖音登录态+搜索卡片
//            / 知乎热榜问题链接 + 知乎搜索页登录墙行为基线
//   未登录的平台自动 SKIP（不撞登录墙、不触发风控）；导航间隔 ≥7s（硬规则 4）；
//   浏览器组全程复用单个工作 tab（失活自动重建），不污染浏览器标签页状态。
//
// 输出：
//   stdout 人类可读体检表；JSON 落盘 --out（默认 probe_report.json，UTF-8）。
//   退出码：无 FAIL → 0；有 FAIL → 1（SKIP 不算失败——供 CI 与 P0 环境预检消费）。
//
// 体检项与 playbooks 中的「最后验证日期」一一对应：体检全绿 = 平台知识当下可信；
// 某项 FAIL = playbooks 对应小节需要 DOM probe 循环修正并更新日期。

import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import https from 'node:https';

const PORT = process.env.CDP_PORT || 9222;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const now = () => new Date().toISOString();

function arg(name, def = undefined) {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 ? process.argv[i + 1] : def;
}
const hasFlag = name => process.argv.includes('--' + name);
const staticOnly = hasFlag('static-only');
const browserOnly = hasFlag('browser-only');
const outFile = arg('out', 'probe_report.json');
const mdFile = arg('md'); // 可选：同步输出 Markdown 摘要（CI summary / 贴报告用）

// ---------- 通用 fetch（带超时 + UA） ----------
async function httpGet(url, headers = {}, timeoutMs = 15000) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': UA, 'Accept-Language': 'zh-CN,zh;q=0.9', ...headers },
      signal: ac.signal,
      redirect: 'follow',
    });
    const body = await r.text().catch(() => '');
    return { ok: r.ok, status: r.status, body };
  } finally { clearTimeout(t); }
}

// 经系统代理的 HTTPS GET（原生 http CONNECT 隧道，无需 npm 依赖）
// 用途：Node fetch 不读 HTTP_PROXY 环境变量；海外服务（如 r.jina.ai）在国内网络常需代理可达。
function httpGetViaProxy(urlStr, proxyStr, headers = {}, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const clean = proxyStr.replace(/^https?:\/\//, '');
    const [ph, pp] = clean.split(':');
    const req = http.request({ host: ph, port: Number(pp) || 80, method: 'CONNECT', path: u.host + ':443' });
    const timer = setTimeout(() => { req.destroy(); reject(new Error('proxy timeout')); }, timeoutMs);
    req.on('connect', (res, socket) => {
      if (res.statusCode !== 200) { clearTimeout(timer); return reject(new Error('proxy CONNECT ' + res.statusCode)); }
      const tlsReq = https.request({
        host: u.host, path: u.pathname + u.search, method: 'GET', socket,
        headers: { 'User-Agent': UA, ...headers }, timeout: timeoutMs,
      }, r => {
        let body = '';
        r.on('data', d => { body += d; if (body.length > 2e6) r.destroy(); });
        r.on('end', () => { clearTimeout(timer); resolve({ ok: r.statusCode < 400, status: r.statusCode, body }); });
      });
      tlsReq.on('error', e => { clearTimeout(timer); reject(e); });
      tlsReq.end();
    });
    req.on('error', e => { clearTimeout(timer); reject(e); });
    req.end();
  });
}

// ---------- CDP（自包含，与 verify_login.mjs 同款实现） ----------
async function connectCdp() {
  const ver = await fetch(`http://127.0.0.1:${PORT}/json/version`, { signal: AbortSignal.timeout(4000) }).then(r => r.json());
  const wsUrl = `ws://127.0.0.1:${PORT}` + new URL(ver.webSocketDebuggerUrl).pathname;
  const ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws-fail')); });
  return ws;
}
let __id = 0;
function cdpSend(ws, method, params = {}, sessionId, timeout = 20000) {
  const id = ++__id;
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
    ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
}

// ---------- 结果记录 ----------
const checks = [];
function record(id, platform, mode, status, detail, critical = true) {
  checks.push({ id, platform, mode, status, detail: String(detail).slice(0, 300), critical, checkedAt: now() });
  const tag = { pass: '[PASS]', fail: '[FAIL]', skip: '[SKIP]' }[status];
  console.log(`${tag} ${id.padEnd(18)} (${platform.padEnd(5)}/ ${mode.padEnd(7)}) ${detail}`);
}

// ---------- 浏览器辅助 ----------
let lastNavAt = 0;
// 体检专用工作 tab：复用而非每次新建——一次全量体检只占 1 个 tab，不污染浏览器
// （v0.2 每次导航 createTarget，全量体检会留下 7 个 tab）。tab 失活（被外部关闭 /
// eval 挂起，env-pitfalls D4）时自动弃用重建。
let probeTab = null; // { targetId, sessionId }
async function ensureProbeTab(ws) {
  if (probeTab) {
    const { targetInfos } = await cdpSend(ws, 'Target.getTargets');
    if (targetInfos.some(t => t.targetId === probeTab.targetId)) return probeTab;
    probeTab = null; // 已消失 → 重建
  }
  const { targetId } = await cdpSend(ws, 'Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdpSend(ws, 'Target.attachToTarget', { targetId, flatten: true });
  await cdpSend(ws, 'Page.enable', {}, sessionId).catch(() => {});
  probeTab = { targetId, sessionId };
  return probeTab;
}
async function navWithPace(ws, url, waitMs = 4000) {
  // 速率自律：两次导航间隔 ≥7s（7–11s 随机）；首次导航不等待
  if (lastNavAt > 0) {
    const gap = 7000 + Math.floor(Math.random() * 4000);
    const since = Date.now() - lastNavAt;
    if (since < gap) await sleep(gap - since);
  }
  const tab = await ensureProbeTab(ws);
  lastNavAt = Date.now();
  // 导航命令不等 load（瀑布流页 load 可超 20s）：超时吞掉，页面真实状态由后续
  // evalInPage 探测判定——数据说话，而不是让导航超时制造误报
  await cdpSend(ws, 'Page.navigate', { url }, tab.sessionId).catch(() => {});
  await sleep(waitMs);
  return tab;
}
async function evalInPage(ws, sessionId, expression, timeout = 15000) {
  try {
    const r = await cdpSend(ws, 'Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId, timeout);
    if (r.exceptionDetails) throw new Error('page-err: ' + JSON.stringify(r.exceptionDetails).slice(0, 160));
    return r.result.value;
  } catch (e) {
    // 超时 → tab 疑似挂起（env-pitfalls D4 同款症状），弃用，下次导航自动重建
    if (String(e.message).startsWith('timeout:')) probeTab = null;
    throw e;
  }
}
// 浏览器级全量 cookie（HttpOnly 可见），返回该域的 cookie 名集合
async function cookiesForDomain(ws, domain) {
  const { cookies } = await cdpSend(ws, 'Storage.getCookies', {});
  return new Set(cookies.filter(c => (c.domain || '').includes(domain)).map(c => c.name));
}

// ============================================================
// 静态组：不依赖浏览器
// ============================================================
async function runStatic() {
  // 1. B站公开 API（P2 数据回验通道，playbooks 第 1 节）
  try {
    const r = await httpGet('https://api.bilibili.com/x/web-interface/view?bvid=BV1GJ411x7h7', { Referer: 'https://www.bilibili.com' });
    const j = JSON.parse(r.body || '{}');
    if (j.code === 0 && j.data && j.data.bvid) record('bili-view-api', 'bili', 'static', 'pass', `code=0, title=${(j.data.title || '').slice(0, 24)}`);
    else record('bili-view-api', 'bili', 'static', 'fail', `code=${j.code ?? r.status} message=${j.message ?? ''}`);
  } catch (e) { record('bili-view-api', 'bili', 'static', 'fail', e.message); }

  // 2. B站搜索页可达性（P2 漏斗入口）
  try {
    const r = await httpGet('https://search.bilibili.com/all?keyword=test');
    r.ok ? record('bili-search-page', 'bili', 'static', 'pass', `HTTP ${r.status}`)
         : record('bili-search-page', 'bili', 'static', 'fail', `HTTP ${r.status}`);
  } catch (e) { record('bili-search-page', 'bili', 'static', 'fail', e.message); }

  // 3. r.jina.ai 转取服务（P1/P3 降级通道，playbooks 第 0/4 节）
  //    非关键项（有替代降级路径：WebSearch site: 索引）。海外服务，国内网络常需代理；
  //    agent 环境中 jina 通常经 WebFetch 工具（服务端）访问——本机不可达 ≠ 通道不可用。
  //    策略：先直连，再试系统代理（原生 CONNECT 隧道），两次结果都如实写入 detail。
  try {
    const jinaUrl = 'https://r.jina.ai/https://example.com';
    const attempts = [];
    let verdict = null;
    try {
      const r = await httpGet(jinaUrl, {}, 20000);
      if (r.status === 200 && r.body.includes('Example')) verdict = '直连可用';
      else attempts.push(`直连 HTTP ${r.status}`);
    } catch (e) { attempts.push('直连 ' + e.message.slice(0, 80)); }
    if (!verdict) {
      const proxy = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy;
      if (proxy) {
        try {
          const r = await httpGetViaProxy(jinaUrl, proxy, {}, 20000);
          if (r.status === 200 && r.body.includes('Example')) verdict = '经系统代理可用';
          else attempts.push(`代理 HTTP ${r.status}`);
        } catch (e) { attempts.push('代理 ' + e.message.slice(0, 80)); }
      } else attempts.push('环境无系统代理可试');
    }
    if (verdict) record('jina-service', 'general', 'static', 'pass', verdict, false);
    else record('jina-service', 'general', 'static', 'fail',
      attempts.join('；') + '（非关键：可改用 WebSearch site: 索引；agent 内 jina 走 WebFetch 服务端不受影响）', false);
  } catch (e) { record('jina-service', 'general', 'static', 'fail', e.message, false); }

  // 4. 知乎直抓行为基线（P3 第 4 节：403 = 预期内，走 jina 降级；2xx = 直抓仍可用）
  try {
    const r = await httpGet('https://www.zhihu.com/explore');
    if (r.ok) record('zhihu-direct', 'zhihu', 'static', 'pass', `HTTP ${r.status}，直抓可用`);
    else if (r.status === 403) record('zhihu-direct', 'zhihu', 'static', 'pass', 'HTTP 403（预期内）→ 使用 r.jina.ai 降级');
    else record('zhihu-direct', 'zhihu', 'static', 'fail', `HTTP ${r.status}，行为偏离基线`);
  } catch (e) { record('zhihu-direct', 'zhihu', 'static', 'fail', e.message); }
}

// ============================================================
// 浏览器组：需要 9222 调试浏览器；未登录平台自动 SKIP
// ============================================================
async function runBrowser() {
  let ws;
  try { ws = await connectCdp(); }
  catch (e) {
    for (const [id, p] of [['bili-search-dom', 'bili'], ['xhs-login-state', 'xhs'], ['xhs-search-card', 'xhs'], ['dy-login-state', 'dy'], ['dy-search-card', 'dy'], ['zhihu-question-dom', 'zhihu'], ['zhihu-search-policy', 'zhihu']])
      record(id, p, 'browser', 'skip', '调试浏览器未运行（9222 连不上）');
    return;
  }

  try {
    // --- B站搜索卡片 DOM（无需登录） ---
    try {
      const { sessionId } = await navWithPace(ws, 'https://search.bilibili.com/all?keyword=' + encodeURIComponent('调研'), 5000);
      const n = await evalInPage(ws, sessionId, `document.querySelectorAll('a[href*="/video/BV"]').length`);
      n >= 5 ? record('bili-search-dom', 'bili', 'browser', 'pass', `${n} 个视频卡片`)
             : record('bili-search-dom', 'bili', 'browser', 'fail', `仅 ${n} 个卡片（阈值 5），选择器或页面已变更`);
    } catch (e) { record('bili-search-dom', 'bili', 'browser', 'fail', e.message); }

    // --- 小红书：登录态 → 搜索卡片 ---
    let xhsLoggedIn = false;
    try {
      const names = await cookiesForDomain(ws, 'xiaohongshu.com');
      xhsLoggedIn = names.has('web_session');
      record('xhs-login-state', 'xhs', 'browser', 'pass', xhsLoggedIn ? 'web_session 在，登录态可用' : '未登录（web_session 不存在）');
    } catch (e) { record('xhs-login-state', 'xhs', 'browser', 'fail', e.message); }
    if (!xhsLoggedIn) {
      record('xhs-search-card', 'xhs', 'browser', 'skip', '未登录，不撞登录墙；登录后重跑可体检');
    } else {
      try {
        const { sessionId } = await navWithPace(ws, 'https://www.xiaohongshu.com/search_result?keyword=' + encodeURIComponent('学习'), 9000);
        const r = await evalInPage(ws, sessionId, `JSON.stringify({
          cards: document.querySelectorAll('a[href*="/search_result/"], a[href*="/explore/"]').length,
          tokened: [...document.querySelectorAll('a[href*="/search_result/"], a[href*="/explore/"]')].filter(a => a.href.includes('xsec_token=')).length
        })`);
        const { cards, tokened } = JSON.parse(r || '{}');
        (cards >= 3 && tokened >= 1)
          ? record('xhs-search-card', 'xhs', 'browser', 'pass', `${cards} 卡片，${tokened} 带 xsec_token`)
          : record('xhs-search-card', 'xhs', 'browser', 'fail', `cards=${cards} tokened=${tokened}（阈值 cards≥3, tokened≥1）`);
      } catch (e) {
        const msg = String(e.message);
        const hint = msg.startsWith('timeout:')
          ? '（页面 URL 可达但 load/eval 挂起——疑似登录态下搜索页被平台节流，或前端渲染卡死；建议隔时段复测 / 人工开浏览器确认 / 用 verify_login 复核登录态）'
          : '';
        record('xhs-search-card', 'xhs', 'browser', 'fail', msg + hint);
      }
    }

    // --- 抖音：登录态 → 搜索卡片 ---
    let dyLoggedIn = false;
    try {
      const names = await cookiesForDomain(ws, 'douyin.com');
      dyLoggedIn = names.has('sessionid') || names.has('sid_tt');
      record('dy-login-state', 'dy', 'browser', 'pass', dyLoggedIn ? 'sessionid 在，登录态可用' : '未登录（无 sessionid/sid_tt）');
    } catch (e) { record('dy-login-state', 'dy', 'browser', 'fail', e.message); }
    if (!dyLoggedIn) {
      record('dy-search-card', 'dy', 'browser', 'skip', '未登录，不撞登录墙；登录后重跑可体检');
    } else {
      try {
        const { sessionId } = await navWithPace(ws, 'https://www.douyin.com/search/' + encodeURIComponent('学习') + '?type=video', 9000);
        const n = await evalInPage(ws, sessionId, `document.querySelectorAll('a[href*="/video/"]').length`);
        n >= 3 ? record('dy-search-card', 'dy', 'browser', 'pass', `${n} 个视频卡片`)
               : record('dy-search-card', 'dy', 'browser', 'fail', `仅 ${n} 个卡片（阈值 3），DOM 特征已变更`);
      } catch (e) { record('dy-search-card', 'dy', 'browser', 'fail', e.message); }
    }

    // --- 知乎问题页直链（playbook 静态轨道终点：WebSearch 找到问题 URL 后，浏览器/静态读正文） ---
    // 基线（2026-10-21）：搜索页/热榜页对匿名强制登录，但问题页直链可读。
    // 19550225 = 知乎 2011 年官方长寿问题「如何正确使用知乎？」，作为探针页极稳定。
    try {
      const { sessionId } = await navWithPace(ws, 'https://www.zhihu.com/question/19550225', 5000);
      const r = await evalInPage(ws, sessionId, `JSON.stringify({
        answers: document.querySelectorAll('.RichContent-inner, [class*="RichContent"]').length,
        modal: !!document.querySelector('.Modal-loginButton, [class*="signFlow"]'),
        textLen: document.body.innerText.length
      })`);
      const { answers, modal, textLen } = JSON.parse(r || '{}');
      answers >= 1 && textLen > 1000
        ? record('zhihu-question-dom', 'zhihu', 'browser', 'pass', `问题页匿名可读：${answers} 个回答块，${textLen} 字符${modal ? '（伴可关闭登录浮层）' : ''}`)
        : record('zhihu-question-dom', 'zhihu', 'browser', 'fail', `answers=${answers} textLen=${textLen}，问题页匿名读取已失效`);
    } catch (e) { record('zhihu-question-dom', 'zhihu', 'browser', 'fail', e.message); }
    try {
      // 行为基线（非关键）：2026-10-21 实测 = 匿名即弹登录窗且结果区不渲染；此状态记 pass，仅当页面异常时 fail
      const { sessionId } = await navWithPace(ws, 'https://www.zhihu.com/search?type=content&q=' + encodeURIComponent('学习'), 5000);
      const r = await evalInPage(ws, sessionId, `JSON.stringify({
        qs: document.querySelectorAll('a[href*="/question/"]').length,
        modal: !!document.querySelector('.Modal-loginButton, [class*="signFlow"]')
      })`);
      const { qs, modal } = JSON.parse(r || '{}');
      if (modal && qs === 0) record('zhihu-search-policy', 'zhihu', 'browser', 'pass', '确认：搜索页强制登录（匿名不出结果）→ 站内搜索走静态轨道或登录态', false);
      else if (qs >= 1) record('zhihu-search-policy', 'zhihu', 'browser', 'pass', `${qs} 个问题链接，匿名仍可搜`, false);
      else record('zhihu-search-policy', 'zhihu', 'browser', 'fail', `modal=${modal} qs=${qs}，页面状态异常`, false);
    } catch (e) { record('zhihu-search-policy', 'zhihu', 'browser', 'fail', e.message, false); }
  } finally { ws.close(); }
}

// ---------- 主调度 ----------
if (!staticOnly && !browserOnly) { await runStatic(); await runBrowser(); }
else if (staticOnly) { await runStatic(); }
else if (browserOnly) { await runBrowser(); }

// ---------- 汇总与落盘 ----------
console.log('----');
const fails = checks.filter(c => c.status === 'fail');
const summary = {
  pass: checks.filter(c => c.status === 'pass').length,
  fail: fails.length,
  failCritical: fails.filter(c => c.critical).length,
  failNonCritical: fails.filter(c => !c.critical).length,
  skip: checks.filter(c => c.status === 'skip').length,
};
console.log(`体检汇总: ${summary.pass} PASS / ${summary.fail} FAIL（其中关键项 ${summary.failCritical}）/ ${summary.skip} SKIP　（SKIP 与非关键 FAIL 不算失败）`);
const report = {
  tool: 'probe_platforms.mjs',
  skill: 'multi-platform-research',
  checkedAt: now(),
  env: { node: process.version, os: process.platform, cdpPort: PORT, browserGroup: !staticOnly },
  summary,
  checks,
  note: '体检全绿 = playbooks 平台知识当下可信；关键项 FAIL = playbooks 对应小节需 DOM probe 循环修正并更新「最后验证日期」；非关键项 FAIL（如 jina）= 该降级通道当前不可用，改用替代路径，不影响整体可用性。',
};
fs.writeFileSync(outFile, JSON.stringify(report, null, 2), 'utf-8');
console.log(`报告已落盘: ${path.resolve(outFile)}`);

// Markdown 摘要（可选）：供 CI workflow summary 与直接粘贴报告
if (mdFile) {
  const icon = { pass: '✅', fail: '❌', skip: '⏭️' };
  const md = [
    '# 平台体检报告（probe_platforms）',
    '',
    `- 时间：${report.checkedAt}`,
    `- 环境：node ${report.env.node} / ${report.env.os} / CDP ${report.env.cdpPort} / 浏览器组 ${report.env.browserGroup ? 'on' : 'off'}`,
    `- 汇总：**${summary.pass} PASS / ${summary.fail} FAIL（关键 ${summary.failCritical}）/ ${summary.skip} SKIP**（SKIP 与非关键 FAIL 不算失败）`,
    '',
    '| 项目 | 平台 | 模式 | 状态 | 说明 |',
    '|---|---|---|---|---|',
    ...checks.map(c => `| ${c.id} | ${c.platform} | ${c.mode} | ${icon[c.status]} ${c.status.toUpperCase()}${c.critical ? '' : '（非关键）'} | ${String(c.detail).replace(/\|/g, '/')} |`),
    '',
    '> 体检全绿 = playbooks 平台知识当下可信；关键项 FAIL = 对应小节需 DOM probe 循环修正并更新「最后验证日期」。',
  ].join('\n');
  fs.writeFileSync(mdFile, md, 'utf-8');
  console.log(`Markdown 摘要已落盘: ${path.resolve(mdFile)}`);
}
process.exit(summary.failCritical > 0 ? 1 : 0);
