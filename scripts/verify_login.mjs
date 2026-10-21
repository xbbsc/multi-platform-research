#!/usr/bin/env node
// 平台登录态判定：cookie（含 HttpOnly）+ DOM 标记双判据
// 依赖：Node 22+；调试浏览器已在 9222（或 CDP_PORT）运行
// 用法：node verify_login.mjs <xhs|douyin|zhihu>
// 输出：JSON { platform, pages, cookieHits, domMarks, verdict }
//       verdict: likely-logged-in | likely-logged-out | unknown
// 注意：判定结果必须配合人工读截图复核（UI 为准，见 env-pitfalls.md D2/D4）

const PORT = process.env.CDP_PORT || 9222;
const platform = (process.argv[2] || '').toLowerCase();
if (!['xhs', 'douyin', 'zhihu'].includes(platform)) {
  console.log('用法: node verify_login.mjs <xhs|douyin|zhihu>');
  process.exit(1);
}

// 各平台判据配置
const PROFILES = {
  xhs: {
    domain: 'xiaohongshu.com',
    strongCookies: ['web_session'],          // 命中即已登录
    weakCookies: ['a1', 'webId'],            // 仅设备指纹，不算登录
    loginModal: '.login-container, .qrcode-login, [class*="login-full"]',
    avatarMark: '[class*="avatar"] img, .side-bar-component img',
  },
  douyin: {
    domain: 'douyin.com',
    strongCookies: ['sessionid', 'sid_tt', 'sid_guard'],
    weakCookies: ['passport_csrf_token', 'ttwid'],
    loginModal: '.web-login, [class*="login-guide"], [class*="login-panel"]',
    avatarMark: '[class*="avatar"] img',
  },
  zhihu: {
    domain: 'zhihu.com',
    strongCookies: ['z_c0'],                 // z_c0 = 登录令牌
    weakCookies: ['d_c0'],                   // d_c0 = 设备标识
    loginModal: '.Modal-loginButton, [class*="signFlow"]',
    avatarMark: 'img.Avatar, [class*="UserLink"] img',
  },
};
const P = PROFILES[platform];

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function connect() {
  const ver = await fetch(`http://127.0.0.1:${PORT}/json/version`).then(r => r.json());
  const wsUrl = `ws://127.0.0.1:${PORT}` + new URL(ver.webSocketDebuggerUrl).pathname;
  const ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws-fail')); });
  return ws;
}

let __id = 0;
function send(ws, method, params = {}, sessionId, timeout = 12000) {
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

const ws = await connect();
const out = { platform, pages: [], cookieHits: [], domMarks: {}, verdict: 'unknown' };

try {
  const { targetInfos } = await send(ws, 'Target.getTargets');
  const pages = targetInfos.filter(t => t.type === 'page' && t.url.includes(P.domain));
  out.pages = pages.map(t => ({ id: t.targetId.slice(0, 12), url: t.url.slice(0, 60) }));

  // 判据 1：cookie（走已 attach 页面的 Network.getCookies，能拿到 HttpOnly）
  const seen = new Set();
  for (const t of pages) {
    try {
      const { sessionId } = await send(ws, 'Target.attachToTarget', { targetId: t.targetId, flatten: true });
      await send(ws, 'Network.enable', {}, sessionId).catch(() => {});
      const { cookies } = await send(ws, 'Network.getCookies', {}, sessionId);
      for (const c of cookies) {
        if (!c.domain.includes(P.domain)) continue;
        const key = c.name;
        if ((P.strongCookies.includes(key) || P.weakCookies.includes(key)) && !seen.has(key)) {
          seen.add(key);
          out.cookieHits.push({ name: key, strong: P.strongCookies.includes(key) });
        }
      }
      // 判据 2：DOM 标记（登录弹窗在场 = 未登录；头像类标记在场 = 可能已登录）
      const marks = await send(ws, 'Runtime.evaluate', { expression: `
        JSON.stringify({
          loginModal: !!document.querySelector('${P.loginModal}'),
          avatar: !!document.querySelector('${P.avatarMark}')
        })`, returnByValue: true }, sessionId);
      out.domMarks = JSON.parse(marks.result.value || '{}');
    } catch (e) { /* 单页失败不致命 */ }
  }

  // 判据 1 补充：目标平台标签页未打开（或页面级未命中）时，
  // 走浏览器级 Storage.getCookies 全量兜底——profile 里留存的登录 cookie 也能查到
  if (!out.cookieHits.some(c => c.strong)) {
    try {
      const { cookies } = await send(ws, 'Storage.getCookies', {});
      for (const c of cookies) {
        if (!c.domain || !c.domain.includes(P.domain)) continue;
        if ((P.strongCookies.includes(c.name) || P.weakCookies.includes(c.name)) && !out.cookieHits.some(h => h.name === c.name)) {
          out.cookieHits.push({ name: c.name, strong: P.strongCookies.includes(c.name), source: 'browser-store' });
        }
      }
    } catch (e) { /* 旧版本不支持则跳过 */ }
  }

  const strongCookie = out.cookieHits.some(c => c.strong);
  if (strongCookie && !out.domMarks.loginModal) out.verdict = 'likely-logged-in';
  else if (!strongCookie && (out.domMarks.loginModal || pages.length === 0)) out.verdict = 'likely-logged-out';
  else out.verdict = 'unknown'; // 信号矛盾 → 必须人工读截图
} finally {
  ws.close();
}

console.log(JSON.stringify(out, null, 2));
console.log('提示: verdict=unknown 时，用 cdp_session.mjs shot 截图后人工读图确认（UI 为准）。');
