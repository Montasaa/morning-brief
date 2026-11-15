"use client";
// The Cover's Widgets (ticket 17; the Reels look, rework ticket 08): weather
// and prayer times for the Reader's city, the next match for Liverpool
// followers and countdowns for followed Topics, as quiet rows (an icon, a main
// line, a small second line and, for what is still to come, a countdown at the
// end), not boxed cards. The server decides which ones a Reader sees and drops
// any that failed (src/server/widgets); this only draws them. Countdowns tick
// down once the page has loaded and start from the server's figure, so the
// first render matches the server's HTML. Ticket 09 reuses <WidgetRows> for the
// Cover header and the wide Widgets column.
import Link from "next/link";
import type { ReactNode } from "react";
import type { BriefWidget } from "@/server/brief/compose";
import type { CountdownWidget, NextMatchWidget, Prayer, PrayerTimesWidget, WeatherWidget } from "@/server/widgets";
import { useNow } from "./client-time";
import { formatNumber, localeOf, type Lang } from "./i18n";
import { Icon, type IconName } from "./icons";
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

/** At most six rows; the soonest countdowns win (the server orders them). */
const MAX_SHOWN = 6;

export function WidgetRows({ widgets: all, className }: { widgets: BriefWidget[]; className?: string }) {
  const { t } = useLanguage();
  const widgets = all.slice(0, MAX_SHOWN);
  const now = useNow();
  const hasLocal = all.some((w) => w.kind === "weather" || w.kind === "prayer_times");
  return (
    <div className={className}>
      <div className={s.rows}>
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
    </div>
  );
}

/** One quiet row: icon, main line, small second line, and an optional countdown at the end. */
function Row({ label, icon, main, sub, end }: { label: string; icon: IconName; main: ReactNode; sub: ReactNode; end?: ReactNode }) {
  return (
    <div role="group" aria-label={label} className={s.row}>
      <Icon name={icon} size={22} className={s.icon} />
      <div className={s.lines}>
        <b>{main}</b>
        <small>{sub}</small>
      </div>
      {end && <span className={s.end}>{end}</span>}
    </div>
  );
}

function Weather({ w }: { w: WeatherWidget }) {
  const { lang, t } = useLanguage();
  // Isolated left to right, so Arabic shows "٢٤°" rather than "°٢٤".
  const deg = (c: number) => `\u2066${formatNumber(Math.round(c), lang)}°\u2069`;
  const condition = weatherCondition(w.weather_code);
  return (
    <Row
      label={t("Weather", "الطقس")}
      icon="sun"
      main={
        <>
          {deg(w.temperature_c)} <span dir="auto">{w.city}</span>
        </>
      }
      sub={`${t(condition.en, condition.ar)} · ${t("H", "العظمى")} ${deg(w.high_c)} ${t("L", "الصغرى")} ${deg(w.low_c)}`}
    />
  );
}

function PrayerTimes({ w }: { w: PrayerTimesWidget }) {
  const { lang, t } = useLanguage();
  const name = (p: Prayer | "sunrise") => t(PRAYER_NAMES[p].en, PRAYER_NAMES[p].ar);
  // After Isha the next prayer is tomorrow's Fajr (about the same time as today's).
  const next: Prayer = w.next ?? "fajr";
  const rest: Prayer[] = (["fajr", "dhuhr", "asr", "maghrib", "isha"] as const).filter((p) => p !== next);
  return (
    <Row
      label={t("Prayer times", "مواقيت الصلاة")}
      icon="moon"
      main={`${name(next)} ${clock(w.times[next], lang)}`}
      sub={rest.map((p) => `${name(p)} ${clock(w.times[p], lang)}`).join(" · ")}
    />
  );
}

function NextMatch({ w, now }: { w: NextMatchWidget; now: number | null }) {
  const { lang, t } = useLanguage();
  const minutes = now === null ? w.minutes_until : Math.floor((Date.parse(w.kickoff) - now) / 60_000);
  return (
    <Row
      label={t("Next match", "المباراة القادمة")}
      icon="ball"
      main={
        <span dir="auto">
          {w.team} v {w.opponent}
        </span>
      }
      sub={
        <>
          <span dir="auto">{w.competition}</span> · <time dateTime={w.kickoff_local}>{kickoffTime(w.kickoff, w.timezone, lang)}</time>
        </>
      }
      end={countdown(minutes, lang)}
    />
  );
}

function Countdown({ w, now }: { w: CountdownWidget; now: number | null }) {
  const { lang } = useLanguage();
  const minutes = now === null ? w.minutes_until : Math.floor((Date.parse(w.at) - now) / 60_000);
  const label = lang === "ar" && w.label_ar ? w.label_ar : w.label;
  return (
    <Row
      label={label}
      icon="clock"
      main={<span dir="auto">{label}</span>}
      sub={<time dateTime={w.at_local}>{dayAndTime(w.at, w.timezone, lang)}</time>}
      end={countdown(minutes, lang)}
    />
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
