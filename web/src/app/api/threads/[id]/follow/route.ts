// POST /api/threads/{id}/follow: the signed-in Reader follows a Story Thread.
// Saying it twice changes nothing. 404 for a Thread they cannot see.
import { readerAccess } from "@/server/access";
import { getAppContext } from "@/server/app";
import { followThread } from "@/server/threads/threads";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const ctx = getAppContext();
  const access = readerAccess(ctx, req);
  if (!access.ok) return access.response;
  const thread = followThread(ctx, access.reader.id, (await params).id);
  if (!thread) return Response.json({ error: "No such Story Thread." }, { status: 404 });
  return Response.json({ thread });
}
