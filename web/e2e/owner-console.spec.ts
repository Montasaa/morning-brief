// Smoke test for the Owner console at phone size (ticket 10): the Owner opens
// it from the Me tab and sees the latest Edition, a rejected ingest and a
// Reader's "bad source" report. Other Readers cannot open it. What counts as a
// report and how reports group is tested at the API seam.
import { E2E_INGEST_TOKEN } from "../playwright.config";
import { E2E_BASE_PATH, expect, postEdition, signIn, swipeEdition, test } from "./support";

const READER = "noor@example.com";

test("the Owner sees ingest health and bad source reports; other Readers cannot open the console", async ({ page }) => {
  await postEdition(page.request, swipeEdition());
  const broken = await page.request.post(`${E2E_BASE_PATH}/api/editions`, {
    data: { edition_id: "e2e-owner-console-broken" },
    headers: { authorization: `Bearer ${E2E_INGEST_TOKEN}` },
  });
  expect(broken.status()).toBe(422);

  await signIn(page);
  await page.request.post(`${E2E_BASE_PATH}/api/invites`, { data: { email: READER } }); // 201, or already invited
  await signIn(page, READER);
  const hidden = await page.request.post(`${E2E_BASE_PATH}/api/items/markets-fed-minutes/reactions`, {
    data: { kind: "hide", reason: "bad_source" },
  });
  expect(hidden.status()).toBe(200);

  // A Reader is sent back to their Brief, and has no console link.
  await page.goto(`${E2E_BASE_PATH}/owner`);
  await expect(page).not.toHaveURL(/\/owner$/);
  await page.goto(`${E2E_BASE_PATH}/me`);
  await expect(page.getByRole("navigation", { name: "Account" })).toContainText(READER);
  await expect(page.getByRole("link", { name: "Console" })).toHaveCount(0);

  await signIn(page);
  await page.goto(`${E2E_BASE_PATH}/me`);
  await page.getByRole("link", { name: "Console" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Owner console" })).toBeVisible();

  await expect(page.getByRole("definition").first()).toBeVisible();
  const rejected = page.getByRole("list", { name: "Rejected ingests" });
  await expect(rejected.getByRole("listitem").filter({ hasText: "e2e-owner-console-broken" }).first()).toBeVisible();

  const report = page
    .getByRole("list", { name: "Reports by Item" })
    .getByRole("listitem")
    .filter({ hasText: "Fed minutes point to a pause" });
  await expect(report).toContainText("US Markets");
  await expect(report).toContainText("1 Reader");
  await expect(report.getByRole("link", { name: "Example Markets" })).toBeVisible();
  await expect(
    page.getByRole("list", { name: "Reports by source" }).getByRole("listitem").filter({ hasText: "Example Markets" }),
  ).toContainText("1 Reader");

  // Nothing runs off the side of a phone screen.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
