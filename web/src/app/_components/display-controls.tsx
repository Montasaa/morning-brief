"use client";
// The controls on Me › Display (rework ticket 07): theme, accent, text size and
// density, each a group of radio buttons, and the Layout for each screen class
// (rework ticket 09). A choice takes effect at once and is saved to the
// Reader's Display (useDisplay). Ticket 11 adds its groups (Topics, Widgets,
// dock) here.
import { useState } from "react";
import {
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
import c from "./chrome.module.css";
import { useDisplay } from "./display";
import s from "./display-controls.module.css";
import { useLanguage } from "./language";
import { LAYOUT_LABELS } from "./layout-switch";

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

export function DisplayControls() {
  const { display, update } = useDisplay();
  const { t } = useLanguage();
  const [status, setStatus] = useState<"idle" | "saved" | "failed">("idle");

  const choose = async (patch: DisplayPatch) => {
    setStatus("idle");
    setStatus((await update(patch)) ? "saved" : "failed");
  };

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
