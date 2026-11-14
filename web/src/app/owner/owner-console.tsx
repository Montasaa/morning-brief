"use client";
// The Owner console's two parts, in the Reader's language: ingest health and
// "bad source" reports. Data comes from the page (the same modules as
// GET /api/owner/health and GET /api/owner/reports).
import type { IngestHealth } from "@/server/owner/health";
import type { BadSourceReports } from "@/server/owner/reports";
import { itemCount } from "../_components/format";
import { formatNumber, localeOf, localized, type Lang } from "../_components/i18n";
import { useLanguage } from "../_components/language";
import s from "./owner-console.module.css";

/** "14 Nov 2026, 06:05" in Asia/Riyadh, the Editions' time zone. */
function dateTime(iso: string, lang: Lang): string {
  return new Date(iso).toLocaleString(localeOf(lang), {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "Asia/Riyadh",
  });
}

function readerCount(n: number, lang: Lang): string {
  if (lang === "en") return `${n} ${n === 1 ? "Reader" : "Readers"}`;
  return n === 1 ? "قارئ واحد" : n === 2 ? "قارئان" : `${formatNumber(n, lang)} قرّاء`;
}

export function OwnerConsole({ health, reports }: { health: IngestHealth; reports: BadSourceReports }) {
  return (
    <>
      <HealthSection health={health} />
      <ReportsSection reports={reports} />
    </>
  );
}

function HealthSection({ health }: { health: IngestHealth }) {
  const { lang, t } = useLanguage();
  const latest = health.latest_edition;
  return (
    <section aria-labelledby="ingest-health" className={s.section}>
      <h2 id="ingest-health">{t("Ingest health", "حالة استقبال الطبعات")}</h2>
      {latest ? (
        <dl className={s.facts} aria-label={t("Latest Edition", "آخر طبعة")}>
          <dt>{t("Latest Edition", "آخر طبعة")}</dt>
          <dd>
            {latest.kind === "morning" ? t("Morning", "الصباحية") : t("Evening", "المسائية")} ·{" "}
            <span dir="ltr">{latest.edition_id}</span>
          </dd>
          <dt>{t("Gathered", "جُمعت")}</dt>
          <dd>{dateTime(latest.generated_at, lang)}</dd>
          <dt>{t("Received", "استُلمت")}</dt>
          <dd>{dateTime(latest.received_at, lang)}</dd>
          <dt>{t("Items", "الأخبار")}</dt>
          <dd>{itemCount(latest.items, lang)}</dd>
        </dl>
      ) : (
        <p className={s.empty}>{t("No Edition yet.", "لا توجد طبعة بعد.")}</p>
      )}

      <h3>{t("Rejected ingests", "طبعات مرفوضة")}</h3>
      {health.rejections.length === 0 ? (
        <p className={s.empty}>{t("No rejected ingests.", "لا توجد طبعات مرفوضة.")}</p>
      ) : (
        <ul className={s.list} aria-label={t("Rejected ingests", "طبعات مرفوضة")}>
          {health.rejections.map((r, n) => (
            <li key={n}>
              <p className={s.meta}>
                {dateTime(r.received_at, lang)} · <span dir="ltr">{r.endpoint}</span>
                {r.edition_id && (
                  <>
                    {" "}
                    · <span dir="ltr">{r.edition_id}</span>
                  </>
                )}
              </p>
              <ul className={s.reasons} dir="ltr">
                {r.reasons.map((reason, i) => (
                  <li key={i}>{reason}</li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ReportsSection({ reports }: { reports: BadSourceReports }) {
  const { lang, t } = useLanguage();
  return (
    <section aria-labelledby="bad-source-reports" className={s.section}>
      <h2 id="bad-source-reports">{t("Bad source reports", "بلاغات المصادر السيئة")}</h2>
      <p className={s.lede}>
        {t(
          "Items Readers hid as a bad source. A report counts against every source the Item cites; fix the Topic's Gathering Rules.",
          "أخبار أخفاها القرّاء لأن مصدرها سيئ. يُحسب البلاغ على كل مصدر يذكره الخبر؛ عدّل قواعد الجمع للموضوع.",
        )}
      </p>
      {reports.reports.length === 0 ? (
        <p className={s.empty}>{t("No reports.", "لا توجد بلاغات.")}</p>
      ) : (
        <>
          <h3>{t("By Item", "حسب الخبر")}</h3>
          <ul className={s.list} aria-label={t("Reports by Item", "البلاغات حسب الخبر")}>
            {reports.reports.map((r) => (
              <li key={r.item.id}>
                <p className={s.title} dir="auto">
                  {localized(r.item, "title", lang)}
                </p>
                <p className={s.meta}>
                  {r.topics.map((topic) => (lang === "ar" ? topic.name_ar : topic.name)).join(" · ")} ·{" "}
                  <strong>{readerCount(r.readers, lang)}</strong> · {dateTime(r.last_reported_at, lang)}
                </p>
                <ul className={s.sources}>
                  {r.sources.map((source) => (
                    <li key={source.url}>
                      <a href={source.url} target="_blank" rel="noreferrer" dir="auto">
                        {source.title}
                      </a>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>

          <h3>{t("By source", "حسب المصدر")}</h3>
          <ul className={s.list} aria-label={t("Reports by source", "البلاغات حسب المصدر")}>
            {reports.sources.map((source) => (
              <li key={source.source} className={s.sourceRow}>
                <span dir="auto">{source.source}</span>
                <span className={s.meta}>
                  {itemCount(source.item_ids.length, lang)} · <strong>{readerCount(source.readers, lang)}</strong>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
