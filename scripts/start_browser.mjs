#!/usr/bin/env node
// 跨平台调试浏览器启动器（Cross-platform Debug Browser Launcher）
// 一条命令解决「换一台电脑从零开始」的第一步：找 Chrome → 拉起 → 自检 CDP 就绪。
//
// 用法：
//   node start_browser.mjs                       # 启动（幂等：已在跑则直接报 OK）
//   node start_browser.mjs --port 9222           # 指定调试端口（默认 9222，或 CDP_PORT）
//   node start_browser.mjs --headless            # 无头模式（CI / 无显示器环境）
//   node start_browser.mjs --profile <dir>       # 指定隔离 profile 目录（默认见下）
//   node start_browser.mjs --url <url>           # 启动后初始页面（默认 about:blank）
//   node start_browser.mjs --stay                # 就绪后挂住不退出（监护模式）
//                                                # 用途：WorkBuddy 等「命令结束回收子进程树」的
//                                                # 托管环境——以后台任务方式跑 --stay，浏览器长驻；
//                                                # 浏览器退出时脚本随之退出
//
// 行为：
//   1) 幂等检查：目标端口已有调试浏览器 → 打印就绪信息直接退出（不重复拉起）；
//   2) 路径探测：Windows/macOS/Linux 常见安装位置 → Chrome 优先，Edge（同为
//      Chromium 内核）兜底；探测顺序与结果如实报告；
//   3) 隔离 profile：登录 cookie 与日常浏览器完全隔离，留存可复用；
//      默认目录智能回退：旧版默认 ~/.workbuddy/cdp-chrome-profile 已存在则沿用
//      （兼容既有登录态），否则用 ~/.multi-platform-research/chrome-profile；
//   4) detached 独立进程启动（脚本退出后浏览器不死；CI/headless 同样适用）；
//   5) 轮询 /json/version 直到就绪（默认最长 30s），失败如实报错。
//
// 输出：人类可读状态行 + 末尾一行 JSON（机器可读，供 agent 消费）。
// 退出码：就绪 0；任何失败 1。
//
// 注意（沙箱类环境）：若你的运行环境有进程沙箱（如 WorkBuddy），浏览器与后续
// 所有 node 控制脚本必须同以「禁用沙箱」方式运行，否则会撞 env-pitfalls.md B1
// 「连不上 9222」。无沙箱环境（终端直跑、CI）无需关心。

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const sleep = ms => new Promise(r => setTimeout(r, ms));

function arg(name, def = undefined) {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')
    ? process.argv[i + 1] : def;
}
const hasFlag = name => process.argv.includes('--' + name);

const PORT = Number(arg('port', process.env.CDP_PORT || 9222));
const HEADLESS = hasFlag('headless');
const STAY = hasFlag('stay');
const START_URL = arg('url', 'about:blank');

// ---------- 1) 幂等检查：端口已有浏览器？ ----------
async function portReady() {
  try {
    const r = await fetch(`http://127.0.0.1:${PORT}/json/version`, { signal: AbortSignal.timeout(2500) });
    return r.ok ? await r.json() : null;
  } catch { return null; }
}

// ---------- 2) 浏览器路径探测 ----------
function findChrome() {
  const tried = [];
  const candidates = [];
  const win = process.platform === 'win32';

  if (process.platform === 'darwin') {
    candidates.push(
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    );
  } else if (win) {
    const pf = process.env['ProgramFiles'] || 'C:\\Program Files';
    const pf86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
    const local = process.env['LOCALAPPDATA'] || path.join(os.homedir(), 'AppData', 'Local');
    candidates.push(
      path.join(pf, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(pf86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(local, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(pf, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      path.join(pf86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    );
  } else {
    // Linux：which 探测 PATH 中的常见 Chromium 系浏览器
    for (const bin of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'microsoft-edge'])
      candidates.push(bin);
  }

  for (const c of candidates) {
    if (c.includes(path.sep) || c.includes('/')) {
      // 绝对路径候选：直接查存在性
      if (fs.existsSync(c)) return { path: c, tried, browser: nameOf(c) };
      tried.push(c);
    } else {
      // PATH 命令名：逐个 PATH 目录找
      for (const dir of (process.env.PATH || '').split(path.delimiter)) {
        const full = path.join(dir, c) + (win ? '.exe' : '');
        if (fs.existsSync(full)) return { path: full, tried, browser: nameOf(c) };
        tried.push(full);
      }
    }
  }
  return { path: null, tried, browser: null };
}
function nameOf(p) {
  const b = path.basename(p).toLowerCase();
  if (b.includes('edge') || b.includes('msedge')) return 'edge';
  if (b.includes('chromium')) return 'chromium';
  return 'chrome';
}

// ---------- 3) 隔离 profile ----------
function resolveProfile() {
  const explicit = arg('profile');
  if (explicit) return { dir: path.resolve(explicit), source: 'arg' };
  // 智能回退：旧默认目录存在则沿用（保住既有登录态，免二次扫码）
  const legacy = path.join(os.homedir(), '.workbuddy', 'cdp-chrome-profile');
  const neutral = path.join(os.homedir(), '.multi-platform-research', 'chrome-profile');
  if (fs.existsSync(legacy)) return { dir: legacy, source: 'legacy-default' };
  return { dir: neutral, source: 'default' };
}

// ---------- 主流程 ----------
const ver = await portReady();
if (ver) {
  console.log(`调试浏览器已在运行（端口 ${PORT}），无需重复启动。`);
  console.log(JSON.stringify({ ready: true, port: PORT, reused: true, browser: ver.Browser, profile: '(in-use)' }));
  process.exit(0);
}

const found = findChrome();
if (!found.path) {
  console.error('未找到 Chrome/Chromium/Edge。已尝试：');
  for (const t of found.tried) console.error('  - ' + t);
  console.error('请安装 Google Chrome 后重试，或用 --profile 外的参数指定浏览器（见脚本头注释）。');
  process.exit(1);
}

const profile = resolveProfile();
fs.mkdirSync(profile.dir, { recursive: true });

const flags = [
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${profile.dir}`,
  '--no-first-run',
  '--no-default-browser-check',
  '--window-size=1400,900',
  ...(HEADLESS ? ['--headless=new'] : []),
  START_URL,
];

console.log(`启动浏览器: ${found.path} (${found.browser})${HEADLESS ? ' [headless]' : ''}`);
console.log(`隔离 profile: ${profile.dir} (${profile.source})`);

// detached：脱离父进程生命周期——本脚本退出后浏览器继续存活（CI/终端均适用）
const child = spawn(found.path, flags, { detached: true, stdio: 'ignore' });
child.unref();

// ---------- 4) 就绪轮询 ----------
const TIMEOUT_S = 30;
let ready = null;
for (let i = 0; i < TIMEOUT_S * 2 && !ready; i++) {
  await sleep(500);
  ready = await portReady();
}

if (!ready) {
  console.error(`等待 ${TIMEOUT_S}s 后 CDP 端口 ${PORT} 仍未就绪。`);
  console.error('排查建议（详见 references/env-pitfalls.md A/B 组）：');
  console.error('  1) 浏览器是否被安全软件拦截；2) 端口是否被占用；3) 沙箱环境需与控制脚本同以禁用沙箱方式运行。');
  process.exit(1);
}

console.log(`CDP 就绪: http://127.0.0.1:${PORT}/json/version (${ready.Browser})`);
console.log(`下一步: node scripts/cdp_session.mjs list`);
console.log(JSON.stringify({
  ready: true, reused: false, port: PORT, headless: HEADLESS,
  browser: found.browser, chromePath: found.path,
  profile: profile.dir, profileSource: profile.source, pid: child.pid,
}));

// ---------- 5) 监护模式（--stay）：挂住不退出，保持进程树存活 ----------
// 浏览器退出 / CDP 连续失联 → 脚本退出（后台任务自然收尾）
if (STAY) {
  console.log('监护模式：挂住保持浏览器存活（浏览器退出时本脚本随之退出）……');
  let miss = 0;
  for (;;) {
    await sleep(5000);
    if (await portReady()) { miss = 0; continue; }
    if (++miss >= 6) { // 连续 30s 失联 → 认定浏览器已退出
      console.log('浏览器已退出，监护结束。');
      process.exit(0);
    }
  }
}
