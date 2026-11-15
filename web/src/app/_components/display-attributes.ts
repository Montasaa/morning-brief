// Plain helpers for the Display that server and client components both import
// (the React side is display.tsx).
import { DEFAULT_DISPLAY, mergeLayouts, type Display, type DisplayPatch, type LayoutPicks } from "@/server/display/shape";

/**
 * The attributes the Display puts on <html>; globals.css styles from them.
 * Rendered by the root layout on the server (so there is no flash of the wrong
 * look) and kept up to date by DisplayProvider.
 */
export function displayAttributes(display: Display): Record<string, string> {
  return {
    "data-theme": display.theme,
    "data-accent": display.accent,
    "data-text-size": display.text_size,
    "data-density": display.density,
  };
}

/** What the Display will be once `patch` is saved, the way PATCH /api/me {display} applies it. */
export function applyPatch(display: Display, patch: DisplayPatch): Display {
  const next = { ...display } as Record<string, unknown>;
  for (const [key, value] of Object.entries(patch)) {
    if (key === "layouts" && value) {
      next.layouts = mergeLayouts(display.layouts, value as LayoutPicks);
    } else {
      next[key] = value === null ? DEFAULT_DISPLAY[key as keyof Display] : value;
    }
  }
  return next as unknown as Display;
}
