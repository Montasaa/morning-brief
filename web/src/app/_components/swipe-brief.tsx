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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Brief, BriefItem } from "@/server/brief/compose";
import { AskSheet } from "./ask-sheet";
import { CaughtUp, Cover } from "./cover";
import { WidgetRows } from "./cover-widgets";
import { prefersReducedMotion, useNow } from "./client-time";
import { timeSince } from "./format";
import { localized, topicName } from "./i18n";
import { ItemImage } from "./item-image";
import { useLanguage } from "./language";
import { UndoToast, useReactions } from "./reactions";
import { ReadSheet } from "./read-sheet";
import { previewKind, ReelsCard } from "./reels-card";
import { sheetOpen } from "./sheet";
import { TopicTabs } from "./topic-tabs";
import s from "./swipe-brief.module.css";

/** The key of the "For you" tab (the top stories, and the Cover). */
const FOR_YOU = "top";

export function SwipeBrief({ brief: initial, basePath }: { brief: Brief; basePath: string }) {
  const reactions = useReactions(initial, basePath);
  const { brief } = reactions;
  const { lang, t } = useLanguage();
  const now = useNow();
  const items = brief.items;
  // Slides: 0 is the Cover, 1..n the Items, n + 1 "You're caught up".
  const last = items.length + 1;
  const { slides, active, go, step } = useSnapSlides(last);
  const current = active >= 1 && active <= items.length ? items[active - 1]! : null;

  // Sheets hold an Item id, so they show its latest Reactions.
  const [reading, setReading] = useState<string | null>(null);
  const [asking, setAsking] = useState<string | null>(null);
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const readItem = reading ? byId.get(reading) : undefined;

  // Undo puts a hidden Item back in its place, above the one now on screen; the
  // browser would keep that one in view, so go back to the Item that returned.
  const [returning, setReturning] = useState<string | null>(null);
  useEffect(() => {
    if (!returning) return;
    const at = items.findIndex((i) => i.id === returning);
    if (at >= 0) {
      setReturning(null);
      go(at + 1);
    }
  }, [returning, items, go]);
  const askItem = asking ? byId.get(asking) : undefined;

  // Topic tabs: "For you" (the Cover and the top stories), then each Topic group.
  const groupOf = useMemo(() => {
    const map = new Map<string, string>();
    for (const g of brief.groups) for (const id of g.item_ids) map.set(id, g.kind === "top" ? FOR_YOU : g.topic!);
    return map;
  }, [brief.groups]);
  const tabs = useMemo(
    () => [
      { key: FOR_YOU, label: t("For you", "لك") },
      ...brief.groups.filter((g) => g.kind === "topic").map((g) => ({ key: g.topic!, label: topicName(brief, g.topic!, lang) })),
    ],
    [brief, lang, t],
  );
  const lastGroup = brief.groups.at(-1);
  const currentTab =
    active === 0
      ? FOR_YOU
      : current
        ? groupOf.get(current.id) ?? FOR_YOU
        : lastGroup?.kind === "topic"
          ? lastGroup.topic!
          : FOR_YOU;
  const jumpTo = (key: string) => {
    const group = brief.groups.find((g) => (g.kind === "top" ? FOR_YOU : g.topic) === key);
    const first = group ? items.findIndex((i) => i.id === group.item_ids[0]) : -1;
    go(first + 1);
  };

  // The keys, unless a sheet is open or the Reader is typing.
  const keys = useRef({ step, current, reactions });
  keys.current = { step, current, reactions };
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || sheetOpen() || isTyping(e.target)) return;
      const { step, current, reactions } = keys.current;
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
              <Cover brief={brief} />
              <TapThirds onNext={() => step(1)} />
            </div>
          </div>
          {items.map((item, i) => (
            <div key={item.id} {...slide(i + 1)}>
              <ReelsCard
                item={item}
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
          ))}
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
        <UpNext items={items.slice(active, active + 5)} from={active + 1} brief={brief} now={now} onJump={(i) => go(i)} />
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

/** PC: the next few Items, each jumping to its slide. A sensitive one is named by its warning, never its title. */
function UpNext({
  items,
  from,
  brief,
  now,
  onJump,
}: {
  items: BriefItem[];
  from: number;
  brief: Brief;
  now: number | null;
  onJump(slide: number): void;
}) {
  const { lang, t } = useLanguage();
  return (
    <ol className={s.upNext}>
      {items.map((item, i) => {
        const warning = localized(item, "warning", lang);
        return (
          <li key={item.id}>
            <button type="button" className={s.upRow} data-dimmed={item.dimmed} onClick={() => onJump(from + i)}>
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

function isTyping(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])') !== null;
}
