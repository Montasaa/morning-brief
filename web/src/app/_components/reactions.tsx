"use client";
// Reactions on the Brief (ticket 09; the Reels look, rework ticket 08): the
// action rail on the Reels card (the Reader's dock buttons, Display `dock`,
// rework ticket 11: Like, Save, Ask and Hide by default, and Share), the hide-reason sheet
// (not interested · already seen · bad source · just hide), and the
// "Hidden · Undo" toast. Opening an Item (its read sheet, or one of its links)
// records an open, so it comes back dimmed.
//
// Changes show straight away and are sent to POST /api/items/{id}/reactions or
// DELETE /api/items/{id}/reactions/{kind}; a failed call puts things back.
// A hidden Item leaves this Brief at once (the composer leaves it out of the
// next one), and Undo brings it back where it was.
import { useEffect, useMemo, useRef, useState } from "react";
import type { DockButton } from "@/server/display/shape";
import { useDisplay } from "./display";
import type { Brief, BriefItem } from "@/server/brief/compose";
import { Icon, type IconName } from "./icons";
import { localized } from "./i18n";
import { useLanguage } from "./language";
import { Sheet } from "./sheet";
import s from "./reactions.module.css";

type Toggle = "like" | "save";
type HideReason = "not_interested" | "already_seen" | "bad_source" | null;

export interface ReactionsState {
  /** The Brief without the Items hidden here, with Like/Save/dimmed as the Reader set them. */
  brief: Brief;
  toggle(item: BriefItem, kind: Toggle): void;
  /** Turn Like or Save on or off (a double-tap turns Like on, whatever it was). */
  set(item: BriefItem, kind: Toggle, on: boolean): void;
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
      // A group emptied by hiding goes; a Topic with nothing in the Edition stays, to say so.
      .filter((g) => g.item_ids.length > 0 || g.nothing_qualified);
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

  const set = (item: BriefItem, kind: Toggle, on: boolean) => {
    if (current(item).reactions[kind] === on) return;
    // A light haptic tick where the device has one.
    if (on) navigator.vibrate?.(10);
    mark(item, { [kind]: on });
    void send(item, on ? "POST" : "DELETE", kind).then((ok) => ok || mark(item, { [kind]: !on }));
  };

  return {
    brief,
    lastHidden,
    toggle: (item, kind) => set(item, kind, !current(item).reactions[kind]),
    set,
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

/** Every dock button: its icon and its name. The Reader picks which show, and in what order (Display `dock`). */
export const DOCK_LABELS: Record<DockButton, { icon: IconName; en: string; ar: string }> = {
  like: { icon: "heart", en: "Like", ar: "أعجبني" },
  save: { icon: "save", en: "Save", ar: "حفظ" },
  ask: { icon: "sparkle", en: "Ask", ar: "اسأل" },
  hide: { icon: "hide", en: "Hide", ar: "إخفاء" },
  share: { icon: "share", en: "Share", ar: "مشاركة" },
};

/**
 * The action rail on a Reels card, with the Reader's dock buttons in their order: Like and Save toggle (and
 * pop), Ask calls `onAsk`, Hide asks why in the hide-reason sheet and then offers Undo, Share hands the
 * story's link to the device's share sheet (or copies it).
 */
export function Rail({ item, reactions, onAsk }: { item: BriefItem; reactions: ReactionsState; onAsk(): void }) {
  const { lang, t } = useLanguage();
  const { display } = useDisplay();
  const [hiding, setHiding] = useState(false);
  // Which button last turned on, so it pops once.
  const [popped, setPopped] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(copiedTimer.current), []);
  const share = async () => {
    const url = item.sources[0]?.url;
    if (!url) return;
    const title = localized(item, "title", lang)!;
    if (navigator.share) {
      await navigator.share({ title, url }).catch(() => undefined); // the Reader closed the share sheet
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopied(false), 2_000);
    } catch {
      // No clipboard here: nothing to do.
    }
  };
  return (
    <>
      <div className={s.rail} role="toolbar" aria-orientation="vertical" aria-label={t("Actions", "الإجراءات")}>
        {display.dock.map((kind) => {
          const b = { kind, ...DOCK_LABELS[kind] };
          const toggle = b.kind === "like" || b.kind === "save" ? b.kind : null;
          const pressed = toggle ? item.reactions[toggle] : undefined;
          return (
            <button
              key={b.kind}
              type="button"
              className={s.railButton}
              data-kind={b.kind}
              data-pop={(pressed && popped === b.kind) || undefined}
              aria-pressed={pressed}
              onClick={() => {
                if (toggle) {
                  if (!pressed) setPopped(toggle);
                  reactions.toggle(item, toggle);
                } else if (b.kind === "ask") onAsk();
                else if (b.kind === "share") void share();
                else setHiding(true);
              }}
            >
              <span className={s.railIcon}>
                <Icon name={b.icon} size={27} filled={pressed} />
              </span>
              <small>{b.kind === "share" && copied ? t("Copied", "نُسخ") : t(b.en, b.ar)}</small>
            </button>
          );
        })}
      </div>
      {hiding && (
        <HideSheet
          title={localized(item, "title", lang)!}
          onPick={(reason) => {
            setHiding(false);
            reactions.hide(item, reason);
          }}
          onClose={() => setHiding(false)}
        />
      )}
    </>
  );
}

/** "Why hide this?": the reason teaches the Brief the right lesson; only "not interested" lowers similar Items. */
function HideSheet({ title, onPick, onClose }: { title: string; onPick: (reason: HideReason) => void; onClose: () => void }) {
  const { t } = useLanguage();
  const reasons: { reason: HideReason; en: string; ar: string; subEn: string; subAr: string }[] = [
    { reason: "not_interested", en: "Not interested", ar: "غير مهتم", subEn: "Fewer stories like this", subAr: "أخبار أقل من هذا النوع" },
    { reason: "already_seen", en: "Already seen", ar: "شاهدته من قبل", subEn: "Just this one", subAr: "هذا الخبر فقط" },
    { reason: "bad_source", en: "Bad source", ar: "مصدر ضعيف", subEn: "Also reports it to the Owner", subAr: "ويُبلَّغ المالك أيضًا" },
    { reason: null, en: "Just hide", ar: "إخفاء فقط", subEn: "No reason", subAr: "دون سبب" },
  ];
  return (
    <Sheet label={t("Why hide this?", "لماذا تخفي هذا؟")} title={t("Why hide this?", "لماذا تخفي هذا؟")} onClose={onClose}>
      <p className={s.about} dir="auto">
        {title}
      </p>
      <ul className={s.reasons}>
        {reasons.map((r) => (
          <li key={r.reason ?? "none"}>
            <button type="button" className={s.reason} onClick={() => onPick(r.reason)}>
              {t(r.en, r.ar)}
              <small>{t(r.subEn, r.subAr)}</small>
            </button>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}

/** "Hidden · Undo", shown for a few seconds after a hide. `onUndone` gets the Item that came back. */
export function UndoToast({ reactions, onUndone }: { reactions: ReactionsState; onUndone?(item: BriefItem): void }) {
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
      <button
        type="button"
        onClick={() => {
          reactions.undoHide();
          onUndone?.(item);
        }}
      >
        {t("Undo", "تراجع")}
      </button>
    </div>
  );
}
