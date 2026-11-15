// GET /api/owner/reports: every Item Readers hid as a "bad source", grouped by
// Item and by source, with Reader counts (never names). Owner only.
import { ownerAccess } from "@/server/access";
import { getAppContext } from "@/server/app";
import { badSourceReports } from "@/server/owner/reports";

export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  const ctx = getAppContext();
  const access = ownerAccess(ctx, req);
  if (!access.ok) return access.response;
  return Response.json(badSourceReports(ctx));
}
