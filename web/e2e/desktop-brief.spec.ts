// Smoke tests for the Brief on a PC-sized screen (1280×720; rework ticket 09).
// With no pick, a PC opens in Front Page: the Cover as a header, the top
// stories, then a shelf per Topic, with the sidebar beside them. Clicking an
// Item opens the same Reels card in the reader pane, which j/k move through
// the Brief. List and Swipe are a pick away.
import type { Page } from "@playwright/test";
import { E2E_BASE_PATH, expect, frontPage, postEdition, signIn, swipe, swipeEdition, test } from "./support";

/** The swipe Edition in Brief order: the 2 top stories, then one Item per Topic. */
const TITLES = [
  "Truce talks resume over Hodeidah port access",
  "A new open-weights model tops the coding leaderboard",
  "Midfielder back in full training before the weekend",
  "Fed minutes point to a pause",
  // The Graphic Item: blurred until tapped.
  "Flood aftermath leaves villages cut off",
  "example/terminal-agent",
  "A grid tactics sequel gets a release date",
];
const TOPICS = ["Liverpool", "US Markets", "Graphic", "GitHub Trending", "Turn-based RPG & Tactics"];

/** Pick a Layout for the PC through the API (null takes the pick back). */
async function pickPc(page: Page, layout: string | null) {
  const res = await page.request.patch(`${E2E_BASE_PATH}/api/me`, { data: { display: { layouts: { pc: layout } } } });
  expect(res.status(), await res.text()).toBe(200);
}

test.beforeEach(async ({ request, page }) => {
  await signIn(page);
  // Posted once the Owner is a Reader, so their top stories (with why-lines) are picked for it.
  await postEdition(request, swipeEdition());
  await pickPc(page, null);
});

test("a PC opens in Front Page: the Cover header, the top stories and a shelf per Topic, beside the sidebar", async ({ page }) => {
  await page.goto(E2E_BASE_PATH);

  const cover = swipe.cover(page);
  await expect(cover.getByText(/^Good (morning|evening)$/)).toBeVisible();
  await expect(cover.getByText(/Morning Edition · 7 Items/)).toBeVisible();

  // Up to 3 top stories, in one row, with their why-lines.
  const forYou = frontPage.group(page, "For you");
  await expect(forYou.getByRole("article")).toHaveCount(2);
  await expect(forYou.getByTestId("why-for-you").first()).toBeVisible();
  const [a, b] = [(await forYou.getByRole("article").nth(0).boundingBox())!, (await forYou.getByRole("article").nth(1).boundingBox())!];
  expect(Math.abs(a.y - b.y)).toBeLessThan(2);
  expect(b.x).toBeGreaterThan(a.x + a.width);

  // A shelf per Topic, in Brief order; then the Owner's followed Topics with nothing in this Edition, which say so.
  const groups = page.getByRole("region").filter({ has: page.getByRole("heading", { level: 2 }) });
  await expect(groups.filter({ hasNot: page.getByTestId("nothing-qualified") }).getByRole("heading", { level: 2 })).toHaveText(
    ["For you", ...TOPICS],
  );
  await expect(frontPage.group(page, "Iran").getByTestId("nothing-qualified")).toBeVisible();
  await expect(frontPage.group(page, "Liverpool").getByRole("article")).toHaveCount(1);
  await expect(frontPage.open(page, TITLES[2]!)).toBeVisible();

  // The sidebar replaces the bottom tabs, and lists the Topics with their Item counts.
  const sidebar = frontPage.sidebar(page);
  await expect(sidebar.getByRole("link", { name: "Brief" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Tabs" })).toBeHidden();
  await expect(sidebar.getByRole("button", { name: /^US Markets\s*1$/ })).toBeVisible();
  // A sensitive Item keeps its headline blurred until tapped: no button opens it yet.
  await expect(frontPage.open(page, TITLES[4]!)).toHaveCount(0);
});

test("clicking a card opens it in the reader pane; j/k move through the Brief, and it dims once opened", async ({ page }) => {
  await page.goto(E2E_BASE_PATH);
  await expect(frontPage.pane(page)).toHaveCount(0);

  await frontPage.open(page, TITLES[2]!).click();
  const pane = frontPage.pane(page);
  await expect(frontPage.paneHeadline(page)).toHaveText(TITLES[2]!);
  await expect(pane.getByTestId("pane-position")).toHaveText("3 / 7");
  // The same Reels card as Swipe, rail included, beside the page.
  await expect(pane.getByRole("toolbar", { name: "Actions" })).toBeVisible();
  const card = frontPage.group(page, "Liverpool").getByRole("article");
  expect((await pane.boundingBox())!.x).toBeGreaterThanOrEqual((await frontPage.group(page, "Liverpool").boundingBox())!.x + 100);
  await expect(card).toHaveAttribute("data-selected", "true");

  await page.keyboard.press("j");
  await expect(frontPage.paneHeadline(page)).toHaveText(TITLES[3]!);
  await expect(pane.getByTestId("pane-position")).toHaveText("4 / 7");
  // The one read before is now dimmed, and no longer the selected one.
  await expect(card).toHaveAttribute("data-dimmed", "true");
  await expect(card).not.toHaveAttribute("data-selected");
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("k");
  await expect(frontPage.paneHeadline(page)).toHaveText(TITLES[1]!);
  await expect(pane.getByTestId("pane-position")).toHaveText("2 / 7");

  // The open was recorded, so it survives a reload.
  await expect
    .poll(async () => (await (await page.request.get(`${E2E_BASE_PATH}/api/brief`)).json()).items.find((i: { id: string }) => i.id === "lfc-midfielder-fitness").dimmed)
    .toBe(true);
  await page.reload();
  await expect(frontPage.group(page, "Liverpool").getByRole("article")).toHaveAttribute("data-dimmed", "true");

  // Esc closes the pane.
  await frontPage.open(page, TITLES[0]!).click();
  await expect(pane).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(pane).toHaveCount(0);
});

test("a, l and s act on the Item in the pane; Ask opens inside it, and Esc goes back to the card, then closes", async ({ page }) => {
  await page.goto(E2E_BASE_PATH);
  await frontPage.open(page, TITLES[0]!).click();
  const pane = frontPage.pane(page);

  await page.keyboard.press("s");
  await expect(pane.getByRole("button", { name: "Save" })).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("s");
  await expect(pane.getByRole("button", { name: "Save" })).toHaveAttribute("aria-pressed", "false");

  await page.keyboard.press("l");
  await expect(pane.getByRole("button", { name: "Like" })).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("l");
  await expect(pane.getByRole("button", { name: "Like" })).toHaveAttribute("aria-pressed", "false");

  await page.keyboard.press("a");
  // Ask is in the pane, not a sheet over the page.
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const ask = pane.getByRole("region", { name: "Ask Claude" });
  await expect(ask.getByRole("textbox", { name: "Your question" })).toBeFocused();
  await expect(ask.getByText(TITLES[0]!)).toBeVisible();
  // Typing there types; it does not move the pane.
  await page.keyboard.type("jk");
  await expect(ask.getByRole("textbox", { name: "Your question" })).toHaveValue("jk");

  await pane.getByRole("button", { name: "Back to the story" }).click();
  await expect(frontPage.paneHeadline(page)).toHaveText(TITLES[0]!);

  // The rail's Ask opens it too; Esc goes back to the card, then closes the pane.
  await pane.getByRole("button", { name: "Ask" }).click();
  await expect(ask).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(frontPage.paneHeadline(page)).toHaveText(TITLES[0]!);
  await page.keyboard.press("Escape");
  await expect(pane).toHaveCount(0);
});

test("the sidebar's Topics and the Topic tabs jump to a shelf; hovering a shelf shows its buttons", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 600 });
  await page.goto(E2E_BASE_PATH);
  const tabs = swipe.tabs(page);
  await expect(tabs.getByRole("button", { name: "For you" })).toHaveAttribute("aria-current", "true");

  await frontPage.sidebar(page).getByRole("button", { name: /^Turn-based RPG & Tactics/ }).click();
  await expect(frontPage.group(page, "Turn-based RPG & Tactics").getByRole("heading", { level: 2 })).toBeInViewport();
  await expect(tabs.getByRole("button", { name: "Turn-based RPG & Tactics" })).toHaveAttribute("aria-current", "true");

  await tabs.getByRole("button", { name: "Liverpool" }).click();
  await expect(frontPage.group(page, "Liverpool").getByRole("heading", { level: 2 })).toBeInViewport();
  await expect(tabs.getByRole("button", { name: "Liverpool" })).toHaveAttribute("aria-current", "true");

  // Hovering a shelf shows its back and forward buttons.
  const shelf = frontPage.group(page, "Liverpool");
  await shelf.hover();
  await expect(shelf.getByRole("button", { name: "Scroll Liverpool forward" })).toBeVisible();
  await expect(shelf.getByRole("button", { name: "Scroll Liverpool back" })).toBeVisible();
});

test("List shows the top stories, then rows under Topic headings, and the pick survives a reload", async ({ page }) => {
  await page.goto(E2E_BASE_PATH);
  await frontPage.layouts(page).getByRole("radio", { name: "List" }).check();

  const forYou = frontPage.group(page, "For you");
  await expect(forYou.getByRole("article")).toHaveCount(2);
  await expect(page.getByRole("article").first()).toContainText(TITLES[0]!);
  for (const topic of TOPICS) await expect(frontPage.group(page, topic).getByRole("heading", { level: 2 })).toBeVisible();
  // One line each, however long.
  const headline = frontPage.open(page, TITLES[1]!);
  const { height } = (await headline.boundingBox())!;
  expect(height).toBeLessThan(30);
  // Rows open the pane too.
  await headline.click();
  await expect(frontPage.paneHeadline(page)).toHaveText(TITLES[1]!);

  await page.reload();
  await expect(frontPage.layouts(page).getByRole("radio", { name: "List" })).toBeChecked();
  await expect(frontPage.group(page, "Liverpool").getByRole("article")).toHaveCount(1);
  // Back to Front Page.
  await frontPage.layouts(page).getByRole("radio", { name: "Front Page" }).check();
  await expect(frontPage.group(page, "For you").getByTestId("why-for-you").first()).toBeVisible();
  await page.reload();
  await expect(frontPage.layouts(page).getByRole("radio", { name: "Front Page" })).toBeChecked();
});

test("a sensitive card keeps its headline blurred until tapped, then opens like any other", async ({ page }) => {
  await page.goto(E2E_BASE_PATH);
  const graphic = frontPage.group(page, "Graphic");
  await expect(frontPage.open(page, TITLES[4]!)).toHaveCount(0);

  // Moving onto it with j shows it veiled in the pane.
  await frontPage.open(page, TITLES[3]!).click();
  await page.keyboard.press("j");
  await expect(frontPage.pane(page).getByRole("button", { name: /Tap to view/ })).toBeVisible();
  await page.keyboard.press("Escape");

  // Tapped open on the page, it opens unveiled: the Reader has already chosen to see it.
  await graphic.getByRole("button", { name: /Tap to view/ }).click();
  await frontPage.open(page, TITLES[4]!).click();
  await expect(frontPage.paneHeadline(page)).toHaveText(TITLES[4]!);
  await expect(frontPage.pane(page).getByRole("button", { name: /Tap to view/ })).toHaveCount(0);
});

// Rework ticket 10's veils and note, in ticket 09's Layouts.
test("explicit media keeps its own veil on a card, in List and in the pane, even with the blur off", async ({ page, baseURL }) => {
  const NSFW = "A placeholder post with explicit media";
  // Newer than any Edition earlier specs posted (the widgets spec's is 06:20), so it is the one shown.
  const edition = { ...swipeEdition(), edition_id: "2026-11-14-morning-nsfw", generated_at: "2026-11-14T06:30:00+03:00" };
  edition.items.push({
    id: "adult-placeholder-post",
    topics: ["adult-trending"],
    time: "2026-11-13T12:00:00+03:00",
    title: NSFW,
    summary: "Placeholder text.",
    sources: [{ title: "r/placeholder", url: "https://www.reddit.com/r/placeholder/comments/x1/placeholder/", type: "social" }],
    image: new URL(`${E2E_BASE_PATH}/icons/icon-512.png`, baseURL).href,
    image_kind: "photo",
    nsfw_media: true,
    warning: "Adult content",
  });
  await postEdition(page.request, edition);
  expect((await page.request.patch(`${E2E_BASE_PATH}/api/me`, { data: { display: { unblurred: ["adult-trending"] } } })).status()).toBe(200);
  try {
    await page.goto(E2E_BASE_PATH);
    const card = frontPage.group(page, "Adult Trending").getByRole("article");
    await expect(card).toHaveAttribute("data-media-locked", "true");
    // The headline shows and still opens it; the pane keeps the picture veiled too.
    await frontPage.open(page, NSFW).click();
    await expect(frontPage.paneHeadline(page)).toHaveText(NSFW);
    await expect(frontPage.pane(page).getByTestId("media-veil")).toBeVisible();
    // Tapped open on the card, only the card's veil goes.
    await card.getByTestId("media-veil").click();
    await expect(card).not.toHaveAttribute("data-media-locked", "true");

    // A List row's thumbnail never shows it.
    await frontPage.layouts(page).getByRole("radio", { name: "List" }).check();
    const row = frontPage.group(page, "Adult Trending").getByRole("article");
    await expect(row).toHaveAttribute("data-picture", "none");
    await expect(row.locator("img")).toHaveCount(0);
  } finally {
    await page.request.patch(`${E2E_BASE_PATH}/api/me`, { data: { display: { unblurred: null, layouts: { pc: null } } } });
    // Later tests see the swipe Edition again: an even newer copy of it.
    await postEdition(page.request, { ...swipeEdition(), edition_id: "2026-11-14-morning-after-nsfw", generated_at: "2026-11-14T06:31:00+03:00" });
  }
});

test("a Brief of only Sensitive Items shows the nothing-to-show note in the Cover header of Front Page and List", async ({ page }) => {
  const invited = await page.request.post(`${E2E_BASE_PATH}/api/invites`, { data: { email: "only-graphic@example.com" } });
  expect(invited.status(), await invited.text()).toBe(201);
  await signIn(page, "only-graphic@example.com", { onboard: false });
  expect((await page.request.patch(`${E2E_BASE_PATH}/api/me`, { data: { topics: ["ai"], onboarded: true } })).status()).toBe(200);
  expect((await page.request.post(`${E2E_BASE_PATH}/api/topics/graphic/follow`)).status()).toBe(200);
  expect((await page.request.post(`${E2E_BASE_PATH}/api/topics/ai/unfollow`)).status()).toBe(200);

  await page.goto(E2E_BASE_PATH);
  await expect(swipe.cover(page).getByTestId("nothing-to-show")).toBeVisible();
  // Its Items follow, veiled.
  await expect(frontPage.group(page, "Graphic").getByRole("button", { name: /Tap to view/ })).toBeVisible();
  await frontPage.layouts(page).getByRole("radio", { name: "List" }).check();
  await expect(swipe.cover(page).getByTestId("nothing-to-show")).toBeVisible();
  await expect(frontPage.group(page, "Graphic").getByRole("button", { name: /Tap to view/ })).toBeVisible();
});

test("? lists the shortcuts, and / goes to Saved & Search with the search box focused", async ({ page }) => {
  await page.goto(E2E_BASE_PATH);
  await expect(frontPage.group(page, "For you")).toBeVisible();
  await page.keyboard.press("?");
  const list = page.getByRole("dialog", { name: "Keyboard shortcuts" });
  await expect(list.getByText("Ask Claude")).toBeVisible();
  // While it is open the Brief's keys wait.
  await page.keyboard.press("j");
  await expect(frontPage.pane(page)).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(list).toHaveCount(0);

  await page.keyboard.press("/");
  await expect(page).toHaveURL(/\/saved#search$/);
  await expect(page.getByRole("searchbox", { name: "Search every Edition" })).toBeFocused();
});

test("in Arabic the page is mirrored: the sidebar on the right, the pane on the left, shelves right to left", async ({ page }) => {
  await page.goto(E2E_BASE_PATH);
  await swipe.cover(page).getByRole("button", { name: "العربية", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");

  const sidebar = frontPage.sidebar(page);
  const group = frontPage.group(page, "ليفربول");
  await expect(group).toBeVisible();
  expect((await sidebar.boundingBox())!.x).toBeGreaterThan((await group.boundingBox())!.x);
  // A shelf starts at its right-hand edge.
  const shelfCard = (await group.getByRole("article").boundingBox())!;
  const groupBox = (await group.boundingBox())!;
  expect(groupBox.x + groupBox.width - (shelfCard.x + shelfCard.width)).toBeLessThan(8);

  await frontPage.open(page, "لاعب الوسط يعود إلى التدريبات الكاملة قبل نهاية الأسبوع").click();
  const pane = frontPage.pane(page);
  await expect(pane.getByTestId("pane-position")).toHaveText("٣ / ٧");
  await expect(async () => expect((await pane.boundingBox())!.x).toBeLessThan(1)).toPass();
  await page.keyboard.press("j");
  await expect(pane.getByTestId("pane-position")).toHaveText("٤ / ٧");
  await page.keyboard.press("Escape");
  await swipe.cover(page).getByRole("button", { name: "English", exact: true }).click();
});

test("a tablet opens Swipe upright and Front Page sideways, until the Reader picks one for tablets", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto(E2E_BASE_PATH);
  await expect(frontPage.group(page, "For you")).toBeVisible();
  await expect(frontPage.sidebar(page)).toBeVisible();

  await page.setViewportSize({ width: 768, height: 1024 });
  await expect(swipe.cover(page).getByRole("radio", { name: "Swipe" })).toBeChecked();
  await expect(frontPage.group(page, "For you")).toHaveCount(0);
  // Upright, the bottom tabs are back.
  await expect(page.getByRole("navigation", { name: "Tabs" })).toBeVisible();
  await expect(frontPage.sidebar(page)).toBeHidden();

  // Picking List on the tablet holds in both orientations.
  await frontPage.layouts(page).getByRole("radio", { name: "List" }).check();
  await expect(frontPage.group(page, "For you")).toBeVisible();
  await page.setViewportSize({ width: 1024, height: 768 });
  await expect(frontPage.layouts(page).getByRole("radio", { name: "List" })).toBeChecked();
  await page.setViewportSize({ width: 768, height: 1024 });
  await expect(frontPage.layouts(page).getByRole("radio", { name: "List" })).toBeChecked();

  // A PC keeps its own (default) Layout.
  await page.setViewportSize({ width: 1280, height: 720 });
  await expect(frontPage.layouts(page).getByRole("radio", { name: "Front Page" })).toBeChecked();
  const res = await page.request.patch(`${E2E_BASE_PATH}/api/me`, { data: { display: { layouts: { tablet: null } } } });
  expect(res.status()).toBe(200);
});

// A Reader can pick Swipe for their PC: the card centred with the rail beside it, and "Up next"
// and the Widgets ("Today") at the end side, beside the sidebar.
test.describe("Swipe on a PC", () => {
  /** As Up next lists them: the Graphic Item by its warning, not its title. */
  const SWIPE_TITLES = TITLES.map((title, i) => (i === 4 ? "Sensitive Item: Casualties" : title));

  const upNext = (page: Page) => page.getByRole("complementary", { name: "Up next" });
  const row = (page: Page, title: string) => upNext(page).getByRole("button", { name: new RegExp(title.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")) });

  test.beforeEach(async ({ page }) => {
    await pickPc(page, "swipe");
  });

  test("the card sits in the middle with the rail beside it, and Up next lists what comes", async ({ page }) => {
    await page.goto(E2E_BASE_PATH);
    const cover = swipe.cover(page);
    await expect(cover).toBeVisible();

    // The Cover card is centred in the space between the sidebar and Up next.
    const list = (await upNext(page).boundingBox())!;
    const card = (await cover.boundingBox())!;
    const side = (await frontPage.sidebar(page).boundingBox())!;
    expect(Math.abs(card.x + card.width / 2 - (side.x + side.width + list.x) / 2)).toBeLessThan(4);
    // Up next starts with the first Items, and the Widgets are there too.
    for (const title of SWIPE_TITLES.slice(0, 5)) await expect(row(page, title)).toBeVisible();
    await expect(upNext(page).getByRole("heading", { name: "Today" })).toBeVisible();
    await expect(page.getByRole("region", { name: "End of the Brief" })).toHaveCount(0);

    // On an Item the rail sits beside the card, not over it.
    await page.keyboard.press("j");
    await expect(swipe.headline(page)).toHaveText(SWIPE_TITLES[0]!);
    const rail = (await swipe.rail(page).boundingBox())!;
    const headline = (await swipe.headline(page).boundingBox())!;
    expect(rail.x).toBeGreaterThan(headline.x + headline.width);
    expect(rail.x + rail.width).toBeLessThanOrEqual(list.x);
    // Up next moved on.
    await expect(row(page, SWIPE_TITLES[0]!)).toHaveCount(0);
    await expect(row(page, SWIPE_TITLES[1]!)).toBeVisible();
  });

  test("clicking an Up next row jumps to it; the sensitive one stays veiled and unnamed", async ({ page }) => {
    await page.goto(E2E_BASE_PATH);
    await row(page, SWIPE_TITLES[4]!).click();
    await expect(page.getByRole("button", { name: /Tap to view/ })).toBeVisible();
    await expect(swipe.tabs(page).getByRole("button", { name: "Graphic" })).toHaveAttribute("aria-current", "true");
    await page.getByRole("button", { name: /Tap to view/ }).click();
    await expect(swipe.headline(page)).toHaveText("Flood aftermath leaves villages cut off");
    await expect(upNext(page).getByText("Flood aftermath leaves villages cut off")).toHaveCount(0);

    await row(page, SWIPE_TITLES[6]!).click();
    await expect(swipe.headline(page)).toHaveText(SWIPE_TITLES[6]!);
    // The tap thirds work with a mouse too.
    await page.getByRole("button", { name: "Back", exact: true }).click({ position: { x: 20, y: 60 } });
    await expect(swipe.headline(page)).toHaveText(SWIPE_TITLES[5]!);
  });

  test("the keys move one Item at a time, but not while typing in an input", async ({ page }) => {
    await page.goto(E2E_BASE_PATH);
    await expect(swipe.cover(page)).toBeVisible();

    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("j");
    await expect(swipe.headline(page)).toHaveText(SWIPE_TITLES[1]!);
    await page.keyboard.press("k");
    await expect(swipe.headline(page)).toHaveText(SWIPE_TITLES[0]!);
    // Enter opens the read sheet; while it is open the keys stay with it.
    await page.keyboard.press("Enter");
    const sheet = page.getByRole("dialog", { name: SWIPE_TITLES[0]! });
    await expect(sheet).toBeVisible();
    await page.keyboard.press("j");
    await page.keyboard.press("Escape");
    await expect(sheet).toHaveCount(0);
    await expect(swipe.headline(page)).toHaveText(SWIPE_TITLES[0]!);

    // Typing in an input moves its caret, not the Brief.
    await page.evaluate(() => {
      const input = document.createElement("input");
      input.setAttribute("aria-label", "Scratch input");
      document.body.append(input);
    });
    const input = page.getByRole("textbox", { name: "Scratch input" });
    await input.focus();
    await page.keyboard.press("j");
    await page.keyboard.press("ArrowDown");
    await expect(input).toHaveValue("j");
    await expect(swipe.headline(page)).toHaveText(SWIPE_TITLES[0]!);
    await input.blur();
    await page.keyboard.press("j");
    await expect(swipe.headline(page)).toHaveText(SWIPE_TITLES[1]!);
  });

  test("in Arabic, Up next sits on the left", async ({ page }) => {
    await page.goto(E2E_BASE_PATH);
    await swipe.cover(page).getByRole("button", { name: "العربية", exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");

    const list = page.getByRole("complementary", { name: "التالي" });
    await expect(list.getByRole("button", { name: /لاعب الوسط يعود إلى التدريبات الكاملة/ })).toBeVisible();
    const card = (await swipe.cover(page).boundingBox())!;
    const box = (await list.boundingBox())!;
    expect(box.x + box.width).toBeLessThanOrEqual(card.x);

    await page.keyboard.press("j");
    await expect(swipe.headline(page)).toHaveText("استئناف محادثات الهدنة بشأن الوصول إلى ميناء الحديدة");
    await page.keyboard.press("k");
    await swipe.cover(page).getByRole("button", { name: "English", exact: true }).click();
  });
});
