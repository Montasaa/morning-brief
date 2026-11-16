"use client";
// The Cover in its full-screen form (rework ticket 08, spec #6): the first
// screen of the Swipe Brief. The greeting, the date, the Edition and its Item
// count, then the Reader's Widgets as quiet rows, over a slowly drifting glow.
// Front Page and List show the header form (front-page.tsx) from the same
// pieces (`useCoverLines`, <WidgetRows>). Both carry the Layout switch.
//
// The same look closes the Brief: <CaughtUp> ("You're caught up"), which in
// Swipe also names the followed Topics with nothing in this Edition (rework
// ticket 11). The full-screen form carries the Edit button too (`onEdit`).
//
// <NothingToShow> is the note a Brief opens with when it holds nothing but
// Sensitive Items (`brief.nothing_to_show`, rework ticket 10): they are never
// the first thing after the Cover. Every Layout's Cover shows it.
import type { Brief } from "@/server/brief/compose";
import { topicName } from "./i18n";
import { WidgetRows } from "./cover-widgets";
import { formatCoverDate, formatNextEdition, itemCount } from "./format";
import { Icon } from "./icons";
import { LanguageToggle, useLanguage } from "./language";
import { LayoutSwitch } from "./layout-switch";
import s from "./cover.module.css";

/** The Cover's lines in the Reader's language: greeting, date and "Morning Edition · 7 Items". */
export function useCoverLines(brief: Brief): { greeting: string; date: string; edition: string } {
  const { lang, t } = useLanguage();
  const morning = brief.edition!.kind === "morning";
  return {
    greeting: morning ? t("Good morning", "صباح الخير") : t("Good evening", "مساء الخير"),
    date: formatCoverDate(brief.cover!.date, lang),
    edition: `${morning ? t("Morning Edition", "الطبعة الصباحية") : t("Evening Edition", "الطبعة المسائية")} · ${itemCount(
      brief.items.length,
      lang,
    )}`,
  };
}

export function Cover({ brief, onEdit }: { brief: Brief; onEdit?(): void }) {
  const { t } = useLanguage();
  const lines = useCoverLines(brief);
  return (
    <section className={s.screen} aria-label={t("Cover", "الغلاف")}>
      <div className={s.glow} aria-hidden />
      <div className={s.content}>
        <div className={s.top}>
          <p className={s.greeting}>{lines.greeting}</p>
          <span className={s.tools}>
            <LayoutSwitch />
            {onEdit && (
              <button type="button" className={s.edit} onClick={onEdit}>
                <Icon name="edit" size={16} />
                {t("Edit", "تحرير")}
              </button>
            )}
            <LanguageToggle className={s.lang} />
          </span>
        </div>
        <h1 className={s.date}>{lines.date}</h1>
        <p className={s.edition}>{lines.edition}</p>
        <NothingToShow brief={brief} className={s.nothing} />
        <WidgetRows widgets={brief.cover!.widgets} />
        <p className={s.hint}>
          <Icon name="up" size={20} className={s.nudge} />
          {t("Swipe up to start", "اسحب للأعلى للبدء")}
        </p>
      </div>
    </section>
  );
}

/** The note for a Brief of only sensitive Items: nothing to show outside the Reader's Sensitive Topics. */
export function NothingToShow({ brief, className }: { brief: Brief; className?: string }) {
  const { t } = useLanguage();
  if (!brief.nothing_to_show) return null;
  return (
    <p className={className} role="note" data-testid="nothing-to-show">
      {t(
        "Nothing to show outside your Sensitive Topics in this Edition. Their Items come next.",
        "لا شيء لعرضه خارج موضوعاتك الحساسة في هذه الطبعة. عناصرها تأتي بعد ذلك.",
      )}
    </p>
  );
}

export function CaughtUp({ brief, onTop }: { brief: Brief; onTop(): void }) {
  const { lang, t } = useLanguage();
  const empty = brief.groups.filter((g) => g.nothing_qualified).map((g) => topicName(brief, g.topic!, lang));
  const list = new Intl.ListFormat(lang === "ar" ? "ar" : "en", { type: "conjunction" }).format(empty);
  return (
    <section className={`${s.screen} ${s.end}`} aria-label={t("End of the Brief", "نهاية الموجز")}>
      <div className={s.glow} aria-hidden />
      <div className={s.content}>
        <h2 className={s.date}>{t("You're caught up", "انتهيت من الموجز")}</h2>
        <p className={s.edition}>{formatNextEdition(brief, lang)}</p>
        {empty.length > 0 && (
          <p className={s.nothing} data-testid="nothing-qualified">
            {t(`Nothing qualified in this Edition for ${list}.`, `لم يتأهل شيء في هذه الطبعة لـ${list}.`)}
          </p>
        )}
        <button type="button" className={s.toTop} onClick={onTop}>
          <Icon name="up" size={20} />
          {t("Back to the top", "العودة إلى البداية")}
        </button>
      </div>
    </section>
  );
}
