// The browser smoke-test harness (phone size, fakes on). Every spec imports
// `test` and `expect` from here, not from @playwright/test:
//
//   import { E2E_BASE_PATH, expect, postEdition, swipeEdition, test } from "./support";
//
//   test("...", async ({ page, request }) => {
//     await postEdition(request, swipeEdition());
//     await signIn(page); // every screen but /sign-in needs a session; lands on the Brief
//   });
//
// - The page may only reach the app itself: any other request (images on
//   example.com, fonts, analytics) is aborted, so tests make no real network calls.
// - The database is fresh per run, not per test. Set up data through the API;
//   the latest Edition posted is the one every page shows.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test as base, expect, type APIRequestContext, type Page } from "@playwright/test";
import { E2E_BASE_PATH, E2E_INGEST_TOKEN } from "../playwright.config";

export { expect, E2E_BASE_PATH };
export { lastMagicLink, signIn } from "./support/sign-in";

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

/**
 * The Swipe Brief (rework ticket 08). Only the slide on screen is exposed to
 * assistive tech (the others are inert and aria-hidden), so role queries like
 * `page.getByRole("article")` find the current Item and nothing else.
 *
 * `next` and `back` tap a third of the picture and wait for the move to land:
 * Playwright scrolls an element back into view before tapping it, so tapping
 * again mid-move would undo the move.
 */
export const swipe = {
  /** The current Item's card. */
  card: (page: Page) => page.getByRole("article"),
  /** The current Item's headline. */
  headline: (page: Page) => page.getByRole("article").getByRole("heading", { level: 2 }),
  /** The Cover (the first slide), in either language. */
  cover: (page: Page) => page.getByRole("region", { name: /^(Cover|الغلاف)$/ }),
  /** Tap the lower third of the picture: forward. */
  next: (page: Page) => move(page, /^(Next|التالي)$/, { x: 8, y: 8 }, 1),
  /** Tap the upper third of the picture: back. Below the Topic tabs. */
  back: (page: Page) => move(page, /^(Back|السابق)$/, { x: 8, y: 120 }, -1),
  /** The Topic tabs across the top. */
  tabs: (page: Page) => page.getByRole("navigation", { name: /^(Topics|المواضيع)$/ }),
  /** The action rail on the current Item. */
  rail: (page: Page) => page.getByRole("toolbar", { name: /^(Actions|الإجراءات)$/ }),
  /**
   * A finger drag up the screen by `distance` px (down when negative), made of
   * real touch events through the browser's gesture handling, then lifted.
   * Starts once the feed is still, and resolves once it rests again.
   */
  async drag(page: Page, distance: number, { steps, pause }: { steps: number; pause: number }) {
    await still(page);
    const cdp = await page.context().newCDPSession(page);
    const { width, height } = page.viewportSize()!;
    const x = Math.round(width / 2);
    const y0 = Math.round(distance > 0 ? height * 0.85 : height * 0.25);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y: y0 }] });
    // A finger rests a moment before it moves.
    await page.waitForTimeout(50);
    for (let i = 1; i <= steps; i++) {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: Math.round(y0 - (distance * i) / steps) }] });
      await page.waitForTimeout(pause);
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await cdp.detach();
    await page.waitForTimeout(100);
    await still(page);
  },
};

/** Wait until the feed rests on a slide: the same whole-slide offset twice in a row, 100ms apart. */
async function still(page: Page) {
  const feed = page.getByTestId("swipe-feed");
  let last = -1;
  await expect
    .poll(async () => {
      const at = await feed.evaluate((f) => f.scrollTop / f.clientHeight);
      const resting = Math.abs(at - Math.round(at)) < 0.01 && at === last;
      last = at;
      return resting;
    }, { intervals: [100] })
    .toBe(true);
}

/** Tap a third of the picture and wait until the feed rests one slide further (`step` 1) or back (-1). */
async function move(page: Page, name: RegExp, position: { x: number; y: number }, step: 1 | -1) {
  const feed = page.getByTestId("swipe-feed");
  const from = await feed.evaluate((f) => Math.round(f.scrollTop / f.clientHeight));
  const third = page.getByRole("button", { name });
  // Near the start side, clear of the text and of the rail at the end side (the left in Arabic).
  if (await page.evaluate(() => document.documentElement.dir === "rtl")) {
    position = { ...position, x: (await third.boundingBox())!.width - position.x };
  }
  await third.tap({ position });
  await expect.poll(() => feed.evaluate((f) => f.scrollTop / f.clientHeight)).toBeCloseTo(from + step, 2);
}
