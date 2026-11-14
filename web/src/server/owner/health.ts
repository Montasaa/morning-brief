// Ingest health for the Owner (ticket 10): the latest Edition (its time and
// Item count) and the ingests the app refused recently, with their reasons.
//
// The pipeline routes record a rejection with `recordIngestRejection` whenever
// they refuse a document from a caller holding the pipeline token. Calls
// without the token are never recorded, so nobody outside can fill the list.
import type { AppContext } from "../app";

/** How many rejections the console lists. */
export const RECENT_REJECTIONS = 20;
/** How many are kept at all; older ones are dropped as new ones come in. */
const KEPT_REJECTIONS = 200;
const MAX_REASONS = 50;
const MAX_TEXT = 500;

export interface LatestEdition {
  edition_id: string;
  kind: "morning" | "evening";
  /** When the gathering run made it (RFC 3339, as the Edition gave it). */
  generated_at: string;
  /** When the app accepted it (RFC 3339, UTC). */
  received_at: string;
  /** Items the Edition carried. */
  items: number;
}

export interface IngestRejection {
  /** When the app refused it (RFC 3339, UTC). */
  received_at: string;
  endpoint: string;
  /** The document's edition_id, when it had one. */
  edition_id: string | null;
  reasons: string[];
}

export interface IngestHealth {
  latest_edition: LatestEdition | null;
  /** Newest first. */
  rejections: IngestRejection[];
}

const clip = (s: string) => (s.length > MAX_TEXT ? `${s.slice(0, MAX_TEXT - 1)}…` : s);

/** Record a refused ingest: what was posted where, and why it was refused. */
export function recordIngestRejection(
  ctx: AppContext,
  rejection: { endpoint: string; doc: unknown; reasons: string[] },
): void {
  const doc = rejection.doc;
  const editionId =
    typeof doc === "object" && doc !== null && typeof (doc as { edition_id?: unknown }).edition_id === "string"
      ? clip((doc as { edition_id: string }).edition_id)
      : null;
  const reasons = rejection.reasons.slice(0, MAX_REASONS).map(clip);
  if (rejection.reasons.length > MAX_REASONS) reasons.push(`…and ${rejection.reasons.length - MAX_REASONS} more`);

  const { db } = ctx;
  db.transaction(() => {
    db.prepare(
      "INSERT INTO ingest_rejections (received_at_ms, endpoint, edition_id, reasons) VALUES (?, ?, ?, ?)",
    ).run(Date.now(), rejection.endpoint, editionId, JSON.stringify(reasons));
    db.prepare(
      `DELETE FROM ingest_rejections WHERE id NOT IN (
         SELECT id FROM ingest_rejections ORDER BY received_at_ms DESC, id DESC LIMIT ?)`,
    ).run(KEPT_REJECTIONS);
  })();
}

/** The latest Edition (the one Briefs are built from) and the recent rejections. */
export function ingestHealth(ctx: AppContext): IngestHealth {
  const { db } = ctx;
  const latest = db
    .prepare(
      `SELECT e.id AS edition_id, e.kind, e.generated_at, e.received_at,
              (SELECT COUNT(*) FROM edition_items ei WHERE ei.edition_id = e.id) AS items
         FROM editions e
        ORDER BY e.generated_at_ms DESC, e.received_at DESC
        LIMIT 1`,
    )
    .get() as LatestEdition | undefined;

  const rejections = (
    db
      .prepare(
        `SELECT received_at_ms, endpoint, edition_id, reasons FROM ingest_rejections
          ORDER BY received_at_ms DESC, id DESC LIMIT ?`,
      )
      .all(RECENT_REJECTIONS) as { received_at_ms: number; endpoint: string; edition_id: string | null; reasons: string }[]
  ).map((r) => ({
    received_at: new Date(r.received_at_ms).toISOString(),
    endpoint: r.endpoint,
    edition_id: r.edition_id,
    reasons: JSON.parse(r.reasons) as string[],
  }));

  return { latest_edition: latest ?? null, rejections };
}
