import { Suspense } from "react";
import type { Metadata } from "next";
import { PlaylistView } from "./PlaylistView";

export const metadata: Metadata = { title: "Playlist" };

export default function PlaylistPage() {
  return (
    <Suspense fallback={<div className="px-6 text-sub">Loading…</div>}>
      <PlaylistView />
    </Suspense>
  );
}
