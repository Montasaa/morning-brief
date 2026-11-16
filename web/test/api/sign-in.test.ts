import { afterEach, describe, expect, it, vi } from "vitest";
import { morningEdition } from "../support/fixtures";
import { sessionCookie, startTestApp, TEST_OWNER_EMAIL, TEST_PASSWORD, type TestApp } from "../support/test-app";

afterEach(() => {
  vi.useRealTimers();
});

const form = { "content-type": "application/x-www-form-urlencoded" };
const encode = (fields: Record<string, string>) => new URLSearchParams(fields).toString();

function signInRequest(app: TestApp, email: string, password: string) {
  return app.request("POST", "/api/auth/sign-in", { body: { email, password } });
}

function firstPassword(app: TestApp, email: string, password: string, confirm = password) {
  return app.request("POST", "/api/auth/first-password", { body: { email, password, confirm_password: confirm } });
}

describe("the Owner's first password", () => {
  it("is chosen on the sign-in page by the Owner's email, typed twice, and signs them in to the Brief", async () => {
    const app = await startTestApp();
    await app.postEdition(morningEdition());

    const res = await app.request("POST", "/api/auth/first-password", {
      rawBody: encode({ email: TEST_OWNER_EMAIL, password: "a good long one", confirm_password: "a good long one" }),
      headers: form,
    });

    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/brief");
    const cookie = sessionCookie(res)!;
    expect(cookie).toBeTruthy();
    const brief = await app.request("GET", "/api/brief", { cookie });
    expect(brief.status).toBe(200);
    expect(brief.body.edition).toMatchObject({ id: "2026-11-14-morning" });
    const session = await app.request("GET", "/api/auth/session", { cookie });
    expect(session.body.reader).toMatchObject({ email: TEST_OWNER_EMAIL, role: "owner" });
    // From then on the Owner signs in with it.
    expect(sessionCookie(await signInRequest(app, TEST_OWNER_EMAIL, "a good long one"))).toBeTruthy();
  });

  it("is refused a second time, and the first password stays", async () => {
    const app = await startTestApp();
    await firstPassword(app, TEST_OWNER_EMAIL, "the first password");

    const again = await firstPassword(app, TEST_OWNER_EMAIL, "a takeover attempt");
    const againByForm = await app.request("POST", "/api/auth/first-password", {
      rawBody: encode({ email: TEST_OWNER_EMAIL, password: "a takeover attempt", confirm_password: "a takeover attempt" }),
      headers: form,
    });

    expect(again.status).toBe(403);
    expect(sessionCookie(again)).toBeNull();
    expect(againByForm.headers.get("location")).toBe("/brief/sign-in?first=refused");
    expect(sessionCookie(againByForm)).toBeNull();
    expect((await signInRequest(app, TEST_OWNER_EMAIL, "a takeover attempt")).status).toBe(401);
    expect((await signInRequest(app, TEST_OWNER_EMAIL, "the first password")).status).toBe(200);
  });

  it("can be chosen only with the Owner's email", async () => {
    const app = await startTestApp();

    const stranger = await firstPassword(app, "stranger@example.com", "a good long one");

    expect(stranger.status).toBe(403);
    expect(sessionCookie(stranger)).toBeNull();
    expect((await signInRequest(app, "stranger@example.com", "a good long one")).status).toBe(401);
    // The Owner can still choose theirs.
    expect((await firstPassword(app, " Owner@Example.COM ", "a good long one")).status).toBe(200);
  });

  it("must be typed the same twice and be at least 8 characters, or nothing is set", async () => {
    const app = await startTestApp();

    const mismatch = await firstPassword(app, TEST_OWNER_EMAIL, "a good long one", "a good long on");
    const short = await firstPassword(app, TEST_OWNER_EMAIL, "seven77");
    const shortByForm = await app.request("POST", "/api/auth/first-password", {
      rawBody: encode({ email: TEST_OWNER_EMAIL, password: "short", confirm_password: "short" }),
      headers: form,
    });
    const mismatchByForm = await app.request("POST", "/api/auth/first-password", {
      rawBody: encode({ email: TEST_OWNER_EMAIL, password: "a good long one", confirm_password: "another one!" }),
      headers: form,
    });

    expect(mismatch.status).toBe(400);
    expect(mismatch.body.error).toMatch(/don't match/);
    expect(short.status).toBe(400);
    expect(short.body.error).toMatch(/at least 8/);
    expect(shortByForm.headers.get("location")).toBe("/brief/sign-in?first=short");
    expect(mismatchByForm.headers.get("location")).toBe("/brief/sign-in?first=mismatch");
    expect((await signInRequest(app, TEST_OWNER_EMAIL, "a good long one")).status).toBe(401);
    expect((await firstPassword(app, TEST_OWNER_EMAIL, "exactly8")).status).toBe(200);
  });

  it("is needed before the Owner can sign in: until then the answer is the usual one", async () => {
    const app = await startTestApp();

    const res = await signInRequest(app, TEST_OWNER_EMAIL, TEST_PASSWORD);

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "Wrong email or password." });
    expect(sessionCookie(res)).toBeNull();
  });

  it("cannot be chosen by anyone when no OWNER_EMAIL is set", async () => {
    const app = await startTestApp({ ownerEmail: "" });

    expect((await firstPassword(app, TEST_OWNER_EMAIL, "a good long one")).status).toBe(403);
  });
});

describe("signing in", () => {
  it("with an email and its password starts a session and opens the Brief", async () => {
    const app = await startTestApp();
    await app.postEdition(morningEdition());
    await app.addReader("sara@example.com", { password: "sara's password" });

    const json = await signInRequest(app, "Sara@Example.com ", "sara's password");
    const byForm = await app.request("POST", "/api/auth/sign-in", {
      rawBody: encode({ email: "sara@example.com", password: "sara's password" }),
      headers: form,
    });

    expect(json.status).toBe(200);
    expect(json.body).toEqual({ reader: { id: expect.any(Number), email: "sara@example.com", role: "reader" } });
    expect(byForm.status).toBe(303);
    expect(byForm.headers.get("location")).toBe("/brief");
    for (const res of [json, byForm]) {
      const brief = await app.request("GET", "/api/brief", { cookie: sessionCookie(res)! });
      expect(brief.status).toBe(200);
    }
  });

  it("gives a wrong password, an unknown email and an empty form the same answer", async () => {
    const app = await startTestApp();
    await app.addReader("sara@example.com");

    const wrong = await signInRequest(app, "sara@example.com", "not her password");
    const unknown = await signInRequest(app, "stranger@example.com", TEST_PASSWORD);
    const empty = await signInRequest(app, "", "");

    for (const res of [wrong, unknown, empty]) {
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: "Wrong email or password." });
      expect(sessionCookie(res)).toBeNull();
    }
  });

  it("answers a wrong form post with the same message whoever the email belongs to", async () => {
    const app = await startTestApp();
    await app.addReader("sara@example.com");

    const wrong = await app.request("POST", "/api/auth/sign-in", {
      rawBody: encode({ email: "sara@example.com", password: "nope nope" }),
      headers: form,
    });
    const unknown = await app.request("POST", "/api/auth/sign-in", {
      rawBody: encode({ email: "x@example.com", password: "nope nope" }),
      headers: form,
    });

    expect(wrong.status).toBe(303);
    expect(wrong.headers.get("location")).toBe("/brief/sign-in?error=wrong");
    expect(unknown.headers.get("location")).toBe("/brief/sign-in?error=wrong");
    expect(sessionCookie(wrong)).toBeNull();
  });

  it("refuses a body that is not JSON", async () => {
    const app = await startTestApp();

    const res = await app.request("POST", "/api/auth/sign-in", { rawBody: "{nope" });

    expect(res.status).toBe(400);
  });

  it("is rate-limited per email: after 10 failed tries in 15 minutes even the right password waits", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-11-16T07:00:00+03:00") });
    const app = await startTestApp();
    await app.addReader("sara@example.com");
    await app.addReader("omar@example.com");

    for (let i = 0; i < 10; i++) expect((await signInRequest(app, "sara@example.com", `guess ${i}!`)).status).toBe(401);
    const blocked = await signInRequest(app, "sara@example.com", TEST_PASSWORD);
    const blockedByForm = await app.request("POST", "/api/auth/sign-in", {
      rawBody: encode({ email: "sara@example.com", password: TEST_PASSWORD }),
      headers: form,
    });
    const someoneElse = await signInRequest(app, "omar@example.com", TEST_PASSWORD);

    expect(blocked.status).toBe(429);
    expect(blocked.body.error).toMatch(/Too many tries/);
    expect(sessionCookie(blocked)).toBeNull();
    expect(blockedByForm.headers.get("location")).toBe("/brief/sign-in?error=limit");
    expect(someoneElse.status).toBe(200);

    vi.setSystemTime(new Date("2026-11-16T07:16:00+03:00"));
    expect((await signInRequest(app, "sara@example.com", TEST_PASSWORD)).status).toBe(200);
  });

  it("rate-limits unknown emails the same way, so the limit tells nothing either", async () => {
    const app = await startTestApp();

    for (let i = 0; i < 10; i++) await signInRequest(app, "stranger@example.com", `guess ${i}!`);

    expect((await signInRequest(app, "stranger@example.com", "guess 10!")).status).toBe(429);
  });

  it("starts counting failed tries again after a good sign-in", async () => {
    const app = await startTestApp();
    await app.addReader("sara@example.com");

    for (let i = 0; i < 9; i++) await signInRequest(app, "sara@example.com", `guess ${i}!`);
    expect((await signInRequest(app, "sara@example.com", TEST_PASSWORD)).status).toBe(200);
    for (let i = 0; i < 9; i++) await signInRequest(app, "sara@example.com", `guess ${i}!`);

    expect((await signInRequest(app, "sara@example.com", TEST_PASSWORD)).status).toBe(200);
  });

  it("sends no email: the magic-link routes are gone", async () => {
    const app = await startTestApp();
    const owner = await app.signInAsOwner();
    const added = await owner.request("POST", "/api/invites", { body: { email: "sara@example.com", password: TEST_PASSWORD } });
    await owner.request("POST", `/api/invites/${added.body.invite.id}/password`, { body: { password: "a new password" } });
    await signInRequest(app, "sara@example.com", "a new password");
    await signInRequest(app, "stranger@example.com", "whatever it is");

    expect(app.services.email.outbox).toHaveLength(0);
    expect((await app.request("POST", "/api/auth/magic-link", { body: { email: TEST_OWNER_EMAIL } })).status).toBe(404);
    expect((await app.request("GET", "/api/auth/callback?token=abc")).status).toBe(404);
  });

  it("never sends a password or its hash back", async () => {
    const app = await startTestApp();
    const owner = await app.signInAsOwner();
    await app.addReader("sara@example.com");

    for (const res of [
      await owner.request("GET", "/api/invites"),
      await owner.request("GET", "/api/auth/session"),
      await owner.request("GET", "/api/me"),
      await signInRequest(app, "sara@example.com", TEST_PASSWORD),
    ]) {
      expect(res.text).not.toContain(TEST_PASSWORD);
      expect(res.text).not.toMatch(/scrypt|password_hash/);
    }
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

describe("adding Readers (the Invites page)", () => {
  it("is for the Owner only", async () => {
    const app = await startTestApp();
    const owner = await app.signInAsOwner();
    const sara = await app.addReader("sara@example.com");
    const omar = { email: "omar@example.com", password: "omar's password" };

    const bySara = await sara.request("POST", "/api/invites", { body: omar });
    const signedOut = await app.request("POST", "/api/invites", { body: omar });
    const listedBySara = await sara.request("GET", "/api/invites");
    const byOwner = await owner.request("POST", "/api/invites", { body: { ...omar, email: "Omar@Example.com" } });

    expect(bySara.status).toBe(403);
    expect(signedOut.status).toBe(401);
    expect(listedBySara.status).toBe(403);
    expect(byOwner.status).toBe(201);
  });

  it("makes the person a Reader straight away, who signs in with the password the Owner chose", async () => {
    const app = await startTestApp();
    await app.postEdition(morningEdition());
    const owner = await app.signInAsOwner();

    const added = await owner.request("POST", "/api/invites", { body: { email: "sara@example.com", password: "sara's password" } });
    const signedIn = await signInRequest(app, "sara@example.com", "sara's password");

    expect(added.status).toBe(201);
    expect(added.body.invite).toMatchObject({ email: "sara@example.com", status: "accepted", reader_id: expect.any(Number) });
    expect(signedIn.status).toBe(200);
    expect(signedIn.body.reader).toMatchObject({ id: added.body.invite.reader_id, role: "reader" });
    expect((await app.request("GET", "/api/brief", { cookie: sessionCookie(signedIn)! })).status).toBe(200);
  });

  it("refuses a malformed email, a short password, an existing Reader and the Owner", async () => {
    const app = await startTestApp();
    const owner = await app.signInAsOwner();
    await app.addReader("sara@example.com");

    const malformed = await owner.request("POST", "/api/invites", { body: { email: "not-an-email", password: TEST_PASSWORD } });
    const short = await owner.request("POST", "/api/invites", { body: { email: "omar@example.com", password: "1234567" } });
    const missing = await owner.request("POST", "/api/invites", { body: { email: "omar@example.com" } });
    const reader = await owner.request("POST", "/api/invites", { body: { email: "sara@example.com", password: TEST_PASSWORD } });
    const ownerSelf = await owner.request("POST", "/api/invites", { body: { email: TEST_OWNER_EMAIL, password: TEST_PASSWORD } });

    expect(malformed.status).toBe(400);
    expect(malformed.body.reason).toBe("invalid-email");
    expect(short.status).toBe(400);
    expect(short.body.reason).toBe("too-short");
    expect(missing.status).toBe(400);
    expect(reader.status).toBe(409);
    expect(reader.body.reason).toBe("already-a-reader");
    expect(ownerSelf.status).toBe(409);
    expect((await signInRequest(app, "omar@example.com", "1234567")).status).toBe(401);
  });

  it("lists every Invite for the Owner, newest first, with its status", async () => {
    const app = await startTestApp();
    const owner = await app.signInAsOwner();
    await app.addReader("sara@example.com");
    await app.addReader("omar@example.com");

    const res = await owner.request("GET", "/api/invites");

    expect(res.status).toBe(200);
    expect(res.body.invites.map((i: { email: string; status: string }) => [i.email, i.status])).toEqual([
      ["omar@example.com", "accepted"],
      ["sara@example.com", "accepted"],
    ]);
  });
});

describe("resetting a Reader's password", () => {
  it("changes it: the old one stops working, the new one works, and the Reader's devices are signed out", async () => {
    const app = await startTestApp();
    const owner = await app.signInAsOwner();
    const sara = await app.addReader("sara@example.com");
    const invite = (await owner.request("GET", "/api/invites")).body.invites[0];

    const reset = await owner.request("POST", `/api/invites/${invite.id}/password`, { body: { password: "a fresh password" } });

    expect(reset.status).toBe(200);
    expect(reset.body.invite).toMatchObject({ email: "sara@example.com", status: "accepted" });
    expect((await sara.request("GET", "/api/brief")).status).toBe(401);
    expect((await signInRequest(app, "sara@example.com", TEST_PASSWORD)).status).toBe(401);
    expect((await signInRequest(app, "sara@example.com", "a fresh password")).status).toBe(200);
  });

  it("lets a Reader who ran into the rate limit sign in at once", async () => {
    const app = await startTestApp();
    const owner = await app.signInAsOwner();
    await app.addReader("sara@example.com");
    const invite = (await owner.request("GET", "/api/invites")).body.invites[0];
    for (let i = 0; i < 10; i++) await signInRequest(app, "sara@example.com", `guess ${i}!`);

    await owner.request("POST", `/api/invites/${invite.id}/password`, { body: { password: "a fresh password" } });

    expect((await signInRequest(app, "sara@example.com", "a fresh password")).status).toBe(200);
  });

  it("is for the Owner only, needs 8 characters, and only works for an active Reader", async () => {
    const app = await startTestApp();
    const owner = await app.signInAsOwner();
    const sara = await app.addReader("sara@example.com");
    await app.addReader("omar@example.com");
    const [omar, saraInvite] = (await owner.request("GET", "/api/invites")).body.invites;
    await owner.request("DELETE", `/api/invites/${omar.id}`);

    const bySara = await sara.request("POST", `/api/invites/${saraInvite.id}/password`, { body: { password: "hijacked!!" } });
    const short = await owner.request("POST", `/api/invites/${saraInvite.id}/password`, { body: { password: "short" } });
    const revoked = await owner.request("POST", `/api/invites/${omar.id}/password`, { body: { password: "a fresh password" } });
    const unknown = await owner.request("POST", "/api/invites/9999/password", { body: { password: "a fresh password" } });

    expect(bySara.status).toBe(403);
    expect(short.status).toBe(400);
    expect(revoked.status).toBe(409);
    expect(unknown.status).toBe(404);
    expect((await signInRequest(app, "omar@example.com", "a fresh password")).status).toBe(401);
    expect((await signInRequest(app, "sara@example.com", TEST_PASSWORD)).status).toBe(200);
  });
});

describe("revoking", () => {
  it("signs the Reader out everywhere and blocks sign-in with the usual answer", async () => {
    const app = await startTestApp();
    const owner = await app.signInAsOwner();
    const sara = await app.addReader("sara@example.com");
    const laptop = await app.signIn("sara@example.com");
    const invite = (await owner.request("GET", "/api/invites")).body.invites[0];

    const revoked = await owner.request("DELETE", `/api/invites/${invite.id}`);

    expect(revoked.status).toBe(200);
    expect(revoked.body.invite).toMatchObject({ email: "sara@example.com", status: "revoked" });
    expect((await sara.request("GET", "/api/brief")).status).toBe(401);
    expect((await laptop.request("GET", "/api/brief")).status).toBe(401);
    const again = await signInRequest(app, "sara@example.com", TEST_PASSWORD);
    expect(again.status).toBe(401);
    expect(again.body).toEqual({ error: "Wrong email or password." });
  });

  it("can be undone by adding the same email again, with a new password", async () => {
    const app = await startTestApp();
    const owner = await app.signInAsOwner();
    const sara = await app.addReader("sara@example.com");
    const before = (await sara.request("GET", "/api/auth/session")).body.reader;
    const invite = (await owner.request("GET", "/api/invites")).body.invites[0];
    await owner.request("DELETE", `/api/invites/${invite.id}`);

    const again = await owner.request("POST", "/api/invites", { body: { email: "sara@example.com", password: "welcome back!" } });

    expect(again.status).toBe(201);
    expect(again.body.invite).toMatchObject({ status: "accepted", reader_id: before.id });
    expect((await signInRequest(app, "sara@example.com", TEST_PASSWORD)).status).toBe(401);
    const back = await app.signIn("sara@example.com", { password: "welcome back!" });
    expect((await back.request("GET", "/api/auth/session")).body.reader).toEqual(before);
    const listed = (await owner.request("GET", "/api/invites")).body.invites;
    expect(listed.map((i: { status: string }) => i.status)).toEqual(["accepted", "revoked"]);
  });

  it("is for the Owner only, and an unknown Invite is a 404", async () => {
    const app = await startTestApp();
    const owner = await app.signInAsOwner();
    const sara = await app.addReader("sara@example.com");
    await app.addReader("omar@example.com");
    const omar = (await owner.request("GET", "/api/invites")).body.invites[0];

    const bySara = await sara.request("DELETE", `/api/invites/${omar.id}`);
    const unknown = await owner.request("DELETE", "/api/invites/9999");

    expect(bySara.status).toBe(403);
    expect(unknown.status).toBe(404);
    expect((await signInRequest(app, "omar@example.com", TEST_PASSWORD)).status).toBe(200);
  });
});

describe("changing your own password (Me › Password)", () => {
  function change(session: { request: TestApp["request"] }, body: Record<string, string>) {
    return session.request("POST", "/api/auth/password", { body });
  }

  it("takes the current password and a new one: the new one works, the old one doesn't", async () => {
    const app = await startTestApp();
    const sara = await app.addReader("sara@example.com");

    const res = await change(sara, { current_password: TEST_PASSWORD, new_password: "my own password" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ changed: true });
    expect((await signInRequest(app, "sara@example.com", TEST_PASSWORD)).status).toBe(401);
    expect((await signInRequest(app, "sara@example.com", "my own password")).status).toBe(200);
  });

  it("keeps this device signed in and signs out the Reader's other devices", async () => {
    const app = await startTestApp();
    const phone = await app.addReader("sara@example.com");
    const laptop = await app.signIn("sara@example.com");
    const owner = await app.signInAsOwner();

    await change(phone, { current_password: TEST_PASSWORD, new_password: "my own password" });

    expect((await phone.request("GET", "/api/brief")).status).toBe(200);
    expect((await laptop.request("GET", "/api/brief")).status).toBe(401);
    expect((await owner.request("GET", "/api/brief")).status).toBe(200);
  });

  it("works for the Owner too", async () => {
    const app = await startTestApp();
    const owner = await app.signInAsOwner();

    expect((await change(owner, { current_password: TEST_PASSWORD, new_password: "the Owner's new one" })).status).toBe(200);
    expect((await signInRequest(app, TEST_OWNER_EMAIL, "the Owner's new one")).status).toBe(200);
  });

  it("refuses a wrong current password, a short new one and two new ones that differ, changing nothing", async () => {
    const app = await startTestApp();
    const sara = await app.addReader("sara@example.com");

    const wrong = await change(sara, { current_password: "not it at all", new_password: "my own password" });
    const short = await change(sara, { current_password: TEST_PASSWORD, new_password: "short" });
    const mismatch = await change(sara, {
      current_password: TEST_PASSWORD,
      new_password: "my own password",
      confirm_password: "my own pasword",
    });
    const signedOut = await app.request("POST", "/api/auth/password", {
      body: { current_password: TEST_PASSWORD, new_password: "my own password" },
    });

    expect(wrong.status).toBe(403);
    expect(wrong.body.error).toBe("Your current password is wrong.");
    expect(short.status).toBe(400);
    expect(mismatch.status).toBe(400);
    expect(signedOut.status).toBe(401);
    expect((await signInRequest(app, "sara@example.com", TEST_PASSWORD)).status).toBe(200);
  });

  it("answers the Me › Password form with a redirect back to it", async () => {
    const app = await startTestApp();
    const sara = await app.addReader("sara@example.com");
    const post = (fields: Record<string, string>) =>
      sara.request("POST", "/api/auth/password", { rawBody: encode(fields), headers: form });

    const wrong = await post({ current_password: "nope nope", new_password: "my own password", confirm_password: "my own password" });
    const mismatch = await post({ current_password: TEST_PASSWORD, new_password: "my own password", confirm_password: "other one!" });
    const done = await post({ current_password: TEST_PASSWORD, new_password: "my own password", confirm_password: "my own password" });

    expect(wrong.headers.get("location")).toBe("/brief/me/password?error=wrong");
    expect(mismatch.headers.get("location")).toBe("/brief/me/password?error=mismatch");
    expect(done.status).toBe(303);
    expect(done.headers.get("location")).toBe("/brief/me/password?changed=1");
    expect((await signInRequest(app, "sara@example.com", "my own password")).status).toBe(200);
  });

  it("counts wrong current passwords toward the rate limit", async () => {
    const app = await startTestApp();
    const sara = await app.addReader("sara@example.com");

    for (let i = 0; i < 10; i++) await change(sara, { current_password: `guess ${i}!`, new_password: "my own password" });
    const res = await change(sara, { current_password: TEST_PASSWORD, new_password: "my own password" });

    expect(res.status).toBe(429);
  });
});

describe("sessions", () => {
  it("are set as a long-lived HttpOnly cookie scoped to the app's base path", async () => {
    const app = await startTestApp();
    await app.signInAsOwner();

    const res = await signInRequest(app, TEST_OWNER_EMAIL, TEST_PASSWORD);

    const header = res.headers.getSetCookie().find((c) => c.startsWith("mb_session="))!;
    expect(header).toMatch(/; HttpOnly/);
    expect(header).toMatch(/; SameSite=Lax/);
    expect(header).toMatch(/; Path=\/brief(;|$)/);
    expect(header).not.toMatch(/; Secure/);
    const maxAge = Number(/Max-Age=(\d+)/.exec(header)![1]);
    expect(maxAge).toBeGreaterThanOrEqual(365 * 24 * 60 * 60);
  });

  it("are Secure when PUBLIC_ORIGIN is https, whatever Host header arrives", async () => {
    const app = await startTestApp({ publicOrigin: "https://news.example.org" });
    await app.signInAsOwner();

    const res = await app.request("POST", "/api/auth/sign-in", {
      body: { email: TEST_OWNER_EMAIL, password: TEST_PASSWORD },
      headers: { host: "evil.example" },
    });

    expect(res.headers.getSetCookie().find((c) => c.startsWith("mb_session="))).toMatch(/; Secure/);
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

  it("end with the sign-out form, which goes back to the sign-in page", async () => {
    const app = await startTestApp();
    const owner = await app.signInAsOwner();

    const out = await owner.request("POST", "/api/auth/sign-out", { rawBody: "", headers: form });

    expect(out.status).toBe(303);
    expect(out.headers.get("location")).toBe("/brief/sign-in");
    expect((await owner.request("GET", "/api/brief")).status).toBe(401);
  });
});
