import { Suspense } from "react";
import type { Metadata } from "next";
import { SearchView } from "./SearchView";

export const metadata: Metadata = { title: "Search" };

export default function SearchPage() {
  return (
    <Suspense fallback={<div className="px-6 text-sub">Loading…</div>}>
      <SearchView />
    </Suspense>
  );
}
