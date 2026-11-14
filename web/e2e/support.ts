// The browser smoke-test harness (phone size, fakes on). Every spec imports
// `test` and `expect` from here, not from @playwright/test:
//
//   import { E2E_BASE_PATH, expect, postEdition, swipeEdition, test } from "./support";
//
//   test("...", async ({ page, request }) => {
//     await postEdition(request, swipeEdition());
//     await page.goto(E2E_BASE_PATH);
//   });
//
// - The page may only reach the app itself: any other request (images on
//   example.com, fonts, analytics) is aborted, so tests make no real network calls.
// - The database is fresh per run, not per test. Set up data through the API;
//   the latest Edition posted is the one every page shows.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test as base, expect, type APIRequestContext } from "@playwright/test";
import { E2E_BASE_PATH, E2E_INGEST_TOKEN } from "../playwright.config";

export { expect, E2E_BASE_PATH };

export const test = base.extend<{ onlyTheApp: void }>({
  onlyTheApp: [
    async ({ page, baseURL }, use) => {
      const origin = new URL(baseURL!).origin;
      await page.route("**/*", (route) =>
        new URL(route.request().url()).origin === origin ? route.continue() : route.abort("blockedbyclient"),
      );
      await use();
    },
    { auto: true },
  ],
});

type EditionDoc = Record<string, any> & { items: Record<string, any>[] };

const fixturesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "test", "fixtures");

/** The hand-written morning Edition used by the API tests (5 Items, 2 top stories). */
export function morningEdition(): EditionDoc {
  return JSON.parse(readFileSync(path.join(fixturesDir, "edition.morning.json"), "utf8"));
}

/**
 * The morning Edition plus a US Markets and a game Item, so every kind of
 * card extra appears. Swipe order (7 Items): the 2 top stories, then
 * Liverpool, US Markets, Graphic, GitHub Trending, Turn-based RPG & Tactics.
 */
export function swipeEdition(): EditionDoc {
  const edition = morningEdition();
  edition.edition_id = "2026-11-14-morning-swipe";
  edition.generated_at = "2026-11-14T06:10:00+03:00";
  edition.items.push(
    {
      id: "markets-fed-minutes",
      topics: ["us-markets"],
      status: "new",
      time: "2026-11-13T23:30:00+03:00",
      title: "Fed minutes point to a pause",
      summary: "Officials saw little reason to move rates before the new year.",
      sources: [{ title: "Example Markets", url: "https://example.com/markets/fed", type: "independent" }],
      tag: "FED",
    },
    {
      id: "game-tactics-release",
      topics: ["turn-based-rpg-tactics", "trending-games"],
      time: "2026-11-13T15:00:00+03:00",
      title: "A grid tactics sequel gets a release date",
      summary: "The sequel lands next week on PC and Switch.",
      sources: [{ title: "Example Games", url: "https://example.com/games/tactics", type: "independent" }],
      image: "https://example.com/img/tactics.jpg",
      kind: "RELEASE",
      genres: ["Tactics RPG", "Strategy"],
      platforms: ["Windows", "Switch"],
      price: "$29.99",
      release_date: "2026-11-20",
      store_url: "https://example.com/store/tactics",
    },
  );
  return edition;
}

/** Post an Edition to the ingest endpoint with the e2e pipeline token. */
export async function postEdition(request: APIRequestContext, edition: unknown): Promise<void> {
  const res = await request.post(`${E2E_BASE_PATH}/api/editions`, {
    data: edition,
    headers: { authorization: `Bearer ${E2E_INGEST_TOKEN}` },
  });
  expect(res.status(), await res.text()).toBe(200);
}
