import type { NextRequest } from "next/server";
import * as dz from "@/lib/sources/deezer";

// Fresh (signed, short-lived) Deezer 30-second preview URL for a track id.
export async function GET(req: NextRequest) {
  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!id) return Response.json({ url: null }, { status: 400 });
  try {
    return Response.json({ url: (await dz.trackPreview(id)) ?? null });
  } catch {
    return Response.json({ url: null });
  }
}
