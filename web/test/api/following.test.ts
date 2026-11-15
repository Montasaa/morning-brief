// Following Topics (ticket 07): each Reader's Brief covers only the Topics they
// follow. An Item tagged with several followed Topics appears once, under its
// best-matching Topic (the first of its Topics the Reader follows), with the
// Reader's other followed Topics as tags.
import { describe, expect, it } from "vitest";
import { morningEdition } from "../support/fixtures";
import { startTestApp, type TestSession } from "../support/test-app";

type BriefItem = { id: string; topic: string; tags: string[]; top: boolean; topics: string[] };
type CatalogTopic = { id: string; followed: boolean; sensitive: boolean };

/** A Reader who finished onboarding following exactly `topics`. */
async function readerFollowing(session: TestSession, topics: string[]): Promise<TestSession> {
  const res = await session.request("PATCH", "/api/me", { body: { topics, onboarded: true } });
  expect(res.status, res.text).toBe(200);
  return session;
}

async function briefOf(session: TestSession) {
  const res = await session.request("GET", "/api/brief");
  expect(res.status).toBe(200);
  return res.body as { items: BriefItem[]; groups: { kind: string; topic: string | null; item_ids: string[] }[] };
}

const ids = (items: BriefItem[]) => items.map((i) => i.id);

describe("GET /api/topics", () => {
  it("marks the Topics the signed-in Reader follows", async () => {
    const app = await startTestApp();
    const sara = await readerFollowing(await app.addReader("sara@example.com", { onboarded: false }), ["ai", "yemen"]);

    const res = await sara.request("GET", "/api/topics");

    expect(res.status).toBe(200);
    const followed = (res.body.topics as CatalogTopic[]).filter((t) => t.followed).map((t) => t.id);
    expect(followed).toEqual(["yemen", "ai"]); // Catalog order
    expect(res.body.topics).toHaveLength(13); // the 14 starting Topics but Adult Trending, which is the Owner's alone
  });

  it("is refused when signed out", async () => {
    const app = await startTestApp();
    expect((await app.request("GET", "/api/topics")).status).toBe(401);
    expect((await app.request("POST", "/api/topics/ai/follow")).status).toBe(401);
    expect((await app.request("POST", "/api/topics/ai/unfollow")).status).toBe(401);
  });
});

describe("POST /api/topics/{id}/follow and /unfollow", () => {
  it("follow and unfollow a Topic, and saying it twice changes nothing", async () => {
    const app = await startTestApp();
    const sara = await readerFollowing(await app.addReader("sara@example.com", { onboarded: false }), ["ai"]);

    const followed = await sara.request("POST", "/api/topics/liverpool/follow");
    expect(followed.status).toBe(200);
    expect(followed.body.topic).toMatchObject({ id: "liverpool", name: "Liverpool", followed: true });
    expect((await sara.request("POST", "/api/topics/liverpool/follow")).body.topic.followed).toBe(true);
    expect((await sara.request("GET", "/api/me")).body.topics).toEqual(["ai", "liverpool"]);

    const unfollowed = await sara.request("POST", "/api/topics/ai/unfollow");
    expect(unfollowed.status).toBe(200);
    expect(unfollowed.body.topic).toMatchObject({ id: "ai", followed: false });
    expect((await sara.request("POST", "/api/topics/ai/unfollow")).status).toBe(200);
    expect((await sara.request("GET", "/api/me")).body.topics).toEqual(["liverpool"]);
  });

  it("refuses a Topic that is not in the Catalog", async () => {
    const app = await startTestApp();
    const owner = await app.signInAsOwner();

    const res = await owner.request("POST", "/api/topics/formula-1/follow");

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/Topic/);
    expect((await owner.request("POST", "/api/topics/formula-1/unfollow")).status).toBe(404);
  });
});

describe("GET /api/brief covers only the Topics the Reader follows", () => {
  it("never shows Items from Topics the Reader does not follow, top stories included", async () => {
    const app = await startTestApp();
    await app.postEdition(morningEdition()); // top stories: me-yemen-port-talks (yemen, saudi), ai-open-model-release (ai)
    const sara = await readerFollowing(await app.addReader("sara@example.com", { onboarded: false }), [
      "liverpool",
      "saudi",
    ]);

    const brief = await briefOf(sara);

    expect(ids(brief.items)).toEqual(["me-yemen-port-talks", "lfc-midfielder-fitness"]);
    expect(brief.items[0]).toMatchObject({ top: true, topic: "saudi", tags: [] });
    expect(brief.groups).toEqual([
      { kind: "top", topic: null, item_ids: ["me-yemen-port-talks"] },
      { kind: "topic", topic: "liverpool", item_ids: ["lfc-midfielder-fitness"] },
    ]);
  });

  it("changes with the next Brief after following or unfollowing a Topic", async () => {
    const app = await startTestApp();
    await app.postEdition(morningEdition());
    const sara = await readerFollowing(await app.addReader("sara@example.com", { onboarded: false }), ["liverpool"]);
    expect(ids((await briefOf(sara)).items)).toEqual(["lfc-midfielder-fitness"]);

    await sara.request("POST", "/api/topics/github-trending/follow");
    expect(ids((await briefOf(sara)).items)).toEqual(["lfc-midfielder-fitness", "gh-terminal-agent"]);

    await sara.request("POST", "/api/topics/liverpool/unfollow");
    expect(ids((await briefOf(sara)).items)).toEqual(["gh-terminal-agent"]);

    await sara.request("POST", "/api/topics/github-trending/unfollow");
    expect((await briefOf(sara)).items).toEqual([]);
  });

  it("shows an Item with several followed Topics once, under the best match, with the others as tags", async () => {
    const app = await startTestApp();
    const edition = morningEdition();
    delete edition.top_stories;
    edition.items.push({
      id: "gulf-shipping",
      topics: ["iran", "saudi", "us-markets", "yemen"],
      time: "2026-11-14T03:00:00+03:00",
      title: "Gulf shipping insurance rises again",
      summary: "Insurers raised rates for tankers.",
      sources: [{ title: "Example Wire", url: "https://example.com/wire/shipping", type: "wire" }],
    });
    await app.postEdition(edition);
    const sara = await readerFollowing(await app.addReader("sara@example.com", { onboarded: false }), [
      "yemen",
      "saudi",
      "us-markets",
    ]);

    const brief = await briefOf(sara);

    expect(ids(brief.items)).toEqual(["me-yemen-port-talks", "gulf-shipping"]);
    // Iran is not followed: the best match is the Item's first followed Topic, and only followed Topics are tags.
    const shipping = brief.items.find((i) => i.id === "gulf-shipping")!;
    expect(shipping).toMatchObject({ topic: "saudi", tags: ["us-markets", "yemen"] });
    expect(shipping.topics).toEqual(["iran", "saudi", "us-markets", "yemen"]);
    const talks = brief.items.find((i) => i.id === "me-yemen-port-talks")!;
    expect(talks).toMatchObject({ topic: "yemen", tags: ["saudi"] });
    expect(brief.groups).toEqual([
      { kind: "topic", topic: "yemen", item_ids: ["me-yemen-port-talks"] },
      { kind: "topic", topic: "saudi", item_ids: ["gulf-shipping"] },
    ]);
    const shown = brief.groups.flatMap((g) => g.item_ids);
    expect(new Set(shown).size).toBe(shown.length);
  });

  it("gives two Readers following different Topics different Briefs from the same Edition", async () => {
    const app = await startTestApp();
    await app.postEdition(morningEdition());
    const sara = await readerFollowing(await app.addReader("sara@example.com", { onboarded: false }), ["ai", "liverpool"]);
    const omar = await readerFollowing(await app.addReader("omar@example.com", { onboarded: false }), [
      "yemen",
      "github-trending",
    ]);

    expect(ids((await briefOf(sara)).items)).toEqual(["ai-open-model-release", "lfc-midfielder-fitness"]);
    expect(ids((await briefOf(omar)).items)).toEqual(["me-yemen-port-talks", "gh-terminal-agent"]);

    // One Reader's follows never change another's Brief.
    await sara.request("POST", "/api/topics/github-trending/follow");
    expect(ids((await briefOf(omar)).items)).toEqual(["me-yemen-port-talks", "gh-terminal-agent"]);
    expect(ids((await briefOf(sara)).items)).toEqual([
      "ai-open-model-release",
      "lfc-midfielder-fitness",
      "gh-terminal-agent",
    ]);
  });
});
