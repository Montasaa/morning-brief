import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const fixturesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "fixtures");

/** A loosely typed Edition document, so tests can break it on purpose. */
export type EditionDoc = Record<string, any> & { items: Record<string, any>[] };

/** A fresh deep copy of a fixture file under test/fixtures. */
export function loadFixture(name: string): EditionDoc {
  return JSON.parse(readFileSync(path.join(fixturesDir, name), "utf8"));
}

/** The hand-written valid morning Edition (5 Items, 1 Story Thread). */
export function morningEdition(): EditionDoc {
  return loadFixture("edition.morning.json");
}

/** A v2 / rev 2.3 brief.json kept as a legacy-importer fixture (test/fixtures/legacy). */
export type LegacyBriefDoc = Record<string, any> & { sections: Record<string, { items: Record<string, any>[] }> };

/** The 2026-11-14 v2 sample (samples/brief.sample.json): the morning run, 156 Items, no Arabic. */
export function legacySample(): LegacyBriefDoc {
  return JSON.parse(readFileSync(path.join(fixturesDir, "legacy", "brief.sample.2026-11-14-morning.json"), "utf8"));
}

/** Today's live rev 2.3 brief.json (the 2026-11-14 19:15 evening refresh): 63 Items with Arabic. */
export function legacyToday(): LegacyBriefDoc {
  return JSON.parse(readFileSync(path.join(fixturesDir, "legacy", "brief.rev2.3.2026-11-14-evening.json"), "utf8"));
}
