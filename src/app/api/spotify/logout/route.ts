import { disconnect } from "@/lib/sources/spotifyUser";

export async function POST() {
  disconnect();
  return Response.json({ ok: true });
}
