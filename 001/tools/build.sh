#!/usr/bin/env bash
# =============================================================================
#  ZOMBIE RUSH 3D — one-command package builder
#  Regenerates BOTH distribution packages from the single source of truth
#  (001/game) and zips them into 001/releases/.
#
#  Usage:  bash 001/tools/build.sh      (run from the repo root, or anywhere)
#
#  NOTE: never edit files under 001/packages/ by hand — they are overwritten.
# =============================================================================
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"          # -> 001/
SRC="$ROOT/game"
PKG="$ROOT/packages"
REL="$ROOT/releases"

VERSION="$(date +%Y.%m.%d)"

echo "==> source : $SRC"
rm -rf "$PKG/crazygames" "$PKG/playgama"
mkdir -p "$PKG/crazygames" "$PKG/playgama" "$REL"

# ---------------------------------------------------------------- copy base
cp -r "$SRC/." "$PKG/crazygames/"
cp -r "$SRC/." "$PKG/playgama/"

# ---------------------------------------------------------- swap ad adapter
cp "$HERE/ads-crazygames.js" "$PKG/crazygames/js/ads.js"
cp "$HERE/ads-playgama.js"   "$PKG/playgama/js/ads.js"

# ------------------------------------------------- inject platform SDK tags
inject () {                      # $1 = package dir, $2 = script url, $3 = label
  python3 - "$1" "$2" "$3" <<'PY'
import sys, io, os
pkg, url, label = sys.argv[1], sys.argv[2], sys.argv[3]
p = os.path.join(pkg, 'index.html')
s = io.open(p, encoding='utf-8').read()
tag = ('<!-- %s platform SDK. If it fails to load (offline / adblock),\n'
       '     js/ads.js automatically falls back to a local placeholder so the\n'
       '     game NEVER hangs on an ad. -->\n'
       '<script src="%s"></script>\n') % (label, url)
assert '</head>' in s, 'no </head> in index.html'
s = s.replace('</head>', tag + '</head>', 1)
# mark the build so it is obvious which package a file came from
s = s.replace('<title>', '<!-- build: %s -->\n<title>' % label, 1)
io.open(p, 'w', encoding='utf-8').write(s)
print('   injected %s SDK -> %s' % (label, p))
PY
}

inject "$PKG/crazygames" "https://sdk.crazygames.com/crazygames-sdk-v3.js" "CrazyGames"
inject "$PKG/playgama"   "https://bridge.playgama.com/v2/stable/playgama-bridge.js" "Playgama"

# ----------------------------------------------- playgama bridge config file
cat > "$PKG/playgama/playgama-bridge-config.json" <<'JSON'
{
  "platforms": {},
  "advertisement": {
    "interstitial": {
      "preloadOnStart": true,
      "placements": [
        { "id": "level_complete" }
      ]
    },
    "rewarded": {
      "preloadOnStart": true,
      "placements": [
        { "id": "reward" }
      ]
    },
    "banner": {
      "placements": [
        { "id": "menu" },
        { "id": "shop" }
      ]
    },
    "useBuiltInErrorPopup": true
  },
  "payments": [],
  "leaderboards": []
}
JSON

# ------------------------------------------------------------------- readme
for P in crazygames playgama; do
  cat > "$PKG/$P/PACKAGE.txt" <<TXT
ZOMBIE RUSH 3D  ·  build: $P  ·  version: $VERSION

HOW TO PUBLISH
  Upload the CONTENTS of this folder (index.html must be at the archive root).

HOW TO TEST LOCALLY
  Just double-click index.html. The platform SDK will fail to load offline and
  the game automatically falls back to placeholder ads — everything stays playable.

FILES
  index.html          entry point
  lib/three.min.js    three.js r159 (UMD)
  js/audio.js         procedural audio engine (original, royalty-free)
  js/ads.js           $P ad adapter
  js/game.js          game logic
TXT
done

# ---------------------------------------------------------------------- zip
cd "$PKG"
rm -f "$REL/zombie-rush-3d-crazygames.zip" "$REL/zombie-rush-3d-playgama.zip"
( cd crazygames && zip -qr9 "$REL/zombie-rush-3d-crazygames.zip" . -x '.*' )
( cd playgama   && zip -qr9 "$REL/zombie-rush-3d-playgama.zip"   . -x '.*' )

echo
echo "==> packages"
du -sh "$PKG/crazygames" "$PKG/playgama"
echo "==> releases"
ls -lh "$REL" | tail -n +2
echo
echo "BUILD OK"
