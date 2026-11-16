// Right-sized artwork URLs. Cards show covers at ~40–240 px, but sources hand out 640–1000+ px originals
// (≈170 kB each, up to 600 kB). Deezer, Spotify, Last.fm and Cover Art Archive can serve smaller versions
// themselves, so their URLs are rewritten; anything else goes through /api/img, which resizes once with
// sharp and keeps the result on disk.

const BUCKETS = [64, 128, 256, 512, 1000];
const bucket = (px: number) => BUCKETS.find((b) => b >= px) ?? 1000;

// Spotify image ids encode their size in a fixed prefix.
const SPOTIFY_ALBUM = { 64: "ab67616d00004851", 300: "ab67616d00001e02", 640: "ab67616d0000b273" };
const SPOTIFY_ARTIST = { 160: "ab6761610000f178", 320: "ab67616100005174", 640: "ab6761610000e5eb" };

/** URL of `url` at roughly `px` pixels wide (pass 2× the CSS size for Retina). */
export function sizedImage(url: string | undefined, px: number): string | undefined {
  if (!url) return url;
  const s = bucket(px);
  try {
    const u = new URL(url, "http://local");
    if (u.origin === "http://local") return url; // already local (e.g. /api/img)
    if (u.hostname.endsWith("dzcdn.net")) return url.replace(/\/\d+x\d+-/, `/${s}x${s}-`);
    if (u.hostname === "i.scdn.co") {
      for (const [table, sizes] of [[SPOTIFY_ALBUM, [64, 300, 640]], [SPOTIFY_ARTIST, [160, 320, 640]]] as const) {
        const ids = Object.values(table) as string[];
        const hit = ids.find((id) => u.pathname.includes(id));
        if (hit) {
          const want = (sizes as readonly number[]).find((x) => x >= s) ?? 640;
          return url.replace(hit, (table as Record<number, string>)[want]);
        }
      }
      return url;
    }
    if (u.hostname.includes("lastfm")) return url.replace(/\/i\/u\/[^/]+\//, `/i/u/${s <= 64 ? "64s" : s <= 174 ? "174s" : "300x300"}/`);
    if (u.hostname === "coverartarchive.org") return url.replace(/front(-\d+)?$/, `front-${s <= 250 ? 250 : s <= 500 ? 500 : 1200}`);
    return `/api/img?w=${s}&u=${encodeURIComponent(url)}`;
  } catch {
    return url;
  }
}

/** Hosts the /api/img proxy will fetch from. */
export const IMG_HOSTS = [/\.dzcdn\.net$/, /^i\.scdn\.co$/, /lastfm/, /coverartarchive\.org$/, /archive\.org$/, /^e-cdns-images\.dzcdn\.net$/];
