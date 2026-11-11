#!/bin/bash
# Builds Spotifind.app (web UI + bundled Node server + native Swift shell) and installs it into ~/Applications.
#   --no-install   only build macos/build/Spotifind.app (used by package-share.sh); leaves your installed copy alone
# SPOTIFIND_SHARED_ENV=<file>  copy that file into the bundle as Resources/shared.env (package-share.sh uses this
#                              for the Last.fm key + Spotify Client ID friends get built in — never tokens or secrets)
set -euo pipefail
INSTALL=1
[ "${1:-}" = "--no-install" ] && INSTALL=0
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
MAC="$ROOT/macos"
BUILD="$MAC/build"
export PATH="$HOME/.local/node/bin:$PATH"

echo "==> Building web app (Next.js standalone)"
cd "$ROOT"
npm run build

echo "==> Staging server"
STAGE="$BUILD/server"
rm -rf "$STAGE"
mkdir -p "$BUILD"
ditto .next/standalone "$STAGE"
ditto .next/static "$STAGE/.next/static"
[ -d public ] && ditto public "$STAGE/public"
rm -f "$STAGE"/.env*   # API keys live in ~/Library/Application Support/Spotifind/config.env, never in the bundle

echo "==> Building native shell"
cd "$MAC"
swift build -c release
BIN="$(swift build -c release --show-bin-path)/Spotifind"

if [ ! -f "$BUILD/AppIcon.icns" ]; then
  echo "==> Rendering icon"
  bash "$MAC/scripts/make-icon.sh" "$BUILD"
fi

echo "==> Assembling Spotifind.app"
APP="$BUILD/Spotifind.app"
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp "$BIN" "$APP/Contents/MacOS/Spotifind"
cp "$MAC/Resources/Info.plist" "$APP/Contents/Info.plist"
cp "$MAC/Resources/splash-mark.svg" "$APP/Contents/Resources/"
cp "$BUILD/AppIcon.icns" "$APP/Contents/Resources/AppIcon.icns"
cp -L "$HOME/.local/node/bin/node" "$APP/Contents/Resources/node"
ditto "$STAGE" "$APP/Contents/Resources/server"
if [ -n "${SPOTIFIND_SHARED_ENV:-}" ]; then
  cp "$SPOTIFIND_SHARED_ENV" "$APP/Contents/Resources/shared.env"
fi
codesign --force --deep --sign - "$APP"

if [ "$INSTALL" = 0 ]; then
  echo "Built: $APP"
  exit 0
fi

echo "==> Settings"
SUPPORT="$HOME/Library/Application Support/Spotifind"
mkdir -p "$SUPPORT"
if [ ! -f "$SUPPORT/config.env" ]; then
  {
    echo "# Spotifind settings — edit, save, then quit and reopen Spotifind (menu: Spotifind > API Keys…)"
    grep -E '^(LASTFM_API_KEY|SPOTIFY_CLIENT_ID|SPOTIFY_CLIENT_SECRET)=' "$ROOT/.env.local" 2>/dev/null || echo "LASTFM_API_KEY="
  } > "$SUPPORT/config.env"
  chmod 600 "$SUPPORT/config.env"
  echo "Created $SUPPORT/config.env from .env.local"
fi

echo "==> Installing"
# Quit a running copy so the bundle can be replaced.
osascript -e 'tell application id "com.ethanlilti.spotifind" to quit' >/dev/null 2>&1 || true
mkdir -p "$HOME/Applications"
rm -rf "$HOME/Applications/Spotifind.app"
ditto "$APP" "$HOME/Applications/Spotifind.app"
/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -f "$HOME/Applications/Spotifind.app"

du -sh "$HOME/Applications/Spotifind.app"
echo "Installed: $HOME/Applications/Spotifind.app"
