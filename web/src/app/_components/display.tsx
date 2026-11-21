"use client";
// The Reader's Display in the browser (rework ticket 07, spec #6). The root
// layout reads it on the server and renders it on <html> (displayAttributes),
// so the first paint already has the right theme, accent, text size and
// density; then it wraps the app in DisplayProvider.
//
//   const { display, update } = useDisplay();
//   await update({ accent: "sky" });   // true once saved
//
// `update` takes effect at once (the <html> attributes change before the
// request), saves the keys it is given with PATCH /api/me {display}, and puts
// the screen back if the server refuses. When the page comes back into view it
// fetches the Display again, so a change made on another device shows up
// without a reload.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Display, DisplayPatch } from "@/server/display/shape";
import { applyPatch, displayAttributes } from "./display-attributes";

interface DisplayState {
  display: Display;
  /** Change some keys. Resolves true when saved, false when refused or offline (the change is undone). */
  update(patch: DisplayPatch): Promise<boolean>;
}

const DisplayContext = createContext<DisplayState | null>(null);

export function DisplayProvider({
  initial,
  basePath,
  signedIn,
  children,
}: {
  initial: Display;
  basePath: string;
  /** A Reader is signed in: save changes to their Display and refresh it when the page is shown again. */
  signedIn: boolean;
  children: ReactNode;
}) {
  const [display, setDisplayState] = useState<Display>(initial);
  // The Display on screen, kept in step synchronously so quick successive changes build on each other.
  const current = useRef(initial);
  // Bumped on every change; a server answer older than the newest change is not shown.
  const changes = useRef(0);
  const setDisplay = useCallback((next: Display) => {
    current.current = next;
    setDisplayState(next);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    for (const [name, value] of Object.entries(displayAttributes(display))) root.setAttribute(name, value);
  }, [display]);

  useEffect(() => {
    if (!signedIn) return;
    const refresh = async () => {
      if (document.visibilityState !== "visible") return;
      const seen = changes.current;
      try {
        const res = await fetch(`${basePath}/api/me`, { cache: "no-store" });
        if (res.ok && seen === changes.current) setDisplay((await res.json()).display);
      } catch {
        // Offline: keep what is on screen.
      }
    };
    document.addEventListener("visibilitychange", refresh);
    return () => document.removeEventListener("visibilitychange", refresh);
  }, [basePath, signedIn, setDisplay]);

  const update = useCallback(
    async (patch: DisplayPatch) => {
      const before = current.current;
      setDisplay(applyPatch(before, patch));
      if (!signedIn) return true;
      const change = ++changes.current;
      try {
        const res = await fetch(`${basePath}/api/me`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ display: patch }),
        });
        if (res.ok) {
          const saved = (await res.json()).display as Display;
          if (change === changes.current) setDisplay(saved);
          return true;
        }
      } catch {
        // Offline: fall through and undo.
      }
      // Undo just the keys this change touched; later changes stay.
      const undone = { ...current.current } as Record<string, unknown>;
      for (const key of Object.keys(patch)) undone[key] = before[key as keyof Display];
      setDisplay(undone as unknown as Display);
      return false;
    },
    [basePath, signedIn, setDisplay],
  );

  const value = useMemo<DisplayState>(() => ({ display, update }), [display, update]);
  return <DisplayContext.Provider value={value}>{children}</DisplayContext.Provider>;
}

export function useDisplay(): DisplayState {
  const state = useContext(DisplayContext);
  if (!state) throw new Error("useDisplay needs a DisplayProvider (the root layout has one)");
  return state;
}
