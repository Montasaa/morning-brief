// GET /api/auth/callback?token=...: the link in a sign-in or Invite email.
// A good link starts a session on this device and opens the Brief; a used,
// expired or revoked one goes back to the sign-in page.
import { getAppContext } from "@/server/app";
import { sessionCookieHeader } from "@/server/readers/sessions";
import { redeemMagicLink } from "@/server/readers/sign-in";

export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  const ctx = getAppContext();
  const token = new URL(req.url).searchParams.get("token");
  const result = redeemMagicLink(ctx, token);
  const base = ctx.config.basePath;
  const headers = new Headers({ "cache-control": "no-store", "referrer-policy": "no-referrer" });
  if (!result.ok) {
    headers.set("location", `${base}/sign-in?error=link`);
    return new Response(null, { status: 303, headers });
  }
  headers.set("location", base || "/");
  headers.append("set-cookie", sessionCookieHeader(ctx, req, result.sessionToken));
  return new Response(null, { status: 303, headers });
}
