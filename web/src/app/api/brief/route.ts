// GET /api/brief: the Reader's Brief built from the latest Edition.
// Open until ticket 06 adds sessions; it then requires a signed-in Reader.
import { getAppContext } from "@/server/app";
import { composeBrief } from "@/server/brief/compose";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  return Response.json(composeBrief(getAppContext()));
}
