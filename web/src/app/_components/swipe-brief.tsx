"use client";
// The Swipe Brief (prototype variant B): a cover card, then one Item per
// screen, then "You're caught up". Tap the right side to go forward and the
// left side to go back (mirrored in Arabic, where the layout runs right to left). Progress bars (one per group of the Brief) and a
// Topic/position chip sit on top; the dock (Hide, Save, Like, Ask) sits at the
// bottom (Reactions: ticket 09, in reactions.tsx; Ask opens the Ask sheet:
// ticket 16). Hidden Items leave the Brief at once, and opened ones are dimmed.
// A card on a Story Thread shows its Thread chip and Follow button (ticket 14).
//
// On a wide screen (ticket 05) the card stays in the centre and the side list
// of the whole Brief sits beside it; clicking a row jumps to that Item. The
// arrow keys move forward and back on any screen size.
// A sensitive Item (ticket 08) is blurred with its warning until its reveal
// button is tapped, every time it comes round; the tap zones still skip it.
import { useEffect, useState } from "react";
import type { Brief, BriefGroup, BriefItem } from "@/server/brief/compose";
import { AskSheet } from "./ask-sheet";
import { CardExtras } from "./card-extras";
import { formatCoverDate, formatNextEdition, itemCount, timeSince } from "./format";
import { formatNumber, localized, type Lang } from "./i18n";
import { LanguageToggle, useLanguage } from "./language";
import { Dock, UndoToast, useReactions, type ReactionsState } from "./reactions";
import { SideList, useArrowKeys } from "./side-list";
import { ThreadChip } from "./thread-follow";
import s from "./swipe-brief.module.css";

const WIDGET_SLOTS = [
  { en: "Weather", ar: "الطقس" },
  { en: "Prayer times", ar: "مواقيت الصلاة" },
  { en: "Next match", ar: "المباراة القادمة" },
  { en: "Countdowns", ar: "العد التنازلي" },
] as const;

/** A Topic's name in the Reader's language. */
function topicNameIn(brief: Brief, id: string, lang: Lang): string {
  return (lang === "ar" ? brief.topic_names_ar[id] : undefined) ?? brief.topic_names[id] ?? id;
}

/** Positions: 0 is the cover card, 1..n the Items, n + 1 "You're caught up". */
export function SwipeBrief({ brief: initial, basePath }: { brief: Brief; basePath: string }) {
  const reactions = useReactions(initial, basePath);
  const { brief } = reactions;
  const [pos, setPos] = useState(0);
  const [asking, setAsking] = useState(false);
  const { lang, t } = useLanguage();
  const now = useNow();
  const total = brief.items.length;
  const item = pos >= 1 && pos <= total ? brief.items[pos - 1]! : null;
  const next = () => setPos((p) => Math.min(p + 1, total + 1));
  const back = () => setPos((p) => Math.max(p - 1, 0));
  // While the Ask sheet is open the arrow keys stay with it, not the Brief.
  useArrowKeys(() => !asking && next(), () => !asking && back());

  return (
    <div className={s.layout}>
      <div className={s.stage}>
        <ProgressBars brief={brief} pos={pos} />

        <LanguageToggle className={s.langToggle} />

        {pos === 0 && <Cover brief={brief} />}
        {/* Keyed by Item, so a sensitive card is blurred again every time it comes round. */}
        {item && (
          <ItemCard key={item.id} item={item} brief={brief} position={pos} now={now} reactions={reactions} basePath={basePath} />
        )}
        {pos > total && (
          <section className={s.done} aria-label={t("End of the Brief", "نهاية الموجز")}>
            <h2>{t("You're caught up", "انتهيت من الموجز")}</h2>
            <p>{formatNextEdition(brief, lang)}</p>
            <button type="button" className={s.startOver} onClick={() => setPos(0)}>
              {t("Start over", "من البداية")}
            </button>
          </section>
        )}

        {pos > 0 && (
          <button type="button" className={`${s.tap} ${s.tapBack}`} aria-label={t("Back", "السابق")} onClick={back} />
        )}
        {pos <= total && (
          <button type="button" className={`${s.tap} ${s.tapNext}`} aria-label={t("Next", "التالي")} onClick={next} />
        )}

        {item && <Dock item={item} reactions={reactions} onAsk={() => setAsking(true)} />}
        {item && asking && <AskSheet key={item.id} item={item} basePath={basePath} onClose={() => setAsking(false)} />}
        <UndoToast reactions={reactions} />
      </div>
      <SideList brief={brief} pos={pos} onJump={setPos} groupName={(g) => groupName(g, brief, lang)} />
    </div>
  );
}

function ProgressBars({ brief, pos }: { brief: Brief; pos: number }) {
  const { lang } = useLanguage();
  // How many Items of each group are read up to and including the current one.
  const seen = new Set(brief.items.slice(0, Math.max(0, pos)).map((i) => i.id));
  return (
    <div className={s.bars}>
      {brief.groups.map((g) => {
        const done = g.item_ids.filter((id) => seen.has(id)).length;
        return (
          <div
            key={g.topic ?? "top"}
            className={s.bar}
            role="progressbar"
            aria-label={groupName(g, brief, lang)}
            aria-valuemin={0}
            aria-valuemax={g.item_ids.length}
            aria-valuenow={done}
          >
            <span style={{ width: `${(100 * done) / g.item_ids.length}%` }} />
          </div>
        );
      })}
    </div>
  );
}

function groupName(g: BriefGroup, brief: Brief, lang: Lang): string {
  if (g.kind === "top") return lang === "ar" ? "الأهم لك" : "Top for you";
  return topicNameIn(brief, g.topic!, lang);
}

function Cover({ brief }: { brief: Brief }) {
  const edition = brief.edition!;
  const { lang, t } = useLanguage();
  return (
    <section className={s.cover} aria-label={t("Cover card", "بطاقة الغلاف")}>
      <p className={s.kicker}>{t("Morning Brief", "الموجز الصباحي")}</p>
      <h1>{formatCoverDate(brief.cover!.date, lang)}</h1>
      <p className={s.editionLine}>
        {edition.kind === "morning"
          ? t("Morning Edition", "الطبعة الصباحية")
          : t("Evening Edition", "الطبعة المسائية")}{" "}
        · {itemCount(brief.items.length, lang)}
      </p>
      <div className={s.widgets}>
        {WIDGET_SLOTS.map((slot) => (
          <div key={slot.en} role="group" aria-label={t(slot.en, slot.ar)} className={s.widget}>
            <span>{t(slot.en, slot.ar)}</span>
            <b aria-hidden>—</b>
          </div>
        ))}
      </div>
      {/* The forward side is on the left in Arabic. */}
      <p className={s.hint}>{t("Tap the right side to start", "اضغط على الجانب الأيسر للبدء")}</p>
    </section>
  );
}

function ItemCard({
  item,
  brief,
  position,
  now,
  reactions,
  basePath,
}: {
  item: BriefItem;
  brief: Brief;
  position: number;
  now: number | null;
  reactions: ReactionsState;
  basePath: string;
}) {
  const { lang, t } = useLanguage();
  const name = (id: string) => topicNameIn(brief, id, lang);
  const title = localized(item, "title", lang)!;
  const summary = localized(item, "summary", lang);
  const warning = localized(item, "warning", lang);
  // A sensitive Item stays blurred with its warning until tapped (ticket 08).
  const [revealed, setRevealed] = useState(false);
  const locked = item.blurred && !revealed;
  return (
    <article
      className={`${s.card} ${locked ? s.locked : ""} ${item.dimmed ? s.dimmed : ""}`}
      aria-label={locked ? t("Sensitive Item", "عنصر حساس") : title}
      data-dimmed={item.dimmed}
      // Opening any of the card's links (sources, try it, store) opens the Item: it comes back dimmed.
      onClickCapture={(e) => (e.target as Element).closest("a[href]") && reactions.opened(item)}
    >
      <div className={s.hero} inert={locked} aria-hidden={locked || undefined}>
        {item.image && (
          // External, already link-checked images from the Edition; next/image would need every host allow-listed.
          <img key={item.id} src={item.image} alt="" onError={(e) => (e.currentTarget.style.visibility = "hidden")} />
        )}
      </div>
      <span className={s.chip} data-testid="chip">
        {name(item.topic)} · {formatNumber(position, lang)}/{formatNumber(brief.items.length, lang)}
      </span>
      <div className={s.body} inert={locked} aria-hidden={locked || undefined}>
        <div className={s.badges}>
          {item.top && <span className={`${s.badge} ${s.badgeTop}`}>{t("Top for you", "الأهم لك")}</span>}
          {item.status === "new" && <span className={s.badge}>{t("New", "جديد")}</span>}
          {item.status === "updated" && <span className={s.badge}>{t("Updated", "محدَّث")}</span>}
          {warning && (
            <span className={`${s.badge} ${s.badgeWarning}`} dir="auto">
              {warning}
            </span>
          )}
        </div>
        {/* dir="auto": an English fallback inside the Arabic layout still reads left to right. */}
        <h2 dir="auto">{title}</h2>
        {summary && (
          <p className={s.summary} dir="auto">
            {summary}
          </p>
        )}
        <CardExtras extras={item.extras} />
        {item.thread_id && brief.threads[item.thread_id] && (
          <ThreadChip thread={brief.threads[item.thread_id]!} basePath={basePath} />
        )}
        {item.tags.length > 0 && (
          <p className={s.tags}>
            {t("Also in", "أيضًا في")} {item.tags.map(name).join(t(", ", "، "))}
          </p>
        )}
        <p className={s.sources}>
          {item.sources.map((src, i) => (
            <span key={src.url}>
              {i > 0 && " · "}
              <a href={src.url} target="_blank" rel="noopener noreferrer">
                {src.title}
              </a>
            </span>
          ))}
          {" · "}
          <time dateTime={item.time}>{now === null ? "" : timeSince(item.time, now, lang)}</time>
        </p>
      </div>
      {locked && (
        <>
          {/* The veil sits under the tap zones, so the Reader can still skip the card without looking. */}
          <div className={s.veil} aria-hidden />
          <button type="button" className={s.reveal} onClick={() => setRevealed(true)}>
            <span className={s.revealWarning} dir="auto">
              {warning ?? t("Sensitive", "حساس")}
            </span>
            <span className={s.revealHint}>{t("Tap to reveal", "اضغط للعرض")}</span>
          </button>
        </>
      )}
    </article>
  );
}

/** The current time, known only after the page has loaded (so server and browser render the same HTML). */
function useNow(): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}
