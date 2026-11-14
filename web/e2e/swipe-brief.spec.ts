// Smoke tests for the Swipe Brief at phone size (ticket 03).
import type { Page } from "@playwright/test";
import { E2E_BASE_PATH, expect, postEdition, signIn, swipeEdition, test } from "./support";

/** Tap the right or left side of the screen, up on the picture where the tap zones are. */
async function tap(page: Page, side: "Next" | "Back") {
  await page.getByRole("button", { name: side, exact: true }).tap({ position: { x: 40, y: 200 } });
}

const SWIPE_ORDER = [
  { chip: "Yemen · 1/7", title: "Truce talks resume over Hodeidah port access" },
  { chip: "AI · 2/7", title: "A new open-weights model tops the coding leaderboard" },
  { chip: "Liverpool · 3/7", title: "Midfielder back in full training before the weekend" },
  { chip: "US Markets · 4/7", title: "Fed minutes point to a pause" },
  { chip: "Graphic · 5/7", title: "Flood aftermath leaves villages cut off" },
  { chip: "GitHub Trending · 6/7", title: "example/terminal-agent" },
  { chip: "Turn-based RPG & Tactics · 7/7", title: "A grid tactics sequel gets a release date" },
];

test.beforeEach(async ({ request, page }) => {
  await postEdition(request, swipeEdition());
  await signIn(page);
});

test("opens on the cover card, taps through every Item to You're caught up, and starts over", async ({ page }) => {
  await page.goto(E2E_BASE_PATH);

  const cover = page.getByRole("region", { name: "Cover card" });
  await expect(cover.getByRole("heading", { level: 1 })).toHaveText("Saturday 14 November");
  await expect(cover).toContainText("Morning Edition");
  for (const slot of ["Weather", "Prayer times", "Next match", "Countdowns"]) {
    await expect(cover.getByRole("group", { name: slot })).toBeVisible();
  }

  // Forward, then back to the cover, then forward again.
  await tap(page, "Next");
  await expect(page.getByTestId("chip")).toHaveText(SWIPE_ORDER[0]!.chip);
  await tap(page, "Back");
  await expect(cover).toBeVisible();

  for (const { chip, title } of SWIPE_ORDER) {
    await tap(page, "Next");
    await expect(page.getByTestId("chip")).toHaveText(chip);
    // The Graphic Item is blurred until tapped (ticket 08; e2e/sensitive-topics.spec.ts).
    if (chip.startsWith("Graphic")) await page.getByRole("button", { name: /Tap to reveal/ }).tap();
    await expect(page.getByRole("heading", { level: 2 })).toHaveText(title);
  }

  // Back one Item and forward again.
  await tap(page, "Back");
  await expect(page.getByTestId("chip")).toHaveText(SWIPE_ORDER[5]!.chip);
  await tap(page, "Next");
  await tap(page, "Next");

  await expect(page.getByRole("heading", { name: "You're caught up" })).toBeVisible();
  await expect(page.getByText("Next Edition at 19:15")).toBeVisible();

  await page.getByRole("button", { name: "Start over" }).tap();
  await expect(cover).toBeVisible();
});

test("progress bars and the chip follow the current Topic and position", async ({ page }) => {
  await page.goto(E2E_BASE_PATH);
  const bar = (name: string) => page.getByRole("progressbar", { name, exact: true });

  await expect(bar("Top for you")).toHaveAttribute("aria-valuenow", "0");

  await tap(page, "Next");
  await expect(bar("Top for you")).toHaveAttribute("aria-valuenow", "1");
  await expect(bar("Top for you")).toHaveAttribute("aria-valuemax", "2");
  await expect(bar("Liverpool")).toHaveAttribute("aria-valuenow", "0");

  for (let i = 0; i < 3; i++) await tap(page, "Next");
  await expect(page.getByTestId("chip")).toHaveText("US Markets · 4/7");
  await expect(bar("Top for you")).toHaveAttribute("aria-valuenow", "2");
  await expect(bar("Liverpool")).toHaveAttribute("aria-valuenow", "1");
  await expect(bar("US Markets")).toHaveAttribute("aria-valuenow", "1");
  await expect(bar("Graphic")).toHaveAttribute("aria-valuenow", "0");
});

test("cards show sources, time since, badges, tags and kind-specific extras", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-11-14T06:30:00+03:00"));
  await page.goto(E2E_BASE_PATH);
  const card = () => page.getByRole("article");

  // 1: top story, new, with a second Topic as a tag and two linked sources.
  await tap(page, "Next");
  await expect(card().getByText("Top for you", { exact: true })).toBeVisible();
  await expect(card().getByText("New", { exact: true })).toBeVisible();
  await expect(card()).toContainText("Negotiators met again overnight");
  await expect(card()).toContainText("Also in Saudi");
  await expect(card().getByRole("link", { name: "Example Wire" })).toHaveAttribute("href", "https://example.com/wire/hodeidah");
  await expect(card().getByRole("link", { name: "Example Daily" })).toHaveAttribute("target", "_blank");
  await expect(card().locator("time")).toHaveText("50m ago");

  // 2: AI try link.
  await tap(page, "Next");
  await expect(card().getByRole("link", { name: "Try it" })).toHaveAttribute("href", "https://example.com/demo");
  await expect(card().getByRole("list", { name: "Details" })).toContainText("Open weights");

  // 3: Liverpool reliability, updated.
  await tap(page, "Next");
  await expect(card().getByText("Updated", { exact: true })).toBeVisible();
  await expect(card().getByRole("list", { name: "Details" })).toContainText("Reliability: Official");
  await expect(card().locator("time")).toHaveText("5h ago");

  // 4: US Markets tag.
  await tap(page, "Next");
  await expect(card().getByRole("list", { name: "Details" })).toContainText("FED");

  // 6: GitHub Trending stars.
  await tap(page, "Next");
  await tap(page, "Next");
  await expect(card().getByRole("list", { name: "Details" })).toContainText("+1,840 stars today");
  await expect(card()).toContainText("It runs fully offline.");

  // 7: game store link, price and genre.
  await tap(page, "Next");
  await expect(card().getByRole("link", { name: "Store page" })).toHaveAttribute("href", "https://example.com/store/tactics");
  await expect(card().getByRole("list", { name: "Details" })).toContainText("Tactics RPG");
  await expect(card().getByRole("list", { name: "Details" })).toContainText("$29.99");

  // The dock is there on every card (it does nothing yet).
  const dock = page.getByRole("toolbar", { name: "Reactions" });
  for (const name of ["Hide", "Save", "Like", "Ask"]) {
    await expect(dock.getByRole("button", { name, exact: true })).toBeVisible();
  }
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
  await expect(page.getByRole("region", { name: "Cover card" })).toBeVisible();
});

test("on a phone there is no side list, only the one card (ticket 05)", async ({ page }) => {
  await page.goto(E2E_BASE_PATH);
  await expect(page.getByRole("region", { name: "Cover card" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "In this Brief" })).toBeHidden();
  await expect(page.getByRole("button", { name: "Next", exact: true })).toBeVisible();
});
