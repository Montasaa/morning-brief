// Arranging the Brief on a phone (rework ticket 11, spec #6). In Swipe a
// Collapsed Topic is one digest card listing its headlines, which opens into
// its Items; Edit (on the Cover, or `e`) opens a sheet with the Topic and
// Widget controls; Me › Display has the same controls plus the dock, in
// English and Arabic. Which groups come back in which order is tested at the
// API seam (test/api/arrange-brief.test.ts).
import type { Page } from "@playwright/test";
import { E2E_BASE_PATH, expect, postEdition, signIn, swipe, swipeEdition, test } from "./support";

const MIDFIELDER = "Midfielder back in full training before the weekend";

/** Do `action` and wait for the Display change it makes to be saved. */
async function saved(page: Page, action: () => Promise<void>) {
  const done = page.waitForResponse((r) => r.url().endsWith("/api/me") && r.request().method() === "PATCH");
  await action();
  expect((await done).status()).toBe(200);
}

test.beforeEach(async ({ request, page }) => {
  await signIn(page);
  await postEdition(request, swipeEdition());
  const reset = await page.request.patch(`${E2E_BASE_PATH}/api/me`, {
    data: { language: "en", display: { pinned: null, topic_order: null, collapsed: null, widgets: null, dock: null } },
  });
  expect(reset.status(), await reset.text()).toBe(200);
});

// The e2e database lasts the whole run: leave the Display and the language as the other specs expect them.
test.afterEach(async ({ page }) => {
  await page.request.patch(`${E2E_BASE_PATH}/api/me`, {
    data: { language: "en", display: { pinned: null, topic_order: null, collapsed: null, widgets: null, dock: null } },
  });
});

test("a Collapsed Topic is one digest card listing its headlines, which opens into its Items", async ({ page }) => {
  expect((await page.request.patch(`${E2E_BASE_PATH}/api/me`, { data: { display: { collapsed: ["liverpool"] } } })).status()).toBe(200);
  await page.goto(E2E_BASE_PATH);

  await swipe.tabs(page).getByRole("button", { name: "Liverpool" }).tap();
  const digest = page.getByRole("article", { name: "Liverpool: headlines" });
  await expect(digest).toBeVisible();
  await expect(digest.getByRole("listitem")).toHaveText([MIDFIELDER]);
  await expect(swipe.rail(page)).toHaveCount(0);

  await digest.getByRole("button", { name: "Open Liverpool" }).tap();
  await expect(swipe.headline(page)).toHaveText(MIDFIELDER);
  await expect(swipe.rail(page)).toBeVisible();
});

test("Edit on the Cover opens a sheet that pins and collapses Topics; the Brief follows and it survives a reload", async ({ page }) => {
  await page.goto(E2E_BASE_PATH);
  const tabs = swipe.tabs(page).getByRole("button");
  await expect(tabs.nth(1)).toHaveText("Liverpool");

  await swipe.cover(page).getByRole("button", { name: "Edit" }).tap();
  const sheet = page.getByRole("dialog", { name: "Arrange your Brief" });
  await saved(page, () => sheet.getByRole("button", { name: "Pin GitHub Trending" }).tap());
  await saved(page, () => sheet.getByRole("button", { name: "Collapse Liverpool" }).tap());
  // Reordering without dragging.
  await saved(page, () => sheet.getByRole("button", { name: "Move Graphic up" }).tap());
  await sheet.getByRole("button", { name: "Done" }).tap();
  await expect(sheet).toHaveCount(0);
  // `e` opens and closes it too.
  await page.keyboard.press("e");
  await expect(sheet).toBeVisible();
  await page.keyboard.press("e");
  await expect(sheet).toHaveCount(0);

  await expect(tabs.nth(1)).toHaveText("GitHub Trending");
  await page.reload();
  await expect(tabs.nth(1)).toHaveText("GitHub Trending");
  // Graphic moved up past US Markets.
  await expect(tabs.nth(2)).toHaveText("Liverpool");
  await expect(tabs.nth(3)).toHaveText("Graphic");
  await swipe.tabs(page).getByRole("button", { name: "Liverpool" }).tap();
  await expect(page.getByRole("article", { name: "Liverpool: headlines" })).toBeVisible();
});

test("Me › Display arranges Topics, Widgets and the dock, and the rail follows the dock", async ({ page }) => {
  await page.goto(`${E2E_BASE_PATH}/me/display`);
  const topics = page.getByRole("list", { name: "Topics" });
  await expect(topics.getByRole("button", { name: "Pin Liverpool" })).toBeVisible();
  await expect(topics.getByRole("switch", { name: "Blur Graphic" })).toBeChecked();
  await saved(page, () => topics.getByRole("button", { name: "Move Liverpool down" }).tap());

  const widgets = page.getByRole("group", { name: "Cover Widgets" });
  await saved(page, () => widgets.getByRole("button", { name: "Remove Prayer times" }).tap());
  await expect(widgets.getByRole("button", { name: "Add Prayer times" })).toBeVisible();

  const dock = page.getByRole("group", { name: "Dock" });
  await saved(page, () => dock.getByRole("button", { name: "Remove Hide" }).tap());
  await saved(page, () => dock.getByRole("button", { name: "Add Share" }).tap());
  await saved(page, () => dock.getByRole("button", { name: "Move Share up" }).tap());

  await page.reload();
  await expect(page.getByRole("list", { name: "Dock" }).getByRole("listitem")).toHaveText(["Like", "Save", "Share", "Ask"].map((n) => new RegExp(`^${n}`)));

  await page.goto(E2E_BASE_PATH);
  await swipe.next(page);
  await expect(swipe.rail(page).getByRole("button")).toHaveText(["Like", "Save", "Share", "Ask"]);
  await expect(swipe.tabs(page).getByRole("button").nth(1)).toHaveText("US Markets");
});

test("Me › Display's arranging controls are in Arabic too", async ({ page }) => {
  await page.request.patch(`${E2E_BASE_PATH}/api/me`, { data: { language: "ar" } });
  await page.goto(`${E2E_BASE_PATH}/me/display`);

  const topics = page.getByRole("list", { name: "المواضيع" });
  await expect(topics.getByRole("button", { name: "تثبيت ليفربول" })).toBeVisible();
  await expect(topics.getByRole("button", { name: "طيّ ليفربول" })).toBeVisible();
  await expect(topics.getByRole("switch", { name: "تمويه مشاهد قاسية" })).toBeVisible();
  await expect(page.getByRole("group", { name: "أدوات الغلاف" })).toBeVisible();
  await saved(page, () => page.getByRole("group", { name: "أزرار الإجراءات" }).getByRole("button", { name: "إضافة مشاركة" }).tap());
  await expect(page.getByRole("status").filter({ hasText: "تم الحفظ." }).first()).toBeVisible();
});

test("a followed Topic with nothing in this Edition is named at the end of Swipe", async ({ page }) => {
  await page.goto(E2E_BASE_PATH);
  const end = page.getByRole("region", { name: "End of the Brief" });
  // Seven Items, then the end.
  for (let i = 0; i < 8; i++) await swipe.next(page);
  await expect(end.getByTestId("nothing-qualified")).toContainText("Iran");
});
