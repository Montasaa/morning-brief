import { describe, expect, it } from "vitest";
import { legacySample, legacyToday } from "../support/fixtures";
import { startTestApp } from "../support/test-app";

type CatalogTopic = { id: string; name: string; name_ar: string; sensitive: boolean };

describe("GET /api/topics (the Catalog)", () => {
  it("starts with the 14 agreed Topics, Graphic and Adult Trending marked sensitive", async () => {
    const app = await startTestApp();

    const res = await (await app.signInAsOwner()).request("GET", "/api/topics");

    expect(res.status).toBe(200);
    expect(res.body.topics.map((t: CatalogTopic) => [t.id, t.name, t.sensitive])).toEqual([
      ["saudi", "Saudi", false],
      ["yemen", "Yemen", false],
      ["iran", "Iran", false],
      ["wider-middle-east", "Wider Middle East", false],
      ["us-markets", "US Markets", false],
      ["ai", "AI", false],
      ["github-trending", "GitHub Trending", false],
      ["liverpool", "Liverpool", false],
      ["strategy-games", "Strategy Games", false],
      ["turn-based-rpg-tactics", "Turn-based RPG & Tactics", false],
      ["trending-games", "Trending Games", false],
      ["social-trends", "Social Trends", false],
      ["graphic", "Graphic", true],
      ["adult-trending", "Adult Trending", true],
    ]);
    for (const topic of res.body.topics as CatalogTopic[]) expect(topic.name_ar).toMatch(/\p{Script=Arabic}/u);
  });

  it("holds every Topic the legacy importer tags Items with", async () => {
    const app = await startTestApp();
    const catalog = new Set(
      (await (await app.signInAsOwner()).request("GET", "/api/topics")).body.topics.map((t: CatalogTopic) => t.id),
    );

    for (const legacy of [legacySample(), legacyToday()]) {
      await app.request("POST", "/api/editions/legacy", { body: legacy, token: app.ingestToken });
      const brief = await (await app.signInAsOwner()).request("GET", "/api/brief");
      const used = new Set(brief.body.items.flatMap((i: { topics: string[] }) => i.topics));
      for (const topic of used) expect(catalog).toContain(topic);
    }
    const after = await (await app.signInAsOwner()).request("GET", "/api/topics");
    expect(after.body.topics).toHaveLength(14);
  });
});
