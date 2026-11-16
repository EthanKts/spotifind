import "server-only";
import { fetchJson } from "./http";

// ListenBrainz: artists that real listeners play in the same sessions, a second similarity signal next to
// Last.fm. No key needed; at most one request per second (rate bucket in http.ts); cached for 30 days.

const ALGO = "session_based_days_7500_session_300_contribution_5_threshold_10_limit_100_filter_True_skip_30";

export interface LbArtist {
  name: string;
  mbid: string;
  /** 0..1, relative to the strongest match. */
  match: number;
}

export async function similarArtists(mbid: string, limit = 50): Promise<LbArtist[]> {
  try {
    const d = await fetchJson<{ artist_mbid: string; name: string; score: number }[]>(
      `https://labs.api.listenbrainz.org/similar-artists/json?artist_mbids=${encodeURIComponent(mbid)}&algorithm=${ALGO}`,
      { ttlSec: 30 * 24 * 3600, cacheKey: `lb:similar-artists:${mbid}` },
    );
    const list = Array.isArray(d) ? d : [];
    const max = Math.max(1, ...list.map((x) => x.score));
    return list.slice(0, limit).map((x) => ({ name: x.name, mbid: x.artist_mbid, match: x.score / max }));
  } catch {
    return [];
  }
}
