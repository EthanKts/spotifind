import Link from "next/link";
import type { TagVector } from "@/lib/types";
import { categorize } from "@/lib/recommend/tags";

const COLORS: Record<string, string> = {
  groove: "bg-brand/15 text-brand",
  mood: "bg-white/10 text-ink",
  vocal: "bg-[#c39bd3]/15 text-[#d7b4e4]",
  production: "bg-[#f0b45a]/15 text-[#f3c47c]",
  other: "bg-hl-2 text-sub",
};

export function TagChips({ tags, max = 10 }: { tags: TagVector; max?: number }) {
  const list = Object.entries(tags).sort((a, b) => b[1] - a[1]).slice(0, max);
  if (!list.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {list.map(([t]) => (
        <Link key={t} href={`/genre/${encodeURIComponent(t)}`} className={`rounded-full px-2.5 py-0.5 text-xs font-semibold transition-opacity hover:opacity-80 ${COLORS[categorize(t)]}`}>
          {t}
        </Link>
      ))}
    </div>
  );
}
