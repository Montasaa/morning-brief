"use client";
// Claude Topic suggestions in the browser (ticket 12), in onboarding and on the
// Me tab. The Reader writes a line about themselves; POST
// /api/me/topic-suggestions returns Catalog Topics with a reason for each.
// Follow accepts one (POST /api/topics/{id}/follow, then onFollowed so the
// Topic list ticks it); Skip just drops it. When Claude is unavailable the
// Reader is told to pick Topics themselves; nothing else depends on this.
import { useState } from "react";
import type { CatalogTopic } from "@/server/topics/catalog";
import type { TopicSuggestion, TopicSuggestions as SuggestionsReply } from "@/server/topics/suggestions";
import { useLanguage } from "./language";
import p from "./interest-profile.module.css";
import s from "./topic-suggestions.module.css";
import { inputStyle, quietButtonStyle } from "./styles";

const NOTE_MAX_LENGTH = 500;

type Message = { text: string; error?: boolean };

export function TopicSuggestions({
  basePath,
  selected,
  onFollowed,
  disabled,
  optional,
}: {
  basePath: string;
  /** Topics already picked or followed: their suggestions are not shown. */
  selected: ReadonlySet<string>;
  /** Called once a suggested Topic is followed. */
  onFollowed(topic: CatalogTopic): void;
  disabled?: boolean;
  /** Onboarding: the note is optional there. */
  optional?: boolean;
}) {
  const { lang, t } = useLanguage();
  const [note, setNote] = useState("");
  const [asking, setAsking] = useState(false);
  const [suggestions, setSuggestions] = useState<TopicSuggestion[] | null>(null);
  const [busyTopic, setBusyTopic] = useState<string | null>(null);
  const [message, setMessage] = useState<Message | null>(null);
  const shown = (suggestions ?? []).filter((x) => !selected.has(x.topic.id));
  const name = (topic: CatalogTopic) => (lang === "ar" ? topic.name_ar : topic.name);

  async function ask() {
    setAsking(true);
    setMessage(null);
    setSuggestions(null);
    try {
      const res = await fetch(`${basePath}/api/me/topic-suggestions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ note }),
      });
      const json = (await res.json().catch(() => ({}))) as Partial<SuggestionsReply> & { error?: string };
      if (!res.ok) {
        setMessage({ text: json.error ?? t("Something went wrong. Try again.", "حدث خطأ. حاول مرة أخرى."), error: true });
        return;
      }
      const list = (json.suggestions ?? []).filter((x) => !selected.has(x.topic.id));
      setSuggestions(list);
      if (json.unavailable) {
        setMessage({
          text: t(
            "Suggestions are not available right now. You can still pick Topics yourself.",
            "الاقتراحات غير متاحة الآن. لا يزال بإمكانك اختيار الموضوعات بنفسك.",
          ),
        });
      } else if (list.length === 0) {
        setMessage({
          text: t(
            "No new Topics to suggest. Try saying a little more about yourself.",
            "لا توجد موضوعات جديدة لاقتراحها. جرّب أن تكتب المزيد عن نفسك.",
          ),
        });
      }
    } catch {
      setMessage({ text: t("Something went wrong. Try again.", "حدث خطأ. حاول مرة أخرى."), error: true });
    } finally {
      setAsking(false);
    }
  }

  function drop(topicId: string) {
    setSuggestions((prev) => (prev ?? []).filter((x) => x.topic.id !== topicId));
  }

  async function follow(topic: CatalogTopic) {
    setBusyTopic(topic.id);
    try {
      const res = await fetch(`${basePath}/api/topics/${encodeURIComponent(topic.id)}/follow`, { method: "POST" });
      if (!res.ok) throw new Error(String(res.status));
      onFollowed(topic);
      drop(topic.id);
      setMessage({ text: t(`Following ${topic.name}.`, `تتابع الآن ${topic.name_ar}.`) });
    } catch {
      setMessage({ text: t("Could not save. Try again.", "تعذّر الحفظ. حاول مرة أخرى."), error: true });
    } finally {
      setBusyTopic(null);
    }
  }

  return (
    <div className={p.setting}>
      <label className={p.label} htmlFor="about-me">
        {optional ? t("About you (optional)", "عنك (اختياري)") : t("Find more Topics", "اكتشف موضوعات أخرى")}
      </label>
      <p className={s.hint}>
        {t(
          "Write a line about yourself and Claude suggests Topics to follow.",
          "اكتب سطرًا عن نفسك وسيقترح Claude موضوعات تتابعها.",
        )}
      </p>
      <textarea
        id="about-me"
        name="about-me"
        rows={2}
        maxLength={NOTE_MAX_LENGTH}
        dir="auto"
        className={s.note}
        style={inputStyle}
        placeholder={t(
          "e.g. I work in tech in Jeddah and never miss a Liverpool match.",
          "مثال: أعمل في التقنية في جدة ولا تفوتني مباراة لليفربول.",
        )}
        value={note}
        disabled={disabled || asking}
        onChange={(e) => setNote(e.target.value)}
      />
      <button
        type="button"
        style={quietButtonStyle}
        className={s.ask}
        disabled={disabled || asking || note.trim() === ""}
        onClick={ask}
      >
        {asking ? t("Asking Claude…", "جارٍ سؤال Claude…") : t("Suggest Topics", "اقترح موضوعات")}
      </button>

      {shown.length > 0 && (
        <ul className={s.list} aria-label={t("Suggested Topics", "موضوعات مقترحة")}>
          {shown.map(({ topic, reason, reason_ar }) => {
            const why = lang === "ar" ? reason_ar || reason : reason;
            return (
              <li key={topic.id} className={s.item}>
                <div className={s.text}>
                  <span className={s.name}>{name(topic)}</span>
                  {why && (
                    <span className={s.why} dir="auto">
                      {why}
                    </span>
                  )}
                </div>
                <div className={s.buttons}>
                  <button
                    type="button"
                    style={quietButtonStyle}
                    className={s.follow}
                    aria-label={t(`Follow ${topic.name}`, `تابع ${topic.name_ar}`)}
                    disabled={disabled || busyTopic !== null}
                    onClick={() => follow(topic)}
                  >
                    {t("Follow", "تابع")}
                  </button>
                  <button
                    type="button"
                    style={quietButtonStyle}
                    aria-label={t(`Skip ${topic.name}`, `تخطَّ ${topic.name_ar}`)}
                    disabled={disabled || busyTopic === topic.id}
                    onClick={() => drop(topic.id)}
                  >
                    {t("Skip", "تخطَّ")}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <p aria-live="polite" className={`${p.note} ${message?.error ? p.error : ""}`} data-testid="suggestions-status">
        {message?.text ?? ""}
      </p>
    </div>
  );
}
