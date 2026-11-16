import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Ajv2020 } from "ajv/dist/2020.js";
import addFormatsModule from "ajv-formats";
import { describe, expect, it } from "vitest";
import { morningEdition } from "../support/fixtures";

// The schema file itself is the contract the gathering side validates against,
// so it is tested directly: Draft 2020-12 with format checks, as the README does
// for the v2 sample with Python's Draft202012Validator.
const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const schema = JSON.parse(readFileSync(path.join(repoRoot, "schema", "edition.v3.schema.json"), "utf8"));
const addFormats = addFormatsModule as unknown as (ajv: Ajv2020) => Ajv2020;
const validate = addFormats(new Ajv2020({ allErrors: true, strict: true })).compile(schema);

function reasons(doc: unknown): string {
  validate(doc);
  return (validate.errors ?? []).map((e) => `${e.instancePath || "/"} ${e.message ?? ""}`).join("\n");
}

describe("Edition v3 JSON Schema", () => {
  it("is a draft 2020-12 schema versioned next to the v2 one", () => {
    expect(schema.$schema).toBe("https://json-schema.org/draft/2020-12/schema");
    expect(schema.$id).toMatch(/schema\/edition\.v3\.schema\.json$/);
  });

  it("accepts the hand-written fixture Edition", () => {
    expect(reasons(morningEdition())).toBe("");
  });

  it("rejects an Item with no Topic", () => {
    const missing = morningEdition();
    delete missing.items[1]!.topics;
    expect(reasons(missing)).toMatch(/\/items\/1 .*topics/);

    const empty = morningEdition();
    empty.items[1]!.topics = [];
    expect(reasons(empty)).toMatch(/\/items\/1\/topics/);
  });

  it("checks formats: an Item time without a UTC offset is rejected", () => {
    const doc = morningEdition();
    doc.items[0]!.time = "2026-11-14 05:40";
    expect(reasons(doc)).toMatch(/\/items\/0\/time/);
  });

  it("requires the Riyadh offset on generated_at", () => {
    const doc = morningEdition();
    doc.generated_at = "2026-11-14T03:05:00Z";
    expect(reasons(doc)).toMatch(/\/generated_at/);
  });

  it("rejects an unknown Edition kind and unknown top-level fields", () => {
    const doc = morningEdition();
    doc.kind = "noon";
    doc.sections = {};
    const found = reasons(doc);
    expect(found).toMatch(/\/kind/);
    expect(found).toMatch(/additional properties/);
  });

  it("allows an Item without Arabic text (legacy v2 files have none)", () => {
    const doc = morningEdition();
    expect(doc.items[1]!.title_ar).toBeUndefined();
    expect(reasons(doc)).toBe("");
  });

  it("takes an optional image_kind, nsfw_media and claim_subject on an Item (rework ticket 10)", () => {
    const doc = morningEdition();
    doc.items[0]!.image_kind = "photo";
    doc.items[1]!.image_kind = "card";
    doc.items[2]!.image_kind = "none";
    doc.items[4]!.nsfw_media = true;
    doc.items[3]!.claim_subject = "A Placeholder Person";
    expect(reasons(doc)).toBe("");

    const bad = morningEdition();
    bad.items[0]!.image_kind = "logo";
    bad.items[1]!.nsfw_media = 1;
    bad.items[2]!.claim_subject = "";
    const found = reasons(bad);
    expect(found).toMatch(/\/items\/0\/image_kind/);
    expect(found).toMatch(/\/items\/1\/nsfw_media/);
    expect(found).toMatch(/\/items\/2\/claim_subject/);
  });
});
