import * as dg from "@/lib/sources/discogs";
import { mapLimit } from "@/lib/sources/http";
import type { TagVector } from "@/lib/types";

// Discogs styles for a list of artists (your rated / imported artists), for the taste profile.
// Cached answers come back instantly; at most `fetch` new ones are looked up per call (shared 60/min limit).
export async function POST(req: Request) {
  const { artists = [], fetch: maxFetch = 8 } = (await req.json().catch(() => ({}))) as { artists?: string[]; fetch?: number };
  const list = [...new Set(artists.filter(Boolean))].slice(0, 120);
  const out: Record<string, TagVector> = {};
  if (!dg.hasDiscogs()) return Response.json({ configured: false, styles: out });
  const missing: string[] = [];
  for (const a of list) {
    const hit = dg.peekArtistStyles(a);
    if (hit) out[a] = hit;
    else missing.push(a);
  }
  const fetched = await mapLimit(missing.slice(0, Math.min(20, maxFetch)), 2, (a) => dg.artistStyles(a));
  missing.slice(0, Math.min(20, maxFetch)).forEach((a, i) => fetched[i] && (out[a] = fetched[i]!));
  return Response.json({ configured: true, styles: out, pending: Math.max(0, missing.length - maxFetch) });
}
