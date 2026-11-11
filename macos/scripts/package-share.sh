#!/bin/bash
# Builds a shareable copy of Spotifind for friends: macos/dist/Spotifind.dmg (a styled window: drag to
# Applications + the 3 install steps) and macos/dist/Spotifind.zip, each with the app + "Setup Guide.html".
#
# Friends get zero setup: the copy carries YOUR Last.fm API key and YOUR Spotify app's Client ID (both are
# public identifiers, not passwords), so they just click "Log in with Spotify". It never carries your
# Spotify login, client secret, ratings or imported taste — the script refuses to package if any slip in.
#
# Spotify only lets a personal app be used by people its owner added: after sending the app, add each
# friend (name + their Spotify email) at developer.spotify.com/dashboard → your app → User Management.
# Max 5 people including you.
#
#   SPOTIFIND_SHARED_BY="Ethan"   name shown to friends ("ask Ethan to add you"); defaults to your first name
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
MAC="$ROOT/macos"
DIST="$MAC/dist"
APP="$MAC/build/Spotifind.app"
GUIDE="$MAC/share/How to set up Spotifind.html"
SUPPORT="$HOME/Library/Application Support/Spotifind"

value() { # KEY → value from your config.env, then .env.local
  local v
  v="$(grep -E "^$1=" "$SUPPORT/config.env" 2>/dev/null | tail -1 | cut -d= -f2- | tr -d '"' || true)"
  [ -z "$v" ] && v="$(grep -E "^$1=" "$ROOT/.env.local" 2>/dev/null | tail -1 | cut -d= -f2- | tr -d '"' || true)"
  printf %s "$v"
}

LASTFM="$(value LASTFM_API_KEY)"
CLIENT="$(value SPOTIFY_CLIENT_ID)"
NAME="${SPOTIFIND_SHARED_BY:-$(id -F 2>/dev/null | awk '{print $1}')}"
[ -n "$LASTFM" ] || { echo "No LASTFM_API_KEY in $SUPPORT/config.env — set up Spotifind yourself first." >&2; exit 1; }
[ -n "$CLIENT" ] || { echo "No SPOTIFY_CLIENT_ID in $SUPPORT/config.env — connect Spotify in Spotifind first." >&2; exit 1; }
[[ "$LASTFM" =~ ^[0-9a-fA-F]{32}$ ]] || { echo "LASTFM_API_KEY doesn't look like a Last.fm key." >&2; exit 1; }
[[ "$CLIENT" =~ ^[0-9a-fA-F]{32}$ ]] || { echo "SPOTIFY_CLIENT_ID doesn't look like a Client ID." >&2; exit 1; }

SHARED="$(mktemp -d)/shared.env"
{
  echo "# Built into this shared copy of Spotifind by $NAME. Public identifiers only — no logins or secrets."
  echo "LASTFM_API_KEY=$LASTFM"
  echo "SPOTIFY_CLIENT_ID=$CLIENT"
  echo "SHARED_BY=$NAME"
} > "$SHARED"

SPOTIFIND_SHARED_ENV="$SHARED" bash "$MAC/scripts/build-app.sh" --no-install

echo "==> Checking the bundle carries no logins, secrets or personal data"
leak=0
check() { # label value
  [ -z "$2" ] && return 0
  if grep -rqF -- "$2" "$APP"; then echo "!! $1 found inside the app bundle" >&2; leak=1; fi
}
check "SPOTIFY_CLIENT_SECRET" "$(value SPOTIFY_CLIENT_SECRET)"
if [ -f "$SUPPORT/spotify-auth.json" ]; then
  check "your Spotify access token" "$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1])).get("access_token",""))' "$SUPPORT/spotify-auth.json")"
  check "your Spotify refresh token" "$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1])).get("refresh_token",""))' "$SUPPORT/spotify-auth.json")"
fi
for f in config.env spotify-auth.json spotify-import.json; do
  if find "$APP" -name "$f" | grep -q .; then echo "!! $f inside the bundle" >&2; leak=1; fi
done
if find "$APP" -name ".env*" | grep -q .; then echo "!! .env file inside the bundle" >&2; leak=1; fi
# The shared keys may appear only in shared.env.
for v in "$LASTFM" "$CLIENT"; do
  others="$(grep -rlF -- "$v" "$APP" | grep -v '/Contents/Resources/shared.env$' || true)"
  [ -z "$others" ] || { echo "!! a shared key also appears in: $others" >&2; leak=1; }
done
[ "$leak" = 0 ] || { echo "Refusing to package." >&2; exit 1; }
echo "OK — only your Last.fm key and Spotify Client ID (in Resources/shared.env)"

echo "==> Packaging"
rm -rf "$DIST"
mkdir -p "$DIST"
WORK="$(mktemp -d)"
GUIDE_OUT="$WORK/Setup Guide.html"
sed "s/{{SHARED_BY}}/$NAME/g" "$GUIDE" > "$GUIDE_OUT"

# Disk-image window background (1x + 2x for Retina), rendered with headless Chrome like the app icon.
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
[ -x "$CHROME" ] || { echo "Google Chrome is needed to render the disk-image background" >&2; exit 1; }
for scale in 1 2; do
  PROFILE="$(mktemp -d)"
  "$CHROME" --headless=new --user-data-dir="$PROFILE" --disable-gpu --hide-scrollbars --force-device-scale-factor=$scale \
    --window-size=760,480 --screenshot="$WORK/bg@${scale}x.png" "file://$MAC/share/dmg-background.html" >/dev/null 2>&1
  rm -rf "$PROFILE"
done
tiffutil -cathidpicheck "$WORK/bg@1x.png" "$WORK/bg@2x.png" -out "$WORK/background.tiff" >/dev/null

# dmgbuild lays out the window (background, icon positions) without scripting Finder.
VENV="$MAC/build/.venv-dmg"
if [ ! -x "$VENV/bin/dmgbuild" ]; then
  echo "==> Installing dmgbuild (once, into $VENV)"
  python3 -m venv "$VENV"
  "$VENV/bin/pip" install -q dmgbuild==1.6.5
fi
"$VENV/bin/dmgbuild" -s "$MAC/scripts/dmg-settings.py" \
  -D app="$APP" -D guide="$GUIDE_OUT" -D background="$WORK/background.tiff" \
  "Spotifind" "$DIST/Spotifind.dmg"

# Zip (for sharing via Drive/email): app + guide.
STAGE="$WORK/Spotifind"
mkdir -p "$STAGE"
ditto "$APP" "$STAGE/Spotifind.app"
cp "$GUIDE_OUT" "$STAGE/"
(cd "$WORK" && ditto -c -k --sequesterRsrc --keepParent "Spotifind" "$DIST/Spotifind.zip")

ls -lh "$DIST"
cat <<MSG

Ready to send: macos/dist/Spotifind.dmg (or .zip).

Before a friend can log in, add them to your Spotify app (Spotify's rule for personal apps, max 5 people incl. you):
  1. Open https://developer.spotify.com/dashboard → your Spotifind app → User Management
  2. Add their name and the email address of their Spotify account
Also check Settings → Redirect URIs contains exactly: http://127.0.0.1:47320/api/spotify/callback
MSG
