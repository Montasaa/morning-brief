// GET /api/auth/session: the Reader signed in on this device (401 if none).
import { readerAccess } from "@/server/access";
import { getAppContext } from "@/server/app";

export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  const access = readerAccess(getAppContext(), req);
  if (!access.ok) return access.response;
  return Response.json({ reader: access.reader });
}
