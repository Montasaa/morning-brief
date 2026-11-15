// POST /api/me/topic-suggestions {note}: Claude suggests Catalog Topics for the
// signed-in Reader from a line they wrote about themselves (ticket 12). Never
// Sensitive Topics, never ones they already follow. Suggesting changes nothing;
// accepting one is POST /api/topics/{id}/follow. When Claude fails the answer
// is still 200, with no suggestions and `unavailable: true`. 422 for a missing,
// empty or too long note.
import { readerAccess } from "@/server/access";
import { getAppContext } from "@/server/app";
import { parseSuggestionRequest, suggestTopics } from "@/server/topics/suggestions";

export const dynamic = "force-dynamic";

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
  const parsed = parseSuggestionRequest(body);
  if (!parsed.ok) return Response.json({ error: parsed.error, reasons: parsed.reasons }, { status: 422 });
  return Response.json(await suggestTopics(ctx, access.reader, parsed.note));
}
