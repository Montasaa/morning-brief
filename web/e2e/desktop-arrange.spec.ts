// Arranging the Brief on a PC (rework ticket 11, spec #6). Edit mode (the Edit
// button or `e`) puts quiet controls on Front Page and List headings: a drag
// handle, move up and down, pin, collapse and, for a Sensitive Topic, the blur
// switch. Every change is saved at once and survives a reload; Done leaves.
// Which groups come back in which order is tested at the API seam
// (test/api/arrange-brief.test.ts).
import type { Locator, Page } from "@playwright/test";
import { E2E_BASE_PATH, expect, frontPage, postEdition, signIn, swipeEdition, test } from "./support";

const MIDFIELDER = "Midfielder back in full training before the weekend";

/** The group headings on the page, top to bottom. */
const headings = (page: Page) => page.getByRole("region").getByRole("heading", { level: 2 });
/** The names of the Topics on the page, in order, after "For you". */
async function topicOrder(page: Page): Promise<string[]> {
  await expect(headings(page).first()).toHaveText("For you");
  return (await headings(page).allTextContents()).slice(1);
}

/** Do `action` and wait for the Display change it makes to be saved. */
async function saved(page: Page, action: () => Promise<void>) {
  const done = page.waitForResponse((r) => r.url().endsWith("/api/me") && r.request().method() === "PATCH");
  await action();
  expect((await done).status()).toBe(200);
}

/** Drag `from` onto `to` with the mouse, in small steps, as a hand would (both must fit on screen). */
async function drag(page: Page, from: Locator, to: Locator) {
  await from.scrollIntoViewIfNeeded();
  const a = (await from.boundingBox())!;
  const b = (await to.boundingBox())!;
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2 - 10, { steps: 5 });
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 10 });
  await page.mouse.up();
}

test.beforeEach(async ({ request, page }) => {
  await signIn(page);
  await postEdition(request, swipeEdition());
  const reset = await page.request.patch(`${E2E_BASE_PATH}/api/me`, {
    data: { display: { layouts: { pc: null }, pinned: null, topic_order: null, collapsed: null, widgets: null, dock: null, unblurred: null } },
  });
  expect(reset.status(), await reset.text()).toBe(200);
});

// The e2e database lasts the whole run: leave the Display as the other specs expect it.
test.afterEach(async ({ page }) => {
  await page.request.patch(`${E2E_BASE_PATH}/api/me`, {
    data: { display: { layouts: { pc: null }, pinned: null, topic_order: null, collapsed: null, widgets: null, dock: null, unblurred: null } },
  });
});

test("in Edit mode, pinning moves a shelf to the top and collapsing turns one into a strip; both survive a reload", async ({ page }) => {
  await page.goto(E2E_BASE_PATH);
  await expect(frontPage.group(page, "For you")).toBeVisible();
  const before = await topicOrder(page);
  expect(before.slice(0, 2)).toEqual(["Liverpool", "US Markets"]);
  await expect(page.getByRole("button", { name: "Pin GitHub Trending" })).toHaveCount(0);

  await page.keyboard.press("e");
  const pin = page.getByRole("button", { name: "Pin GitHub Trending" });
  await saved(page, () => pin.click());
  await expect(pin).toHaveAttribute("aria-pressed", "true");
  expect(await topicOrder(page)).toEqual(["GitHub Trending", ...before.filter((t) => t !== "GitHub Trending")]);

  // Collapsed: a one-row strip of headlines (an Expand button once out of Edit mode); a headline still opens the Item.
  const collapse = page.getByRole("button", { name: "Collapse Liverpool" });
  await saved(page, () => collapse.click());
  await expect(collapse).toHaveAttribute("aria-pressed", "true");
  const liverpool = frontPage.group(page, "Liverpool");
  await expect(liverpool.getByRole("article")).toHaveCount(0);
  await liverpool.getByRole("button", { name: MIDFIELDER }).click();
  await expect(frontPage.paneHeadline(page)).toHaveText(MIDFIELDER);

  // Done leaves Edit mode.
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByRole("button", { name: "Pin GitHub Trending" })).toHaveCount(0);
  await expect(liverpool.getByRole("button", { name: "Expand Liverpool" })).toBeVisible();

  await page.reload();
  expect((await topicOrder(page))[0]).toBe("GitHub Trending");
  await expect(frontPage.group(page, "Liverpool").getByRole("button", { name: "Expand Liverpool" })).toBeVisible();
  // The Topic tabs and the sidebar follow the same order.
  const tabs = page.getByRole("navigation", { name: "Topics" }).getByRole("button");
  await expect(tabs.nth(1)).toHaveText("GitHub Trending");
  await expect(frontPage.sidebar(page).getByRole("listitem").first()).toContainText("GitHub Trending");

  // Expand brings the shelf back, without Edit mode.
  await saved(page, () => frontPage.group(page, "Liverpool").getByRole("button", { name: "Expand Liverpool" }).click());
  await expect(frontPage.group(page, "Liverpool").getByRole("article")).toHaveCount(1);
});

test("reordering works from the keyboard with move up and down, and by dragging a heading's handle", async ({ page }) => {
  await page.goto(E2E_BASE_PATH);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  const before = await topicOrder(page);
  expect(before.slice(0, 3)).toEqual(["Liverpool", "US Markets", "Graphic"]);
  await expect(page.getByRole("button", { name: "Move Liverpool up" })).toBeDisabled();

  await page.getByRole("button", { name: "Move Liverpool down" }).focus();
  await saved(page, () => page.keyboard.press("Enter"));
  expect((await topicOrder(page)).slice(0, 3)).toEqual(["US Markets", "Liverpool", "Graphic"]);

  // In List (where both headings are on screen), dragging Graphic's handle onto US Markets puts Graphic in its place.
  await frontPage.layouts(page).getByRole("radio", { name: "List" }).check();
  await expect(page.getByRole("button", { name: "Pin Graphic" })).toBeVisible(); // still in Edit mode
  await saved(page, () =>
    drag(page, frontPage.group(page, "Graphic").getByTitle("Drag to reorder"), frontPage.group(page, "US Markets").getByRole("heading", { level: 2 })),
  );
  expect((await topicOrder(page)).slice(0, 3)).toEqual(["Graphic", "US Markets", "Liverpool"]);

  await page.reload();
  expect((await topicOrder(page)).slice(0, 3)).toEqual(["Graphic", "US Markets", "Liverpool"]);
  // The top stories never move.
  await expect(headings(page).first()).toHaveText("For you");
});

test("Edit mode removes, reorders and adds back the Cover's Widgets in place", async ({ page }) => {
  // No next match on this Cover, whichever Edition is the latest.
  const setUp = await page.request.patch(`${E2E_BASE_PATH}/api/me`, {
    data: { city: "Riyadh", display: { widgets: ["weather", "prayer_times", "countdown"] } },
  });
  expect(setUp.status()).toBe(200);
  await page.goto(E2E_BASE_PATH);
  const cover = page.getByRole("region", { name: "Cover" });
  await expect(cover.getByRole("group", { name: "Weather" })).toBeVisible();

  await page.getByRole("button", { name: "Edit", exact: true }).click();
  const widgets = cover.getByRole("group", { name: "Cover Widgets" });
  await saved(page, () => widgets.getByRole("button", { name: "Remove Weather" }).click());
  await saved(page, () => widgets.getByRole("button", { name: "Move Countdowns up" }).click());
  await page.getByRole("button", { name: "Done" }).click();

  await page.reload();
  await expect(cover.getByRole("group", { name: "Weather" })).toHaveCount(0);
  await expect(cover.getByRole("group", { name: "Prayer times" })).toBeVisible();
  const rows = cover.getByRole("group").filter({ hasNot: page.getByRole("group") });
  await expect(rows.first()).toHaveAccessibleName("Example Corp earnings");

  // Added back, at the end.
  await page.keyboard.press("e");
  await saved(page, () => cover.getByRole("button", { name: "Add Weather" }).click());
  await page.keyboard.press("e");
  await expect(rows.last()).toHaveAccessibleName("Weather");
  expect((await (await page.request.get(`${E2E_BASE_PATH}/api/me`)).json()).display.widgets).toEqual(["countdown", "prayer_times", "weather"]);
});

test("a followed Topic with nothing in this Edition says so, in Front Page and in List", async ({ page }) => {
  await page.goto(E2E_BASE_PATH);
  // The Owner follows every Topic; this Edition has nothing for Iran.
  await expect(frontPage.group(page, "Iran")).toContainText("Nothing qualified in this Edition.");
  await frontPage.layouts(page).getByRole("radio", { name: "List" }).check();
  await expect(frontPage.group(page, "Iran")).toContainText("Nothing qualified in this Edition.");
});

test("hovering a shelf's heading offers to collapse it", async ({ page }) => {
  await page.goto(E2E_BASE_PATH);
  const shelf = frontPage.group(page, "US Markets");
  await shelf.getByRole("heading", { level: 2 }).hover();
  await saved(page, () => shelf.getByRole("button", { name: "Collapse US Markets" }).click());
  await expect(shelf.getByRole("button", { name: "Expand US Markets" })).toBeVisible();
});

test("the dock buttons chosen in Me › Display are the pane's rail, in order", async ({ page }) => {
  expect((await page.request.patch(`${E2E_BASE_PATH}/api/me`, { data: { display: { dock: ["save", "share", "like"] } } })).status()).toBe(200);
  await page.goto(E2E_BASE_PATH);
  await frontPage.open(page, MIDFIELDER).click();
  const rail = frontPage.pane(page).getByRole("toolbar", { name: "Actions" });
  await expect(rail.getByRole("button")).toHaveText(["Save", "Share", "Like"]);
});
