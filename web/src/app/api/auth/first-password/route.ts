// POST /api/auth/first-password {email, password, confirm_password}: the
// Owner's first visit. While the Owner has no password, the Owner's email can
// choose one here (typed twice); it signs them in. Any other email, or a second
// try once it is set, is refused. The sign-in page posts it as a plain HTML form.
import { isFormPost, readFields, seeOther } from "@/server/access";
import { getAppContext } from "@/server/app";
import { sessionCookieHeader } from "@/server/readers/sessions";
import { setOwnerFirstPassword, type FirstPasswordResult } from "@/server/readers/sign-in";

export const dynamic = "force-dynamic";

type Refusal = Extract<FirstPasswordResult, { ok: false }>["reason"];

const REFUSALS: Record<Refusal, { status: number; error: string; code: string }> = {
  "too-short": { status: 400, error: "Use at least 8 characters.", code: "short" },
  "too-long": { status: 400, error: "Use at most 200 characters.", code: "long" },
  mismatch: { status: 400, error: "The two passwords don't match.", code: "mismatch" },
  refused: { status: 403, error: "A password can't be set for this email here. Sign in instead.", code: "refused" },
  "too-many-tries": { status: 429, error: "Too many tries for this email. Wait 15 minutes, then try again.", code: "limit" },
};

export async function POST(req: Request): Promise<Response> {
  const ctx = getAppContext();
  const base = ctx.config.basePath;
  const form = isFormPost(req);
  const fields = await readFields(req);
  if (!fields) return Response.json({ error: "Body is not valid JSON" }, { status: 400 });

  const result = await setOwnerFirstPassword(ctx, fields.email, fields.password, fields.confirm_password);
  if (!result.ok) {
    const refusal = REFUSALS[result.reason];
    if (form) return seeOther(`${base}/sign-in?first=${refusal.code}`);
    return Response.json({ error: refusal.error }, { status: refusal.status });
  }
  const cookie = sessionCookieHeader(ctx, req, result.sessionToken);
  if (form) return seeOther(base || "/", { "set-cookie": cookie });
  return Response.json({ reader: result.reader }, { headers: { "set-cookie": cookie, "cache-control": "no-store" } });
}
