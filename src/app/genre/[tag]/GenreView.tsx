"use client";

import Link from "next/link";
import { ListMusic, Zap } from "lucide-react";

import type { Item } from "@/lib/types";
import { playableOnSpotify, useEnriched, useJson } from "@/lib/client/data";
import { Grid, MediaCard, PageHeader, SectionTitle, Shelf, ShelfItem, CardSkeleton, ErrorState } from "@/components/Cards";
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
        actions={
          <>
            <Link href={`/rapid?genre=${encodeURIComponent(tag)}`} className="btn btn-secondary">
              <Zap className="size-4" /> Rapid-fire this genre
            </Link>
            <Link href={`/playlists?genre=${encodeURIComponent(tag)}`} className="btn btn-primary">
              <ListMusic className="size-4" /> Make a playlist for me
            </Link>
          </>
        }
      />
      {error && <ErrorState title="Couldn’t load this genre" message={error} />}
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
