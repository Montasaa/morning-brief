// Ranking (ticket 09): the Brief is ordered by a deterministic score from the
// Topics a Reader follows, their own Reactions, recency and status. Likes and
// saves raise similar Items (same Topic or Story Thread), "not interested"
// lowers them, and "already seen", "bad source" or a plain hide change nothing.
// These tests check the order of the Brief, never the scorer's weights.
import { describe, expect, it } from "vitest";
import { morningEdition, type EditionDoc } from "../support/fixtures";
import { startTestApp, type TestApp, type TestSession } from "../support/test-app";

type Brief = { items: { id: string }[]; groups: { kind: string; topic: string | null; item_ids: string[] }[] };

const ids = async (session: TestSession) => {
  const res = await session.request("GET", "/api/brief");
  expect(res.status).toBe(200);
  return (res.body as Brief).items.map((i) => i.id);
};

function item(id: string, topics: string[], time: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    topics,
    time,
    title: `Item ${id}`,
    summary: `About ${id}.`,
    sources: [{ title: "Example Wire", url: `https://example.com/wire/${id}`, type: "wire" }],
    ...extra,
  };
}

/** The next morning's Edition: one fresh Item each for Liverpool (newest), GitHub Trending and AI (oldest). */
function nextMorning(): EditionDoc {
  const edition = morningEdition();
  edition.edition_id = "2026-11-15-morning";
  edition.generated_at = "2026-11-15T06:05:00+03:00";
  delete edition.top_stories;
  edition.items = [
    item("lfc-press-conference", ["liverpool"], "2026-11-15T05:00:00+03:00"),
    item("gh-new-repo", ["github-trending"], "2026-11-15T04:00:00+03:00"),
    item("ai-chip-export-rules", ["ai"], "2026-11-15T03:00:00+03:00"),
  ];
  return edition;
}
const BASELINE = ["lfc-press-conference", "gh-new-repo", "ai-chip-export-rules"]; // newest first

/** Sara follows AI, Liverpool and GitHub Trending, and has the 14 Nov morning Edition to react to. */
async function setUp(): Promise<{ app: TestApp; sara: TestSession }> {
  const app = await startTestApp();
  await app.postEdition(morningEdition());
  const sara = await app.addReader("sara@example.com", { onboarded: false });
  // Claude does not pick the top stories here (ticket 13), so they are the Scorer's best and the whole
  // Brief follows the score.
  app.services.claude.failing.add("top-picks");
  const res = await sara.request("PATCH", "/api/me", {
    body: { topics: ["ai", "liverpool", "github-trending"], onboarded: true },
  });
  expect(res.status, res.text).toBe(200);
  return { app, sara };
}

const react = (session: TestSession, itemId: string, body: Record<string, unknown>) =>
  session.request("POST", `/api/items/${itemId}/reactions`, { body }).then((r) => expect(r.status, r.text).toBe(200));

describe("without Reactions", () => {
  it("orders the Brief newest first, groups by their best Item", async () => {
    const { app, sara } = await setUp();
    await app.postEdition(nextMorning());

    expect(await ids(sara)).toEqual(BASELINE);
  });

  it("puts a new Item ahead of one with no status from the same time", async () => {
    const { app, sara } = await setUp();
    const edition = nextMorning();
    edition.items = [
      item("ai-plain", ["ai"], "2026-11-15T03:00:00+03:00"),
      item("ai-fresh", ["ai"], "2026-11-15T03:00:00+03:00", { status: "new" }),
    ];
    await app.postEdition(edition);

    expect(await ids(sara)).toEqual(["ai-fresh", "ai-plain"]);
  });

  it("gives the same order every time", async () => {
    const { app, sara } = await setUp();
    await app.postEdition(nextMorning());
    await react(sara, "ai-open-model-release", { kind: "like" });

    const first = await ids(sara);
    expect(await ids(sara)).toEqual(first);
    expect(await ids(await app.signIn("sara@example.com"))).toEqual(first); // another device
  });
});

describe("after liking or saving", () => {
  it.each([["like"], ["save"]])("Items in the same Topic rank higher in the next Brief (%s)", async (kind) => {
    const { app, sara } = await setUp();
    await react(sara, "ai-open-model-release", { kind });

    await app.postEdition(nextMorning());

    expect(await ids(sara)).toEqual(["ai-chip-export-rules", "lfc-press-conference", "gh-new-repo"]);
  });

  it("Items tagged with that Topic rank higher within their own group", async () => {
    const { app, sara } = await setUp();
    await react(sara, "ai-open-model-release", { kind: "like" });
    const edition = nextMorning();
    edition.items = [
      item("gh-new-repo", ["github-trending"], "2026-11-15T04:00:00+03:00"),
      item("gh-ai-agent", ["github-trending", "ai"], "2026-11-15T02:00:00+03:00"),
    ];
    await app.postEdition(edition);

    expect(await ids(sara)).toEqual(["gh-ai-agent", "gh-new-repo"]);
  });

  it("Items on the same Story Thread rank higher", async () => {
    const { app, sara } = await setUp();
    await sara.request("POST", "/api/topics/yemen/follow");
    const edition = nextMorning();
    edition.items = [
      item("yemen-aid-convoy", ["yemen"], "2026-11-15T05:00:00+03:00"),
      item("yemen-talks-day-two", ["yemen"], "2026-11-15T01:00:00+03:00", { thread_id: "yemen-truce-talks" }),
    ];
    await app.postEdition(edition);
    expect(await ids(sara)).toEqual(["yemen-aid-convoy", "yemen-talks-day-two"]);

    // Liking yesterday's development on the Thread lifts today's development over a fresher Yemen Item.
    await react(sara, "me-yemen-port-talks", { kind: "like" });

    expect(await ids(sara)).toEqual(["yemen-talks-day-two", "yemen-aid-convoy"]);
  });

  it("goes back to the plain order when the like is undone", async () => {
    const { app, sara } = await setUp();
    await react(sara, "ai-open-model-release", { kind: "like" });
    await app.postEdition(nextMorning());

    await sara.request("DELETE", "/api/items/ai-open-model-release/reactions/like");

    expect(await ids(sara)).toEqual(BASELINE);
  });
});

describe("after hiding", () => {
  it("'not interested' makes Items in the same Topic rank lower in the next Brief", async () => {
    const { app, sara } = await setUp();
    await react(sara, "lfc-midfielder-fitness", { kind: "hide", reason: "not_interested" });

    await app.postEdition(nextMorning());

    expect(await ids(sara)).toEqual(["gh-new-repo", "ai-chip-export-rules", "lfc-press-conference"]);
  });

  it.each([["already_seen"], ["bad_source"], [null]])("reason %s does not change how similar Items rank", async (reason) => {
    const { app, sara } = await setUp();
    await react(sara, "lfc-midfielder-fitness", reason === null ? { kind: "hide" } : { kind: "hide", reason });

    await app.postEdition(nextMorning());

    expect(await ids(sara)).toEqual(BASELINE);
  });

  it("opening an Item does not change how similar Items rank", async () => {
    const { app, sara } = await setUp();
    await react(sara, "ai-open-model-release", { kind: "open" });

    await app.postEdition(nextMorning());

    expect(await ids(sara)).toEqual(BASELINE);
  });

  it("undoing 'not interested' gives the plain order back", async () => {
    const { app, sara } = await setUp();
    await react(sara, "lfc-midfielder-fitness", { kind: "hide", reason: "not_interested" });
    await app.postEdition(nextMorning());

    await sara.request("DELETE", "/api/items/lfc-midfielder-fitness/reactions/hide");

    expect(await ids(sara)).toEqual(BASELINE);
  });
});

describe("Reactions stay private", () => {
  it("one Reader's Reactions never change another Reader's ranking", async () => {
    const { app, sara } = await setUp();
    const omar = await app.addReader("omar@example.com", { onboarded: false });
    await omar.request("PATCH", "/api/me", { body: { topics: ["ai", "liverpool", "github-trending"], onboarded: true } });

    await react(omar, "ai-open-model-release", { kind: "like" });
    await react(omar, "ai-open-model-release", { kind: "save" });
    await react(omar, "lfc-midfielder-fitness", { kind: "hide", reason: "not_interested" });
    await app.postEdition(nextMorning());

    expect(await ids(sara)).toEqual(BASELINE);
    expect(await ids(omar)).toEqual(["ai-chip-export-rules", "gh-new-repo", "lfc-press-conference"]);
  });
});
