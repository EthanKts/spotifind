import * as dg from "@/lib/sources/discogs";
import * as dz from "@/lib/sources/deezer";
import { hasLastfm } from "@/lib/sources/lastfm";
import { hasSpotify } from "@/lib/sources/spotify";
import { mapLimit, peekCache } from "@/lib/sources/http";

// Data coverage for Settings: of the songs/artists you rated, how many have measured audio and Discogs styles.
// Uses cached data only (no new lookups), so opening Settings never spends anyone's rate limit.
export async function POST(req: Request) {
  const { tracks = [], artists = [] } = (await req.json().catch(() => ({}))) as { tracks?: { artist: string; title: string; deezerId?: number }[]; artists?: string[] };
  const audio = await mapLimit(tracks.slice(0, 300), 8, async (t) => {
    const id = t.deezerId ?? (await dz.findTrack(t.artist, t.title).catch(() => undefined))?.id;
    return !!(id && peekCache(`rb:features:${id}`));
  });
  const styles = artists.slice(0, 300).map((a) => !!dg.peekArtistStyles(a));
  return Response.json({
    sources: { lastfm: hasLastfm(), spotify: hasSpotify(), discogs: dg.hasDiscogs(), listenbrainz: true, reccobeats: true },
    audio: { have: audio.filter(Boolean).length, total: tracks.length },
    styles: { have: styles.filter(Boolean).length, total: artists.length },
  });
}
