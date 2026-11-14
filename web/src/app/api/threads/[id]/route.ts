// GET /api/threads/{id}: a Story Thread's dated timeline (its Items across
// every Edition, newest first), as the signed-in Reader may see it.
import { readerAccess } from "@/server/access";
import { getAppContext } from "@/server/app";
import { threadTimeline } from "@/server/threads/threads";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const ctx = getAppContext();
  const access = readerAccess(ctx, req);
  if (!access.ok) return access.response;
  const timeline = threadTimeline(ctx, access.reader.id, (await params).id);
  if (!timeline) return Response.json({ error: "No such Story Thread." }, { status: 404 });
  return Response.json(timeline);
}
