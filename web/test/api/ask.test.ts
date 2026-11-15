// Ask Claude about an Item (ticket 16): answers with cited links, private to
// the Reader who asked, limited per day for everyone but the Owner.
import { afterEach, describe, expect, it, vi } from "vitest";
import { morningEdition } from "../support/fixtures";
import { startTestApp, type TestApp, type TestSession } from "../support/test-app";

const ITEM = "me-yemen-port-talks";
const OTHER_ITEM = "ai-open-model-release";

afterEach(() => {
  vi.useRealTimers();
});

/** An app with the morning Edition posted and Claude answering Ask with two cited links. */
async function askApp(): Promise<TestApp> {
  const app = await startTestApp();
  await app.postEdition(morningEdition());
  app.services.claude.replies.set("ask", {
    text: "The talks are about reopening the port to fuel shipments.",
    citations: [
      { title: "Port talks explained", url: "https://example.com/explainer/hodeidah" },
      { url: "https://example.com/wire/hodeidah" },
    ],
  });
  return app;
}

function ask(reader: TestSession, question: string, item = ITEM) {
  return reader.request("POST", `/api/items/${item}/ask`, { body: { question } });
}

/** Ask `n` questions that must all be answered. */
async function askTimes(reader: TestSession, n: number) {
  for (let i = 1; i <= n; i++) {
    const res = await ask(reader, `Question ${i}?`);
    if (res.status !== 201) throw new Error(`Question ${i} was refused: ${res.status} ${res.text}`);
  }
}

describe("asking about an Item", () => {
  it("returns Claude's answer with its cited links and keeps it for the Reader", async () => {
    const app = await askApp();
    const sara = await app.addReader("sara@example.com");

    const asked = await ask(sara, "  Why does the port matter?  ");

    expect(asked.status).toBe(201);
    expect(asked.body.ask).toEqual({
      id: expect.any(Number),
      item_id: ITEM,
      question: "Why does the port matter?",
      answer: "The talks are about reopening the port to fuel shipments.",
      citations: [
        { title: "Port talks explained", url: "https://example.com/explainer/hodeidah" },
        { title: null, url: "https://example.com/wire/hodeidah" },
      ],
      asked_at: expect.any(String),
    });

    const later = await sara.request("GET", `/api/items/${ITEM}/ask`);
    expect(later.status).toBe(200);
    expect(later.body.asks).toEqual([asked.body.ask]);
  });

  it("gives Claude the Item, its sources and web search", async () => {
    const app = await askApp();
    const sara = await app.addReader("sara@example.com");

    await ask(sara, "Who is mediating?");

    expect(app.services.claude.calls).toHaveLength(1);
    const call = app.services.claude.calls[0]!;
    expect(call.purpose).toBe("ask");
    expect(call.webSearch).toBe(true);
    const prompt = JSON.stringify(call);
    expect(prompt).toContain("Truce talks resume over Hodeidah port access");
    expect(prompt).toContain("https://example.com/wire/hodeidah");
    expect(prompt).toContain("https://example.com/daily/hodeidah");
    expect(prompt).toContain("Who is mediating?");
  });

  it("lists a Reader's questions about one Item oldest first, apart from other Items", async () => {
    const app = await askApp();
    const sara = await app.addReader("sara@example.com");

    await ask(sara, "First?");
    await ask(sara, "About the model?", OTHER_ITEM);
    await ask(sara, "Second?");

    const listed = await sara.request("GET", `/api/items/${ITEM}/ask`);
    expect(listed.body.asks.map((a: { question: string }) => a.question)).toEqual(["First?", "Second?"]);
    const other = await sara.request("GET", `/api/items/${OTHER_ITEM}/ask`);
    expect(other.body.asks.map((a: { question: string }) => a.question)).toEqual(["About the model?"]);
  });

  it("sends the Reader's earlier questions on this Item to Claude, so follow-ups make sense", async () => {
    const app = await askApp();
    const sara = await app.addReader("sara@example.com");

    await ask(sara, "Who is mediating?");
    await ask(sara, "And what did they say last time?");

    const second = app.services.claude.calls[1]!;
    expect(second.messages.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
    expect(second.messages[1]!.content).toBe("The talks are about reopening the port to fuel shipments.");
    expect(second.messages[2]!.content).toContain("And what did they say last time?");
  });

  it("refuses an empty question, an unknown Item and a signed-out request", async () => {
    const app = await askApp();
    const sara = await app.addReader("sara@example.com");

    expect((await ask(sara, "   ")).status).toBe(400);
    expect((await sara.request("POST", `/api/items/${ITEM}/ask`, { rawBody: "{not json" })).status).toBe(400);
    expect((await ask(sara, "x".repeat(2001))).status).toBe(400);
    expect((await ask(sara, "Anyone?", "no-such-item")).status).toBe(404);
    expect((await sara.request("GET", "/api/items/no-such-item/ask")).status).toBe(404);
    expect((await app.request("POST", `/api/items/${ITEM}/ask`, { body: { question: "Hi?" } })).status).toBe(401);
    expect((await app.request("GET", `/api/items/${ITEM}/ask`)).status).toBe(401);
    expect(app.services.claude.calls).toHaveLength(0);
  });

  it("says so when Claude cannot answer, and does not count the question", async () => {
    const app = await askApp();
    const sara = await app.addReader("sara@example.com");
    app.services.claude.failing.add("ask");

    const failed = await ask(sara, "Why?");

    expect(failed.status).toBe(502);
    expect(failed.body.error).toEqual(expect.any(String));
    const listed = await sara.request("GET", `/api/items/${ITEM}/ask`);
    expect(listed.body.asks).toEqual([]);
    expect(listed.body.ask_limit).toMatchObject({ used_today: 0, remaining: 20 });
  });
});

describe("privacy", () => {
  it("never shows one Reader's questions or answers to another, the Owner included", async () => {
    const app = await askApp();
    const sara = await app.addReader("sara@example.com");
    const omar = await app.addReader("omar@example.com");
    const owner = await app.signInAsOwner();

    await ask(sara, "Sara's private question?");
    await ask(omar, "Omar's question?");

    const forOmar = await omar.request("GET", `/api/items/${ITEM}/ask`);
    expect(forOmar.body.asks.map((a: { question: string }) => a.question)).toEqual(["Omar's question?"]);
    const forOwner = await owner.request("GET", `/api/items/${ITEM}/ask`);
    expect(forOwner.body.asks).toEqual([]);
    expect(JSON.stringify(forOmar.body) + JSON.stringify(forOwner.body)).not.toContain("Sara's private question?");
  });

  it("treats an Item the Reader may not see as no Item at all", async () => {
    const app = await askApp();
    const reem = await app.addReader("reem@example.com");
    const sara = await app.addReader("sara@example.com");
    const topic = await reem.request("POST", "/api/topics", { body: { name: "Fertility Treatment" } });
    expect(topic.status, topic.text).toBe(201);
    const edition = morningEdition();
    edition.edition_id = "2026-11-14-evening";
    edition.kind = "evening";
    edition.generated_at = "2026-11-14T19:15:00+03:00";
    edition.items.push({
      id: "clinic-private",
      topics: [topic.body.topic.id],
      time: "2026-11-14T18:00:00+03:00",
      title: "A clinic reopens",
      summary: "Only the Topic's creator should see this.",
      sources: [{ title: "Example Health", url: "https://example.com/health/clinic", type: "independent" }],
    });
    expect((await app.postEdition(edition)).status).toBe(200);
    // Omar follows only AI and never opted into Graphic.
    const omar = await app.addReader("omar@example.com", { onboarded: false });
    await omar.request("PATCH", "/api/me", { body: { topics: ["ai"], onboarded: true } });

    // Another Reader's private Topic is all the Item carries.
    expect((await ask(sara, "What is this?", "clinic-private")).status).toBe(404);
    expect((await sara.request("GET", "/api/items/clinic-private/ask")).status).toBe(404);
    // A sensitive Item the Reader has not opted into.
    expect((await ask(omar, "What happened?", "graphic-flood-aftermath")).status).toBe(404);
    expect((await omar.request("GET", "/api/items/graphic-flood-aftermath/ask")).status).toBe(404);
    expect(app.services.claude.calls.filter((c) => c.purpose === "ask")).toHaveLength(0);
    expect((await sara.request("GET", `/api/items/${ITEM}/ask`)).body.ask_limit).toMatchObject({ used_today: 0 });

    // Who may see them can still ask.
    expect((await ask(reem, "What is this?", "clinic-private")).status).toBe(201);
    expect((await ask(sara, "What happened?", "graphic-flood-aftermath")).status).toBe(201);
  });

  it("keeps each Reader's earlier questions out of another Reader's conversation with Claude", async () => {
    const app = await askApp();
    const sara = await app.addReader("sara@example.com");
    const omar = await app.addReader("omar@example.com");

    await ask(sara, "Sara's private question?");
    await ask(omar, "Omar's question?");

    expect(JSON.stringify(app.services.claude.calls[1])).not.toContain("Sara's private question?");
  });
});

describe("the daily Ask limit", () => {
  it("lets a Reader ask 20 questions a day and refuses the 21st, showing what is left", async () => {
    const app = await askApp();
    const sara = await app.addReader("sara@example.com");

    const fresh = await sara.request("GET", `/api/items/${ITEM}/ask`);
    expect(fresh.body.ask_limit).toMatchObject({ unlimited: false, daily: 20, used_today: 0, remaining: 20 });

    await askTimes(sara, 19);
    const twentieth = await ask(sara, "Twentieth?");
    expect(twentieth.status).toBe(201);
    expect(twentieth.body.ask_limit).toMatchObject({ used_today: 20, remaining: 0 });

    const refused = await ask(sara, "Twenty-first?");
    expect(refused.status).toBe(429);
    expect(refused.body.error).toEqual(expect.any(String));
    expect(refused.body.ask_limit).toMatchObject({ daily: 20, used_today: 20, remaining: 0 });
    expect(app.services.claude.calls).toHaveLength(20);
  });

  it("counts questions across every Item", async () => {
    const app = await askApp();
    const sara = await app.addReader("sara@example.com");

    await askTimes(sara, 20);

    expect((await ask(sara, "About the model?", OTHER_ITEM)).status).toBe(429);
  });

  it("is per Reader: one Reader using theirs up leaves another's untouched", async () => {
    const app = await askApp();
    const sara = await app.addReader("sara@example.com");
    const omar = await app.addReader("omar@example.com");

    await askTimes(sara, 20);

    expect((await ask(omar, "Mine?")).status).toBe(201);
  });

  it("never refuses the Owner", async () => {
    const app = await askApp();
    const owner = await app.signInAsOwner();

    await askTimes(owner, 25);

    const status = await owner.request("GET", `/api/items/${ITEM}/ask`);
    expect(status.body.ask_limit).toEqual({
      unlimited: true,
      daily: null,
      used_today: 25,
      remaining: null,
      resets_at: null,
    });
  });

  it("resets at 00:00 Asia/Riyadh, not at midnight UTC", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-14T23:50:00+03:00"));
    const app = await askApp();
    const sara = await app.addReader("sara@example.com");

    await askTimes(sara, 20);
    const used = await ask(sara, "One more?");
    expect(used.status).toBe(429);
    expect(used.body.ask_limit.resets_at).toBe("2026-11-15T00:00:00+03:00");

    vi.setSystemTime(new Date("2026-11-14T23:59:59+03:00"));
    expect((await ask(sara, "Still today?")).status).toBe(429);

    // 00:00 in Riyadh is still 21:00 on the 14th in UTC.
    vi.setSystemTime(new Date("2026-11-15T00:00:00+03:00"));
    const nextDay = await ask(sara, "New day?");
    expect(nextDay.status).toBe(201);
    expect(nextDay.body.ask_limit).toMatchObject({
      used_today: 1,
      remaining: 19,
      resets_at: "2026-11-16T00:00:00+03:00",
    });

    // Earlier days' questions are still there to come back to.
    const listed = await sara.request("GET", `/api/items/${ITEM}/ask`);
    expect(listed.body.asks).toHaveLength(21);
  });
});

describe("the Owner setting a Reader's limit", () => {
  async function readerId(app: TestApp, email: string): Promise<number> {
    const owner = await app.signInAsOwner();
    const usage = await owner.request("GET", "/api/owner/ask-usage");
    return usage.body.readers.find((r: { email: string }) => r.email === email).id;
  }

  it("lowers a Reader's daily limit", async () => {
    const app = await askApp();
    const sara = await app.addReader("sara@example.com");
    const owner = await app.signInAsOwner();
    const id = await readerId(app, "sara@example.com");

    const set = await owner.request("PATCH", `/api/readers/${id}/ask-limit`, { body: { daily_limit: 3 } });

    expect(set.status).toBe(200);
    expect(set.body).toMatchObject({ reader_id: id, ask_limit: { unlimited: false, daily: 3, remaining: 3 } });
    await askTimes(sara, 3);
    const refused = await ask(sara, "Fourth?");
    expect(refused.status).toBe(429);
    expect(refused.body.ask_limit).toMatchObject({ daily: 3, remaining: 0 });
  });

  it("raises it, even after the Reader has hit the limit today", async () => {
    const app = await askApp();
    const sara = await app.addReader("sara@example.com");
    const owner = await app.signInAsOwner();
    const id = await readerId(app, "sara@example.com");
    await askTimes(sara, 20);

    await owner.request("PATCH", `/api/readers/${id}/ask-limit`, { body: { daily_limit: 30 } });

    const more = await ask(sara, "Twenty-first?");
    expect(more.status).toBe(201);
    expect(more.body.ask_limit).toMatchObject({ daily: 30, used_today: 21, remaining: 9 });
  });

  it("sets it to 0 to stop a Reader asking, and null to go back to the default of 20", async () => {
    const app = await askApp();
    const sara = await app.addReader("sara@example.com");
    const owner = await app.signInAsOwner();
    const id = await readerId(app, "sara@example.com");

    await owner.request("PATCH", `/api/readers/${id}/ask-limit`, { body: { daily_limit: 0 } });
    expect((await ask(sara, "Can I?")).status).toBe(429);

    const reset = await owner.request("PATCH", `/api/readers/${id}/ask-limit`, { body: { daily_limit: null } });
    expect(reset.body.ask_limit).toMatchObject({ daily: 20, remaining: 20 });
    expect((await ask(sara, "Now?")).status).toBe(201);
  });

  it("shows every Reader's limit and today's usage to the Owner", async () => {
    const app = await askApp();
    const sara = await app.addReader("sara@example.com");
    await app.addReader("omar@example.com");
    const owner = await app.signInAsOwner();
    await askTimes(sara, 2);
    await askTimes(owner, 1);

    const usage = await owner.request("GET", "/api/owner/ask-usage");

    expect(usage.status).toBe(200);
    const byEmail = Object.fromEntries(
      usage.body.readers.map((r: { email: string; ask_limit: unknown }) => [r.email, r.ask_limit]),
    );
    expect(byEmail["sara@example.com"]).toMatchObject({ unlimited: false, daily: 20, used_today: 2, remaining: 18 });
    expect(byEmail["omar@example.com"]).toMatchObject({ unlimited: false, daily: 20, used_today: 0 });
    expect(byEmail["owner@example.com"]).toMatchObject({ unlimited: true, used_today: 1 });
  });

  it("is the Owner's alone", async () => {
    const app = await askApp();
    const sara = await app.addReader("sara@example.com");
    const id = await readerId(app, "sara@example.com");

    const bySara = await sara.request("PATCH", `/api/readers/${id}/ask-limit`, { body: { daily_limit: 100 } });
    const signedOut = await app.request("PATCH", `/api/readers/${id}/ask-limit`, { body: { daily_limit: 100 } });

    expect(bySara.status).toBe(403);
    expect(signedOut.status).toBe(401);
    expect((await sara.request("GET", "/api/owner/ask-usage")).status).toBe(403);
    expect((await app.request("GET", "/api/owner/ask-usage")).status).toBe(401);
    const status = await sara.request("GET", `/api/items/${ITEM}/ask`);
    expect(status.body.ask_limit.daily).toBe(20);
  });

  it("refuses a bad limit, an unknown Reader and a limit for the Owner", async () => {
    const app = await askApp();
    await app.addReader("sara@example.com");
    const owner = await app.signInAsOwner();
    const id = await readerId(app, "sara@example.com");
    const ownerId = await readerId(app, "owner@example.com");
    const patch = (rid: number | string, body: unknown) =>
      owner.request("PATCH", `/api/readers/${rid}/ask-limit`, { body });

    expect((await patch(id, { daily_limit: -1 })).status).toBe(400);
    expect((await patch(id, { daily_limit: 2.5 })).status).toBe(400);
    expect((await patch(id, { daily_limit: "10" })).status).toBe(400);
    expect((await patch(id, {})).status).toBe(400);
    expect((await patch(9999, { daily_limit: 5 })).status).toBe(404);
    expect((await patch("abc", { daily_limit: 5 })).status).toBe(404);
    expect((await patch(ownerId, { daily_limit: 5 })).status).toBe(400);
  });
});
