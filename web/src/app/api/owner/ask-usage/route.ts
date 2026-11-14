// GET /api/owner/ask-usage: every Reader with their daily Ask limit and today's usage. Owner only.
import { ownerAccess } from "@/server/access";
import { getAppContext } from "@/server/app";
import { askUsage } from "@/server/ask/limits";

export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  const ctx = getAppContext();
  const access = ownerAccess(ctx, req);
  if (!access.ok) return access.response;
  return Response.json({ readers: askUsage(ctx) });
}
