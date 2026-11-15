// A Reader's Display (rework ticket 07, spec #6): how their Brief looks and is
// arranged. It is theirs alone and follows them to every device: one document
// per Reader in `displays` (migrations/t07_reader_displays.sql), read with
// GET /api/me and changed with PATCH /api/me {display} (see readers/profile.ts,
// which calls checkDisplayPatch and writeDisplay inside its all-or-nothing
// update).
//
// The document stores only the keys the Reader set; the rest read as
// DEFAULT_DISPLAY. Display never affects ranking: the Scorer and the top picker
// must not read it. It only decides where groups sit and how they look.
import type { AppContext } from "../app";
import { unknownTopicIds } from "../topics/catalog";
import { isSensitiveTopic } from "../topics/sensitive";
import type { Widget } from "../widgets";
import {
  ACCENTS,
  DEFAULT_DISPLAY,
  DENSITIES,
  DISPLAY_KEYS,
  DOCK_BUTTONS,
  DOCK_MAX,
  LAYOUTS,
  mergeLayouts,
  SCREEN_CLASSES,
  TEXT_SIZES,
  THEMES,
  WIDGET_KEYS,
  type Display,
  type Layout,
  type LayoutPicks,
  type ScreenClass,
  type WidgetKey,
} from "./shape";

// WIDGET_KEYS must name exactly the Widget kinds: a new kind fails the typecheck here until it is added.
type SameKinds<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const widgetKeysMatchWidgetKinds: SameKinds<WidgetKey, Widget["kind"]> = true;
void widgetKeysMatchWidgetKinds;

type Stored = Partial<Display>;

/** The Reader's Display, every key filled in (defaults for what they never set). */
export function getDisplay(ctx: AppContext, readerId: number): Display {
  return withDefaults(readStored(ctx, readerId));
}

function readStored(ctx: AppContext, readerId: number): Stored {
  const json = ctx.db.prepare("SELECT doc FROM displays WHERE reader_id = ?").pluck().get(readerId) as string | undefined;
  return json ? (JSON.parse(json) as Stored) : {};
}

function withDefaults(stored: Stored): Display {
  const display = structuredClone(DEFAULT_DISPLAY);
  for (const key of DISPLAY_KEYS) {
    if (stored[key] !== undefined) (display as unknown as Record<string, unknown>)[key] = stored[key];
  }
  return display;
}

/** A checked change: the keys to set, the keys to put back to their default, and new Layout picks (null takes one back). */
export interface CheckedDisplayPatch {
  set: Stored;
  reset: (keyof Display)[];
  layouts: LayoutPicks | null;
}

/**
 * Check `display` from PATCH /api/me. `followedAfter` is what the Reader will
 * follow once the whole request is applied (a request may change `topics` too):
 * `unblurred` takes only Sensitive Topics among those. Lists are de-duplicated,
 * keeping the first of each.
 */
export function checkDisplayPatch(
  ctx: AppContext,
  readerId: number,
  display: unknown,
  followedAfter: readonly string[],
): { ok: true; patch: CheckedDisplayPatch } | { ok: false; reasons: string[] } {
  if (typeof display !== "object" || display === null || Array.isArray(display)) {
    return { ok: false, reasons: ['display must be an object such as {"theme": "dark"}.'] };
  }
  const reasons: string[] = [];
  const patch: CheckedDisplayPatch = { set: {}, reset: [], layouts: null };
  const set = patch.set as Record<string, unknown>;

  const oneOf = (key: keyof Display, value: unknown, options: readonly string[]) => {
    if (typeof value === "string" && options.includes(value)) set[key] = value;
    else reasons.push(`display.${key} must be one of ${options.join(", ")}.`);
  };
  const list = (key: keyof Display, value: unknown, what: string): string[] | null => {
    if (!Array.isArray(value) || !value.every((v) => typeof v === "string")) {
      reasons.push(`display.${key} must be a list of ${what}.`);
      return null;
    }
    return [...new Set(value as string[])];
  };
  /** Set `key` to the list if every entry is allowed; otherwise one reason per entry that is not. */
  const allowedList = (key: keyof Display, ids: string[], allowed: (id: string) => boolean, why: (id: string) => string) => {
    const bad = ids.filter((id) => !allowed(id));
    for (const id of bad) reasons.push(`display.${key}: "${id}" ${why(id)}.`);
    if (bad.length === 0) set[key] = ids;
  };
  const topics = (key: keyof Display, value: unknown) => {
    const ids = list(key, value, "Topic ids");
    if (!ids) return;
    const unknown = unknownTopicIds(ctx, ids, readerId);
    for (const id of unknown) reasons.push(`display.${key}: "${id}" is not a Topic in the Catalog.`);
    if (unknown.length === 0) set[key] = ids;
  };

  for (const [key, value] of Object.entries(display)) {
    if (!(DISPLAY_KEYS as string[]).includes(key)) {
      reasons.push(`Unknown display key "${key}".`);
      continue;
    }
    const k = key as keyof Display;
    if (value === null) {
      patch.reset.push(k);
      continue;
    }
    switch (k) {
      case "layouts":
        patch.layouts = checkLayouts(value, reasons);
        break;
      case "theme":
        oneOf(k, value, THEMES);
        break;
      case "accent":
        oneOf(k, value, ACCENTS);
        break;
      case "text_size":
        oneOf(k, value, TEXT_SIZES);
        break;
      case "density":
        oneOf(k, value, DENSITIES);
        break;
      case "topic_order":
      case "pinned":
      case "collapsed":
        topics(k, value);
        break;
      case "widgets": {
        const keys = list(k, value, "Widget kinds");
        if (keys) {
          allowedList(k, keys, (w) => (WIDGET_KEYS as readonly string[]).includes(w), () => `is not a Widget (${WIDGET_KEYS.join(", ")})`);
        }
        break;
      }
      case "dock": {
        if (Array.isArray(value) && (value.length === 0 || value.length > DOCK_MAX)) {
          reasons.push(`display.dock must have 1 to ${DOCK_MAX} buttons.`);
          break;
        }
        const buttons = list(k, value, "dock buttons");
        if (buttons) {
          allowedList(k, buttons, (b) => (DOCK_BUTTONS as readonly string[]).includes(b), () => `is not a dock button (${DOCK_BUTTONS.join(", ")})`);
        }
        break;
      }
      case "unblurred": {
        const ids = list(k, value, "Topic ids");
        if (ids) {
          const optedIn = new Set(followedAfter.filter((id) => isSensitiveTopic(ctx, id)));
          allowedList(k, ids, (id) => optedIn.has(id), () => "is not a Sensitive Topic you opted into");
        }
        break;
      }
    }
  }
  return reasons.length ? { ok: false, reasons } : { ok: true, patch };
}

function checkLayouts(value: unknown, reasons: string[]): CheckedDisplayPatch["layouts"] {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    reasons.push('display.layouts must be an object such as {"pc": "list"}.');
    return null;
  }
  const picks: LayoutPicks = {};
  for (const [screen, layout] of Object.entries(value)) {
    if (!(SCREEN_CLASSES as readonly string[]).includes(screen)) {
      reasons.push(`Unknown screen class "${screen}" in display.layouts (${SCREEN_CLASSES.join(", ")}).`);
    } else if (layout !== null && !(LAYOUTS as readonly unknown[]).includes(layout)) {
      reasons.push(`display.layouts.${screen} must be one of ${LAYOUTS.join(", ")}, or null.`);
    } else {
      picks[screen as ScreenClass] = layout as Layout | null;
    }
  }
  return picks;
}

/** Apply a checked change to the Reader's stored Display. Call inside the caller's transaction. */
export function writeDisplay(ctx: AppContext, readerId: number, patch: CheckedDisplayPatch): void {
  const stored: Stored = { ...readStored(ctx, readerId), ...patch.set };
  for (const key of patch.reset) delete stored[key];
  if (patch.layouts) stored.layouts = mergeLayouts(stored.layouts, patch.layouts);
  ctx.db
    .prepare(
      `INSERT INTO displays (reader_id, doc, updated_at_ms) VALUES (?, ?, ?)
       ON CONFLICT (reader_id) DO UPDATE SET doc = excluded.doc, updated_at_ms = excluded.updated_at_ms`,
    )
    .run(readerId, JSON.stringify(stored), Date.now());
}
