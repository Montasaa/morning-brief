// GET /api/invites: every Invite with its status (Owner only).
// POST /api/invites {email}: invite someone; they are emailed a sign-in link (Owner only).
import { ownerAccess, publicOrigin } from "@/server/access";
import { getAppContext } from "@/server/app";
import { createInvite, listInvites } from "@/server/readers/invites";

export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  const ctx = getAppContext();
  const access = ownerAccess(ctx, req);
  if (!access.ok) return access.response;
  return Response.json({ invites: listInvites(ctx) });
}

const REFUSALS = {
  "invalid-email": { status: 400, error: "Enter a valid email address." },
  "already-a-reader": { status: 409, error: "This email already belongs to a Reader." },
  "already-invited": { status: 409, error: "This email already has an Invite." },
} as const;

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
  const email = body && typeof body === "object" ? (body as { email?: unknown }).email : undefined;
  const result = await createInvite(ctx, access.reader.id, email, publicOrigin(ctx, req));
  if (!result.ok) {
    const refusal = REFUSALS[result.reason];
    return Response.json({ error: refusal.error }, { status: refusal.status });
  }
  return Response.json({ invite: result.invite }, { status: 201 });
}
