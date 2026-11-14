// GET /api/topics: the Catalog.
// Open until ticket 06 adds sessions; ticket 07 adds each Reader's follows.
import { getAppContext } from "@/server/app";
import { listCatalog } from "@/server/topics/catalog";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  return Response.json({ topics: listCatalog(getAppContext()) });
}
