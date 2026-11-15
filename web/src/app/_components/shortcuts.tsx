"use client";
// Keyboard shortcuts on the Brief (rework ticket 09, spec #6), shared by every
// Layout. Each Layout moves with its own keys (j/k, the arrows, Enter, Esc);
// these are the rest:
//
//   s save · l like · h hide · a ask   on the Item being read (`itemShortcut`)
//   /   Saved & Search, with the search box focused
//   ?   the list of shortcuts
//
// They are ignored while typing, with a modifier held, or while a sheet is
// open. `e` (Edit mode) comes with ticket 11.
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useLanguage } from "./language";
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
 * Press the Hide button on the rail of the card in `root` (the reader pane,
 * or Swipe's slide on screen): it asks why, as a tap would. Not on a veiled card.
 */
export function pressRailButton(root: ParentNode | null, kind: "hide"): void {
  const card = root?.querySelector("article[data-active]");
  if (!card || card.hasAttribute("data-locked")) return;
  card.querySelector<HTMLButtonElement>(`[data-kind="${kind}"]`)?.click();
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
                <kbd key={key}>{key}</kbd>
              ))}
            </dt>
            <dd>{t(en, ar)}</dd>
          </div>
        ))}
      </dl>
    </Sheet>
  );
}
