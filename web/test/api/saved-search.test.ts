// Saved & Search (ticket 15): the Reader's saved Items (GET /api/saved),
// newest-saved first, and search across every Edition ever posted
// (GET /api/search?q=) in English or Arabic. Both show each Item's date, Topic
// and Story Thread, and both follow the same rules as the Brief: a sensitive
// Item reaches only a Reader who opted into its Sensitive Topics (blurred), and
// a Reader's Reactions are their own.
import { afterEach, describe, expect, it, vi } from "vitest";
import { morningEdition, type EditionDoc } from "../support/fixtures";
import { startTestApp, type TestApp, type TestSession } from "../support/test-app";

type ListedItem = {
  id: string;
  time: string;
  topic: string;
  thread: { id: string; title: string; title_ar: string } | null;
  blurred: boolean;
  reactions: { like: boolean; save: boolean };
};

afterEach(() => {
  vi.useRealTimers();
});

async function savedOf(session: TestSession): Promise<ListedItem[]> {
  const res = await session.request("GET", "/api/saved");
  expect(res.status, res.text).toBe(200);
  return res.body.items as ListedItem[];
}

async function search(session: TestSession, q: string): Promise<ListedItem[]> {
  const res = await session.request("GET", `/api/search?q=${encodeURIComponent(q)}`);
  expect(res.status, res.text).toBe(200);
  return res.body.results as ListedItem[];
}

const ids = (items: ListedItem[]) => items.map((i) => i.id);

async function save(session: TestSession, itemId: string): Promise<void> {
  const res = await session.request("POST", `/api/items/${itemId}/reactions`, { body: { kind: "save" } });
  expect(res.status, res.text).toBe(200);
}

/** A Reader who finished onboarding following exactly `topics` (no Sensitive Topics). */
async function readerFollowing(app: TestApp, email: string, topics: string[]): Promise<TestSession> {
  const session = await app.addReader(email, { onboarded: false });
  const res = await session.request("PATCH", "/api/me", { body: { topics, onboarded: true } });
  expect(res.status, res.text).toBe(200);
  return session;
}

describe("Saved", () => {
  it("lists the Reader's saved Items newest-saved first, and unsaving removes one", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-14T08:00:00+03:00"));
    const app = await startTestApp();
    await app.postEdition(morningEdition());
    const owner = await app.signInAsOwner();

    expect(await savedOf(owner)).toEqual([]);

    await save(owner, "ai-open-model-release");
    vi.setSystemTime(new Date("2026-11-14T08:05:00+03:00"));
    await save(owner, "lfc-midfielder-fitness");
    vi.setSystemTime(new Date("2026-11-14T08:10:00+03:00"));
    await save(owner, "me-yemen-port-talks");

    expect(ids(await savedOf(owner))).toEqual(["me-yemen-port-talks", "lfc-midfielder-fitness", "ai-open-model-release"]);

    const unsaved = await owner.request("DELETE", "/api/items/lfc-midfielder-fitness/reactions/save");
    expect(unsaved.status).toBe(200);
    expect(ids(await savedOf(owner))).toEqual(["me-yemen-port-talks", "ai-open-model-release"]);
  });

  it("shows each saved Item's date, Topic and Story Thread", async () => {
    const app = await startTestApp();
    await app.postEdition(morningEdition());
    const sara = await readerFollowing(app, "sara@example.com", ["saudi", "ai"]);
    await save(sara, "me-yemen-port-talks");
    await save(sara, "ai-open-model-release");

    const res = await sara.request("GET", "/api/saved");
    expect(res.body.items[0]).toMatchObject({
      id: "ai-open-model-release",
      time: "2026-11-13T22:10:00+03:00",
      topic: "ai",
      thread: null,
      reactions: { like: false, save: true },
    });
    expect(res.body.items[1]).toMatchObject({
      id: "me-yemen-port-talks",
      title: "Truce talks resume over Hodeidah port access",
      title_ar: "استئناف محادثات الهدنة بشأن الوصول إلى ميناء الحديدة",
      time: "2026-11-14T05:40:00+03:00",
      // Its first Topic is Yemen, but Sara follows Saudi.
      topic: "saudi",
      topics: ["yemen", "saudi"],
      thread: { id: "yemen-truce-talks", title: "Yemen truce talks", title_ar: "محادثات الهدنة في اليمن" },
    });
    expect(res.body.topic_names).toMatchObject({ saudi: "Saudi", yemen: "Yemen", ai: "AI" });
    expect(res.body.topic_names_ar).toMatchObject({ saudi: "السعودية", ai: "الذكاء الاصطناعي" });
  });

  it("keeps Items saved from older Editions after newer Editions leave them out", async () => {
    const app = await startTestApp();
    await app.postEdition(morningEdition());
    const owner = await app.signInAsOwner();
    await save(owner, "gh-terminal-agent");

    const evening = morningEdition();
    evening.edition_id = "2026-11-14-evening";
    evening.kind = "evening";
    evening.generated_at = "2026-11-14T19:20:00+03:00";
    evening.items = evening.items.filter((i) => i.id !== "gh-terminal-agent");
    expect((await app.postEdition(evening)).status).toBe(200);

    const brief = await owner.request("GET", "/api/brief");
    expect(brief.body.items.map((i: { id: string }) => i.id)).not.toContain("gh-terminal-agent");
    expect(ids(await savedOf(owner))).toEqual(["gh-terminal-agent"]);
  });

  it("is private to each Reader", async () => {
    const app = await startTestApp();
    await app.postEdition(morningEdition());
    const owner = await app.signInAsOwner();
    const sara = await app.addReader("sara@example.com");
    await save(owner, "ai-open-model-release");
    await save(sara, "lfc-midfielder-fitness");

    expect(ids(await savedOf(owner))).toEqual(["ai-open-model-release"]);
    expect(ids(await savedOf(sara))).toEqual(["lfc-midfielder-fitness"]);
  });

  it("lists a saved sensitive Item, blurred, only while the Reader is opted in", async () => {
    const app = await startTestApp();
    await app.postEdition(morningEdition());
    const owner = await app.signInAsOwner(); // opted into Graphic
    await save(owner, "graphic-flood-aftermath");
    await save(owner, "ai-open-model-release");

    expect((await savedOf(owner)).map((i) => [i.id, i.blurred])).toEqual([
      ["ai-open-model-release", false],
      ["graphic-flood-aftermath", true],
    ]);

    await owner.request("POST", "/api/topics/graphic/unfollow");
    expect(ids(await savedOf(owner))).toEqual(["ai-open-model-release"]);

    await owner.request("POST", "/api/topics/graphic/follow");
    expect(ids(await savedOf(owner))).toEqual(["ai-open-model-release", "graphic-flood-aftermath"]);
  });

  it("needs a signed-in Reader", async () => {
    const app = await startTestApp();
    expect((await app.request("GET", "/api/saved")).status).toBe(401);
  });
});

/** An Edition of the given Items (and the morning fixture's Story Thread). */
function edition(edition_id: string, generated_at: string, items: EditionDoc["items"]): EditionDoc {
  const doc = morningEdition();
  doc.edition_id = edition_id;
  doc.kind = edition_id.endsWith("evening") ? "evening" : "morning";
  doc.generated_at = generated_at;
  doc.items = items;
  delete doc.top_stories;
  return doc;
}

const item = (fields: Record<string, unknown>) => ({
  sources: [{ title: "Example Wire", url: `https://example.com/wire/${String(fields.id)}`, type: "wire" }],
  ...fields,
});

/** Three Editions on three days: the 12th, the 13th and the fixture's morning of the 14th. */
async function postThreeDays(app: TestApp): Promise<void> {
  const twelfth = edition("2026-11-12-morning", "2026-11-12T06:05:00+03:00", [
    item({
      id: "yemen-hodeidah-ceasefire",
      topics: ["yemen"],
      thread_id: "yemen-truce-talks",
      time: "2026-11-12T05:00:00+03:00",
      title: "Ceasefire agreed around Hodeidah port",
      title_ar: "الاتفاق على وقف إطلاق النار حول ميناء الحديدة",
      summary: "Both sides signed the first stage of the truce.",
      summary_ar: "وقّع الطرفان المرحلة الأولى من الهدنة.",
    }),
    item({
      id: "iran-oil-exports",
      topics: ["iran"],
      time: "2026-11-12T04:00:00+03:00",
      title: "Oil exports climb to a six-year high",
      title_ar: "إيران ترفع صادرات النفط إلى أعلى مستوى منذ ست سنوات",
      summary: "Tanker tracking shows record loadings.",
      summary_ar: "تظهر بيانات تتبع الناقلات شحنات قياسية.",
    }),
  ]);
  const thirteenth = edition("2026-11-13-evening", "2026-11-13T19:20:00+03:00", [
    item({
      id: "saudi-jeddah-port",
      topics: ["saudi"],
      time: "2026-11-13T18:00:00+03:00",
      title: "Jeddah port expansion opens to shipping",
      title_ar: "افتتاح توسعة ميناء جدة أمام الشحن",
      summary: "The new terminal doubles container capacity.",
      summary_ar: "تضاعف المحطة الجديدة طاقة الحاويات.",
    }),
  ]);
  for (const doc of [twelfth, thirteenth, morningEdition()]) {
    const res = await app.postEdition(doc);
    expect(res.status, res.text).toBe(200);
  }
}

describe("Search", () => {
  it("finds Items by English words across every Edition, newest first", async () => {
    const app = await startTestApp();
    await postThreeDays(app);
    const owner = await app.signInAsOwner();

    expect(ids(await search(owner, "port"))).toEqual(["me-yemen-port-talks", "saudi-jeddah-port", "yemen-hodeidah-ceasefire"]);
    expect(ids(await search(owner, "Hodeidah"))).toEqual(["me-yemen-port-talks", "yemen-hodeidah-ceasefire"]);
    // Every word must match, in the title or the summary.
    expect(ids(await search(owner, "hodeidah ceasefire"))).toEqual(["yemen-hodeidah-ceasefire"]);
    expect(ids(await search(owner, "TANKER"))).toEqual(["iran-oil-exports"]);
    // A word's beginning is enough.
    expect(ids(await search(owner, "expan"))).toEqual(["saudi-jeddah-port"]);
    expect(await search(owner, "volcano")).toEqual([]);
  });

  it("finds Items by Arabic words across every Edition", async () => {
    const app = await startTestApp();
    await postThreeDays(app);
    const owner = await app.signInAsOwner();

    expect(ids(await search(owner, "ميناء"))).toEqual(["me-yemen-port-talks", "saudi-jeddah-port", "yemen-hodeidah-ceasefire"]);
    expect(ids(await search(owner, "الحديدة"))).toEqual(["me-yemen-port-talks", "yemen-hodeidah-ceasefire"]);
    expect(ids(await search(owner, "الحديدة الهدنة"))).toEqual(["me-yemen-port-talks", "yemen-hodeidah-ceasefire"]);
    expect(ids(await search(owner, "وقف الحديدة"))).toEqual(["yemen-hodeidah-ceasefire"]);
    // In the summary too.
    expect(ids(await search(owner, "الناقلات"))).toEqual(["iran-oil-exports"]);
  });

  it("matches Arabic words however the Reader spells the hamza, the article or the vowel marks", async () => {
    const app = await startTestApp();
    await postThreeDays(app);
    const owner = await app.signInAsOwner();

    // Stored as إيران.
    expect(ids(await search(owner, "ايران"))).toEqual(["iran-oil-exports"]);
    // Stored as الحديدة, with the article.
    expect(ids(await search(owner, "حديدة"))).toEqual(["me-yemen-port-talks", "yemen-hodeidah-ceasefire"]);
    // Stored as وقّع, with a shadda; typed with vowel marks the text does not have.
    expect(ids(await search(owner, "وقع"))).toEqual(["yemen-hodeidah-ceasefire"]);
    expect(ids(await search(owner, "مِيناءِ جدة"))).toEqual(["saudi-jeddah-port"]);
  });

  it("shows each result's date, Topic and Story Thread", async () => {
    const app = await startTestApp();
    await postThreeDays(app);
    const sara = await readerFollowing(app, "sara@example.com", ["saudi", "ai"]);

    const res = await sara.request("GET", `/api/search?q=${encodeURIComponent("Hodeidah")}`);
    expect(res.status).toBe(200);
    expect(res.body.query).toBe("Hodeidah");
    expect(res.body.results).toMatchObject([
      {
        id: "me-yemen-port-talks",
        time: "2026-11-14T05:40:00+03:00",
        topic: "saudi", // the Topic Sara follows
        thread: { id: "yemen-truce-talks", title: "Yemen truce talks", title_ar: "محادثات الهدنة في اليمن" },
      },
      {
        id: "yemen-hodeidah-ceasefire",
        time: "2026-11-12T05:00:00+03:00",
        topic: "yemen", // Sara does not follow Yemen: its first Topic
        thread: { id: "yemen-truce-talks" },
      },
    ]);
    expect(res.body.topic_names).toMatchObject({ yemen: "Yemen", saudi: "Saudi" });
    expect(res.body.topic_names_ar).toMatchObject({ yemen: "اليمن", saudi: "السعودية" });
  });

  it("finds an Item by its newest wording, not words a later Edition replaced", async () => {
    const app = await startTestApp();
    await app.postEdition(morningEdition());
    const owner = await app.signInAsOwner();
    expect(ids(await search(owner, "resume"))).toEqual(["me-yemen-port-talks"]);

    const evening = morningEdition();
    evening.edition_id = "2026-11-14-evening";
    evening.kind = "evening";
    evening.generated_at = "2026-11-14T19:20:00+03:00";
    evening.items[0]!.status = "updated";
    evening.items[0]!.title = "Truce talks stall over Hodeidah port access";
    evening.items[0]!.title_ar = "تعثر محادثات الهدنة بشأن ميناء الحديدة";
    expect((await app.postEdition(evening)).status).toBe(200);

    expect(ids(await search(owner, "stall"))).toEqual(["me-yemen-port-talks"]);
    expect(ids(await search(owner, "تعثر"))).toEqual(["me-yemen-port-talks"]);
    expect(await search(owner, "resume")).toEqual([]);
  });

  it("finds sensitive Items, blurred, only for Readers who opted in", async () => {
    const app = await startTestApp();
    await app.postEdition(morningEdition());
    const owner = await app.signInAsOwner(); // opted into Graphic
    const sara = await app.addReader("sara@example.com");
    await sara.request("POST", "/api/topics/graphic/unfollow");

    expect((await search(owner, "flood")).map((i) => [i.id, i.blurred])).toEqual([["graphic-flood-aftermath", true]]);
    expect(await search(sara, "flood")).toEqual([]);
    expect((await search(sara, "talks")).map((i) => [i.id, i.blurred])).toEqual([["me-yemen-port-talks", false]]);
  });

  it("never finds Items whose Topics are not in the Catalog", async () => {
    const app = await startTestApp();
    await app.postEdition(
      edition("2026-11-14-morning", "2026-11-14T06:05:00+03:00", [
        item({ id: "f1-port-race", topics: ["formula-1"], time: "2026-11-14T05:00:00+03:00", title: "Night race at the port circuit", summary: "Practice starts on Friday." }),
        item({ id: "saudi-port", topics: ["saudi"], time: "2026-11-14T04:00:00+03:00", title: "Port fees cut", summary: "Shipping lines welcome the change." }),
      ]),
    );
    const owner = await app.signInAsOwner();
    expect(ids(await search(owner, "port"))).toEqual(["saudi-port"]);
  });

  it("marks only the searching Reader's own Saves and Likes", async () => {
    const app = await startTestApp();
    await app.postEdition(morningEdition());
    const owner = await app.signInAsOwner();
    const sara = await app.addReader("sara@example.com");
    await save(owner, "me-yemen-port-talks");
    await owner.request("POST", "/api/items/me-yemen-port-talks/reactions", { body: { kind: "like" } });

    expect((await search(owner, "Hodeidah"))[0]!.reactions).toEqual({ like: true, save: true });
    expect((await search(sara, "Hodeidah"))[0]!.reactions).toEqual({ like: false, save: false });
  });

  it("returns nothing for an empty query, and treats search syntax as plain words", async () => {
    const app = await startTestApp();
    await app.postEdition(morningEdition());
    const owner = await app.signInAsOwner();

    expect(await search(owner, "")).toEqual([]);
    expect(await search(owner, "   ")).toEqual([]);
    expect((await owner.request("GET", "/api/search")).body.results).toEqual([]);
    expect(ids(await search(owner, '"Hodeidah" OR (NOT* talks'))).toEqual([]);
    expect(ids(await search(owner, 'hodeidah: "port"'))).toEqual(["me-yemen-port-talks"]);
  });

  it("needs a signed-in Reader", async () => {
    const app = await startTestApp();
    expect((await app.request("GET", "/api/search?q=port")).status).toBe(401);
  });
});
