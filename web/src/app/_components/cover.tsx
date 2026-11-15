"use client";
// The Cover in its full-screen form (rework ticket 08, spec #6): the first
// screen of the Swipe Brief. The greeting, the date, the Edition and its Item
// count, then the Reader's Widgets as quiet rows, over a slowly drifting glow.
// Front Page and List show the header form (front-page.tsx) from the same
// pieces (`useCoverLines`, <WidgetRows>). Both carry the Layout switch.
//
// The same look closes the Brief: <CaughtUp> ("You're caught up").
import type { Brief } from "@/server/brief/compose";
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

export function Cover({ brief }: { brief: Brief }) {
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
            <LanguageToggle className={s.lang} />
          </span>
        </div>
        <h1 className={s.date}>{lines.date}</h1>
        <p className={s.edition}>{lines.edition}</p>
        <WidgetRows widgets={brief.cover!.widgets} />
        <p className={s.hint}>
          <Icon name="up" size={20} className={s.nudge} />
          {t("Swipe up to start", "اسحب للأعلى للبدء")}
        </p>
      </div>
    </section>
  );
}

export function CaughtUp({ brief, onTop }: { brief: Brief; onTop(): void }) {
  const { lang, t } = useLanguage();
  return (
    <section className={`${s.screen} ${s.end}`} aria-label={t("End of the Brief", "نهاية الموجز")}>
      <div className={s.glow} aria-hidden />
      <div className={s.content}>
        <h2 className={s.date}>{t("You're caught up", "انتهيت من الموجز")}</h2>
        <p className={s.edition}>{formatNextEdition(brief, lang)}</p>
        <button type="button" className={s.toTop} onClick={onTop}>
          <Icon name="up" size={20} />
          {t("Back to the top", "العودة إلى البداية")}
        </button>
      </div>
    </section>
  );
}
