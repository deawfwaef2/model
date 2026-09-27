/* =============================================================================
 *  ZOMBIE RUSH 3D — Procedural Audio Engine
 *  -----------------------------------------------------------------------
 *  100% original real-time Web Audio synthesis.
 *  NO third-party samples. NO external files. 0 bytes of payload.
 *  => Fully cleared for commercial use (CrazyGames / Playgama / itch / any).
 *
 *  Features:
 *   - Master chain: bus -> compressor -> limiter-ish -> destination
 *   - Generated convolution reverb + tempo-synced stereo delay
 *   - Adaptive layered soundtrack (calm / combat / horde / boss)
 *   - 25+ synthesized SFX voices with randomized variation (no ear fatigue)
 * ========================================================================== */
(function (global) {
  'use strict';

  var AE = {};
  var ctx = null;
  var ready = false;
  var nodes = {};
  var noiseBuf = null;
  var enabledSfx = true;
  var enabledMusic = true;

  /* ------------------------------------------------------------------ utils */
  function now() { return ctx ? ctx.currentTime : 0; }
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  function makeNoiseBuffer() {
    var len = ctx.sampleRate * 2;
    var b = ctx.createBuffer(1, len, ctx.sampleRate);
    var d = b.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }

  function noiseSrc() {
    var s = ctx.createBufferSource();
    s.buffer = noiseBuf;
    s.loop = true;
    s.playbackRate.value = rnd(0.9, 1.1);
    return s;
  }

  function makeImpulse(seconds, decay, reverse) {
    var rate = ctx.sampleRate;
    var len = Math.max(1, Math.floor(rate * seconds));
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

  function env(param, t, peak, attack, decay, sustain, susLevel, release) {
    param.cancelScheduledValues(t);
    param.setValueAtTime(0.0001, t);
    param.exponentialRampToValueAtTime(Math.max(0.0001, peak), t + attack);
    param.exponentialRampToValueAtTime(Math.max(0.0001, peak * susLevel), t + attack + decay);
    param.setValueAtTime(Math.max(0.0001, peak * susLevel), t + attack + decay + sustain);
    param.exponentialRampToValueAtTime(0.0001, t + attack + decay + sustain + release);
  }

  /* --------------------------------------------------------------- init */
  AE.init = function () {
    if (ready) { if (ctx.state === 'suspended') ctx.resume(); return true; }
    var AC = global.AudioContext || global.webkitAudioContext;
    if (!AC) return false;
    try { ctx = new AC(); } catch (e) { return false; }

    noiseBuf = makeNoiseBuffer();

    // master chain
    nodes.master = ctx.createGain();
    nodes.master.gain.value = 0.85;

    nodes.comp = ctx.createDynamicsCompressor();
    nodes.comp.threshold.value = -14;
    nodes.comp.knee.value = 24;
    nodes.comp.ratio.value = 6;
    nodes.comp.attack.value = 0.004;
    nodes.comp.release.value = 0.18;

    nodes.master.connect(nodes.comp);
    nodes.comp.connect(ctx.destination);

    // buses
    nodes.sfx = ctx.createGain(); nodes.sfx.gain.value = enabledSfx ? 0.95 : 0; nodes.sfx.connect(nodes.master);
    nodes.music = ctx.createGain(); nodes.music.gain.value = enabledMusic ? 0.55 : 0; nodes.music.connect(nodes.master);

    // reverb send
    nodes.verb = ctx.createConvolver();
    nodes.verb.buffer = makeImpulse(2.6, 2.6, false);
    nodes.verbGain = ctx.createGain(); nodes.verbGain.gain.value = 0.5;
    nodes.verb.connect(nodes.verbGain);
    nodes.verbGain.connect(nodes.master);
    nodes.verbSend = ctx.createGain(); nodes.verbSend.gain.value = 1;
    nodes.verbSend.connect(nodes.verb);

    // tempo delay send
    nodes.dly = ctx.createDelay(1.5);
    nodes.dly.delayTime.value = 60 / 148 * 0.75;
    nodes.dlyFb = ctx.createGain(); nodes.dlyFb.gain.value = 0.34;
    nodes.dlyFilt = ctx.createBiquadFilter();
    nodes.dlyFilt.type = 'bandpass'; nodes.dlyFilt.frequency.value = 1400; nodes.dlyFilt.Q.value = 0.6;
    nodes.dlyOut = ctx.createGain(); nodes.dlyOut.gain.value = 0.34;
    nodes.dly.connect(nodes.dlyFilt);
    nodes.dlyFilt.connect(nodes.dlyFb);
    nodes.dlyFb.connect(nodes.dly);
    nodes.dlyFilt.connect(nodes.dlyOut);
    nodes.dlyOut.connect(nodes.master);
    nodes.dlySend = ctx.createGain(); nodes.dlySend.gain.value = 1;
    nodes.dlySend.connect(nodes.dly);

    // music layer gains
    ML.base = ctx.createGain(); ML.base.gain.value = 0.0; ML.base.connect(nodes.music);
    ML.drums = ctx.createGain(); ML.drums.gain.value = 0.0; ML.drums.connect(nodes.music);
    ML.combat = ctx.createGain(); ML.combat.gain.value = 0.0; ML.combat.connect(nodes.music);
    ML.horde = ctx.createGain(); ML.horde.gain.value = 0.0; ML.horde.connect(nodes.music);

    ready = true;
    if (ctx.state === 'suspended') ctx.resume();
    return true;
  };

  AE.resume = function () { if (ctx && ctx.state === 'suspended') ctx.resume(); };
  AE.isReady = function () { return ready; };
  AE.setSfxEnabled = function (v) { enabledSfx = !!v; if (ready) nodes.sfx.gain.value = v ? 0.95 : 0; };
  AE.setMusicEnabled = function (v) {
    enabledMusic = !!v;
    if (ready) nodes.music.gain.setTargetAtTime(v ? 0.55 : 0, now(), 0.15);
  };
  AE.setMasterVolume = function (v) { if (ready) nodes.master.gain.value = clamp(v, 0, 1); };

  /* --------------------------------------------------------- voice helpers */
  function osc(type, freq, t) {
    var o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    return o;
  }

  function play(node, gain, t, dur, sendVerb, sendDly) {
    node.connect(gain);
    gain.connect(nodes.sfx);
    if (sendVerb) { var v = ctx.createGain(); v.gain.value = sendVerb; gain.connect(v); v.connect(nodes.verbSend); }
    if (sendDly) { var d = ctx.createGain(); d.gain.value = sendDly; gain.connect(d); d.connect(nodes.dlySend); }
    node.start(t);
    node.stop(t + dur);
  }

  /* ================================================================== SFX */
  var lastShot = 0;
  AE.shoot = function (power) {
    if (!ready || !enabledSfx) return;
    var t = now();
    if (t - lastShot < 0.018) return;
    lastShot = t;
    power = power || 1;

    // body: pitch-crashing square
    var o = osc('square', rnd(300, 380) * (1 + power * 0.06), t);
    o.frequency.exponentialRampToValueAtTime(58, t + 0.07);
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.30, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.10);
    play(o, g, t, 0.12, 0.05, 0);

    // crack: filtered noise
    var n = noiseSrc();
    var bp = ctx.createBiquadFilter();
    bp.type = 'highpass'; bp.frequency.setValueAtTime(rnd(1100, 1700), t);
    bp.frequency.exponentialRampToValueAtTime(320, t + 0.09);
    var ng = ctx.createGain();
    ng.gain.setValueAtTime(0.0001, t);
    ng.gain.exponentialRampToValueAtTime(0.34, t + 0.002);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.085);
    n.connect(bp); bp.connect(ng); ng.connect(nodes.sfx);
    var nv = ctx.createGain(); nv.gain.value = 0.12; ng.connect(nv); nv.connect(nodes.verbSend);
    n.start(t); n.stop(t + 0.1);

    // sub thump for weight
    var s = osc('sine', 120, t);
    s.frequency.exponentialRampToValueAtTime(40, t + 0.08);
    var sg = ctx.createGain();
    sg.gain.setValueAtTime(0.0001, t);
    sg.gain.exponentialRampToValueAtTime(0.22, t + 0.004);
    sg.gain.exponentialRampToValueAtTime(0.0001, t + 0.10);
    play(s, sg, t, 0.11, 0, 0);
  };

  AE.laser = function () {
    if (!ready || !enabledSfx) return;
    var t = now();
    var o = osc('sawtooth', 1500, t);
    o.frequency.exponentialRampToValueAtTime(240, t + 0.13);
    var f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 7;
    f.frequency.setValueAtTime(2400, t);
    f.frequency.exponentialRampToValueAtTime(400, t + 0.13);
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.22, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    o.connect(f); f.connect(g); g.connect(nodes.sfx);
    var d = ctx.createGain(); d.gain.value = 0.25; g.connect(d); d.connect(nodes.dlySend);
    o.start(t); o.stop(t + 0.18);
  };

  AE.shell = function () {
    if (!ready || !enabledSfx) return;
    var t = now() + rnd(0.18, 0.3);
    for (var i = 0; i < 2; i++) {
      var tt = t + i * rnd(0.05, 0.11);
      var o = osc('triangle', rnd(2200, 3400), tt);
      var g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, tt);
      g.gain.exponentialRampToValueAtTime(0.045, tt + 0.002);
      g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.05);
      play(o, g, tt, 0.06, 0.2, 0);
    }
  };

  AE.hitFlesh = function (crit) {
    if (!ready || !enabledSfx) return;
    var t = now();
    var n = noiseSrc();
    var lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.setValueAtTime(crit ? 2400 : 1200, t);
    lp.frequency.exponentialRampToValueAtTime(180, t + 0.09);
    lp.Q.value = 3;
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(crit ? 0.34 : 0.17, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + (crit ? 0.15 : 0.09));
    n.connect(lp); lp.connect(g); g.connect(nodes.sfx);
    n.start(t); n.stop(t + 0.16);

    var o = osc('sine', crit ? 420 : 170, t);
    o.frequency.exponentialRampToValueAtTime(crit ? 90 : 60, t + 0.09);
    var og = ctx.createGain();
    og.gain.setValueAtTime(0.0001, t);
    og.gain.exponentialRampToValueAtTime(crit ? 0.26 : 0.13, t + 0.003);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
    play(o, og, t, 0.12, crit ? 0.25 : 0.06, 0);

    if (crit) {
      var c = osc('square', 1800, t);
      c.frequency.exponentialRampToValueAtTime(3600, t + 0.05);
      var cg = ctx.createGain();
      cg.gain.setValueAtTime(0.0001, t);
      cg.gain.exponentialRampToValueAtTime(0.10, t + 0.004);
      cg.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
      play(c, cg, t, 0.1, 0.3, 0.2);
    }
  };

  AE.hitMetal = function () {
    if (!ready || !enabledSfx) return;
    var t = now();
    var freqs = [1830, 2470, 3310];
    for (var i = 0; i < freqs.length; i++) {
      var o = osc('triangle', freqs[i] * rnd(0.95, 1.05), t);
      var g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.07 / (i + 1), t + 0.002);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18 / (i + 1));
      play(o, g, t, 0.2, 0.3, 0);
    }
    var n = noiseSrc();
    var hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 3000;
    var ng = ctx.createGain();
    ng.gain.setValueAtTime(0.0001, t);
    ng.gain.exponentialRampToValueAtTime(0.09, t + 0.002);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
    n.connect(hp); hp.connect(ng); ng.connect(nodes.sfx);
    n.start(t); n.stop(t + 0.07);
  };

  AE.zombieGrowl = function (big) {
    if (!ready || !enabledSfx) return;
    var t = now();
    var base = big ? rnd(48, 62) : rnd(85, 130);
    var o = osc('sawtooth', base, t);
    o.frequency.setValueCurveAtTime(
      new Float32Array([base, base * 1.25, base * 0.82, base * 1.1, base * 0.7]),
      t, big ? 0.9 : 0.45);
    var o2 = osc('square', base * 1.5, t);
    var lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = big ? 700 : 1100; lp.Q.value = 6;
    var g = ctx.createGain();
    var dur = big ? 0.9 : 0.45;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(big ? 0.30 : 0.11, t + 0.08);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(lp); o2.connect(lp); lp.connect(g); g.connect(nodes.sfx);
    var v = ctx.createGain(); v.gain.value = 0.35; g.connect(v); v.connect(nodes.verbSend);
    o.start(t); o.stop(t + dur); o2.start(t); o2.stop(t + dur);
  };

  AE.zombieDie = function () {
    if (!ready || !enabledSfx) return;
    var t = now();
    var base = rnd(150, 230);
    var o = osc('sawtooth', base, t);
    o.frequency.exponentialRampToValueAtTime(base * 0.28, t + 0.35);
    var lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
    lp.frequency.setValueAtTime(1600, t);
    lp.frequency.exponentialRampToValueAtTime(260, t + 0.35);
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.14, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.38);
    o.connect(lp); lp.connect(g); g.connect(nodes.sfx);
    var v = ctx.createGain(); v.gain.value = 0.3; g.connect(v); v.connect(nodes.verbSend);
    o.start(t); o.stop(t + 0.4);

    var n = noiseSrc();
    var bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 600; bp.Q.value = 1.2;
    var ng = ctx.createGain();
    ng.gain.setValueAtTime(0.0001, t);
    ng.gain.exponentialRampToValueAtTime(0.10, t + 0.01);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    n.connect(bp); bp.connect(ng); ng.connect(nodes.sfx);
    n.start(t); n.stop(t + 0.32);
  };

  AE.explosion = function (size) {
    if (!ready || !enabledSfx) return;
    size = size || 1;
    var t = now();
    var n = noiseSrc();
    var lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
    lp.frequency.setValueAtTime(2600 * size, t);
    lp.frequency.exponentialRampToValueAtTime(90, t + 0.7 * size);
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.45 * size, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.85 * size);
    n.connect(lp); lp.connect(g); g.connect(nodes.sfx);
    var v = ctx.createGain(); v.gain.value = 0.55; g.connect(v); v.connect(nodes.verbSend);
    n.start(t); n.stop(t + 0.9 * size);

    var s = osc('sine', 110 * size, t);
    s.frequency.exponentialRampToValueAtTime(24, t + 0.5 * size);
    var sg = ctx.createGain();
    sg.gain.setValueAtTime(0.0001, t);
    sg.gain.exponentialRampToValueAtTime(0.5 * size, t + 0.01);
    sg.gain.exponentialRampToValueAtTime(0.0001, t + 0.6 * size);
    play(s, sg, t, 0.65 * size, 0.2, 0);
  };

  AE.crateBreak = function () {
    if (!ready || !enabledSfx) return;
    var t = now();
    for (var i = 0; i < 5; i++) {
      var tt = t + i * rnd(0.012, 0.035);
      var n = noiseSrc();
      var bp = ctx.createBiquadFilter();
      bp.type = 'bandpass'; bp.frequency.value = rnd(700, 3200); bp.Q.value = rnd(2, 7);
      var g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, tt);
      g.gain.exponentialRampToValueAtTime(rnd(0.07, 0.15), tt + 0.003);
      g.gain.exponentialRampToValueAtTime(0.0001, tt + rnd(0.07, 0.17));
      n.connect(bp); bp.connect(g); g.connect(nodes.sfx);
      var v = ctx.createGain(); v.gain.value = 0.25; g.connect(v); v.connect(nodes.verbSend);
      n.start(tt); n.stop(tt + 0.2);
    }
  };

  AE.coin = function (idx) {
    if (!ready || !enabledSfx) return;
    var t = now();
    var scale = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
    var semi = scale[clamp(idx || 0, 0, scale.length - 1) | 0];
    var f = 880 * Math.pow(2, semi / 12);
    [1, 2.01].forEach(function (m, i) {
      var o = osc(i ? 'sine' : 'triangle', f * m, t);
      var g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(i ? 0.05 : 0.10, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + (i ? 0.18 : 0.26));
      play(o, g, t, 0.3, 0.3, 0.12);
    });
  };

  AE.powerup = function () {
    if (!ready || !enabledSfx) return;
    var t = now();
    var notes = [0, 4, 7, 12, 16, 19];
    notes.forEach(function (semi, i) {
      var tt = t + i * 0.045;
      var f = 440 * Math.pow(2, semi / 12);
      var o = osc('square', f, tt);
      var lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 4500; lp.Q.value = 2;
      var g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, tt);
      g.gain.exponentialRampToValueAtTime(0.11, tt + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.22);
      o.connect(lp); lp.connect(g); g.connect(nodes.sfx);
      var v = ctx.createGain(); v.gain.value = 0.3; g.connect(v); v.connect(nodes.verbSend);
      var d = ctx.createGain(); d.gain.value = 0.2; g.connect(d); d.connect(nodes.dlySend);
      o.start(tt); o.stop(tt + 0.25);
    });
  };

  AE.shieldOn = function () {
    if (!ready || !enabledSfx) return;
    var t = now();
    var o = osc('sine', 180, t);
    o.frequency.exponentialRampToValueAtTime(720, t + 0.3);
    var o2 = osc('sawtooth', 90, t);
    o2.frequency.exponentialRampToValueAtTime(360, t + 0.3);
    var lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2400; lp.Q.value = 8;
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.17, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
    o.connect(lp); o2.connect(lp); lp.connect(g); g.connect(nodes.sfx);
    var v = ctx.createGain(); v.gain.value = 0.4; g.connect(v); v.connect(nodes.verbSend);
    o.start(t); o.stop(t + 0.6); o2.start(t); o2.stop(t + 0.6);
  };

  AE.playerHurt = function () {
    if (!ready || !enabledSfx) return;
    var t = now();
    var n = noiseSrc();
    var bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 340; bp.Q.value = 0.8;
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.30, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    n.connect(bp); bp.connect(g); g.connect(nodes.sfx);
    n.start(t); n.stop(t + 0.32);

    var o = osc('sawtooth', 210, t);
    o.frequency.exponentialRampToValueAtTime(70, t + 0.25);
    var og = ctx.createGain();
    og.gain.setValueAtTime(0.0001, t);
    og.gain.exponentialRampToValueAtTime(0.22, t + 0.006);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
    play(o, og, t, 0.3, 0.2, 0);
  };

  AE.heartbeat = function () {
    if (!ready || !enabledSfx) return;
    var t = now();
    [0, 0.19].forEach(function (off, i) {
      var tt = t + off;
      var o = osc('sine', 62, tt);
      o.frequency.exponentialRampToValueAtTime(34, tt + 0.13);
      var g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, tt);
      g.gain.exponentialRampToValueAtTime(i ? 0.22 : 0.32, tt + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.16);
      play(o, g, tt, 0.18, 0, 0);
    });
  };

  AE.bossRoar = function () {
    if (!ready || !enabledSfx) return;
    var t = now();
    var car = osc('sawtooth', 70, t);
    car.frequency.setValueCurveAtTime(new Float32Array([55, 90, 70, 110, 62, 45]), t, 1.6);
    var mod = osc('sine', 23, t);
    var modG = ctx.createGain(); modG.gain.value = 60;
    mod.connect(modG); modG.connect(car.frequency);
    var lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900; lp.Q.value = 4;
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.42, t + 0.15);
    g.gain.setValueAtTime(0.42, t + 1.0);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.7);
    car.connect(lp); lp.connect(g); g.connect(nodes.sfx);
    var v = ctx.createGain(); v.gain.value = 0.6; g.connect(v); v.connect(nodes.verbSend);
    car.start(t); car.stop(t + 1.8); mod.start(t); mod.stop(t + 1.8);
  };

  AE.combo = function (n) {
    if (!ready || !enabledSfx) return;
    var t = now();
    var semi = clamp(n, 0, 24);
    var f = 523.25 * Math.pow(2, semi / 12);
    var o = osc('triangle', f, t);
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.075, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    play(o, g, t, 0.18, 0.25, 0.15);
  };

  AE.ui = function (kind) {
    if (!ready || !enabledSfx) return;
    var t = now();
    var f = kind === 'back' ? 380 : (kind === 'hover' ? 900 : 620);
    var o = osc('square', f, t);
    if (kind !== 'hover') o.frequency.exponentialRampToValueAtTime(f * 1.5, t + 0.05);
    var lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3000;
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(kind === 'hover' ? 0.03 : 0.09, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + (kind === 'hover' ? 0.05 : 0.11));
    o.connect(lp); lp.connect(g); g.connect(nodes.sfx);
    var v = ctx.createGain(); v.gain.value = 0.2; g.connect(v); v.connect(nodes.verbSend);
    o.start(t); o.stop(t + 0.14);
  };

  AE.purchase = function () {
    if (!ready || !enabledSfx) return;
    var t = now();
    [0, 7, 12].forEach(function (s, i) {
      var tt = t + i * 0.07;
      var o = osc('triangle', 523.25 * Math.pow(2, s / 12), tt);
      var g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, tt);
      g.gain.exponentialRampToValueAtTime(0.12, tt + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.3);
      play(o, g, tt, 0.35, 0.35, 0.15);
    });
  };

  AE.levelWin = function () {
    if (!ready || !enabledSfx) return;
    var t = now();
    // heroic fanfare: C - E - G - C(oct) stabs + sustained chord
    var seq = [[0, 0], [4, 0.12], [7, 0.24], [12, 0.36]];
    seq.forEach(function (p) {
      var tt = t + p[1];
      [0.5, 1, 2].forEach(function (m, i) {
        var o = osc(i === 1 ? 'sawtooth' : 'square', 261.63 * Math.pow(2, p[0] / 12) * m, tt);
        var lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 4000; lp.Q.value = 1;
        var g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, tt);
        g.gain.exponentialRampToValueAtTime(0.10 / (i + 1), tt + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.45);
        o.connect(lp); lp.connect(g); g.connect(nodes.sfx);
        var v = ctx.createGain(); v.gain.value = 0.4; g.connect(v); v.connect(nodes.verbSend);
        o.start(tt); o.stop(tt + 0.5);
      });
    });
    var tt2 = t + 0.5;
    [0, 4, 7, 12].forEach(function (s) {
      var o = osc('sawtooth', 261.63 * Math.pow(2, s / 12), tt2);
      var lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2600;
      var g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, tt2);
      g.gain.exponentialRampToValueAtTime(0.07, tt2 + 0.05);
      g.gain.exponentialRampToValueAtTime(0.0001, tt2 + 1.4);
      o.connect(lp); lp.connect(g); g.connect(nodes.sfx);
      var v = ctx.createGain(); v.gain.value = 0.5; g.connect(v); v.connect(nodes.verbSend);
      o.start(tt2); o.stop(tt2 + 1.5);
    });
  };

  AE.gameOver = function () {
    if (!ready || !enabledSfx) return;
    var t = now();
    [0, -3, -7, -12].forEach(function (s, i) {
      var tt = t + i * 0.2;
      var o = osc('sawtooth', 220 * Math.pow(2, s / 12), tt);
      var lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
      lp.frequency.setValueAtTime(2000, tt);
      lp.frequency.exponentialRampToValueAtTime(300, tt + 0.8);
      var g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, tt);
      g.gain.exponentialRampToValueAtTime(0.13, tt + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, tt + 1.0);
      o.connect(lp); lp.connect(g); g.connect(nodes.sfx);
      var v = ctx.createGain(); v.gain.value = 0.5; g.connect(v); v.connect(nodes.verbSend);
      o.start(tt); o.stop(tt + 1.1);
    });
  };

  AE.warning = function () {
    if (!ready || !enabledSfx) return;
    var t = now();
    for (var i = 0; i < 3; i++) {
      var tt = t + i * 0.22;
      var o = osc('square', 740, tt);
      var g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, tt);
      g.gain.exponentialRampToValueAtTime(0.10, tt + 0.01);
      g.gain.setValueAtTime(0.10, tt + 0.1);
      g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.16);
      play(o, g, tt, 0.18, 0.3, 0.2);
    }
  };

  AE.whoosh = function () {
    if (!ready || !enabledSfx) return;
    var t = now();
    var n = noiseSrc();
    var bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.4;
    bp.frequency.setValueAtTime(300, t);
    bp.frequency.exponentialRampToValueAtTime(2600, t + 0.18);
    bp.frequency.exponentialRampToValueAtTime(400, t + 0.38);
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.12, t + 0.1);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
    n.connect(bp); bp.connect(g); g.connect(nodes.sfx);
    n.start(t); n.stop(t + 0.42);
  };

  /* ============================================================ MUSIC ENGINE
   * Adaptive layered soundtrack. Dark industrial synth-horror groove.
   * Layers fade in/out with combat intensity (0..1).
   * ====================================================================== */
  var ML = {};              // layer gain nodes
  var bpm = 148;
  var step = 0;
  var nextNoteTime = 0;
  var timerID = null;
  var playing = false;
  var intensity = 0;
  var targetIntensity = 0;
  var mode = 'menu';        // menu | game | boss

  // A natural minor. Progression (8 bars, 2 bars each): Am - F - C - G
  var PROG = [
    { root: 57, chord: [57, 60, 64] },   // Am
    { root: 53, chord: [53, 57, 60] },   // F
    { root: 48, chord: [48, 52, 55] },   // C
    { root: 55, chord: [55, 59, 62] }    // G
  ];
  var PROG_BOSS = [
    { root: 50, chord: [50, 53, 57] },   // Dm
    { root: 49, chord: [49, 53, 56] },   // Db (tritone tension)
    { root: 50, chord: [50, 53, 57] },
    { root: 55, chord: [55, 58, 62] }    // Gm
  ];

  function mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); }

  function mKick(t, dest, vel) {
    var o = osc('sine', 180, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.09);
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.95 * vel, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.26);
    o.connect(g); g.connect(dest);
    o.start(t); o.stop(t + 0.28);

    var n = noiseSrc();
    var hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1200;
    var ng = ctx.createGain();
    ng.gain.setValueAtTime(0.0001, t);
    ng.gain.exponentialRampToValueAtTime(0.10 * vel, t + 0.001);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.022);
    n.connect(hp); hp.connect(ng); ng.connect(dest);
    n.start(t); n.stop(t + 0.03);
  }

  function mSnare(t, dest, vel) {
    var n = noiseSrc();
    var bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1900; bp.Q.value = 0.7;
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.34 * vel, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.17);
    n.connect(bp); bp.connect(g); g.connect(dest);
    var v = ctx.createGain(); v.gain.value = 0.3; g.connect(v); v.connect(nodes.verbSend);
    n.start(t); n.stop(t + 0.18);

    var o = osc('triangle', 195, t);
    o.frequency.exponentialRampToValueAtTime(120, t + 0.09);
    var og = ctx.createGain();
    og.gain.setValueAtTime(0.0001, t);
    og.gain.exponentialRampToValueAtTime(0.16 * vel, t + 0.003);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.11);
    o.connect(og); og.connect(dest);
    o.start(t); o.stop(t + 0.12);
  }

  function mHat(t, dest, open, vel) {
    var n = noiseSrc();
    var hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 8200;
    var g = ctx.createGain();
    var d = open ? 0.16 : 0.035;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.11 * vel, t + 0.001);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    n.connect(hp); hp.connect(g); g.connect(dest);
    n.start(t); n.stop(t + d + 0.01);
  }

  function mBass(t, dest, midi, dur, vel) {
    var f = mtof(midi);
    var o1 = osc('sawtooth', f, t);
    var o2 = osc('square', f * 0.5, t);
    o2.detune.value = 6;
    var lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.Q.value = 9;
    lp.frequency.setValueAtTime(220, t);
    lp.frequency.exponentialRampToValueAtTime(1500, t + 0.03);
    lp.frequency.exponentialRampToValueAtTime(190, t + dur * 0.9);
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.32 * vel, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o1.connect(lp); o2.connect(lp); lp.connect(g); g.connect(dest);
    o1.start(t); o1.stop(t + dur + 0.02);
    o2.start(t); o2.stop(t + dur + 0.02);
  }

  function mArp(t, dest, midi, dur, vel) {
    var o = osc('square', mtof(midi), t);
    var lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.Q.value = 11;
    lp.frequency.setValueAtTime(3600, t);
    lp.frequency.exponentialRampToValueAtTime(700, t + dur);
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.10 * vel, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(lp); lp.connect(g); g.connect(dest);
    var d = ctx.createGain(); d.gain.value = 0.35; g.connect(d); d.connect(nodes.dlySend);
    o.start(t); o.stop(t + dur + 0.02);
  }

  function mPad(t, dest, chord, dur) {
    chord.forEach(function (m) {
      [-7, 0, 7].forEach(function (det) {
        var o = osc('sawtooth', mtof(m), t);
        o.detune.value = det;
        var lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1100; lp.Q.value = 1;
        var g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.020, t + dur * 0.35);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(lp); lp.connect(g); g.connect(dest);
        var v = ctx.createGain(); v.gain.value = 0.7; g.connect(v); v.connect(nodes.verbSend);
        o.start(t); o.stop(t + dur + 0.05);
      });
    });
  }

  function mLead(t, dest, midi, dur, vel) {
    var o = osc('sawtooth', mtof(midi), t);
    var o2 = osc('sawtooth', mtof(midi), t); o2.detune.value = 11;
    var lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 6;
    lp.frequency.setValueAtTime(1200, t);
    lp.frequency.exponentialRampToValueAtTime(3200, t + 0.05);
    lp.frequency.exponentialRampToValueAtTime(900, t + dur);
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.075 * vel, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(lp); o2.connect(lp); lp.connect(g); g.connect(dest);
    var v = ctx.createGain(); v.gain.value = 0.4; g.connect(v); v.connect(nodes.verbSend);
    var dl = ctx.createGain(); dl.gain.value = 0.3; g.connect(dl); dl.connect(nodes.dlySend);
    o.start(t); o.stop(t + dur + 0.02); o2.start(t); o2.stop(t + dur + 0.02);
  }

  // riff patterns (16 steps per bar)
  var ARP_PAT = [0, 2, 1, 2, 0, 2, 1, 3, 0, 2, 1, 2, 3, 2, 1, 0];
  var LEAD_PAT = [
    12, -1, -1, 15, -1, 12, -1, -1, 10, -1, 12, -1, -1, 7, -1, -1
  ];
  var BASS_PAT = [1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0];

  function scheduleStep(s, t) {
    var prog = (mode === 'boss') ? PROG_BOSS : PROG;
    var bar = Math.floor(s / 16) % 8;
    var ch = prog[Math.floor(bar / 2) % prog.length];
    var i = s % 16;

    var isMenu = (mode === 'menu');

    /* --- pad layer (always, base) --- */
    if (i === 0 && (bar % 2 === 0)) {
      mPad(t, ML.base, ch.chord.map(function (m) { return m + 12; }), (60 / bpm) * 8);
    }

    /* --- drums --- */
    if (!isMenu) {
      var dv = 1;
      if (i === 0 || i === 6 || i === 10) mKick(t, ML.drums, dv);
      if (mode === 'boss' && i === 14) mKick(t, ML.drums, 0.7);
      if (i === 4 || i === 12) mSnare(t, ML.drums, dv);
      if (i % 2 === 0) mHat(t, ML.drums, false, i % 4 === 2 ? 0.7 : 1);
      if (i === 14 && bar % 4 === 3) mHat(t, ML.drums, true, 0.9);
      // fill at end of 8-bar phrase
      if (bar === 7 && i >= 12) mSnare(t, ML.drums, 0.5 + (i - 12) * 0.16);
    } else {
      // menu: sparse heartbeat pulse
      if (i === 0) mKick(t, ML.drums, 0.55);
      if (i === 8) mKick(t, ML.drums, 0.32);
      if (i === 12 && bar % 2 === 1) mHat(t, ML.drums, true, 0.35);
    }

    /* --- bass (combat layer) --- */
    if (BASS_PAT[i] && !isMenu) {
      var oct = (i === 0) ? 0 : (Math.random() < 0.18 ? 12 : 0);
      mBass(t, ML.combat, ch.root - 12 + oct, (60 / bpm) * 0.42, 1);
    } else if (isMenu && i === 0) {
      mBass(t, ML.base, ch.root - 12, (60 / bpm) * 1.6, 0.6);
    }

    /* --- arp (combat layer) --- */
    if (!isMenu) {
      var an = ARP_PAT[i];
      var anote = ch.chord[an % ch.chord.length] + 12 + (an >= 3 ? 12 : 0);
      mArp(t, ML.combat, anote, (60 / bpm) * 0.22, i % 4 === 0 ? 1 : 0.72);
    }

    /* --- lead (horde layer) --- */
    if (!isMenu) {
      var ln = LEAD_PAT[i];
      if (ln >= 0) {
        mLead(t, ML.horde, ch.root + ln, (60 / bpm) * 0.5, 1);
      }
      if (mode === 'boss' && i % 4 === 2) {
        mArp(t, ML.horde, ch.root + 24, (60 / bpm) * 0.2, 0.55);
      }
    }
  }

  function scheduler() {
    if (!ready || !playing) return;
    var spb = 60 / bpm / 4;  // 16th
    while (nextNoteTime < ctx.currentTime + 0.14) {
      scheduleStep(step, nextNoteTime);
      nextNoteTime += spb;
      step++;
    }
    // smooth intensity
    intensity += (targetIntensity - intensity) * 0.08;
    var t = ctx.currentTime;
    ML.base.gain.setTargetAtTime(mode === 'menu' ? 0.85 : 0.6, t, 0.4);
    ML.drums.gain.setTargetAtTime(mode === 'menu' ? 0.5 : 0.85, t, 0.4);
    ML.combat.gain.setTargetAtTime(mode === 'menu' ? 0 : clamp(intensity * 1.5, 0, 1) * 0.9, t, 0.5);
    ML.horde.gain.setTargetAtTime(mode === 'menu' ? 0 : clamp((intensity - 0.45) * 2.2, 0, 1) * 0.85, t, 0.6);
  }

  AE.musicStart = function (m) {
    if (!ready) return;
    mode = m || 'game';
    bpm = (mode === 'boss') ? 164 : (mode === 'menu' ? 96 : 148);
    nodes.dly.delayTime.setTargetAtTime(60 / bpm * 0.75, now(), 0.2);
    if (playing) return;
    playing = true;
    step = 0;
    nextNoteTime = ctx.currentTime + 0.08;
    if (timerID) clearInterval(timerID);
    timerID = setInterval(scheduler, 25);
  };

  AE.musicSetMode = function (m) {
    if (!ready || mode === m) return;
    mode = m;
    bpm = (mode === 'boss') ? 164 : (mode === 'menu' ? 96 : 148);
    nodes.dly.delayTime.setTargetAtTime(60 / bpm * 0.75, now(), 0.2);
    step = Math.ceil(step / 16) * 16; // realign to bar
  };

  AE.musicSetIntensity = function (v) { targetIntensity = clamp(v, 0, 1); };

  AE.musicStop = function () {
    playing = false;
    if (timerID) { clearInterval(timerID); timerID = null; }
    if (ready) {
      var t = now();
      ['base', 'drums', 'combat', 'horde'].forEach(function (k) {
        ML[k].gain.setTargetAtTime(0, t, 0.25);
      });
    }
  };

  AE.duck = function (amount, time) {
    if (!ready) return;
    var t = now();
    nodes.music.gain.cancelScheduledValues(t);
    nodes.music.gain.setValueAtTime(nodes.music.gain.value, t);
    nodes.music.gain.linearRampToValueAtTime(enabledMusic ? 0.55 * (1 - amount) : 0, t + 0.05);
    nodes.music.gain.linearRampToValueAtTime(enabledMusic ? 0.55 : 0, t + 0.05 + (time || 0.6));
  };

  global.AE = AE;
})(window);
