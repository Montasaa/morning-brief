// POST /api/editions: the gathering side posts one Edition v3 document.
import { getAppContext } from "@/server/app";
import { pickTopStories } from "@/server/brief/top-picker";
import { ingestEdition } from "@/server/editions/ingest";
import { recordIngestRejection } from "@/server/owner/health";
import { hasPipelineToken } from "@/server/pipeline-auth";

export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  const ctx = getAppContext();
  if (!hasPipelineToken(req, ctx.config)) {
    return Response.json({ accepted: false, reasons: ["Missing or wrong bearer token"] }, { status: 401 });
  }

  let doc: unknown;
  try {
    doc = await req.json();
  } catch {
    const reasons = ["Body is not valid JSON"];
    recordIngestRejection(ctx, { endpoint: "/api/editions", doc: null, reasons });
    return Response.json({ accepted: false, reasons }, { status: 400 });
  }

  const result = ingestEdition(ctx, doc);
  if (!result.accepted) recordIngestRejection(ctx, { endpoint: "/api/editions", doc, reasons: result.reasons });
  // Then every Reader's top stories (ticket 13), before answering, so the Briefs are ready when it returns.
  if (result.accepted) await pickTopStories(ctx, result.edition_id);
  return Response.json(result, { status: result.accepted ? 200 : 422 });
}
