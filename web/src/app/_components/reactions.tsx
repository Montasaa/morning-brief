"use client";
// Reactions in the Swipe Brief (ticket 09): the dock (Hide, Save, Like, Ask),
// the hide-reason sheet (not interested · already seen · bad source · just
// hide), and the "Hidden · Undo" toast. Opening one of a card's links records
// an open, so the Item comes back dimmed.
//
// Changes show straight away and are sent to POST /api/items/{id}/reactions or
// DELETE /api/items/{id}/reactions/{kind}; a failed call puts things back.
// A hidden Item leaves this Brief at once (the composer leaves it out of the
// next one), and Undo brings it back where it was.
import { useEffect, useMemo, useState } from "react";
import type { Brief, BriefItem } from "@/server/brief/compose";
import { useLanguage } from "./language";
import s from "./reactions.module.css";
import sw from "./swipe-brief.module.css";

type Toggle = "like" | "save";
type HideReason = "not_interested" | "already_seen" | "bad_source" | null;

export interface ReactionsState {
  /** The Brief without the Items hidden here, with Like/Save/dimmed as the Reader set them. */
  brief: Brief;
  toggle(item: BriefItem, kind: Toggle): void;
  hide(item: BriefItem, reason: HideReason): void;
  /** The last hidden Item, while its Undo is offered. */
  lastHidden: BriefItem | null;
  undoHide(): void;
  dismissUndo(): void;
  opened(item: BriefItem): void;
}

export function useReactions(initial: Brief, basePath: string): ReactionsState {
  const [marks, setMarks] = useState<Record<string, { like: boolean; save: boolean; dimmed: boolean }>>({});
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const [lastHidden, setLastHidden] = useState<BriefItem | null>(null);

  const brief = useMemo<Brief>(() => {
    const items = initial.items
      .filter((i) => !hidden.has(i.id))
      .map((i) => {
        const m = marks[i.id];
        return m ? { ...i, reactions: { like: m.like, save: m.save }, dimmed: m.dimmed } : i;
      });
    const groups = initial.groups
      .map((g) => ({ ...g, item_ids: g.item_ids.filter((id) => !hidden.has(id)) }))
      .filter((g) => g.item_ids.length > 0);
    return { ...initial, items, groups };
  }, [initial, marks, hidden]);

  const current = (item: BriefItem) => brief.items.find((i) => i.id === item.id) ?? item;
  const mark = (item: BriefItem, change: Partial<{ like: boolean; save: boolean; dimmed: boolean }>) =>
    setMarks((all) => {
      const was = all[item.id] ?? { ...item.reactions, dimmed: item.dimmed };
      return { ...all, [item.id]: { ...was, ...change } };
    });

  const send = (item: BriefItem, method: "POST" | "DELETE", kind: string, reason: HideReason = null) =>
    fetch(
      method === "POST"
        ? `${basePath}/api/items/${encodeURIComponent(item.id)}/reactions`
        : `${basePath}/api/items/${encodeURIComponent(item.id)}/reactions/${kind}`,
      method === "POST"
        ? { method, headers: { "content-type": "application/json" }, body: JSON.stringify(reason ? { kind, reason } : { kind }) }
        : { method },
    )
      .then((res) => res.ok)
      .catch(() => false);

  const setHiddenId = (id: string, on: boolean) =>
    setHidden((all) => {
      const next = new Set(all);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  return {
    brief,
    lastHidden,
    toggle(item, kind) {
      const on = !current(item).reactions[kind];
      mark(item, { [kind]: on });
      void send(item, on ? "POST" : "DELETE", kind).then((ok) => ok || mark(item, { [kind]: !on }));
    },
    hide(item, reason) {
      setHiddenId(item.id, true);
      setLastHidden(item);
      void send(item, "POST", "hide", reason).then((ok) => {
        if (ok) return;
        setHiddenId(item.id, false);
        setLastHidden(null);
      });
    },
    undoHide() {
      const item = lastHidden;
      if (!item) return;
      setLastHidden(null);
      setHiddenId(item.id, false);
      void send(item, "DELETE", "hide").then((ok) => ok || setHiddenId(item.id, true));
    },
    dismissUndo: () => setLastHidden(null),
    opened(item) {
      if (current(item).dimmed) return;
      mark(item, { dimmed: true });
      void send(item, "POST", "open");
    },
  };
}

const ICONS = {
  hide: "M6 6l12 12M18 6L6 18",
  save: "M7 4h10v16l-5-4-5 4z",
  like: "M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z",
  ask: "M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z",
};

/** The bottom dock on an Item card. Ask arrives with ticket 16. */
export function Dock({ item, reactions }: { item: BriefItem; reactions: ReactionsState }) {
  const { t } = useLanguage();
  const [sheet, setSheet] = useState(false);
  // A new card closes the sheet.
  useEffect(() => setSheet(false), [item.id]);
  return (
    <>
      <div className={sw.dock} role="toolbar" aria-label={t("Reactions", "التفاعلات")}>
        <DockButton label={t("Hide", "إخفاء")} path={ICONS.hide} onClick={() => setSheet(true)} />
        <DockButton
          label={t("Save", "حفظ")}
          path={ICONS.save}
          pressed={item.reactions.save}
          onClick={() => reactions.toggle(item, "save")}
        />
        <DockButton
          label={t("Like", "أعجبني")}
          path={ICONS.like}
          pressed={item.reactions.like}
          onClick={() => reactions.toggle(item, "like")}
        />
        <DockButton label={t("Ask", "اسأل")} path={ICONS.ask} />
      </div>
      {sheet && (
        <HideSheet
          onPick={(reason) => {
            setSheet(false);
            reactions.hide(item, reason);
          }}
          onClose={() => setSheet(false)}
        />
      )}
    </>
  );
}

function DockButton({
  label,
  path,
  pressed,
  onClick,
}: {
  label: string;
  path: string;
  pressed?: boolean;
  onClick?: () => void;
}) {
  return (
    <button type="button" className={sw.dockButton} aria-pressed={pressed} onClick={onClick}>
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>
        <path
          d={path}
          fill={pressed ? "currentColor" : "none"}
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>
      <small>{label}</small>
    </button>
  );
}

/** "Why hide this?": the reason teaches the Brief the right lesson; only "not interested" lowers similar Items. */
function HideSheet({ onPick, onClose }: { onPick: (reason: HideReason) => void; onClose: () => void }) {
  const { t } = useLanguage();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const reasons: { reason: Exclude<HideReason, null>; en: string; ar: string }[] = [
    { reason: "not_interested", en: "Not interested", ar: "غير مهتم" },
    { reason: "already_seen", en: "Already seen", ar: "شاهدته من قبل" },
    { reason: "bad_source", en: "Bad source", ar: "مصدر ضعيف" },
  ];
  return (
    <>
      <button type="button" className={s.scrim} aria-label={t("Cancel", "إلغاء")} onClick={onClose} />
      <div className={s.sheet} role="dialog" aria-label={t("Why hide this?", "لماذا تخفي هذا؟")}>
        <h3>{t("Why hide this?", "لماذا تخفي هذا؟")}</h3>
        {reasons.map((r) => (
          <button key={r.reason} type="button" className={s.reason} onClick={() => onPick(r.reason)}>
            {t(r.en, r.ar)}
          </button>
        ))}
        <button type="button" className={`${s.reason} ${s.justHide}`} onClick={() => onPick(null)}>
          {t("Just hide", "إخفاء فقط")}
        </button>
      </div>
    </>
  );
}

/** "Hidden · Undo", shown for a few seconds after a hide. */
export function UndoToast({ reactions }: { reactions: ReactionsState }) {
  const { t } = useLanguage();
  const item = reactions.lastHidden;
  const { dismissUndo } = reactions;
  useEffect(() => {
    if (!item) return;
    const timer = setTimeout(dismissUndo, 8_000);
    return () => clearTimeout(timer);
  }, [item]);
  if (!item) return null;
  return (
    <div className={s.toast} role="status">
      <span>{t("Hidden", "تم الإخفاء")}</span>
      <button type="button" onClick={reactions.undoHide}>
        {t("Undo", "تراجع")}
      </button>
    </div>
  );
}
