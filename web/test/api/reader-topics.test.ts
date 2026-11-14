import { describe, expect, it } from "vitest";
import { morningEdition } from "../support/fixtures";
import { startTestApp, type TestApp, type TestSession } from "../support/test-app";

type Topic = {
  id: string;
  name: string;
  name_ar: string;
  sensitive: boolean;
  followed: boolean;
  private: boolean;
  mine: boolean;
};
type OwnerTopic = Topic & { created_by: string | null; note: string | null; followers: number; rules: string; rules_by: string };
type GatheringTopic = { id: string; name: string; rules: string; followers: number };

const F1_RULES = "Trusted outlets: Autosport, The Race, BBC Sport.\nWhat counts: races, results, team news.\nExclude: betting tips.";

async function createTopic(reader: TestSession, name: string, note = "") {
  const res = await reader.request("POST", "/api/topics", { body: { name, note } });
  if (res.status !== 201) throw new Error(`Creating "${name}" failed: ${res.status} ${res.text}`);
  return res.body.topic as Topic;
}

async function ownerTopics(app: TestApp): Promise<OwnerTopic[]> {
  const res = await (await app.signInAsOwner()).request("GET", "/api/owner/topics");
  expect(res.status).toBe(200);
  return res.body.topics;
}

/**
 * The Owner, onboarded but following nothing, so the gathering list shows only
 * what the test's Readers follow (addReader signs the Owner in to send Invites).
 */
async function ownerFollowingNothing(app: TestApp): Promise<TestSession> {
  const owner = await app.signInAsOwner({ onboarded: false });
  await owner.request("PATCH", "/api/me", { body: { topics: ["saudi"], onboarded: true } });
  await owner.request("POST", "/api/topics/saudi/unfollow");
  return owner;
}

/** A Reader who follows exactly `topics`. */
async function readerFollowing(app: TestApp, email: string, topics: string[]): Promise<TestSession> {
  const reader = await app.addReader(email, { onboarded: false });
  const res = await reader.request("PATCH", "/api/me", { body: { topics, onboarded: true } });
  if (res.status !== 200) throw new Error(`Onboarding ${email} failed: ${res.status} ${res.text}`);
  return reader;
}

const catalogIds = async (reader: TestSession): Promise<string[]> =>
  (await reader.request("GET", "/api/topics")).body.topics.map((t: Topic) => t.id);

describe("POST /api/topics (a Reader creates a Topic)", () => {
  it("creates a private Topic its creator follows", async () => {
    const app = await startTestApp();
    const reader = await app.addReader("reem@example.com");

    const res = await reader.request("POST", "/api/topics", {
      body: { name: "Formula 1", note: "Races, drivers and team news, mostly Ferrari." },
    });

    expect(res.status).toBe(201);
    expect(res.body.topic).toMatchObject({ name: "Formula 1", followed: true, private: true, mine: true, sensitive: false });
    const catalog = await reader.request("GET", "/api/topics");
    const mine = catalog.body.topics.find((t: Topic) => t.id === res.body.topic.id);
    expect(mine).toMatchObject({ name: "Formula 1", followed: true, private: true, mine: true });
    expect((await reader.request("GET", "/api/me")).body.topics).toContain(res.body.topic.id);
  });

  it("gives the Topic an id Editions can tag Items with", async () => {
    const app = await startTestApp();
    const reader = await app.addReader("reem@example.com");

    const topic = await createTopic(reader, "Formula 1");

    expect(topic.id).toBe("formula-1");
  });

  it("stores the Gathering Rules Claude drafts from the name and note, following the house source rules", async () => {
    const app = await startTestApp();
    app.services.claude.replies.set("gathering-rules", { text: F1_RULES });
    const reader = await app.addReader("reem@example.com");

    const topic = await createTopic(reader, "Formula 1", "Mostly Ferrari.");

    const asked = app.services.claude.calls.filter((c) => c.purpose === "gathering-rules");
    expect(asked).toHaveLength(1);
    expect(asked[0]!.messages.map((m) => m.content).join("\n")).toContain("Formula 1");
    expect(asked[0]!.messages.map((m) => m.content).join("\n")).toContain("Mostly Ferrari.");
    expect(asked[0]!.system).toMatch(/independent outlets first/i);
    expect((await ownerTopics(app)).find((t) => t.id === topic.id)).toMatchObject({
      rules: F1_RULES,
      rules_by: "claude",
      created_by: "reem@example.com",
      note: "Mostly Ferrari.",
      private: true,
    });
  });

  it("still creates the Topic when Claude fails, with template rules marked for the Owner to check", async () => {
    const app = await startTestApp();
    app.services.claude.failing.add("gathering-rules");
    const reader = await app.addReader("reem@example.com");

    const topic = await createTopic(reader, "Formula 1");

    const stored = (await ownerTopics(app)).find((t) => t.id === topic.id)!;
    expect(stored.rules_by).toBe("fallback");
    expect(stored.rules).toContain("Formula 1");
  });

  it("refuses the 11th Topic with a clear message", async () => {
    const app = await startTestApp();
    const reader = await app.addReader("reem@example.com");
    for (let n = 1; n <= 10; n++) await createTopic(reader, `Topic ${n}`);

    const res = await reader.request("POST", "/api/topics", { body: { name: "Topic 11" } });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/10 Topics/);
    expect(res.body.limit).toBe(10);
    expect((await catalogIds(reader)).filter((id) => id.startsWith("topic-"))).toHaveLength(10);
  });

  it("counts shared Topics towards the cap, and each Reader has their own", async () => {
    const app = await startTestApp();
    const reem = await app.addReader("reem@example.com");
    const sara = await app.addReader("sara@example.com");
    for (let n = 1; n <= 10; n++) {
      const topic = await createTopic(reem, `Topic ${n}`);
      await reem.request("POST", `/api/topics/${topic.id}/share`);
    }

    expect((await reem.request("POST", "/api/topics", { body: { name: "One more" } })).status).toBe(409);
    expect((await sara.request("POST", "/api/topics", { body: { name: "One more" } })).status).toBe(201);
  });

  it("does not cap the Owner", async () => {
    const app = await startTestApp();
    const owner = await app.signInAsOwner();
    for (let n = 1; n <= 10; n++) await createTopic(owner, `Topic ${n}`);

    expect((await owner.request("POST", "/api/topics", { body: { name: "Topic 11" } })).status).toBe(201);
  });

  it("refuses a nameless or over-long Topic with reasons", async () => {
    const app = await startTestApp();
    const reader = await app.addReader("reem@example.com");

    const nameless = await reader.request("POST", "/api/topics", { body: { name: "  ", note: "x" } });
    const long = await reader.request("POST", "/api/topics", { body: { name: "F".repeat(61) } });
    const longNote = await reader.request("POST", "/api/topics", { body: { name: "F1", note: "x".repeat(301) } });

    for (const res of [nameless, long, longNote]) {
      expect(res.status).toBe(422);
      expect(res.body.reasons.length).toBeGreaterThan(0);
    }
    expect(app.services.claude.calls).toHaveLength(0);
  });

  it("points at the Catalog Topic of the same name instead of creating a twin", async () => {
    const app = await startTestApp();
    const reader = await app.addReader("reem@example.com", { onboarded: false });

    const res = await reader.request("POST", "/api/topics", { body: { name: "liverpool" } });

    expect(res.status).toBe(409);
    expect(res.body.topic).toMatchObject({ id: "liverpool", followed: false });
    expect(await catalogIds(reader)).toHaveLength(14);
  });

  it("needs a session", async () => {
    const app = await startTestApp();

    expect((await app.request("POST", "/api/topics", { body: { name: "Formula 1" } })).status).toBe(401);
  });
});

describe("private Topics", () => {
  it("are invisible to other Readers, who cannot follow them", async () => {
    const app = await startTestApp();
    const reem = await app.addReader("reem@example.com");
    const sara = await app.addReader("sara@example.com");
    const topic = await createTopic(reem, "Formula 1");

    expect(await catalogIds(sara)).not.toContain(topic.id);
    expect((await sara.request("POST", `/api/topics/${topic.id}/follow`)).status).toBe(404);
    const patch = await sara.request("PATCH", "/api/me", { body: { topics: ["saudi", topic.id] } });
    expect(patch.status).toBe(422);
    expect((await sara.request("GET", "/api/me")).body.topics).not.toContain(topic.id);
  });

  it("stay out of the Owner's Catalog, but the Owner sees them with their rules", async () => {
    const app = await startTestApp();
    const reem = await app.addReader("reem@example.com");
    const topic = await createTopic(reem, "Formula 1");
    const owner = await app.signInAsOwner();

    expect(await catalogIds(owner)).not.toContain(topic.id);
    expect((await ownerTopics(app)).map((t) => t.id)).toContain(topic.id);
  });

  it("never show up in another Reader's Brief, even as an Item's Topic", async () => {
    const app = await startTestApp();
    const reem = await app.addReader("reem@example.com");
    const sara = await app.addReader("sara@example.com");
    const topic = await createTopic(reem, "Formula 1");
    const edition = morningEdition();
    edition.items[0]!.topics.push(topic.id);
    expect((await app.postEdition(edition)).status).toBe(200);

    const saraBrief = (await sara.request("GET", "/api/brief")).body;
    const reemBrief = (await reem.request("GET", "/api/brief")).body;

    const item = (b: any) => b.items.find((i: { id: string }) => i.id === edition.items[0]!.id);
    expect(item(saraBrief).topics).not.toContain(topic.id);
    expect(saraBrief.topic_names).not.toHaveProperty(topic.id);
    expect(item(reemBrief).topics).toContain(topic.id);
    expect(reemBrief.topic_names[topic.id]).toBe("Formula 1");
  });
});

describe("POST /api/topics/{id}/share", () => {
  it("puts the Topic in every Reader's Catalog, where they can follow it", async () => {
    const app = await startTestApp();
    const reem = await app.addReader("reem@example.com");
    const sara = await app.addReader("sara@example.com");
    const topic = await createTopic(reem, "Formula 1");

    const shared = await reem.request("POST", `/api/topics/${topic.id}/share`);

    expect(shared.status).toBe(200);
    expect(shared.body.topic).toMatchObject({ id: topic.id, private: false, mine: true, followed: true });
    const seen = (await sara.request("GET", "/api/topics")).body.topics.find((t: Topic) => t.id === topic.id);
    expect(seen).toMatchObject({ name: "Formula 1", private: false, mine: false, followed: false });
    expect((await sara.request("POST", `/api/topics/${topic.id}/follow`)).body.topic.followed).toBe(true);
    expect((await reem.request("POST", `/api/topics/${topic.id}/share`)).status).toBe(200);
  });

  it("is only for the Topic's creator", async () => {
    const app = await startTestApp();
    const reem = await app.addReader("reem@example.com");
    const sara = await app.addReader("sara@example.com");
    const topic = await createTopic(reem, "Formula 1");

    expect((await sara.request("POST", `/api/topics/${topic.id}/share`)).status).toBe(404);
    expect((await sara.request("POST", "/api/topics/liverpool/share")).status).toBe(403);
    await reem.request("POST", `/api/topics/${topic.id}/share`);
    expect((await sara.request("POST", `/api/topics/${topic.id}/share`)).status).toBe(403);
  });
});

describe("PATCH /api/topics/{id}/rules (the Owner edits Gathering Rules)", () => {
  it("lets the Owner edit any Topic's rules, a private one included", async () => {
    const app = await startTestApp();
    const reem = await app.addReader("reem@example.com");
    const topic = await createTopic(reem, "Formula 1");
    const owner = await app.signInAsOwner();

    const edited = await owner.request("PATCH", `/api/topics/${topic.id}/rules`, { body: { rules: F1_RULES } });
    const starting = await owner.request("PATCH", "/api/topics/liverpool/rules", { body: { rules: "Official only." } });

    expect(edited.status).toBe(200);
    expect(edited.body.topic).toMatchObject({ id: topic.id, rules: F1_RULES, rules_by: "owner" });
    expect(starting.status).toBe(200);
    const list = await ownerTopics(app);
    expect(list.find((t) => t.id === topic.id)!.rules).toBe(F1_RULES);
    expect(list.find((t) => t.id === "liverpool")!.rules).toBe("Official only.");
  });

  it("refuses other Readers, the signed-out, empty rules and unknown Topics", async () => {
    const app = await startTestApp();
    const reem = await app.addReader("reem@example.com");
    const topic = await createTopic(reem, "Formula 1");
    const owner = await app.signInAsOwner();

    expect((await reem.request("PATCH", `/api/topics/${topic.id}/rules`, { body: { rules: "x" } })).status).toBe(403);
    expect((await app.request("PATCH", `/api/topics/${topic.id}/rules`, { body: { rules: "x" } })).status).toBe(401);
    expect((await owner.request("PATCH", `/api/topics/${topic.id}/rules`, { body: { rules: " " } })).status).toBe(422);
    expect((await owner.request("PATCH", "/api/topics/no-such-topic/rules", { body: { rules: "x" } })).status).toBe(404);
  });

  it("is the only way to read every Topic's rules: GET /api/owner/topics is Owner only", async () => {
    const app = await startTestApp();
    const reem = await app.addReader("reem@example.com");

    expect((await reem.request("GET", "/api/owner/topics")).status).toBe(403);
    expect((await app.request("GET", "/api/owner/topics")).status).toBe(401);
    const starting = (await ownerTopics(app)).find((t) => t.id === "us-markets")!;
    expect(starting.rules).not.toBe("");
  });
});

describe("GET /api/gathering-list (pipeline)", () => {
  it("needs the pipeline token, not a session", async () => {
    const app = await startTestApp();
    const owner = await app.signInAsOwner();

    expect((await app.request("GET", "/api/gathering-list")).status).toBe(401);
    expect((await app.request("GET", "/api/gathering-list", { token: "wrong" })).status).toBe(401);
    expect((await owner.request("GET", "/api/gathering-list")).status).toBe(401);
    expect((await app.request("GET", "/api/gathering-list", { token: app.ingestToken })).status).toBe(200);
  });

  it("lists only Topics with followers, with their rules and the house source rules", async () => {
    const app = await startTestApp();
    app.services.claude.replies.set("gathering-rules", { text: F1_RULES });
    await ownerFollowingNothing(app);
    const reem = await readerFollowing(app, "reem@example.com", ["liverpool", "ai"]);
    await readerFollowing(app, "sara@example.com", ["ai"]);
    const f1 = await createTopic(reem, "Formula 1");
    await createTopic(reem, "Chess"); // created, then unfollowed: not gathered
    await reem.request("POST", "/api/topics/chess/unfollow");

    const res = await app.request("GET", "/api/gathering-list", { token: app.ingestToken });

    expect(res.body.house_rules).toMatch(/independent outlets first/i);
    expect(res.body.topics.map((t: GatheringTopic) => [t.id, t.followers])).toEqual([
      ["ai", 2],
      ["liverpool", 1],
      [f1.id, 1],
    ]);
    expect(res.body.topics.find((t: GatheringTopic) => t.id === f1.id)).toMatchObject({ name: "Formula 1", rules: F1_RULES });
    expect(res.body.topics.find((t: GatheringTopic) => t.id === "liverpool").rules).toMatch(/reliability/i);
  });

  it("drops a Topic when its last follower unfollows, and uses the Owner's edited rules", async () => {
    const app = await startTestApp();
    const owner = await ownerFollowingNothing(app);
    const reem = await readerFollowing(app, "reem@example.com", ["liverpool", "ai"]);
    await owner.request("PATCH", "/api/topics/ai/rules", { body: { rules: "Papers and tools only." } });
    await reem.request("POST", "/api/topics/liverpool/unfollow");

    const res = await app.request("GET", "/api/gathering-list", { token: app.ingestToken });

    expect(res.body.topics).toEqual([expect.objectContaining({ id: "ai", rules: "Papers and tools only." })]);
  });

  it("does not count Readers whose Invite was revoked", async () => {
    const app = await startTestApp();
    const owner = await ownerFollowingNothing(app);
    await readerFollowing(app, "reem@example.com", ["liverpool"]);
    const invite = (await owner.request("GET", "/api/invites")).body.invites.find(
      (i: { email: string }) => i.email === "reem@example.com",
    );
    await owner.request("DELETE", `/api/invites/${invite.id}`);

    const res = await app.request("GET", "/api/gathering-list", { token: app.ingestToken });

    expect(res.body.topics).toEqual([]);
  });
});
