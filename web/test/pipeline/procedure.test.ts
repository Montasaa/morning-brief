// Pipeline v3 (ticket 19): the procedure document the agent follows.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { repoRoot } from "../support/pipeline-v3";

const read = (name: string) => readFileSync(path.join(repoRoot, "pipeline", name), "utf8");
const steps = (doc: string) => doc.split("\n").filter((line) => /^\d+\.\s/.test(line));

describe("the v3 procedure", () => {
  it("sits alongside the v2 procedure, which keeps running unchanged", () => {
    const v2 = read("PIPELINE.md");
    const v3 = read("PIPELINE-v3.md");
    expect(v2).toMatch(/Send a 3-line lowercase summary/);
    expect(v3).toMatch(/alongside/i);
    expect(v3).toMatch(/\[`PIPELINE\.md`\]\(PIPELINE\.md\)/);
  });

  it("runs at 06:00 and 19:15 Asia/Riyadh, from the gathering list, posting to the app", () => {
    const v3 = read("PIPELINE-v3.md");
    expect(v3).toMatch(/06:00/);
    expect(v3).toMatch(/19:15/);
    expect(v3).toMatch(/Asia\/Riyadh/);
    expect(v3).toMatch(/edition_v3\.py gathering-list/);
    expect(v3).toMatch(/edition_v3\.py run/);
    expect(v3).toMatch(/scripts\/tiktok_trends\.py/);
  });

  it("no longer sends the 3-line summary: push replaces it", () => {
    const v3 = read("PIPELINE-v3.md");
    for (const step of steps(v3).filter((s) => /summary/i.test(s))) {
      expect(step).toMatch(/\bno(t)?\b/i);
    }
    expect(v3).toMatch(/3-line summary is not sent/);
    expect(v3).toMatch(/push/i);
  });

  it("takes secrets only from the environment", () => {
    const v3 = read("PIPELINE-v3.md");
    expect(v3).toMatch(/`INGEST_TOKEN` \(secret\)/);
    expect(v3).not.toMatch(/--token/);
  });

  it("describes Adult Trending from Reddit RSS, its fixed limits, image grading and sentence case (rework ticket 10)", () => {
    const v3 = read("PIPELINE-v3.md");
    expect(v3).toMatch(/Reddit only/);
    expect(v3).toMatch(/RSS/);
    expect(v3).toMatch(/nsfw_media/);
    expect(v3).toMatch(/minors/);
    expect(v3).toMatch(/non-consensual/);
    expect(v3).toMatch(/leaked/);
    expect(v3).toMatch(/claim_subject/);
    expect(v3).toMatch(/image_kind/);
    expect(v3).toMatch(/sentence case/);
    expect(v3).not.toMatch(/mainstream outlets only/);
  });
});
