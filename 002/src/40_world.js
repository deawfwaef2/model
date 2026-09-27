/* ==========================================================================
   TITAN LOOP — 40_world.js
   3D 世界：场景搭建、实体建模、对象池（子弹/火花/碎片/冲击波/伤害数字）
   打击感系统：屏幕震动、命中停顿、闪光、镜头推拉
   ========================================================================== */
(function (root) {
  'use strict';
  var TL = root.TL = root.TL || {};
  var M = TL.M;
  var T = root.THREE;

  var W = TL.world = {
    renderer: null, scene: null, camera: null,
    hero: null, gun: null, muzzle: null,
    titan: null, titan2: null,
    grunts: [], amps: [], cores: [], wardens: [], rifts: [], pickups: [],
    bullets: [], enemyShots: [],
    act: TL.ACTS[0],
    shake: 0,
    quality: 1,
    time: 0,
    ready: false
  };

  var tmpV = new T.Vector3(), tmpV2 = new T.Vector3();
  var camBase = new T.Vector3(), camLook = new T.Vector3();
  var shakeOff = new T.Vector3();

  /* ====================== 场地常量（5 列布局） ====================== */
  var LANE = W.LANE = {
    hero: 0,
    grunt: 11.5,
    amp: 18.5,
    core: 25.5,
    warden: 32.5,
    titanStart: 46,
    titanEnd: 5.6,
    zHalf: 7.2
  };

  /* ============================ 材质工厂 ============================ */
  function lam(color, emissive, ei) {
    return new T.MeshLambertMaterial({
      color: color,
      emissive: emissive === undefined ? 0x000000 : emissive,
      emissiveIntensity: ei === undefined ? 1 : ei
    });
  }
  function bas(color, opacity, blend) {
    var m = new T.MeshBasicMaterial({ color: color, transparent: true, opacity: opacity === undefined ? 1 : opacity, depthWrite: false });
    if (blend !== false) m.blending = T.AdditiveBlending;
    return m;
  }

  /* ========================== 地面网格贴图 ========================== */
  function gridTexture(act) {
    var s = 256, c = document.createElement('canvas'); c.width = c.height = s;
    var g = c.getContext('2d');
    var base = '#' + ('000000' + act.ground.toString(16)).slice(-6);
    g.fillStyle = base; g.fillRect(0, 0, s, s);
    var line = '#' + ('000000' + act.grid.toString(16)).slice(-6);
    g.strokeStyle = line; g.globalAlpha = 0.32; g.lineWidth = 2;
    g.beginPath(); g.moveTo(0, 0); g.lineTo(s, 0); g.moveTo(0, 0); g.lineTo(0, s); g.stroke();
    g.globalAlpha = 0.12; g.lineWidth = 1;
    for (var i = 1; i < 4; i++) {
      g.beginPath(); g.moveTo(0, i * s / 4); g.lineTo(s, i * s / 4);
      g.moveTo(i * s / 4, 0); g.lineTo(i * s / 4, s); g.stroke();
    }
    // 细噪点，避免大片纯色
    g.globalAlpha = 0.05;
    for (var k = 0; k < 400; k++) {
      g.fillStyle = Math.random() > 0.5 ? '#ffffff' : '#000000';
      g.fillRect(Math.random() * s, Math.random() * s, 2, 2);
    }
    var tex = new T.CanvasTexture(c);
    tex.wrapS = tex.wrapT = T.RepeatWrapping;
    tex.repeat.set(30, 16);
    tex.anisotropy = 4;
    return tex;
  }

  /* ============================== 初始化 ============================= */
  W.init = function (canvas) {
    var q = TL.save.data.settings.quality;
    var low = (q === 'low') || (q === 'auto' && TL.DEV.lowEnd);
    W.quality = low ? 0 : 1;

    W.renderer = new T.WebGLRenderer({
      canvas: canvas, antialias: !low, alpha: false,
      powerPreference: 'high-performance', stencil: false
    });
    W.renderer.setPixelRatio(Math.min(root.devicePixelRatio || 1, low ? 1 : 1.5));
    W.renderer.outputColorSpace = T.SRGBColorSpace;
    W.renderer.setClearColor(0x120508, 1);

    W.scene = new T.Scene();
    W.camera = new T.PerspectiveCamera(58, 16 / 9, 0.5, 260);

    /* 灯光 */
    W.hemi = new T.HemisphereLight(0xffffff, 0x221016, 1.15);
    W.scene.add(W.hemi);
    W.dir = new T.DirectionalLight(0xffd9c0, 1.25);
    W.dir.position.set(-18, 26, 12);
    W.scene.add(W.dir);
    W.rimLight = new T.PointLight(0xff6b2c, 2.4, 70, 1.6);
    W.rimLight.position.set(34, 9, 0);
    W.scene.add(W.rimLight);
    W.muzzleLight = new T.PointLight(0x9fe8ff, 0, 22, 2);
    W.muzzleLight.position.set(0, 2, 0);
    W.scene.add(W.muzzleLight);

    /* 地面 */
    W.groundMat = new T.MeshLambertMaterial({ color: 0xffffff });
    W.ground = new T.Mesh(new T.PlaneGeometry(200, 90), W.groundMat);
    W.ground.rotation.x = -Math.PI / 2;
    W.ground.position.set(50, 0, 0);
    W.scene.add(W.ground);

    /* 列标记条 */
    W.laneMarks = [];
    [LANE.grunt, LANE.amp, LANE.core, LANE.warden].forEach(function (x, i) {
      var m = new T.Mesh(new T.PlaneGeometry(0.5, LANE.zHalf * 2 + 4), bas(0xffffff, 0.16));
      m.rotation.x = -Math.PI / 2; m.position.set(x, 0.03, 0);
      m.userData.i = i;
      W.scene.add(m); W.laneMarks.push(m);
    });

    /* 侧墙（构图收束，增加压迫感） */
    W.walls = [];
    for (var side = -1; side <= 1; side += 2) {
      var wl = new T.Mesh(new T.BoxGeometry(120, 14, 1.2), lam(0x1a0c10, 0x000000));
      wl.position.set(52, 7, side * (LANE.zHalf + 4.5));
      W.scene.add(wl); W.walls.push(wl);
      var strip = new T.Mesh(new T.BoxGeometry(120, 0.28, 0.3), bas(0xffffff, 0.5));
      strip.position.set(52, 1.3, side * (LANE.zHalf + 3.9));
      W.scene.add(strip); W.walls.push(strip);
    }

    /* 远景立柱剪影 */
    W.pillars = [];
    for (var p = 0; p < 12; p++) {
      var h = 16 + Math.random() * 30;
      var pl = new T.Mesh(new T.BoxGeometry(3 + Math.random() * 4, h, 3 + Math.random() * 4), lam(0x090409));
      pl.position.set(62 + Math.random() * 90, h / 2 - 2, (Math.random() - 0.5) * 80);
      W.scene.add(pl); W.pillars.push(pl);
    }

    /* 环境余烬 */
    buildEmbers();

    /* 对象池 */
    buildHero();
    buildBulletPool();
    buildSparks();
    buildDebris();
    buildRings();

    W.ready = true;
    W.resize();
  };

  /* ============================== 主角 ============================== */
  function buildHero() {
    var g = new T.Group();

    var dark = lam(0x1d2430, 0x0a1018, 1);
    var trim = lam(0x2a3442, 0x3fd2ff, 1.6);

    var legs = new T.Mesh(new T.BoxGeometry(0.85, 1.15, 0.72), dark);
    legs.position.y = 0.58; g.add(legs);
    var torso = new T.Mesh(new T.BoxGeometry(1.02, 1.12, 0.82), dark);
    torso.position.y = 1.7; g.add(torso);
    var chest = new T.Mesh(new T.BoxGeometry(0.42, 0.42, 0.12), trim);
    chest.position.set(0.0, 1.82, 0.44); g.add(chest);
    var pack = new T.Mesh(new T.BoxGeometry(0.5, 0.75, 0.32), lam(0x151b24, 0x3fd2ff, 0.5));
    pack.position.set(0, 1.75, -0.5); g.add(pack);
    var head = new T.Mesh(new T.BoxGeometry(0.58, 0.52, 0.58), dark);
    head.position.y = 2.52; g.add(head);
    var visor = new T.Mesh(new T.BoxGeometry(0.5, 0.17, 0.1), bas(0x8ff0ff, 0.95));
    visor.position.set(0, 2.55, 0.3); g.add(visor);

    // 肩甲
    [-1, 1].forEach(function (s) {
      var sh = new T.Mesh(new T.BoxGeometry(0.34, 0.4, 0.62), dark);
      sh.position.set(0, 2.05, s * 0.66); g.add(sh);
    });

    // 枪（朝 +X）
    var gun = new T.Group();
    var body = new T.Mesh(new T.BoxGeometry(1.5, 0.3, 0.26), lam(0x11161e, 0x000000));
    body.position.set(0.7, 0, 0); gun.add(body);
    var barrel = new T.Mesh(new T.CylinderGeometry(0.085, 0.085, 1.1, 8), lam(0x0c1016));
    barrel.rotation.z = -Math.PI / 2; barrel.position.set(1.65, 0, 0); gun.add(barrel);
    var coil = new T.Mesh(new T.TorusGeometry(0.19, 0.055, 6, 12), bas(0x9fe8ff, 0.9));
    coil.rotation.y = Math.PI / 2; coil.position.set(1.25, 0, 0); gun.add(coil);
    var mag = new T.Mesh(new T.BoxGeometry(0.26, 0.42, 0.2), lam(0x1a2230, 0x3fd2ff, 0.7));
    mag.position.set(0.55, -0.3, 0); gun.add(mag);
    gun.position.set(0.1, 1.72, 0.42);
    g.add(gun);

    var muzzle = new T.Object3D(); muzzle.position.set(2.25, 0, 0); gun.add(muzzle);

    var flash = new T.Mesh(new T.PlaneGeometry(1.5, 1.5), bas(0xbff2ff, 0));
    flash.position.set(2.35, 0, 0); flash.rotation.y = Math.PI / 2; gun.add(flash);

    // 脚下光环
    var halo = new T.Mesh(new T.RingGeometry(1.15, 1.55, 28), bas(0x3fd2ff, 0.32));
    halo.rotation.x = -Math.PI / 2; halo.position.y = 0.04; g.add(halo);

    g.position.set(LANE.hero, 0, 0);
    W.scene.add(g);
    W.hero = g; W.gun = gun; W.muzzle = muzzle; W.muzzleFlash = flash;
    W.heroHalo = halo; W.heroVisor = visor; W.heroTrim = trim; W.heroParts = { torso: torso, head: head, legs: legs };
  }

  /* ============================== 泰坦 ============================== */
  function buildTitan(act, big) {
    var g = new T.Group();
    var scale = big ? 1.0 : 0.72;

    var shell = lam(0x24121a, act.titan, 0.34);
    var dark = lam(0x140a10, 0x000000);

    var pelvis = new T.Mesh(new T.BoxGeometry(3.4, 1.5, 3.0), shell);
    pelvis.position.y = 5.6; g.add(pelvis);

    var torso = new T.Mesh(new T.BoxGeometry(4.6, 3.8, 3.4), shell);
    torso.position.y = 8.2; g.add(torso);

    var chestPlate = new T.Mesh(new T.BoxGeometry(3.0, 2.2, 0.6), dark);
    chestPlate.position.set(-2.1, 8.4, 0); g.add(chestPlate);

    // 弱点核心（朝向玩家 -X 方向）
    var coreGlow = new T.Mesh(new T.SphereGeometry(1.15, 18, 14), bas(act.titan, 0.92));
    coreGlow.position.set(-2.5, 8.4, 0); g.add(coreGlow);
    var coreRing = new T.Mesh(new T.TorusGeometry(1.6, 0.16, 8, 22), bas(0xffffff, 0.55));
    coreRing.position.set(-2.6, 8.4, 0); coreRing.rotation.y = Math.PI / 2; g.add(coreRing);

    var head = new T.Mesh(new T.BoxGeometry(2.0, 1.7, 2.0), shell);
    head.position.y = 11.0; g.add(head);
    var eye = new T.Mesh(new T.BoxGeometry(0.22, 0.42, 1.5), bas(0xffffff, 0.95));
    eye.position.set(-1.05, 11.05, 0); g.add(eye);
    // 头冠
    for (var h = 0; h < 5; h++) {
      var horn = new T.Mesh(new T.ConeGeometry(0.26, 1.5 + Math.random(), 5), dark);
      horn.position.set(0.3, 12.1, -1.4 + h * 0.7);
      horn.rotation.z = -0.35 + Math.random() * 0.2;
      g.add(horn);
    }

    // 手臂
    var arms = [];
    [-1, 1].forEach(function (s) {
      var arm = new T.Group();
      var upper = new T.Mesh(new T.BoxGeometry(1.35, 3.4, 1.35), shell);
      upper.position.y = -1.7; arm.add(upper);
      var fore = new T.Mesh(new T.BoxGeometry(1.15, 3.0, 1.15), dark);
      fore.position.y = -4.6; arm.add(fore);
      var fist = new T.Mesh(new T.BoxGeometry(1.7, 1.5, 1.7), shell);
      fist.position.y = -6.4; arm.add(fist);
      arm.position.set(0, 9.6, s * 3.1);
      g.add(arm); arms.push(arm);
    });

    // 腿
    var legs = [];
    [-1, 1].forEach(function (s) {
      var leg = new T.Group();
      var thigh = new T.Mesh(new T.BoxGeometry(1.7, 3.2, 1.7), shell);
      thigh.position.y = -1.6; leg.add(thigh);
      var shin = new T.Mesh(new T.BoxGeometry(1.5, 3.0, 1.5), dark);
      shin.position.y = -4.6; leg.add(shin);
      var foot = new T.Mesh(new T.BoxGeometry(2.6, 0.9, 2.0), shell);
      foot.position.set(-0.3, -6.4, 0); leg.add(foot);
      leg.position.set(0, 5.4, s * 1.15);
      g.add(leg); legs.push(leg);
    });

    // 护盾壳
    var shield = new T.Mesh(new T.SphereGeometry(6.4, 20, 14), new T.MeshBasicMaterial({
      color: 0x66ddff, transparent: true, opacity: 0.0, side: T.DoubleSide,
      blending: T.AdditiveBlending, depthWrite: false, wireframe: true
    }));
    shield.position.y = 7.6; g.add(shield);

    g.scale.setScalar(scale);
    g.position.set(LANE.titanStart, 0, 0);
    g.rotation.y = 0;
    W.scene.add(g);

    return {
      kind: 'titan', mesh: g, arms: arms, legs: legs, core: coreGlow, coreRing: coreRing,
      eye: eye, shieldMesh: shield, head: head, torso: torso,
      hp: 1, maxHp: 1, shieldHp: 0, maxShieldHp: 0, armor: 0,
      r: 4.6 * scale, alive: true, walkPhase: 0, lastStep: 0, hitFlash: 0,
      scale: scale, coreR: 2.2 * scale, big: big
    };
  }

  /* ============================== 小兵 ============================== */
  function makeGrunt(act, type) {
    var g = new T.Group();
    var col = type === 'fast' ? 0xffd24a : act.enemy;
    var body = new T.Mesh(new T.OctahedronGeometry(0.62, 0), lam(0x2a1016, col, 0.75));
    g.add(body);
    var ring = new T.Mesh(new T.TorusGeometry(0.82, 0.075, 6, 14), bas(col, 0.8));
    ring.rotation.x = Math.PI / 2; g.add(ring);
    var eye = new T.Mesh(new T.SphereGeometry(0.2, 8, 6), bas(0xffffff, 0.9));
    eye.position.x = -0.5; g.add(eye);
    // 腿刺
    for (var i = 0; i < 3; i++) {
      var sp = new T.Mesh(new T.ConeGeometry(0.13, 0.7, 4), lam(0x180a10, col, 0.4));
      sp.position.set(Math.cos(i * 2.1) * 0.5, -0.5, Math.sin(i * 2.1) * 0.5);
      sp.rotation.x = Math.PI; g.add(sp);
    }
    return { g: g, body: body, ring: ring };
  }

  /* ============================== 增幅塔 ============================= */
  function makeAmp(amp) {
    var g = new T.Group();
    var core = new T.Mesh(new T.IcosahedronGeometry(0.95, 0), lam(0x3a2a06, 0xffc63a, 0.9));
    g.add(core);
    var cage = new T.Mesh(new T.IcosahedronGeometry(1.45, 0), new T.MeshBasicMaterial({
      color: 0xffd76a, wireframe: true, transparent: true, opacity: 0.55, blending: T.AdditiveBlending, depthWrite: false
    }));
    g.add(cage);
    var r1 = new T.Mesh(new T.TorusGeometry(1.75, 0.07, 6, 26), bas(0xffe08a, 0.75));
    r1.rotation.x = Math.PI / 2; g.add(r1);
    var beam = new T.Mesh(new T.CylinderGeometry(0.12, 0.12, 40, 6), bas(0xffc63a, 0.13));
    beam.position.y = 18; g.add(beam);
    var pad = new T.Mesh(new T.RingGeometry(1.5, 2.1, 24), bas(0xffc63a, 0.3));
    pad.rotation.x = -Math.PI / 2; pad.position.y = -2.2; g.add(pad);
    return { g: g, core: core, cage: cage, r1: r1, pad: pad };
  }

  /* ============================= 轮回核 ============================== */
  function makeCore() {
    var g = new T.Group();
    var core = new T.Mesh(new T.OctahedronGeometry(0.95, 0), lam(0x2a0a3e, 0xb44cff, 1.0));
    g.add(core);
    var shell = new T.Mesh(new T.OctahedronGeometry(1.5, 0), new T.MeshBasicMaterial({
      color: 0xd58aff, wireframe: true, transparent: true, opacity: 0.6, blending: T.AdditiveBlending, depthWrite: false
    }));
    g.add(shell);
    var r1 = new T.Mesh(new T.TorusGeometry(1.9, 0.06, 6, 28), bas(0xd58aff, 0.7));
    g.add(r1);
    var r2 = new T.Mesh(new T.TorusGeometry(2.25, 0.045, 6, 28), bas(0xffffff, 0.4));
    r2.rotation.x = Math.PI / 2; g.add(r2);
    var beam = new T.Mesh(new T.CylinderGeometry(0.1, 0.1, 40, 6), bas(0xb44cff, 0.14));
    beam.position.y = 18; g.add(beam);
    var pad = new T.Mesh(new T.RingGeometry(1.5, 2.1, 24), bas(0xb44cff, 0.32));
    pad.rotation.x = -Math.PI / 2; pad.position.y = -2.4; g.add(pad);
    return { g: g, core: core, shell: shell, r1: r1, r2: r2, pad: pad };
  }

  /* ============================== 守卫 =============================== */
  function makeWarden(act) {
    var g = new T.Group();
    var body = new T.Mesh(new T.BoxGeometry(1.5, 2.2, 1.5), lam(0x261018, act.enemy, 0.45));
    body.position.y = 1.1; g.add(body);
    var head = new T.Mesh(new T.BoxGeometry(0.9, 0.7, 0.9), lam(0x1a0b12, act.enemy, 0.7));
    head.position.y = 2.6; g.add(head);
    var eye = new T.Mesh(new T.BoxGeometry(0.12, 0.2, 0.7), bas(0xffffff, 0.9));
    eye.position.set(-0.46, 2.62, 0); g.add(eye);
    // 旋转护盾板 —— 转到背面时才是弱点
    var shieldPivot = new T.Object3D(); shieldPivot.position.y = 1.4; g.add(shieldPivot);
    var plate = new T.Mesh(new T.BoxGeometry(0.28, 2.6, 2.4), lam(0x3a1a24, 0x66ddff, 1.1));
    plate.position.x = -1.5; shieldPivot.add(plate);
    var plateGlow = new T.Mesh(new T.PlaneGeometry(2.4, 2.6), bas(0x88e8ff, 0.4));
    plateGlow.position.set(-1.68, 0, 0); plateGlow.rotation.y = -Math.PI / 2; shieldPivot.add(plateGlow);
    return { g: g, body: body, head: head, pivot: shieldPivot, plate: plate, plateGlow: plateGlow };
  }

  /* =============================== 裂隙 =============================== */
  function makeRift(act) {
    var g = new T.Group();
    var disc = new T.Mesh(new T.CircleGeometry(1.9, 24), bas(0x000000, 0.9, false));
    disc.material.blending = T.NormalBlending;
    disc.rotation.y = -Math.PI / 2; g.add(disc);
    var ring = new T.Mesh(new T.TorusGeometry(2.0, 0.16, 8, 30), bas(act.enemy, 0.9));
    ring.rotation.y = Math.PI / 2; g.add(ring);
    var ring2 = new T.Mesh(new T.TorusGeometry(2.5, 0.06, 6, 30), bas(0xffffff, 0.45));
    ring2.rotation.y = Math.PI / 2; g.add(ring2);
    g.position.y = 2.6;
    return { g: g, ring: ring, ring2: ring2, disc: disc };
  }

  /* ============================= 子弹池 ============================== */
  var BULLET_MAX = 260;
  function buildBulletPool() {
    W.bulletPool = [];
    var geo = new T.CylinderGeometry(0.085, 0.085, 1.5, 6);
    geo.rotateZ(-Math.PI / 2);
    for (var i = 0; i < BULLET_MAX; i++) {
      var m = new T.Mesh(geo, bas(0x9fe8ff, 0.95));
      m.visible = false; W.scene.add(m);
      W.bulletPool.push({ mesh: m, alive: false, vx: 0, vy: 0, vz: 0, life: 0, dmg: 0, pierce: 0, hitIds: null, crit: false, homing: 0, chain: 0, burn: 0, fromEnemy: false });
    }
    W.bulletHead = 0;
  }
  W.spawnBullet = function (x, y, z, dx, dy, dz, speed, opts) {
    var b = null, n = W.bulletPool.length;
    for (var i = 0; i < n; i++) {
      var idx = (W.bulletHead + i) % n;
      if (!W.bulletPool[idx].alive) { b = W.bulletPool[idx]; W.bulletHead = (idx + 1) % n; break; }
    }
    if (!b) return null;
    b.alive = true; b.life = opts.life || 1.1;
    b.mesh.position.set(x, y, z);
    b.vx = dx * speed; b.vy = dy * speed; b.vz = dz * speed;
    b.dmg = opts.dmg || 1; b.pierce = opts.pierce || 0;
    b.crit = !!opts.crit; b.homing = opts.homing || 0; b.chain = opts.chain || 0; b.burn = opts.burn || 0;
    b.fromEnemy = !!opts.fromEnemy;
    b.hitIds = {};
    var col = opts.color || 0x9fe8ff;
    b.mesh.material.color.setHex(col);
    b.mesh.material.opacity = 0.95;
    var sc = opts.scale || 1;
    b.mesh.scale.set(b.crit ? sc * 1.7 : sc, b.crit ? sc * 1.7 : sc, b.crit ? sc * 1.7 : sc);
    b.mesh.visible = true;
    b.mesh.lookAt(x + dx, y + dy, z + dz);
    b.mesh.rotateY(Math.PI / 2);
    return b;
  };

  /* ============================== 火花 =============================== */
  var SPARK_MAX = 900;
  function buildSparks() {
    var pos = new Float32Array(SPARK_MAX * 3);
    var col = new Float32Array(SPARK_MAX * 3);
    var g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(pos, 3));
    g.setAttribute('color', new T.BufferAttribute(col, 3));
    var mat = new T.PointsMaterial({
      size: 0.34, vertexColors: true, transparent: true, opacity: 0.95,
      blending: T.AdditiveBlending, depthWrite: false, sizeAttenuation: true
    });
    W.sparkPoints = new T.Points(g, mat);
    W.sparkPoints.frustumCulled = false;
    W.scene.add(W.sparkPoints);
    W.sparks = [];
    for (var i = 0; i < SPARK_MAX; i++) W.sparks.push({ a: false, x: 0, y: -999, z: 0, vx: 0, vy: 0, vz: 0, l: 0, ml: 1, r: 1, g: 1, b: 1, drag: 0.94, grav: -22 });
    W.sparkHead = 0;
  }
  W.burst = function (x, y, z, n, opts) {
    opts = opts || {};
    var c = new T.Color(opts.color === undefined ? 0xffaa44 : opts.color);
    var spd = opts.speed || 12, life = opts.life || 0.5, grav = opts.grav === undefined ? -24 : opts.grav;
    var dirx = opts.dx || 0, diry = opts.dy || 0, dirz = opts.dz || 0, bias = opts.bias || 0;
    for (var i = 0; i < n; i++) {
      var s = null, L = W.sparks.length;
      for (var k = 0; k < L; k++) {
        var idx = (W.sparkHead + k) % L;
        if (!W.sparks[idx].a) { s = W.sparks[idx]; W.sparkHead = (idx + 1) % L; break; }
      }
      if (!s) return;
      var th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
      var sp = spd * (0.35 + Math.random() * 0.9);
      s.a = true; s.x = x; s.y = y; s.z = z;
      s.vx = Math.sin(ph) * Math.cos(th) * sp + dirx * bias;
      s.vy = Math.cos(ph) * sp * 0.75 + diry * bias + (opts.up || 0);
      s.vz = Math.sin(ph) * Math.sin(th) * sp + dirz * bias;
      s.l = s.ml = life * (0.6 + Math.random() * 0.8);
      s.grav = grav; s.drag = opts.drag || 0.93;
      var j = opts.jitter === undefined ? 0.22 : opts.jitter;
      s.r = M.clamp(c.r + (Math.random() - 0.5) * j, 0, 1);
      s.g = M.clamp(c.g + (Math.random() - 0.5) * j, 0, 1);
      s.b = M.clamp(c.b + (Math.random() - 0.5) * j, 0, 1);
    }
  };

  /* ============================== 碎片 =============================== */
  var DEBRIS_MAX = 110;
  function buildDebris() {
    W.debris = [];
    var geo = new T.BoxGeometry(0.34, 0.34, 0.34);
    for (var i = 0; i < DEBRIS_MAX; i++) {
      var m = new T.Mesh(geo, lam(0xffffff, 0xffffff, 0.6));
      m.visible = false; W.scene.add(m);
      W.debris.push({ mesh: m, a: false, vx: 0, vy: 0, vz: 0, rx: 0, ry: 0, rz: 0, l: 0, ml: 1 });
    }
    W.debrisHead = 0;
  }
  W.chunks = function (x, y, z, n, color, power) {
    power = power || 1;
    for (var i = 0; i < n; i++) {
      var d = null, L = W.debris.length;
      for (var k = 0; k < L; k++) {
        var idx = (W.debrisHead + k) % L;
        if (!W.debris[idx].a) { d = W.debris[idx]; W.debrisHead = (idx + 1) % L; break; }
      }
      if (!d) return;
      d.a = true; d.mesh.visible = true;
      d.mesh.position.set(x, y, z);
      var s = (0.5 + Math.random() * 1.1) * power;
      d.mesh.scale.set(s, s, s);
      d.mesh.material.color.setHex(color);
      d.mesh.material.emissive.setHex(color);
      var th = Math.random() * Math.PI * 2;
      var sp = (5 + Math.random() * 11) * power;
      d.vx = Math.cos(th) * sp; d.vz = Math.sin(th) * sp; d.vy = (4 + Math.random() * 12) * power;
      d.rx = (Math.random() - 0.5) * 16; d.ry = (Math.random() - 0.5) * 16; d.rz = (Math.random() - 0.5) * 16;
      d.l = d.ml = 0.9 + Math.random() * 0.8;
    }
  };

  /* ============================ 冲击波环 ============================= */
  var RING_MAX = 18;
  function buildRings() {
    W.rings = [];
    var geo = new T.RingGeometry(0.85, 1.0, 40);
    for (var i = 0; i < RING_MAX; i++) {
      var m = new T.Mesh(geo, new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide }));
      m.visible = false; m.rotation.x = -Math.PI / 2; W.scene.add(m);
      W.rings.push({ mesh: m, a: false, l: 0, ml: 0.5, s0: 1, s1: 8, flat: true });
    }
    W.ringHead = 0;
  }
  W.shockwave = function (x, y, z, s1, color, dur, flat) {
    var r = null, L = W.rings.length;
    for (var k = 0; k < L; k++) {
      var idx = (W.ringHead + k) % L;
      if (!W.rings[idx].a) { r = W.rings[idx]; W.ringHead = (idx + 1) % L; break; }
    }
    if (!r) return;
    r.a = true; r.mesh.visible = true;
    r.mesh.position.set(x, y, z);
    r.flat = flat !== false;
    r.mesh.rotation.set(r.flat ? -Math.PI / 2 : 0, r.flat ? 0 : Math.PI / 2, 0);
    r.mesh.material.color.setHex(color === undefined ? 0xffffff : color);
    r.l = r.ml = dur || 0.45; r.s0 = 0.6; r.s1 = s1 || 8;
  };

  /* ============================== 余烬 =============================== */
  function buildEmbers() {
    var N = 260;
    var pos = new Float32Array(N * 3);
    for (var i = 0; i < N; i++) {
      pos[i * 3] = Math.random() * 130 - 8;
      pos[i * 3 + 1] = Math.random() * 26;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 60;
    }
    var g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(pos, 3));
    var mat = new T.PointsMaterial({ color: 0xff8844, size: 0.22, transparent: true, opacity: 0.55, blending: T.AdditiveBlending, depthWrite: false });
    W.embers = new T.Points(g, mat);
    W.embers.frustumCulled = false;
    W.scene.add(W.embers);
    W.emberSpeed = new Float32Array(N);
    for (var j = 0; j < N; j++) W.emberSpeed[j] = 0.4 + Math.random() * 1.6;
  }

  /* ========================= 关卡搭建 / 清理 ========================= */
  W.clearLevel = function () {
    function killAll(arr) {
      for (var i = 0; i < arr.length; i++) { if (arr[i].mesh) W.scene.remove(arr[i].mesh); disposeTree(arr[i].mesh); }
      arr.length = 0;
    }
    killAll(W.grunts); killAll(W.amps); killAll(W.cores); killAll(W.wardens); killAll(W.rifts); killAll(W.pickups);
    if (W.titan) { W.scene.remove(W.titan.mesh); disposeTree(W.titan.mesh); W.titan = null; }
    if (W.titan2) { W.scene.remove(W.titan2.mesh); disposeTree(W.titan2.mesh); W.titan2 = null; }
    for (var i = 0; i < W.bulletPool.length; i++) { W.bulletPool[i].alive = false; W.bulletPool[i].mesh.visible = false; }
    for (var j = 0; j < W.sparks.length; j++) W.sparks[j].a = false;
    for (var k = 0; k < W.debris.length; k++) { W.debris[k].a = false; W.debris[k].mesh.visible = false; }
    for (var r = 0; r < W.rings.length; r++) { W.rings[r].a = false; W.rings[r].mesh.visible = false; }
  };

  function disposeTree(obj) {
    if (!obj) return;
    obj.traverse && obj.traverse(function (o) {
      if (o.geometry) o.geometry.dispose();
      if (o.material) { if (Array.isArray(o.material)) o.material.forEach(function (m) { m.dispose(); }); else o.material.dispose(); }
    });
  }

  W.applyAct = function (act) {
    W.act = act;
    W.scene.fog = new T.Fog(act.fog, 34, 132);
    W.renderer.setClearColor(act.sky, 1);
    if (W.groundTex) W.groundTex.dispose();
    W.groundTex = gridTexture(act);
    W.groundMat.map = W.groundTex; W.groundMat.needsUpdate = true;
    W.rimLight.color.setHex(act.rim);
    W.dir.color.setHex(act.id === 0 ? 0xffd9c0 : act.id === 1 ? 0xc8ecff : 0xe6ccff);
    W.hemi.groundColor.setHex(act.ground);
    W.embers.material.color.setHex(act.particles);
    W.walls.forEach(function (w, i) { if (i % 2 === 1) w.material.color.setHex(act.grid); });
    W.laneMarks.forEach(function (m, i) {
      m.material.color.setHex([act.enemy, 0xffc63a, 0xb44cff, act.rim][i]);
    });
  };

  W.buildLevel = function (def) {
    W.clearLevel();
    var act = TL.ACTS[def.act];
    W.applyAct(act);
    var rng = TL.seeded(def.seed);

    /* 泰坦 */
    W.titan = buildTitan(act, true);
    W.titan.hp = W.titan.maxHp = def.hp;
    W.titan.shieldHp = W.titan.maxShieldHp = def.shieldHp;
    W.titan.armor = def.armor;
    W.titan.mesh.position.set(LANE.titanStart, 0, 0);
    if (def.mech.twin) {
      W.titan2 = buildTitan(act, false);
      W.titan2.hp = W.titan2.maxHp = Math.round(def.hp * 0.45);
      W.titan2.armor = def.armor;
      W.titan2.mesh.position.set(LANE.titanStart + 8, 0, -5.2);
      W.titan.mesh.position.z = 2.4;
    }

    /* 小兵（C1） */
    for (var i = 0; i < def.gruntCount; i++) {
      var fast = def.mech.hasteGrunt && rng() < 0.35;
      spawnGrunt(act, LANE.grunt + (rng() - 0.5) * 5.5, (rng() - 0.5) * LANE.zHalf * 1.9, fast, def);
    }

    /* 增幅塔（C2） */
    var zs = spreadZ(def.ampCount, rng);
    for (var a = 0; a < def.ampCount; a++) {
      var ampDef = def.amps[a % def.amps.length];
      var mirrored = def.mech.mirror && a === def.ampCount - 1;
      var built = makeAmp(ampDef);
      built.g.position.set(LANE.amp + (rng() - 0.5) * 3.0, 2.6 + rng() * 1.6, zs[a]);
      if (mirrored) {
        built.core.material.emissive.setHex(0xff2a55);
        built.core.material.color.setHex(0x3a0610);
        built.cage.material.color.setHex(0xff5577);
        built.r1.material.color.setHex(0xff5577);
        built.pad.material.color.setHex(0xff2a55);
      }
      W.scene.add(built.g);
      W.amps.push({
        kind: 'amp', mesh: built.g, parts: built, amp: ampDef, mirrored: mirrored,
        hp: 26 + def.n * 5.5, maxHp: 26 + def.n * 5.5, r: 1.6, alive: true,
        spin: 0.6 + rng() * 0.8, bob: rng() * 6.28, hitFlash: 0
      });
    }

    /* 轮回核（C3） */
    var zs2 = spreadZ(def.coreCount, rng);
    for (var c = 0; c < def.coreCount; c++) {
      var b2 = makeCore();
      b2.g.position.set(LANE.core + (rng() - 0.5) * 2.6, 2.9 + rng() * 1.8, zs2[c]);
      W.scene.add(b2.g);
      W.cores.push({
        kind: 'core', mesh: b2.g, parts: b2,
        hp: 34 + def.n * 7, maxHp: 34 + def.n * 7, r: 1.7, alive: true,
        spin: 0.5 + rng() * 0.7, bob: rng() * 6.28, hitFlash: 0,
        value: def.coreValue
      });
    }

    /* 守卫（C4） */
    var zs3 = spreadZ(def.wardenCount, rng);
    for (var wI = 0; wI < def.wardenCount; wI++) {
      var b3 = makeWarden(act);
      b3.g.position.set(LANE.warden + (rng() - 0.5) * 3.0, 0, zs3[wI]);
      W.scene.add(b3.g);
      W.wardens.push({
        kind: 'warden', mesh: b3.g, parts: b3,
        hp: 70 + def.n * 16, maxHp: 70 + def.n * 16, r: 1.5, alive: true,
        spinSpeed: 1.1 + rng() * 0.9, angle: rng() * 6.28, hitFlash: 0,
        shootT: 0.6 + rng()
      });
    }

    /* 裂隙（C4 后期） */
    if (def.mech.rift) {
      var b4 = makeRift(act);
      b4.g.position.set(LANE.warden + 3.5, 2.8, (rng() - 0.5) * 8);
      W.scene.add(b4.g);
      W.rifts.push({
        kind: 'rift', mesh: b4.g, parts: b4,
        hp: 55 + def.n * 12, maxHp: 55 + def.n * 12, r: 2.0, alive: true,
        t: 0, interval: Math.max(0.65, 1.5 - def.n * 0.02)
      });
    }
  };

  function spreadZ(n, rng) {
    var out = [];
    if (n <= 0) return out;
    var span = LANE.zHalf * 1.75;
    for (var i = 0; i < n; i++) {
      var base = -span / 2 + (span / Math.max(1, n - 1 || 1)) * i;
      if (n === 1) base = 0;
      out.push(base + (rng() - 0.5) * 1.2);
    }
    return out;
  }

  W.spawnGrunt = spawnGrunt;
  function spawnGrunt(act, x, z, fast, def) {
    var b = makeGrunt(act, fast ? 'fast' : 'normal');
    b.g.position.set(x, 1.15, z);
    W.scene.add(b.g);
    var n = def ? def.n : 1;
    var e = {
      kind: 'grunt', mesh: b.g, parts: b,
      hp: 12 + n * 3.2, maxHp: 12 + n * 3.2, r: 0.9, alive: true,
      speed: (fast ? 6.4 : 3.4) + n * 0.09, fast: fast,
      bob: Math.random() * 6.28, hitFlash: 0, dmg: fast ? 16 : 11,
      burnT: 0, burnDps: 0
    };
    W.grunts.push(e);
    return e;
  }

  /* ============================ 摄像机控制 =========================== */
  W.camMode = 'play';
  W.camT = 0;
  W.setCam = function (mode) { W.camMode = mode; W.camT = 0; };

  function updateCamera(dt, aimPoint, titanX) {
    var aspect = W.camera.aspect;
    var wide = aspect < 1.25;                    // 竖屏/窄屏
    var back = wide ? -20 : -13.5;
    var up = wide ? 13.5 : 10.2;
    var side = wide ? 1.2 : 2.6;

    if (W.camMode === 'menu') {
      W.camT += dt;
      var a = W.camT * 0.16;
      camBase.set(18 + Math.cos(a) * 26, 12 + Math.sin(a * 0.7) * 3.2, Math.sin(a) * 26);
      camLook.set(24, 7.5, 0);
    } else if (W.camMode === 'intro') {
      W.camT += dt;
      var p = M.clamp(W.camT / 1.25, 0, 1);
      var e = M.easeOutCubic(p);
      camBase.set(M.lerp(30, back, e), M.lerp(4.5, up, e), M.lerp(14, side, e));
      camLook.set(M.lerp(46, 17, e), M.lerp(9, 2.6, e), 0);
    } else if (W.camMode === 'win') {
      W.camT += dt;
      var q = M.clamp(W.camT / 2.0, 0, 1);
      camBase.set(M.lerp(back, -6, q), M.lerp(up, 6.5, q), M.lerp(side, 9, q));
      camLook.set(M.lerp(17, titanX, q), M.lerp(2.6, 7, q), 0);
    } else {
      // 战斗：随瞄准轻微引导 + 泰坦逼近时拉近（压迫感）
      var prox = M.clamp(1 - (titanX - LANE.titanEnd) / (LANE.titanStart - LANE.titanEnd), 0, 1);
      var aimZ = aimPoint ? M.clamp(aimPoint.z, -9, 9) : 0;
      var aimX = aimPoint ? M.clamp(aimPoint.x, 0, 46) : 20;
      camBase.set(back + prox * 2.4, up - prox * 1.1, side + aimZ * 0.16);
      camLook.set(14 + aimX * 0.12 - prox * 2.0, 2.6 + prox * 0.9, aimZ * 0.4);
    }

    var lam = W.camMode === 'play' ? 7 : 9;
    W.camera.position.x = M.damp(W.camera.position.x, camBase.x + shakeOff.x, lam, dt);
    W.camera.position.y = M.damp(W.camera.position.y, camBase.y + shakeOff.y, lam, dt);
    W.camera.position.z = M.damp(W.camera.position.z, camBase.z + shakeOff.z, lam, dt);
    tmpV.copy(camLook); tmpV.x += shakeOff.x * 0.3; tmpV.y += shakeOff.y * 0.3;
    W.camera.lookAt(tmpV);
    W.camera.rotation.z += shakeOff.z * 0.012;
  }

  /* ============================== 震屏 =============================== */
  W.addShake = function (amount) { W.shake = Math.min(2.4, W.shake + amount); };

  /* ============================= 每帧更新 ============================ */
  W.update = function (dt, aimPoint, titanX) {
    W.time += dt;

    /* 震屏衰减 */
    if (W.shake > 0.0005) {
      var s = W.shake;
      shakeOff.set((Math.random() - 0.5) * s * 2.2, (Math.random() - 0.5) * s * 1.8, (Math.random() - 0.5) * s * 2.0);
      W.shake = Math.max(0, W.shake - dt * (3.4 + W.shake * 3.5));
    } else { shakeOff.multiplyScalar(0.8); W.shake = 0; }

    updateCamera(dt, aimPoint, titanX === undefined ? LANE.titanStart : titanX);

    /* 火花 */
    var sp = W.sparkPoints.geometry.attributes.position.array;
    var sc = W.sparkPoints.geometry.attributes.color.array;
    for (var i = 0; i < W.sparks.length; i++) {
      var k = W.sparks[i];
      if (!k.a) { sp[i * 3 + 1] = -9999; continue; }
      k.l -= dt;
      if (k.l <= 0) { k.a = false; sp[i * 3 + 1] = -9999; continue; }
      k.vy += k.grav * dt;
      var dr = Math.pow(k.drag, dt * 60);
      k.vx *= dr; k.vz *= dr;
      k.x += k.vx * dt; k.y += k.vy * dt; k.z += k.vz * dt;
      if (k.y < 0.08) { k.y = 0.08; k.vy = -k.vy * 0.35; k.vx *= 0.7; k.vz *= 0.7; }
      var f = k.l / k.ml;
      sp[i * 3] = k.x; sp[i * 3 + 1] = k.y; sp[i * 3 + 2] = k.z;
      sc[i * 3] = k.r * f; sc[i * 3 + 1] = k.g * f; sc[i * 3 + 2] = k.b * f;
    }
    W.sparkPoints.geometry.attributes.position.needsUpdate = true;
    W.sparkPoints.geometry.attributes.color.needsUpdate = true;

    /* 碎片 */
    for (var d = 0; d < W.debris.length; d++) {
      var o = W.debris[d];
      if (!o.a) continue;
      o.l -= dt;
      if (o.l <= 0) { o.a = false; o.mesh.visible = false; continue; }
      o.vy -= 34 * dt;
      o.mesh.position.x += o.vx * dt; o.mesh.position.y += o.vy * dt; o.mesh.position.z += o.vz * dt;
      if (o.mesh.position.y < 0.15) { o.mesh.position.y = 0.15; o.vy = -o.vy * 0.4; o.vx *= 0.6; o.vz *= 0.6; }
      o.mesh.rotation.x += o.rx * dt; o.mesh.rotation.y += o.ry * dt; o.mesh.rotation.z += o.rz * dt;
      var ff = o.l / o.ml;
      o.mesh.scale.setScalar(Math.max(0.01, o.mesh.scale.x * (ff > 0.35 ? 1 : 0.9)));
    }

    /* 冲击波 */
    for (var r = 0; r < W.rings.length; r++) {
      var rr = W.rings[r];
      if (!rr.a) continue;
      rr.l -= dt;
      if (rr.l <= 0) { rr.a = false; rr.mesh.visible = false; continue; }
      var t = 1 - rr.l / rr.ml;
      var sscale = M.lerp(rr.s0, rr.s1, M.easeOutCubic(t));
      rr.mesh.scale.set(sscale, sscale, sscale);
      rr.mesh.material.opacity = (1 - t) * 0.85;
    }

    /* 余烬飘动 */
    var ep = W.embers.geometry.attributes.position.array;
    for (var e = 0; e < W.emberSpeed.length; e++) {
      ep[e * 3 + 1] += W.emberSpeed[e] * dt * 1.6;
      ep[e * 3] -= dt * 0.8;
      if (ep[e * 3 + 1] > 27) { ep[e * 3 + 1] = -1; ep[e * 3] = Math.random() * 130 - 8; ep[e * 3 + 2] = (Math.random() - 0.5) * 60; }
    }
    W.embers.geometry.attributes.position.needsUpdate = true;

    /* 枪口闪光衰减 */
    if (W.muzzleFlash) {
      W.muzzleFlash.material.opacity = Math.max(0, W.muzzleFlash.material.opacity - dt * 14);
      W.muzzleFlash.rotation.x += dt * 20;
    }
    W.muzzleLight.intensity = Math.max(0, W.muzzleLight.intensity - dt * 28);

    /* 主角光环脉动 */
    if (W.heroHalo) {
      W.heroHalo.material.opacity = 0.2 + Math.sin(W.time * 4) * 0.08;
      W.heroHalo.rotation.z += dt * 0.6;
    }
  };

  W.flashMuzzle = function (color) {
    if (!W.muzzleFlash) return;
    W.muzzleFlash.material.opacity = 0.95;
    W.muzzleFlash.material.color.setHex(color);
    W.muzzleFlash.scale.setScalar(0.8 + Math.random() * 0.6);
    W.muzzleLight.color.setHex(color);
    W.muzzleLight.intensity = 5.5;
    W.muzzle.getWorldPosition(tmpV);
    W.muzzleLight.position.copy(tmpV);
  };

  W.render = function () { if (W.ready) W.renderer.render(W.scene, W.camera); };

  W.resize = function () {
    if (!W.renderer) return;
    var w = root.innerWidth, h = root.innerHeight;
    W.renderer.setSize(w, h, false);
    W.camera.aspect = w / h;
    W.camera.fov = (w / h) < 1.15 ? 68 : 58;
    W.camera.updateProjectionMatrix();
  };

  /* ===================== 屏幕坐标 <-> 世界坐标 ====================== */
  var ray = new T.Raycaster();
  var ndc = new T.Vector2();
  var planeY = new T.Plane(new T.Vector3(0, 1, 0), -1.4);

  W.screenToGround = function (px, py, out) {
    ndc.x = (px / root.innerWidth) * 2 - 1;
    ndc.y = -(py / root.innerHeight) * 2 + 1;
    ray.setFromCamera(ndc, W.camera);
    var hit = ray.ray.intersectPlane(planeY, out || tmpV2);
    if (!hit) { (out || tmpV2).set(40, 1.4, 0); return out || tmpV2; }
    return hit;
  };

  W.worldToScreen = function (v3, out) {
    tmpV.copy(v3).project(W.camera);
    out = out || {};
    out.x = (tmpV.x * 0.5 + 0.5) * root.innerWidth;
    out.y = (-tmpV.y * 0.5 + 0.5) * root.innerHeight;
    out.behind = tmpV.z > 1;
    return out;
  };

})(typeof window !== 'undefined' ? window : this);
