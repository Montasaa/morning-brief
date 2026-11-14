import { describe, expect, it } from "vitest";
import { morningEdition } from "../support/fixtures";
import { startTestApp } from "../support/test-app";

type BriefItem = { id: string; title: string; time: string };

describe("GET /api/brief", () => {
  it("is empty before any Edition has been ingested", async () => {
    const app = await startTestApp();

    const res = await (await app.signInAsOwner()).request("GET", "/api/brief");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ edition: null, items: [] });
  });

  it("returns the latest Edition's Items newest first", async () => {
    const app = await startTestApp();
    const edition = morningEdition();
    edition.items.forEach((i) => (i.topics = ["ai"])); // one group, no top stories: plain newest first
    delete edition.top_stories;
    await app.postEdition(edition);

    const res = await (await app.signInAsOwner()).request("GET", "/api/brief");

    expect(res.status).toBe(200);
    expect(res.body.edition).toEqual({
      id: "2026-11-14-morning",
      kind: "morning",
      generated_at: "2026-11-14T06:05:00+03:00",
      item_count: 5,
    });
    expect(res.body.items.map((i: BriefItem) => i.id)).toEqual([
      "me-yemen-port-talks", // 05:40
      "lfc-midfielder-fitness", // 01:15
      "ai-open-model-release", // 13 Nov 22:10
      "graphic-flood-aftermath", // 13 Nov 20:30
      "gh-terminal-agent", // 13 Nov 18:00
    ]);
  });

  it("returns each Item's fields from the Edition, extras included", async () => {
    const app = await startTestApp();
    await app.postEdition(morningEdition());

    const res = await (await app.signInAsOwner()).request("GET", "/api/brief");

    const talks = res.body.items.find((i: BriefItem) => i.id === "me-yemen-port-talks");
    expect(talks).toMatchObject({
      topics: ["yemen", "saudi"],
      thread_id: "yemen-truce-talks",
      status: "new",
      time: "2026-11-14T05:40:00+03:00",
      title: "Truce talks resume over Hodeidah port access",
      title_ar: "استئناف محادثات الهدنة بشأن الوصول إلى ميناء الحديدة",
      image: "https://example.com/img/hodeidah.jpg",
    });
    expect(talks.sources).toHaveLength(2);
    const ai = res.body.items.find((i: BriefItem) => i.id === "ai-open-model-release");
    expect(ai.extras).toEqual({ kind: "MODEL", try_url: "https://example.com/demo", pricing: "Open weights" });
  });

  it("builds the Brief from the latest Edition alone: Items it no longer carries are gone", async () => {
    const app = await startTestApp();
    await app.postEdition(morningEdition());

    const evening = morningEdition();
    evening.edition_id = "2026-11-14-evening";
    evening.kind = "evening";
    evening.generated_at = "2026-11-14T19:20:00+03:00";
    evening.items = evening.items.filter((i) => i.id !== "gh-terminal-agent");
    evening.items.push({
      id: "ai-evening-tool",
      topics: ["ai"],
      status: "new",
      time: "2026-11-14T18:30:00+03:00",
      title: "An evening tool launch",
      summary: "Launched this evening.",
      sources: [{ title: "Example Tech", url: "https://example.com/tech/tool", type: "independent" }],
    });
    await app.postEdition(evening);

    const res = await (await app.signInAsOwner()).request("GET", "/api/brief");

    const ids = res.body.items.map((i: BriefItem) => i.id);
    expect(ids).toContain("ai-evening-tool");
    expect(ids).not.toContain("gh-terminal-agent");
    expect(res.body.edition).toMatchObject({ id: "2026-11-14-evening", kind: "evening", item_count: 5 });
  });
});
