// Smoke tests for Reactions in the Swipe Brief at phone size (ticket 09, in the
// Reels look of rework ticket 08): the rail's Like and Save stay pressed,
// double-tapping the picture likes with a heart burst, and Hide asks why,
// takes the Item out and offers Undo. How Reactions change ranking is tested
// at the API seam. Uses its own invited Reader, so the Owner's Brief (and its
// order) stays whole for other specs.
import type { Page } from "@playwright/test";
import { E2E_BASE_PATH, E2E_PASSWORD, expect, postEdition, signIn, swipe, swipeEdition, test } from "./support";

const READER = "rania@example.com";
const TALKS = "me-yemen-port-talks";
const AI = "A new open-weights model tops the coding leaderboard";

const firstItem = async (page: Page) =>
  (await (await page.request.get(`${E2E_BASE_PATH}/api/brief`)).json()).items[0] as {
    reactions: { like: boolean; save: boolean };
  };

test.beforeEach(async ({ page }) => {
  await postEdition(page.request, swipeEdition());
  await signIn(page);
  // 201, or 409: already a Reader.
  await page.request.post(`${E2E_BASE_PATH}/api/invites`, { data: { email: READER, password: E2E_PASSWORD } });
  await signIn(page, READER);
  // The database lasts the whole run: start from no Reactions on the first Item.
  for (const kind of ["like", "save", "hide"]) {
    expect((await page.request.delete(`${E2E_BASE_PATH}/api/items/${TALKS}/reactions/${kind}`)).status()).toBe(200);
  }
});

test("the rail's Like and Save stay pressed, also after a reload", async ({ page }) => {
  await page.goto(E2E_BASE_PATH);
  await swipe.next(page);
  const rail = swipe.rail(page);
  await expect(rail.getByRole("button")).toHaveText(["Like", "Save", "Ask", "Hide"]);

  const like = rail.getByRole("button", { name: "Like", exact: true });
  const save = rail.getByRole("button", { name: "Save", exact: true });
  await expect(like).toHaveAttribute("aria-pressed", "false");
  await like.tap();
  await save.tap();
  await expect(like).toHaveAttribute("aria-pressed", "true");
  await expect(save).toHaveAttribute("aria-pressed", "true");
  await expect.poll(async () => (await firstItem(page)).reactions).toEqual({ like: true, save: true });

  await page.reload();
  await swipe.next(page);
  await expect(swipe.rail(page).getByRole("button", { name: "Like", exact: true })).toHaveAttribute("aria-pressed", "true");
  // Tapping again takes it back.
  await swipe.rail(page).getByRole("button", { name: "Save", exact: true }).tap();
  await expect(swipe.rail(page).getByRole("button", { name: "Save", exact: true })).toHaveAttribute("aria-pressed", "false");
  await expect.poll(async () => (await firstItem(page)).reactions.save).toBe(false);
});

test("double-tapping the picture likes the Item with a heart burst", async ({ page }) => {
  await page.goto(E2E_BASE_PATH);
  await swipe.next(page);
  const like = swipe.rail(page).getByRole("button", { name: "Like", exact: true });
  await expect(like).toHaveAttribute("aria-pressed", "false");

  // The middle third of the picture: the thirds above and below move instead.
  const card = swipe.card(page);
  const box = (await card.boundingBox())!;
  const middle = { x: box.width / 2 - 40, y: box.height / 2 };
  await card.tap({ position: middle });
  await expect(like).toHaveAttribute("aria-pressed", "false"); // one tap does nothing
  await page.waitForTimeout(500);
  await card.dblclick({ position: middle });
  await expect(page.getByTestId("like-burst")).toBeVisible();
  await expect(like).toHaveAttribute("aria-pressed", "true");
  await expect.poll(async () => (await firstItem(page)).reactions.like).toBe(true);
  // Still on the same Item.
  await expect(swipe.headline(page)).toHaveText("Truce talks resume over Hodeidah port access");

  // A second double-tap keeps it liked.
  await card.dblclick({ position: middle });
  await expect(like).toHaveAttribute("aria-pressed", "true");
});

test("Hide asks why, takes the Item out, and Undo brings it back", async ({ page }) => {
  await page.goto(E2E_BASE_PATH);
  await swipe.next(page);

  await swipe.rail(page).getByRole("button", { name: "Hide", exact: true }).tap();
  const sheet = page.getByRole("dialog", { name: "Why hide this?" });
  await expect(sheet).toContainText("Truce talks resume over Hodeidah port access");
  const reasons = sheet.getByRole("listitem").getByRole("button");
  await expect(reasons).toHaveText([/^Not interested/, /^Already seen/, /^Bad source/, /^Just hide/]);

  // Picking a reason takes the Item out of the Brief at once: the next one moves up.
  await reasons.filter({ hasText: "Not interested" }).tap();
  await expect(sheet).toHaveCount(0);
  await expect(swipe.headline(page)).toHaveText(AI);

  // Undo puts it back.
  const toast = page.getByRole("status").filter({ hasText: "Hidden" });
  await toast.getByRole("button", { name: "Undo", exact: true }).tap();
  await expect(swipe.headline(page)).toHaveText("Truce talks resume over Hodeidah port access");
  await expect(toast).toHaveCount(0);

  // Closing the sheet hides nothing.
  await swipe.rail(page).getByRole("button", { name: "Hide", exact: true }).tap();
  await page.getByRole("dialog", { name: "Why hide this?" }).getByRole("button", { name: "Close" }).tap();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(swipe.headline(page)).toHaveText("Truce talks resume over Hodeidah port access");

  // "Just hide", and the Item stays out of the next Brief.
  await swipe.rail(page).getByRole("button", { name: "Hide", exact: true }).tap();
  await page.getByRole("dialog", { name: "Why hide this?" }).getByRole("button", { name: /^Just hide/ }).tap();
  await expect(swipe.headline(page)).toHaveText(AI);
  await expect
    .poll(async () => (await (await page.request.get(`${E2E_BASE_PATH}/api/brief`)).json()).items.length)
    .toBe(6);
  await page.reload();
  await swipe.next(page);
  await expect(swipe.headline(page)).toHaveText(AI);
});
