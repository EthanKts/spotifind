import type { NextRequest } from "next/server";
import { buildGenre } from "@/lib/recommend/genre";
import type { Depth } from "@/lib/recommend/candidates";

// Songs in 1–5 subgenres, with bridges from the artists you love:
//   ?genres=jazz-hard-bop|jazz-soul-jazz&loved=Khruangbin|Bonobo&depth=lite|full
// `tag=` (one free-text genre) is still accepted for older saved settings.
const g = globalThis as unknown as { __sfGenre?: Map<string, { exp: number; p: Promise<unknown> }> };
const memo = (g.__sfGenre ??= new Map());

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const ids = (sp.get("genres") ?? sp.get("tag") ?? "").split("|").map((s) => s.trim().toLowerCase()).filter(Boolean).slice(0, 5);
  if (!ids.length) return Response.json({ error: "genres is required" }, { status: 400 });
  const loved = (sp.get("loved") ?? "").split("|").map((s) => s.trim()).filter(Boolean).slice(0, 5);
  const depth: Depth = sp.get("depth") === "full" ? "full" : "lite";
  const key = `${ids.join("|")}|${loved.join("|").toLowerCase()}|${depth}`;
  let hit = memo.get(key);
  if (!hit || hit.exp < Date.now()) {
    hit = { exp: Date.now() + 3 * 3600_000, p: buildGenre(ids, loved, depth) };
    memo.set(key, hit);
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
