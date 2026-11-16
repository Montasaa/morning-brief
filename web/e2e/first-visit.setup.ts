// The Owner's first visit, on the run's fresh database, before any other spec
// (every project depends on this one in playwright.config.ts): with no password
// yet, the sign-in page lets the Owner's email choose one, typed twice. It
// signs them in to the Brief, and the offer is gone for good.
import { E2E_OWNER_EMAIL } from "../playwright.config";
import { E2E_BASE_PATH, E2E_PASSWORD, expect, test } from "./support";

test("the Owner chooses a password on the first visit and lands on the Brief; it can't be set again", async ({ page }) => {
  await page.goto(E2E_BASE_PATH);
  await expect(page).toHaveURL(new RegExp(`${E2E_BASE_PATH}/sign-in$`));
  const firstVisit = page.getByRole("region", { name: "First visit: choose the Owner's password" });
  await expect(firstVisit).toBeVisible();

  // Typed differently twice: refused, nothing set.
  await firstVisit.getByLabel("Owner's email").fill(E2E_OWNER_EMAIL);
  await firstVisit.getByLabel("New password").fill(E2E_PASSWORD);
  await firstVisit.getByLabel("Type it again").fill(`${E2E_PASSWORD}!`);
  await firstVisit.getByRole("button", { name: "Set password and sign in" }).click();
  await expect(page.getByTestId("first-password-error")).toContainText("The two passwords don't match.");

  // Retried until it lands: a cold `next dev` may reload the page while it compiles.
  await expect(async () => {
    if (!page.url().includes("/sign-in")) return;
    await firstVisit.getByLabel("Owner's email").fill(E2E_OWNER_EMAIL);
    await firstVisit.getByLabel("New password").fill(E2E_PASSWORD);
    await firstVisit.getByLabel("Type it again").fill(E2E_PASSWORD);
    await firstVisit.getByRole("button", { name: "Set password and sign in" }).click();
    await expect(page).toHaveURL(new RegExp(`${E2E_BASE_PATH}(/onboarding)?$`), { timeout: 5_000 });
  }).toPass({ timeout: 30_000 });

  // A second try to "set" it is refused, and the sign-in page no longer offers it.
  const again = await page.request.post(`${E2E_BASE_PATH}/api/auth/first-password`, {
    data: { email: E2E_OWNER_EMAIL, password: "someone else's", confirm_password: "someone else's" },
  });
  expect(again.status()).toBe(403);
  await page.request.post(`${E2E_BASE_PATH}/api/auth/sign-out`);
  await page.goto(`${E2E_BASE_PATH}/sign-in`);
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "First visit: choose the Owner's password" })).toHaveCount(0);
});
