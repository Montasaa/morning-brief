"use client";
// The Me tab's "Your Topics" (ticket 11): create a Topic with a name and a
// short note (POST /api/topics), see which of yours are private, and share one
// to the Catalog (POST /api/topics/{id}/share). A new Topic is followed
// straight away; the page refreshes so the Topics above show it ticked.
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import type { CatalogTopic } from "@/server/topics/catalog";
import { formatNumber } from "./i18n";
import { useLanguage } from "./language";
import s from "./interest-profile.module.css";
import { buttonStyle, inputStyle, quietButtonStyle } from "./styles";

export function YourTopics({
  basePath,
  topics,
  created,
  limit,
}: {
  basePath: string;
  /** The Topics this Reader created, in Catalog order. */
  topics: CatalogTopic[];
  /** How many Topics they have created. */
  created: number;
  /** The most they may create; null for the Owner (no limit). */
  limit: number | null;
}) {
  const { lang, t } = useLanguage();
  const router = useRouter();
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const full = limit !== null && created >= limit;

  async function create(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`${basePath}/api/topics`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, note }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.status === 201) {
        setName("");
        setNote("");
        setMessage({
          text: t(
            `Created "${body.topic.name}". You follow it, and it is gathered from the next Edition.`,
            `أُنشئ «${body.topic.name}». أنت تتابعه، وسيُجمع من الإصدار التالي.`,
          ),
        });
        router.refresh();
      } else {
        setMessage({ text: body.error ?? t("Could not create the Topic.", "تعذّر إنشاء الموضوع."), error: true });
      }
    } catch {
      setMessage({ text: t("Could not create the Topic.", "تعذّر إنشاء الموضوع."), error: true });
    } finally {
      setBusy(false);
    }
  }

  async function share(topic: CatalogTopic) {
    const res = await fetch(`${basePath}/api/topics/${encodeURIComponent(topic.id)}/share`, { method: "POST" });
    if (res.ok) {
      setMessage({ text: t(`"${topic.name}" is in the Catalog now.`, `«${topic.name}» في الفهرس الآن.`) });
      router.refresh();
    } else {
      setMessage({ text: t("Could not share. Try again.", "تعذّرت المشاركة. حاول مرة أخرى."), error: true });
    }
  }

  return (
    <section className={s.setting} aria-labelledby="your-topics">
      <h2 id="your-topics" className={s.label}>
        {t("Your Topics", "موضوعاتك")}
      </h2>
      {topics.length > 0 && (
        <ul aria-label={t("Topics you created", "موضوعات أنشأتها")} style={{ listStyle: "none", margin: "0 0 12px", padding: 0 }}>
          {topics.map((topic) => (
            <li
              key={topic.id}
              style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: "1px solid var(--line)" }}
            >
              <span dir="auto" style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
                {lang === "ar" ? topic.name_ar : topic.name}
              </span>
              {topic.private ? (
                <>
                  <span style={{ color: "var(--mute)", fontSize: "var(--fs-s)" }}>{t("Private", "خاص")}</span>
                  <button type="button" style={quietButtonStyle} disabled={!ready} onClick={() => share(topic)}>
                    {t("Share to Catalog", "شاركه في الفهرس")}
                  </button>
                </>
              ) : (
                <span style={{ color: "var(--mute)", fontSize: "var(--fs-s)" }}>{t("In the Catalog", "في الفهرس")}</span>
              )}
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={create}>
        <label className={s.label} htmlFor="new-topic-name">
          {t("New Topic", "موضوع جديد")}
        </label>
        <input
          id="new-topic-name"
          required
          maxLength={60}
          dir="auto"
          placeholder={t("e.g. Formula 1", "مثل: الفورمولا 1")}
          style={inputStyle}
          value={name}
          disabled={!ready || busy || full}
          onChange={(e) => setName(e.target.value)}
        />
        <label className={s.label} htmlFor="new-topic-note" style={{ marginTop: 12 }}>
          {t("A short note (what you want from it)", "ملاحظة قصيرة (ما الذي تريده منه)")}
        </label>
        <textarea
          id="new-topic-note"
          maxLength={300}
          rows={2}
          dir="auto"
          style={{ ...inputStyle, resize: "vertical" }}
          value={note}
          disabled={!ready || busy || full}
          onChange={(e) => setNote(e.target.value)}
        />
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 12 }}>
          <button type="submit" style={buttonStyle} disabled={!ready || busy || full || !name.trim()}>
            {t("Create Topic", "أنشئ الموضوع")}
          </button>
          {limit !== null && (
            <span className={s.note} style={{ margin: 0 }}>
              {t(
                `${created} of ${limit} created`,
                `أنشأت ${formatNumber(created, lang)} من ${formatNumber(limit, lang)}`,
              )}
            </span>
          )}
        </div>
      </form>
      <p className={s.note}>
        {full
          ? t(
              `You have created ${limit} Topics, the most a Reader can create. Follow one from the Catalog instead.`,
              `أنشأت ${formatNumber(limit ?? 0, lang)} موضوعات، وهو الحد الأقصى. تابع موضوعًا من الفهرس بدلًا من ذلك.`,
            )
          : t(
              "Only you see a new Topic until you share it. Claude drafts how it is gathered.",
              "لا يرى الموضوع الجديد غيرك حتى تشاركه. يكتب Claude طريقة جمعه.",
            )}
      </p>
      {/* aria-live, not role="status": the Profile settings above already have the page's status line. */}
      <p aria-live="polite" data-testid="your-topics-status" className={`${s.status} ${message?.error ? s.error : ""}`}>
        {message?.text ?? ""}
      </p>
    </section>
  );
}
