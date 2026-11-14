// Smoke tests for Arabic and right-to-left at phone size (ticket 04).
import type { Page } from "@playwright/test";
import { E2E_BASE_PATH, expect, postEdition, signIn, swipeEdition, test } from "./support";

/** Tap the screen itself (not a named button) on the left or right side, up on the picture. */
async function tapSide(page: Page, side: "left" | "right") {
  const { width } = page.viewportSize()!;
  await page.touchscreen.tap(side === "left" ? 40 : width - 40, 200);
}

const html = (page: Page) => page.locator("html");

test.beforeEach(async ({ request, page }) => {
  await postEdition(request, swipeEdition());
  await signIn(page);
});

test("switching to Arabic on the Brief runs right to left, mirrors the taps and keeps the place", async ({ page }) => {
  await page.goto(E2E_BASE_PATH);
  await expect(html(page)).toHaveAttribute("dir", "ltr");

  // In English, the right side goes forward.
  await tapSide(page, "right");
  await tapSide(page, "right");
  await expect(page.getByTestId("chip")).toHaveText("AI · 2/7");

  // Switching language is instant: no page load and no data fetched again.
  // (The choice is saved to the Interest Profile with a PATCH, which loads nothing.)
  const loads: string[] = [];
  page.on("request", (r) => {
    if (["document", "fetch", "xhr"].includes(r.resourceType()) && r.method() === "GET") loads.push(r.url());
  });
  await page.getByRole("button", { name: "العربية", exact: true }).tap();

  await expect(html(page)).toHaveAttribute("dir", "rtl");
  await expect(html(page)).toHaveAttribute("lang", "ar");
  // Same Item, Arabic Topic name; this Item has no Arabic title, so the English one is shown.
  await expect(page.getByTestId("chip")).toHaveText("الذكاء الاصطناعي · ٢/٧");
  await expect(page.getByRole("heading", { level: 2 })).toHaveText(
    "A new open-weights model tops the coding leaderboard",
  );

  // In Arabic, the left side goes forward and the right side goes back.
  await tapSide(page, "left");
  await expect(page.getByTestId("chip")).toHaveText("ليفربول · ٣/٧");
  await expect(page.getByRole("heading", { level: 2 })).toHaveText(
    "لاعب الوسط يعود إلى التدريبات الكاملة قبل نهاية الأسبوع",
  );
  await expect(page.getByRole("article")).toContainText("أكد النادي أنه تدرب مع الفريق يوم الخميس.");
  await expect(page.getByText("محدَّث", { exact: true })).toBeVisible();
  await tapSide(page, "right");
  await expect(page.getByTestId("chip")).toHaveText("الذكاء الاصطناعي · ٢/٧");

  // The forward zone sits on the left half of the screen, the back zone on the right.
  const { width } = page.viewportSize()!;
  const next = (await page.getByRole("button", { name: "التالي", exact: true }).boundingBox())!;
  const back = (await page.getByRole("button", { name: "السابق", exact: true }).boundingBox())!;
  expect(next.x + next.width).toBeLessThanOrEqual(width / 2);
  expect(back.x).toBeGreaterThanOrEqual(width / 2);

  expect(loads).toEqual([]);

  // And back to English.
  await page.getByRole("button", { name: "English", exact: true }).tap();
  await expect(html(page)).toHaveAttribute("dir", "ltr");
  await expect(page.getByTestId("chip")).toHaveText("AI · 2/7");
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

  // The Brief: the cover card in Arabic, with an Arabic date.
  await tabs.getByRole("link", { name: "الموجز", exact: true }).tap();
  const cover = page.getByRole("region", { name: "بطاقة الغلاف" });
  await expect(cover.getByRole("heading", { level: 1 })).toContainText("نوفمبر");
  await expect(cover).toContainText("الطبعة الصباحية");
  await expect(cover.getByRole("group", { name: "مواقيت الصلاة" })).toBeVisible();
  await expect(page.getByRole("progressbar", { name: "الأهم لك", exact: true })).toBeVisible();

  // The first Item: Arabic title, its other Topic as an Arabic tag, the Arabic dock.
  await tapSide(page, "left");
  const card = page.getByRole("article");
  await expect(card.getByRole("heading", { level: 2 })).toHaveText("استئناف محادثات الهدنة بشأن الوصول إلى ميناء الحديدة");
  await expect(card.getByText("الأهم لك", { exact: true })).toBeVisible();
  await expect(card).toContainText("أيضًا في السعودية");
  const dock = page.getByRole("toolbar", { name: "التفاعلات" });
  for (const name of ["إخفاء", "حفظ", "أعجبني", "اسأل"]) {
    await expect(dock.getByRole("button", { name, exact: true })).toBeVisible();
  }

  // The sensitive Item carries its Arabic warning; GitHub Trending its Arabic why-it-matters line.
  for (let i = 0; i < 4; i++) await tapSide(page, "left");
  await expect(page.getByTestId("chip")).toHaveText("مشاهد قاسية · ٥/٧");
  await expect(card).toContainText("ضحايا");
  await tapSide(page, "left");
  await expect(card).toContainText("يعمل دون اتصال بالكامل.");

  // The end of the Brief.
  await tapSide(page, "left");
  await tapSide(page, "left");
  await expect(page.getByRole("heading", { name: "انتهيت من الموجز" })).toBeVisible();
  await expect(page.getByText("الطبعة القادمة الساعة ١٩:١٥")).toBeVisible();
});
