import type { NextRequest } from "next/server";
import { completeLogin, NotApprovedError, setLoginError } from "@/lib/sources/spotifyUser";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function page(title: string, body: string, ok: boolean) {
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} · Spotifind</title><style>
html,body{margin:0;height:100%;background:#111113;color:#f4f4f5;font:15px -apple-system,system-ui,sans-serif}
body{display:flex;align-items:center;justify-content:center;padding:16px}
.card{max-width:440px;text-align:center;background:#18181b;border:1px solid #2a2a2f;border-radius:10px;padding:28px}
h1{font-size:20px;font-weight:600;margin:0 0 6px} p{color:#a1a1aa;line-height:1.5;margin:0}
.dot{width:40px;height:40px;border-radius:50%;margin:0 auto 14px;display:grid;place-items:center;font-size:20px;color:#000;background:${ok ? "#1ed760" : "#f3727f"}}
</style></head><body><div class="card"><div class="dot">${ok ? "✓" : "!"}</div><h1>${esc(title)}</h1><p>${body}</p></div></body></html>`,
    { headers: { "Content-Type": "text/html; charset=utf-8" }, status: ok ? 200 : 400 },
  );
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const err = q.get("error");
  if (err) {
    setLoginError({ message: err === "access_denied" ? "You cancelled the Spotify login." : `Spotify said: ${err}`, notApproved: false, at: Date.now() });
    return page("Spotify login cancelled", `Spotify said: ${esc(err)}. You can close this tab and try again from Spotifind.`, false);
  }
  try {
    const { name } = await completeLogin(q.get("code") ?? "", q.get("state") ?? "");
    return page(
      `Connected as ${name}`,
      "You can close this tab and go back to Spotifind — it picks this up automatically.",
      true,
    );
  } catch (e) {
    setLoginError({ message: (e as Error).message, notApproved: e instanceof NotApprovedError, at: Date.now() });
    if (e instanceof NotApprovedError) return page("Almost there", `${esc(e.message)}<br><br>You can close this tab — Spotifind shows what to do next.`, false);
    return page("Couldn't connect to Spotify", esc((e as Error).message), false);
  }
}
