// The Interest Profile and onboarding (ticket 07): GET/PATCH /api/me. A
// first-time Reader has followed nothing and gets no Brief until they finish
// onboarding (picking at least one Topic, with their language and city). The
// profile is the Reader's own, kept across devices.
import { describe, expect, it } from "vitest";
import { morningEdition } from "../support/fixtures";
import { startTestApp } from "../support/test-app";

describe("GET /api/me", () => {
  it("shows a first-time Reader who has not been through onboarding, with an empty Brief", async () => {
    const app = await startTestApp();
    await app.postEdition(morningEdition());
    const sara = await app.addReader("sara@example.com", { onboarded: false });

    const me = await sara.request("GET", "/api/me");

    expect(me.status).toBe(200);
    expect(me.body).toEqual({
      reader: { id: expect.any(Number), email: "sara@example.com", role: "reader" },
      onboarded: false,
      language: null,
      city: null,
      topics: [],
    });
    const brief = await sara.request("GET", "/api/brief");
    expect(brief.body.edition).toMatchObject({ id: "2026-11-14-morning" });
    expect(brief.body.items).toEqual([]);
  });

  it("is refused when signed out", async () => {
    const app = await startTestApp();
    expect((await app.request("GET", "/api/me")).status).toBe(401);
    expect((await app.request("PATCH", "/api/me", { body: { city: "Riyadh" } })).status).toBe(401);
  });
});

describe("PATCH /api/me", () => {
  it("finishes onboarding with the Topics picked, the language and the city", async () => {
    const app = await startTestApp();
    await app.postEdition(morningEdition());
    const sara = await app.addReader("sara@example.com", { onboarded: false });

    const res = await sara.request("PATCH", "/api/me", {
      body: { topics: ["liverpool", "ai"], language: "ar", city: "  Jeddah ", onboarded: true },
    });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ onboarded: true, language: "ar", city: "Jeddah", topics: ["ai", "liverpool"] });
    expect((await sara.request("GET", "/api/me")).body).toMatchObject({
      onboarded: true,
      language: "ar",
      city: "Jeddah",
      topics: ["ai", "liverpool"],
    });
    const brief = await sara.request("GET", "/api/brief");
    expect(brief.body.items.map((i: { id: string }) => i.id)).toEqual([
      "ai-open-model-release",
      "lfc-midfielder-fitness",
    ]);
  });

  it("does not finish onboarding without at least one Topic", async () => {
    const app = await startTestApp();
    const sara = await app.addReader("sara@example.com", { onboarded: false });

    const res = await sara.request("PATCH", "/api/me", { body: { topics: [], language: "en", onboarded: true } });

    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/at least one Topic/);
    expect((await sara.request("GET", "/api/me")).body).toMatchObject({ onboarded: false, language: null });
  });

  it("changes language, city and Topics later, and the changes last on every device", async () => {
    const app = await startTestApp();
    const phone = await app.addReader("sara@example.com", { onboarded: false });
    await phone.request("PATCH", "/api/me", { body: { topics: ["ai"], language: "en", city: "Riyadh", onboarded: true } });

    expect((await phone.request("PATCH", "/api/me", { body: { language: "ar" } })).body).toMatchObject({
      language: "ar",
      city: "Riyadh",
      topics: ["ai"],
    });
    await phone.request("PATCH", "/api/me", { body: { city: "Sanaa" } });
    await phone.request("PATCH", "/api/me", { body: { topics: ["yemen", "saudi"] } });

    const laptop = await app.signIn("sara@example.com");
    expect((await laptop.request("GET", "/api/me")).body).toMatchObject({
      onboarded: true,
      language: "ar",
      city: "Sanaa",
      topics: ["saudi", "yemen"],
    });
  });

  it("refuses bad values with reasons, and changes nothing", async () => {
    const app = await startTestApp();
    const sara = await app.addReader("sara@example.com", { onboarded: false });
    await sara.request("PATCH", "/api/me", { body: { topics: ["ai"], language: "en", city: "Riyadh", onboarded: true } });

    for (const body of [
      { language: "fr" },
      { city: "" },
      { city: "x".repeat(81) },
      { city: 42 },
      { topics: ["ai", "formula-1"] },
      { topics: "ai" },
      { onboarded: false },
      { language: "ar", favourite_colour: "blue" },
      { language: "ar", topics: ["no-such-topic"] },
    ]) {
      const res = await sara.request("PATCH", "/api/me", { body });
      expect(res.status, JSON.stringify(body)).toBe(422);
      expect(res.body.reasons.length, JSON.stringify(body)).toBeGreaterThan(0);
    }
    expect((await sara.request("PATCH", "/api/me", { rawBody: "{not json" })).status).toBe(422);

    expect((await sara.request("GET", "/api/me")).body).toMatchObject({
      onboarded: true,
      language: "en",
      city: "Riyadh",
      topics: ["ai"],
    });
  });

  it("clears the city with null", async () => {
    const app = await startTestApp();
    const sara = await app.addReader("sara@example.com");
    await sara.request("PATCH", "/api/me", { body: { city: "Aden" } });

    const res = await sara.request("PATCH", "/api/me", { body: { city: null } });

    expect(res.status).toBe(200);
    expect(res.body.city).toBeNull();
  });

  it("keeps each Reader's profile their own", async () => {
    const app = await startTestApp();
    const owner = await app.signInAsOwner();
    const sara = await app.addReader("sara@example.com", { onboarded: false });

    await sara.request("PATCH", "/api/me", { body: { topics: ["ai"], language: "ar", city: "Aden", onboarded: true } });

    const ownerMe = (await owner.request("GET", "/api/me")).body;
    expect(ownerMe).toMatchObject({ reader: { email: "owner@example.com", role: "owner" }, onboarded: true });
    expect(ownerMe.language).toBeNull();
    expect(ownerMe.city).toBeNull();
    expect(ownerMe.topics).toHaveLength(14);
  });
});
