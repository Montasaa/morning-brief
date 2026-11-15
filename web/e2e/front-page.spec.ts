// Front Page on a phone (rework ticket 09). A phone opens in Swipe; a Reader
// can pick Front Page (or List) for their phone from the Cover or in
// Me › Display, and then the reader pane opens full screen.
import { E2E_BASE_PATH, expect, frontPage, postEdition, signIn, swipe, swipeEdition, test } from "./support";

const READER = "fp-phone@example.com";

test.beforeEach(async ({ page }) => {
  await signIn(page);
  await page.request.post(`${E2E_BASE_PATH}/api/invites`, { data: { email: READER } });
  await signIn(page, READER);
  await postEdition(page.request, swipeEdition());
  const reset = await page.request.patch(`${E2E_BASE_PATH}/api/me`, { data: { display: { layouts: null } } });
  expect(reset.status(), await reset.text()).toBe(200);
});

test("picking Front Page on the Cover shows the page, and a card opens the pane full screen", async ({ page }) => {
  await page.goto(E2E_BASE_PATH);
  await expect(swipe.cover(page)).toBeVisible();
  await expect(frontPage.layouts(page).getByRole("radio", { name: "Swipe" })).toBeChecked();

  await frontPage.layouts(page).getByRole("radio", { name: "Front Page" }).check();
  await expect(frontPage.group(page, "For you")).toBeVisible();
  // Still the bottom tabs on a phone.
  await expect(page.getByRole("navigation", { name: "Tabs" })).toBeVisible();
  await expect(frontPage.sidebar(page)).toBeHidden();

  await frontPage.open(page, "Midfielder back in full training before the weekend").tap();
  const pane = frontPage.pane(page);
  await expect(frontPage.paneHeadline(page)).toHaveText("Midfielder back in full training before the weekend");
  const viewport = page.viewportSize()!;
  // Once it has slid in.
  await expect(async () => {
    const box = (await pane.boundingBox())!;
    expect([box.x, box.y, box.width, box.height].map(Math.round)).toEqual([0, 0, viewport.width, viewport.height]);
  }).toPass();

  await pane.getByRole("button", { name: "Close the reader" }).tap();
  await expect(pane).toHaveCount(0);

  // The pick is the phone's, saved in the Display.
  await page.goto(`${E2E_BASE_PATH}/me/display`);
  await expect(page.getByRole("group", { name: "On a phone" }).getByRole("radio", { name: "Front Page" })).toBeChecked();
  await expect(page.getByRole("group", { name: "On a PC" }).getByRole("radio", { name: "Automatic" })).toBeChecked();
});

test("Me › Display picks a Layout for each screen, and Automatic takes the pick back", async ({ page }) => {
  await page.goto(`${E2E_BASE_PATH}/me/display`);
  const phone = page.getByRole("group", { name: "On a phone" });
  await expect(phone.getByRole("radio", { name: "Automatic" })).toBeChecked();
  await phone.getByRole("radio", { name: "List" }).check();
  await expect(page.getByTestId("display-status")).toHaveText("Saved.");

  await page.goto(E2E_BASE_PATH);
  await expect(frontPage.layouts(page).getByRole("radio", { name: "List" })).toBeChecked();
  await expect(frontPage.group(page, "Liverpool").getByRole("article")).toHaveCount(1);

  await page.goto(`${E2E_BASE_PATH}/me/display`);
  await page.getByRole("group", { name: "On a phone" }).getByRole("radio", { name: "Automatic" }).check();
  await expect(page.getByTestId("display-status")).toHaveText("Saved.");
  await page.goto(E2E_BASE_PATH);
  await expect(swipe.cover(page)).toBeVisible();
});
