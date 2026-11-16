// POST /api/auth/sign-in {email, password}: start a session on this device.
// A wrong password and an unknown email get the same answer, so it never
// reveals who is a Reader. The sign-in page posts it as a plain HTML form,
// answered with a redirect: to the Brief, or back to the page with a message.
import { isFormPost, readFields, seeOther } from "@/server/access";
import { getAppContext } from "@/server/app";
import { sessionCookieHeader } from "@/server/readers/sessions";
import { signInWithPassword } from "@/server/readers/sign-in";

export const dynamic = "force-dynamic";

const WRONG = "Wrong email or password.";
const TOO_MANY_TRIES = "Too many tries for this email. Wait 15 minutes, then try again.";

export async function POST(req: Request): Promise<Response> {
  const ctx = getAppContext();
  const base = ctx.config.basePath;
  const form = isFormPost(req);
  const fields = await readFields(req);
  if (!fields) return Response.json({ error: "Body is not valid JSON" }, { status: 400 });

  const result = await signInWithPassword(ctx, fields.email, fields.password);
  if (!result.ok) {
    const limited = result.reason === "too-many-tries";
    if (form) return seeOther(`${base}/sign-in?error=${limited ? "limit" : "wrong"}`);
    return Response.json({ error: limited ? TOO_MANY_TRIES : WRONG }, { status: limited ? 429 : 401 });
  }
  const cookie = sessionCookieHeader(ctx, req, result.sessionToken);
  if (form) return seeOther(base || "/", { "set-cookie": cookie });
  return Response.json({ reader: result.reader }, { headers: { "set-cookie": cookie, "cache-control": "no-store" } });
}
