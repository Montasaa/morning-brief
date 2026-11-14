"use client";
// Desktop (ticket 05): the side list of the whole Brief beside the centred
// card, grouped like the progress bars, with the current Item highlighted.
// Clicking a row jumps to that Item. Hidden below the desktop breakpoint
// (see side-list.module.css), so phones keep the one-card Swipe Brief.
import { useEffect, useRef } from "react";
import type { Brief, BriefGroup } from "@/server/brief/compose";
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

  // Keep the highlighted row in view as the Reader moves through the Brief.
  useEffect(() => {
    current.current?.scrollIntoView({ block: "nearest" });
  }, [pos]);

  return (
    <nav className={s.sideList} aria-label="In this Brief">
      <h2 className={s.title}>In this Brief</h2>
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
                    className={s.row}
                    aria-current={isCurrent ? "true" : undefined}
                    onClick={() => onJump(at)}
                  >
                    <span className={s.num} aria-hidden>
                      {at}
                    </span>
                    <span className={s.rowText}>
                      <span className={s.rowTitle}>{item.title}</span>
                      {g.kind === "top" && <small>{brief.topic_names[item.topic] ?? item.topic}</small>}
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
