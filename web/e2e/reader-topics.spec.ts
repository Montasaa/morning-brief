// Smoke test for Reader-created Topics and Gathering Rules at phone size
// (ticket 11). Privacy, the cap and the gathering list are tested at the API
// seam; this only checks that a Reader can create and share a Topic on the Me
// tab, and that the Owner can edit its Gathering Rules.
import { E2E_BASE_PATH, expect, signIn, test } from "./support";

test("a Reader creates a private Topic on the Me tab and shares it; the Owner edits its rules", async ({ page }) => {
  // The Owner invites Lina, then this page signs in as Lina.
  await signIn(page);
  const invited = await page.request.post(`${E2E_BASE_PATH}/api/invites`, { data: { email: "lina@example.com" } });
  expect(invited.status(), await invited.text()).toBe(201);
  await signIn(page, "lina@example.com");

  await page.getByRole("navigation", { name: "Tabs" }).getByRole("link", { name: "Me", exact: true }).tap();
  await expect(page.getByRole("heading", { level: 2, name: "Your Topics" })).toBeVisible();
  await expect(page.getByText("0 of 10 created")).toBeVisible();

  await page.getByLabel("New Topic").fill("Formula 1");
  await page.getByLabel(/A short note/).fill("Races and team news, mostly Ferrari.");
  await page.getByRole("button", { name: "Create Topic" }).tap();

  // Created, followed and private.
  await expect(page.getByTestId("your-topics-status")).toContainText('Created "Formula 1"');
  await expect(page.getByRole("checkbox", { name: /^Formula 1/ })).toBeChecked();
  const mine = page.getByRole("list", { name: "Topics you created" });
  await expect(mine.getByRole("listitem")).toHaveCount(1);
  await expect(mine.getByText("Private", { exact: true })).toBeVisible();
  await expect(page.getByText("1 of 10 created")).toBeVisible();

  // Shared to the Catalog.
  await mine.getByRole("button", { name: "Share to Catalog" }).tap();
  await expect(mine.getByText("In the Catalog", { exact: true })).toBeVisible();
  await expect(mine.getByRole("button", { name: "Share to Catalog" })).toHaveCount(0);

  // The Owner sees its drafted rules and edits them.
  await signIn(page);
  await page.goto(`${E2E_BASE_PATH}/me`);
  await page.getByRole("link", { name: "Gathering Rules" }).tap();
  await expect(page.getByRole("heading", { level: 1, name: "Gathering Rules" })).toBeVisible();
  const card = page.getByRole("listitem", { name: "Formula 1", exact: true });
  await expect(card).toContainText("Created by lina@example.com");
  await expect(card).toContainText("1 follower");
  const rules = card.getByLabel("Gathering Rules for Formula 1");
  await expect(rules).not.toHaveValue("");
  await rules.fill("Trusted outlets: Autosport, The Race.\nWhat counts: races.\nExclude: betting.");
  await card.getByRole("button", { name: "Save rules" }).tap();
  await expect(card).toContainText("Saved.");
  await expect(card).toContainText("Edited by you");

  await page.reload();
  await expect(page.getByLabel("Gathering Rules for Formula 1")).toHaveValue(
    "Trusted outlets: Autosport, The Race.\nWhat counts: races.\nExclude: betting.",
  );
});
