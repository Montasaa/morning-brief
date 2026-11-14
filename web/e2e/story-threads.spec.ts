// Smoke test for Story Threads at phone size (ticket 14). What a Thread holds,
// and for whom, is tested at the API seam (test/api/threads.test.ts); this only
// checks the Thread chip and Follow on a card, the timeline, and the Threads tab.
import type { Page } from "@playwright/test";
import { E2E_BASE_PATH, expect, morningEdition, postEdition, signIn, swipeEdition, test } from "./support";

/** An older Edition with an earlier development on the Yemen truce Thread (posted first, so it never becomes the latest). */
function earlierEdition() {
  const edition = morningEdition();
  edition.edition_id = "2026-11-13-evening-threads";
  edition.kind = "evening";
  edition.generated_at = "2026-11-13T19:15:00+03:00";
  delete edition.top_stories;
  edition.items = [
    {
      id: "me-yemen-talks-announced",
      topics: ["yemen"],
      thread_id: "yemen-truce-talks",
      time: "2026-11-13T16:00:00+03:00",
      title: "Mediators announce a new round of truce talks",
      summary: "The talks are due to start overnight.",
      sources: [{ title: "Example Wire", url: "https://example.com/wire/announce", type: "wire" }],
    },
  ];
  return edition;
}

async function tap(page: Page, side: "Next" | "Back") {
  await page.getByRole("button", { name: side, exact: true }).tap({ position: { x: 40, y: 200 } });
}

test("a card on a Story Thread shows its chip; Follow sticks, the chip opens the timeline, and the Threads tab lists it", async ({
  page,
}) => {
  await postEdition(page.request, earlierEdition());
  await postEdition(page.request, swipeEdition());
  // Following a Thread changes this Reader's profile, so use a Reader of the test's own.
  await signIn(page);
  const invited = await page.request.post(`${E2E_BASE_PATH}/api/invites`, { data: { email: "hana@example.com" } });
  expect(invited.status(), await invited.text()).toBe(201);
  await signIn(page, "hana@example.com");

  await page.goto(E2E_BASE_PATH);
  await tap(page, "Next");
  await expect(page.getByRole("heading", { level: 2 })).toHaveText("Truce talks resume over Hodeidah port access");
  await expect(page.getByTestId("thread-chip")).toHaveText("Yemen truce talks · 2");

  const follow = page.getByRole("button", { name: "Follow Yemen truce talks" });
  await follow.tap();
  await expect(page.getByRole("button", { name: "Following Yemen truce talks" })).toHaveAttribute("aria-pressed", "true");

  // The next card has no Thread.
  await tap(page, "Next");
  await expect(page.getByTestId("thread-chip")).toHaveCount(0);
  await tap(page, "Back");

  await page.getByTestId("thread-chip").tap();
  await expect(page).toHaveURL(new RegExp(`${E2E_BASE_PATH}/threads/yemen-truce-talks$`));
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Yemen truce talks");
  await expect(page.getByRole("button", { name: "Following Yemen truce talks" })).toBeVisible();
  await expect(page.getByTestId("timeline-item").getByRole("heading", { level: 3 })).toHaveText([
    "Truce talks resume over Hodeidah port access",
    "Mediators announce a new round of truce talks",
  ]);
  await expect(page.getByRole("heading", { level: 2 })).toHaveText(["Saturday 14 November", "Friday 13 November"]);

  await page.getByRole("navigation", { name: "Tabs" }).getByRole("link", { name: "Threads" }).tap();
  await expect(page).toHaveURL(new RegExp(`${E2E_BASE_PATH}/threads$`));
  const following = page.getByRole("region", { name: "Following" });
  await expect(following.getByTestId("thread-row")).toHaveCount(1);
  await expect(following.getByRole("link", { name: /Yemen truce talks/ })).toBeVisible();
});
