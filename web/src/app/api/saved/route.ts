// GET /api/saved: the signed-in Reader's saved Items, newest-saved first, with
// each one's date, Topic and Story Thread. Unsaving is
// DELETE /api/items/{id}/reactions/save.
import { readerAccess } from "@/server/access";
import { getAppContext } from "@/server/app";
import { savedItems } from "@/server/saved-search/saved";

export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  const ctx = getAppContext();
  const access = readerAccess(ctx, req);
  if (!access.ok) return access.response;
  return Response.json(savedItems(ctx, access.reader.id));
}
