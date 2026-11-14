// POST /api/topics/{id}/follow: the signed-in Reader follows a Catalog Topic.
// Their next Brief covers it. Following twice changes nothing.
import { readerAccess } from "@/server/access";
import { getAppContext } from "@/server/app";
import { followTopic } from "@/server/topics/catalog";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const ctx = getAppContext();
  const access = readerAccess(ctx, req);
  if (!access.ok) return access.response;
  const topic = followTopic(ctx, access.reader.id, (await params).id);
  if (!topic) return Response.json({ error: "No such Topic in the Catalog." }, { status: 404 });
  return Response.json({ topic });
}
