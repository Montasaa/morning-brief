"use client";
// Small browser-only helpers shared by the Brief's components.
import { useEffect, useState } from "react";

/** The current time, known only after the page has loaded (so server and browser render the same HTML); ticks each minute. */
export function useNow(): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

/** Whether the Reader asked for reduced motion: script-driven motion (smooth scrolls, closing animations) is skipped. */
export function prefersReducedMotion(): boolean {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}
