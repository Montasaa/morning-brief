// Story Threads (ticket 14): a developing story followed across Editions. Each
// development is its own Item linked to the Thread (by the Edition's
// `thread_id`), so the Thread reads as a dated timeline. Readers follow
// Threads; the Threads tab lists the followed ones first, then the active ones.
import { describe, expect, it } from "vitest";
import { morningEdition, type EditionDoc } from "../support/fixtures";
import { startTestApp, type TestSession } from "../support/test-app";

type TimelineItem = { id: string; time: string; date: string; title: string; edition_id: string; blurred: boolean };
type ThreadSummary = { id: string; title: string; followed: boolean; active: boolean; count: number };

const ids = (items: { id: string }[]) => items.map((i) => i.id);

/** The fixture's evening Edition: the morning's Items carried over, plus a new development on the Yemen truce Thread. */
function eveningEdition(): EditionDoc {
  const edition = morningEdition();
  edition.edition_id = "2026-11-14-evening";
  edition.kind = "evening";
  edition.generated_at = "2026-11-14T19:15:00+03:00";
  edition.items.push({
    id: "me-yemen-prisoner-swap",
    topics: ["yemen"],
    thread_id: "yemen-truce-talks",
    status: "new",
    time: "2026-11-14T17:30:00+03:00",
    title: "Both sides agree a prisoner exchange",
    title_ar: "الطرفان يتفقان على تبادل الأسرى",
    summary: "The exchange is the first concrete result of the renewed talks.",
    sources: [{ title: "Example Wire", url: "https://example.com/wire/swap", type: "wire" }],
  });
  return edition;
}

/** The next morning's Edition: the old Thread Items are no longer carried, a third development is. */
function nextMorningEdition(): EditionDoc {
  const edition = morningEdition();
  edition.edition_id = "2026-11-15-morning";
  edition.generated_at = "2026-11-15T06:05:00+03:00";
  edition.items = edition.items.filter((i) => i.thread_id !== "yemen-truce-talks");
  edition.top_stories = ["ai-open-model-release"];
  edition.items.push({
    id: "me-yemen-port-reopens",
    topics: ["yemen", "saudi"],
    thread_id: "yemen-truce-talks",
    status: "new",
    time: "2026-11-15T04:00:00+03:00",
    title: "Hodeidah port reopens to grain ships",
    summary: "The first ship docked before dawn.",
    sources: [{ title: "Example Daily", url: "https://example.com/daily/port", type: "independent" }],
  });
  return edition;
}

async function following(session: TestSession, topics: string[]): Promise<TestSession> {
  const res = await session.request("PATCH", "/api/me", { body: { topics, onboarded: true } });
  expect(res.status, res.text).toBe(200);
  return session;
}

describe("GET /api/threads/{id}: the Thread's timeline", () => {
  it("lists the Thread's Items newest first, with dates, across Editions", async () => {
    const app = await startTestApp();
    await app.postEdition(morningEdition());
    await app.postEdition(eveningEdition());
    await app.postEdition(nextMorningEdition());
    const owner = await app.signInAsOwner();

    const res = await owner.request("GET", "/api/threads/yemen-truce-talks");

    expect(res.status, res.text).toBe(200);
    expect(res.body.thread).toMatchObject({
      id: "yemen-truce-talks",
      title: "Yemen truce talks",
      title_ar: "محادثات الهدنة في اليمن",
      followed: false,
      count: 3,
    });
    const items = res.body.items as TimelineItem[];
    expect(ids(items)).toEqual(["me-yemen-port-reopens", "me-yemen-prisoner-swap", "me-yemen-port-talks"]);
    expect(items.map((i) => [i.date, i.time, i.edition_id])).toEqual([
      ["2026-11-15", "2026-11-15T04:00:00+03:00", "2026-11-15-morning"],
      ["2026-11-14", "2026-11-14T17:30:00+03:00", "2026-11-14-evening"],
      // Carried over into the evening Edition, so that is the version kept.
      ["2026-11-14", "2026-11-14T05:40:00+03:00", "2026-11-14-evening"],
    ]);
    expect(items[1]).toMatchObject({
      title: "Both sides agree a prisoner exchange",
      title_ar: "الطرفان يتفقان على تبادل الأسرى",
      sources: [{ title: "Example Wire", url: "https://example.com/wire/swap", type: "wire" }],
    });
  });

  it("keeps each development as its own Item, so earlier facts are never overwritten", async () => {
    const app = await startTestApp();
    await app.postEdition(morningEdition());
    await app.postEdition(eveningEdition());
    const owner = await app.signInAsOwner();

    const items = (await owner.request("GET", "/api/threads/yemen-truce-talks")).body.items as TimelineItem[];

    expect(items.find((i) => i.id === "me-yemen-port-talks")?.title).toBe("Truce talks resume over Hodeidah port access");
    expect(items.find((i) => i.id === "me-yemen-prisoner-swap")?.title).toBe("Both sides agree a prisoner exchange");
  });

  it("is 404 for a Thread no Edition has carried, and 401 signed out", async () => {
    const app = await startTestApp();
    await app.postEdition(morningEdition());
    const owner = await app.signInAsOwner();

    expect((await owner.request("GET", "/api/threads/no-such-thread")).status).toBe(404);
    expect((await app.request("GET", "/api/threads/yemen-truce-talks")).status).toBe(401);
    expect((await app.request("GET", "/api/threads")).status).toBe(401);
    expect((await app.request("POST", "/api/threads/yemen-truce-talks/follow")).status).toBe(401);
  });
});

describe("POST /api/threads/{id}/follow and /unfollow", () => {
  it("follow and unfollow a Thread, saying it twice changes nothing, and it stays private to the Reader", async () => {
    const app = await startTestApp();
    await app.postEdition(morningEdition());
    const owner = await app.signInAsOwner();
    const sara = await app.addReader("sara@example.com");

    const followed = await sara.request("POST", "/api/threads/yemen-truce-talks/follow");
    expect(followed.status, followed.text).toBe(200);
    expect(followed.body.thread).toMatchObject({ id: "yemen-truce-talks", followed: true, count: 1 });
    expect((await sara.request("POST", "/api/threads/yemen-truce-talks/follow")).body.thread.followed).toBe(true);
    expect((await sara.request("GET", "/api/threads/yemen-truce-talks")).body.thread.followed).toBe(true);
    expect((await owner.request("GET", "/api/threads/yemen-truce-talks")).body.thread.followed).toBe(false);

    const unfollowed = await sara.request("POST", "/api/threads/yemen-truce-talks/unfollow");
    expect(unfollowed.status).toBe(200);
    expect(unfollowed.body.thread.followed).toBe(false);
    expect((await sara.request("POST", "/api/threads/yemen-truce-talks/unfollow")).status).toBe(200);
    expect((await sara.request("GET", "/api/threads/yemen-truce-talks")).body.thread.followed).toBe(false);
  });

  it("refuses a Thread that does not exist", async () => {
    const app = await startTestApp();
    await app.postEdition(morningEdition());
    const owner = await app.signInAsOwner();

    expect((await owner.request("POST", "/api/threads/no-such-thread/follow")).status).toBe(404);
    expect((await owner.request("POST", "/api/threads/no-such-thread/unfollow")).status).toBe(404);
  });
});

/** Two Threads besides the fixture's: one only in an old Edition, one in the latest. */
function editionsWithThreeThreads(): EditionDoc[] {
  const old = morningEdition();
  old.edition_id = "2026-11-10-morning";
  old.generated_at = "2026-11-10T06:05:00+03:00";
  old.threads.push({ id: "lfc-transfer-saga", title: "Liverpool's striker search", title_ar: "بحث ليفربول عن مهاجم" });
  old.items.push({
    id: "lfc-striker-bid",
    topics: ["liverpool"],
    thread_id: "lfc-transfer-saga",
    time: "2026-11-10T05:00:00+03:00",
    title: "Club lodges a bid for a striker",
    summary: "A first offer was turned down.",
    sources: [{ title: "Example FC", url: "https://example.com/club/bid", type: "official" }],
  });

  const latest = eveningEdition();
  latest.threads.push({ id: "ai-chip-race", title: "The AI chip race", title_ar: "سباق رقائق الذكاء الاصطناعي" });
  latest.items.push({
    id: "ai-chip-export-rules",
    topics: ["ai", "us-markets"],
    thread_id: "ai-chip-race",
    time: "2026-11-14T18:00:00+03:00",
    title: "New export rules for AI chips",
    summary: "The rules take effect next month.",
    sources: [{ title: "Example Tech", url: "https://example.com/tech/chips", type: "independent" }],
  });
  return [old, latest];
}

describe("GET /api/threads: the Threads tab", () => {
  it("lists the Threads the Reader follows first, then the active ones, newest development first", async () => {
    const app = await startTestApp();
    for (const edition of editionsWithThreeThreads()) await app.postEdition(edition);
    const owner = await app.signInAsOwner();

    // Not followed: only the active Threads (carried by the latest Edition), the AI chip race (18:00) before Yemen (17:30).
    let threads = (await owner.request("GET", "/api/threads")).body.threads as ThreadSummary[];
    expect(threads.map((t) => [t.id, t.followed, t.active, t.count])).toEqual([
      ["ai-chip-race", false, true, 1],
      ["yemen-truce-talks", false, true, 2],
    ]);
    expect(threads[1]).toMatchObject({
      title: "Yemen truce talks",
      title_ar: "محادثات الهدنة في اليمن",
      latest: { id: "me-yemen-prisoner-swap", title: "Both sides agree a prisoner exchange", time: "2026-11-14T17:30:00+03:00" },
    });

    // A followed Thread is listed first, even when no longer active.
    await owner.request("POST", "/api/threads/lfc-transfer-saga/follow");
    await owner.request("POST", "/api/threads/yemen-truce-talks/follow");
    threads = (await owner.request("GET", "/api/threads")).body.threads as ThreadSummary[];
    expect(threads.map((t) => [t.id, t.followed, t.active])).toEqual([
      ["yemen-truce-talks", true, true],
      ["lfc-transfer-saga", true, false],
      ["ai-chip-race", false, true],
    ]);
  });

  it("is empty before any Edition", async () => {
    const app = await startTestApp();
    const owner = await app.signInAsOwner();

    const res = await owner.request("GET", "/api/threads");

    expect(res.status).toBe(200);
    expect(res.body.threads).toEqual([]);
  });
});

describe("Thread contents respect Topic following and sensitive opt-ins", () => {
  /** The evening Edition plus a graphic development on the Yemen Thread. */
  function eveningWithGraphicDevelopment(): EditionDoc {
    const edition = eveningEdition();
    edition.items.push({
      id: "me-yemen-strike-aftermath",
      topics: ["yemen", "graphic"],
      thread_id: "yemen-truce-talks",
      time: "2026-11-14T12:00:00+03:00",
      title: "Strike aftermath near the port",
      summary: "Casualties were reported after the strike.",
      sources: [{ title: "Example News", url: "https://example.com/news/strike", type: "independent" }],
      warning: "Casualties",
      warning_ar: "ضحايا",
    });
    return edition;
  }

  it("shows only Items carrying a Topic the Reader follows, and hides Threads they can see none of", async () => {
    const app = await startTestApp();
    await app.postEdition(morningEdition());
    await app.postEdition(eveningEdition());
    const sara = await following(await app.addReader("sara@example.com", { onboarded: false }), ["saudi"]);

    // Only the port talks carry Saudi; the prisoner swap is Yemen only.
    const res = await sara.request("GET", "/api/threads/yemen-truce-talks");
    expect(ids(res.body.items)).toEqual(["me-yemen-port-talks"]);
    expect(res.body.items[0].topic).toBe("saudi");
    expect(res.body.thread.count).toBe(1);

    await sara.request("POST", "/api/topics/yemen/follow");
    expect(ids((await sara.request("GET", "/api/threads/yemen-truce-talks")).body.items)).toEqual([
      "me-yemen-prisoner-swap",
      "me-yemen-port-talks",
    ]);

    await sara.request("PATCH", "/api/me", { body: { topics: ["liverpool"] } });
    expect((await sara.request("GET", "/api/threads/yemen-truce-talks")).status).toBe(404);
    expect((await sara.request("POST", "/api/threads/yemen-truce-talks/follow")).status).toBe(404);
    expect((await sara.request("GET", "/api/threads")).body.threads).toEqual([]);
  });

  it("leaves out sensitive Items until the Reader opts in, then shows them blurred", async () => {
    const app = await startTestApp();
    await app.postEdition(eveningWithGraphicDevelopment());
    const sara = await following(await app.addReader("sara@example.com", { onboarded: false }), ["yemen"]);

    const before = await sara.request("GET", "/api/threads/yemen-truce-talks");
    expect(ids(before.body.items)).toEqual(["me-yemen-prisoner-swap", "me-yemen-port-talks"]);
    expect(before.body.thread.count).toBe(2);

    await sara.request("POST", "/api/topics/graphic/follow"); // opting into Graphic, from the Me tab
    const after = await sara.request("GET", "/api/threads/yemen-truce-talks");
    expect(ids(after.body.items)).toEqual(["me-yemen-prisoner-swap", "me-yemen-strike-aftermath", "me-yemen-port-talks"]);
    expect((after.body.items as TimelineItem[]).map((i) => i.blurred)).toEqual([false, true, false]);
    expect(after.body.items[1]).toMatchObject({ warning: "Casualties", warning_ar: "ضحايا" });
  });

  it("marks the newest development blurred on the Threads tab when it is sensitive", async () => {
    const app = await startTestApp();
    const edition = morningEdition();
    edition.items.push({
      id: "me-yemen-strike-aftermath",
      topics: ["yemen", "graphic"],
      thread_id: "yemen-truce-talks",
      time: "2026-11-14T06:00:00+03:00",
      title: "Strike aftermath near the port",
      summary: "Casualties were reported after the strike.",
      sources: [{ title: "Example News", url: "https://example.com/news/strike", type: "independent" }],
      warning: "Casualties",
    });
    await app.postEdition(edition);
    const owner = await app.signInAsOwner(); // opted into every Sensitive Topic

    const tab = (await owner.request("GET", "/api/threads")).body.threads;
    expect(tab[0].latest).toMatchObject({ id: "me-yemen-strike-aftermath", blurred: true, warning: "Casualties" });
    expect((await owner.request("GET", "/api/brief")).body.threads["yemen-truce-talks"].latest.blurred).toBe(true);

    await owner.request("POST", "/api/topics/graphic/unfollow"); // opting out: the plain development is the newest again
    const after = (await owner.request("GET", "/api/threads")).body.threads;
    expect(after[0].latest).toMatchObject({ id: "me-yemen-port-talks", blurred: false });
  });

  it("never lists or opens a Thread made only of sensitive Items the Reader has not opted into", async () => {
    const app = await startTestApp();
    const edition = morningEdition();
    edition.threads.push({ id: "flood-recovery", title: "Flood recovery", title_ar: "التعافي من الفيضانات" });
    edition.items.find((i) => i.id === "graphic-flood-aftermath")!.thread_id = "flood-recovery";
    edition.items.find((i) => i.id === "graphic-flood-aftermath")!.topics = ["graphic", "wider-middle-east"];
    await app.postEdition(edition);
    const sara = await following(await app.addReader("sara@example.com", { onboarded: false }), ["wider-middle-east"]);

    expect((await sara.request("GET", "/api/threads/flood-recovery")).status).toBe(404);
    expect(((await sara.request("GET", "/api/threads")).body.threads as ThreadSummary[]).map((t) => t.id)).toEqual([]);
  });
});

describe("Threads and Reader-created Topics", () => {
  async function createTopic(reader: TestSession, body: { name: string; name_ar?: string }): Promise<string> {
    const res = await reader.request("POST", "/api/topics", { body });
    expect(res.status, res.text).toBe(201);
    return res.body.topic.id as string;
  }

  /** The morning Edition with `topicId` on the port talks, and a later Yemen development tagged only with it. */
  function editionWithPrivateTopic(topicId: string): EditionDoc {
    const edition = morningEdition();
    edition.items.find((i) => i.id === "me-yemen-port-talks")!.topics.push(topicId);
    edition.items.push({
      id: "me-yemen-clinic-private",
      topics: [topicId],
      thread_id: "yemen-truce-talks",
      time: "2026-11-14T06:30:00+03:00",
      title: "A clinic reopens near the port",
      summary: "Only the Topic's creator should ever see this.",
      sources: [{ title: "Example Health", url: "https://example.com/health/clinic", type: "independent" }],
    });
    return edition;
  }

  it("never shows another Reader's private Topic, on an Item or as a development of its own", async () => {
    const app = await startTestApp();
    const reem = await app.addReader("reem@example.com");
    const sara = await app.addReader("sara@example.com");
    const topicId = await createTopic(reem, { name: "Fertility Treatment" });
    await app.postEdition(editionWithPrivateTopic(topicId));

    const timeline = (await sara.request("GET", "/api/threads/yemen-truce-talks")).body;
    expect(ids(timeline.items)).toEqual(["me-yemen-port-talks"]);
    expect(timeline.items[0].topics).toEqual(["yemen", "saudi"]);
    expect(timeline.topic_names).not.toHaveProperty(topicId);
    expect(timeline.topic_names_ar).not.toHaveProperty(topicId);
    expect(timeline.thread).toMatchObject({ count: 1, latest: { id: "me-yemen-port-talks" } });

    const tab = (await sara.request("GET", "/api/threads")).body.threads as ThreadSummary[];
    expect(tab).toEqual([expect.objectContaining({ id: "yemen-truce-talks", count: 1 })]);
    expect((await sara.request("GET", "/api/brief")).body.threads["yemen-truce-talks"].count).toBe(1);

    // Its creator sees both, with the Topic named.
    const own = (await reem.request("GET", "/api/threads/yemen-truce-talks")).body;
    expect(ids(own.items)).toEqual(["me-yemen-clinic-private", "me-yemen-port-talks"]);
    expect(own.topic_names[topicId]).toBe("Fertility Treatment");
  });

  it("names a Reader-created Topic as the Catalog does, in English and Arabic", async () => {
    const app = await startTestApp();
    const reem = await app.addReader("reem@example.com");
    const topicId = await createTopic(reem, { name: "COVID-19 & Health", name_ar: "كوفيد-19 والصحة" });
    await app.postEdition(editionWithPrivateTopic(topicId));

    const timeline = (await reem.request("GET", "/api/threads/yemen-truce-talks")).body;

    expect(timeline.topic_names[topicId]).toBe("COVID-19 & Health");
    expect(timeline.topic_names_ar[topicId]).toBe("كوفيد-19 والصحة");
    expect(timeline.topic_names_ar.yemen).toBe("اليمن");
  });
});

describe("GET /api/brief: the Thread chip on cards", () => {
  it("gives each Thread on the Brief its title, how many developments the Reader can see, and whether they follow it", async () => {
    const app = await startTestApp();
    await app.postEdition(morningEdition());
    await app.postEdition(nextMorningEdition()); // carries only the newest development; the morning's is in history
    const owner = await app.signInAsOwner();

    let brief = (await owner.request("GET", "/api/brief")).body;
    expect(brief.items.find((i: { id: string }) => i.id === "me-yemen-port-reopens").thread_id).toBe("yemen-truce-talks");
    expect(brief.threads).toEqual({
      "yemen-truce-talks": expect.objectContaining({
        id: "yemen-truce-talks",
        title: "Yemen truce talks",
        title_ar: "محادثات الهدنة في اليمن",
        count: 2,
        followed: false,
      }),
    });

    await owner.request("POST", "/api/threads/yemen-truce-talks/follow");
    brief = (await owner.request("GET", "/api/brief")).body;
    expect(brief.threads["yemen-truce-talks"].followed).toBe(true);
  });

  it("has no Threads when no Item on the Brief belongs to one", async () => {
    const app = await startTestApp();
    await app.postEdition(morningEdition());
    const sara = await following(await app.addReader("sara@example.com", { onboarded: false }), ["liverpool"]);

    expect((await sara.request("GET", "/api/brief")).body.threads).toEqual({});
  });
});
