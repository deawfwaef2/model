#!/usr/bin/env node
/* ==========================================================================
   TITAN LOOP — tools/build.js
   把 src/ + vendor/ 内联成 3 个单文件 HTML 包，并打成 zip。
   零依赖：只用 Node 自带 fs / path / zlib。

   用法： node 001/tools/build.js        （仓库根目录执行也可以）
   产出：
     001/build/standalone/index.html   下载双击即玩（无平台 SDK）
     001/build/crazygames/index.html   CrazyGames SDK v3
     001/build/playgama/index.html     Playgama Bridge
     001/dist/*.zip                    上传用
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.resolve(__dirname, '..');          // .../001
const SRC = path.join(ROOT, 'src');
const VENDOR = path.join(ROOT, 'vendor');
const BUILD = path.join(ROOT, 'build');
const DIST = path.join(ROOT, 'dist');

const SRC_ORDER = [
  '00_core.js', '10_audio.js', '20_ads.js', '30_data.js',
  '40_world.js', '50_game.js', '60_ui.js', '70_boot.js'
];

const BUILD_TAG = new Date().toISOString().slice(0, 16).replace('T', ' ');

function read(p) { return fs.readFileSync(p, 'utf8'); }
function ensure(p) { fs.mkdirSync(p, { recursive: true }); }
function rmrf(p) { if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true }); }

/* ------------------------------ 轻量压缩 ------------------------------ */
// 不做 AST 级别 minify（无依赖），只做安全的注释/空白清理。
function lightMin(js) {
  let out = '';
  let i = 0, n = js.length;
  let inStr = null, inTpl = false, inRe = false;
  let prevSig = '';   // 上一个有意义字符，用来判断正则 vs 除号
  while (i < n) {
    const c = js[i], c2 = js[i + 1];
    if (inStr) {
      out += c;
      if (c === '\\') { out += js[i + 1] || ''; i += 2; continue; }
      if (c === inStr) inStr = null;
      i++; continue;
    }
    if (inTpl) {
      out += c;
      if (c === '\\') { out += js[i + 1] || ''; i += 2; continue; }
      if (c === '`') inTpl = false;
      i++; continue;
    }
    if (inRe) {
      out += c;
      if (c === '\\') { out += js[i + 1] || ''; i += 2; continue; }
      if (c === '/') { inRe = false; prevSig = '/'; }
      i++; continue;
    }
    if (c === '/' && c2 === '/') { while (i < n && js[i] !== '\n') i++; continue; }
    if (c === '/' && c2 === '*') { i += 2; while (i < n && !(js[i] === '*' && js[i + 1] === '/')) i++; i += 2; continue; }
    if (c === '"' || c === "'") { inStr = c; out += c; i++; prevSig = c; continue; }
    if (c === '`') { inTpl = true; out += c; i++; prevSig = c; continue; }
    if (c === '/') {
      // 判断是不是正则字面量
      if (prevSig === '' || '(,=:[!&|?{};+-*%~^<>'.indexOf(prevSig) >= 0 || /[a-z]/.test(prevSig) === false) {
        if (!/[\w)\]]/.test(prevSig)) { inRe = true; out += c; i++; continue; }
      }
      out += c; prevSig = c; i++; continue;
    }
    if (c === '\n' || c === '\r') {
      // 保留换行（防止 ASI 出问题），但折叠多余空行
      if (out.length && out[out.length - 1] !== '\n') out += '\n';
      i++; continue;
    }
    if (c === ' ' || c === '\t') {
      // 折叠连续空白；行首缩进直接丢
      if (out.length && (out[out.length - 1] === '\n' || out[out.length - 1] === ' ')) { i++; continue; }
      let j = i; while (j < n && (js[j] === ' ' || js[j] === '\t')) j++;
      const nxt = js[j];
      const prv = out[out.length - 1];
      if (prv && nxt && /[\w$]/.test(prv) && /[\w$]/.test(nxt)) out += ' ';
      i = j; continue;
    }
    out += c; prevSig = c; i++;
  }
  return out.replace(/\n{2,}/g, '\n').trim();
}

function minCss(css) {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s*([{}:;,>])\s*/g, '$1')
    .replace(/;}/g, '}')
    .replace(/\n+/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/* ------------------------------ ZIP 写入器 ----------------------------- */
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function zip(entries, outPath) {
  const chunks = [], central = [];
  let offset = 0;
  for (const e of entries) {
    const nameBuf = Buffer.from(e.name, 'utf8');
    const data = Buffer.isBuffer(e.data) ? e.data : Buffer.from(e.data, 'utf8');
    const comp = zlib.deflateRawSync(data, { level: 9 });
    const crc = crc32(data);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0, 6); lh.writeUInt16LE(8, 8);
    lh.writeUInt16LE(0, 10); lh.writeUInt16LE(0, 12);
    lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(comp.length, 18);
    lh.writeUInt32LE(data.length, 22);
    lh.writeUInt16LE(nameBuf.length, 26); lh.writeUInt16LE(0, 28);
    chunks.push(lh, nameBuf, comp);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0, 8); ch.writeUInt16LE(8, 10);
    ch.writeUInt16LE(0, 12); ch.writeUInt16LE(0, 14);
    ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(comp.length, 20);
    ch.writeUInt32LE(data.length, 24);
    ch.writeUInt16LE(nameBuf.length, 28);
    ch.writeUInt16LE(0, 30); ch.writeUInt16LE(0, 32); ch.writeUInt16LE(0, 34); ch.writeUInt16LE(0, 36);
    ch.writeUInt32LE(0, 38);
    ch.writeUInt32LE(offset, 42);
    central.push(ch, nameBuf);
    offset += lh.length + nameBuf.length + comp.length;
  }
  const centralBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4); end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  fs.writeFileSync(outPath, Buffer.concat([...chunks, centralBuf, end]));
  return fs.statSync(outPath).size;
}

/* ------------------------------- 组装 HTML ----------------------------- */
const three = read(path.join(VENDOR, 'three.min.js'));
const css = minCss(read(path.join(SRC, 'style.css')));
const srcJoined = SRC_ORDER.map(f => '\n/* ===== ' + f + ' ===== */\n' + read(path.join(SRC, f))).join('\n');

function makeHtml(provider, opts) {
  opts = opts || {};
  // 可靠性优先：不做 JS 压缩（三方库已压缩，总体积本来就远低于 20MB 上限）
  const js = srcJoined.replace('__BUILD_TAG__', BUILD_TAG + ' / ' + provider);

  const sdkTag =
    provider === 'crazygames'
      ? '<script src="https://sdk.crazygames.com/crazygames-sdk-v3.js"><\/script>\n'
      : provider === 'playgama'
        ? '<script src="https://bridge.playgama.com/v1/stable/playgama-bridge.js"><\/script>\n'
        : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover">
<meta name="theme-color" content="#08050a">
<meta name="description" content="TITAN LOOP - ten seconds to kill a god. A 3D time-loop arena shooter.">
<title>TITAN LOOP${opts.titleSuffix || ''}</title>
<style>${css}</style>
</head>
<body>
<canvas id="gl"></canvas>
<div id="ui"></div>
<noscript><div style="color:#fff;padding:40px;font-family:sans-serif">This game requires JavaScript.</div></noscript>
${sdkTag}<script>window.TL_AD_PROVIDER=${JSON.stringify(provider)};<\/script>
<script>${three}<\/script>
<script>${js}<\/script>
</body>
</html>
`;
}

/* -------------------------------- 执行 -------------------------------- */
function kb(n) { return (n / 1024).toFixed(0) + ' KB'; }

ensure(BUILD); ensure(DIST);

const targets = [
  { dir: 'standalone', provider: 'none', zipName: 'titan-loop-standalone.zip' },
  { dir: 'crazygames', provider: 'crazygames', zipName: 'titan-loop-crazygames.zip' },
  { dir: 'playgama', provider: 'playgama', zipName: 'titan-loop-playgama.zip' }
];

const PLAYGAMA_CONFIG = JSON.stringify({
  platforms: {
    playgama: {},
    crazy_games: {},
    yandex: {},
    msn: {}
  },
  advertisement: {
    interstitial: { minimumDelayBetweenInterstitial: 45 },
    placements: {
      rewarded: ['double_coins', 'revive', 'free_chest', 'daily_double', 'start_amp'],
      interstitial: ['level_start']
    }
  }
}, null, 2);

const report = [];

for (const tgt of targets) {
  const outDir = path.join(BUILD, tgt.dir);
  rmrf(outDir); ensure(outDir);
  const html = makeHtml(tgt.provider);
  fs.writeFileSync(path.join(outDir, 'index.html'), html);

  const entries = [{ name: 'index.html', data: html }];

  if (tgt.provider === 'playgama') {
    fs.writeFileSync(path.join(outDir, 'playgama-bridge-config.json'), PLAYGAMA_CONFIG);
    entries.push({ name: 'playgama-bridge-config.json', data: PLAYGAMA_CONFIG });
  }

  const readme = buildReadme(tgt.provider);
  fs.writeFileSync(path.join(outDir, 'README.txt'), readme);
  entries.push({ name: 'README.txt', data: readme });

  const zipSize = zip(entries, path.join(DIST, tgt.zipName));
  report.push({
    name: tgt.dir,
    html: Buffer.byteLength(html),
    zip: zipSize
  });
}

function buildReadme(provider) {
  const common = [
    'TITAN LOOP — 10 Seconds to Kill a God',
    'build: ' + BUILD_TAG,
    '',
    'Single self-contained index.html. No external assets, no build step, no network required',
    'for the game itself (three.js r160 MIT is inlined).',
    '',
    'All music and sound effects are generated in real time with the Web Audio API.',
    'They are 100% original synthesis — no samples, no third-party recordings —',
    'so the package is clear for commercial use with no attribution required.',
    ''
  ];
  if (provider === 'none') {
    common.push(
      'STANDALONE BUILD',
      '  Double-click index.html. Works offline from the file:// protocol.',
      '  Ad calls fall back to a local placeholder overlay and still grant the reward,',
      '  so every ad-gated feature is testable without a portal.',
      ''
    );
  }
  if (provider === 'crazygames') {
    common.push(
      'CRAZYGAMES BUILD',
      '  SDK: https://sdk.crazygames.com/crazygames-sdk-v3.js (loaded in <head>)',
      '  Implemented: SDK.init({wrapper}), game.loadingStart/loadingStop,',
      '  game.gameplayStart/gameplayStop around every active-play segment,',
      '  game.happytime() on a Titan kill, ad.requestAd("rewarded"|"midgame"),',
      '  banner.requestBanner() for the 300x250 slot on the main menu.',
      '  Audio is muted for the whole duration of every ad and restored on',
      '  adFinished AND adError. No ad is ever requested during active gameplay.',
      '  Upload: zip the contents of this folder (index.html at the zip root).',
      ''
    );
  }
  if (provider === 'playgama') {
    common.push(
      'PLAYGAMA BUILD',
      '  SDK: https://bridge.playgama.com/v1/stable/playgama-bridge.js (loaded in <head>)',
      '  Implemented: bridge.initialize(), platform.sendMessage("game_ready"),',
      '  advertisement.showRewarded/showInterstitial/showBanner,',
      '  REWARDED_STATE_CHANGED (reward granted ONLY on state === "rewarded"),',
      '  INTERSTITIAL_STATE_CHANGED, PAUSE_STATE_CHANGED, AUDIO_STATE_CHANGED,',
      '  setMinimumDelayBetweenInterstitial(45).',
      '  playgama-bridge-config.json is included — edit platform ids before upload.',
      ''
    );
  }
  common.push(
    'AD PLACEMENTS',
    '  main menu      static 300x250 banner',
    '  level complete rewarded — 2x coins',
    '  level failed   rewarded — revive with +3 seconds',
    '  shop           rewarded — free chest (180s cooldown)',
    '  daily bonus    rewarded — double the daily reward',
    '  every 3 levels interstitial, fired from the menu only',
    '',
    'CONTROLS',
    '  Desktop: move the mouse to aim, the gun fires automatically. ESC pauses. M mutes.',
    '  Mobile:  hold and drag anywhere to aim and fire.',
    ''
  );
  return common.join('\n');
}

/* --------------------------- 顺便更新体积账本 -------------------------- */
console.log('\n  TITAN LOOP — build ' + BUILD_TAG + '\n');
for (const r of report) {
  console.log('  ' + r.name.padEnd(12) + ' html ' + kb(r.html).padStart(9) + '   zip ' + kb(r.zip).padStart(9));
}
const total = report.reduce((a, b) => a + b.html + b.zip, 0);
console.log('\n  total artifacts ' + kb(total));
const maxHtml = Math.max(...report.map(r => r.html));
if (maxHtml > 20 * 1024 * 1024) { console.error('\n  ✗ 超过 20MB 上限！'); process.exit(1); }
console.log('  ✓ 每个包都远小于 20MB 上限\n');
