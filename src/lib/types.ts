// Shared types used by the server (API routes) and the client.

export type Kind = "track" | "album" | "artist";

/** Normalised tag vector: tag name (lower-case) -> weight in 0..1 */
export type TagVector = Record<string, number>;

export interface BaseItem {
  kind: Kind;
  /** Stable key: kind:artist::title (lower-cased) */
  key: string;
  title: string; // track title, album title, or artist name
  artist: string; // for artists: same as title
  album?: string;
  year?: number;
  image?: string;
  listeners?: number;
  playcount?: number;
  mbid?: string;
  deezerId?: number;
  hasPreview?: boolean;
  durationSec?: number;
  /** See Enrichment.onSpotify / noMatch. */
  onSpotify?: boolean;
  noMatch?: boolean;
}

export type Item = BaseItem;

/** A recommendation candidate, as produced by the server. All numbers come from real API data. */
export interface Candidate extends BaseItem {
  /** Last.fm similarity (0..1) of this exact track/artist to the seed (or the chain product for hop 2). */
  match?: number;
  /** Last.fm similarity of this candidate's ARTIST to the seed artist (for top tracks/albums of similar artists). */
  artistMatch?: number;
  /** Raw popularity from the source (Last.fm listeners, Deezer fans/rank). Only compared within one pool. */
  popularity?: number;
  /** Where the candidate came from, e.g. "lastfm:similar-track" */
  source: CandidateSource;
  /** Human-readable origin used in the explanation, e.g. the seed title */
  via?: string;
  /** 1 = direct neighbour of the seed, 2 = neighbour of a neighbour */
  hop: 1 | 2;
  sameArtistAsSeed: boolean;
  /** Position in its artist's top-tracks chart (1 = biggest hit) */
  artistRank?: number;
  tags: TagVector;
  /** true when tags came from the artist rather than the track/album itself */
  tagsFromArtist?: boolean;
}

export type CandidateSource =
  | "lastfm:similar-track"
  | "lastfm:similar-artist"
  | "lastfm:similar-artist-top-track"
  | "lastfm:similar-artist-top-album"
  | "lastfm:artist-deep-cut"
  | "lastfm:second-hop"
  | "deezer:related-artist"
  | "deezer:related-artist-top-track";

export interface Seed extends BaseItem {
  tags: TagVector;
}

export interface RecommendResponse {
  seed: Seed | null;
  candidates: Candidate[];
  sources: string[];
  limitations: string[];
}

export interface Enrichment {
  image?: string;
  /** true: confirmed on Spotify · false: Spotify doesn't have it · undefined: couldn't check (no Spotify login/key). */
  onSpotify?: boolean;
  spotifyUrl?: string;
  /** A lookup failed (rate limit, timeout): the result may be missing artwork, so ask again later. */
  incomplete?: boolean;
  /** Neither Deezer nor Spotify recognises it (compilations, re-uploads, mis-tagged scrobbles). */
  noMatch?: boolean;
  deezerId?: number;
  hasPreview?: boolean;
  year?: number;
  album?: string;
  durationSec?: number;
}

export interface KeyStatus {
  lastfm: boolean;
  spotify: boolean;
}

export interface AlbumTrack {
  key: string;
  title: string;
  artist: string;
  position: number;
  durationSec?: number;
  deezerId?: number;
  hasPreview?: boolean;
  playcount?: number;
  listeners?: number;
  tags: TagVector;
}

export interface AlbumDetail {
  item: Item;
  tags: TagVector;
  tracks: AlbumTrack[];
  wiki?: string;
  sources: string[];
}

export interface ArtistDetail {
  item: Item;
  tags: TagVector;
  bio?: string;
  topTracks: (Item & { tags: TagVector })[];
  albums: Item[];
  related: (Item & { match?: number })[];
  sources: string[];
}

/** Spotify listening history ("Import my taste from Spotify"). Not star ratings: a weaker, removable taste signal. */
export type SpotifyRange = "long_term" | "medium_term" | "short_term";

export interface ImportedItem extends BaseItem {
  /** 0..1 strength relative to a 4★ rating (time range × chart position). */
  weight: number;
  /** Which of your Spotify top lists it was in. */
  ranges: SpotifyRange[];
  /** Last.fm tags (artist tags when a song has too few). */
  tags: TagVector;
}

export interface SpotifyImport {
  importedAt: number;
  user?: string;
  items: ImportedItem[];
  /** Keys you removed one by one; a re-import keeps them out. */
  removed: string[];
}
