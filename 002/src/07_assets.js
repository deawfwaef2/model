/* ==========================================================================
   TITAN LOOP — 07_assets.js
   模型运行时：解码 → 解析 → 材质统一 → 克隆 / 合批

   这一层要解决三个问题：

   1) file:// 下没法 fetch，所以模型是 base64 内联的（见 05_assets_data.js），
      这里负责 base64 → ArrayBuffer → GLTFLoader.parse。

   2) Kenney 的 Space Kit 模型用的是「具名材质 + 顶点色」而不是贴图，
      材质名固定为 metal / metalDark / metalRed / dark / rock / crystal …
      于是可以把它们全部替换成**全局共享的调色板材质**：
        · 69 个模型共用十来个材质实例 → draw call 批次少、显存低
        · 换一幕只要改调色板的颜色 → 整个世界瞬间换肤，不用重建任何几何体
      这是本作美术方向的核心机关。

   3) Blaster Kit / Tower Defense 那批模型共用同一张 colormap 调色贴图，
      每个 GLB 里都塞了一份副本 —— 这里只保留第一份，其余全部指过去。
   ========================================================================== */
(function (root) {
  'use strict';

  var TL = root.TL = root.TL || {};
  var T = root.THREE;
  var DATA = root.TL_ASSET_DATA || { models: {}, icons: {} };

  var A = TL.assets = {};

  /* Kenney 的模型是按 1 单位 ≈ 1 格设计的，人物只有 0.79 高。
     本作世界尺度取 1 格 = 2.4 米，宇航员因此约 1.9 米高。 */
  A.UNIT = 2.4;

  A.models = {};      // name -> { scene, animations, box, size }
  A.icons = DATA.icons;
  A.ready = false;

  /* ======================================================================
     调色板
     ====================================================================== */

  // 三幕的主色，和 30_data.js / 10_audio.js 的 act 序号一一对应
  var ACT_PALETTES = [
    { // 0 —— 熔核废墟：锈红、余烬、焦土
      accent: 0xff6b2c, accent2: 0xffb347, glow: 0xff8a3d,
      metal: 0x8d8289, metalDark: 0x44383f, dark: 0x16101a,
      rock: 0x6b4a3f, rockTrack: 0x3d2822, skin: 0xd9a066,
      titanBody: 0x2e1218, titanTrim: 0xff5a1f
    },
    { // 1 —— 霜蚀深渊：冰青、钢蓝、幽绿
      accent: 0x3ddcff, accent2: 0x7ef2d0, glow: 0x5ce6ff,
      metal: 0x7e8c9c, metalDark: 0x323f4e, dark: 0x0d1420,
      rock: 0x47596b, rockTrack: 0x23303d, skin: 0xd9a066,
      titanBody: 0x14283a, titanTrim: 0x2fd3ff
    },
    { // 2 —— 虚空王庭：紫金、猩红、深空
      accent: 0xc86bff, accent2: 0xff5fa8, glow: 0xa96bff,
      metal: 0x8b7f9b, metalDark: 0x3d3350, dark: 0x120d1c,
      rock: 0x5a4770, rockTrack: 0x2e2340, skin: 0xd9a066,
      titanBody: 0x2a1440, titanTrim: 0xd46bff
    }
  ];
  A.ACT_PALETTES = ACT_PALETTES;

  // 材质名 -> 调色板取色规则
  // emissive 里的数字是自发光强度，配合 Bloom 后期决定「哪些东西会发光」
  var MAT_RULES = {
    metal:       { key: 'metal',     rough: 0.52, metal: 0.62 },
    metalDark:   { key: 'metalDark', rough: 0.66, metal: 0.55 },
    metalRed:    { key: 'accent',    rough: 0.38, metal: 0.30, emissive: 'accent', ei: 0.42 },
    dark:        { key: 'dark',      rough: 0.78, metal: 0.25 },
    rock:        { key: 'rock',      rough: 0.92, metal: 0.02 },
    rockTrack:   { key: 'rockTrack', rough: 0.95, metal: 0.02 },
    crystal:     { key: 'accent2',   rough: 0.18, metal: 0.10, emissive: 'accent2', ei: 1.35 },
    skin:        { key: 'skin',      rough: 0.80, metal: 0.00 },
    _defaultMat: { key: 'metal',     rough: 0.60, metal: 0.45 },

    /* 泰坦本体（RobotExpressive 的材质名）—— 单独一套，好让 BOSS 在任何一幕
       都能压住场面：主体做成近黑的哑光装甲，靠 trim 的自发光勾边。 */
    Main:        { key: 'titanBody', rough: 0.34, metal: 0.78, emissive: 'titanTrim', ei: 0.16 },
    Grey:        { key: 'metal',     rough: 0.45, metal: 0.80 },
    Black:       { key: 'dark',      rough: 0.55, metal: 0.60 }
  };

  /* 这些模型保留原始原点：武器原点在握把，泰坦是骨骼模型不能包一层 */
  var RAW_PIVOT = { titan: 1 };

  var palette = {};           // 材质名 -> 共享 Material
  var colormapTex = null;     // 去重后的唯一调色贴图
  var colormapMat = null;     // 用它的共享材质

  function hex(n) { return new T.Color(n); }

  function buildPalette() {
    for (var name in MAT_RULES) {
      var r = MAT_RULES[name];
      var m = new T.MeshStandardMaterial({
        color: 0xffffff, roughness: r.rough, metalness: r.metal,
        emissive: 0x000000, emissiveIntensity: 1
      });
      m.name = 'pal_' + name;
      palette[name] = m;
    }
    A.palette = palette;
  }

  /** 切换幕 —— 把整个世界重新上色。不碰任何几何体，所以是零开销。 */
  A.applyAct = function (actIndex) {
    var P = ACT_PALETTES[actIndex % ACT_PALETTES.length];
    A.pal = P;
    for (var name in MAT_RULES) {
      var r = MAT_RULES[name], m = palette[name];
      if (!m) continue;
      m.color.copy(hex(P[r.key] !== undefined ? P[r.key] : 0x888888));
      if (r.emissive) {
        m.emissive.copy(hex(P[r.emissive]));
        m.emissiveIntensity = r.ei;
      }
      m.needsUpdate = true;
    }
    if (colormapMat) {
      // 贴图那批不能整体换色，只做一点点色调偏移，免得跟场景脱节
      colormapMat.color.setRGB(1, 1, 1).lerp(hex(P.accent), 0.10);
      colormapMat.needsUpdate = true;
    }
  };

  /* ======================================================================
     解码 & 解析
     ====================================================================== */

  function b64ToBuffer(b64) {
    var bin = atob(b64), len = bin.length, bytes = new Uint8Array(len);
    for (var i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
    return bytes.buffer;
  }

  /** 把模型里的原始材质换成共享调色板材质 */
  function retarget(scene) {
    scene.traverse(function (o) {
      if (!o.isMesh && !o.isSkinnedMesh) return;
      o.castShadow = false; o.receiveShadow = false;
      var mats = Array.isArray(o.material) ? o.material : [o.material];
      var out = mats.map(function (src) {
        if (!src) return palette.metal;
        var n = src.name;

        // 走贴图的那批（Blaster Kit / Tower Defense）：只保留一份贴图
        if (src.map) {
          if (!colormapTex) {
            colormapTex = src.map;
            colormapTex.colorSpace = T.SRGBColorSpace;
            colormapTex.generateMipmaps = true;
            colormapTex.minFilter = T.LinearMipmapLinearFilter;
            colormapTex.magFilter = T.LinearFilter;
            colormapTex.anisotropy = 4;
            colormapMat = new T.MeshStandardMaterial({
              map: colormapTex, roughness: 0.55, metalness: 0.32
            });
            colormapMat.name = 'pal_colormap';
          }
          return colormapMat;
        }

        if (palette[n]) return palette[n];
        // 没见过的材质名：按亮度猜一个最接近的槽位，保证不会出现纯白塑料
        var lum = src.color ? (src.color.r + src.color.g + src.color.b) / 3 : 0.5;
        return lum > 0.6 ? palette.metal : (lum > 0.3 ? palette.metalDark : palette.dark);
      });
      o.material = Array.isArray(o.material) ? out : out[0];
    });
    return scene;
  }

  /**
   * 分批解析所有模型。每帧只解一小批，让加载条能真的动起来，
   * 而不是卡死几百毫秒再「唰」地跳到 100%。
   */
  A.load = function (onProgress, onDone) {
    if (!T || !T.GLTFLoader) { console.error('[assets] GLTFLoader 缺失'); onDone && onDone(); return; }
    buildPalette();
    A.applyAct(0);

    var loader = new T.GLTFLoader();
    var names = Object.keys(DATA.models);
    var total = names.length, i = 0, done = 0;
    if (!total) { A.ready = true; onDone && onDone(); return; }

    var BATCH = 6;
    var inflight = 0, finished = false;

    // 用「在途计数」驱动，而不是靠 done 去凑批次 ——
    // 解析回调是乱序返回的，凑批次的写法只要错一次就会漏掉后续调度，
    // 整个加载会永远停在半路。
    function pump() {
      while (i < total && inflight < BATCH) { inflight++; parseOne(names[i++]); }
    }
    function later(fn) {
      if (root.requestAnimationFrame) root.requestAnimationFrame(function () { fn(); });
      else setTimeout(fn, 0);
    }

    function parseOne(name) {
      var buf;
      try { buf = b64ToBuffer(DATA.models[name]); }
      catch (e) { console.warn('[assets] 解码失败 ' + name, e); finish(); return; }
      var settled = false;
      loader.parse(buf, '', function (gltf) {
        if (settled) return; settled = true;
        try { store(name, gltf); }
        catch (e) { console.warn('[assets] 处理失败 ' + name, e); }
        finish();
      }, function (err) {
        if (settled) return; settled = true;
        console.warn('[assets] 解析失败 ' + name, err);
        finish();
      });
    }

    function store(name, gltf) {
      var scene = retarget(gltf.scene);
      var box = new T.Box3().setFromObject(scene);

      /* --- 原点归一化 ---------------------------------------------------
         Kenney 的 Space Kit 模型原点不在中心，而是落在它所占格子的角上
         （1×1 的件实际占 x∈[1.5,2.5], z∈[1,2]）。不修正的话，拼装场景时
         每个件都会歪出去一格多。这里统一把原点搬到「底面中心」，
         之后所有摆放坐标就是所见即所得。
         武器要保留原点（那是握把位置），泰坦是骨骼模型也不能动。 */
      if (!RAW_PIVOT[name] && name.indexOf('blaster-') !== 0) {
        var c = box.getCenter(new T.Vector3());
        var wrap = new T.Group();
        scene.position.set(-c.x, -box.min.y, -c.z);
        wrap.add(scene);
        scene = wrap;
        box = new T.Box3().setFromObject(scene);
      }

      A.models[name] = {
        scene: scene,
        animations: gltf.animations || [],
        box: box,
        size: box.getSize(new T.Vector3()),
        center: box.getCenter(new T.Vector3())
      };
    }

    function finish() {
      inflight--;
      done++;
      onProgress && onProgress(done / total);
      if (done >= total) {
        if (finished) return;
        finished = true;
        A.ready = true;
        onDone && onDone();
        return;
      }
      if (i < total) later(pump);
      else if (inflight === 0 && done < total) { finished = true; A.ready = true; onDone && onDone(); }
    }

    pump();
  };

  /* ======================================================================
     取用
     ====================================================================== */

  /* 克隆体的几何体是和原型共享的，必须打标记 ——
     40_world.js 的 disposeTree 靠它来避免把共享资源释放掉。 */
  function markShared(o) {
    o.traverse(function (c) { if (c.isMesh || c.isSkinnedMesh) c.userData.sharedGeo = true; });
  }

  /**
   * 取一个模型副本。几何体与材质都是共享的，所以克隆非常便宜。
   * @param {string} name
   * @param {number} [scale]     世界缩放（默认 1，不含 UNIT）
   * @param {boolean} [ground]   true = 把模型底面对齐到 y=0
   */
  A.get = function (name, scale, ground) {
    var rec = A.models[name];
    if (!rec) {
      // 素材缺失时给一个显眼的占位块，而不是整个游戏崩掉
      var ph = new T.Mesh(new T.BoxGeometry(1, 1, 1),
        new T.MeshBasicMaterial({ color: 0xff00ff, wireframe: true }));
      ph.name = 'MISSING:' + name;
      return ph;
    }
    var o = rec.scene.clone(true);
    markShared(o);
    var s = scale === undefined ? 1 : scale;
    if (s !== 1) o.scale.setScalar(s);
    if (ground) o.position.y = -rec.box.min.y * s;
    o.userData.srcName = name;
    return o;
  };

  /** 取带骨骼动画的模型（泰坦）。必须走 SkeletonUtils，普通 clone 会让骨骼串味。 */
  A.getSkinned = function (name, scale) {
    var rec = A.models[name];
    if (!rec) return A.get(name, scale);
    var o = (T.skeletonClone ? T.skeletonClone(rec.scene) : rec.scene.clone(true));
    markShared(o);
    if (scale !== undefined && scale !== 1) o.scale.setScalar(scale);
    o.userData.srcName = name;
    o.userData.animations = rec.animations;
    return o;
  };

  A.anims = function (name) {
    var rec = A.models[name];
    return rec ? rec.animations : [];
  };

  A.size = function (name) {
    var rec = A.models[name];
    return rec ? rec.size : new T.Vector3(1, 1, 1);
  };

  /* ======================================================================
     静态合批
     ====================================================================== */

  /**
   * 把一堆静态装饰合并成「每种材质一个 Mesh」。
   * 场景里有几百个管道/栏杆/桶，逐个 draw call 会直接拖垮手机；
   * 合批之后整个场景布景只剩 ~10 个 draw call。
   *
   * @param {Array} items  [{ name, pos:[x,y,z], rot?:[x,y,z], scale?:number|[x,y,z] }]
   * @returns {THREE.Group}
   */
  A.merge = function (items) {
    var group = new T.Group();
    group.name = 'merged';
    if (!T.mergeGeometries) {
      // 兜底：合批不可用就老老实实逐个加
      items.forEach(function (it) { group.add(place(it)); });
      return group;
    }

    var buckets = {};   // materialUUID -> { mat, geos[] }
    var m4 = new T.Matrix4();

    items.forEach(function (it) {
      var o = place(it);
      o.updateWorldMatrix(true, true);
      o.traverse(function (c) {
        if (!c.isMesh || !c.geometry) return;
        var mats = Array.isArray(c.material) ? c.material : [c.material];
        var groups = c.geometry.groups;

        // 多材质网格：按 group 切开分别归桶
        if (mats.length > 1 && groups && groups.length) {
          groups.forEach(function (g) {
            var mat = mats[g.materialIndex] || mats[0];
            var sub = extractGroup(c.geometry, g);
            if (sub) push(mat, sub, c.matrixWorld, m4);
          });
        } else {
          push(mats[0], c.geometry.clone(), c.matrixWorld, m4);
        }
      });
    });

    for (var k in buckets) {
      var b = buckets[k];
      var merged = null;
      try { merged = T.mergeGeometries(b.geos, false); } catch (e) { merged = null; }
      if (merged) {
        var mesh = new T.Mesh(merged, b.mat);
        mesh.frustumCulled = true;
        group.add(mesh);
      } else {
        b.geos.forEach(function (g) { group.add(new T.Mesh(g, b.mat)); });
      }
    }
    return group;

    function push(mat, geo, matrixWorld) {
      if (!mat || !geo) return;
      geo = normalize(geo);
      if (!geo) return;
      geo.applyMatrix4(matrixWorld);
      var key = mat.uuid;
      (buckets[key] = buckets[key] || { mat: mat, geos: [] }).geos.push(geo);
    }
  };

  /** 统一属性集合，否则 mergeGeometries 会拒绝合并 */
  function normalize(geo) {
    if (!geo.attributes || !geo.attributes.position) return null;
    if (geo.index) geo = geo.toNonIndexed();
    var count = geo.attributes.position.count;
    if (!geo.attributes.normal) geo.computeVertexNormals();
    if (!geo.attributes.uv) {
      geo.setAttribute('uv', new T.BufferAttribute(new Float32Array(count * 2), 2));
    }
    // 丢掉其它属性（颜色/切线等），避免属性集合不一致
    for (var k in geo.attributes) {
      if (k !== 'position' && k !== 'normal' && k !== 'uv') geo.deleteAttribute(k);
    }
    geo.clearGroups();
    geo.morphAttributes = {};
    return geo;
  }

  function extractGroup(geo, g) {
    var src = geo.index ? geo.toNonIndexed() : geo;
    // toNonIndexed 之后 group 的 start/count 仍然按顶点算
    var start = g.start, count = g.count;
    if (geo.index) {
      // 索引展开后顶点序号就是 index 的顺序，group 区间保持不变
    }
    var out = new T.BufferGeometry();
    var pos = src.attributes.position;
    if (start + count > pos.count) count = Math.max(0, pos.count - start);
    if (count <= 0) return null;
    out.setAttribute('position', sliceAttr(pos, start, count));
    if (src.attributes.normal) out.setAttribute('normal', sliceAttr(src.attributes.normal, start, count));
    if (src.attributes.uv) out.setAttribute('uv', sliceAttr(src.attributes.uv, start, count));
    return out;
  }

  function sliceAttr(attr, start, count) {
    var is = attr.itemSize;
    var arr = attr.array.slice(start * is, (start + count) * is);
    return new T.BufferAttribute(arr, is);
  }

  function place(it) {
    var s = it.scale === undefined ? 1 : it.scale;
    var o = A.get(it.name, (typeof s === 'number' ? s : 1), false);
    if (Array.isArray(s)) o.scale.set(s[0], s[1], s[2]);
    if (it.pos) o.position.set(it.pos[0], it.pos[1], it.pos[2]);
    if (it.rot) o.rotation.set(it.rot[0], it.rot[1], it.rot[2]);
    return o;
  }

  /* ======================================================================
     图标
     ====================================================================== */

  /** 返回内联 SVG 字符串，可直接塞进 innerHTML；颜色跟随 CSS 的 currentColor */
  A.icon = function (name, cls) {
    var svg = A.icons[name];
    if (!svg) return '';
    if (cls) svg = svg.replace('<svg', '<svg class="' + cls + '"');
    return svg.replace('<svg', '<svg aria-hidden="true" focusable="false"');
  };

  /* 便于其它模块拿到 */
  A.hasModel = function (n) { return !!A.models[n]; };

})(typeof window !== 'undefined' ? window : globalThis);
