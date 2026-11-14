import type { Page } from "@playwright/test";
import { E2E_BASE_PATH, expect, lastMagicLink, signIn, test } from "./support";

/** The account bar (email, the Owner's Invites, Sign out) lives on the Me tab. */
async function openMe(page: Page) {
  await page.getByRole("navigation", { name: "Tabs" }).getByRole("link", { name: "Me", exact: true }).tap();
  await expect(page.getByRole("heading", { level: 1, name: "Me" })).toBeVisible();
}

test("a signed-out visitor is sent to sign in, signs in with the emailed link, and signs out", async ({ page }) => {
  await page.goto(E2E_BASE_PATH);
  await expect(page).toHaveURL(new RegExp(`${E2E_BASE_PATH}/sign-in$`));
  await expect(page.getByRole("button", { name: "Email me a sign-in link" })).toBeVisible();

  await signIn(page, "owner@example.com", { via: "form" });
  await expect(page.getByRole("navigation", { name: "Tabs" })).toBeVisible();
  await openMe(page);
  await expect(page.getByRole("navigation", { name: "Account" })).toContainText("owner@example.com");

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(new RegExp(`${E2E_BASE_PATH}/sign-in$`));
  await page.goto(E2E_BASE_PATH);
  await expect(page).toHaveURL(new RegExp(`${E2E_BASE_PATH}/sign-in$`));
});

test("a used link sends you back to sign in with a message", async ({ page, browser }) => {
  await signIn(page);
  const used = lastMagicLink("owner@example.com")!;

  const other = await browser.newPage();
  await other.goto(used);

  await expect(other).toHaveURL(new RegExp(`${E2E_BASE_PATH}/sign-in\\?error=link$`));
  await expect(other.getByTestId("sign-in-error")).toContainText("expired or was already used");
  await other.close();
});

test("the Owner invites someone, who signs in from the Invite email; revoking signs them out", async ({ page, browser }) => {
  await signIn(page);
  await openMe(page);
  await page.getByRole("link", { name: "Invites" }).click();
  await page.getByLabel("Email to invite").fill("sara@example.com");
  await page.getByRole("button", { name: "Invite" }).click();
  await expect(page.getByRole("status")).toContainText("Invited sara@example.com");
  const invites = page.getByRole("list", { name: "Invites" });
  await expect(invites.getByRole("listitem").filter({ hasText: "sara@example.com" })).toContainText("Pending");

  const sara = await browser.newPage();
  await sara.goto(lastMagicLink("sara@example.com")!);
  await expect(sara).toHaveURL(new RegExp(`${E2E_BASE_PATH}$`));
  await openMe(sara);
  await expect(sara.getByRole("navigation", { name: "Account" })).toContainText("sara@example.com");
  await expect(sara.getByRole("link", { name: "Invites" })).toHaveCount(0);

  await page.reload();
  const row = invites.getByRole("listitem").filter({ hasText: "sara@example.com" });
  await expect(row).toContainText("Reader");
  page.once("dialog", (dialog) => dialog.accept());
  await row.getByRole("button", { name: "Revoke" }).click();
  await expect(row).toContainText("Revoked");

  await sara.reload();
  await expect(sara).toHaveURL(new RegExp(`${E2E_BASE_PATH}/sign-in$`));
  await sara.close();
});
