// GET /api/threads: the Threads tab. The Story Threads the signed-in Reader
// follows, then the other active ones (carried by the latest Edition).
import { readerAccess } from "@/server/access";
import { getAppContext } from "@/server/app";
import { listThreads } from "@/server/threads/threads";

export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  const ctx = getAppContext();
  const access = readerAccess(ctx, req);
  if (!access.ok) return access.response;
  return Response.json({ threads: listThreads(ctx, access.reader.id) });
}
