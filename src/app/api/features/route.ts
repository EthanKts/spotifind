import { mapLimit } from "@/lib/sources/http";
import { audioFeatures } from "@/lib/sources/reccobeats";
import type { AudioFeatures } from "@/lib/types";

// Measured audio features for songs, by Deezer track id: { ids: [..] } → { [id]: features | null }.
// Unknown/failed songs come back null; callers fall back to a tag-based estimate.
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { ids?: unknown[] };
  const ids = [...new Set((body.ids ?? []).map(Number).filter((n) => Number.isInteger(n) && n > 0))].slice(0, 40);
  const results = await mapLimit(ids, 3, (id) => audioFeatures(id));
  const out: Record<number, AudioFeatures | null> = {};
  ids.forEach((id, i) => (out[id] = results[i] ?? null));
  return Response.json(out);
}
