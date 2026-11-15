// POST /api/items/{id}/reactions {kind: like|save|open|hide, reason?}: the
// signed-in Reader reacts to an Item. A hide may carry a reason
// (not_interested, already_seen, bad_source). Returns the Item's Reactions.
import { readerAccess } from "@/server/access";
import { getAppContext } from "@/server/app";
import { parseReaction, setReaction } from "@/server/reactions";
import { readerCanSeeItem } from "@/server/topics/visibility";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const ctx = getAppContext();
  const access = readerAccess(ctx, req);
  if (!access.ok) return access.response;
  const itemId = (await params).id;
  if (!readerCanSeeItem(ctx, access.reader.id, itemId)) return Response.json({ error: "No such Item." }, { status: 404 });
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Body is not valid JSON." }, { status: 422 });
  }
  const parsed = parseReaction(body);
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 422 });
  return Response.json({ item_id: itemId, reactions: setReaction(ctx, access.reader.id, itemId, parsed.reaction) });
}
