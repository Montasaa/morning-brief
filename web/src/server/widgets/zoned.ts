// Time zone arithmetic for Widgets: an instant written in a Reader's local time.
// Intl knows every IANA zone and its daylight-saving rules, so nothing here
// hard-codes offsets.

/** The time zone Editions are written in, and the Reader's when we do not know theirs. */
export const DEFAULT_TIMEZONE = "Asia/Riyadh";

/** `timezone` when Intl knows it, else the default. */
export function knownTimezone(timezone: string | null | undefined): string {
  if (!timezone) return DEFAULT_TIMEZONE;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone });
    return timezone;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

/** The wall-clock fields of an instant in a time zone. */
function wallClock(ms: number, timezone: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(new Date(ms))
      .map((p) => [p.type, p.value]),
  ) as Record<string, string>;
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
}

/** An instant as RFC 3339 in a time zone, e.g. "2026-11-15T15:00:00+00:00". */
export function inTimezone(at: string | number, timezone: string): string {
  const ms = Math.floor(new Date(at).getTime() / 1000) * 1000;
  const local = wallClock(ms, timezone);
  const offsetMinutes = Math.round((Date.parse(`${local}Z`) - ms) / 60_000);
  const sign = offsetMinutes < 0 ? "-" : "+";
  const abs = Math.abs(offsetMinutes);
  const hh = String(Math.floor(abs / 60)).padStart(2, "0");
  const mm = String(abs % 60).padStart(2, "0");
  return `${local}${sign}${hh}:${mm}`;
}

/** The YYYY-MM-DD date of an instant in a time zone. */
export function dateIn(at: string | number, timezone: string): string {
  return wallClock(new Date(at).getTime(), timezone).slice(0, 10);
}
