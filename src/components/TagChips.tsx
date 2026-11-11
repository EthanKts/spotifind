import Link from "next/link";
import type { TagVector } from "@/lib/types";
import { categorize } from "@/lib/recommend/tags";


export function TagChips({ tags, max = 10 }: { tags: TagVector; max?: number }) {
  const list = Object.entries(tags).sort((a, b) => b[1] - a[1]).slice(0, max);
  if (!list.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {list.map(([t]) => (
        <Link key={t} href={`/genre/${encodeURIComponent(t)}`} title={categorize(t)}
          className="rounded-full border border-line bg-elev px-2.5 py-0.5 text-xs text-sub transition-colors hover:bg-hl hover:text-ink">
          {t}
        </Link>
      ))}
    </div>
  );
}
