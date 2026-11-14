// Smoke test for Reactions in the Swipe Brief at phone size (ticket 09): Like
// stays pressed, Hide opens the reason sheet, the Item leaves the Brief and
// Undo brings it back. How Reactions change ranking is tested at the API seam.
// Uses its own invited Reader, so the Owner's Brief stays whole for other specs.
import type { Page } from "@playwright/test";
import { E2E_BASE_PATH, expect, postEdition, signIn, swipeEdition, test } from "./support";

const READER = "rania@example.com";
const TALKS = "me-yemen-port-talks";

async function tap(page: Page, side: "Next" | "Back") {
  await page.getByRole("button", { name: side, exact: true }).tap({ position: { x: 40, y: 200 } });
}

test.beforeEach(async ({ page }) => {
  await postEdition(page.request, swipeEdition());
  await signIn(page);
  await page.request.post(`${E2E_BASE_PATH}/api/invites`, { data: { email: READER } }); // 201, or already invited
  await signIn(page, READER);
  // The database lasts the whole run: start from no Reactions on the first card.
  for (const kind of ["like", "save", "hide"]) {
    expect((await page.request.delete(`${E2E_BASE_PATH}/api/items/${TALKS}/reactions/${kind}`)).status()).toBe(200);
  }
});

test("Like stays pressed, Hide asks why, takes the Item out, and Undo brings it back", async ({ page }) => {
  await page.goto(E2E_BASE_PATH);
  await tap(page, "Next");
  await expect(page.getByTestId("chip")).toHaveText("Yemen · 1/7");

  // Like, and it is still liked after a reload.
  const like = page.getByRole("button", { name: "Like", exact: true });
  await expect(like).toHaveAttribute("aria-pressed", "false");
  await like.click();
  await expect(like).toHaveAttribute("aria-pressed", "true");
  await expect
    .poll(async () => (await (await page.request.get(`${E2E_BASE_PATH}/api/brief`)).json()).items[0].reactions.like)
    .toBe(true);
  await page.reload();
  await tap(page, "Next");
  await expect(page.getByRole("button", { name: "Like", exact: true })).toHaveAttribute("aria-pressed", "true");

  // Hide opens the reason sheet with the prototype's four choices.
  await page.getByRole("button", { name: "Hide", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "Why hide this?" });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole("button")).toHaveText(["Not interested", "Already seen", "Bad source", "Just hide"]);

  // Picking a reason takes the Item out of the Brief at once.
  await sheet.getByRole("button", { name: "Not interested", exact: true }).click();
  await expect(sheet).toHaveCount(0);
  await expect(page.getByTestId("chip")).toHaveText("AI · 1/6");
  await expect(page.getByRole("heading", { level: 2 })).toHaveText("A new open-weights model tops the coding leaderboard");

  // Undo puts it back.
  const toast = page.getByRole("status").filter({ hasText: "Hidden" });
  await toast.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByTestId("chip")).toHaveText("Yemen · 1/7");
  await expect(toast).toHaveCount(0);

  // "Just hide", and the Item stays out of the next Brief.
  await page.getByRole("button", { name: "Hide", exact: true }).click();
  await page.getByRole("dialog", { name: "Why hide this?" }).getByRole("button", { name: "Just hide" }).click();
  await expect(page.getByTestId("chip")).toHaveText("AI · 1/6");
  await expect
    .poll(async () => (await (await page.request.get(`${E2E_BASE_PATH}/api/brief`)).json()).items.length)
    .toBe(6);
  await page.reload();
  await tap(page, "Next");
  await expect(page.getByTestId("chip")).toHaveText("AI · 1/6");
});
