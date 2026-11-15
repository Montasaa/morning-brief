// Smoke tests for Arabic and right-to-left at phone size (ticket 04; the
// Swipe Brief in the Reels look, rework ticket 08): only the horizontal parts
// mirror (the Topic tabs and their indicator); moving stays vertical.
import type { Page } from "@playwright/test";
import { E2E_BASE_PATH, expect, postEdition, signIn, swipe, swipeEdition, test } from "./support";

const html = (page: Page) => page.locator("html");

test.beforeEach(async ({ request, page }) => {
  await postEdition(request, swipeEdition());
  await signIn(page);
});

test("switching to Arabic on the Cover runs right to left at once, with mirrored Topic tabs", async ({ page }) => {
  await page.goto(E2E_BASE_PATH);
  await expect(html(page)).toHaveAttribute("dir", "ltr");

  // Switching language is instant: no page load and no data fetched again.
  // (The choice is saved to the Interest Profile with a PATCH, which loads nothing.)
  const loads: string[] = [];
  page.on("request", (r) => {
    if (["document", "fetch", "xhr"].includes(r.resourceType()) && r.method() === "GET") loads.push(r.url());
  });
  await swipe.cover(page).getByRole("button", { name: "العربية", exact: true }).tap();

  await expect(html(page)).toHaveAttribute("dir", "rtl");
  await expect(html(page)).toHaveAttribute("lang", "ar");
  await expect(swipe.cover(page)).toContainText("صباح الخير");

  // The tabs run right to left: "For you" is the rightmost, and it is the current one.
  const tabs = swipe.tabs(page);
  const forYou = tabs.getByRole("button", { name: "لك", exact: true });
  const liverpool = tabs.getByRole("button", { name: "ليفربول", exact: true });
  await expect(forYou).toHaveAttribute("aria-current", "true");
  const a = (await forYou.boundingBox())!;
  const b = (await liverpool.boundingBox())!;
  expect(a.x).toBeGreaterThan(b.x);

  // Moving is still vertical: the lower third goes forward.
  await swipe.next(page);
  await swipe.next(page);
  // This Item has no Arabic title, so the English one is shown; its Topic is in Arabic.
  await expect(swipe.headline(page)).toHaveText("A new open-weights model tops the coding leaderboard");
  await expect(swipe.card(page)).toContainText("الذكاء الاصطناعي");
  await swipe.next(page);
  await expect(swipe.headline(page)).toHaveText("لاعب الوسط يعود إلى التدريبات الكاملة قبل نهاية الأسبوع");
  await expect(swipe.card(page)).toContainText("أكد النادي أنه تدرب مع الفريق يوم الخميس.");
  await expect(swipe.card(page)).toContainText("محدَّث");
  await expect(liverpool).toHaveAttribute("aria-current", "true");
  await swipe.back(page);
  await expect(swipe.card(page)).toContainText("الذكاء الاصطناعي");
  // The keys too.
  await page.keyboard.press("j");
  await expect(swipe.headline(page)).toHaveText("لاعب الوسط يعود إلى التدريبات الكاملة قبل نهاية الأسبوع");

  expect(loads).toEqual([]);

  // And back to English, from the Cover.
  await tabs.getByRole("button", { name: "لك", exact: true }).tap();
  await page.keyboard.press("k");
  await swipe.cover(page).getByRole("button", { name: "English", exact: true }).tap();
  await expect(html(page)).toHaveAttribute("dir", "ltr");
});

test("choosing Arabic on the Me tab changes every screen and lasts across reloads", async ({ page }) => {
  await page.goto(`${E2E_BASE_PATH}/me`);
  await page.getByRole("radio", { name: "العربية" }).check();

  await expect(html(page)).toHaveAttribute("dir", "rtl");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("أنا");
  const tabs = page.getByRole("navigation", { name: "التبويبات" });
  for (const name of ["الموجز", "القصص المتواصلة", "المحفوظ والبحث", "أنا"]) {
    await expect(tabs.getByRole("link", { name, exact: true })).toBeVisible();
  }

  await page.reload();
  await expect(html(page)).toHaveAttribute("dir", "rtl");
  await expect(page.getByRole("radio", { name: "العربية" })).toBeChecked();

  await tabs.getByRole("link", { name: "القصص المتواصلة", exact: true }).tap();
  await expect(page.getByRole("heading", { level: 1, name: "القصص المتواصلة" })).toBeVisible();

  // The Brief: the Cover in Arabic, with an Arabic date.
  await tabs.getByRole("link", { name: "الموجز", exact: true }).tap();
  const cover = swipe.cover(page);
  await expect(cover.getByRole("heading", { level: 1 })).toContainText("نوفمبر");
  await expect(cover).toContainText("الطبعة الصباحية");
  // The Widgets in Arabic: weather for the Reader's city, or the link to set one (ticket 17).
  await expect(
    cover.getByRole("group", { name: "الطقس" }).or(cover.getByRole("link", { name: "اختر مدينتك من تبويب «أنا»" })),
  ).toBeVisible();
  await expect(swipe.tabs(page).getByRole("button", { name: "لك", exact: true })).toBeVisible();

  // The first Item: Arabic title and the Arabic rail; its other Topic is in the read sheet.
  await swipe.next(page);
  await expect(swipe.headline(page)).toHaveText("استئناف محادثات الهدنة بشأن الوصول إلى ميناء الحديدة");
  const rail = swipe.rail(page);
  await expect(rail.getByRole("button")).toHaveText(["أعجبني", "حفظ", "اسأل", "إخفاء"]);
  await swipe.headline(page).tap();
  const sheet = page.getByRole("dialog", { name: "استئناف محادثات الهدنة بشأن الوصول إلى ميناء الحديدة" });
  await expect(sheet).toContainText("أيضًا في السعودية");
  await expect(sheet.getByRole("heading", { name: "المصادر" })).toBeVisible();
  await sheet.getByRole("button", { name: "إغلاق" }).tap();

  // The sensitive Item's veil carries the Arabic Topic name and warning.
  for (let i = 0; i < 4; i++) await swipe.next(page);
  await expect(page.getByRole("button", { name: /اضغط للعرض/ })).toContainText("مشاهد قاسية");
  await expect(page.getByRole("button", { name: /اضغط للعرض/ })).toContainText("ضحايا");
  // GitHub Trending's Arabic why-it-matters line is in its read sheet.
  await swipe.next(page);
  await swipe.headline(page).tap();
  await expect(page.getByRole("dialog")).toContainText("يعمل دون اتصال بالكامل.");
  await page.keyboard.press("Escape");

  // The end of the Brief.
  await swipe.next(page);
  await swipe.next(page);
  await expect(page.getByRole("heading", { name: "انتهيت من الموجز" })).toBeVisible();
  await expect(page.getByText("الطبعة القادمة الساعة ١٩:١٥")).toBeVisible();
  await expect(page.getByRole("button", { name: "العودة إلى البداية" })).toBeVisible();
});
