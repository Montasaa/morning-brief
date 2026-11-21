// Smoke test for Me › Display at phone size (rework ticket 07, spec #6).
// Defaults, validation and syncing are tested at the API seam
// (test/api/display.test.ts); this checks that the controls take effect at
// once, survive a reload (rendered on the document by the server, so there is
// no flash) and reach the Reader's other devices, in English and Arabic.
import type { Page } from "@playwright/test";
import { E2E_BASE_PATH, expect, postEdition, signIn, swipeEdition, test } from "./support";

const READER = "dina@example.com";
const html = (page: Page) => page.locator("html");

test.beforeEach(async ({ page, request }) => {
  await postEdition(request, swipeEdition());
  // The Owner invites Dina, then this page signs in as Dina, with the default Display.
  await signIn(page);
  await page.request.post(`${E2E_BASE_PATH}/api/invites`, { data: { email: READER } });
  await signIn(page, READER);
  const reset = await page.request.patch(`${E2E_BASE_PATH}/api/me`, {
    data: { display: { theme: null, accent: null, text_size: null, density: null } },
  });
  expect(reset.status(), await reset.text()).toBe(200);
});

test("changing the theme and accent in Me › Display takes effect at once and survives a reload", async ({ page, browser }) => {
  await page.getByRole("navigation", { name: "Tabs" }).getByRole("link", { name: "Me", exact: true }).tap();
  await page.getByRole("link", { name: /^Display/ }).tap();
  await expect(page.getByRole("heading", { level: 1, name: "Display" })).toBeVisible();
  await expect(page.getByRole("radio", { name: "Auto", exact: true })).toBeChecked();
  await expect(page.getByRole("radio", { name: "Amber", exact: true })).toBeChecked();
  await expect(html(page)).toHaveAttribute("data-theme", "auto");

  await page.getByRole("radio", { name: "Dark", exact: true }).check();
  await page.getByRole("radio", { name: "Sky", exact: true }).check();
  await page.getByRole("radio", { name: "Large", exact: true }).check();
  await page.getByRole("radio", { name: "Compact", exact: true }).check();

  // At once, without a reload.
  await expect(html(page)).toHaveAttribute("data-theme", "dark");
  await expect(html(page)).toHaveAttribute("data-accent", "sky");
  await expect(html(page)).toHaveAttribute("data-text-size", "l");
  await expect(html(page)).toHaveAttribute("data-density", "compact");
  await expect(page.getByTestId("display-status")).toHaveText("Saved.");

  // The server renders the saved look on the document itself, so it is there before any script runs.
  const served = await (await page.request.get(`${E2E_BASE_PATH}/me/display`)).text();
  expect(served).toMatch(/<html[^>]* data-theme="dark"/);
  expect(served).toMatch(/<html[^>]* data-accent="sky"/);

  await page.reload();
  await expect(page.getByRole("radio", { name: "Dark", exact: true })).toBeChecked();
  await expect(page.getByRole("radio", { name: "Sky", exact: true })).toBeChecked();
  await expect(page.getByRole("radio", { name: "Large", exact: true })).toBeChecked();
  await expect(page.getByRole("radio", { name: "Compact", exact: true })).toBeChecked();
  await expect(html(page)).toHaveAttribute("data-theme", "dark");
  await expect(html(page)).toHaveAttribute("data-accent", "sky");

  // Another device the Reader signs in on looks the same.
  const tablet = await browser.newPage();
  await signIn(tablet, READER);
  await expect(html(tablet)).toHaveAttribute("data-theme", "dark");
  await expect(html(tablet)).toHaveAttribute("data-accent", "sky");
  await tablet.close();
});

test("Me › Display is in Arabic, right to left", async ({ page }) => {
  await page.request.patch(`${E2E_BASE_PATH}/api/me`, { data: { language: "ar" } });
  await page.goto(`${E2E_BASE_PATH}/me/display`);

  await expect(html(page)).toHaveAttribute("dir", "rtl");
  await expect(page.getByRole("heading", { level: 1, name: "العرض" })).toBeVisible();
  for (const legend of ["السمة", "لون التمييز", "حجم النص", "الكثافة"]) {
    await expect(page.getByRole("group", { name: legend })).toBeVisible();
  }
  await page.getByRole("radio", { name: "فاتح", exact: true }).check();
  await expect(html(page)).toHaveAttribute("data-theme", "light");
  await expect(page.getByTestId("display-status")).toHaveText("تم الحفظ.");
});
