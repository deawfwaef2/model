/* ==========================================================================
   TITAN LOOP — 60_ui.js
   全部 UI（DOM 动态构建）：加载/主菜单/关卡/商店/实验室/设置/HUD/结算/暂停/教学
   ========================================================================== */
(function (root) {
  'use strict';
  var TL = root.TL = root.TL || {};
  var M = TL.M, G = TL.game, W = TL.world;
  var d = document;

  var U = TL.ui = { el: {}, screen: null, prevScreen: null, levelsSince: 0 };

  function h(tag, cls, html) {
    var e = d.createElement(tag);
    if (cls) e.className = cls;
    if (html !== undefined) e.innerHTML = html;
    return e;
  }
  function on(el, fn, sound) {
    el.addEventListener('click', function (ev) {
      ev.stopPropagation();
      TL.audio.unlock();
      if (sound !== false) TL.audio.play('click');
      fn(ev);
    });
    el.addEventListener('mouseenter', function () { if (sound !== false) TL.audio.play('hover'); });
    return el;
  }
  function t(k) { return TL.t(k); }

  /* ============================ 屏幕切换 ============================ */
  U.show = function (name) {
    if (U.screen === name) return;
    U.prevScreen = U.screen;
    U.screen = name;
    ['loading', 'menu', 'levels', 'shop', 'lab', 'settings', 'result', 'pause', 'tutorial'].forEach(function (s) {
      var el = U.el[s]; if (!el) return;
      el.classList.toggle('on', s === name);
    });
    U.el.hud.classList.toggle('on', name === null || name === 'hudonly');
    if (name === 'menu') { W.setCam('menu'); renderMenu(); }
    if (name === 'levels') renderLevels();
    if (name === 'shop') renderShop();
    if (name === 'lab') renderLab();
    if (name === 'settings') renderSettings();
  };
  U.hideAll = function () { U.show('hudonly'); };

  /* ============================== 构建 ============================== */
  U.build = function () {
    var ui = d.getElementById('ui');

    /* ---------- 加载 ---------- */
    var load = h('div', 'screen on', '');
    load.id = 'loading';
    load.appendChild(h('div', 'load-ring'));
    var ltxt = h('div', 'load-txt', t('loading'));
    load.appendChild(ltxt);
    var lbar = h('div', 'load-bar', '<i></i>');
    load.appendChild(lbar);
    var tapHint = h('div', 'tap-hint', t('tapToStart'));
    tapHint.style.visibility = 'hidden';
    load.appendChild(tapHint);
    ui.appendChild(load);
    U.el.loading = load; U.el.loadBar = lbar.querySelector('i'); U.el.loadTxt = ltxt; U.el.tapHint = tapHint;

    /* ---------- 主菜单 ---------- */
    var menu = h('div', 'screen'); menu.id = 'menu';
    var top = h('div', 'menu-top');
    top.appendChild(h('h1', 'title-xl', 'TITAN<br>LOOP'));
    var tag = h('div', 'tagline', t('tagline'));
    top.appendChild(tag);
    menu.appendChild(top);

    var mid = h('div', 'menu-mid');
    var btns = h('div', 'menu-btns');
    var bPlay = h('button', 'btn big', '▶ ' + t('play'));
    var bLevels = h('button', 'btn ghost', '🗺 ' + t('levels'));
    var bShop = h('button', 'btn ghost', '🛒 ' + t('shop'));
    var bLab = h('button', 'btn ghost purple', '◈ ' + t('lab'));
    var bDaily = h('button', 'btn ad', '🎁 ' + t('daily'));
    btns.appendChild(bPlay); btns.appendChild(bLevels); btns.appendChild(bShop); btns.appendChild(bLab); btns.appendChild(bDaily);
    mid.appendChild(btns);

    // 主菜单静态广告位 300x250
    var adslot = h('div', 'adslot');
    adslot.id = 'menu-ad';
    adslot.style.width = '300px'; adslot.style.height = '250px';
    adslot.appendChild(h('div', 'lbl', 'ADVERTISEMENT'));
    mid.appendChild(adslot);
    menu.appendChild(mid);

    var bot = h('div', 'menu-bot');
    var curBar = h('div', 'currency-bar');
    bot.appendChild(curBar);
    var bSet = h('button', 'iconbtn', '⚙');
    var bHow = h('button', 'iconbtn', '?');
    var bMute = h('button', 'iconbtn', '🔊');
    var bLang = h('button', 'iconbtn', '文');
    var row2 = h('div', 'menu-bot');
    row2.appendChild(bSet); row2.appendChild(bHow); row2.appendChild(bMute); row2.appendChild(bLang);
    var strip = h('div', 'stat-strip');
    var wrapBot = h('div');
    wrapBot.style.cssText = 'display:flex;flex-direction:column;gap:8px;align-items:center;width:100%';
    wrapBot.appendChild(curBar); wrapBot.appendChild(row2); wrapBot.appendChild(strip);
    menu.appendChild(wrapBot);
    ui.appendChild(menu);
    U.el.menu = menu; U.el.curBar = curBar; U.el.strip = strip; U.el.tagline = tag;
    U.el.bPlay = bPlay; U.el.bLevels = bLevels; U.el.bShop = bShop; U.el.bLab = bLab; U.el.bDaily = bDaily;
    U.el.bSet = bSet; U.el.bHow = bHow; U.el.bMute = bMute; U.el.bLang = bLang;
    U.el.menuAd = adslot;

    on(bPlay, function () { U.startPlay(TL.save.data.levelReached); });
    on(bLevels, function () { U.show('levels'); });
    on(bShop, function () { U.show('shop'); });
    on(bLab, function () { U.show('lab'); });
    on(bSet, function () { U.show('settings'); });
    on(bHow, function () { U.showTutorial(true); });
    on(bDaily, function () { U.claimDaily(); });
    on(bMute, function () {
      var s = TL.save.data.settings;
      var nowOn = !(s.music && s.sfx);
      s.music = nowOn; s.sfx = nowOn; TL.save.mark();
      TL.audio.setMusic(nowOn); TL.audio.setSfx(nowOn);
      bMute.textContent = nowOn ? '🔊' : '🔇';
    });
    on(bLang, function () { TL.setLang(TL.lang === 'zh' ? 'en' : 'zh'); U.relabel(); });

    /* ---------- 通用 sheet 生成 ---------- */
    function sheet(id, titleKey) {
      var sc = h('div', 'screen'); sc.id = id;
      var p = h('div', 'panel sheet');
      var head = h('div', 'sheet-head');
      var ti = h('div', 'sheet-title', t(titleKey));
      var right = h('div');
      right.style.cssText = 'display:flex;gap:8px;align-items:center';
      var cur = h('div', 'currency-bar');
      var close = h('button', 'iconbtn', '✕');
      right.appendChild(cur); right.appendChild(close);
      head.appendChild(ti); head.appendChild(right);
      var body = h('div', 'sheet-body');
      p.appendChild(head); p.appendChild(body);
      sc.appendChild(p);
      ui.appendChild(sc);
      on(close, function () { U.show('menu'); });
      return { sc: sc, body: body, title: ti, cur: cur };
    }

    var lv = sheet('levels', 'levels'); U.el.levels = lv.sc; U.el.levelsBody = lv.body; U.el.levelsTitle = lv.title; U.el.levelsCur = lv.cur;
    var sp = sheet('shop', 'shop'); U.el.shop = sp.sc; U.el.shopBody = sp.body; U.el.shopTitle = sp.title; U.el.shopCur = sp.cur;
    var lb = sheet('lab', 'lab'); U.el.lab = lb.sc; U.el.labBody = lb.body; U.el.labTitle = lb.title; U.el.labCur = lb.cur;
    var st = sheet('settings', 'settings'); U.el.settings = st.sc; U.el.settingsBody = st.body; U.el.settingsTitle = st.title;
    st.cur.style.display = 'none';

    /* ---------- HUD ---------- */
    var hud = h('div', 'screen'); hud.id = 'hud';
    hud.style.opacity = '0'; hud.style.visibility = 'visible'; hud.classList.remove('on');

    var hudTop = h('div', 'hud-top');
    var bossBar = h('div', 'boss-bar');
    bossBar.innerHTML =
      '<div class="bb-name">TITAN</div>' +
      '<div class="bb-track"><div class="bb-ghost"></div><div class="bb-fill"></div><div class="bb-shield"></div></div>' +
      '<div class="bb-num"><span class="hpv">0</span><span class="hpp">100%</span></div>';
    var bossBar2 = h('div', 'boss-bar');
    bossBar2.style.display = 'none'; bossBar2.style.marginTop = '6px';
    bossBar2.innerHTML =
      '<div class="bb-name" style="color:#ffa54a">TITAN II</div>' +
      '<div class="bb-track"><div class="bb-fill" style="background:linear-gradient(180deg,#ffbd6a,#c06a10)"></div></div>';
    var bossWrap = h('div');
    bossWrap.style.cssText = 'flex:1;max-width:320px';
    bossWrap.appendChild(bossBar); bossWrap.appendChild(bossBar2);

    var hudRight = h('div', 'hud-right');
    var pCoin = h('div', 'pill gold', '<span>◉</span><span class="v">0</span>');
    var pShard = h('div', 'pill shard', '<span>◈</span><span class="v">0</span>');
    var pLv = h('div', 'pill', '<span class="v">LV 1</span>');
    var bPause = h('button', 'iconbtn', '❚❚'); bPause.style.pointerEvents = 'auto';
    hudRight.appendChild(pLv); hudRight.appendChild(pCoin); hudRight.appendChild(pShard); hudRight.appendChild(bPause);
    on(bPause, function () { U.pause(); });

    hudTop.appendChild(bossWrap);
    hudTop.appendChild(hudRight);
    hud.appendChild(hudTop);

    // 计时环
    var tw = h('div', 'timer-wrap');
    tw.innerHTML =
      '<svg class="timer-ring" viewBox="0 0 120 120">' +
      '<circle cx="60" cy="60" r="52" fill="rgba(0,0,0,.55)" stroke="rgba(255,255,255,.14)" stroke-width="7"/>' +
      '<circle class="tr" cx="60" cy="60" r="52" fill="none" stroke="#ff6b2c" stroke-width="7" stroke-linecap="round" ' +
      'transform="rotate(-90 60 60)" stroke-dasharray="326.7" stroke-dashoffset="0"/></svg>' +
      '<div class="timer-num">10.0</div><div class="timer-lbl">SECONDS</div>';
    hud.appendChild(tw);

    var combo = h('div', 'combo-box', '<div class="combo-n">0</div><div class="combo-l">COMBO</div>');
    hud.appendChild(combo);

    var shw = h('div', 'shield-wrap');
    shw.innerHTML = '<div class="sh-lbl">SHIELD</div><div class="sh-track"><div class="sh-fill"></div></div>';
    hud.appendChild(shw);

    var rail = h('div', 'amp-rail');
    hud.appendChild(rail);

    var dist = h('div', 'dist-tag', '');
    hud.appendChild(dist);

    ui.appendChild(hud);
    U.el.hud = hud;
    U.el.bbFill = bossBar.querySelector('.bb-fill');
    U.el.bbGhost = bossBar.querySelector('.bb-ghost');
    U.el.bbShield = bossBar.querySelector('.bb-shield');
    U.el.bbHp = bossBar.querySelector('.hpv');
    U.el.bbPct = bossBar.querySelector('.hpp');
    U.el.bb2 = bossBar2; U.el.bb2Fill = bossBar2.querySelector('.bb-fill');
    U.el.trRing = tw.querySelector('.tr');
    U.el.trNum = tw.querySelector('.timer-num');
    U.el.combo = combo; U.el.comboN = combo.querySelector('.combo-n');
    U.el.shFill = shw.querySelector('.sh-fill');
    U.el.rail = rail; U.el.dist = dist;
    U.el.pCoin = pCoin.querySelector('.v'); U.el.pShard = pShard.querySelector('.v'); U.el.pLv = pLv.querySelector('.v');

    /* ---------- 结算 ---------- */
    var res = h('div', 'screen'); res.id = 'result';
    var rc = h('div', 'panel res-card');
    res.appendChild(rc); ui.appendChild(res);
    U.el.result = res; U.el.resCard = rc;

    /* ---------- 暂停 ---------- */
    var pa = h('div', 'screen'); pa.id = 'pause';
    var pc = h('div', 'panel');
    pc.style.cssText = 'width:min(360px,90vw);text-align:center';
    pc.innerHTML = '<div class="res-title" style="font-size:34px">' + t('pause') + '</div>';
    var pbtns = h('div', 'res-btns');
    var bRes = h('button', 'btn big', '▶ ' + t('resume'));
    var bQuit = h('button', 'btn ghost', t('quit'));
    pbtns.appendChild(bRes); pbtns.appendChild(bQuit);
    pc.appendChild(pbtns); pa.appendChild(pc); ui.appendChild(pa);
    on(bRes, function () { U.resume(); });
    on(bQuit, function () { G.abandon(); U.show('menu'); });
    U.el.pause = pa; U.el.pauseTitle = pc.querySelector('.res-title'); U.el.bResume = bRes; U.el.bQuit = bQuit;

    /* ---------- 教学 ---------- */
    var tu = h('div', 'screen'); tu.id = 'tutorial';
    var tc = h('div', 'panel');
    tc.style.cssText = 'width:min(520px,92vw)';
    tu.appendChild(tc); ui.appendChild(tu);
    U.el.tutorial = tu; U.el.tutCard = tc;

    /* ---------- 覆盖层 ---------- */
    var fl = h('div'); fl.id = 'floats'; d.body.appendChild(fl); U.el.floats = fl;
    var to = h('div'); to.id = 'toasts'; d.body.appendChild(to); U.el.toasts = to;
    var bt = h('div'); bt.id = 'bigtext'; bt.innerHTML = '<div class="bt"></div>'; d.body.appendChild(bt);
    U.el.bigtext = bt.querySelector('.bt');
    var vg = h('div'); vg.id = 'vign'; d.body.appendChild(vg); U.el.vign = vg;
    var fx = h('div'); fx.id = 'flash'; d.body.appendChild(fx); U.el.flash = fx;
    var sc2 = h('div'); sc2.id = 'scan'; d.body.appendChild(sc2);

    buildFloatPool();
  };

  /* ======================= 文案刷新（切语言） ======================= */
  U.relabel = function () {
    var e = U.el;
    e.bPlay.innerHTML = '▶ ' + (TL.save.data.levelReached > 1 ? t('continue') : t('play'));
    e.bLevels.innerHTML = '🗺 ' + t('levels');
    e.bShop.innerHTML = '🛒 ' + t('shop');
    e.bLab.innerHTML = '◈ ' + t('lab');
    e.bDaily.innerHTML = '🎁 ' + t('daily');
    e.tagline.textContent = t('tagline');
    e.levelsTitle.textContent = t('levels');
    e.shopTitle.textContent = t('shop');
    e.labTitle.textContent = t('lab');
    e.settingsTitle.textContent = t('settings');
    e.pauseTitle.textContent = t('pause');
    e.bResume.innerHTML = '▶ ' + t('resume');
    e.bQuit.textContent = t('quit');
    e.loadTxt.textContent = t('loading');
    e.tapHint.textContent = t('tapToStart');
    if (U.screen === 'levels') renderLevels();
    if (U.screen === 'shop') renderShop();
    if (U.screen === 'lab') renderLab();
    if (U.screen === 'settings') renderSettings();
    renderMenu();
  };

  /* ========================== 货币条渲染 ============================ */
  function curHTML() {
    var s = TL.save.data;
    return '<div class="cur gold"><span class="ic">◉</span>' + TL.fmt(s.coins) + '</div>' +
      '<div class="cur shard"><span class="ic">◈</span>' + TL.fmt(s.shards) + '</div>' +
      '<div class="cur star"><span class="ic">★</span>' + TL.totalStars() + '/' + (TL.LEVEL_COUNT * 3) + '</div>';
  }
  function refreshCur() {
    [U.el.curBar, U.el.levelsCur, U.el.shopCur, U.el.labCur].forEach(function (c) { if (c) c.innerHTML = curHTML(); });
  }
  U.refreshCur = refreshCur;

  /* ============================= 主菜单 ============================= */
  function renderMenu() {
    var s = TL.save.data;
    refreshCur();
    U.el.bPlay.innerHTML = '▶ ' + (s.levelReached > 1 ? t('continue') + ' · ' + t('level') + ' ' + s.levelReached : t('play'));
    U.el.strip.innerHTML =
      '<span>' + t('killsTotal') + ' <b>' + TL.fmt(s.totalKills) + '</b></span>' +
      '<span>' + t('loopsTotal') + ' <b>' + TL.fmt(s.totalLoops) + '</b></span>' +
      '<span>' + t('starsTotal') + ' <b>' + TL.totalStars() + '</b></span>';
    U.el.bMute.textContent = (s.settings.music || s.settings.sfx) ? '🔊' : '🔇';
    // 每日奖励可领标记
    var canDaily = !sameDay(s.lastDaily, Date.now());
    U.el.bDaily.style.display = canDaily ? '' : 'none';
  }

  /* ============================ 关卡选择 ============================ */
  function renderLevels() {
    refreshCur();
    var s = TL.save.data;
    var body = U.el.levelsBody;
    body.innerHTML = '';
    for (var a = 0; a < 3; a++) {
      var head = h('div', 'act-head');
      var nm = h('div', 'act-name', (a + 1) + ' — ' + t('act' + (a + 1)));
      nm.style.color = TL.ACTS[a].accent;
      head.appendChild(nm); head.appendChild(h('div', 'bar'));
      body.appendChild(head);
      var grid = h('div', 'lv-grid');
      for (var i = a * 10 + 1; i <= a * 10 + 10; i++) {
        grid.appendChild(levelCell(i, s));
      }
      body.appendChild(grid);
    }
    var note = h('div');
    note.style.cssText = 'text-align:center;color:var(--dim);font-size:11px;margin:18px 0 4px;letter-spacing:.1em';
    note.textContent = t('more');
    body.appendChild(note);
  }

  function levelCell(i, s) {
    var key = '' + i;
    var stars = s.stars[key] || 0;
    var unlocked = i <= s.levelReached;
    var isBoss = i % 10 === 0;
    var c = h('div', 'lv' + (unlocked ? '' : ' locked') + (isBoss ? ' boss' : '') + (i === s.levelReached ? ' cur' : ''));
    var starStr = '';
    for (var k = 0; k < 3; k++) starStr += k < stars ? '★' : '<span style="opacity:.2">★</span>';
    c.innerHTML =
      (isBoss ? '<div class="bt2">BOSS</div>' : '') +
      '<div class="n">' + (unlocked ? i : '🔒') + '</div>' +
      '<div class="st">' + (unlocked ? starStr : '') + '</div>' +
      (s.best[key] ? '<div class="best">' + s.best[key].toFixed(2) + 's</div>' : '');
    if (unlocked) on(c, function () { U.startPlay(i); });
    else on(c, function () { TL.audio.play('deny'); }, false);
    return c;
  }

  /* ============================== 商店 ============================== */
  var shopTab = 'weapons';
  function renderShop() {
    refreshCur();
    var body = U.el.shopBody;
    body.innerHTML = '';
    var tabs = h('div', 'tabs');
    [['weapons', t('weapons')], ['boosters', t('boosters')]].forEach(function (p) {
      var tb = h('div', 'tab' + (shopTab === p[0] ? ' on' : ''), p[1]);
      on(tb, function () { shopTab = p[0]; renderShop(); });
      tabs.appendChild(tb);
    });
    body.appendChild(tabs);

    // 免费宝箱（激励视频）
    var s = TL.save.data;
    var cd = 180000;
    var left = Math.max(0, s.freeChestAt + cd - Date.now());
    var chest = h('div', 'card');
    chest.style.borderColor = 'rgba(90,220,120,.5)';
    chest.innerHTML = '<div class="ic">🎁</div><div class="info"><div class="nm">' + t('freeChest') +
      '</div><div class="ds">' + (TL.lang === 'zh' ? '看一段广告，随机获得 120–420 金币' : 'Watch an ad for 120–420 coins') + '</div></div>';
    var cAct = h('div', 'act');
    if (left > 0) {
      var b0 = h('button', 'btn mini ghost', t('freeChestIn') + ' ' + Math.ceil(left / 1000) + 's');
      b0.disabled = true; cAct.appendChild(b0);
    } else {
      var b1 = h('button', 'btn ad mini', '▶ ' + t('freeChest'));
      on(b1, function () {
        TL.ads.rewarded('free_chest', function () {
          var amt = M.randInt(120, 420);
          s.coins += amt; s.freeChestAt = Date.now(); TL.save.mark();
          TL.audio.play('chest');
          U.toast(t('chestGot') + ' ◉' + amt, '#ffc63a');
          renderShop();
        }, function () { U.toast(t('adFailed'), '#ff2f4d'); });
      });
      cAct.appendChild(b1);
    }
    chest.appendChild(cAct);
    body.appendChild(chest);
    body.appendChild(h('div', 'hr'));

    var list = h('div', 'card-list');
    if (shopTab === 'weapons') {
      TL.WEAPONS.forEach(function (w) {
        var owned = s.ownedWeapons.indexOf(w.id) >= 0;
        var eq = s.weapon === w.id;
        var c = h('div', 'card' + (eq ? ' eq' : ''));
        c.innerHTML = '<div class="ic" style="color:#' + ('000000' + w.color.toString(16)).slice(-6) + '">' + w.icon + '</div>' +
          '<div class="info"><div class="nm">' + TL.wName(w) + '</div><div class="ds">' + TL.wDesc(w) +
          '<br><span style="color:#fff;font-family:var(--mono)">DMG ' + w.dmg + ' · ' + w.rate + '/s · ×' + w.shots + '</span></div></div>';
        var act = h('div', 'act');
        if (eq) act.innerHTML = '<span style="color:var(--cyan);font-size:11px;font-weight:700">' + t('equipped') + '</span>';
        else if (owned) { var be = h('button', 'btn mini', t('equip')); on(be, function () { s.weapon = w.id; TL.save.mark(); TL.audio.play('upgrade'); renderShop(); }); act.appendChild(be); }
        else {
          var bb = h('button', 'btn mini' + (s.coins >= w.cost ? '' : ' ghost'), '◉ ' + TL.fmt(w.cost));
          on(bb, function () {
            if (s.coins < w.cost) { TL.audio.play('deny'); U.toast(t('notEnough'), '#ff2f4d'); return; }
            s.coins -= w.cost; s.ownedWeapons.push(w.id); s.weapon = w.id; TL.save.mark();
            TL.audio.play('upgrade'); U.toast(TL.wName(w) + ' ✓', '#ffc63a'); renderShop();
          });
          act.appendChild(bb);
        }
        c.appendChild(act);
        list.appendChild(c);
      });
    } else {
      TL.BOOSTERS.forEach(function (b) {
        var c = h('div', 'card');
        c.innerHTML = '<div class="ic">' + b.icon + '</div><div class="info"><div class="nm">' + (TL.lang === 'zh' ? b.zh : b.en) +
          '</div><div class="ds">' + (TL.lang === 'zh' ? b.zhd : b.end) + '</div></div>';
        var act = h('div', 'act');
        var bb = h('button', 'btn mini' + (s.coins >= b.cost ? '' : ' ghost'), '◉ ' + TL.fmt(b.cost));
        on(bb, function () {
          if (s.coins < b.cost) { TL.audio.play('deny'); U.toast(t('notEnough'), '#ff2f4d'); return; }
          s.coins -= b.cost; TL.save.mark();
          G.pendingBoosters[b.id] = true;
          TL.audio.play('upgrade'); U.toast('✓ ' + (TL.lang === 'zh' ? b.zh : b.en), '#ffc63a'); renderShop();
        });
        act.appendChild(bb); c.appendChild(act);
        list.appendChild(c);
      });
    }
    body.appendChild(list);
  }

  /* ============================ 轮回实验室 ========================== */
  function renderLab() {
    refreshCur();
    var s = TL.save.data;
    var body = U.el.labBody;
    body.innerHTML = '';
    var intro = h('div');
    intro.style.cssText = 'font-size:12px;color:var(--dim);margin-bottom:12px;line-height:1.5';
    intro.textContent = TL.lang === 'zh'
      ? '打碎紫色「轮回核」获得碎片。碎片是永久的 —— 即使你输了也会保留。这就是轮回的意义。'
      : 'Shatter the purple Loop Cores for Shards. Shards are permanent — you keep them even when you lose. That is the point of the loop.';
    body.appendChild(intro);

    var list = h('div', 'card-list');
    TL.UPGRADES.forEach(function (u) {
      var lvl = TL.upLevel(u.id);
      var maxed = lvl >= u.max;
      var cost = TL.upCost(u, lvl);
      var c = h('div', 'card');
      var bars = '';
      for (var i = 0; i < u.max; i++) bars += '<i class="' + (i < lvl ? 'on' : '') + '"></i>';
      c.innerHTML = '<div class="ic" style="color:var(--purple)">' + u.icon + '</div>' +
        '<div class="info"><div class="nm">' + t('up_' + u.id) + ' <span style="color:var(--purple);font-family:var(--mono)">' + lvl + '/' + u.max + '</span></div>' +
        '<div class="ds">' + t('up_' + u.id + '_d') + '</div><div class="lvbar">' + bars + '</div></div>';
      var act = h('div', 'act');
      if (maxed) act.innerHTML = '<span style="color:var(--purple);font-size:11px;font-weight:700">' + t('maxed') + '</span>';
      else {
        var bb = h('button', 'btn mini purple' + (s.shards >= cost ? '' : ' ghost'), '◈ ' + cost);
        on(bb, function () {
          if (s.shards < cost) { TL.audio.play('deny'); U.toast(t('notEnough'), '#ff2f4d'); return; }
          s.shards -= cost; s.upgrades[u.id] = lvl + 1; TL.save.mark();
          TL.audio.play('upgrade');
          U.toast(t('up_' + u.id) + ' → ' + (lvl + 1), '#b44cff');
          renderLab();
        });
        act.appendChild(bb);
      }
      c.appendChild(act);
      list.appendChild(c);
    });
    body.appendChild(list);
  }

  /* ============================== 设置 ============================== */
  function renderSettings() {
    var s = TL.save.data.settings;
    var body = U.el.settingsBody;
    body.innerHTML = '';
    function sw(label, key, cb) {
      var r = h('div', 'set-row');
      r.appendChild(h('div', 'lb', label));
      var w = h('div', 'switch' + (s[key] ? ' on' : ''), '<i></i>');
      on(w, function () { s[key] = !s[key]; TL.save.mark(); w.classList.toggle('on', s[key]); cb && cb(s[key]); });
      r.appendChild(w); body.appendChild(r);
    }
    sw(t('music'), 'music', function (v) { TL.audio.setMusic(v); });
    sw(t('sfx'), 'sfx', function (v) { TL.audio.setSfx(v); });
    sw(t('haptics'), 'haptics');

    var rq = h('div', 'set-row');
    rq.appendChild(h('div', 'lb', t('quality')));
    var seg = h('div', 'seg');
    [['auto', t('qualityAuto')], ['low', t('qualityLow')], ['high', t('qualityHigh')]].forEach(function (p) {
      var sp2 = h('span', s.quality === p[0] ? 'on' : '', p[1]);
      on(sp2, function () { s.quality = p[0]; TL.save.mark(); renderSettings(); U.toast('✓', '#3fd2ff'); });
      seg.appendChild(sp2);
    });
    rq.appendChild(seg); body.appendChild(rq);

    var rl = h('div', 'set-row');
    rl.appendChild(h('div', 'lb', t('language')));
    var seg2 = h('div', 'seg');
    [['en', 'EN'], ['zh', '中文']].forEach(function (p) {
      var sp3 = h('span', TL.lang === p[0] ? 'on' : '', p[1]);
      on(sp3, function () { TL.setLang(p[0]); U.relabel(); });
      seg2.appendChild(sp3);
    });
    rl.appendChild(seg2); body.appendChild(rl);

    var rr = h('div', 'set-row');
    rr.appendChild(h('div', 'lb', t('resetSave')));
    var br = h('button', 'btn mini ghost', '⟲');
    on(br, function () { if (root.confirm(t('resetConfirm'))) { TL.save.reset(); root.location.reload(); } });
    rr.appendChild(br); body.appendChild(rr);

    var ver = h('div');
    ver.style.cssText = 'margin-top:16px;font-family:var(--mono);font-size:10px;color:var(--dim);text-align:center;line-height:1.7';
    ver.innerHTML = 'TITAN LOOP v' + TL.VERSION + ' · build ' + TL.BUILD + '<br>' +
      'ads: ' + TL.ads.provider + ' · renderer: three.js r160<br>' +
      (TL.lang === 'zh' ? '全部音乐与音效为程序化实时合成（原创 · 可商用）' : 'All music & SFX are procedurally synthesized (original · commercial-safe)');
    body.appendChild(ver);
  }

  /* ============================== 教学 ============================== */
  U.showTutorial = function (manual) {
    var c = U.el.tutCard;
    var hints = [
      ['🎯', TL.DEV.touch ? t('hintAimTouch') : t('hintAim'), '#3fd2ff'],
      ['👾', TL.lang === 'zh' ? '<b>第 1 列</b> 红色小兵会冲过来撞你，撞到扣护盾' : '<b>LANE 1</b> Red grunts charge you — contact drains your shield', '#ff5533'],
      ['⚡', '<b>' + (TL.lang === 'zh' ? '第 2 列' : 'LANE 2') + '</b> ' + t('hintAmp'), '#ffc63a'],
      ['◈', '<b>' + (TL.lang === 'zh' ? '第 3 列' : 'LANE 3') + '</b> ' + t('hintCore'), '#b44cff'],
      ['🛡', TL.lang === 'zh' ? '<b>第 4 列</b> 守卫的护盾板会旋转，等它转开再打' : '<b>LANE 4</b> Warden shields rotate — hit them when the plate turns away', '#88e8ff'],
      ['💀', '<b>' + (TL.lang === 'zh' ? '第 5 列' : 'LANE 5') + '</b> ' + t('hintTitan'), '#ff2f4d']
    ];
    var html = '<div class="res-title" style="font-size:26px;color:var(--acc2)">' + t('tutorialTitle') + '</div>' +
      '<div class="res-sub">' + (TL.lang === 'zh' ? '10 秒 · 子弹打哪儿，就是全部的决策' : 'Ten seconds. Where your bullets go is the whole game.') + '</div>' +
      '<div class="howto">';
    hints.forEach(function (x) {
      html += '<div class="ht" style="color:' + x[2] + '"><div class="ic">' + x[0] + '</div><div class="tx">' + x[1] + '</div></div>';
    });
    html += '</div>';
    c.innerHTML = html;
    var b = h('button', 'btn big', t('gotIt'));
    b.style.width = '100%';
    on(b, function () {
      TL.save.data.seenTutorial = true; TL.save.mark();
      if (manual) U.show('menu'); else U.pendingStart && U.pendingStart();
    });
    c.appendChild(b);
    U.show('tutorial');
  };

  /* ============================ 开始游戏 ============================ */
  U.pendingStart = null;
  U.startPlay = function (n) {
    n = M.clamp(n || 1, 1, TL.LEVEL_COUNT);
    if (!TL.save.data.seenTutorial) {
      U.pendingStart = function () { U.pendingStart = null; U.reallyStart(n); };
      U.showTutorial(false);
      return;
    }
    // 每 3 关一次插屏（只在菜单，不打断战斗）
    U.levelsSince++;
    if (U.levelsSince >= 3 && n > 1) {
      U.levelsSince = 0;
      TL.ads.interstitial('level_start', function () { U.reallyStart(n); });
      return;
    }
    U.reallyStart(n);
  };

  U.reallyStart = function (n) {
    TL.ads.clearBanners();
    U.show('hudonly');
    G.startLevel(n);
    U.el.pLv.textContent = 'LV ' + n;
    U.el.rail.innerHTML = '';
    ampChips = {};
    U.bigText(TL.lang === 'zh' ? '准备' : 'READY');
    setTimeout(function () { U.bigText(t('go')); }, 780);
  };

  /* ============================== 暂停 ============================== */
  U.pause = function () {
    if (G.state !== 'play') return;
    G.state = 'paused';
    TL.audio.setDuck(0.25);
    TL.ads.gameplayStop();
    U.show('pause');
  };
  U.resume = function () {
    if (G.state !== 'paused') return;
    G.state = 'play';
    TL.audio.setDuck(1);
    TL.ads.gameplayStart();
    U.show('hudonly');
  };

  /* ============================== 结算 ============================== */
  function renderResult(r) {
    var c = U.el.resCard;
    c.innerHTML = '';
    var s = TL.save.data;

    if (r.win) {
      c.appendChild(h('div', 'res-title win', t('victory')));
      c.appendChild(h('div', 'res-sub', t('level') + ' ' + r.level + (TL.levelDef(r.level).isBoss ? ' · BOSS' : '')));
      var st = h('div', 'stars');
      for (var i = 0; i < 3; i++) { var sp = h('span', 'star', '★'); st.appendChild(sp); }
      c.appendChild(st);
      var tm = h('div', 'res-time', r.time.toFixed(2) + 's <small>' + t('clearTime') + '</small>' + (r.newBest ? '<span class="newbest">' + t('newBest') + '</span>' : ''));
      c.appendChild(tm);
      // par 进度条
      var pb = h('div', 'parbar');
      var w1 = M.clamp(r.time / (r.par * 1.2), 0, 1) * 100;
      pb.innerHTML = '<i style="width:' + w1 + '%"></i>' +
        '<u style="left:' + (M.clamp(0.62 / 1.2, 0, 1) * 100) + '%"></u>' +
        '<u style="left:' + (M.clamp(0.92 / 1.2, 0, 1) * 100) + '%"></u>';
      c.appendChild(pb);
      var pl = h('div', 'parlbl', '<span>★★★ ≤' + (r.par * 0.62).toFixed(2) + 's</span><span>★★ ≤' + (r.par * 0.92).toFixed(2) + 's</span>');
      c.appendChild(pl);

      var rows = h('div', 'res-rows');
      rows.innerHTML =
        '<div class="res-row"><span>' + t('coins') + '</span><b style="color:var(--gold)">◉ ' + TL.fmt(r.coins) + '</b></div>' +
        '<div class="res-row"><span>' + t('shards') + '</span><b style="color:var(--purple)">◈ ' + r.shards + '</b></div>' +
        '<div class="res-row"><span>' + t('combo') + '</span><b>×' + r.combo + '</b></div>';
      c.appendChild(rows);

      var bts = h('div', 'res-btns');
      var row1 = h('div', 'row');
      var bx2 = h('button', 'btn ad', '▶ ' + t('rewardX2'));
      on(bx2, function () {
        bx2.disabled = true;
        TL.ads.rewarded('double_coins', function () {
          s.coins += r.coins; TL.save.mark();
          TL.audio.play('chest');
          U.toast('◉ +' + TL.fmt(r.coins), '#ffc63a');
          bx2.className = 'btn ghost'; bx2.textContent = '✓ ' + t('claimed');
          refreshCur();
        }, function () { bx2.disabled = false; U.toast(t('adFailed'), '#ff2f4d'); });
      });
      row1.appendChild(bx2);
      bts.appendChild(row1);

      var row2 = h('div', 'row');
      if (r.level < TL.LEVEL_COUNT) {
        var bn = h('button', 'btn big', t('next') + ' ▶');
        on(bn, function () { U.startPlay(r.level + 1); });
        row2.appendChild(bn);
      } else {
        row2.appendChild(h('div', 'res-sub', t('allClear')));
      }
      bts.appendChild(row2);

      var row3 = h('div', 'row');
      var br2 = h('button', 'btn ghost mini', '⟲ ' + t('retry'));
      on(br2, function () { U.startPlay(r.level); });
      var bm = h('button', 'btn ghost mini', t('menu'));
      on(bm, function () { G.abandon(); U.show('menu'); });
      var bl2 = h('button', 'btn ghost mini purple', '◈ ' + t('lab'));
      on(bl2, function () { G.abandon(); U.show('lab'); });
      row3.appendChild(br2); row3.appendChild(bl2); row3.appendChild(bm);
      bts.appendChild(row3);
      c.appendChild(bts);

      // 星星逐颗点亮
      var stars = st.querySelectorAll('.star');
      for (var k = 0; k < r.stars; k++) {
        (function (kk) {
          setTimeout(function () { stars[kk].classList.add('lit'); TL.audio.play('star', kk); }, 320 + kk * 240);
        })(k);
      }
      if (r.level >= s.levelReached - 1) setTimeout(function () { TL.audio.play('levelUnlock'); }, 1100);

    } else {
      var reasonTxt = r.reason === 'crushed' ? t('crushed') : r.reason === 'overrun' ?
        (TL.lang === 'zh' ? '护盾被击穿' : 'SHIELD OVERRUN') : t('timeUp');
      c.appendChild(h('div', 'res-title lose', t('defeat')));
      c.appendChild(h('div', 'res-sub', reasonTxt + ' · ' + t('level') + ' ' + r.level));

      var pct = Math.round((1 - r.titanPct) * 100);
      var pb2 = h('div', 'parbar');
      pb2.style.height = '10px';
      pb2.innerHTML = '<i style="width:' + pct + '%;background:linear-gradient(90deg,#ff7a5a,#c0130f)"></i>';
      c.appendChild(pb2);
      c.appendChild(h('div', 'parlbl', '<span>' + (TL.lang === 'zh' ? '泰坦已损毁' : 'TITAN DAMAGED') + '</span><span>' + pct + '%</span>'));

      var rows2 = h('div', 'res-rows');
      rows2.innerHTML =
        '<div class="res-row"><span>' + t('shards') + ' <span style="color:var(--dim);font-size:10px">(' + (TL.lang === 'zh' ? '永久保留' : 'kept forever') + ')</span></span><b style="color:var(--purple)">◈ ' + r.shards + '</b></div>' +
        '<div class="res-row"><span>' + t('coins') + '</span><b style="color:var(--gold)">◉ ' + TL.fmt(r.coins) + '</b></div>' +
        '<div class="res-row"><span>' + t('killsTotal') + '</span><b>' + r.kills + '</b></div>';
      c.appendChild(rows2);

      var bts2 = h('div', 'res-btns');
      if (r.canRevive) {
        var rowr = h('div', 'row');
        var brv = h('button', 'btn ad big', '▶ ' + t('revive'));
        on(brv, function () {
          brv.disabled = true;
          TL.ads.rewarded('revive', function () {
            U.show('hudonly'); G.revive();
          }, function () { brv.disabled = false; U.toast(t('adFailed'), '#ff2f4d'); });
        });
        rowr.appendChild(brv); bts2.appendChild(rowr);
      }
      var rowb = h('div', 'row');
      var brt = h('button', 'btn big', '⟲ ' + t('retry'));
      on(brt, function () { U.startPlay(r.level); });
      rowb.appendChild(brt);
      bts2.appendChild(rowb);

      var rowc = h('div', 'row');
      var blb = h('button', 'btn purple mini', '◈ ' + t('lab') + (r.shards > 0 ? ' +' + r.shards : ''));
      on(blb, function () { G.abandon(); U.show('lab'); });
      var bmn = h('button', 'btn ghost mini', t('menu'));
      on(bmn, function () { G.abandon(); U.show('menu'); });
      rowc.appendChild(blb); rowc.appendChild(bmn);
      bts2.appendChild(rowc);
      c.appendChild(bts2);
    }
    refreshCur();
    U.show('result');
  }

  /* ============================ 每日奖励 ============================ */
  function sameDay(a, b) {
    if (!a) return false;
    var da = new Date(a), db = new Date(b);
    return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
  }
  U.claimDaily = function () {
    var s = TL.save.data;
    if (sameDay(s.lastDaily, Date.now())) { U.toast(t('claimed'), '#9b8f96'); return; }
    var yesterday = Date.now() - 86400000;
    s.dailyStreak = sameDay(s.lastDaily, yesterday) ? s.dailyStreak + 1 : 1;
    var streak = Math.min(s.dailyStreak, 7);
    var coins = 100 * streak, shards = Math.floor(streak / 2) + 1;
    s.lastDaily = Date.now();
    s.coins += coins; s.shards += shards; TL.save.mark();
    TL.audio.play('chest');
    U.toast(t('daily') + ' ' + t('dailyStreak') + ' ×' + streak, '#ffc63a');
    setTimeout(function () { U.toast('◉ +' + coins + '   ◈ +' + shards, '#ffc63a'); }, 340);
    renderMenu();
    // 追加一个"看广告翻倍"
    setTimeout(function () {
      TL.ads.rewarded('daily_double', function () {
        s.coins += coins; s.shards += shards; TL.save.mark();
        TL.audio.play('chest'); U.toast('×2 ◉ +' + coins + '  ◈ +' + shards, '#58e07a'); renderMenu(); refreshCur();
      }, function () {});
    }, 700);
  };

  /* =========================== 漂浮数字池 =========================== */
  var floatPool = [], floatHead = 0;
  function buildFloatPool() {
    for (var i = 0; i < 46; i++) {
      var e = h('div', 'fl');
      e.style.opacity = '0';
      U.el.floats.appendChild(e);
      floatPool.push({ el: e, t: 0, life: 0, x: 0, y: 0, vy: 0, vx: 0 });
    }
  }
  function spawnFloat(x, y, text, cls, life) {
    var f = null;
    for (var i = 0; i < floatPool.length; i++) {
      var idx = (floatHead + i) % floatPool.length;
      if (floatPool[idx].life <= 0) { f = floatPool[idx]; floatHead = (idx + 1) % floatPool.length; break; }
    }
    if (!f) return;
    f.el.className = 'fl ' + cls;
    f.el.textContent = text;
    f.x = x; f.y = y;
    f.vx = (Math.random() - 0.5) * 34;
    f.vy = -(58 + Math.random() * 36);
    f.t = 0; f.life = life || 0.85;
    f.el.style.opacity = '1';
    f.el.style.transform = 'translate(-50%,-50%)';
    f.el.style.left = x + 'px'; f.el.style.top = y + 'px';
  }
  function updateFloats(dt) {
    for (var i = 0; i < floatPool.length; i++) {
      var f = floatPool[i];
      if (f.life <= 0) continue;
      f.t += dt;
      if (f.t >= f.life) { f.life = 0; f.el.style.opacity = '0'; continue; }
      var p = f.t / f.life;
      f.vy += 105 * dt;
      f.x += f.vx * dt; f.y += f.vy * dt;
      f.el.style.left = f.x + 'px';
      f.el.style.top = f.y + 'px';
      var sc = p < 0.18 ? M.lerp(1.5, 1, p / 0.18) : 1;
      f.el.style.transform = 'translate(-50%,-50%) scale(' + sc + ')';
      f.el.style.opacity = '' + (p > 0.6 ? 1 - (p - 0.6) / 0.4 : 1);
    }
  }

  /* ============================== Toast ============================= */
  U.toast = function (text, color) {
    var e = h('div', 'toast', text);
    e.style.color = color || '#fff';
    U.el.toasts.appendChild(e);
    setTimeout(function () {
      e.style.transition = 'opacity .3s, transform .3s';
      e.style.opacity = '0'; e.style.transform = 'translateY(-12px)';
      setTimeout(function () { if (e.parentNode) e.parentNode.removeChild(e); }, 320);
    }, 1300);
    while (U.el.toasts.children.length > 4) U.el.toasts.removeChild(U.el.toasts.firstChild);
  };

  U.bigText = function (txt) {
    var e = U.el.bigtext;
    e.textContent = txt;
    e.classList.remove('go'); void e.offsetWidth; e.classList.add('go');
  };

  U.flash = function (alpha, dur) {
    var e = U.el.flash;
    e.style.transition = 'none'; e.style.opacity = '' + alpha;
    requestAnimationFrame(function () {
      e.style.transition = 'opacity ' + (dur || 0.22) + 's ease-out';
      e.style.opacity = '0';
    });
  };

  /* ============================ HUD 更新 ============================ */
  var ampChips = {};
  var shownHp = 1;
  U.updateHUD = function (dt) {
    updateFloats(dt);
    if (G.state !== 'play' && G.state !== 'ending' && G.state !== 'intro' && G.state !== 'paused') return;
    var hd = G.hudData();

    // 计时环
    var pct = M.clamp(hd.remain / hd.total, 0, 1);
    U.el.trRing.setAttribute('stroke-dashoffset', '' + (326.7 * (1 - pct)));
    U.el.trRing.setAttribute('stroke', pct > 0.45 ? '#ff6b2c' : pct > 0.22 ? '#ffd14a' : '#ff2f4d');
    U.el.trNum.textContent = hd.remain.toFixed(1);
    U.el.trNum.className = 'timer-num' + (pct <= 0.22 ? ' crit' : pct <= 0.45 ? ' warn' : '');

    // 泰坦血条
    var hp = M.clamp(hd.hp / hd.maxHp, 0, 1);
    U.el.bbFill.style.transform = 'scaleX(' + hp + ')';
    shownHp = M.damp(shownHp, hp, 4, dt);
    U.el.bbGhost.style.transform = 'scaleX(' + Math.max(hp, shownHp) + ')';
    var sh = hd.maxShieldHp > 0 ? M.clamp(hd.shieldHp / hd.maxShieldHp, 0, 1) : 0;
    U.el.bbShield.style.transform = 'scaleX(' + sh + ')';
    U.el.bbShield.style.opacity = sh > 0 ? '0.95' : '0';
    U.el.bbHp.textContent = TL.fmt(Math.ceil(hd.hp)) + (hd.shieldHp > 0 ? ' +' + TL.fmt(Math.ceil(hd.shieldHp)) : '');
    U.el.bbPct.textContent = Math.round(hp * 100) + '%';
    if (hd.hp2 >= 0) {
      U.el.bb2.style.display = '';
      U.el.bb2Fill.style.transform = 'scaleX(' + M.clamp(hd.hp2 / hd.maxHp2, 0, 1) + ')';
    } else U.el.bb2.style.display = 'none';

    // 护盾
    U.el.shFill.style.transform = 'scaleX(' + M.clamp(hd.shield / Math.max(1, hd.maxShield), 0, 1) + ')';

    // 货币
    U.el.pCoin.textContent = TL.fmt(hd.coins);
    U.el.pShard.textContent = '' + hd.shards;

    // 距离
    U.el.dist.innerHTML = t('bossIncoming') + ' <b>' + hd.dist.toFixed(1) + 'm</b>';

    // 危险描边
    var danger = Math.max(pct <= 0.28 ? (1 - pct / 0.28) : 0, G.lastHurt > 0 ? 1 : 0, hd.shield / Math.max(1, hd.maxShield) < 0.28 ? 0.7 : 0);
    U.el.vign.style.opacity = '' + (danger * 0.85);
  };

  /* ============================ 事件接线 ============================ */
  TL.on('dmg', function (p) {
    var s = W.worldToScreen(p.pos);
    if (s.behind) return;
    spawnFloat(s.x, s.y, '' + Math.round(p.v), p.crit ? 'dmg crit' : 'dmg', p.crit ? 0.95 : 0.6);
  });
  TL.on('float', function (p) {
    var s = W.worldToScreen(p.pos);
    if (s.behind) return;
    spawnFloat(s.x, s.y, p.text, p.cls, 1.1);
  });
  TL.on('toast', function (p) { U.toast(p.text, p.color); });
  TL.on('combo', function (n) {
    U.el.comboN.textContent = '' + n;
    U.el.combo.classList.toggle('on', n >= 3);
    if (n >= 3) { U.el.combo.classList.remove('bump'); void U.el.combo.offsetWidth; U.el.combo.classList.add('bump'); }
  });
  TL.on('amp:got', function (a) {
    var key = a.id;
    if (ampChips[key]) {
      ampChips[key].n++;
      ampChips[key].el.setAttribute('data-n', ampChips[key].n);
      ampChips[key].el.classList.add('stack');
    } else {
      var e = h('div', 'amp-chip', '<span class="ic">' + a.icon + '</span>' + TL.ampName(a));
      U.el.rail.appendChild(e);
      ampChips[key] = { el: e, n: 1 };
    }
    U.flash(0.16, 0.25);
    U.toast(a.icon + ' ' + TL.ampName(a) + ' · ' + TL.ampDesc(a), '#ffc63a');
  });
  TL.on('hurt', function () { U.flash(0.22, 0.28); });
  TL.on('go', function () { });
  TL.on('result', function (r) { renderResult(r); });
  TL.on('revived', function () { U.bigText('+3s'); U.flash(0.3, 0.4); });
  TL.on('ad:start', function () { if (G.state === 'play') U.pause(); });
  TL.on('platform:pause', function () { if (G.state === 'play') U.pause(); });

  root.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      if (G.state === 'play') U.pause();
      else if (G.state === 'paused') U.resume();
      else if (U.screen && U.screen !== 'menu' && U.screen !== 'loading' && U.screen !== 'result') U.show('menu');
    }
    if (e.key === 'm' || e.key === 'M') { U.el.bMute && U.el.bMute.click(); }
  });
  root.addEventListener('blur', function () { if (G.state === 'play') U.pause(); });
  d.addEventListener('visibilitychange', function () {
    if (d.hidden) { if (G.state === 'play') U.pause(); TL.audio.suspend(); }
    else TL.audio.resume();
  });

})(typeof window !== 'undefined' ? window : this);
