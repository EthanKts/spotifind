"use client";

import Link from "next/link";
import { Compass, Sparkles } from "lucide-react";
import { useMemo } from "react";
import type { AlbumDetail, Item } from "@/lib/types";
import { albumUrl, useJson } from "@/lib/client/data";
import { useDerivedTaste } from "@/lib/taste/profile";
import { cosine, formatCount } from "@/lib/util";
import { SeedHeader } from "@/components/SeedHeader";
import { MediaCard, SectionTitle, Shelf, ShelfItem, TrackRow } from "@/components/Cards";
import { useRanked, useRecommendations } from "@/components/Discovery";
import { discoverHref } from "@/components/Actions";
import { TagChips } from "@/components/TagChips";
import { displayScore } from "@/lib/recommend/explain";

export function AlbumView({ artist, title }: { artist: string; title: string }) {
  const { data, error, loading } = useJson<AlbumDetail>(albumUrl(artist, title));
  const d = useDerivedTaste();
  const seed = useMemo(() => ({ kind: "album" as const, artist, title }), [artist, title]);
  const recs = useRecommendations(seed, "full");
  const similarAlbums = useRanked(recs.data, "closest", 0.2, { kind: "album", limit: 16, perArtist: 1 });
  const recTracks = useRanked(recs.data, "closest", 0.2, { kind: "track", limit: 16, perArtist: 1 });

  // "You'll likely love": tag overlap with your taste profile + how much each track is played (both real Last.fm data).
  const picks = useMemo(() => {
    if (!data) return { keys: new Set<string>(), personal: false };
    const pos: Record<string, number> = {};
    for (const [t, w] of Object.entries(d.tags)) if (w > 0) pos[t] = w;
    const personal = Object.keys(pos).length > 0;
    const maxPlays = Math.max(1, ...data.tracks.map((t) => t.playcount ?? 0));
    const scored = data.tracks
      .map((t) => {
        const pop = t.playcount ? Math.log10(t.playcount + 1) / Math.log10(maxPlays + 1) : 0;
        const fit = personal ? cosine(pos, t.tags).score : 0;
        return { key: t.key, s: personal ? 0.6 * fit + 0.4 * pop : pop };
      })
      .sort((a, b) => b.s - a.s);
    const hasSignal = data.tracks.some((t) => t.playcount);
    return { keys: new Set(hasSignal ? scored.slice(0, Math.min(3, data.tracks.length)).map((x) => x.key) : []), personal };
  }, [data, d.tags]);

  const items: Item[] = useMemo(
    () =>
      (data?.tracks ?? []).map((t) => ({
        kind: "track" as const, key: t.key, title: t.title, artist: t.artist, album: data?.item.title, image: data?.item.image,
        deezerId: t.deezerId, hasPreview: t.deezerId ? t.hasPreview : undefined, durationSec: t.durationSec, listeners: t.listeners,
      })),
    [data],
  );

  return (
    <div key={`${artist}|${title}`}>
      <SeedHeader
        kind="album"
        artist={data?.item.artist ?? artist}
        title={data?.item.title ?? title}
        item={data?.item}
        label="Album"
        stats={data ? [`${data.tracks.length} songs`] : undefined}
        extra={
          <Link
            href={discoverHref("album", data?.item.artist ?? artist, data?.item.title ?? title)}
            className="flex items-center gap-2 rounded-full bg-find px-4 py-1.5 text-sm font-bold text-black transition-transform hover:scale-105"
          >
            <Compass className="size-4" /> Explore similar
          </Link>
        }
      />
      {loading && <p className="px-4 text-sub md:px-6">Loading tracklist and listening data…</p>}
      {error && <p className="px-4 text-danger md:px-6">Couldn&apos;t load this album: {error}</p>}

      {data && (
        <>
          {Object.keys(data.tags).length > 0 && (
            <div className="px-4 md:px-6">
              <TagChips tags={data.tags} />
            </div>
          )}
          <section className="mt-6 md:px-2" aria-label="Tracklist">
            <div className="mb-1 hidden grid-cols-[auto_minmax(0,1fr)_auto] gap-3 border-b border-line px-6 pb-2 text-xs uppercase tracking-wider text-sub md:grid">
              <span className="w-8 text-center">#</span>
              <span>Title</span>
              <span className="pr-2">Plays · Duration</span>
            </div>
            {data.tracks.map((t, i) => (
              <TrackRow
                key={`${t.position}:${t.key}`}
                item={items[i]}
                index={t.position}
                queue={items}
                showArt={false}
                highlight={
                  picks.keys.has(t.key) ? (
                    <span className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-bold text-find">
                      <Sparkles className="size-3" /> {picks.personal ? "You'll likely love this" : "Listener favourite"}
                    </span>
                  ) : undefined
                }
                extra={t.playcount ? <span className="hidden text-xs tabular-nums text-mute lg:inline">{formatCount(t.playcount)} plays</span> : undefined}
              />
            ))}
            <p className="px-4 pt-3 text-xs text-mute md:px-6">
              {picks.personal
                ? "Highlights combine your taste-profile tags with each track's Last.fm play count."
                : "Rate a few songs 4–5★ to get personal highlights — for now these are the most-played tracks on Last.fm."}{" "}
              Sources: {data.sources.join(", ")}.
            </p>
          </section>

          {data.wiki && (
            <section className="mx-4 mt-8 max-w-3xl rounded-xl bg-elev p-5 text-sm leading-relaxed text-sub md:mx-6">
              <h2 className="mb-2 text-base font-bold text-ink">About this album</h2>
              {data.wiki}
            </section>
          )}
        </>
      )}

      {recs.loading && <SectionTitle sub="Analysing similar artists and tags…">Similar albums</SectionTitle>}
      {similarAlbums.items.length > 0 && (
        <Shelf title="Similar albums" subtitle="Albums with a close musical identity" href={discoverHref("album", artist, title)}>
          {similarAlbums.items.map((it, i) => {
            const s = displayScore(similarAlbums.ranked[i].c);
            return (
              <ShelfItem key={it.key}>
                <MediaCard item={it} badge={s && <span className="rounded-full bg-black/75 px-2 py-0.5 text-[11px] font-bold text-brand">{Math.round(s.value * 100)}%</span>} />
              </ShelfItem>
            );
          })}
        </Shelf>
      )}
      {recTracks.items.length > 0 && (
        <Shelf title="Recommended tracks" subtitle={`Songs listeners pair with this album's standout tracks`} href={`${discoverHref("album", artist, title)}`}>
          {recTracks.items.map((it, i) => {
            const s = displayScore(recTracks.ranked[i].c);
            return (
              <ShelfItem key={it.key}>
                <MediaCard item={it} queue={recTracks.items} badge={s && <span className="rounded-full bg-black/75 px-2 py-0.5 text-[11px] font-bold text-brand">{Math.round(s.value * 100)}%</span>} />
              </ShelfItem>
            );
          })}
        </Shelf>
      )}
    </div>
  );
}
