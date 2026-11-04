import { Suspense } from "react";
import { decodeParam } from "@/lib/params";
import { ArtistView } from "./ArtistView";

async function Loader({ params }: { params: PageProps<"/artist/[name]">["params"] }) {
  const { name } = await params;
  return <ArtistView name={decodeParam(name)} />;
}

export default function ArtistPage({ params }: PageProps<"/artist/[name]">) {
  return (
    <Suspense fallback={<div className="px-6 text-sub">Loading…</div>}>
      <Loader params={params} />
    </Suspense>
  );
}
