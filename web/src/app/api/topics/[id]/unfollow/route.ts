// POST /api/topics/{id}/unfollow: the signed-in Reader stops following a Topic.
// Its Items leave their next Brief. Unfollowing twice changes nothing.
import { readerAccess } from "@/server/access";
import { getAppContext } from "@/server/app";
import { unfollowTopic } from "@/server/topics/catalog";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const ctx = getAppContext();
  const access = readerAccess(ctx, req);
  if (!access.ok) return access.response;
  const topic = unfollowTopic(ctx, access.reader.id, (await params).id);
  if (!topic) return Response.json({ error: "No such Topic in the Catalog." }, { status: 404 });
  return Response.json({ topic });
}
