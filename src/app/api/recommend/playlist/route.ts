import { createHash } from "node:crypto";
import { buildFromPlaylist } from "@/lib/recommend/playlist";

// Songs like a whole pasted playlist: POST { id, name, tracks: [{ artist, title }], depth: "lite" | "full" }.
// POST because 100+ songs don't fit in a URL. Results are kept for 3 h, like the other recommendation routes.
const g = globalThis as unknown as { __sfPlaylistPool?: Map<string, { exp: number; p: Promise<unknown> }> };
const memo = (g.__sfPlaylistPool ??= new Map());

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { id?: string; name?: string; tracks?: { artist?: unknown; title?: unknown }[]; depth?: string };
  const tracks = (body.tracks ?? [])
    .filter((t) => typeof t.artist === "string" && typeof t.title === "string" && t.artist && t.title)
    .map((t) => ({ artist: t.artist as string, title: t.title as string }))
    .slice(0, 300);
  if (!tracks.length) return Response.json({ error: "tracks is required" }, { status: 400 });
  const depth = body.depth === "full" ? "full" : "lite";
  const name = (body.name ?? "this playlist").slice(0, 200);
  const key = createHash("sha1").update(JSON.stringify([body.id, tracks, depth])).digest("hex");
  let hit = memo.get(key);
  if (!hit || hit.exp < Date.now()) {
    for (const [k, v] of memo) if (v.exp < Date.now()) memo.delete(k);
    hit = { exp: Date.now() + 3 * 3600_000, p: buildFromPlaylist(name, tracks, depth) };
    memo.set(key, hit);
    hit.p.catch(() => memo.delete(key));
  }
  try {
    return Response.json(await hit.p);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
}
