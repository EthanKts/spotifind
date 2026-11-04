"use client";

import { SeedHeader } from "@/components/SeedHeader";
import { DiscoverView } from "@/components/Discovery";

export function TrackView({ artist, title }: { artist: string; title: string }) {
  return (
    <div key={`${artist}|${title}`}>
      <SeedHeader kind="track" artist={artist} title={title} />
      <DiscoverView seed={{ kind: "track", artist, title }} />
    </div>
  );
}
