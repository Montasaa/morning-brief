// Smoke tests for the Ask sheet at phone size (ticket 16). Limits, privacy and
// reset are tested at the API seam (test/api/ask.test.ts).
import type { Page } from "@playwright/test";
import { E2E_BASE_PATH, expect, postEdition, signIn, swipeEdition, test } from "./support";

async function openFirstItem(page: Page) {
  await page.goto(E2E_BASE_PATH);
  await page.getByRole("button", { name: "Next", exact: true }).tap({ position: { x: 40, y: 200 } });
  await expect(page.getByTestId("chip")).toHaveText("Yemen · 1/7");
}

async function askClaude(page: Page, question: string) {
  const sheet = page.getByRole("dialog", { name: "Ask Claude" });
  await sheet.getByRole("textbox", { name: "Your question" }).fill(question);
  await sheet.getByRole("button", { name: "Ask", exact: true }).click();
  return sheet;
}

test.beforeEach(async ({ request }) => {
  await postEdition(request, swipeEdition());
});

test("the Owner asks Claude about an Item and finds the answer again later", async ({ page }) => {
  await signIn(page);
  await openFirstItem(page);

  await page.getByRole("toolbar", { name: "Reactions" }).getByRole("button", { name: "Ask", exact: true }).tap();
  const sheet = page.getByRole("dialog", { name: "Ask Claude" });
  await expect(sheet).toContainText("Truce talks resume over Hodeidah port access");
  await expect(sheet.getByTestId("asks-left")).toHaveText("No daily limit on your questions.");

  await askClaude(page, "Who is mediating the talks?");
  await expect(sheet).toContainText("Who is mediating the talks?");
  await expect(sheet).toContainText("Fake Claude reply (ask)");

  await sheet.getByRole("button", { name: "Close", exact: true }).click();
  await expect(sheet).toHaveCount(0);
  await page.getByRole("toolbar", { name: "Reactions" }).getByRole("button", { name: "Ask", exact: true }).tap();
  await expect(page.getByRole("dialog", { name: "Ask Claude" })).toContainText("Who is mediating the talks?");
});

test("a Reader sees how many questions are left today", async ({ page }) => {
  await signIn(page);
  const invited = await page.request.post(`${E2E_BASE_PATH}/api/invites`, { data: { email: "asker@example.com" } });
  expect([201, 409]).toContain(invited.status());
  // The same phone signs in as the invited Reader (the new session cookie replaces the Owner's).
  await signIn(page, "asker@example.com");

  await openFirstItem(page);
  await page.getByRole("toolbar", { name: "Reactions" }).getByRole("button", { name: "Ask", exact: true }).tap();
  const sheet = page.getByRole("dialog", { name: "Ask Claude" });
  const left = sheet.getByTestId("asks-left");
  await expect(left).toHaveText(/^\d+ of 20 questions left today$/);
  const before = Number((await left.textContent())!.split(" ")[0]);

  await askClaude(page, "What happens next?");

  await expect(sheet).toContainText("Fake Claude reply (ask)");
  await expect(left).toHaveText(`${before - 1} of 20 questions left today`);
});

test("the Owner changes a Reader's daily limit on the Invites page", async ({ page }) => {
  await signIn(page);
  const invited = await page.request.post(`${E2E_BASE_PATH}/api/invites`, { data: { email: "limited@example.com" } });
  expect([201, 409]).toContain(invited.status());
  await signIn(page, "limited@example.com"); // becomes a Reader
  await signIn(page);

  await page.goto(`${E2E_BASE_PATH}/invites`);
  const row = page.getByRole("list", { name: "Ask limits" }).getByRole("listitem").filter({ hasText: "limited@example.com" });
  await row.getByLabel("Daily limit").fill("5");
  await row.getByRole("button", { name: "Save" }).click();
  await expect(row.getByRole("status")).toHaveText("Saved");

  await signIn(page, "limited@example.com");
  await openFirstItem(page);
  await page.getByRole("toolbar", { name: "Reactions" }).getByRole("button", { name: "Ask", exact: true }).tap();
  await expect(page.getByRole("dialog", { name: "Ask Claude" }).getByTestId("asks-left")).toHaveText(
    "5 of 5 questions left today",
  );
});
