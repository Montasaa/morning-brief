// Sensitive Topics (ticket 08): Graphic and Adult Trending are hidden from
// every Reader until they opt in from the Me tab (POST /api/topics/{id}/follow),
// and Adult Trending also needs an 18+ confirmation, which is recorded. A
// sensitive Item (one carrying a Sensitive Topic) reaches a Reader only if they
// opted into every Sensitive Topic it carries, and then it is marked blurred
// unless they turned the blur off for every one of them (rework ticket 10).
// Adult Trending is the Owner's alone, and Sensitive Items never come first.
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

    expect(res.body.groups).toMatchObject([{ kind: "top", topic: null, item_ids: ["me-yemen-port-talks"] }]);
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

describe("opting into Adult Trending (the Owner only)", () => {
  /** The Owner on their first visit, following exactly `topics`: no Sensitive Topic opted into yet. */
  async function ownerFollowing(app: TestApp, topics: string[]): Promise<TestSession> {
    const owner = await app.signInAsOwner({ onboarded: false });
    const res = await owner.request("PATCH", "/api/me", { body: { topics, onboarded: true } });
    expect(res.status, res.text).toBe(200);
    return owner;
  }

  it("needs an explicit 18+ confirmation", async () => {
    const app = await startTestApp();
    await app.postEdition(sensitiveEdition());
    const owner = await ownerFollowing(app, ["ai"]);

    for (const body of [undefined, {}, { age_confirmed: false }, { age_confirmed: "yes" }]) {
      const res = await owner.request("POST", "/api/topics/adult-trending/follow", { body });
      expect(res.status).toBe(422);
      expect(res.body.error).toMatch(/18/);
      expect(res.body.reasons).toEqual(expect.arrayContaining([expect.stringMatching(/age_confirmed/)]));
    }
    expect((await owner.request("GET", "/api/me")).body).toMatchObject({ topics: ["ai"], age_confirmed_at: null });
    expect(ids(await briefOf(owner))).not.toContain("adult-platform-policy");

    const res = await owner.request("POST", "/api/topics/adult-trending/follow", { body: { age_confirmed: true } });

    expect(res.status).toBe(200);
    expect(res.body.topic).toMatchObject({ id: "adult-trending", followed: true });
    const adult = (await briefOf(owner)).find((i) => i.id === "adult-platform-policy");
    expect(adult).toMatchObject({ topic: "adult-trending", blurred: true, warning: "Adult-themed news" });
  });

  it("records when the Owner confirmed they are 18 or over, and asks again after opting out", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(new Date("2026-11-14T09:00:00Z"));
      const app = await startTestApp();
      const owner = await ownerFollowing(app, ["ai"]);

      await owner.request("POST", "/api/topics/adult-trending/follow", { body: { age_confirmed: true } });
      expect((await owner.request("GET", "/api/me")).body).toMatchObject({
        topics: ["ai", "adult-trending"],
        age_confirmed_at: "2026-11-14T09:00:00.000Z",
      });

      vi.setSystemTime(new Date("2026-11-15T10:30:00Z"));
      await owner.request("POST", "/api/topics/adult-trending/unfollow");
      expect((await owner.request("POST", "/api/topics/adult-trending/follow")).status).toBe(422);
      expect((await owner.request("POST", "/api/topics/adult-trending/follow", { body: { age_confirmed: true } })).status).toBe(200);
      expect((await owner.request("GET", "/api/me")).body.age_confirmed_at).toBe("2026-11-15T10:30:00.000Z");
    } finally {
      vi.useRealTimers();
    }
  });

  it("an Item carrying both Sensitive Topics needs both opt-ins", async () => {
    const app = await startTestApp();
    const edition = sensitiveEdition();
    edition.items.find((i) => i.id === "adult-platform-policy")!.topics = ["adult-trending", "graphic"];
    await app.postEdition(edition);
    const owner = await ownerFollowing(app, ["ai"]);

    await owner.request("POST", "/api/topics/graphic/follow");
    expect(ids(await briefOf(owner))).not.toContain("adult-platform-policy");

    await owner.request("POST", "/api/topics/adult-trending/follow", { body: { age_confirmed: true } });
    expect(ids(await briefOf(owner))).toContain("adult-platform-policy");
  });
});

describe("Adult Trending is visible to the Owner only", () => {
  it("is not in another Reader's Catalog, and they cannot follow, share or unblur it", async () => {
    const app = await startTestApp();
    const owner = await app.signInAsOwner();
    const sara = await readerFollowing(app, "sara@example.com", ["ai"]);

    const catalog = (session: TestSession) =>
      session.request("GET", "/api/topics").then((r) => (r.body.topics as { id: string }[]).map((t) => t.id));
    expect(await catalog(owner)).toContain("adult-trending");
    expect(await catalog(sara)).not.toContain("adult-trending");
    expect(await catalog(sara)).toContain("graphic");

    const follow = await sara.request("POST", "/api/topics/adult-trending/follow", { body: { age_confirmed: true } });
    expect(follow.status).toBe(404);
    expect((await sara.request("POST", "/api/topics/adult-trending/share")).status).toBe(404);
    expect((await sara.request("POST", "/api/topics/adult-trending/unfollow")).status).toBe(404);
    const patched = await sara.request("PATCH", "/api/me", { body: { display: { pinned: ["adult-trending"] } } });
    expect(patched.status).toBe(422);
    expect((await sara.request("GET", "/api/me")).body).toMatchObject({ topics: ["ai"], age_confirmed_at: null });
  });

  it("never reaches another Reader, even on an Item that also carries a Topic they follow", async () => {
    const app = await startTestApp();
    const edition = sensitiveEdition();
    edition.items.find((i) => i.id === "adult-platform-policy")!.topics = ["ai", "adult-trending"];
    await app.postEdition(edition);
    const owner = await app.signInAsOwner();
    const sara = await app.addReader("sara@example.com"); // follows (and opted into) everything in her Catalog

    expect(ids(await briefOf(owner))).toContain("adult-platform-policy");
    const brief = await sara.request("GET", "/api/brief");
    expect(ids(brief.body.items)).not.toContain("adult-platform-policy");
    const search = await sara.request("GET", "/api/search?q=platform");
    expect(search.body.results).toEqual([]);
    expect(JSON.stringify([brief.body, search.body])).not.toMatch(/adult-trending|Adult Trending/);
  });

  it("is never counted in the gathering list for another Reader", async () => {
    const app = await startTestApp();
    await app.signInAsOwner(); // follows every Topic, Adult Trending included
    const sara = await app.addReader("sara@example.com");
    await sara.request("POST", "/api/topics/adult-trending/follow", { body: { age_confirmed: true } });

    const list = await app.request("GET", "/api/gathering-list", { token: app.ingestToken });

    const byId = Object.fromEntries((list.body.topics as { id: string; followers: number }[]).map((t) => [t.id, t.followers]));
    expect(byId["adult-trending"]).toBe(1);
    expect(byId["graphic"]).toBe(2);
  });
});

describe("the blur switch per Sensitive Topic (Display unblurred)", () => {
  /** sensitiveEdition, with the flood on the Yemen Thread and an Item carrying both Sensitive Topics. */
  function blurEdition(): EditionDoc {
    const edition = sensitiveEdition();
    delete edition.top_stories;
    const flood = edition.items.find((i) => i.id === "graphic-flood-aftermath")!;
    flood.thread_id = "yemen-truce-talks";
    flood.time = "2026-11-14T05:50:00+03:00";
    edition.items.push({
      id: "adult-graphic-both",
      topics: ["adult-trending", "graphic"],
      time: "2026-11-14T01:00:00+03:00",
      title: "A placeholder story in both Sensitive Topics",
      summary: "Placeholder text.",
      sources: [{ title: "Example Daily", url: "https://example.com/daily/both", type: "independent" }],
      warning: "Both",
    });
    return edition;
  }

  const blurOf = (items: { id: string; blurred: boolean }[]) =>
    Object.fromEntries(items.filter((i) => /aftermath|adult/.test(i.id)).map((i) => [i.id, i.blurred]));

  it("unblurs an Item only when the blur is off for every Sensitive Topic it carries, in the Brief, Threads and Saved & Search", async () => {
    const app = await startTestApp();
    await app.postEdition(blurEdition());
    const owner = await app.signInAsOwner();
    await owner.request("POST", "/api/items/graphic-flood-aftermath/reactions", { body: { kind: "save" } });

    const off = await owner.request("PATCH", "/api/me", { body: { display: { unblurred: ["graphic"] } } });
    expect(off.status, off.text).toBe(200);

    expect(blurOf(await briefOf(owner))).toEqual({
      "graphic-flood-aftermath": false,
      "yemen-strike-aftermath": false,
      "adult-platform-policy": true,
      "adult-graphic-both": true,
    });
    const saved = (await owner.request("GET", "/api/saved")).body.items;
    expect(saved.map((i: { id: string; blurred: boolean }) => [i.id, i.blurred])).toEqual([["graphic-flood-aftermath", false]]);
    expect((await owner.request("GET", "/api/search?q=flood")).body.results[0]).toMatchObject({ blurred: false });
    const thread = await owner.request("GET", "/api/threads/yemen-truce-talks");
    expect(thread.body.thread.latest).toMatchObject({ id: "graphic-flood-aftermath", blurred: false });
    expect(thread.body.items[0]).toMatchObject({ id: "graphic-flood-aftermath", blurred: false });

    await owner.request("PATCH", "/api/me", { body: { display: { unblurred: ["graphic", "adult-trending"] } } });
    expect(Object.values(blurOf(await briefOf(owner)))).toEqual([false, false, false, false]);

    // Opting out and back in starts blurred again.
    await owner.request("POST", "/api/topics/graphic/unfollow");
    await owner.request("POST", "/api/topics/graphic/follow");
    expect(blurOf(await briefOf(owner))).toMatchObject({ "graphic-flood-aftermath": true, "adult-platform-policy": false });
  });

  it("is one Reader's own", async () => {
    const app = await startTestApp();
    await app.postEdition(blurEdition());
    const owner = await app.signInAsOwner();
    const sara = await app.addReader("sara@example.com");

    await sara.request("PATCH", "/api/me", { body: { display: { unblurred: ["graphic"] } } });

    expect(blurOf(await briefOf(sara))).toEqual({ "graphic-flood-aftermath": false, "yemen-strike-aftermath": false });
    expect(blurOf(await briefOf(owner))["graphic-flood-aftermath"]).toBe(true);
  });

  it("never unblurs NSFW media: media_blurred stays true whatever the switch says", async () => {
    const app = await startTestApp();
    const edition = blurEdition();
    const adult = edition.items.find((i) => i.id === "adult-platform-policy")!;
    adult.nsfw_media = true;
    adult.image = "https://example.com/img/placeholder-nsfw.jpg";
    adult.thread_id = "yemen-truce-talks";
    await app.postEdition(edition);
    const owner = await app.signInAsOwner();
    await owner.request("POST", "/api/items/adult-platform-policy/reactions", { body: { kind: "save" } });
    type Media = { id: string; blurred: boolean; media_blurred: boolean };
    const mediaOf = (items: Media[]) => Object.fromEntries(items.map((i) => [i.id, [i.blurred, i.media_blurred]]));

    const before = mediaOf(await briefOf(owner) as unknown as Media[]);
    expect(before["adult-platform-policy"]).toEqual([true, true]);
    expect(before["graphic-flood-aftermath"]).toEqual([true, false]);
    expect(before["ai-open-model-release"]).toEqual([false, false]);

    await owner.request("PATCH", "/api/me", { body: { display: { unblurred: ["graphic", "adult-trending"] } } });

    const after = mediaOf(await briefOf(owner) as unknown as Media[]);
    expect(after["adult-platform-policy"]).toEqual([false, true]);
    expect(after["graphic-flood-aftermath"]).toEqual([false, false]);
    expect((await owner.request("GET", "/api/saved")).body.items[0]).toMatchObject({ id: "adult-platform-policy", blurred: false, media_blurred: true });
    const thread = await owner.request("GET", "/api/threads/yemen-truce-talks");
    expect(mediaOf(thread.body.items)["adult-platform-policy"]).toEqual([false, true]);
  });
});

describe("Sensitive Items never come first", () => {
  type Brief = {
    items: { id: string; top: boolean; sensitive: boolean }[];
    groups: { kind: string; topic: string | null; item_ids: string[] }[];
    nothing_to_show: boolean;
  };
  const tops = (brief: Brief) => brief.items.filter((i) => i.top).map((i) => i.id);

  it("are never among Claude's top picks, and are not offered to Claude", async () => {
    const app = await startTestApp();
    const owner = await app.signInAsOwner();
    app.services.claude.replies.set("top-picks", {
      text: JSON.stringify({
        top_stories: [
          { item: "graphic-flood-aftermath", why: "Close to home." },
          { item: "ai-open-model-release", why: "You follow AI." },
        ],
      }),
    });

    await app.postEdition(sensitiveEdition());
    const brief = (await owner.request("GET", "/api/brief")).body as Brief;

    expect(tops(brief)).toEqual(["ai-open-model-release"]);
    const prompts = app.services.claude.calls.filter((c) => c.purpose === "top-picks").map((c) => JSON.stringify(c.messages));
    expect(prompts.join("\n")).not.toMatch(/graphic-flood-aftermath|yemen-strike-aftermath|adult-platform-policy/);
  });

  it("are never among the Scorer's fallback or the Edition's own top stories", async () => {
    const app = await startTestApp();
    const owner = await app.signInAsOwner();
    app.services.claude.failing.add("top-picks");
    const edition = sensitiveEdition();
    edition.top_stories = ["graphic-flood-aftermath", "yemen-strike-aftermath"];
    for (const id of ["graphic-flood-aftermath", "yemen-strike-aftermath", "adult-platform-policy"]) {
      Object.assign(edition.items.find((i) => i.id === id)!, { status: "new", time: "2026-11-14T06:00:00+03:00" });
    }

    await app.postEdition(edition);
    const brief = (await owner.request("GET", "/api/brief")).body as Brief;

    expect(tops(brief)).toHaveLength(3);
    expect(brief.items.filter((i) => i.top).every((i) => !i.sensitive)).toBe(true);
    // A Reader who signs in later gets the Edition's own top stories: none of them sensitive either.
    const sara = await app.addReader("sara@example.com");
    expect(tops((await sara.request("GET", "/api/brief")).body as Brief)).toEqual([]);
  });

  it("never open the Brief: a group led by a Sensitive Item comes after the first non-Sensitive group", async () => {
    const app = await startTestApp();
    const edition = sensitiveEdition();
    delete edition.top_stories;
    // The newest Items are sensitive, so the Scorer alone would put them first.
    Object.assign(edition.items.find((i) => i.id === "graphic-flood-aftermath")!, { status: "new", time: "2026-11-14T06:00:00+03:00" });
    Object.assign(edition.items.find((i) => i.id === "yemen-strike-aftermath")!, { status: "new", time: "2026-11-14T05:59:00+03:00" });
    await app.postEdition(edition);
    const sara = await readerFollowing(app, "sara@example.com", ["yemen", "ai"]); // signed in after ingest: no tops
    await sara.request("POST", "/api/topics/graphic/follow");

    const brief = (await sara.request("GET", "/api/brief")).body as Brief;

    expect(tops(brief)).toEqual([]);
    expect(brief.items[0]).toMatchObject({ sensitive: false });
    expect(brief.groups.map((g) => g.topic)).toEqual(["ai", "graphic", "yemen"]);
    expect(brief.groups.find((g) => g.topic === "yemen")!.item_ids).toEqual(["yemen-strike-aftermath", "me-yemen-port-talks"]);
    expect(brief.nothing_to_show).toBe(false);
  });

  it("a Reader who follows only Sensitive Topics gets the Cover and a nothing-to-show note first", async () => {
    const app = await startTestApp();
    await app.postEdition(sensitiveEdition());
    const sara = await readerFollowing(app, "sara@example.com", ["ai"]);
    await sara.request("POST", "/api/topics/graphic/follow");
    await sara.request("POST", "/api/topics/ai/unfollow");

    const brief = (await sara.request("GET", "/api/brief")).body as Brief;

    expect(brief.nothing_to_show).toBe(true);
    expect(tops(brief)).toEqual([]);
    expect(brief.items.every((i) => i.sensitive)).toBe(true);
  });
});
