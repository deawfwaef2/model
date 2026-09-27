/* =============================================================================
 *  ADS ADAPTER — Playgama build
 *  -----------------------------------------------------------------------
 *  Implements the unified Ads API on top of Playgama Bridge SDK v2.
 *  Docs: https://wiki.playgama.com/playgama/bridge-sdk/
 *  CDN:  https://bridge.playgama.com/v2/stable/playgama-bridge.js
 *  Config: ./playgama-bridge-config.json  (must sit next to index.html)
 *
 *  Implemented per Playgama guidelines:
 *   [x] bridge.initialize() before any bridge.* call
 *   [x] platform.sendMessage(GAME_READY) once the game is interactive
 *   [x] interstitial at natural breakpoints only (never at game start)
 *   [x] reward granted ONLY on rewardedState === 'rewarded'
 *   [x] universal AUDIO_STATE_CHANGED / PAUSE_STATE_CHANGED handlers
 *   [x] isInterstitialSupported / isRewardedSupported / isBannerSupported checks
 *   [x] graceful degradation when the bridge script fails to load
 * ========================================================================== */
(function (global) {
  'use strict';

  var Ads = { platform: 'playgama', ready: false };
  var B = null;
  var inited = false;
  var busy = false;
  var gameReadySent = false;
  var bannerVisible = false;
  var muted = false;

  var pendingRewarded = null;   // {resolve, granted}
  var pendingInterstitial = null;

  function mute() { try { if (global.AE) AE.setMasterVolume(0); } catch (e) {} muted = true; }
  function unmute() { try { if (global.AE) AE.setMasterVolume(0.85); } catch (e) {} muted = false; }

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

  function EV(name, fallback) {
    return (B && B.EVENT_NAME && B.EVENT_NAME[name]) ? B.EVENT_NAME[name] : fallback;
  }

  function wireEvents() {
    if (!B || !B.advertisement || !B.advertisement.on) return;

    B.advertisement.on(EV('REWARDED_STATE_CHANGED', 'rewarded_state_changed'), function (state) {
      if (state === 'opened' || state === 'loading') { mute(); return; }
      if (state === 'rewarded') {
        if (pendingRewarded) pendingRewarded.granted = true;
        return;
      }
      if (state === 'closed' || state === 'failed') {
        unmute();
        if (pendingRewarded) {
          var p = pendingRewarded; pendingRewarded = null; busy = false;
          clearTimeout(p.guard);
          p.resolve(!!p.granted);
        }
      }
    });

    B.advertisement.on(EV('INTERSTITIAL_STATE_CHANGED', 'interstitial_state_changed'), function (state) {
      if (state === 'opened' || state === 'loading') { mute(); return; }
      if (state === 'closed' || state === 'failed') {
        unmute();
        if (pendingInterstitial) {
          var p = pendingInterstitial; pendingInterstitial = null; busy = false;
          clearTimeout(p.guard);
          p.resolve();
        }
      }
    });

    // Universal host-driven audio / pause handling (recommended by Playgama)
    try {
      B.game.on(EV('AUDIO_STATE_CHANGED', 'audio_state_changed'), function (state) {
        if (state === 'muted') mute(); else unmute();
      });
    } catch (e) {}
    try {
      B.game.on(EV('PAUSE_STATE_CHANGED', 'pause_state_changed'), function (state) {
        if (state === 'paused') mute(); else unmute();
      });
    } catch (e) {}
  }

  /* ---------------------------------------------------------------- init */
  Ads.init = function () {
    return new Promise(function (resolve) {
      var t0 = Date.now();
      (function wait() {
        if (global.bridge) {
          B = global.bridge;
          var p;
          try { p = B.initialize(); } catch (e) { p = null; }
          if (p && p.then) {
            p.then(function () {
              inited = true; Ads.ready = true;
              wireEvents();
              resolve();
            }).catch(function () { resolve(); });
          } else { resolve(); }
        } else if (Date.now() - t0 > 4000) {
          resolve();                      // offline / blocked -> fallback mode
        } else {
          setTimeout(wait, 100);
        }
      })();
    });
  };

  Ads.gameReady = function () {
    if (gameReadySent || !inited || !B) return;
    gameReadySent = true;
    try {
      var msg = (B.PLATFORM_MESSAGE && B.PLATFORM_MESSAGE.GAME_READY) || 'game_ready';
      B.platform.sendMessage(msg);
    } catch (e) {}
  };

  /* ------------------------------------------------------------- banners
   * Playgama renders banners itself (docked top/bottom), so the in-page slot
   * is left empty and we just toggle the platform banner. */
  Ads.showBanner = function (elId) {
    var el = document.getElementById(elId);
    if (el) el.innerHTML = '';
    if (!inited || !B || !B.advertisement) return;
    if (B.advertisement.isBannerSupported === false) return;
    if (bannerVisible) return;
    try {
      B.advertisement.showBanner('bottom', elId === 'adSlotShop' ? 'shop' : 'menu');
      bannerVisible = true;
    } catch (e) {}
  };

  Ads.hideBanner = function () {
    ['adSlotMenu', 'adSlotShop', 'adSlotResult'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.innerHTML = '';
    });
    if (!inited || !B || !B.advertisement || !bannerVisible) return;
    try { B.advertisement.hideBanner(); } catch (e) {}
    bannerVisible = false;
  };

  /* ---------------------------------------------------------------- ads */
  Ads.showInterstitial = function () {
    if (busy) return Promise.resolve();
    busy = true;
    Ads.gameplayStop();
    if (!inited || !B || !B.advertisement || B.advertisement.isInterstitialSupported === false) {
      return overlay('Commercial break', 3, false).then(function () { busy = false; });
    }
    return new Promise(function (resolve) {
      pendingInterstitial = {
        resolve: resolve,
        guard: setTimeout(function () {
          if (pendingInterstitial) { pendingInterstitial = null; busy = false; unmute(); resolve(); }
        }, 45000)
      };
      try { B.advertisement.showInterstitial('level_complete'); }
      catch (e) {
        clearTimeout(pendingInterstitial.guard);
        pendingInterstitial = null; busy = false; resolve();
      }
    });
  };

  Ads.showRewarded = function () {
    if (busy) return Promise.resolve(false);
    busy = true;
    Ads.gameplayStop();
    if (!inited || !B || !B.advertisement || B.advertisement.isRewardedSupported === false) {
      return overlay('Watch to earn your reward', 4, true).then(function (v) { busy = false; return v; });
    }
    return new Promise(function (resolve) {
      pendingRewarded = {
        resolve: resolve, granted: false,
        guard: setTimeout(function () {
          if (pendingRewarded) {
            var g = pendingRewarded.granted; pendingRewarded = null; busy = false; unmute();
            resolve(!!g);
          }
        }, 60000)
      };
      try { B.advertisement.showRewarded('reward'); }
      catch (e) {
        clearTimeout(pendingRewarded.guard);
        pendingRewarded = null; busy = false; resolve(false);
      }
    });
  };

  /* ----------------------------------------------------- game lifecycle */
  Ads.gameplayStart = function () { Ads.gameReady(); };
  Ads.gameplayStop = function () {};
  Ads.happyTime = function () {};
  Ads.isAdBlocked = function () { return !inited; };

  global.Ads = Ads;
})(window);
