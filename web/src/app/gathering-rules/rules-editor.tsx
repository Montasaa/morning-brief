"use client";
// One editable card per Topic: its rules in a text box, saved with
// PATCH /api/topics/{id}/rules.
import { useEffect, useState } from "react";
import type { OwnerTopic, RulesBy } from "@/server/topics/gathering-rules";
import { formatNumber } from "../_components/i18n";
import { useLanguage } from "../_components/language";
import { inputStyle, quietButtonStyle } from "../_components/styles";

const RULES_BY: Record<RulesBy, [en: string, ar: string]> = {
  starting: ["Starting rules", "القواعد الأولى"],
  claude: ["Drafted by Claude", "صاغها Claude"],
  fallback: ["Template: Claude was unavailable, check these", "قالب: تعذّر الوصول إلى Claude، راجعها"],
  owner: ["Edited by you", "عدّلتها أنت"],
};

function TopicRules({ basePath, topic: initial }: { basePath: string; topic: OwnerTopic }) {
  const { lang, t } = useLanguage();
  const [topic, setTopic] = useState(initial);
  const [rules, setRules] = useState(initial.rules);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const name = lang === "ar" ? topic.name_ar : topic.name;

  async function save() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`${basePath}/api/topics/${encodeURIComponent(topic.id)}/rules`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rules }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        setTopic(body.topic);
        setRules(body.topic.rules);
        setMessage(t("Saved.", "حُفظت."));
      } else {
        setMessage(body.error ?? t("Could not save. Try again.", "تعذّر الحفظ. حاول مرة أخرى."));
      }
    } catch {
      setMessage(t("Could not save. Try again.", "تعذّر الحفظ. حاول مرة أخرى."));
    } finally {
      setBusy(false);
    }
  }

  const meta = [
    topic.private ? t("Private", "خاص") : null,
    topic.sensitive ? t("Sensitive", "حساس") : null,
    topic.created_by ? t(`Created by ${topic.created_by}`, `أنشأه ${topic.created_by}`) : null,
    topic.followers === 0
      ? t("No followers: not gathered", "لا متابعين: لا يُجمع")
      : t(
          `${topic.followers} ${topic.followers === 1 ? "follower" : "followers"}`,
          `المتابعون: ${formatNumber(topic.followers, lang)}`,
        ),
    t(...RULES_BY[topic.rules_by]),
  ].filter(Boolean);

  return (
    <li style={{ padding: "16px 0", borderBottom: "1px solid var(--rule)" }} aria-label={name}>
      <h2 dir="auto" style={{ fontSize: 17, margin: "0 0 4px" }}>
        {name}
      </h2>
      <p style={{ margin: "0 0 8px", fontSize: 13, color: "var(--muted)" }}>{meta.join(" · ")}</p>
      {topic.note && (
        <p dir="auto" style={{ margin: "0 0 8px", fontSize: 14 }}>
          {t("Note: ", "الملاحظة: ")}
          {topic.note}
        </p>
      )}
      <label>
        <span style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>
          {t(`Gathering Rules for ${name}`, `قواعد جمع ${name}`)}
        </span>
        <textarea
          dir="auto"
          rows={5}
          maxLength={4000}
          value={rules}
          disabled={!ready || busy}
          onChange={(e) => setRules(e.target.value)}
          style={{ ...inputStyle, resize: "vertical", fontSize: 14, lineHeight: 1.45 }}
        />
      </label>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 8 }}>
        <button
          type="button"
          style={quietButtonStyle}
          disabled={!ready || busy || !rules.trim() || rules === topic.rules}
          onClick={save}
        >
          {t("Save rules", "احفظ القواعد")}
        </button>
        <span aria-live="polite" style={{ fontSize: 13, color: "var(--muted)" }}>
          {message ?? ""}
        </span>
      </div>
    </li>
  );
}

export function RulesEditor({ basePath, initial }: { basePath: string; initial: OwnerTopic[] }) {
  const { t } = useLanguage();
  return (
    <ul aria-label={t("Topics", "الموضوعات")} style={{ listStyle: "none", margin: 0, padding: 0 }}>
      {initial.map((topic) => (
        <TopicRules key={topic.id} basePath={basePath} topic={topic} />
      ))}
    </ul>
  );
}
