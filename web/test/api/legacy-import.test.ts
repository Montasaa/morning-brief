import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Ajv2020 } from "ajv/dist/2020.js";
import addFormatsModule from "ajv-formats";
import { describe, expect, it } from "vitest";
import { legacySample, legacyToday, type LegacyBriefDoc } from "../support/fixtures";
import { startTestApp, type TestApp } from "../support/test-app";

// The legacy importer: a v2 / rev 2.3 brief.json posted to
// POST /api/editions/legacy is converted into an Edition v3 document and sent
// through Edition ingest. Fixtures are snapshots of samples/brief.sample.json
// and today's root brief.json.

// The Edition v3 contract, checked independently of the app (as in test/schema).
const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const editionSchema = JSON.parse(readFileSync(path.join(repoRoot, "schema", "edition.v3.schema.json"), "utf8"));
const addFormats = addFormatsModule as unknown as (ajv: Ajv2020) => Ajv2020;
const validateEdition = addFormats(new Ajv2020({ allErrors: true, strict: true })).compile(editionSchema);

type BriefItem = { id: string; topics: string[]; [field: string]: any };

/** The latest Brief's Items by id. */
async function briefItems(app: TestApp): Promise<Map<string, BriefItem>> {
  const brief = await app.request("GET", "/api/brief");
  return new Map(brief.body.items.map((i: BriefItem) => [i.id, i]));
}

/** Ids of a legacy file's Items in one v2 section. */
function idsInSection(brief: LegacyBriefDoc, section: string): string[] {
  return brief.sections[section]!.items.map((i) => i.id as string);
}

const GAMES_TOPICS = ["strategy-games", "turn-based-rpg-tactics", "trending-games"];
const MIDDLE_EAST_TOPICS = ["saudi", "yemen", "iran", "wider-middle-east"];

function importLegacy(app: TestApp, brief: unknown, query = "") {
  return app.request("POST", `/api/editions/legacy${query}`, { body: brief, token: app.ingestToken });
}

describe("POST /api/editions/legacy (legacy importer)", () => {
  it("imports the v2 sample as the 2026-11-14 morning Edition", async () => {
    const app = await startTestApp();

    const res = await importLegacy(app, legacySample());

    expect(res.body.reasons ?? []).toEqual([]); // shows why, if it was refused
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ accepted: true, edition_id: "2026-11-14-morning" });
    expect(res.body.counts.items).toBe(156);
    const brief = await app.request("GET", "/api/brief");
    expect(brief.body.edition).toMatchObject({
      id: "2026-11-14-morning",
      kind: "morning",
      generated_at: "2026-11-14T06:08:24+03:00",
      item_count: 156,
    });
  });

  it("imports today's rev 2.3 file as the 2026-11-14 evening Edition, which becomes the latest", async () => {
    const app = await startTestApp();
    await importLegacy(app, legacySample());

    const res = await importLegacy(app, legacyToday());

    expect(res.body.reasons ?? []).toEqual([]);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ accepted: true, edition_id: "2026-11-14-evening" });
    expect(res.body.counts.items).toBe(63);
    const brief = await app.request("GET", "/api/brief");
    expect(brief.body.edition).toMatchObject({
      id: "2026-11-14-evening",
      kind: "evening",
      generated_at: "2026-11-14T19:15:00+03:00",
      item_count: 63,
    });
  });

  it("tags middle_east Items Saudi, Yemen, Iran and/or Wider Middle East by keyword", async () => {
    const app = await startTestApp();
    await importLegacy(app, legacySample());

    const items = await briefItems(app);
    const topics = (id: string) => [...items.get(id)!.topics].sort();

    expect(topics("me-houthi-riyadh-airport")).toEqual(["saudi", "yemen"]);
    expect(topics("me-unsc-yemen-sanctions")).toEqual(["yemen"]);
    expect(topics("me-hormuz-tankers-mines")).toEqual(["iran"]);
    expect(topics("me-iran-boxer-death-row")).toEqual(["iran"]);
    expect(topics("me-iran-bahrain-radar-gulf-pause")).toEqual(["iran", "wider-middle-east"]);
    expect(topics("me-gaza-six-killed-aid-plea")).toEqual(["wider-middle-east"]);
    expect(topics("me-qatar-turkiye-defence-pact")).toEqual(["wider-middle-east"]);
    for (const id of idsInSection(legacySample(), "middle_east")) {
      expect(items.get(id)!.topics.length).toBeGreaterThan(0);
      expect(MIDDLE_EAST_TOPICS).toEqual(expect.arrayContaining(items.get(id)!.topics));
    }
  });

  it("orders a middle_east Item's Topics by first mention, headline first", async () => {
    const app = await startTestApp();
    await importLegacy(app, legacyToday());

    const items = await briefItems(app);

    // "coalition downs two houthi drones over riyadh and the south"
    expect(items.get("me-yemen-missiles")!.topics).toEqual(["yemen", "saudi"]);
    // "trump weighs holding off strikes as riyadh and ankara press for calm" (the summary is on Iran)
    expect(items.get("me-iran-live")!.topics.slice(0, 3)).toEqual(["saudi", "wider-middle-east", "iran"]);
  });

  it("tags games Items Strategy Games, Turn-based RPG & Tactics or Trending Games from their genres", async () => {
    const app = await startTestApp();
    await importLegacy(app, legacySample());

    const items = await briefItems(app);
    const topics = (id: string) => items.get(id)!.topics;

    expect(topics("game-ff-resonance")).toEqual(["turn-based-rpg-tactics"]); // Turn-based RPG, RPG
    expect(topics("game-zero-company")).toEqual(["turn-based-rpg-tactics", "strategy-games"]); // Turn-based tactics, Strategy
    expect(topics("game-paradox-new-ceo")).toEqual(["strategy-games"]); // Grand strategy
    expect(topics("game-sts2-the-fool-beta")).toEqual(["strategy-games"]); // Roguelike deckbuilder, Strategy
    expect(topics("game-pearl-abyss-ai")).toEqual(["trending-games"]); // Action RPG: not turn-based
    expect(topics("game-gta6-week")).toEqual(["trending-games"]); // Open world
    for (const id of idsInSection(legacySample(), "games")) {
      expect(items.get(id)!.topics.length).toBeGreaterThan(0);
      expect(GAMES_TOPICS).toEqual(expect.arrayContaining(items.get(id)!.topics));
    }
  });

  it("maps every other section one-to-one onto its Topic, graphic onto Graphic", async () => {
    const expected: Record<string, string> = {
      us_markets: "us-markets",
      ai: "ai",
      trending: "github-trending",
      liverpool: "liverpool",
      social: "social-trends",
      graphic: "graphic",
      adult_trending: "adult-trending",
    };
    for (const legacy of [legacySample(), legacyToday()]) {
      const app = await startTestApp();
      await importLegacy(app, legacy);
      const items = await briefItems(app);

      for (const [section, topic] of Object.entries(expected)) {
        for (const id of legacy.sections[section] ? idsInSection(legacy, section) : []) {
          expect({ id, topics: items.get(id)!.topics }).toEqual({ id, topics: [topic] });
        }
      }
      app.close();
    }
  });

  it("carries over Arabic fields and kind-specific extras", async () => {
    const app = await startTestApp();
    await importLegacy(app, legacyToday());

    const items = await briefItems(app);

    expect(items.get("graphic-uae-crash")).toMatchObject({
      warning: "casualties, road crash",
      warning_ar: "سقوط ضحايا وحادث مروري",
    });
    expect(items.get("backnotprop-plannotator")).toMatchObject({
      status: "updated",
      title_ar: "plannotator يتصدر اليوم بـ412 نجمة",
      extras: {
        rank: 1,
        period: "today",
        stars_gained: 412,
        stars_total: 10821,
        language: "TypeScript",
        why_it_matters: "A review surface for agent-written code, so you read and mark up the diff before it lands.",
        why_it_matters_ar: "واجهة مراجعة للشيفرة التي يكتبها الوكلاء، حتى تقرأ الفرق وتعلّق عليه قبل اعتماده.",
      },
    });
    expect(items.get("game-underkeep")!.extras).toEqual({
      kind: "DEAL",
      genres: ["Turn-based RPG", "Dungeon crawler"],
      platforms: ["Windows"],
      price: "45.66 SR",
      discount: 15,
      release_date: "5 Nov, 2026",
      store_url: "https://store.steampowered.com/app/2411200/",
    });
  });

  it("loses no Item field of either file except the v2 section", async () => {
    for (const legacy of [legacySample(), legacyToday()]) {
      const app = await startTestApp();
      await importLegacy(app, legacy);
      const items = await briefItems(app);

      for (const section of Object.values(legacy.sections)) {
        for (const { section: _section, ...v2 } of section.items) {
          const { topics: _topics, extras, ...v3 } = items.get(v2.id)!;
          const carried = { ...v3, ...extras };
          // Raw non-ASCII links (a TikTok tag) are percent-encoded: the same link.
          const sameLink = (sources: { url: string }[]) => sources.map((s) => ({ ...s, url: new URL(s.url).href }));
          expect({ ...carried, sources: sameLink(carried.sources) }).toMatchObject({ ...v2, sources: sameLink(v2.sources) });
        }
      }
      app.close();
    }
  });

  it("fills in a sensitive Item's missing warning from its section's warning", async () => {
    const app = await startTestApp();
    const legacy = legacySample();
    delete legacy.sections.adult_trending!.items[0]!.warning;

    await importLegacy(app, legacy);

    const items = await briefItems(app);
    expect(items.get("adult-huang-affair-spy")!.warning).toBe(
      "Adult-themed mainstream news (scandals, court, platform policy). No explicit imagery. Tap to reveal.",
    );
  });

  it("with ?dry_run=1 returns the converted Edition v3 document, which passes the schema, and stores nothing", async () => {
    const app = await startTestApp();

    for (const legacy of [legacySample(), legacyToday()]) {
      const res = await importLegacy(app, legacy, "?dry_run=1");

      expect(res.status).toBe(200);
      expect(res.body.accepted).toBe(true);
      expect(validateEdition(res.body.edition), JSON.stringify(validateEdition.errors)).toBe(true);
    }
    const brief = await app.request("GET", "/api/brief");
    expect(brief.body).toEqual({ edition: null, items: [] });
  });

  it("keeps the Edition-level top_stories as the fallback tops, in order", async () => {
    const app = await startTestApp();

    const sample = await importLegacy(app, legacySample(), "?dry_run=1");
    const today = await importLegacy(app, legacyToday(), "?dry_run=1");

    expect(sample.body.edition.top_stories).toEqual([
      "me-trump-saudi-disintegrating",
      "us-nvidia-huang-probe",
      "me-houthi-riyadh-airport",
    ]);
    expect(today.body.edition.top_stories).toEqual(["me-yemen-missiles", "us-trump-china", "me-iran-live"]);
  });

  it("changes nothing when the same file is imported twice", async () => {
    const app = await startTestApp();
    await importLegacy(app, legacySample());
    const first = await importLegacy(app, legacyToday());
    const briefBefore = await app.request("GET", "/api/brief");

    const again = await importLegacy(app, legacyToday());
    const sampleAgain = await importLegacy(app, legacySample());

    expect(again.status).toBe(200);
    expect(again.body).toEqual(first.body);
    expect(sampleAgain.status).toBe(200);
    const briefAfter = await app.request("GET", "/api/brief");
    expect(briefAfter.body).toEqual(briefBefore.body);
  });

  it("refuses an import without the pipeline token", async () => {
    const app = await startTestApp();

    const res = await app.request("POST", "/api/editions/legacy", { body: legacyToday() });

    expect(res.status).toBe(401);
    expect((await app.request("GET", "/api/brief")).body.edition).toBeNull();
  });

  it("rejects a file that is not a v2 brief.json with reasons, storing nothing", async () => {
    const app = await startTestApp();
    const unknownSection = legacyToday();
    unknownSection.sections.weather = { items: [{ id: "w-1", title: "Sunny" }] };
    const notV2 = { ...legacyToday(), version: 3 };

    const a = await importLegacy(app, unknownSection);
    const b = await importLegacy(app, notV2);
    const c = await app.request("POST", "/api/editions/legacy", { rawBody: "{nope", token: app.ingestToken });

    expect(a.status).toBe(422);
    expect(a.body.reasons.join("\n")).toMatch(/weather/);
    expect(b.status).toBe(422);
    expect(b.body.reasons.join("\n")).toMatch(/version/);
    expect(c.status).toBe(400);
    expect((await app.request("GET", "/api/brief")).body.edition).toBeNull();
  });
});
