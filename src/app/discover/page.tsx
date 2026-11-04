import { Suspense } from "react";
import type { Metadata } from "next";
import { DiscoverPage } from "./DiscoverPage";

export const metadata: Metadata = { title: "Discover" };

export default function Page() {
  return (
    <Suspense fallback={<div className="px-6 text-sub">Loading…</div>}>
      <DiscoverPage />
    </Suspense>
  );
}
