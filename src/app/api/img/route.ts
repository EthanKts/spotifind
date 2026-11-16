import type { NextRequest } from "next/server";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { SUPPORT_DIR } from "@/lib/sources/config";
import { IMG_HOSTS } from "@/lib/img";

// Resized, cached artwork: /api/img?u=<image url>&w=<width>. Each image is fetched once, resized to WebP with
// sharp and kept in ~/Library/Application Support/Spotifind/img, then served with long-lived cache headers.

const DIR = join(SUPPORT_DIR, "img");
const WIDTHS = [64, 128, 256, 512, 1000];
const UA = "Spotifind/1.0 (+https://github.com/EthanKts/spotifind)";
const headers = (etag: string) => ({
  "Content-Type": "image/webp",
  "Cache-Control": "public, max-age=31536000, immutable",
  ETag: etag,
});

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("u") ?? "";
  const w = WIDTHS.find((x) => x >= Number(req.nextUrl.searchParams.get("w") ?? 256)) ?? 1000;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return new Response("bad url", { status: 400 });
  }
  if (url.protocol !== "https:" || !IMG_HOSTS.some((h) => h.test(url.hostname))) return new Response("host not allowed", { status: 400 });

  const id = createHash("sha1").update(`${url.href}|${w}`).digest("hex");
  const etag = `"${id}"`;
  if (req.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers: headers(etag) });
  const file = join(DIR, `${id}.webp`);
  if (existsSync(file)) return new Response(readFileSync(file), { headers: headers(etag) });

  try {
    const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return new Response("upstream", { status: 502 });
    const input = Buffer.from(await res.arrayBuffer());
    const sharp = (await import("sharp")).default; // loaded on first use only, keeps server start fast
    const out = await sharp(input).resize({ width: w, height: w, fit: "cover", withoutEnlargement: true }).webp({ quality: 78 }).toBuffer();
    mkdirSync(DIR, { recursive: true });
    writeFileSync(file, out);
    return new Response(new Uint8Array(out), { headers: headers(etag) });
  } catch {
    return Response.redirect(url.href, 302); // can't resize: fall back to the original
  }
}
