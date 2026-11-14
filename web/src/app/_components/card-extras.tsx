// Kind-specific extras on a card, read from the Item's extras by field name
// (Edition v3 schema): AI try link and pricing, game store link, price and
// genre, GitHub Trending stars, Liverpool source reliability, US Markets tag,
// and social platform, creator and metric.
import s from "./swipe-brief.module.css";

type Extras = Record<string, unknown>;

const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const count = (n: number) => n.toLocaleString("en-US");

const PLATFORM_NAMES: Record<string, string> = {
  x: "X",
  tiktok: "TikTok",
  instagram: "Instagram",
  youtube: "YouTube",
  reddit: "Reddit",
};

export function CardExtras({ extras }: { extras: Extras }) {
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
  if (release) facts.push(`Out ${release}`);

  const rank = num(extras.rank);
  const period = extras.period === "week" ? "this week" : "today";
  if (rank) facts.push(`#${rank} ${period}`);
  const starsGained = num(extras.stars_gained);
  if (starsGained !== null) facts.push(`+${count(starsGained)} stars ${period}`);
  const starsTotal = num(extras.stars_total);
  if (starsTotal !== null) facts.push(`${count(starsTotal)} stars`);
  const language = str(extras.language);
  if (language) facts.push(language);

  const reliability = str(extras.reliability);
  if (reliability) facts.push(`Reliability: ${reliability}`);

  const tag = str(extras.tag);
  if (tag) facts.push(tag);

  const platform = str(extras.platform);
  if (platform) facts.push(PLATFORM_NAMES[platform] ?? platform);
  const creator = str(extras.creator);
  if (creator) facts.push(creator);
  const metric = str(extras.metric);
  if (metric) facts.push(metric);

  const tryUrl = str(extras.try_url);
  if (tryUrl) links.push({ label: "Try it", href: tryUrl });
  const storeUrl = str(extras.store_url);
  if (storeUrl) links.push({ label: "Store page", href: storeUrl });

  const why = str(extras.why_it_matters);

  if (!facts.length && !links.length && !why) return null;
  return (
    <div className={s.extras}>
      {why && <p className={s.whyItMatters}>{why}</p>}
      {facts.length > 0 && (
        <ul aria-label="Details" className={s.facts}>
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
