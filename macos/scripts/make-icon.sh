#!/bin/bash
# Renders the Spotifind mark as a macOS app icon (AppIcon.icns) using headless Chrome.
# Usage: make-icon.sh <output-dir>
set -euo pipefail
OUT="$1"
mkdir -p "$OUT"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
[ -x "$CHROME" ] || { echo "Google Chrome is needed to render the icon" >&2; exit 1; }

# macOS icon grid: 824px rounded square centred on a 1024 canvas.
cat > "$OUT/icon.html" <<'HTML'
<!doctype html><html><head><style>
html,body{margin:0;width:1024px;height:1024px;background:transparent}
.tile{position:absolute;left:100px;top:100px;width:824px;height:824px;border-radius:186px;
  background:radial-gradient(120% 90% at 20% 10%,#173822 0%,#121212 55%,#050505 100%);
  box-shadow:0 18px 40px rgba(0,0,0,.45), inset 0 0 0 2px rgba(255,255,255,.06)}
svg{position:absolute;left:192px;top:192px;width:640px;height:640px}
</style></head><body><div class="tile"></div>
<svg viewBox="0 0 40 40"><defs><linearGradient id="g" x1="6" y1="4" x2="34" y2="36" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#3be477"/><stop offset="1" stop-color="#1db954"/></linearGradient></defs><path d="M27.5 11.2A11 11 0 1 0 29 22.4" fill="none" stroke="url(#g)" stroke-width="3.6" stroke-linecap="round"/><circle cx="29.6" cy="16.6" r="1.9" fill="url(#g)"/><path d="M26.2 26.2 34 34" stroke="url(#g)" stroke-width="4.2" stroke-linecap="round"/><path d="M18.5 10.5c.5 3.6 1.9 5 5.5 5.5-3.6.5-5 1.9-5.5 5.5-.5-3.6-1.9-5-5.5-5.5 3.6-.5 5-1.9 5.5-5.5Z" fill="#fff"/></svg>
</body></html>
HTML

PROFILE="$(mktemp -d)"
"$CHROME" --headless=new --user-data-dir="$PROFILE" --disable-gpu --hide-scrollbars \
  --default-background-color=00000000 --window-size=1024,1024 \
  --screenshot="$OUT/icon-1024.png" "file://$OUT/icon.html" >/dev/null 2>&1
rm -rf "$PROFILE"

SET="$OUT/AppIcon.iconset"
rm -rf "$SET" && mkdir -p "$SET"
for s in 16 32 128 256 512; do
  sips -z $s $s "$OUT/icon-1024.png" --out "$SET/icon_${s}x${s}.png" >/dev/null
  d=$((s * 2))
  sips -z $d $d "$OUT/icon-1024.png" --out "$SET/icon_${s}x${s}@2x.png" >/dev/null
done
iconutil -c icns "$SET" -o "$OUT/AppIcon.icns"
echo "Icon: $OUT/AppIcon.icns"
