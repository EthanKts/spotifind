import { Suspense } from "react";
import { decodeParam } from "@/lib/params";
import { GenreView } from "./GenreView";

async function Loader({ params }: { params: PageProps<"/genre/[tag]">["params"] }) {
  const { tag } = await params;
  return <GenreView tag={decodeParam(tag)} />;
}

export default function GenrePage({ params }: PageProps<"/genre/[tag]">) {
  return (
    <Suspense fallback={<div className="px-6 text-sub">Loading…</div>}>
      <Loader params={params} />
    </Suspense>
  );
}
