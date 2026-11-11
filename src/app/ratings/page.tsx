import { Suspense } from "react";
import type { Metadata } from "next";
import { RatingsView } from "./RatingsView";

export const metadata: Metadata = { title: "My ratings" };

export default function RatingsPage() {
  return (
    <Suspense fallback={<div className="px-8 pt-4 text-sub">Loading…</div>}>
      <RatingsView />
    </Suspense>
  );
}
