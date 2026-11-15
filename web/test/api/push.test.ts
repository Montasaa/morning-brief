// Installable app and push (ticket 18). A Reader subscribes each device for
// Web Push and opts into two kinds of push separately in the Me tab: "Brief
// ready" after each Edition (naming their top story) and new developments on
// the Story Threads they follow. Tests read what was pushed from the fake push
// service (`app.services.push.sent`).
import { describe, expect, it } from "vitest";
import { morningEdition, type EditionDoc } from "../support/fixtures";
import { startTestApp, type TestApp, type TestSession } from "../support/test-app";

type Device = { endpoint: string; keys: { p256dh: string; auth: string } };

let deviceCount = 0;
/** A browser PushSubscription, as `JSON.stringify(subscription)` sends it. */
function device(name = `device-${++deviceCount}`): Device {
  return {
    endpoint: `https://push.example.net/send/${name}`,
    keys: { p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM", auth: "tBHItJI5svbpez7KI4CCXg" },
  };
}

async function subscribe(session: TestSession, d: Device = device()): Promise<Device> {
  const res = await session.request("POST", "/api/push/subscriptions", { body: d });
  expect(res.status, res.text).toBe(201);
  return d;
}

async function notify(session: TestSession, notifications: { brief_ready?: boolean; thread_updates?: boolean }) {
  const res = await session.request("PATCH", "/api/me", { body: { notifications } });
  expect(res.status, res.text).toBe(200);
}

/** The pushes the fake push service delivered to one device, oldest first. */
const pushesTo = (app: TestApp, d: Device) =>
  app.services.push.sent.filter((s) => s.subscription.endpoint === d.endpoint).map((s) => s.message);

describe("POST/GET/DELETE /api/push/subscriptions: a Reader's devices", () => {
  it("subscribes a device, lists it with the VAPID public key, and unsubscribes it", async () => {
    const app = await startTestApp();
    const owner = await app.signInAsOwner();
    const phone = await subscribe(owner);

    const listed = await owner.request("GET", "/api/push/subscriptions");
    expect(listed.status).toBe(200);
    expect(typeof listed.body.public_key).toBe("string");
    expect(listed.body.subscriptions.map((s: { endpoint: string }) => s.endpoint)).toEqual([phone.endpoint]);

    const removed = await owner.request("DELETE", "/api/push/subscriptions", { body: { endpoint: phone.endpoint } });
    expect(removed.status, removed.text).toBe(200);
    expect((await owner.request("GET", "/api/push/subscriptions")).body.subscriptions).toEqual([]);
  });

  it("needs a session", async () => {
    const app = await startTestApp();
    expect((await app.request("POST", "/api/push/subscriptions", { body: device() })).status).toBe(401);
    expect((await app.request("GET", "/api/push/subscriptions")).status).toBe(401);
    expect((await app.request("DELETE", "/api/push/subscriptions", { body: { endpoint: "x" } })).status).toBe(401);
  });

  it("refuses something that is not a push subscription", async () => {
    const app = await startTestApp();
    const owner = await app.signInAsOwner();
    for (const body of [{}, { endpoint: "http://insecure.example/x", keys: device().keys }, { endpoint: device().endpoint }]) {
      const res = await owner.request("POST", "/api/push/subscriptions", { body });
      expect(res.status, JSON.stringify(body)).toBe(422);
    }
    expect((await owner.request("GET", "/api/push/subscriptions")).body.subscriptions).toEqual([]);
  });

  it("keeps each Reader's devices to themselves", async () => {
    const app = await startTestApp();
    const owner = await app.signInAsOwner();
    const sara = await app.addReader("sara@example.com");
    const phone = await subscribe(owner);

    expect((await sara.request("GET", "/api/push/subscriptions")).body.subscriptions).toEqual([]);
    await sara.request("DELETE", "/api/push/subscriptions", { body: { endpoint: phone.endpoint } });
    expect((await owner.request("GET", "/api/push/subscriptions")).body.subscriptions).toHaveLength(1);
  });
});

describe("GET/PATCH /api/me: notification preferences", () => {
  it("starts with both kinds of push off, and turns each on or off on its own", async () => {
    const app = await startTestApp();
    const owner = await app.signInAsOwner();
    expect((await owner.request("GET", "/api/me")).body.notifications).toEqual({ brief_ready: false, thread_updates: false });

    await notify(owner, { thread_updates: true });
    expect((await owner.request("GET", "/api/me")).body.notifications).toEqual({ brief_ready: false, thread_updates: true });

    await notify(owner, { brief_ready: true });
    await notify(owner, { thread_updates: false });
    expect((await owner.request("GET", "/api/me")).body.notifications).toEqual({ brief_ready: true, thread_updates: false });
  });

  it("refuses anything but true or false, changing nothing", async () => {
    const app = await startTestApp();
    const owner = await app.signInAsOwner();
    for (const notifications of [{ brief_ready: "yes" }, { sms: true }, "on", null]) {
      const res = await owner.request("PATCH", "/api/me", { body: { notifications, city: "London" } });
      expect(res.status, JSON.stringify(notifications)).toBe(422);
    }
    const me = (await owner.request("GET", "/api/me")).body;
    expect(me.notifications).toEqual({ brief_ready: false, thread_updates: false });
    expect(me.city).toBeNull();
  });
});

/** A Reader who exists before the Edition arrives, following exactly `topics`. */
async function readerFollowing(app: TestApp, email: string, topics: string[]): Promise<TestSession> {
  const session = await app.addReader(email, { onboarded: false });
  const res = await session.request("PATCH", "/api/me", { body: { topics, onboarded: true } });
  expect(res.status, res.text).toBe(200);
  return session;
}

describe("after an Edition is ingested: the Brief ready push", () => {
  it("goes once to each opted-in Reader's devices, naming their own top story", async () => {
    const app = await startTestApp();
    const owner = await app.signInAsOwner(); // follows every Topic: the Edition's own top story leads
    const sara = await readerFollowing(app, "sara@example.com", ["liverpool"]);
    const ownerPhone = await subscribe(owner);
    const ownerLaptop = await subscribe(owner);
    const saraPhone = await subscribe(sara);
    await notify(owner, { brief_ready: true });
    await notify(sara, { brief_ready: true });

    expect((await app.postEdition(morningEdition())).status).toBe(200);

    for (const d of [ownerPhone, ownerLaptop]) {
      expect(pushesTo(app, d)).toEqual([
        expect.objectContaining({
          title: "Your morning Brief is ready",
          body: "Truce talks resume over Hodeidah port access",
          url: "/",
        }),
      ]);
    }
    expect(pushesTo(app, saraPhone)).toEqual([
      expect.objectContaining({ title: "Your morning Brief is ready", body: "Midfielder back in full training before the weekend" }),
    ]);
  });

  it("is not sent to Readers who did not opt in, or who opted in without a device", async () => {
    const app = await startTestApp();
    const owner = await app.signInAsOwner();
    const sara = await app.addReader("sara@example.com");
    const ownerPhone = await subscribe(owner);
    await notify(owner, { thread_updates: true }); // only the other kind
    await notify(sara, { brief_ready: true }); // no device

    await app.postEdition(morningEdition());

    expect(pushesTo(app, ownerPhone)).toEqual([]);
    expect(app.services.push.sent).toEqual([]);
  });

  it("is sent once per Edition: posting it again pushes nothing", async () => {
    const app = await startTestApp();
    const owner = await app.signInAsOwner();
    const phone = await subscribe(owner);
    await notify(owner, { brief_ready: true });

    await app.postEdition(morningEdition());
    await app.postEdition(morningEdition());
    expect(pushesTo(app, phone)).toHaveLength(1);

    const evening = morningEdition();
    evening.edition_id = "2026-11-14-evening";
    evening.kind = "evening";
    evening.generated_at = "2026-11-14T19:15:00+03:00";
    await app.postEdition(evening);
    expect(pushesTo(app, phone).map((m) => m.title)).toEqual(["Your morning Brief is ready", "Your evening Brief is ready"]);
  });

  it("is not sent for an older Edition posted late", async () => {
    const app = await startTestApp();
    const owner = await app.signInAsOwner();
    const phone = await subscribe(owner);
    const evening = morningEdition();
    evening.edition_id = "2026-11-14-evening";
    evening.kind = "evening";
    evening.generated_at = "2026-11-14T19:15:00+03:00";
    await app.postEdition(evening);
    await notify(owner, { brief_ready: true });

    await app.postEdition(morningEdition()); // older than the evening one

    expect(pushesTo(app, phone)).toEqual([]);
  });

  it("is not sent when the Reader's Brief has nothing in it", async () => {
    const app = await startTestApp();
    const sara = await readerFollowing(app, "sara@example.com", ["us-markets"]);
    const phone = await subscribe(sara);
    await notify(sara, { brief_ready: true });

    await app.postEdition(morningEdition());

    expect(pushesTo(app, phone)).toEqual([]);
  });

  it("is in Arabic for a Reader who reads in Arabic", async () => {
    const app = await startTestApp();
    const owner = await app.signInAsOwner();
    const phone = await subscribe(owner);
    await owner.request("PATCH", "/api/me", { body: { language: "ar", notifications: { brief_ready: true } } });

    await app.postEdition(morningEdition());

    const [message] = pushesTo(app, phone);
    expect(message).toMatchObject({ title: "موجزك الصباحي جاهز", dir: "rtl", lang: "ar" });
    expect(message!.body).toBe(morningEdition().items[0]!.title_ar);
  });

  it("never names a sensitive top story on the lock screen", async () => {
    const app = await startTestApp();
    const owner = await app.signInAsOwner(); // opted into the Sensitive Topics
    const phone = await subscribe(owner);
    await notify(owner, { brief_ready: true });
    app.services.claude.replies.set("top-picks", {
      text: JSON.stringify({ top_stories: [{ item: "graphic-flood-aftermath", why: "Close to home.", why_ar: "قريب منك." }] }),
    });

    await app.postEdition(morningEdition());

    const [message] = pushesTo(app, phone);
    expect(message!.title).toBe("Your morning Brief is ready");
    expect(message!.body).not.toMatch(/flood/i);
    expect(message!.body).not.toBe("");
  });
});

/** The evening Edition: the morning's Items carried over, plus a new development on the Yemen truce Thread. */
function eveningWithDevelopment(): EditionDoc {
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

async function followThread(session: TestSession, thread = "yemen-truce-talks") {
  const res = await session.request("POST", `/api/threads/${thread}/follow`);
  expect(res.status, res.text).toBe(200);
}

describe("after an Edition is ingested: Story Thread updates", () => {
  it("push a new development to that Thread's opted-in followers only", async () => {
    const app = await startTestApp();
    const owner = await app.signInAsOwner();
    const sara = await app.addReader("sara@example.com");
    const omar = await app.addReader("omar@example.com");
    await app.postEdition(morningEdition());
    await followThread(owner);
    await followThread(omar);
    const ownerPhone = await subscribe(owner);
    const saraPhone = await subscribe(sara); // opted in, but does not follow the Thread
    const omarPhone = await subscribe(omar); // follows the Thread, but did not opt in
    for (const s of [owner, sara]) await notify(s, { thread_updates: true });

    await app.postEdition(eveningWithDevelopment());

    expect(pushesTo(app, ownerPhone)).toEqual([
      expect.objectContaining({
        title: "Yemen truce talks",
        body: "Both sides agree a prisoner exchange",
        url: "/threads/yemen-truce-talks",
      }),
    ]);
    expect(pushesTo(app, saraPhone)).toEqual([]);
    expect(pushesTo(app, omarPhone)).toEqual([]);
  });

  it("are not sent for Items carried over from an earlier Edition, or when an Edition is posted again", async () => {
    const app = await startTestApp();
    const owner = await app.signInAsOwner();
    await app.postEdition(morningEdition());
    await followThread(owner);
    const phone = await subscribe(owner);
    await notify(owner, { thread_updates: true });

    const evening = morningEdition(); // the same Thread Item, carried over
    evening.edition_id = "2026-11-14-evening";
    evening.kind = "evening";
    evening.generated_at = "2026-11-14T19:15:00+03:00";
    await app.postEdition(evening);
    expect(pushesTo(app, phone)).toEqual([]);

    await app.postEdition(eveningWithDevelopment()); // the same evening Edition, now with a new development
    await app.postEdition(eveningWithDevelopment());
    expect(pushesTo(app, phone).map((m) => m.body)).toEqual(["Both sides agree a prisoner exchange"]);
  });

  it("are not sent to a follower who cannot see the new development (none of its Topics followed)", async () => {
    const app = await startTestApp();
    await app.signInAsOwner();
    const sara = await readerFollowing(app, "sara@example.com", ["saudi"]); // sees the first Item (yemen, saudi) only
    await app.postEdition(morningEdition());
    await followThread(sara);
    const phone = await subscribe(sara);
    await notify(sara, { thread_updates: true });

    await app.postEdition(eveningWithDevelopment()); // the new Item carries only "yemen"

    expect(pushesTo(app, phone)).toEqual([]);
  });

  it("come with the Brief ready push when a Reader opted into both", async () => {
    const app = await startTestApp();
    const owner = await app.signInAsOwner();
    await app.postEdition(morningEdition());
    await followThread(owner);
    const phone = await subscribe(owner);
    await notify(owner, { thread_updates: true, brief_ready: true });

    await app.postEdition(eveningWithDevelopment());

    expect(pushesTo(app, phone).map((m) => m.title).sort()).toEqual(["Yemen truce talks", "Your evening Brief is ready"]);
  });
});

describe("devices", () => {
  it("signing out of a device stops its pushes; the Reader's other devices still get them", async () => {
    const app = await startTestApp();
    const phoneSession = await app.signInAsOwner();
    const laptopSession = await app.signInAsOwner();
    const phone = await subscribe(phoneSession);
    const laptop = await subscribe(laptopSession);
    await notify(phoneSession, { brief_ready: true });

    expect((await phoneSession.request("POST", "/api/auth/sign-out")).status).toBe(200);
    await app.postEdition(morningEdition());

    expect(pushesTo(app, phone)).toEqual([]);
    expect(pushesTo(app, laptop)).toHaveLength(1);
    expect((await laptopSession.request("GET", "/api/push/subscriptions")).body.subscriptions.map((s: Device) => s.endpoint)).toEqual([
      laptop.endpoint,
    ]);
  });

  it("a device the push service reports gone is forgotten; a failing one does not stop the others", async () => {
    const app = await startTestApp();
    const owner = await app.signInAsOwner();
    const old = await subscribe(owner, device("old"));
    const broken = await subscribe(owner, device("broken"));
    const phone = await subscribe(owner, device("phone"));
    await notify(owner, { brief_ready: true });
    app.services.push.gone.add(old.endpoint);
    app.services.push.failing.add(broken.endpoint);

    const res = await app.postEdition(morningEdition());

    expect(res.status).toBe(200);
    expect(pushesTo(app, phone)).toHaveLength(1);
    const left = (await owner.request("GET", "/api/push/subscriptions")).body.subscriptions.map((s: Device) => s.endpoint);
    expect(left.sort()).toEqual([broken.endpoint, phone.endpoint].sort());
  });

  it("a device subscribed again by another Reader signed in there now pushes only to them", async () => {
    const app = await startTestApp();
    const owner = await app.signInAsOwner();
    const sara = await app.addReader("sara@example.com");
    const shared = device("shared-tablet");
    await subscribe(owner, shared);
    await subscribe(sara, shared);
    await notify(owner, { brief_ready: true });

    await app.postEdition(morningEdition());

    expect(pushesTo(app, shared)).toEqual([]);
    expect((await owner.request("GET", "/api/push/subscriptions")).body.subscriptions).toEqual([]);
  });
});
