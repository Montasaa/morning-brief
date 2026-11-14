// What the Brief carries for Arabic (ticket 04). The Brief holds both
// languages, so the app can switch between English and Arabic without
// fetching it again: every Item keeps its `_ar` fields next to the English
// ones, and every Topic it mentions is named in both languages.
import { describe, expect, it } from "vitest";
import { morningEdition } from "../support/fixtures";
import { startTestApp } from "../support/test-app";

type BriefItem = Record<string, unknown> & { id: string };

describe("GET /api/brief in both languages", () => {
  it("names every Topic in Arabic, from the Catalog", async () => {
    const app = await startTestApp();
    await app.postEdition(morningEdition());

    const res = await app.request("GET", "/api/brief");

    expect(res.body.topic_names_ar).toEqual({
      yemen: "اليمن",
      saudi: "السعودية",
      ai: "الذكاء الاصطناعي",
      liverpool: "ليفربول",
      graphic: "مشاهد قاسية",
      "github-trending": "الرائج على GitHub",
    });
  });

  it("falls back to the English name for a Topic the Catalog has no Arabic name for", async () => {
    const app = await startTestApp();
    const edition = morningEdition();
    edition.items[0]!.topics = ["yemen", "formula-1"];
    await app.postEdition(edition);

    const res = await app.request("GET", "/api/brief");

    expect(res.body.topic_names["formula-1"]).toBe("Formula 1");
    expect(res.body.topic_names_ar["formula-1"]).toBe("Formula 1");
  });

  it("keeps each Item's Arabic title, summary and warning next to the English ones, null when missing", async () => {
    const app = await startTestApp();
    await app.postEdition(morningEdition());

    const res = await app.request("GET", "/api/brief");
    const byId = (id: string) => res.body.items.find((i: BriefItem) => i.id === id);

    expect(byId("me-yemen-port-talks")).toMatchObject({
      title: "Truce talks resume over Hodeidah port access",
      title_ar: "استئناف محادثات الهدنة بشأن الوصول إلى ميناء الحديدة",
      summary_ar: "التقى المفاوضون مجددا خلال الليل لمناقشة حركة الشحن عبر الميناء.",
    });
    expect(byId("graphic-flood-aftermath")).toMatchObject({ warning: "Casualties", warning_ar: "ضحايا" });
    expect(byId("ai-open-model-release")).toMatchObject({ title_ar: null, summary_ar: null });
    expect(byId("gh-terminal-agent").extras).toMatchObject({ why_it_matters_ar: "يعمل دون اتصال بالكامل." });
  });
});
