TITAN LOOP — 10 Seconds to Kill a God
build: 2026-09-27 17:58

Single self-contained index.html. No external assets, no build step, no network required
for the game itself (three.js r160 MIT is inlined).

All music and sound effects are generated in real time with the Web Audio API.
They are 100% original synthesis — no samples, no third-party recordings —
so the package is clear for commercial use with no attribution required.

CRAZYGAMES BUILD
  SDK: https://sdk.crazygames.com/crazygames-sdk-v3.js (loaded in <head>)
  Implemented: SDK.init({wrapper}), game.loadingStart/loadingStop,
  game.gameplayStart/gameplayStop around every active-play segment,
  game.happytime() on a Titan kill, ad.requestAd("rewarded"|"midgame"),
  banner.requestBanner() for the 300x250 slot on the main menu.
  Audio is muted for the whole duration of every ad and restored on
  adFinished AND adError. No ad is ever requested during active gameplay.
  Upload: zip the contents of this folder (index.html at the zip root).

AD PLACEMENTS
  main menu      static 300x250 banner
  level complete rewarded — 2x coins
  level failed   rewarded — revive with +3 seconds
  shop           rewarded — free chest (180s cooldown)
  daily bonus    rewarded — double the daily reward
  every 3 levels interstitial, fired from the menu only

CONTROLS
  Desktop: move the mouse to aim, the gun fires automatically. ESC pauses. M mutes.
  Mobile:  hold and drag anywhere to aim and fire.
