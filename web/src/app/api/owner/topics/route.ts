// GET /api/owner/topics: every Topic with its Gathering Rules, private Topics
// included, with who created it and how many Readers follow it. Owner only.
import { ownerAccess } from "@/server/access";
import { getAppContext } from "@/server/app";
import { HOUSE_SOURCE_RULES, listTopicsForOwner } from "@/server/topics/gathering-rules";

export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  const ctx = getAppContext();
  const access = ownerAccess(ctx, req);
  if (!access.ok) return access.response;
  return Response.json({ house_rules: HOUSE_SOURCE_RULES, topics: listTopicsForOwner(ctx) });
}
