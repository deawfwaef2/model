/* ==========================================================================
   TITAN LOOP — 10_audio.js
   100% 程序化音频引擎（Web Audio API 实时合成）
   —— 无任何采样文件：零版权风险、零体积、file:// 可用、可自适应分层
   包含：主控链（压缩+混响+延迟）、自适应分层 BGM、30+ 音效
   ========================================================================== */
(function (root) {
  'use strict';
  var TL = root.TL = root.TL || {};

  var A = TL.audio = {
    ctx: null, ready: false, unlocked: false,
    master: null, musicBus: null, sfxBus: null, revBus: null, delayBus: null,
    duck: 1,            // 平台广告/失焦时压低
    musicOn: true, sfxOn: true,
    intensity: 0,       // 0..1 BGM 强度
    tension: 0,         // 0..1 紧张层（时间快到了）
    palette: 0          // 0/1/2 对应三个 Act，换调式
  };

  var AC = root.AudioContext || root.webkitAudioContext;

  /* ------------------------- 生成混响脉冲响应 ------------------------- */
  function makeImpulse(ctx, seconds, decay, reverse) {
    var rate = ctx.sampleRate, len = Math.max(1, (rate * seconds) | 0);
    var imp = ctx.createBuffer(2, len, rate);
    for (var c = 0; c < 2; c++) {
      var ch = imp.getChannelData(c);
      for (var i = 0; i < len; i++) {
        var n = reverse ? len - i : i;
        ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - n / len, decay);
      }
    }
    return imp;
  }

  /* --------------------------- 生成噪声缓冲 --------------------------- */
  var noiseBuf = null;
  function getNoise(ctx) {
    if (noiseBuf) return noiseBuf;
    var len = ctx.sampleRate * 2;
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    var d = noiseBuf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return noiseBuf;
  }

  /* ------------------------------ 初始化 ------------------------------ */
  A.init = function () {
    if (A.ctx || !AC) return;
    try { A.ctx = new AC(); } catch (e) { console.warn('[audio] no AudioContext'); return; }
    var ctx = A.ctx;

    A.master = ctx.createGain(); A.master.gain.value = 0.9;

    var comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 24; comp.ratio.value = 6;
    comp.attack.value = 0.003; comp.release.value = 0.22;

    // 轻微高切，避免刺耳
    var tame = ctx.createBiquadFilter();
    tame.type = 'highshelf'; tame.frequency.value = 9000; tame.gain.value = -3;

    A.master.connect(comp); comp.connect(tame); tame.connect(ctx.destination);

    A.musicBus = ctx.createGain(); A.musicBus.gain.value = 0.55; A.musicBus.connect(A.master);
    A.sfxBus = ctx.createGain(); A.sfxBus.gain.value = 0.95; A.sfxBus.connect(A.master);

    // 混响送出
    var conv = ctx.createConvolver(); conv.buffer = makeImpulse(ctx, 2.4, 2.6, false);
    A.revBus = ctx.createGain(); A.revBus.gain.value = 0.34;
    A.revBus.connect(conv); conv.connect(A.master);

    // 节拍延迟送出
    var dly = ctx.createDelay(1.0); dly.delayTime.value = 0.375;
    var fb = ctx.createGain(); fb.gain.value = 0.34;
    var dlyLP = ctx.createBiquadFilter(); dlyLP.type = 'lowpass'; dlyLP.frequency.value = 2600;
    A.delayBus = ctx.createGain(); A.delayBus.gain.value = 0.3;
    A.delayBus.connect(dly); dly.connect(dlyLP); dlyLP.connect(fb); fb.connect(dly); dlyLP.connect(A.master);

    A.ready = true;
    applyVolumes();
  };

  function applyVolumes() {
    if (!A.ready) return;
    var t = A.ctx.currentTime;
    A.musicBus.gain.setTargetAtTime((A.musicOn ? 0.55 : 0) * A.duck, t, 0.05);
    A.sfxBus.gain.setTargetAtTime((A.sfxOn ? 0.95 : 0) * A.duck, t, 0.05);
  }
  A.setMusic = function (on) { A.musicOn = !!on; applyVolumes(); };
  A.setSfx = function (on) { A.sfxOn = !!on; applyVolumes(); };
  A.setDuck = function (v) { A.duck = v; applyVolumes(); };

  // 浏览器要求用户手势后才能播放
  A.unlock = function () {
    if (!A.ctx) A.init();
    if (!A.ctx) return;
    if (A.ctx.state === 'suspended') A.ctx.resume();
    if (!A.unlocked) {
      A.unlocked = true;
      // 播放一个静音 buffer 解锁 iOS
      try {
        var b = A.ctx.createBuffer(1, 1, 22050);
        var s = A.ctx.createBufferSource(); s.buffer = b; s.connect(A.ctx.destination); s.start(0);
      } catch (e) {}
    }
  };
  A.suspend = function () { if (A.ctx && A.ctx.state === 'running') A.ctx.suspend(); };
  A.resume = function () { if (A.ctx && A.ctx.state === 'suspended') A.ctx.resume(); };

  /* --------------------------- 合成基础构件 --------------------------- */
  function now() { return A.ctx.currentTime; }

  // 单个振荡器音符
  function tone(opt) {
    if (!A.ready || !A.sfxOn) return;
    var ctx = A.ctx, t0 = opt.t !== undefined ? opt.t : now();
    var o = ctx.createOscillator();
    o.type = opt.type || 'sine';
    var f0 = opt.f || 440, f1 = opt.f1 !== undefined ? opt.f1 : f0;
    o.frequency.setValueAtTime(f0, t0);
    if (f1 !== f0) {
      if (opt.expo === false) o.frequency.linearRampToValueAtTime(f1, t0 + (opt.d || 0.2));
      else o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + (opt.d || 0.2));
    }
    if (opt.detune) o.detune.value = opt.detune;

    var g = ctx.createGain();
    var peak = (opt.g === undefined ? 0.3 : opt.g);
    var atk = opt.a === undefined ? 0.004 : opt.a;
    var dur = opt.d === undefined ? 0.2 : opt.d;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    var node = o;
    if (opt.filter) {
      var bq = ctx.createBiquadFilter();
      bq.type = opt.filter; bq.frequency.setValueAtTime(opt.ff || 1200, t0);
      if (opt.ff1) bq.frequency.exponentialRampToValueAtTime(Math.max(20, opt.ff1), t0 + dur);
      bq.Q.value = opt.q || 1;
      node.connect(bq); node = bq;
    }
    node.connect(g);
    g.connect(opt.bus || A.sfxBus);
    if (opt.rev) { var rg = ctx.createGain(); rg.gain.value = opt.rev; g.connect(rg); rg.connect(A.revBus); }
    if (opt.dly) { var dg = ctx.createGain(); dg.gain.value = opt.dly; g.connect(dg); dg.connect(A.delayBus); }
    o.start(t0); o.stop(t0 + dur + 0.05);
    return o;
  }

  // 噪声
  function noise(opt) {
    if (!A.ready || !A.sfxOn) return;
    var ctx = A.ctx, t0 = opt.t !== undefined ? opt.t : now();
    var s = ctx.createBufferSource(); s.buffer = getNoise(ctx);
    s.playbackRate.value = opt.rate || 1;
    var bq = ctx.createBiquadFilter();
    bq.type = opt.filter || 'bandpass';
    bq.frequency.setValueAtTime(opt.f || 1400, t0);
    if (opt.f1) bq.frequency.exponentialRampToValueAtTime(Math.max(30, opt.f1), t0 + (opt.d || 0.15));
    bq.Q.value = opt.q || 1;
    var g = ctx.createGain();
    var peak = opt.g === undefined ? 0.25 : opt.g, dur = opt.d === undefined ? 0.15 : opt.d;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + (opt.a === undefined ? 0.002 : opt.a));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(bq); bq.connect(g); g.connect(opt.bus || A.sfxBus);
    if (opt.rev) { var rg = ctx.createGain(); rg.gain.value = opt.rev; g.connect(rg); rg.connect(A.revBus); }
    s.start(t0, Math.random() * 1.0); s.stop(t0 + dur + 0.05);
  }

  /* ------------------------------- 音效库 ------------------------------ */
  var lastShot = 0;
  var SFX = {
    // —— 射击：噪声爆 + 下滑方波，层叠出"啪"的质感
    shoot: function (pitch) {
      var t = now();
      if (t - lastShot < 0.012) return; lastShot = t;
      pitch = pitch || 1;
      noise({ f: 2600 * pitch, f1: 500, d: 0.075, g: 0.16, filter: 'bandpass', q: 1.2 });
      tone({ type: 'square', f: 520 * pitch, f1: 130, d: 0.07, g: 0.11, filter: 'lowpass', ff: 3000 });
      tone({ type: 'sine', f: 150, f1: 60, d: 0.06, g: 0.13 });
    },
    shootHeavy: function () {
      noise({ f: 1500, f1: 200, d: 0.16, g: 0.24, filter: 'lowpass', q: 0.8 });
      tone({ type: 'sawtooth', f: 260, f1: 48, d: 0.18, g: 0.2, filter: 'lowpass', ff: 2200, ff1: 300 });
      tone({ type: 'sine', f: 110, f1: 40, d: 0.22, g: 0.22 });
    },
    hit: function (v) {
      v = v || 1;
      noise({ f: 3200, f1: 900, d: 0.05, g: 0.1 * v, filter: 'highpass' });
      tone({ type: 'triangle', f: 900, f1: 420, d: 0.05, g: 0.08 * v });
    },
    crit: function () {
      noise({ f: 5200, f1: 1200, d: 0.09, g: 0.16, filter: 'bandpass', q: 2 });
      tone({ type: 'square', f: 1760, f1: 880, d: 0.1, g: 0.11, rev: 0.2 });
      tone({ type: 'sine', f: 2640, f1: 1320, d: 0.12, g: 0.07, rev: 0.25 });
    },
    kill: function () {
      noise({ f: 900, f1: 90, d: 0.3, g: 0.26, filter: 'lowpass', q: 0.6, rev: 0.25 });
      tone({ type: 'sine', f: 180, f1: 34, d: 0.34, g: 0.26 });
      tone({ type: 'sawtooth', f: 400, f1: 60, d: 0.2, g: 0.1, filter: 'lowpass', ff: 1800, ff1: 200 });
    },
    bigExplosion: function () {
      noise({ f: 700, f1: 50, d: 0.9, g: 0.4, filter: 'lowpass', q: 0.5, rev: 0.6 });
      tone({ type: 'sine', f: 120, f1: 24, d: 1.1, g: 0.4 });
      tone({ type: 'sawtooth', f: 240, f1: 30, d: 0.6, g: 0.16, filter: 'lowpass', ff: 1400, ff1: 100 });
      noise({ f: 5000, f1: 800, d: 0.35, g: 0.18, filter: 'highpass', t: now() + 0.02 });
    },
    // —— 增幅：明亮上行琶音，"变强了"的正反馈
    amp: function (n) {
      n = n || 0;
      var base = 523.25 * Math.pow(2, Math.min(n, 6) / 12);
      var t = now();
      [0, 4, 7, 12].forEach(function (semi, i) {
        tone({ type: 'triangle', f: base * Math.pow(2, semi / 12), d: 0.3, g: 0.14, t: t + i * 0.045, rev: 0.35, dly: 0.2 });
        tone({ type: 'sine', f: base * 2 * Math.pow(2, semi / 12), d: 0.22, g: 0.06, t: t + i * 0.045 });
      });
      noise({ f: 6000, f1: 2500, d: 0.2, g: 0.08, filter: 'highpass' });
    },
    // —— 轮回核：空灵的水晶碎裂 + 上升
    core: function () {
      var t = now();
      noise({ f: 7000, f1: 2000, d: 0.28, g: 0.14, filter: 'bandpass', q: 3, rev: 0.5 });
      [0, 7, 12, 19].forEach(function (semi, i) {
        tone({ type: 'sine', f: 659.25 * Math.pow(2, semi / 12), d: 0.6, g: 0.11, t: t + i * 0.055, rev: 0.6, dly: 0.35 });
      });
      tone({ type: 'sine', f: 82, f1: 164, d: 0.5, g: 0.16, t: t });
    },
    coin: function (n) {
      n = n || 0;
      var f = 1046 * Math.pow(2, Math.min(n, 12) / 24);
      tone({ type: 'square', f: f, d: 0.06, g: 0.08 });
      tone({ type: 'square', f: f * 1.5, d: 0.1, g: 0.06, t: now() + 0.04, rev: 0.15 });
    },
    hurt: function () {
      noise({ f: 400, f1: 80, d: 0.25, g: 0.3, filter: 'lowpass' });
      tone({ type: 'sawtooth', f: 200, f1: 55, d: 0.3, g: 0.2, filter: 'lowpass', ff: 900, ff1: 160 });
    },
    shieldBreak: function () {
      var t = now();
      noise({ f: 4000, f1: 700, d: 0.45, g: 0.3, filter: 'bandpass', q: 1.5, rev: 0.5 });
      for (var i = 0; i < 5; i++) tone({ type: 'triangle', f: 1200 + Math.random() * 2200, f1: 300, d: 0.25, g: 0.07, t: t + i * 0.025, rev: 0.4 });
    },
    titanStep: function () {
      tone({ type: 'sine', f: 62, f1: 26, d: 0.65, g: 0.5, rev: 0.35 });
      noise({ f: 180, f1: 45, d: 0.4, g: 0.2, filter: 'lowpass' });
      noise({ f: 3000, f1: 900, d: 0.14, g: 0.05, filter: 'highpass' });
    },
    titanRoar: function () {
      var t = now();
      tone({ type: 'sawtooth', f: 84, f1: 44, d: 1.6, g: 0.3, filter: 'lowpass', ff: 700, ff1: 200, rev: 0.7 });
      tone({ type: 'sawtooth', f: 84 * 1.007, f1: 44, d: 1.6, g: 0.22, filter: 'lowpass', ff: 520, rev: 0.7, t: t + 0.01 });
      tone({ type: 'square', f: 41, f1: 21, d: 1.8, g: 0.3 });
      noise({ f: 900, f1: 180, d: 1.2, g: 0.13, filter: 'bandpass', q: 0.7, rev: 0.6 });
    },
    beep: function (i) {
      tone({ type: 'square', f: 880 + i * 120, d: 0.1, g: 0.14, rev: 0.2 });
      tone({ type: 'sine', f: 1760 + i * 240, d: 0.08, g: 0.06 });
    },
    go: function () {
      var t = now();
      [0, 5, 12].forEach(function (s, i) { tone({ type: 'square', f: 523 * Math.pow(2, s / 12), d: 0.3, g: 0.16, t: t + i * 0.05, rev: 0.3 }); });
      noise({ f: 2000, f1: 200, d: 0.4, g: 0.18, filter: 'lowpass' });
    },
    win: function () {
      var t = now();
      var seq = [0, 4, 7, 12, 16, 19, 24];
      seq.forEach(function (s, i) {
        tone({ type: 'triangle', f: 261.6 * Math.pow(2, s / 12), d: 0.55, g: 0.15, t: t + i * 0.075, rev: 0.45, dly: 0.25 });
        tone({ type: 'square', f: 261.6 * Math.pow(2, s / 12) * 2, d: 0.3, g: 0.05, t: t + i * 0.075 });
      });
      tone({ type: 'sine', f: 65.4, d: 1.6, g: 0.3, t: t });
      noise({ f: 8000, f1: 2000, d: 0.8, g: 0.09, filter: 'highpass', t: t + 0.3 });
    },
    lose: function () {
      var t = now();
      [0, -2, -5, -12].forEach(function (s, i) {
        tone({ type: 'sawtooth', f: 220 * Math.pow(2, s / 12), d: 0.9, g: 0.16, t: t + i * 0.13, filter: 'lowpass', ff: 1400, ff1: 250, rev: 0.5 });
      });
      tone({ type: 'sine', f: 55, f1: 28, d: 2.0, g: 0.3, t: t });
      noise({ f: 600, f1: 60, d: 1.4, g: 0.14, filter: 'lowpass', t: t });
    },
    star: function (i) {
      var f = [784, 988, 1319][Math.min(i, 2)];
      tone({ type: 'triangle', f: f, d: 0.45, g: 0.18, rev: 0.5, dly: 0.2 });
      tone({ type: 'sine', f: f * 2, d: 0.3, g: 0.08 });
      noise({ f: 7000, f1: 3000, d: 0.25, g: 0.07, filter: 'highpass' });
    },
    click: function () {
      tone({ type: 'square', f: 1200, f1: 700, d: 0.05, g: 0.1, filter: 'lowpass', ff: 4000 });
      noise({ f: 3500, f1: 1500, d: 0.035, g: 0.05, filter: 'highpass' });
    },
    hover: function () { tone({ type: 'sine', f: 1500, d: 0.04, g: 0.035 }); },
    deny: function () {
      tone({ type: 'square', f: 200, f1: 130, d: 0.16, g: 0.14, filter: 'lowpass', ff: 900 });
      tone({ type: 'square', f: 150, f1: 100, d: 0.2, g: 0.1, t: now() + 0.07 });
    },
    upgrade: function () {
      var t = now();
      [0, 7, 12, 16, 19].forEach(function (s, i) { tone({ type: 'triangle', f: 392 * Math.pow(2, s / 12), d: 0.45, g: 0.14, t: t + i * 0.055, rev: 0.4, dly: 0.2 }); });
      noise({ f: 5000, f1: 1200, d: 0.4, g: 0.1, filter: 'bandpass', q: 1.5 });
    },
    chest: function () {
      var t = now();
      noise({ f: 1200, f1: 300, d: 0.25, g: 0.18, filter: 'lowpass' });
      [0, 4, 7, 12, 19, 24].forEach(function (s, i) { tone({ type: 'triangle', f: 523 * Math.pow(2, s / 12), d: 0.6, g: 0.13, t: t + 0.12 + i * 0.06, rev: 0.5, dly: 0.3 }); });
    },
    combo: function (n) {
      var f = 440 * Math.pow(2, Math.min(n, 16) / 12);
      tone({ type: 'square', f: f, d: 0.09, g: 0.07, rev: 0.2 });
    },
    whoosh: function () { noise({ f: 300, f1: 3000, d: 0.3, g: 0.1, filter: 'bandpass', q: 0.8, a: 0.12 }); },
    heartbeat: function () {
      var t = now();
      tone({ type: 'sine', f: 58, f1: 34, d: 0.16, g: 0.34, t: t });
      tone({ type: 'sine', f: 52, f1: 30, d: 0.2, g: 0.26, t: t + 0.17 });
    },
    slowmo: function () { noise({ f: 2000, f1: 120, d: 0.7, g: 0.12, filter: 'lowpass', q: 2 }); },
    levelUnlock: function () {
      var t = now();
      [0, 12, 19, 24].forEach(function (s, i) { tone({ type: 'sine', f: 330 * Math.pow(2, s / 12), d: 0.7, g: 0.13, t: t + i * 0.08, rev: 0.6, dly: 0.35 }); });
    }
  };

  A.play = function (name, arg) {
    if (!A.ready || !A.sfxOn) return;
    if (A.ctx.state === 'suspended') return;
    var f = SFX[name]; if (f) { try { f(arg); } catch (e) {} }
  };

  /* ======================================================================
     自适应分层 BGM —— 暗黑合成器 / 工业金属风
     结构：kick, sub-bass, hat, snare, arp, pad, tension riser
     intensity 决定层数；tension 决定紧张层与调式紧缩
     ====================================================================== */
  var SCALES = [
    [0, 3, 5, 7, 10],   // Act1 小调五声 (Aeolian pent)
    [0, 2, 3, 7, 8],    // Act2 异域感
    [0, 1, 5, 6, 10]    // Act3 虚空/不协和
  ];
  var ROOTS = [55.0, 58.27, 51.91]; // A1 / Bb1 / G#1

  var seq = {
    playing: false, step: 0, next: 0, bpm: 132, timer: null
  };
  A.music = seq;

  function scheduleStep(t) {
    var s = seq.step;
    var inten = A.intensity, tens = A.tension;
    var root = ROOTS[A.palette] || ROOTS[0];
    var scale = SCALES[A.palette] || SCALES[0];
    var bus = A.musicBus;
    if (!A.musicOn) return;

    var mg = function (v) { return v; };

    /* --- KICK：四四拍 --- */
    if (s % 4 === 0) {
      var o = A.ctx.createOscillator(), g = A.ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(150, t);
      o.frequency.exponentialRampToValueAtTime(40, t + 0.11);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(mg(0.75), t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
      o.connect(g); g.connect(bus); o.start(t); o.stop(t + 0.35);
      // 咔哒层
      var n = A.ctx.createBufferSource(); n.buffer = getNoise(A.ctx);
      var nf = A.ctx.createBiquadFilter(); nf.type = 'lowpass'; nf.frequency.value = 3000;
      var ng = A.ctx.createGain();
      ng.gain.setValueAtTime(0.25, t); ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.035);
      n.connect(nf); nf.connect(ng); ng.connect(bus); n.start(t, Math.random()); n.stop(t + 0.05);
    }
    // 副踢（强度高时）
    if (inten > 0.45 && (s % 16 === 10 || s % 16 === 14)) {
      var o2 = A.ctx.createOscillator(), g2 = A.ctx.createGain();
      o2.type = 'sine'; o2.frequency.setValueAtTime(120, t); o2.frequency.exponentialRampToValueAtTime(42, t + 0.09);
      g2.gain.setValueAtTime(0.5, t); g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
      o2.connect(g2); g2.connect(bus); o2.start(t); o2.stop(t + 0.25);
    }

    /* --- SNARE / CLAP --- */
    if (inten > 0.18 && s % 8 === 4) {
      var sn = A.ctx.createBufferSource(); sn.buffer = getNoise(A.ctx);
      var sf = A.ctx.createBiquadFilter(); sf.type = 'bandpass'; sf.frequency.value = 1900; sf.Q.value = 0.8;
      var sg = A.ctx.createGain();
      sg.gain.setValueAtTime(0.0001, t); sg.gain.linearRampToValueAtTime(0.4, t + 0.003);
      sg.gain.exponentialRampToValueAtTime(0.0001, t + 0.19);
      sn.connect(sf); sf.connect(sg); sg.connect(bus);
      var rv = A.ctx.createGain(); rv.gain.value = 0.3; sg.connect(rv); rv.connect(A.revBus);
      sn.start(t, Math.random()); sn.stop(t + 0.22);
      var sb = A.ctx.createOscillator(), sbg = A.ctx.createGain();
      sb.type = 'triangle'; sb.frequency.setValueAtTime(220, t); sb.frequency.exponentialRampToValueAtTime(130, t + 0.08);
      sbg.gain.setValueAtTime(0.2, t); sbg.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
      sb.connect(sbg); sbg.connect(bus); sb.start(t); sb.stop(t + 0.15);
    }

    /* --- HAT --- */
    if (inten > 0.3 && s % 2 === 1) {
      var h = A.ctx.createBufferSource(); h.buffer = getNoise(A.ctx);
      var hf = A.ctx.createBiquadFilter(); hf.type = 'highpass'; hf.frequency.value = 7800;
      var hg = A.ctx.createGain();
      var open = (s % 8 === 7) && inten > 0.6;
      hg.gain.setValueAtTime(open ? 0.13 : 0.085, t);
      hg.gain.exponentialRampToValueAtTime(0.0001, t + (open ? 0.19 : 0.045));
      h.connect(hf); hf.connect(hg); hg.connect(bus); h.start(t, Math.random()); h.stop(t + 0.22);
    }

    /* --- BASS：切分低音 --- */
    if (s % 2 === 0 || (inten > 0.55 && s % 4 === 3)) {
      var pat = [0, 0, 0, 3, 0, 0, 5, 3];
      var semi = scale[0] + pat[(s / 2 | 0) % 8];
      var bf = root * Math.pow(2, semi / 12);
      var bo = A.ctx.createOscillator(), bo2 = A.ctx.createOscillator(), bg = A.ctx.createGain();
      var blp = A.ctx.createBiquadFilter(); blp.type = 'lowpass';
      blp.frequency.setValueAtTime(320 + inten * 900 + tens * 700, t);
      blp.frequency.exponentialRampToValueAtTime(180, t + 0.3);
      blp.Q.value = 6;
      bo.type = 'sawtooth'; bo.frequency.value = bf;
      bo2.type = 'square'; bo2.frequency.value = bf * 0.5;
      bg.gain.setValueAtTime(0.0001, t);
      bg.gain.linearRampToValueAtTime(0.3 + inten * 0.12, t + 0.008);
      bg.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
      bo.connect(blp); bo2.connect(blp); blp.connect(bg); bg.connect(bus);
      bo.start(t); bo.stop(t + 0.32); bo2.start(t); bo2.stop(t + 0.32);
    }

    /* --- ARP：16 分琶音 --- */
    if (inten > 0.42) {
      var idx = (s * 3) % scale.length;
      var oct = 3 + (((s / 4) | 0) % 2);
      var af = root * Math.pow(2, oct) * Math.pow(2, scale[idx] / 12) / 4;
      var ao = A.ctx.createOscillator(), ag = A.ctx.createGain();
      ao.type = inten > 0.75 ? 'sawtooth' : 'square';
      ao.frequency.value = af;
      var alp = A.ctx.createBiquadFilter(); alp.type = 'lowpass';
      alp.frequency.value = 900 + inten * 3200; alp.Q.value = 3;
      ag.gain.setValueAtTime(0.0001, t);
      ag.gain.linearRampToValueAtTime(0.055 + inten * 0.05, t + 0.005);
      ag.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
      ao.connect(alp); alp.connect(ag); ag.connect(bus);
      var adl = A.ctx.createGain(); adl.gain.value = 0.28; ag.connect(adl); adl.connect(A.delayBus);
      ao.start(t); ao.stop(t + 0.18);
    }

    /* --- PAD：每小节一次 --- */
    if (s % 16 === 0) {
      var pn = [0, 3, 7][((s / 16) | 0) % 3];
      for (var v = 0; v < 3; v++) {
        var po = A.ctx.createOscillator(), pg = A.ctx.createGain();
        po.type = 'sawtooth';
        po.frequency.value = root * 4 * Math.pow(2, (scale[0] + pn + [0, 7, 12][v]) / 12);
        po.detune.value = (v - 1) * 9;
        var plp = A.ctx.createBiquadFilter(); plp.type = 'lowpass';
        plp.frequency.setValueAtTime(400, t);
        plp.frequency.linearRampToValueAtTime(700 + inten * 1400, t + 1.2);
        pg.gain.setValueAtTime(0.0001, t);
        pg.gain.linearRampToValueAtTime(0.045 + inten * 0.02, t + 0.9);
        pg.gain.exponentialRampToValueAtTime(0.0001, t + 3.4);
        po.connect(plp); plp.connect(pg); pg.connect(bus);
        var prv = A.ctx.createGain(); prv.gain.value = 0.7; pg.connect(prv); prv.connect(A.revBus);
        po.start(t); po.stop(t + 3.5);
      }
    }

    /* --- TENSION RISER：最后几秒 --- */
    if (tens > 0.05 && s % 8 === 0) {
      var ro = A.ctx.createOscillator(), rg2 = A.ctx.createGain();
      ro.type = 'sawtooth';
      ro.frequency.setValueAtTime(root * 2, t);
      ro.frequency.exponentialRampToValueAtTime(root * 2 * (2 + tens * 4), t + 1.6);
      var rlp = A.ctx.createBiquadFilter(); rlp.type = 'bandpass'; rlp.Q.value = 7;
      rlp.frequency.setValueAtTime(400, t); rlp.frequency.exponentialRampToValueAtTime(4000, t + 1.6);
      rg2.gain.setValueAtTime(0.0001, t);
      rg2.gain.linearRampToValueAtTime(0.05 * tens, t + 1.2);
      rg2.gain.exponentialRampToValueAtTime(0.0001, t + 1.75);
      ro.connect(rlp); rlp.connect(rg2); rg2.connect(bus);
      ro.start(t); ro.stop(t + 1.8);
    }

    seq.step = (s + 1) % 64;
  }

  function pump() {
    if (!seq.playing || !A.ready) return;
    var spb = 60 / seq.bpm / 4; // 16 分音符
    var t = A.ctx.currentTime;
    while (seq.next < t + 0.18) {
      if (seq.next < t) seq.next = t + 0.02;
      scheduleStep(seq.next);
      seq.next += spb;
    }
  }

  A.startMusic = function (intensity, palette) {
    if (!A.ready) return;
    A.intensity = intensity === undefined ? 0.5 : intensity;
    if (palette !== undefined) A.palette = palette;
    if (seq.playing) return;
    seq.playing = true; seq.step = 0; seq.next = A.ctx.currentTime + 0.08;
    if (seq.timer) clearInterval(seq.timer);
    seq.timer = setInterval(pump, 45);
    pump();
  };
  A.stopMusic = function () {
    seq.playing = false;
    if (seq.timer) { clearInterval(seq.timer); seq.timer = null; }
  };
  A.setIntensity = function (v) { A.intensity = M0(v); };
  A.setTension = function (v) { A.tension = M0(v); };
  A.setPalette = function (p) { A.palette = p | 0; };
  A.setBpm = function (b) { seq.bpm = b; };
  function M0(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

})(typeof window !== 'undefined' ? window : this);
