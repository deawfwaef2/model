#!/usr/bin/env node
/* ==========================================================================
   002/tools/gen-assets.js
   把 assets/ 下的二进制素材烘焙成可以直接被 <script> 读到的源码。

   为什么：file:// 协议下 fetch() / XMLHttpRequest 全部被浏览器拦截，
   所以模型不能「加载」，只能「内联」。这里生成：

     src/01_fonts.css        —— @font-face，woff2 走 data: URI
     src/05_assets_data.js   —— 模型 base64 + 图标 SVG 源码

   这两个文件是生成物，但**会提交进仓库**，这样开发预览和最终单文件包
   走的是完全相同的代码路径，不存在「开发能跑、打包挂掉」的风险。

   用法： node 002/tools/gen-assets.js
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const A = path.join(ROOT, 'assets');
const SRC = path.join(ROOT, 'src');

/* --------------------------------------------------------------------------
   模型清单 —— 只烘焙真正用得上的，避免白白撑大包体。
   key 是游戏里引用的名字，value 是 assets/models/ 下的相对路径。
   -------------------------------------------------------------------------- */
const KENNEY = [
  // 角色
  'astronauta', 'astronautb', 'alien',
  // 武器（5 把 + 备用）
  'blaster-a', 'blaster-c', 'blaster-f', 'blaster-j', 'blaster-n', 'blaster-q',
  // 敌人
  'enemy-ufo-a', 'enemy-ufo-b', 'enemy-ufo-c', 'enemy-ufo-d',
  'craft-speedera', 'craft-speederb', 'craft-speederc',
  // 目标物
  'turret-single', 'turret-double',
  'gate-complex', 'gate-simple',
  'machine-generator', 'machine-generatorlarge', 'machine-wireless',
  'tower-round-base', 'tower-round-middle-a', 'tower-round-crystals',
  'rock-crystalslargea', 'rock-crystalslargeb', 'rock-crystals',
  'detail-crystal', 'detail-crystal-large', 'spawn-round',
  // 地面 / 建筑模块
  'platform-large', 'platform-long', 'platform-low', 'platform-high', 'platform-center',
  'corridor', 'corridor-roof', 'structure', 'structure-closed', 'structure-detailed',
  'supports-high', 'supports-low', 'stairs', 'rail', 'monorail-tracksupport',
  'pipe-straight', 'pipe-ring', 'pipe-ringhigh', 'pipe-supporthigh',
  // 点缀
  'barrel', 'barrels', 'barrels-rail', 'rover', 'craft-miner',
  'satellitedish-large', 'satellitedish-detailed',
  'rocks-smalla', 'rocks-smallb', 'rock-largea', 'meteor-detailed', 'terrain',
  // 远景剪影
  'hangar-largea', 'hangar-rounda', 'rocket-basea', 'rocket-finsa', 'rocket-topa'
];
const MISC = { titan: 'misc/titan-robot.glb' };

/* --------------------------------------------------------------------------
   字体
   -------------------------------------------------------------------------- */
const FONTS = [
  { file: 'orbitron-latin-900-normal.woff2', family: 'Orbitron', weight: 900 },
  { file: 'orbitron-latin-700-normal.woff2', family: 'Orbitron', weight: 700 },
  { file: 'chakra-petch-latin-700-normal.woff2', family: 'Chakra', weight: 700 },
  { file: 'chakra-petch-latin-500-normal.woff2', family: 'Chakra', weight: 500 },
  { file: 'share-tech-mono-latin-400-normal.woff2', family: 'TechMono', weight: 400 }
];

/* ========================================================================== */

function b64(p) { return fs.readFileSync(p).toString('base64'); }

/* ---- 1. 字体 CSS ---- */
let css = `/* 生成文件 —— 由 tools/gen-assets.js 产出，请勿手工编辑。
   字体：Orbitron / Chakra Petch / Share Tech Mono
   授权：SIL Open Font License 1.1（允许嵌入与商业使用）
   详见 ASSETS.md */\n`;
let fontBytes = 0;
for (const f of FONTS) {
  const p = path.join(A, 'fonts', f.file);
  if (!fs.existsSync(p)) { console.error('  ✗ 缺字体 ' + f.file); process.exit(1); }
  fontBytes += fs.statSync(p).size;
  css += `@font-face{font-family:'${f.family}';font-style:normal;font-weight:${f.weight};font-display:block;`
       + `src:url(data:font/woff2;base64,${b64(p)}) format('woff2')}\n`;
}
fs.writeFileSync(path.join(SRC, '01_fonts.css'), css);

/* ---- 2. 图标：把 SVG 压成单行，并去掉固定描边色以便 CSS 上色 ---- */
const icons = {};
let iconBytes = 0;
for (const f of fs.readdirSync(path.join(A, 'icons')).sort()) {
  if (!f.endsWith('.svg')) continue;
  const p = path.join(A, 'icons', f);
  iconBytes += fs.statSync(p).size;
  icons[f.replace('.svg', '')] = fs.readFileSync(p, 'utf8')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\s*\n\s*/g, ' ')
    .replace(/stroke="currentColor"/g, 'stroke="currentColor"')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/* ---- 3. 模型 base64 ---- */
const models = {};
let rawBytes = 0;
for (const name of KENNEY) {
  const p = path.join(A, 'models', 'kenney', name + '.glb');
  if (!fs.existsSync(p)) { console.error('  ✗ 缺模型 ' + name); process.exit(1); }
  rawBytes += fs.statSync(p).size;
  models[name] = b64(p);
}
for (const key in MISC) {
  const p = path.join(A, 'models', MISC[key]);
  if (!fs.existsSync(p)) { console.error('  ✗ 缺模型 ' + MISC[key]); process.exit(1); }
  rawBytes += fs.statSync(p).size;
  models[key] = b64(p);
}

/* ---- 4. 写出 JS ---- */
let js = `/* 生成文件 —— 由 tools/gen-assets.js 产出，请勿手工编辑。
 *
 * 3D 模型： Kenney（CC0 1.0） + RobotExpressive（Tomás Laulhé / Don McCurdy，CC0 1.0）
 * 图标：    Lucide（ISC License）
 * 完整台账见 ASSETS.md
 *
 * 之所以内联成 base64 而不是外部文件加载，是因为游戏必须支持
 * 「下载后双击 index.html 直接玩」，而 file:// 下 fetch/XHR 会被 CORS 拦死。
 */
(function (g) {
  'use strict';
  var D = g.TL_ASSET_DATA = { models: {}, icons: {} };
`;
js += '\n  /* ---------- 图标（Lucide，ISC） ---------- */\n';
for (const k in icons) js += `  D.icons[${JSON.stringify(k)}] = ${JSON.stringify(icons[k])};\n`;
js += '\n  /* ---------- 模型（GLB，base64） ---------- */\n';
for (const k in models) js += `  D.models[${JSON.stringify(k)}] = "${models[k]}";\n`;
js += '})(typeof window !== "undefined" ? window : globalThis);\n';

fs.writeFileSync(path.join(SRC, '05_assets_data.js'), js);

/* ---- 报告 ---- */
const n = (b) => (b / 1024).toFixed(0) + ' KB';
console.log('  ✓ src/01_fonts.css        ' + n(css.length) + '  (' + FONTS.length + ' 个字重, 原始 ' + n(fontBytes) + ')');
console.log('  ✓ src/05_assets_data.js   ' + n(js.length) + '  (模型 ' + Object.keys(models).length
  + ' 个 / 原始 ' + n(rawBytes) + ', 图标 ' + Object.keys(icons).length + ' 个)');
console.log('  · base64 膨胀后总计约 ' + ((css.length + js.length) / 1048576).toFixed(2) + ' MB（上限 20 MB）');
