// POST /api/topics/{id}/follow: the signed-in Reader follows a Catalog Topic.
// Their next Brief covers it. Following twice changes nothing. For a Sensitive
// Topic this is opting in (the Me tab); Adult Trending also needs the body
// {"age_confirmed": true}, else 422 {error, reasons}.
import { readerAccess } from "@/server/access";
import { getAppContext } from "@/server/app";
import { followOrOptIn } from "@/server/topics/sensitive";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const ctx = getAppContext();
  const access = readerAccess(ctx, req);
  if (!access.ok) return access.response;
  // The body is optional: only the Adult Trending opt-in needs one.
  const body: unknown = await req.json().catch(() => null);
  const result = followOrOptIn(ctx, access.reader.id, (await params).id, body);
  if (!result.ok) {
    return Response.json(
      result.status === 404 ? { error: result.error } : { error: result.error, reasons: result.reasons },
      { status: result.status },
    );
  }
  return Response.json({ topic: result.topic });
}
