// POST /api/editions/legacy: the Owner imports a v2 / rev 2.x brief.json as an
// Edition. It is converted to Edition v3 and sent through Edition ingest, so
// the response is the ingest result. With ?dry_run=1 nothing is stored and the
// response is the converted Edition v3 document instead ({accepted, edition}).
// A pipeline route: needs the bearer token.
import { getAppContext } from "@/server/app";
import { pickTopStories } from "@/server/brief/top-picker";
import { importLegacyBrief, previewLegacyBrief } from "@/server/legacy/import";
import { recordIngestRejection } from "@/server/owner/health";
import { sendEditionPushes } from "@/server/push/edition-pushes";
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
    recordIngestRejection(ctx, { endpoint: "/api/editions/legacy", doc: null, reasons });
    return Response.json({ accepted: false, reasons }, { status: 400 });
  }

  const dryRun = new URL(req.url).searchParams.get("dry_run") === "1";
  const result = dryRun ? previewLegacyBrief(doc) : importLegacyBrief(ctx, doc);
  // A dry run stores nothing, so its refusal is not an ingest the Owner needs to see.
  if (!dryRun && !result.accepted) {
    recordIngestRejection(ctx, { endpoint: "/api/editions/legacy", doc, reasons: result.reasons });
  }
  // Like any ingest, then every Reader's top stories (ticket 13).
  if (!dryRun && result.accepted && "edition_id" in result) await pickTopStories(ctx, result.edition_id);
  // And its pushes (ticket 18).
  if (!dryRun && result.accepted && "edition_id" in result) await sendEditionPushes(ctx, result.edition_id);
  return Response.json(result, { status: result.accepted ? 200 : 422 });
}
