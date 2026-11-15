// Smoke tests for the Swipe Brief at phone size, in the Reels look (rework
// ticket 08, spec #6): the Cover, one Item per screen moved by a vertical drag
// that snaps, the tap thirds and the keys, Topic tabs, the action rail,
// double-tap to like, the read sheet, pictures, and "You're caught up".
// The veil is in e2e/sensitive-topics.spec.ts and Arabic in e2e/arabic-rtl.spec.ts.
import type { Page } from "@playwright/test";
import { E2E_BASE_PATH, expect, postEdition, signIn, swipe, swipeEdition, test } from "./support";

/** The swipe Edition's Items in Brief order: the 2 top stories, then one group per Topic. */
const ORDER = [
  { topic: "Yemen", title: "Truce talks resume over Hodeidah port access" },
  { topic: "AI", title: "A new open-weights model tops the coding leaderboard" },
  { topic: "Liverpool", title: "Midfielder back in full training before the weekend" },
  { topic: "US Markets", title: "Fed minutes point to a pause" },
  { topic: "Graphic", title: "Flood aftermath leaves villages cut off" },
  { topic: "GitHub Trending", title: "example/terminal-agent" },
  { topic: "Turn-based RPG & Tactics", title: "A grid tactics sequel gets a release date" },
];
const GRAPHIC = 4;

/** The current slide's headline, or the veiled Item's Topic for the sensitive one. */
async function expectAt(page: Page, i: number) {
  if (i === GRAPHIC) await expect(page.getByRole("button", { name: /Tap to view/ })).toContainText("Graphic");
  else await expect(swipe.headline(page)).toHaveText(ORDER[i]!.title);
}

test.beforeEach(async ({ request, page }) => {
  await postEdition(request, swipeEdition());
  await signIn(page);
});

test("opens on the Cover, taps through every Item to You're caught up, and goes back to the top", async ({ page }) => {
  await page.goto(E2E_BASE_PATH);

  const cover = swipe.cover(page);
  await expect(cover.getByRole("heading", { level: 1 })).toHaveText("Saturday 14 November");
  await expect(cover).toContainText("Good morning");
  await expect(cover).toContainText("Morning Edition · 7 Items");
  // Its Widgets are covered by e2e/widgets.spec.ts.
  await expect(page.getByRole("button", { name: "Back", exact: true })).toHaveCount(0);

  // The lower third goes forward, the upper third back.
  await swipe.next(page);
  await expectAt(page, 0);
  await expect(cover).toHaveCount(0);
  await swipe.back(page);
  await expect(cover).toBeVisible();

  for (let i = 0; i < ORDER.length; i++) {
    await swipe.next(page);
    await expectAt(page, i);
  }
  await swipe.back(page);
  await expectAt(page, ORDER.length - 2);
  await swipe.next(page);
  await swipe.next(page);

  const end = page.getByRole("region", { name: "End of the Brief" });
  await expect(end.getByRole("heading", { name: "You're caught up" })).toBeVisible();
  await expect(end).toContainText("Next Edition at 19:15");
  await expect(page.getByRole("button", { name: "Next", exact: true })).toHaveCount(0);

  await end.getByRole("button", { name: "Back to the top" }).tap();
  await expect(cover).toBeVisible();
});

test("j/k, the arrow keys, Space and Page Down move one Item at a time", async ({ page }) => {
  await page.goto(E2E_BASE_PATH);
  await expect(swipe.cover(page)).toBeVisible();

  await page.keyboard.press("j");
  await expectAt(page, 0);
  await page.keyboard.press("ArrowDown");
  await expectAt(page, 1);
  await page.keyboard.press("Space");
  await expectAt(page, 2);
  await page.keyboard.press("PageDown");
  await expectAt(page, 3);
  await page.keyboard.press("k");
  await expectAt(page, 2);
  await page.keyboard.press("ArrowUp");
  await expectAt(page, 1);
  await page.keyboard.press("PageUp");
  await expectAt(page, 0);
  await page.keyboard.press("k");
  await page.keyboard.press("k");
  await expect(swipe.cover(page)).toBeVisible();
});

test("the bottom tabs switch screens", async ({ page }) => {
  await page.goto(E2E_BASE_PATH);
  const tabs = page.getByRole("navigation", { name: "Tabs" });
  await expect(tabs.getByRole("link", { name: "Brief" })).toHaveAttribute("aria-current", "page");

  for (const name of ["Threads", "Saved & Search", "Me"]) {
    await tabs.getByRole("link", { name, exact: true }).tap();
    await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
    await expect(tabs.getByRole("link", { name, exact: true })).toHaveAttribute("aria-current", "page");
  }

  await tabs.getByRole("link", { name: "Brief" }).tap();
  await expect(swipe.cover(page)).toBeVisible();
});

test("a vertical drag snaps exactly one Item per stop, however far or fast it goes", async ({ page }) => {
  await page.goto(E2E_BASE_PATH);
  await expect(swipe.cover(page)).toBeVisible();
  // A gesture made while the dev server is still loading the page's scripts can be dropped.
  await page.waitForLoadState("networkidle");
  const height = page.viewportSize()!.height;
  // Distance decides these gestures, not speed (a fast short flick is judged by its speed,
  // which CDP's event timing makes unreliable here).
  const quick = { steps: 8, pause: 8 };
  const slow = { steps: 40, pause: 30 };

  // Most of the screen, slowly: the next Item.
  await swipe.drag(page, height * 0.75, slow);
  await expectAt(page, 0);
  // Most of the screen, quickly: still just one Item.
  await swipe.drag(page, height * 0.75, quick);
  await expectAt(page, 1);
  // A short, slow drag settles back where it was.
  await swipe.drag(page, height * 0.25, slow);
  await expectAt(page, 1);
  // Down: back one.
  await swipe.drag(page, -height * 0.6, slow);
  await expectAt(page, 0);
});

test("Topic tabs follow the Item on screen and jump to a Topic's first Item", async ({ page }) => {
  await page.goto(E2E_BASE_PATH);
  const tabs = swipe.tabs(page);
  const tab = (name: string) => tabs.getByRole("button", { name, exact: true });
  // "For you", then the Topics in Brief order.
  await expect(tabs.getByRole("button")).toHaveText(["For you", "Liverpool", "US Markets", "Graphic", "GitHub Trending", "Turn-based RPG & Tactics"]);
  await expect(tab("For you")).toHaveAttribute("aria-current", "true");

  await swipe.next(page);
  await swipe.next(page);
  await expect(tab("For you")).toHaveAttribute("aria-current", "true");
  await swipe.next(page);
  await expectAt(page, 2);
  await expect(tab("Liverpool")).toHaveAttribute("aria-current", "true");
  await expect(tabs.locator('[aria-current="true"]')).toHaveCount(1);

  await tab("GitHub Trending").tap();
  await expectAt(page, 5);
  await expect(tab("GitHub Trending")).toHaveAttribute("aria-current", "true");

  await tab("For you").tap();
  await expectAt(page, 0);
});

test("tapping the text opens the read sheet with the whole story, and the Item comes back dimmed", async ({ page }) => {
  // The database lasts the whole run: start with the first Item not opened yet.
  expect((await page.request.delete(`${E2E_BASE_PATH}/api/items/me-yemen-port-talks/reactions/open`)).status()).toBe(200);
  await page.clock.setFixedTime(new Date("2026-11-14T06:30:00+03:00"));
  await page.goto(E2E_BASE_PATH);

  // 1: the card shows Topic · time, the headline and the summary.
  await swipe.next(page);
  const card = swipe.card(page);
  await expect(card).toContainText("Yemen · 50m ago");
  await expect(card).toContainText("Negotiators met again overnight");
  await expect(card).toHaveAttribute("data-dimmed", "false");

  // Tapping the summary (or the headline) opens it.
  await card.getByText("Negotiators met again overnight").tap();
  const sheet = page.getByRole("dialog", { name: ORDER[0]!.title });
  await expect(sheet.getByRole("heading", { level: 2 })).toHaveText(ORDER[0]!.title);
  await expect(sheet).toContainText("Negotiators met again overnight");
  await expect(sheet).toContainText("Also in Saudi");
  const sources = sheet.getByRole("list", { name: "Sources" });
  await expect(sources.getByRole("link", { name: "Example Wire" })).toHaveAttribute("href", "https://example.com/wire/hodeidah");
  await expect(sources.getByRole("link", { name: "Example Daily" })).toHaveAttribute("target", "_blank");
  for (const name of ["Like", "Save", "Ask"]) await expect(sheet.getByRole("button", { name, exact: true })).toBeVisible();

  // Esc closes it; opening it counted as opening the Item, so it is dimmed now and after a reload.
  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);
  await expect(card).toHaveAttribute("data-dimmed", "true");
  await expect
    .poll(async () => (await (await page.request.get(`${E2E_BASE_PATH}/api/brief`)).json()).items[0].dimmed)
    .toBe(true);

  // 2: kind-specific extras are in the read sheet: the AI try link.
  await swipe.next(page);
  await swipe.headline(page).tap();
  const ai = page.getByRole("dialog", { name: ORDER[1]!.title });
  await expect(ai.getByRole("link", { name: "Try it" })).toHaveAttribute("href", "https://example.com/demo");
  await expect(ai.getByRole("list", { name: "Details" })).toContainText("Open weights");

  // The sheet can be dragged down by its handle to close.
  const handle = ai.getByTestId("sheet-handle");
  const box = (await handle.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + 200, { steps: 8 });
  await page.mouse.up();
  await expect(ai).toHaveCount(0);

  // 3: "Updated" sits in the meta line as plain text.
  await swipe.next(page);
  await expect(card).toContainText("Liverpool · 5h ago · Updated");
  // 7: the game's store link, price and genre.
  for (let i = 0; i < 4; i++) await swipe.next(page);
  await swipe.headline(page).tap();
  const game = page.getByRole("dialog", { name: ORDER[6]!.title });
  await expect(game.getByRole("link", { name: "Store page" })).toHaveAttribute("href", "https://example.com/store/tactics");
  await expect(game.getByRole("list", { name: "Details" })).toContainText("Tactics RPG");
  await expect(game.getByRole("list", { name: "Details" })).toContainText("$29.99");
});

test("pictures: a photo fills the frame, and no picture or one that fails to load is a plain gradient", async ({ page }) => {
  // The first Item's photo loads; every other picture (example.com) is blocked, so it fails.
  await page.route("https://example.com/img/hodeidah.jpg", (route) => route.fulfill({ path: "public/icons/icon-512.png" }));
  await page.goto(E2E_BASE_PATH);

  await swipe.next(page);
  await expect(swipe.card(page)).toHaveAttribute("data-picture", "photo");
  // The AI Item's picture fails as the page loads, before the app is running.
  await swipe.next(page);
  await expect(swipe.card(page)).toHaveAttribute("data-picture", "none");
  // US Markets has no image.
  for (let i = 0; i < 2; i++) await swipe.next(page);
  await expectAt(page, 3);
  await expect(swipe.card(page)).toHaveAttribute("data-picture", "none");
  // The game's image fails to load.
  for (let i = 0; i < 3; i++) await swipe.next(page);
  await expectAt(page, 6);
  await expect(swipe.card(page)).toHaveAttribute("data-picture", "none");
});
