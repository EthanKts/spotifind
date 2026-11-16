import type { AudioFeatures, Candidate } from "../types";
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
    case "listenbrainz:similar-artist":
      parts.push(`ListenBrainz listeners of ${c.via} also play ${c.artist}`);
      break;
    case "listenbrainz:similar-artist-top-track":
      parts.push(`A top track by ${c.artist}, whom ListenBrainz listeners of ${c.via} also play`);
      break;
    case "lastfm:genre-bridge-artist":
      parts.push(`${c.artist} is rated ${pct(c.artistMatch)} similar to ${c.via}, one of your favourites`);
      break;
    case "lastfm:genre-top-track":
      parts.push(`A well-known ${c.via} song`);
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
  if (r.sharedStyles?.length) parts.push(`styles: ${r.sharedStyles.map(titleCase).join(", ")}`);
  const sound = c.audio ? describeAudio(c.audio) : "";
  if (sound) parts.push(sound);
  if (c.lbMatch != null && !c.source.startsWith("listenbrainz")) parts.push("ListenBrainz listeners agree");
  if (r.tasteShared.length) parts.push(`fits your taste for ${r.tasteShared.join(" & ")}`);
  return parts.join(" · ");
}

const titleCase = (s: string) => s.replace(/\b\w/g, (ch) => ch.toUpperCase());

/** "dark (valence 0.18), 128 BPM": only the features that stand out. */
export function describeAudio(a: AudioFeatures): string {
  const bits: string[] = [];
  if (a.valence <= 0.3) bits.push(`dark (valence ${a.valence.toFixed(2)})`);
  else if (a.valence >= 0.7) bits.push(`bright (valence ${a.valence.toFixed(2)})`);
  if (a.energy >= 0.75) bits.push(`intense (energy ${a.energy.toFixed(2)})`);
  else if (a.energy <= 0.3) bits.push(`calm (energy ${a.energy.toFixed(2)})`);
  if (a.instrumentalness >= 0.6) bits.push("instrumental");
  if (a.tempo > 40) bits.push(`${Math.round(a.tempo)} BPM`);
  return bits.join(", ");
}
