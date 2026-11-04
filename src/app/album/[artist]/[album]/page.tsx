import { Suspense } from "react";
import { decodeParam } from "@/lib/params";
import { AlbumView } from "./AlbumView";

async function Loader({ params }: { params: PageProps<"/album/[artist]/[album]">["params"] }) {
  const { artist, album } = await params;
  return <AlbumView artist={decodeParam(artist)} title={decodeParam(album)} />;
}

export default function AlbumPage({ params }: PageProps<"/album/[artist]/[album]">) {
  return (
    <Suspense fallback={<div className="px-6 text-sub">Loading…</div>}>
      <Loader params={params} />
    </Suspense>
  );
}
