"use client";

import Link from "next/link";
import { useProfile } from "@/lib/taste/profile";
import { EmptyState, Grid, MediaCard, PageHeader } from "@/components/Cards";

function ago(t: number) {
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}

export default function RecentlyDiscoveredPage() {
  const p = useProfile();
  const list = p.recentlyDiscovered;
  return (
    <div>
      <PageHeader title="History" description="Recommendations you opened, and what led you there." />
      {list.length === 0 ? (
        <EmptyState
          title="Nothing discovered yet"
          action={
            <Link href="/discover" className="btn btn-primary">
              Start discovering
            </Link>
          }
        >
          Open any recommendation and it&apos;s kept here.
        </EmptyState>
      ) : (
        <Grid>
          {list.map((e) => (
            <MediaCard
              key={e.item.key}
              item={e.item}
              queue={list.map((x) => x.item).filter((x) => x.kind === "track")}
              subtitle={
                <>
                  {e.item.kind === "artist" ? "Artist" : e.item.artist}
                  <span className="block text-xs text-mute">
                    {e.via ? `via ${e.via} · ` : ""}
                    <span suppressHydrationWarning>{ago(e.at)}</span>
                  </span>
                </>
              }
            />
          ))}
        </Grid>
      )}
    </div>
  );
}
