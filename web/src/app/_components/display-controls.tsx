"use client";
// The controls on Me › Display (rework ticket 07): theme, accent, text size and
// density, each a group of radio buttons, and the Layout for each screen class
// (rework ticket 09). A choice takes effect at once and is saved to the
// Reader's Display (useDisplay). Rework ticket 11 adds the arranging controls,
// the same as Edit mode's on the Brief (arrange.tsx): the Topics in Brief order
// with move up and down, pin, collapse and blur for Sensitive ones; the Cover's
// Widgets; and the dock, 1 to 5 buttons in order.
import { useMemo } from "react";
import { arrangeGroups } from "@/server/brief/arrange";
import type { BriefGroup } from "@/server/brief/compose";
import {
  DOCK_BUTTONS,
  WIDGET_KEYS,
  ACCENTS,
  DENSITIES,
  LAYOUTS,
  SCREEN_CLASSES,
  TEXT_SIZES,
  THEMES,
  type Accent,
  type Density,
  type DisplayPatch,
  type Layout,
  type ScreenClass,
  type TextSize,
  type Theme,
} from "@/server/display/shape";
import { arrangedTopics, PickList, TopicList, useArrange, WIDGET_LABELS } from "./arrange";
import c from "./chrome.module.css";
import { useDisplay } from "./display";
import s from "./display-controls.module.css";
import { useLanguage } from "./language";
import { LAYOUT_LABELS } from "./layout-switch";
import { DOCK_LABELS } from "./reactions";

/** The dock buttons' names, as PickList takes them. */
const DOCK_BUTTON_LABELS = (() => {
  const labels = {} as Record<(typeof DOCK_BUTTONS)[number], readonly [string, string]>;
  for (const b of DOCK_BUTTONS) labels[b] = [DOCK_LABELS[b].en, DOCK_LABELS[b].ar];
  return labels;
})();

type Label = readonly [en: string, ar: string];

const THEME_LABELS: Record<Theme, Label> = {
  light: ["Light", "فاتح"],
  dark: ["Dark", "داكن"],
  auto: ["Auto", "تلقائي"],
};
const ACCENT_LABELS: Record<Accent, Label> = {
  amber: ["Amber", "كهرماني"],
  coral: ["Coral", "مرجاني"],
  lime: ["Lime", "ليموني"],
  sky: ["Sky", "سماوي"],
  rose: ["Rose", "وردي"],
  mono: ["Mono", "بلا لون"],
};
const TEXT_SIZE_LABELS: Record<TextSize, Label> = {
  s: ["Small", "صغير"],
  m: ["Medium", "متوسط"],
  l: ["Large", "كبير"],
  xl: ["Extra large", "كبير جدًا"],
};
const DENSITY_LABELS: Record<Density, Label> = {
  compact: ["Compact", "متقارب"],
  comfortable: ["Comfortable", "مريح"],
};
/** "auto": no pick, so the screen's default Layout. */
type LayoutChoice = Layout | "auto";
const LAYOUT_CHOICES: readonly LayoutChoice[] = ["auto", ...LAYOUTS];
const LAYOUT_CHOICE_LABELS: Record<LayoutChoice, Label> = { auto: ["Automatic", "تلقائي"], ...LAYOUT_LABELS };
const SCREEN_LABELS: Record<ScreenClass, Label> = {
  phone: ["On a phone", "على الهاتف"],
  tablet: ["On a tablet", "على الجهاز اللوحي"],
  pc: ["On a PC", "على الحاسوب"],
};
const SCREEN_HINTS: Record<ScreenClass, Label> = {
  phone: ["Automatic is Swipe.", "التلقائي هو التمرير."],
  tablet: [
    "Automatic is Swipe held upright and Front Page held sideways. A pick applies both ways.",
    "التلقائي هو التمرير عموديًا والصفحة الأولى أفقيًا. أي اختيار يسري في الاتجاهين.",
  ],
  pc: ["Automatic is Front Page. Wide screens use this too.", "التلقائي هو الصفحة الأولى. وتستخدمه الشاشات العريضة أيضًا."],
};

export function DisplayControls({
  groups,
  sensitiveItemIds,
  topicNames,
}: {
  /** The Reader's groups as the Brief ranks them (top stories included), and every other followed Topic. */
  groups: BriefGroup[];
  /** The Brief's Sensitive Items, so the order here keeps one off the top exactly as the Brief does. */
  sensitiveItemIds: string[];
  topicNames: Record<string, { en: string; ar: string }>;
}) {
  const { display } = useDisplay();
  const { lang, t } = useLanguage();
  // Every change here, arranging or not, saves through it, so the status line speaks of the latest one.
  const arrange = useArrange();
  const { status } = arrange;
  const choose = (patch: DisplayPatch) => void arrange.save(patch);
  const { pinned, topic_order, collapsed } = display;
  const order = useMemo(() => {
    const sensitive = new Set(sensitiveItemIds);
    const arranged = arrangeGroups(groups, { pinned, topic_order, collapsed }, (id) => ({ sensitive: sensitive.has(id) }));
    return arrangedTopics(arranged, (id) => (lang === "ar" ? topicNames[id]?.ar ?? id : topicNames[id]?.en ?? id));
  }, [groups, sensitiveItemIds, topicNames, pinned, topic_order, collapsed, lang]);

  return (
    <>
      <Choice
        name="theme"
        legend={t("Theme", "السمة")}
        hint={t("The Brief itself stays dark so photos read well.", "يبقى الموجز نفسه داكنًا لتبدو الصور بوضوح.")}
        options={THEMES}
        labels={THEME_LABELS}
        value={display.theme}
        onChange={(theme) => choose({ theme })}
      />
      <Choice
        name="accent"
        legend={t("Accent", "لون التمييز")}
        options={ACCENTS}
        labels={ACCENT_LABELS}
        value={display.accent}
        onChange={(accent) => choose({ accent })}
        swatch
      />
      <Choice
        name="text_size"
        legend={t("Text size", "حجم النص")}
        options={TEXT_SIZES}
        labels={TEXT_SIZE_LABELS}
        value={display.text_size}
        onChange={(text_size) => choose({ text_size })}
      />
      <Choice
        name="density"
        legend={t("Density", "الكثافة")}
        options={DENSITIES}
        labels={DENSITY_LABELS}
        value={display.density}
        onChange={(density) => choose({ density })}
      />
      <h2 className={c.sectionTitle}>{t("Layout", "طريقة العرض")}</h2>
      {SCREEN_CLASSES.map((screen) => (
        <Choice
          key={screen}
          name={`layout-${screen}`}
          legend={t(...SCREEN_LABELS[screen])}
          hint={t(...SCREEN_HINTS[screen])}
          options={LAYOUT_CHOICES}
          labels={LAYOUT_CHOICE_LABELS}
          value={display.layouts[screen] ?? "auto"}
          onChange={(layout) => choose({ layouts: { [screen]: layout === "auto" ? null : layout } })}
        />
      ))}
      <h2 className={c.sectionTitle}>{t("Topics", "المواضيع")}</h2>
      <p className={s.hint}>
        {t(
          "Pinned Topics come first after your top stories. A collapsed Topic shows only its headlines.",
          "تأتي المواضيع المثبّتة أولًا بعد أهم أخبارك. ويعرض الموضوع المطويّ عناوينه فقط.",
        )}
      </p>
      <TopicList order={order} arrange={arrange} label={t("Topics", "المواضيع")} />
      <h2 className={c.sectionTitle}>{t("Cover Widgets", "أدوات الغلاف")}</h2>
      <PickList
        label={t("Cover Widgets", "أدوات الغلاف")}
        options={WIDGET_KEYS}
        chosen={display.widgets}
        labels={WIDGET_LABELS}
        onChange={(widgets) => void arrange.widgets(widgets)}
      />
      <p className={s.hint}>
        {t(
          "A Widget shows when it has something for you: weather and prayer times need your city, the next match and countdowns a followed Topic.",
          "تظهر الأداة عندما يكون لديها ما يخصّك: الطقس ومواقيت الصلاة تحتاج إلى مدينتك، والمباراة القادمة والعدّ التنازلي إلى موضوع تتابعه.",
        )}
      </p>
      <h2 className={c.sectionTitle}>{t("Dock", "أزرار الإجراءات")}</h2>
      <PickList
        label={t("Dock", "أزرار الإجراءات")}
        options={DOCK_BUTTONS}
        chosen={display.dock}
        labels={DOCK_BUTTON_LABELS}
        min={1}
        onChange={(dock) => void arrange.dock(dock)}
      />
      <p className={s.hint}>
        {t("The buttons beside each story, in this order: 1 to 5.", "الأزرار بجانب كل خبر بهذا الترتيب: من 1 إلى 5.")}
      </p>
      <p className={`${c.status} ${status === "failed" ? c.error : ""}`} role="status" data-testid="display-status">
        {status === "saved" && t("Saved.", "تم الحفظ.")}
        {status === "failed" && t("Couldn't save. Check your connection and try again.", "تعذّر الحفظ. تحقّق من اتصالك وحاول مجددًا.")}
      </p>
    </>
  );
}

function Choice<V extends string>({
  name,
  legend,
  hint,
  options,
  labels,
  value,
  onChange,
  swatch = false,
}: {
  name: string;
  legend: string;
  hint?: string;
  options: readonly V[];
  labels: Record<V, Label>;
  value: V;
  onChange(value: V): void;
  /** Show each option's accent beside its name: its Brief (dark) value and its light-chrome value. */
  swatch?: boolean;
}) {
  const { t } = useLanguage();
  return (
    <fieldset className={s.group}>
      <legend className={c.sectionTitle}>{legend}</legend>
      <div className={swatch ? s.swatches : s.segments}>
        {options.map((option) => (
          <label key={option} className={s.option}>
            <input type="radio" name={name} value={option} checked={value === option} onChange={() => onChange(option)} />
            {swatch && <span className={s.swatch} data-accent={option} aria-hidden />}
            <span>{t(labels[option][0], labels[option][1])}</span>
          </label>
        ))}
      </div>
      {hint && <p className={s.hint}>{hint}</p>}
    </fieldset>
  );
}
