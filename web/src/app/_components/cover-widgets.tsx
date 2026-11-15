"use client";
// The Widgets on the Swipe Brief's cover card (ticket 17): weather and prayer
// times for the Reader's city, the next match for Liverpool followers and
// countdowns for followed Topics. The server decides which ones a Reader sees
// (src/server/widgets); this only draws them. Countdowns tick down once the
// page has loaded and start from the server's figure, so the first render
// matches the server's HTML.
import Link from "next/link";
import { useEffect, useState } from "react";
import type { BriefWidget } from "@/server/brief/compose";
import type { CountdownWidget, NextMatchWidget, Prayer, PrayerTimesWidget, WeatherWidget } from "@/server/widgets";
import { formatNumber, localeOf, type Lang } from "./i18n";
import { useLanguage } from "./language";
import s from "./cover-widgets.module.css";

const PRAYER_NAMES: Record<Prayer | "sunrise", { en: string; ar: string }> = {
  fajr: { en: "Fajr", ar: "الفجر" },
  sunrise: { en: "Sunrise", ar: "الشروق" },
  dhuhr: { en: "Dhuhr", ar: "الظهر" },
  asr: { en: "Asr", ar: "العصر" },
  maghrib: { en: "Maghrib", ar: "المغرب" },
  isha: { en: "Isha", ar: "العشاء" },
};

/** At most three rows of two fit on a phone's cover card; the soonest countdowns win. */
const MAX_SHOWN = 6;

export function CoverWidgets({ widgets: all }: { widgets: BriefWidget[] }) {
  const { t } = useLanguage();
  const widgets = all.slice(0, MAX_SHOWN);
  const now = useNow();
  const hasLocal = all.some((w) => w.kind === "weather" || w.kind === "prayer_times");
  return (
    <>
      <div className={s.widgets}>
        {widgets.map((w, i) => {
          switch (w.kind) {
            case "weather":
              return <Weather key={i} w={w as WeatherWidget} />;
            case "prayer_times":
              return <PrayerTimes key={i} w={w as PrayerTimesWidget} />;
            case "next_match":
              return <NextMatch key={i} w={w as NextMatchWidget} now={now} />;
            case "countdown":
              return <Countdown key={i} w={w as CountdownWidget} now={now} />;
            default:
              return null;
          }
        })}
      </div>
      {!hasLocal && (
        <p className={s.setCity}>
          <Link href="/me">{t("Set your city on the Me tab", "اختر مدينتك من تبويب «أنا»")}</Link>{" "}
          {t("for weather and prayer times.", "لعرض الطقس ومواقيت الصلاة.")}
        </p>
      )}
    </>
  );
}

function Weather({ w }: { w: WeatherWidget }) {
  const { lang, t } = useLanguage();
  // Isolated left to right, so Arabic shows "٢٤°" rather than "°٢٤".
  const deg = (c: number) => `\u2066${formatNumber(Math.round(c), lang)}°\u2069`;
  const condition = weatherCondition(w.weather_code);
  return (
    <div role="group" aria-label={t("Weather", "الطقس")} className={s.widget}>
      <span className={s.label} dir="auto">
        {w.city}
      </span>
      <b className={s.big}>{deg(w.temperature_c)}</b>
      <span className={s.small}>
        {t(condition.en, condition.ar)} · {t("H", "العظمى")} {deg(w.high_c)} {t("L", "الصغرى")} {deg(w.low_c)}
      </span>
    </div>
  );
}

function PrayerTimes({ w }: { w: PrayerTimesWidget }) {
  const { lang, t } = useLanguage();
  const name = (p: Prayer | "sunrise") => t(PRAYER_NAMES[p].en, PRAYER_NAMES[p].ar);
  // After Isha the next prayer is tomorrow's Fajr (about the same time as today's).
  const next: Prayer = w.next ?? "fajr";
  const rest: Prayer[] = (["fajr", "dhuhr", "asr", "maghrib", "isha"] as const).filter((p) => p !== next);
  return (
    <div role="group" aria-label={t("Prayer times", "مواقيت الصلاة")} className={s.widget}>
      <span className={s.label}>{t("Prayer times", "مواقيت الصلاة")}</span>
      <b className={s.big}>
        {name(next)} {clock(w.times[next], lang)}
      </b>
      <span className={s.small}>
        {rest.map((p) => `${name(p)} ${clock(w.times[p], lang)}`).join(" · ")}
      </span>
    </div>
  );
}

function NextMatch({ w, now }: { w: NextMatchWidget; now: number | null }) {
  const { lang, t } = useLanguage();
  const minutes = now === null ? w.minutes_until : Math.floor((Date.parse(w.kickoff) - now) / 60_000);
  return (
    <div role="group" aria-label={t("Next match", "المباراة القادمة")} className={s.widget}>
      <span className={s.label}>{t("Next match", "المباراة القادمة")}</span>
      <b className={s.big}>{countdown(minutes, lang)}</b>
      <span className={s.small} dir="auto">
        {w.team} v {w.opponent}
      </span>
      <span className={s.small}>
        <span dir="auto">{w.competition}</span> ·{" "}
        <time dateTime={w.kickoff_local}>{kickoffTime(w.kickoff, w.timezone, lang)}</time>
      </span>
    </div>
  );
}

function Countdown({ w, now }: { w: CountdownWidget; now: number | null }) {
  const { lang } = useLanguage();
  const minutes = now === null ? w.minutes_until : Math.floor((Date.parse(w.at) - now) / 60_000);
  const label = lang === "ar" && w.label_ar ? w.label_ar : w.label;
  return (
    <div role="group" aria-label={label} className={s.widget}>
      <span className={s.label} dir="auto">
        {label}
      </span>
      <b className={s.big}>{countdown(minutes, lang)}</b>
      <span className={s.small}>
        <time dateTime={w.at_local}>{dayAndTime(w.at, w.timezone, lang)}</time>
      </span>
    </div>
  );
}

/** "2d 4h", "5h 10m", "12m"; in Arabic "٢ يوم ٤ ساعة" and so on. */
export function countdown(minutes: number, lang: Lang): string {
  const m = Math.max(0, minutes);
  const days = Math.floor(m / 1440);
  const hours = Math.floor((m % 1440) / 60);
  const mins = m % 60;
  const n = (x: number) => formatNumber(x, lang);
  const unit = lang === "ar" ? { d: " يوم", h: " ساعة", m: " دقيقة" } : { d: "d", h: "h", m: "m" };
  if (days > 0) return `${n(days)}${unit.d} ${n(hours)}${unit.h}`;
  if (hours > 0) return `${n(hours)}${unit.h} ${n(mins)}${unit.m}`;
  return `${n(mins)}${unit.m}`;
}

/** "Sun 18:00" in the Reader's time zone. */
function kickoffTime(at: string, timezone: string, lang: Lang): string {
  return new Date(at).toLocaleString(localeOf(lang), {
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: timezone,
  });
}

/** "Thu 19 Nov, 20:00" in the Reader's time zone. */
function dayAndTime(at: string, timezone: string, lang: Lang): string {
  return new Date(at).toLocaleString(localeOf(lang), {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: timezone,
  });
}

/** "17:13" in the Reader's digits. */
function clock(hhmm: string, lang: Lang): string {
  if (lang === "en") return hhmm;
  return hhmm
    .split(":")
    .map((part) => formatNumber(Number(part), lang).padStart(2, formatNumber(0, lang)))
    .join(":");
}

/** The WMO weather code Open-Meteo gives, in words. */
function weatherCondition(code: number): { en: string; ar: string } {
  if (code === 0) return { en: "Clear", ar: "صافٍ" };
  if (code <= 2) return { en: "Partly cloudy", ar: "غائم جزئيًا" };
  if (code === 3) return { en: "Cloudy", ar: "غائم" };
  if (code === 45 || code === 48) return { en: "Fog", ar: "ضباب" };
  if (code >= 51 && code <= 57) return { en: "Drizzle", ar: "رذاذ" };
  if (code >= 61 && code <= 67) return { en: "Rain", ar: "مطر" };
  if (code >= 71 && code <= 77) return { en: "Snow", ar: "ثلج" };
  if (code >= 80 && code <= 82) return { en: "Showers", ar: "زخات مطر" };
  if (code === 85 || code === 86) return { en: "Snow showers", ar: "زخات ثلج" };
  if (code >= 95) return { en: "Thunderstorms", ar: "عواصف رعدية" };
  return { en: "Weather", ar: "الطقس" };
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
