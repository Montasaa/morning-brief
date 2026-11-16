"use client";
// Arranging the Brief (rework ticket 11, spec #6): the controls that change the
// Reader's Display for Topic order, pins, collapse and blur, the Cover's
// Widgets and the dock. Every change takes effect at once and is saved
// straight away (useDisplay); the Brief re-arranges itself from the Display
// (arrangeBrief), so it never waits for the server.
//
// - useArrange(): the changes, as functions. Reordering works on the order on
//   screen, inside one section: Pinned Topics among themselves (`pinned`),
//   the others among themselves (`topic_order`).
// - <ReorderButtons>: move up / move down, so reordering never needs a drag.
// - <TopicList>: every Topic as a row with its controls. Swipe's Edit sheet
//   and Me › Display use it; Front Page and List put the same controls on
//   their headings (<TopicControls>).
// - <PickList>: an ordered pick from a fixed set (Widgets, dock buttons):
//   the chosen ones in order with move and remove, then the rest to add back.
// - <EditSheet>: Swipe's Edit mode, a sheet with the Topics and the Widgets.
import { useRouter } from "next/navigation";
import { useState, type DragEvent } from "react";
import type { BriefGroup, BriefWidget } from "@/server/brief/compose";
import type { DisplayPatch, WidgetKey } from "@/server/display/shape";
import c from "./chrome.module.css";
import { useDisplay } from "./display";
import { Icon } from "./icons";
import { useLanguage } from "./language";
import { Sheet } from "./sheet";
import s from "./arrange.module.css";

/** A Topic as the arranging controls see it: its group's place and marks, and its name in the Reader's language. */
export interface ArrangedTopic {
  topic: string;
  name: string;
  pinned: boolean;
  collapsed: boolean;
  /** A Sensitive Topic: it gets a blur switch. */
  sensitive: boolean;
}

/** The Topic groups of a Brief (or a Me › Display list), as ArrangedTopics in their order. */
export function arrangedTopics(groups: readonly BriefGroup[], name: (topic: string) => string): ArrangedTopic[] {
  return groups.flatMap((g) =>
    g.kind === "topic" ? [{ topic: g.topic!, name: name(g.topic!), pinned: g.pinned, collapsed: g.collapsed, sensitive: g.sensitive }] : [],
  );
}

export const WIDGET_LABELS: Record<WidgetKey, readonly [en: string, ar: string]> = {
  weather: ["Weather", "الطقس"],
  prayer_times: ["Prayer times", "مواقيت الصلاة"],
  next_match: ["Next match", "المباراة القادمة"],
  countdown: ["Countdowns", "العدّ التنازلي"],
};

export function useArrange() {
  const { display, update } = useDisplay();
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "saved" | "failed">("idle");
  const save = async (patch: DisplayPatch) => {
    setStatus("idle");
    const ok = await update(patch);
    setStatus(ok ? "saved" : "failed");
    return ok;
  };
  const without = (list: readonly string[], id: string) => list.filter((x) => x !== id);

  /** `topic` moved to place `to` among the Topics of its section (pinned or not), as shown in `order`. */
  const moveTo = (order: readonly ArrangedTopic[], topic: string, to: number) => {
    const pinned = order.find((t) => t.topic === topic)?.pinned;
    if (pinned === undefined) return;
    const section = order.filter((t) => t.pinned === pinned).map((t) => t.topic);
    const from = section.indexOf(topic);
    const at = Math.max(0, Math.min(section.length - 1, to));
    if (from === at) return;
    section.splice(from, 1);
    section.splice(at, 0, topic);
    // Entries for Topics not on screen (unfollowed for now) are kept after the ones that are.
    const keep = (list: readonly string[]) => [...section, ...list.filter((id) => !order.some((t) => t.topic === id))];
    void save(pinned ? { pinned: keep(display.pinned) } : { topic_order: keep(display.topic_order) });
  };

  return {
    display,
    status,
    moveTo,
    /** One place up (-1) or down (1) within its section. */
    move(order: readonly ArrangedTopic[], topic: string, by: -1 | 1) {
      const t = order.find((x) => x.topic === topic);
      if (!t) return;
      const section = order.filter((x) => x.pinned === t.pinned);
      moveTo(order, topic, section.indexOf(t) + by);
    },
    pin: (topic: string, on: boolean) => save({ pinned: on ? [...without(display.pinned, topic), topic] : without(display.pinned, topic) }),
    collapse: (topic: string, on: boolean) =>
      save({ collapsed: on ? [...without(display.collapsed, topic), topic] : without(display.collapsed, topic) }),
    /** The blur switch: on blurs the Topic's Items until tapped. The Brief is fetched again to show it. */
    async blur(topic: string, on: boolean) {
      if (await save({ unblurred: on ? without(display.unblurred, topic) : [...without(display.unblurred, topic), topic] })) router.refresh();
    },
    widgets: (widgets: WidgetKey[]) => save({ widgets }),
    dock: (dock: typeof display.dock) => save({ dock }),
  };
}

export type Arrange = ReturnType<typeof useArrange>;

/** Where a Topic sits in its section: whether it can move up or down. */
function placeIn(order: readonly ArrangedTopic[], t: ArrangedTopic) {
  const section = order.filter((x) => x.pinned === t.pinned);
  const i = section.indexOf(t);
  return { first: i === 0, last: i === section.length - 1 };
}

/** Move up and move down, for keyboards and screen readers (and anyone who would rather not drag). */
export function ReorderButtons({
  name,
  first,
  last,
  onMove,
  className,
}: {
  name: string;
  first: boolean;
  last: boolean;
  onMove(by: -1 | 1): void;
  className?: string;
}) {
  const { t } = useLanguage();
  return (
    <>
      <button type="button" className={className ?? s.icon} aria-label={t(`Move ${name} up`, `نقل ${name} للأعلى`)} disabled={first} onClick={() => onMove(-1)}>
        <Icon name="up" size={18} />
      </button>
      <button type="button" className={className ?? s.icon} aria-label={t(`Move ${name} down`, `نقل ${name} للأسفل`)} disabled={last} onClick={() => onMove(1)}>
        <Icon name="down" size={18} />
      </button>
    </>
  );
}

/**
 * A Topic's controls: move up and down, pin, collapse and, for a Sensitive Topic, the blur switch. On a
 * Front Page or List heading in Edit mode (with a drag handle, `onDragStart`), and on each row of <TopicList>.
 */
export function TopicControls({
  topic,
  order,
  arrange,
  onDragStart,
}: {
  topic: ArrangedTopic;
  order: readonly ArrangedTopic[];
  arrange: Arrange;
  onDragStart?(e: DragEvent): void;
}) {
  const { t } = useLanguage();
  const { first, last } = placeIn(order, topic);
  const name = topic.name;
  return (
    <span className={s.controls} role="group" aria-label={t(`Arrange ${name}`, `ترتيب ${name}`)}>
      {onDragStart && (
        // The drag handle; the buttons beside it do the same without dragging.
        <span className={s.grip} draggable onDragStart={onDragStart} title={t("Drag to reorder", "اسحب لإعادة الترتيب")} aria-hidden>
          <Icon name="grip" size={18} />
        </span>
      )}
      <ReorderButtons name={name} first={first} last={last} onMove={(by) => arrange.move(order, topic.topic, by)} />
      <button
        type="button"
        className={s.icon}
        aria-label={t(`Pin ${name}`, `تثبيت ${name}`)}
        aria-pressed={topic.pinned}
        onClick={() => void arrange.pin(topic.topic, !topic.pinned)}
      >
        <Icon name="pushpin" size={18} filled={topic.pinned} />
      </button>
      <button
        type="button"
        className={s.icon}
        aria-label={t(`Collapse ${name}`, `طيّ ${name}`)}
        aria-pressed={topic.collapsed}
        onClick={() => void arrange.collapse(topic.topic, !topic.collapsed)}
      >
        <Icon name="minus" size={18} />
      </button>
      {topic.sensitive && <BlurSwitch topic={topic} arrange={arrange} />}
    </span>
  );
}

function BlurSwitch({ topic, arrange }: { topic: ArrangedTopic; arrange: Arrange }) {
  const { t } = useLanguage();
  return (
    <label className={s.switch}>
      <input
        type="checkbox"
        role="switch"
        checked={!arrange.display.unblurred.includes(topic.topic)}
        onChange={(e) => void arrange.blur(topic.topic, e.target.checked)}
      />
      <span>{t(`Blur ${topic.name}`, `تمويه ${topic.name}`)}</span>
    </label>
  );
}

/** Every Topic as a row: its name (with a pin mark when pinned) and its controls. */
export function TopicList({ order, arrange, label }: { order: readonly ArrangedTopic[]; arrange: Arrange; label: string }) {
  const { t } = useLanguage();
  if (order.length === 0) {
    return <p className={s.empty}>{t("You don't follow any Topics yet.", "لا تتابع أي موضوع بعد.")}</p>;
  }
  return (
    <ul className={s.list} aria-label={label}>
      {order.map((topic) => (
        <li key={topic.topic} className={s.row}>
          <span className={s.name}>
            {topic.pinned && <Icon name="pushpin" size={15} filled className={s.pinMark} />}
            <span dir="auto">{topic.name}</span>
            {topic.collapsed && <small>{t("Headlines only", "العناوين فقط")}</small>}
          </span>
          <TopicControls topic={topic} order={order} arrange={arrange} />
        </li>
      ))}
    </ul>
  );
}

/**
 * An ordered pick from `options`: the `chosen` ones in order, each with move up, move down and remove, then
 * the others, each with add. `min` chosen at least (remove is off below it). `onChange` gets the new order.
 */
export function PickList<K extends string>({
  label,
  options,
  chosen,
  labels,
  min = 0,
  onChange,
}: {
  label: string;
  options: readonly K[];
  chosen: readonly K[];
  labels: Record<K, readonly [en: string, ar: string]>;
  min?: number;
  onChange(next: K[]): void;
}) {
  const { t } = useLanguage();
  const name = (k: K) => t(labels[k][0], labels[k][1]);
  const rest = options.filter((k) => !chosen.includes(k));
  const moved = (k: K, by: -1 | 1) => {
    const next = [...chosen];
    const i = next.indexOf(k);
    next.splice(i, 1);
    next.splice(i + by, 0, k);
    return next;
  };
  return (
    <div className={s.pick} role="group" aria-label={label}>
      <ul className={s.list} aria-label={label}>
        {chosen.map((k, i) => (
          <li key={k} className={s.row}>
            <span className={s.name}>{name(k)}</span>
            <span className={s.controls}>
              <ReorderButtons name={name(k)} first={i === 0} last={i === chosen.length - 1} onMove={(by) => onChange(moved(k, by))} />
              <button
                type="button"
                className={s.icon}
                aria-label={t(`Remove ${name(k)}`, `إزالة ${name(k)}`)}
                disabled={chosen.length <= min}
                onClick={() => onChange(chosen.filter((x) => x !== k))}
              >
                <Icon name="x" size={18} />
              </button>
            </span>
          </li>
        ))}
      </ul>
      {rest.length > 0 && (
        <ul className={s.more} aria-label={t("Add back", "إضافة")}>
          {rest.map((k) => (
            <li key={k}>
              <button type="button" className={s.add} onClick={() => onChange([...chosen, k])}>
                <Icon name="plus" size={16} />
                {t(`Add ${name(k)}`, `إضافة ${name(k)}`)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * The Cover's Widgets to arrange: the Widget kinds on the Cover, in order, then the removed ones the Reader is
 * eligible for (`more`), to add back. A kind the Reader is not eligible for right now (no city, not following
 * its Topic) is left out; Me › Display lists every kind instead.
 */
export function WidgetPicks({ shown, more, arrange }: { shown: BriefWidget[]; more: BriefWidget[]; arrange: Arrange }) {
  const { t } = useLanguage();
  const kinds = (ws: BriefWidget[]) => [...new Set(ws.map((w) => w.kind as WidgetKey))];
  const chosen = kinds(shown);
  const options = [...chosen, ...kinds(more)];
  if (options.length === 0) {
    return <p className={s.empty}>{t("No Widgets have anything for you today.", "لا توجد أدوات لديها ما تعرضه لك اليوم.")}</p>;
  }
  // Keep the Display's other kinds (not eligible today) where they were, after these.
  const keepOthers = (next: WidgetKey[]) => [...next, ...arrange.display.widgets.filter((k) => !options.includes(k))];
  return (
    <PickList
      label={t("Cover Widgets", "أدوات الغلاف")}
      options={options}
      chosen={chosen}
      labels={WIDGET_LABELS}
      onChange={(next) => void arrange.widgets(keepOthers(next))}
    />
  );
}

/** "Saved." or the error, after a change. */
export function SaveStatus({ status }: { status: Arrange["status"] }) {
  const { t } = useLanguage();
  return (
    <p className={`${c.status} ${status === "failed" ? c.error : ""}`} role="status" data-testid="arrange-status">
      {status === "saved" && t("Saved.", "تم الحفظ.")}
      {status === "failed" && t("Couldn't save. Check your connection and try again.", "تعذّر الحفظ. تحقّق من اتصالك وحاول مجددًا.")}
    </p>
  );
}

/** Swipe's Edit mode: a sheet with the Topics and the Cover's Widgets. Changes save as they happen; Done closes it. */
export function EditSheet({
  order,
  widgets,
  moreWidgets,
  onDone,
}: {
  order: readonly ArrangedTopic[];
  widgets: BriefWidget[];
  moreWidgets: BriefWidget[];
  onDone(): void;
}) {
  const { t } = useLanguage();
  const arrange = useArrange();
  return (
    <Sheet label={t("Arrange your Brief", "ترتيب موجزك")} title={t("Arrange your Brief", "ترتيب موجزك")} onClose={onDone}>
      <p className={s.lede}>{t("Changes save as you make them.", "تُحفظ التغييرات فور إجرائها.")}</p>
      <h3 className={c.sectionTitle}>{t("Topics", "المواضيع")}</h3>
      <TopicList order={order} arrange={arrange} label={t("Topics", "المواضيع")} />
      <h3 className={c.sectionTitle}>{t("Cover Widgets", "أدوات الغلاف")}</h3>
      <WidgetPicks shown={widgets} more={moreWidgets} arrange={arrange} />
      <SaveStatus status={arrange.status} />
      <button type="button" className={s.done} onClick={onDone}>
        {t("Done", "تم")}
      </button>
    </Sheet>
  );
}
