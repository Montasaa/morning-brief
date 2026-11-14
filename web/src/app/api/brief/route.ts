// GET /api/brief: the signed-in Reader's Brief built from the latest Edition.
import { readerAccess } from "@/server/access";
import { getAppContext } from "@/server/app";
import { composeBrief } from "@/server/brief/compose";

export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  const ctx = getAppContext();
  const access = readerAccess(ctx, req);
  if (!access.ok) return access.response;
  return Response.json(composeBrief(ctx, access.reader));
}
