"use client";
// Keyboard shortcuts on the Brief (rework ticket 09, spec #6), shared by every
// Layout. Each Layout moves with its own keys (j/k, the arrows, Enter, Esc);
// these are the rest:
//
//   s save · l like · h hide · a ask   on the Item being read (`itemShortcut`, `runItemShortcut`)
//   /   Saved & Search, with the search box focused
//   ?   the list of shortcuts
//
//   e   Edit mode (rework ticket 11; kept in brief-layouts.tsx, so it survives a Layout switch)
//
// They are ignored while typing, with a modifier held, or while a sheet is
// open.
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import type { BriefItem } from "@/server/brief/compose";
import { useLanguage } from "./language";
import type { ReactionsState } from "./reactions";
import { Sheet, sheetOpen } from "./sheet";
import s from "./shortcuts.module.css";

export type ItemShortcut = "save" | "like" | "hide" | "ask";

/** The action a key stands for on the Item being read, if any. */
export function itemShortcut(e: KeyboardEvent): ItemShortcut | null {
  if (!isShortcut(e)) return null;
  return ({ s: "save", l: "like", h: "hide", a: "ask" } as const)[e.key as "s"] ?? null;
}

/** A key press meant for the Brief: no modifier, not typing, no sheet open, not handled already. */
export function isShortcut(e: KeyboardEvent): boolean {
  return !(e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || sheetOpen() || isTyping(e.target));
}

export function isTyping(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])') !== null;
}

/**
 * Do what an Item shortcut says to `item`, the Reels card on screen inside
 * `card` (the reader pane, or Swipe's slides). Nothing while that card is
 * veiled. Hide presses the rail's Hide button, so it asks why as a tap would
 * (with no Hide on the Reader's dock, it just hides the Item).
 */
export function runItemShortcut(
  action: ItemShortcut,
  item: BriefItem,
  { reactions, card, onAsk }: { reactions: ReactionsState; card: ParentNode | null; onAsk(): void },
): void {
  const shown = card?.querySelector("article[data-active]");
  if (!shown || shown.hasAttribute("data-locked")) return;
  if (action === "like" || action === "save") reactions.toggle(item, action);
  else if (action === "ask") onAsk();
  else {
    const hide = shown.querySelector<HTMLButtonElement>('[data-kind="hide"]');
    // Without Hide on the Reader's dock there is no sheet to ask why: just hide it (Undo is offered).
    if (hide) hide.click();
    else reactions.hide(item, null);
  }
}

/** A key, drawn as a keycap. */
export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className={s.kbd}>{children}</kbd>;
}

/** `/` and `?` on the Brief. Render what it returns: the shortcut list, while open. */
export function useShortcuts() {
  const router = useRouter();
  const [listing, setListing] = useState(false);
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!isShortcut(e)) return;
      if (e.key === "/") {
        e.preventDefault();
        router.push("/saved#search");
      } else if (e.key === "?") {
        e.preventDefault();
        setListing(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);
  return listing ? <ShortcutList onClose={() => setListing(false)} /> : null;
}

function ShortcutList({ onClose }: { onClose(): void }) {
  const { t } = useLanguage();
  const keys: [keys: string[], en: string, ar: string][] = [
    [["j", "↓"], "Next Item", "العنصر التالي"],
    [["k", "↑"], "Previous Item", "العنصر السابق"],
    [["Enter"], "Read the whole story", "قراءة الخبر كاملًا"],
    [["l"], "Like", "أعجبني"],
    [["s"], "Save", "حفظ"],
    [["h"], "Hide", "إخفاء"],
    [["a"], "Ask Claude", "اسأل Claude"],
    [["/"], "Search", "البحث"],
    [["e"], "Arrange your Brief (Edit mode)", "ترتيب موجزك (وضع التحرير)"],
    [["Esc"], "Back, or close", "رجوع أو إغلاق"],
    [["?"], "This list", "هذه القائمة"],
  ];
  return (
    <Sheet label={t("Keyboard shortcuts", "اختصارات لوحة المفاتيح")} title={t("Keyboard shortcuts", "اختصارات لوحة المفاتيح")} onClose={onClose}>
      <dl className={s.list}>
        {keys.map(([k, en, ar]) => (
          <div key={en} className={s.row}>
            <dt>
              {k.map((key) => (
                <Kbd key={key}>{key}</Kbd>
              ))}
            </dt>
            <dd>{t(en, ar)}</dd>
          </div>
        ))}
      </dl>
    </Sheet>
  );
}
