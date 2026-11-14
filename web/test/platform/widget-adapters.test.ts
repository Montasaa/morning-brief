// The real Open-Meteo (weather, place lookup) and Aladhan (prayer times)
// adapters, checked against a stand-in fetch (no network).
import { describe, expect, it } from "vitest";
import { realOutsideServices } from "@/server/outside";
import { aladhanPrayerTimesService } from "@/server/outside/aladhan";
import { openMeteoWeatherService } from "@/server/outside/open-meteo";

type Call = { url: URL; init: RequestInit };

/** A fetch that answers every call with `reply` (JSON) and `status`. */
function stubFetch(reply: unknown, status = 200): { calls: Call[]; fetch: typeof fetch } {
  const calls: Call[] = [];
  return {
    calls,
    fetch: (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: new URL(String(url)), init: init ?? {} });
      return new Response(JSON.stringify(reply), { status });
    }) as typeof fetch,
  };
}

const riyadh = { city: "Riyadh", country: "Saudi Arabia", latitude: 24.6877, longitude: 46.7219, timezone: "Asia/Riyadh" };

describe("Open-Meteo place lookup", () => {
  const results = {
    results: [
      { name: "Riyadh", latitude: 24.68773, longitude: 46.72185, country: "Saudi Arabia", country_code: "SA", timezone: "Asia/Riyadh", admin1: "Riyadh Region" },
    ],
  };

  it("finds a city by name with its coordinates and time zone", async () => {
    const { calls, fetch } = stubFetch(results);

    const place = await openMeteoWeatherService({ fetch }).findPlace("Riyadh");

    expect(place).toEqual({ city: "Riyadh", country: "Saudi Arabia", latitude: 24.68773, longitude: 46.72185, timezone: "Asia/Riyadh" });
    expect(calls[0]!.url.origin + calls[0]!.url.pathname).toBe("https://geocoding-api.open-meteo.com/v1/search");
    expect(calls[0]!.url.searchParams.get("name")).toBe("Riyadh");
  });

  it("uses what follows a comma to pick the right country", async () => {
    const { calls, fetch } = stubFetch({
      results: [
        { name: "London", latitude: 51.5, longitude: -0.12, country: "United Kingdom", country_code: "GB", timezone: "Europe/London" },
        { name: "London", latitude: 42.98, longitude: -81.23, country: "Canada", country_code: "CA", timezone: "America/Toronto" },
      ],
    });

    const place = await openMeteoWeatherService({ fetch }).findPlace("London, Canada");

    expect(place).toMatchObject({ country: "Canada", timezone: "America/Toronto" });
    expect(calls[0]!.url.searchParams.get("name")).toBe("London");
  });

  it("returns null for a place it does not know", async () => {
    const { fetch } = stubFetch({ generationtime_ms: 0.1 });
    expect(await openMeteoWeatherService({ fetch }).findPlace("Atlantis")).toBeNull();
  });
});

describe("Open-Meteo weather", () => {
  it("asks for today's current temperature, high, low and weather code at the place's coordinates", async () => {
    const { calls, fetch } = stubFetch({
      current: { temperature_2m: 23.6, weather_code: 1 },
      daily: { temperature_2m_max: [29.1], temperature_2m_min: [17.8] },
    });

    const today = await openMeteoWeatherService({ fetch }).today(riyadh);

    expect(today).toEqual({ temperatureC: 23.6, highC: 29.1, lowC: 17.8, weatherCode: 1 });
    const url = calls[0]!.url;
    expect(url.origin + url.pathname).toBe("https://api.open-meteo.com/v1/forecast");
    expect(url.searchParams.get("latitude")).toBe("24.6877");
    expect(url.searchParams.get("longitude")).toBe("46.7219");
    expect(url.searchParams.get("current")).toContain("temperature_2m");
    expect(url.searchParams.get("daily")).toContain("temperature_2m_max");
  });

  it("throws when Open-Meteo refuses or the place has no coordinates", async () => {
    await expect(openMeteoWeatherService({ fetch: stubFetch({}, 500).fetch }).today(riyadh)).rejects.toThrow(/500/);
    await expect(openMeteoWeatherService({ fetch: stubFetch({}).fetch }).today({ city: "Riyadh" })).rejects.toThrow(/coordinates/);
  });
});

describe("Aladhan prayer times", () => {
  const reply = {
    code: 200,
    data: {
      timings: { Fajr: "04:55", Sunrise: "06:13", Dhuhr: "11:43", Asr: "14:47", Sunset: "17:13", Maghrib: "17:13", Isha: "18:43 (+03)" },
    },
  };

  it("asks for the day's times at the place's coordinates with the Umm al-Qura method", async () => {
    const { calls, fetch } = stubFetch(reply);

    const times = await aladhanPrayerTimesService({ fetch }).forDay(riyadh, "2026-11-14");

    expect(times).toEqual({ date: "2026-11-14", fajr: "04:55", sunrise: "06:13", dhuhr: "11:43", asr: "14:47", maghrib: "17:13", isha: "18:43" });
    const url = calls[0]!.url;
    expect(url.origin + url.pathname).toBe("https://api.aladhan.com/v1/timings/14-11-2026");
    expect(url.searchParams.get("method")).toBe("4"); // Umm al-Qura University, Makkah
    expect(url.searchParams.get("latitude")).toBe("24.6877");
    expect(url.searchParams.get("timezonestring")).toBe("Asia/Riyadh");
  });

  it("looks the place up by name when it has no coordinates", async () => {
    const { calls, fetch } = stubFetch(reply);

    await aladhanPrayerTimesService({ fetch }).forDay({ city: "Riyadh" }, "2026-11-14");

    const url = calls[0]!.url;
    expect(url.origin + url.pathname).toBe("https://api.aladhan.com/v1/timingsByAddress/14-11-2026");
    expect(url.searchParams.get("address")).toBe("Riyadh");
    expect(url.searchParams.get("method")).toBe("4");
  });

  it("throws when Aladhan refuses", async () => {
    await expect(aladhanPrayerTimesService({ fetch: stubFetch({ code: 400 }, 400).fetch }).forDay(riyadh, "2026-11-14")).rejects.toThrow(/400/);
  });
});

describe("the real Widget services", () => {
  it("are connected with no secrets (both services are free and keyless)", async () => {
    const real = realOutsideServices({});
    await expect(real.weather.findPlace("Riyadh")).rejects.toThrow(/Real network call/);
    await expect(real.weather.today(riyadh)).rejects.toThrow(/Real network call/);
    await expect(real.prayerTimes.forDay(riyadh, "2026-11-14")).rejects.toThrow(/Real network call/);
  });
});
