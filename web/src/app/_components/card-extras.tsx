// Kind-specific extras in an Item's read sheet (rework ticket 08), read from the Item's extras by field name
// (Edition v3 schema): AI try link and pricing, game store link, price and
// genre, GitHub Trending stars, Liverpool source reliability, US Markets tag,
// and social platform, creator and metric. Labels follow the Reader's
// language; values from the Edition are shown as they come, except
// why_it_matters, which has an Arabic pair.
"use client";
import { formatNumber, localized } from "./i18n";
import { useLanguage } from "./language";
import s from "./card-extras.module.css";

type Extras = Record<string, unknown>;

const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

const PLATFORM_NAMES: Record<string, string> = {
  x: "X",
  tiktok: "TikTok",
  instagram: "Instagram",
  youtube: "YouTube",
  reddit: "Reddit",
};

export function CardExtras({ extras }: { extras: Extras }) {
  const { lang, t } = useLanguage();
  const count = (n: number) => formatNumber(n, lang);
  const facts: string[] = [];
  const links: { label: string; href: string }[] = [];

  const kind = str(extras.kind);
  if (kind) facts.push(kind[0] + kind.slice(1).toLowerCase());
  const pricing = str(extras.pricing);
  if (pricing) facts.push(pricing);

  const genres = Array.isArray(extras.genres) ? extras.genres.filter((g): g is string => typeof g === "string") : [];
  if (genres[0]) facts.push(genres[0]);
  const price = str(extras.price);
  const discount = num(extras.discount);
  if (price) facts.push(discount ? `${price} (−${discount}%)` : price);
  const platforms = Array.isArray(extras.platforms) ? extras.platforms.filter((p): p is string => typeof p === "string") : [];
  if (platforms.length) facts.push(platforms.join(", "));
  const release = str(extras.release_date);
  if (release) facts.push(t(`Out ${release}`, `يصدر في ${release}`));

  const rank = num(extras.rank);
  const period = extras.period === "week" ? t("this week", "هذا الأسبوع") : t("today", "اليوم");
  if (rank) facts.push(`#${count(rank)} ${period}`);
  const starsGained = num(extras.stars_gained);
  if (starsGained !== null) facts.push(t(`+${count(starsGained)} stars ${period}`, `+${count(starsGained)} نجمة ${period}`));
  const starsTotal = num(extras.stars_total);
  if (starsTotal !== null) facts.push(t(`${count(starsTotal)} stars`, `${count(starsTotal)} نجمة`));
  const language = str(extras.language);
  if (language) facts.push(language);

  const reliability = str(extras.reliability);
  if (reliability) facts.push(`${t("Reliability", "الموثوقية")}: ${reliability}`);

  const tag = str(extras.tag);
  if (tag) facts.push(tag);

  const platform = str(extras.platform);
  if (platform) facts.push(PLATFORM_NAMES[platform] ?? platform);
  const creator = str(extras.creator);
  if (creator) facts.push(creator);
  const metric = str(extras.metric);
  if (metric) facts.push(metric);

  const tryUrl = str(extras.try_url);
  if (tryUrl) links.push({ label: t("Try it", "جرّبه"), href: tryUrl });
  const storeUrl = str(extras.store_url);
  if (storeUrl) links.push({ label: t("Store page", "صفحة المتجر"), href: storeUrl });

  const why = localized(extras, "why_it_matters", lang);

  if (!facts.length && !links.length && !why) return null;
  return (
    <div className={s.extras}>
      {why && (
        <p className={s.whyItMatters} dir="auto">
          {why}
        </p>
      )}
      {facts.length > 0 && (
        <ul aria-label={t("Details", "التفاصيل")} className={s.facts}>
          {facts.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      )}
      {links.map((l) => (
        <a key={l.href} className={s.extraLink} href={l.href} target="_blank" rel="noopener noreferrer">
          {l.label} <span aria-hidden>↗</span>
        </a>
      ))}
    </div>
  );
}
