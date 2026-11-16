"use client";
// The Swipe Brief in the Reels look (rework ticket 08, spec #6): the Cover,
// then one Item per screen on the dark Brief canvas, then "You're caught up".
//
// Moving: a vertical drag snaps exactly one slide per stop (CSS scroll snap
// with scroll-snap-stop: always). Tapping the upper third of the picture goes
// back and the lower third forward (the middle third is left for double-tap to
// like); j/k, the up/down arrows, Space and Page Down/Up move too, and Enter
// opens the read sheet. Only the slide on screen is interactive and exposed
// to assistive tech: the others are inert and aria-hidden.
//
// Topic tabs across the top ("For you", then the Topics in Brief order) follow
// the Item on screen and jump to a Topic's first Item. Each Item is a
// <ReelsCard> with its rail; tapping its text opens the read sheet, Ask opens
// the Ask sheet, and Hide asks why and offers Undo (reactions.tsx). A
// sensitive Item is veiled until tapped, every time it comes round; moving
// past it never reveals it.
//
// From 1024px wide the card sits centred with the rail beside it, and from
// 1280px an "Up next" list and the Widgets ("Today") sit at the end side.
// Where the sidebar shows (rework ticket 09) it lists the Topics, which jump
// like the tabs, and the PC shortcuts (shortcuts.tsx) work on the Item on screen.
//
// Arranging (rework ticket 11): the groups come in the Reader's Display order.
// A Collapsed Topic is one digest card listing its headlines; opening it (or
// one of its headlines) puts its Items in its place for this visit. A
// followed Topic with nothing in this Edition is named on the closing screen.
// Edit mode (Edit on the Cover, or `e`) opens a sheet with the Topic and
// Widget controls (<EditSheet>); changes save at once, Done closes it.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Brief, BriefGroup, BriefItem } from "@/server/brief/compose";
import { arrangedTopics, EditSheet } from "./arrange";
import { AskSheet } from "./ask-sheet";
import type { EditMode } from "./brief-layouts";
import { CaughtUp, Cover } from "./cover";
import { WidgetRows } from "./cover-widgets";
import { prefersReducedMotion, useNow } from "./client-time";
import { itemCount, timeSince } from "./format";
import { localized, topicName } from "./i18n";
import { Icon } from "./icons";
import { ItemImage } from "./item-image";
import { useLanguage } from "./language";
import { UndoToast, type ReactionsState } from "./reactions";
import { ReadSheet } from "./read-sheet";
import { previewKind, ReelsCard } from "./reels-card";
import { hasSidebar, useScreen } from "./screen-class";
import { isShortcut, itemShortcut, runItemShortcut, useShortcuts } from "./shortcuts";
import { SidebarTopics } from "./tab-bar";
import { FOR_YOU, groupKey, TopicTabs } from "./topic-tabs";
import s from "./swipe-brief.module.css";

export function SwipeBrief({ reactions, basePath, edit }: { reactions: ReactionsState; basePath: string; edit: EditMode }) {
  const { brief } = reactions;
  const { lang, t } = useLanguage();
  const now = useNow();
  const byId = useMemo(() => new Map(brief.items.map((i) => [i.id, i])), [brief.items]);

  // The slides between the Cover and the end: each Item, or a Collapsed Topic's digest card (until opened
  // here). Topics with nothing in this Edition have no slide; the end names them.
  const [opened, setOpened] = useState<ReadonlySet<string>>(new Set());
  const content = useMemo<Slide[]>(
    () =>
      brief.groups.flatMap((g): Slide[] => {
        if (g.nothing_qualified) return [];
        const key = groupKey(g);
        const items = g.item_ids.flatMap((id) => byId.get(id) ?? []);
        if (g.collapsed && !opened.has(key)) return [{ kind: "digest", key, group: g, items }];
        return items.map((item) => ({ kind: "item", key, item }));
      }),
    [brief.groups, byId, opened],
  );
  // Slides: 0 is the Cover, 1..n the content, n + 1 "You're caught up".
  const last = content.length + 1;
  const { slides, active, go, step } = useSnapSlides(last);
  const shown = active >= 1 && active <= content.length ? content[active - 1]! : null;
  const current = shown?.kind === "item" ? shown.item : null;

  // When the slides change under the Reader (an Edit mode change re-arranges them), stay on the same one.
  const onScreen = useRef<string | null>(null);
  const slideId = (sl: Slide) => (sl.kind === "item" ? sl.item.id : `digest:${sl.key}`);
  useEffect(() => {
    const was = onScreen.current;
    if (was && shown && slideId(shown) !== was) {
      const at = content.findIndex((sl) => slideId(sl) === was);
      if (at >= 0) {
        go(at + 1);
        return;
      }
    }
    onScreen.current = shown ? slideId(shown) : null;
    // Only when the slides themselves change; moving between them updates `onScreen` below.
  }, [content]);
  useEffect(() => {
    onScreen.current = shown ? slideId(shown) : null;
  }, [active]);

  // Sheets hold an Item id, so they show its latest Reactions.
  const [reading, setReading] = useState<string | null>(null);
  const [asking, setAsking] = useState<string | null>(null);
  const readItem = reading ? byId.get(reading) : undefined;

  // Go to an Item once it has a slide: after Undo puts a hidden Item back in its place (the browser would
  // keep the one now on screen in view), and after a digest card opens into its Items.
  const [returning, setReturning] = useState<string | null>(null);
  useEffect(() => {
    if (!returning) return;
    const at = content.findIndex((sl) => sl.kind === "item" && sl.item.id === returning);
    if (at >= 0) {
      setReturning(null);
      go(at + 1);
    }
  }, [returning, content, go]);
  const askItem = asking ? byId.get(asking) : undefined;
  const openDigest = (key: string, itemId: string) => {
    setOpened((all) => new Set(all).add(key));
    setReturning(itemId);
  };

  // Topic tabs: "For you" (the Cover and the top stories), then each Topic group with something in it.
  const tabs = useMemo(
    () => [
      { key: FOR_YOU, label: t("For you", "لك") },
      ...brief.groups
        .filter((g) => g.kind === "topic" && !g.nothing_qualified)
        .map((g) => ({ key: g.topic!, label: topicName(brief, g.topic!, lang), pinned: g.pinned })),
    ],
    [brief, lang, t],
  );
  const currentTab = active === 0 ? FOR_YOU : shown ? shown.key : content.at(-1)?.key ?? FOR_YOU;
  const jumpTo = (key: string) => {
    const first = content.findIndex((sl) => sl.key === key);
    // A Topic with nothing in this Edition (from the sidebar) has no slide: the end names it.
    go(first >= 0 ? first + 1 : last);
  };
  const topics = useMemo(() => arrangedTopics(brief.groups, (id) => topicName(brief, id, lang)), [brief, lang]);

  // The keys, unless a sheet is open or the Reader is typing.
  const keys = useRef({ step, current, reactions });
  keys.current = { step, current, reactions };
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!isShortcut(e)) return;
      const { step, current, reactions } = keys.current;
      const action = itemShortcut(e);
      if (action && current) {
        runItemShortcut(action, current, { reactions, card: slides.current, onAsk: () => setAsking(current.id) });
        return;
      }
      const onControl = e.target instanceof Element && e.target.closest("button, a[href]") !== null;
      let by: 1 | -1 | null = null;
      if (e.key === " ") {
        if (onControl) return; // Space presses the focused button
        by = e.shiftKey ? -1 : 1;
      } else if (e.shiftKey) return;
      else if (e.key === "j" || e.key === "ArrowDown" || e.key === "PageDown") by = 1;
      else if (e.key === "k" || e.key === "ArrowUp" || e.key === "PageUp") by = -1;
      else if (e.key === "Enter" && current && !onControl && !current.blurred) {
        e.preventDefault();
        reactions.opened(current);
        setReading(current.id);
        return;
      }
      if (by === null) return;
      e.preventDefault();
      step(by);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const shortcuts = useShortcuts();
  const screen = useScreen();

  const slide = (i: number) => ({
    className: s.slide,
    inert: i !== active,
    "aria-hidden": i !== active || undefined,
  });

  return (
    // The Brief canvas: dark in every theme (globals.css, .brief-canvas).
    <div className={`${s.brief} brief-canvas`}>
      <div className={s.main}>
        <TopicTabs className={s.tabs} tabs={tabs} current={currentTab} onPick={jumpTo} />
        <div ref={slides} className={s.slides} data-testid="swipe-slides">
          <div {...slide(0)}>
            <div className={s.frame}>
              <Cover brief={brief} onEdit={() => edit.setEditing(true)} />
              <TapThirds onNext={() => step(1)} />
            </div>
          </div>
          {content.map((sl, i) =>
            sl.kind === "item" ? (
              <div key={sl.item.id} {...slide(i + 1)}>
                <ReelsCard
                  item={sl.item}
                  brief={brief}
                  now={now}
                  active={i + 1 === active}
                  reactions={reactions}
                  basePath={basePath}
                  onRead={(it) => setReading(it.id)}
                  onAsk={(it) => setAsking(it.id)}
                >
                  <TapThirds onBack={() => step(-1)} onNext={() => step(1)} />
                </ReelsCard>
              </div>
            ) : (
              <div key={`digest-${sl.key}`} {...slide(i + 1)}>
                <DigestCard
                  group={sl.group}
                  items={sl.items}
                  brief={brief}
                  onOpen={(itemId) => openDigest(sl.key, itemId ?? sl.items[0]!.id)}
                >
                  <TapThirds onBack={() => step(-1)} onNext={() => step(1)} />
                </DigestCard>
              </div>
            ),
          )}
          <div {...slide(last)}>
            <div className={s.frame}>
              <CaughtUp brief={brief} onTop={() => go(0)} />
              <TapThirds onBack={() => step(-1)} />
            </div>
          </div>
        </div>
        <UndoToast reactions={reactions} onUndone={(item) => setReturning(item.id)} />
      </div>

      <aside className={s.aside} aria-label={t("Up next", "التالي")}>
        <h2 className={s.asideTitle}>{t("Up next", "التالي")}</h2>
        <UpNext
          upcoming={content.flatMap((sl, i) => (sl.kind === "item" && i + 1 > active ? [{ item: sl.item, slide: i + 1 }] : [])).slice(0, 5)}
          brief={brief}
          now={now}
          onJump={(i) => go(i)}
        />
        <h2 className={s.asideTitle}>{t("Today", "اليوم")}</h2>
        <WidgetRows widgets={brief.cover!.widgets} />
      </aside>

      {readItem && (
        <ReadSheet
          item={readItem}
          brief={brief}
          now={now}
          reactions={reactions}
          onAsk={() => {
            setReading(null);
            setAsking(readItem.id);
          }}
          onClose={() => setReading(null)}
        />
      )}
      {askItem && <AskSheet key={askItem.id} item={askItem} basePath={basePath} onClose={() => setAsking(null)} />}
      {edit.editing && (
        <EditSheet order={topics} widgets={brief.cover!.widgets} moreWidgets={brief.cover!.more_widgets} onDone={() => edit.setEditing(false)} />
      )}
      {screen && hasSidebar(screen) && <SidebarTopics brief={brief} onPick={jumpTo} />}
      {shortcuts}
    </div>
  );
}

/** The upper third goes back and the lower third forward, under the card's text and rail. */
function TapThirds({ onBack, onNext }: { onBack?: () => void; onNext?: () => void }) {
  const { t } = useLanguage();
  return (
    <>
      {onBack && <button type="button" className={`${s.third} ${s.upper}`} aria-label={t("Back", "السابق")} onClick={onBack} />}
      {onNext && <button type="button" className={`${s.third} ${s.lower}`} aria-label={t("Next", "التالي")} onClick={onNext} />}
    </>
  );
}

/** A slide between the Cover and the end: an Item, or a Collapsed Topic's digest card. `key` is its tab. */
type Slide = { kind: "item"; key: string; item: BriefItem } | { kind: "digest"; key: string; group: BriefGroup; items: BriefItem[] };

/**
 * A Collapsed Topic in Swipe: one card listing its headlines (a sensitive one by its warning, never its
 * title). Opening it, or tapping a headline, calls `onOpen` (with that headline's Item). `children` go
 * under the text: the tap thirds.
 */
function DigestCard({
  group,
  items,
  brief,
  onOpen,
  children,
}: {
  group: BriefGroup;
  items: BriefItem[];
  brief: Brief;
  onOpen(itemId: string | null): void;
  children?: ReactNode;
}) {
  const { lang, t } = useLanguage();
  const name = topicName(brief, group.topic!, lang);
  return (
    <article className={s.digest} aria-label={t(`${name}: headlines`, `${name}: العناوين`)}>
      {children}
      <div className={s.digestText}>
        <p className={s.digestMeta}>
          {group.pinned && <Icon name="pushpin" size={14} filled className={s.digestPin} />}
          {t("Headlines only", "العناوين فقط")} · {itemCount(items.length, lang)}
        </p>
        <h2 className={s.digestTitle}>{name}</h2>
        <ol className={s.digestList}>
          {items.map((item) => {
            const warning = localized(item, "warning", lang);
            return (
              <li key={item.id}>
                <button type="button" className={s.digestItem} data-dimmed={item.dimmed} dir="auto" onClick={() => onOpen(item.id)}>
                  {item.blurred ? `${t("Sensitive Item", "عنصر حساس")}${warning ? `: ${warning}` : ""}` : localized(item, "title", lang)}
                </button>
              </li>
            );
          })}
        </ol>
        <button type="button" className={s.digestOpen} onClick={() => onOpen(null)}>
          {t(`Open ${name}`, `فتح ${name}`)}
        </button>
      </div>
    </article>
  );
}

/** PC: the next few Items, each jumping to its slide. A sensitive one is named by its warning, never its title. */
function UpNext({
  upcoming,
  brief,
  now,
  onJump,
}: {
  upcoming: { item: BriefItem; slide: number }[];
  brief: Brief;
  now: number | null;
  onJump(slide: number): void;
}) {
  const { lang, t } = useLanguage();
  return (
    <ol className={s.upNext}>
      {upcoming.map(({ item, slide }) => {
        const warning = localized(item, "warning", lang);
        return (
          <li key={item.id}>
            <button type="button" className={s.upRow} data-dimmed={item.dimmed} onClick={() => onJump(slide)}>
              <span className={s.thumb}>
                {previewKind(item) === "photo" && <Thumb src={item.image!} />}
              </span>
              <span className={s.upText}>
                <small>
                  {topicName(brief, item.topic, lang)}
                  {now !== null && ` · ${timeSince(item.time, now, lang)}`}
                </small>
                <span className={s.upTitle} dir="auto">
                  {item.blurred
                    ? `${t("Sensitive Item", "عنصر حساس")}${warning ? `: ${warning}` : ""}`
                    : localized(item, "title", lang)}
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

/** An Up next thumbnail; one that fails leaves the plain square. */
function Thumb({ src }: { src: string }) {
  const [broken, setBroken] = useState(false);
  return broken ? null : <ItemImage src={src} onFail={() => setBroken(true)} />;
}

/**
 * A vertical scroll-snap column of full-height slides. `active` is the slide
 * on screen (it changes as a drag passes half way). `go(i)` scrolls to slide
 * `i`; `step(1)` / `step(-1)` move one slide from where the column is heading,
 * so quick taps each move one slide even before the last move has landed.
 */
function useSnapSlides(last: number) {
  const slides = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const target = useRef<number | null>(null);

  useEffect(() => {
    const el = slides.current!;
    const onScroll = () => {
      const i = Math.max(0, Math.min(last, slideAt(el)));
      setActive(i);
      if (target.current !== null && Math.abs(el.scrollTop - target.current * el.clientHeight) < 2) target.current = null;
    };
    // The Reader took over (a drag or the wheel): forget a move still on its way.
    const reset = () => (target.current = null);
    el.addEventListener("scroll", onScroll, { passive: true });
    el.addEventListener("scrollend", reset);
    el.addEventListener("touchmove", reset, { passive: true });
    el.addEventListener("wheel", reset, { passive: true });
    onScroll();
    return () => {
      el.removeEventListener("scroll", onScroll);
      el.removeEventListener("scrollend", reset);
      el.removeEventListener("touchmove", reset);
      el.removeEventListener("wheel", reset);
    };
  }, [last]);

  const go = useCallback(
    (to: number) => {
      const el = slides.current;
      if (!el) return;
      const i = Math.max(0, Math.min(last, to));
      target.current = i;
      const instant = prefersReducedMotion() || Math.abs(i - slideAt(el)) > 1;
      el.scrollTo({ top: i * el.clientHeight, behavior: instant ? "auto" : "smooth" });
    },
    [last],
  );
  // From where the slides are heading, or else where they are (React's `active` may not have caught up yet).
  const step = useCallback(
    (by: 1 | -1) => {
      const el = slides.current;
      if (el) go((target.current ?? slideAt(el)) + by);
    },
    [go],
  );

  return { slides, active, go, step };
}

/** The slide nearest the top of the scrolling column. */
function slideAt(el: HTMLElement): number {
  return Math.round(el.scrollTop / el.clientHeight);
}
