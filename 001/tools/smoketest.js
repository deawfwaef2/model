#!/usr/bin/env node
/* ==========================================================================
   TITAN LOOP — tools/smoketest.js
   Node 里跑真实的 three.js 场景图 + 打桩渲染器，把整个战斗循环空跑一遍。
   捕捉：模块加载错误、关卡搭建错误、每帧更新错误、胜负流程错误、内存泄漏迹象。
   用法： node 001/tools/smoketest.js
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');

/* ------------------------------ 假 DOM ------------------------------ */
function mkCanvas() {
  return {
    width: 256, height: 256, style: {},
    getContext: () => ({
      fillStyle: '', strokeStyle: '', globalAlpha: 1, lineWidth: 1,
      fillRect() {}, strokeRect() {}, clearRect() {}, beginPath() {},
      moveTo() {}, lineTo() {}, stroke() {}, fill() {}, arc() {},
      createLinearGradient: () => ({ addColorStop() {} }),
      getImageData: () => ({ data: new Uint8ClampedArray(4) }),
      putImageData() {}, drawImage() {}, save() {}, restore() {}, translate() {}, rotate() {}
    }),
    addEventListener() {}, removeEventListener() {}
  };
}
function mkEl(tag) {
  const e = {
    tagName: (tag || 'div').toUpperCase(), style: {}, children: [], childNodes: [],
    className: '', id: '', innerHTML: '', textContent: '', dataset: {},
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    appendChild(c) { this.children.push(c); c.parentNode = this; return c; },
    removeChild(c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); return c; },
    insertBefore(c) { this.children.push(c); return c; },
    setAttribute() {}, getAttribute: () => null, removeAttribute() {},
    addEventListener() {}, removeEventListener() {},
    querySelector: () => mkEl('div'), querySelectorAll: () => [],
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 720 }),
    focus() {}, blur() {}, click() {}, contains: () => false, remove() {}
  };
  Object.defineProperty(e, 'firstChild', { get() { return this.children[0]; } });
  return e;
}
const store = {};
const win = {
  innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1,
  navigator: { userAgent: 'node-smoketest', language: 'zh-CN', hardwareConcurrency: 8, vibrate() {} },
  localStorage: {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; }
  },
  matchMedia: () => ({ matches: false, addEventListener() {} }),
  addEventListener() {}, removeEventListener() {},
  requestAnimationFrame: () => 0, cancelAnimationFrame() {},
  setTimeout: (f, ms) => setTimeout(f, ms), clearTimeout, setInterval, clearInterval,
  performance: { now: () => Date.now() },
  console, Math, Date, JSON, parseInt, parseFloat, isNaN, Object, Array, String, Number, Boolean,
  Float32Array, Uint8Array, Uint16Array, Uint32Array, Int32Array, Uint8ClampedArray, ArrayBuffer, DataView,
  Error, TypeError, RangeError, Promise, Map, Set, WeakMap, WeakSet, Symbol, Reflect, Proxy,
  confirm: () => false, alert() {}, location: { reload() {}, href: '' }
};
win.window = win; win.self = win; win.globalThis = win;
win.document = {
  readyState: 'complete', hidden: false, body: mkEl('body'), documentElement: mkEl('html'),
  createElement: t => (t === 'canvas' ? mkCanvas() : mkEl(t)),
  createElementNS: () => mkEl('svg'),
  createTextNode: t => ({ textContent: t }),
  getElementById: () => mkEl('div'),
  querySelector: () => mkEl('div'), querySelectorAll: () => [],
  addEventListener() {}, removeEventListener() {}
};

const ctx = vm.createContext(win);

function run(file, code) {
  try { vm.runInContext(code, ctx, { filename: file }); }
  catch (e) { console.error('\n  ✗ LOAD FAILED: ' + file + '\n  ' + (e && e.stack || e) + '\n'); process.exit(1); }
}

/* --------------------------- 载入 three.js --------------------------- */
run('three.min.js', fs.readFileSync(path.join(ROOT, 'vendor', 'three.min.js'), 'utf8'));
if (!win.THREE) { console.error('  ✗ THREE 未挂到 window'); process.exit(1); }
console.log('  · three.js r' + win.THREE.REVISION + ' loaded');

/* --------------------------- 打桩渲染器 ----------------------------- */
win.THREE.WebGLRenderer = function (opts) {
  this.domElement = (opts && opts.canvas) || mkCanvas();
  this.outputColorSpace = '';
  this.info = { render: { calls: 0, triangles: 0 }, memory: { geometries: 0, textures: 0 } };
  this.setPixelRatio = function () {};
  this.setSize = function () {};
  this.setClearColor = function () {};
  this.render = function (scene, camera) {
    this.info.render.calls++;
    if (scene) scene.updateMatrixWorld(true);
    if (camera) { camera.updateMatrixWorld(true); camera.matrixWorldInverse.copy(camera.matrixWorld).invert(); }
  };
  this.dispose = function () {};
  this.getContext = function () { return {}; };
};

/* ---------------------------- 载入游戏源码 --------------------------- */
['00_core.js', '10_audio.js', '20_ads.js', '30_data.js', '40_world.js', '50_game.js']
  .forEach(f => run(f, fs.readFileSync(path.join(SRC, f), 'utf8')));

const TL = win.TL;
if (!TL) { console.error('  ✗ TL 未定义'); process.exit(1); }
if (!TL.world) { console.error('  ✗ TL.world 未定义（40_world 加载时抛异常？）'); process.exit(1); }
if (!TL.game) { console.error('  ✗ TL.game 未定义'); process.exit(1); }
console.log('  · modules loaded: core/audio/ads/data/world/game');

/* ------------------------------ 初始化 ------------------------------ */
TL.save.load();
TL.setLang('zh');
try { TL.world.init(mkCanvas()); }
catch (e) { console.error('  ✗ world.init 失败\n' + e.stack); process.exit(1); }
console.log('  · world.init ok — scene children: ' + TL.world.scene.children.length);

const W = TL.world, G = TL.game;

/* ------------------------- 会真的瞄准的 AI 玩家 ------------------------- */
const V3 = win.THREE.Vector3;
const aimTmp = new V3();
function botAim(t) {
  // 策略：先吃增幅（复利最高）→ 顺手清近身小兵 → 打轮回核 → 全力打泰坦核心
  const hero = new V3(0, 1.8, 0);
  let target = null;

  // 近身威胁优先（小于 5.5 米的小兵）
  let nearest = null, nd = 1e9;
  for (const g of W.grunts) {
    if (!g.alive) continue;
    const d = g.mesh.position.distanceTo(hero);
    if (d < nd) { nd = d; nearest = g; }
  }
  if (nearest && nd < 5.5) target = nearest.mesh.position;

  if (!target && t < 2.4) {
    const a = W.amps.find(x => x.alive);
    if (a) target = a.mesh.position;
  }
  if (!target && t >= 2.4 && t < 3.3) {
    const c = W.cores.find(x => x.alive);
    if (c) target = c.mesh.position;
  }
  if (!target) {
    const ti = (W.titan && W.titan.alive) ? W.titan : (W.titan2 && W.titan2.alive ? W.titan2 : null);
    if (ti) { ti.core.getWorldPosition(aimTmp); target = aimTmp; }
  }
  if (!target) {
    const any = W.amps.find(x => x.alive) || W.cores.find(x => x.alive) || W.wardens.find(x => x.alive);
    if (any) target = any.mesh.position;
  }
  if (!target) return;
  const s = W.worldToScreen(target);
  if (s.behind) return;
  G.aimScreen.x = s.x; G.aimScreen.y = s.y; G.aimScreen.has = true;
}

/* --------------------------- 逐关空跑测试 --------------------------- */
let failures = 0;
const levelsToTest = [1,2,3,4,5,6,7,8,9,10,12,14,15,16,18,20,22,24,25,26,28,29,30];

function simulate(level, opts) {
  opts = opts || {};
  const label = 'L' + level + (opts.godmode ? ' (godmode)' : opts.maxed ? ' (maxed)' : '');
  try {
    // 给玩家灌一些永久升级，覆盖更多分支
    // 按"预期进度"配置玩家：第 n 关时大约有 (n-1)*0.42 级的永久升级
    const up = opts.maxed ? 12 : Math.min(12, Math.floor((level - 1) * 0.42));
    TL.save.data.upgrades = opts.upgrades === false ? {} : {
      dmg: up, rate: up, crit: Math.min(10, up), hp: Math.min(10, up),
      time: Math.min(8, Math.floor(up * 0.6)), pierce: Math.min(6, Math.floor(up * 0.5)),
      magnet: Math.min(6, Math.floor(up * 0.5)), start: Math.min(4, Math.floor(up * 0.3))
    };
    if (opts.maxed) TL.save.data.weapon = 'void';
    else if (!opts.weapon) TL.save.data.weapon = level < 7 ? 'pulse' : level < 12 ? 'shred' : level < 17 ? 'lance' : level < 23 ? 'storm' : 'void';
    if (opts.weapon) TL.save.data.weapon = opts.weapon;

    G.startLevel(level);
    if (!G.def) throw new Error('def 未生成');

    // 模拟瞄准：轮流指向不同屏幕位置，逼迫 resolveAim 走各种分支
    let frames = 0;
    const dt = 1 / 60;
    const maxFrames = 60 * 26;
    while (frames < maxFrames) {
      frames++;
      botAim(G.elapsed);
      G.pointerDown = true;
      if (opts.godmode) {
        // 直接给巨额伤害，测试胜利流程
        if (W.titan && W.titan.alive && frames > 30) { W.titan.shieldHp = 0; W.titan.hp -= W.titan.maxHp * 0.06; }
        if (W.titan2 && W.titan2.alive && frames > 30) W.titan2.hp -= W.titan2.maxHp * 0.06;
      }
      G.update(dt);
      W.render();
      if (G.result) break;   // result 由 win()/lose() 同步写入；state 切换走 setTimeout
    }
    if (!G.result) throw new Error('26 秒内没有产生结算（state=' + G.state + '）');
    const r = G.result;
    if (!r) throw new Error('result 为空');
    const tag = r.win ? ('WIN  ' + r.stars + '★ ' + r.time.toFixed(2) + 's') : ('LOSE ' + r.reason);
    console.log('    ' + label.padEnd(16) + tag.padEnd(22) +
      'par ' + G.def.par.toFixed(2) + 's  shards+' + r.shards + '  coins+' + r.coins);
    // 回到菜单，验证清理
    G.abandon();
  } catch (e) {
    failures++;
    console.error('    ✗ ' + label + ' → ' + (e && e.stack || e));
  }
}

console.log('\n  === 关卡空跑（自动瞄准 + 全自动开火） ===');
levelsToTest.forEach(n => simulate(n, {}));

console.log('\n  === 胜利流程 / 多武器 ===');
['pulse', 'shred', 'lance', 'storm', 'void'].forEach((w, i) => simulate(3 + i * 4, { godmode: true, upgrades: true, weapon: w }));

console.log('\n  === 满配终局检查（L26-L30，全满级 + 虚空喷流） ===');
[26, 27, 28, 29, 30].forEach(n => simulate(n, { maxed: true }));

console.log('\n  === 续命流程 ===');
try {
  TL.save.data.weapon = 'pulse';
  G.startLevel(7);
  for (let i = 0; i < 60 * 12 && !G.result; i++) { botAim(G.elapsed); G.pointerDown = true; G.update(1 / 60); W.render(); }
  if (G.result && !G.result.win && G.result.canRevive) {
    G.revive();
    for (let i = 0; i < 60 * 8 && !G.result; i++) { botAim(G.elapsed); G.pointerDown = true; G.update(1 / 60); W.render(); }
    console.log('    revive ok → 最终 reason=' + (G.result && G.result.reason) + ' 用时 ' + G.elapsed.toFixed(2) + 's');
  } else console.log('    (本次未触发可续命的失败，跳过)');
  G.abandon();
} catch (e) { failures++; console.error('    ✗ revive → ' + e.stack); }

/* ---------------------------- 数据表体检 ---------------------------- */
console.log('\n  === 数据表体检（par / 血量曲线） ===');
let bad = 0;
for (let n = 1; n <= TL.LEVEL_COUNT; n++) {
  const d = TL.levelDef(n);
  if (!(d.par > 1 && d.par < 12)) { console.error('    ✗ L' + n + ' par 异常 ' + d.par); bad++; }
  if (!(d.hp > 0)) { console.error('    ✗ L' + n + ' hp 异常'); bad++; }
  if (d.amps.length < 1) { console.error('    ✗ L' + n + ' 没有增幅'); bad++; }
}
console.log('    30 关数据 ' + (bad ? '✗ ' + bad + ' 处异常' : '✓ 全部合法'));
failures += bad;

/* ----------------------------- 泄漏检查 ----------------------------- */
console.log('\n  === 场景清理检查 ===');
const before = W.scene.children.length;
for (let i = 0; i < 6; i++) { G.startLevel(5 + i); G.abandon(); }
const after = W.scene.children.length;
console.log('    scene.children ' + before + ' → ' + after + (Math.abs(after - before) > 3 ? '  ✗ 可能泄漏' : '  ✓'));
if (Math.abs(after - before) > 3) failures++;

console.log('\n' + (failures ? '  ✗ 共 ' + failures + ' 处问题\n' : '  ✓ 全部通过\n'));
process.exit(failures ? 1 : 0);
