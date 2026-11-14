// GET /api/owner/health: the latest Edition's time and Item count, and the
// ingests refused recently with their reasons. Owner only.
import { ownerAccess } from "@/server/access";
import { getAppContext } from "@/server/app";
import { ingestHealth } from "@/server/owner/health";

export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  const ctx = getAppContext();
  const access = ownerAccess(ctx, req);
  if (!access.ok) return access.response;
  return Response.json(ingestHealth(ctx));
}
