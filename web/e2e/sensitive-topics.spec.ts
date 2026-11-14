// Smoke tests for Sensitive Topics at phone size (ticket 08): a sensitive card
// is blurred with its warning until tapped, every time it comes round, and the
// Me tab opts into Adult Trending only after the 18+ confirmation. Who sees
// which Items is tested at the API seam (test/api/sensitive-topics.test.ts).
import type { Page } from "@playwright/test";
import { E2E_BASE_PATH, expect, postEdition, signIn, swipeEdition, test } from "./support";

async function tap(page: Page, side: "Next" | "Back") {
  await page.getByRole("button", { name: side, exact: true }).tap({ position: { x: 40, y: 200 } });
}

const FLOOD = "Flood aftermath leaves villages cut off";

test("a sensitive card is blurred with its warning until tapped, and blurred again when it comes round", async ({ page }) => {
  await postEdition(page.request, swipeEdition());
  await signIn(page); // the Owner, opted into every Sensitive Topic
  await page.goto(E2E_BASE_PATH);
  for (let i = 0; i < 5; i++) await tap(page, "Next");
  await expect(page.getByTestId("chip")).toHaveText("Graphic · 5/7");

  // Blurred: the warning and a reveal button, the story itself hidden.
  const card = page.getByRole("article", { name: "Sensitive Item" });
  const reveal = page.getByRole("button", { name: /Tap to reveal/ });
  await expect(card).toBeVisible();
  await expect(reveal).toContainText("Casualties");
  await expect(page.getByRole("heading", { level: 2, name: FLOOD })).toHaveCount(0);
  // The picture and the text are blurred and out of reach (inert).
  await expect(card.locator("[inert]")).toHaveCount(2);
  for (const part of await card.locator("[inert]").all()) await expect(part).toHaveCSS("filter", /blur/);

  // Tapped: the card reads normally, with its warning as a badge.
  await reveal.tap();
  await expect(reveal).toHaveCount(0);
  await expect(page.getByRole("article", { name: FLOOD })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: FLOOD })).toBeVisible();
  await expect(page.getByRole("article").locator("[inert]")).toHaveCount(0);
  await expect(page.getByRole("article").getByText("Casualties", { exact: true })).toBeVisible();

  // Away and back: blurred again. The sides still skip it without revealing.
  await tap(page, "Next");
  await expect(page.getByTestId("chip")).toHaveText("GitHub Trending · 6/7");
  await tap(page, "Back");
  await expect(page.getByTestId("chip")).toHaveText("Graphic · 5/7");
  await expect(page.getByRole("button", { name: /Tap to reveal/ })).toBeVisible();
  await tap(page, "Next");
  await expect(page.getByTestId("chip")).toHaveText("GitHub Trending · 6/7");
});

test("the Me tab opts into Graphic straight away and into Adult Trending only after the 18+ confirmation", async ({
  page,
}) => {
  await postEdition(page.request, swipeEdition());
  await signIn(page);
  const invited = await page.request.post(`${E2E_BASE_PATH}/api/invites`, { data: { email: "layla@example.com" } });
  expect(invited.status(), await invited.text()).toBe(201);
  await signIn(page, "layla@example.com", { onboard: false });
  const onboarded = await page.request.patch(`${E2E_BASE_PATH}/api/me`, { data: { topics: ["ai"], onboarded: true } });
  expect(onboarded.status()).toBe(200);

  await page.goto(`${E2E_BASE_PATH}/me`);
  const sensitive = page.getByRole("group", { name: "Sensitive Topics" });
  const graphic = sensitive.getByRole("checkbox", { name: /^Graphic/ });
  const adult = sensitive.getByRole("checkbox", { name: /^Adult Trending/ });
  await expect(graphic).not.toBeChecked();
  await expect(adult).not.toBeChecked();

  // Graphic: one tap.
  const optedIn = page.waitForResponse((r) => r.url().endsWith("/api/topics/graphic/follow"));
  await graphic.check();
  expect((await optedIn).status()).toBe(200);

  // Adult Trending: asks first; Cancel leaves it off.
  await adult.click();
  const confirm = page.getByRole("group", { name: "Adult Trending is for adults only." });
  await expect(confirm).toBeVisible();
  await expect(adult).not.toBeChecked();
  await confirm.getByRole("button", { name: "Cancel" }).tap();
  await expect(confirm).toHaveCount(0);
  await expect(adult).not.toBeChecked();

  await adult.click();
  const adultOptIn = page.waitForResponse((r) => r.url().endsWith("/api/topics/adult-trending/follow"));
  await page.getByRole("button", { name: "I am 18 or over" }).tap();
  expect((await adultOptIn).status()).toBe(200);
  await expect(adult).toBeChecked();

  await page.reload();
  await expect(page.getByRole("checkbox", { name: /^Graphic/ })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: /^Adult Trending/ })).toBeChecked();
  const me = await (await page.request.get(`${E2E_BASE_PATH}/api/me`)).json();
  expect(me.age_confirmed_at).not.toBeNull();
});
