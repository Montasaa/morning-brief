// Legacy importer, part 1: convert a v2 / rev 2.x brief.json (the Glance
// dashboard's file, schema/brief.v2.schema.json) into an Edition v3 document.
// Pure: it never touches the database. ./import.ts sends the result through
// Edition ingest.
//
// What carries over:
// - Every Item, with its Arabic fields and kind-specific extras (any field the
//   Edition v3 Item has). Its v2 `section` becomes its Topics (./topics.ts).
// - Edition-level `top_stories` ({section, id} refs) become Item ids, kept as
//   the fallback tops. Refs that point at no Item are dropped.
// - A sensitive section's `warning` fills in for an Item that has none.
// - Pictures are graded (rework ticket 10): `image_kind: "card"` for the known
//   card hosts (CARD_HOSTS: GitHub Open Graph cards, Hugging Face thumbnails,
//   Google Cloud Storage model cards), `photo` for any other image. An Item
//   with no image is left ungraded (it reads as `none`).
// - Each title's first letter is capitalised (the v2 pipeline often wrote them
//   in lowercase). Proper nouns stay as v2 wrote them, and a first word with a
//   capital inside it ("iPhone", "eBay") is left alone.
// - The Edition id and kind come from `generated_at` in Asia/Riyadh:
//   2026-11-14T06:08+03:00 is 2026-11-14-morning, 19:15 the evening one.
//
// What does not (v3 has no place for it yet): section `what_changed` lines,
// `watch` videos (an open question in the spec), and file-level `version`,
// `sample`, `schema_rev` and `timezone`.
import editionSchema from "../../../../schema/edition.v3.schema.json";
import type { EditionDocument, EditionItem, ImageKind } from "../editions/types";
import { topicsForLegacyItem } from "./topics";

export type Conversion = { ok: true; edition: EditionDocument } | { ok: false; reasons: string[] };

/** Fields an Edition v3 Item can carry, read from the contract itself. */
const V3_ITEM_FIELDS = new Set(Object.keys(editionSchema.$defs.item.properties));
/** Fields the converter sets itself rather than copying. */
const DERIVED_FIELDS = new Set(["id", "topics", "thread_id"]);
const SENSITIVE_SECTIONS = new Set(["graphic", "adult_trending"]);
const RIYADH_OFFSET_MS = 3 * 60 * 60 * 1000;

type Json = Record<string, unknown>;

export function convertLegacyBrief(doc: unknown): Conversion {
  const reasons: string[] = [];
  if (!isObject(doc)) return { ok: false, reasons: ["/: a legacy brief.json must be a JSON object"] };
  if (doc.version !== 2) reasons.push(`/version: expected 2 (a v2 brief.json), got ${JSON.stringify(doc.version)}`);
  const generatedAt = typeof doc.generated_at === "string" ? riyadhTime(doc.generated_at) : null;
  if (!generatedAt) reasons.push("/generated_at: must be an RFC 3339 date-time");
  if (!isObject(doc.sections)) reasons.push("/sections: must be an object of sections");
  if (reasons.length || !generatedAt || !isObject(doc.sections)) return { ok: false, reasons };

  const items: EditionItem[] = [];
  for (const [section, body] of Object.entries(doc.sections)) {
    const where = `/sections/${section}`;
    if (!isObject(body)) {
      reasons.push(`${where}: must be an object`);
      continue;
    }
    const list = body.items ?? [];
    if (!Array.isArray(list)) {
      reasons.push(`${where}/items: must be an array`);
      continue;
    }
    list.forEach((raw, i) => {
      if (!isObject(raw)) return reasons.push(`${where}/items/${i}: must be an object`);
      const topics = topicsForLegacyItem(section, raw);
      if (!topics) return reasons.push(`${where}: unknown v2 section "${section}"`);
      items.push(convertItem(raw, topics, section, body));
    });
  }
  if (reasons.length) return { ok: false, reasons: [...new Set(reasons)] };

  const edition: EditionDocument = {
    edition_id: `${generatedAt.date}-${generatedAt.kind}`,
    kind: generatedAt.kind,
    generated_at: generatedAt.iso,
    items,
    threads: [],
    widgets: {},
  };
  const tops = topStories(doc.top_stories, new Set(items.map((i) => i.id)));
  if (tops.length) edition.top_stories = tops;
  return { ok: true, edition };
}

function convertItem(raw: Json, topics: string[], section: string, body: Json): EditionItem {
  const item: Json = { id: legacyId(raw.id), topics };
  for (const [key, value] of Object.entries(raw)) {
    if (!V3_ITEM_FIELDS.has(key) || DERIVED_FIELDS.has(key)) continue;
    // v3 text fields must be non-empty; an empty optional v2 field carries nothing.
    if (key !== "status" && (value === null || value === "" || (Array.isArray(value) && !value.length))) continue;
    item[key] = withAsciiUrls(key, joinedText(key, value));
  }
  if (SENSITIVE_SECTIONS.has(section)) {
    if (item.warning === undefined && nonEmpty(body.warning)) item.warning = body.warning;
    if (item.warning_ar === undefined && nonEmpty(body.warning_ar)) item.warning_ar = body.warning_ar;
  }
  if (typeof item.title === "string") item.title = capitaliseFirstLetter(item.title);
  const kind = imageKind(item.image);
  if (kind) item.image_kind = kind;
  return item as unknown as EditionItem;
}

/**
 * Hosts whose pictures are logos or Open Graph cards, not photos: GitHub's
 * Open Graph cards and repository social previews, Hugging Face thumbnails,
 * and model cards on Google Cloud Storage.
 */
const CARD_HOSTS = [
  "opengraph.githubassets.com",
  "repository-images.githubusercontent.com",
  "cdn-thumbnails.huggingface.co",
  "huggingface.co",
  "storage.googleapis.com",
];

/** `card` for a picture on a known card host, `photo` for any other picture, nothing without one. */
function imageKind(image: unknown): ImageKind | undefined {
  if (typeof image !== "string") return undefined;
  let host: string;
  try {
    host = new URL(image).hostname.toLowerCase();
  } catch {
    return "photo"; // not a URL at all: ingest validation reports it
  }
  return CARD_HOSTS.includes(host) ? "card" : "photo";
}

/**
 * The title with its first letter in capitals: the first letter or digit after any opening quotes or
 * brackets ("4 killed" stays as it is). A first word that already has a capital inside ("iPhone") is left alone.
 */
export function capitaliseFirstLetter(title: string): string {
  const at = title.search(/[\p{L}\p{N}]/u);
  if (at < 0 || !/\p{L}/u.test(title.charAt(at))) return title;
  const word = title.slice(at).split(/\s/u)[0]!;
  if (/\p{Lu}/u.test(word.slice(1))) return title;
  return title.slice(0, at) + title.charAt(at).toUpperCase() + title.slice(at + 1);
}

const URL_FIELDS = new Set(["image", "try_url", "store_url"]);
const SUMMARY_FIELDS = new Set(["summary", "summary_ar"]);

/**
 * The old pipeline has written a summary as a list of sentences (2026-11-15
 * morning). v3 wants one text, so a list of strings is joined with spaces.
 */
function joinedText(key: string, value: unknown): unknown {
  if (SUMMARY_FIELDS.has(key) && Array.isArray(value) && value.every((v) => typeof v === "string")) {
    return value.map((v) => v.trim()).filter(Boolean).join(" ");
  }
  return value;
}

/**
 * v2 links may hold raw non-ASCII text (a TikTok tag such as /tag/مطر), which
 * the v3 `uri` format refuses. Percent-encoding them gives the same link.
 */
function withAsciiUrls(key: string, value: unknown): unknown {
  if (URL_FIELDS.has(key)) return asciiUrl(value);
  if ((key === "sources" || key === "voices") && Array.isArray(value)) {
    return value.map((entry) => (isObject(entry) && "url" in entry ? { ...entry, url: asciiUrl(entry.url) } : entry));
  }
  return value;
}

function asciiUrl(value: unknown): unknown {
  if (typeof value !== "string" || !/[^\x21-\x7e]/.test(value)) return value;
  try {
    return new URL(value.trim()).href;
  } catch {
    return value; // not a URL at all: ingest validation reports it
  }
}

/** v2 ids are already slugs; anything else is lower-cased into one, the same way everywhere. */
function legacyId(id: unknown): string {
  return String(id ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9.-]+/g, "-")
    .replace(/^[^a-z0-9]+/, "");
}

function topStories(refs: unknown, itemIds: Set<string>): string[] {
  if (!Array.isArray(refs)) return [];
  const ids = refs
    .map((ref) => (isObject(ref) ? legacyId(ref.id) : typeof ref === "string" ? legacyId(ref) : ""))
    .filter((id) => itemIds.has(id));
  return [...new Set(ids)].slice(0, 3);
}

/** The run's date, kind and +03:00 timestamp, as Asia/Riyadh (UTC+3, no daylight saving) sees it. */
function riyadhTime(value: string): { iso: string; date: string; kind: "morning" | "evening" } | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/i.test(value)) return null;
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) return null;
  const local = new Date(ms + RIYADH_OFFSET_MS).toISOString(); // 2026-11-14T06:08:24.000Z, in Riyadh
  const iso = value.endsWith("+03:00") ? value : `${local.slice(0, 19)}+03:00`;
  const hour = Number(local.slice(11, 13));
  return { iso, date: local.slice(0, 10), kind: hour < 12 ? "morning" : "evening" };
}

function isObject(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}
