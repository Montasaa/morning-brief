// Smoke test for the Saved & Search tab at phone size (ticket 15): saved Items
// are listed with their date, Topic and Story Thread, unsaving takes one out,
// and search finds Items in English and in Arabic. What search matches and in
// what order is tested at the API seam (test/api/saved-search.test.ts).
// Uses its own invited Reader, so the Owner's Reactions stay untouched.
import { E2E_BASE_PATH, expect, postEdition, signIn, swipeEdition, test } from "./support";

const READER = "samira@example.com";

test.beforeEach(async ({ page }) => {
  await postEdition(page.request, swipeEdition());
  await signIn(page);
  await page.request.post(`${E2E_BASE_PATH}/api/invites`, { data: { email: READER } }); // 201, or already invited
  await signIn(page, READER);
  // The database lasts the whole run: start from exactly two saved Items.
  for (const id of ["me-yemen-port-talks", "lfc-midfielder-fitness", "ai-open-model-release"]) {
    expect((await page.request.delete(`${E2E_BASE_PATH}/api/items/${id}/reactions/save`)).status()).toBe(200);
  }
  for (const id of ["lfc-midfielder-fitness", "me-yemen-port-talks"]) {
    const res = await page.request.post(`${E2E_BASE_PATH}/api/items/${id}/reactions`, { data: { kind: "save" } });
    expect(res.status()).toBe(200);
  }
});

test("lists saved Items newest-saved first, unsaves one, and searches in English and Arabic", async ({ page }) => {
  await page.goto(`${E2E_BASE_PATH}/saved`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Saved & Search");

  const rows = page.getByTestId("listed-item");
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0).getByRole("heading")).toHaveText("Truce talks resume over Hodeidah port access");
  await expect(rows.nth(0)).toContainText("14 Nov 2026 · Yemen · Yemen truce talks");
  await expect(rows.nth(1).getByRole("heading")).toHaveText("Midfielder back in full training before the weekend");

  // Unsaving takes the row out.
  const save = rows.nth(1).getByRole("button", { name: "Save", exact: true });
  await expect(save).toHaveAttribute("aria-pressed", "true");
  await save.click();
  await expect(rows).toHaveCount(1);

  // Search in English.
  const box = page.getByRole("searchbox", { name: "Search every Edition" });
  await box.fill("open-weights");
  await expect(rows).toHaveCount(1);
  await expect(rows.nth(0).getByRole("heading")).toHaveText("A new open-weights model tops the coding leaderboard");
  await expect(rows.nth(0).getByRole("button", { name: "Save", exact: true })).toHaveAttribute("aria-pressed", "false");

  // Search in Arabic.
  await box.fill("الحديدة");
  await expect(rows).toHaveCount(1);
  await expect(rows.nth(0).getByRole("heading")).toHaveText("Truce talks resume over Hodeidah port access");

  // Clearing the box brings back the Saved list.
  await box.fill("");
  await expect(page.getByRole("heading", { level: 2 })).toContainText("Saved");
  await expect(rows).toHaveCount(1);

  // In Arabic the tab runs right to left and shows the Arabic text.
  expect((await page.request.patch(`${E2E_BASE_PATH}/api/me`, { data: { language: "ar" } })).status()).toBe(200);
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await page.getByRole("searchbox", { name: "ابحث في كل الطبعات" }).fill("ميناء");
  await expect(rows).toHaveCount(1);
  await expect(rows.nth(0).getByRole("heading")).toHaveText("استئناف محادثات الهدنة بشأن الوصول إلى ميناء الحديدة");
  await expect(rows.nth(0)).toContainText("اليمن · محادثات الهدنة في اليمن");
});
