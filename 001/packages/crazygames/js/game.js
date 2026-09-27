/* =============================================================================
 *  ZOMBIE RUSH 3D  —  尸潮狂奔 3D
 *  Third-person auto-runner / 360° shooter.
 *  Engine: three.js r159 (UMD, classic script — works from file://)
 *  All geometry procedural. All audio synthesized. Zero external assets.
 * ========================================================================== */
(function () {
  'use strict';

  var TH = window.THREE;

  /* ========================================================== CONFIG */
  var CFG = {
    ROAD_HALF: 9.2,
    SEG_LEN: 40,
    SEG_COUNT: 9,
    BASE_SPEED: 17.5,
    SPEED_PER_LEVEL: 0.55,
    MAX_SPEED: 30,
    BULLET_SPEED: 78,
    BASE_FIRE: 8.6,
    BASE_DMG: 14,
    BASE_HP: 110,
    MAGNET: 4.5,
    VIEW_FAR: 210
  };

  var UPG = {
    hp:     { name: 'VITALITY',    icon: '❤', max: 6, cost: function (l) { return 120 + l * 150; }, desc: function (l) { return '+' + ((l + 1) * 20) + ' Max HP'; } },
    dmg:    { name: 'FIREPOWER',   icon: '🔥', max: 8, cost: function (l) { return 150 + l * 190; }, desc: function (l) { return '+' + ((l + 1) * 12) + '% Damage'; } },
    rate:   { name: 'RAPID FIRE',  icon: '⚡', max: 6, cost: function (l) { return 160 + l * 210; }, desc: function (l) { return '+' + ((l + 1) * 9) + '% Fire Rate'; } },
    crit:   { name: 'HEADHUNTER',  icon: '🎯', max: 5, cost: function (l) { return 200 + l * 240; }, desc: function (l) { return '+' + ((l + 1) * 6) + '% Crit'; } },
    magnet: { name: 'MAGNETIZE',   icon: '🧲', max: 4, cost: function (l) { return 110 + l * 130; }, desc: function (l) { return '+' + ((l + 1) * 2.5).toFixed(1) + ' Pickup Range'; } },
    shield: { name: 'NANO ARMOR',  icon: '🛡', max: 3, cost: function (l) { return 300 + l * 400; }, desc: function (l) { return 'Start with ' + (l + 1) + ' Shield'; } },
    luck:   { name: 'SCAVENGER',   icon: '💰', max: 5, cost: function (l) { return 180 + l * 200; }, desc: function (l) { return '+' + ((l + 1) * 15) + '% Coins'; } }
  };
  var UPG_ORDER = ['hp', 'dmg', 'rate', 'crit', 'magnet', 'shield', 'luck'];

  var ETYPE = {
    walker:  { hp: 26,  spd: 6.6,  dmg: 9,  col: 0x8fd46a, emis: 0x2e5520, sc: 1.00, coin: 2, score: 10 },
    runner:  { hp: 15,  spd: 12.8, dmg: 8,  col: 0xff8446, emis: 0x5e2208, sc: 0.92, coin: 3, score: 15 },
    crawler: { hp: 12,  spd: 10.6, dmg: 6,  col: 0xd6e07a, emis: 0x4a5018, sc: 0.72, coin: 2, score: 12 },
    brute:   { hp: 150, spd: 5.2,  dmg: 22, col: 0xc85c8c, emis: 0x551a33, sc: 1.75, coin: 12, score: 60 },
    spitter: { hp: 38,  spd: 5.4,  dmg: 10, col: 0x5fe8c4, emis: 0x11604a, sc: 1.05, coin: 5, score: 25 },
    bomber:  { hp: 30,  spd: 8.4,  dmg: 26, col: 0xffe14a, emis: 0x66540a, sc: 1.10, coin: 6, score: 30 }
  };

  var POWERS = [
    { id: 'dmg',    label: 'DAMAGE +30%', color: 0xff5533, icon: '🔥' },
    { id: 'rate',   label: 'FIRE RATE +25%', color: 0xffcc22, icon: '⚡' },
    { id: 'multi',  label: 'MULTI-SHOT +1', color: 0x33ddff, icon: '⁂' },
    { id: 'pierce', label: 'PIERCING', color: 0xcc66ff, icon: '⊕' },
    { id: 'homing', label: 'HOMING ROUNDS', color: 0x55ff99, icon: '◎' },
    { id: 'shield', label: 'SHIELD +1', color: 0x66aaff, icon: '🛡' },
    { id: 'heal',   label: 'MEDKIT +40HP', color: 0xff3366, icon: '✚' },
    { id: 'freeze', label: 'CRYO BLAST', color: 0x88eeff, icon: '❄' },
    { id: 'nuke',   label: 'AIRSTRIKE', color: 0xff8800, icon: '☢' },
    { id: 'coins',  label: 'COIN CACHE', color: 0xffd23f, icon: '💰' }
  ];

  var STREAKS = [
    [3, 'DOUBLE KILL'], [6, 'TRIPLE KILL'], [10, 'RAMPAGE'], [16, 'SLAUGHTER'],
    [24, 'MASSACRE'], [35, 'UNSTOPPABLE'], [50, 'GODLIKE'], [70, 'APOCALYPSE']
  ];

  /* ========================================================== SAVE */
  var SAVE_KEY = 'zr3d_save_v1';
  var save = {
    coins: 0, best: 0, bestLevel: 1, unlocked: 1,
    up: { hp: 0, dmg: 0, rate: 0, crit: 0, magnet: 0, shield: 0, luck: 0 },
    sfx: true, music: true, quality: 'auto', totalKills: 0, runs: 0
  };
  function loadSave() {
    try {
      var s = localStorage.getItem(SAVE_KEY);
      if (s) {
        var o = JSON.parse(s);
        for (var k in o) if (o.hasOwnProperty(k)) save[k] = o[k];
        if (!save.up) save.up = { hp: 0, dmg: 0, rate: 0, crit: 0, magnet: 0, shield: 0, luck: 0 };
        UPG_ORDER.forEach(function (k) { if (typeof save.up[k] !== 'number') save.up[k] = 0; });
      }
    } catch (e) {}
  }
  function writeSave() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) {} }

  /* ========================================================== DOM */
  function $(id) { return document.getElementById(id); }
  var dom = {};
  function cacheDom() {
    ['screenLoad', 'screenMenu', 'screenShop', 'screenIntro', 'screenPause', 'screenWin',
      'screenDead', 'hud', 'hpFill', 'hpText', 'shieldRow', 'lvlNum', 'progFill', 'coinNum',
      'comboWrap', 'comboNum', 'comboBar', 'fxLayer', 'flash', 'vignette', 'bossBar', 'bossFill',
      'bossName', 'powerRow', 'streakText', 'adOverlay', 'adSlotMenu', 'adSlotShop', 'adSlotResult',
      'menuCoins', 'menuBest', 'menuLevel', 'shopCoins', 'shopGrid', 'introLvl', 'introObj',
      'introBoss', 'winCoins', 'winKills', 'winScore', 'winLvl', 'deadLvl', 'deadScore', 'deadCoins',
      'btnPlay', 'btnShop', 'btnShopBack', 'btnIntroGo', 'btnIntroBoost', 'btnResume', 'btnQuit',
      'btnWinNext', 'btnWinDouble', 'btnDeadRevive', 'btnDeadRetry', 'btnDeadMenu', 'btnPause',
      'btnSfx', 'btnMusic', 'loadBar', 'loadPct', 'killQuota', 'btnShopFree', 'canvasWrap',
      'aimRing', 'touchHint', 'winStars', 'btnWinMenu', 'reviveCount', 'dmgFlash', 'bossWarn'
    ].forEach(function (id) { dom[id] = $(id); });
  }

  function show(el) { if (el) el.classList.add('on'); }
  function hide(el) { if (el) el.classList.remove('on'); }
  function hideAllScreens() {
    ['screenMenu', 'screenShop', 'screenIntro', 'screenPause', 'screenWin', 'screenDead'].forEach(function (k) { hide(dom[k]); });
  }

  /* ========================================================== THREE SETUP */
  var scene, camera, renderer, clock;
  var world;          // container that holds everything scrolling
  var player, playerGroup, gunL, gunR, legL, legR, armL, armR, torso, headMesh;
  var muzzleLight, playerLight;
  var GEO = {}, MAT = {};

  var state = 'boot';
  var timeScale = 1, hitStop = 0;
  var shake = 0, shakeDecay = 6;
  var camOffset = new TH.Vector3(0, 7.4, 11.2);

  function initThree() {
    var wrap = dom.canvasWrap;
    renderer = new TH.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(0x0b1220, 1);
    wrap.appendChild(renderer.domElement);

    scene = new TH.Scene();
    scene.fog = new TH.Fog(0x141f33, 78, CFG.VIEW_FAR);

    camera = new TH.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.5, 520);
    camera.position.set(0, 8, 12);

    clock = new TH.Clock();
    world = new TH.Group();
    scene.add(world);

    // lights
    var hemi = new TH.HemisphereLight(0x89b4e8, 0x2a1a16, 1.35);
    scene.add(hemi);
    var dir = new TH.DirectionalLight(0xdce8ff, 1.15);
    dir.position.set(-8, 24, 10);
    scene.add(dir);
    var rim = new TH.DirectionalLight(0xff5a70, 0.75);       // blood-moon rim
    rim.position.set(9, 8, -18);
    scene.add(rim);
    var fill = new TH.DirectionalLight(0x66e0ff, 0.45);      // neon bounce from the curbs
    fill.position.set(0, 3, 16);
    scene.add(fill);

    muzzleLight = new TH.PointLight(0xffaa44, 0, 22, 2);
    scene.add(muzzleLight);
    playerLight = new TH.PointLight(0x66ccff, 1.25, 26, 2);
    scene.add(playerLight);

    buildSharedAssets();
    buildRoad();
    buildPlayer();
    buildPools();
    buildSky();

    window.addEventListener('resize', onResize, false);
    onResize();
  }

  function onResize() {
    if (!renderer) return;
    var w = window.innerWidth, h = window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, window.innerWidth < 800 ? 1.4 : 1.6));
  }

  function buildSharedAssets() {
    GEO.box = new TH.BoxGeometry(1, 1, 1);
    GEO.sph = new TH.SphereGeometry(0.5, 10, 8);
    GEO.cyl = new TH.CylinderGeometry(0.5, 0.5, 1, 10);
    GEO.plane = new TH.PlaneGeometry(1, 1);
    GEO.cone = new TH.ConeGeometry(0.5, 1, 8);

    MAT.bulletCore = new TH.MeshBasicMaterial({ color: 0xfff2b0 });
    MAT.bulletCrit = new TH.MeshBasicMaterial({ color: 0xff66aa });
    MAT.bulletGlow = new TH.MeshBasicMaterial({ color: 0xffcc44, transparent: true, opacity: 0.45, blending: TH.AdditiveBlending, depthWrite: false });
    var sc = document.createElement('canvas'); sc.width = sc.height = 64;
    var sg = sc.getContext('2d');
    var rg = sg.createRadialGradient(32, 32, 0, 32, 32, 32);
    rg.addColorStop(0, 'rgba(0,0,0,0.85)');
    rg.addColorStop(0.55, 'rgba(0,0,0,0.42)');
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    sg.fillStyle = rg; sg.fillRect(0, 0, 64, 64);
    MAT.shadowTex = new TH.CanvasTexture(sc);
    MAT.shadow = new TH.MeshBasicMaterial({
      map: MAT.shadowTex, transparent: true, opacity: 0.55,
      depthWrite: false, color: 0x000000
    });
    MAT.shadow.__shared = true;
    MAT.spark = new TH.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: TH.AdditiveBlending, depthWrite: false });
  }

  /* ------------------------------------------------------------ SKY / ATMO */
  function buildSky() {
    // gradient dome
    var c = document.createElement('canvas'); c.width = 4; c.height = 256;
    var g = c.getContext('2d');
    var grd = g.createLinearGradient(0, 0, 0, 256);
    grd.addColorStop(0.0, '#060812');
    grd.addColorStop(0.45, '#14203a');
    grd.addColorStop(0.72, '#3a2038');
    grd.addColorStop(0.88, '#7a2a28');
    grd.addColorStop(1.0, '#2a1010');
    g.fillStyle = grd; g.fillRect(0, 0, 4, 256);
    var tex = new TH.CanvasTexture(c);
    var sky = new TH.Mesh(
      new TH.SphereGeometry(400, 16, 12),
      new TH.MeshBasicMaterial({ map: tex, side: TH.BackSide, fog: false, depthWrite: false })
    );
    scene.add(sky);

    // blood moon
    var moon = new TH.Mesh(
      new TH.CircleGeometry(26, 28),
      new TH.MeshBasicMaterial({ color: 0xff5a3c, fog: false, transparent: true, opacity: 0.92 })
    );
    moon.position.set(-90, 78, -320);
    scene.add(moon);
    var halo = new TH.Mesh(
      new TH.CircleGeometry(52, 28),
      new TH.MeshBasicMaterial({ color: 0xff3311, fog: false, transparent: true, opacity: 0.16, blending: TH.AdditiveBlending, depthWrite: false })
    );
    halo.position.set(-90, 78, -321);
    scene.add(halo);

    // drifting ash particles
    var pg = new TH.BufferGeometry();
    var N = 420, pos = new Float32Array(N * 3);
    for (var i = 0; i < N; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 90;
      pos[i * 3 + 1] = Math.random() * 40;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 220;
    }
    pg.setAttribute('position', new TH.BufferAttribute(pos, 3));
    ash = new TH.Points(pg, new TH.PointsMaterial({
      color: 0xffbb88, size: 0.17, transparent: true, opacity: 0.55, depthWrite: false, blending: TH.AdditiveBlending
    }));
    scene.add(ash);
  }
  var ash = null;

  /* ------------------------------------------------------------ ROAD */
  var segments = [];
  function makeSegment() {
    var g = new TH.Group();
    var L = CFG.SEG_LEN, W = CFG.ROAD_HALF * 2;

    var road = new TH.Mesh(GEO.box, new TH.MeshLambertMaterial({ color: 0x33373f }));
    road.scale.set(W, 0.6, L); road.position.y = -0.3;
    g.add(road);

    // center dashes
    for (var i = 0; i < 5; i++) {
      var d = new TH.Mesh(GEO.box, new TH.MeshBasicMaterial({ color: 0xc9b24a }));
      d.scale.set(0.34, 0.02, 3.2);
      d.position.set(0, 0.02, -L / 2 + 4 + i * 8);
      g.add(d);
    }
    // neon curbs
    [-1, 1].forEach(function (s) {
      var curb = new TH.Mesh(GEO.box, new TH.MeshLambertMaterial({ color: 0x272b34 }));
      curb.scale.set(1.1, 1.0, L);
      curb.position.set(s * (CFG.ROAD_HALF + 0.55), 0.2, 0);
      g.add(curb);
      var neon = new TH.Mesh(GEO.box, new TH.MeshBasicMaterial({ color: 0x35e0ff }));
      neon.scale.set(0.16, 0.08, L - 1);
      neon.position.set(s * (CFG.ROAD_HALF + 0.06), 0.72, 0);
      g.add(neon);
      g.userData['neon' + s] = neon;
    });

    // side scenery
    var deco = new TH.Group();
    for (var k = 0; k < 7; k++) {
      var side = Math.random() < 0.5 ? -1 : 1;
      var t = Math.random();
      var m;
      if (t < 0.45) {                      // ruined building
        var h = 8 + Math.random() * 26;
        m = new TH.Mesh(GEO.box, new TH.MeshLambertMaterial({ color: new TH.Color().setHSL(0.6, 0.16, 0.16 + Math.random() * 0.09) }));
        m.scale.set(6 + Math.random() * 9, h, 6 + Math.random() * 10);
        m.position.set(side * (CFG.ROAD_HALF + 6 + Math.random() * 16), h / 2 - 1, -L / 2 + Math.random() * L);
        // lit windows
        for (var wI = 0; wI < 5; wI++) {
          var win = new TH.Mesh(GEO.plane, new TH.MeshBasicMaterial({
            color: Math.random() < 0.5 ? 0xffcf7a : 0x7fd0ff, transparent: true, opacity: 0.75 + Math.random() * 0.25, fog: false
          }));
          win.scale.set(0.9, 1.3, 1);
          win.position.set(-side * (m.scale.x / 2 + 0.06) * side, (Math.random() - 0.3) * m.scale.y * 0.7, (Math.random() - 0.5) * m.scale.z * 0.7);
          win.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
          win.position.x = -side * (m.scale.x / 2 + 0.05);
          m.add(win);
          win.scale.set(0.9 / m.scale.x, 1.3 / m.scale.y, 1);
        }
      } else if (t < 0.7) {                // wrecked car
        m = new TH.Group();
        var body = new TH.Mesh(GEO.box, new TH.MeshLambertMaterial({ color: new TH.Color().setHSL(Math.random(), 0.4, 0.22) }));
        body.scale.set(2.1, 1.0, 4.4); body.position.y = 0.6; m.add(body);
        var cab = new TH.Mesh(GEO.box, new TH.MeshLambertMaterial({ color: 0x0d1014 }));
        cab.scale.set(1.8, 0.8, 2.0); cab.position.set(0, 1.45, -0.2); m.add(cab);
        m.position.set(side * (CFG.ROAD_HALF + 2.5 + Math.random() * 6), 0, -L / 2 + Math.random() * L);
        m.rotation.y = Math.random() * Math.PI;
      } else if (t < 0.87) {               // street lamp
        m = new TH.Group();
        var pole = new TH.Mesh(GEO.cyl, new TH.MeshLambertMaterial({ color: 0x2a2f38 }));
        pole.scale.set(0.22, 9, 0.22); pole.position.y = 4.5; m.add(pole);
        var head = new TH.Mesh(GEO.box, new TH.MeshBasicMaterial({ color: 0xffd9a0 }));
        head.scale.set(1.4, 0.22, 0.6); head.position.set(-side * 0.7, 8.9, 0); m.add(head);
        m.position.set(side * (CFG.ROAD_HALF + 1.6), 0, -L / 2 + Math.random() * L);
      } else {                             // barricade
        m = new TH.Group();
        for (var bI = 0; bI < 3; bI++) {
          var bar = new TH.Mesh(GEO.box, new TH.MeshLambertMaterial({ color: bI % 2 ? 0xd94f3a : 0xe8e3d0 }));
          bar.scale.set(2.6, 0.32, 0.25);
          bar.position.set(0, 0.5 + bI * 0.45, 0);
          m.add(bar);
        }
        m.position.set(side * (CFG.ROAD_HALF + 1.9), 0, -L / 2 + Math.random() * L);
        m.rotation.y = (Math.random() - 0.5) * 0.7;
      }
      deco.add(m);
    }
    g.add(deco);
    return g;
  }

  function buildRoad() {
    for (var i = 0; i < CFG.SEG_COUNT; i++) {
      var s = makeSegment();
      s.position.z = -i * CFG.SEG_LEN;
      segments.push(s);
      world.add(s);
    }
  }

  function recycleRoad() {
    var behind = player.position.z + CFG.SEG_LEN * 1.6;
    for (var i = 0; i < segments.length; i++) {
      if (segments[i].position.z > behind) {
        segments[i].position.z -= CFG.SEG_COUNT * CFG.SEG_LEN;
      }
    }
  }

  /* ------------------------------------------------------------ PLAYER */
  function buildPlayer() {
    player = new TH.Group();
    playerGroup = new TH.Group();
    player.add(playerGroup);
    world.add(player);

    var skin = new TH.MeshLambertMaterial({ color: 0xe8b48c });
    var jacket = new TH.MeshLambertMaterial({ color: 0x2e4f74, emissive: 0x081422 });
    var pants = new TH.MeshLambertMaterial({ color: 0x23282f });
    var metal = new TH.MeshLambertMaterial({ color: 0x33383f, emissive: 0x0a0c10 });

    torso = new TH.Mesh(GEO.box, jacket);
    torso.scale.set(0.95, 1.15, 0.6); torso.position.y = 1.5;
    playerGroup.add(torso);

    var vest = new TH.Mesh(GEO.box, new TH.MeshLambertMaterial({ color: 0x1b2430, emissive: 0x0a1a28 }));
    vest.scale.set(1.02, 0.7, 0.68); vest.position.y = 1.62;
    playerGroup.add(vest);

    headMesh = new TH.Mesh(GEO.box, skin);
    headMesh.scale.set(0.55, 0.58, 0.55); headMesh.position.y = 2.38;
    playerGroup.add(headMesh);

    var cap = new TH.Mesh(GEO.box, new TH.MeshLambertMaterial({ color: 0x1d2a1d }));
    cap.scale.set(0.6, 0.2, 0.6); cap.position.y = 2.72;
    playerGroup.add(cap);
    var visor = new TH.Mesh(GEO.box, new TH.MeshBasicMaterial({ color: 0x35e0ff }));
    visor.scale.set(0.5, 0.09, 0.08); visor.position.set(0, 2.42, 0.3);
    playerGroup.add(visor);

    armL = new TH.Mesh(GEO.box, jacket); armL.scale.set(0.26, 0.85, 0.26);
    armR = new TH.Mesh(GEO.box, jacket); armR.scale.set(0.26, 0.85, 0.26);
    armL.position.set(-0.62, 1.55, 0); armR.position.set(0.62, 1.55, 0);
    playerGroup.add(armL); playerGroup.add(armR);

    legL = new TH.Mesh(GEO.box, pants); legL.scale.set(0.3, 0.95, 0.3); legL.position.set(-0.26, 0.5, 0);
    legR = new TH.Mesh(GEO.box, pants); legR.scale.set(0.3, 0.95, 0.3); legR.position.set(0.26, 0.5, 0);
    playerGroup.add(legL); playerGroup.add(legR);

    // upper body pivots independently (aims at cursor)
    aimPivot = new TH.Group();
    aimPivot.position.y = 0;
    playerGroup.add(aimPivot);
    aimPivot.add(torso); aimPivot.add(vest); aimPivot.add(headMesh); aimPivot.add(cap);
    aimPivot.add(visor); aimPivot.add(armL); aimPivot.add(armR);

    gunR = new TH.Group();
    var gb = new TH.Mesh(GEO.box, metal); gb.scale.set(0.2, 0.24, 1.35); gb.position.z = 0.5; gunR.add(gb);
    var gbar = new TH.Mesh(GEO.cyl, metal); gbar.scale.set(0.07, 0.9, 0.07); gbar.rotation.x = Math.PI / 2; gbar.position.z = 1.25; gunR.add(gbar);
    var gmag = new TH.Mesh(GEO.box, new TH.MeshLambertMaterial({ color: 0x18351f, emissive: 0x0a2010 }));
    gmag.scale.set(0.16, 0.42, 0.28); gmag.position.set(0, -0.3, 0.35); gunR.add(gmag);
    var gsight = new TH.Mesh(GEO.box, new TH.MeshBasicMaterial({ color: 0xff4444 }));
    gsight.scale.set(0.06, 0.06, 0.06); gsight.position.set(0, 0.2, 0.9); gunR.add(gsight);
    gunR.position.set(0.62, 1.42, 0.3);
    aimPivot.add(gunR);

    muzzleFlash = new TH.Mesh(GEO.cone, new TH.MeshBasicMaterial({
      color: 0xffdd77, transparent: true, opacity: 0, blending: TH.AdditiveBlending, depthWrite: false
    }));
    muzzleFlash.scale.set(0.30, 0.55, 0.30);
    muzzleFlash.rotation.x = Math.PI / 2;
    muzzleFlash.position.set(0, 0, 1.45);
    gunR.add(muzzleFlash);

    // blob shadow
    playerShadow = new TH.Mesh(GEO.plane, MAT.shadow.clone());
    playerShadow.rotation.x = -Math.PI / 2;
    playerShadow.scale.set(2.0, 2.6, 1);
    playerShadow.position.y = 0.03;
    player.add(playerShadow);

    // shield bubble
    shieldMesh = new TH.Mesh(new TH.SphereGeometry(1.7, 16, 12), new TH.MeshBasicMaterial({
      color: 0x66bbff, transparent: true, opacity: 0.0, blending: TH.AdditiveBlending, depthWrite: false, side: TH.DoubleSide
    }));
    shieldMesh.position.y = 1.4;
    player.add(shieldMesh);
  }
  var aimPivot, muzzleFlash, playerShadow, shieldMesh;

  /* ------------------------------------------------------------ POOLS */
  var bullets = [], enemies = [], crates = [], coins = [], parts = [], eprojs = [], gibs = [];
  var POOL = { bullet: [], enemy: [], coin: [], part: [], eproj: [] };

  function buildPools() {
    var i;
    for (i = 0; i < 160; i++) POOL.bullet.push(makeBullet());
    for (i = 0; i < 90; i++) POOL.coin.push(makeCoin());
    for (i = 0; i < 260; i++) POOL.part.push(makePart());
    for (i = 0; i < 40; i++) POOL.eproj.push(makeEProj());
  }

  function makeBullet() {
    var g = new TH.Group();
    var core = new TH.Mesh(GEO.box, MAT.bulletCore);
    core.scale.set(0.13, 0.13, 1.1);
    g.add(core);
    var glow = new TH.Mesh(GEO.box, MAT.bulletGlow);
    glow.scale.set(0.34, 0.34, 1.9);
    g.add(glow);
    g.visible = false;
    world.add(g);
    g.userData = { core: core, glow: glow };
    return g;
  }

  function makeCoin() {
    var m = new TH.Mesh(GEO.cyl, new TH.MeshLambertMaterial({ color: 0xffce34, emissive: 0x6b4a00 }));
    m.scale.set(0.34, 0.09, 0.34);
    m.rotation.z = Math.PI / 2;
    m.visible = false;
    world.add(m);
    return m;
  }

  function makePart() {
    var m = new TH.Mesh(GEO.box, MAT.spark.clone());
    m.visible = false;
    world.add(m);
    return m;
  }

  function makeEProj() {
    var g = new TH.Group();
    var c = new TH.Mesh(GEO.sph, new TH.MeshBasicMaterial({ color: 0x8fff5a }));
    c.scale.set(0.8, 0.8, 0.8); g.add(c);
    var h = new TH.Mesh(GEO.sph, new TH.MeshBasicMaterial({ color: 0x4faa22, transparent: true, opacity: 0.4, blending: TH.AdditiveBlending, depthWrite: false }));
    h.scale.set(1.7, 1.7, 1.7); g.add(h);
    g.visible = false;
    world.add(g);
    return g;
  }

  /* ------------------------------------------------------------ ENEMY MODEL */
  /* Enemy rigs are pooled per type. Building ~14 meshes + 3 materials for
     every zombie would thrash the GC once the horde gets thick, so dead
     zombies are reset and recycled instead of disposed. */
  var EPOOL = {};

  function acquireEnemyModel(type) {
    var arr = EPOOL[type] || (EPOOL[type] = []);
    var g = arr.pop();
    if (!g) return makeEnemyModel(type);
    var d = ETYPE[type];
    g.scale.setScalar(d.sc);
    g.rotation.set(0, 0, 0);
    g.position.set(0, 0, 0);
    g.visible = true;
    var pt = g.userData.parts;
    pt.mats.forEach(function (m, k) { m.emissive.setHex(k === 2 ? 0x2a0808 : d.emis); });
    pt.lL.rotation.set(0, 0, 0); pt.lR.rotation.set(0, 0, 0);
    pt.aL.rotation.set(-1.15, 0, 0); pt.aR.rotation.set(-1.15, 0, 0);
    pt.torso.rotation.set(type === 'crawler' ? 1.2 : 0, 0, 0);
    return g;
  }

  function releaseEnemy(e) {
    var t = e.userData.type;
    if (e.userData.boss || !ETYPE[t]) { disposeGroup(e); return; }
    var arr = EPOOL[t] || (EPOOL[t] = []);
    if (arr.length >= 30) { disposeGroup(e); return; }
    var parts = e.userData.parts;
    e.userData = { parts: parts, type: t };
    arr.push(e);
  }

  function makeEnemyModel(type) {
    var d = ETYPE[type];
    var g = new TH.Group();
    var body = new TH.MeshLambertMaterial({ color: d.col, emissive: d.emis });
    var dark = new TH.MeshLambertMaterial({ color: new TH.Color(d.col).multiplyScalar(0.55), emissive: d.emis });
    var flesh = new TH.MeshLambertMaterial({ color: 0x8c3a3a, emissive: 0x2a0808 });

    var torso = new TH.Mesh(GEO.box, body);
    torso.scale.set(0.9, 1.1, 0.55); torso.position.y = 1.45;
    g.add(torso);

    var head = new TH.Mesh(GEO.box, body);
    head.scale.set(0.52, 0.55, 0.52); head.position.y = 2.28;
    g.add(head);

    // glowing eyes
    var eyes = new TH.Mesh(GEO.box, new TH.MeshBasicMaterial({ color: type === 'brute' ? 0xff2200 : 0xffee33 }));
    eyes.scale.set(0.38, 0.08, 0.05); eyes.position.set(0, 2.32, 0.28);
    g.add(eyes);

    // exposed ribs / gore
    var gore = new TH.Mesh(GEO.box, flesh);
    gore.scale.set(0.5, 0.3, 0.58); gore.position.set(0.12, 1.55, 0.05);
    g.add(gore);

    var aL = new TH.Mesh(GEO.box, dark); aL.scale.set(0.24, 0.8, 0.24);
    var aR = new TH.Mesh(GEO.box, dark); aR.scale.set(0.24, 0.8, 0.24);
    aL.position.set(-0.6, 1.62, 0.42); aR.position.set(0.6, 1.62, 0.42);
    aL.rotation.x = -1.15; aR.rotation.x = -1.15;
    g.add(aL); g.add(aR);

    var lL = new TH.Mesh(GEO.box, dark); lL.scale.set(0.28, 0.9, 0.28); lL.position.set(-0.24, 0.47, 0);
    var lR = new TH.Mesh(GEO.box, dark); lR.scale.set(0.28, 0.9, 0.28); lR.position.set(0.24, 0.47, 0);
    g.add(lL); g.add(lR);

    if (type === 'brute') {
      var sh = new TH.Mesh(GEO.box, dark);
      sh.scale.set(1.5, 0.45, 0.8); sh.position.y = 2.0; g.add(sh);
      var spikes = new TH.Mesh(GEO.cone, new TH.MeshLambertMaterial({ color: 0xdddddd }));
      spikes.scale.set(0.3, 0.7, 0.3); spikes.position.set(-0.7, 2.35, 0); spikes.rotation.z = 0.4; g.add(spikes);
      var spikes2 = spikes.clone(); spikes2.position.x = 0.7; spikes2.rotation.z = -0.4; g.add(spikes2);
    }
    if (type === 'spitter') {
      var sac = new TH.Mesh(GEO.sph, new TH.MeshBasicMaterial({ color: 0x9dff5c, transparent: true, opacity: 0.85 }));
      sac.scale.set(0.9, 0.8, 0.9); sac.position.set(0, 1.9, -0.4); g.add(sac);
    }
    if (type === 'bomber') {
      var barrel = new TH.Mesh(GEO.cyl, new TH.MeshLambertMaterial({ color: 0xd8c040, emissive: 0x554400 }));
      barrel.scale.set(0.62, 1.0, 0.62); barrel.position.set(0, 1.5, -0.5); g.add(barrel);
    }
    if (type === 'crawler') {
      g.children.forEach(function (c) { c.position.y *= 0.55; });
      torso.rotation.x = 1.2;
    }

    var sd = new TH.Mesh(GEO.plane, MAT.shadow.clone());
    sd.rotation.x = -Math.PI / 2; sd.scale.set(1.5, 2.0, 1); sd.position.y = 0.02;
    g.add(sd);

    g.userData.parts = { torso: torso, head: head, aL: aL, aR: aR, lL: lL, lR: lR, eyes: eyes, mats: [body, dark, flesh] };
    g.scale.setScalar(d.sc);
    return g;
  }

  /* ------------------------------------------------------------ CRATE */
  var labelCache = {};
  function makeLabelTexture(text, hex) {
    var key = text + '|' + hex;
    if (labelCache[key]) return labelCache[key];
    var c = document.createElement('canvas');
    c.width = 256; c.height = 64;
    var g = c.getContext('2d');
    g.clearRect(0, 0, 256, 64);
    g.font = 'bold 30px "Arial Black", Impact, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 7; g.strokeStyle = 'rgba(0,0,0,0.92)';
    g.strokeText(text, 128, 34);
    g.fillStyle = hex;
    g.fillText(text, 128, 34);
    var t = new TH.CanvasTexture(c);
    t.minFilter = TH.LinearFilter;
    labelCache[key] = t;
    return t;
  }

  function makeCrate(power, hp, side, z) {
    var g = new TH.Group();
    var col = power.color;
    var shell = new TH.Mesh(GEO.box, new TH.MeshLambertMaterial({
      color: col, emissive: new TH.Color(col).multiplyScalar(0.22), transparent: true, opacity: 0.55
    }));
    shell.scale.set(2.3, 2.3, 2.3);
    g.add(shell);
    var core = new TH.Mesh(GEO.sph, new TH.MeshBasicMaterial({ color: col }));
    core.scale.set(1.1, 1.1, 1.1);
    g.add(core);
    var ring = new TH.Mesh(new TH.TorusGeometry(1.6, 0.09, 6, 22), new TH.MeshBasicMaterial({ color: col }));
    ring.rotation.x = Math.PI / 2;
    g.add(ring);

    var spr = new TH.Sprite(new TH.SpriteMaterial({
      map: makeLabelTexture(power.label, '#' + new TH.Color(col).getHexString()), depthTest: false, transparent: true
    }));
    spr.scale.set(4.3, 1.08, 1);
    spr.position.y = 2.75;
    g.add(spr);

    // hp bar
    var barBg = new TH.Mesh(GEO.plane, new TH.MeshBasicMaterial({ color: 0x220000, depthTest: false, transparent: true, opacity: 0.8 }));
    barBg.scale.set(2.6, 0.26, 1); barBg.position.y = 1.95;
    g.add(barBg);
    var barFg = new TH.Mesh(GEO.plane, new TH.MeshBasicMaterial({ color: col, depthTest: false }));
    barFg.scale.set(2.5, 0.17, 1); barFg.position.y = 1.95; barFg.position.z = 0.01;
    g.add(barFg);

    g.position.set(side * (CFG.ROAD_HALF - 2.1), 2.4, z);
    g.userData = {
      power: power, hp: hp, maxHp: hp, core: core, shell: shell, ring: ring,
      barFg: barFg, spr: spr, phase: Math.random() * 6.28, dead: false
    };
    world.add(g);
    crates.push(g);
    return g;
  }

  /* ========================================================== RUN STATE */
  var R = null;
  function newRun(level) {
    R = {
      level: level,
      hp: CFG.BASE_HP + save.up.hp * 20,
      maxHp: CFG.BASE_HP + save.up.hp * 20,
      shields: save.up.shield,
      dmgMul: 1 + save.up.dmg * 0.12,
      rateMul: 1 + save.up.rate * 0.09,
      crit: 0.04 + save.up.crit * 0.06,
      magnet: CFG.MAGNET + save.up.magnet * 2.5,
      coinMul: 1 + save.up.luck * 0.15,
      multi: 1, pierce: 0, homing: 0,
      boost: false,
      speed: Math.min(CFG.MAX_SPEED, CFG.BASE_SPEED + (level - 1) * CFG.SPEED_PER_LEVEL),
      dist: 0,
      target: levelDistance(level),
      kills: 0, coinsRun: 0, score: 0,
      combo: 0, comboT: 0, streakIdx: 0,
      fireT: 0, iframe: 0, freeze: 0,
      spawnT: 0.8, crateT: 2.2,
      boss: null, bossPhase: 0, bossPending: isBossLevel(level),
      bossSpawned: false,
      finished: false, dead: false,
      elapsed: 0, hitTaken: 0, lowBeat: 0, revived: false
    };
    if (R.boost) {}
    return R;
  }
  function isBossLevel(l) { return l % 5 === 0; }
  function levelDistance(l) {
    if (isBossLevel(l)) return 480 + l * 26;
    return 620 + (l - 1) * 72;
  }
  function levelKillQuota(l) { return 18 + (l - 1) * 6; }

  /* ========================================================== INPUT */
  var pointer = { x: 0, y: 0, ndc: new TH.Vector2(0, 0), active: false, has: false };
  var keys = {};
  var ray = new TH.Raycaster();
  var aimPlane = new TH.Plane(new TH.Vector3(0, 1, 0), -1.35);
  var aimPoint = new TH.Vector3();
  var aimDir = new TH.Vector3(0, 0, -1);

  function setupInput() {
    var el = renderer.domElement;
    function upd(cx, cy) {
      pointer.x = cx; pointer.y = cy;
      pointer.ndc.x = (cx / window.innerWidth) * 2 - 1;
      pointer.ndc.y = -(cy / window.innerHeight) * 2 + 1;
      pointer.has = true;
      if (dom.aimRing) {
        dom.aimRing.style.transform = 'translate(' + (cx - 26) + 'px,' + (cy - 26) + 'px)';
      }
    }
    window.addEventListener('mousemove', function (e) { upd(e.clientX, e.clientY); }, { passive: true });
    window.addEventListener('mousedown', function (e) { pointer.active = true; upd(e.clientX, e.clientY); }, { passive: true });
    window.addEventListener('mouseup', function () { pointer.active = false; }, { passive: true });

    el.addEventListener('touchstart', function (e) {
      pointer.active = true;
      if (e.touches[0]) upd(e.touches[0].clientX, e.touches[0].clientY);
      if (dom.touchHint) dom.touchHint.style.opacity = 0;
      e.preventDefault();
    }, { passive: false });
    el.addEventListener('touchmove', function (e) {
      if (e.touches[0]) upd(e.touches[0].clientX, e.touches[0].clientY);
      e.preventDefault();
    }, { passive: false });
    el.addEventListener('touchend', function (e) { pointer.active = false; e.preventDefault(); }, { passive: false });

    window.addEventListener('keydown', function (e) {
      keys[e.code] = true;
      if (e.code === 'Escape' || e.code === 'KeyP') togglePause();
      if (e.code === 'Space' && state === 'menu') startGame(save.unlocked);
    });
    window.addEventListener('keyup', function (e) { keys[e.code] = false; });
    window.addEventListener('blur', function () { if (state === 'playing') togglePause(true); });
  }

  function updateAim() {
    if (!pointer.has) {
      aimDir.set(0, 0, -1);
      return;
    }
    ray.setFromCamera(pointer.ndc, camera);
    aimPlane.constant = -(player.position.y + 1.35);
    var hit = ray.ray.intersectPlane(aimPlane, aimPoint);
    if (hit) {
      aimDir.set(aimPoint.x - player.position.x, 0, aimPoint.z - player.position.z);
    } else {
      // pointer is above the horizon -> aim along the camera ray's ground
      // projection instead of snapping to straight-forward (avoids a jarring flick)
      aimDir.set(ray.ray.direction.x, 0, ray.ray.direction.z);
    }
    if (aimDir.lengthSq() < 0.0001) aimDir.set(0, 0, -1);
    aimDir.normalize();

    /* --- aim assist ---------------------------------------------------
     * Gentle magnetism toward whatever is closest to the crosshair. Makes
     * touch aiming feel accurate without ever taking control away: it only
     * engages inside a ~12 degree cone and never snaps fully. */
    if (state !== 'playing' || !R) return;
    var curAng = Math.atan2(aimDir.x, aimDir.z);
    var best = null, bestScore = 1e9;
    var CONE = 0.28;
    for (var i = 0; i < enemies.length; i++) {
      var e = enemies[i];
      if (e.userData.dead) continue;
      var dx = e.position.x - player.position.x, dz = e.position.z - player.position.z;
      var d = Math.hypot(dx, dz);
      if (d > 58 || d < 2.5) continue;
      var a = Math.atan2(dx, dz);
      var diff = Math.abs(((a - curAng + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI);
      if (diff > CONE) continue;
      var score = diff * 5 + d * 0.012 - (e.userData.boss ? 0.4 : 0);
      if (score < bestScore) { bestScore = score; best = { x: dx / d, z: dz / d, diff: diff }; }
    }
    if (best) {
      var k = 0.55 * (1 - best.diff / CONE);
      aimDir.x += (best.x - aimDir.x) * k;
      aimDir.z += (best.z - aimDir.z) * k;
      aimDir.normalize();
    }
  }

  /* ========================================================== FX */
  function spawnPart(x, y, z, col, size, vx, vy, vz, life, add) {
    var p = POOL.part.pop();
    if (!p) return null;
    p.visible = true;
    p.position.set(x, y, z);
    p.scale.setScalar(size);
    p.material.color.setHex(col);
    p.material.opacity = 1;
    p.material.blending = add === false ? TH.NormalBlending : TH.AdditiveBlending;
    p.userData = { vx: vx, vy: vy, vz: vz, life: life, max: life, size: size, grav: add === false ? -26 : -6 };
    p.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
    parts.push(p);
    return p;
  }

  function burst(x, y, z, col, n, spd, size, life, solid) {
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2, b = Math.random() * Math.PI - Math.PI / 2;
      var s = spd * (0.4 + Math.random() * 0.9);
      spawnPart(x, y, z, col, size * (0.55 + Math.random() * 0.9),
        Math.cos(a) * Math.cos(b) * s, Math.abs(Math.sin(b)) * s * 0.9 + 2, Math.sin(a) * Math.cos(b) * s,
        life * (0.6 + Math.random() * 0.7), !solid);
    }
  }

  function updateParts(dt) {
    for (var i = parts.length - 1; i >= 0; i--) {
      var p = parts[i], u = p.userData;
      u.life -= dt;
      if (u.life <= 0) {
        p.visible = false; parts.splice(i, 1); POOL.part.push(p); continue;
      }
      u.vy += u.grav * dt;
      p.position.x += u.vx * dt;
      p.position.y += u.vy * dt;
      p.position.z += u.vz * dt;
      if (p.position.y < 0.05) { p.position.y = 0.05; u.vy *= -0.32; u.vx *= 0.7; u.vz *= 0.7; }
      var f = u.life / u.max;
      p.material.opacity = Math.min(1, f * 1.6);
      p.scale.setScalar(u.size * (0.35 + f * 0.75));
      p.rotation.x += dt * 6; p.rotation.y += dt * 5;
    }
  }

  /* --- floating damage / text ------------------------------------------- */
  var textPool = [], texts = [];
  function initText() {
    for (var i = 0; i < 26; i++) {
      var d = document.createElement('div');
      d.className = 'dmgnum';
      dom.fxLayer.appendChild(d);
      textPool.push(d);
    }
  }
  var _v = new TH.Vector3();
  function floatText(x, y, z, txt, cls, scale) {
    var d = textPool.pop();
    if (!d) return;
    d.textContent = txt;
    d.className = 'dmgnum ' + (cls || '');
    d.style.opacity = '1';
    texts.push({ el: d, x: x, y: y, z: z, t: 0, life: 0.85, vy: 3.4, sc: scale || 1, ox: (Math.random() - 0.5) * 14 });
  }
  function updateTexts(dt) {
    for (var i = texts.length - 1; i >= 0; i--) {
      var t = texts[i];
      t.t += dt;
      t.y += t.vy * dt; t.vy -= 4.2 * dt;
      if (t.t >= t.life) {
        t.el.style.opacity = '0';
        textPool.push(t.el); texts.splice(i, 1); continue;
      }
      _v.set(t.x, t.y, t.z).project(camera);
      if (_v.z > 1) { t.el.style.opacity = '0'; continue; }
      var sx = (_v.x * 0.5 + 0.5) * window.innerWidth + t.ox;
      var sy = (-_v.y * 0.5 + 0.5) * window.innerHeight;
      var f = 1 - t.t / t.life;
      var pop = t.t < 0.1 ? 1 + (0.1 - t.t) * 5 : 1;
      t.el.style.transform = 'translate(-50%,-50%) translate(' + sx + 'px,' + sy + 'px) scale(' + (t.sc * pop * (0.7 + f * 0.45)) + ')';
      t.el.style.opacity = String(Math.min(1, f * 2.2));
    }
  }

  function doShake(a) { shake = Math.min(1.6, shake + a); }
  function doHitStop(t) { hitStop = Math.max(hitStop, t); }
  function flashScreen(col, a, dur) {
    if (!dom.flash) return;
    dom.flash.style.background = col;
    dom.flash.style.opacity = a;
    dom.flash.style.transition = 'opacity ' + (dur || 0.18) + 's ease-out';
    setTimeout(function () { dom.flash.style.opacity = 0; }, 16);
  }
  function vibrate(ms) { try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) {} }

  /* ========================================================== SHOOTING */
  var _bd = new TH.Vector3();
  function fire() {
    var n = R.multi;
    var spread = n > 1 ? 0.085 : 0;
    var baseAng = Math.atan2(aimDir.x, aimDir.z);
    for (var i = 0; i < n; i++) {
      var off = (i - (n - 1) / 2) * spread;
      var a = baseAng + off + (Math.random() - 0.5) * 0.022;
      spawnBullet(Math.sin(a), Math.cos(a));
    }
    AE.shoot(R.dmgMul);
    AE.shell();
    muzzleFlash.material.opacity = 1;
    muzzleFlash.scale.set(0.26 + Math.random() * 0.13, 0.42 + Math.random() * 0.3, 0.26 + Math.random() * 0.13);
    muzzleLight.intensity = 3.2;
    muzzleLight.position.set(
      player.position.x + aimDir.x * 2.2,
      1.6,
      player.position.z + aimDir.z * 2.2
    );
    doShake(0.055 + R.multi * 0.008);
    // recoil
    aimPivot.position.z = -0.14;
    // smoke
    if (Math.random() < 0.4) {
      spawnPart(player.position.x + aimDir.x * 2.3, 1.55, player.position.z + aimDir.z * 2.3,
        0x777777, 0.28, aimDir.x * 3 + (Math.random() - .5), 1.6, aimDir.z * 3 + (Math.random() - .5), 0.38);
    }
  }

  function spawnBullet(dx, dz) {
    var b = POOL.bullet.pop();
    if (!b) return;
    b.visible = true;
    b.position.set(player.position.x + dx * 1.6, 1.42, player.position.z + dz * 1.6);
    b.rotation.y = Math.atan2(dx, dz);
    var crit = Math.random() < R.crit;
    var dmg = CFG.BASE_DMG * R.dmgMul * (R.boost ? 2 : 1) * (crit ? 2.6 : 1);
    b.userData.vx = dx * CFG.BULLET_SPEED;
    b.userData.vz = dz * CFG.BULLET_SPEED;
    b.userData.life = 1.5;
    b.userData.dmg = dmg;
    b.userData.crit = crit;
    b.userData.pierce = R.pierce;
    b.userData.hitSet = [];
    var col = crit ? 0xff66aa : (R.boost ? 0xff8822 : 0xfff2b0);
    b.userData.core.material = crit ? MAT.bulletCrit : MAT.bulletCore;
    b.userData.glow.material.color.setHex(col);
    b.scale.setScalar(crit ? 1.45 : 1);
    bullets.push(b);
  }

  function killBullet(i) {
    var b = bullets[i];
    b.visible = false;
    bullets.splice(i, 1);
    POOL.bullet.push(b);
  }

  function updateBullets(dt) {
    for (var i = bullets.length - 1; i >= 0; i--) {
      var b = bullets[i], u = b.userData;
      u.life -= dt;
      if (u.life <= 0) { killBullet(i); continue; }

      if (R.homing > 0) {
        var tgt = nearestEnemy(b.position, 16);
        if (tgt) {
          var tx = tgt.position.x - b.position.x, tz = tgt.position.z - b.position.z;
          var l = Math.hypot(tx, tz) || 1;
          var hs = 4.2 * R.homing * dt;
          u.vx += (tx / l) * CFG.BULLET_SPEED * hs;
          u.vz += (tz / l) * CFG.BULLET_SPEED * hs;
          var sp = Math.hypot(u.vx, u.vz) || 1;
          u.vx = u.vx / sp * CFG.BULLET_SPEED;
          u.vz = u.vz / sp * CFG.BULLET_SPEED;
          b.rotation.y = Math.atan2(u.vx, u.vz);
        }
      }

      // --- swept movement: never step further than SUB units per check, so a
      // --- fast bullet can never tunnel through a small enemy hitbox.
      var mvx = u.vx * dt, mvz = u.vz * dt;
      var dist = Math.hypot(mvx, mvz);
      var SUB = 0.9;
      var steps = Math.max(1, Math.min(24, Math.ceil(dist / SUB)));
      var sx = mvx / steps, sz = mvz / steps;
      var dead = false;

      for (var st = 0; st < steps && !dead; st++) {
        b.position.x += sx;
        b.position.z += sz;

        if (Math.abs(b.position.x) > CFG.ROAD_HALF + 26 ||
          b.position.z > player.position.z + 40 || b.position.z < player.position.z - 130) {
          dead = true; break;
        }

        // enemies
        for (var j = enemies.length - 1; j >= 0; j--) {
          var e = enemies[j];
          if (e.userData.dead) continue;
          if (u.hitSet.indexOf(e.userData.uid) >= 0) continue;
          var r = e.userData.rad;
          var dx = e.position.x - b.position.x, dz = e.position.z - b.position.z;
          if (dx * dx + dz * dz < r * r) {
            hitEnemy(e, u.dmg, u.crit, u.vx, u.vz);
            u.hitSet.push(e.userData.uid);
            if (u.pierce > 0) { u.pierce--; u.dmg *= 0.82; }
            else { dead = true; }
            break;
          }
        }
        if (dead) break;

        // crates
        for (var c = crates.length - 1; c >= 0; c--) {
          var cr = crates[c];
          if (cr.userData.dead) continue;
          var cdx = cr.position.x - b.position.x, cdz = cr.position.z - b.position.z;
          if (cdx * cdx + cdz * cdz < 2.2 * 2.2 && Math.abs(cr.position.y - 1.42) < 2.4) {
            hitCrate(cr, u.dmg, b.position.x, b.position.z);
            if (u.pierce > 0) { u.pierce--; } else { dead = true; }
            break;
          }
        }
      }

      if (dead) killBullet(i);
    }
  }

  function nearestEnemy(pos, maxD) {
    var best = null, bd = maxD * maxD;
    for (var i = 0; i < enemies.length; i++) {
      var e = enemies[i];
      if (e.userData.dead) continue;
      var dx = e.position.x - pos.x, dz = e.position.z - pos.z;
      var d = dx * dx + dz * dz;
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  /* ========================================================== ENEMIES */
  var enemyId = 1;
  var _hits = 0;
  function spawnEnemy(type, x, z, isBossAdd) {
    var d = ETYPE[type];
    var g = acquireEnemyModel(type);
    g.position.set(x, 0, z);
    var lvlScale = 1 + (R.level - 1) * 0.145;
    g.userData.type = type;
    g.userData.hp = d.hp * lvlScale;
    g.userData.maxHp = g.userData.hp;
    g.userData.spd = d.spd * (1 + (R.level - 1) * 0.022) * (0.9 + Math.random() * 0.2);
    g.userData.dmg = d.dmg * (1 + (R.level - 1) * 0.07);
    g.userData.rad = 1.0 * d.sc + 0.25;
    g.userData.dead = false;
    g.userData.hitT = 0;
    g.userData.phase = Math.random() * 6.28;
    g.userData.atkT = 0;
    g.userData.slow = 0;
    g.userData.kb = { x: 0, z: 0 };
    g.userData.add = !!isBossAdd;
    g.userData.uid = enemyId++;
    world.add(g);
    enemies.push(g);
    if (Math.random() < 0.25) AE.zombieGrowl(type === 'brute');
    return g;
  }

  function hitEnemy(e, dmg, crit, vx, vz) {
    var u = e.userData;
    if (u.dead) return;
    _hits++;
    u.hp -= dmg;
    u.hitT = 0.11;
    var kbf = (u.type === 'brute' || u.boss) ? 0.06 : 0.3;
    var l = Math.hypot(vx, vz) || 1;
    u.kb.x += (vx / l) * dmg * kbf * 0.06;
    u.kb.z += (vz / l) * dmg * kbf * 0.06;

    burst(e.position.x, 1.5 * (u.boss ? 2.2 : 1), e.position.z, crit ? 0xff77cc : 0xaa1122,
      crit ? 12 : 5, crit ? 9 : 5.5, crit ? 0.2 : 0.14, 0.42, true);
    burst(e.position.x, 1.5, e.position.z, 0xffddaa, 3, 7, 0.1, 0.16);

    AE.hitFlesh(crit);
    floatText(e.position.x, 1.9 * (u.boss ? 2.4 : 1), e.position.z,
      Math.round(dmg) + (crit ? '!' : ''), crit ? 'crit' : '', crit ? 1.35 : 1);

    if (crit) { doShake(0.09); doHitStop(0.035); }
    if (u.boss) updateBossBar();

    if (u.hp <= 0) killEnemy(e, vx, vz);
  }

  function killEnemy(e, vx, vz) {
    var u = e.userData;
    if (u.dead) return;
    u.dead = true;

    var d = ETYPE[u.type] || { coin: 20, score: 300 };
    R.kills++;
    save.totalKills++;
    R.combo++;
    R.comboT = 3.0;
    R.score += Math.round((d.score || 10) * (1 + R.combo * 0.06));

    // streak announce
    for (var s = STREAKS.length - 1; s >= 0; s--) {
      if (R.combo === STREAKS[s][0]) { announce(STREAKS[s][1]); break; }
    }
    AE.combo(Math.min(24, R.combo));

    // gore
    burst(e.position.x, 1.4, e.position.z, 0x9e1322, 16, 8, 0.2, 0.7, true);
    burst(e.position.x, 1.6, e.position.z, 0xff5533, 8, 10, 0.18, 0.4);
    // chunks fly
    for (var i = 0; i < 5; i++) {
      spawnPart(e.position.x, 1.2 + Math.random(), e.position.z, 0x6b2030, 0.3,
        (Math.random() - 0.5) * 9, 4 + Math.random() * 6, (Math.random() - 0.5) * 9, 1.1, false);
    }
    AE.zombieDie();

    if (u.type === 'bomber') {
      explode(e.position.x, e.position.z, 6.5, 46, 0xffcc33);
    }

    // coins
    var n = Math.max(1, Math.round(d.coin * R.coinMul));
    dropCoins(e.position.x, e.position.z, Math.min(n, 14));

    // remove
    var idx = enemies.indexOf(e);
    if (idx >= 0) enemies.splice(idx, 1);
    world.remove(e);
    releaseEnemy(e);

    if (u.boss) onBossDead();
  }

  function disposeGroup(g) {
    g.traverse(function (o) {
      if (o.geometry && o.geometry !== GEO.box && o.geometry !== GEO.sph &&
        o.geometry !== GEO.cyl && o.geometry !== GEO.plane && o.geometry !== GEO.cone) {
        o.geometry.dispose();
      }
      if (o.material && o.material.dispose && !o.material.__shared) o.material.dispose();
    });
  }

  function explode(x, z, radius, dmg, col) {
    AE.explosion(radius / 6);
    doShake(0.5); doHitStop(0.045);
    flashScreen('#ffaa44', 0.32, 0.25);
    burst(x, 1.2, z, col || 0xffaa33, 34, 16, 0.42, 0.75);
    burst(x, 0.9, z, 0x552200, 16, 10, 0.5, 1.0, true);
    // ring
    var ring = POOL.part.pop();
    if (ring) {
      ring.visible = true;
      ring.position.set(x, 0.2, z);
      ring.material.color.setHex(0xffdd88);
      ring.material.opacity = 0.9;
      ring.material.blending = TH.AdditiveBlending;
      ring.scale.set(1, 0.1, 1);
      ring.userData = { vx: 0, vy: 0, vz: 0, life: 0.34, max: 0.34, size: 1, grav: 0 };
      parts.push(ring);
    }
    for (var i = enemies.length - 1; i >= 0; i--) {
      var e = enemies[i];
      if (e.userData.dead) continue;
      var dx = e.position.x - x, dz = e.position.z - z;
      var dd = Math.hypot(dx, dz);
      if (dd < radius) {
        hitEnemy(e, dmg * (1 - dd / radius * 0.5), false, dx, dz);
      }
    }
  }

  function announce(txt) {
    if (!dom.streakText) return;
    dom.streakText.textContent = txt;
    dom.streakText.classList.remove('pop');
    void dom.streakText.offsetWidth;
    dom.streakText.classList.add('pop');
    AE.powerup();
  }

  var _tmp = new TH.Vector3();
  function updateEnemies(dt) {
    var px = player.position.x, pz = player.position.z;
    for (var i = enemies.length - 1; i >= 0; i--) {
      var e = enemies[i], u = e.userData;
      if (u.dead) continue;

      if (u.hitT > 0) {
        u.hitT -= dt;
        var f = u.hitT > 0 ? 1 : 0;
        u.parts.mats.forEach(function (m) { m.emissive.setRGB(f * 1.2, f * 0.25, f * 0.25); });
        if (u.hitT <= 0) {
          var d0 = ETYPE[u.type];
          if (d0) u.parts.mats.forEach(function (m, k) { m.emissive.setHex(k === 2 ? 0x2a0808 : d0.emis); });
        }
      }

      var slowF = u.slow > 0 ? 0.32 : 1;
      if (u.slow > 0) u.slow -= dt;

      var dx = px - e.position.x, dz = pz - e.position.z;
      var dist = Math.hypot(dx, dz) || 1;
      var nx = dx / dist, nz = dz / dist;

      if (u.boss) {
        updateBoss(e, dt, nx, nz, dist);
      } else if (u.type === 'spitter') {
        // keeps distance, shoots
        var want = 16;
        var mv = dist > want ? 1 : (dist < want - 4 ? -0.6 : 0);
        e.position.x += nx * u.spd * mv * slowF * dt;
        e.position.z += nz * u.spd * mv * slowF * dt;
        u.atkT -= dt;
        if (u.atkT <= 0 && dist < 34 && dist > 5) {
          u.atkT = 2.1;
          spawnEProj(e.position.x, 1.8, e.position.z, nx, nz, u.dmg);
          AE.zombieGrowl(false);
        }
      } else {
        var strafe = Math.sin(u.phase + tGlobal * 3.2) * (u.type === 'crawler' ? 4.2 : 1.1);
        e.position.x += (nx * u.spd + (-nz) * strafe * 0.35) * slowF * dt;
        e.position.z += (nz * u.spd + (nx) * strafe * 0.35) * slowF * dt;
      }

      // knockback
      e.position.x += u.kb.x; e.position.z += u.kb.z;
      u.kb.x *= 0.82; u.kb.z *= 0.82;

      // separation (cheap, sampled)
      if ((i & 1) === (frameCount & 1)) {
        for (var j = 0; j < enemies.length; j += 2) {
          var o = enemies[j];
          if (o === e || o.userData.dead) continue;
          var ox = e.position.x - o.position.x, oz = e.position.z - o.position.z;
          var od = ox * ox + oz * oz;
          var minD = (u.rad + o.userData.rad) * 0.82;
          if (od < minD * minD && od > 0.0001) {
            var ol = Math.sqrt(od);
            var push = (minD - ol) / ol * 0.55;
            e.position.x += ox * push; e.position.z += oz * push;
          }
        }
      }

      e.rotation.y = Math.atan2(dx, dz);

      // shambling animation
      u.phase += dt * (u.spd * 0.8);
      var sw = Math.sin(u.phase * 1.6);
      if (u.parts.lL) { u.parts.lL.rotation.x = sw * 0.75; u.parts.lR.rotation.x = -sw * 0.75; }
      if (u.parts.aL) { u.parts.aL.rotation.z = sw * 0.2; u.parts.aR.rotation.z = -sw * 0.2; }
      if (u.parts.torso && !u.boss) u.parts.torso.rotation.z = sw * 0.09;
      e.position.y = Math.abs(Math.sin(u.phase * 1.6)) * 0.09 * (u.type === 'runner' ? 2.2 : 1);

      // attack player
      var reach = u.rad + 1.2;
      if (dist < reach && R.iframe <= 0 && !u.boss) {
        if (u.type === 'bomber') {
          explode(e.position.x, e.position.z, 7, 40, 0xffcc33);
          damagePlayer(u.dmg);
          killEnemy(e, 0, 0);
        } else {
          damagePlayer(u.dmg);
          u.kb.x = -nx * 1.35; u.kb.z = -nz * 1.35;
        }
      }

      // despawn behind
      if (e.position.z > pz + 34) {
        enemies.splice(i, 1);
        world.remove(e); releaseEnemy(e);
      }
    }
  }

  /* ---- enemy projectiles ---- */
  function spawnEProj(x, y, z, nx, nz, dmg) {
    var p = POOL.eproj.pop();
    if (!p) return;
    p.visible = true;
    p.position.set(x, y, z);
    p.userData = { vx: nx * 26, vz: nz * 26, life: 2.6, dmg: dmg };
    eprojs.push(p);
  }
  function updateEProjs(dt) {
    for (var i = eprojs.length - 1; i >= 0; i--) {
      var p = eprojs[i], u = p.userData;
      u.life -= dt;
      p.position.x += u.vx * dt; p.position.z += u.vz * dt;
      p.rotation.y += dt * 9;
      var dx = p.position.x - player.position.x, dz = p.position.z - player.position.z;
      var hit = (dx * dx + dz * dz) < 1.6 * 1.6;
      if (hit) {
        damagePlayer(u.dmg);
        burst(p.position.x, 1.4, p.position.z, 0x8fff5a, 12, 7, 0.16, 0.4);
      }
      if (u.life <= 0 || hit) {
        p.visible = false; eprojs.splice(i, 1); POOL.eproj.push(p);
      }
      if (Math.random() < 0.5) {
        spawnPart(p.position.x, p.position.y, p.position.z, 0x6fdd33, 0.12, 0, -1, 0, 0.3);
      }
    }
  }

  /* ========================================================== BOSS */
  function makeBoss() {
    var g = makeEnemyModel('brute');
    g.scale.setScalar(3.6);
    g.traverse(function (o) {
      if (o.material && o.material.color) {
        if (o.material.emissive) o.material.emissive.setHex(0x330000);
      }
    });
    var crown = new TH.Mesh(GEO.cone, new TH.MeshBasicMaterial({ color: 0xff2200 }));
    crown.scale.set(0.5, 1.2, 0.5); crown.position.y = 2.9;
    g.add(crown);
    var aura = new TH.Mesh(new TH.SphereGeometry(2.2, 14, 10), new TH.MeshBasicMaterial({
      color: 0xff2200, transparent: true, opacity: 0.12, blending: TH.AdditiveBlending, depthWrite: false
    }));
    aura.position.y = 1.4;
    g.add(aura);
    g.userData.aura = aura;
    return g;
  }

  function spawnBoss() {
    var g = makeBoss();
    g.position.set(0, 0, player.position.z - 42);
    var hp = 900 + R.level * 520;
    g.userData.type = 'brute';
    g.userData.boss = true;
    g.userData.hp = hp;
    g.userData.maxHp = hp;
    g.userData.spd = 7.2;
    g.userData.dmg = 34;
    g.userData.rad = 3.6;
    g.userData.dead = false;
    g.userData.hitT = 0;
    g.userData.phase = 0;
    g.userData.atkT = 3;
    g.userData.addT = 5;
    g.userData.slow = 0;
    g.userData.mode = 'chase';
    g.userData.modeT = 0;
    g.userData.kb = { x: 0, z: 0 };
    g.userData.uid = enemyId++;
    world.add(g);
    enemies.push(g);
    R.boss = g;
    R.bossSpawned = true;

    AE.bossRoar();
    AE.musicSetMode('boss');
    doShake(1.2);
    flashScreen('#ff2200', 0.5, 0.5);
    show(dom.bossBar);
    dom.bossName.textContent = 'THE DEVOURER · LV' + R.level;
    updateBossBar();
    if (dom.bossWarn) {
      dom.bossWarn.classList.remove('pop'); void dom.bossWarn.offsetWidth;
      dom.bossWarn.classList.add('pop');
    }
    AE.warning();
    vibrate([60, 40, 120]);
  }

  function updateBossBar() {
    if (!R.boss || !dom.bossFill) return;
    var f = Math.max(0, R.boss.userData.hp / R.boss.userData.maxHp);
    dom.bossFill.style.width = (f * 100) + '%';
  }

  function updateBoss(e, dt, nx, nz, dist) {
    var u = e.userData;
    u.modeT -= dt;
    u.aura.material.opacity = 0.10 + Math.sin(tGlobal * 6) * 0.05;
    u.aura.rotation.y += dt;

    if (u.mode === 'chase') {
      var want = 12;
      var mv = dist > want ? 1 : 0.15;
      e.position.x += nx * u.spd * mv * dt;
      e.position.z += nz * u.spd * mv * dt;
      if (u.modeT <= 0) {
        var r = Math.random();
        if (r < 0.42) { u.mode = 'charge'; u.modeT = 1.6; u.cx = nx; u.cz = nz; AE.zombieGrowl(true); }
        else if (r < 0.75) { u.mode = 'slam'; u.modeT = 1.1; AE.warning(); }
        else { u.mode = 'summon'; u.modeT = 1.2; AE.bossRoar(); }
      }
    } else if (u.mode === 'charge') {
      e.position.x += u.cx * u.spd * 3.1 * dt;
      e.position.z += u.cz * u.spd * 3.1 * dt;
      if (Math.random() < 0.6) burst(e.position.x, 0.4, e.position.z, 0xff4400, 2, 4, 0.3, 0.3);
      if (u.modeT <= 0) { u.mode = 'chase'; u.modeT = 2.4; }
    } else if (u.mode === 'slam') {
      e.position.y = Math.max(0, Math.sin((1.1 - u.modeT) * 3.0) * 3.2);
      if (u.modeT <= 0) {
        e.position.y = 0;
        explode(e.position.x, e.position.z, 15, 30, 0xff3300);
        doShake(1.0);
        u.mode = 'chase'; u.modeT = 2.2;
      }
    } else if (u.mode === 'summon') {
      if (u.modeT > 0 && Math.random() < 0.25) {
        var ang = Math.random() * Math.PI * 2;
        spawnEnemy(Math.random() < 0.6 ? 'runner' : 'crawler',
          clampRoad(e.position.x + Math.cos(ang) * 6), e.position.z + Math.sin(ang) * 6, true);
      }
      if (u.modeT <= 0) { u.mode = 'chase'; u.modeT = 2.6; }
    }

    e.position.x = clampRoad(e.position.x, 3);
    var minGap = (u.mode === 'charge') ? 2.2 : 9.0;
    if (e.position.z > player.position.z - minGap) e.position.z = player.position.z - minGap;

    // contact damage (only really reachable during a charge)
    if (dist < u.rad + 1.0 && R.iframe <= 0) {
      damagePlayer(u.dmg);
      doShake(0.5);
    }

    // occasional projectile volley
    u.atkT -= dt;
    if (u.atkT <= 0) {
      u.atkT = 2.6;
      for (var k = -1; k <= 1; k++) {
        var a = Math.atan2(nx, nz) + k * 0.24;
        spawnEProj(e.position.x, 3.0, e.position.z, Math.sin(a), Math.cos(a), 16);
      }
    }
  }

  function onBossDead() {
    R.boss = null;
    hide(dom.bossBar);
    AE.musicSetMode('game');
    timeScale = 0.25;
    setTimeout(function () { timeScale = 1; }, 900);
    flashScreen('#ffffff', 0.75, 0.6);
    doShake(1.5);
    for (var i = 0; i < 5; i++) {
      (function (k) {
        setTimeout(function () {
          if (!R || R.dead) return;
          explode(player.position.x + (Math.random() - 0.5) * 18, player.position.z - 20 - Math.random() * 18, 9, 0, 0xffbb33);
        }, k * 180);
      })(i);
    }
    announce('BOSS DOWN!');
    try { Ads.happyTime(); } catch (e) {}
    dropCoins(player.position.x, player.position.z - 14, 40);
    R.score += 2000;
    vibrate([40, 60, 40, 60, 160]);
  }

  /* ========================================================== COINS */
  function dropCoins(x, z, n) {
    for (var i = 0; i < n; i++) {
      var c = POOL.coin.pop();
      if (!c) return;
      c.visible = true;
      c.position.set(x + (Math.random() - 0.5) * 2.2, 1 + Math.random(), z + (Math.random() - 0.5) * 2.2);
      c.userData = {
        vx: (Math.random() - 0.5) * 7, vy: 4 + Math.random() * 4, vz: (Math.random() - 0.5) * 7,
        life: 11, grounded: false, spin: Math.random() * 6
      };
      coins.push(c);
    }
  }

  var coinPitch = 0, coinPitchT = 0;
  function updateCoins(dt) {
    var px = player.position.x, pz = player.position.z;
    coinPitchT -= dt;
    if (coinPitchT <= 0) coinPitch = 0;
    for (var i = coins.length - 1; i >= 0; i--) {
      var c = coins[i], u = c.userData;
      u.life -= dt;
      var dx = px - c.position.x, dz = pz - c.position.z;
      var d = Math.hypot(dx, dz);
      if (d < R.magnet + 2) {
        var pull = (1 - d / (R.magnet + 2)) * 48 + 8;
        c.position.x += (dx / d) * pull * dt;
        c.position.z += (dz / d) * pull * dt;
        c.position.y += (1.2 - c.position.y) * 6 * dt;
        u.grounded = true;
      } else {
        if (!u.grounded) {
          u.vy -= 22 * dt;
          c.position.x += u.vx * dt; c.position.y += u.vy * dt; c.position.z += u.vz * dt;
          if (c.position.y <= 0.35) { c.position.y = 0.35; u.grounded = true; }
        } else {
          c.position.y = 0.35 + Math.sin(tGlobal * 5 + u.spin) * 0.12;
        }
      }
      c.rotation.y += dt * 7;

      if (d < 1.5 || u.life <= 0) {
        if (d < 1.5) {
          R.coinsRun++;
          R.score += 5;
          coinPitch = Math.min(10, coinPitch + 1); coinPitchT = 0.45;
          AE.coin(coinPitch);
          dom.coinNum.textContent = R.coinsRun;
          dom.coinNum.parentNode.classList.remove('bump'); void dom.coinNum.offsetWidth;
          dom.coinNum.parentNode.classList.add('bump');
        }
        c.visible = false;
        coins.splice(i, 1);
        POOL.coin.push(c);
      }
    }
  }

  /* ========================================================== CRATES */
  function hitCrate(cr, dmg, bx, bz) {
    var u = cr.userData;
    u.hp -= dmg;
    AE.hitMetal();
    burst(bx, cr.position.y, bz, u.power.color, 4, 6, 0.14, 0.3);
    floatText(cr.position.x, cr.position.y + 1.1, cr.position.z, Math.round(dmg), 'crate', 0.8);
    var f = Math.max(0, u.hp / u.maxHp);
    u.barFg.scale.x = 2.5 * f;
    u.barFg.position.x = -(2.5 * (1 - f)) / 2;
    cr.scale.setScalar(1 + (1 - f) * 0.04);
    if (u.hp <= 0 && !u.dead) breakCrate(cr);
  }

  function breakCrate(cr) {
    var u = cr.userData;
    u.dead = true;
    AE.crateBreak();
    AE.powerup();
    doShake(0.22);
    flashScreen('#' + new TH.Color(u.power.color).getHexString(), 0.18, 0.28);
    burst(cr.position.x, cr.position.y, cr.position.z, u.power.color, 26, 11, 0.24, 0.7);
    for (var i = 0; i < 6; i++) {
      spawnPart(cr.position.x, cr.position.y, cr.position.z, u.power.color, 0.35,
        (Math.random() - 0.5) * 10, Math.random() * 8, (Math.random() - 0.5) * 10, 0.9, false);
    }
    applyPower(u.power);
    floatText(cr.position.x, cr.position.y + 1.6, cr.position.z, u.power.label, 'power', 1.1);
    var idx = crates.indexOf(cr);
    if (idx >= 0) crates.splice(idx, 1);
    world.remove(cr);
    disposeGroup(cr);
    vibrate(35);
  }

  function applyPower(p) {
    switch (p.id) {
      case 'dmg': R.dmgMul *= 1.3; break;
      case 'rate': R.rateMul *= 1.25; break;
      case 'multi': R.multi = Math.min(9, R.multi + 1); break;
      case 'pierce': R.pierce = Math.min(6, R.pierce + 1); break;
      case 'homing': R.homing = Math.min(3, R.homing + 1); break;
      case 'shield': R.shields++; AE.shieldOn(); break;
      case 'heal': R.hp = Math.min(R.maxHp, R.hp + 40); break;
      case 'freeze':
        enemies.forEach(function (e) { e.userData.slow = 4.5; });
        flashScreen('#88eeff', 0.3, 0.4);
        AE.shieldOn();
        break;
      case 'nuke':
        for (var i = enemies.length - 1; i >= 0; i--) {
          var e = enemies[i];
          if (e.userData.boss) { hitEnemy(e, 400, true, 0, 1); continue; }
          explode(e.position.x, e.position.z, 5, 999, 0xff8800);
        }
        doShake(1.2);
        break;
      case 'coins': dropCoins(player.position.x, player.position.z - 6, 28); break;
    }
    refreshPowerRow();
  }

  function refreshPowerRow() {
    if (!dom.powerRow) return;
    var html = '';
    if (R.multi > 1) html += '<i title="Multi-shot">⁂ ×' + R.multi + '</i>';
    if (R.pierce > 0) html += '<i title="Pierce">⊕ ' + R.pierce + '</i>';
    if (R.homing > 0) html += '<i title="Homing">◎ ' + R.homing + '</i>';
    if (R.dmgMul > 1.01) html += '<i title="Damage">🔥 ×' + R.dmgMul.toFixed(1) + '</i>';
    if (R.rateMul > 1.01) html += '<i title="Fire rate">⚡ ×' + R.rateMul.toFixed(1) + '</i>';
    if (R.boost) html += '<i class="hot" title="Ad boost">★ 2× DMG</i>';
    dom.powerRow.innerHTML = html;
  }

  function updateCrates(dt) {
    for (var i = crates.length - 1; i >= 0; i--) {
      var cr = crates[i], u = cr.userData;
      u.phase += dt;
      cr.position.y = 2.4 + Math.sin(u.phase * 1.8) * 0.28;
      u.ring.rotation.z += dt * 1.6;
      u.core.scale.setScalar(1.1 + Math.sin(u.phase * 5) * 0.09);
      u.shell.rotation.y += dt * 0.7;
      u.shell.rotation.x += dt * 0.4;
      if (cr.position.z > player.position.z + 22) {
        crates.splice(i, 1); world.remove(cr); disposeGroup(cr);
      }
    }
  }

  /* ========================================================== SPAWNING */
  function clampRoad(x, pad) {
    var lim = CFG.ROAD_HALF - (pad || 0.8);
    return Math.max(-lim, Math.min(lim, x));
  }

  function spawnWave(dt) {
    if (R.boss) return;
    R.spawnT -= dt;
    if (R.spawnT > 0) return;

    var L = R.level;
    if (enemies.length > 62) { R.spawnT = 0.5; return; }   // hard safety cap

    var ease = (L === 1) ? 1.12 : (L === 2 ? 1.05 : 1);   // onboarding ramp
    var interval = Math.max(0.34, 1.22 - L * 0.048) * ease;
    R.spawnT = interval * (0.75 + Math.random() * 0.5);

    var count = 1 + Math.floor(Math.random() * (2 + L * 0.28) / (L < 3 ? 1.12 : 1));
    var progress = R.dist / R.target;

    for (var i = 0; i < count; i++) {
      var t = pickType(L, progress);
      var x = clampRoad((Math.random() - 0.5) * CFG.ROAD_HALF * 2);
      var z = player.position.z - (36 + Math.random() * 44);
      // occasionally spawn from behind to keep pressure from every side
      if (Math.random() < 0.11 && L > 2) z = player.position.z + 26 + Math.random() * 10;
      spawnEnemy(t, x, z, false);
    }

    // set-piece formations: a wall of bodies straight across the highway
    if (Math.random() < (L < 3 ? 0.16 : 0.2) + L * 0.012) {
      var fz = player.position.z - (54 + Math.random() * 22);
      for (var k = -3; k <= 3; k++) {
        spawnEnemy(Math.random() < 0.55 ? 'walker' : 'runner', clampRoad(k * 2.5), fz + Math.abs(k) * 1.6, false);
      }
      AE.zombieGrowl(true);
    }
  }

  function pickType(L, prog) {
    var r = Math.random();
    if (L <= 1) return r < 0.78 ? 'walker' : 'runner';
    if (L === 2) return r < 0.55 ? 'walker' : (r < 0.85 ? 'runner' : 'crawler');
    if (L === 3) return r < 0.42 ? 'walker' : (r < 0.7 ? 'runner' : (r < 0.88 ? 'crawler' : 'spitter'));
    if (L === 4) return r < 0.34 ? 'walker' : (r < 0.6 ? 'runner' : (r < 0.76 ? 'crawler' : (r < 0.9 ? 'spitter' : 'brute')));
    // L5+
    if (r < 0.26) return 'walker';
    if (r < 0.48) return 'runner';
    if (r < 0.64) return 'crawler';
    if (r < 0.78) return 'spitter';
    if (r < 0.9) return 'bomber';
    return 'brute';
  }

  function spawnCrates(dt) {
    R.crateT -= dt;
    if (R.crateT > 0) return;
    R.crateT = 6.0 + Math.random() * 2.5;
    if (R.boss) return;

    var z = player.position.z - 62;
    var opts = POWERS.slice();
    // weight: heal more likely when hurt
    var picks = [];
    for (var s = 0; s < 2; s++) {
      var pool = opts.filter(function (p) {
        if (p.id === 'heal') return R.hp < R.maxHp * 0.85;
        return true;
      });
      var p = pool[Math.floor(Math.random() * pool.length)];
      opts.splice(opts.indexOf(p), 1);
      picks.push(p);
    }
    var hp = 45 + R.level * 22;
    makeCrate(picks[0], hp, -1, z);
    makeCrate(picks[1], hp, 1, z + 4);
  }

  /* ========================================================== PLAYER DMG */
  function damagePlayer(dmg) {
    if (R.iframe > 0 || R.dead) return;
    if (R.shields > 0) {
      R.shields--;
      R.iframe = 0.9;
      AE.shieldOn();
      flashScreen('#66bbff', 0.35, 0.3);
      shieldMesh.material.opacity = 0.75;
      doShake(0.3);
      floatText(player.position.x, 2.6, player.position.z, 'SHIELD!', 'shield', 1.1);
      updateHud();
      return;
    }
    R.hp -= dmg;
    R.hitTaken++;
    R.iframe = 0.8;
    R.combo = Math.floor(R.combo * 0.4);
    AE.playerHurt();
    doShake(0.45); doHitStop(0.04);
    flashScreen('#ff0022', 0.4, 0.3);
    if (dom.dmgFlash) {
      dom.dmgFlash.classList.remove('hit'); void dom.dmgFlash.offsetWidth;
      dom.dmgFlash.classList.add('hit');
    }
    burst(player.position.x, 1.5, player.position.z, 0xff2244, 10, 7, 0.18, 0.4);
    floatText(player.position.x, 2.7, player.position.z, '-' + Math.round(dmg), 'playerdmg', 1.1);
    vibrate(60);
    updateHud();
    if (R.hp <= 0) { R.hp = 0; onDeath(); }
  }

  /* ========================================================== HUD */
  function updateHud() {
    if (!R) return;
    var f = Math.max(0, R.hp / R.maxHp);
    dom.hpFill.style.width = (f * 100) + '%';
    dom.hpFill.style.background = f > 0.5
      ? 'linear-gradient(90deg,#3ddc6b,#9cf05a)'
      : (f > 0.25 ? 'linear-gradient(90deg,#f0b429,#ffe066)' : 'linear-gradient(90deg,#e8203a,#ff6a5a)');
    dom.hpText.textContent = Math.ceil(R.hp) + ' / ' + R.maxHp;
    var sh = '';
    for (var i = 0; i < R.shields; i++) sh += '<b>🛡</b>';
    dom.shieldRow.innerHTML = sh;
    dom.lvlNum.textContent = R.level;
    dom.coinNum.textContent = R.coinsRun;
    var pf = Math.min(1, R.dist / R.target);
    dom.progFill.style.width = (pf * 100) + '%';
    dom.killQuota.textContent = R.kills;
  }

  function updateCombo(dt) {
    if (R.combo > 0) {
      R.comboT -= dt;
      if (R.comboT <= 0) { R.combo = 0; }
    }
    if (R.combo >= 2) {
      dom.comboWrap.classList.add('on');
      dom.comboNum.textContent = R.combo;
      dom.comboBar.style.width = Math.max(0, Math.min(1, R.comboT / 3.0)) * 100 + '%';
      var s = 1 + Math.min(0.5, R.combo * 0.012);
      dom.comboWrap.style.setProperty('--cs', s);
    } else {
      dom.comboWrap.classList.remove('on');
    }
  }

  /* ========================================================== GAME FLOW */
  var tGlobal = 0, frameCount = 0;

  function startGame(level) {
    AE.init(); AE.resume();
    hideAllScreens();
    Ads.hideBanner();
    clearRun();
    newRun(level);
    state = 'intro';
    dom.introLvl.textContent = 'LEVEL ' + level;
    dom.introObj.innerHTML = isBossLevel(level)
      ? 'Survive the horde, then <b>DESTROY THE DEVOURER</b>'
      : 'Run <b>' + Math.round(levelDistance(level)) + 'm</b> · Shoot everything that moves';
    dom.introBoss.style.display = isBossLevel(level) ? '' : 'none';
    dom.btnIntroBoost.style.display = '';
    dom.btnIntroBoost.disabled = false;
    dom.btnIntroBoost.classList.remove('done');
    dom.btnIntroBoost.innerHTML = '<span class="adico">\u25B6</span> WATCH AD \u00B7 <b>2\u00D7 DAMAGE</b>';
    show(dom.screenIntro);
    AE.musicSetMode('game');
    AE.musicSetIntensity(0.2);
  }

  function beginLevel() {
    hideAllScreens();
    showMenuCrowd(false);
    show(dom.hud);
    state = 'playing';
    player.position.set(0, 0, 0);
    player.rotation.set(0, 0, 0);
    playerGroup.rotation.set(0, 0, 0);     // clear the main-menu turntable
    playerGroup.position.set(0, 0, 0);
    aimPivot.rotation.set(0, Math.PI, 0);  // face down the road immediately
    aimPivot.position.set(0, 0, 0);
    camera.position.set(0, 8, 12);
    segments.forEach(function (s, i) { s.position.z = -i * CFG.SEG_LEN; });
    updateHud();
    refreshPowerRow();
    Ads.gameplayStart();
    AE.musicStart('game');
    AE.musicSetMode(isBossLevel(R.level) ? 'game' : 'game');
    if (dom.touchHint) {
      dom.touchHint.style.opacity = ('ontouchstart' in window) ? 1 : 0;
      setTimeout(function () { if (dom.touchHint) dom.touchHint.style.opacity = 0; }, 3200);
    }
  }

  function clearRun() {
    var i;
    for (i = enemies.length - 1; i >= 0; i--) { world.remove(enemies[i]); releaseEnemy(enemies[i]); }
    enemies.length = 0;
    for (i = crates.length - 1; i >= 0; i--) { world.remove(crates[i]); disposeGroup(crates[i]); }
    crates.length = 0;
    for (i = bullets.length - 1; i >= 0; i--) { bullets[i].visible = false; POOL.bullet.push(bullets[i]); }
    bullets.length = 0;
    for (i = coins.length - 1; i >= 0; i--) { coins[i].visible = false; POOL.coin.push(coins[i]); }
    coins.length = 0;
    for (i = parts.length - 1; i >= 0; i--) { parts[i].visible = false; POOL.part.push(parts[i]); }
    parts.length = 0;
    for (i = eprojs.length - 1; i >= 0; i--) { eprojs[i].visible = false; POOL.eproj.push(eprojs[i]); }
    eprojs.length = 0;
    hide(dom.bossBar);
    shake = 0; timeScale = 1; hitStop = 0;
  }

  function onLevelComplete() {
    if (R.finished) return;
    R.finished = true;
    state = 'win';
    Ads.gameplayStop();
    Ads.happyTime();
    AE.levelWin();
    AE.musicSetIntensity(0);
    timeScale = 0.35;
    flashScreen('#ffffff', 0.5, 0.5);

    var earned = Math.round(R.coinsRun);
    save.coins += earned;
    save.runs++;
    if (R.score > save.best) save.best = R.score;
    if (R.level + 1 > save.unlocked) save.unlocked = R.level + 1;
    if (R.level > save.bestLevel) save.bestLevel = R.level;
    writeSave();

    var stars = 1 + (R.hitTaken <= 6 ? 1 : 0) + (R.hitTaken <= 1 ? 1 : 0);
    dom.winStars.innerHTML = '★★★'.slice(0, stars).split('').map(function () { return '<b>★</b>'; }).join('') +
      '☆☆☆'.slice(0, 3 - stars).split('').map(function () { return '<i>★</i>'; }).join('');
    dom.winLvl.textContent = 'LEVEL ' + R.level + ' CLEARED';
    dom.winCoins.textContent = earned;
    dom.winKills.textContent = R.kills;
    dom.winScore.textContent = R.score;
    dom.btnWinDouble.disabled = false;
    dom.btnWinDouble.classList.remove('done');
    dom.btnWinDouble.innerHTML = '<span class="adico">▶</span> WATCH AD · <b>2× COINS</b>';

    setTimeout(function () {
      timeScale = 1;
      hide(dom.hud);
      show(dom.screenWin);
      Ads.showBanner('adSlotResult');
    }, 850);
  }

  function onDeath() {
    if (R.dead) return;
    R.dead = true;
    state = 'dead';
    Ads.gameplayStop();
    AE.gameOver();
    AE.musicStop();
    timeScale = 0.2;
    doShake(1.2);
    flashScreen('#aa0000', 0.6, 0.6);
    burst(player.position.x, 1.5, player.position.z, 0xaa1122, 30, 12, 0.3, 1.0, true);
    vibrate([80, 60, 200]);

    save.coins += Math.round(R.coinsRun * 0.5);
    if (R.score > save.best) save.best = R.score;
    save.runs++;
    writeSave();

    setTimeout(function () {
      timeScale = 1;
      hide(dom.hud);
      dom.deadLvl.textContent = 'LEVEL ' + R.level;
      dom.deadScore.textContent = R.score;
      dom.deadCoins.textContent = Math.round(R.coinsRun * 0.5);
      dom.btnDeadRevive.style.display = R.revived ? 'none' : '';
      if (dom.reviveCount) dom.reviveCount.textContent = R.revived ? '0' : '1';
      show(dom.screenDead);
      Ads.showBanner('adSlotResult');
    }, 1100);
  }

  function revive() {
    R.dead = false;
    R.revived = true;
    R.hp = R.maxHp;
    R.shields = Math.max(R.shields, 1);
    R.iframe = 2.4;
    state = 'playing';
    hideAllScreens();
    show(dom.hud);
    Ads.gameplayStart();
    AE.musicStart('game');
    // clear the area
    for (var i = enemies.length - 1; i >= 0; i--) {
      var e = enemies[i];
      if (e.userData.boss) continue;
      if (Math.abs(e.position.z - player.position.z) < 40) {
        explode(e.position.x, e.position.z, 4, 9999, 0x66ccff);
      }
    }
    flashScreen('#66ccff', 0.6, 0.6);
    AE.shieldOn();
    announce('REVIVED!');
    updateHud();
  }

  function togglePause(force) {
    if (state === 'playing') {
      state = 'paused';
      show(dom.screenPause);
      AE.musicSetIntensity(0);
      Ads.gameplayStop();
    } else if (state === 'paused' && !force) {
      state = 'playing';
      hide(dom.screenPause);
      Ads.gameplayStart();
      AE.resume();
    }
  }

  function gotoMenu() {
    state = 'menu';
    clearRun();
    hideAllScreens();
    hide(dom.hud);
    show(dom.screenMenu);
    showMenuCrowd(true);
    AE.musicStart('menu');
    AE.musicSetMode('menu');
    AE.musicSetIntensity(0);
    refreshMenu();
    Ads.showBanner('adSlotMenu');
  }

  function refreshMenu() {
    dom.menuCoins.textContent = save.coins;
    dom.menuBest.textContent = save.best;
    dom.menuLevel.textContent = save.unlocked;
    dom.btnPlay.querySelector('b').textContent = save.unlocked > 1 ? ('CONTINUE · LV ' + save.unlocked) : 'PLAY';
  }

  /* ========================================================== SHOP */
  function openShop() {
    state = 'shop';
    hideAllScreens();
    show(dom.screenShop);
    renderShop();
    Ads.showBanner('adSlotShop');
  }

  function renderShop() {
    dom.shopCoins.textContent = save.coins;
    var html = '';
    UPG_ORDER.forEach(function (k) {
      var u = UPG[k], lv = save.up[k], maxed = lv >= u.max;
      var cost = maxed ? 0 : u.cost(lv);
      var can = !maxed && save.coins >= cost;
      html += '<div class="shopcard' + (maxed ? ' maxed' : '') + '">' +
        '<div class="sc-ico">' + u.icon + '</div>' +
        '<div class="sc-mid">' +
        '<div class="sc-name">' + u.name + '</div>' +
        '<div class="sc-desc">' + (maxed ? 'FULLY UPGRADED' : u.desc(lv)) + '</div>' +
        '<div class="sc-pips">' + pips(lv, u.max) + '</div>' +
        '</div>' +
        (maxed
          ? '<div class="sc-buy max">MAX</div>'
          : '<button class="sc-buy' + (can ? '' : ' no') + '" data-k="' + k + '">💰 ' + cost + '</button>') +
        '</div>';
    });
    dom.shopGrid.innerHTML = html;
    Array.prototype.forEach.call(dom.shopGrid.querySelectorAll('button[data-k]'), function (b) {
      b.addEventListener('click', function () {
        var k = b.getAttribute('data-k');
        var u = UPG[k], lv = save.up[k];
        if (lv >= u.max) return;
        var cost = u.cost(lv);
        if (save.coins < cost) { AE.ui('back'); shakeEl(b); return; }
        save.coins -= cost;
        save.up[k]++;
        writeSave();
        AE.purchase();
        renderShop();
      });
    });
  }
  function pips(n, max) {
    var s = '';
    for (var i = 0; i < max; i++) s += '<i class="' + (i < n ? 'f' : '') + '"></i>';
    return s;
  }
  function shakeEl(el) {
    el.classList.remove('nope'); void el.offsetWidth; el.classList.add('nope');
  }

  /* ========================================================== MAIN LOOP */
  function animate() {
    requestAnimationFrame(animate);
    var raw = Math.min(0.05, clock.getDelta());
    frameCount++;

    if (hitStop > 0) { hitStop -= raw; }
    var ts = hitStop > 0 ? 0.08 : timeScale;
    var dt = raw * ts;
    tGlobal += dt;

    if (state === 'playing') tick(dt);
    else if (state === 'menu' || state === 'boot') tickMenu(raw);
    else if (state === 'win' || state === 'dead' || state === 'intro') tickIdle(dt);

    // shake
    if (shake > 0) {
      shake = Math.max(0, shake - raw * shakeDecay);
      var s = shake * shake;
      camera.position.x += (Math.random() - 0.5) * s * 2.4;
      camera.position.y += (Math.random() - 0.5) * s * 1.8;
      camera.rotation.z += (Math.random() - 0.5) * s * 0.09;
    }

    updateParts(dt);
    updateTexts(raw);

    if (muzzleFlash.material.opacity > 0) {
      muzzleFlash.material.opacity = Math.max(0, muzzleFlash.material.opacity - raw * 26);
    }
    muzzleLight.intensity = Math.max(0, muzzleLight.intensity - raw * 22);
    if (shieldMesh.material.opacity > 0.001) {
      var tgt = (R && R.shields > 0) ? 0.14 + Math.sin(tGlobal * 4) * 0.05 : 0;
      shieldMesh.material.opacity += (tgt - shieldMesh.material.opacity) * Math.min(1, raw * 5);
    } else if (R && R.shields > 0) {
      shieldMesh.material.opacity = 0.14;
    }
    shieldMesh.rotation.y += raw * 1.1;

    if (ash) {
      ash.position.z = Math.floor(player.position.z / 110) * 110;
      ash.rotation.y += raw * 0.02;
    }

    if (dom.aimRing) {
      var wantRing = (state === 'playing');
      if (wantRing !== ringOn) { ringOn = wantRing; dom.aimRing.style.display = wantRing ? '' : 'none'; }
    }

    renderer.render(scene, camera);
  }
  var ringOn = true;

  /* ---- attract-mode diorama: the survivor is surrounded, slowly turning ---- */
  var menuCrowd = [];
  function buildMenuCrowd() {
    if (menuCrowd.length) return;
    var types = ['walker', 'runner', 'walker', 'crawler', 'walker', 'brute', 'runner', 'spitter'];
    for (var i = 0; i < types.length; i++) {
      var g = makeEnemyModel(types[i]);
      var a = (i / types.length) * Math.PI * 2 + Math.random() * 0.4;
      var r = 11 + Math.random() * 6;
      g.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
      g.userData.ang = a;
      g.userData.rad = r;
      g.userData.ph = Math.random() * 6.28;
      g.userData.sp = 0.09 + Math.random() * 0.1;
      scene.add(g);
      menuCrowd.push(g);
    }
  }
  function showMenuCrowd(v) {
    buildMenuCrowd();
    for (var i = 0; i < menuCrowd.length; i++) menuCrowd[i].visible = v;
  }

  function tickMenu(dt) {
    tGlobal += dt;
    var a = tGlobal * 0.19;
    var cx = Math.sin(a) * 9.2, cz = Math.cos(a) * 9.2;
    camera.position.set(cx, 3.6 + Math.sin(tGlobal * 0.5) * 0.4, cz);
    // Aim at a point offset along the camera's own right vector, so the hero
    // always sits in the lower-LEFT of frame (clear of the title + buttons)
    // no matter where the turntable is in its orbit.
    var fl = Math.hypot(cx, cz) || 1;
    var rx = cz / fl, rz = -cx / fl;
    camera.lookAt(rx * 3.4, 3.0, rz * 3.4);

    playerGroup.rotation.y = a + Math.PI;
    aimPivot.rotation.y = Math.sin(tGlobal * 0.7) * 0.35;
    var sw = Math.sin(tGlobal * 7);
    legL.rotation.x = sw * 0.7; legR.rotation.x = -sw * 0.7;
    armL.rotation.x = -sw * 0.5;
    player.position.set(0, Math.abs(Math.sin(tGlobal * 7)) * 0.08, 0);
    playerLight.position.set(0, 3, 2);

    for (var i = 0; i < menuCrowd.length; i++) {
      var g = menuCrowd[i], u = g.userData;
      u.ang += u.sp * dt;
      u.rad += Math.sin(tGlobal * 0.4 + u.ph) * 0.006;
      g.position.set(Math.cos(u.ang) * u.rad, Math.abs(Math.sin(tGlobal * 3 + u.ph)) * 0.08, Math.sin(u.ang) * u.rad);
      g.rotation.y = Math.atan2(-g.position.x, -g.position.z);
      var s2 = Math.sin(tGlobal * 3 + u.ph);
      if (u.parts) {
        u.parts.lL.rotation.x = s2 * 0.6; u.parts.lR.rotation.x = -s2 * 0.6;
        u.parts.aL.rotation.z = s2 * 0.18; u.parts.aR.rotation.z = -s2 * 0.18;
      }
    }
  }

  function tickIdle(dt) {
    followCam(dt, true);
    updateCoins(dt);
  }

  function tick(dt) {
    R.elapsed += dt;

    /* --- forward run --- */
    var spd = R.speed;
    player.position.z -= spd * dt;
    R.dist += spd * dt;

    /* --- lateral control --- */
    var targetX = player.position.x;
    var kb = 0;
    if (keys['KeyA'] || keys['ArrowLeft']) kb -= 1;
    if (keys['KeyD'] || keys['ArrowRight']) kb += 1;
    if (kb !== 0) {
      targetX = player.position.x + kb * 26 * dt * 1.4;
    } else if (pointer.has) {
      targetX = pointer.ndc.x * (CFG.ROAD_HALF - 1.1) * 1.05;
    }
    targetX = clampRoad(targetX, 1.0);
    var lerp = Math.min(1, dt * 9.5);
    var prevX = player.position.x;
    player.position.x += (targetX - player.position.x) * lerp;
    var lateral = (player.position.x - prevX) / Math.max(dt, 0.0001);

    /* --- aim --- */
    updateAim();
    var aimAng = Math.atan2(aimDir.x, aimDir.z);
    aimPivot.rotation.y = shortestAngle(aimPivot.rotation.y, aimAng, dt * 16);
    aimPivot.position.z += (0 - aimPivot.position.z) * Math.min(1, dt * 12);

    // legs run cycle + lean
    var rc = tGlobal * 13;
    legL.rotation.x = Math.sin(rc) * 0.95;
    legR.rotation.x = -Math.sin(rc) * 0.95;
    armL.rotation.x = -Math.sin(rc) * 0.45;
    playerGroup.position.y = Math.abs(Math.sin(rc)) * 0.10;
    playerGroup.rotation.z += (-lateral * 0.012 - playerGroup.rotation.z) * Math.min(1, dt * 8);
    playerShadow.position.x = 0;

    playerLight.position.set(player.position.x, 3.4, player.position.z + 1);

    /* --- firing --- */
    R.fireT -= dt;
    var rate = CFG.BASE_FIRE * R.rateMul;
    if (R.fireT <= 0) {
      R.fireT = 1 / rate;
      fire();
    }

    /* --- iframe --- */
    if (R.iframe > 0) {
      R.iframe -= dt;
      var blink = Math.sin(tGlobal * 40) > 0;
      playerGroup.visible = blink || R.iframe < 0.1;
    } else playerGroup.visible = true;

    /* --- systems --- */
    spawnWave(dt);
    spawnCrates(dt);
    updateBullets(dt);
    updateEnemies(dt);
    updateEProjs(dt);
    updateCoins(dt);
    updateCrates(dt);
    updateCombo(dt);
    recycleRoad();
    followCam(dt, false);

    /* --- low HP feedback --- */
    var hpf = R.hp / R.maxHp;
    if (dom.vignette) {
      dom.vignette.style.opacity = hpf < 0.4 ? (0.35 + Math.sin(tGlobal * 6) * 0.18) * (1 - hpf / 0.4) : 0;
    }
    if (hpf < 0.3) {
      R.lowBeat -= dt;
      if (R.lowBeat <= 0) { R.lowBeat = 1.05; AE.heartbeat(); }
    }

    /* --- adaptive music --- */
    var near = 0;
    for (var i = 0; i < enemies.length; i++) {
      if (Math.abs(enemies[i].position.z - player.position.z) < 48) near++;
    }
    AE.musicSetIntensity(Math.min(1, near / 13 + (R.boss ? 0.6 : 0)));

    updateHud();

    /* --- boss trigger / level end --- */
    if (R.bossPending && !R.bossSpawned && R.dist >= R.target * 0.96) {
      spawnBoss();
    }
    if (!R.bossPending && R.dist >= R.target) {
      onLevelComplete();
    } else if (R.bossPending && R.bossSpawned && !R.boss) {
      onLevelComplete();
    }
  }

  function shortestAngle(cur, tgt, t) {
    var d = ((tgt - cur + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
    return cur + d * Math.min(1, t);
  }

  var camLook = new TH.Vector3();
  function followCam(dt, idle) {
    var k = Math.min(1, dt * (idle ? 2.5 : 7));
    var desiredX = player.position.x * 0.62;
    camera.position.x += (desiredX - camera.position.x) * k;
    camera.position.y += (camOffset.y - camera.position.y) * k;
    camera.position.z += ((player.position.z + camOffset.z) - camera.position.z) * Math.min(1, dt * 12);
    camLook.set(player.position.x * 0.5, 1.9, player.position.z - 11);
    camera.rotation.z = 0;
    camera.lookAt(camLook);
  }

  /* ========================================================== UI WIRING */
  function bindUI() {
    function tap(el, fn) {
      if (!el) return;
      el.addEventListener('click', function (e) { e.preventDefault(); AE.ui('click'); fn(); });
    }

    tap(dom.btnPlay, function () { startGame(save.unlocked); });
    tap(dom.btnShop, function () { openShop(); });
    tap(dom.btnShopBack, function () {
      if (state === 'shop') { gotoMenu(); }
    });
    tap(dom.btnIntroGo, function () { beginLevel(); });

    tap(dom.btnIntroBoost, function () {
      dom.btnIntroBoost.disabled = true;
      Ads.showRewarded().then(function (ok) {
        if (ok) {
          R.boost = true;
          dom.btnIntroBoost.innerHTML = '✔ <b>2× DAMAGE ACTIVE</b>';
          dom.btnIntroBoost.classList.add('done');
          AE.powerup();
        } else {
          dom.btnIntroBoost.disabled = false;
        }
      });
    });

    tap(dom.btnResume, function () { togglePause(); });
    tap(dom.btnQuit, function () { Ads.gameplayStop(); gotoMenu(); });
    tap(dom.btnPause, function () { togglePause(); });

    tap(dom.btnWinNext, function () {
      var next = R.level + 1;
      var needAd = (next % 3 === 1) && next > 1;
      var go = function () { startGame(next); };
      if (needAd) Ads.showInterstitial().then(go); else go();
    });
    tap(dom.btnWinMenu, function () { gotoMenu(); });

    tap(dom.btnWinDouble, function () {
      if (dom.btnWinDouble.disabled) return;
      dom.btnWinDouble.disabled = true;
      Ads.showRewarded().then(function (ok) {
        if (ok) {
          var bonus = Math.round(R.coinsRun);
          save.coins += bonus;
          writeSave();
          dom.winCoins.textContent = Math.round(R.coinsRun) + bonus;
          dom.btnWinDouble.innerHTML = '✔ <b>+' + bonus + ' BONUS COINS</b>';
          dom.btnWinDouble.classList.add('done');
          AE.purchase();
          coinRain();
        } else {
          dom.btnWinDouble.disabled = false;
        }
      });
    });

    tap(dom.btnDeadRevive, function () {
      dom.btnDeadRevive.disabled = true;
      Ads.showRewarded().then(function (ok) {
        dom.btnDeadRevive.disabled = false;
        if (ok) revive();
      });
    });
    tap(dom.btnDeadRetry, function () {
      var go = function () { startGame(R.level); };
      if (Math.random() < 0.5) Ads.showInterstitial().then(go); else go();
    });
    tap(dom.btnDeadMenu, function () { gotoMenu(); });

    tap(dom.btnShopFree, function () {
      dom.btnShopFree.disabled = true;
      Ads.showRewarded().then(function (ok) {
        dom.btnShopFree.disabled = false;
        if (ok) {
          save.coins += 250;
          writeSave();
          renderShop();
          AE.purchase();
          coinRain();
        }
      });
    });

    tap(dom.btnSfx, function () {
      save.sfx = !save.sfx; writeSave();
      AE.setSfxEnabled(save.sfx);
      dom.btnSfx.classList.toggle('off', !save.sfx);
      dom.btnSfx.textContent = save.sfx ? '🔊' : '🔇';
    });
    tap(dom.btnMusic, function () {
      save.music = !save.music; writeSave();
      AE.setMusicEnabled(save.music);
      dom.btnMusic.classList.toggle('off', !save.music);
      dom.btnMusic.textContent = save.music ? '🎵' : '🎵̸';
    });
  }

  function coinRain() {
    for (var i = 0; i < 26; i++) {
      (function (k) {
        setTimeout(function () {
          var d = document.createElement('div');
          d.className = 'coinfall';
          d.textContent = '🪙';
          d.style.left = (Math.random() * 100) + '%';
          d.style.animationDuration = (0.9 + Math.random() * 0.8) + 's';
          dom.fxLayer.appendChild(d);
          setTimeout(function () { d.remove(); }, 2000);
        }, k * 45);
      })(i);
    }
  }

  /* ========================================================== BOOT */
  function boot() {
    cacheDom();
    initText();
    loadSave();

    var pct = 0;
    function setPct(p) {
      pct = p;
      if (dom.loadBar) dom.loadBar.style.width = p + '%';
      if (dom.loadPct) dom.loadPct.textContent = Math.round(p) + '%';
    }
    setPct(8);

    setTimeout(function () {
      try {
        initThree();
      } catch (e) {
        document.body.innerHTML = '<div style="color:#fff;font:16px monospace;padding:30px">WebGL init failed: ' + e.message + '</div>';
        return;
      }
      setPct(52);
      setupInput();
      bindUI();
      setPct(78);

      Ads.init().then(function () { setPct(94); }).catch(function () { setPct(94); });

      setTimeout(function () {
        setPct(100);
        animate();
        setTimeout(function () {
          hide(dom.screenLoad);
          dom.screenLoad.style.display = 'none';
          state = 'menu';
          gotoMenu();
          if (Ads.gameReady) Ads.gameReady();
          // sound buttons reflect save
          AE.setSfxEnabled(save.sfx);
          AE.setMusicEnabled(save.music);
          dom.btnSfx.textContent = save.sfx ? '🔊' : '🔇';
          dom.btnMusic.textContent = save.music ? '🎵' : '🎵̸';
        }, 380);
      }, 260);
    }, 60);

    // first user gesture unlocks audio
    var unlock = function () {
      AE.init(); AE.resume();
      if (state === 'menu') AE.musicStart('menu');
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  window.ZR = {
    get state() { return state; },
    get run() { return R; },
    save: save,
    get dbg() {
      return {
        enemies: enemies.length, bullets: bullets.length, crates: crates.length,
        coins: coins.length, parts: parts.length, eprojs: eprojs.length,
        poolBullet: POOL.bullet.length, poolPart: POOL.part.length,
        aim: [aimDir.x.toFixed(2), aimDir.z.toFixed(2)],
        hitCount: _hits,
        es: enemies.slice(0, 6).map(function (e) {
          return { t: e.userData.type, hp: Math.round(e.userData.hp),
                   dx: +(e.position.x - player.position.x).toFixed(1),
                   dz: +(e.position.z - player.position.z).toFixed(1) };
        }),
        bs: bullets.slice(0, 5).map(function (b) {
          return { dx: +(b.position.x - player.position.x).toFixed(1),
                   dz: +(b.position.z - player.position.z).toFixed(1),
                   l: +b.userData.life.toFixed(2) };
        }),
        px: player.position.x.toFixed(1), pz: player.position.z.toFixed(1),
        pivotY: +aimPivot.rotation.y.toFixed(3), groupY: +playerGroup.rotation.y.toFixed(3)
      };
    },
    _force: function (k, v) { if (R) R[k] = v; },
    /* test hook: screen-space position of the nearest enemy ahead */
    _targetScreen: function () {
      var best = null, bd = 1e9;
      for (var i = 0; i < enemies.length; i++) {
        var e = enemies[i];
        if (e.userData.dead) continue;
        var dz = e.position.z - player.position.z;
        if (dz > -3) continue;
        var d = Math.hypot(e.position.x - player.position.x, dz);
        if (d < bd) { bd = d; best = e; }
      }
      if (!best) return null;
      var v = new TH.Vector3(best.position.x, 1.2, best.position.z).project(camera);
      return [(v.x * 0.5 + 0.5) * window.innerWidth, (-v.y * 0.5 + 0.5) * window.innerHeight];
    }
  };
})();
