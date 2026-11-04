"use client";

import { AlertTriangle } from "lucide-react";
import { useKeyStatus } from "@/lib/client/data";

export function KeyBanner() {
  const s = useKeyStatus();
  if (!s || s.lastfm) return null;
  return (
    <div role="status" className="mx-4 mb-2 flex items-start gap-3 rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm md:mx-6">
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-danger" />
      <p className="text-sub">
        <span className="font-semibold text-ink">Limited mode — no Last.fm key.</span> Recommendations fall back to Deezer&apos;s related-artist graph:
        no similarity scores, and Same Groove / Same Mood are unavailable. <button
          onClick={() => {
            try {
              sessionStorage.removeItem("spotifind:skipSetup");
            } catch {}
            window.location.reload();
          }}
          className="font-semibold text-ink underline"
        >
          Add your Last.fm key
        </button>{" "}
        to unlock them.
      </p>
    </div>
  );
}
