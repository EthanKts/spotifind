import type { NextRequest } from "next/server";
import { buildRecommendations, type Depth } from "@/lib/recommend/candidates";
import type { Kind } from "@/lib/types";

const g = globalThis as unknown as { __sfRec?: Map<string, { exp: number; p: Promise<unknown> }> };
const memo = (g.__sfRec ??= new Map());

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const kind = sp.get("kind") as Kind | null;
  const artist = sp.get("artist")?.trim();
  const title = sp.get("title")?.trim() ?? artist;
  const d = sp.get("depth");
  const depth: Depth = d === "lite" || d === "quick" ? d : "full";
  if (!kind || !["track", "album", "artist"].includes(kind) || !artist || !title) {
    return Response.json({ error: "kind, artist and title are required" }, { status: 400 });
  }
  const key = `${kind}|${artist.toLowerCase()}|${title.toLowerCase()}|${depth}`;
  let hit = memo.get(key);
  if (!hit || hit.exp < Date.now()) {
    hit = { exp: Date.now() + 3 * 3600_000, p: buildRecommendations(kind, artist, title, depth, { foreground: sp.get("fg") === "1" }) };
    memo.set(key, hit);
    // Never keep a failure or an empty pool: source errors are swallowed per call, so an empty
    // result may just mean a transient Last.fm/Deezer hiccup — the next request should retry.
    hit.p.then(
      (r: unknown) => (r as { candidates: unknown[] }).candidates.length === 0 && memo.delete(key),
      () => memo.delete(key),
    );
  }
  try {
    return Response.json(await hit.p);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
}
