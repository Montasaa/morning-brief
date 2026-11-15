// Pipeline v3 (ticket 19): the gathering tool turns the agent's drafts into an
// Edition and posts it. Tested from outside: the tool runs as its own program
// against the test app served on 127.0.0.1, and what it did is checked through
// the files it writes, its output and the app's web API.
import { readdirSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { Ajv2020 } from "ajv/dist/2020.js";
import addFormatsModule from "ajv-formats";
import { afterEach, describe, expect, it } from "vitest";
import { draftItem, repoRoot, runTool, scratchDir, serveApp, type Served } from "../support/pipeline-v3";
import { startTestApp, type TestApp, type TestSession } from "../support/test-app";

const schema = JSON.parse(readFileSync(path.join(repoRoot, "schema", "edition.v3.schema.json"), "utf8"));
const addFormats = addFormatsModule as unknown as (ajv: Ajv2020) => Ajv2020;
const validateSchema = addFormats(new Ajv2020({ allErrors: true, strict: true })).compile(schema);

const MORNING = "2026-11-14T06:05:00+03:00";
const EVENING = "2026-11-14T19:20:00+03:00";

const cleanups: (() => unknown)[] = [];
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!();
});

/** A test app served over HTTP, with one Reader (the Owner) following (or opted into) exactly `topics`. */
async function stagingApp(topics: string[]): Promise<{ app: TestApp; served: Served; reader: TestSession }> {
  const app = await startTestApp();
  const reader = await app.signInAsOwner({ onboarded: false });
  // Sensitive Topics are opted into from the Me tab, never picked in onboarding.
  const sensitive = ["graphic", "adult-trending"];
  const picked = topics.filter((t) => !sensitive.includes(t));
  const onboarded = await reader.request("PATCH", "/api/me", { body: { topics: picked, onboarded: true } });
  expect(onboarded.status).toBe(200);
  for (const topic of topics.filter((t) => sensitive.includes(t))) {
    const optIn = await reader.request("POST", `/api/topics/${topic}/follow`, { body: { age_confirmed: true } });
    expect(optIn.status).toBe(200);
  }
  const served = await serveApp(app);
  cleanups.push(() => served.close());
  return { app, served, reader };
}

function scratch() {
  const s = scratchDir();
  cleanups.push(() => s.cleanup());
  return s;
}

function runArgs(s: ReturnType<typeof scratch>, served: Served, kind: string, generatedAt: string, drafts: string) {
  return [
    "run",
    "--app-url", served.appUrl,
    "--drafts", drafts,
    "--state-dir", path.join(s.dir, "state"),
    "--kind", kind,
    "--generated-at", generatedAt,
    "--out", path.join(s.dir, `edition.${kind}.json`),
    // The drafts' links are on example.com: only the link-check test checks links (on 127.0.0.1).
    "--no-link-check",
  ];
}

describe("a gathering run", () => {
  it("posts an Edition that passes the v3 schema and that ingest accepts", async () => {
    const { app, served, reader } = await stagingApp(["yemen", "ai"]);
    const s = scratch();
    const drafts = s.write("drafts.json", {
      items: [draftItem("yemen-port-talks", ["yemen"]), draftItem("ai-new-model", ["ai"])],
      threads: [],
      widgets: {},
    });

    const run = await runTool(runArgs(s, served, "morning", MORNING, drafts), { INGEST_TOKEN: app.ingestToken });

    expect(run.stderr).toBe("");
    expect(run.code).toBe(0);
    const edition = s.read("edition.morning.json");
    expect(validateSchema(edition), JSON.stringify(validateSchema.errors)).toBe(true);
    expect(edition).toMatchObject({ edition_id: "2026-11-14-morning", kind: "morning", generated_at: MORNING });
    expect(run.stdout).toMatch(/accepted/i);

    const brief = await reader.request("GET", "/api/brief");
    expect(brief.body.items.map((i: { id: string }) => i.id).sort()).toEqual(["ai-new-model", "yemen-port-talks"]);
    expect(brief.body.items.every((i: { status: string }) => i.status === "new")).toBe(true);
  });

  it("covers every Topic on the gathering list, and stops before posting when one is missing", async () => {
    const { app, served, reader } = await stagingApp(["yemen", "ai", "liverpool"]);
    const s = scratch();
    const items = [draftItem("yemen-port-talks", ["yemen"]), draftItem("ai-new-model", ["ai"])];
    const uncovered = s.write("uncovered.json", { items, threads: [], widgets: {} });

    const refused = await runTool(runArgs(s, served, "morning", MORNING, uncovered), { INGEST_TOKEN: app.ingestToken });

    expect(refused.code).not.toBe(0);
    expect(refused.stderr).toMatch(/liverpool/);
    expect(served.calls).not.toContain("POST /brief/api/editions");
    expect((await reader.request("GET", "/api/brief")).body.items).toEqual([]);

    // A Topic with nothing that qualifies is covered by saying so.
    const nothing = s.write("nothing.json", {
      items,
      threads: [],
      widgets: {},
      nothing_found: { liverpool: "No Liverpool news since the last run." },
    });
    const run = await runTool(runArgs(s, served, "morning", MORNING, nothing), { INGEST_TOKEN: app.ingestToken });
    expect(run.stderr).toBe("");
    expect(run.code).toBe(0);
    expect(run.stdout).toMatch(/liverpool.*nothing/i);
  });

  it("does not gather Topics nobody follows", async () => {
    const { app, served } = await stagingApp(["yemen"]);
    const s = scratch();
    const drafts = s.write("drafts.json", {
      items: [
        draftItem("yemen-port-talks", ["yemen", "saudi"]),
        draftItem("markets-fed-day", ["us-markets"]),
      ],
      threads: [],
      widgets: {
        next_match: { team: "Liverpool", opponent: "Example Town", competition: "Premier League", kickoff: "2026-11-15T18:00:00+03:00" },
        countdowns: [
          { label: "Example Corp earnings", label_ar: "أرباح شركة مثال", at: "2026-11-19T23:00:00+03:00", topic: "us-markets" },
          { label: "Yemen talks deadline", label_ar: "موعد محادثات اليمن", at: "2026-11-20T12:00:00+03:00", topic: "yemen" },
        ],
      },
    });

    const run = await runTool(runArgs(s, served, "morning", MORNING, drafts), { INGEST_TOKEN: app.ingestToken });

    expect(run.stderr).toBe("");
    expect(run.code).toBe(0);
    const edition = s.read("edition.morning.json");
    expect(edition.items.map((i: { id: string; topics: string[] }) => [i.id, i.topics])).toEqual([["yemen-port-talks", ["yemen"]]]);
    expect(edition.widgets).toEqual({
      countdowns: [{ label: "Yemen talks deadline", label_ar: "موعد محادثات اليمن", at: "2026-11-20T12:00:00+03:00", topic: "yemen" }],
    });
    expect(run.stdout).toMatch(/markets-fed-day/);
  });

  it("carries the morning's Items into the evening Edition, marking new and updated ones", async () => {
    const { app, served, reader } = await stagingApp(["yemen", "ai", "liverpool", "github-trending"]);
    const s = scratch();
    const env = { INGEST_TOKEN: app.ingestToken };
    const morning = s.write("morning.json", {
      items: [
        draftItem("yemen-port-talks", ["yemen"]),
        draftItem("ai-new-model", ["ai"]),
        draftItem("lfc-fitness", ["liverpool"]),
        draftItem("gh-terminal-agent", ["github-trending"]),
      ],
      threads: [],
      widgets: {},
    });
    expect((await runTool(runArgs(s, served, "morning", MORNING, morning), env)).code).toBe(0);

    const evening = s.write("evening.json", {
      items: [
        draftItem("ai-new-model", ["ai"], { summary: "The model now also tops the maths leaderboard." }),
        draftItem("gh-terminal-agent", ["github-trending"]),
        draftItem("lfc-team-news", ["liverpool"]),
      ],
      threads: [],
      widgets: {},
      drop: ["lfc-fitness"],
    });
    const run = await runTool(runArgs(s, served, "evening", EVENING, evening), env);

    expect(run.stderr).toBe("");
    expect(run.code).toBe(0);
    const edition = s.read("edition.evening.json");
    expect(edition.edition_id).toBe("2026-11-14-evening");
    const statuses = Object.fromEntries(edition.items.map((i: { id: string; status: string }) => [i.id, i.status]));
    expect(statuses).toEqual({
      "ai-new-model": "updated",
      "gh-terminal-agent": "",
      "lfc-team-news": "new",
      "yemen-port-talks": "",
    });

    const brief = await reader.request("GET", "/api/brief");
    expect(brief.body.edition.id).toBe("2026-11-14-evening");
    expect(brief.body.items.map((i: { id: string }) => i.id).sort()).toEqual(Object.keys(statuses).sort());
  });
});

describe("the house rules", () => {
  it("put independent outlets first, with official and state sources only after them", async () => {
    const { app, served } = await stagingApp(["saudi"]);
    const s = scratch();
    const drafts = s.write("drafts.json", {
      items: [
        draftItem("saudi-budget", ["saudi"], {
          sources: [
            { title: "Saudi Press Agency", url: "https://example.com/spa/budget", type: "official" },
            { title: "Example Daily", url: "https://example.com/daily/budget", type: "independent" },
          ],
        }),
      ],
      threads: [],
      widgets: {},
    });

    const run = await runTool(runArgs(s, served, "morning", MORNING, drafts), { INGEST_TOKEN: app.ingestToken });

    expect(run.code).toBe(0);
    expect(s.read("edition.morning.json").items[0].sources.map((x: { type: string }) => x.type)).toEqual(["independent", "official"]);
  });

  it("refuse an Item with no picture, no Arabic, or a Sensitive Topic without its warning", async () => {
    const { app, served } = await stagingApp(["yemen", "graphic"]);
    const s = scratch();
    const noImage = draftItem("yemen-no-image", ["yemen"]);
    delete noImage.image;
    const noArabic = draftItem("yemen-no-arabic", ["yemen"]);
    delete noArabic.summary_ar;
    const drafts = s.write("drafts.json", {
      items: [noImage, noArabic, draftItem("graphic-no-warning", ["graphic"])],
      threads: [],
      widgets: {},
    });

    const run = await runTool(runArgs(s, served, "morning", MORNING, drafts), { INGEST_TOKEN: app.ingestToken });

    expect(run.code).not.toBe(0);
    expect(run.stderr).toMatch(/yemen-no-image.*image/);
    expect(run.stderr).toMatch(/yemen-no-arabic.*summary_ar/);
    expect(run.stderr).toMatch(/graphic-no-warning.*warning/);
    expect(served.calls).not.toContain("POST /brief/api/editions");
  });
});

describe("graded pictures and sentence-case headlines (rework ticket 10)", () => {
  it("require image_kind on every drafted Item, and pass it to the app", async () => {
    const { app, served, reader } = await stagingApp(["ai", "github-trending"]);
    const s = scratch();
    const ungraded = draftItem("ai-ungraded", ["ai"]);
    delete ungraded.image_kind;
    const wrong = draftItem("ai-wrong-kind", ["ai"], { image_kind: "logo" });
    const refused = await runTool(
      runArgs(s, served, "morning", MORNING, s.write("bad.json", { items: [ungraded, wrong], threads: [], widgets: {} })),
      { INGEST_TOKEN: app.ingestToken },
    );
    expect(refused.code).not.toBe(0);
    expect(refused.stderr).toMatch(/ai-ungraded.*image_kind/);
    expect(refused.stderr).toMatch(/ai-wrong-kind.*image_kind/);
    expect(served.calls).not.toContain("POST /brief/api/editions");

    const drafts = s.write("drafts.json", {
      items: [
        draftItem("ai-new-model", ["ai"]),
        draftItem("gh-example-repo", ["github-trending"], { image_kind: "card" }),
        // No usable picture: graded none, and then no image is needed.
        { ...draftItem("ai-no-picture", ["ai"], { image_kind: "none" }), image: undefined },
      ],
      threads: [],
      widgets: {},
    });
    const run = await runTool(runArgs(s, served, "morning", MORNING, drafts), { INGEST_TOKEN: app.ingestToken });

    expect(run.stderr).toBe("");
    expect(run.code).toBe(0);
    const brief = (await reader.request("GET", "/api/brief")).body.items as { id: string; image_kind: string }[];
    expect(Object.fromEntries(brief.map((i) => [i.id, i.image_kind]))).toEqual({
      "ai-new-model": "photo",
      "gh-example-repo": "card",
      "ai-no-picture": "none",
    });
  });

  it("warn about an all-lowercase headline, without stopping the run", async () => {
    const { app, served } = await stagingApp(["ai"]);
    const s = scratch();
    const drafts = s.write("drafts.json", {
      items: [
        draftItem("ai-lowercase", ["ai"], { title: "a new placeholder model ships today" }),
        draftItem("ai-sentence-case", ["ai"], { title: "A new placeholder model from Example Labs" }),
      ],
      threads: [],
      widgets: {},
    });

    const run = await runTool(runArgs(s, served, "morning", MORNING, drafts), { INGEST_TOKEN: app.ingestToken });

    expect(run.code).toBe(0);
    expect(run.stdout).toMatch(/warning: ai-lowercase.*lowercase.*sentence case/i);
    expect(run.stdout).not.toMatch(/warning: ai-sentence-case/);
  });
});

describe("Adult Trending from Reddit (rework ticket 10)", () => {
  const reddit = (post: string) => ({
    title: "r/placeholder",
    url: `https://www.reddit.com/r/placeholder/comments/${post}/placeholder_post/`,
    type: "social",
  });
  const outlet = (name: string) => ({ title: "Example Daily", url: `https://example.com/news/${name}`, type: "independent" });
  const adult = (id: string, extra: Record<string, unknown>) =>
    draftItem(id, ["adult-trending"], { warning: "Adult content", warning_ar: "محتوى للبالغين", ...extra });

  it("keeps Reddit posts (one outlet allowed as the second source), drops the rest, and passes nsfw_media through", async () => {
    const { app, served, reader } = await stagingApp(["ai", "adult-trending"]);
    const s = scratch();
    const drafts = s.write("drafts.json", {
      items: [
        draftItem("ai-new-model", ["ai"]),
        adult("adult-reddit-post", { sources: [reddit("a1")], nsfw_media: true }),
        adult("adult-with-outlet", { sources: [reddit("a2"), outlet("a2")] }),
        adult("adult-outlet-first", { sources: [outlet("a3"), reddit("a3")] }),
        adult("adult-outlet-only", { sources: [outlet("a4")] }),
        adult("adult-two-outlets", { sources: [reddit("a5"), outlet("a5"), outlet("a5b")] }),
        adult("adult-other-social", { sources: [{ title: "Example Social", url: "https://example.com/social/a6", type: "social" }] }),
      ],
      threads: [],
      widgets: {},
    });

    const run = await runTool(runArgs(s, served, "morning", MORNING, drafts), { INGEST_TOKEN: app.ingestToken });

    expect(run.stderr).toBe("");
    expect(run.code).toBe(0);
    for (const id of ["adult-outlet-only", "adult-two-outlets", "adult-other-social"]) {
      expect(run.stdout).toMatch(new RegExp(`left out ${id}: .*Reddit`));
    }
    const edition = s.read("edition.morning.json");
    const byId = Object.fromEntries(edition.items.map((i: { id: string }) => [i.id, i]));
    expect(Object.keys(byId).sort()).toEqual(["adult-outlet-first", "adult-reddit-post", "adult-with-outlet", "ai-new-model"]);
    // The Reddit post is the card link: it leads, the outlet report follows.
    expect(byId["adult-outlet-first"].sources.map((x: { url: string }) => new URL(x.url).hostname)).toEqual(["www.reddit.com", "example.com"]);
    expect(byId["adult-reddit-post"].nsfw_media).toBe(true);

    const brief = (await reader.request("GET", "/api/brief")).body.items as { id: string; media_blurred: boolean }[];
    expect(brief.find((i) => i.id === "adult-reddit-post")!.media_blurred).toBe(true);
    expect(brief.find((i) => i.id === "adult-with-outlet")!.media_blurred).toBe(false);
  });

  it("drops any Item making a claim about a named person without a non-Reddit outlet report", async () => {
    const { app, served } = await stagingApp(["ai", "adult-trending"]);
    const s = scratch();
    const claim = { claim_subject: "A Placeholder Person" };
    const drafts = s.write("drafts.json", {
      items: [
        draftItem("ai-claim-reported", ["ai"], claim),
        draftItem("ai-claim-social-only", ["ai"], { ...claim, sources: [reddit("c1"), { title: "Example Social", url: "https://example.com/social/c1", type: "social" }] }),
        adult("adult-claim-reddit-only", { ...claim, sources: [reddit("c2")] }),
        adult("adult-claim-reported", { ...claim, sources: [reddit("c3"), outlet("c3")] }),
      ],
      threads: [],
      widgets: {},
    });

    const run = await runTool(runArgs(s, served, "morning", MORNING, drafts), { INGEST_TOKEN: app.ingestToken });

    expect(run.stderr).toBe("");
    expect(run.code).toBe(0);
    expect(run.stdout).toMatch(/left out ai-claim-social-only: .*claim/);
    expect(run.stdout).toMatch(/left out adult-claim-reddit-only: .*claim/);
    const ids = s.read("edition.morning.json").items.map((i: { id: string }) => i.id).sort();
    expect(ids).toEqual(["adult-claim-reported", "ai-claim-reported"]);
  });
});

describe("checking links", () => {
  it("leaves out sources, pictures and links that do not load before posting", async () => {
    const { app, served } = await stagingApp(["yemen", "ai"]);
    const web = await serveStatuses();
    const s = scratch();
    const ok = (p: string) => `${web.origin}/ok/${p}`;
    const broken = (p: string) => `${web.origin}/missing/${p}`;
    const drafts = s.write("drafts.json", {
      items: [
        draftItem("yemen-one-source-broken", ["yemen"], {
          image: ok("a.jpg"),
          sources: [
            { title: "Gone Daily", url: broken("a"), type: "independent" },
            { title: "Example Wire", url: ok("a"), type: "wire" },
          ],
        }),
        draftItem("yemen-image-broken", ["yemen"], { image: broken("b.jpg"), sources: [{ title: "Example Wire", url: ok("b"), type: "wire" }] }),
        draftItem("yemen-sources-broken", ["yemen"], { image: ok("c.jpg"), sources: [{ title: "Gone Daily", url: broken("c"), type: "independent" }] }),
        draftItem("ai-try-broken", ["ai"], {
          image: ok("d.jpg"),
          sources: [{ title: "Example Tech", url: ok("d"), type: "independent" }],
          kind: "TOOL",
          try_url: broken("try"),
        }),
        draftItem("ai-bot-wall", ["ai"], { image: ok("e.jpg"), sources: [{ title: "Walled Daily", url: `${web.origin}/forbidden/e`, type: "independent" }] }),
      ],
      threads: [],
      widgets: {},
    });

    const args = runArgs(s, served, "morning", MORNING, drafts).filter((a) => a !== "--no-link-check");
    const run = await runTool(args, { INGEST_TOKEN: app.ingestToken });

    expect(run.stderr).toBe("");
    expect(run.code).toBe(0);
    const items = s.read("edition.morning.json").items as Record<string, any>[];
    expect(items.map((i) => i.id)).toEqual(["yemen-one-source-broken", "ai-try-broken", "ai-bot-wall"]);
    expect(items[0]!.sources.map((x: { url: string }) => x.url)).toEqual([ok("a")]);
    expect(items[1]).not.toHaveProperty("try_url");
    expect(run.stdout).toMatch(/yemen-image-broken/);
    expect(run.stdout).toMatch(/yemen-sources-broken/);
    expect(run.stdout).toMatch(/unverified.*forbidden\/e/);
  });
});

describe("Saudi TikTok trends", () => {
  const trends = (notes: string[] = []) => ({
    generated_at: "2026-11-14T05:30:00+03:00",
    region: "SA",
    period_days: 7,
    items: [
      { name: "#riyadhseason", kind: "hashtag", rank: 1, metric: "12K posts, 3M views", url: "https://www.tiktok.com/tag/riyadhseason", image: "https://example.com/tt/1.jpg", creator: null },
      { name: "#noimage", kind: "hashtag", rank: 2, metric: "", url: "https://www.tiktok.com/tag/noimage", image: null, creator: null },
    ],
    notes,
  });

  it("become Social Trends Items in the Edition", async () => {
    const { app, served, reader } = await stagingApp(["yemen", "social-trends"]);
    const s = scratch();
    const drafts = s.write("drafts.json", { items: [draftItem("yemen-port-talks", ["yemen"])], threads: [], widgets: {} });
    const tiktok = s.write("tiktok_trends.json", trends());

    const run = await runTool([...runArgs(s, served, "morning", MORNING, drafts), "--tiktok", tiktok], { INGEST_TOKEN: app.ingestToken });

    expect(run.stderr).toBe("");
    expect(run.code).toBe(0);
    const tt = s.read("edition.morning.json").items.filter((i: { topics: string[] }) => i.topics.includes("social-trends"));
    expect(tt).toHaveLength(1);
    expect(tt[0]).toMatchObject({
      id: "tt-hashtag-riyadhseason",
      topics: ["social-trends"],
      platform: "tiktok",
      metric: "12K posts, 3M views",
      image: "https://example.com/tt/1.jpg",
      time: "2026-11-14T05:30:00+03:00",
    });
    expect(tt[0].title).toMatch(/#riyadhseason.*#1.*TikTok.*Saudi/);
    expect(tt[0].title_ar).toMatch(/#riyadhseason/);
    expect(tt[0].sources[0].url).toBe("https://www.tiktok.com/tag/riyadhseason");
    expect(run.stdout).toMatch(/#noimage/);
    const brief = await reader.request("GET", "/api/brief");
    expect(brief.body.items.map((i: { id: string }) => i.id)).toContain("tt-hashtag-riyadhseason");
  });

  it("are left out when the scrape did not switch to Saudi Arabia", async () => {
    const { app, served } = await stagingApp(["social-trends"]);
    const s = scratch();
    const drafts = s.write("drafts.json", {
      items: [draftItem("social-viral-clip", ["social-trends"])],
      threads: [],
      widgets: {},
    });
    const tiktok = s.write("tiktok_trends.json", trends(["WARNING: region did not switch to Saudi Arabia"]));

    const run = await runTool([...runArgs(s, served, "morning", MORNING, drafts), "--tiktok", tiktok], { INGEST_TOKEN: app.ingestToken });

    expect(run.code).toBe(0);
    expect(s.read("edition.morning.json").items.map((i: { id: string }) => i.id)).toEqual(["social-viral-clip"]);
    expect(run.stdout).toMatch(/TikTok.*Saudi/i);
  });
});

describe("Story Threads across Editions", () => {
  it("keep their ids, and a new development is a new Item on the Thread", async () => {
    const { app, served, reader } = await stagingApp(["yemen"]);
    const s = scratch();
    const env = { INGEST_TOKEN: app.ingestToken };
    const morning = s.write("morning.json", {
      items: [draftItem("yemen-port-talks", ["yemen"], { thread_id: "yemen-truce-talks" })],
      threads: [{ id: "yemen-truce-talks", title: "Yemen truce talks", title_ar: "محادثات الهدنة في اليمن" }],
      widgets: {},
    });
    expect((await runTool(runArgs(s, served, "morning", MORNING, morning), env)).code).toBe(0);

    // The evening's gatherer names the same Thread with another slug.
    const evening = s.write("evening.json", {
      items: [draftItem("yemen-deal-signed", ["yemen"], { thread_id: "yemen-truce", time: "2026-11-14T18:30:00+03:00" })],
      threads: [{ id: "yemen-truce", title: "Yemen Truce Talks", title_ar: "محادثات الهدنة في اليمن" }],
      widgets: {},
    });
    const run = await runTool(runArgs(s, served, "evening", EVENING, evening), env);

    expect(run.stderr).toBe("");
    expect(run.code).toBe(0);
    const edition = s.read("edition.evening.json");
    expect(edition.threads.map((t: { id: string }) => t.id)).toEqual(["yemen-truce-talks"]);
    expect(edition.items.map((i: { id: string; thread_id: string; status: string }) => [i.id, i.thread_id, i.status])).toEqual([
      ["yemen-deal-signed", "yemen-truce-talks", "new"],
      ["yemen-port-talks", "yemen-truce-talks", ""],
    ]);
    expect(run.stdout).toMatch(/yemen-truce\b.*yemen-truce-talks/);

    // Before the next run, the gatherer looks up the Threads and Items already published.
    const context = await runTool(["context", "--state-dir", path.join(s.dir, "state")]);
    expect(context.code).toBe(0);
    expect(context.stdout).toMatch(/yemen-truce-talks.*Yemen truce talks/i);
    expect(context.stdout).toMatch(/2026-11-14-evening/);
    expect(context.stdout).toMatch(/yemen-deal-signed/);

    const threads = await reader.request("GET", "/api/threads");
    expect(threads.body.threads.map((t: { id: string }) => t.id)).toEqual(["yemen-truce-talks"]);
    const timeline = await reader.request("GET", "/api/threads/yemen-truce-talks");
    expect(timeline.body.items.map((i: { id: string }) => i.id)).toEqual(["yemen-deal-signed", "yemen-port-talks"]);
  });

  it("refuses an earlier Item's id moved to another Story Thread: a new development needs a new id", async () => {
    const { app, served } = await stagingApp(["yemen"]);
    const s = scratch();
    const env = { INGEST_TOKEN: app.ingestToken };
    const morning = s.write("morning.json", {
      items: [draftItem("yemen-port-talks", ["yemen"], { thread_id: "yemen-truce-talks" })],
      threads: [{ id: "yemen-truce-talks", title: "Yemen truce talks", title_ar: "محادثات الهدنة في اليمن" }],
      widgets: {},
    });
    expect((await runTool(runArgs(s, served, "morning", MORNING, morning), env)).code).toBe(0);

    const evening = s.write("evening.json", {
      items: [draftItem("yemen-port-talks", ["yemen"], { thread_id: "hodeidah-port" })],
      threads: [{ id: "hodeidah-port", title: "Hodeidah port", title_ar: "ميناء الحديدة" }],
      widgets: {},
    });
    const run = await runTool(runArgs(s, served, "evening", EVENING, evening), env);

    expect(run.code).not.toBe(0);
    expect(run.stderr).toMatch(/yemen-port-talks/);
    expect(served.calls.filter((c) => c === "POST /brief/api/editions")).toHaveLength(1);
  });
});

describe("the ingest token", () => {
  it("comes only from the environment and never appears in the run's output or files", async () => {
    const { app, served } = await stagingApp(["yemen"]);
    const s = scratch();
    const drafts = s.write("drafts.json", { items: [draftItem("yemen-port-talks", ["yemen"])], threads: [], widgets: {} });
    const args = runArgs(s, served, "morning", MORNING, drafts);

    const unset = await runTool(args);
    expect(unset.code).not.toBe(0);
    expect(unset.stderr).toMatch(/INGEST_TOKEN is not set/);
    expect(served.calls).toEqual([]);

    const wrong = await runTool(args, { INGEST_TOKEN: "wrong-secret-value" });
    expect(wrong.code).not.toBe(0);
    expect(wrong.stderr).toMatch(/401/);
    expect(wrong.stdout + wrong.stderr).not.toContain("wrong-secret-value");

    const ok = await runTool(args, { INGEST_TOKEN: app.ingestToken });
    expect(ok.code).toBe(0);
    expect(ok.stdout + ok.stderr).not.toContain(app.ingestToken);
    const written = readdirRecursive(s.dir).map((f) => readFileSync(f, "utf8")).join("\n");
    expect(written).not.toContain(app.ingestToken);
    expect(written).toContain("yemen-port-talks"); // the files were read
  });
});

function readdirRecursive(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? readdirRecursive(path.join(dir, e.name)) : [path.join(dir, e.name)],
  );
}

/** A tiny web on 127.0.0.1: /ok/... answers 200, /forbidden/... 403 (a bot wall), anything else 404. */
async function serveStatuses(): Promise<{ origin: string }> {
  const server = createServer((req, res) => {
    const url = req.url ?? "/";
    const status = url.startsWith("/ok/") ? 200 : url.startsWith("/forbidden/") ? 403 : 404;
    res.writeHead(status, { "content-type": "text/plain" }).end(req.method === "HEAD" ? undefined : "x");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  cleanups.push(() => new Promise<void>((resolve) => server.close(() => resolve())));
  return { origin: `http://127.0.0.1:${(server.address() as AddressInfo).port}` };
}

describe("the local dry run", () => {
  it("posts a sample morning and evening Edition to a staging app, both accepted", async () => {
    const app = await startTestApp();
    const owner = await app.signInAsOwner(); // follows every Catalog Topic
    const created = await owner.request("POST", "/api/topics", { body: { name: "Formula 1" } });
    expect(created.status).toBe(201);
    const served = await serveApp(app);
    cleanups.push(() => served.close());
    const s = scratch();

    const run = await runTool(["dry-run", "--app-url", served.appUrl, "--out-dir", s.dir], { INGEST_TOKEN: app.ingestToken });

    expect(run.stderr).toBe("");
    expect(run.code).toBe(0);
    expect(run.stdout.match(/^accepted: /gm)).toHaveLength(2);
    expect(run.stdout).toMatch(/formula-1.*no sample Items/i);
    expect(served.calls.filter((c) => c === "POST /brief/api/editions")).toHaveLength(2);

    const files = readdirSync(s.dir).filter((f) => /^edition\..*\.json$/.test(f)).sort();
    expect(files).toHaveLength(2);
    const [evening, morning] = files.map((f) => s.read(f));
    for (const edition of [morning, evening]) {
      expect(validateSchema(edition), JSON.stringify(validateSchema.errors)).toBe(true);
    }
    expect([morning.kind, evening.kind]).toEqual(["morning", "evening"]);

    // The evening Edition is complete: the morning's Items still current are carried over.
    const eveningIds = evening.items.map((i: { id: string }) => i.id);
    for (const item of morning.items) {
      if (item.id !== "sample-lfc-midfielder-fitness") expect(eveningIds).toContain(item.id);
    }
    const brief = await owner.request("GET", "/api/brief");
    expect(brief.body.edition.id).toBe(evening.edition_id);
    const thread = await owner.request("GET", "/api/threads/sample-yemen-truce-talks");
    expect(thread.body.items.map((i: { id: string }) => i.id)).toEqual(["sample-yemen-deal-signed", "sample-yemen-port-talks"]);
  });
});

