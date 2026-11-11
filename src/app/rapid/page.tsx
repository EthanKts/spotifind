import { Suspense } from "react";
import type { Metadata } from "next";
import { RapidView } from "./RapidView";

export const metadata: Metadata = { title: "Rapid-fire" };

export default function Page() {
  return (
    <Suspense fallback={<div className="px-6 text-sub">Loading…</div>}>
      <RapidView />
    </Suspense>
  );
}
