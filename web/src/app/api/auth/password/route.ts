// POST /api/auth/password {current_password, new_password, confirm_password?}:
// the signed-in Reader changes their own password. This device stays signed
// in; their other devices are signed out. Me › Password posts it as a plain
// HTML form, answered with a redirect back to that page.
import { isFormPost, readerAccess, readFields, seeOther } from "@/server/access";
import { getAppContext } from "@/server/app";
import { sessionTokenFrom } from "@/server/readers/sessions";
import { changeOwnPassword, type ChangePasswordResult } from "@/server/readers/sign-in";

export const dynamic = "force-dynamic";

type Refusal = Extract<ChangePasswordResult, { ok: false }>["reason"];

const REFUSALS: Record<Refusal, { status: number; error: string; code: string }> = {
  "too-short": { status: 400, error: "Use at least 8 characters.", code: "short" },
  "too-long": { status: 400, error: "Use at most 200 characters.", code: "long" },
  mismatch: { status: 400, error: "The two new passwords don't match.", code: "mismatch" },
  "wrong-current": { status: 403, error: "Your current password is wrong.", code: "wrong" },
  "too-many-tries": { status: 429, error: "Too many tries. Wait 15 minutes, then try again.", code: "limit" },
};

export async function POST(req: Request): Promise<Response> {
  const ctx = getAppContext();
  const access = readerAccess(ctx, req);
  if (!access.ok) return access.response;
  const base = ctx.config.basePath;
  const form = isFormPost(req);
  const fields = await readFields(req);
  if (!fields) return Response.json({ error: "Body is not valid JSON" }, { status: 400 });

  const result = await changeOwnPassword(ctx, access.reader, sessionTokenFrom(req)!, {
    current: fields.current_password,
    next: fields.new_password,
    confirm: fields.confirm_password,
  });
  if (!result.ok) {
    const refusal = REFUSALS[result.reason];
    if (form) return seeOther(`${base}/me/password?error=${refusal.code}`);
    return Response.json({ error: refusal.error }, { status: refusal.status });
  }
  if (form) return seeOther(`${base}/me/password?changed=1`);
  return Response.json({ changed: true });
}
