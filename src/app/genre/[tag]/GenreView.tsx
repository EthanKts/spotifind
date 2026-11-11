"use client";

import type { Item } from "@/lib/types";
import { playableOnSpotify, useEnriched, useJson } from "@/lib/client/data";
import { Grid, MediaCard, PageHeader, SectionTitle, Shelf, ShelfItem, CardSkeleton } from "@/components/Cards";
import { categorize } from "@/lib/recommend/tags";

export function GenreView({ tag }: { tag: string }) {
  const { data, loading, error } = useJson<{ artists: Item[]; albums: Item[] }>(`/api/tag?tag=${encodeURIComponent(tag)}`);
  const albums = useEnriched(data?.albums ?? []).filter(playableOnSpotify);
  const cat = categorize(tag);
  return (
    <div key={tag}>
      <PageHeader
        title={<span className="capitalize">{tag}</span>}
        description={`${cat === "mood" ? "Mood" : cat === "other" ? "Tag" : "Sound"} · top artists and albums tagged “${tag}” by Last.fm listeners`}
      />
      {error && <p className="px-4 text-danger md:px-8">{error}</p>}
      <Shelf title="Artists" loading={loading}>
        {(data?.artists ?? []).map((a) => (
          <ShelfItem key={a.key}>
            <MediaCard item={a} />
          </ShelfItem>
        ))}
      </Shelf>
      {loading && (
        <div className="flex">
          {Array.from({ length: 5 }, (_, i) => <CardSkeleton key={i} />)}
        </div>
      )}
      {albums.length > 0 && (
        <>
          <SectionTitle>Albums</SectionTitle>
          <Grid>
            {albums.map((a) => (
              <MediaCard key={a.key} item={a} />
            ))}
          </Grid>
        </>
      )}
    </div>
  );
}
