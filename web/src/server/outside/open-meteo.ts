// The real weather adapter: Open-Meteo (https://open-meteo.com/en/docs) for
// today's weather, and its geocoding API to find a Reader's city. Both are
// free and need no key.
import type { Place, WeatherService } from "./index";

export interface OpenMeteoOptions {
  /** Injected for adapter tests; defaults to the global fetch. */
  fetch?: typeof fetch;
  /** Give up after this long (default 5 s): the cover card renders without the Widget. */
  timeoutMs?: number;
}

interface GeocodingResult {
  name: string;
  latitude: number;
  longitude: number;
  country?: string;
  country_code?: string;
  admin1?: string;
  timezone?: string;
}

export function openMeteoWeatherService(options: OpenMeteoOptions = {}): WeatherService {
  const get = async (url: URL): Promise<any> => {
    const doFetch = options.fetch ?? fetch;
    const res = await doFetch(url, { signal: AbortSignal.timeout(options.timeoutMs ?? 5000) });
    if (!res.ok) throw new Error(`Open-Meteo refused the request (${res.status})`);
    return res.json();
  };

  return {
    async findPlace(city) {
      // "London, Canada": search for the name, then prefer a result in the place after the comma.
      const [name = "", ...rest] = city.split(",").map((part) => part.trim());
      const hint = rest.join(", ").toLowerCase();
      if (!name) return null;
      const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
      url.search = new URLSearchParams({ name, count: "10", language: "en", format: "json" }).toString();
      const body = (await get(url)) as { results?: GeocodingResult[] };
      const results = body.results ?? [];
      const matches = (r: GeocodingResult) =>
        [r.country, r.country_code, r.admin1].some((field) => field && field.toLowerCase() === hint);
      const best = (hint && results.find(matches)) || results[0];
      if (!best) return null;
      return {
        city: best.name,
        ...(best.country ? { country: best.country } : {}),
        latitude: best.latitude,
        longitude: best.longitude,
        ...(best.timezone ? { timezone: best.timezone } : {}),
      } satisfies Place;
    },

    async today(place) {
      if (place.latitude == null || place.longitude == null) {
        throw new Error(`Open-Meteo needs coordinates for ${place.city}`);
      }
      const url = new URL("https://api.open-meteo.com/v1/forecast");
      url.search = new URLSearchParams({
        latitude: String(place.latitude),
        longitude: String(place.longitude),
        current: "temperature_2m,weather_code",
        daily: "temperature_2m_max,temperature_2m_min",
        timezone: place.timezone ?? "auto",
        forecast_days: "1",
      }).toString();
      const body = await get(url);
      const today = {
        temperatureC: body?.current?.temperature_2m,
        highC: body?.daily?.temperature_2m_max?.[0],
        lowC: body?.daily?.temperature_2m_min?.[0],
        weatherCode: body?.current?.weather_code,
      };
      if (!Object.values(today).every((v) => typeof v === "number")) {
        throw new Error("Open-Meteo sent an unexpected forecast");
      }
      return today as { temperatureC: number; highC: number; lowC: number; weatherCode: number };
    },
  };
}
