// Widgets (ticket 17): the cover card's weather and prayer times for the
// Reader's city (live, briefly cached), and, from the Edition's widget data,
// the next match for Liverpool followers and countdowns for followed Topics.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { morningEdition } from "../support/fixtures";
import { startTestApp, type TestApp, type TestSession } from "../support/test-app";

type Widget = { kind: string; topic: string | null; [field: string]: any };

/** A new Reader who finished onboarding following exactly `topics`, living in `city` (null: no city). */
async function reader(app: TestApp, email: string, topics: string[], city: string | null): Promise<TestSession> {
  const session = await app.addReader(email, { onboarded: false });
  const res = await session.request("PATCH", "/api/me", { body: { topics, city, onboarded: true } });
  expect(res.status, res.text).toBe(200);
  return session;
}

async function widgetsOf(session: TestSession): Promise<Widget[]> {
  const res = await session.request("GET", "/api/widgets");
  expect(res.status, res.text).toBe(200);
  return res.body.widgets as Widget[];
}

const kinds = (widgets: Widget[]) => widgets.map((w) => w.kind);

// The clock is fixed: the fixture's match kicks off 2026-11-15 18:00 Riyadh time.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-11-14T07:00:00+03:00") });
});
afterEach(() => {
  vi.useRealTimers();
});

describe("weather and prayer times", () => {
  it("show for the Reader's city", async () => {
    const app = await startTestApp();
    await app.postEdition(morningEdition());
    const sara = await reader(app, "sara@example.com", ["ai"], "Riyadh");

    const widgets = await widgetsOf(sara);

    expect(widgets.find((w) => w.kind === "weather")).toEqual({
      kind: "weather",
      topic: null,
      city: "Riyadh",
      temperature_c: 24,
      high_c: 29,
      low_c: 18,
      weather_code: 0,
    });
    expect(widgets.find((w) => w.kind === "prayer_times")).toEqual({
      kind: "prayer_times",
      topic: null,
      city: "Riyadh",
      date: "2026-11-14",
      timezone: "Asia/Riyadh",
      times: { fajr: "04:55", sunrise: "06:13", dhuhr: "11:43", asr: "14:47", maghrib: "17:13", isha: "18:43" },
      next: "dhuhr", // it is 07:00 in Riyadh
    });
    // Looked up where the Reader lives.
    expect(app.services.weather.calls).toEqual([expect.objectContaining({ city: "Riyadh", timezone: "Asia/Riyadh" })]);
    expect(app.services.prayerTimes.calls).toEqual([
      { place: expect.objectContaining({ city: "Riyadh", timezone: "Asia/Riyadh" }), date: "2026-11-14" },
    ]);
  });
});

describe("the next prayer", () => {
  it("is the first prayer still to come in the Reader's own time, and none after Isha", async () => {
    const app = await startTestApp();
    const riyadh = await reader(app, "sara@example.com", ["ai"], "Riyadh");
    const london = await reader(app, "lina@example.com", ["ai"], "London");
    const next = async (session: TestSession) => (await widgetsOf(session)).find((w) => w.kind === "prayer_times")!.next;

    vi.setSystemTime(new Date("2026-11-14T15:00:00+03:00")); // 15:00 in Riyadh, 12:00 in London
    expect(await next(riyadh)).toBe("maghrib");
    expect(await next(london)).toBe("asr");

    vi.setSystemTime(new Date("2026-11-14T19:00:00+03:00"));
    expect(await next(riyadh)).toBeNull();
  });
});

describe("caching weather and prayer times", () => {
  it("asks the services again only after about 30 minutes, and Readers in the same city share the answer", async () => {
    const app = await startTestApp();
    await app.postEdition(morningEdition());
    const sara = await reader(app, "sara@example.com", ["ai"], "Riyadh");
    const omar = await reader(app, "omar@example.com", ["yemen"], "riyadh");

    await widgetsOf(sara);
    await widgetsOf(sara);
    await widgetsOf(omar);
    expect(app.services.weather.calls).toHaveLength(1);
    expect(app.services.prayerTimes.calls).toHaveLength(1);

    vi.setSystemTime(new Date("2026-11-14T07:29:00+03:00"));
    await widgetsOf(sara);
    expect(app.services.weather.calls).toHaveLength(1);

    vi.setSystemTime(new Date("2026-11-14T07:31:00+03:00"));
    app.services.weather.reply = { temperatureC: 26, highC: 30, lowC: 19, weatherCode: 1 };
    const later = await widgetsOf(omar);
    expect(app.services.weather.calls).toHaveLength(2);
    expect(app.services.prayerTimes.calls).toHaveLength(2);
    expect(later.find((w) => w.kind === "weather")).toMatchObject({ city: "riyadh", temperature_c: 26 });
  });

  it("keeps each city's weather apart", async () => {
    const app = await startTestApp();
    const sara = await reader(app, "sara@example.com", ["ai"], "Riyadh");
    const lina = await reader(app, "lina@example.com", ["ai"], "London");

    await widgetsOf(sara);
    await widgetsOf(lina);

    expect(app.services.weather.calls.map((p) => p.city)).toEqual(["Riyadh", "London"]);
  });
});

describe("a Reader without a known city", () => {
  it("gets no weather or prayer times until they set a city", async () => {
    const app = await startTestApp();
    await app.postEdition(morningEdition());
    const sara = await reader(app, "sara@example.com", ["ai"], null);

    const res = await sara.request("GET", "/api/widgets");

    expect(res.body).toMatchObject({ city: null, city_found: null, timezone: "Asia/Riyadh" });
    expect(kinds(res.body.widgets)).not.toContain("weather");
    expect(kinds(res.body.widgets)).not.toContain("prayer_times");
    expect(app.services.weather.calls).toHaveLength(0);
  });

  it("gets none for a city that cannot be found, and is told so", async () => {
    const app = await startTestApp();
    const sara = await reader(app, "sara@example.com", ["ai"], "Atlantis");

    const res = await sara.request("GET", "/api/widgets");

    expect(res.body).toMatchObject({ city: "Atlantis", city_found: false, widgets: [] });
    expect(app.services.weather.calls).toHaveLength(0);
    expect(app.services.prayerTimes.calls).toHaveLength(0);
  });
});

describe("the next match", () => {
  it("appears only for Readers following Liverpool, with kickoff in their local time and a countdown", async () => {
    const app = await startTestApp();
    await app.postEdition(morningEdition()); // Liverpool v Example Town, 2026-11-15T18:00:00+03:00
    const riyadhFan = await reader(app, "sara@example.com", ["liverpool"], "Riyadh");
    const londonFan = await reader(app, "lina@example.com", ["ai", "liverpool"], "London");
    const newYorkFan = await reader(app, "nora@example.com", ["liverpool"], "New York");
    const notAFan = await reader(app, "omar@example.com", ["ai", "yemen"], "Riyadh");

    const match = (widgets: Widget[]) => widgets.find((w) => w.kind === "next_match");

    expect(match(await widgetsOf(riyadhFan))).toEqual({
      kind: "next_match",
      topic: "liverpool",
      team: "Liverpool",
      opponent: "Example Town",
      competition: "Premier League",
      venue: "Anfield",
      kickoff: "2026-11-15T18:00:00+03:00",
      kickoff_local: "2026-11-15T18:00:00+03:00",
      timezone: "Asia/Riyadh",
      minutes_until: 35 * 60,
    });
    expect(match(await widgetsOf(londonFan))).toMatchObject({
      kickoff_local: "2026-11-15T15:00:00+00:00",
      timezone: "Europe/London",
      minutes_until: 35 * 60,
    });
    expect(match(await widgetsOf(newYorkFan))).toMatchObject({
      kickoff_local: "2026-11-15T10:00:00-05:00",
      timezone: "America/New_York",
    });
    expect(match(await widgetsOf(notAFan))).toBeUndefined();
  });

  it("uses Riyadh time for a Reader with no city", async () => {
    const app = await startTestApp();
    await app.postEdition(morningEdition());
    const fan = await reader(app, "sara@example.com", ["liverpool"], null);

    expect((await widgetsOf(fan)).find((w) => w.kind === "next_match")).toMatchObject({
      kickoff_local: "2026-11-15T18:00:00+03:00",
      timezone: "Asia/Riyadh",
    });
  });

  it("disappears once the match has kicked off", async () => {
    vi.setSystemTime(new Date("2026-11-15T18:01:00+03:00"));
    const app = await startTestApp();
    await app.postEdition(morningEdition());
    const fan = await reader(app, "sara@example.com", ["liverpool"], "Riyadh");

    expect(kinds(await widgetsOf(fan))).not.toContain("next_match");
  });
});

describe("countdowns", () => {
  function editionWithCountdowns() {
    const edition = morningEdition();
    edition.widgets.countdowns = [
      { label: "Example Corp earnings", label_ar: "أرباح شركة مثال", at: "2026-11-19T23:00:00+03:00", topic: "us-markets" },
      { label: "Tactics game release", label_ar: "إصدار لعبة تكتيكية", at: "2026-11-17T10:00:00+03:00", topic: "turn-based-rpg-tactics" },
      { label: "Already out", label_ar: "صدرت", at: "2026-11-13T10:00:00+03:00", topic: "turn-based-rpg-tactics" },
    ];
    return edition;
  }

  it("appear only for followed Topics, soonest first, in the Reader's local time", async () => {
    const app = await startTestApp();
    await app.postEdition(editionWithCountdowns());
    const both = await reader(app, "sara@example.com", ["us-markets", "turn-based-rpg-tactics"], "London");
    const markets = await reader(app, "omar@example.com", ["us-markets"], "Riyadh");
    const neither = await reader(app, "lina@example.com", ["ai"], "Riyadh");

    const countdowns = (widgets: Widget[]) => widgets.filter((w) => w.kind === "countdown");

    expect(countdowns(await widgetsOf(both))).toEqual([
      {
        kind: "countdown",
        topic: "turn-based-rpg-tactics",
        label: "Tactics game release",
        label_ar: "إصدار لعبة تكتيكية",
        at: "2026-11-17T10:00:00+03:00",
        at_local: "2026-11-17T07:00:00+00:00",
        timezone: "Europe/London",
        minutes_until: 3 * 24 * 60 + 3 * 60,
      },
      expect.objectContaining({ topic: "us-markets", label: "Example Corp earnings", at_local: "2026-11-19T20:00:00+00:00" }),
    ]);
    expect(countdowns(await widgetsOf(markets)).map((w) => w.topic)).toEqual(["us-markets"]);
    expect(countdowns(await widgetsOf(neither))).toEqual([]);
  });

  it("follow the latest Edition's widget data", async () => {
    vi.setSystemTime(new Date("2026-11-14T20:00:00+03:00"));
    const app = await startTestApp();
    await app.postEdition(editionWithCountdowns());
    const evening = morningEdition();
    evening.edition_id = "2026-11-14-evening";
    evening.kind = "evening";
    evening.generated_at = "2026-11-14T19:15:00+03:00";
    evening.widgets = {};
    await app.postEdition(evening);
    const sara = await reader(app, "sara@example.com", ["us-markets", "liverpool"], "Riyadh");

    expect(kinds(await widgetsOf(sara))).toEqual(["weather", "prayer_times"]);
  });
});

describe("when a service fails", () => {
  it("the cover card still renders without the weather", async () => {
    const app = await startTestApp();
    await app.postEdition(morningEdition());
    const sara = await reader(app, "sara@example.com", ["liverpool", "us-markets"], "Riyadh");
    app.services.weather.failing = true;

    const brief = await sara.request("GET", "/api/brief");

    expect(brief.status).toBe(200);
    expect(kinds(brief.body.cover.widgets)).toEqual(["prayer_times", "next_match", "countdown"]);
  });

  it("the cover card still renders without the prayer times, and the next request tries again", async () => {
    const app = await startTestApp();
    await app.postEdition(morningEdition());
    const sara = await reader(app, "sara@example.com", ["ai"], "Riyadh");
    app.services.prayerTimes.failing = true;

    const brief = await sara.request("GET", "/api/brief");
    expect(brief.status).toBe(200);
    expect(kinds(brief.body.cover.widgets)).toEqual(["weather"]);

    app.services.prayerTimes.failing = false;
    expect(kinds(await widgetsOf(sara))).toEqual(["weather", "prayer_times"]);
  });

  it("a failed city lookup still leaves prayer times, looked up by city name", async () => {
    const app = await startTestApp();
    const sara = await reader(app, "sara@example.com", ["ai"], "Riyadh");
    app.services.weather.findPlace = async () => {
      throw new Error("geocoding down");
    };

    const res = await sara.request("GET", "/api/widgets");

    expect(res.body).toMatchObject({ city: "Riyadh", city_found: null, timezone: "Asia/Riyadh" });
    expect(kinds(res.body.widgets)).toEqual(["prayer_times"]);
    expect(app.services.prayerTimes.calls[0]!.place).toEqual({ city: "Riyadh" });
  });
});

describe("the Brief's cover card", () => {
  it("carries the same Widgets as GET /api/widgets", async () => {
    const app = await startTestApp();
    await app.postEdition(morningEdition());
    const sara = await reader(app, "sara@example.com", ["liverpool", "us-markets"], "London");

    const brief = await sara.request("GET", "/api/brief");

    expect(brief.body.cover.widgets).toEqual(await widgetsOf(sara));
    expect(kinds(brief.body.cover.widgets)).toEqual(["weather", "prayer_times", "next_match", "countdown"]);
  });
});

describe("GET /api/widgets", () => {
  it("is refused when signed out", async () => {
    const app = await startTestApp();
    expect((await app.request("GET", "/api/widgets")).status).toBe(401);
  });

  it("works before any Edition arrives", async () => {
    const app = await startTestApp();
    const sara = await reader(app, "sara@example.com", ["liverpool"], "Riyadh");

    expect(kinds(await widgetsOf(sara))).toEqual(["weather", "prayer_times"]);
  });
});
