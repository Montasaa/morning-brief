// The shape of a Reader's Display (spec #6, "Display"): the choices it holds,
// their defaults, and nothing else. No server imports, so client components
// import it too (the Me › Display screen lists its options from here).
//
// Every key exists from rework ticket 07 on; later tickets add only the UI and
// behaviour that read them:
//   layouts                          ticket 09 (a Layout per screen class)
//   theme, accent, text_size, density ticket 07 (this one)
//   topic_order, pinned, collapsed,
//   widgets, dock                    ticket 11 (arranging the Brief)
//   unblurred                        ticket 10 (the blur switch per Sensitive Topic)

/** Screen classes a Layout is picked for. "wide" (1600px and over) uses the pc pick. */
export const SCREEN_CLASSES = ["phone", "tablet", "pc"] as const;
export type ScreenClass = (typeof SCREEN_CLASSES)[number];

export const LAYOUTS = ["swipe", "front_page", "list"] as const;
export type Layout = (typeof LAYOUTS)[number];

/** "auto" follows the device's colour-scheme preference. */
export const THEMES = ["light", "dark", "auto"] as const;
export type Theme = (typeof THEMES)[number];

export const ACCENTS = ["amber", "coral", "lime", "sky", "rose", "mono"] as const;
export type Accent = (typeof ACCENTS)[number];

/** Scale the 15px base by about 0.93, 1, 1.13 and 1.27 (globals.css, --text-scale). */
export const TEXT_SIZES = ["s", "m", "l", "xl"] as const;
export type TextSize = (typeof TEXT_SIZES)[number];

export const DENSITIES = ["compact", "comfortable"] as const;
export type Density = (typeof DENSITIES)[number];

/** The Widget kinds on the Cover (src/server/widgets: `Widget["kind"]`). */
export const WIDGET_KEYS = ["weather", "prayer_times", "next_match", "countdown"] as const;
export type WidgetKey = (typeof WIDGET_KEYS)[number];

export const DOCK_BUTTONS = ["like", "save", "ask", "hide", "share"] as const;
export type DockButton = (typeof DOCK_BUTTONS)[number];
export const DOCK_MAX = 5;

export interface Display {
  /** The Reader's pick per screen class. Unset: Swipe on phone and upright tablet, Front Page on sideways tablet and pc. */
  layouts: Partial<Record<ScreenClass, Layout>>;
  theme: Theme;
  accent: Accent;
  text_size: TextSize;
  density: Density;
  /** Followed Topics in the Reader's order; unlisted ones keep Brief order after these. */
  topic_order: string[];
  /** Pinned Topics, in order: first after the top stories. */
  pinned: string[];
  /** Collapsed Topics: shown as their headlines only. */
  collapsed: string[];
  /** Cover Widgets in order. The Cover shows those the Reader is eligible for right now. */
  widgets: WidgetKey[];
  /** Dock / rail buttons in order, 1 to DOCK_MAX. */
  dock: DockButton[];
  /** Sensitive Topics the Reader opted into and turned the blur off for. Opting out removes one. */
  unblurred: string[];
}

export const DEFAULT_DISPLAY: Display = {
  layouts: {},
  theme: "auto",
  accent: "amber",
  text_size: "m",
  density: "comfortable",
  topic_order: [],
  pinned: [],
  collapsed: [],
  widgets: [...WIDGET_KEYS],
  dock: ["like", "save", "ask", "hide"],
  unblurred: [],
};

export const DISPLAY_KEYS = Object.keys(DEFAULT_DISPLAY) as (keyof Display)[];

/**
 * A change to a Display, as PATCH /api/me {display} takes it: only the keys
 * sent change. `null` puts a key back to its default; inside `layouts`, null
 * takes back the pick for that screen class and the other picks are kept.
 */
export type DisplayPatch = {
  [K in keyof Display]?: (K extends "layouts" ? LayoutPicks : Display[K]) | null;
};

/** New Layout picks as a change sends them: null takes back the pick for that screen class. */
export type LayoutPicks = Partial<Record<ScreenClass, Layout | null>>;

/** The Layout picks once `picks` are applied: picks sent replace, null ones are taken back, the rest are kept. */
export function mergeLayouts(layouts: Display["layouts"] | undefined, picks: LayoutPicks): Display["layouts"] {
  const merged: LayoutPicks = { ...layouts, ...picks };
  for (const screen of SCREEN_CLASSES) if (merged[screen] === null) delete merged[screen];
  return merged as Display["layouts"];
}
