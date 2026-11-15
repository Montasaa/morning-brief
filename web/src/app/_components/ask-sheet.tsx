"use client";
// The Ask sheet (ticket 16): opened from the rail's Ask button (in the Reels
// look, rework ticket 08, a Sheet in the Reader's theme), it lets the Reader
// ask Claude about the current Item. It lists their earlier questions on
// this Item (private to them), shows each answer with its cited links, and says
// how many questions are left today. The reader pane (rework ticket 09) shows
// the same <AskPanel> inside the pane instead of a sheet.
import { useEffect, useRef, useState, type FormEvent, type RefObject } from "react";
import type { Ask } from "@/server/ask/ask";
import type { AskLimit } from "@/server/ask/limits";
import type { BriefItem } from "@/server/brief/compose";
import { formatNumber, localized } from "./i18n";
import { Icon } from "./icons";
import { useLanguage } from "./language";
import { Sheet } from "./sheet";
import s from "./ask-sheet.module.css";

export function AskSheet({ item, basePath, onClose }: { item: BriefItem; basePath: string; onClose(): void }) {
  const { t } = useLanguage();
  const input = useRef<HTMLTextAreaElement>(null);
  return (
    <Sheet
      label={t("Ask Claude", "اسأل Claude")}
      title={
        <>
          <Icon name="sparkle" size={20} className={s.titleIcon} />
          {t("Ask Claude", "اسأل Claude")}
        </>
      }
      initialFocus={input}
      className={s.sheet}
      onClose={onClose}
    >
      <AskPanel item={item} basePath={basePath} inputRef={input} />
    </Sheet>
  );
}

/** What Ask shows for one Item, inside a sheet or the reader pane: the earlier questions, the answers and the question box. */
export function AskPanel({ item, basePath, inputRef: input }: { item: BriefItem; basePath: string; inputRef: RefObject<HTMLTextAreaElement | null> }) {
  const { lang, t } = useLanguage();
  const [asks, setAsks] = useState<Ask[] | null>(null);
  const [limit, setLimit] = useState<AskLimit | null>(null);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const url = `${basePath}/api/items/${encodeURIComponent(item.id)}/ask`;

  useEffect(() => {
    let live = true;
    fetch(url)
      .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
      .then((body: { asks: Ask[]; ask_limit: AskLimit }) => {
        if (!live) return;
        setAsks(body.asks);
        setLimit(body.ask_limit);
      })
      .catch(() => live && setError(t("Could not load your questions.", "تعذّر تحميل أسئلتك.")));
    return () => {
      live = false;
    };
    // t changes with the language; the questions do not need loading again.
  }, [url]);

  const outOfQuestions = limit !== null && limit.remaining === 0;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!question.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question }),
      });
      const body = await res.json().catch(() => ({}));
      if (body.ask_limit) setLimit(body.ask_limit);
      if (res.status === 201) {
        setAsks((prev) => [...(prev ?? []), body.ask]);
        setQuestion("");
      } else if (res.status === 429) {
        setError(t("You've used today's questions.", "استخدمت أسئلة اليوم كلها."));
      } else if (res.status === 502) {
        setError(t("Claude couldn't answer just now. Try again; it wasn't counted.", "تعذّر على Claude الإجابة الآن. حاول مجددًا؛ لم يُحتسب السؤال."));
      } else {
        setError(t("Could not send your question.", "تعذّر إرسال سؤالك."));
      }
    } catch {
      setError(t("Could not send your question.", "تعذّر إرسال سؤالك."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <p className={s.about} dir="auto">
        {localized(item, "title", lang)}
      </p>

        <div className={s.thread} aria-live="polite">
          {asks?.map((a) => (
            <article key={a.id} className={s.ask}>
              <p className={s.question} dir="auto">
                {a.question}
              </p>
              <p className={s.answer} dir="auto">
                {a.answer}
              </p>
              {a.citations.length > 0 && (
                <ul className={s.citations} aria-label={t("Sources", "المصادر")}>
                  {a.citations.map((c) => (
                    <li key={c.url}>
                      <a href={c.url} target="_blank" rel="noopener noreferrer" dir="auto">
                        {c.title ?? hostOf(c.url)}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </article>
          ))}
          {asks?.length === 0 && (
            <p className={s.note}>
              {t(
                "Ask about this story. Claude answers from its sources and a web search, with links. Only you see your questions.",
                "اسأل عن هذا الخبر. يجيب Claude من مصادره وبحث على الويب مع روابط. لا يرى أسئلتك غيرك.",
              )}
            </p>
          )}
          {busy && <p className={s.note}>{t("Claude is looking into it…", "يبحث Claude في الأمر…")}</p>}
        </div>

        {error && (
          <p className={s.error} role="alert">
            {error}
          </p>
        )}

        <form className={s.form} onSubmit={submit}>
          <textarea
            ref={input}
            rows={2}
            dir="auto"
            maxLength={2000}
            aria-label={t("Your question", "سؤالك")}
            placeholder={t("Ask about this story…", "اسأل عن هذا الخبر…")}
            value={question}
            disabled={outOfQuestions}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                e.currentTarget.form?.requestSubmit();
              }
            }}
          />
          <button type="submit" disabled={busy || outOfQuestions || !question.trim() || limit === null}>
            {t("Ask", "اسأل")}
          </button>
        </form>
        <p className={s.left} data-testid="asks-left">
          {limit && leftLine(limit, lang, t)}
        </p>
    </>
  );
}

function leftLine(limit: AskLimit, lang: "en" | "ar", t: (en: string, ar: string) => string): string {
  if (limit.unlimited) return t("No daily limit on your questions.", "لا حدّ يوميًا لأسئلتك.");
  if (limit.remaining === 0) {
    return t("No questions left today. More at midnight, Riyadh time.", "لا أسئلة متبقية اليوم. تتجدد عند منتصف الليل بتوقيت الرياض.");
  }
  const left = formatNumber(limit.remaining!, lang);
  const of = formatNumber(limit.daily!, lang);
  return t(`${left} of ${of} questions left today`, `تبقّى ${left} من ${of} سؤالًا اليوم`);
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
