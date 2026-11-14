// DELETE /api/invites/{id}: revoke an Invite (Owner only). Revoking an accepted
// Invite revokes its Reader too: they are signed out everywhere and cannot sign in.
import { ownerAccess } from "@/server/access";
import { getAppContext } from "@/server/app";
import { revokeInvite } from "@/server/readers/invites";

export const dynamic = "force-dynamic";

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const ctx = getAppContext();
  const access = ownerAccess(ctx, req);
  if (!access.ok) return access.response;
  const { id } = await params;
  const invite = /^\d+$/.test(id) ? revokeInvite(ctx, Number(id)) : null;
  if (!invite) return Response.json({ error: "No such Invite." }, { status: 404 });
  return Response.json({ invite });
}
