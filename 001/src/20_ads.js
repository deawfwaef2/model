/* ==========================================================================
   TITAN LOOP — 20_ads.js
   广告抽象层：游戏逻辑只认这一套 API，构建时注入不同 provider
     provider = 'none'        本地/单机包（显示占位，直接发奖，方便测试）
                'crazygames'  CrazyGames SDK v3
                'playgama'    Playgama Bridge
   API:
     Ads.init(cb)
     Ads.rewarded(placement, onReward, onFail)
     Ads.interstitial(placement, onDone)
     Ads.banner(containerEl, size)      // size: '300x250' | '320x50' | '728x90'
     Ads.clearBanners()
     Ads.gameplayStart() / Ads.gameplayStop()
     Ads.happy()                        // 高光时刻（CrazyGames 推荐）
     Ads.loadingStart() / Ads.loadingStop()
   ========================================================================== */
(function (root) {
  'use strict';
  var TL = root.TL = root.TL || {};

  var PROVIDER = root.TL_AD_PROVIDER || 'none';   // 构建脚本会注入

  var Ads = TL.ads = {
    provider: PROVIDER,
    ready: false,
    busy: false,
    adblock: false,
    supportsBanner: PROVIDER !== 'none',
    _gameplayOn: false,
    _interLast: 0,
    _bannerIds: []
  };

  /* ---------- 通用：广告开始/结束时统一静音 + 暂停 ---------- */
  function beginAd() {
    Ads.busy = true;
    try { TL.audio.setDuck(0); } catch (e) {}
    TL.emit('ad:start');
  }
  function endAd() {
    Ads.busy = false;
    try { TL.audio.setDuck(1); } catch (e) {}
    TL.emit('ad:end');
  }

  /* ---------- 占位广告（provider=none 或 SDK 失败时的兜底） ---------- */
  function fakeAd(kind, ms, onDone) {
    beginAd();
    var el = document.createElement('div');
    el.className = 'ad-fallback';
    el.innerHTML =
      '<div class="adfb-box">' +
      '<div class="adfb-tag">AD</div>' +
      '<div class="adfb-title">' + (kind === 'rewarded' ? 'REWARDED VIDEO' : 'AD BREAK') + '</div>' +
      '<div class="adfb-sub">placeholder — real ad on the portal build</div>' +
      '<div class="adfb-bar"><i></i></div>' +
      '<div class="adfb-count"></div></div>';
    document.body.appendChild(el);
    var bar = el.querySelector('.adfb-bar i');
    var cnt = el.querySelector('.adfb-count');
    var t0 = performance.now();
    (function step() {
      var p = Math.min(1, (performance.now() - t0) / ms);
      bar.style.width = (p * 100) + '%';
      cnt.textContent = Math.ceil((1 - p) * ms / 1000) + 's';
      if (p < 1) requestAnimationFrame(step);
      else {
        if (el.parentNode) el.parentNode.removeChild(el);
        endAd(); onDone && onDone(true);
      }
    })();
  }

  /* ====================== CrazyGames SDK v3 ====================== */
  var CG = {
    sdk: null,
    init: function (cb) {
      var tries = 0;
      (function poll() {
        var s = root.CrazyGames && root.CrazyGames.SDK;
        if (s) {
          CG.sdk = s;
          try {
            if (s.init) { s.init({ wrapper: { engine: 'html5', sdkVersion: TL.VERSION } }); }
          } catch (e) {}
          try {
            if (s.ad && s.ad.hasAdblock) {
              s.ad.hasAdblock().then(function (b) { Ads.adblock = !!b; }).catch(function () {});
            }
          } catch (e) {}
          Ads.ready = true; cb && cb(); return;
        }
        if (++tries > 100) { Ads.ready = false; cb && cb(); return; } // 10s 超时 → 走兜底
        setTimeout(poll, 100);
      })();
    },
    request: function (type, cbs) {
      if (!CG.sdk || !CG.sdk.ad) { cbs.adError && cbs.adError('nosdk'); return; }
      try { CG.sdk.ad.requestAd(type, cbs); }
      catch (e) { cbs.adError && cbs.adError(e); }
    }
  };

  /* ====================== Playgama Bridge ====================== */
  var PG = {
    b: null, _rewardCb: null, _rewardFail: null, _interCb: null, _granted: false,
    init: function (cb) {
      var tries = 0;
      (function poll() {
        var b = root.bridge;
        if (b) {
          PG.b = b;
          var done = function () {
            Ads.ready = true;
            try {
              b.advertisement.on(b.EVENT_NAME.REWARDED_STATE_CHANGED, PG.onReward);
              b.advertisement.on(b.EVENT_NAME.INTERSTITIAL_STATE_CHANGED, PG.onInter);
            } catch (e) {}
            try {
              b.platform.on(b.EVENT_NAME.PAUSE_STATE_CHANGED, function (st) { TL.emit(st === 'paused' ? 'platform:pause' : 'platform:resume'); });
              b.platform.on(b.EVENT_NAME.AUDIO_STATE_CHANGED, function (st) { TL.audio.setDuck(st === 'enabled' ? 1 : 0); });
            } catch (e) {}
            try { b.advertisement.setMinimumDelayBetweenInterstitial(45); } catch (e) {}
            try { b.advertisement.checkAdBlock && b.advertisement.checkAdBlock().then(function (r) { Ads.adblock = !!r; }); } catch (e) {}
            cb && cb();
          };
          try {
            var p = b.initialize();
            if (p && p.then) p.then(done).catch(done); else done();
          } catch (e) { done(); }
          return;
        }
        if (++tries > 100) { Ads.ready = false; cb && cb(); return; }
        setTimeout(poll, 100);
      })();
    },
    onReward: function (state) {
      if (state === 'opened') { beginAd(); }
      else if (state === 'rewarded') { PG._granted = true; }
      else if (state === 'closed' || state === 'failed') {
        endAd();
        var g = PG._granted, ok = PG._rewardCb, bad = PG._rewardFail;
        PG._granted = false; PG._rewardCb = null; PG._rewardFail = null;
        if (g) { ok && ok(); } else { bad && bad(state === 'failed' ? 'failed' : 'dismissed'); }
      }
    },
    onInter: function (state) {
      if (state === 'opened') beginAd();
      else if (state === 'closed' || state === 'failed') {
        endAd(); var c = PG._interCb; PG._interCb = null; c && c();
      }
    }
  };

  /* ============================ 公共 API ============================ */
  Ads.init = function (cb) {
    if (PROVIDER === 'crazygames') CG.init(cb);
    else if (PROVIDER === 'playgama') PG.init(cb);
    else { Ads.ready = true; setTimeout(function () { cb && cb(); }, 0); }
  };

  Ads.loadingStart = function () {
    if (PROVIDER === 'crazygames') { try { CG.sdk && CG.sdk.game.loadingStart(); } catch (e) {} }
  };
  Ads.loadingStop = function () {
    if (PROVIDER === 'crazygames') { try { CG.sdk && CG.sdk.game.loadingStop(); } catch (e) {} }
    if (PROVIDER === 'playgama') { try { PG.b && PG.b.platform.sendMessage('game_ready'); } catch (e) {} }
  };
  Ads.gameplayStart = function () {
    if (Ads._gameplayOn) return; Ads._gameplayOn = true;
    if (PROVIDER === 'crazygames') { try { CG.sdk && CG.sdk.game.gameplayStart(); } catch (e) {} }
    if (PROVIDER === 'playgama') { try { PG.b && PG.b.platform.sendMessage('gameplay_started'); } catch (e) {} }
  };
  Ads.gameplayStop = function () {
    if (!Ads._gameplayOn) return; Ads._gameplayOn = false;
    if (PROVIDER === 'crazygames') { try { CG.sdk && CG.sdk.game.gameplayStop(); } catch (e) {} }
    if (PROVIDER === 'playgama') { try { PG.b && PG.b.platform.sendMessage('gameplay_stopped'); } catch (e) {} }
  };
  Ads.happy = function () {
    if (PROVIDER === 'crazygames') { try { CG.sdk && CG.sdk.game.happytime(); } catch (e) {} }
  };

  /** 激励视频：只有真正看完才回调 onReward */
  Ads.rewarded = function (placement, onReward, onFail) {
    if (Ads.busy) { onFail && onFail('busy'); return; }
    Ads.gameplayStop();
    if (PROVIDER === 'crazygames' && CG.sdk) {
      var granted = false;
      beginAd();
      CG.request('rewarded', {
        adStarted: function () { },
        adFinished: function () { granted = true; endAd(); Ads.gameplayResumeMaybe(); onReward && onReward(); },
        adError: function (err) { endAd(); Ads.gameplayResumeMaybe(); if (!granted) onFail && onFail(err); }
      });
      return;
    }
    if (PROVIDER === 'playgama' && PG.b) {
      PG._rewardCb = function () { Ads.gameplayResumeMaybe(); onReward && onReward(); };
      PG._rewardFail = function (r) { Ads.gameplayResumeMaybe(); onFail && onFail(r); };
      PG._granted = false;
      try { PG.b.advertisement.showRewarded(placement); }
      catch (e) { PG._rewardCb = null; PG._rewardFail = null; onFail && onFail(e); }
      return;
    }
    fakeAd('rewarded', 2600, function () { Ads.gameplayResumeMaybe(); onReward && onReward(); });
  };

  /** 插屏：只在菜单/结算等自然断点调用，绝不在战斗中 */
  Ads.interstitial = function (placement, onDone) {
    var nowMs = Date.now();
    if (Ads.busy) { onDone && onDone(); return; }
    if (nowMs - Ads._interLast < 60000) { onDone && onDone(); return; } // 本地也做 60s 频控
    Ads._interLast = nowMs;
    Ads.gameplayStop();
    if (PROVIDER === 'crazygames' && CG.sdk) {
      beginAd();
      CG.request('midgame', {
        adStarted: function () {},
        adFinished: function () { endAd(); onDone && onDone(); },
        adError: function () { endAd(); onDone && onDone(); }
      });
      return;
    }
    if (PROVIDER === 'playgama' && PG.b) {
      PG._interCb = onDone;
      try { PG.b.advertisement.showInterstitial(placement); }
      catch (e) { PG._interCb = null; onDone && onDone(); }
      return;
    }
    fakeAd('midgame', 1800, function () { onDone && onDone(); });
  };

  Ads.gameplayResumeMaybe = function () { TL.emit('ad:resume'); };

  /** 横幅：主菜单 300x250 静态广告位 + 其它页面 320x50 */
  var bannerSeq = 0;
  Ads.banner = function (el, size) {
    if (!el) return;
    var wh = (size || '300x250').split('x');
    var w = parseInt(wh[0], 10), h = parseInt(wh[1], 10);
    el.style.width = w + 'px'; el.style.height = h + 'px';
    el.innerHTML = '';

    if (PROVIDER === 'crazygames' && CG.sdk && CG.sdk.banner) {
      var id = 'cg-banner-' + (++bannerSeq);
      el.id = id;
      Ads._bannerIds.push(id);
      try {
        CG.sdk.banner.requestBanner({ id: id, width: w, height: h })
          .catch ? CG.sdk.banner.requestBanner({ id: id, width: w, height: h }).catch(function () { housead(el, w, h); })
          : null;
      } catch (e) { housead(el, w, h); }
      // SDK 有时同步失败，兜底加个背景
      housead(el, w, h, true);
      return;
    }
    if (PROVIDER === 'playgama' && PG.b) {
      // Playgama 的横幅由平台定位（top/bottom），我们只画自家占位保证版面完整
      try { if (PG.b.advertisement.isBannerSupported) PG.b.advertisement.showBanner('bottom', 'menu'); } catch (e) {}
      housead(el, w, h);
      return;
    }
    housead(el, w, h);
  };

  Ads.clearBanners = function () {
    if (PROVIDER === 'crazygames' && CG.sdk && CG.sdk.banner) {
      try { CG.sdk.banner.clearAllBanners(); } catch (e) {}
      Ads._bannerIds.length = 0;
    }
    if (PROVIDER === 'playgama' && PG.b) { try { PG.b.advertisement.hideBanner(); } catch (e) {} }
  };

  /** 自家"静态广告位"：没有填充时也不空着，交叉推广自己 —— 观感像完成品 */
  function housead(el, w, h, behind) {
    var d = document.createElement('div');
    d.className = 'housead' + (behind ? ' behind' : '');
    d.innerHTML =
      '<div class="ha-glow"></div>' +
      '<div class="ha-tag">AD</div>' +
      '<div class="ha-title">TITAN&nbsp;LOOP</div>' +
      '<div class="ha-sub">' + (TL.t ? TL.t('tagline') : '10 SECONDS TO KILL A GOD') + '</div>' +
      '<div class="ha-cta">▶ PLAY NOW</div>';
    el.appendChild(d);
  }

  Ads.isFallback = function () { return PROVIDER === 'none' || !Ads.ready; };

})(typeof window !== 'undefined' ? window : this);
