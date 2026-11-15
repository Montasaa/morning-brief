// Legacy importer, part 2: a converted brief.json goes through Edition ingest
// like any other Edition (validated, all-or-nothing, idempotent). The importer
// never writes to the database itself.
import type { AppContext } from "../app";
import { ingestEdition, type IngestResult } from "../editions/ingest";
import type { EditionDocument } from "../editions/types";
import { validateEdition } from "../editions/validate";
import { convertLegacyBrief } from "./convert";

export type DryRunResult = { accepted: true; edition: EditionDocument } | { accepted: false; reasons: string[] };

/** Converts a v2 brief.json and ingests the Edition. */
export function importLegacyBrief(ctx: AppContext, doc: unknown): IngestResult {
  const conversion = convertLegacyBrief(doc);
  if (!conversion.ok) return { accepted: false, reasons: conversion.reasons };
  return ingestEdition(ctx, conversion.edition);
}

/** Converts and validates as an import would, but stores nothing: returns the Edition v3 document. */
export function previewLegacyBrief(doc: unknown): DryRunResult {
  const conversion = convertLegacyBrief(doc);
  if (!conversion.ok) return { accepted: false, reasons: conversion.reasons };
  const validation = validateEdition(conversion.edition);
  if (!validation.ok) return { accepted: false, reasons: validation.reasons };
  return { accepted: true, edition: validation.edition };
}
