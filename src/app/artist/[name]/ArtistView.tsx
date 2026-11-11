"use client";

import Link from "next/link";
import { Compass, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import type { ArtistDetail, Item } from "@/lib/types";
import { artistUrl, useEnriched, useJson } from "@/lib/client/data";
import { useDerivedTaste, useProfile } from "@/lib/taste/profile";
import { cosine, formatCount } from "@/lib/util";
import { SeedHeader } from "@/components/SeedHeader";
import { Grid, MediaCard, SectionTitle, Shelf, ShelfItem, TrackRow } from "@/components/Cards";
import { discoverHref } from "@/components/Actions";
import { TagChips } from "@/components/TagChips";

export function ArtistView({ name }: { name: string }) {
  const { data, error, loading } = useJson<ArtistDetail>(artistUrl(name));
  const p = useProfile();
  const d = useDerivedTaste();
  const [showAll, setShowAll] = useState(false);

  const taste = useMemo(() => {
    const pos: Record<string, number> = {};
    for (const [t, w] of Object.entries(d.tags)) if (w > 0) pos[t] = w;
    return pos;
  }, [d.tags]);
  const personal = Object.keys(taste).length > 0;

  // Songs most relevant to YOUR taste: tag overlap with your profile, blended with Last.fm plays.
  const relevant = useMemo(() => {
    if (!data) return [];
    const max = Math.max(1, ...data.topTracks.map((t) => t.playcount ?? 0));
    return data.topTracks
      .map((t, i) => {
        const pop = t.playcount ? Math.log10(t.playcount + 1) / Math.log10(max + 1) : 1 - i / data.topTracks.length;
        const fit = personal ? cosine(taste, t.tags) : { score: 0, shared: [] as string[] };
        return { t, s: personal ? 0.65 * fit.score + 0.35 * pop : pop, shared: fit.shared.slice(0, 2) };
      })
      .sort((a, b) => b.s - a.s);
  }, [data, taste, personal]);

  const trackItems = useEnriched(useMemo(() => relevant.map((r) => r.t as Item), [relevant]));
  const related = useEnriched(useMemo(() => data?.related ?? [], [data]));

  const startWith = useMemo(
    () => [...(data?.albums ?? [])].filter((a) => a.playcount).sort((a, b) => (b.playcount ?? 0) - (a.playcount ?? 0)).slice(0, 10),
    [data],
  );
  const discography = useMemo(() => [...(data?.albums ?? [])].sort((a, b) => (b.year ?? 0) - (a.year ?? 0)), [data]);

  const visible = showAll ? trackItems : trackItems.slice(0, 5);

  return (
    <div key={name}>
      <SeedHeader
        kind="artist"
        artist={data?.item.artist ?? name}
        title={data?.item.title ?? name}
        item={data?.item}
        label="Artist"
        extra={
          <Link
            href={discoverHref("artist", data?.item.artist ?? name, data?.item.title ?? name)}
            className="btn btn-primary"
          >
            <Compass className="size-4" /> Discover from this artist
          </Link>
        }
      />
      {loading && <p className="px-4 text-sub md:px-8">Loading discography and listening data…</p>}
      {error && <p className="px-4 text-danger md:px-8">Couldn&apos;t load this artist: {error}</p>}

      {data && (
        <>
          {Object.keys(data.tags).length > 0 && (
            <div className="px-4 md:px-8">
              <TagChips tags={data.tags} />
            </div>
          )}

          <SectionTitle sub={personal ? "Ranked by how well each song's tags match your taste profile, then by Last.fm plays" : "Most played on Last.fm — rate a few songs to personalise this"}>
            {personal ? "Most relevant to your taste" : "Popular"}
          </SectionTitle>
          <div className="md:px-2">
            {visible.map((it, i) => (
              <TrackRow
                key={it.key}
                item={it}
                index={i + 1}
                queue={trackItems}
                highlight={
                  personal && relevant[i]?.shared.length ? (
                    <span className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-sub">
                      <Sparkles className="size-3" /> Matches your love of {relevant[i].shared.join(" & ")}
                    </span>
                  ) : undefined
                }
                extra={relevant[i]?.t.playcount ? <span className="hidden text-xs tabular-nums text-mute lg:inline">{formatCount(relevant[i].t.playcount)} plays</span> : undefined}
              />
            ))}
            {trackItems.length > 5 && (
              <button onClick={() => setShowAll((s) => !s)} className="px-4 py-2 text-sm font-bold text-sub hover:text-ink md:px-8">
                {showAll ? "Show less" : "See more"}
              </button>
            )}
          </div>

          {startWith.length > 0 && (
            <Shelf title="Albums to start with" subtitle="This artist's most-played albums on Last.fm">
              {startWith.map((a) => (
                <ShelfItem key={a.key}>
                  <MediaCard
                    item={a}
                    badge={p.ratings[a.key] ? <span className="rounded bg-black/80 px-1.5 py-0.5 text-[11px] text-ink">You rated {p.ratings[a.key].rating}★</span> : undefined}
                    subtitle={`${a.year ? `${a.year} · ` : ""}${formatCount(a.playcount)} plays`}
                  />
                </ShelfItem>
              ))}
            </Shelf>
          )}

          {related.length > 0 && (
            <Shelf title="Related artists" subtitle="Last.fm similarity, based on shared listeners" href={discoverHref("artist", data.item.artist, data.item.title)}>
              {related.map((a) => (
                <ShelfItem key={a.key}>
                  <MediaCard
                    item={a}
                    subtitle={(a as Item & { match?: number }).match != null ? `${Math.round((a as Item & { match?: number }).match! * 100)}% similar` : "Artist"}
                  />
                </ShelfItem>
              ))}
            </Shelf>
          )}

          {discography.length > 0 && (
            <>
              <SectionTitle sub={data.sources.includes("MusicBrainz") ? "Studio albums from MusicBrainz, with original release years" : "Albums"}>Discography</SectionTitle>
              <Grid>
                {discography.map((a) => (
                  <MediaCard key={a.key} item={a} subtitle={a.year ? String(a.year) : "Album"} />
                ))}
              </Grid>
            </>
          )}

          {data.bio && (
            <section className="mx-4 mt-8 max-w-3xl rounded-xl bg-elev p-5 text-sm leading-relaxed text-sub md:mx-8">
              <h2 className="mb-2 text-sm font-semibold text-ink">About</h2>
              {data.bio}
              {data.item.listeners && <p className="mt-3 font-semibold text-ink">{formatCount(data.item.listeners)} Last.fm listeners</p>}
            </section>
          )}
        </>
      )}
    </div>
  );
}
