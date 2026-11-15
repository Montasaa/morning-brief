// Validation of an Edition v3 document: the JSON Schema (draft 2020-12, with
// format checks) first, then the cross-references the schema cannot express.
import { Ajv2020 } from "ajv/dist/2020.js";
import addFormatsModule from "ajv-formats";
import editionSchema from "../../../../schema/edition.v3.schema.json";
import type { EditionDocument } from "./types";

const addFormats = addFormatsModule as unknown as (ajv: Ajv2020) => Ajv2020;
const validateSchema = addFormats(new Ajv2020({ allErrors: true, strict: true })).compile(editionSchema);

export type Validation = { ok: true; edition: EditionDocument } | { ok: false; reasons: string[] };

export function validateEdition(doc: unknown): Validation {
  if (!validateSchema(doc)) {
    const reasons = (validateSchema.errors ?? []).map((e) => {
      const where = e.instancePath || "/";
      const extra =
        e.keyword === "additionalProperties" ? ` (${String(e.params.additionalProperty)})` : "";
      return `${where}: ${e.message ?? "is invalid"}${extra}`;
    });
    return { ok: false, reasons };
  }
  const edition = doc as unknown as EditionDocument;
  const reasons = crossReferenceProblems(edition);
  return reasons.length ? { ok: false, reasons } : { ok: true, edition };
}

function crossReferenceProblems(edition: EditionDocument): string[] {
  const reasons: string[] = [];
  const threadIds = new Set<string>();
  edition.threads.forEach((t, i) => {
    if (threadIds.has(t.id)) reasons.push(`/threads/${i}/id: duplicate Story Thread id "${t.id}"`);
    threadIds.add(t.id);
  });
  const itemIds = new Set<string>();
  edition.items.forEach((item, i) => {
    if (itemIds.has(item.id)) reasons.push(`/items/${i}/id: duplicate Item id "${item.id}"`);
    itemIds.add(item.id);
    if (item.thread_id !== undefined && !threadIds.has(item.thread_id)) {
      reasons.push(`/items/${i}/thread_id: Story Thread "${item.thread_id}" is not listed in threads`);
    }
  });
  (edition.top_stories ?? []).forEach((id, i) => {
    if (!itemIds.has(id)) reasons.push(`/top_stories/${i}: Item "${id}" is not in this Edition`);
  });
  return reasons;
}
