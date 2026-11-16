// Smoke test for Claude Topic suggestions at phone size (ticket 12). What Claude
// may suggest (never Sensitive Topics) and the failure fallback are tested at
// the API seam; this checks that a new Reader can write a line about
// themselves, follow one suggestion and skip another, and do the same later
// from the Me tab. The e2e server's fake Claude suggests Liverpool and AI.
import type { Page } from "@playwright/test";
import { E2E_BASE_PATH, E2E_PASSWORD, expect, postEdition, signIn, swipeEdition, test } from "./support";

const topic = (page: Page, name: string) => page.getByRole("checkbox", { name, exact: true });
const suggested = (page: Page) => page.getByRole("list", { name: "Suggested Topics" });

test("a new Reader follows a Topic Claude suggests from their note, skips another, and asks again on the Me tab", async ({
  page,
}) => {
  await postEdition(page.request, swipeEdition());
  await signIn(page);
  const invited = await page.request.post(`${E2E_BASE_PATH}/api/invites`, {
    data: { email: "rana@example.com", password: E2E_PASSWORD },
  });
  expect(invited.status(), await invited.text()).toBe(201);
  await signIn(page, "rana@example.com", { onboard: false });

  await page.goto(`${E2E_BASE_PATH}/onboarding`);
  const suggest = page.getByRole("button", { name: "Suggest Topics" });
  await expect(suggest).toBeDisabled();
  await page.getByLabel("About you (optional)").fill("I work in tech in Jeddah and never miss a Liverpool match.");
  await suggest.tap();

  await expect(suggested(page).getByRole("listitem")).toHaveCount(2);
  await expect(suggested(page)).toContainText("Liverpool");
  await expect(suggested(page)).toContainText("You follow the football.");

  // Follow Liverpool: it is ticked in the Topic list and leaves the suggestions.
  await page.getByRole("button", { name: "Follow Liverpool", exact: true }).tap();
  await expect(topic(page, "Liverpool")).toBeChecked();
  await expect(page.getByTestId("suggestions-status")).toHaveText("Following Liverpool.");
  // Skip AI: it goes away and stays unticked.
  await page.getByRole("button", { name: "Skip AI", exact: true }).tap();
  await expect(suggested(page)).toHaveCount(0);
  await expect(topic(page, "AI")).not.toBeChecked();

  await page.getByRole("button", { name: "Start my Brief" }).tap();
  await expect(page).toHaveURL(new RegExp(`${E2E_BASE_PATH}$`));

  // On the Me tab, Liverpool is followed; asking again suggests only AI.
  await page.getByRole("navigation", { name: "Tabs" }).getByRole("link", { name: "Me", exact: true }).tap();
  await expect(topic(page, "Liverpool")).toBeChecked();
  await expect(topic(page, "AI")).not.toBeChecked();
  await page.getByLabel("Find more Topics").fill("Software engineer.");
  await page.getByRole("button", { name: "Suggest Topics" }).tap();
  await expect(suggested(page).getByRole("listitem")).toHaveCount(1);

  const followed = page.waitForResponse((r) => r.url().endsWith("/api/topics/ai/follow"));
  await page.getByRole("button", { name: "Follow AI", exact: true }).tap();
  expect((await followed).status()).toBe(200);
  await expect(topic(page, "AI")).toBeChecked();

  await page.reload();
  await expect(topic(page, "AI")).toBeChecked();
  await expect(topic(page, "Liverpool")).toBeChecked();
});
