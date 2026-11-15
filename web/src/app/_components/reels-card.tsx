"use client";
// The Reels card (rework ticket 08, spec #6): one Item, full-bleed on the dark
// Brief canvas. Swipe shows one per screen; ticket 09's reader pane shows the
// same card, so everything about how an Item looks lives here:
//
//   <ReelsCard item={item} brief={brief} now={now} active reactions={reactions}
//              basePath={basePath} onRead={…} onAsk={…}>{overlay}</ReelsCard>
//
// - The picture, by its kind (`pictureKind`): a photo fills the frame (cover
//   crop, with a slow zoom-settle while the card is active); a logo or card
//   image is a small badge on a white plate over a dark card with a bigger
//   headline, never stretched; no picture, or one that fails to load, is a
//   plain dark gradient. `data-picture` on the card says which.
// - A bottom shade, then the text: the why-line (top stories only, in the
//   accent), one meta line (**Topic** · time · Updated), the headline, a
//   two-line summary and the Story Thread chip. Tapping the text (or the
//   headline button, from the keyboard) calls `onRead`: the read sheet.
// - The rail (Like, Save, Ask, Hide), beside the card from 1024px wide.
// - Double-tapping the picture likes the Item with a heart burst (not while
//   veiled).
// - A sensitive Item (`blurred`) sits behind the neutral veil: picture and
//   text blurred and inert, with an eye icon, the Topic's name, its warning
//   and "Tap to view". Leaving the card (`active` false) veils it again.
// - `children` is drawn over the picture and under the text, rail and the
//   veil's button: Swipe puts its tap thirds there.
// - An opened Item is dimmed (`data-dimmed`), and `active` lets the text
//   settle in; both are styled in reels-card.module.css.
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Brief, BriefItem } from "@/server/brief/compose";
import { timeSince } from "./format";
import { localized, topicName } from "./i18n";
import { Icon } from "./icons";
import { ItemImage } from "./item-image";
import { useLanguage } from "./language";
import { Rail, type ReactionsState } from "./reactions";
import { ThreadChip } from "./thread-follow";
import s from "./reels-card.module.css";

export type PictureKind = "photo" | "card" | "none";

/**
 * How an Item's picture is shown. Ticket 10 adds `image_kind` to Items; until
 * then (and whenever it is missing) an Item with an image counts as a photo.
 */
export function pictureKind(item: Pick<BriefItem, "image"> & { image_kind?: PictureKind | null }): PictureKind {
  if (!item.image) return "none";
  return item.image_kind ?? "photo";
}

/** Two taps on the picture within this many ms are a double-tap. */
const DOUBLE_TAP_MS = 350;

export function ReelsCard({
  item,
  brief,
  now,
  active,
  reactions,
  basePath,
  onRead,
  onAsk,
  children,
}: {
  item: BriefItem;
  brief: Brief;
  /** The current time, once known in the browser (relative times are blank before). */
  now: number | null;
  /** On screen: the text settles in and the photo zooms. Leaving veils a sensitive Item again. */
  active: boolean;
  reactions: ReactionsState;
  basePath: string;
  onRead(item: BriefItem): void;
  onAsk(item: BriefItem): void;
  children?: ReactNode;
}) {
  const { lang, t } = useLanguage();
  const [revealed, setRevealed] = useState(false);
  const [broken, setBroken] = useState(false);
  const [bursts, setBursts] = useState<{ id: number; x: number; y: number }[]>([]);
  const lastTap = useRef(0);
  useEffect(() => {
    if (!active) setRevealed(false);
  }, [active]);

  const locked = item.blurred && !revealed;
  const kind: PictureKind = broken ? "none" : pictureKind(item);
  const name = topicName(brief, item.topic, lang);
  const title = localized(item, "title", lang)!;
  const summary = localized(item, "summary", lang);
  const warning = localized(item, "warning", lang);
  const why = item.top ? localized(item, "why_for_you", lang) : null;
  const thread = item.thread_id ? brief.threads[item.thread_id] : undefined;

  function onPictureTap(e: React.MouseEvent<HTMLDivElement>) {
    const at = e.timeStamp;
    if (at - lastTap.current > DOUBLE_TAP_MS) {
      lastTap.current = at;
      return;
    }
    lastTap.current = 0;
    if (locked) return;
    reactions.set(item, "like", true);
    const box = e.currentTarget.getBoundingClientRect();
    const id = at;
    setBursts((all) => [...all, { id, x: e.clientX - box.left, y: e.clientY - box.top }]);
    setTimeout(() => setBursts((all) => all.filter((b) => b.id !== id)), 900);
  }

  function read() {
    if (locked) return;
    reactions.opened(item);
    onRead(item);
  }

  return (
    <article
      className={s.card}
      aria-label={locked ? t(`Sensitive Item: ${name}`, `عنصر حساس: ${name}`) : title}
      data-active={active || undefined}
      data-dimmed={item.dimmed}
      data-picture={kind}
      data-locked={locked || undefined}
      // Opening any of the card's links (the Thread chip) opens the Item: it comes back dimmed.
      onClickCapture={(e) => (e.target as Element).closest("a[href]") && reactions.opened(item)}
    >
      <div className={s.frame}>
        <div className={s.picture} inert={locked} onClick={onPictureTap}>
          {kind === "photo" ? (
            <ItemImage className={s.photo} src={item.image!} onFail={() => setBroken(true)} />
          ) : (
            <div className={s.plain} />
          )}
          <div className={s.shade} />
          {bursts.map((b) => (
            <span key={b.id} className={s.burst} style={{ left: b.x, top: b.y }} data-testid="like-burst">
              <Icon name="heart" size={96} filled />
            </span>
          ))}
        </div>

        {children}

        <div
          className={s.text}
          inert={locked}
          aria-hidden={locked || undefined}
          onClick={(e) => !(e.target as Element).closest("a, button:not([data-read])") && read()}
        >
          {kind === "card" && (
            <div className={s.badge}>
              <ItemImage src={item.image!} onFail={() => setBroken(true)} />
            </div>
          )}
          {why && (
            <p className={s.why} dir="auto" data-testid="why-for-you">
              <Icon name="sparkle" size={15} />
              <span>{why}</span>
            </p>
          )}
          <p className={s.meta}>
            <b>{name}</b>
            {now !== null && (
              <>
                {" · "}
                <time dateTime={item.time}>{timeSince(item.time, now, lang)}</time>
              </>
            )}
            {item.status === "updated" && ` · ${t("Updated", "محدَّث")}`}
          </p>
          {/* dir="auto": an English fallback inside the Arabic layout still reads left to right. */}
          <h2 className={s.headline} dir="auto">
            <button type="button" data-read className={s.headlineButton}>
              {title}
            </button>
          </h2>
          {summary && (
            <p className={s.summary} dir="auto">
              {summary}
            </p>
          )}
          {thread && <ThreadChip thread={thread} basePath={basePath} />}
        </div>

        {locked && (
          <>
            {/* The veil's tint sits under the tap thirds, so the Reader can still move past without looking. */}
            <div className={s.veil} aria-hidden />
            <button type="button" className={s.reveal} onClick={() => setRevealed(true)}>
              <Icon name="hide" size={30} />
              <b>{name}</b>
              <span dir="auto">{warning ?? t("Sensitive", "حساس")}</span>
              <em>{t("Tap to view", "اضغط للعرض")}</em>
            </button>
          </>
        )}
      </div>

      <Rail item={item} reactions={reactions} onAsk={() => onAsk(item)} />
    </article>
  );
}
