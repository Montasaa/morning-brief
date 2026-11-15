// Smoke test for onboarding and the Me tab at phone size (ticket 07). Which
// Items a Brief holds is tested at the API seam; this only checks that a new
// Reader can get through onboarding to a Brief of their Topics, and change
// their Interest Profile on the Me tab.
import type { Page } from "@playwright/test";
import { E2E_BASE_PATH, expect, postEdition, signIn, swipe, swipeEdition, test } from "./support";


const topic = (page: Page, name: string) => page.getByRole("checkbox", { name, exact: true });

test("a new Reader picks Topics on their first visit, gets a Brief of just those, and changes them on the Me tab", async ({
  page,
}) => {
  await postEdition(page.request, swipeEdition());
  // The Owner invites Noor; then this page signs in as Noor, a first-time Reader.
  await signIn(page);
  const invited = await page.request.post(`${E2E_BASE_PATH}/api/invites`, { data: { email: "noor@example.com" } });
  expect(invited.status(), await invited.text()).toBe(201);
  await signIn(page, "noor@example.com", { onboard: false });

  // The Brief waits until onboarding is done.
  await page.goto(E2E_BASE_PATH);
  await expect(page).toHaveURL(new RegExp(`${E2E_BASE_PATH}/onboarding$`));
  await expect(page.getByRole("heading", { level: 1, name: "Welcome to Morning Brief" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Tabs" })).toHaveCount(0);

  // Nothing is picked for them, and Sensitive Topics are not offered here at all.
  const topics = page.getByRole("group", { name: "Topics" });
  await expect(topics.getByRole("checkbox")).toHaveCount(12);
  for (const box of await topics.getByRole("checkbox").all()) await expect(box).not.toBeChecked();
  await expect(topic(page, "Graphic")).toHaveCount(0);
  await expect(topic(page, "Adult Trending")).toHaveCount(0);
  const start = page.getByRole("button", { name: "Start my Brief" });
  await expect(start).toBeDisabled();

  await topic(page, "Yemen").check();
  await topic(page, "Liverpool").check();
  await expect(page.getByLabel("City")).toHaveValue("Riyadh");
  await page.getByLabel("City").fill("Jeddah");
  await start.tap();

  // Their first Brief: only Yemen and Liverpool.
  await expect(page).toHaveURL(new RegExp(`${E2E_BASE_PATH}$`));
  await expect(swipe.tabs(page).getByRole("button")).toHaveText(["For you", "Liverpool"]);
  await swipe.next(page);
  await expect(swipe.card(page)).toContainText("Yemen");
  await swipe.next(page);
  await expect(swipe.card(page)).toContainText("Liverpool");
  await swipe.next(page);
  await expect(page.getByRole("heading", { name: "You're caught up" })).toBeVisible();

  // The Me tab shows what they picked, every Topic of the Catalog, the language and the city.
  await page.getByRole("navigation", { name: "Tabs" }).getByRole("link", { name: "Me", exact: true }).tap();
  await expect(page.getByRole("heading", { level: 1, name: "Me" })).toBeVisible();
  await expect(topic(page, "Yemen")).toBeChecked();
  await expect(topic(page, "Liverpool")).toBeChecked();
  await expect(topic(page, "AI")).not.toBeChecked();
  await expect(page.getByRole("checkbox", { name: /^Graphic/ })).not.toBeChecked();
  await expect(page.getByRole("radio", { name: "English" })).toBeChecked();
  await expect(page.getByLabel("City")).toHaveValue("Jeddah");

  // Changes are saved as they are made, and last.
  const unfollowed = page.waitForResponse((r) => r.url().endsWith("/api/topics/liverpool/unfollow"));
  await topic(page, "Liverpool").uncheck();
  expect((await unfollowed).status()).toBe(200);
  await page.getByLabel("City").fill("Aden");
  await page.getByRole("button", { name: "Save city" }).tap();
  await expect(page.getByRole("status")).toHaveText("City saved: Aden");
  const saved = page.waitForResponse((r) => r.url().endsWith("/api/me") && r.request().method() === "PATCH");
  await page.getByRole("radio", { name: "العربية" }).check();
  expect((await saved).status()).toBe(200);

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.getByRole("radio", { name: "العربية" })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: "ليفربول", exact: true })).not.toBeChecked();
  await expect(page.getByRole("checkbox", { name: "اليمن", exact: true })).toBeChecked();
  await expect(page.getByLabel("المدينة")).toHaveValue("Aden");

  // And the next Brief has only Yemen left.
  await page.getByRole("navigation", { name: "التبويبات" }).getByRole("link", { name: "الموجز", exact: true }).tap();
  await swipe.next(page);
  await expect(swipe.card(page)).toContainText("اليمن");
  await swipe.next(page);
  await expect(page.getByRole("heading", { name: "انتهيت من الموجز" })).toBeVisible();
});
