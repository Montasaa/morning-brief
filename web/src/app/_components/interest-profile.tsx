"use client";
// The Interest Profile in the browser (ticket 07): onboarding on a Reader's
// first visit, and the Me tab's Topics and city. The language setting is
// LanguageSetting (language.tsx), which saves to the profile itself.
//
// Onboarding sends one PATCH /api/me {topics, language, city, onboarded: true}.
// On the Me tab each Topic is followed or unfollowed the moment it is tapped,
// and the city is saved with its own button. Sensitive Topics have their own
// section there (ticket 08): turning one on is opting in, and Adult Trending
// first asks the Reader to confirm they are 18 or over.
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import type { CatalogTopic } from "@/server/topics/catalog";
import { formatNumber } from "./i18n";
import { LanguageSetting, useLanguage } from "./language";
import s from "./interest-profile.module.css";
import { buttonStyle, inputStyle, quietButtonStyle } from "./styles";
import { TopicSuggestions } from "./topic-suggestions";

/** Suggestions for the city field; any city can be typed. */
const CITIES: [en: string, ar: string][] = [
  ["Riyadh", "الرياض"],
  ["Jeddah", "جدة"],
  ["Mecca", "مكة"],
  ["Medina", "المدينة المنورة"],
  ["Dammam", "الدمام"],
  ["Sanaa", "صنعاء"],
  ["Aden", "عدن"],
  ["Dubai", "دبي"],
  ["London", "لندن"],
];
const DEFAULT_CITY = "Riyadh";
/** The Sensitive Topic that needs an 18+ confirmation (POST .../follow {age_confirmed: true}). */
const ADULT_TOPIC_ID = "adult-trending";

async function patchProfile(basePath: string, body: unknown): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${basePath}/api/me`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) return { ok: true };
    const json = await res.json().catch(() => ({}));
    return { ok: false, error: typeof json.error === "string" ? json.error : undefined };
  } catch {
    return { ok: false };
  }
}

/** Buttons and inputs stay disabled until React is running, so an early tap is not lost. */
function useHydrated(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  return ready;
}

function TopicChecklist({
  topics,
  selected,
  onToggle,
  disabled,
  legend,
  children,
}: {
  topics: CatalogTopic[];
  selected: ReadonlySet<string>;
  onToggle(topic: CatalogTopic, on: boolean): void;
  disabled?: boolean;
  legend?: string;
  children?: ReactNode;
}) {
  const { lang, t } = useLanguage();
  return (
    <fieldset className={s.setting}>
      <legend>{legend ?? t("Topics", "الموضوعات")}</legend>
      {children}
      <div className={s.topics}>
        {topics.map((topic) => {
          const on = selected.has(topic.id);
          return (
            <label key={topic.id} className={s.topic}>
              <input
                type="checkbox"
                name="topics"
                value={topic.id}
                checked={on}
                disabled={disabled}
                onChange={(e) => onToggle(topic, e.target.checked)}
              />
              <span className={s.tick} aria-hidden>
                {on ? "✓" : "+"}
              </span>
              <span>{lang === "ar" ? topic.name_ar : topic.name}</span>
              {topic.sensitive && <span className={s.sensitive}>{t("Sensitive", "حساس")}</span>}
              {topic.private && <span className={s.sensitive}>{t("Private", "خاص")}</span>}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

function CityInput({ value, onChange, disabled }: { value: string; onChange(v: string): void; disabled?: boolean }) {
  const { lang } = useLanguage();
  return (
    <>
      <input
        id="city"
        name="city"
        list="city-suggestions"
        autoComplete="address-level2"
        maxLength={80}
        dir="auto"
        style={inputStyle}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      />
      <datalist id="city-suggestions">
        {CITIES.map(([en, ar]) => (
          <option key={en} value={en}>
            {lang === "ar" ? ar : en}
          </option>
        ))}
      </datalist>
    </>
  );
}

/** A first-time Reader picks Topics, language and city, then gets their first Brief. */
export function Onboarding({
  basePath,
  topics,
  initialTopics,
  initialCity,
}: {
  basePath: string;
  /** The Catalog's Topics a Reader may pick here: never the Sensitive ones. */
  topics: CatalogTopic[];
  initialTopics: string[];
  initialCity: string | null;
}) {
  const { lang, t } = useLanguage();
  const router = useRouter();
  const ready = useHydrated();
  const [selected, setSelected] = useState<Set<string>>(() => new Set(initialTopics));
  const [city, setCity] = useState(initialCity ?? DEFAULT_CITY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(topic: CatalogTopic, on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(topic.id);
      else next.delete(topic.id);
      return next;
    });
  }

  async function finish(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const result = await patchProfile(basePath, {
      topics: [...selected],
      language: lang,
      city: city.trim() || null,
      onboarded: true,
    });
    if (result.ok) {
      router.replace("/");
      router.refresh();
      return;
    }
    setBusy(false);
    setError(result.error ?? t("Something went wrong. Try again.", "حدث خطأ. حاول مرة أخرى."));
  }

  return (
    <main className={`${s.screen} ${s.onboarding}`}>
      <h1>{t("Welcome to Morning Brief", "أهلًا بك في الموجز الصباحي")}</h1>
      <p className={s.lede}>
        {t(
          "Pick the Topics your Brief should cover. You can change them any time on the Me tab.",
          "اختر الموضوعات التي يغطيها موجزك. يمكنك تغييرها في أي وقت من تبويب «أنا».",
        )}
      </p>
      <LanguageSetting />
      <form onSubmit={finish}>
        <TopicChecklist topics={topics} selected={selected} onToggle={toggle} disabled={!ready || busy} />
        <p className={s.note}>
          {t(
            "Sensitive Topics (graphic and adult-themed news) are off. You can turn them on later from the Me tab.",
            "الموضوعات الحساسة (المشاهد القاسية وأخبار البالغين) مغلقة. يمكنك تفعيلها لاحقًا من تبويب «أنا».",
          )}
        </p>
        <TopicSuggestions
          basePath={basePath}
          selected={selected}
          onFollowed={(topic) => toggle(topic, true)}
          disabled={!ready || busy}
          optional
        />
        <div className={s.setting}>
          <label className={s.label} htmlFor="city">
            {t("City", "المدينة")}
          </label>
          <CityInput value={city} onChange={setCity} disabled={!ready || busy} />
          <p className={s.note}>{t("For weather and prayer times.", "لحالة الطقس ومواقيت الصلاة.")}</p>
        </div>
        <div className={s.actions}>
          <button type="submit" style={buttonStyle} disabled={!ready || busy || selected.size === 0}>
            {t("Start my Brief", "ابدأ موجزي")}
          </button>
          <p role="status" className={`${s.status} ${error ? s.error : ""}`}>
            {error ??
              (selected.size === 0 ? t("Pick at least one Topic.", "اختر موضوعًا واحدًا على الأقل.") : "")}
          </p>
        </div>
      </form>
    </main>
  );
}

/** The Me tab's Topics and city. Every change is saved straight away. */
export function ProfileSettings({
  basePath,
  topics,
  initialTopics,
  initialCity,
}: {
  basePath: string;
  topics: CatalogTopic[];
  initialTopics: string[];
  initialCity: string | null;
}) {
  const { lang, t } = useLanguage();
  const ready = useHydrated();
  const [selected, setSelected] = useState<Set<string>>(() => new Set(initialTopics));
  const [pending, setPending] = useState(0);
  const [city, setCity] = useState(initialCity ?? "");
  const [savedCity, setSavedCity] = useState(initialCity ?? "");
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  /** A Sensitive Topic waiting for the 18+ confirmation before it is opted into. */
  const [confirming, setConfirming] = useState<CatalogTopic | null>(null);
  const general = topics.filter((topic) => !topic.sensitive);
  const sensitive = topics.filter((topic) => topic.sensitive);

  function toggleSensitive(topic: CatalogTopic, on: boolean) {
    if (on && topic.id === ADULT_TOPIC_ID) {
      setConfirming(topic);
      return;
    }
    setConfirming(null);
    void toggle(topic, on);
  }

  async function toggle(topic: CatalogTopic, on: boolean, ageConfirmed = false) {
    const set = (value: boolean) =>
      setSelected((prev) => {
        const next = new Set(prev);
        if (value) next.add(topic.id);
        else next.delete(topic.id);
        return next;
      });
    set(on);
    setPending((n) => n + 1);
    try {
      const res = await fetch(`${basePath}/api/topics/${encodeURIComponent(topic.id)}/${on ? "follow" : "unfollow"}`, {
        method: "POST",
        ...(ageConfirmed
          ? { headers: { "content-type": "application/json" }, body: JSON.stringify({ age_confirmed: true }) }
          : {}),
      });
      if (!res.ok) throw new Error(String(res.status));
      setMessage(null);
    } catch {
      set(!on);
      setMessage({ text: t("Could not save. Try again.", "تعذّر الحفظ. حاول مرة أخرى."), error: true });
    } finally {
      setPending((n) => n - 1);
    }
  }

  async function saveCity(event: FormEvent) {
    event.preventDefault();
    const value = city.trim();
    const result = await patchProfile(basePath, { city: value || null });
    if (result.ok) {
      setCity(value);
      setSavedCity(value);
      setMessage({ text: value ? t(`City saved: ${value}`, `حُفظت المدينة: ${value}`) : t("City cleared.", "مُسحت المدينة.") });
    } else {
      setMessage({ text: result.error ?? t("Could not save. Try again.", "تعذّر الحفظ. حاول مرة أخرى."), error: true });
    }
  }

  return (
    <>
      <TopicChecklist topics={general} selected={selected} onToggle={(topic, on) => void toggle(topic, on)} disabled={!ready} />
      <p className={s.note} aria-live="polite">
        {selected.size === 0
          ? t("You follow no Topics, so your Brief is empty.", "لا تتابع أي موضوع، لذا موجزك فارغ.")
          : t(
              `Your Brief covers ${selected.size} ${selected.size === 1 ? "Topic" : "Topics"}.`,
              `عدد الموضوعات في موجزك: ${formatNumber(selected.size, lang)}.`,
            )}
        {pending > 0 ? " …" : ""}
      </p>
      <TopicChecklist
        topics={sensitive}
        selected={selected}
        onToggle={toggleSensitive}
        disabled={!ready || confirming !== null}
        legend={t("Sensitive Topics", "الموضوعات الحساسة")}
      >
        <p className={s.sensitiveNote}>
          {t(
            "Graphic and adult-themed news stay hidden until you opt in here. Once you do, each of their Items is blurred with a warning until you tap it.",
            "تبقى الأخبار ذات المشاهد القاسية وأخبار البالغين مخفية حتى تفعّلها هنا. وبعد تفعيلها، يبقى كل عنصر منها مموّهًا مع تحذير حتى تضغط عليه.",
          )}
        </p>
      </TopicChecklist>
      {confirming && (
        <div role="group" aria-labelledby="age-confirm-title" className={s.ageConfirm}>
          <p id="age-confirm-title" className={s.ageConfirmTitle}>
            {t("Adult Trending is for adults only.", "«رائج للبالغين» للبالغين فقط.")}
          </p>
          <p className={s.note}>
            {t(
              "Mainstream news about the adult world: no explicit images and no links to adult sites. Confirm you are 18 or over to turn it on.",
              "أخبار من وسائل إعلام موثوقة عن عالم البالغين، دون صور فاضحة أو روابط لمواقع البالغين. أكّد أن عمرك ١٨ عامًا أو أكثر لتفعيله.",
            )}
          </p>
          <div className={s.ageConfirmActions}>
            <button
              type="button"
              style={buttonStyle}
              onClick={() => {
                setConfirming(null);
                void toggle(confirming, true, true);
              }}
            >
              {t("I am 18 or over", "عمري ١٨ عامًا أو أكثر")}
            </button>
            <button type="button" style={quietButtonStyle} onClick={() => setConfirming(null)}>
              {t("Cancel", "إلغاء")}
            </button>
          </div>
        </div>
      )}
      <LanguageSetting />
      <form className={s.setting} onSubmit={saveCity}>
        <label className={s.label} htmlFor="city">
          {t("City", "المدينة")}
        </label>
        <div className={s.cityRow}>
          <CityInput value={city} onChange={setCity} disabled={!ready} />
          <button type="submit" style={quietButtonStyle} disabled={!ready || city.trim() === savedCity}>
            {t("Save city", "حفظ المدينة")}
          </button>
        </div>
        <p className={s.note}>{t("For weather and prayer times.", "لحالة الطقس ومواقيت الصلاة.")}</p>
      </form>
      <TopicSuggestions
        basePath={basePath}
        selected={selected}
        onFollowed={(topic) => setSelected((prev) => new Set(prev).add(topic.id))}
        disabled={!ready}
      />
      <p role="status" className={`${s.status} ${message?.error ? s.error : ""}`}>
        {message?.text ?? ""}
      </p>
    </>
  );
}
