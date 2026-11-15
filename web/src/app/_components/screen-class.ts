"use client";
// Screen classes and the Layout for each (rework ticket 09, spec #6). Read on
// the client, from the viewport:
//
//   phone   under 768px wide
//   tablet  768–1279px; upright when it is at least as tall as wide
//   pc      1280–1599px
//   wide    1600px and over (uses the PC pick)
//
// With no pick, phone and an upright tablet open in Swipe, a sideways tablet
// and a PC (and so wide) in Front Page. Once tablet has a pick it applies in
// both orientations. The sidebar shows where the Front Page default does
// (globals.css, the same widths: tablet landscape, PC and wide); elsewhere the
// bottom tabs do, and the reader pane opens full screen.
import { useSyncExternalStore } from "react";
import type { Display, Layout, ScreenClass } from "@/server/display/shape";

export type Screen = { cls: ScreenClass | "wide"; upright: boolean };

export function screenOf(width: number, height: number): Screen {
  const upright = height >= width;
  if (width < 768) return { cls: "phone", upright };
  if (width < 1280) return { cls: "tablet", upright };
  if (width < 1600) return { cls: "pc", upright };
  return { cls: "wide", upright };
}

/** The screen class whose pick applies: wide uses the PC's. */
export function pickFor(screen: Screen): ScreenClass {
  return screen.cls === "wide" ? "pc" : screen.cls;
}

/** The Layout to show on `screen`: the Reader's pick for it, else the default. */
export function layoutFor(layouts: Display["layouts"], screen: Screen): Layout {
  const picked = layouts[pickFor(screen)];
  if (picked) return picked;
  if (screen.cls === "phone" || (screen.cls === "tablet" && screen.upright)) return "swipe";
  return "front_page";
}

/** Whether the sidebar (and a reader pane beside the page) shows: tablet landscape, PC and wide. */
export function hasSidebar(screen: Screen): boolean {
  return screen.cls === "pc" || screen.cls === "wide" || (screen.cls === "tablet" && !screen.upright);
}

function subscribe(onChange: () => void) {
  window.addEventListener("resize", onChange);
  return () => window.removeEventListener("resize", onChange);
}
// A string, so the same screen compares equal between reads.
const snapshot = () => {
  const s = screenOf(window.innerWidth, window.innerHeight);
  return `${s.cls}:${s.upright ? 1 : 0}`;
};

/**
 * The screen this page is on, following resizes and rotation. Null on the
 * server and while hydrating (the server cannot know the screen), so a caller
 * renders its screen-dependent part once the page is running.
 */
export function useScreen(): Screen | null {
  const value = useSyncExternalStore(subscribe, snapshot, () => null);
  if (!value) return null;
  const [cls, upright] = value.split(":");
  return { cls: cls as Screen["cls"], upright: upright === "1" };
}
