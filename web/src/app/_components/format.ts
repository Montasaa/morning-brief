// Display formatting for the Brief, in English or Arabic (ticket 04).
// Dates and times are shown in Asia/Riyadh, the Editions' time zone.
import type { Brief } from "@/server/brief/compose";
import { formatNumber, localeOf, type Lang } from "./i18n";

const RIYADH = "Asia/Riyadh";

/** "Saturday 14 November" (or "السبت، ١٤ نوفمبر") from the Cover's YYYY-MM-DD date. */
export function formatCoverDate(date: string, lang: Lang = "en"): string {
  return new Date(`${date}T12:00:00+03:00`).toLocaleDateString(localeOf(lang), {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: RIYADH,
  });
}

/** "Next Edition at 19:15", or "Next Edition tomorrow at 06:00" when it falls on the next day. */
export function formatNextEdition(brief: Brief, lang: Lang = "en"): string {
  if (!brief.next_edition_at) return "";
  const at = clockTime(brief.next_edition_at.slice(11, 16), lang);
  const sameDay = brief.cover && brief.next_edition_at.startsWith(brief.cover.date);
  if (lang === "ar") return sameDay ? `الطبعة القادمة الساعة ${at}` : `الطبعة القادمة غدًا الساعة ${at}`;
  return sameDay ? `Next Edition at ${at}` : `Next Edition tomorrow at ${at}`;
}

/** "19:15" as written in the Reader's language ("١٩:١٥" in Arabic). */
function clockTime(hhmm: string, lang: Lang): string {
  if (lang === "en") return hhmm;
  return hhmm
    .split(":")
    .map((part) => formatNumber(Number(part), lang).padStart(2, formatNumber(0, lang)))
    .join(":");
}

/** "just now", "25m ago", "5h ago", "2d ago"; in Arabic "الآن", "قبل ٢٥ دقيقة", "قبل ٥ ساعات", "أول أمس". */
export function timeSince(iso: string, now: number, lang: Lang = "en"): string {
  const minutes = Math.max(0, Math.floor((now - Date.parse(iso)) / 60_000));
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (lang === "ar") {
    if (minutes < 1) return "الآن";
    const rtf = new Intl.RelativeTimeFormat("ar-SA", { numeric: "auto" });
    if (minutes < 60) return rtf.format(-minutes, "minute");
    if (hours < 24) return rtf.format(-hours, "hour");
    return rtf.format(-days, "day");
  }
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

/** "7 Items", or in Arabic with its plural forms ("خبر واحد", "خبران", "٧ أخبار", "١٢ خبرًا"). */
export function itemCount(n: number, lang: Lang = "en"): string {
  if (lang === "en") return `${n} ${n === 1 ? "Item" : "Items"}`;
  const num = formatNumber(n, lang);
  switch (new Intl.PluralRules("ar").select(n)) {
    case "zero":
      return "لا أخبار";
    case "one":
      return "خبر واحد";
    case "two":
      return "خبران";
    case "few":
      return `${num} أخبار`;
    case "many":
      return `${num} خبرًا`;
    default:
      return `${num} خبر`;
  }
}
