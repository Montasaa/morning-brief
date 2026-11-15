"use client";
// Topic tabs (rework ticket 08, spec #6): "For you", then the Reader's Topics
// in Brief order, across the top of the Brief. The current one is marked
// (`aria-current`) and a sliding indicator moves under it; the strip scrolls
// sideways to keep it in view. Tapping a tab calls `onPick` with its key. The
// caller decides what "current" means: Swipe follows the Item on screen, and
// ticket 09's Front Page follows its scrolling (a scroll spy). In Arabic the
// strip runs right to left with the page, indicator included.
import { useLayoutEffect, useRef, useState } from "react";
import { prefersReducedMotion } from "./client-time";
import { useLanguage } from "./language";
import s from "./topic-tabs.module.css";

export interface TopicTab {
  key: string;
  label: string;
}

export function TopicTabs({
  tabs,
  current,
  onPick,
  className,
}: {
  tabs: TopicTab[];
  current: string;
  onPick(key: string): void;
  className?: string;
}) {
  const { lang, t } = useLanguage();
  const strip = useRef<HTMLDivElement>(null);
  const [bar, setBar] = useState<{ left: number; width: number } | null>(null);

  useLayoutEffect(() => {
    const measure = () => {
      const on = strip.current?.querySelector<HTMLElement>('[aria-current="true"]');
      setBar(on ? { left: on.offsetLeft, width: on.offsetWidth } : null);
    };
    measure();
    // Centre the current tab by scrolling the strip itself, so nothing else on the
    // page scrolls (scrollIntoView would also move any scrolling ancestor).
    const el = strip.current;
    const on = el?.querySelector<HTMLElement>('[aria-current="true"]');
    if (el && on) {
      const a = on.getBoundingClientRect();
      const b = el.getBoundingClientRect();
      el.scrollBy({ left: a.left + a.width / 2 - (b.left + b.width / 2), behavior: prefersReducedMotion() ? "auto" : "smooth" });
    }
    // Fonts and the text size change the tabs' widths.
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    if (strip.current) observer?.observe(strip.current);
    return () => observer?.disconnect();
  }, [current, lang, tabs.length]);

  return (
    <nav className={`${s.tabs} ${className ?? ""}`} aria-label={t("Topics", "المواضيع")}>
      <div ref={strip} className={s.strip}>
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={s.tab}
            aria-current={tab.key === current ? "true" : undefined}
            onClick={() => onPick(tab.key)}
          >
            {tab.label}
          </button>
        ))}
        {bar && <span className={s.indicator} style={{ left: bar.left, width: bar.width }} aria-hidden />}
      </div>
    </nav>
  );
}
