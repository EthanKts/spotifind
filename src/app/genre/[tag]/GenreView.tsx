"use client";

import type { Item } from "@/lib/types";
import { useEnriched, useJson } from "@/lib/client/data";
import { Grid, MediaCard, SectionTitle, Shelf, ShelfItem, CardSkeleton } from "@/components/Cards";
import { categorize } from "@/lib/recommend/tags";

export function GenreView({ tag }: { tag: string }) {
  const { data, loading, error } = useJson<{ artists: Item[]; albums: Item[] }>(`/api/tag?tag=${encodeURIComponent(tag)}`);
  const albums = useEnriched(data?.albums ?? []);
  const cat = categorize(tag);
  return (
    <div key={tag}>
      <div className="bg-gradient-to-b from-brand/25 to-transparent px-4 pb-6 pt-6 md:px-6">
        <p className="text-xs font-bold uppercase tracking-wider text-sub">{cat === "mood" ? "Mood" : cat === "other" ? "Tag" : "Sound"}</p>
        <h1 className="mt-1 text-5xl font-extrabold capitalize tracking-tight md:text-7xl">{tag}</h1>
        <p className="mt-2 text-sm text-sub">Top artists and albums tagged “{tag}” by Last.fm listeners</p>
      </div>
      {error && <p className="px-4 text-danger md:px-6">{error}</p>}
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
