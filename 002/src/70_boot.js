/* ==========================================================================
   TITAN LOOP — 70_boot.js
   启动流程 + 主循环
   ========================================================================== */
(function (root) {
  'use strict';
  var TL = root.TL, M = TL.M, G = TL.game, W = TL.world, U = TL.ui;
  var d = document;

  var lastT = 0, rafId = 0, booted = false;

  function setProgress(p) {
    if (U.el.loadBar) U.el.loadBar.style.width = (p * 100) + '%';
  }

  function boot() {
    TL.save.load();
    TL.setLang(TL.detectLang());

    U.build();
    U.relabel();
    setProgress(0.15);

    TL.ads.loadingStart();

    // 世界初始化（同步，但分帧给 UI 一个呼吸）
    setTimeout(function () {
      var canvas = d.getElementById('gl');
      try {
        W.init(canvas);
      } catch (e) {
        console.error('[boot] world init failed', e);
        U.el.loadTxt.textContent = 'WebGL unavailable — please enable hardware acceleration';
        return;
      }
      setProgress(0.6);
      W.applyAct(TL.ACTS[0]);
      buildMenuDiorama();
      W.setCam('menu');
      setProgress(0.85);

      TL.ads.init(function () {
        setProgress(1);
        TL.ads.loadingStop();
        readyToTap();
      });
      // 广告 SDK 挂了也不能卡住玩家
      setTimeout(function () { if (!booted) { setProgress(1); readyToTap(); } }, 4000);

      G.bindInput(canvas);
      d.getElementById('ui').addEventListener('touchstart', function () { TL.audio.unlock(); }, { passive: true });

      lastT = performance.now();
      rafId = requestAnimationFrame(loop);
    }, 60);
  }

  function readyToTap() {
    if (booted) return;
    booted = true;
    U.el.tapHint.style.visibility = 'visible';
    U.el.loadTxt.textContent = TL.t('tagline');
    var go = function () {
      d.removeEventListener('pointerdown', go);
      d.removeEventListener('keydown', go);
      TL.audio.init();
      TL.audio.unlock();
      TL.audio.setMusic(TL.save.data.settings.music);
      TL.audio.setSfx(TL.save.data.settings.sfx);
      TL.audio.startMusic(0.32, 0);
      U.show('menu');
      // 主菜单静态广告位
      setTimeout(function () { TL.ads.banner(U.el.menuAd, '300x250'); }, 220);
    };
    d.addEventListener('pointerdown', go);
    d.addEventListener('keydown', go);
  }

  /* -------- 主菜单背景：一个小型静态场景，让菜单不空 -------- */
  function buildMenuDiorama() {
    var def = TL.levelDef(Math.max(1, Math.min(TL.save.data.levelReached, TL.LEVEL_COUNT)));
    W.buildLevel(def);
    // 菜单里泰坦站在远处
    if (W.titan) W.titan.mesh.position.x = 34;
    if (W.titan2) W.titan2.mesh.position.x = 42;
  }

  /* ------------------------------ 主循环 ----------------------------- */
  function loop(now) {
    rafId = requestAnimationFrame(loop);
    var dt = (now - lastT) / 1000;
    lastT = now;
    if (dt > 0.1) dt = 0.1;        // 掉帧保护
    if (dt <= 0) return;

    var st = G.state;

    if (st === 'paused') {
      W.update(dt * 0.0001, G.aim, W.titan ? W.titan.mesh.position.x : 46);
      W.render();
      return;
    }

    if (st === 'menu' || st === 'boot' || st === 'result') {
      // 菜单/结算：场景缓慢运转，泰坦原地待机
      menuIdle(dt);
      W.update(dt, null, W.titan ? W.titan.mesh.position.x : 46);
      U.updateHUD(dt);
      W.render();
      TL.save.tick(dt);
      return;
    }

    G.update(dt);
    U.updateHUD(dt);
    W.render();
    TL.save.tick(dt);
    TL.save.data.totalPlaySec += dt;
  }

  var idleT = 0;
  function menuIdle(dt) {
    idleT += dt;
    var ti = W.titan;
    if (ti && ti.alive) {
      ti.walkPhase += dt * 1.1;
      var wp = ti.walkPhase;
      ti.legs[0].rotation.z = Math.sin(wp) * 0.16;
      ti.legs[1].rotation.z = -Math.sin(wp) * 0.16;
      ti.arms[0].rotation.z = -Math.sin(wp) * 0.12;
      ti.arms[1].rotation.z = Math.sin(wp) * 0.12;
      ti.mesh.position.y = Math.abs(Math.sin(wp)) * 0.12;
      ti.core.scale.setScalar(1 + Math.sin(idleT * 3) * 0.1);
      ti.coreRing.rotation.z += dt * 0.8;
      ti.eye.material.opacity = 0.6 + Math.sin(idleT * 6) * 0.3;
      var sp = Math.floor(wp / Math.PI);
      if (sp !== ti.lastStep) { ti.lastStep = sp; W.addShake(0.06); }
    }
    // 小兵原地飘
    for (var i = 0; i < W.grunts.length; i++) {
      var g = W.grunts[i]; if (!g.alive) continue;
      g.bob += dt * 3;
      g.mesh.position.y = 1.15 + Math.sin(g.bob) * 0.2;
      g.mesh.rotation.y += dt * 0.5;
      g.parts.body.rotation.x += dt * 1.2;
    }
    // 道具旋转
    for (var a = 0; a < W.amps.length; a++) {
      var e = W.amps[a]; if (!e.alive) continue;
      e.bob += dt; e.mesh.rotation.y += dt * e.spin;
      e.parts.core.rotation.x += dt; e.parts.cage.rotation.y -= dt * 0.8;
    }
    for (var c = 0; c < W.cores.length; c++) {
      var e2 = W.cores[c]; if (!e2.alive) continue;
      e2.bob += dt; e2.mesh.rotation.y += dt * e2.spin;
      e2.parts.shell.rotation.x -= dt * 0.7; e2.parts.r1.rotation.x += dt * 0.9;
    }
    for (var wd = 0; wd < W.wardens.length; wd++) {
      var e3 = W.wardens[wd]; if (!e3.alive) continue;
      e3.angle += dt * e3.spinSpeed; e3.parts.pivot.rotation.y = e3.angle;
    }
    for (var rf = 0; rf < W.rifts.length; rf++) {
      var e4 = W.rifts[rf]; if (!e4.alive) continue;
      e4.parts.ring.rotation.x += dt * 1.6; e4.parts.ring2.rotation.x -= dt * 2.2;
    }
  }

  /* ------------------------------ 窗口事件 --------------------------- */
  root.addEventListener('resize', function () { W.resize(); });
  root.addEventListener('orientationchange', function () { setTimeout(function () { W.resize(); }, 200); });
  d.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  d.addEventListener('gesturestart', function (e) { e.preventDefault(); });

  TL.on('ad:end', function () { TL.audio.resume(); });

  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', boot);
  else boot();

})(typeof window !== 'undefined' ? window : this);
