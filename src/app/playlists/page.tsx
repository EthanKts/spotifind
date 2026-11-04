import { Suspense } from "react";
import type { Metadata } from "next";
import { PlaylistsView } from "./PlaylistsView";

export const metadata: Metadata = { title: "Playlists" };

export default function PlaylistsPage() {
  return (
    <Suspense fallback={<div className="px-6 text-sub">Loading…</div>}>
      <PlaylistsView />
    </Suspense>
  );
}
