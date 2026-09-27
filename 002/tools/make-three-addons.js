#!/usr/bin/env node
/* ==========================================================================
   002/tools/make-three-addons.js
   把 three.js r160 的 examples/jsm（ESM）转换成一个经典 <script> 全局脚本。

   为什么要这么干：
     用户要求「下载后双击 index.html 直接能玩」。file:// 协议下
     <script type="module"> 会被 CORS 拦掉，所以不能用 ESM。
     而 r160 的 addons 官方只有 ESM 版本，必须自己转。

   做法：
     1. 收集所有 `import {...} from 'three'` 的符号，在最外层统一
        `const { ... } = THREE;` 一次性解构；
     2. 删掉相对路径 import（因为所有文件会被拼进同一个作用域）；
     3. 把 `export class/function/const` 的 export 关键字去掉，
        `export { A, B };` 整行删掉；
     4. 按依赖顺序拼接，最后把需要的符号挂回 THREE 命名空间。

   用法： node 002/tools/make-three-addons.js <jsm 源目录> <输出文件>
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');

const SRC = process.argv[2] || '/tmp/jsm';
const OUT = process.argv[3] || path.resolve(__dirname, '..', 'lib', 'three-addons.js');

// 依赖顺序很重要：被依赖的排前面
const ORDER = [
  'utils_BufferGeometryUtils.js',
  'utils_SkeletonUtils.js',
  'loaders_GLTFLoader.js',
  'postprocessing_Pass.js',
  'shaders_CopyShader.js',
  'shaders_LuminosityHighPassShader.js',
  'shaders_OutputShader.js',
  'shaders_FXAAShader.js',
  'postprocessing_ShaderPass.js',
  'postprocessing_MaskPass.js',
  'postprocessing_RenderPass.js',
  'postprocessing_EffectComposer.js',
  'postprocessing_UnrealBloomPass.js',
  'postprocessing_OutputPass.js'
];

// 最终要挂到 THREE 上的符号
const EXPOSE = [
  'GLTFLoader', 'EffectComposer', 'RenderPass', 'ShaderPass', 'MaskPass', 'ClearMaskPass',
  'UnrealBloomPass', 'OutputPass', 'CopyShader', 'LuminosityHighPassShader', 'OutputShader',
  'FXAAShader', 'Pass', 'FullScreenQuad',
  'clone', 'mergeGeometries', 'mergeVertices'
];

const threeSymbols = new Set();
const bodies = [];

for (const file of ORDER) {
  const p = path.join(SRC, file);
  if (!fs.existsSync(p)) { console.error('  ✗ 缺少 ' + file); process.exit(1); }
  let code = fs.readFileSync(p, 'utf8');

  // --- 1. 抽取 three 的具名导入 ---
  code = code.replace(/import\s*\{([\s\S]*?)\}\s*from\s*['"]three['"]\s*;?/g, (_, inner) => {
    inner.split(',').forEach(s => {
      const t = s.trim().split(/\s+as\s+/)[0].trim();
      if (t) threeSymbols.add(t);
    });
    return '';
  });

  // --- 2. 删掉相对路径 import（同作用域拼接，不需要） ---
  code = code.replace(/import\s*\{[\s\S]*?\}\s*from\s*['"]\.[^'"]*['"]\s*;?/g, '');
  code = code.replace(/import\s+\w+\s+from\s*['"][^'"]*['"]\s*;?/g, '');

  // --- 3. 去掉 export ---
  code = code.replace(/^\s*export\s*\{[^}]*\}\s*;?\s*$/gm, '');
  code = code.replace(/^\s*export\s+(default\s+)?(class|function|const|let|var|async)/gm, '$2');

  bodies.push('/* ------------------------- ' + file + ' ------------------------- */\n' + code.trim());
}

const syms = [...threeSymbols].sort();
// THREE 里确实存在的才解构，避免 r160 删掉的符号报 undefined（解构 undefined 属性是安全的，
// 但为了可读性还是全量列出）
const header = `/*!
 * TITAN LOOP — three.js r160 addons, bundled as a classic script.
 *
 * Source: three.js examples/jsm  ·  MIT License  ·  https://github.com/mrdoob/three.js
 * Copyright © 2010-2024 three.js authors
 *
 * Converted from ES modules to a global script by 002/tools/make-three-addons.js
 * so the game keeps working when opened straight from the file:// protocol.
 * No functional changes were made to the original code.
 */
(function (global) {
  'use strict';
  var THREE = global.THREE;
  if (!THREE) { console.error('[three-addons] THREE must be loaded first'); return; }
  var ${syms.map(s => s + ' = THREE.' + s).join(',\n      ')};

`;

const footer = `

  /* ------------------------- expose ------------------------- */
${EXPOSE.map(n => `  if (typeof ${n} !== 'undefined') THREE.${n === 'clone' ? 'skeletonClone' : n} = ${n};`).join('\n')}
})(typeof window !== 'undefined' ? window : globalThis);
`;

const out = header + bodies.join('\n\n') + footer;
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, out);
console.log('  ✓ ' + OUT + '  (' + (out.length / 1024).toFixed(0) + ' KB)');
console.log('  · three 符号 ' + syms.length + ' 个: ' + syms.slice(0, 12).join(', ') + ' …');
