import type { Page } from "@playwright/test";
import { E2E_BASE_PATH, E2E_PASSWORD, expect, signIn, test } from "./support";

/** The account bar (email, the Owner's Invites, Sign out) lives on the Me tab. */
async function openMe(page: Page) {
  await page.getByRole("navigation", { name: "Tabs" }).getByRole("link", { name: "Me", exact: true }).tap();
  await expect(page.getByRole("heading", { level: 1, name: "Me" })).toBeVisible();
}

/** Type into the sign-in page and press Sign in. */
async function submitSignIn(page: Page, email: string, password: string) {
  await page.goto(`${E2E_BASE_PATH}/sign-in`);
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

test("a signed-out visitor is sent to sign in, signs in with email and password, and signs out", async ({ page }) => {
  await page.goto(E2E_BASE_PATH);
  await expect(page).toHaveURL(new RegExp(`${E2E_BASE_PATH}/sign-in$`));
  await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
  await expect(page.getByText(/no password needed/i)).toHaveCount(0);

  await signIn(page, "owner@example.com", { via: "form" });
  await expect(page.getByRole("navigation", { name: "Tabs" })).toBeVisible();
  await openMe(page);
  await expect(page.getByRole("navigation", { name: "Account" })).toContainText("owner@example.com");

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(new RegExp(`${E2E_BASE_PATH}/sign-in$`));
  await page.goto(E2E_BASE_PATH);
  await expect(page).toHaveURL(new RegExp(`${E2E_BASE_PATH}/sign-in$`));
});

test("a wrong password and an unknown email get the same message", async ({ page }) => {
  await submitSignIn(page, "owner@example.com", "not the password");
  await expect(page).toHaveURL(new RegExp(`${E2E_BASE_PATH}/sign-in\\?error=wrong$`));
  await expect(page.getByTestId("sign-in-error")).toHaveText("Wrong email or password.");

  await submitSignIn(page, "nobody@example.com", "not the password");
  await expect(page.getByTestId("sign-in-error")).toHaveText("Wrong email or password.");
});

test("the Owner adds a Reader with a password, who signs in; Reset changes it; Revoke signs them out", async ({ page, browser }) => {
  await signIn(page);
  await openMe(page);
  await page.getByRole("link", { name: "Invites" }).click();
  await page.getByLabel("Reader's email").fill("sara@example.com");
  await page.getByLabel("Their password").fill("sara's first password");
  await page.getByRole("button", { name: "Add Reader" }).click();
  await expect(page.getByRole("status")).toContainText("Added sara@example.com");
  const invites = page.getByRole("list", { name: "Invites" });
  const row = invites.getByRole("listitem").filter({ hasText: "sara@example.com" });
  await expect(row).toContainText("Reader");

  const sara = await browser.newPage();
  await submitSignIn(sara, "sara@example.com", "sara's first password");
  // A first-time Reader starts with onboarding (ticket 07); the Me tab is reachable from the start.
  await expect(sara).toHaveURL(new RegExp(`${E2E_BASE_PATH}/onboarding$`));
  await sara.goto(`${E2E_BASE_PATH}/me`);
  await expect(sara.getByRole("navigation", { name: "Account" })).toContainText("sara@example.com");
  await expect(sara.getByRole("link", { name: "Invites" })).toHaveCount(0);

  // Reset: the old password stops working (and her device is signed out); the new one works.
  await row.getByRole("button", { name: "Reset password" }).click();
  await row.getByLabel("New password for sara@example.com").fill("sara's second password");
  await row.getByRole("button", { name: "Save password" }).click();
  await expect(page.getByRole("status")).toContainText("New password set for sara@example.com");
  await sara.reload();
  await expect(sara).toHaveURL(new RegExp(`${E2E_BASE_PATH}/sign-in$`));
  await submitSignIn(sara, "sara@example.com", "sara's first password");
  await expect(sara.getByTestId("sign-in-error")).toHaveText("Wrong email or password.");
  await submitSignIn(sara, "sara@example.com", "sara's second password");
  await expect(sara).toHaveURL(new RegExp(`${E2E_BASE_PATH}(/onboarding)?$`));

  // Revoke: signed out, and the password no longer signs in.
  page.once("dialog", (dialog) => dialog.accept());
  await row.getByRole("button", { name: "Revoke" }).click();
  await expect(row).toContainText("Revoked");
  await sara.reload();
  await expect(sara).toHaveURL(new RegExp(`${E2E_BASE_PATH}/sign-in$`));
  await submitSignIn(sara, "sara@example.com", "sara's second password");
  await expect(sara.getByTestId("sign-in-error")).toHaveText("Wrong email or password.");
  await sara.close();
});

test("a Reader changes their password on Me", async ({ page }) => {
  const email = "pw-change@example.com";
  await signIn(page);
  const added = await page.request.post(`${E2E_BASE_PATH}/api/invites`, { data: { email, password: E2E_PASSWORD } });
  expect(added.status(), await added.text()).toBe(201);
  await signIn(page, email);

  await openMe(page);
  await page.getByRole("link", { name: /^Password/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Password" })).toBeVisible();
  await page.getByLabel("Current password").fill(E2E_PASSWORD);
  await page.getByLabel("New password", { exact: true }).fill("my very own password");
  await page.getByLabel("Type the new password again").fill("my very own password");
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page.getByTestId("password-changed")).toBeVisible();

  await page.getByRole("link", { name: "Back to Me" }).click();
  await page.getByRole("button", { name: "Sign out" }).click();
  await submitSignIn(page, email, E2E_PASSWORD);
  await expect(page.getByTestId("sign-in-error")).toHaveText("Wrong email or password.");
  await signIn(page, email, { via: "form", password: "my very own password" });
});
