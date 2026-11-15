// The real prayer-times adapter: Aladhan (https://aladhan.com/prayer-times-api),
// Umm al-Qura method. Free, no key.
import type { PrayerTimes, PrayerTimesService } from "./index";

/** Aladhan's method 4: Umm al-Qura University, Makkah. */
export const UMM_AL_QURA = "4";

export interface AladhanOptions {
  /** Injected for adapter tests; defaults to the global fetch. */
  fetch?: typeof fetch;
  /** Give up after this long (default 5 s): the cover card renders without the Widget. */
  timeoutMs?: number;
}

export function aladhanPrayerTimesService(options: AladhanOptions = {}): PrayerTimesService {
  return {
    async forDay(place, date) {
      const [y, m, d] = date.split("-");
      const day = `${d}-${m}-${y}`; // Aladhan wants DD-MM-YYYY
      const byCoordinates = place.latitude != null && place.longitude != null;
      const url = new URL(
        byCoordinates ? `https://api.aladhan.com/v1/timings/${day}` : `https://api.aladhan.com/v1/timingsByAddress/${day}`,
      );
      const params = new URLSearchParams({ method: UMM_AL_QURA });
      if (byCoordinates) {
        params.set("latitude", String(place.latitude));
        params.set("longitude", String(place.longitude));
        if (place.timezone) params.set("timezonestring", place.timezone);
      } else {
        params.set("address", [place.city, place.country].filter(Boolean).join(", "));
      }
      url.search = params.toString();

      const doFetch = options.fetch ?? fetch;
      const res = await doFetch(url, { signal: AbortSignal.timeout(options.timeoutMs ?? 5000) });
      if (!res.ok) throw new Error(`Aladhan refused the request (${res.status})`);
      const timings = ((await res.json()) as { data?: { timings?: Record<string, string> } })?.data?.timings ?? {};

      // "18:43 (+03)" -> "18:43"
      const hhmm = (name: string): string => {
        const match = /^(\d{2}:\d{2})/.exec(timings[name] ?? "");
        if (!match) throw new Error(`Aladhan sent no ${name} time`);
        return match[1]!;
      };
      return {
        date,
        fajr: hhmm("Fajr"),
        sunrise: hhmm("Sunrise"),
        dhuhr: hhmm("Dhuhr"),
        asr: hhmm("Asr"),
        maghrib: hhmm("Maghrib"),
        isha: hhmm("Isha"),
      } satisfies PrayerTimes;
    },
  };
}
