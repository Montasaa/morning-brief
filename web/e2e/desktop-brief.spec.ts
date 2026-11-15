// Smoke tests for the Swipe Brief on a PC-sized screen (rework ticket 08; ticket
// 09 makes Front Page the PC default): the card centred with the rail beside
// it, an "Up next" list and the Widgets at the end side, and the keys.
import type { Page } from "@playwright/test";
import { E2E_BASE_PATH, expect, postEdition, signIn, swipe, swipeEdition, test } from "./support";

const TITLES = [
  "Truce talks resume over Hodeidah port access",
  "A new open-weights model tops the coding leaderboard",
  "Midfielder back in full training before the weekend",
  "Fed minutes point to a pause",
  // The Graphic Item: listed by its warning, not its title.
  "Sensitive Item: Casualties",
  "example/terminal-agent",
  "A grid tactics sequel gets a release date",
];

const upNext = (page: Page) => page.getByRole("complementary", { name: "Up next" });
const row = (page: Page, title: string) => upNext(page).getByRole("button", { name: new RegExp(title.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")) });

test.beforeEach(async ({ request, page }) => {
  await postEdition(request, swipeEdition());
  await signIn(page);
});

test("the card sits in the middle with the rail beside it, and Up next lists what comes", async ({ page }) => {
  await page.goto(E2E_BASE_PATH);
  const cover = swipe.cover(page);
  await expect(cover).toBeVisible();

  // The Cover card is centred in the space beside Up next.
  const list = (await upNext(page).boundingBox())!;
  const card = (await cover.boundingBox())!;
  expect(Math.abs(card.x + card.width / 2 - list.x / 2)).toBeLessThan(4);
  // Up next starts with the first Items, and the Widgets are there too.
  for (const title of TITLES.slice(0, 5)) await expect(row(page, title)).toBeVisible();
  await expect(upNext(page).getByRole("heading", { name: "Today" })).toBeVisible();
  await expect(page.getByRole("region", { name: "End of the Brief" })).toHaveCount(0);

  // On an Item the rail sits beside the card, not over it.
  await page.keyboard.press("j");
  await expect(swipe.headline(page)).toHaveText(TITLES[0]!);
  const rail = (await swipe.rail(page).boundingBox())!;
  const headline = (await swipe.headline(page).boundingBox())!;
  expect(rail.x).toBeGreaterThan(headline.x + headline.width);
  expect(rail.x + rail.width).toBeLessThanOrEqual(list.x);
  // Up next moved on.
  await expect(row(page, TITLES[0]!)).toHaveCount(0);
  await expect(row(page, TITLES[1]!)).toBeVisible();
});

test("clicking an Up next row jumps to it; the sensitive one stays veiled and unnamed", async ({ page }) => {
  await page.goto(E2E_BASE_PATH);
  await row(page, TITLES[4]!).click();
  await expect(page.getByRole("button", { name: /Tap to view/ })).toBeVisible();
  await expect(swipe.tabs(page).getByRole("button", { name: "Graphic" })).toHaveAttribute("aria-current", "true");
  await page.getByRole("button", { name: /Tap to view/ }).click();
  await expect(swipe.headline(page)).toHaveText("Flood aftermath leaves villages cut off");
  await expect(upNext(page).getByText("Flood aftermath leaves villages cut off")).toHaveCount(0);

  await row(page, TITLES[6]!).click();
  await expect(swipe.headline(page)).toHaveText(TITLES[6]!);
  // The tap thirds work with a mouse too.
  await page.getByRole("button", { name: "Back", exact: true }).click({ position: { x: 20, y: 60 } });
  await expect(swipe.headline(page)).toHaveText(TITLES[5]!);
});

test("the keys move one Item at a time, but not while typing in an input", async ({ page }) => {
  await page.goto(E2E_BASE_PATH);
  await expect(swipe.cover(page)).toBeVisible();

  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("j");
  await expect(swipe.headline(page)).toHaveText(TITLES[1]!);
  await page.keyboard.press("k");
  await expect(swipe.headline(page)).toHaveText(TITLES[0]!);
  // Enter opens the read sheet; while it is open the keys stay with it.
  await page.keyboard.press("Enter");
  const sheet = page.getByRole("dialog", { name: TITLES[0]! });
  await expect(sheet).toBeVisible();
  await page.keyboard.press("j");
  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);
  await expect(swipe.headline(page)).toHaveText(TITLES[0]!);

  // Typing in an input moves its caret, not the Brief.
  await page.evaluate(() => {
    const input = document.createElement("input");
    input.setAttribute("aria-label", "Scratch input");
    document.body.append(input);
  });
  const input = page.getByRole("textbox", { name: "Scratch input" });
  await input.focus();
  await page.keyboard.press("j");
  await page.keyboard.press("ArrowDown");
  await expect(input).toHaveValue("j");
  await expect(swipe.headline(page)).toHaveText(TITLES[0]!);
  await input.blur();
  await page.keyboard.press("j");
  await expect(swipe.headline(page)).toHaveText(TITLES[1]!);
});

test("in Arabic, Up next sits on the left", async ({ page }) => {
  await page.goto(E2E_BASE_PATH);
  await swipe.cover(page).getByRole("button", { name: "العربية", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");

  const list = page.getByRole("complementary", { name: "التالي" });
  await expect(list.getByRole("button", { name: /لاعب الوسط يعود إلى التدريبات الكاملة/ })).toBeVisible();
  const card = (await swipe.cover(page).boundingBox())!;
  const box = (await list.boundingBox())!;
  expect(box.x + box.width).toBeLessThanOrEqual(card.x);

  await page.keyboard.press("j");
  await expect(swipe.headline(page)).toHaveText("استئناف محادثات الهدنة بشأن الوصول إلى ميناء الحديدة");
  await page.keyboard.press("k");
  await swipe.cover(page).getByRole("button", { name: "English", exact: true }).click();
});
