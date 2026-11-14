// POST /api/editions/legacy: the Owner imports a v2 / rev 2.x brief.json as an
// Edition. It is converted to Edition v3 and sent through Edition ingest, so
// the response is the ingest result. With ?dry_run=1 nothing is stored and the
// response is the converted Edition v3 document instead ({accepted, edition}).
// A pipeline route: needs the bearer token.
import { getAppContext } from "@/server/app";
import { pickTopStories } from "@/server/brief/top-picker";
import { importLegacyBrief, previewLegacyBrief } from "@/server/legacy/import";
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
    return Response.json({ accepted: false, reasons: ["Body is not valid JSON"] }, { status: 400 });
  }

  const dryRun = new URL(req.url).searchParams.get("dry_run") === "1";
  const result = dryRun ? previewLegacyBrief(doc) : importLegacyBrief(ctx, doc);
  // Like any ingest, then every Reader's top stories (ticket 13).
  if (!dryRun && result.accepted && "edition_id" in result) await pickTopStories(ctx, result.edition_id);
  return Response.json(result, { status: result.accepted ? 200 : 422 });
}
