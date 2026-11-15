// Smoke test for the Brief on a wide screen (1728×1050; rework ticket 09).
// Wide uses the PC's Layout (Front Page by default) in four columns: the
// sidebar, the page, the reader pane, always open and starting on the first
// top story, and the Widgets in their own column instead of the Cover's row.
import { E2E_BASE_PATH, expect, frontPage, postEdition, signIn, swipe, swipeEdition, test } from "./support";

test.beforeEach(async ({ request, page }) => {
  await signIn(page);
  // The server keeps only countdowns still to come by the real clock: this one is three days away.
  const edition = swipeEdition();
  edition.widgets.countdowns[0].at = new Date(Date.now() + 3 * 24 * 3_600_000).toISOString();
  await postEdition(request, edition);
  const res = await page.request.patch(`${E2E_BASE_PATH}/api/me`, { data: { display: { layouts: { pc: null } } } });
  expect(res.status(), await res.text()).toBe(200);
});

test("the pane is open on the first top story, and the Widgets have their own column", async ({ page }) => {
  await page.goto(E2E_BASE_PATH);

  const pane = frontPage.pane(page);
  await expect(frontPage.paneHeadline(page)).toHaveText("Truce talks resume over Hodeidah port access");
  await expect(pane.getByTestId("pane-position")).toHaveText("1 / 7");
  // Always open: no close button, and Esc leaves it open.
  await expect(pane.getByRole("button", { name: "Close the reader" })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(pane).toBeVisible();
  // Opening it on load is not reading it: the card is outlined, not dimmed.
  const top = frontPage.group(page, "For you").getByRole("article").first();
  await expect(top).toHaveAttribute("data-selected", "true");
  await expect(top).toHaveAttribute("data-dimmed", "false");

  // The Widgets: in their own column, at the end side of the pane, and not in the Cover header.
  const widgets = page.getByRole("complementary", { name: "Today" });
  await expect(widgets.getByRole("group", { name: /Example Corp earnings/ })).toBeVisible();
  await expect(swipe.cover(page).getByRole("group")).toHaveCount(0);
  const [paneBox, widgetsBox] = [(await pane.boundingBox())!, (await widgets.boundingBox())!];
  expect(widgetsBox.x).toBeGreaterThanOrEqual(paneBox.x + paneBox.width - 1);
  // The page, the pane and the Widgets fill the width beside the sidebar.
  expect(widgetsBox.x + widgetsBox.width).toBeCloseTo(1728, 0);
  expect((await frontPage.sidebar(page).boundingBox())!.x).toBe(0);

  // j moves the pane on, as on a PC.
  await page.keyboard.press("j");
  await expect(frontPage.paneHeadline(page)).toHaveText("A new open-weights model tops the coding leaderboard");
  await expect(pane.getByTestId("pane-position")).toHaveText("2 / 7");
});
