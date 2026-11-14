// PATCH /api/topics/{id}/rules {rules}: the Owner replaces any Topic's
// Gathering Rules, private Topics included. The next gathering run uses them.
// 404 for an unknown Topic, 422 for empty or over-long rules.
import { ownerAccess } from "@/server/access";
import { getAppContext } from "@/server/app";
import { setGatheringRules } from "@/server/topics/gathering-rules";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const ctx = getAppContext();
  const access = ownerAccess(ctx, req);
  if (!access.ok) return access.response;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Body is not valid JSON" }, { status: 422 });
  }
  const result = setGatheringRules(ctx, (await params).id, body);
  if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
  return Response.json({ topic: result.topic });
}
