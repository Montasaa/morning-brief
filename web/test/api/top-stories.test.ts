// Top stories and why-lines (ticket 13). After each Edition is ingested,
// Claude picks 1–3 top stories for every Reader from their own ranked Brief and
// writes a "why this matters to you" line in English and Arabic for each. They
// lead the Brief with the "Top for you" badge. Only the Reader's own followed,
// non-hidden Items can be top stories. When Claude fails, the highest-scored
// Items lead instead, without why-lines.
import { describe, expect, it } from "vitest";
import type { ClaudeRequest } from "@/server/outside";
import { legacyToday, morningEdition, type EditionDoc } from "../support/fixtures";
import { startTestApp, type TestApp, type TestSession } from "../support/test-app";

const PURPOSE = "top-picks";

type BriefItem = { id: string; top: boolean; why_for_you: string | null; why_for_you_ar: string | null };
type Brief = { items: BriefItem[]; groups: { kind: string; topic: string | null; item_ids: string[] }[] };

type Pick = { item: string; why?: string; why_ar?: string };

/** Make the fake Claude answer every top-picks request with these picks, as JSON. */
function claudePicks(app: TestApp, picks: Pick[] | ((req: ClaudeRequest) => Pick[])) {
  app.services.claude.replies.set(PURPOSE, (req) => ({
    text: JSON.stringify({ top_stories: typeof picks === "function" ? picks(req) : picks }),
  }));
}

const pickCalls = (app: TestApp): ClaudeRequest[] => app.services.claude.calls.filter((c) => c.purpose === PURPOSE);
const promptOf = (req: ClaudeRequest): string => [req.system ?? "", ...req.messages.map((m) => m.content)].join("\n");

async function briefOf(session: TestSession): Promise<Brief> {
  const res = await session.request("GET", "/api/brief");
  expect(res.status, res.text).toBe(200);
  return res.body as Brief;
}
const ids = (brief: Brief) => brief.items.map((i) => i.id);
const tops = (brief: Brief) => brief.items.filter((i) => i.top).map((i) => i.id);

/** The morning fixture without the Edition's own (fallback) top stories. */
function morningWithoutTops(): EditionDoc {
  const edition = morningEdition();
  delete edition.top_stories;
  return edition;
}

/** A Reader who exists before the Edition arrives, following exactly `topics`. */
async function readerFollowing(app: TestApp, email: string, topics: string[]): Promise<TestSession> {
  const session = await app.addReader(email, { onboarded: false });
  const res = await session.request("PATCH", "/api/me", { body: { topics, onboarded: true } });
  expect(res.status, res.text).toBe(200);
  return session;
}

describe("after an Edition is ingested", () => {
  it("leads each Reader's Brief with Claude's top stories, badged, with why-lines in English and Arabic", async () => {
    const app = await startTestApp();
    const owner = await app.signInAsOwner();
    claudePicks(app, [
      { item: "lfc-midfielder-fitness", why: "You never miss a Liverpool match.", why_ar: "لا تفوّت أي مباراة لليفربول." },
      { item: "ai-open-model-release", why: "You follow AI closely.", why_ar: "تتابع الذكاء الاصطناعي عن قرب." },
    ]);

    const posted = await app.postEdition(morningWithoutTops());
    expect(posted.status, posted.text).toBe(200);
    const brief = await briefOf(owner);

    expect(ids(brief).slice(0, 2)).toEqual(["lfc-midfielder-fitness", "ai-open-model-release"]);
    expect(brief.items[0]).toMatchObject({
      top: true,
      why_for_you: "You never miss a Liverpool match.",
      why_for_you_ar: "لا تفوّت أي مباراة لليفربول.",
    });
    expect(brief.items[1]).toMatchObject({
      top: true,
      why_for_you: "You follow AI closely.",
      why_for_you_ar: "تتابع الذكاء الاصطناعي عن قرب.",
    });
    expect(brief.items.slice(2).every((i) => !i.top && i.why_for_you === null && i.why_for_you_ar === null)).toBe(true);
    expect(brief.groups[0]).toEqual({
      kind: "top",
      topic: null,
      item_ids: ["lfc-midfielder-fitness", "ai-open-model-release"],
    });
    // Each Item still appears once: the top stories are not repeated in their Topic groups.
    expect(new Set(ids(brief)).size).toBe(5);
    expect(brief.groups.flatMap((g) => g.item_ids)).toHaveLength(5);
  });

  it("asks Claude once per Reader, offering only that Reader's own Items", async () => {
    const app = await startTestApp();
    const owner = await app.signInAsOwner();
    const sara = await readerFollowing(app, "sara@example.com", ["liverpool", "github-trending"]);
    claudePicks(app, (req) =>
      promptOf(req).includes("gh-terminal-agent")
        ? [{ item: "gh-terminal-agent", why: "You read code.", why_ar: "أنت تقرأ الشيفرة." }]
        : [{ item: "ai-open-model-release", why: "You follow AI.", why_ar: "تتابع الذكاء الاصطناعي." }],
    );

    await app.postEdition(morningWithoutTops());

    expect(pickCalls(app)).toHaveLength(2);
    const saraPrompt = pickCalls(app).map(promptOf).find((p) => !p.includes("ai-open-model-release"))!;
    expect(saraPrompt).toContain("lfc-midfielder-fitness");
    expect(saraPrompt).toContain("gh-terminal-agent");
    expect(saraPrompt).not.toContain("me-yemen-port-talks");
    expect(saraPrompt).not.toContain("graphic-flood-aftermath");

    const saraBrief = await briefOf(sara);
    expect(tops(saraBrief)).toEqual(["gh-terminal-agent"]);
    expect(saraBrief.items[0]!.why_for_you).toBe("You read code.");
    const ownerBrief = await briefOf(owner);
    expect(tops(ownerBrief)).toEqual(["gh-terminal-agent"]);
  });

  it("gives every Reader their own top stories and why-lines", async () => {
    const app = await startTestApp();
    const owner = await app.signInAsOwner();
    const sara = await readerFollowing(app, "sara@example.com", ["liverpool", "ai"]);
    claudePicks(app, (req) =>
      promptOf(req).includes("me-yemen-port-talks")
        ? [{ item: "me-yemen-port-talks", why: "Owner's why.", why_ar: "سبب المالك." }]
        : [{ item: "ai-open-model-release", why: "Sara's why.", why_ar: "سبب سارة." }],
    );

    await app.postEdition(morningWithoutTops());

    const ownerBrief = await briefOf(owner);
    const saraBrief = await briefOf(sara);
    expect(tops(ownerBrief)).toEqual(["me-yemen-port-talks"]);
    expect(ownerBrief.items[0]!.why_for_you).toBe("Owner's why.");
    expect(tops(saraBrief)).toEqual(["ai-open-model-release"]);
    expect(saraBrief.items[0]).toMatchObject({ why_for_you: "Sara's why.", why_for_you_ar: "سبب سارة." });
    // The same Item is not a top story (and has no why-line) for the other Reader.
    expect(ownerBrief.items.find((i) => i.id === "ai-open-model-release")).toMatchObject({
      top: false,
      why_for_you: null,
    });
  });

  it("keeps at most 3 top stories, in Claude's order, each once", async () => {
    const app = await startTestApp();
    const owner = await app.signInAsOwner();
    claudePicks(app, [
      { item: "gh-terminal-agent", why: "One." },
      { item: "gh-terminal-agent", why: "Again." },
      { item: "ai-open-model-release", why: "Two." },
      { item: "lfc-midfielder-fitness", why: "Three." },
      { item: "me-yemen-port-talks", why: "Four." },
    ]);

    await app.postEdition(morningWithoutTops());
    const brief = await briefOf(owner);

    expect(tops(brief)).toEqual(["gh-terminal-agent", "ai-open-model-release", "lfc-midfielder-fitness"]);
    expect(brief.items[0]!.why_for_you).toBe("One.");
    // Claude gave no Arabic line: the Brief has none (the UI shows the English one, as for any missing _ar field).
    expect(brief.items[0]!.why_for_you_ar).toBeNull();
  });
});

describe("top stories only come from the Reader's own Brief", () => {
  it("drops picks the Reader does not follow, cannot see, or that are not in the Edition", async () => {
    const app = await startTestApp();
    const sara = await readerFollowing(app, "sara@example.com", ["liverpool", "ai"]);
    claudePicks(app, [
      { item: "me-yemen-port-talks", why: "Not followed." },
      { item: "graphic-flood-aftermath", why: "Sensitive, not opted in." },
      { item: "made-up-item", why: "Not in the Edition." },
      { item: "ai-open-model-release", why: "Yours." },
    ]);

    await app.postEdition(morningWithoutTops());
    const brief = await briefOf(sara);

    expect(tops(brief)).toEqual(["ai-open-model-release"]);
    expect(ids(brief)).toEqual(["ai-open-model-release", "lfc-midfielder-fitness"]);
  });

  it("drops a top story the Reader hides or whose Topic they unfollow later", async () => {
    const app = await startTestApp();
    const owner = await app.signInAsOwner();
    claudePicks(app, [
      { item: "lfc-midfielder-fitness", why: "Liverpool." },
      { item: "ai-open-model-release", why: "AI." },
      { item: "gh-terminal-agent", why: "Code." },
    ]);
    await app.postEdition(morningWithoutTops());

    await owner.request("POST", "/api/items/ai-open-model-release/reactions", { body: { kind: "hide" } });
    await owner.request("POST", "/api/topics/github-trending/unfollow");
    const brief = await briefOf(owner);

    expect(tops(brief)).toEqual(["lfc-midfielder-fitness"]);
    expect(ids(brief)).not.toContain("ai-open-model-release");
    expect(ids(brief)).not.toContain("gh-terminal-agent");
  });

  it("does not ask Claude for a Reader whose Brief is empty", async () => {
    const app = await startTestApp();
    await app.addReader("new@example.com", { onboarded: false }); // follows nothing yet
    await readerFollowing(app, "markets@example.com", ["us-markets"]); // no US Markets Item in this Edition

    await app.postEdition(morningWithoutTops());

    // Only the Owner, who invited them (and follows every Topic), is asked about.
    expect(pickCalls(app)).toHaveLength(1);
    expect(promptOf(pickCalls(app)[0]!)).toContain("gh-terminal-agent");
  });
});

describe("when Claude fails", () => {
  it("leads with the highest-scored Items, without why-lines", async () => {
    const app = await startTestApp();
    const owner = await app.signInAsOwner();
    app.services.claude.failing.add(PURPOSE);

    const posted = await app.postEdition(morningWithoutTops());
    expect(posted.status).toBe(200);
    expect(posted.body.accepted).toBe(true);
    const brief = await briefOf(owner);

    // Newest first, "new" and "updated" lifted: the three best-scored Items.
    expect(tops(brief)).toEqual(["me-yemen-port-talks", "lfc-midfielder-fitness", "ai-open-model-release"]);
    expect(brief.items.every((i) => i.why_for_you === null && i.why_for_you_ar === null)).toBe(true);
    expect(brief.groups[0]!.kind).toBe("top");
  });

  it("does the same when Claude's answer cannot be read or picks nothing usable", async () => {
    const app = await startTestApp();
    const sara = await readerFollowing(app, "sara@example.com", ["liverpool", "ai", "github-trending"]);
    app.services.claude.replies.set(PURPOSE, { text: "I would pick the football one." });
    await app.postEdition(morningWithoutTops());
    expect(tops(await briefOf(sara))).toEqual(["lfc-midfielder-fitness", "ai-open-model-release", "gh-terminal-agent"]);

    const next = morningWithoutTops();
    next.edition_id = "2026-11-14-evening";
    next.kind = "evening";
    next.generated_at = "2026-11-14T19:20:00+03:00";
    claudePicks(app, [{ item: "me-yemen-port-talks", why: "Not followed." }]);
    await app.postEdition(next);
    expect(tops(await briefOf(sara))).toEqual(["lfc-midfielder-fitness", "ai-open-model-release", "gh-terminal-agent"]);
  });

  it("keeps the Scorer's top stories in step with the Reader's Reactions", async () => {
    const app = await startTestApp();
    const owner = await app.signInAsOwner();
    app.services.claude.failing.add(PURPOSE);
    await app.postEdition(morningWithoutTops());

    await owner.request("POST", "/api/items/lfc-midfielder-fitness/reactions", { body: { kind: "hide" } });

    // Never a sensitive Item (rework ticket 10): the Graphic flood story is passed over.
    expect(tops(await briefOf(owner))).toEqual(["me-yemen-port-talks", "ai-open-model-release", "gh-terminal-agent"]);
  });

  it("puts the Edition's own top stories first, then the highest-scored Items", async () => {
    const app = await startTestApp();
    const owner = await app.signInAsOwner();
    app.services.claude.failing.add(PURPOSE);

    await app.postEdition(morningEdition()); // top stories: me-yemen-port-talks, ai-open-model-release
    const brief = await briefOf(owner);

    expect(tops(brief)).toEqual(["me-yemen-port-talks", "ai-open-model-release", "lfc-midfielder-fitness"]);
  });
});

describe("top stories belong to one Edition", () => {
  it("picks again for the next Edition", async () => {
    const app = await startTestApp();
    const owner = await app.signInAsOwner();
    claudePicks(app, [{ item: "gh-terminal-agent", why: "Morning pick." }]);
    await app.postEdition(morningWithoutTops());

    const evening = morningWithoutTops();
    evening.edition_id = "2026-11-14-evening";
    evening.kind = "evening";
    evening.generated_at = "2026-11-14T19:20:00+03:00";
    claudePicks(app, [{ item: "lfc-midfielder-fitness", why: "Evening pick." }]);
    await app.postEdition(evening);

    const brief = await briefOf(owner);
    expect(tops(brief)).toEqual(["lfc-midfielder-fitness"]);
    expect(brief.items[0]!.why_for_you).toBe("Evening pick.");
    expect(brief.items.find((i) => i.id === "gh-terminal-agent")).toMatchObject({ top: false, why_for_you: null });
  });

  it("does not ask Claude again when the same Edition is posted again", async () => {
    const app = await startTestApp();
    const owner = await app.signInAsOwner();
    claudePicks(app, [{ item: "gh-terminal-agent", why: "First answer." }]);
    await app.postEdition(morningWithoutTops());
    claudePicks(app, [{ item: "ai-open-model-release", why: "Second answer." }]);

    await app.postEdition(morningWithoutTops());

    expect(pickCalls(app)).toHaveLength(1);
    expect(tops(await briefOf(owner))).toEqual(["gh-terminal-agent"]);
  });

  it("asks Claude again on a repeat post when it failed the first time", async () => {
    const app = await startTestApp();
    const owner = await app.signInAsOwner();
    app.services.claude.failing.add(PURPOSE);
    await app.postEdition(morningWithoutTops());
    app.services.claude.failing.delete(PURPOSE);
    claudePicks(app, [{ item: "gh-terminal-agent", why: "Now it works." }]);

    await app.postEdition(morningWithoutTops());

    expect(tops(await briefOf(owner))).toEqual(["gh-terminal-agent"]);
  });

  it("does not pick for an older Edition posted late", async () => {
    const app = await startTestApp();
    const owner = await app.signInAsOwner();
    const evening = morningWithoutTops();
    evening.edition_id = "2026-11-14-evening";
    evening.kind = "evening";
    evening.generated_at = "2026-11-14T19:20:00+03:00";
    claudePicks(app, [{ item: "lfc-midfielder-fitness", why: "Evening pick." }]);
    await app.postEdition(evening);

    claudePicks(app, [{ item: "gh-terminal-agent", why: "Morning pick." }]);
    await app.postEdition(morningWithoutTops());

    expect(pickCalls(app)).toHaveLength(1);
    expect(tops(await briefOf(owner))).toEqual(["lfc-midfielder-fitness"]);
  });

  it("picks after a legacy brief.json import too", async () => {
    const app = await startTestApp();
    const owner = await app.signInAsOwner();
    app.services.claude.failing.add(PURPOSE);

    const res = await app.request("POST", "/api/editions/legacy", { body: legacyToday(), token: app.ingestToken });
    expect(res.status, res.text).toBe(200);

    expect(pickCalls(app).length).toBe(1);
    const brief = await briefOf(owner);
    expect(tops(brief)).toHaveLength(3);
  });
});
