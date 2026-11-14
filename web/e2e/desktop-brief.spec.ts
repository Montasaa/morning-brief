// Smoke tests for the Brief on a wide screen (ticket 05): the current card in
// the centre, the side list of the whole Brief beside it, and arrow keys.
import type { Page } from "@playwright/test";
import { E2E_BASE_PATH, expect, postEdition, signIn, swipeEdition, test } from "./support";

const TITLES = [
  "Truce talks resume over Hodeidah port access",
  "A new open-weights model tops the coding leaderboard",
  "Midfielder back in full training before the weekend",
  "Fed minutes point to a pause",
  "Flood aftermath leaves villages cut off",
  "example/terminal-agent",
  "A grid tactics sequel gets a release date",
];

const sideList = (page: Page) => page.getByRole("navigation", { name: "In this Brief" });
const row = (page: Page, title: string) => sideList(page).getByRole("button", { name: title });
const chip = (page: Page) => page.getByTestId("chip");
const cover = (page: Page) => page.getByRole("region", { name: "Cover card" });

test.beforeEach(async ({ request, page }) => {
  await postEdition(request, swipeEdition());
  await signIn(page);
});

test("shows the card in the centre with the whole Brief listed beside it", async ({ page }) => {
  await page.goto(E2E_BASE_PATH);

  await expect(cover(page)).toBeVisible();
  await expect(sideList(page)).toBeVisible();
  for (const title of TITLES) await expect(row(page, title)).toBeVisible();
  await expect(sideList(page).getByRole("heading", { name: "Top for you" })).toBeVisible();
  await expect(sideList(page).getByRole("heading", { name: "Liverpool" })).toBeVisible();

  // The card sits in the centre of the screen, the list to its side.
  const vw = page.viewportSize()!.width;
  const card = (await cover(page).boundingBox())!;
  const list = (await sideList(page).boundingBox())!;
  expect(Math.abs(card.x + card.width / 2 - vw / 2)).toBeLessThan(4);
  expect(list.x).toBeGreaterThanOrEqual(card.x + card.width);
});

test("clicking a row jumps to that Item and the current Item is highlighted in the list", async ({ page }) => {
  await page.goto(E2E_BASE_PATH);
  await expect(sideList(page).locator('[aria-current="true"]')).toHaveCount(0);

  await row(page, "Flood aftermath leaves villages cut off").click();
  await expect(chip(page)).toHaveText("Graphic · 5/7");
  await expect(page.getByRole("article").getByRole("heading", { level: 2 })).toHaveText(TITLES[4]!);
  await expect(row(page, TITLES[4]!)).toHaveAttribute("aria-current", "true");
  await expect(sideList(page).locator('[aria-current="true"]')).toHaveCount(1);

  await row(page, TITLES[0]!).click();
  await expect(chip(page)).toHaveText("Yemen · 1/7");
  await expect(row(page, TITLES[0]!)).toHaveAttribute("aria-current", "true");
  await expect(row(page, TITLES[4]!)).not.toHaveAttribute("aria-current", "true");

  // The tap zones still work, and the highlight follows them.
  await page.getByRole("button", { name: "Next", exact: true }).click({ position: { x: 40, y: 200 } });
  await expect(chip(page)).toHaveText("AI · 2/7");
  await expect(row(page, TITLES[1]!)).toHaveAttribute("aria-current", "true");
});

test("arrow keys move forward and back, but not while typing in an input", async ({ page }) => {
  await page.goto(E2E_BASE_PATH);
  await expect(cover(page)).toBeVisible();

  await page.keyboard.press("ArrowRight");
  await expect(chip(page)).toHaveText("Yemen · 1/7");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await expect(chip(page)).toHaveText("Liverpool · 3/7");
  await expect(row(page, TITLES[2]!)).toHaveAttribute("aria-current", "true");
  await page.keyboard.press("ArrowLeft");
  await expect(chip(page)).toHaveText("AI · 2/7");

  // Back to the cover, and no further.
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowLeft");
  await expect(cover(page)).toBeVisible();

  // After a click on a row, the keys carry on from there.
  await row(page, TITLES[6]!).click();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("heading", { name: "You're caught up" })).toBeVisible();
  await page.keyboard.press("ArrowLeft");
  await expect(chip(page)).toHaveText("Turn-based RPG & Tactics · 7/7");

  // Typing in an input (the Ask box and search will add some) moves its caret, not the Brief.
  await page.evaluate(() => {
    const input = document.createElement("input");
    input.setAttribute("aria-label", "Scratch input");
    input.value = "abc";
    document.body.append(input);
  });
  const input = page.getByRole("textbox", { name: "Scratch input" });
  await input.focus();
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowLeft");
  await expect(chip(page)).toHaveText("Turn-based RPG & Tactics · 7/7");
  await input.blur();
  await page.keyboard.press("ArrowLeft");
  await expect(chip(page)).toHaveText("GitHub Trending · 6/7");
});

test("in Arabic the side list is in Arabic, sits on the left, and the arrow keys follow the reading direction", async ({
  page,
}) => {
  await page.goto(E2E_BASE_PATH);
  await page.getByRole("button", { name: "العربية", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");

  const list = page.getByRole("navigation", { name: "في هذا الموجز" });
  await expect(list).toBeVisible();
  await expect(list.getByRole("heading", { name: "الأهم لك" })).toBeVisible();
  await expect(list.getByRole("heading", { name: "ليفربول" })).toBeVisible();
  await expect(
    list.getByRole("button", { name: "لاعب الوسط يعود إلى التدريبات الكاملة قبل نهاية الأسبوع" }),
  ).toBeVisible();

  // Right to left: the list sits on the card's left.
  const card = (await page.getByRole("region", { name: "بطاقة الغلاف" }).boundingBox())!;
  const box = (await list.boundingBox())!;
  expect(box.x + box.width).toBeLessThanOrEqual(card.x);

  // ArrowLeft goes forward in Arabic, ArrowRight back.
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowLeft");
  await expect(chip(page)).toHaveText("الذكاء الاصطناعي · ٢/٧");
  await page.keyboard.press("ArrowRight");
  await expect(chip(page)).toHaveText("اليمن · ١/٧");

  await page.getByRole("button", { name: "English", exact: true }).click();
});
