// GET /api/topics: the Catalog for the signed-in Reader (the starting Topics,
// shared ones, and their own private ones), each Topic marked with whether they
// follow it, whether it is private and whether they created it.
// POST /api/topics {name, note?, name_ar?}: create a private Topic (ticket 11).
// Claude drafts its Gathering Rules and the creator follows it. 201 {topic};
// 409 {error, limit} at the cap of 10 created Topics, or {error, topic} when a
// Topic of that name is already in their Catalog; 422 {error, reasons}.
import { readerAccess } from "@/server/access";
import { getAppContext } from "@/server/app";
import { listCatalog } from "@/server/topics/catalog";
import { createTopic } from "@/server/topics/reader-topics";

export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  const ctx = getAppContext();
  const access = readerAccess(ctx, req);
  if (!access.ok) return access.response;
  return Response.json({ topics: listCatalog(ctx, access.reader.id) });
}

export async function POST(req: Request): Promise<Response> {
  const ctx = getAppContext();
  const access = readerAccess(ctx, req);
  if (!access.ok) return access.response;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Body is not valid JSON", reasons: ["Body is not valid JSON."] }, { status: 422 });
  }
  const result = await createTopic(ctx, access.reader, body);
  if (!result.ok) {
    const { ok: _ok, status, ...error } = result;
    return Response.json(error, { status });
  }
  return Response.json({ topic: result.topic }, { status: 201 });
}
