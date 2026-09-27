/* =============================================================================
 *  ADS ADAPTER — CrazyGames build
 *  -----------------------------------------------------------------------
 *  Implements the unified Ads API on top of CrazyGames SDK v3.
 *  Docs: https://docs.crazygames.com/sdk/
 *
 *  QA compliance checklist implemented here:
 *   [x] SDK.init() before anything else
 *   [x] game.loadingStart() during boot, game.loadingStop() when ready
 *   [x] game.gameplayStart() / gameplayStop() bracket active gameplay
 *   [x] gameplayStop() is called before EVERY ad request
 *   [x] audio muted on adStarted, restored on adFinished / adError
 *   [x] no ads during active gameplay (all placements are on menus/results)
 *   [x] happytime() on positive moments (level cleared)
 *   [x] adError codes 'unfilled' / 'adblock' treated as no-fill
 *   [x] graceful degradation if the SDK script fails to load (offline/adblock)
 * ========================================================================== */
(function (global) {
  'use strict';

  var Ads = { platform: 'crazygames', ready: false };
  var SDK = null;
  var inited = false;
  var busy = false;
  var loadingStopped = false;
  var gameplayOn = false;
  var bannerContainers = [];

  var BANNER_W = 320, BANNER_H = 100;

  function log() { /* console.log.apply(console, ['[ads]'].concat([].slice.call(arguments))); */ }
  function getSDK() { return (global.CrazyGames && global.CrazyGames.SDK) ? global.CrazyGames.SDK : null; }

  function mute() { try { if (global.AE) AE.setMasterVolume(0); } catch (e) {} }
  function unmute() { try { if (global.AE) AE.setMasterVolume(0.85); } catch (e) {} }

  /* ------------------------------------------------- fallback ad overlay
   * Used when the SDK never loads (offline / blocked). Keeps the game
   * playable and never leaves a promise hanging. */
  function overlay(title, seconds, rewarded) {
    return new Promise(function (resolve) {
      var host = document.getElementById('adOverlay');
      if (!host) { resolve(true); return; }
      host.innerHTML =
        '<div class="adbox"><div class="adlabel">ADVERTISEMENT</div>' +
        '<div class="adtitle">' + title + '</div>' +
        '<div class="adsim"><div class="adsim-glow"></div><div class="adsim-txt">' +
        (rewarded ? '🎁' : '📺') + '</div></div>' +
        '<div class="adbar"><i id="adBarFill"></i></div>' +
        '<div class="adcount">' + (rewarded ? 'Reward in ' : 'Resuming in ') +
        '<b id="adCount">' + seconds + '</b>s</div>' +
        '<div class="adnote">ad service unavailable — showing placeholder</div></div>';
      host.classList.add('show');
      mute();
      var start = performance.now(), total = seconds * 1000;
      (function tick() {
        var e = performance.now() - start, f = Math.min(1, e / total);
        var fill = document.getElementById('adBarFill'), cnt = document.getElementById('adCount');
        if (fill) fill.style.width = (f * 100) + '%';
        if (cnt) cnt.textContent = Math.max(0, Math.ceil((total - e) / 1000));
        if (f < 1) requestAnimationFrame(tick);
        else { host.classList.remove('show'); host.innerHTML = ''; unmute(); resolve(true); }
      })();
    });
  }

  /* ---------------------------------------------------------------- init */
  Ads.init = function () {
    return new Promise(function (resolve) {
      var t0 = Date.now();
      (function wait() {
        var s = getSDK();
        if (s) {
          SDK = s;
          var p;
          try {
            p = SDK.init({ wrapper: { engine: 'custom-threejs', sdkVersion: '3' } });
          } catch (e) { p = null; }
          if (p && p.then) {
            p.then(function () {
              inited = true; Ads.ready = true;
              try { SDK.game.loadingStart(); } catch (e) {}
              log('sdk ready');
              resolve();
            }).catch(function () { log('sdk init failed'); resolve(); });
          } else {
            inited = !!SDK; Ads.ready = inited;
            try { SDK.game.loadingStart(); } catch (e) {}
            resolve();
          }
        } else if (Date.now() - t0 > 4000) {
          log('sdk missing -> fallback mode');
          resolve();
        } else {
          setTimeout(wait, 100);
        }
      })();
    });
  };

  /* Called once the game is fully loaded and the menu is interactive. */
  Ads.gameReady = function () {
    if (loadingStopped) return;
    loadingStopped = true;
    if (inited && SDK) { try { SDK.game.loadingStop(); } catch (e) {} }
  };

  /* ------------------------------------------------------------- banners */
  Ads.showBanner = function (elId) {
    var el = document.getElementById(elId);
    if (!el) return;
    el.style.display = '';
    if (!inited || !SDK || !SDK.banner) { el.innerHTML = ''; return; }
    // container must have a concrete size for the responsive banner to fill it
    var cid = elId + '_cg';
    el.innerHTML = '<div id="' + cid + '" style="width:' + BANNER_W + 'px;height:' + BANNER_H +
      'px;max-width:92vw;margin:0 auto;"></div>';
    if (bannerContainers.indexOf(cid) < 0) bannerContainers.push(cid);
    try {
      var r = SDK.banner.requestResponsiveBanner(cid);
      if (r && r.catch) r.catch(function () { el.innerHTML = ''; });
    } catch (e) { el.innerHTML = ''; }
  };

  Ads.hideBanner = function () {
    if (inited && SDK && SDK.banner) {
      try { SDK.banner.clearAllBanners(); } catch (e) {}
    }
    bannerContainers.length = 0;
    ['adSlotMenu', 'adSlotShop', 'adSlotResult'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.innerHTML = '';
    });
  };

  /* ---------------------------------------------------------------- ads */
  function requestAd(type, fallbackSeconds, rewarded) {
    if (busy) return Promise.resolve(false);
    busy = true;
    Ads.gameplayStop();                    // never request an ad mid-gameplay

    if (!inited || !SDK || !SDK.ad) {
      return overlay(rewarded ? 'Watch to earn your reward' : 'Commercial break',
        fallbackSeconds, rewarded).then(function (v) { busy = false; return v; });
    }

    return new Promise(function (resolve) {
      var done = false;
      function finish(granted) {
        if (done) return;
        done = true;
        clearTimeout(guard);
        unmute();
        busy = false;
        resolve(granted);
      }
      var guard = setTimeout(function () { finish(false); }, 60000);

      try {
        SDK.ad.requestAd(type, {
          adStarted: function () { mute(); },
          adFinished: function () { finish(true); },
          adError: function (error) {
            var code = (error && (error.code || error)) + '';
            // 'unfilled' / 'adblock' => no ad could be served at all.
            // Granting the reward here keeps the player from being punished
            // for something outside their control (standard practice).
            var noFill = code.indexOf('unfilled') >= 0 || code.indexOf('adblock') >= 0 ||
              code.indexOf('adsDisabled') >= 0;
            finish(rewarded ? noFill : false);
          }
        });
      } catch (e) { finish(false); }
    });
  }

  Ads.showInterstitial = function () { return requestAd('midgame', 3, false).then(function () {}); };
  Ads.showRewarded = function () { return requestAd('rewarded', 4, true); };

  /* ----------------------------------------------------- game lifecycle */
  Ads.gameplayStart = function () {
    if (gameplayOn) return;
    gameplayOn = true;
    Ads.gameReady();
    if (inited && SDK) { try { SDK.game.gameplayStart(); } catch (e) {} }
  };
  Ads.gameplayStop = function () {
    if (!gameplayOn) return;
    gameplayOn = false;
    if (inited && SDK) { try { SDK.game.gameplayStop(); } catch (e) {} }
  };
  Ads.happyTime = function () {
    if (inited && SDK) { try { SDK.game.happytime(); } catch (e) {} }
  };
  Ads.isAdBlocked = function () { return !inited; };

  global.Ads = Ads;
})(window);
