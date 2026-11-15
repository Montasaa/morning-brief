// Smoke test for the installable app and push settings (ticket 18). Who gets
// which push is tested at the API seam (test/api/push.test.ts); this checks the
// manifest and service worker are scoped to the base path, and that the Me
// tab's notification switches are saved. It never subscribes the browser: that
// would reach a real push service.
import { E2E_BASE_PATH, expect, postEdition, signIn, swipeEdition, test } from "./support";

test("the Brief is installable: a manifest and a service worker scoped to the base path", async ({ page }) => {
  await postEdition(page.request, swipeEdition());
  await signIn(page);

  const href = await page.locator('link[rel="manifest"]').getAttribute("href");
  expect(href).toBe(`${E2E_BASE_PATH}/manifest.webmanifest`);
  const manifest = await (await page.request.get(href!)).json();
  expect(manifest).toMatchObject({ start_url: E2E_BASE_PATH, scope: E2E_BASE_PATH, display: "standalone" });
  for (const icon of manifest.icons as { src: string }[]) {
    const res = await page.request.get(icon.src);
    expect(res.status(), icon.src).toBe(200);
    expect(res.headers()["content-type"]).toBe("image/png");
  }

  const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope);
  expect(new URL(scope).pathname).toBe(E2E_BASE_PATH);
});

test("the Me tab turns each kind of notification on or off, and it sticks", async ({ page }) => {
  await signIn(page);
  const invited = await page.request.post(`${E2E_BASE_PATH}/api/invites`, { data: { email: "push-reader@example.com" } });
  expect(invited.status(), await invited.text()).toBe(201);
  await signIn(page, "push-reader@example.com");

  await page.getByRole("link", { name: "Me", exact: true }).tap();
  await expect(page.getByRole("heading", { name: "Notifications" })).toBeVisible();
  const briefReady = page.getByRole("switch", { name: /Your Brief is ready/ });
  const threads = page.getByRole("switch", { name: /Story Thread updates/ });
  await expect(briefReady).not.toBeChecked();
  await expect(threads).not.toBeChecked();
  // Headless Chromium reports notifications as blocked; either way the device can be turned on from here.
  await expect(page.getByTestId("push-device-state")).toHaveAttribute("data-state", /^(off|blocked)$/);
  await expect(page.getByRole("button", { name: "Turn on for this device" })).toBeVisible();

  await threads.tap();
  await expect(threads).toBeChecked();

  await page.reload();
  await expect(page.getByRole("switch", { name: /Story Thread updates/ })).toBeChecked();
  await expect(page.getByRole("switch", { name: /Your Brief is ready/ })).not.toBeChecked();
});
