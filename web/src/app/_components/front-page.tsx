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
// - A sensitive Item keeps its picture and headline blurred until tapped.
//   Explicit media (`media_blurred`, rework ticket 10) keeps its own veil on
//   a card's picture until tapped (<MediaVeil>); a row's thumbnail never shows
//   it (`previewKind`). A Brief of only Sensitive Items shows the
//   nothing-to-show note in the Cover header (<NothingToShow>), as Swipe's
//   Cover does, and its Items follow, veiled.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Layout } from "@/server/display/shape";
import type { Brief, BriefItem } from "@/server/brief/compose";
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
}: {
  layout: Exclude<Layout, "swipe">;
  screen: Screen;
  reactions: ReactionsState;
  basePath: string;
}) {
  const { brief } = reactions;
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
        items: g.item_ids.map((id) => byId.get(id)!),
      })),
    [brief, byId, lang, t],
  );

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
    const sections = [...root.querySelectorAll<HTMLElement>("[data-group]")];
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
  const latest = useRef({ order, paneId, paneItem, asking, wide, show, reactions });
  latest.current = { order, paneId, paneItem, asking, wide, show, reactions };
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const { order, paneId, paneItem, asking, wide, show, reactions } = latest.current;
      // Esc backs out of Ask even from its question box; a sheet open over the page takes it first.
      if (e.key === "Escape" && !e.defaultPrevented && !sheetOpen()) {
        if (asking) setAsking(false);
        else if (paneId && !wide) close();
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
        <TopicTabs className={s.tabs} tabs={groups.map(({ key, label }) => ({ key, label }))} current={currentTab} onPick={jumpTo} />
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
                <LanguageToggle className={s.lang} />
              </div>
              {!wide && <WidgetRows widgets={brief.cover!.widgets} className={s.coverWidgets} />}
            </section>

            {groups.map((group) => (
              <Group
                key={group.key}
                group={group}
                top={group.key === FOR_YOU}
                list={list}
                tile={tileProps}
              />
            ))}

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
          <WidgetRows widgets={brief.cover!.widgets} />
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

/** One group: its heading, then a shelf of cards (Front Page; a row of big ones for "For you") or rows (List). */
function Group({
  group,
  top,
  list,
  tile,
}: {
  group: { key: string; label: string; items: BriefItem[] };
  top: boolean;
  list: boolean;
  tile(item: BriefItem): TileProps;
}) {
  const { lang, t } = useLanguage();
  const shelf = useRef<HTMLDivElement>(null);
  const id = `group-${group.key}`;
  const scroll = (by: 1 | -1) => {
    const el = shelf.current;
    if (!el) return;
    // Forward is to the end side: the left in Arabic, where scrollLeft runs negative.
    const sign = getComputedStyle(el).direction === "rtl" ? -1 : 1;
    el.scrollBy({ left: by * sign * el.clientWidth * 0.8, behavior: prefersReducedMotion() ? "auto" : "smooth" });
  };
  const shelved = !list && !top;
  return (
    <section className={s.group} data-group={group.key} aria-labelledby={id}>
      <div className={list ? `${s.head} ${s.sticky}` : s.head}>
        <h2 id={id} className={s.title}>
          {group.label}
        </h2>
        <span className={s.count}>{formatNumber(group.items.length, lang)}</span>
        {shelved && (
          <span className={s.shelfNav}>
            <button type="button" className={s.shelfButton} aria-label={t(`Scroll ${group.label} back`, `تمرير ${group.label} للخلف`)} onClick={() => scroll(-1)}>
              <Chevron to="back" size={18} />
            </button>
            <button type="button" className={s.shelfButton} aria-label={t(`Scroll ${group.label} forward`, `تمرير ${group.label} للأمام`)} onClick={() => scroll(1)}>
              <Chevron to="forward" size={18} />
            </button>
          </span>
        )}
      </div>
      {list ? (
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
