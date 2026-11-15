// A Reader's Display (rework ticket 07, spec #6): how their Brief looks and is
// arranged, kept on the server so it follows them to every device. It is part
// of the Interest Profile surface: GET /api/me returns it as `display`, and
// PATCH /api/me {display: {...}} changes only the keys it sends. It never
// changes what is in the Brief or how it ranks (tickets 09 and 11 test that).
import { describe, expect, it } from "vitest";
import { morningEdition } from "../support/fixtures";
import { startTestApp, type TestApp, type TestSession } from "../support/test-app";

const DEFAULTS = {
  layouts: {},
  theme: "auto",
  accent: "amber",
  text_size: "m",
  density: "comfortable",
  topic_order: [],
  pinned: [],
  collapsed: [],
  widgets: ["weather", "prayer_times", "next_match", "countdown"],
  dock: ["like", "save", "ask", "hide"],
  unblurred: [],
};

async function displayOf(session: TestSession) {
  const res = await session.request("GET", "/api/me");
  expect(res.status, res.text).toBe(200);
  return res.body.display;
}

async function patchDisplay(session: TestSession, display: unknown) {
  return session.request("PATCH", "/api/me", { body: { display } });
}

/** A Reader following exactly `topics` (no Sensitive Topics yet). */
async function readerFollowing(app: TestApp, email: string, topics: string[]): Promise<TestSession> {
  const session = await app.addReader(email, { onboarded: false });
  const res = await session.request("PATCH", "/api/me", { body: { topics, onboarded: true } });
  expect(res.status, res.text).toBe(200);
  return session;
}

describe("GET /api/me display", () => {
  it("holds the defaults for a Reader who never set anything", async () => {
    const app = await startTestApp();
    const sara = await app.addReader("sara@example.com");

    expect(await displayOf(sara)).toEqual(DEFAULTS);
  });

  it("holds the defaults on a Reader's first visit, before onboarding", async () => {
    const app = await startTestApp();
    const sara = await app.addReader("sara@example.com", { onboarded: false });

    expect(await displayOf(sara)).toEqual(DEFAULTS);
  });
});

describe("PATCH /api/me {display}", () => {
  it("replaces only the keys sent and answers with the whole Display", async () => {
    const app = await startTestApp();
    const sara = await app.addReader("sara@example.com");

    const res = await patchDisplay(sara, { theme: "dark", accent: "sky" });

    expect(res.status, res.text).toBe(200);
    expect(res.body.display).toEqual({ ...DEFAULTS, theme: "dark", accent: "sky" });

    await patchDisplay(sara, { text_size: "xl", density: "compact" });
    expect(await displayOf(sara)).toEqual({
      ...DEFAULTS,
      theme: "dark",
      accent: "sky",
      text_size: "xl",
      density: "compact",
    });
  });

  it("leaves the rest of the Interest Profile alone, and can be sent with it", async () => {
    const app = await startTestApp();
    const sara = await readerFollowing(app, "sara@example.com", ["ai", "liverpool"]);

    const res = await sara.request("PATCH", "/api/me", { body: { language: "ar", display: { theme: "light" } } });

    expect(res.status, res.text).toBe(200);
    expect(res.body).toMatchObject({ language: "ar", topics: ["ai", "liverpool"], display: { theme: "light" } });
  });

  it("keeps every accent, text size, density and theme", async () => {
    const app = await startTestApp();
    const sara = await app.addReader("sara@example.com");

    for (const accent of ["amber", "coral", "lime", "sky", "rose", "mono"]) {
      expect((await patchDisplay(sara, { accent })).body.display.accent).toBe(accent);
    }
    for (const text_size of ["s", "m", "l", "xl"]) {
      expect((await patchDisplay(sara, { text_size })).body.display.text_size).toBe(text_size);
    }
    for (const density of ["compact", "comfortable"]) {
      expect((await patchDisplay(sara, { density })).body.display.density).toBe(density);
    }
    for (const theme of ["light", "dark", "auto"]) {
      expect((await patchDisplay(sara, { theme })).body.display.theme).toBe(theme);
    }
  });

  it("sets a Layout per screen class one at a time, and null takes a pick back", async () => {
    const app = await startTestApp();
    const sara = await app.addReader("sara@example.com");

    await patchDisplay(sara, { layouts: { pc: "list" } });
    await patchDisplay(sara, { layouts: { tablet: "front_page", phone: "swipe" } });
    expect((await displayOf(sara)).layouts).toEqual({ phone: "swipe", tablet: "front_page", pc: "list" });

    await patchDisplay(sara, { layouts: { tablet: null } });
    expect((await displayOf(sara)).layouts).toEqual({ phone: "swipe", pc: "list" });
  });

  it("stores the arranging keys in order, without duplicates", async () => {
    const app = await startTestApp();
    const sara = await readerFollowing(app, "sara@example.com", ["ai", "liverpool", "saudi"]);

    const res = await patchDisplay(sara, {
      topic_order: ["liverpool", "ai", "liverpool", "saudi"],
      pinned: ["saudi", "saudi"],
      collapsed: ["ai"],
      widgets: ["countdown", "weather", "weather"],
      dock: ["save", "share", "like"],
    });

    expect(res.status, res.text).toBe(200);
    expect(res.body.display).toMatchObject({
      topic_order: ["liverpool", "ai", "saudi"],
      pinned: ["saudi"],
      collapsed: ["ai"],
      widgets: ["countdown", "weather"],
      dock: ["save", "share", "like"],
    });
  });

  it("accepts a Catalog Topic the Reader does not follow, and keeps it after an unfollow", async () => {
    const app = await startTestApp();
    const sara = await readerFollowing(app, "sara@example.com", ["ai", "liverpool"]);

    expect((await patchDisplay(sara, { topic_order: ["yemen", "ai"], pinned: ["liverpool"] })).status).toBe(200);
    await sara.request("POST", "/api/topics/liverpool/unfollow");

    expect(await displayOf(sara)).toMatchObject({ topic_order: ["yemen", "ai"], pinned: ["liverpool"] });
  });

  it("goes back to a key's default when it is sent as null", async () => {
    const app = await startTestApp();
    const sara = await app.addReader("sara@example.com");
    await patchDisplay(sara, { theme: "dark", widgets: ["weather"], dock: ["ask"] });

    const res = await patchDisplay(sara, { widgets: null, dock: null });

    expect(res.body.display).toEqual({ ...DEFAULTS, theme: "dark" });
  });
});

describe("invalid Display values", () => {
  async function expectRefused(display: unknown, reason: RegExp) {
    const app = await startTestApp();
    const sara = await readerFollowing(app, "sara@example.com", ["ai", "liverpool"]);
    await patchDisplay(sara, { theme: "dark" });

    const res = await sara.request("PATCH", "/api/me", { body: { city: "Jeddah", display } });

    expect(res.status, res.text).toBe(422);
    expect(res.body.error).toEqual(expect.any(String));
    expect(res.body.reasons.join("\n")).toMatch(reason);
    // All or nothing: neither the Display nor the rest of the profile changed.
    const me = (await sara.request("GET", "/api/me")).body;
    expect(me.city).toBeNull();
    expect(me.display).toEqual({ ...DEFAULTS, theme: "dark" });
  }

  it("refuses something that is not an object", () => expectRefused(["dark"], /display must be an object/));
  it("refuses an unknown key", () => expectRefused({ font: "serif" }, /Unknown display key "font"/));
  it("refuses an unknown theme", () => expectRefused({ theme: "sepia" }, /display\.theme must be one of light, dark, auto/));
  it("refuses an unknown accent", () => expectRefused({ accent: "teal" }, /display\.accent must be one of amber, coral/));
  it("refuses an unknown text size", () => expectRefused({ text_size: "xxl" }, /display\.text_size must be one of s, m, l, xl/));
  it("refuses an unknown density", () => expectRefused({ density: "airy" }, /display\.density must be one of compact, comfortable/));
  it("refuses an unknown screen class", () => expectRefused({ layouts: { tv: "list" } }, /Unknown screen class "tv"/));
  it("refuses an unknown Layout", () =>
    expectRefused({ layouts: { pc: "grid" } }, /display\.layouts\.pc must be one of swipe, front_page, list/));
  it("refuses Topics that are not in the Catalog", () =>
    expectRefused({ pinned: ["ai", "knitting"] }, /display\.pinned: "knitting" is not a Topic in the Catalog/));
  it("refuses a Topic list that is not a list of ids", () =>
    expectRefused({ topic_order: "ai" }, /display\.topic_order must be a list of Topic ids/));
  it("refuses an unknown Widget", () => expectRefused({ widgets: ["stocks"] }, /display\.widgets: "stocks" is not a Widget/));
  it("refuses a dock with no buttons", () => expectRefused({ dock: [] }, /display\.dock must have 1 to 5 buttons/));
  it("refuses a dock with more than 5 buttons", () =>
    expectRefused({ dock: ["like", "save", "ask", "hide", "share", "like"] }, /display\.dock must have 1 to 5 buttons/));
  it("refuses an unknown dock button", () => expectRefused({ dock: ["like", "react"] }, /display\.dock: "react" is not a dock button/));
  it("refuses unblurring a Topic that is not Sensitive", () =>
    expectRefused({ unblurred: ["ai"] }, /display\.unblurred: "ai" is not a Sensitive Topic you opted into/));
  it("refuses unblurring a Sensitive Topic the Reader has not opted into", () =>
    expectRefused({ unblurred: ["graphic"] }, /display\.unblurred: "graphic" is not a Sensitive Topic you opted into/));

  it("gives every reason at once", async () => {
    const app = await startTestApp();
    const sara = await app.addReader("sara@example.com");

    const res = await patchDisplay(sara, { theme: "sepia", accent: "teal", dock: [] });

    expect(res.status).toBe(422);
    expect(res.body.reasons).toHaveLength(3);
  });

  it("refuses another Reader's private Topic", async () => {
    const app = await startTestApp();
    const omar = await app.addReader("omar@example.com");
    const created = await omar.request("POST", "/api/topics", { body: { name: "Falconry" } });
    expect(created.status, created.text).toBe(201);
    const sara = await app.addReader("sara@example.com");

    const res = await patchDisplay(sara, { topic_order: [created.body.topic.id] });

    expect(res.status).toBe(422);
    expect(res.body.reasons.join("\n")).toMatch(/is not a Topic in the Catalog/);
    expect((await patchDisplay(omar, { topic_order: [created.body.topic.id] })).status).toBe(200);
  });
});

describe("unblurred Sensitive Topics", () => {
  it("takes a Sensitive Topic the Reader opted into, and forgets it when they opt out", async () => {
    const app = await startTestApp();
    const sara = await readerFollowing(app, "sara@example.com", ["ai"]);
    await sara.request("POST", "/api/topics/graphic/follow");

    const res = await patchDisplay(sara, { unblurred: ["graphic"] });
    expect(res.status, res.text).toBe(200);
    expect(res.body.display.unblurred).toEqual(["graphic"]);

    await sara.request("POST", "/api/topics/graphic/unfollow");
    expect((await displayOf(sara)).unblurred).toEqual([]);
    // Opting in again asks for the blur again.
    await sara.request("POST", "/api/topics/graphic/follow");
    expect((await displayOf(sara)).unblurred).toEqual([]);
  });

  it("forgets a Topic dropped through PATCH /api/me {topics}, even in the same request", async () => {
    const app = await startTestApp();
    const sara = await readerFollowing(app, "sara@example.com", ["ai"]);
    await sara.request("POST", "/api/topics/graphic/follow");
    await patchDisplay(sara, { unblurred: ["graphic"] });

    await sara.request("PATCH", "/api/me", { body: { topics: ["ai"] } });
    expect((await displayOf(sara)).unblurred).toEqual([]);

    await sara.request("POST", "/api/topics/graphic/follow");
    const res = await sara.request("PATCH", "/api/me", { body: { topics: ["ai"], display: { unblurred: ["graphic"] } } });
    expect(res.status).toBe(422);
  });
});

describe("following the Reader across devices", () => {
  it("shows the same Display on every device after either one changes it", async () => {
    const app = await startTestApp();
    await app.postEdition(morningEdition());
    const phone = await app.addReader("sara@example.com");
    const laptop = await app.signIn("sara@example.com");

    await patchDisplay(phone, { theme: "light", accent: "rose" });
    expect(await displayOf(laptop)).toEqual({ ...DEFAULTS, theme: "light", accent: "rose" });

    await patchDisplay(laptop, { accent: "lime", text_size: "l" });
    expect(await displayOf(phone)).toEqual({ ...DEFAULTS, theme: "light", accent: "lime", text_size: "l" });
  });

  it("leaves another Reader's Display alone", async () => {
    const app = await startTestApp();
    const sara = await app.addReader("sara@example.com");
    const omar = await app.addReader("omar@example.com");

    await patchDisplay(sara, { theme: "dark", accent: "mono", density: "compact" });

    expect(await displayOf(omar)).toEqual(DEFAULTS);
  });

  it("never changes the Brief", async () => {
    const app = await startTestApp();
    await app.postEdition(morningEdition());
    const sara = await app.addReader("sara@example.com");
    const before = (await sara.request("GET", "/api/brief")).body;

    await patchDisplay(sara, { theme: "dark", accent: "coral", text_size: "s", density: "compact" });

    const after = (await sara.request("GET", "/api/brief")).body;
    expect(after.items.length).toBeGreaterThan(0);
    expect(after.items).toEqual(before.items);
  });
});

// Rework ticket 09: a Layout per screen class. The browser picks the screen
// class (phone, tablet, PC; wide uses the PC pick) and reads it from here.
describe("Layouts per screen class", () => {
  it("takes Swipe, Front Page and List for each of phone, tablet and PC", async () => {
    const app = await startTestApp();
    const sara = await app.addReader("sara@example.com");

    for (const layout of ["swipe", "front_page", "list"]) {
      const res = await patchDisplay(sara, { layouts: { phone: layout, tablet: layout, pc: layout } });
      expect(res.status, res.text).toBe(200);
      expect(res.body.display.layouts).toEqual({ phone: layout, tablet: layout, pc: layout });
    }
  });

  it.each([
    ["a wide pick (wide uses the PC pick)", { wide: "front_page" }, /Unknown screen class "wide"/],
    ["a Layout that is not a name", { pc: 2 }, /display\.layouts\.pc must be one of swipe, front_page, list/],
    ["a Layout from the rejected designs", { tablet: "grid" }, /display\.layouts\.tablet must be one of swipe, front_page, list/],
    ["a list instead of picks", ["list"], /display\.layouts must be an object/],
  ])("refuses %s with 422 and keeps the earlier picks", async (_, layouts, reason) => {
    const app = await startTestApp();
    const sara = await app.addReader("sara@example.com");
    await patchDisplay(sara, { layouts: { pc: "list" } });

    const res = await patchDisplay(sara, { layouts });

    expect(res.status, res.text).toBe(422);
    expect(res.body.reasons.join("\n")).toMatch(reason);
    expect((await displayOf(sara)).layouts).toEqual({ pc: "list" });
  });

  it("follows the Reader to their other devices", async () => {
    const app = await startTestApp();
    const phone = await app.addReader("sara@example.com");
    const laptop = await app.signIn("sara@example.com");

    await patchDisplay(laptop, { layouts: { pc: "list" } });
    await patchDisplay(phone, { layouts: { phone: "front_page" } });

    expect((await displayOf(laptop)).layouts).toEqual({ pc: "list", phone: "front_page" });
    expect((await displayOf(phone)).layouts).toEqual({ pc: "list", phone: "front_page" });
  });

  it("never changes the Brief", async () => {
    const app = await startTestApp();
    await app.postEdition(morningEdition());
    const sara = await app.addReader("sara@example.com");
    const before = (await sara.request("GET", "/api/brief")).body;

    await patchDisplay(sara, { layouts: { phone: "list", tablet: "swipe", pc: "front_page" } });

    expect((await sara.request("GET", "/api/brief")).body.items).toEqual(before.items);
  });
});
