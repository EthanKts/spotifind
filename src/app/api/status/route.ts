import { connection } from "next/server";
import { hasLastfm } from "@/lib/sources/lastfm";
import { hasSpotify } from "@/lib/sources/spotify";
import type { KeyStatus } from "@/lib/types";

export async function GET() {
  await connection();
  return Response.json({ app: "spotifind", lastfm: hasLastfm(), spotify: hasSpotify() } satisfies KeyStatus & { app: string });
}
