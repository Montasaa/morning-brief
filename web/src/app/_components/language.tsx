"use client";
// The Reader's language in the browser. The root layout reads the cookie and
// renders <html lang dir> to match, then wraps the app in LanguageProvider.
// Switching re-renders every screen in place (no reload, no refetch), flips
// <html dir>, and remembers the choice in the cookie.
//
//   const { lang, t } = useLanguage();  t("Save", "حفظ")
//   <T en="Threads" ar="القصص المتواصلة" />   (usable inside server components)
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { LANG_COOKIE, LANG_COOKIE_MAX_AGE, dirOf, type Lang } from "./i18n";
import s from "./language.module.css";

interface LanguageState {
  lang: Lang;
  dir: "ltr" | "rtl";
  setLang(lang: Lang): void;
  /** The English or Arabic string, by the current language. */
  t(en: string, ar: string): string;
}

const LanguageContext = createContext<LanguageState | null>(null);

export function LanguageProvider({
  initial,
  cookiePath,
  children,
}: {
  initial: Lang;
  /** The app's base path, so the cookie is the app's alone on the shared domain. */
  cookiePath: string;
  children: ReactNode;
}) {
  const [lang, setLangState] = useState<Lang>(initial);

  useEffect(() => {
    const root = document.documentElement;
    root.lang = lang;
    root.dir = dirOf(lang);
  }, [lang]);

  const setLang = useCallback(
    (next: Lang) => {
      setLangState(next);
      document.cookie = `${LANG_COOKIE}=${next}; path=${cookiePath || "/"}; max-age=${LANG_COOKIE_MAX_AGE}; samesite=lax`;
    },
    [cookiePath],
  );

  const value = useMemo<LanguageState>(
    () => ({ lang, dir: dirOf(lang), setLang, t: (en, ar) => (lang === "ar" ? ar : en) }),
    [lang, setLang],
  );
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageState {
  const state = useContext(LanguageContext);
  if (!state) throw new Error("useLanguage needs a LanguageProvider (the root layout has one)");
  return state;
}

/** Text in the Reader's language. */
export function T({ en, ar }: { en: string; ar: string }) {
  return <>{useLanguage().t(en, ar)}</>;
}

/** The small switch on the Brief: shows the other language ("ع" or "EN"). */
export function LanguageToggle({ className }: { className?: string }) {
  const { lang, setLang } = useLanguage();
  const other: Lang = lang === "ar" ? "en" : "ar";
  return (
    <button
      type="button"
      className={className}
      lang={other}
      aria-label={other === "ar" ? "العربية" : "English"}
      onClick={() => setLang(other)}
    >
      {other === "ar" ? "ع" : "EN"}
    </button>
  );
}

/** The language setting on the Me tab. */
export function LanguageSetting() {
  const { lang, setLang, t } = useLanguage();
  const options: { value: Lang; label: string }[] = [
    { value: "en", label: "English" },
    { value: "ar", label: "العربية" },
  ];
  return (
    <fieldset className={s.setting}>
      <legend>{t("Language", "اللغة")}</legend>
      {options.map((o) => (
        <label key={o.value} lang={o.value} className={s.option}>
          <input
            type="radio"
            name="language"
            value={o.value}
            checked={lang === o.value}
            onChange={() => setLang(o.value)}
          />
          {o.label}
        </label>
      ))}
    </fieldset>
  );
}
