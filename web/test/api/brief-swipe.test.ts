// The Swipe Brief's shape at the API seam (ticket 03): the cover card, the
// order of Items (top stories first, then one group per Topic), the groups the
// progress bars need, and the time of the next Edition.
import { describe, expect, it } from "vitest";
import { morningEdition } from "../support/fixtures";
import { startTestApp } from "../support/test-app";

type BriefItem = { id: string; topic: string; top: boolean };
type BriefGroup = { kind: string; topic: string | null; item_ids: string[]; nothing_qualified: boolean };
/** The groups with Items, as {kind, topic, item_ids} (test/api/arrange-brief.test.ts covers the arranging fields). */
const withItems = (groups: BriefGroup[]) =>
  groups.filter((g) => !g.nothing_qualified).map(({ kind, topic, item_ids }) => ({ kind, topic, item_ids }));

describe("GET /api/brief for the Swipe Brief", () => {
  it("puts the Edition's top stories first, then the rest grouped by Topic, newest first", async () => {
    const app = await startTestApp();
    await app.postEdition(morningEdition());

    const res = await (await app.signInAsOwner()).request("GET", "/api/brief");

    expect(res.body.items.map((i: BriefItem) => i.id)).toEqual([
      "me-yemen-port-talks", // top story 1
      "ai-open-model-release", // top story 2
      "lfc-midfielder-fitness", // Liverpool, newest of the rest (14 Nov 01:15)
      "graphic-flood-aftermath", // Graphic (13 Nov 20:30)
      "gh-terminal-agent", // GitHub Trending (13 Nov 18:00)
    ]);
    expect(res.body.items.map((i: BriefItem) => i.top)).toEqual([true, true, false, false, false]);
  });

  it("returns one progress group per Topic, after a group of top stories", async () => {
    const app = await startTestApp();
    await app.postEdition(morningEdition());

    const res = await (await app.signInAsOwner()).request("GET", "/api/brief");

    expect(withItems(res.body.groups)).toEqual([
      { kind: "top", topic: null, item_ids: ["me-yemen-port-talks", "ai-open-model-release"] },
      { kind: "topic", topic: "liverpool", item_ids: ["lfc-midfielder-fitness"] },
      { kind: "topic", topic: "graphic", item_ids: ["graphic-flood-aftermath"] },
      { kind: "topic", topic: "github-trending", item_ids: ["gh-terminal-agent"] },
    ]);
    // The Owner's other followed Topics have nothing in this Edition: they come after, empty (rework ticket 11).
    const groups = res.body.groups as BriefGroup[];
    expect(groups.slice(4).every((g) => g.nothing_qualified && g.item_ids.length === 0)).toBe(true);
  });

  it("shows each Item once, under its first Topic, with the other Topics as tags", async () => {
    const app = await startTestApp();
    const edition = morningEdition();
    delete edition.top_stories;
    edition.items.push({
      id: "saudi-budget",
      topics: ["saudi", "us-markets"],
      time: "2026-11-14T04:00:00+03:00",
      title: "Budget statement due next week",
      summary: "The finance ministry set a date.",
      sources: [{ title: "Example Wire", url: "https://example.com/wire/budget", type: "wire" }],
      tag: "MACRO",
    });

    await app.postEdition(edition);
    const res = await (await app.signInAsOwner()).request("GET", "/api/brief");

    const ids = res.body.items.map((i: BriefItem) => i.id);
    expect(ids).toEqual([
      "me-yemen-port-talks", // Yemen (05:40)
      "saudi-budget", // Saudi (04:00)
      "lfc-midfielder-fitness", // Liverpool (01:15)
      "ai-open-model-release", // AI (13 Nov 22:10)
      "graphic-flood-aftermath",
      "gh-terminal-agent",
    ]);
    expect(withItems(res.body.groups)[0]).toEqual({ kind: "topic", topic: "yemen", item_ids: ["me-yemen-port-talks"] });
    const talks = res.body.items[0];
    expect(talks).toMatchObject({ topic: "yemen", tags: ["saudi"], top: false });
  });

  it("names every Topic in the Brief", async () => {
    const app = await startTestApp();
    await app.postEdition(morningEdition());

    const res = await (await app.signInAsOwner()).request("GET", "/api/brief");

    expect(res.body.topic_names).toMatchObject({
      yemen: "Yemen",
      saudi: "Saudi",
      ai: "AI",
      liverpool: "Liverpool",
      graphic: "Graphic",
      "github-trending": "GitHub Trending",
      "us-markets": "US Markets", // a group with nothing in it is named too
    });
    for (const g of res.body.groups as BriefGroup[]) if (g.topic) expect(res.body.topic_names[g.topic]).toBeTruthy();
  });

  it("opens on a cover card with the Edition's date and the Reader's Widgets", async () => {
    const app = await startTestApp();
    await app.postEdition(morningEdition());

    const res = await (await app.signInAsOwner()).request("GET", "/api/brief");

    // test/api/widgets.test.ts covers the Widgets, test/api/arrange-brief.test.ts their order.
    expect(res.body.cover).toEqual({ date: "2026-11-14", widgets: expect.any(Array), more_widgets: [] });
  });

  it("gives the evening Edition as next after a morning one, and the next morning after an evening one", async () => {
    const app = await startTestApp();
    await app.postEdition(morningEdition());

    const morning = await (await app.signInAsOwner()).request("GET", "/api/brief");
    expect(morning.body.next_edition_at).toBe("2026-11-14T19:15:00+03:00");

    const evening = morningEdition();
    evening.edition_id = "2026-11-30-evening";
    evening.kind = "evening";
    evening.generated_at = "2026-11-30T19:20:00+03:00";
    await app.postEdition(evening);

    const res = await (await app.signInAsOwner()).request("GET", "/api/brief");
    expect(res.body.next_edition_at).toBe("2026-12-01T06:00:00+03:00");
  });

  it("has no cover, groups or next Edition before any Edition has been ingested", async () => {
    const app = await startTestApp();

    const res = await (await app.signInAsOwner()).request("GET", "/api/brief");

    expect(res.body).toMatchObject({ edition: null, cover: null, items: [], groups: [], next_edition_at: null });
  });
});
