// Every ranking weight in one place. score.ts reads these; nothing else hard-codes a weight.
//
// MODE weights are the original Spotifind weights. The EXTRA, AGREEMENT and TASTE_EXTRA components (Discogs styles,
// measured audio, ListenBrainz agreement) are switched OFF (0): with them, playlists fit worse and were less varied,
// and the offline evaluation showed no gain. The code stays so they can be tried again by raising these numbers.

export type Mode = "closest" | "deep" | "hidden" | "groove" | "mood" | "explore";

export interface ModeWeights { match: number; tag: number; groove: number; mood: number; taste: number; novelty: number }

export const MODE: Record<Mode, ModeWeights> = {
  closest: { match: 0.5, tag: 0.3, groove: 0, mood: 0, taste: 0.15, novelty: 0 },
  deep: { match: 0.3, tag: 0.25, groove: 0, mood: 0, taste: 0.15, novelty: 0.3 },
  hidden: { match: 0.25, tag: 0.3, groove: 0, mood: 0, taste: 0.1, novelty: 0.45 },
  groove: { match: 0.25, tag: 0.05, groove: 0.55, mood: 0, taste: 0.1, novelty: 0.05 },
  mood: { match: 0.25, tag: 0.05, groove: 0, mood: 0.55, taste: 0.1, novelty: 0.05 },
  explore: { match: 0.2, tag: 0.3, groove: 0, mood: 0, taste: 0.1, novelty: 0.4 },
};

/** Added on top of the mode score, per mode. */
export const EXTRA: Record<Mode, { style: number; audio: number }> = {
  closest: { style: 0, audio: 0 },
  deep: { style: 0, audio: 0 },
  hidden: { style: 0, audio: 0 },
  groove: { style: 0, audio: 0 },
  mood: { style: 0, audio: 0 },
  explore: { style: 0, audio: 0 },
};

/** Within audio similarity: how much each measured feature counts. */
export const AUDIO_FEATURES = { energy: 0.25, valence: 0.25, danceability: 0.15, acousticness: 0.15, instrumentalness: 0.1, tempo: 0.1 } as const;

/** Both Last.fm and ListenBrainz suggest this artist: two independent listening signals agree. */
export const AGREEMENT_BOOST = 0;

/** How far adventurousness (0..1) shifts the mode weights (original values). */
export const ADVENTURE = { match: 0.6, tag: 0.3, groove: 0.2, mood: 0.2, novelty: 0.45 } as const;

/** Taste learned from the new sources (your ratings stay the strongest signal through MODE.taste and artist affinity). */
export const TASTE_EXTRA = { style: 0, audio: 0 } as const;
