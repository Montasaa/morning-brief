// Smoke tests for Sensitive Topics at phone size (ticket 08; the neutral veil
// of rework ticket 08): a sensitive Item sits behind the veil until tapped,
// every time it comes round, and the Me tab opts into Adult Trending only
// after the 18+ confirmation. Who sees which Items is tested at the API seam
// (test/api/sensitive-topics.test.ts).
import { E2E_BASE_PATH, expect, postEdition, signIn, swipe, swipeEdition, test } from "./support";

const FLOOD = "Flood aftermath leaves villages cut off";

test("a sensitive Item is veiled until tapped, veiled again when it comes round, and can be moved past", async ({ page }) => {
  await postEdition(page.request, swipeEdition());
  await signIn(page); // the Owner, opted into every Sensitive Topic
  await page.goto(E2E_BASE_PATH);
  for (let i = 0; i < 5; i++) await swipe.next(page);

  // Veiled: the eye, the Topic's name, its warning and "Tap to view"; the story itself hidden.
  const card = page.getByRole("article", { name: "Sensitive Item: Graphic" });
  const reveal = card.getByRole("button", { name: /Tap to view/ });
  await expect(card).toBeVisible();
  await expect(reveal).toHaveText(/Graphic\s*Casualties\s*Tap to view/);
  await expect(page.getByRole("heading", { level: 2, name: FLOOD })).toHaveCount(0);
  await expect(swipe.tabs(page).getByRole("button", { name: "Graphic" })).toHaveAttribute("aria-current", "true");
  // The picture and the text are out of reach (inert), and double-tapping likes nothing.
  await expect(card.locator("[inert]")).toHaveCount(2);
  const box = (await card.boundingBox())!;
  await card.dblclick({ position: { x: 30, y: box.height / 2 + 120 } });
  await expect(swipe.rail(page).getByRole("button", { name: "Like", exact: true })).toHaveAttribute("aria-pressed", "false");

  // Tapped: the Item reads normally.
  await reveal.tap();
  await expect(reveal).toHaveCount(0);
  await expect(page.getByRole("article", { name: FLOOD })).toBeVisible();
  await expect(swipe.headline(page)).toHaveText(FLOOD);
  await expect(swipe.card(page).locator("[inert]")).toHaveCount(0);

  // Away and back: veiled again. The thirds still move past it without revealing it.
  await swipe.next(page);
  await expect(swipe.headline(page)).toHaveText("example/terminal-agent");
  await swipe.back(page);
  await expect(page.getByRole("button", { name: /Tap to view/ })).toBeVisible();
  await swipe.next(page);
  await expect(swipe.headline(page)).toHaveText("example/terminal-agent");
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
