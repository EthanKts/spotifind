"use client";

import Link from "next/link";
import { Info, Loader2, ListMusic, Zap } from "lucide-react";
import { useMemo, useState } from "react";
import type { Candidate, Item, Kind, RecommendResponse } from "@/lib/types";
import { MODES, rank, type Mode, type Ranked } from "@/lib/recommend/score";
import { displayScore, explain } from "@/lib/recommend/explain";
import { GROOVE, MOOD } from "@/lib/recommend/tags";
import { useTasteInput, taste } from "@/lib/taste/profile";
import { hoverPrefetch, playableOnSpotify, recommendUrl, useEnriched, useJson, useYear } from "@/lib/client/data";
import { hrefFor } from "@/lib/util";
import { Artwork } from "./Artwork";
import { ArtistLine, ExploreButton, OpenInSpotify, PlayButton, Rating } from "./Actions";
import { CardSkeleton } from "./Cards";

// ------------------------------------------------------------------ data hook

export { recommendUrl } from "@/lib/client/data";

/**
 * Recommendations that appear fast: a "quick" pass (similarity only, ~1 s) shows first,
 * then the richer pass (with tags, deep cuts…) replaces it when ready. Both start together.
 */
export function useRecommendations(seed: { kind: Kind; artist: string; title: string } | null, depth: "full" | "lite" = "full") {
  const quick = useJson<RecommendResponse>(seed ? recommendUrl(seed.kind, seed.artist, seed.title, "quick") : null);
  const final = useJson<RecommendResponse>(seed ? recommendUrl(seed.kind, seed.artist, seed.title, depth) : null);
  const data = final.data ?? quick.data;
  return {
    data,
    error: final.error && !quick.data ? final.error : undefined,
    loading: !!seed && !data && !final.error,
    refining: !!quick.data && !final.data && !final.error,
  };
}

/** Ranked, enriched items for shelves (home, album/artist pages). */
export function useRanked(
  data: RecommendResponse | undefined,
  mode: Mode,
  adventure: number,
  opts: { kind?: Kind; limit?: number; perArtist?: number; exclude?: Set<string> } = {},
): { ranked: Ranked[]; items: Item[] } {
  const t = useTasteInput();
  const { kind, limit, perArtist, exclude } = opts;
  const ranked = useMemo(() => {
    if (!data) return [];
    const pool = exclude ? data.candidates.filter((c) => !exclude.has(c.key)) : data.candidates;
    // A few spares, so dropping songs/albums that aren't on Spotify doesn't leave gaps.
    return rank(pool, data.seed, mode, adventure, t, { kind, limit: limit ? limit + 8 : undefined, perArtist });
  }, [data, mode, adventure, t, kind, limit, perArtist, exclude]);
  const base = useMemo(() => ranked.map((r) => r.c as Item), [ranked]);
  const enriched = useEnriched(base);
  return useMemo(() => {
    const keep = enriched.map((it, i) => [it, ranked[i]] as const).filter(([it]) => playableOnSpotify(it)).slice(0, limit ?? Infinity);
    return { ranked: keep.map(([, r]) => r), items: keep.map(([it]) => it) };
  }, [enriched, ranked, limit]);
}

// ------------------------------------------------------------------ discovery panel

export function DiscoveryPanel({
  mode,
  setMode,
  adventure,
  setAdventure,
  kind,
  setKind,
  limitations,
  sources,
  tagless,
}: {
  mode: Mode;
  setMode: (m: Mode) => void;
  adventure: number;
  setAdventure: (a: number) => void;
  kind: Kind | "all";
  setKind: (k: Kind | "all") => void;
  limitations?: string[];
  sources?: string[];
  tagless?: boolean;
}) {
  const pct = Math.round(adventure * 100);
  return (
    <div className="panel mx-4 p-4 md:mx-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="label">Style</h2>
        <details className="group relative">
          <summary className="flex cursor-pointer list-none items-center gap-1 text-xs text-sub hover:text-ink">
            <Info className="size-3.5" /> How matching works
          </summary>
          <div className="absolute right-0 z-40 mt-2 w-[min(88vw,380px)] rounded-lg border border-line bg-elev-2 p-4 text-sm text-sub shadow-lg">
            <p className="text-ink font-semibold">Real data only</p>
            <p className="mt-1">
              Candidates come from {sources?.length ? sources.join(", ") : "Last.fm and Deezer"}. Percentages are Last.fm&apos;s own similarity scores — Spotifind
              never invents one. Explanations list the actual shared community tags.
            </p>
            {limitations?.map((l) => (
              <p key={l} className="mt-2 border-t border-line pt-2">{l}</p>
            ))}
            <p className="mt-2 border-t border-line pt-2">
              Modes and the slider re-weigh those signals: similarity, shared genre/instrument tags (groove), mood tags, your taste profile, and how
              obscure a result is relative to the others.
            </p>
          </div>
        </details>
      </div>

      <div className="no-scrollbar -mx-1 mt-2 flex gap-1.5 overflow-x-auto px-1 pb-1" role="radiogroup" aria-label="Discovery mode">
        {MODES.map((m) => {
          const on = m.id === mode;
          const unavailable = tagless && (m.id === "groove" || m.id === "mood");
          return (
            <button
              key={m.id}
              role="radio"
              aria-checked={on}
              title={unavailable ? "Needs Last.fm tags" : m.hint}
              disabled={unavailable}
              onClick={() => setMode(m.id)}
              className="option shrink-0 px-3 py-1.5 text-[13px] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {m.label}
            </button>
          );
        })}
      </div>
      <p className="mt-1.5 text-xs text-mute">{MODES.find((m) => m.id === mode)?.hint}</p>

      <div className="mt-4 grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
        <label className="block">
          <div className="flex justify-between text-xs text-sub">
            <span>Very similar</span>
            <span className="text-ink tabular-nums">{pct < 34 ? "Close" : pct < 67 ? "Balanced" : "Adventurous"} · {pct}</span>
            <span>More adventurous</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={pct}
            onChange={(e) => setAdventure(Number(e.target.value) / 100)}
            aria-label="Adventurousness: from very similar to more adventurous"
            className="sf-range always-thumb mt-2 w-full"
            style={{ ["--range-pct" as string]: `${pct}%`, ["--range-fill" as string]: "var(--color-find)" }}
          />
        </label>
        <div className="flex gap-0.5 rounded-md border border-line bg-base p-0.5" role="tablist" aria-label="Result type">
          {(["all", "track", "album", "artist"] as const).map((k) => (
            <button
              key={k}
              role="tab"
              aria-selected={kind === k}
              onClick={() => setKind(k)}
              className={`rounded px-3 py-1 text-xs transition-colors ${kind === k ? "bg-hl text-ink" : "text-sub hover:text-ink"}`}
            >
              {k === "all" ? "All" : k === "track" ? "Songs" : k === "album" ? "Albums" : "Artists"}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ recommendation card

export function RecommendationCard({ r, item, queue, seedTitle, mode }: { r: Ranked; item: Item; queue: Item[]; seedTitle: string; mode: Mode }) {
  const c: Candidate = r.c;
  const score = displayScore(c);
  const year = useYear(item);
  const href = hrefFor(item.kind, item.artist, item.title);
  return (
    <article {...hoverPrefetch(item)} className="group relative flex flex-col rounded-lg border border-line bg-elev p-2.5 transition-colors hover:border-hl-2">
      <div className="relative">
        <Link href={href} onClick={() => taste.recordDiscovered(item, seedTitle)} aria-label={`Open ${item.title}`}>
          <Artwork src={item.image} alt={item.title} kind={item.kind} className="aspect-square w-full" />
        </Link>
        {score && (
          <span
            title={score.label}
            className="absolute left-2 top-2 rounded bg-black/80 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-ink"
          >
            {Math.round(score.value * 100)}%<span className="ml-1 text-sub">{score.label.startsWith("Artist") ? "artist" : "match"}</span>
          </span>
        )}
        {item.kind === "track" && (
          <div className="absolute bottom-2 right-2 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 max-md:opacity-100">
            <PlayButton item={item} queue={queue} />
          </div>
        )}
      </div>
      <div className="mt-2.5 min-w-0">
        <p className="text-[11px] capitalize text-mute">
          {item.kind === "track" ? "Song" : item.kind}
          {year ? ` · ${year}` : ""}
          {c.hop === 2 ? " · 2 steps out" : ""}
        </p>
        <Link href={href} onClick={() => taste.recordDiscovered(item, seedTitle)} className="mt-0.5 block truncate text-sm font-medium hover:underline">
          {item.title}
        </Link>
        {item.kind !== "artist" && <ArtistLine name={item.artist} className="text-[13px] text-sub" />}
        <p className="mt-2 line-clamp-3 text-xs leading-snug text-mute" title={c.tagsFromArtist ? "Tags shown are the artist's overall tags" : undefined}>
          {explain(r)}
        </p>
      </div>
      <div className="mt-auto pt-3">
        <div className="-ml-0.5 flex items-center justify-between gap-1 border-t border-line pt-2">
          <Rating item={item} tags={c.tags} ctx={{ seed: seedTitle, mode }} size={16} />
          <div className="flex items-center">
            <ExploreButton item={item} compact />
            <OpenInSpotify item={item} compact />
          </div>
        </div>
      </div>
    </article>
  );
}

// ------------------------------------------------------------------ the full discover view

export function DiscoverView({
  seed,
  defaultKind,
  heading = true,
}: {
  seed: { kind: Kind; artist: string; title: string };
  defaultKind?: Kind | "all";
  heading?: boolean;
}) {
  const { data, error, loading, refining } = useRecommendations(seed, "full");
  const [mode, setMode] = useState<Mode>("closest");
  const [adventure, setAdventure] = useState(0.25);
  const [kind, setKind] = useState<Kind | "all">(defaultKind ?? (seed.kind === "artist" ? "all" : seed.kind));
  const [shown, setShown] = useState(24);
  const tagless = !!data && !refining && !data.sources.includes("Last.fm tags");
  const seedTags = Object.keys(data?.seed?.tags ?? {});
  const missingCategory =
    data && !tagless && ((mode === "mood" && !seedTags.some((t) => MOOD.has(t))) || (mode === "groove" && !seedTags.some((t) => GROOVE.has(t))))
      ? mode
      : null;

  const { ranked, items } = useRanked(data, mode, adventure, { kind: kind === "all" ? undefined : kind, limit: shown });
  const seedTitle = seed.kind === "artist" ? seed.artist : seed.title;

  return (
    <section aria-label="Recommendations">
      {heading && (
        <div className="mb-4 px-4 md:px-8">
          <h2 className="text-lg font-semibold tracking-tight">
            Because you like <span className="text-find">{seedTitle}</span>
          </h2>
          <p className="text-sm text-sub">Matched on how it sounds to listeners — groove, instrumentation, mood and vocal tags — not just genre.</p>
        </div>
      )}
      <DiscoveryPanel
        mode={mode}
        setMode={setMode}
        adventure={adventure}
        setAdventure={setAdventure}
        kind={kind}
        setKind={setKind}
        limitations={data?.limitations}
        sources={data?.sources}
        tagless={tagless}
      />
      <div className="mx-4 mt-3 flex flex-wrap justify-end gap-2 md:mx-8">
        <Link
          href={`/rapid?${new URLSearchParams({ kind: seed.kind, artist: seed.artist, title: seed.title, mode, adventure: String(adventure) })}`}
          className="btn btn-secondary"
        >
          <Zap className="size-4" /> Rate in Rapid-fire
        </Link>
        <Link
          href={`/playlists?${new URLSearchParams({ kind: seed.kind, artist: seed.artist, title: seed.title, mode, adventure: String(adventure) })}`}
          className="btn btn-primary"
        >
          <ListMusic className="size-4" /> Make playlist
        </Link>
      </div>
      <div className="mt-3">
        {refining && (
          <p className="mx-4 mb-3 flex items-center gap-2 text-xs text-sub md:mx-8">
            <Loader2 className="size-3.5 animate-spin text-find" /> Showing closest matches — refining with tags, deep cuts and your taste…
          </p>
        )}
        {missingCategory && !refining && (
          <p className="panel mx-4 mb-3 px-3 py-2 text-xs text-sub md:mx-8">
            Last.fm has no {missingCategory === "mood" ? "mood" : "rhythm/instrument"} tags for {seedTitle} ({seedTags.slice(0, 4).join(", ") || "no tags"}), so this mode
            ranks on all shared tags instead.
          </p>
        )}
        {loading && (
          <>
            <p className="flex items-center gap-2 px-4 text-sm text-sub md:px-8">
              <Loader2 className="size-4 animate-spin text-find" />
              Finding music like {seedTitle}…
            </p>
            <div className="mt-2 grid grid-cols-2 gap-3 px-4 sm:grid-cols-3 md:px-8 lg:grid-cols-4 xl:grid-cols-5">
              {Array.from({ length: 10 }, (_, i) => <CardSkeleton key={i} />)}
            </div>
          </>
        )}
        {error && <p className="px-4 text-sm text-danger md:px-8">Couldn&apos;t load recommendations: {error}</p>}
        {data && ranked.length === 0 && (
          <p className="px-4 text-sm text-sub md:px-8">
            {data.candidates.length === 0
              ? (data.limitations[0] ?? "No similarity data found.")
              : "Nothing fits this combination — try another mode, result type, or move the slider."}
          </p>
        )}
        {ranked.length > 0 && (
          <div key={`${mode}-${kind}`} className="grid grid-cols-2 gap-3 px-4 sm:grid-cols-3 md:px-8 lg:grid-cols-4 xl:grid-cols-5">
            {ranked.map((r, i) => (
              <RecommendationCard key={r.c.key} r={r} item={items[i]} queue={items.filter((x) => x.kind === "track")} seedTitle={seedTitle} mode={mode} />
            ))}
          </div>
        )}
        {data && ranked.length >= shown && (
          <div className="mt-6 flex justify-center">
            <button onClick={() => setShown((n) => n + 24)} className="btn btn-secondary">
              Show more
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
