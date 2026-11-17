// Adult Trending gathering (issue #19): POST /api/gather/adult-trending reads
// the subreddit RSS feeds listed in Adult Trending's Gathering Rules (the fake
// Reddit serves them) and adds the new posts that pass the fixed limits as
// Items in the Owner's Brief. Cron calls it every 15 minutes.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OutsideServiceNotConnected, type ClaudeRequest, type RedditPost } from "@/server/outside";
import { legacyToday, morningEdition } from "../support/fixtures";
import { startTestApp, type TestApp, type TestSession } from "../support/test-app";

const NOW = "2026-11-14T08:00:00+03:00";
const FEED = "https://www.reddit.com/r/examplesub/new/.rss";
const OTHER_FEED = "https://www.reddit.com/r/otherexample/new/.rss";
const SCREEN = "adult-trending-screen";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(NOW));
});
afterEach(() => {
  vi.useRealTimers();
});

/** A post in r/examplesub, `minutesAgo` before now, with a picture. */
function post(id: string, title: string, overrides: Partial<RedditPost> & { minutesAgo?: number } = {}): RedditPost {
  const { minutesAgo = 30, ...rest } = overrides;
  return {
    id,
    subreddit: "examplesub",
    title,
    url: `https://www.reddit.com/r/examplesub/comments/${id}/a_post/`,
    author: "example_poster",
    published: new Date(Date.now() - minutesAgo * 60_000).toISOString(),
    text: "",
    image: `https://preview.redd.it/${id}.jpeg?width=640`,
    media: true,
    ...rest,
  };
}

/** Adult Trending's Gathering Rules with these feeds listed, as the Owner writes them on the Gathering Rules page. */
function rulesListing(feeds: string[]): string {
  return [
    "Subreddit RSS feeds (the Owner keeps this list; one per line, e.g. https://www.reddit.com/r/<subreddit>/new/.rss):",
    ...(feeds.length ? feeds : ["(none yet)"]),
    "What counts: every new post in those feeds, NSFW included.",
    "Exclude (fixed limit, never a setting): anything involving minors, anything non-consensual, anything leaked.",
  ].join("\n");
}

async function listFeeds(owner: TestSession, feeds: string[]): Promise<void> {
  const res = await owner.request("PATCH", "/api/topics/adult-trending/rules", { body: { rules: rulesListing(feeds) } });
  expect(res.status, res.text).toBe(200);
}

/** The post Claude was asked to screen. */
function screened(req: ClaudeRequest): { title: string; subreddit: string; text: string } {
  const content = req.messages[0]!.content;
  return JSON.parse(content.slice(content.indexOf("{")));
}

/** Claude's answer for a post that passes, with a sentence-case headline in both languages. */
function passes(req: ClaudeRequest, extra: Record<string, unknown> = {}) {
  const { title } = screened(req);
  return {
    text: JSON.stringify({
      minors: false,
      non_consensual: false,
      leaked: false,
      named_person: false,
      keep: true,
      headline: `Sentence case: ${title.toLowerCase()}`,
      headline_ar: `عنوان: ${title}`,
      summary: "A new post in the subreddit.",
      summary_ar: "منشور جديد في المجتمع.",
      ...extra,
    }),
  };
}

function screenCalls(app: TestApp): ClaudeRequest[] {
  return app.services.claude.calls.filter((c) => c.purpose === SCREEN);
}

const gather = (app: TestApp) => app.request("POST", "/api/gather/adult-trending", { token: app.ingestToken });

/** An app with the morning Edition, the Owner (opted into Adult Trending), one feed listed and Claude passing every post. */
async function ready(): Promise<{ app: TestApp; owner: TestSession }> {
  const app = await startTestApp();
  await app.postEdition(morningEdition());
  const owner = await app.signInAsOwner();
  await listFeeds(owner, [FEED]);
  app.services.claude.replies.set(SCREEN, (req) => passes(req));
  return { app, owner };
}

async function briefIds(session: TestSession): Promise<string[]> {
  const res = await session.request("GET", "/api/brief");
  expect(res.status).toBe(200);
  return (res.body.items as { id: string }[]).map((i) => i.id);
}

describe("POST /api/gather/adult-trending", () => {
  it("needs the pipeline token", async () => {
    const { app } = await ready();
    app.services.reddit.feeds.set(FEED, [post("abc123", "A post")]);

    expect((await app.request("POST", "/api/gather/adult-trending")).status).toBe(401);
    expect((await app.request("POST", "/api/gather/adult-trending", { token: "wrong" })).status).toBe(401);
    expect(app.services.reddit.calls).toEqual([]);
  });

  it("adds new posts from the listed feeds to the Owner's Brief, blurred, next to the Edition's Items", async () => {
    const { app, owner } = await ready();
    const before = await briefIds(owner);
    app.services.reddit.feeds.set(FEED, [post("abc123", "SOMETHING NEW ON THE SUB", { minutesAgo: 20 })]);

    const res = await gather(app);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ skipped: null, feeds: 1, screened: 1, kept: ["reddit-abc123"], dropped: {} });
    expect(app.services.reddit.calls).toEqual([FEED]);
    const brief = (await owner.request("GET", "/api/brief")).body;
    const item = brief.items.find((i: { id: string }) => i.id === "reddit-abc123");
    expect(item).toMatchObject({
      topic: "adult-trending",
      topics: ["adult-trending"],
      title: "Sentence case: something new on the sub",
      title_ar: "عنوان: SOMETHING NEW ON THE SUB",
      summary: "A new post in the subreddit.",
      sources: [{ title: "r/examplesub on Reddit", url: "https://www.reddit.com/r/examplesub/comments/abc123/a_post/", type: "social" }],
      image: "https://preview.redd.it/abc123.jpeg?width=640",
      image_kind: "photo",
      warning: "Adult content from r/examplesub",
      warning_ar: "محتوى للبالغين من r/examplesub",
      sensitive: true,
      blurred: true,
      media_blurred: true,
      top: false,
      extras: { platform: "reddit", creator: "u/example_poster" },
    });
    // Gathering keeps every Item the Edition brought.
    expect(brief.items.map((i: { id: string }) => i.id)).toEqual(expect.arrayContaining(before));
    expect(brief.items).toHaveLength(before.length + 1);
    // A Sensitive Item never opens the Brief.
    expect(brief.items[0].sensitive).toBe(false);
  });

  it("keeps the picture behind its own veil even with the blur turned off, and a post with no picture is a plain card", async () => {
    const { app, owner } = await ready();
    app.services.reddit.feeds.set(FEED, [
      post("pic1", "With a picture"),
      post("txt1", "Just words", { image: null, media: false, text: "Some words from the poster." }),
    ]);
    await owner.request("PATCH", "/api/me", { body: { display: { unblurred: ["adult-trending"] } } });

    await gather(app);

    const items = (await owner.request("GET", "/api/brief")).body.items as Record<string, unknown>[];
    expect(items.find((i) => i.id === "reddit-pic1")).toMatchObject({ blurred: false, media_blurred: true });
    expect(items.find((i) => i.id === "reddit-txt1")).toMatchObject({ blurred: false, media_blurred: false, image: null, image_kind: "none" });
  });

  it("uses the post's own title, first letter capitalised, when Claude gives no headline", async () => {
    const { app, owner } = await ready();
    app.services.claude.replies.set(SCREEN, (req) => passes(req, { headline: undefined, headline_ar: undefined, summary: undefined }));
    app.services.reddit.feeds.set(FEED, [post("abc123", "a quiet evening post", { text: "What the poster wrote." })]);

    await gather(app);

    const item = (await owner.request("GET", "/api/brief")).body.items.find((i: { id: string }) => i.id === "reddit-abc123");
    expect(item).toMatchObject({ title: "A quiet evening post", title_ar: null, summary: "What the poster wrote." });
  });
});

describe("when nothing is gathered", () => {
  it("an empty feed list gathers nothing and breaks nothing", async () => {
    const app = await startTestApp();
    await app.postEdition(morningEdition());
    const owner = await app.signInAsOwner();
    app.services.reddit.feeds.set(FEED, [post("abc123", "A post")]);
    const before = (await owner.request("GET", "/api/brief")).body;

    const res = await gather(app);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ skipped: expect.stringMatching(/No subreddit feeds/), feeds: 0, kept: [] });
    expect(app.services.reddit.calls).toEqual([]);
    expect(screenCalls(app)).toEqual([]);
    expect((await owner.request("GET", "/api/brief")).body).toEqual(before);
  });

  it("only lines that are subreddit RSS feeds count; anything else in the rules is never fetched", async () => {
    const { app, owner } = await ready();
    await listFeeds(owner, [
      "https://example.com/r/elsewhere/new/.rss",
      "https://www.reddit.com/r/examplesub/comments/abc/not_a_feed/",
      "see https://www.reddit.com/r/otherexample/new/.rss",
      "https://old.reddit.com/r/examplesub/new/.rss",
      FEED,
    ]);

    const res = await gather(app);

    expect(res.body.feeds).toBe(1);
    expect(app.services.reddit.calls).toEqual([FEED]);
  });

  it("nothing is gathered while nobody follows Adult Trending; once the Owner opts in, it is", async () => {
    const app = await startTestApp();
    await app.postEdition(morningEdition());
    const owner = await app.signInAsOwner({ onboarded: false });
    await owner.request("PATCH", "/api/me", { body: { topics: ["yemen", "ai"], onboarded: true } });
    await listFeeds(owner, [FEED]);
    app.services.claude.replies.set(SCREEN, (req) => passes(req));
    app.services.reddit.feeds.set(FEED, [post("abc123", "A post")]);

    expect((await gather(app)).body).toMatchObject({ skipped: "Nobody follows Adult Trending.", kept: [] });
    expect(app.services.reddit.calls).toEqual([]);

    await owner.request("POST", "/api/topics/adult-trending/follow", { body: { age_confirmed: true } });
    expect((await gather(app)).body.kept).toEqual(["reddit-abc123"]);
  });

  it("before the first Edition nothing is gathered", async () => {
    const app = await startTestApp();
    const owner = await app.signInAsOwner();
    await listFeeds(owner, [FEED]);
    app.services.reddit.feeds.set(FEED, [post("abc123", "A post")]);

    expect((await gather(app)).body).toMatchObject({ skipped: "No Edition yet.", kept: [] });
    expect(app.services.reddit.calls).toEqual([]);
  });

  it("a feed Reddit refuses is counted and the other feeds are still read", async () => {
    const { app, owner } = await ready();
    await listFeeds(owner, [FEED, OTHER_FEED]);
    app.services.reddit.failing.add(FEED);
    app.services.reddit.feeds.set(OTHER_FEED, [post("abc123", "A post", { subreddit: "otherexample" })]);

    const res = await gather(app);

    expect(res.body).toMatchObject({ feeds: 2, feed_errors: 1, kept: ["reddit-abc123"] });
  });
});

describe("the fixed limits: excluded posts never become Items", () => {
  async function expectDropped(app: TestApp, owner: TestSession, reason: string) {
    const res = await gather(app);
    expect(res.body.kept).toEqual([]);
    expect(res.body.dropped).toEqual({ [reason]: 1 });
    expect(await briefIds(owner)).not.toContain("reddit-bad1");
    const search = await owner.request("GET", "/api/search?q=post");
    expect(search.body.results.map((r: { id: string }) => r.id)).not.toContain("reddit-bad1");
  }

  it.each([
    ["minors", "Teen couple at home"],
    ["minors", "[17F] first post here"],
    ["minors", "Back to school outfit"],
    ["minors", "She looks so young-looking"],
    ["minors", "My t33n girlfriend"],
    ["non_consensual", "Hidden cam in the changing room"],
    ["non_consensual", "Revenge post of my ex"],
    ["non_consensual", "Non-consensual fantasy"],
    ["non_consensual", "She was asleep"],
    ["leaked", "Leaked private video"],
    ["leaked", "Her stolen photos"],
    ["named_person", "Famous actress caught on a beach"],
  ])("by keyword (%s): %s, without asking Claude", async (reason, title) => {
    const { app, owner } = await ready();
    app.services.reddit.feeds.set(FEED, [post("bad1", title)]);

    await expectDropped(app, owner, reason);
    expect(screenCalls(app)).toEqual([]);
  });

  it("by keyword in the post's text or its subreddit, too", async () => {
    const { app, owner } = await ready();
    await listFeeds(owner, [FEED, "https://www.reddit.com/r/leakedstuff/new/.rss"]);
    app.services.reddit.feeds.set(FEED, [post("bad1", "An ordinary post", { text: "She is 16 years old" })]);
    app.services.reddit.feeds.set("https://www.reddit.com/r/leakedstuff/new/.rss", [
      post("bad2", "An ordinary post", { subreddit: "leakedstuff" }),
    ]);

    const res = await gather(app);

    expect(res.body).toMatchObject({ kept: [], dropped: { minors: 1, leaked: 1 } });
    expect(screenCalls(app)).toEqual([]);
  });

  it.each(["minors", "non_consensual", "leaked", "named_person"])("when Claude says %s", async (flag) => {
    const { app, owner } = await ready();
    app.services.claude.replies.set(SCREEN, (req) => passes(req, { [flag]: true, keep: false }));
    app.services.reddit.feeds.set(FEED, [post("bad1", "An ordinary post")]);

    await expectDropped(app, owner, flag);
    expect(screenCalls(app)).toHaveLength(1);
  });

  it("when Claude says a flag but still says keep", async () => {
    const { app, owner } = await ready();
    app.services.claude.replies.set(SCREEN, (req) => passes(req, { named_person: true, keep: true }));
    app.services.reddit.feeds.set(FEED, [post("bad1", "An ordinary post")]);

    await expectDropped(app, owner, "named_person");
  });

  it.each([
    ["not JSON", () => ({ text: "Looks fine to me." })],
    ["JSON with prose around it", (req: ClaudeRequest) => ({ text: `Sure! ${passes(req).text} Hope that helps.` })],
    ["a flag left out", (req: ClaudeRequest) => passes(req, { leaked: undefined })],
    ["a flag that is not true or false", (req: ClaudeRequest) => passes(req, { minors: "no" })],
    ["keep false with no reason", (req: ClaudeRequest) => passes(req, { keep: false })],
    ["keep left out", (req: ClaudeRequest) => passes(req, { keep: undefined })],
    ["an empty answer", () => ({ text: "" })],
  ])("when Claude's answer is unclear (%s)", async (_case, reply) => {
    const { app, owner } = await ready();
    app.services.claude.replies.set(SCREEN, reply);
    app.services.reddit.feeds.set(FEED, [post("bad1", "An ordinary post")]);

    await expectDropped(app, owner, "unclear");
  });

  it("when Claude's own headline or summary runs into a limit", async () => {
    const { app, owner } = await ready();
    app.services.claude.replies.set(SCREEN, (req) => passes(req, { summary: "A teen posts a picture." }));
    app.services.reddit.feeds.set(FEED, [post("bad1", "An ordinary post")]);

    await expectDropped(app, owner, "minors");
  });

  it("when Claude fails: tried again on the next runs, then dropped, never shown", async () => {
    const { app, owner } = await ready();
    app.services.claude.failing.add(SCREEN);
    app.services.reddit.feeds.set(FEED, [post("bad1", "An ordinary post")]);

    expect((await gather(app)).body).toMatchObject({ kept: [], retry_later: 1 });
    expect((await gather(app)).body).toMatchObject({ kept: [], retry_later: 1 });
    expect((await gather(app)).body).toMatchObject({ kept: [], retry_later: 0, dropped: { unclear: 1 } });
    app.services.claude.failing.delete(SCREEN);
    expect((await gather(app)).body).toMatchObject({ screened: 0, kept: [] });
    expect(screenCalls(app)).toHaveLength(3);
    expect(await briefIds(owner)).not.toContain("reddit-bad1");
  });

  it("when Claude is not connected: nothing is kept, and the posts wait for a later run", async () => {
    const { app, owner } = await ready();
    app.services.claude.replies.set(SCREEN, () => {
      throw new OutsideServiceNotConnected("Claude");
    });
    app.services.reddit.feeds.set(FEED, [post("abc123", "A post"), post("abc124", "Another post")]);

    expect((await gather(app)).body).toMatchObject({ kept: [], screened: 0, waiting: 2 });
    expect(await briefIds(owner)).not.toContain("reddit-abc123");

    app.services.claude.replies.set(SCREEN, (req) => passes(req));
    expect((await gather(app)).body.kept.sort()).toEqual(["reddit-abc123", "reddit-abc124"]);
  });
});

describe("freshness", () => {
  it("gathers posts from the last 24 hours only, newest first, at most 25 a run; the rest come next run", async () => {
    const { app, owner } = await ready();
    const posts = Array.from({ length: 30 }, (_, n) => post(`p${n + 10}`, `Post number ${n}`, { minutesAgo: 10 + n * 30 }));
    posts.push(post("old1", "A post from yesterday", { minutesAgo: 25 * 60 }));
    app.services.reddit.feeds.set(FEED, posts);

    const first = await gather(app);
    expect(first.body).toMatchObject({ screened: 25, waiting: 5 });
    expect(first.body.kept).toEqual(posts.slice(0, 25).map((p) => `reddit-${p.id}`));

    const second = await gather(app);
    expect(second.body.kept).toEqual(posts.slice(25, 30).map((p) => `reddit-${p.id}`));
    expect(await briefIds(owner)).not.toContain("reddit-old1");
  });

  it("de-duplicates by post id across feeds and runs: each post is screened once", async () => {
    const { app, owner } = await ready();
    await listFeeds(owner, [FEED, OTHER_FEED]);
    app.services.reddit.feeds.set(FEED, [post("abc123", "A post")]);
    app.services.reddit.feeds.set(OTHER_FEED, [post("abc123", "A post")]);

    expect((await gather(app)).body.kept).toEqual(["reddit-abc123"]);
    expect((await gather(app)).body).toMatchObject({ screened: 0, kept: [] });

    expect(screenCalls(app)).toHaveLength(1);
    expect((await briefIds(owner)).filter((id) => id === "reddit-abc123")).toHaveLength(1);
  });

  it("a Reddit Item leaves the Brief 24 hours after it was posted", async () => {
    const { app, owner } = await ready();
    app.services.reddit.feeds.set(FEED, [post("abc123", "A post", { minutesAgo: 60 })]);
    await gather(app);
    expect(await briefIds(owner)).toContain("reddit-abc123");

    vi.setSystemTime(new Date(Date.parse(NOW) + 23.5 * 3_600_000));
    expect(await briefIds(owner)).not.toContain("reddit-abc123");
  });
});

describe("next to the brief.json import", () => {
  it("the next Edition keeps the Reddit Items, and gathering keeps the Edition's", async () => {
    const { app, owner } = await ready();
    app.services.reddit.feeds.set(FEED, [post("abc123", "A post", { minutesAgo: 30 })]);
    await gather(app);

    // The evening brief.json, through the legacy importer, as import-legacy.sh posts it.
    vi.setSystemTime(new Date("2026-11-14T19:20:00+03:00"));
    const imported = await app.request("POST", "/api/editions/legacy", { body: legacyToday(), token: app.ingestToken });
    expect(imported.status, imported.text).toBe(200);
    const evening = await briefIds(owner);
    expect(evening).toContain("reddit-abc123");
    expect(evening.filter((id) => !id.startsWith("reddit-")).length).toBeGreaterThan(10);

    // Posting the same Edition again changes nothing.
    await app.request("POST", "/api/editions/legacy", { body: legacyToday(), token: app.ingestToken });
    expect(await briefIds(owner)).toEqual(evening);

    // A later run adds to the evening Edition's Items without removing any.
    app.services.reddit.feeds.set(FEED, [post("abc124", "A newer post", { minutesAgo: 5 }), post("abc123", "A post", { minutesAgo: 730 })]);
    expect((await gather(app)).body.kept).toEqual(["reddit-abc124"]);
    const after = await briefIds(owner);
    expect(after).toEqual(expect.arrayContaining([...evening, "reddit-abc124"]));
    expect(after).toHaveLength(evening.length + 1);
  });

  it("an Edition v3 posted later keeps them too", async () => {
    const { app, owner } = await ready();
    app.services.reddit.feeds.set(FEED, [post("abc123", "A post")]);
    await gather(app);

    const later = morningEdition();
    later.edition_id = "2026-11-14-evening";
    later.kind = "evening";
    later.generated_at = "2026-11-14T19:15:00+03:00";
    expect((await app.postEdition(later)).status).toBe(200);

    expect(await briefIds(owner)).toContain("reddit-abc123");
  });
});

describe("Owner only", () => {
  it("other Readers never see these Items, in the Brief, Search or Reactions", async () => {
    const { app, owner } = await ready();
    const sara = await app.addReader("sara@example.com"); // follows (and opted into) everything she can
    app.services.reddit.feeds.set(FEED, [post("abc123", "Unmistakable midnight post")]);
    await gather(app);

    expect(await briefIds(owner)).toContain("reddit-abc123");
    expect(await briefIds(sara)).not.toContain("reddit-abc123");
    expect(JSON.stringify((await sara.request("GET", "/api/brief")).body)).not.toMatch(/reddit-|adult-trending|examplesub/);
    expect((await sara.request("GET", "/api/search?q=unmistakable")).body.results).toEqual([]);
    expect((await owner.request("GET", "/api/search?q=unmistakable")).body.results.map((r: { id: string }) => r.id)).toEqual([
      "reddit-abc123",
    ]);
    expect((await sara.request("POST", "/api/items/reddit-abc123/reactions", { body: { kind: "like" } })).status).toBe(404);
  });
});
