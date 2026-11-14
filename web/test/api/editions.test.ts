import { describe, expect, it } from "vitest";
import { morningEdition } from "../support/fixtures";
import { startTestApp } from "../support/test-app";

describe("POST /api/editions (Edition ingest)", () => {
  it("accepts a valid Edition posted with the bearer token and returns counts", async () => {
    const app = await startTestApp();

    const res = await app.postEdition(morningEdition());

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      accepted: true,
      edition_id: "2026-11-14-morning",
      counts: { items: 5, threads: 1, topics: 6 },
    });
  });

  it("refuses an Edition posted without a token or with a wrong one", async () => {
    const app = await startTestApp();

    const none = await app.request("POST", "/api/editions", { body: morningEdition() });
    const wrong = await app.request("POST", "/api/editions", { body: morningEdition(), token: "not-the-token" });

    expect(none.status).toBe(401);
    expect(wrong.status).toBe(401);
    expect(none.body).toMatchObject({ accepted: false });
    const brief = await (await app.signInAsOwner()).request("GET", "/api/brief");
    expect(brief.body.edition).toBeNull();
    expect(brief.body.items).toEqual([]);
  });

  it("refuses every post when no ingest token is configured", async () => {
    const app = await startTestApp({ ingestToken: "" });

    const res = await app.request("POST", "/api/editions", { body: morningEdition(), token: "" });

    expect(res.status).toBe(401);
  });

  it("rejects an invalid Edition with reasons and stores nothing from it", async () => {
    const app = await startTestApp();
    const doc = morningEdition();
    delete doc.items[3]!.topics; // the fourth Item has no Topic

    const res = await app.postEdition(doc);

    expect(res.status).toBe(422);
    expect(res.body.accepted).toBe(false);
    expect(res.body.reasons.join("\n")).toMatch(/\/items\/3.*topics/);
    const brief = await (await app.signInAsOwner()).request("GET", "/api/brief");
    expect(brief.body.edition).toBeNull();
    expect(brief.body.items).toEqual([]);
  });

  it("rejects a body that is not JSON", async () => {
    const app = await startTestApp();

    const res = await app.request("POST", "/api/editions", { rawBody: "{not json", token: app.ingestToken });

    expect(res.status).toBe(400);
    expect(res.body.accepted).toBe(false);
    expect(res.body.reasons[0]).toMatch(/JSON/);
  });

  it("rejects an Edition whose references do not resolve, keeping the previous Edition intact", async () => {
    const app = await startTestApp();
    await app.postEdition(morningEdition());

    const evening = morningEdition();
    evening.edition_id = "2026-11-14-evening";
    evening.kind = "evening";
    evening.generated_at = "2026-11-14T19:20:00+03:00";
    evening.items[0]!.title = "Changed title that must not be stored";
    evening.items[1]!.thread_id = "no-such-thread";
    evening.items.push({ ...evening.items[2]! }); // duplicate Item id
    evening.top_stories = ["not-an-item"];

    const res = await app.postEdition(evening);

    expect(res.status).toBe(422);
    const all = res.body.reasons.join("\n");
    expect(all).toMatch(/no-such-thread/);
    expect(all).toMatch(/lfc-midfielder-fitness/);
    expect(all).toMatch(/not-an-item/);
    const brief = await (await app.signInAsOwner()).request("GET", "/api/brief");
    expect(brief.body.edition.id).toBe("2026-11-14-morning");
    expect(brief.body.items.map((i: { title: string }) => i.title)).not.toContain(
      "Changed title that must not be stored",
    );
  });

  it("gives the same stored state when the same Edition id is posted twice", async () => {
    const app = await startTestApp();
    const owner = await app.signInAsOwner(); // a Reader before the Edition, so their top stories are picked then

    const first = await app.postEdition(morningEdition());
    const briefAfterFirst = await owner.request("GET", "/api/brief");
    const second = await app.postEdition(morningEdition());
    const briefAfterSecond = await (await app.signInAsOwner()).request("GET", "/api/brief");

    expect(second.status).toBe(200);
    expect(second.body).toEqual(first.body);
    expect(briefAfterSecond.body).toEqual(briefAfterFirst.body);
    expect(briefAfterSecond.body.items).toHaveLength(5);
  });

  it("upserts Items by stable id: a later Edition replaces an Item rather than duplicating it", async () => {
    const app = await startTestApp();
    await app.postEdition(morningEdition());

    const evening = morningEdition();
    evening.edition_id = "2026-11-14-evening";
    evening.kind = "evening";
    evening.generated_at = "2026-11-14T19:20:00+03:00";
    evening.items[0]!.title = "Truce talks agree a shipping corridor";
    evening.items[0]!.status = "updated";
    await app.postEdition(evening);

    const brief = await (await app.signInAsOwner()).request("GET", "/api/brief");
    const ids = brief.body.items.map((i: { id: string }) => i.id);
    expect(brief.body.edition.id).toBe("2026-11-14-evening");
    expect(ids.filter((id: string) => id === "me-yemen-port-talks")).toHaveLength(1);
    expect(ids).toHaveLength(5);
    const talks = brief.body.items.find((i: { id: string }) => i.id === "me-yemen-port-talks");
    expect(talks).toMatchObject({ title: "Truce talks agree a shipping corridor", status: "updated" });
  });

  it("does not let an older Edition posted late overwrite a newer Item or become the latest", async () => {
    const app = await startTestApp();
    const evening = morningEdition();
    evening.edition_id = "2026-11-14-evening";
    evening.kind = "evening";
    evening.generated_at = "2026-11-14T19:20:00+03:00";
    evening.items[0]!.title = "Truce talks agree a shipping corridor";
    await app.postEdition(evening);

    const lateMorning = await app.postEdition(morningEdition());

    expect(lateMorning.status).toBe(200);
    const brief = await (await app.signInAsOwner()).request("GET", "/api/brief");
    expect(brief.body.edition.id).toBe("2026-11-14-evening");
    expect(brief.body.items.find((i: { id: string }) => i.id === "me-yemen-port-talks").title).toBe(
      "Truce talks agree a shipping corridor",
    );
  });
});
