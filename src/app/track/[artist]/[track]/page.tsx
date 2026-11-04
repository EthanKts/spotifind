import { Suspense } from "react";
import { decodeParam } from "@/lib/params";
import { TrackView } from "./TrackView";

async function Loader({ params }: { params: PageProps<"/track/[artist]/[track]">["params"] }) {
  const { artist, track } = await params;
  return <TrackView artist={decodeParam(artist)} title={decodeParam(track)} />;
}

export default function TrackPage({ params }: PageProps<"/track/[artist]/[track]">) {
  return (
    <Suspense fallback={<div className="px-6 text-sub">Loading…</div>}>
      <Loader params={params} />
    </Suspense>
  );
}
