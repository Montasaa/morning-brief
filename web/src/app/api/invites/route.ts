// GET /api/invites: every Invite with its status (Owner only).
// POST /api/invites {email, password}: add a Reader with a password the Owner
// chooses (and tells them). They are a Reader at once and sign in with it (Owner only).
import { ownerAccess } from "@/server/access";
import { getAppContext } from "@/server/app";
import { createInvite, listInvites, type CreateInviteResult } from "@/server/readers/invites";

export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  const ctx = getAppContext();
  const access = ownerAccess(ctx, req);
  if (!access.ok) return access.response;
  return Response.json({ invites: listInvites(ctx) });
}

type Refusal = Extract<CreateInviteResult, { ok: false }>["reason"];

const REFUSALS: Record<Refusal, { status: number; error: string }> = {
  "invalid-email": { status: 400, error: "Enter a valid email address." },
  "too-short": { status: 400, error: "Use at least 8 characters for the password." },
  "too-long": { status: 400, error: "Use at most 200 characters for the password." },
  "already-a-reader": { status: 409, error: "This email already belongs to a Reader." },
};

export async function POST(req: Request): Promise<Response> {
  const ctx = getAppContext();
  const access = ownerAccess(ctx, req);
  if (!access.ok) return access.response;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Body is not valid JSON" }, { status: 400 });
  }
  const fields = (body && typeof body === "object" ? body : {}) as { email?: unknown; password?: unknown };
  const result = await createInvite(ctx, access.reader.id, fields.email, fields.password);
  if (!result.ok) {
    const refusal = REFUSALS[result.reason];
    return Response.json({ error: refusal.error, reason: result.reason }, { status: refusal.status });
  }
  return Response.json({ invite: result.invite }, { status: 201 });
}
