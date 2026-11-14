// Smoke test for top stories and why-lines at phone size (ticket 13). Which
// Items are picked is tested at the API seam; here the first card carries the
// "Top for you" badge and the why-line, in English and in Arabic. The fake
// Claude picks the Edition's own top stories with a canned why-line.
import type { Page } from "@playwright/test";
import { E2E_BASE_PATH, expect, postEdition, signIn, swipeEdition, test } from "./support";

const tapForward = (page: Page) => page.getByRole("button", { name: /^(Next|التالي)$/ }).tap({ position: { x: 40, y: 200 } });

test("a top story leads the Brief with its badge and why-line in the Reader's language", async ({ page }) => {
  await signIn(page);
  // Posted after the Owner is a Reader, so their top stories are picked for this Edition.
  await postEdition(page.request, swipeEdition());
  await page.goto(E2E_BASE_PATH);

  await tapForward(page);
  const card = page.getByRole("article");
  await expect(page.getByRole("heading", { level: 2 })).toHaveText("Truce talks resume over Hodeidah port access");
  await expect(card.getByText("Top for you", { exact: true })).toBeVisible();
  await expect(page.getByTestId("why-for-you")).toContainText("One of today's biggest stories in your Topics.");

  await page.getByRole("button", { name: "العربية", exact: true }).tap();
  await expect(card.getByText("الأهم لك", { exact: true })).toBeVisible();
  await expect(page.getByTestId("why-for-you")).toContainText("من أهم أخبار اليوم في مواضيعك.");
});
