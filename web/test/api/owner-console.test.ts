// The Owner console (ticket 10): "bad source" reports from Readers' hides, and
// ingest health (the latest Edition and recent rejected ingests). Owner only.
import { afterEach, describe, expect, it, vi } from "vitest";
import { morningEdition } from "../support/fixtures";
import { startTestApp, type TestApp, type TestSession } from "../support/test-app";

const hide = (session: TestSession, itemId: string, reason?: string) =>
  session.request("POST", `/api/items/${itemId}/reactions`, { body: reason ? { kind: "hide", reason } : { kind: "hide" } });

async function reportsOf(owner: TestSession) {
  const res = await owner.request("GET", "/api/owner/reports");
  expect(res.status, res.text).toBe(200);
  return res.body as {
    reports: {
      item: { id: string; title: string };
      topics: { id: string; name: string }[];
      sources: { title: string; url: string }[];
      readers: number;
      last_reported_at: string;
    }[];
    sources: { source: string; item_ids: string[]; readers: number }[];
  };
}

async function healthOf(owner: TestSession) {
  const res = await owner.request("GET", "/api/owner/health");
  expect(res.status, res.text).toBe(200);
  return res.body as {
    latest_edition: { edition_id: string; kind: string; generated_at: string; received_at: string; items: number } | null;
    rejections: { received_at: string; endpoint: string; edition_id: string | null; reasons: string[] }[];
  };
}

describe("bad source reports", () => {
  it("a bad source hide creates a report with the Item, its Topics and sources; other hide reasons do not", async () => {
    const app = await startTestApp();
    await app.postEdition(morningEdition());
    const owner = await app.signInAsOwner();
    const sara = await app.addReader("sara@example.com");

    expect((await reportsOf(owner)).reports).toEqual([]);

    expect((await hide(sara, "ai-open-model-release", "not_interested")).status).toBe(200);
    expect((await hide(sara, "lfc-midfielder-fitness", "already_seen")).status).toBe(200);
    expect((await hide(sara, "gh-terminal-agent")).status).toBe(200);
    expect((await reportsOf(owner)).reports).toEqual([]);

    expect((await hide(sara, "me-yemen-port-talks", "bad_source")).status).toBe(200);
    const { reports } = await reportsOf(owner);
    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatchObject({
      item: { id: "me-yemen-port-talks", title: "Truce talks resume over Hodeidah port access" },
      topics: [
        { id: "yemen", name: "Yemen" },
        { id: "saudi", name: "Saudi" },
      ],
      sources: [
        { title: "Example Wire", url: "https://example.com/wire/hodeidah" },
        { title: "Example Daily", url: "https://example.com/daily/hodeidah" },
      ],
      readers: 1,
    });
    expect(typeof reports[0]!.last_reported_at).toBe("string");
  });

  it("groups reports by Item and by source, counting Readers, most reported first", async () => {
    const app = await startTestApp();
    const edition = morningEdition();
    // Two Items cite the same outlet.
    edition.items.find((i) => i.id === "ai-open-model-release")!.sources.push({
      title: "Example Wire",
      url: "https://example.com/wire/open-model",
      type: "wire",
    });
    await app.postEdition(edition);
    const owner = await app.signInAsOwner();
    const sara = await app.addReader("sara@example.com");
    const omar = await app.addReader("omar@example.com");

    await hide(sara, "me-yemen-port-talks", "bad_source");
    await hide(omar, "me-yemen-port-talks", "bad_source");
    await hide(omar, "ai-open-model-release", "bad_source");
    await hide(owner, "lfc-midfielder-fitness", "not_interested");

    const { reports, sources } = await reportsOf(owner);
    expect(reports.map((r) => [r.item.id, r.readers])).toEqual([
      ["me-yemen-port-talks", 2],
      ["ai-open-model-release", 1],
    ]);
    expect(sources.map((s) => [s.source, [...s.item_ids].sort(), s.readers])).toEqual([
      ["Example Wire", ["ai-open-model-release", "me-yemen-port-talks"], 2],
      ["Example Daily", ["me-yemen-port-talks"], 2],
      ["Example Tech", ["ai-open-model-release"], 1],
    ]);
  });

  it("never names the Readers who reported", async () => {
    const app = await startTestApp();
    await app.postEdition(morningEdition());
    const owner = await app.signInAsOwner();
    const sara = await app.addReader("sara@example.com");
    await hide(sara, "gh-terminal-agent", "bad_source");

    const res = await owner.request("GET", "/api/owner/reports");
    expect(res.body.reports).toHaveLength(1);
    expect(res.text).not.toContain("sara@example.com");
  });

  it("withdraws the report when the hide is undone or its reason changes", async () => {
    const app = await startTestApp();
    await app.postEdition(morningEdition());
    const owner = await app.signInAsOwner();
    const sara = await app.addReader("sara@example.com");

    await hide(sara, "gh-terminal-agent", "bad_source");
    await hide(sara, "ai-open-model-release", "bad_source");
    expect((await reportsOf(owner)).reports).toHaveLength(2);

    await sara.request("DELETE", "/api/items/gh-terminal-agent/reactions/hide");
    await hide(sara, "ai-open-model-release", "already_seen");
    expect((await reportsOf(owner)).reports).toEqual([]);
  });
});

describe("ingest health", () => {
  afterEach(() => vi.useRealTimers());

  it("shows no Edition before the first ingest", async () => {
    const app = await startTestApp();
    const owner = await app.signInAsOwner();
    expect(await healthOf(owner)).toEqual({ latest_edition: null, rejections: [] });
  });

  it("shows the latest Edition's time and Item count", async () => {
    const app = await startTestApp();
    const owner = await app.signInAsOwner();
    await app.postEdition(morningEdition());

    expect((await healthOf(owner)).latest_edition).toMatchObject({
      edition_id: "2026-11-14-morning",
      kind: "morning",
      generated_at: "2026-11-14T06:05:00+03:00",
      items: 5,
    });

    const evening = morningEdition();
    evening.edition_id = "2026-11-14-evening";
    evening.kind = "evening";
    evening.generated_at = "2026-11-14T19:20:00+03:00";
    evening.items = evening.items.slice(0, 3);
    evening.top_stories = evening.top_stories?.filter((id: string) => evening.items.some((i) => i.id === id));
    expect((await app.postEdition(evening)).status).toBe(200);

    // An older Edition posted late does not become the latest.
    const yesterday = morningEdition();
    yesterday.edition_id = "2026-11-13-evening";
    yesterday.kind = "evening";
    yesterday.generated_at = "2026-11-13T19:20:00+03:00";
    expect((await app.postEdition(yesterday)).status).toBe(200);

    const latest = (await healthOf(owner)).latest_edition!;
    expect(latest).toMatchObject({ edition_id: "2026-11-14-evening", kind: "evening", items: 3 });
    expect(Number.isNaN(Date.parse(latest.received_at))).toBe(false);
  });

  it("lists rejected ingests with their reasons, newest first", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const app = await startTestApp();
    const owner = await app.signInAsOwner();

    vi.setSystemTime(new Date("2026-11-14T03:00:00Z"));
    const broken = morningEdition();
    delete broken.items[0]!.title;
    const rejected = await app.postEdition(broken);
    expect(rejected.status).toBe(422);

    vi.setSystemTime(new Date("2026-11-14T03:05:00Z"));
    const notJson = await app.request("POST", "/api/editions", { rawBody: "{not json", token: app.ingestToken });
    expect(notJson.status).toBe(400);

    vi.setSystemTime(new Date("2026-11-14T03:10:00Z"));
    const legacy = await app.request("POST", "/api/editions/legacy", { body: { nope: true }, token: app.ingestToken });
    expect(legacy.status).toBe(422);

    // Not counted: calls without the pipeline token, and legacy dry runs.
    expect((await app.request("POST", "/api/editions", { body: broken, token: "wrong" })).status).toBe(401);
    expect((await app.request("POST", "/api/editions/legacy", { body: broken })).status).toBe(401);
    expect(
      (await app.request("POST", "/api/editions/legacy?dry_run=1", { body: { nope: true }, token: app.ingestToken }))
        .status,
    ).toBe(422);

    const { rejections, latest_edition } = await healthOf(owner);
    expect(latest_edition).toBeNull();
    expect(rejections).toEqual([
      {
        received_at: "2026-11-14T03:10:00.000Z",
        endpoint: "/api/editions/legacy",
        edition_id: null,
        reasons: legacy.body.reasons,
      },
      {
        received_at: "2026-11-14T03:05:00.000Z",
        endpoint: "/api/editions",
        edition_id: null,
        reasons: ["Body is not valid JSON"],
      },
      {
        received_at: "2026-11-14T03:00:00.000Z",
        endpoint: "/api/editions",
        edition_id: "2026-11-14-morning",
        reasons: rejected.body.reasons,
      },
    ]);
    expect(rejected.body.reasons.length).toBeGreaterThan(0);
  });

  it("keeps the latest Edition when a later ingest is rejected", async () => {
    const app = await startTestApp();
    const owner = await app.signInAsOwner();
    await app.postEdition(morningEdition());
    const broken = morningEdition();
    broken.edition_id = "2026-11-14-evening";
    broken.kind = "teatime";
    await app.postEdition(broken);

    const health = await healthOf(owner);
    expect(health.latest_edition).toMatchObject({ edition_id: "2026-11-14-morning", items: 5 });
    expect(health.rejections).toHaveLength(1);
    expect(health.rejections[0]).toMatchObject({ endpoint: "/api/editions", edition_id: "2026-11-14-evening" });
  });

  it("lists only recent rejections", async () => {
    const app = await startTestApp();
    const owner = await app.signInAsOwner();
    for (let n = 0; n < 25; n++) {
      await app.request("POST", "/api/editions", { body: { edition_id: `bad-${n}` }, token: app.ingestToken });
    }
    const { rejections } = await healthOf(owner);
    expect(rejections).toHaveLength(20);
    expect(rejections[0]!.edition_id).toBe("bad-24");
  });
});

describe("access", () => {
  async function appWithReader(): Promise<{ app: TestApp; owner: TestSession; sara: TestSession }> {
    const app = await startTestApp();
    const owner = await app.signInAsOwner();
    const sara = await app.addReader("sara@example.com");
    return { app, owner, sara };
  }

  for (const path of ["/api/owner/reports", "/api/owner/health"]) {
    it(`only the Owner can open ${path}`, async () => {
      const { app, owner, sara } = await appWithReader();
      expect((await app.request("GET", path)).status).toBe(401);
      expect((await sara.request("GET", path)).status).toBe(403);
      expect((await owner.request("GET", path)).status).toBe(200);
    });
  }
});
