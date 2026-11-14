import { afterEach, describe, expect, it, vi } from "vitest";
import { morningEdition } from "../support/fixtures";
import { sessionCookie, startTestApp, TEST_OWNER_EMAIL } from "../support/test-app";

afterEach(() => {
  vi.useRealTimers();
});

describe("the Owner, created at setup", () => {
  it("signs in with a magic link emailed through Resend and gets the Brief", async () => {
    const app = await startTestApp();
    await app.postEdition(morningEdition());

    const asked = await app.request("POST", "/api/auth/magic-link", { body: { email: TEST_OWNER_EMAIL } });
    expect(asked.status).toBe(200);
    expect(app.services.email.outbox).toHaveLength(1);
    expect(app.services.email.outbox[0]).toMatchObject({ to: TEST_OWNER_EMAIL });

    const link = app.lastMagicLink(TEST_OWNER_EMAIL)!;
    expect(link).toMatch(/^http:\/\/brief\.test\/brief\/api\/auth\/callback\?token=/);
    const opened = await app.openLink(link);
    expect(opened.status).toBe(303);
    expect(opened.headers.get("location")).toBe("/brief");
    const cookie = sessionCookie(opened);
    expect(cookie).toBeTruthy();

    const brief = await app.request("GET", "/api/brief", { cookie: cookie! });
    expect(brief.status).toBe(200);
    expect(brief.body.items).toHaveLength(5);
  });

  it("is matched by email case-insensitively", async () => {
    const app = await startTestApp();

    const owner = await app.signIn("  Owner@Example.COM ");

    const session = await owner.request("GET", "/api/auth/session");
    expect(session.body).toEqual({ reader: { id: expect.any(Number), email: TEST_OWNER_EMAIL, role: "owner" } });
  });

  it("does not exist when no OWNER_EMAIL is set, so nobody can sign in", async () => {
    const app = await startTestApp({ ownerEmail: "" });

    await app.request("POST", "/api/auth/magic-link", { body: { email: TEST_OWNER_EMAIL } });

    expect(app.services.email.outbox).toHaveLength(0);
  });
});

describe("Reader routes", () => {
  it("refuse signed-out requests", async () => {
    const app = await startTestApp();
    await app.postEdition(morningEdition());

    const brief = await app.request("GET", "/api/brief");
    const session = await app.request("GET", "/api/auth/session");
    const catalog = await app.request("GET", "/api/topics");
    const forged = await app.request("GET", "/api/brief", { cookie: "mb_session=not-a-real-session" });

    expect(brief.status).toBe(401);
    expect(brief.body).toEqual({ error: "Sign in to read your Brief." });
    expect(brief.text).not.toContain("Hodeidah");
    expect(session.status).toBe(401);
    expect(catalog.status).toBe(401);
    expect(forged.status).toBe(401);
  });

  it("leave the pipeline routes on their bearer token", async () => {
    const app = await startTestApp();

    const ingest = await app.postEdition(morningEdition());
    const owner = await app.signInAsOwner();
    const withSessionOnly = await owner.request("POST", "/api/editions", { body: morningEdition() });

    expect(ingest.status).toBe(200);
    expect(withSessionOnly.status).toBe(401);
  });
});

describe("Invites", () => {
  it("can be created only by the Owner", async () => {
    const app = await startTestApp();
    const owner = await app.signInAsOwner();
    const sara = await app.addReader("sara@example.com");

    const bySara = await sara.request("POST", "/api/invites", { body: { email: "omar@example.com" } });
    const signedOut = await app.request("POST", "/api/invites", { body: { email: "omar@example.com" } });
    const byOwner = await owner.request("POST", "/api/invites", { body: { email: "Omar@Example.com" } });

    expect(bySara.status).toBe(403);
    expect(signedOut.status).toBe(401);
    expect(byOwner.status).toBe(201);
    expect(byOwner.body.invite).toMatchObject({ email: "omar@example.com", status: "pending", reader_id: null });
    const listedBySara = await sara.request("GET", "/api/invites");
    expect(listedBySara.status).toBe(403);
  });

  it("email the invited person a sign-in link straight away", async () => {
    const app = await startTestApp();
    const owner = await app.signInAsOwner();

    await owner.request("POST", "/api/invites", { body: { email: "sara@example.com" } });

    const link = app.lastMagicLink("sara@example.com");
    expect(link).toBeTruthy();
    expect(sessionCookie(await app.openLink(link!))).toBeTruthy();
    const listed = await owner.request("GET", "/api/invites");
    expect(listed.body.invites).toEqual([
      expect.objectContaining({ email: "sara@example.com", status: "accepted", reader_id: expect.any(Number) }),
    ]);
  });

  it("let an invited email ask for a magic link, while an uninvited one gets none and the answer is the same", async () => {
    const app = await startTestApp();
    const owner = await app.signInAsOwner();
    await owner.request("POST", "/api/invites", { body: { email: "sara@example.com" } });
    const sent = app.services.email.outbox.length;

    const invited = await app.request("POST", "/api/auth/magic-link", { body: { email: "sara@example.com" } });
    const uninvited = await app.request("POST", "/api/auth/magic-link", { body: { email: "stranger@example.com" } });

    expect(invited.status).toBe(uninvited.status);
    expect(invited.text).toBe(uninvited.text);
    expect(app.services.email.outbox.slice(sent).map((m) => m.to)).toEqual(["sara@example.com"]);
    expect(app.lastMagicLink("stranger@example.com")).toBeNull();
    await expect(app.signIn("stranger@example.com")).rejects.toThrow(/No magic link/);
  });

  it("refuse a malformed email, an existing Reader and a second live Invite for the same email", async () => {
    const app = await startTestApp();
    const owner = await app.signInAsOwner();
    await app.addReader("sara@example.com");
    await owner.request("POST", "/api/invites", { body: { email: "omar@example.com" } });

    const malformed = await owner.request("POST", "/api/invites", { body: { email: "not-an-email" } });
    const reader = await owner.request("POST", "/api/invites", { body: { email: "sara@example.com" } });
    const ownerSelf = await owner.request("POST", "/api/invites", { body: { email: TEST_OWNER_EMAIL } });
    const twice = await owner.request("POST", "/api/invites", { body: { email: "omar@example.com" } });

    expect(malformed.status).toBe(400);
    expect(reader.status).toBe(409);
    expect(ownerSelf.status).toBe(409);
    expect(twice.status).toBe(409);
  });

  it("are listed for the Owner, newest first, with their status", async () => {
    const app = await startTestApp();
    const owner = await app.signInAsOwner();
    await app.addReader("sara@example.com");
    await owner.request("POST", "/api/invites", { body: { email: "omar@example.com" } });

    const res = await owner.request("GET", "/api/invites");

    expect(res.status).toBe(200);
    expect(res.body.invites.map((i: { email: string; status: string }) => [i.email, i.status])).toEqual([
      ["omar@example.com", "pending"],
      ["sara@example.com", "accepted"],
    ]);
  });
});

describe("magic links", () => {
  it("work only once", async () => {
    const app = await startTestApp();
    await app.request("POST", "/api/auth/magic-link", { body: { email: TEST_OWNER_EMAIL } });
    const link = app.lastMagicLink(TEST_OWNER_EMAIL)!;

    const first = await app.openLink(link);
    const second = await app.openLink(link);

    expect(sessionCookie(first)).toBeTruthy();
    expect(second.status).toBe(303);
    expect(second.headers.get("location")).toBe("/brief/sign-in?error=link");
    expect(sessionCookie(second)).toBeNull();
  });

  it("expire after 15 minutes", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-11-14T07:00:00+03:00") });
    const app = await startTestApp();
    await app.request("POST", "/api/auth/magic-link", { body: { email: TEST_OWNER_EMAIL } });
    const stale = app.lastMagicLink(TEST_OWNER_EMAIL)!;
    await app.request("POST", "/api/auth/magic-link", { body: { email: TEST_OWNER_EMAIL } });
    const fresh = app.lastMagicLink(TEST_OWNER_EMAIL)!;

    vi.setSystemTime(new Date("2026-11-14T07:14:00+03:00"));
    expect(sessionCookie(await app.openLink(fresh))).toBeTruthy();
    vi.setSystemTime(new Date("2026-11-14T07:16:00+03:00"));
    const expired = await app.openLink(stale);

    expect(expired.headers.get("location")).toBe("/brief/sign-in?error=link");
    expect(sessionCookie(expired)).toBeNull();
  });

  it("in an Invite email last 7 days", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-11-14T07:00:00+03:00") });
    const app = await startTestApp();
    const owner = await app.signInAsOwner();
    await owner.request("POST", "/api/invites", { body: { email: "sara@example.com" } });
    await owner.request("POST", "/api/invites", { body: { email: "omar@example.com" } });

    vi.setSystemTime(new Date("2026-11-20T07:00:00+03:00"));
    const inTime = await app.openLink(app.lastMagicLink("sara@example.com")!);
    vi.setSystemTime(new Date("2026-11-21T07:01:00+03:00"));
    const late = await app.openLink(app.lastMagicLink("omar@example.com")!);

    expect(sessionCookie(inTime)).toBeTruthy();
    expect(sessionCookie(late)).toBeNull();
    // The invited person can still ask for a fresh link.
    await expect(app.signIn("omar@example.com")).resolves.toMatchObject({ email: "omar@example.com" });
  });

  it("refuse a missing or made-up token", async () => {
    const app = await startTestApp();

    const missing = await app.request("GET", "/api/auth/callback");
    const madeUp = await app.request("GET", "/api/auth/callback?token=abc123");

    expect(missing.headers.get("location")).toBe("/brief/sign-in?error=link");
    expect(sessionCookie(madeUp)).toBeNull();
  });

  it("are not sent more than 5 times in 15 minutes to one email", async () => {
    const app = await startTestApp();

    for (let i = 0; i < 7; i++) {
      const res = await app.request("POST", "/api/auth/magic-link", { body: { email: TEST_OWNER_EMAIL } });
      expect(res.status).toBe(200);
    }

    expect(app.services.email.outbox).toHaveLength(5);
  });

  it("can be asked for again and again by someone who uses them", async () => {
    const app = await startTestApp();

    for (let i = 0; i < 7; i++) await app.signInAsOwner();

    expect(app.services.email.outbox).toHaveLength(7);
  });

  it("are refused for a malformed email without sending anything", async () => {
    const app = await startTestApp();

    const res = await app.request("POST", "/api/auth/magic-link", { body: { email: "nope" } });

    expect(res.status).toBe(400);
    expect(app.services.email.outbox).toHaveLength(0);
  });
});

describe("sessions", () => {
  it("are set as a long-lived HttpOnly cookie scoped to the app's base path", async () => {
    const app = await startTestApp();
    await app.request("POST", "/api/auth/magic-link", { body: { email: TEST_OWNER_EMAIL } });

    const opened = await app.openLink(app.lastMagicLink(TEST_OWNER_EMAIL)!);

    const header = opened.headers.getSetCookie().find((c) => c.startsWith("mb_session="))!;
    expect(header).toMatch(/; HttpOnly/);
    expect(header).toMatch(/; SameSite=Lax/);
    expect(header).toMatch(/; Path=\/brief(;|$)/);
    const maxAge = Number(/Max-Age=(\d+)/.exec(header)![1]);
    expect(maxAge).toBeGreaterThanOrEqual(365 * 24 * 60 * 60);
  });

  it("keep a device signed in for months", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-11-14T07:00:00+03:00") });
    const app = await startTestApp();
    const owner = await app.signInAsOwner();

    vi.setSystemTime(new Date("2027-08-14T07:00:00+03:00"));

    expect((await owner.request("GET", "/api/brief")).status).toBe(200);
  });

  it("end on sign-out, for that device only", async () => {
    const app = await startTestApp();
    const phone = await app.signInAsOwner();
    const laptop = await app.signInAsOwner();

    const out = await phone.request("POST", "/api/auth/sign-out");

    expect(out.status).toBe(200);
    expect(out.headers.getSetCookie().find((c) => c.startsWith("mb_session="))).toMatch(/Max-Age=0/);
    expect((await phone.request("GET", "/api/brief")).status).toBe(401);
    expect((await laptop.request("GET", "/api/brief")).status).toBe(200);
  });
});

describe("revoking", () => {
  it("a pending Invite blocks sign-in, including a link already emailed", async () => {
    const app = await startTestApp();
    const owner = await app.signInAsOwner();
    const created = await owner.request("POST", "/api/invites", { body: { email: "sara@example.com" } });
    const emailedLink = app.lastMagicLink("sara@example.com")!;

    const revoked = await owner.request("DELETE", `/api/invites/${created.body.invite.id}`);

    expect(revoked.status).toBe(200);
    expect(revoked.body.invite).toMatchObject({ email: "sara@example.com", status: "revoked" });
    expect(sessionCookie(await app.openLink(emailedLink))).toBeNull();
    await expect(app.signIn("sara@example.com")).rejects.toThrow(/No magic link/);
  });

  it("an accepted Invite revokes the Reader: signed out everywhere and unable to sign in again", async () => {
    const app = await startTestApp();
    const owner = await app.signInAsOwner();
    const sara = await app.addReader("sara@example.com");
    const invite = (await owner.request("GET", "/api/invites")).body.invites[0];

    await owner.request("DELETE", `/api/invites/${invite.id}`);

    expect((await sara.request("GET", "/api/brief")).status).toBe(401);
    await expect(app.signIn("sara@example.com")).rejects.toThrow(/No magic link/);
    const listed = await owner.request("GET", "/api/invites");
    expect(listed.body.invites[0]).toMatchObject({ email: "sara@example.com", status: "revoked" });
  });

  it("can be undone by inviting the same email again", async () => {
    const app = await startTestApp();
    const owner = await app.signInAsOwner();
    const sara = await app.addReader("sara@example.com");
    const before = (await sara.request("GET", "/api/auth/session")).body.reader;
    const invite = (await owner.request("GET", "/api/invites")).body.invites[0];
    await owner.request("DELETE", `/api/invites/${invite.id}`);

    const again = await owner.request("POST", "/api/invites", { body: { email: "sara@example.com" } });
    const back = await app.signIn("sara@example.com");

    expect(again.status).toBe(201);
    expect((await back.request("GET", "/api/auth/session")).body.reader).toEqual(before);
  });

  it("is for the Owner only, and an unknown Invite is a 404", async () => {
    const app = await startTestApp();
    const owner = await app.signInAsOwner();
    const sara = await app.addReader("sara@example.com");
    await owner.request("POST", "/api/invites", { body: { email: "omar@example.com" } });
    const omar = (await owner.request("GET", "/api/invites")).body.invites[0];

    const bySara = await sara.request("DELETE", `/api/invites/${omar.id}`);
    const unknown = await owner.request("DELETE", "/api/invites/9999");

    expect(bySara.status).toBe(403);
    expect(unknown.status).toBe(404);
    expect(sessionCookie(await app.openLink(app.lastMagicLink("omar@example.com")!))).toBeTruthy();
  });
});

describe("the sign-in and sign-out forms (plain HTML posts, no JavaScript needed)", () => {
  const form = { "content-type": "application/x-www-form-urlencoded" };

  it("redirect to the same 'check your email' page whether or not the email is invited", async () => {
    const app = await startTestApp();

    const owner = await app.request("POST", "/api/auth/magic-link", { rawBody: "email=owner%40example.com", headers: form });
    const stranger = await app.request("POST", "/api/auth/magic-link", { rawBody: "email=x%40example.com", headers: form });
    const malformed = await app.request("POST", "/api/auth/magic-link", { rawBody: "email=nope", headers: form });

    expect(owner.status).toBe(303);
    expect(owner.headers.get("location")).toBe("/brief/sign-in?sent=1");
    expect(stranger.headers.get("location")).toBe("/brief/sign-in?sent=1");
    expect(malformed.headers.get("location")).toBe("/brief/sign-in?error=email");
    expect(app.services.email.outbox.map((m) => m.to)).toEqual([TEST_OWNER_EMAIL]);
  });

  it("sign out and go back to the sign-in page", async () => {
    const app = await startTestApp();
    const owner = await app.signInAsOwner();

    const out = await owner.request("POST", "/api/auth/sign-out", { rawBody: "", headers: form });

    expect(out.status).toBe(303);
    expect(out.headers.get("location")).toBe("/brief/sign-in");
    expect((await owner.request("GET", "/api/brief")).status).toBe(401);
  });
});

describe("magic link addresses", () => {
  it("use the host the browser asked on when PUBLIC_ORIGIN is not set (local runs)", async () => {
    const app = await startTestApp();

    await app.request("POST", "/api/auth/magic-link", {
      body: { email: TEST_OWNER_EMAIL },
      headers: { host: "192.168.1.20:3000" },
    });

    expect(app.lastMagicLink(TEST_OWNER_EMAIL)).toMatch(/^http:\/\/192\.168\.1\.20:3000\/brief\/api\/auth\/callback\?token=/);
  });

  it("use PUBLIC_ORIGIN when set, whatever Host header arrives", async () => {
    const app = await startTestApp({ publicOrigin: "https://news.example.org" });

    await app.request("POST", "/api/auth/magic-link", { body: { email: TEST_OWNER_EMAIL }, headers: { host: "evil.example" } });
    const opened = await app.openLink(app.lastMagicLink(TEST_OWNER_EMAIL)!.replace("https://news.example.org", "http://brief.test"));

    expect(app.lastMagicLink(TEST_OWNER_EMAIL)).toMatch(/^https:\/\/news\.example\.org\/brief\/api\/auth\/callback\?token=/);
    expect(opened.headers.getSetCookie().find((c) => c.startsWith("mb_session="))).toMatch(/; Secure/);
  });
});
