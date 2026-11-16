// POST /api/invites/{id}/password {password}: the Owner resets the password of
// the Reader an accepted Invite became. Their devices are signed out and the
// new password works at once (Owner only).
import { ownerAccess } from "@/server/access";
import { getAppContext } from "@/server/app";
import { resetReaderPassword, type ResetPasswordResult } from "@/server/readers/invites";

export const dynamic = "force-dynamic";

type Refusal = Extract<ResetPasswordResult, { ok: false }>["reason"];

const REFUSALS: Record<Refusal, { status: number; error: string }> = {
  "not-found": { status: 404, error: "No such Invite." },
  "not-a-reader": { status: 409, error: "Only an active Reader's password can be reset." },
  "too-short": { status: 400, error: "Use at least 8 characters for the password." },
  "too-long": { status: 400, error: "Use at most 200 characters for the password." },
};

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const ctx = getAppContext();
  const access = ownerAccess(ctx, req);
  if (!access.ok) return access.response;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Body is not valid JSON" }, { status: 400 });
  }
  const { id } = await params;
  const password = body && typeof body === "object" ? (body as { password?: unknown }).password : undefined;
  const result = /^\d+$/.test(id) ? await resetReaderPassword(ctx, Number(id), password) : ({ ok: false, reason: "not-found" } as const);
  if (!result.ok) {
    const refusal = REFUSALS[result.reason];
    return Response.json({ error: refusal.error, reason: result.reason }, { status: refusal.status });
  }
  return Response.json({ invite: result.invite });
}
