// GET /api/gathering-list: what the next gathering run covers. Every Topic at
// least one Reader follows, with its Gathering Rules, plus the house source
// rules that apply to all of them. Pipeline route: bearer token, no session.
import { getAppContext } from "@/server/app";
import { hasPipelineToken } from "@/server/pipeline-auth";
import { gatheringList } from "@/server/topics/gathering-rules";

export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  const ctx = getAppContext();
  if (!hasPipelineToken(req, ctx.config)) {
    return Response.json({ error: "Missing or wrong bearer token" }, { status: 401 });
  }
  return Response.json(gatheringList(ctx), { headers: { "cache-control": "no-store" } });
}
