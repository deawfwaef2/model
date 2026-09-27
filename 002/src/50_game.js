/* ==========================================================================
   TITAN LOOP — 50_game.js
   战斗核心：瞄准/射击/碰撞/增幅/泰坦行军/胜负判定/连击/经济
   ========================================================================== */
(function (root) {
  'use strict';
  var TL = root.TL = root.TL || {};
  var M = TL.M, W = TL.world;
  var T = root.THREE;

  var G = TL.game = {
    state: 'boot',          // boot | menu | intro | play | ending | result
    def: null,
    stats: null,
    elapsed: 0,
    totalTime: 10,
    timeScale: 1,
    hitstop: 0,
    slowmo: 0,
    fireT: 0,
    combo: 0, comboT: 0, bestCombo: 0,
    coins: 0, shards: 0, kills: 0,
    ampsGot: [],
    shield: 0, maxShield: 0,
    aim: new T.Vector3(40, 1.4, 0),
    aimScreen: { x: 0, y: 0, has: false },
    extraTime: 0,
    pointerDown: false,
    reviveUsed: false,
    result: null,
    pendingBoosters: {},
    firstBlood: false,
    lastHurt: 0,
    countdown: 0,
    running: false
  };

  var tmp = new T.Vector3(), tmp2 = new T.Vector3(), chainTmp = new T.Vector3(), homeTmp = new T.Vector3();
  var scr = { x: 0, y: 0, behind: false };

  /* ============================ 输入处理 ============================ */
  G.bindInput = function (el) {
    // 桌面端给一个默认瞄准点（屏幕中偏右），玩家一进场就能开火
    if (!TL.DEV.touch) {
      G.aimScreen.x = root.innerWidth * 0.56;
      G.aimScreen.y = root.innerHeight * 0.46;
      G.aimScreen.has = true;
    }
    function setPointer(x, y) {
      G.aimScreen.x = x; G.aimScreen.y = y; G.aimScreen.has = true;
    }
    el.addEventListener('mousemove', function (e) { setPointer(e.clientX, e.clientY); }, { passive: true });
    el.addEventListener('mousedown', function (e) { G.pointerDown = true; setPointer(e.clientX, e.clientY); TL.audio.unlock(); }, { passive: true });
    root.addEventListener('mouseup', function () { G.pointerDown = false; }, { passive: true });
    el.addEventListener('touchstart', function (e) {
      G.pointerDown = true; TL.audio.unlock();
      if (e.touches[0]) setPointer(e.touches[0].clientX, e.touches[0].clientY);
      if (G.state === 'play') e.preventDefault();
    }, { passive: false });
    el.addEventListener('touchmove', function (e) {
      if (e.touches[0]) setPointer(e.touches[0].clientX, e.touches[0].clientY);
      if (G.state === 'play') e.preventDefault();
    }, { passive: false });
    root.addEventListener('touchend', function () { G.pointerDown = false; }, { passive: true });
    root.addEventListener('touchcancel', function () { G.pointerDown = false; }, { passive: true });
  };

  /* ============================ 开始一关 ============================ */
  G.startLevel = function (n) {
    var def = TL.levelDef(n);
    G.def = def;
    var st = TL.baseStats();

    // 商店道具（一次性）
    var pb = G.pendingBoosters;
    if (pb.time2) { st.timeBonus += 2; }
    if (pb.shield) { st.shield += 120; }
    var extraStart = (pb.amp1 ? 1 : 0) + (pb.adAmp ? 1 : 0);
    G.pendingBoosters = {};

    G.stats = st;
    G.elapsed = 0;
    G.extraTime = 0;
    G.totalTime = def.timeLimit + st.timeBonus;
    G.timeScale = 1; G.hitstop = 0; G.slowmo = 0;
    G.fireT = 0;
    G.combo = 0; G.comboT = 0; G.bestCombo = 0;
    G.coins = 0; G.shards = 0; G.kills = 0;
    G.ampsGot = [];
    G.maxShield = st.shield; G.shield = st.shield;
    G.reviveUsed = false;
    G.result = null;
    G.firstBlood = false;
    G.countdown = 1.35;
    G.running = false;

    W.buildLevel(def);
    W.setCam('intro');
    W.hero.position.set(W.LANE.hero, 0, 0);
    W.setWeapon(TL.save.data.weapon || 'pulse');   // 手上的枪跟着装备走

    // 开局预载增幅
    var pre = st.startAmps + extraStart;
    if (pre > 0) {
      var rng = TL.seeded(def.seed + 991);
      var picks = TL.rollAmps(rng, Math.min(pre, TL.AMPS.length));
      for (var i = 0; i < picks.length; i++) applyAmp(picks[i], true);
    }

    G.state = 'intro';
    TL.audio.setPalette(def.act);
    TL.audio.setIntensity(0.35);
    TL.audio.setTension(0);
    TL.audio.startMusic(0.35, def.act);
    TL.audio.setBpm(def.isBoss ? 142 : 132);
    TL.ads.gameplayStart();
    TL.emit('level:start', def);
  };

  /* ============================ 增幅生效 ============================ */
  function applyAmp(amp, silent) {
    amp.apply(G.stats);
    G.ampsGot.push(amp);
    G.totalTime = G.def.timeLimit + G.stats.timeBonus + G.extraTime;
    if (G.stats.nova) { nova(); G.stats.nova = false; }
    if (G.stats.shield > G.maxShield) { var add = G.stats.shield - G.maxShield; G.maxShield = G.stats.shield; G.shield += add; }
    if (!silent) {
      TL.audio.play('amp', G.ampsGot.length);
      TL.emit('amp:got', amp);
    }
  }

  function nova() {
    W.shockwave(0, 0.6, 0, 26, 0x66ddff, 0.6);
    W.burst(0, 1.6, 0, 40, { color: 0x66ddff, speed: 26, life: 0.6 });
    W.addShake(0.5);
    for (var i = W.grunts.length - 1; i >= 0; i--) {
      var g = W.grunts[i];
      if (g.alive && g.mesh.position.x < 16) damageEntity(g, 9999, false, 'nova');
    }
  }

  /* ============================== 瞄准 ============================== */
  function resolveAim() {
    if (!G.aimScreen.has) { G.aim.set(40, 2.0, 0); return null; }
    var best = null, bestD = 1e9;
    var R = Math.min(root.innerWidth, root.innerHeight) * (TL.DEV.touch ? 0.17 : 0.11);
    var lists = [W.grunts, W.amps, W.cores, W.wardens, W.rifts];
    for (var l = 0; l < lists.length; l++) {
      var arr = lists[l];
      for (var i = 0; i < arr.length; i++) {
        var e = arr[i]; if (!e.alive) continue;
        tmp.copy(e.mesh.position);
        if (e.kind === 'warden') tmp.y += 1.6;
        W.worldToScreen(tmp, scr);
        if (scr.behind) continue;
        var dx = scr.x - G.aimScreen.x, dy = scr.y - G.aimScreen.y;
        var d = Math.sqrt(dx * dx + dy * dy);
        if (d < R && d < bestD) { bestD = d; best = { e: e, p: tmp.clone() }; }
      }
    }
    // 泰坦核心
    var titans = [W.titan, W.titan2];
    for (var t = 0; t < titans.length; t++) {
      var ti = titans[t]; if (!ti || !ti.alive) continue;
      ti.core.getWorldPosition(tmp);
      W.worldToScreen(tmp, scr);
      if (scr.behind) continue;
      var tdx = scr.x - G.aimScreen.x, tdy = scr.y - G.aimScreen.y;
      var td = Math.sqrt(tdx * tdx + tdy * tdy);
      if (td < R * 1.5 && td < bestD) { bestD = td; best = { e: ti, p: tmp.clone() }; }
    }
    if (best) { G.aim.copy(best.p); return best.e; }
    W.screenToGround(G.aimScreen.x, G.aimScreen.y, G.aim);
    G.aim.y = 1.6;
    return null;
  }

  /* ============================== 射击 ============================== */
  var spreadTmp = new T.Vector3(), rightTmp = new T.Vector3(), upTmp = new T.Vector3();
  function fire() {
    var st = G.stats;
    W.muzzle.getWorldPosition(tmp);
    tmp2.copy(G.aim).sub(tmp);
    var dist = tmp2.length();
    tmp2.divideScalar(Math.max(0.001, dist));

    // 以瞄准点为圆心、半径固定（世界单位）的散布圆 —— 霰弹在远距离依然能打中泰坦，
    // 但依然打不出"狙击"般的精度，武器手感差异得以保留。
    rightTmp.set(-tmp2.z, 0, tmp2.x);
    if (rightTmp.lengthSq() < 1e-6) rightTmp.set(1, 0, 0); else rightTmp.normalize();
    upTmp.crossVectors(rightTmp, tmp2).normalize();

    var shots = Math.max(1, st.shots | 0);
    var R = st.spread;
    for (var i = 0; i < shots; i++) {
      var ang, rad;
      if (shots === 1) { ang = Math.random() * 6.283; rad = R * Math.sqrt(Math.random()) * 0.85; }
      else {
        // 多弹丸：环形均布 + 抖动，视觉上像一把扇面
        ang = (i / shots) * 6.283 + Math.random() * 0.5;
        rad = R * (0.35 + 0.65 * Math.sqrt((i + 0.5) / shots)) * (0.8 + Math.random() * 0.4);
      }
      spreadTmp.copy(G.aim)
        .addScaledVector(rightTmp, Math.cos(ang) * rad)
        .addScaledVector(upTmp, Math.sin(ang) * rad * 0.7);
      spreadTmp.sub(tmp).normalize();

      var crit = Math.random() < st.crit;
      W.spawnBullet(tmp.x, tmp.y, tmp.z, spreadTmp.x, spreadTmp.y, spreadTmp.z, st.speed, {
        dmg: st.dmg * (crit ? st.critMul : 1),
        pierce: st.pierce, crit: crit, homing: st.homing, chain: st.chain, burn: st.burn,
        color: crit ? 0xffe66a : st.color,
        scale: crit ? 1.3 : 1, life: 1.4
      });
    }
    W.flashMuzzle(st.color);
    W.gun.position.x = 0.1 - 0.16;
    W.hero.rotation.y += (Math.random() - 0.5) * 0.012;
    W.addShake(0.035 + (shots > 2 ? 0.02 : 0));
    TL.audio.play(shots >= 4 ? 'shootHeavy' : 'shoot', 1 + (G.combo % 5) * 0.02);
  }

  /* ============================ 伤害结算 ============================ */
  function damageEntity(e, dmg, crit, source) {
    if (!e.alive) return 0;
    var real = dmg;
    if (e.kind === 'titan') {
      real = dmg * (1 + G.stats.bossMul);
      if (e.shieldHp > 0) {
        e.shieldHp -= real;
        e.hitFlash = 1;
        if (e.shieldHp <= 0) {
          e.shieldHp = 0;
          TL.audio.play('shieldBreak');
          e.core.getWorldPosition(tmp);
          W.shockwave(tmp.x, tmp.y, tmp.z, 22, 0x66ddff, 0.7, false);
          W.burst(tmp.x, tmp.y, tmp.z, 60, { color: 0x88e8ff, speed: 24, life: 0.8 });
          W.addShake(0.8);
          TL.vibrate(60);
          TL.emit('toast', { text: TL.t('shieldBreak'), color: '#66ddff' });
        }
        return real;
      }
      real = real * (1 - e.armor);
    } else if (e.kind === 'warden') {
      // 护盾板朝向玩家时大幅减伤 —— 要等它转过去
      var a = ((e.angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      var facing = Math.cos(a); // 1 = 板子正对玩家
      if (facing > 0.25) { real = dmg * 0.14; crit = false; }
    }
    e.hp -= real;
    e.hitFlash = 1;
    if (e.hp <= 0) { e.hp = 0; killEntity(e, source); }
    return real;
  }

  function addCoins(n) {
    n = Math.round(n * G.stats.coinMul * (1 + Math.min(G.combo, 30) * 0.03));
    G.coins += n;
    return n;
  }

  function bumpCombo() {
    G.combo++; G.comboT = 2.6;
    if (G.combo > G.bestCombo) G.bestCombo = G.combo;
    if (G.combo > 1) TL.audio.play('combo', G.combo);
    TL.emit('combo', G.combo);
  }

  function killEntity(e, source) {
    if (!e.alive) return;
    e.alive = false;
    var p = e.mesh.position;
    var act = W.act;

    if (e.kind === 'grunt') {
      G.kills++;
      W.burst(p.x, p.y, p.z, 26, { color: act.enemy, speed: 15, life: 0.5 });
      W.chunks(p.x, p.y, p.z, 5, act.enemy, 0.8);
      W.shockwave(p.x, 0.25, p.z, 5.5, act.enemy, 0.35);
      W.addShake(0.11);
      TL.audio.play('kill');
      bumpCombo();
      var c = addCoins(3 + G.def.n * 0.7);
      TL.emit('float', { pos: p.clone(), text: '+' + c, cls: 'coin' });
      if (G.stats.killRefund > 0) { G.elapsed = Math.max(0, G.elapsed - G.stats.killRefund); }
      hitstop(0.03);
      TL.vibrate(12);
    } else if (e.kind === 'amp') {
      W.burst(p.x, p.y, p.z, 46, { color: e.mirrored ? 0xff2a55 : 0xffc63a, speed: 20, life: 0.8 });
      W.chunks(p.x, p.y, p.z, 8, e.mirrored ? 0xff2a55 : 0xffc63a, 1);
      W.shockwave(p.x, p.y, p.z, 14, e.mirrored ? 0xff2a55 : 0xffd76a, 0.6, false);
      W.addShake(0.34);
      hitstop(0.07);
      TL.vibrate(28);
      if (e.mirrored) {
        // 镜像增幅：负面！要学会看清颜色
        G.stats.dmg *= 0.75; G.shield = Math.max(1, G.shield - 30);
        TL.audio.play('deny');
        TL.emit('toast', { text: (TL.lang === 'zh' ? '镜像陷阱！伤害 -25%' : 'MIRROR TRAP! -25% DMG'), color: '#ff2a55' });
      } else {
        applyAmp(e.amp);
        TL.emit('float', { pos: p.clone(), text: e.amp.icon + ' ' + TL.ampName(e.amp), cls: 'amp' });
      }
      var c2 = addCoins(8 + G.def.n);
      TL.emit('float', { pos: p.clone().add(new T.Vector3(0, -1.2, 0)), text: '+' + c2, cls: 'coin' });
    } else if (e.kind === 'core') {
      W.burst(p.x, p.y, p.z, 60, { color: 0xb44cff, speed: 22, life: 1.0 });
      W.chunks(p.x, p.y, p.z, 9, 0xd58aff, 1);
      W.shockwave(p.x, p.y, p.z, 18, 0xd58aff, 0.8, false);
      W.addShake(0.42);
      hitstop(0.09);
      TL.audio.play('core');
      TL.vibrate([18, 30, 18]);
      G.shards += e.value;
      TL.emit('float', { pos: p.clone(), text: '◈ +' + e.value, cls: 'shard' });
      TL.emit('shard', e.value);
    } else if (e.kind === 'warden') {
      G.kills++;
      W.burst(p.x, p.y + 1.4, p.z, 44, { color: act.enemy, speed: 20, life: 0.8 });
      W.chunks(p.x, p.y + 1.4, p.z, 10, act.enemy, 1.1);
      W.shockwave(p.x, 0.25, p.z, 10, act.enemy, 0.5);
      W.addShake(0.4);
      hitstop(0.08);
      TL.audio.play('bigExplosion');
      bumpCombo();
      var c3 = addCoins(22 + G.def.n * 2);
      TL.emit('float', { pos: p.clone().add(new T.Vector3(0, 2, 0)), text: '+' + c3, cls: 'coin' });
      TL.vibrate(40);
    } else if (e.kind === 'rift') {
      W.burst(p.x, p.y, p.z, 50, { color: act.enemy, speed: 24, life: 0.9 });
      W.shockwave(p.x, p.y, p.z, 20, act.enemy, 0.8, false);
      W.addShake(0.5);
      TL.audio.play('bigExplosion');
      hitstop(0.08);
      var c4 = addCoins(30 + G.def.n * 2);
      TL.emit('float', { pos: p.clone(), text: '+' + c4, cls: 'coin' });
    } else if (e.kind === 'titan') {
      onTitanDown(e);
      return;
    }
    e.mesh.visible = false;
  }

  function onTitanDown(ti) {
    ti.core.getWorldPosition(tmp);
    W.burst(tmp.x, tmp.y, tmp.z, 140, { color: 0xffffff, speed: 34, life: 1.4 });
    W.burst(tmp.x, tmp.y, tmp.z, 90, { color: W.act.titan, speed: 26, life: 1.6 });
    W.chunks(tmp.x, tmp.y, tmp.z, 26, W.act.titan, 2.0);
    W.shockwave(tmp.x, tmp.y, tmp.z, 55, 0xffffff, 1.2, false);
    W.shockwave(ti.mesh.position.x, 0.3, ti.mesh.position.z, 70, W.act.titan, 1.4);
    W.addShake(1.9);
    TL.audio.play('bigExplosion');
    TL.audio.play('titanRoar');
    TL.vibrate([60, 40, 120]);
    ti.alive = false;
    ti.deathT = 0;
    W.titanAnim(ti, 'Death', 0.08);
    W.glow(ti.mats, 0xffffff, 2.2);            // 临死一闪
    W.setFlash(0.55);

    var others = [W.titan, W.titan2].filter(function (x) { return x && x.alive; });
    if (others.length === 0) win();
    else { G.slowmo = 0.5; }
  }

  function hitstop(d) { G.hitstop = Math.max(G.hitstop, d); }

  /* ============================ 玩家受伤 ============================ */
  function hurt(n) {
    if (G.state !== 'play') return;
    G.shield -= n;
    G.lastHurt = 0.35;
    G.combo = 0; G.comboT = 0;
    TL.audio.play('hurt');
    W.addShake(0.45);
    TL.vibrate(55);
    TL.emit('hurt', n);
    if (G.shield <= 0) { G.shield = 0; lose('overrun'); }
  }

  /* ============================== 胜负 ============================== */
  function win() {
    if (G.state !== 'play') return;
    G.state = 'ending';
    G.running = false;
    G.slowmo = 1.6;
    W.setCam('win');
    TL.audio.setTension(0);
    TL.audio.setIntensity(0.2);
    TL.ads.happy();
    var time = G.elapsed;
    var stars = TL.starsFor(G.def, time);
    var s = TL.save.data;
    var key = '' + G.def.n;
    var prevStars = s.stars[key] || 0;
    var prevBest = s.best[key] || 0;
    var isNewBest = !prevBest || time < prevBest;
    if (isNewBest) s.best[key] = time;
    if (stars > prevStars) s.stars[key] = stars;
    if (G.def.n >= s.levelReached) s.levelReached = Math.min(TL.LEVEL_COUNT, G.def.n + 1);
    var clearBonus = Math.round(G.def.coinBase * (1 + (stars - 1) * 0.45));
    G.coins += clearBonus;
    s.coins += G.coins;
    s.shards += G.shards;
    s.totalKills += G.kills;
    TL.save.mark();
    G.result = {
      win: true, time: time, stars: stars, coins: G.coins, clearBonus: clearBonus,
      shards: G.shards, kills: G.kills, combo: G.bestCombo, newBest: isNewBest,
      prevBest: prevBest, level: G.def.n, par: G.def.par
    };
    setTimeout(function () { TL.audio.play('win'); }, 420);
    setTimeout(function () { TL.emit('result', G.result); G.state = 'result'; TL.ads.gameplayStop(); }, 1700);
  }

  function lose(reason) {
    if (G.state !== 'play') return;
    G.state = 'ending';
    G.running = false;
    G.slowmo = 1.2;
    TL.audio.setTension(0);
    TL.audio.setIntensity(0.15);
    TL.audio.play('lose');
    W.addShake(1.2);
    TL.vibrate([80, 60, 160]);
    var s = TL.save.data;
    s.shards += G.shards;           // 轮回核的收益永远保留 —— 失败也在变强
    s.coins += Math.round(G.coins * 0.4);
    s.totalKills += G.kills;
    s.totalLoops++;
    TL.save.mark();
    G.result = {
      win: false, reason: reason, time: G.elapsed, stars: 0,
      coins: Math.round(G.coins * 0.4), shards: G.shards, kills: G.kills,
      combo: G.bestCombo, level: G.def.n,
      titanPct: W.titan ? M.clamp(W.titan.hp / W.titan.maxHp, 0, 1) : 1,
      canRevive: !G.reviveUsed
    };
    setTimeout(function () { TL.emit('result', G.result); G.state = 'result'; TL.ads.gameplayStop(); }, 1500);
  }

  /** 看广告续命：+3 秒，泰坦后退 */
  G.revive = function () {
    if (!G.result || G.result.win) return;
    G.reviveUsed = true;
    G.state = 'play';
    G.running = true;
    G.result = null;
    G.extraTime += 3;
    G.totalTime = G.def.timeLimit + G.stats.timeBonus + G.extraTime;
    G.shield = Math.max(G.shield, Math.round(G.maxShield * 0.6));
    G.slowmo = 0;
    G.hitstop = 0;
    W.setCam('play');
    // 泰坦被震退
    G.elapsed = Math.max(0, G.elapsed - 3);
    W.shockwave(0, 0.5, 0, 34, 0x66ddff, 0.9);
    W.burst(0, 2, 0, 70, { color: 0x88e8ff, speed: 28, life: 0.9 });
    W.addShake(0.9);
    TL.audio.play('go');
    TL.audio.setIntensity(0.9);
    TL.ads.gameplayStart();
    TL.emit('revived');
  };

  G.abandon = function () {
    G.state = 'menu';
    G.running = false;
    TL.ads.gameplayStop();
    W.clearLevel();
    W.setCam('menu');
    TL.audio.setIntensity(0.32);
    TL.audio.setTension(0);
  };

  /* ============================== 主循环 ============================ */
  G.update = function (rawDt) {
    var dt = rawDt;

    // 命中停顿
    if (G.hitstop > 0) { G.hitstop -= rawDt; dt = rawDt * 0.06; }
    // 慢动作
    if (G.slowmo > 0) { G.slowmo -= rawDt; dt = dt * 0.3; }

    G.timeScale = dt / Math.max(0.0001, rawDt);

    if (G.state === 'intro') {
      G.countdown -= rawDt;
      if (G.countdown <= 0) {
        G.state = 'play'; G.running = true;
        W.setCam('play');
        TL.audio.play('go');
        TL.audio.setIntensity(0.85);
        TL.emit('go');
      }
    }

    var playing = (G.state === 'play');

    if (playing) {
      G.elapsed += dt;
      var remain = G.totalTime - G.elapsed;
      TL.audio.setIntensity(M.clamp(0.7 + (1 - remain / G.totalTime) * 0.3, 0, 1));
      TL.audio.setTension(M.clamp(1 - remain / 4.2, 0, 1));
      if (remain <= 0) { lose('timeup'); }
    }

    var target = resolveAim();

    // 主角朝向
    if (W.hero) {
      tmp.copy(G.aim).sub(W.hero.position);
      var yaw = Math.atan2(-tmp.z, tmp.x);
      var cur = W.hero.rotation.y;
      var d = ((yaw - cur + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      W.hero.rotation.y = cur + d * Math.min(1, rawDt * 16);
      // 枪的俯仰
      var flat = Math.sqrt(tmp.x * tmp.x + tmp.z * tmp.z);
      var pitch = Math.atan2(tmp.y - 1.7, Math.max(0.5, flat));
      W.gun.rotation.z = M.damp(W.gun.rotation.z, pitch, 18, rawDt);
      W.gun.position.x = M.damp(W.gun.position.x, 0.1, 22, rawDt);
      // 受击闪红
      if (G.lastHurt > 0) G.lastHurt -= rawDt;
    }

    // 自动开火
    if (playing) {
      var autofire = TL.DEV.touch ? G.pointerDown : true;
      if (autofire && G.aimScreen.has) {
        G.fireT += dt;
        var interval = 1 / Math.max(0.2, G.stats.rate);
        var guard = 0;
        while (G.fireT >= interval && guard++ < 6) { G.fireT -= interval; fire(); }
      } else { G.fireT = Math.min(G.fireT, 0.2); }
    }

    if (playing || G.state === 'ending') {
      updateBullets(dt);
      updateGrunts(dt, playing);
      updateProps(dt);
      updateWardens(dt, playing);
      updateRifts(dt, playing);
      updateTitan(dt, playing);
    }

    // 连击衰减
    if (G.comboT > 0) { G.comboT -= rawDt; if (G.comboT <= 0) { G.combo = 0; TL.emit('combo', 0); } }

    var tx = W.titan ? W.titan.mesh.position.x : W.LANE.titanStart;
    W.update(rawDt, G.aim, tx);
  };

  /* ============================== 子弹 ============================== */
  function eachEnemy(fn) {
    var lists = [W.grunts, W.amps, W.cores, W.wardens, W.rifts];
    for (var l = 0; l < lists.length; l++) {
      var arr = lists[l];
      for (var i = 0; i < arr.length; i++) if (arr[i].alive) { if (fn(arr[i]) === false) return; }
    }
  }

  var bid = 0;
  function updateBullets(dt) {
    var pool = W.bulletPool;
    for (var i = 0; i < pool.length; i++) {
      var b = pool[i];
      if (!b.alive) continue;
      b.life -= dt;
      if (b.life <= 0) { b.alive = false; b.mesh.visible = false; continue; }

      if (b.fromEnemy) {
        b.mesh.position.x += b.vx * dt; b.mesh.position.y += b.vy * dt; b.mesh.position.z += b.vz * dt;
        var dxh = b.mesh.position.x - 0, dyh = b.mesh.position.y - 1.8, dzh = b.mesh.position.z - 0;
        if (dxh * dxh + dyh * dyh + dzh * dzh < 1.7 * 1.7) {
          b.alive = false; b.mesh.visible = false;
          W.burst(0, 1.8, 0, 14, { color: 0xff4444, speed: 10, life: 0.4 });
          hurt(b.dmg);
        }
        if (b.mesh.position.x < -6) { b.alive = false; b.mesh.visible = false; }
        continue;
      }

      // 追踪
      if (b.homing > 0) {
        var bestE = null, bestD = 1e9;
        eachEnemy(function (e) {
          var d2 = e.mesh.position.distanceToSquared(b.mesh.position);
          if (d2 < bestD && d2 < 400 && !b.hitIds[e.__id]) { bestD = d2; bestE = e; }
        });
        if (!bestE && W.titan && W.titan.alive) bestE = { mesh: { position: W.titan.core.getWorldPosition(homeTmp) } };
        if (bestE) {
          tmp.copy(bestE.mesh.position).sub(b.mesh.position).normalize();
          var sp = Math.sqrt(b.vx * b.vx + b.vy * b.vy + b.vz * b.vz);
          var k = Math.min(1, dt * 7 * b.homing);
          b.vx = M.lerp(b.vx, tmp.x * sp, k);
          b.vy = M.lerp(b.vy, tmp.y * sp, k);
          b.vz = M.lerp(b.vz, tmp.z * sp, k);
        }
      }

      var px = b.mesh.position.x, py = b.mesh.position.y, pz = b.mesh.position.z;
      var nx = px + b.vx * dt, ny = py + b.vy * dt, nz = pz + b.vz * dt;
      b.mesh.position.set(nx, ny, nz);
      b.mesh.lookAt(nx + b.vx, ny + b.vy, nz + b.vz);
      b.mesh.rotateY(Math.PI / 2);

      // 碰撞（用线段中点近似，速度快时分两段检测）
      var segs = 2, hitSomething = false;
      for (var s = 1; s <= segs && !hitSomething; s++) {
        var cx = M.lerp(px, nx, s / segs), cy = M.lerp(py, ny, s / segs), cz = M.lerp(pz, nz, s / segs);
        hitSomething = testHit(b, cx, cy, cz);
      }
      if (nx > 62 || nx < -12 || ny < -2 || Math.abs(nz) > 34) { b.alive = false; b.mesh.visible = false; }
    }
  }

  var uid = 1;
  function testHit(b, cx, cy, cz) {
    var hit = null, hitP = null;
    var lists = [W.grunts, W.amps, W.cores, W.wardens, W.rifts];
    for (var l = 0; l < lists.length && !hit; l++) {
      var arr = lists[l];
      for (var i = 0; i < arr.length; i++) {
        var e = arr[i]; if (!e.alive) continue;
        if (!e.__id) e.__id = uid++;
        if (b.hitIds[e.__id]) continue;
        var ex = e.mesh.position.x, ey = e.mesh.position.y + (e.kind === 'warden' ? 1.5 : 0), ez = e.mesh.position.z;
        var dx = cx - ex, dy = cy - ey, dz = cz - ez;
        var rr = e.r + 0.28;
        if (dx * dx + dy * dy + dz * dz < rr * rr) { hit = e; hitP = { x: cx, y: cy, z: cz }; break; }
      }
    }
    if (!hit) {
      var titans = [W.titan, W.titan2];
      for (var t = 0; t < titans.length; t++) {
        var ti = titans[t]; if (!ti || !ti.alive) continue;
        if (!ti.__id) ti.__id = uid++;
        if (b.hitIds[ti.__id]) continue;
        ti.core.getWorldPosition(tmp);
        var ddx = cx - tmp.x, ddy = cy - tmp.y, ddz = cz - tmp.z;
        var cr = ti.coreR + 0.35;
        var isCore = (ddx * ddx + ddy * ddy + ddz * ddz) < cr * cr;
        var bodyHit = false;
        if (!isCore) {
          var bx = ti.mesh.position.x, bz = ti.mesh.position.z;
          if (Math.abs(cx - bx) < ti.hitX && Math.abs(cz - bz) < ti.hitZ && cy > 0.5 && cy < ti.hitH) bodyHit = true;
        }
        if (isCore || bodyHit) {
          hit = ti; hitP = { x: cx, y: cy, z: cz };
          hit.__isCore = isCore;
          break;
        }
      }
    }
    if (!hit) return false;

    b.hitIds[hit.__id] = 1;
    var dmg = b.dmg;
    var crit = b.crit;
    if (hit.kind === 'titan' && hit.__isCore) { dmg *= 1.8; crit = true; }

    var dealt = damageEntity(hit, dmg, crit, 'bullet');

    // 命中反馈
    var col = crit ? 0xffe66a : (hit.kind === 'amp' ? 0xffc63a : hit.kind === 'core' ? 0xd58aff : 0xffffff);
    W.burst(hitP.x, hitP.y, hitP.z, crit ? 12 : 6, { color: col, speed: crit ? 14 : 9, life: 0.3, grav: -14 });
    if (crit) { TL.audio.play('crit'); W.addShake(0.09); }
    else TL.audio.play('hit', 0.8);
    if (dealt > 0) TL.emit('dmg', { pos: hitP, v: dealt, crit: crit, kind: hit.kind });

    // 燃烧
    if (b.burn > 0 && hit.kind !== 'titan') { hit.burnT = 2.2; hit.burnDps = b.dmg * 0.35 * b.burn; }
    else if (b.burn > 0 && hit.kind === 'titan') { hit.burnT = 2.2; hit.burnDps = b.dmg * 0.45 * b.burn; }

    // 链电
    if (b.chain > 0) {
      var chained = 0;
      eachEnemy(function (e) {
        if (chained >= b.chain) return false;
        if (e === hit) return;
        chainTmp.set(hitP.x, hitP.y, hitP.z);
        var d2 = e.mesh.position.distanceToSquared(chainTmp);
        if (d2 < 49) {
          chained++;
          damageEntity(e, b.dmg * 0.5, false, 'chain');
          drawLightning(hitP, e.mesh.position);
        }
      });
    }

    if (b.pierce > 0) { b.pierce--; b.dmg *= 0.82; return false; }
    b.alive = false; b.mesh.visible = false;
    return true;
  }

  function drawLightning(a, b) {
    var steps = 5;
    for (var i = 0; i <= steps; i++) {
      var t = i / steps;
      W.burst(
        M.lerp(a.x, b.x, t) + (Math.random() - 0.5) * 0.8,
        M.lerp(a.y, b.y, t) + (Math.random() - 0.5) * 0.8,
        M.lerp(a.z, b.z, t) + (Math.random() - 0.5) * 0.8,
        2, { color: 0x99ddff, speed: 2, life: 0.22, grav: 0 }
      );
    }
  }

  /* ============================== 小兵 ============================== */
  function updateGrunts(dt, playing) {
    for (var i = W.grunts.length - 1; i >= 0; i--) {
      var e = W.grunts[i];
      if (!e.alive) { if (!e.mesh.visible) { W.scene.remove(e.mesh); W.grunts.splice(i, 1); } continue; }
      if (e.burnT > 0) {
        e.burnT -= dt;
        e.hp -= e.burnDps * dt;
        if (Math.random() < dt * 14) W.burst(e.mesh.position.x, e.mesh.position.y, e.mesh.position.z, 1, { color: 0xff8822, speed: 3, life: 0.35, grav: -4 });
        if (e.hp <= 0) { killEntity(e, 'burn'); continue; }
      }
      e.bob += dt * 6;
      if (playing) {
        tmp.set(-e.mesh.position.x, 1.15 - e.mesh.position.y, -e.mesh.position.z);
        var dist = Math.sqrt(tmp.x * tmp.x + tmp.z * tmp.z);
        if (dist < 2.3) {
          // 自爆
          W.burst(e.mesh.position.x, e.mesh.position.y, e.mesh.position.z, 24, { color: 0xff5533, speed: 14, life: 0.5 });
          W.shockwave(e.mesh.position.x, 0.3, e.mesh.position.z, 6, 0xff5533, 0.4);
          e.alive = false; e.mesh.visible = false;
          hurt(e.dmg);
          continue;
        }
        tmp.normalize();
        var sp = e.speed * (e.fast ? 1 : 1);
        e.mesh.position.x += tmp.x * sp * dt;
        e.mesh.position.z += tmp.z * sp * dt;
        e.mesh.position.y = 1.15 + Math.sin(e.bob) * 0.16;
      }
      e.mesh.rotation.y = Math.atan2(-e.mesh.position.z, -e.mesh.position.x) + Math.PI;
      e.parts.body.rotation.y += dt * (e.fast ? 0.6 : 2.4);   // 碟形机身自转
      e.parts.ring.rotation.z += dt * 3.2;
      if (e.hitFlash > 0) {
        e.hitFlash -= dt * 7;
        var f = Math.max(0, e.hitFlash);
        W.glow(e.parts.mats, 0xffffff, f * 3.2);               // 整机爆闪
        e.mesh.scale.setScalar(1 + f * 0.22);
      }
    }
  }

  /* =========================== 增幅塔/轮回核 ========================= */
  function updateProps(dt) {
    var i, e;
    for (i = W.amps.length - 1; i >= 0; i--) {
      e = W.amps[i];
      if (!e.alive) { W.scene.remove(e.mesh); W.amps.splice(i, 1); continue; }
      e.bob += dt;
      e.mesh.rotation.y += dt * e.spin;
      e.parts.core.rotation.x += dt * 1.4; e.parts.core.rotation.z += dt * 0.9;
      e.parts.cage.rotation.y -= dt * 1.1; e.parts.cage.rotation.x += dt * 0.5;
      e.parts.r1.rotation.z += dt * 1.8;
      e.mesh.position.y += Math.sin(e.bob * 2) * dt * 0.5;
      var pulse = 0.8 + Math.sin(e.bob * 4) * 0.22;
      e.parts.core.material.emissiveIntensity = pulse + (e.hitFlash > 0 ? e.hitFlash * 3 : 0);
      e.parts.pad.material.opacity = 0.22 + Math.sin(e.bob * 3) * 0.1;
      if (e.hitFlash > 0) { e.hitFlash -= dt * 6; e.mesh.scale.setScalar(1 + Math.max(0, e.hitFlash) * 0.15); }
    }
    for (i = W.cores.length - 1; i >= 0; i--) {
      e = W.cores[i];
      if (!e.alive) { W.scene.remove(e.mesh); W.cores.splice(i, 1); continue; }
      e.bob += dt;
      e.mesh.rotation.y += dt * e.spin;
      e.parts.core.rotation.y += dt * 1.8;
      e.parts.shell.rotation.x -= dt * 0.9; e.parts.shell.rotation.z += dt * 1.3;
      e.parts.r1.rotation.x += dt * 1.1; e.parts.r2.rotation.z -= dt * 1.5;
      e.mesh.position.y += Math.sin(e.bob * 1.7) * dt * 0.6;
      e.parts.core.material.emissiveIntensity = 0.9 + Math.sin(e.bob * 5) * 0.3 + (e.hitFlash > 0 ? e.hitFlash * 3 : 0);
      if (e.hitFlash > 0) { e.hitFlash -= dt * 6; e.mesh.scale.setScalar(1 + Math.max(0, e.hitFlash) * 0.15); }
    }
  }

  /* ============================== 守卫 ============================== */
  function updateWardens(dt, playing) {
    for (var i = W.wardens.length - 1; i >= 0; i--) {
      var e = W.wardens[i];
      if (!e.alive) { W.scene.remove(e.mesh); W.wardens.splice(i, 1); continue; }
      e.angle += dt * e.spinSpeed;
      e.parts.pivot.rotation.y = e.angle;
      var facing = Math.cos(((e.angle % 6.283) + 6.283) % 6.283);
      e.parts.plateGlow.material.opacity = 0.2 + Math.max(0, facing) * 0.45;
      e.parts.head.material.emissiveIntensity = 0.7 + Math.sin(W.time * 5) * 0.2 + (e.hitFlash > 0 ? e.hitFlash * 3 : 0);
      if (e.hitFlash > 0) { e.hitFlash -= dt * 6; e.mesh.scale.setScalar(1 + Math.max(0, e.hitFlash) * 0.08); }
      if (playing) {
        e.shootT -= dt;
        if (e.shootT <= 0) {
          e.shootT = 1.5 + Math.random() * 0.8;
          tmp.set(-e.mesh.position.x, 1.8 - (e.mesh.position.y + 2.4), -e.mesh.position.z).normalize();
          W.spawnBullet(e.mesh.position.x, e.mesh.position.y + 2.4, e.mesh.position.z,
            tmp.x, tmp.y, tmp.z, 26, { dmg: 13, color: 0xff3355, fromEnemy: true, life: 2.4, scale: 1.4 });
          TL.audio.play('hover');
        }
      }
    }
  }

  /* ============================== 裂隙 ============================== */
  function updateRifts(dt, playing) {
    for (var i = W.rifts.length - 1; i >= 0; i--) {
      var e = W.rifts[i];
      if (!e.alive) { W.scene.remove(e.mesh); W.rifts.splice(i, 1); continue; }
      e.parts.ring.rotation.x += dt * 2.2;
      e.parts.ring2.rotation.x -= dt * 3.1;
      e.parts.disc.scale.setScalar(1 + Math.sin(W.time * 6) * 0.06);
      if (playing) {
        e.t += dt;
        if (e.t >= e.interval && W.grunts.length < 26) {
          e.t = 0;
          var g = W.spawnGrunt(W.act, e.mesh.position.x - 1, e.mesh.position.z + (Math.random() - 0.5) * 3, Math.random() < 0.4, G.def);
          g.mesh.position.y = 1.15;
          W.burst(e.mesh.position.x, e.mesh.position.y, e.mesh.position.z, 12, { color: W.act.enemy, speed: 10, life: 0.4 });
          TL.audio.play('whoosh');
        }
      }
    }
  }

  /* ============================== 泰坦 ============================== */
  function updateTitan(dt, playing) {
    var titans = [W.titan, W.titan2];
    for (var t = 0; t < titans.length; t++) {
      var ti = titans[t]; if (!ti) continue;

      if (!ti.alive) {
        ti.deathT = (ti.deathT || 0) + dt;
        // 倒地交给 Death 动画，这里只做缓慢下沉和熄灭
        ti.mesh.position.y = M.lerp(ti.mesh.position.y, -0.55, Math.min(1, dt * 1.2));
        ti.core.material.opacity = Math.max(0, ti.core.material.opacity - dt * 1.2);
        if (ti.eye) ti.eye.material.opacity = Math.max(0, ti.eye.material.opacity - dt * 2.4);
        if (Math.random() < dt * 10) {
          W.burst(ti.mesh.position.x + (Math.random() - 0.5) * 6, 2 + Math.random() * 8, ti.mesh.position.z + (Math.random() - 0.5) * 6,
            6, { color: W.act.titan, speed: 10, life: 0.7 });
        }
        continue;
      }

      // 行军：位置 = 时间
      if (playing) {
        var p = M.clamp(G.elapsed / G.totalTime, 0, 1);
        var baseX = M.lerp(W.LANE.titanStart + (ti.big ? 0 : 8), W.LANE.titanEnd + (ti.big ? 0 : 3.2), p);
        ti.mesh.position.x = baseX;
      }

      /* 走路：骨骼动画驱动。
         把动画播放速度和 walkPhase 绑死，脚步声/震屏才会和抬脚落脚对得上。
         Walking 片段 0.96 秒走两步，所以一步 = π 相位。 */
      var pw = M.clamp(G.elapsed / G.totalTime, 0, 1);
      var ts = 0.78 + pw * 0.55;
      var wa = ti.actions && ti.actions.Walking;
      if (wa) wa.timeScale = ts;
      if (playing) ti.walkPhase += dt * ts * (2 / 0.96) * Math.PI;
      var wp = ti.walkPhase;
      ti.mesh.rotation.y = Math.sin(wp * 0.5) * 0.05;

      /* 进入最后 2 秒 = 举拳，给玩家一个明确的「要完蛋了」信号 */
      if (playing && ti.big) {
        var near = ti.mesh.position.x < W.LANE.titanEnd + 7.5;
        if (near && ti.anim !== 'Punch') { W.titanAnim(ti, 'Punch', 0.14); TL.audio.play('titanRoar', 1.15); }
        else if (!near && ti.anim !== 'Walking') W.titanAnim(ti, 'Walking', 0.2);
      }

      // 脚步声
      var stepPhase = Math.floor(wp / Math.PI);
      if (stepPhase !== ti.lastStep && playing) {
        ti.lastStep = stepPhase;
        TL.audio.play('titanStep');
        var prox = M.clamp(1 - (ti.mesh.position.x - W.LANE.titanEnd) / 40, 0, 1);
        W.addShake(0.08 + prox * 0.4);
        W.shockwave(ti.mesh.position.x - 1, 0.2, ti.mesh.position.z + (stepPhase % 2 ? 1.2 : -1.2), 9 * ti.scale, W.act.titan, 0.55);
        W.burst(ti.mesh.position.x - 1, 0.3, ti.mesh.position.z, 10, { color: W.act.titan, speed: 8, life: 0.6, up: 4 });
        TL.vibrate(Math.round(8 + prox * 26));
      }

      // 核心脉动
      var pulseR = 1 + Math.sin(W.time * 5) * 0.08;
      ti.core.scale.setScalar(pulseR + (ti.hitFlash > 0 ? ti.hitFlash * 0.4 : 0));
      ti.coreRing.rotation.z += dt * 1.6;
      ti.coreRing.scale.setScalar(1 + Math.sin(W.time * 3) * 0.1);
      ti.eye.material.opacity = 0.7 + Math.sin(W.time * 9) * 0.3;
      if (ti.hitFlash > 0) ti.hitFlash -= dt * 6;

      // 护盾壳
      if (ti.maxShieldHp > 0) {
        var sr = ti.shieldHp / ti.maxShieldHp;
        ti.shieldMesh.material.opacity = sr > 0 ? 0.16 + sr * 0.2 + (ti.hitFlash > 0 ? ti.hitFlash * 0.3 : 0) : 0;
        ti.shieldMesh.rotation.y += dt * 0.6;
        ti.shieldMesh.rotation.x += dt * 0.25;
      }

      // 燃烧
      if (ti.burnT > 0) {
        ti.burnT -= dt;
        ti.hp -= ti.burnDps * dt;
        if (Math.random() < dt * 10) {
          ti.core.getWorldPosition(tmp);
          W.burst(tmp.x + (Math.random() - 0.5) * 3, tmp.y + (Math.random() - 0.5) * 4, tmp.z + (Math.random() - 0.5) * 3, 1, { color: 0xff8822, speed: 3, life: 0.4, grav: -3 });
        }
        if (ti.hp <= 0 && ti.alive) { ti.hp = 0; onTitanDown(ti); }
      }

      // 回血机制
      if (playing && G.def.mech.regen && ti.hp > 0) {
        ti.hp = Math.min(ti.maxHp, ti.hp + ti.maxHp * 0.022 * dt);
      }

      // 走到面前 = 碾碎
      if (playing && ti.mesh.position.x <= W.LANE.titanEnd + 0.4) {
        lose('crushed');
      }
    }
  }

  /* ========================== 给 UI 的查询接口 ======================= */
  G.hudData = function () {
    var ti = W.titan;
    var remain = Math.max(0, G.totalTime - G.elapsed);
    return {
      remain: remain, total: G.totalTime, elapsed: G.elapsed,
      hp: ti ? ti.hp : 0, maxHp: ti ? ti.maxHp : 1,
      shieldHp: ti ? ti.shieldHp : 0, maxShieldHp: ti ? ti.maxShieldHp : 0,
      hp2: W.titan2 ? W.titan2.hp : -1, maxHp2: W.titan2 ? W.titan2.maxHp : 1,
      shield: G.shield, maxShield: G.maxShield,
      coins: G.coins, shards: G.shards, combo: G.combo,
      amps: G.ampsGot, dist: ti ? Math.max(0, ti.mesh.position.x - W.LANE.titanEnd) : 0,
      level: G.def ? G.def.n : 1, par: G.def ? G.def.par : 5
    };
  };

})(typeof window !== 'undefined' ? window : this);
