"use client";
// The read sheet (rework ticket 08, spec #6): opened by tapping a Reels card's
// text. The whole story: its picture, the meta line, the headline, the
// why-line on a top story, the full summary, kind-specific extras, the other
// followed Topics it is in, Like / Save / Ask, and its sources. In the
// Reader's theme (a Sheet), whatever the Brief canvas behind it. NSFW media
// (`media_blurred`) stays blurred under its own veil until tapped.
import { useState } from "react";
import type { Brief, BriefItem } from "@/server/brief/compose";
import { CardExtras } from "./card-extras";
import { timeSince } from "./format";
import { localized, topicName } from "./i18n";
import { Icon } from "./icons";
import { ItemImage, MediaVeil } from "./item-image";
import { useLanguage } from "./language";
import type { ReactionsState } from "./reactions";
import { pictureKind } from "./reels-card";
import { Sheet } from "./sheet";
import s from "./read-sheet.module.css";

export function ReadSheet({
  item,
  brief,
  now,
  reactions,
  onAsk,
  onClose,
}: {
  item: BriefItem;
  brief: Brief;
  now: number | null;
  reactions: ReactionsState;
  onAsk(): void;
  onClose(): void;
}) {
  const { lang, t } = useLanguage();
  const [broken, setBroken] = useState(false);
  const [mediaRevealed, setMediaRevealed] = useState(false);
  const kind = broken ? "none" : pictureKind(item);
  const mediaLocked = item.media_blurred && !mediaRevealed && kind !== "none";
  const title = localized(item, "title", lang)!;
  const summary = localized(item, "summary", lang);
  const why = item.top ? localized(item, "why_for_you", lang) : null;
  const warning = localized(item, "warning", lang);
  const name = (id: string) => topicName(brief, id, lang);

  return (
    <Sheet label={title} onClose={onClose}>
      <article className={s.read}>
        {kind !== "none" && (
          <div className={s.picture} data-media-locked={mediaLocked || undefined}>
            <ItemImage className={kind === "photo" ? s.photo : s.badge} src={item.image!} onFail={() => setBroken(true)} />
            {mediaLocked && <MediaVeil className={s.mediaVeil} onReveal={() => setMediaRevealed(true)} />}
          </div>
        )}
        <p className={s.meta}>
          <b>{name(item.topic)}</b>
          {now !== null && ` · ${timeSince(item.time, now, lang)}`}
          {item.status === "updated" && ` · ${t("Updated", "محدَّث")}`}
          {warning && (
            <>
              {" · "}
              <span dir="auto">{warning}</span>
            </>
          )}
        </p>
        <h2 className={s.headline} dir="auto">
          {title}
        </h2>
        {why && (
          <p className={s.why} dir="auto">
            <Icon name="sparkle" size={16} />
            <span>{why}</span>
          </p>
        )}
        {summary && (
          <p className={s.summary} dir="auto">
            {summary}
          </p>
        )}
        <CardExtras extras={item.extras} />
        {item.tags.length > 0 && (
          <p className={s.tags}>
            {t("Also in", "أيضًا في")} {item.tags.map(name).join(t(", ", "، "))}
          </p>
        )}
        <div className={s.actions} role="toolbar" aria-label={t("Actions", "الإجراءات")}>
          <button
            type="button"
            className={s.action}
            data-kind="like"
            aria-pressed={item.reactions.like}
            onClick={() => reactions.toggle(item, "like")}
          >
            <Icon name="heart" size={22} filled={item.reactions.like} />
            {t("Like", "أعجبني")}
          </button>
          <button
            type="button"
            className={s.action}
            aria-pressed={item.reactions.save}
            onClick={() => reactions.toggle(item, "save")}
          >
            <Icon name="save" size={22} filled={item.reactions.save} />
            {t("Save", "حفظ")}
          </button>
          <button type="button" className={s.action} onClick={onAsk}>
            <Icon name="sparkle" size={22} />
            {t("Ask", "اسأل")}
          </button>
        </div>
        <h3 className={s.sourcesTitle}>{t("Sources", "المصادر")}</h3>
        <ul className={s.sources} aria-label={t("Sources", "المصادر")}>
          {item.sources.map((src) => (
            <li key={src.url}>
              <a href={src.url} target="_blank" rel="noopener noreferrer" dir="auto">
                <Icon name="ext" size={16} />
                {src.title}
              </a>
            </li>
          ))}
        </ul>
      </article>
    </Sheet>
  );
}
