// Graded pictures (rework ticket 10, spec #6): an Item can say what its picture
// is, `image_kind` photo | card | none, and can mark NSFW media and the named
// person a claim is about. Ingest checks the new fields; the Brief, Threads and
// Saved & Search return each Item's `image_kind`, reading a missing one as
// `photo` when there is an image and `none` when there is not.
import { describe, expect, it } from "vitest";
import { morningEdition, type EditionDoc } from "../support/fixtures";
import { startTestApp } from "../support/test-app";

type Pictured = { id: string; image_kind: string };
const kinds = (items: Pictured[]) => Object.fromEntries(items.map((i) => [i.id, i.image_kind]));

/** The morning Edition with graded pictures: a GitHub card, a photo, and two Items left ungraded. */
function gradedEdition(): EditionDoc {
  const edition = morningEdition();
  const byId = (id: string) => edition.items.find((i) => i.id === id)!;
  byId("gh-terminal-agent").image_kind = "card";
  byId("me-yemen-port-talks").image_kind = "photo";
  byId("ai-open-model-release").claim_subject = "A Placeholder Person";
  // ai-open-model-release has an image and no image_kind; lfc-midfielder-fitness has neither.
  return edition;
}

describe("image_kind, nsfw_media and claim_subject at ingest", () => {
  it("are accepted on an Item, additively", async () => {
    const app = await startTestApp();
    const edition = gradedEdition();
    edition.items.find((i) => i.id === "graphic-flood-aftermath")!.nsfw_media = true;

    const res = await app.postEdition(edition);

    expect(res.status, res.text).toBe(200);
    expect(res.body.accepted).toBe(true);
  });

  it("refuse bad values with 422 and store nothing", async () => {
    const app = await startTestApp();
    const edition = morningEdition();
    edition.items[0]!.image_kind = "logo";
    edition.items[1]!.nsfw_media = "yes";
    edition.items[2]!.claim_subject = "";

    const res = await app.postEdition(edition);

    expect(res.status).toBe(422);
    const reasons = (res.body.reasons as string[]).join("\n");
    expect(reasons).toMatch(/\/items\/0\/image_kind/);
    expect(reasons).toMatch(/\/items\/1\/nsfw_media/);
    expect(reasons).toMatch(/\/items\/2\/claim_subject/);
    const brief = await (await app.signInAsOwner()).request("GET", "/api/brief");
    expect(brief.body.items).toEqual([]);
  });
});

describe("each Item's image_kind", () => {
  it("is in the Brief, with a missing one read as photo when there is an image, else none", async () => {
    const app = await startTestApp();
    await app.postEdition(gradedEdition());
    const owner = await app.signInAsOwner();

    const brief = await owner.request("GET", "/api/brief");

    expect(kinds(brief.body.items)).toEqual({
      "gh-terminal-agent": "card",
      "me-yemen-port-talks": "photo",
      "ai-open-model-release": "photo",
      "lfc-midfielder-fitness": "none",
      "graphic-flood-aftermath": "photo",
    });
    // The app ignores claim_subject: it is for the gathering tool.
    expect(brief.text).not.toMatch(/claim_subject|Placeholder Person/);
  });

  it("is in Story Threads and in Saved & Search", async () => {
    const app = await startTestApp();
    const edition = gradedEdition();
    edition.items.find((i) => i.id === "me-yemen-port-talks")!.image_kind = "card";
    await app.postEdition(edition);
    const owner = await app.signInAsOwner();
    await owner.request("POST", "/api/items/gh-terminal-agent/reactions", { body: { kind: "save" } });
    await owner.request("POST", "/api/items/lfc-midfielder-fitness/reactions", { body: { kind: "save" } });

    const thread = await owner.request("GET", "/api/threads/yemen-truce-talks");
    const saved = await owner.request("GET", "/api/saved");
    const search = await owner.request("GET", "/api/search?q=model");

    expect(kinds(thread.body.items)).toEqual({ "me-yemen-port-talks": "card" });
    expect(kinds(saved.body.items)).toEqual({ "gh-terminal-agent": "card", "lfc-midfielder-fitness": "none" });
    expect(kinds(search.body.results)).toEqual({ "ai-open-model-release": "photo" });
  });

  it("an Item graded none shows no picture even when it has an image", async () => {
    const app = await startTestApp();
    const edition = morningEdition();
    edition.items.find((i) => i.id === "ai-open-model-release")!.image_kind = "none";
    await app.postEdition(edition);
    const owner = await app.signInAsOwner();

    const item = (await owner.request("GET", "/api/brief")).body.items.find((i: Pictured) => i.id === "ai-open-model-release");

    expect(item.image_kind).toBe("none");
  });
});
