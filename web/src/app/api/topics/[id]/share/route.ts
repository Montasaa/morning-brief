// POST /api/topics/{id}/share: the Reader who created a private Topic shares it
// to the Catalog, so every Reader can see and follow it. Sharing twice changes
// nothing. 404 for a Topic not in their Catalog (another Reader's private one
// included), 403 for a Topic they did not create.
import { readerAccess } from "@/server/access";
import { getAppContext } from "@/server/app";
import { shareTopic } from "@/server/topics/reader-topics";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const ctx = getAppContext();
  const access = readerAccess(ctx, req);
  if (!access.ok) return access.response;
  const result = shareTopic(ctx, access.reader, (await params).id);
  if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
  return Response.json({ topic: result.topic });
}
