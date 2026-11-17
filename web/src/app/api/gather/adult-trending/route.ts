// POST /api/gather/adult-trending: one Adult Trending gathering run (issue #19).
// Reads the subreddit RSS feeds in Adult Trending's Gathering Rules and adds the
// new posts that pass the fixed limits as Items in the current Brief. Cron calls
// it every 15 minutes (deploy/gather-reddit.sh). A pipeline route: needs the
// bearer token. Always 200 with the run's report (`skipped` says why nothing ran).
import { getAppContext } from "@/server/app";
import { gatherAdultTrending } from "@/server/gathering/adult-trending";
import { hasPipelineToken } from "@/server/pipeline-auth";

export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  const ctx = getAppContext();
  if (!hasPipelineToken(req, ctx.config)) {
    return Response.json({ error: "Missing or wrong bearer token" }, { status: 401 });
  }
  return Response.json(await gatherAdultTrending(ctx), { headers: { "cache-control": "no-store" } });
}
