// GET /api/search?q=: search every Edition's Items in English or Arabic, for
// the signed-in Reader. Results are newest first, with each Item's date, Topic
// and Story Thread. An empty query finds nothing.
import { readerAccess } from "@/server/access";
import { getAppContext } from "@/server/app";
import { searchItems } from "@/server/saved-search/search";

export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  const ctx = getAppContext();
  const access = readerAccess(ctx, req);
  if (!access.ok) return access.response;
  const query = new URL(req.url).searchParams.get("q") ?? "";
  return Response.json(searchItems(ctx, access.reader.id, query));
}
