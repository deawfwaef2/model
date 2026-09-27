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

  /* ======================= 场景搭建：世界尺度 ======================= */
  // Kenney 的模块件都按 1 格 = 1 单位设计，本作 1 格 = 2.4 米。
  // 于是一块 2x2 的地板砖 = 4.8 米见方，正好是布景的基本网格。
  var S = 2.4;
  var TILE = S * 2;                 // 4.8
  var A = null;                     // TL.assets，init 时取

  /* ============================== 初始化 ============================= */
  W.init = function (canvas) {
    A = TL.assets;
    var q = TL.save.data.settings.quality;
    var low = (q === 'low') || (q === 'auto' && TL.DEV.lowEnd);
    W.quality = low ? 0 : 1;

    W.renderer = new T.WebGLRenderer({
      canvas: canvas, antialias: !low, alpha: false,
      powerPreference: 'high-performance', stencil: false
    });
    W.renderer.setPixelRatio(Math.min(root.devicePixelRatio || 1, low ? 1 : 1.5));
    W.renderer.outputColorSpace = T.SRGBColorSpace;
    // ACES 让高光滚得住，配合 Bloom 才不会一片死白
    W.renderer.toneMapping = T.ACESFilmicToneMapping;
    W.renderer.toneMappingExposure = 1.15;
    W.renderer.setClearColor(0x07050c, 1);

    W.scene = new T.Scene();
    W.camera = new T.PerspectiveCamera(58, 16 / 9, 0.5, 400);

    buildLights();
    buildSky();
    buildArena();
    buildEmbers();

    /* 对象池 */
    buildHero();
    buildBulletPool();
    buildSparks();
    buildDebris();
    buildRings();

    buildComposer();

    W.ready = true;
    W.resize();
  };

  /* ============================== 灯光 =============================== */
  function buildLights() {
    // 关键光：玩家侧后方高位，负责把主角和近处敌人照出体积
    W.dir = new T.DirectionalLight(0xffd9c0, 2.2);
    W.dir.position.set(-30, 38, 20);
    W.scene.add(W.dir);

    // 逆光/边缘光：从裂隙那一端打回来。这盏是整个画面的灵魂 ——
    // 泰坦逼近时会被它勾出一圈亮边，压迫感就是这么来的。
    W.rimLight = new T.DirectionalLight(0xff6b2c, 3.4);
    W.rimLight.position.set(120, 22, -14);
    W.scene.add(W.rimLight);

    // 环境补光，避免暗部死黑
    W.hemi = new T.HemisphereLight(0x6a7ba8, 0x140a10, 0.75);
    W.scene.add(W.hemi);

    // 裂隙点光（会随泰坦逼近而增强）
    W.riftLight = new T.PointLight(0xff6b2c, 900, 120, 2);
    W.riftLight.position.set(58, 9, 0);
    W.scene.add(W.riftLight);

    // 主角脚下的冷色补光，把主角从暖色场景里摘出来
    W.heroLight = new T.PointLight(0xbfe6ff, 150, 26, 2);
    W.heroLight.position.set(-1.5, 5.5, 1.5);
    W.scene.add(W.heroLight);

    // 枪口闪光
    W.muzzleLight = new T.PointLight(0x9fe8ff, 0, 30, 2);
    W.muzzleLight.position.set(0, 2, 0);
    W.scene.add(W.muzzleLight);
  }

  /* ============================ 天空穹顶 ============================= */
  // 一个朝内的球，用顶点插值做渐变。比纯色 clearColor 有层次得多，
  // 而且远景剪影可以压在它上面形成真正的「地平线」。
  function buildSky() {
    var geo = new T.SphereGeometry(320, 24, 16);
    var mat = new T.ShaderMaterial({
      side: T.BackSide, depthWrite: false, fog: false,
      uniforms: {
        top: { value: new T.Color(0x0a0716) },
        bottom: { value: new T.Color(0x2a0f12) },
        horizon: { value: new T.Color(0x6b2416) },
        off: { value: 0.12 }
      },
      vertexShader:
        'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader:
        'uniform vec3 top; uniform vec3 bottom; uniform vec3 horizon; uniform float off; varying vec3 vP;' +
        'void main(){ float h = normalize(vP).y;' +
        '  float band = exp(-abs(h - off) * 9.0);' +          // 地平线辉光带
        '  vec3 c = mix(bottom, top, smoothstep(-0.25, 0.65, h));' +
        '  c = mix(c, horizon, band * 0.85);' +
        '  gl_FragColor = vec4(c, 1.0); }'
    });
    W.sky = new T.Mesh(geo, mat);
    W.sky.frustumCulled = false;
    W.scene.add(W.sky);
  }

  /* ========================== 场地：模块化搭建 ========================= */
  /*
     布局意图（x 轴 = 纵深，摄像机在 x=-13.5 往 +x 看）：

        x=-14 …… 3        主角前哨：围栏、发电机、补给桶、雷达
        x=3  …… 40        作战通道：地板砖 + 两侧墙体 + 立柱 + 管线
        x=40 …… 52        裂隙前庭：地面开裂、水晶矿脉
        x=58               裂隙巨门：泰坦从这里走出来
        |z| > 13           墙外远景：机库、火箭、天线，全部沉在雾里

     所有静态件走 TL.assets.merge 合批，最终整个布景只有十来个 draw call。
  */
  function buildArena() {
    var rng = TL.seeded(0x71714E);
    var deck = [];      // 会合批的地面/建筑
    var far = [];       // 远景剪影（单独一批，可按画质裁掉）

    var X0 = -16.8, X1 = 64.8;        // 地板 x 范围
    var ZH = 12;                      // 地板 z 半宽

    /* ---------- 1. 地板 ---------- */
    for (var x = X0; x <= X1; x += TILE) {
      for (var z = -ZH; z <= ZH; z += TILE) {
        // 裂隙前庭故意缺几块，露出下面的深渊，让地形有叙事感
        var gap = (x > 44 && x < 56) && (Math.abs(z) > 6.5) && rng() < 0.45;
        if (gap) continue;
        deck.push({ name: 'platform-large', pos: [x, -0.24, z], scale: S });
      }
    }
    // 主角脚下的圆形站台，明确「你站这儿」
    deck.push({ name: 'tower-round-base', pos: [0, 0.01, 0], scale: 4.2 });

    /* ---------- 2. 两侧墙体 ---------- */
    var WALLZ = ZH + TILE * 0.5;                    // 14.4
    var blocks = ['structure', 'structure-closed', 'structure-detailed'];
    for (var side = -1; side <= 1; side += 2) {
      for (var wx = X0; wx <= X1; wx += S) {
        var h = 2 + (rng() < 0.22 ? 1 : 0);          // 墙高 2~3 格，参差不齐
        if (wx > 42 && wx < 56) h = rng() < 0.5 ? 1 : 2;   // 裂隙前庭墙体塌了一段
        for (var lv = 0; lv < h; lv++) {
          deck.push({
            name: blocks[(rng() * 3) | 0],
            pos: [wx, lv * S, side * WALLZ],
            rot: [0, side > 0 ? 0 : Math.PI, 0],
            scale: S
          });
        }
      }
      /* 墙根管线：一路铺到底，给通道加纵向引导线 */
      for (var px = X0; px <= X1; px += S) {
        deck.push({ name: 'pipe-straight', pos: [px, 0, side * (ZH + 0.7)], rot: [0, Math.PI / 2, 0], scale: S });
      }
      /* 立柱：每 4 格一根，撑到 7.2 高 */
      for (var cx = X0 + TILE; cx <= X1; cx += TILE * 2) {
        for (var cl = 0; cl < 3; cl++) {
          deck.push({ name: 'supports-high', pos: [cx, cl * S, side * (WALLZ - 0.9)], scale: S });
        }
        deck.push({ name: 'pipe-supporthigh', pos: [cx, 3 * S, side * (WALLZ - 0.9)], scale: S });
      }
      /* 墙头栏杆 + 零星炮塔（纯装饰，营造「这里在打仗」） */
      for (var rx = X0; rx <= X1; rx += S) {
        deck.push({ name: 'rail', pos: [rx, 2 * S, side * (WALLZ - 1.15)], rot: [0, 0, 0], scale: S });
      }
      for (var tx = X0 + TILE * 1.5; tx < 44; tx += TILE * 3) {
        deck.push({
          name: rng() < 0.5 ? 'turret-single' : 'turret-double',
          pos: [tx, 2 * S, side * (WALLZ - 2.2)],
          rot: [0, side > 0 ? -Math.PI / 2 : Math.PI / 2, 0], scale: S * 0.9
        });
      }
    }

    /* ---------- 3. 头顶横管（把画面上方封住，增加压迫） ---------- */
    [8.5, 21.5, 34.5, 47].forEach(function (ax, i) {
      for (var z = -ZH - 1.2; z <= ZH + 1.2; z += S) {
        deck.push({ name: 'pipe-straight', pos: [ax, 7.2 + (i % 2) * 1.2, z], scale: S });
      }
      deck.push({ name: 'pipe-ringhigh', pos: [ax, 7.2 + (i % 2) * 1.2, -ZH - 1.2], scale: S });
      deck.push({ name: 'pipe-ringhigh', pos: [ax, 7.2 + (i % 2) * 1.2, ZH + 1.2], scale: S });
    });

    /* ---------- 4. 主角前哨 ---------- */
    var base = [
      { name: 'machine-generatorlarge', pos: [-9.5, 0, -6.4], rot: [0, 0.35, 0], scale: S * 1.3 },
      { name: 'machine-generator', pos: [-7.2, 0, 7.8], rot: [0, -0.5, 0], scale: S * 1.4 },
      { name: 'machine-wireless', pos: [-11.5, 0, 3.2], rot: [0, 0.8, 0], scale: S * 1.2 },
      { name: 'satellitedish-large', pos: [-13.5, 0, -2.6], rot: [0, 0.6, 0], scale: S * 1.6 },
      { name: 'barrels', pos: [-5.5, 0, -9.2], rot: [0, 0.2, 0], scale: S },
      { name: 'barrels-rail', pos: [-8.5, 0, 9.6], rot: [0, -0.3, 0], scale: S },
      { name: 'barrel', pos: [-4.2, 0, 8.4], rot: [0, 1.1, 0], scale: S },
      { name: 'rover', pos: [-12.5, 0, 8.2], rot: [0, -0.9, 0], scale: S * 1.8 },
      { name: 'stairs', pos: [3.2, 0, -10.4], rot: [0, Math.PI / 2, 0], scale: S },
      { name: 'monorail-tracksupport', pos: [-15.2, 0, 6.0], scale: S * 1.4 },
      { name: 'monorail-tracksupport', pos: [-15.2, 0, -6.0], scale: S * 1.4 }
    ];
    // 前哨背后的围栏，把构图后缘收住
    for (var bz = -ZH; bz <= ZH; bz += S) base.push({ name: 'rail', pos: [-16.2, 0, bz], rot: [0, Math.PI / 2, 0], scale: S });
    deck.push.apply(deck, base);

    /* ---------- 5. 裂隙前庭：水晶矿脉 + 碎石 ---------- */
    for (var i = 0; i < 26; i++) {
      var rx2 = 40 + rng() * 22;
      var rz2 = (rng() - 0.5) * ZH * 2.1;
      if (Math.abs(rz2) < 4.2 && rx2 < 56) continue;         // 给泰坦让出通路
      var kind = rng();
      deck.push({
        name: kind < 0.34 ? 'rock-crystalslargea' : kind < 0.6 ? 'rock-crystalslargeb'
            : kind < 0.78 ? 'rock-crystals' : kind < 0.9 ? 'rock-largea' : 'meteor-detailed',
        pos: [rx2, 0, rz2], rot: [0, rng() * 6.28, 0], scale: S * (0.8 + rng() * 1.1)
      });
    }
    for (var j = 0; j < 34; j++) {
      var sx = X0 + rng() * (X1 - X0);
      var sz = (rng() - 0.5) * ZH * 2.0;
      if (Math.abs(sz) < 5.5 && sx < 44) continue;           // 战斗区保持干净
      deck.push({
        name: rng() < 0.5 ? 'rocks-smalla' : 'rocks-smallb',
        pos: [sx, 0, sz], rot: [0, rng() * 6.28, 0], scale: S * (0.7 + rng() * 0.8)
      });
    }

    /* ---------- 6. 裂隙巨门 ---------- */
    var gateScale = 15;
    deck.push({ name: 'gate-complex', pos: [58.5, 0, 0], rot: [0, Math.PI / 2, 0], scale: gateScale });
    deck.push({ name: 'gate-simple', pos: [56, 0, -15.5], rot: [0, Math.PI / 2, 0], scale: 8 });
    deck.push({ name: 'gate-simple', pos: [56, 0, 15.5], rot: [0, Math.PI / 2, 0], scale: 8 });
    deck.push({ name: 'spawn-round', pos: [52, 0.03, 0], scale: 9 });

    /* ---------- 7. 墙外远景剪影 ---------- */
    for (var f = 0; f < 22; f++) {
      var fz = (18 + rng() * 46) * (rng() < 0.5 ? -1 : 1);
      var fx = -30 + rng() * 140;
      var pick = rng();
      if (pick < 0.3) {
        far.push({ name: 'hangar-largea', pos: [fx, 0, fz], rot: [0, rng() * 6.28, 0], scale: S * (2.4 + rng() * 2) });
      } else if (pick < 0.5) {
        far.push({ name: 'hangar-rounda', pos: [fx, 0, fz], rot: [0, rng() * 6.28, 0], scale: S * (2 + rng() * 1.6) });
      } else if (pick < 0.78) {
        // 火箭：底座 + 尾翼 + 头锥，三件叠出真正的轮廓
        var rs = S * (1.8 + rng() * 1.4);
        far.push({ name: 'rocket-basea', pos: [fx, 0, fz], scale: rs });
        far.push({ name: 'rocket-finsa', pos: [fx, 1.6 * rs, fz], scale: rs });
        far.push({ name: 'rocket-topa', pos: [fx, 2.3 * rs, fz], scale: rs });
      } else if (pick < 0.9) {
        far.push({ name: 'satellitedish-detailed', pos: [fx, 0, fz], rot: [0, rng() * 6.28, 0], scale: S * (2 + rng() * 2) });
      } else {
        far.push({ name: 'craft-miner', pos: [fx, 0.5 + rng() * 6, fz], rot: [0, rng() * 6.28, 0], scale: S * 1.6 });
      }
    }
    // 远景地面（一大块暗色，托住剪影，不然剪影像浮在空中）
    var farGround = new T.Mesh(
      new T.PlaneGeometry(600, 400),
      new T.MeshStandardMaterial({ color: 0x1a1220, roughness: 1, metalness: 0 })
    );
    farGround.rotation.x = -Math.PI / 2;
    farGround.position.set(40, -0.6, 0);
    W.scene.add(farGround);
    W.farGround = farGround;

    /* ---------- 合批 ---------- */
    W.arena = A.merge(deck);
    W.scene.add(W.arena);
    W.arenaFar = A.merge(far);
    W.scene.add(W.arenaFar);

    /* ---------- 8. 列标记：地面内嵌灯带 ---------- */
    W.laneMarks = [];
    [LANE.grunt, LANE.amp, LANE.core, LANE.warden].forEach(function (lx, li) {
      var strip = new T.Mesh(new T.PlaneGeometry(0.55, ZH * 2), bas(0xffffff, 0.38));
      strip.rotation.x = -Math.PI / 2;
      strip.position.set(lx, 0.04, 0);
      strip.userData.i = li;
      W.scene.add(strip); W.laneMarks.push(strip);
      // 灯带两端的小灯头
      for (var e2 = -1; e2 <= 1; e2 += 2) {
        var cap = new T.Mesh(new T.CircleGeometry(0.5, 16), bas(0xffffff, 0.55));
        cap.rotation.x = -Math.PI / 2;
        cap.userData.i = li;
        cap.position.set(lx, 0.05, e2 * ZH);
        W.scene.add(cap); W.laneMarks.push(cap);
      }
    });

    /* ---------- 9. 裂隙本体（发光面片，Bloom 会把它烧开） ---------- */
    var riftGeo = new T.PlaneGeometry(13, 17, 1, 1);
    W.riftPlane = new T.Mesh(riftGeo, new T.MeshBasicMaterial({
      color: 0xff6b2c, transparent: true, opacity: 0.85,
      blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide, fog: false
    }));
    W.riftPlane.rotation.y = -Math.PI / 2;
    W.riftPlane.position.set(58.2, 8.6, 0);
    W.scene.add(W.riftPlane);

    W.riftRings = [];
    for (var rr = 0; rr < 3; rr++) {
      var ring = new T.Mesh(new T.TorusGeometry(6.5 + rr * 1.5, 0.18, 6, 40), bas(0xffffff, 0.3 - rr * 0.07));
      ring.rotation.y = Math.PI / 2;
      ring.position.set(58.2, 8.6, 0);
      W.scene.add(ring); W.riftRings.push(ring);
    }
  }

  /* ========================= 后期处理管线 ========================== */
  /*
     低画质：直出，不做后期。
     中/高画质：RenderPass → UnrealBloom → 调色（暗角+颗粒+色散+扫描线）→ OutputPass
     Bloom 是这套美术的关键：Kenney 低多边形本身很「素」，
     全靠自发光材质 + Bloom 才能撑出霓虹科幻的质感。
  */
  var GradeShader = {
    uniforms: {
      tDiffuse:   { value: null },
      uTime:      { value: 0 },
      uVignette:  { value: 1.05 },
      uGrain:     { value: 0.055 },
      uAberr:     { value: 0.0016 },
      uScan:      { value: 0.035 },
      uHurt:      { value: 0.0 },
      uFlash:     { value: 0.0 },
      uTint:      { value: new T.Color(0xff6b2c) }
    },
    vertexShader:
      'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: [
      'uniform sampler2D tDiffuse; uniform float uTime, uVignette, uGrain, uAberr, uScan, uHurt, uFlash;',
      'uniform vec3 uTint; varying vec2 vUv;',
      'float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }',
      'void main(){',
      '  vec2 uv = vUv;',
      '  vec2 d = uv - 0.5;',
      '  float r2 = dot(d, d);',
      // 色散：越靠边缘越明显，模拟真实镜头
      '  float ab = uAberr * (1.0 + uHurt * 6.0);',
      '  vec3 col;',
      '  col.r = texture2D(tDiffuse, uv + d * ab * 2.0).r;',
      '  col.g = texture2D(tDiffuse, uv).g;',
      '  col.b = texture2D(tDiffuse, uv - d * ab * 2.0).b;',
      // 轻微对比与饱和度提升
      '  col = (col - 0.5) * 1.06 + 0.5;',
      '  float lum = dot(col, vec3(0.299, 0.587, 0.114));',
      '  col = mix(vec3(lum), col, 1.14);',
      // 暗角
      '  col *= 1.0 - smoothstep(0.18, 0.78, r2) * uVignette * 0.72;',
      // 扫描线（很轻，只是让画面有「屏幕感」）
      '  col *= 1.0 - uScan * (0.5 + 0.5 * sin(uv.y * 900.0));',
      // 胶片颗粒
      '  col += (hash(uv * 512.0 + fract(uTime) * 91.7) - 0.5) * uGrain;',
      // 受伤：边缘泛红
      '  col = mix(col, vec3(0.85, 0.06, 0.12), uHurt * smoothstep(0.02, 0.36, r2) * 0.8);',
      // 全屏闪白（用于关键打击/进场）
      '  col = mix(col, uTint, uFlash);',
      '  gl_FragColor = vec4(col, 1.0);',
      '}'
    ].join('\n')
  };

  function buildComposer() {
    W.composer = null; W.bloom = null; W.grade = null;
    if (W.quality < 1 || !T.EffectComposer || !T.UnrealBloomPass) return;
    var w = root.innerWidth, h = root.innerHeight;
    try {
      var composer = new T.EffectComposer(W.renderer);
      composer.addPass(new T.RenderPass(W.scene, W.camera));

      var bloom = new T.UnrealBloomPass(new T.Vector2(w, h), 0.78, 0.55, 0.72);
      composer.addPass(bloom);

      var grade = new T.ShaderPass(GradeShader);
      composer.addPass(grade);

      composer.addPass(new T.OutputPass());

      W.composer = composer; W.bloom = bloom; W.grade = grade;
    } catch (e) {
      console.warn('[world] 后期管线不可用，回退直出', e);
      W.composer = null;
    }
  }

  /** 供 50_game.js 调用的画面反馈 */
  W.setHurt = function (v) { if (W.grade) W.grade.uniforms.uHurt.value = M.clamp(v, 0, 1); };
  W.setFlash = function (v, color) {
    if (!W.grade) return;
    W.grade.uniforms.uFlash.value = M.clamp(v, 0, 1);
    if (color !== undefined) W.grade.uniforms.uTint.value.setHex(color);
  };

  /* ========================= 实体通用小工具 ========================= */

  /**
   * 让一个模型副本拥有自己的材质。
   * 默认所有模型共用调色板材质（省 draw call），但受击闪白、护盾变色这类
   * 逐个体的效果必须独立材质，否则会连累全世界一起闪。
   */
  function ownMats(obj) {
    var list = [];
    obj.traverse(function (o) {
      if (!o.isMesh && !o.isSkinnedMesh) return;
      if (Array.isArray(o.material)) o.material = o.material.map(function (m) { return m.clone(); });
      else o.material = o.material.clone();
      o.userData.ownMat = true;
      var ms = Array.isArray(o.material) ? o.material : [o.material];
      for (var i = 0; i < ms.length; i++) { ms[i].emissive = ms[i].emissive || new T.Color(0); list.push(ms[i]); }
    });
    return list;
  }

  /** 整体闪白 —— 命中反馈的主力 */
  W.glow = function (mats, color, intensity) {
    if (!mats) return;
    for (var i = 0; i < mats.length; i++) {
      if (color !== undefined && color !== null) mats[i].emissive.setHex(color);
      mats[i].emissiveIntensity = intensity;
    }
  };

  /* ============================== 主角 ============================== */
  // 5 把武器对应 5 个真实枪械模型，外形差异一眼可辨：
  //   pulse 制式步枪 / shred 短管霰弹 / lance 超长枪管狙击 / storm 紧凑速射 / void 异形能量枪
  var GUN_MODEL = {
    pulse: { m: 'blaster-a', s: 1.55, tip: 0.68 },
    shred: { m: 'blaster-c', s: 1.85, tip: 0.55 },
    lance: { m: 'blaster-f', s: 1.35, tip: 1.22 },
    storm: { m: 'blaster-j', s: 1.70, tip: 0.62 },
    'void': { m: 'blaster-n', s: 1.75, tip: 0.68 }
  };

  function buildHero() {
    var g = new T.Group();

    /* 身体：Kenney 宇航员。模型默认朝 -Z，这里转成朝 +X，
       这样 50_game.js 里算出来的 yaw 可以直接赋给 g.rotation.y。 */
    var pivot = new T.Group();
    pivot.rotation.y = -Math.PI / 2;
    var av = A.get('astronauta', 2.45, true);
    pivot.add(av);
    g.add(pivot);
    W.heroMats = ownMats(pivot);
    W.heroPivot = pivot;

    /* 枪：挂在右手高度 */
    var gun = new T.Group();
    gun.position.set(0.12, 1.28, 0.34);
    g.add(gun);

    var gunHolder = new T.Group();
    gun.add(gunHolder);
    W.gunHolder = gunHolder;

    var muzzle = new T.Object3D();
    muzzle.position.set(0.7, 0.1, 0);
    gun.add(muzzle);

    /* 枪口焰：十字面片 + 一圈冲击环，加法混合交给 Bloom 去烧 */
    var flash = new T.Group();
    var fm = new T.MeshBasicMaterial({
      color: 0x9fe8ff, transparent: true, opacity: 0, blending: T.AdditiveBlending,
      depthWrite: false, side: T.DoubleSide, fog: false
    });
    var star = new T.Mesh(new T.PlaneGeometry(1.5, 1.5), fm);
    flash.add(star);
    var star2 = new T.Mesh(new T.PlaneGeometry(1.5, 1.5), fm);
    star2.rotation.x = Math.PI / 2; flash.add(star2);
    var cone = new T.Mesh(new T.ConeGeometry(0.28, 1.1, 6, 1, true), fm);
    cone.rotation.z = -Math.PI / 2; cone.position.x = 0.5; flash.add(cone);
    flash.position.copy(muzzle.position);
    flash.material = fm;             // W.update 里统一改 opacity
    gun.add(flash);

    /* 脚下光环：站位提示 + 让主角从地面上"浮"出来 */
    var halo = new T.Mesh(
      new T.RingGeometry(1.15, 1.7, 40),
      new T.MeshBasicMaterial({
        color: 0x7fd8ff, transparent: true, opacity: 0.22,
        blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide, fog: false
      })
    );
    halo.rotation.x = -Math.PI / 2; halo.position.y = 0.06;
    g.add(halo);

    /* 护盾球：吃到 ward 增益时显形 */
    var shield = new T.Mesh(
      new T.IcosahedronGeometry(2.0, 2),
      new T.MeshBasicMaterial({
        color: 0x8fe4ff, transparent: true, opacity: 0, wireframe: true,
        blending: T.AdditiveBlending, depthWrite: false, fog: false
      })
    );
    shield.position.y = 1.1;
    g.add(shield);

    g.position.set(LANE.hero, 0, 0);
    W.scene.add(g);

    W.hero = g; W.gun = gun; W.muzzle = muzzle; W.muzzleFlash = flash;
    W.heroHalo = halo; W.heroShield = shield;
    W.setWeapon('pulse');
  }

  /** 切枪：换掉手上的模型，同时把枪口位置挪到新枪管口 */
  W.setWeapon = function (id) {
    if (!W.gunHolder) return;
    var def = GUN_MODEL[id] || GUN_MODEL.pulse;
    if (W.gunHolder.userData.id === id) return;
    W.gunHolder.userData.id = id;
    while (W.gunHolder.children.length) W.gunHolder.remove(W.gunHolder.children[0]);
    var m = A.get(def.m, def.s);
    m.rotation.y = Math.PI / 2;      // 枪口从 +Z 转到 +X
    W.gunHolder.add(m);
    W.muzzle.position.set(def.tip, 0.08, 0);
    W.muzzleFlash.position.set(def.tip, 0.08, 0);
  };

  /* ============================== 泰坦 ============================== */
  /*
     BOSS 用的是 three.js 官方示例模型 RobotExpressive（CC0）：
     43 根骨骼、14 段动画、头部还带 Angry/Surprised/Sad 三组形变。
     这里把它放大到 ~10 米，接上动画状态机：
        逼近 = Walking（脚步声跟着动画走）
        攻击 = Punch
        死亡 = Death（停在最后一帧）
     弱点核心挂在胸口骨骼上，所以它会跟着走路姿态左右摆 —— 要瞄准得预判。
  */
  function buildTitan(act, big) {
    var g = new T.Group();
    var scale = big ? 2.80 : 1.95;

    var body = A.getSkinned('titan', scale);
    body.rotation.y = -Math.PI / 2;            // 模型朝 +Z，转成朝 -X（面向玩家）
    g.add(body);
    var mats = ownMats(body);
    // 机体压暗一点，让胸口核心成为画面里唯一的亮点
    W.glow(mats, null, 0.10);

    /* 动画 */
    var mixer = new T.AnimationMixer(body);
    var clips = A.anims('titan');
    var actions = {};
    for (var i = 0; i < clips.length; i++) actions[clips[i].name] = mixer.clipAction(clips[i]);
    if (actions.Death) { actions.Death.loop = T.LoopOnce; actions.Death.clampWhenFinished = true; }
    if (actions.Punch) { actions.Punch.loop = T.LoopOnce; actions.Punch.clampWhenFinished = true; }
    if (actions.Jump) { actions.Jump.loop = T.LoopOnce; actions.Jump.clampWhenFinished = true; }
    if (actions.Walking) actions.Walking.play();

    /* 永远愤怒 */
    body.traverse(function (o) {
      if (o.morphTargetDictionary && o.morphTargetInfluences) {
        var ai = o.morphTargetDictionary.Angry;
        if (ai !== undefined) o.morphTargetInfluences[ai] = 1;
      }
    });

    /* 找胸口骨骼，把弱点核心挂上去 */
    var chest = null, headBone = null;
    body.traverse(function (o) {
      if (!o.isBone) return;
      if (o.name === 'Torso_1' || (!chest && o.name === 'Abdomen')) chest = o;
      if (o.name === 'Head') headBone = o;
    });

    var coreMat = new T.MeshBasicMaterial({
      color: act.titan, transparent: true, opacity: 0.95,
      blending: T.AdditiveBlending, depthWrite: false, fog: false
    });
    var core = new T.Mesh(new T.IcosahedronGeometry(0.52, 2), coreMat);
    var coreRing = new T.Mesh(
      new T.TorusGeometry(0.78, 0.075, 8, 26),
      new T.MeshBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0.6,
        blending: T.AdditiveBlending, depthWrite: false, fog: false
      })
    );
    coreRing.rotation.y = Math.PI / 2;

    /*
       坑：RobotExpressive 的骨架根带 100 倍缩放（Blender 导出的老习惯，
       靠 SkinnedMesh 端的 0.01 抵消）。直接把物体 add 到骨骼上会被放大 100 倍
       飞到天外。但骨骼**自身的世界坐标**是准的，所以这里把核心挂在泰坦组下，
       每帧用骨骼世界坐标反算本地坐标 —— 既拿到了随动画摆动的胸口位置，
       又不受那个 100 倍缩放影响。
    */
    core.scale.setScalar(scale);
    coreRing.scale.setScalar(scale);
    g.add(core); g.add(coreRing);
    core.position.set(-1.00 * scale, 2.15 * scale, 0);
    coreRing.position.copy(core.position);

    /* 眼睛：死亡时会熄灭 */
    var eye = new T.Mesh(
      new T.SphereGeometry(0.16, 10, 8),
      new T.MeshBasicMaterial({ color: 0xff3a2a, transparent: true, opacity: 0.95, blending: T.AdditiveBlending, depthWrite: false, fog: false })
    );
    eye.scale.setScalar(scale);
    eye.position.set(-0.58 * scale, 3.05 * scale, 0);
    g.add(eye);

    /* 护盾壳 */
    var shield = new T.Mesh(
      new T.IcosahedronGeometry(2.3 * scale, 2),
      new T.MeshBasicMaterial({
        color: 0x66ddff, transparent: true, opacity: 0.0, side: T.DoubleSide,
        blending: T.AdditiveBlending, depthWrite: false, wireframe: true, fog: false
      })
    );
    shield.position.y = 1.7 * scale;
    g.add(shield);

    /* 落地冲击的灰尘环（走一步触发一次） */
    var dust = new T.Mesh(
      new T.RingGeometry(0.6, 2.6, 28),
      new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide, fog: false })
    );
    dust.rotation.x = -Math.PI / 2; dust.position.y = 0.08;
    g.add(dust);

    g.position.set(LANE.titanStart, 0, 0);
    W.scene.add(g);

    var rel = big ? 1.0 : 0.72;      // 相对旧版数值模型的等效体型，保证平衡不被推翻
    return {
      kind: 'titan', mesh: g, body: body, mixer: mixer, actions: actions,
      anim: 'Walking', core: core, coreRing: coreRing, eye: eye,
      chestBone: chest, headBone: headBone,
      shieldMesh: shield, dust: dust, mats: mats,
      arms: [], legs: [],                      // 保留字段，四肢已由骨骼动画接管
      hp: 1, maxHp: 1, shieldHp: 0, maxShieldHp: 0, armor: 0,
      alive: true, walkPhase: 0, lastStep: 0, hitFlash: 0,
      // 命中盒：沿用旧版的等效尺寸，模型换了但手感和数值不变
      r: 4.6 * rel, coreR: 2.2 * rel,
      hitX: 2.6 * rel, hitZ: 2.8 * rel, hitH: 12.5 * rel,
      scale: scale, big: big
    };
  }

  /** 切换泰坦动画（带交叉淡入，不会有跳帧） */
  W.titanAnim = function (ti, name, fade) {
    if (!ti || !ti.actions || ti.anim === name) return;
    var next = ti.actions[name];
    if (!next) return;
    var prev = ti.actions[ti.anim];
    next.reset();
    next.setEffectiveWeight(1);
    next.fadeIn(fade === undefined ? 0.18 : fade).play();
    if (prev && prev !== next) prev.fadeOut(fade === undefined ? 0.18 : fade);
    ti.anim = name;
  };

  /* ============================== 小兵 ============================== */
  // 普通兵 = 悬浮 UFO 无人机；精英（fast）= 三角翼突击艇，一眼能分清威胁等级
  var UFO = ['enemy-ufo-a', 'enemy-ufo-b', 'enemy-ufo-c', 'enemy-ufo-d'];
  var SPEEDER = ['craft-speedera', 'craft-speederb', 'craft-speederc'];

  function makeGrunt(act, type) {
    var g = new T.Group();
    var fast = type === 'fast';
    var col = fast ? 0xffd24a : act.enemy;

    var model = fast
      ? A.get(SPEEDER[(Math.random() * SPEEDER.length) | 0], 1.05)
      : A.get(UFO[(Math.random() * UFO.length) | 0], 1.75);
    if (fast) model.rotation.y = -Math.PI / 2;        // 艇头朝 -X（冲向玩家）
    g.add(model);
    var mats = ownMats(model);

    // body 交给游戏逻辑做自转 —— 直接用模型根节点
    var body = model;

    /* 底部能量环 */
    var ring = new T.Mesh(
      new T.TorusGeometry(fast ? 1.0 : 0.92, 0.07, 6, 22),
      bas(col, 0.85)
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = fast ? -0.18 : -0.12;
    g.add(ring);

    /* 眼/推进器辉光 */
    var eye = new T.Mesh(new T.SphereGeometry(0.19, 10, 8), bas(0xffffff, 0.95));
    eye.position.set(-0.52, fast ? 0.05 : 0.18, 0);
    g.add(eye);

    /* 悬浮投影 */
    var pad = new T.Mesh(new T.CircleGeometry(0.9, 20), bas(col, 0.2));
    pad.rotation.x = -Math.PI / 2;
    pad.position.y = -1.05;
    g.add(pad);

    return { g: g, body: body, ring: ring, eye: eye, pad: pad, mats: mats, col: col };
  }

  /* ============================== 增幅塔 ============================= */
  /*
     组一座真正的塔：底座 + 塔身 + 水晶冠，顶上悬浮一颗能量核。
     实体原点落在能量核上（那才是打击点），塔身往下偏移到地面。
  */
  function makeAmp(amp) {
    var g = new T.Group();
    var H = 3.4;                       // 能量核离地高度，和 buildLevel 里的 y 对应

    var tower = new T.Group();
    tower.position.y = -H;
    var tScale = 2.0;
    var b1 = A.get('tower-round-base', tScale);           tower.add(b1);
    var b2 = A.get('tower-round-middle-a', tScale);       b2.position.y = 0.21 * tScale; tower.add(b2);
    var b3 = A.get('tower-round-crystals', tScale);       b3.position.y = 0.81 * tScale; tower.add(b3);
    g.add(tower);
    var towerMats = ownMats(tower);

    /* 能量核 */
    var core = new T.Mesh(
      new T.IcosahedronGeometry(0.72, 1),
      new T.MeshStandardMaterial({
        color: 0x3a2a06, emissive: 0xffc63a, emissiveIntensity: 0.9,
        roughness: 0.25, metalness: 0.1
      })
    );
    g.add(core);

    var cage = new T.Mesh(new T.IcosahedronGeometry(1.25, 1), new T.MeshBasicMaterial({
      color: 0xffd76a, wireframe: true, transparent: true, opacity: 0.5,
      blending: T.AdditiveBlending, depthWrite: false, fog: false
    }));
    g.add(cage);

    var r1 = new T.Mesh(new T.TorusGeometry(1.6, 0.06, 6, 30), bas(0xffe08a, 0.8));
    r1.rotation.x = Math.PI / 2; g.add(r1);

    /* 能量柱：从塔顶射向天空，远处也能一眼看到 */
    var beam = new T.Mesh(new T.CylinderGeometry(0.16, 0.34, 44, 8, 1, true), bas(0xffc63a, 0.10));
    beam.position.y = 21; g.add(beam);

    var pad = new T.Mesh(new T.RingGeometry(1.7, 2.5, 30), bas(0xffc63a, 0.3));
    pad.rotation.x = -Math.PI / 2; pad.position.y = -H + 0.05; g.add(pad);

    return { g: g, core: core, cage: cage, r1: r1, pad: pad, beam: beam, tower: tower, mats: towerMats };
  }

  /* ============================= 轮回核 ============================== */
  // 水晶矿脉里长出来的时之结晶，打碎它下一轮开局更强
  function makeCore() {
    var g = new T.Group();
    var H = 3.2;

    var rockG = new T.Group();
    rockG.position.y = -H;
    var rock = A.get('rock-crystalslargea', 2.6);
    rockG.add(rock);
    var c2 = A.get('detail-crystal', 2.2); c2.position.set(0.9, 0.2, -0.7); c2.rotation.y = 0.7; rockG.add(c2);
    var c3 = A.get('detail-crystal', 1.7); c3.position.set(-1.0, 0.1, 0.8); c3.rotation.y = -1.1; rockG.add(c3);
    g.add(rockG);
    var rockMats = ownMats(rockG);

    /* 悬浮主晶 */
    var core = new T.Mesh(
      A.hasModel('detail-crystal-large') ? new T.OctahedronGeometry(0.88, 0) : new T.OctahedronGeometry(0.88, 0),
      new T.MeshStandardMaterial({
        color: 0x2a0a3e, emissive: 0xb44cff, emissiveIntensity: 1.0,
        roughness: 0.15, metalness: 0.05
      })
    );
    g.add(core);

    var shell = new T.Mesh(new T.OctahedronGeometry(1.42, 0), new T.MeshBasicMaterial({
      color: 0xd58aff, wireframe: true, transparent: true, opacity: 0.55,
      blending: T.AdditiveBlending, depthWrite: false, fog: false
    }));
    g.add(shell);

    var r1 = new T.Mesh(new T.TorusGeometry(1.8, 0.055, 6, 32), bas(0xd58aff, 0.75));
    g.add(r1);
    var r2 = new T.Mesh(new T.TorusGeometry(2.15, 0.04, 6, 32), bas(0xffffff, 0.45));
    r2.rotation.x = Math.PI / 2; g.add(r2);

    var beam = new T.Mesh(new T.CylinderGeometry(0.12, 0.3, 44, 8, 1, true), bas(0xb44cff, 0.11));
    beam.position.y = 21; g.add(beam);

    var pad = new T.Mesh(new T.RingGeometry(1.6, 2.4, 30), bas(0xb44cff, 0.32));
    pad.rotation.x = -Math.PI / 2; pad.position.y = -H + 0.05; g.add(pad);

    return { g: g, core: core, shell: shell, r1: r1, r2: r2, pad: pad, beam: beam, mats: rockMats };
  }

  /* ============================== 守卫 =============================== */
  // 会还击的双管炮塔，正面挂一块旋转能量盾 —— 盾转到背面那一刻才是输出窗口
  function makeWarden(act) {
    var g = new T.Group();

    var base = A.get('platform-low', 2.0);
    g.add(base);
    var turret = A.get('turret-double', 2.6);
    turret.position.y = 1.0;
    turret.rotation.y = Math.PI / 2;       // 炮口朝 -X
    g.add(turret);
    var mats = ownMats(g);

    /* 目镜（受击时这里会爆闪） */
    var head = new T.Mesh(
      new T.SphereGeometry(0.22, 12, 10),
      new T.MeshStandardMaterial({
        color: 0x1a0b12, emissive: act.enemy, emissiveIntensity: 0.8,
        roughness: 0.2, metalness: 0.4
      })
    );
    head.position.set(-0.55, 2.25, 0);
    g.add(head);

    /* 旋转护盾 */
    var pivot = new T.Object3D();
    pivot.position.y = 1.7;
    g.add(pivot);
    var plate = new T.Mesh(
      new T.CylinderGeometry(1.75, 1.75, 2.3, 18, 1, true, -0.85, 1.7),
      new T.MeshStandardMaterial({
        color: 0x3a1a24, emissive: 0x66ddff, emissiveIntensity: 0.9,
        roughness: 0.35, metalness: 0.6, side: T.DoubleSide
      })
    );
    pivot.add(plate);
    var plateGlow = new T.Mesh(
      new T.CylinderGeometry(1.86, 1.86, 2.4, 18, 1, true, -0.85, 1.7),
      new T.MeshBasicMaterial({
        color: 0x88e8ff, transparent: true, opacity: 0.35, side: T.DoubleSide,
        blending: T.AdditiveBlending, depthWrite: false, fog: false
      })
    );
    pivot.add(plateGlow);

    return { g: g, body: turret, head: head, pivot: pivot, plate: plate, plateGlow: plateGlow, mats: mats };
  }

  /* =============================== 裂隙 =============================== */
  // 立在地上的传送门，源源不断吐小兵；打掉它就能断掉增援
  function makeRift(act) {
    var g = new T.Group();
    var H = 2.8;

    var frame = A.get('gate-simple', 5.6);
    frame.position.y = -H;
    frame.rotation.y = Math.PI / 2;
    g.add(frame);
    var mats = ownMats(frame);

    var disc = new T.Mesh(new T.CircleGeometry(1.75, 28), new T.MeshBasicMaterial({
      color: 0x08030c, transparent: true, opacity: 0.92, depthWrite: false, fog: false
    }));
    disc.rotation.y = -Math.PI / 2; g.add(disc);

    var ring = new T.Mesh(new T.TorusGeometry(1.85, 0.14, 8, 34), bas(act.enemy, 0.95));
    ring.rotation.y = Math.PI / 2; g.add(ring);
    var ring2 = new T.Mesh(new T.TorusGeometry(2.3, 0.055, 6, 34), bas(0xffffff, 0.5));
    ring2.rotation.y = Math.PI / 2; g.add(ring2);

    var pad = new T.Mesh(new T.CircleGeometry(2.4, 26), bas(act.enemy, 0.22));
    pad.rotation.x = -Math.PI / 2; pad.position.y = -H + 0.06; g.add(pad);

    g.position.y = H;
    return { g: g, ring: ring, ring2: ring2, disc: disc, pad: pad, mats: mats };
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

  /*
     注意：模型的几何体在所有副本之间共享（clone 只复制节点树），
     所以清场时**绝不能**释放带 sharedGeo 标记的几何体，
     否则第二关开始所有模型都会变成空网格。
     只有 ownMats() 克隆出来的逐实体材质才需要释放。
  */
  function disposeTree(obj) {
    if (!obj || !obj.traverse) return;
    obj.traverse(function (o) {
      if (o.geometry && !o.userData.sharedGeo) o.geometry.dispose();
      if (!o.material) return;
      if (o.userData.sharedGeo && !o.userData.ownMat) return;   // 共享调色板材质，留着
      var ms = Array.isArray(o.material) ? o.material : [o.material];
      for (var i = 0; i < ms.length; i++) if (ms[i] && ms[i].dispose) ms[i].dispose();
    });
  }

  /*
     换幕 = 换整个世界的皮。
     因为所有静态模型共用 TL.assets 的调色板材质，这里只要改调色板，
     几万个三角形的场景瞬间从「熔核废墟」变成「霜蚀深渊」，零重建开销。
  */
  W.applyAct = function (act) {
    W.act = act;
    A = A || TL.assets;

    A.applyAct(act.id);
    var P = A.pal;

    W.scene.fog = new T.FogExp2(act.fog, 0.0092);

    /* 天空渐变跟着幕走 */
    if (W.sky) {
      var u = W.sky.material.uniforms;
      u.top.value.setHex(act.sky).multiplyScalar(0.55);
      u.bottom.value.setHex(act.fog).multiplyScalar(0.8);
      u.horizon.value.setHex(P.accent).multiplyScalar(0.55);
    }
    W.renderer.setClearColor(act.sky, 1);

    /* 灯光配色 */
    W.rimLight.color.setHex(P.accent);
    W.dir.color.setHex(act.id === 0 ? 0xffd9c0 : act.id === 1 ? 0xc8ecff : 0xe6ccff);
    W.hemi.color.setHex(act.id === 0 ? 0x6a5b78 : act.id === 1 ? 0x5a7ba8 : 0x6a5aa8);
    W.hemi.groundColor.setHex(P.rockTrack);
    W.riftLight.color.setHex(P.accent);
    if (W.farGround) W.farGround.material.color.setHex(P.rockTrack).multiplyScalar(0.55);

    /* 裂隙 */
    if (W.riftPlane) W.riftPlane.material.color.setHex(P.accent);
    if (W.riftRings) W.riftRings.forEach(function (r) { r.material.color.setHex(P.accent2); });

    /* 粒子与灯带 */
    if (W.embers) W.embers.material.color.setHex(act.particles);
    if (W.laneMarks) {
      var cols = [act.enemy, 0xffc63a, 0xb44cff, P.accent2];
      W.laneMarks.forEach(function (m) { m.material.color.setHex(cols[m.userData.i || 0]); });
    }
    /* 调色着色器的闪白色调 */
    if (W.grade) W.grade.uniforms.uTint.value.setHex(P.accent);
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
      built.g.position.set(LANE.amp + (rng() - 0.5) * 3.4, 3.4, zs[a]);
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
      b2.g.position.set(LANE.core + (rng() - 0.5) * 3.0, 3.2, zs2[c]);
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
      b4.g.position.set(LANE.warden + 4.2, 2.8, (rng() - 0.5) * 9);
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
    b.g.position.set(x, 1.45, z);
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

    /* 泰坦骨骼动画 + 弱点核心随胸口摆动 */
    if (W.titan && W.titan.mixer) { W.titan.mixer.update(dt); syncTitanParts(W.titan); }
    if (W.titan2 && W.titan2.mixer) { W.titan2.mixer.update(dt); syncTitanParts(W.titan2); }

    /* 裂隙呼吸 + 光强随泰坦逼近而涨（泰坦越近，门后越亮） */
    if (W.riftPlane) {
      var pr = M.clamp(1 - (titanX - LANE.titanEnd) / (LANE.titanStart - LANE.titanEnd), 0, 1);
      var breathe = 0.62 + Math.sin(W.time * 2.1) * 0.12 + pr * 0.3;
      W.riftPlane.material.opacity = breathe;
      W.riftPlane.scale.set(1 + Math.sin(W.time * 1.3) * 0.04, 1 + Math.cos(W.time * 1.7) * 0.05, 1);
      for (var ri = 0; ri < W.riftRings.length; ri++) {
        var rg = W.riftRings[ri];
        rg.rotation.x += dt * (0.25 + ri * 0.18) * (ri % 2 ? -1 : 1);
        rg.scale.setScalar(1 + Math.sin(W.time * 1.6 + ri) * 0.05);
      }
      W.riftLight.intensity = 700 + Math.sin(W.time * 3) * 120 + pr * 500;
    }

    /* 后期调色：时间驱动颗粒 */
    if (W.grade) {
      W.grade.uniforms.uTime.value = W.time;
      var hv = W.grade.uniforms.uHurt.value;
      if (hv > 0) W.grade.uniforms.uHurt.value = Math.max(0, hv - dt * 1.8);
      var fv = W.grade.uniforms.uFlash.value;
      if (fv > 0) W.grade.uniforms.uFlash.value = Math.max(0, fv - dt * 3.4);
    }

    /* 枪口闪光衰减 */
    if (W.muzzleFlash) {
      W.muzzleFlash.material.opacity = Math.max(0, W.muzzleFlash.material.opacity - dt * 14);
      W.muzzleFlash.rotation.x += dt * 20;
    }
    W.muzzleLight.intensity = Math.max(0, W.muzzleLight.intensity - dt * 28);

    /* 主角光环脉动 */
    if (W.heroHalo) {
      W.heroHalo.material.opacity = 0.18 + Math.sin(W.time * 4) * 0.07;
      W.heroHalo.rotation.z += dt * 0.6;
    }
    if (W.heroShield) {
      W.heroShield.rotation.y += dt * 0.5;
      W.heroShield.rotation.x += dt * 0.22;
    }
  };

  /*
     把胸口/头部骨骼的世界坐标换算成泰坦组内的本地坐标，
     让弱点核心和眼睛真的跟着走路姿态左右晃 —— 想打中就得预判它的摆幅。
  */
  var boneTmp = new T.Vector3();
  function syncTitanParts(ti) {
    if (!ti.alive) return;
    ti.mesh.updateMatrixWorld();
    if (ti.chestBone) {
      ti.chestBone.getWorldPosition(boneTmp);
      ti.mesh.worldToLocal(boneTmp);
      ti.core.position.set(boneTmp.x - 1.00 * ti.scale, boneTmp.y + 0.18 * ti.scale, boneTmp.z);
      ti.coreRing.position.copy(ti.core.position);
    }
    if (ti.headBone) {
      ti.headBone.getWorldPosition(boneTmp);
      ti.mesh.worldToLocal(boneTmp);
      ti.eye.position.set(boneTmp.x - 0.30 * ti.scale, boneTmp.y + 0.06 * ti.scale, boneTmp.z);
    }
  }

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

  W.render = function () {
    if (!W.ready) return;
    if (W.composer) W.composer.render();
    else W.renderer.render(W.scene, W.camera);
  };

  W.resize = function () {
    if (!W.renderer) return;
    var w = root.innerWidth, h = root.innerHeight;
    W.renderer.setSize(w, h, false);
    W.camera.aspect = w / h;
    W.camera.fov = (w / h) < 1.15 ? 68 : 58;
    W.camera.updateProjectionMatrix();
    if (W.composer) {
      var dpr = W.renderer.getPixelRatio();
      W.composer.setSize(w, h);
      if (W.bloom) W.bloom.setSize(w * dpr, h * dpr);
    }
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
