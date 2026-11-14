// Sensitive Topics (ticket 08): Graphic and Adult Trending are hidden from
// every Reader until they opt in from the Me tab (POST /api/topics/{id}/follow),
// and Adult Trending also needs an 18+ confirmation, which is recorded. A
// sensitive Item (one carrying a Sensitive Topic) reaches a Reader only if they
// opted into every Sensitive Topic it carries, and then it is marked blurred.
import { describe, expect, it, vi } from "vitest";
import { morningEdition, type EditionDoc } from "../support/fixtures";
import { startTestApp, type TestApp, type TestSession } from "../support/test-app";

type BriefItem = { id: string; topic: string; tags: string[]; blurred: boolean; warning: string | null };

/** The morning Edition plus a Yemen story that is also Graphic, and an Adult Trending story. */
function sensitiveEdition(): EditionDoc {
  const edition = morningEdition();
  edition.items.push(
    {
      id: "yemen-strike-aftermath",
      topics: ["yemen", "graphic"],
      time: "2026-11-14T04:00:00+03:00",
      title: "Strike aftermath in Taiz",
      summary: "Hospitals report casualties after an overnight strike.",
      sources: [{ title: "Example Wire", url: "https://example.com/wire/taiz", type: "wire" }],
      warning: "Casualties",
      warning_ar: "ضحايا",
    },
    {
      id: "adult-platform-policy",
      topics: ["adult-trending"],
      time: "2026-11-14T02:00:00+03:00",
      title: "A video platform tightens its adult-content rules",
      summary: "Creators face new verification checks.",
      sources: [{ title: "Example Tech", url: "https://example.com/tech/policy", type: "independent" }],
      warning: "Adult-themed news",
    },
  );
  return edition;
}

/** A Reader who finished onboarding following exactly `topics` (no Sensitive Topics: onboarding never offers them). */
async function readerFollowing(app: TestApp, email: string, topics: string[]): Promise<TestSession> {
  const session = await app.addReader(email, { onboarded: false });
  const res = await session.request("PATCH", "/api/me", { body: { topics, onboarded: true } });
  expect(res.status, res.text).toBe(200);
  return session;
}

async function briefOf(session: TestSession): Promise<BriefItem[]> {
  const res = await session.request("GET", "/api/brief");
  expect(res.status).toBe(200);
  return res.body.items as BriefItem[];
}

const ids = (items: BriefItem[]) => items.map((i) => i.id);

describe("without opting in", () => {
  it("no sensitive Item reaches the Brief, even under a Topic the Reader follows", async () => {
    const app = await startTestApp();
    await app.postEdition(sensitiveEdition());
    const sara = await readerFollowing(app, "sara@example.com", ["yemen", "ai"]);

    expect(ids(await briefOf(sara))).toEqual(["me-yemen-port-talks", "ai-open-model-release"]);
  });

  it("a sensitive Item is not a top story either", async () => {
    const app = await startTestApp();
    const edition = sensitiveEdition();
    edition.top_stories = ["yemen-strike-aftermath", "me-yemen-port-talks"];
    await app.postEdition(edition);
    const sara = await readerFollowing(app, "sara@example.com", ["yemen"]);

    const res = await sara.request("GET", "/api/brief");

    expect(res.body.groups).toEqual([{ kind: "top", topic: null, item_ids: ["me-yemen-port-talks"] }]);
    expect(JSON.stringify(res.body)).not.toMatch(/Taiz|graphic/);
  });
});

describe("onboarding and PATCH /api/me", () => {
  it("never pre-select a Sensitive Topic, and cannot opt into one", async () => {
    const app = await startTestApp();
    const sara = await app.addReader("sara@example.com", { onboarded: false });
    const sensitiveFollowed = async () =>
      ((await sara.request("GET", "/api/topics")).body.topics as { id: string; sensitive: boolean; followed: boolean }[])
        .filter((t) => t.sensitive && t.followed)
        .map((t) => t.id);
    expect(await sensitiveFollowed()).toEqual([]);

    for (const topic of ["graphic", "adult-trending"]) {
      const res = await sara.request("PATCH", "/api/me", { body: { topics: ["ai", topic], onboarded: true } });
      expect(res.status).toBe(422);
      expect(res.body.reasons.join(" ")).toMatch(/Me tab/);
    }
    expect((await sara.request("GET", "/api/me")).body).toMatchObject({ onboarded: false, topics: [] });

    const done = await sara.request("PATCH", "/api/me", { body: { topics: ["ai", "yemen"], onboarded: true } });
    expect(done.status).toBe(200);
    expect(await sensitiveFollowed()).toEqual([]);
  });
});

describe("opting in from the Me tab", () => {
  it("shows a Graphic Reader its Items, marked blurred with their warning; other Items are not blurred", async () => {
    const app = await startTestApp();
    await app.postEdition(sensitiveEdition());
    const sara = await readerFollowing(app, "sara@example.com", ["yemen", "ai"]);

    const optIn = await sara.request("POST", "/api/topics/graphic/follow");

    expect(optIn.status).toBe(200);
    expect(optIn.body.topic).toMatchObject({ id: "graphic", sensitive: true, followed: true });
    const items = await briefOf(sara);
    expect(ids(items)).toEqual([
      "me-yemen-port-talks",
      "ai-open-model-release",
      "yemen-strike-aftermath",
      "graphic-flood-aftermath",
    ]);
    expect(items.find((i) => i.id === "yemen-strike-aftermath")).toMatchObject({
      topic: "yemen",
      tags: ["graphic"],
      blurred: true,
      warning: "Casualties",
    });
    expect(items.find((i) => i.id === "graphic-flood-aftermath")).toMatchObject({ topic: "graphic", blurred: true });
    expect(items.filter((i) => !i.id.includes("aftermath")).every((i) => i.blurred === false)).toBe(true);
    // Adult Trending is a separate opt-in.
    expect(ids(items)).not.toContain("adult-platform-policy");
  });

  it("opting out hides them again", async () => {
    const app = await startTestApp();
    await app.postEdition(sensitiveEdition());
    const sara = await readerFollowing(app, "sara@example.com", ["yemen"]);
    await sara.request("POST", "/api/topics/graphic/follow");
    expect(ids(await briefOf(sara))).toContain("yemen-strike-aftermath");

    expect((await sara.request("POST", "/api/topics/graphic/unfollow")).status).toBe(200);

    expect(ids(await briefOf(sara))).toEqual(["me-yemen-port-talks"]);
  });

  it("is one Reader's own: another Reader's opt-in shows them nothing", async () => {
    const app = await startTestApp();
    await app.postEdition(sensitiveEdition());
    const sara = await readerFollowing(app, "sara@example.com", ["yemen"]);
    const omar = await readerFollowing(app, "omar@example.com", ["yemen"]);

    await omar.request("POST", "/api/topics/graphic/follow");

    expect(ids(await briefOf(omar))).toContain("yemen-strike-aftermath");
    expect(ids(await briefOf(sara))).toEqual(["me-yemen-port-talks"]);
  });
});

describe("opting into Adult Trending", () => {
  it("needs an explicit 18+ confirmation", async () => {
    const app = await startTestApp();
    await app.postEdition(sensitiveEdition());
    const sara = await readerFollowing(app, "sara@example.com", ["ai"]);

    for (const body of [undefined, {}, { age_confirmed: false }, { age_confirmed: "yes" }]) {
      const res = await sara.request("POST", "/api/topics/adult-trending/follow", { body });
      expect(res.status).toBe(422);
      expect(res.body.error).toMatch(/18/);
      expect(res.body.reasons).toEqual(expect.arrayContaining([expect.stringMatching(/age_confirmed/)]));
    }
    expect((await sara.request("GET", "/api/me")).body).toMatchObject({ topics: ["ai"], age_confirmed_at: null });
    expect(ids(await briefOf(sara))).not.toContain("adult-platform-policy");

    const res = await sara.request("POST", "/api/topics/adult-trending/follow", { body: { age_confirmed: true } });

    expect(res.status).toBe(200);
    expect(res.body.topic).toMatchObject({ id: "adult-trending", followed: true });
    const adult = (await briefOf(sara)).find((i) => i.id === "adult-platform-policy");
    expect(adult).toMatchObject({ topic: "adult-trending", blurred: true, warning: "Adult-themed news" });
  });

  it("records when the Reader confirmed they are 18 or over, and asks again after opting out", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(new Date("2026-11-14T09:00:00Z"));
      const app = await startTestApp();
      const sara = await readerFollowing(app, "sara@example.com", ["ai"]);

      await sara.request("POST", "/api/topics/adult-trending/follow", { body: { age_confirmed: true } });
      expect((await sara.request("GET", "/api/me")).body).toMatchObject({
        topics: ["ai", "adult-trending"],
        age_confirmed_at: "2026-11-14T09:00:00.000Z",
      });

      vi.setSystemTime(new Date("2026-11-15T10:30:00Z"));
      await sara.request("POST", "/api/topics/adult-trending/unfollow");
      expect((await sara.request("POST", "/api/topics/adult-trending/follow")).status).toBe(422);
      expect((await sara.request("POST", "/api/topics/adult-trending/follow", { body: { age_confirmed: true } })).status).toBe(200);
      expect((await sara.request("GET", "/api/me")).body.age_confirmed_at).toBe("2026-11-15T10:30:00.000Z");
    } finally {
      vi.useRealTimers();
    }
  });

  it("an Item carrying both Sensitive Topics needs both opt-ins", async () => {
    const app = await startTestApp();
    const edition = sensitiveEdition();
    edition.items.find((i) => i.id === "adult-platform-policy")!.topics = ["adult-trending", "graphic"];
    await app.postEdition(edition);
    const sara = await readerFollowing(app, "sara@example.com", ["ai"]);

    await sara.request("POST", "/api/topics/graphic/follow");
    expect(ids(await briefOf(sara))).not.toContain("adult-platform-policy");

    await sara.request("POST", "/api/topics/adult-trending/follow", { body: { age_confirmed: true } });
    expect(ids(await briefOf(sara))).toContain("adult-platform-policy");
  });
});
