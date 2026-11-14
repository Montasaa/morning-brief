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
