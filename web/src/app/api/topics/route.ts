// GET /api/topics: the Catalog, for signed-in Readers. Ticket 07 adds each Reader's follows.
import { readerAccess } from "@/server/access";
import { getAppContext } from "@/server/app";
import { listCatalog } from "@/server/topics/catalog";

export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  const ctx = getAppContext();
  const access = readerAccess(ctx, req);
  if (!access.ok) return access.response;
  return Response.json({ topics: listCatalog(ctx) });
}
