TITAN LOOP — 10 Seconds to Kill a God
build: 2026-09-27 17:30

Single self-contained index.html. No external assets, no build step, no network required
for the game itself (three.js r160 MIT is inlined).

All music and sound effects are generated in real time with the Web Audio API.
They are 100% original synthesis — no samples, no third-party recordings —
so the package is clear for commercial use with no attribution required.

STANDALONE BUILD
  Double-click index.html. Works offline from the file:// protocol.
  Ad calls fall back to a local placeholder overlay and still grant the reward,
  so every ad-gated feature is testable without a portal.

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
