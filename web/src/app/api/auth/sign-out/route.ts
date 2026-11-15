// POST /api/auth/sign-out: end this device's session. A plain HTML form post
// (the Sign out button) is redirected to the sign-in page.
import { isFormPost, seeOther } from "@/server/access";
import { getAppContext } from "@/server/app";
import { clearedSessionCookieHeader, endSession, sessionTokenFrom } from "@/server/readers/sessions";

export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  const ctx = getAppContext();
  endSession(ctx, sessionTokenFrom(req));
  const cookie = clearedSessionCookieHeader(ctx, req);
  if (isFormPost(req)) return seeOther(`${ctx.config.basePath}/sign-in`, { "set-cookie": cookie });
  return Response.json({ signed_out: true }, { headers: { "set-cookie": cookie } });
}
