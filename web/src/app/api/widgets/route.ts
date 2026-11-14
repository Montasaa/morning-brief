// GET /api/widgets: the signed-in Reader's cover-card Widgets right now:
// weather and prayer times for their city, the next match if they follow
// Liverpool, and countdowns for the Topics they follow.
import { readerAccess } from "@/server/access";
import { getAppContext } from "@/server/app";
import { readerWidgets } from "@/server/widgets";

export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  const ctx = getAppContext();
  const access = readerAccess(ctx, req);
  if (!access.ok) return access.response;
  return Response.json(await readerWidgets(ctx, access.reader));
}
