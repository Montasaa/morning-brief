// PATCH /api/readers/{id}/ask-limit {daily_limit}: the Owner sets a Reader's daily Ask limit
// (a whole number, 0 to stop them asking) or null to go back to the default. Owner only.
import { ownerAccess } from "@/server/access";
import { getAppContext } from "@/server/app";
import { MAX_DAILY_ASK_LIMIT, setAskLimit } from "@/server/ask/limits";

export const dynamic = "force-dynamic";

const REFUSALS = {
  "invalid-limit": { status: 400, error: `The daily limit must be a whole number from 0 to ${MAX_DAILY_ASK_LIMIT}, or null for the default.` },
  "no-such-reader": { status: 404, error: "No such Reader." },
  "owner-has-no-limit": { status: 400, error: "The Owner has no Ask limit." },
} as const;

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const ctx = getAppContext();
  const access = ownerAccess(ctx, req);
  if (!access.ok) return access.response;
  const { id } = await params;
  if (!/^\d+$/.test(id)) return Response.json({ error: REFUSALS["no-such-reader"].error }, { status: 404 });
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Body is not valid JSON" }, { status: 400 });
  }
  const limit = body && typeof body === "object" ? (body as { daily_limit?: unknown }).daily_limit : undefined;
  const result = setAskLimit(ctx, Number(id), limit);
  if (!result.ok) {
    const refusal = REFUSALS[result.reason];
    return Response.json({ error: refusal.error }, { status: refusal.status });
  }
  return Response.json({ reader_id: result.reader_id, ask_limit: result.ask_limit });
}
