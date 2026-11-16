"use client";

import { Check, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useProfile } from "@/lib/taste/profile";
import { SectionTitle } from "@/components/Cards";

type Cov = { sources: Record<string, boolean>; audio: { have: number; total: number }; styles: { have: number; total: number } };

const SOURCES: [string, string, string][] = [
  ["lastfm", "Last.fm", "Similar songs/artists and listener tags"],
  ["listenbrainz", "ListenBrainz", "Second opinion on similar artists (no key needed)"],
  ["discogs", "Discogs", "Precise genres and styles (needs a token)"],
  ["reccobeats", "ReccoBeats", "Energy, mood, tempo measured from previews (no key needed)"],
  ["spotify", "Spotify", "Your login: import taste, save playlists"],
];

function Bar({ label, have, total }: { label: string; have: number; total: number }) {
  const pct = total ? Math.round((100 * have) / total) : 0;
  return (
    <div>
      <div className="flex justify-between text-sm">
        <span>{label}</span>
        <span className="tabular-nums text-sub">
          {have}/{total} · {pct}%
        </span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-hl">
        <div className="h-full rounded-full bg-find" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** How much Spotifind knows about the music you rated, and which sources are on. */
export function Coverage() {
  const p = useProfile();
  const [cov, setCov] = useState<Cov | null>(null);
  useEffect(() => {
    const rated = Object.values(p.ratings);
    const tracks = rated.filter((r) => r.item.kind === "track").map((r) => ({ artist: r.item.artist, title: r.item.title, deezerId: r.item.deezerId }));
    const artists = [...new Set(rated.map((r) => r.item.artist))];
    fetch("/api/coverage", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tracks, artists }) })
      .then((r) => r.json())
      .then(setCov)
      .catch(() => {});
  }, [p.ratings]);
  return (
    <>
      <SectionTitle sub="What Spotifind knows about the music you rated. Coverage grows as you use the app; nothing is fetched just to fill this in.">
        Data coverage
      </SectionTitle>
      <div className="mx-4 grid gap-3 md:mx-8 lg:grid-cols-2">
        <div className="panel grid gap-4 p-4">
          {cov ? (
            <>
              <Bar label="Rated songs with measured audio" have={cov.audio.have} total={cov.audio.total} />
              <Bar label="Rated artists with Discogs styles" have={cov.styles.have} total={cov.styles.total} />
            </>
          ) : (
            <div className="h-16 animate-pulse rounded bg-hl" />
          )}
        </div>
        <ul className="panel divide-y divide-line">
          {SOURCES.map(([id, name, what]) => {
            const on = cov?.sources[id];
            return (
              <li key={id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                {on ? <Check className="size-4 text-find" aria-label="On" /> : <X className="size-4 text-mute" aria-label="Not configured" />}
                <span className="w-28 shrink-0">{name}</span>
                <span className="min-w-0 flex-1 truncate text-xs text-sub">{on === false ? "Not configured · " : ""}{what}</span>
              </li>
            );
          })}
        </ul>
      </div>
    </>
  );
}
