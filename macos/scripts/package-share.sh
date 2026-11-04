#!/bin/bash
# Builds a shareable copy of Spotifind for friends: macos/dist/Spotifind.dmg and macos/dist/Spotifind.zip,
# each with the app + "How to set up Spotifind.html". The app carries none of your keys — each friend
# enters their own Last.fm key on first launch. Your installed copy and settings are not touched.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
MAC="$ROOT/macos"
DIST="$MAC/dist"
APP="$MAC/build/Spotifind.app"
GUIDE="$MAC/share/How to set up Spotifind.html"

bash "$MAC/scripts/build-app.sh" --no-install

echo "==> Checking the bundle contains none of your keys"
leak=0
if [ -f "$ROOT/.env.local" ]; then
  while IFS='=' read -r name value; do
    value="${value%\"}"; value="${value#\"}"
    [ -z "$value" ] && continue
    if grep -rqF -- "$value" "$APP"; then
      echo "!! $name's value was found inside the app bundle" >&2
      leak=1
    fi
  done < <(grep -E '^(LASTFM_API_KEY|SPOTIFY_CLIENT_ID|SPOTIFY_CLIENT_SECRET)=' "$ROOT/.env.local" || true)
fi
if find "$APP" -name ".env*" | grep -q .; then
  echo "!! .env file inside the bundle" >&2
  leak=1
fi
[ "$leak" = 0 ] || { echo "Refusing to package: secrets in bundle." >&2; exit 1; }
echo "OK — no keys in the bundle"

echo "==> Packaging"
rm -rf "$DIST"
mkdir -p "$DIST"
STAGE="$(mktemp -d)/Spotifind"
mkdir -p "$STAGE"
ditto "$APP" "$STAGE/Spotifind.app"
cp "$GUIDE" "$STAGE/"
ln -s /Applications "$STAGE/Applications"

hdiutil create -quiet -volname "Spotifind" -srcfolder "$STAGE" -fs HFS+ -format UDZO -ov "$DIST/Spotifind.dmg"

# Zip (for sharing via Drive/email): app + guide, no Applications shortcut.
rm "$STAGE/Applications"
(cd "$(dirname "$STAGE")" && ditto -c -k --sequesterRsrc --keepParent "Spotifind" "$DIST/Spotifind.zip")

ls -lh "$DIST"
echo "Share either file. Friends: open it, drag Spotifind to Applications, then read “How to set up Spotifind”."
