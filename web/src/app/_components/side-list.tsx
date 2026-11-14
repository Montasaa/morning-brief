"use client";
// Desktop (ticket 05): the side list of the whole Brief beside the centred
// card, grouped like the progress bars, with the current Item highlighted.
// Clicking a row jumps to that Item. Hidden below the desktop breakpoint
// (see side-list.module.css), so phones keep the one-card Swipe Brief.
import { useEffect, useRef } from "react";
import type { Brief, BriefGroup } from "@/server/brief/compose";
import { formatNumber, localized } from "./i18n";
import { useLanguage } from "./language";
import s from "./side-list.module.css";

interface SideListProps {
  brief: Brief;
  /** The Swipe Brief position: 0 is the cover card, the Item at index i is i + 1. */
  pos: number;
  onJump: (pos: number) => void;
  /** A group's heading, as on its progress bar. */
  groupName: (g: BriefGroup) => string;
}

export function SideList({ brief, pos, onJump, groupName }: SideListProps) {
  const position = new Map(brief.items.map((item, i) => [item.id, i + 1]));
  const byId = new Map(brief.items.map((item) => [item.id, item]));
  const current = useRef<HTMLButtonElement>(null);
  const { lang, t } = useLanguage();
  const topicName = (id: string) =>
    (lang === "ar" ? brief.topic_names_ar[id] : undefined) ?? brief.topic_names[id] ?? id;

  // Keep the highlighted row in view as the Reader moves through the Brief.
  useEffect(() => {
    current.current?.scrollIntoView({ block: "nearest" });
  }, [pos]);

  return (
    <nav className={s.sideList} aria-label={t("In this Brief", "في هذا الموجز")}>
      <h2 className={s.title}>{t("In this Brief", "في هذا الموجز")}</h2>
      {brief.groups.map((g) => (
        <section key={g.topic ?? "top"} className={s.group}>
          <h3>{groupName(g)}</h3>
          <ol>
            {g.item_ids.map((id) => {
              const item = byId.get(id)!;
              const at = position.get(id)!;
              const isCurrent = at === pos;
              return (
                <li key={id}>
                  <button
                    type="button"
                    ref={isCurrent ? current : undefined}
                    className={`${s.row} ${item.dimmed ? s.dimmed : ""}`}
                    aria-current={isCurrent ? "true" : undefined}
                    onClick={() => onJump(at)}
                  >
                    <span className={s.num} aria-hidden>
                      {formatNumber(at, lang)}
                    </span>
                    <span className={s.rowText}>
                      {/* dir="auto": an English fallback inside the Arabic layout still reads left to right. */}
                      <span className={s.rowTitle} dir="auto">
                        {localized(item, "title", lang)}
                      </span>
                      {g.kind === "top" && <small>{topicName(item.topic)}</small>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </nav>
  );
}

/**
 * Arrow keys move through the Brief: forward with the reading direction
 * (ArrowRight in English, ArrowLeft in Arabic RTL), back against it. Ignored
 * while typing in an input, text area, select or editable field, and when a
 * modifier key is held (Alt+Left is the browser's own Back).
 */
export function useArrowKeys(next: () => void, back: () => void): void {
  const latest = useRef({ next, back });
  latest.current = { next, back };

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      if (isTyping(e.target)) return;
      const rtl = document.documentElement.dir === "rtl";
      const forward = (e.key === "ArrowRight") !== rtl;
      e.preventDefault();
      if (forward) latest.current.next();
      else latest.current.back();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

function isTyping(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])') !== null;
}
