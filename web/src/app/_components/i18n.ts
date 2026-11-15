// The Reader's language: English, or Arabic laid out right to left (spec:
// Language). Plain helpers that both server and client components can import;
// the React side (provider, hook, switches) is in language.tsx.
//
// Every Brief carries both languages (Items keep their `_ar` fields, Topics
// have `topic_names_ar`), so switching language never fetches data again.
// The choice is kept in a cookie scoped to the app's base path (for this
// device, and signed-out pages) and, for a signed-in Reader, in their Interest
// Profile (ticket 07), which wins when the page is first rendered.

export type Lang = "en" | "ar";

export const LANG_COOKIE = "brief_lang";
/** A year: the choice lasts on this device until it is changed. */
export const LANG_COOKIE_MAX_AGE = 365 * 24 * 3600;

/** The language a cookie value names; English unless it is exactly "ar". */
export function languageFrom(value: string | undefined | null): Lang {
  return value === "ar" ? "ar" : "en";
}

export function dirOf(lang: Lang): "ltr" | "rtl" {
  return lang === "ar" ? "rtl" : "ltr";
}

/** The Intl locale for dates, times and numbers: Saudi Arabic on the Gregorian calendar, or British English. */
export function localeOf(lang: Lang): string {
  return lang === "ar" ? "ar-SA-u-ca-gregory" : "en-GB";
}

/**
 * A field in the Reader's language: `field_ar` in Arabic when it is present,
 * otherwise the English `field` (so a missing translation shows English).
 */
export function localized(record: object, field: string, lang: Lang): string | null {
  const fields = record as Record<string, unknown>;
  const ar = fields[`${field}_ar`];
  if (lang === "ar" && typeof ar === "string" && ar) return ar;
  const en = fields[field];
  return typeof en === "string" && en ? en : null;
}

/** A number written the Reader's way ("1,840" or "١٬٨٤٠"). */
/** A Topic's name in the Reader's language, from a Brief's (or listing's) name maps; the id if it has none. */
export function topicName(
  names: { topic_names: Record<string, string>; topic_names_ar: Record<string, string> },
  id: string,
  lang: Lang,
): string {
  return (lang === "ar" ? names.topic_names_ar[id] : undefined) ?? names.topic_names[id] ?? id;
}

export function formatNumber(n: number, lang: Lang): string {
  return n.toLocaleString(lang === "ar" ? "ar-SA" : "en-US");
}
