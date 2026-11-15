"use client";
// The Owner's Ask limits (ticket 16): each Reader's questions to Claude today
// and their daily limit, which the Owner can change. The Owner has no limit.
import { useEffect, useState, type FormEvent } from "react";
import type { ReaderAskUsage } from "@/server/ask/limits";
import { formatNumber } from "../_components/i18n";
import { useLanguage } from "../_components/language";
import { inputStyle, quietButtonStyle } from "../_components/styles";

export function AskLimitsManager({ basePath, initial }: { basePath: string; initial: ReaderAskUsage[] }) {
  const { t } = useLanguage();
  const [readers, setReaders] = useState(initial.filter((r) => !r.ask_limit.unlimited));
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);

  if (readers.length === 0) {
    return <p style={{ color: "var(--mute)" }}>{t("No Readers yet.", "لا يوجد قرّاء بعد.")}</p>;
  }
  return (
    <ul aria-label={t("Ask limits", "حدود الأسئلة")} style={{ listStyle: "none", margin: 0, padding: 0 }}>
      {readers.map((r) => (
        <LimitRow
          key={r.id}
          reader={r}
          basePath={basePath}
          ready={ready}
          onSaved={(next) => setReaders((all) => all.map((x) => (x.id === next.id ? next : x)))}
        />
      ))}
    </ul>
  );
}

function LimitRow({
  reader,
  basePath,
  ready,
  onSaved,
}: {
  reader: ReaderAskUsage;
  basePath: string;
  ready: boolean;
  onSaved(next: ReaderAskUsage): void;
}) {
  const { lang, t } = useLanguage();
  const [value, setValue] = useState(String(reader.ask_limit.daily ?? ""));
  const [message, setMessage] = useState<string | null>(null);

  async function save(event: FormEvent) {
    event.preventDefault();
    setMessage(null);
    const res = await fetch(`${basePath}/api/readers/${reader.id}/ask-limit`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ daily_limit: Number(value) }),
    });
    const body = await res.json().catch(() => ({}));
    if (res.ok) {
      onSaved({ ...reader, ask_limit: body.ask_limit });
      setMessage(t("Saved", "تم الحفظ"));
    } else {
      setMessage(body.error ?? t("Could not save.", "تعذّر الحفظ."));
    }
  }

  const used = formatNumber(reader.ask_limit.used_today, lang);
  return (
    <li style={{ padding: "12px 0", borderBottom: "1px solid var(--line)" }}>
      <form onSubmit={save} style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <span dir="ltr" style={{ flex: "1 1 160px", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
          {reader.email}
        </span>
        <span style={{ color: "var(--mute)", fontSize: "var(--fs-s)" }}>{t(`${used} asked today`, `${used} اليوم`)}</span>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--fs-s)" }}>
          {t("Daily limit", "الحد اليومي")}
          <input
            type="number"
            min={0}
            max={1000}
            step={1}
            required
            inputMode="numeric"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            style={{ ...inputStyle, width: 80, padding: "8px 10px", minHeight: 36 }}
          />
        </label>
        <button type="submit" disabled={!ready} style={quietButtonStyle}>
          {t("Save", "حفظ")}
        </button>
        {message && (
          <span role="status" style={{ fontSize: "var(--fs-s)" }}>
            {message}
          </span>
        )}
      </form>
    </li>
  );
}
