"use client";
// Front Page (Shelves) and List (rework ticket 09, spec #6): the Brief as one
// scrolling page on the dark canvas, for skimming a whole Edition.
//
// - Topic tabs across the top follow the scrolling (a scroll spy) and jump to
//   a group; the sidebar's Topics jump the same way.
// - The Cover as a header: greeting, date, Edition, the Layout switch and a
//   row of Widgets (on wide the Widgets have their own column instead).
// - Front Page: "For you", up to 3 big portrait cards (3:4) with their
//   why-lines in one row, then one sideways shelf of portrait cards (10:15)
//   per Topic, in Brief order. A shelf snaps; back/forward buttons show when
//   the shelf is hovered.
// - List: the same groups as rows (a square thumbnail, **Topic** · time ·
//   Updated, a one-line headline) under sticky headings.
// - Clicking a card or row opens it in the reader pane (<ReaderPane>), which
//   records an open, so the Item dims. The Item being read is outlined in the
//   accent. j/k (and the arrows) move the pane through the Brief's order, `a`
//   opens Ask inside it, Esc goes from Ask to the card and then closes it. On
//   wide the pane is always open, starting on the first top story.
// - Arranging (rework ticket 11): groups come in the Reader's Display order,
//   a Pinned Topic with a pin by its name. A Collapsed Topic is a one-row
//   strip of its headlines with an Expand button; hovering a heading offers
//   to collapse it. A followed Topic with nothing in this Edition says
//   "nothing qualified". Edit mode (the Edit button or `e`; Done leaves) puts
//   quiet controls on each Topic heading: a drag handle, move up and down, pin,
//   collapse and, for a Sensitive Topic, the blur switch. The cards stay still,
//   and the Cover's Widgets are edited in place. Every change saves at once.
// - A sensitive Item keeps its picture and headline blurred until tapped.
//   Explicit media (`media_blurred`, rework ticket 10) keeps its own veil on
//   a card's picture until tapped (<MediaVeil>); a row's thumbnail never shows
//   it (`previewKind`). A Brief of only Sensitive Items shows the
//   nothing-to-show note in the Cover header (<NothingToShow>), as Swipe's
//   Cover does, and its Items follow, veiled.
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import type { Layout } from "@/server/display/shape";
import type { Brief, BriefGroup, BriefItem } from "@/server/brief/compose";
import { arrangedTopics, EditButton, TopicControls, useArrange, WidgetPicks, type Arrange, type ArrangedTopic } from "./arrange";
import type { EditMode } from "./brief-layouts";
import { Chevron } from "./chevron";
import { prefersReducedMotion, useNow } from "./client-time";
import { NothingToShow, useCoverLines } from "./cover";
import { WidgetRows } from "./cover-widgets";
import { formatNextEdition, timeSince } from "./format";
import { formatNumber, localized, topicName } from "./i18n";
import { Icon } from "./icons";
import { ItemImage, MediaVeil, useMediaVeil } from "./item-image";
import { LanguageToggle, useLanguage } from "./language";
import { LayoutSwitch } from "./layout-switch";
import { UndoToast, type ReactionsState } from "./reactions";
import { ReadSheet } from "./read-sheet";
import { ReaderPane } from "./reader-pane";
import { pictureKind, previewKind, type PictureKind } from "./reels-card";
import { hasSidebar, type Screen } from "./screen-class";
import { isShortcut, itemShortcut, runItemShortcut, useShortcuts } from "./shortcuts";
import { sheetOpen } from "./sheet";
import { SidebarTopics } from "./tab-bar";
import { FOR_YOU, groupKey, TopicTabs } from "./topic-tabs";
import s from "./front-page.module.css";

export function FrontPage({
  layout,
  screen,
  reactions,
  basePath,
  edit,
}: {
  layout: Exclude<Layout, "swipe">;
  screen: Screen;
  reactions: ReactionsState;
  basePath: string;
  edit: EditMode;
}) {
  const { brief } = reactions;
  const { editing, setEditing } = edit;
  const arrange = useArrange();
  const { lang, t } = useLanguage();
  const now = useNow();
  const wide = screen.class === "wide";
  const list = layout === "list";

  // The Brief's order, which j/k follow: the top stories, then each Topic's Items.
  const order = useMemo(() => brief.groups.flatMap((g) => g.item_ids), [brief.groups]);
  const byId = useMemo(() => new Map(brief.items.map((i) => [i.id, i])), [brief.items]);
  const groups = useMemo(
    () =>
      brief.groups.map((g) => ({
        key: groupKey(g),
        label: g.kind === "top" ? t("For you", "لك") : topicName(brief, g.topic!, lang),
        group: g,
        items: g.item_ids.map((id) => byId.get(id)!),
      })),
    [brief, byId, lang, t],
  );
  // The Topics in order, for the arranging controls.
  const topics = useMemo(() => arrangedTopics(brief.groups, (id) => topicName(brief, id, lang)), [brief, lang]);
  // The Topic being dragged by its handle, in Edit mode.
  const [dragging, setDragging] = useState<string | null>(null);

  // The reader pane: the Item the Reader opened in it, how it arrived, and whether Ask is open.
  const [picked, setPicked] = useState<string | null>(null);
  const [dir, setDir] = useState<"next" | "prev" | null>(null);
  const [asking, setAsking] = useState(false);
  const [reading, setReading] = useState<string | null>(null);
  // Sensitive Items whose headline the Reader has tapped to see, on this page.
  const [revealed, setRevealed] = useState<ReadonlySet<string>>(new Set());
  // The Item in the pane: the one picked; once it is hidden, the one that took its place;
  // on wide with nothing picked yet, the first top story.
  const lastIndex = useRef(0);
  const paneId =
    picked === null
      ? wide
        ? order[0] ?? null
        : null
      : byId.has(picked)
        ? picked
        : order[Math.min(lastIndex.current, order.length - 1)] ?? null;
  const paneIndex = paneId ? order.indexOf(paneId) : -1;
  if (paneIndex >= 0) lastIndex.current = paneIndex;
  const paneItem = paneId ? byId.get(paneId) : undefined;

  const page = useRef<HTMLDivElement>(null);
  const pane = useRef<HTMLElement>(null);

  const show = useCallback(
    (id: string, how: "next" | "prev" | null = null) => {
      const item = byId.get(id);
      if (!item) return;
      setPicked(id);
      setDir(how);
      setAsking(false);
      // Opening an Item records an open (it dims), but a veiled one is not seen yet.
      if (!item.blurred || revealed.has(id)) reactions.opened(item);
      page.current
        ?.querySelector(`[data-item="${CSS.escape(id)}"]`)
        ?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: prefersReducedMotion() ? "auto" : "smooth" });
    },
    [byId, reactions, revealed],
  );
  const close = () => {
    setPicked(null);
    setAsking(false);
  };

  // Topic tabs: the group at the top of the page, kept in step by a scroll spy.
  const scroller = useRef<HTMLDivElement>(null);
  const [currentTab, setCurrentTab] = useState(groups[0]?.key ?? FOR_YOU);
  // A jump in progress: the tab it picked stays current until the scrolling stops (the
  // last groups can't reach the top of the page, so the spy would pick an earlier one).
  const jumping = useRef(false);
  useEffect(() => {
    const root = scroller.current;
    if (!root) return;
    const seen = new Set<Element>();
    // Only groups with a Topic tab: a Topic with nothing in this Edition has none.
    const sections = [...root.querySelectorAll<HTMLElement>("[data-group]:not([data-no-tab])")];
    const spy = new IntersectionObserver(
      (entries) => {
        for (const e of entries) (e.isIntersecting ? seen.add(e.target) : seen.delete(e.target));
        const first = sections.find((el) => seen.has(el));
        if (first && !jumping.current) setCurrentTab(first.dataset.group!);
      },
      { root, rootMargin: "0px 0px -75% 0px" },
    );
    sections.forEach((el) => spy.observe(el));
    const landed = () => (jumping.current = false);
    root.addEventListener("scrollend", landed);
    return () => {
      spy.disconnect();
      root.removeEventListener("scrollend", landed);
    };
  }, [groups.length, layout]);
  const jumpTo = (key: string) => {
    const root = scroller.current;
    const section = root?.querySelector<HTMLElement>(`[data-group="${CSS.escape(key)}"]`);
    if (!root || !section) return;
    setCurrentTab(key);
    jumping.current = true;
    root.scrollTo({ top: key === groups[0]?.key ? 0 : section.offsetTop - 4, behavior: prefersReducedMotion() ? "auto" : "smooth" });
  };

  // The keys: j/k and the arrows move the pane, Enter opens (or reads), s/l/h/a act on the open Item, Esc backs out.
  const latest = useRef({ order, paneId, paneItem, asking, wide, show, reactions, editing, setEditing });
  latest.current = { order, paneId, paneItem, asking, wide, show, reactions, editing, setEditing };
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const { order, paneId, paneItem, asking, wide, show, reactions, editing, setEditing } = latest.current;
      // Esc backs out of Ask even from its question box, then closes the pane, then leaves Edit mode;
      // a sheet open over the page takes it first.
      if (e.key === "Escape" && !e.defaultPrevented && !sheetOpen()) {
        if (asking) setAsking(false);
        else if (paneId && !wide) close();
        else if (editing) setEditing(false);
        else return;
        e.preventDefault();
        return;
      }
      if (!isShortcut(e) || e.shiftKey) return;
      const i = paneId ? order.indexOf(paneId) : -1;
      const onControl = e.target instanceof Element && e.target.closest("button, a[href], input, label") !== null;
      if (e.key === "j" || e.key === "ArrowDown") {
        const next = order[i < 0 ? 0 : Math.min(i + 1, order.length - 1)];
        if (next && next !== paneId) show(next, i < 0 ? null : "next");
      } else if (e.key === "k" || e.key === "ArrowUp") {
        const prev = order[Math.max(i - 1, 0)];
        if (prev && prev !== paneId) show(prev, i < 0 ? null : "prev");
      } else if (e.key === "Enter" && !onControl) {
        if (!paneItem) {
          if (order[0]) show(order[0]);
        } else if (!pane.current?.querySelector("article[data-locked]")) {
          reactions.opened(paneItem);
          setReading(paneItem.id);
        }
      } else {
        const action = itemShortcut(e);
        if (!action || !paneItem) return;
        runItemShortcut(action, paneItem, { reactions, card: pane.current, onAsk: () => setAsking(true) });
      }
      e.preventDefault();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const shortcuts = useShortcuts();

  const readItem = reading ? byId.get(reading) : undefined;
  const lines = useCoverLines(brief);
  const cover = brief.cover!;
  const widgetEditor = <WidgetPicks shown={cover.widgets} more={cover.more_widgets} arrange={arrange} />;
  const tileProps = (item: BriefItem) => ({
    item,
    brief,
    now,
    selected: item.id === paneId,
    revealed: revealed.has(item.id),
    onOpen: () => show(item.id),
    onReveal: () => setRevealed((all) => new Set(all).add(item.id)),
  });

  return (
    // The Brief canvas: dark in every theme. `data-pane` gives the pane its column where the sidebar shows.
    <div className={`${s.root} brief-canvas`} data-layout={layout} data-pane={paneItem ? "" : undefined}>
      <div ref={page} className={s.page}>
        <TopicTabs
          className={s.tabs}
          tabs={groups.filter((g) => !g.group.nothing_qualified).map(({ key, label, group }) => ({ key, label, pinned: group.pinned }))}
          current={currentTab}
          onPick={jumpTo}
        />
        {/* Edit mode: one quiet line under the tabs, outside the scrolling, so Done is always in reach. */}
        {editing && (
          <div className={s.editBar}>
            <p>{t("Arrange your Topics and Widgets. Changes save as you go.", "رتّب مواضيعك وأدواتك. تُحفظ التغييرات أولًا بأول.")}</p>
            <button type="button" className={s.done} onClick={() => setEditing(false)}>
              {t("Done", "تم")}
            </button>
          </div>
        )}
        <div ref={scroller} className={s.scroll}>
          <div className={s.inner}>
            <section className={s.cover} aria-label={t("Cover", "الغلاف")}>
              <div className={s.coverLines}>
                <p className={s.greeting}>{lines.greeting}</p>
                <h1 className={s.date}>{lines.date}</h1>
                <p className={s.edition}>{lines.edition}</p>
                <NothingToShow brief={brief} className={s.nothing} />
              </div>
              <div className={s.coverTools}>
                <LayoutSwitch />
                <EditButton editing={editing} onToggle={() => setEditing(!editing)} />
                <LanguageToggle className={s.lang} />
              </div>
              {!wide && (editing ? <div className={s.coverWidgets}>{widgetEditor}</div> : <WidgetRows widgets={cover.widgets} className={s.coverWidgets} />)}
            </section>

            {groups.map((group) => {
              const topic = topics.find((x) => x.topic === group.group.topic);
              return (
                <Group
                  key={group.key}
                  group={group}
                  top={group.key === FOR_YOU}
                  list={list}
                  tile={tileProps}
                  arranging={topic && { topic, order: topics, arrange, editing }}
                  drag={
                    topic && editing
                      ? {
                          start: (e) => {
                            e.dataTransfer.setData("text/plain", topic.topic);
                            e.dataTransfer.effectAllowed = "move";
                            setDragging(topic.topic);
                          },
                          // Drops land within the dragged Topic's section: pinned among pinned, the others among the others.
                          accepts: () => {
                            const from = topics.find((x) => x.topic === dragging);
                            return !!from && from.pinned === topic.pinned && from !== topic;
                          },
                          drop: () => {
                            if (dragging) arrange.moveTo(topics, dragging, topics.filter((x) => x.pinned === topic.pinned).indexOf(topic));
                            setDragging(null);
                          },
                          end: () => setDragging(null),
                        }
                      : undefined
                  }
                />
              );
            })}

            <p className={s.end}>
              <Icon name="up" size={22} />
              <b>{t("You're caught up", "انتهيت من الموجز")}</b>
              <span>{formatNextEdition(brief, lang)}</span>
            </p>
          </div>
        </div>
        <UndoToast reactions={reactions} />
      </div>

      {paneItem && (
        <ReaderPane
          paneRef={pane}
          item={paneItem}
          position={paneIndex + 1}
          total={order.length}
          dir={dir}
          asking={asking}
          revealed={revealed.has(paneItem.id)}
          closable={!wide}
          brief={brief}
          now={now}
          reactions={reactions}
          basePath={basePath}
          onRead={(item) => setReading(item.id)}
          onAsk={() => setAsking(true)}
          onBack={() => setAsking(false)}
          onClose={close}
        />
      )}

      {wide && (
        <aside className={s.widgets} aria-label={t("Today", "اليوم")}>
          <h2 className={s.widgetsTitle}>{t("Today", "اليوم")}</h2>
          {editing ? widgetEditor : <WidgetRows widgets={cover.widgets} />}
        </aside>
      )}

      {hasSidebar(screen) && <SidebarTopics brief={brief} onPick={jumpTo} />}
      {readItem && (
        <ReadSheet
          item={readItem}
          brief={brief}
          now={now}
          reactions={reactions}
          onAsk={() => {
            setReading(null);
            show(readItem.id);
            setAsking(true);
          }}
          onClose={() => setReading(null)}
        />
      )}
      {shortcuts}
    </div>
  );
}

type TileProps = {
  item: BriefItem;
  brief: Brief;
  now: number | null;
  selected: boolean;
  revealed: boolean;
  onOpen(): void;
  onReveal(): void;
};

/** Dragging a Topic heading by its handle (Edit mode). */
type GroupDrag = { start(e: DragEvent): void; accepts(): boolean; drop(): void; end(): void };

/**
 * One group: its heading, then a shelf of cards (Front Page; a row of big ones for "For you") or rows
 * (List); a Collapsed Topic's strip of headlines; or a nothing-qualified note. `arranging` is set for a
 * Topic: its place and marks, and the controls (on hover: collapse; in Edit mode: all of them).
 */
function Group({
  group,
  top,
  list,
  tile,
  arranging,
  drag,
}: {
  group: { key: string; label: string; group: BriefGroup; items: BriefItem[] };
  top: boolean;
  list: boolean;
  tile(item: BriefItem): TileProps;
  arranging?: { topic: ArrangedTopic; order: readonly ArrangedTopic[]; arrange: Arrange; editing: boolean };
  drag?: GroupDrag;
}) {
  const { lang, t } = useLanguage();
  const { pinned, collapsed, nothing_qualified: empty, note } = group.group;
  const [over, setOver] = useState(false);
  const shelf = useRef<HTMLDivElement>(null);
  const id = `group-${group.key}`;
  const scroll = (by: 1 | -1) => {
    const el = shelf.current;
    if (!el) return;
    // Forward is to the end side: the left in Arabic, where scrollLeft runs negative.
    const sign = getComputedStyle(el).direction === "rtl" ? -1 : 1;
    el.scrollBy({ left: by * sign * el.clientWidth * 0.8, behavior: prefersReducedMotion() ? "auto" : "smooth" });
  };
  const shelved = !list && !top && !collapsed && !empty;
  const editing = !!arranging?.editing;
  return (
    <section
      className={s.group}
      data-group={group.key}
      data-no-tab={empty || undefined}
      data-drop={over || undefined}
      aria-labelledby={id}
      onDragOver={(e) => {
        if (!drag?.accepts()) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        drag?.drop();
      }}
    >
      <div className={list ? `${s.head} ${s.sticky}` : s.head}>
        <h2 id={id} className={s.title}>
          {pinned && <Icon name="pushpin" size={16} filled className={s.pin} />}
          {group.label}
        </h2>
        {!empty && <span className={s.count}>{formatNumber(group.items.length, lang)}</span>}
        {editing && arranging ? (
          <span className={s.editControls} onDragEnd={drag?.end}>
            <TopicControls topic={arranging.topic} order={arranging.order} arrange={arranging.arrange} onDragStart={drag?.start} />
          </span>
        ) : arranging && collapsed ? (
          <button type="button" className={s.expand} aria-label={t(`Expand ${group.label}`, `توسيع ${group.label}`)} onClick={() => void arranging.arrange.collapse(arranging.topic.topic, false)}>
            {t("Expand", "توسيع")}
          </button>
        ) : (
          arranging &&
          !empty && (
            <span className={s.shelfNav}>
              <button
                type="button"
                className={s.shelfButton}
                aria-label={t(`Collapse ${group.label}`, `طيّ ${group.label}`)}
                title={t("Collapse to headlines", "طيّ إلى العناوين")}
                onClick={() => void arranging.arrange.collapse(arranging.topic.topic, true)}
              >
                <Icon name="minus" size={18} />
              </button>
              {shelved && (
                <>
                  <button type="button" className={s.shelfButton} aria-label={t(`Scroll ${group.label} back`, `تمرير ${group.label} للخلف`)} onClick={() => scroll(-1)}>
                    <Chevron to="back" size={18} />
                  </button>
                  <button type="button" className={s.shelfButton} aria-label={t(`Scroll ${group.label} forward`, `تمرير ${group.label} للأمام`)} onClick={() => scroll(1)}>
                    <Chevron to="forward" size={18} />
                  </button>
                </>
              )}
            </span>
          )
        )}
      </div>
      {empty ? (
        <p className={s.nothingQualified} data-testid="nothing-qualified">
          {t("Nothing qualified in this Edition.", "لم يتأهل شيء في هذه الطبعة.")}
          {note && ` ${note}`}
        </p>
      ) : collapsed ? (
        <ul className={s.strip}>
          {group.items.map((item) => (
            <li key={item.id}>
              <StripHeadline {...tile(item)} />
            </li>
          ))}
        </ul>
      ) : list ? (
        <div className={s.rows}>
          {group.items.map((item) => (
            <Row key={item.id} {...tile(item)} />
          ))}
        </div>
      ) : (
        <div ref={shelf} className={top ? s.tops : s.shelf}>
          {group.items.map((item) => (
            <Tile key={item.id} big={top} {...tile(item)} />
          ))}
        </div>
      )}
    </section>
  );
}

/**
 * What a card or row shows for an Item: its picture kind, names and lines, in the Reader's language. `preview`:
 * a small picture with no veil of its own (a row's thumbnail), so none for explicit media, or for a sensitive
 * Item the Reader has not tapped open.
 */
function useItemLines(item: BriefItem, brief: Brief, now: number | null, preview?: { revealed: boolean }) {
  const { lang, t } = useLanguage();
  const [broken, setBroken] = useState(false);
  const shown = !preview ? pictureKind(item) : preview.revealed ? previewKind({ ...item, blurred: false }) : previewKind(item);
  const kind: PictureKind = broken ? "none" : shown;
  const name = topicName(brief, item.topic, lang);
  const meta = (
    <>
      <b>{name}</b>
      {now !== null && (
        <>
          {" · "}
          <time dateTime={item.time}>{timeSince(item.time, now, lang)}</time>
        </>
      )}
      {item.status === "updated" && ` · ${t("Updated", "محدَّث")}`}
    </>
  );
  return {
    kind,
    name,
    meta,
    title: localized(item, "title", lang)!,
    why: item.top ? localized(item, "why_for_you", lang) : null,
    warning: localized(item, "warning", lang),
    onFail: () => setBroken(true),
  };
}

/** What a card and a row both say about their Item, as data attributes the CSS (and tests) read. */
function itemAttrs(item: BriefItem, kind: PictureKind, selected: boolean, locked: boolean, mediaLocked = false) {
  return {
    "data-item": item.id,
    "data-picture": kind,
    "data-selected": selected || undefined,
    "data-dimmed": item.dimmed && !selected,
    "data-locked": locked || undefined,
    "data-media-locked": mediaLocked || undefined,
  };
}

/** A portrait card: 10:15 on a shelf, 3:4 for a top story (with its why-line). */
function Tile({ item, brief, now, selected, revealed, onOpen, onReveal, big }: TileProps & { big: boolean }) {
  const { t } = useLanguage();
  const { kind, name, meta, title, why, warning, onFail } = useItemLines(item, brief, now);
  const locked = item.blurred && !revealed;
  const media = useMediaVeil(item, kind !== "none");
  return (
    <article className={s.tile} data-big={big || undefined} {...itemAttrs(item, kind, selected, locked, media.locked)}>
      <div className={s.tilePicture}>
        {kind === "photo" ? <ItemImage className={s.photo} src={item.image!} onFail={onFail} /> : <div className={s.plain} />}
      </div>
      <div className={s.tileText} inert={locked} aria-hidden={locked || undefined}>
        {kind === "card" && (
          <span className={s.badge}>
            <ItemImage src={item.image!} onFail={onFail} />
          </span>
        )}
        {big && why && (
          <p className={s.why} dir="auto" data-testid="why-for-you">
            <Icon name="sparkle" size={14} />
            <span>{why}</span>
          </p>
        )}
        <p className={s.meta}>{meta}</p>
        <h3 className={s.tileTitle} dir="auto">
          <button type="button" className={s.opener} onClick={onOpen}>
            {title}
          </button>
        </h3>
      </div>
      {!locked && media.locked && <MediaVeil className={`${s.reveal} ${s.mediaReveal}`} onReveal={media.reveal} />}
      {locked && (
        <button type="button" className={s.reveal} onClick={onReveal}>
          <Icon name="hide" size={24} />
          <b>{name}</b>
          {warning && <span dir="auto">{warning}</span>}
          <em>{t("Tap to view", "اضغط للعرض")}</em>
        </button>
      )}
    </article>
  );
}

/** A headline in a Collapsed Topic's strip. A sensitive one is named by its Topic until tapped, then opens. */
function StripHeadline({ item, brief, selected, revealed, onOpen, onReveal }: TileProps) {
  const { lang, t } = useLanguage();
  const locked = item.blurred && !revealed;
  const name = topicName(brief, item.topic, lang);
  return (
    <button
      type="button"
      className={s.stripItem}
      dir="auto"
      data-item={item.id}
      data-selected={selected || undefined}
      data-dimmed={item.dimmed && !selected}
      onClick={() => {
        if (locked) onReveal();
        onOpen();
      }}
    >
      {locked ? t(`Sensitive Item: ${name} · Tap to view`, `عنصر حساس: ${name} · اضغط للعرض`) : localized(item, "title", lang)}
    </button>
  );
}

/** A List row: a square thumbnail, the meta line and a one-line headline. */
function Row({ item, brief, now, selected, revealed, onOpen, onReveal }: TileProps) {
  const { t } = useLanguage();
  const { kind, name, meta, title, onFail } = useItemLines(item, brief, now, { revealed });
  const locked = item.blurred && !revealed;
  return (
    <article className={s.row} {...itemAttrs(item, kind, selected, locked)}>
      <span className={s.thumb}>{kind !== "none" && <ItemImage src={item.image!} onFail={onFail} />}</span>
      <div className={s.rowText}>
        <p className={s.meta}>
          {meta}
          {locked && ` · ${t("Tap to view", "اضغط للعرض")}`}
        </p>
        <h3 className={s.rowTitle} dir="auto" inert={locked} aria-hidden={locked || undefined}>
          <button type="button" className={s.opener} onClick={onOpen}>
            {title}
          </button>
        </h3>
      </div>
      {locked && (
        <button
          type="button"
          className={s.rowReveal}
          aria-label={t(`Sensitive Item: ${name}. Tap to view`, `عنصر حساس: ${name}. اضغط للعرض`)}
          onClick={onReveal}
        />
      )}
    </article>
  );
}
