"use client";
// The Threads tab and a Story Thread's timeline (ticket 14). Plain scrolling
// screens, in the Reader's language. Following is saved as it is tapped
// (thread-follow.tsx); the lists keep their order until the next visit.
import Link from "next/link";
import { useState } from "react";
import type { ThreadSummary, ThreadTimeline, TimelineItem } from "@/server/threads/threads";
import { formatCoverDate } from "./format";
import { formatNumber, localeOf, localized, type Lang } from "./i18n";
import { useLanguage } from "./language";
import { FollowThreadButton } from "./thread-follow";
import s from "./threads.module.css";

/** "05:40" in Asia/Riyadh, the Editions' time zone ("٠٥:٤٠" in Arabic). */
function clock(iso: string, lang: Lang): string {
  return new Date(iso).toLocaleTimeString(localeOf(lang), {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "Asia/Riyadh",
  });
}

/** The YYYY-MM-DD day of an instant in Asia/Riyadh. */
function riyadhDay(iso: string): string {
  return new Date(Date.parse(iso) + 3 * 3_600_000).toISOString().slice(0, 10);
}

/** "3 developments" / "٣ تطورات". */
function developments(n: number, lang: Lang): string {
  if (lang === "en") return `${n} ${n === 1 ? "development" : "developments"}`;
  if (n === 1) return "تطور واحد";
  if (n === 2) return "تطوران";
  return `${formatNumber(n, lang)} ${n <= 10 ? "تطورات" : "تطورًا"}`;
}

export function ThreadList({ threads, basePath }: { threads: ThreadSummary[]; basePath: string }) {
  const { t } = useLanguage();
  const mine = threads.filter((th) => th.followed);
  const active = threads.filter((th) => !th.followed);
  return (
    <main className={s.screen}>
      <h1>{t("Threads", "القصص المتواصلة")}</h1>
      <p className={s.lede}>
        {t(
          "Stories that develop across Editions. Follow one to keep track of it.",
          "قصص تتطور عبر الطبعات. تابع أي قصة لتبقى على اطلاع بها.",
        )}
      </p>
      {threads.length === 0 && (
        <p className={s.empty}>
          {t(
            "No active Story Threads in your Topics right now. When a story develops across Editions, it appears here.",
            "لا توجد قصص متواصلة نشطة في موضوعاتك الآن. عندما تتطور قصة عبر الطبعات ستظهر هنا.",
          )}
        </p>
      )}
      {mine.length > 0 && (
        <section aria-labelledby="threads-following">
          <h2 id="threads-following" className={s.groupHeading}>
            {t("Following", "تتابعها")}
          </h2>
          <ThreadRows threads={mine} basePath={basePath} />
        </section>
      )}
      {active.length > 0 && (
        <section aria-labelledby="threads-active">
          <h2 id="threads-active" className={s.groupHeading}>
            {t("Active", "النشطة")}
          </h2>
          <ThreadRows threads={active} basePath={basePath} />
        </section>
      )}
    </main>
  );
}

function ThreadRows({ threads, basePath }: { threads: ThreadSummary[]; basePath: string }) {
  return (
    <ul className={s.rows}>
      {threads.map((th) => (
        <ThreadRow key={th.id} thread={th} basePath={basePath} />
      ))}
    </ul>
  );
}

function ThreadRow({ thread: th, basePath }: { thread: ThreadSummary; basePath: string }) {
  const { lang, t } = useLanguage();
  // A sensitive newest development keeps its title behind its warning until tapped (ticket 08).
  const [revealed, setRevealed] = useState(false);
  const hidden = th.latest.blurred && !revealed;
  const warning = localized(th.latest, "warning", lang);
  return (
    <li className={s.row} data-testid="thread-row">
      <div className={s.rowHead}>
        <Link href={`/threads/${encodeURIComponent(th.id)}`} className={s.rowTitle}>
          <span dir="auto">{localized(th, "title", lang)}</span> · {formatNumber(th.count, lang)}
        </Link>
        <FollowThreadButton thread={th} basePath={basePath} />
      </div>
      <p className={s.latest}>
        <time dateTime={th.latest.time}>
          {formatCoverDate(riyadhDay(th.latest.time), lang)} · {clock(th.latest.time, lang)}
        </time>
        {hidden ? (
          <button type="button" className={s.reveal} onClick={() => setRevealed(true)}>
            <span dir="auto">{warning ? `${t("Sensitive", "حساس")}: ${warning}` : t("Sensitive", "حساس")}</span> ·{" "}
            {t("Tap to reveal", "اضغط للعرض")}
          </button>
        ) : (
          <span dir="auto">{localized(th.latest, "title", lang)}</span>
        )}
      </p>
    </li>
  );
}

export function ThreadTimelineView({ timeline, basePath }: { timeline: ThreadTimeline; basePath: string }) {
  const { lang, t } = useLanguage();
  const { thread } = timeline;
  const days: { date: string; items: TimelineItem[] }[] = [];
  for (const item of timeline.items) {
    const last = days.at(-1);
    if (last?.date === item.date) last.items.push(item);
    else days.push({ date: item.date, items: [item] });
  }
  return (
    <main className={s.screen}>
      <Link href="/threads" className={s.back}>
        {t("‹ Threads", "› القصص المتواصلة")}
      </Link>
      <p className={s.kicker}>{t("Story Thread", "قصة متواصلة")}</p>
      <div className={s.titleRow}>
        <h1 dir="auto">{localized(thread, "title", lang)}</h1>
        <FollowThreadButton thread={thread} basePath={basePath} />
      </div>
      <p className={s.lede}>{developments(thread.count, lang)}</p>

      {days.map((day) => (
        <section key={day.date} className={s.day} aria-label={formatCoverDate(day.date, lang)}>
          <h2 className={s.dayHeading}>{formatCoverDate(day.date, lang)}</h2>
          <ol className={s.timeline}>
            {day.items.map((item) => (
              <TimelineEntry key={item.id} item={item} timeline={timeline} />
            ))}
          </ol>
        </section>
      ))}
    </main>
  );
}

function TimelineEntry({ item, timeline }: { item: TimelineItem; timeline: ThreadTimeline }) {
  const { lang, t } = useLanguage();
  const [revealed, setRevealed] = useState(false);
  const topic = (lang === "ar" ? timeline.topic_names_ar[item.topic] : undefined) ?? timeline.topic_names[item.topic] ?? item.topic;
  const warning = localized(item, "warning", lang);
  const hidden = item.blurred && !revealed;
  const summary = localized(item, "summary", lang);
  return (
    <li className={s.entry} data-testid="timeline-item">
      {/* One meta line (spec #6): Topic · time, plus "Updated" as plain text. No "New" badge. */}
      <p className={s.meta}>
        <b className={s.badge}>{topic}</b>
        <span aria-hidden>·</span>
        <time dateTime={item.time}>{clock(item.time, lang)}</time>
        {item.status === "updated" && (
          <>
            <span aria-hidden>·</span>
            <span className={s.badge}>{t("Updated", "محدَّث")}</span>
          </>
        )}
      </p>
      {item.blurred && !revealed && (
        <button type="button" className={s.reveal} onClick={() => setRevealed(true)}>
          {warning ? `${t("Sensitive", "حساس")}: ${warning}` : t("Sensitive", "حساس")} · {t("Tap to show", "اضغط للعرض")}
        </button>
      )}
      <div className={hidden ? s.blurred : undefined} aria-hidden={hidden || undefined}>
        <h3 dir="auto">{localized(item, "title", lang)}</h3>
        {summary && (
          <p className={s.summary} dir="auto">
            {summary}
          </p>
        )}
        <p className={s.sources}>
          {item.sources.map((src, i) => (
            <span key={src.url}>
              {i > 0 && " · "}
              <a href={src.url} target="_blank" rel="noopener noreferrer" tabIndex={hidden ? -1 : undefined}>
                {src.title}
              </a>
            </span>
          ))}
        </p>
      </div>
    </li>
  );
}
