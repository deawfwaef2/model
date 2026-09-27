/* =============================================================================
 *  ADS ADAPTER — "local" build (no network SDK)
 *  -----------------------------------------------------------------------
 *  This is the OFFLINE / STANDALONE version. It fully implements the unified
 *  Ads API with a simulated ad overlay so the game is 100% playable from
 *  file:// with zero network access.
 *
 *  The CrazyGames and Playgama packages ship their own ads.js that implements
 *  the SAME API. Core game code must never reference a platform SDK directly.
 *
 *  UNIFIED API (do not change without updating all 3 implementations):
 *    Ads.platform                -> 'local' | 'crazygames' | 'playgama'
 *    Ads.init()                  -> Promise<void>
 *    Ads.gameReady()             -> void        (loading finished, menu shown)
 *    Ads.showBanner(elId)        -> void        (static banner in a container)
 *    Ads.hideBanner()            -> void
 *    Ads.showInterstitial()      -> Promise<void>
 *    Ads.showRewarded()          -> Promise<boolean>   true = grant reward
 *    Ads.gameplayStart()         -> void
 *    Ads.gameplayStop()          -> void
 *    Ads.happyTime()             -> void
 *    Ads.isAdBlocked()           -> boolean
 * ========================================================================== */
(function (global) {
  'use strict';

  var Ads = { platform: 'local', ready: false };
  var busy = false;

  /* ---------------------------------------------------------- shared overlay
   * Also used as the FALLBACK by the platform builds when their SDK fails to
   * load (offline testing, adblock, SDK outage). Never let the game hang. */
  function overlay(title, seconds, rewarded) {
    return new Promise(function (resolve) {
      var host = document.getElementById('adOverlay');
      if (!host) { resolve(true); return; }
      var t = seconds;
      host.innerHTML =
        '<div class="adbox">' +
        '<div class="adlabel">ADVERTISEMENT</div>' +
        '<div class="adtitle">' + title + '</div>' +
        '<div class="adsim">' +
        '<div class="adsim-glow"></div>' +
        '<div class="adsim-txt">' + (rewarded ? '🎁' : '📺') + '</div>' +
        '</div>' +
        '<div class="adbar"><i id="adBarFill"></i></div>' +
        '<div class="adcount">' + (rewarded ? 'Reward in ' : 'Resuming in ') + '<b id="adCount">' + t + '</b>s</div>' +
        '<div class="adnote">(simulated placement — live ads served on CrazyGames / Playgama)</div>' +
        '</div>';
      host.classList.add('show');
      if (global.AE) AE.duck(0.85, seconds + 0.5);

      var start = performance.now();
      var total = seconds * 1000;
      function tick() {
        var e = performance.now() - start;
        var f = Math.min(1, e / total);
        var fill = document.getElementById('adBarFill');
        var cnt = document.getElementById('adCount');
        if (fill) fill.style.width = (f * 100) + '%';
        if (cnt) cnt.textContent = Math.max(0, Math.ceil((total - e) / 1000));
        if (f < 1) requestAnimationFrame(tick);
        else {
          host.classList.remove('show');
          host.innerHTML = '';
          resolve(true);
        }
      }
      requestAnimationFrame(tick);
    });
  }
  Ads._overlay = overlay;

  /* -------------------------------------------------------------- house ad
   * Static "banner" placement. On the local build we render an in-house
   * promo so the layout/placement is visible and pixel-correct. */
  function houseBanner(el) {
    el.innerHTML =
      '<div class="housead">' +
      '<div class="ha-tag">AD</div>' +
      '<div class="ha-body">' +
      '<div class="ha-title">YOUR AD HERE</div>' +
      '<div class="ha-sub">300×250 / responsive banner slot</div>' +
      '</div></div>';
  }

  Ads.init = function () {
    Ads.ready = true;
    return Promise.resolve();
  };

  /* Called once the game is loaded and the menu is interactive.
     Platform builds map this to loadingStop() / GAME_READY. */
  Ads.gameReady = function () {};

  Ads.showBanner = function (elId) {
    var el = document.getElementById(elId);
    if (!el) return;
    el.style.display = '';
    houseBanner(el);
  };

  Ads.hideBanner = function () {
    ['adSlotMenu', 'adSlotShop', 'adSlotResult'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.innerHTML = '';
    });
  };

  Ads.showInterstitial = function () {
    if (busy) return Promise.resolve();
    busy = true;
    return overlay('Commercial break', 3, false).then(function () { busy = false; });
  };

  Ads.showRewarded = function () {
    if (busy) return Promise.resolve(false);
    busy = true;
    return overlay('Watch to earn your reward', 4, true).then(function (v) {
      busy = false; return v;
    });
  };

  Ads.gameplayStart = function () { Ads.gameReady(); };
  Ads.gameplayStop = function () {};
  Ads.happyTime = function () {};
  Ads.isAdBlocked = function () { return false; };

  global.Ads = Ads;
})(window);
