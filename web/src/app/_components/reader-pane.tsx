"use client";
// The reader pane (rework ticket 09, spec #6): Front Page and List open an
// Item here, as the same Reels card Swipe shows (rail included), with its
// position in the Brief ("3 / 55"). Beside the page on tablet landscape, PC
// and wide (about 430px; 460px on wide, where it is always open and has no
// close button); full screen on a phone and an upright tablet.
//
// It has two modes: the card, and Ask, which opens inside the pane with a back
// arrow to the card. The Layout owns which Item is open and the keys; the pane
// only draws. The card slides up or down when j/k move it (`dir`), and the
// pane slides in from the end side when it opens; neither under reduced motion.
import { useEffect, useRef, type Ref } from "react";
import type { Brief, BriefItem } from "@/server/brief/compose";
import { AskPanel } from "./ask-sheet";
import { Chevron } from "./chevron";
import { formatNumber } from "./i18n";
import { Icon } from "./icons";
import { useLanguage } from "./language";
import type { ReactionsState } from "./reactions";
import { ReelsCard } from "./reels-card";
import s from "./reader-pane.module.css";

export function ReaderPane({
  item,
  position,
  total,
  dir,
  asking,
  closable,
  brief,
  now,
  reactions,
  basePath,
  paneRef,
  onRead,
  onAsk,
  onBack,
  onClose,
}: {
  item: BriefItem;
  /** 1-based place of `item` in the Brief's order, and how many Items there are. */
  position: number;
  total: number;
  /** How the card arrived: from a j ("next") or k ("prev") move, or neither. */
  dir: "next" | "prev" | null;
  /** Ask is open in the pane. */
  asking: boolean;
  /** There is a close button (not on wide, where the pane is always open). */
  closable: boolean;
  brief: Brief;
  now: number | null;
  reactions: ReactionsState;
  basePath: string;
  paneRef?: Ref<HTMLElement>;
  onRead(item: BriefItem): void;
  onAsk(): void;
  onBack(): void;
  onClose(): void;
}) {
  const { lang, t } = useLanguage();
  const input = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (asking) input.current?.focus({ preventScroll: true });
  }, [asking, item.id]);

  const close = closable && (
    <button type="button" className={s.icon} aria-label={t("Close the reader", "إغلاق القارئ")} onClick={onClose}>
      <Icon name="x" size={20} />
    </button>
  );
  return (
    <aside ref={paneRef} className={`${s.pane} brief-canvas`} aria-label={t("Reader", "القارئ")} data-slide={closable || undefined}>
      {asking ? (
        <>
          <div className={s.head}>
            <button type="button" className={s.icon} aria-label={t("Back to the story", "العودة إلى الخبر")} onClick={onBack}>
              <Chevron to="back" size={20} />
            </button>
            <h2 className={s.askTitle}>
              <Icon name="sparkle" size={18} />
              {t("Ask Claude", "اسأل Claude")}
            </h2>
            <span className={s.spacer} />
            {close}
          </div>
          <div className={s.ask} role="region" aria-label={t("Ask Claude", "اسأل Claude")}>
            <AskPanel key={item.id} item={item} basePath={basePath} inputRef={input} />
          </div>
        </>
      ) : (
        <>
          <div className={s.head}>
            <span className={s.position} data-testid="pane-position">
              {formatNumber(position, lang)} / {formatNumber(total, lang)}
            </span>
            <span className={s.spacer} />
            {close}
          </div>
          <div key={item.id} className={s.card} data-dir={dir ?? undefined}>
            <ReelsCard
              fit="pane"
              item={item}
              brief={brief}
              now={now}
              active
              reactions={reactions}
              basePath={basePath}
              onRead={onRead}
              onAsk={onAsk}
            />
          </div>
          <p className={s.keys} aria-hidden>
            <kbd>j</kbd>
            <kbd>k</kbd> {t("next / previous", "التالي / السابق")} · <kbd>a</kbd> {t("Ask", "اسأل")} · <kbd>s</kbd> {t("Save", "حفظ")} ·{" "}
            <kbd>?</kbd>
          </p>
        </>
      )}
    </aside>
  );
}
