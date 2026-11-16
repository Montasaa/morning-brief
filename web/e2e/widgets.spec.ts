// Smoke test for the Cover's Widgets at phone size (ticket 17), drawn as quiet rows (rework ticket 08). Which
// Widgets each Reader gets is tested at the API seam (test/api/widgets.test.ts);
// this only checks that they are drawn. The weather and prayer times are the fakes'.
import type { Page } from "@playwright/test";
import { E2E_BASE_PATH, E2E_PASSWORD, expect, postEdition, signIn, swipe, swipeEdition, test } from "./support";

const HOUR = 3_600_000;

/** A Reader the Owner invites, signed in on `page`, following `topics` and living in `city`. */
async function signInAs(page: Page, email: string, topics: string[], city: string | null) {
  await signIn(page);
  const invited = await page.request.post(`${E2E_BASE_PATH}/api/invites`, { data: { email, password: E2E_PASSWORD } });
  expect([201, 409]).toContain(invited.status());
  await signIn(page, email);
  const res = await page.request.patch(`${E2E_BASE_PATH}/api/me`, { data: { topics, city } });
  expect(res.status(), await res.text()).toBe(200);
}

test("the Cover shows weather, prayer times, the next match in local time and a countdown", async ({ page }) => {
  // The server decides what is still to come with the real clock, so the times are relative to now.
  const now = Date.now();
  const kickoff = new Date(Math.ceil((now + 2 * 24 * HOUR + 4 * HOUR) / HOUR) * HOUR + 30 * 60_000);
  const earnings = new Date(now + 6 * 24 * HOUR + 2 * HOUR);
  const edition = swipeEdition();
  edition.edition_id = "2026-11-14-morning-widgets";
  edition.generated_at = "2026-11-14T06:20:00+03:00";
  edition.widgets = {
    next_match: { team: "Liverpool", opponent: "Example Town", competition: "Premier League", kickoff: kickoff.toISOString() },
    countdowns: [
      { label: "Example Corp earnings", label_ar: "أرباح شركة مثال", at: earnings.toISOString(), topic: "us-markets" },
      { label: "Graphic thing", label_ar: "شيء", at: earnings.toISOString(), topic: "graphic" },
    ],
  };
  await postEdition(page.request, edition);
  await signInAs(page, "widgets-london@example.com", ["liverpool", "us-markets"], "London");
  await page.clock.setFixedTime(now);

  await page.goto(E2E_BASE_PATH);

  const cover = swipe.cover(page);
  const weather = cover.getByRole("group", { name: "Weather" });
  await expect(weather).toContainText("London");
  await expect(weather).toContainText("24°");
  await expect(cover.getByRole("group", { name: "Prayer times" })).toContainText("Maghrib");

  const match = cover.getByRole("group", { name: "Next match" });
  await expect(match).toContainText("Liverpool v Example Town");
  await expect(match).toContainText(/2d \dh/);
  const londonKickoff = kickoff.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Europe/London" });
  await expect(match.locator("time")).toContainText(londonKickoff);

  await expect(cover.getByRole("group", { name: "Example Corp earnings" })).toContainText("6d 2h");
  // Graphic is not followed, so its countdown is not shown.
  await expect(cover.getByRole("group", { name: "Graphic thing" })).toHaveCount(0);
});

test("a Reader with no city is sent to the Me tab to set one", async ({ page }) => {
  await postEdition(page.request, swipeEdition());
  await signInAs(page, "widgets-nocity@example.com", ["ai"], null);

  await page.goto(E2E_BASE_PATH);

  const cover = swipe.cover(page);
  await expect(cover.getByRole("group", { name: "Weather" })).toHaveCount(0);
  await expect(cover.getByRole("group", { name: "Next match" })).toHaveCount(0);
  await cover.getByRole("link", { name: "Set your city on the Me tab" }).tap();
  await expect(page.getByRole("heading", { level: 1, name: "Me" })).toBeVisible();
});
