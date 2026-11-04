import type { NextRequest } from "next/server";
import { completeLogin } from "@/lib/sources/spotifyUser";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function page(title: string, body: string, ok: boolean) {
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} · Spotifind</title><style>
html,body{margin:0;height:100%;background:#121212;color:#fff;font:16px -apple-system,system-ui,sans-serif}
body{display:flex;align-items:center;justify-content:center;padding:16px}
.card{max-width:460px;text-align:center;background:#181818;border-radius:16px;padding:32px}
h1{font-size:24px;margin:0 0 8px} p{color:#b3b3b3;line-height:1.5;margin:0}
.dot{width:56px;height:56px;border-radius:50%;margin:0 auto 16px;display:grid;place-items:center;font-size:28px;color:#000;background:${ok ? "#1ed760" : "#f3727f"}}
</style></head><body><div class="card"><div class="dot">${ok ? "✓" : "!"}</div><h1>${esc(title)}</h1><p>${body}</p></div></body></html>`,
    { headers: { "Content-Type": "text/html; charset=utf-8" }, status: ok ? 200 : 400 },
  );
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const err = q.get("error");
  if (err) {
    return page("Spotify login cancelled", `Spotify said: ${esc(err)}. You can close this tab and try again from Spotifind.`, false);
  }
  try {
    const { name } = await completeLogin(q.get("code") ?? "", q.get("state") ?? "");
    return page(
      `Connected as ${name}`,
      "Spotifind can now save playlists to your Spotify. You can close this tab and go back to Spotifind — it picks this up automatically.",
      true,
    );
  } catch (e) {
    return page("Couldn't connect to Spotify", esc((e as Error).message), false);
  }
}
