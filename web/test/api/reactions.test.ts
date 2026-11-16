// Reactions (ticket 09): a Reader can Like, Save, open and Hide (with an
// optional reason) any Item, and undo each one. What they see back is their
// own Brief: liked and saved marks, opened Items dimmed, hidden Items gone.
// How Reactions change the ranking is in ranking.test.ts.
import { describe, expect, it } from "vitest";
import { morningEdition } from "../support/fixtures";
import { startTestApp, type TestSession } from "../support/test-app";

type BriefItem = { id: string; dimmed: boolean; reactions: { like: boolean; save: boolean } };
type Brief = { items: BriefItem[]; groups: { kind: string; topic: string | null; item_ids: string[] }[] };

async function briefOf(session: TestSession): Promise<Brief> {
  const res = await session.request("GET", "/api/brief");
  expect(res.status).toBe(200);
  return res.body as Brief;
}

const itemIn = (brief: Brief, id: string) => brief.items.find((i) => i.id === id);
const ids = (brief: Brief) => brief.items.map((i) => i.id);

describe("Like and Save", () => {
  it("marks the Item in the Reader's Brief, and undoing removes the mark", async () => {
    const app = await startTestApp();
    await app.postEdition(morningEdition());
    const owner = await app.signInAsOwner();

    expect(itemIn(await briefOf(owner), "lfc-midfielder-fitness")).toMatchObject({
      reactions: { like: false, save: false },
      dimmed: false,
    });

    const liked = await owner.request("POST", "/api/items/lfc-midfielder-fitness/reactions", { body: { kind: "like" } });
    expect(liked.status, liked.text).toBe(200);
    expect(liked.body).toEqual({
      item_id: "lfc-midfielder-fitness",
      reactions: { like: true, save: false, open: false, hide: null },
    });
    const saved = await owner.request("POST", "/api/items/lfc-midfielder-fitness/reactions", { body: { kind: "save" } });
    expect(saved.body.reactions).toMatchObject({ like: true, save: true });
    expect(itemIn(await briefOf(owner), "lfc-midfielder-fitness")!.reactions).toEqual({ like: true, save: true });

    const unliked = await owner.request("DELETE", "/api/items/lfc-midfielder-fitness/reactions/like");
    expect(unliked.status).toBe(200);
    expect(unliked.body.reactions).toMatchObject({ like: false, save: true });
    expect(itemIn(await briefOf(owner), "lfc-midfielder-fitness")!.reactions).toEqual({ like: false, save: true });

    await owner.request("DELETE", "/api/items/lfc-midfielder-fitness/reactions/save");
    expect(itemIn(await briefOf(owner), "lfc-midfielder-fitness")!.reactions).toEqual({ like: false, save: false });
  });

  it("changes nothing when said twice, or undone when never set", async () => {
    const app = await startTestApp();
    await app.postEdition(morningEdition());
    const owner = await app.signInAsOwner();

    await owner.request("POST", "/api/items/ai-open-model-release/reactions", { body: { kind: "like" } });
    const again = await owner.request("POST", "/api/items/ai-open-model-release/reactions", { body: { kind: "like" } });
    expect(again.status).toBe(200);
    expect(again.body.reactions.like).toBe(true);

    const undoNothing = await owner.request("DELETE", "/api/items/ai-open-model-release/reactions/save");
    expect(undoNothing.status).toBe(200);
    expect(undoNothing.body.reactions).toMatchObject({ like: true, save: false });
  });
});

describe("Opening an Item", () => {
  it("brings the Item back dimmed in the next Brief, and undoing un-dims it", async () => {
    const app = await startTestApp();
    await app.postEdition(morningEdition());
    const owner = await app.signInAsOwner();

    const opened = await owner.request("POST", "/api/items/gh-terminal-agent/reactions", { body: { kind: "open" } });
    expect(opened.status).toBe(200);
    expect(opened.body.reactions.open).toBe(true);

    const brief = await briefOf(owner);
    expect(itemIn(brief, "gh-terminal-agent")!.dimmed).toBe(true);
    expect(brief.items.filter((i) => i.dimmed).map((i) => i.id)).toEqual(["gh-terminal-agent"]);

    await owner.request("DELETE", "/api/items/gh-terminal-agent/reactions/open");
    expect(itemIn(await briefOf(owner), "gh-terminal-agent")!.dimmed).toBe(false);
  });

  it("stays dimmed in a later Edition that carries the same Item", async () => {
    const app = await startTestApp();
    await app.postEdition(morningEdition());
    const owner = await app.signInAsOwner();
    await owner.request("POST", "/api/items/gh-terminal-agent/reactions", { body: { kind: "open" } });

    const evening = morningEdition();
    evening.edition_id = "2026-11-14-evening";
    evening.kind = "evening";
    evening.generated_at = "2026-11-14T19:20:00+03:00";
    await app.postEdition(evening);

    expect(itemIn(await briefOf(owner), "gh-terminal-agent")!.dimmed).toBe(true);
  });
});

describe("Hide", () => {
  it.each([["not_interested"], ["already_seen"], ["bad_source"], [null]])(
    "with reason %s takes the Item out of the Brief, its group and the top stories",
    async (reason) => {
      const app = await startTestApp();
      await app.postEdition(morningEdition()); // top stories: me-yemen-port-talks, ai-open-model-release
      const owner = await app.signInAsOwner();

      const hidden = await owner.request("POST", "/api/items/me-yemen-port-talks/reactions", {
        body: reason === null ? { kind: "hide" } : { kind: "hide", reason },
      });
      expect(hidden.status, hidden.text).toBe(200);
      expect(hidden.body.reactions.hide).toEqual({ reason });

      const brief = await briefOf(owner);
      expect(ids(brief)).not.toContain("me-yemen-port-talks");
      expect(brief.groups.flatMap((g) => g.item_ids)).not.toContain("me-yemen-port-talks");
      expect(brief.groups[0]).toMatchObject({ kind: "top", topic: null, item_ids: ["ai-open-model-release"] });
    },
  );

  it("comes back after undoing the hide", async () => {
    const app = await startTestApp();
    await app.postEdition(morningEdition());
    const owner = await app.signInAsOwner();
    const before = ids(await briefOf(owner));

    await owner.request("POST", "/api/items/lfc-midfielder-fitness/reactions", {
      body: { kind: "hide", reason: "already_seen" },
    });
    expect(ids(await briefOf(owner))).not.toContain("lfc-midfielder-fitness");

    const undone = await owner.request("DELETE", "/api/items/lfc-midfielder-fitness/reactions/hide");
    expect(undone.status).toBe(200);
    expect(undone.body.reactions.hide).toBeNull();
    expect(ids(await briefOf(owner))).toEqual(before);
  });

  it("hiding again replaces the reason", async () => {
    const app = await startTestApp();
    await app.postEdition(morningEdition());
    const owner = await app.signInAsOwner();

    await owner.request("POST", "/api/items/lfc-midfielder-fitness/reactions", { body: { kind: "hide" } });
    const res = await owner.request("POST", "/api/items/lfc-midfielder-fitness/reactions", {
      body: { kind: "hide", reason: "bad_source" },
    });

    expect(res.body.reactions.hide).toEqual({ reason: "bad_source" });
  });

  it("stays hidden in a later Edition that carries the same Item", async () => {
    const app = await startTestApp();
    await app.postEdition(morningEdition());
    const owner = await app.signInAsOwner();
    await owner.request("POST", "/api/items/lfc-midfielder-fitness/reactions", { body: { kind: "hide" } });

    const evening = morningEdition();
    evening.edition_id = "2026-11-14-evening";
    evening.kind = "evening";
    evening.generated_at = "2026-11-14T19:20:00+03:00";
    await app.postEdition(evening);

    expect(ids(await briefOf(owner))).not.toContain("lfc-midfielder-fitness");
  });
});

describe("Reactions are private to each Reader", () => {
  it("one Reader's likes, saves, opens and hides never show in another Reader's Brief", async () => {
    const app = await startTestApp();
    await app.postEdition(morningEdition());
    const owner = await app.signInAsOwner();
    const sara = await app.addReader("sara@example.com");
    const before = await briefOf(sara);

    for (const body of [
      { kind: "like" },
      { kind: "save" },
      { kind: "open" },
    ]) {
      await owner.request("POST", "/api/items/ai-open-model-release/reactions", { body });
    }
    await owner.request("POST", "/api/items/lfc-midfielder-fitness/reactions", {
      body: { kind: "hide", reason: "bad_source" },
    });

    expect(await briefOf(sara)).toEqual(before);
    expect(itemIn(await briefOf(sara), "ai-open-model-release")).toMatchObject({
      reactions: { like: false, save: false },
      dimmed: false,
    });
    expect(ids(await briefOf(owner))).not.toContain("lfc-midfielder-fitness");
  });

  it("undoing only touches the Reader's own Reaction", async () => {
    const app = await startTestApp();
    await app.postEdition(morningEdition());
    const owner = await app.signInAsOwner();
    const sara = await app.addReader("sara@example.com");
    await owner.request("POST", "/api/items/ai-open-model-release/reactions", { body: { kind: "like" } });
    await sara.request("POST", "/api/items/ai-open-model-release/reactions", { body: { kind: "like" } });

    await sara.request("DELETE", "/api/items/ai-open-model-release/reactions/like");

    expect(itemIn(await briefOf(owner), "ai-open-model-release")!.reactions.like).toBe(true);
    expect(itemIn(await briefOf(sara), "ai-open-model-release")!.reactions.like).toBe(false);
  });
});

describe("refusals", () => {
  it("needs a signed-in Reader", async () => {
    const app = await startTestApp();
    await app.postEdition(morningEdition());

    expect((await app.request("POST", "/api/items/ai-open-model-release/reactions", { body: { kind: "like" } })).status).toBe(401);
    expect((await app.request("DELETE", "/api/items/ai-open-model-release/reactions/like")).status).toBe(401);
  });

  it("refuses an Item that no Edition carried", async () => {
    const app = await startTestApp();
    await app.postEdition(morningEdition());
    const owner = await app.signInAsOwner();

    const res = await owner.request("POST", "/api/items/no-such-item/reactions", { body: { kind: "like" } });
    expect(res.status).toBe(404);
    expect((await owner.request("DELETE", "/api/items/no-such-item/reactions/like")).status).toBe(404);
  });

  it("refuses an Item the Reader may not see, so their bad source report never reaches the Owner", async () => {
    const app = await startTestApp();
    const reem = await app.addReader("reem@example.com");
    const sara = await app.addReader("sara@example.com");
    const topic = await reem.request("POST", "/api/topics", { body: { name: "Fertility Treatment" } });
    expect(topic.status, topic.text).toBe(201);
    const edition = morningEdition();
    edition.items.push({
      id: "clinic-private",
      topics: [topic.body.topic.id],
      time: "2026-11-14T04:00:00+03:00",
      title: "A clinic reopens",
      summary: "Only the Topic's creator should see this.",
      sources: [{ title: "Example Health", url: "https://example.com/health/clinic", type: "independent" }],
    });
    await app.postEdition(edition);
    // Omar follows only AI and never opted into Graphic.
    const omar = await app.addReader("omar@example.com", { onboarded: false });
    await omar.request("PATCH", "/api/me", { body: { topics: ["ai"], onboarded: true } });

    const badSource = { kind: "hide", reason: "bad_source" };
    expect((await sara.request("POST", "/api/items/clinic-private/reactions", { body: badSource })).status).toBe(404);
    expect((await sara.request("DELETE", "/api/items/clinic-private/reactions/hide")).status).toBe(404);
    expect((await omar.request("POST", "/api/items/graphic-flood-aftermath/reactions", { body: badSource })).status).toBe(404);
    expect((await omar.request("DELETE", "/api/items/graphic-flood-aftermath/reactions/hide")).status).toBe(404);
    const owner = await app.signInAsOwner();
    expect((await owner.request("GET", "/api/owner/reports")).body.reports).toEqual([]);

    // Its creator may react to it.
    expect((await reem.request("POST", "/api/items/clinic-private/reactions", { body: { kind: "save" } })).status).toBe(200);
  });

  it.each([
    [{ kind: "love" }],
    [{}],
    [{ kind: "hide", reason: "boring" }],
    [{ kind: "like", reason: "not_interested" }],
  ])("refuses a malformed Reaction %j", async (body) => {
    const app = await startTestApp();
    await app.postEdition(morningEdition());
    const owner = await app.signInAsOwner();

    const res = await owner.request("POST", "/api/items/ai-open-model-release/reactions", { body });

    expect(res.status).toBe(422);
    expect(res.body.error).toBeTruthy();
    expect(itemIn(await briefOf(owner), "ai-open-model-release")!.reactions).toEqual({ like: false, save: false });
  });

  it("refuses a body that is not JSON and an unknown kind to undo", async () => {
    const app = await startTestApp();
    await app.postEdition(morningEdition());
    const owner = await app.signInAsOwner();

    const bad = await owner.request("POST", "/api/items/ai-open-model-release/reactions", { rawBody: "{nope" });
    expect(bad.status).toBe(422);
    expect((await owner.request("DELETE", "/api/items/ai-open-model-release/reactions/love")).status).toBe(422);
  });
});
