import type { Candidate } from "../types";
import type { Ranked } from "./score";

const pct = (x?: number) => (x == null ? "" : `${Math.round(x * 100)}%`);

/** The similarity figure to display — only real Last.fm values, never a computed rank score. */
export function displayScore(c: Candidate): { value: number; label: string } | undefined {
  if (c.hop === 1 && c.match != null && c.source !== "lastfm:second-hop") {
    return { value: c.match, label: "Last.fm similarity" };
  }
  if (c.artistMatch != null && !c.sameArtistAsSeed) {
    return { value: c.artistMatch, label: "Artist similarity (Last.fm)" };
  }
  return undefined;
}

export function explain(r: Ranked): string {
  const c = r.c;
  const parts: string[] = [];
  switch (c.source) {
    case "lastfm:similar-track":
      parts.push(`Last.fm listeners of “${c.via}” also play this`);
      break;
    case "lastfm:similar-artist":
      parts.push(`Last.fm rates ${c.artist} ${pct(c.match)} similar to ${c.via}`);
      break;
    case "lastfm:similar-artist-top-track":
      parts.push(`A top track by ${c.artist}, rated ${pct(c.artistMatch)} similar to ${c.via}`);
      break;
    case "lastfm:similar-artist-top-album":
      parts.push(`Key album by ${c.artist}, rated ${pct(c.artistMatch)} similar to ${c.via}`);
      break;
    case "lastfm:artist-deep-cut":
      parts.push(
        c.sameArtistAsSeed
          ? `Deeper in ${c.artist}'s catalogue${c.artistRank ? ` (#${c.artistRank} by plays)` : ""}`
          : `Beyond the hits: #${c.artistRank} by plays for ${c.artist}, rated ${pct(c.artistMatch)} similar to ${c.via}`,
      );
      break;
    case "lastfm:second-hop":
      parts.push(`Two steps out — similar to ${c.via}`);
      break;
    case "deezer:related-artist":
      parts.push(`Deezer lists ${c.artist} as related to ${c.via}`);
      break;
    case "deezer:related-artist-top-track":
      parts.push(`Top track by ${c.artist}, a Deezer-related artist to ${c.via}`);
      break;
  }
  if (r.sharedGroove.length) parts.push(`shares ${r.sharedGroove.join(", ")}`);
  if (r.sharedMood.length) parts.push(`mood: ${r.sharedMood.join(", ")}`);
  if (!r.sharedGroove.length && !r.sharedMood.length && r.sharedOther.length) parts.push(`tagged ${r.sharedOther.join(", ")}`);
  if (r.tasteShared.length) parts.push(`fits your taste for ${r.tasteShared.join(" & ")}`);
  return parts.join(" · ");
}
