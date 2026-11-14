// Widgets: the small panels on the cover card (GET /api/widgets, and the
// Brief's cover.widgets).
//
// - Weather (Open-Meteo) and prayer times (Aladhan, Umm al-Qura method) are
//   fetched live for the Reader's city and cached for about 30 minutes, shared
//   by every Reader in the same place. They are shown to every Reader with a
//   city, whatever they follow.
// - The next match and countdowns come from the latest Edition's widget data.
//   The next match belongs to the Liverpool Topic and each countdown names its
//   Topic: a Reader sees them only if they follow that Topic. Times are also
//   given in the Reader's local time (their city's time zone, else Riyadh), and
//   anything already past is left out.
//
// A failing outside service drops only its own Widget; it never fails the cover.
import type { AppContext } from "../app";
import type { Brief } from "../brief/compose";
import type { EditionWidgets } from "../editions/types";
import type { Place } from "../outside";
import { getProfile } from "../readers/profile";
import type { Reader } from "../readers/readers";
import { followedTopicIds } from "../topics/catalog";
import { cached, MINUTE_MS } from "./cache";
import { dateIn, inTimezone, knownTimezone } from "./zoned";

/** The Topic the Edition's next match belongs to. */
export const NEXT_MATCH_TOPIC = "liverpool";

const LIVE_TTL_MS = 30 * MINUTE_MS;
const PLACE_TTL_MS = 7 * 24 * 60 * MINUTE_MS;
const UNKNOWN_PLACE_TTL_MS = 30 * MINUTE_MS;

export type WeatherWidget = {
  kind: "weather";
  topic: null;
  /** The city as the Reader wrote it. */
  city: string;
  temperature_c: number;
  high_c: number;
  low_c: number;
  /** WMO weather code. */
  weather_code: number;
};

export type PrayerTimesWidget = {
  kind: "prayer_times";
  topic: null;
  city: string;
  /** The Reader's local date, YYYY-MM-DD. */
  date: string;
  /** The Reader's time zone, which the times are in. */
  timezone: string;
  /** Local "HH:MM" times, Umm al-Qura method. */
  times: { fajr: string; sunrise: string; dhuhr: string; asr: string; maghrib: string; isha: string };
  /** The next of the five prayers today, at the time of the request; null after Isha. */
  next: Prayer | null;
};

export type Prayer = "fajr" | "dhuhr" | "asr" | "maghrib" | "isha";
const PRAYERS: Prayer[] = ["fajr", "dhuhr", "asr", "maghrib", "isha"];

export type NextMatchWidget = {
  kind: "next_match";
  topic: string;
  team: string;
  opponent: string;
  competition: string;
  venue: string | null;
  /** Kickoff as the Edition gives it. */
  kickoff: string;
  /** The same instant in the Reader's time zone (RFC 3339). */
  kickoff_local: string;
  timezone: string;
  /** Whole minutes from now until kickoff. */
  minutes_until: number;
};

export type CountdownWidget = {
  kind: "countdown";
  topic: string;
  label: string;
  label_ar: string;
  at: string;
  /** The same instant in the Reader's time zone (RFC 3339). */
  at_local: string;
  timezone: string;
  minutes_until: number;
};

export type Widget = WeatherWidget | PrayerTimesWidget | NextMatchWidget | CountdownWidget;

export interface ReaderWidgets {
  /** The Reader's city, as they wrote it, or null when they have not set one. */
  city: string | null;
  /** Whether the city was found (null when there is no city, or the lookup failed). */
  city_found: boolean | null;
  /** The Reader's time zone: their city's, else Asia/Riyadh. */
  timezone: string;
  /** In cover-card order: weather, prayer times, next match, then countdowns soonest first. */
  widgets: Widget[];
}

/** The Widgets the Reader sees on their cover card right now. */
export async function readerWidgets(ctx: AppContext, reader: Reader): Promise<ReaderWidgets> {
  const { city } = getProfile(ctx, reader);
  const lookup = city ? await findPlace(ctx, city) : null;
  const place: Place | null = lookup === "failed" ? (city ? { city } : null) : lookup;
  const timezone = knownTimezone(place?.timezone);
  const now = Date.now();

  const [weather, prayer] = await Promise.all([
    city && place ? weatherWidget(ctx, city, place) : null,
    city && place ? prayerTimesWidget(ctx, city, place, timezone, now) : null,
  ]);

  const followed = new Set(followedTopicIds(ctx, reader.id));
  const data = latestEditionWidgets(ctx);
  const widgets: Widget[] = [];
  if (weather) widgets.push(weather);
  if (prayer) widgets.push(prayer);

  const match = data.next_match;
  if (match && followed.has(NEXT_MATCH_TOPIC) && Date.parse(match.kickoff) > now) {
    widgets.push({
      kind: "next_match",
      topic: NEXT_MATCH_TOPIC,
      team: match.team,
      opponent: match.opponent,
      competition: match.competition,
      venue: match.venue ?? null,
      kickoff: match.kickoff,
      kickoff_local: inTimezone(match.kickoff, timezone),
      timezone,
      minutes_until: minutesUntil(match.kickoff, now),
    });
  }

  const countdowns = (data.countdowns ?? [])
    .filter((c) => followed.has(c.topic) && Date.parse(c.at) > now)
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  for (const c of countdowns) {
    widgets.push({
      kind: "countdown",
      topic: c.topic,
      label: c.label,
      label_ar: c.label_ar,
      at: c.at,
      at_local: inTimezone(c.at, timezone),
      timezone,
      minutes_until: minutesUntil(c.at, now),
    });
  }

  return { city, city_found: city && lookup !== "failed" ? lookup !== null : null, timezone, widgets };
}

/** The Brief with the Reader's Widgets on its cover card (a Brief with no Edition has no cover). */
export async function withWidgets(ctx: AppContext, reader: Reader, brief: Brief): Promise<Brief> {
  if (!brief.cover) return brief;
  const { widgets } = await readerWidgets(ctx, reader);
  return { ...brief, cover: { ...brief.cover, widgets } };
}

function minutesUntil(at: string, now: number): number {
  return Math.floor((Date.parse(at) - now) / MINUTE_MS);
}

/** The widget data of the latest Edition (the same Edition the Brief is built from). */
function latestEditionWidgets(ctx: AppContext): EditionWidgets {
  const json = ctx.db
    .prepare("SELECT widgets FROM editions ORDER BY generated_at_ms DESC, received_at DESC LIMIT 1")
    .pluck()
    .get() as string | undefined;
  return json ? (JSON.parse(json) as EditionWidgets) : {};
}

/** The Reader's city looked up (cached), null when unknown, "failed" when the lookup service failed. */
async function findPlace(ctx: AppContext, city: string): Promise<Place | null | "failed"> {
  const key = `place:${city.trim().toLowerCase()}`;
  try {
    return await cached(ctx, key, PLACE_TTL_MS, async () => {
      const place = await ctx.services.weather.findPlace(city);
      if (!place) throw new UnknownPlace();
      return place;
    });
  } catch (err) {
    if (err instanceof UnknownPlace) {
      // Remember the miss for a while, so a mistyped city is not looked up on every request.
      return cached(ctx, key, UNKNOWN_PLACE_TTL_MS, async () => null);
    }
    report("place lookup", err);
    return "failed";
  }
}

class UnknownPlace extends Error {}

/** Same place, same cache entry: by coordinates when known, else by the city name. */
function placeKey(place: Place): string {
  return place.latitude != null && place.longitude != null
    ? `${place.latitude.toFixed(3)},${place.longitude.toFixed(3)}`
    : `city:${place.city.trim().toLowerCase()}`;
}

async function weatherWidget(ctx: AppContext, city: string, place: Place): Promise<WeatherWidget | null> {
  if (place.latitude == null || place.longitude == null) return null; // Open-Meteo needs coordinates
  try {
    const w = await cached(ctx, `weather:${placeKey(place)}`, LIVE_TTL_MS, () => ctx.services.weather.today(place));
    return {
      kind: "weather",
      topic: null,
      city,
      temperature_c: w.temperatureC,
      high_c: w.highC,
      low_c: w.lowC,
      weather_code: w.weatherCode,
    };
  } catch (err) {
    report("weather", err);
    return null;
  }
}

async function prayerTimesWidget(
  ctx: AppContext,
  city: string,
  place: Place,
  timezone: string,
  now: number,
): Promise<PrayerTimesWidget | null> {
  const date = dateIn(now, timezone);
  const clock = inTimezone(now, timezone).slice(11, 16); // "HH:MM" where the Reader is
  try {
    const p = await cached(ctx, `prayer:${placeKey(place)}:${date}`, LIVE_TTL_MS, () =>
      ctx.services.prayerTimes.forDay(place, date),
    );
    return {
      kind: "prayer_times",
      topic: null,
      city,
      date: p.date,
      timezone,
      times: { fajr: p.fajr, sunrise: p.sunrise, dhuhr: p.dhuhr, asr: p.asr, maghrib: p.maghrib, isha: p.isha },
      next: PRAYERS.find((prayer) => p[prayer] > clock) ?? null,
    };
  } catch (err) {
    report("prayer times", err);
    return null;
  }
}

/** A failed lookup is logged (without secrets: adapters never put keys in errors) and skipped. */
function report(what: string, err: unknown): void {
  if (process.env.VITEST) return;
  console.warn(`Widgets: ${what} unavailable: ${err instanceof Error ? err.message : String(err)}`);
}
