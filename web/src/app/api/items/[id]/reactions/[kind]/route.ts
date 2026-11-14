// DELETE /api/items/{id}/reactions/{kind}: the signed-in Reader undoes a Like,
// Save, open or Hide. Undoing one that was never set changes nothing.
import { readerAccess } from "@/server/access";
import { getAppContext } from "@/server/app";
import { isReactionKind, itemExists, undoReaction } from "@/server/reactions";

export const dynamic = "force-dynamic";

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string; kind: string }> },
): Promise<Response> {
  const ctx = getAppContext();
  const access = readerAccess(ctx, req);
  if (!access.ok) return access.response;
  const { id: itemId, kind } = await params;
  if (!itemExists(ctx, itemId)) return Response.json({ error: "No such Item." }, { status: 404 });
  if (!isReactionKind(kind)) return Response.json({ error: "No such kind of Reaction." }, { status: 422 });
  return Response.json({ item_id: itemId, reactions: undoReaction(ctx, access.reader.id, itemId, kind) });
}
