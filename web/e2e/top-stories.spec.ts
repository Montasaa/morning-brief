// Smoke test for top stories and why-lines at phone size (ticket 13; the Reels
// look, rework ticket 08). Which Items are picked is tested at the API seam;
// here the first Item, under the "For you" tab, carries its why-line (no
// badge), in English and in Arabic. The fake Claude picks the Edition's own
// top stories with a canned why-line.
import { E2E_BASE_PATH, expect, postEdition, signIn, swipe, swipeEdition, test } from "./support";

test("a top story leads the Brief under For you, with its why-line in the Reader's language", async ({ page }) => {
  await signIn(page);
  // Posted after the Owner is a Reader, so their top stories are picked for this Edition.
  await postEdition(page.request, swipeEdition());
  await page.goto(E2E_BASE_PATH);

  await swipe.next(page);
  await expect(swipe.headline(page)).toHaveText("Truce talks resume over Hodeidah port access");
  await expect(swipe.tabs(page).getByRole("button", { name: "For you" })).toHaveAttribute("aria-current", "true");
  await expect(swipe.card(page).getByTestId("why-for-you")).toContainText("One of today's biggest stories in your Topics.");

  await swipe.back(page);
  await swipe.cover(page).getByRole("button", { name: "العربية", exact: true }).tap();
  await swipe.next(page);
  await expect(swipe.card(page).getByTestId("why-for-you")).toContainText("من أهم أخبار اليوم في مواضيعك.");
});
