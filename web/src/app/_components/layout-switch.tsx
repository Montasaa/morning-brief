"use client";
// The Layout switch on the Brief (rework ticket 09): Swipe, Front Page or List
// for the screen class this page is on (phone, tablet or PC; wide sets the PC
// pick). The pick is saved in the Reader's Display, so it follows them to
// their other devices of the same class. Me › Display has the same picks for
// every screen class.
import { LAYOUTS, type Layout } from "@/server/display/shape";
import { useDisplay } from "./display";
import { useLanguage } from "./language";
import { layoutFor, pickFor, useScreen } from "./screen-class";
import s from "./layout-switch.module.css";

export const LAYOUT_LABELS: Record<Layout, readonly [en: string, ar: string]> = {
  swipe: ["Swipe", "تمرير"],
  front_page: ["Front Page", "الصفحة الأولى"],
  list: ["List", "قائمة"],
};

const ICONS: Record<Layout, string> = {
  swipe: "M7 3h10a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM10 17h4",
  front_page: "M3 4h18v6H3zM3 14h5v6H3zM10 14h5v6h-5zM17 14h4v6h-4z",
  list: "M3 5h4v4H3zM10 7h11M3 15h4v4H3zM10 17h11",
};

export function LayoutSwitch({ className }: { className?: string }) {
  const { display, update } = useDisplay();
  const { t } = useLanguage();
  const screen = useScreen();
  if (!screen) return null;
  const current = layoutFor(display.layouts, screen);
  return (
    <div role="radiogroup" aria-label={t("Layout", "طريقة العرض")} className={`${s.switch} ${className ?? ""}`}>
      {LAYOUTS.map((layout) => (
        <label key={layout} className={s.option} title={t(...LAYOUT_LABELS[layout])}>
          <input
            type="radio"
            name="brief-layout"
            className={s.input}
            aria-label={t(...LAYOUT_LABELS[layout])}
            checked={current === layout}
            onChange={() => void update({ layouts: { [pickFor(screen)]: layout } })}
          />
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
            <path d={ICONS[layout]} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
          </svg>
        </label>
      ))}
    </div>
  );
}
