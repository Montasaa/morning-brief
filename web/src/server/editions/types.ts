// TypeScript view of an Edition v3 document. The contract itself is
// schema/edition.v3.schema.json at the repository root; keep the two in step.

export type SourceType = "independent" | "wire" | "social" | "official";
export type ItemStatus = "new" | "updated" | "";
export type ImageKind = "photo" | "card" | "none";

export interface Source {
  title: string;
  url: string;
  type: SourceType;
}

/** The fields every Item has a column for. Everything else is a kind-specific extra. */
export interface EditionItemCore {
  id: string;
  topics: string[];
  thread_id?: string;
  status?: ItemStatus;
  time: string;
  title: string;
  title_ar?: string;
  summary: string;
  summary_ar?: string;
  sources: Source[];
  image?: string;
  /** What the picture is (rework ticket 10). Missing: photo when there is an image, else none. */
  image_kind?: ImageKind;
  /** Adult Trending only: explicit media, blurred until tapped whatever the blur switch says. */
  nsfw_media?: boolean;
  warning?: string;
  warning_ar?: string;
  /** The named person a claim is about. Used by the gathering tool; the app ignores it (not stored). */
  claim_subject?: string;
}

/** Kind-specific extras carried over from v2 (AI, games, trending, Liverpool, markets, social) and voices. */
export type ItemExtras = Record<string, unknown>;

export type EditionItem = EditionItemCore & ItemExtras;

export interface EditionThread {
  id: string;
  title: string;
  title_ar: string;
}

export interface EditionWidgets {
  next_match?: { team: string; opponent: string; competition: string; kickoff: string; venue?: string };
  countdowns?: { label: string; label_ar: string; at: string; topic: string }[];
}

export interface EditionDocument {
  edition_id: string;
  kind: "morning" | "evening";
  generated_at: string;
  items: EditionItem[];
  threads: EditionThread[];
  widgets: EditionWidgets;
  top_stories?: string[];
}

export const CORE_ITEM_FIELDS = [
  "id",
  "topics",
  "thread_id",
  "status",
  "time",
  "title",
  "title_ar",
  "summary",
  "summary_ar",
  "sources",
  "image",
  "image_kind",
  "nsfw_media",
  "warning",
  "warning_ar",
] as const satisfies readonly (keyof EditionItemCore)[];

/** Item fields the app accepts but does not keep: they are for the gathering side only. */
export const IGNORED_ITEM_FIELDS = ["claim_subject"] as const satisfies readonly (keyof EditionItemCore)[];

/** How an Item's picture is shown: its `image_kind`, else photo when it has an image; never more than none without one. */
export function imageKindOf(item: { image: string | null; image_kind: ImageKind | null }): ImageKind {
  if (!item.image) return "none";
  return item.image_kind ?? "photo";
}
