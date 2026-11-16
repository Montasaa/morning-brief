// Sign in from the browser the way a Reader does: an email and a password
// (E2E_PASSWORD unless told otherwise). Leaves the page on the Brief, signed in.
// The Owner chose E2E_PASSWORD on the first visit (e2e/first-visit.setup.ts);
// if that project was skipped, the helper chooses it the same way.
//
// The database lives for the whole run, so the helper also puts the Reader's
// Interest Profile in a known state: a first-time Reader finishes onboarding
// following (and opted into) every Catalog Topic (so their Brief is the whole
// Edition), and the language is set back to English. Pass `{ onboard: false }` to land on
// onboarding instead, as a new Reader does.
import { expect, type Page } from "@playwright/test";
import { E2E_BASE_PATH, E2E_OWNER_EMAIL, E2E_PASSWORD } from "../../playwright.config";

/**
 * Sign `page` in as `email` (the Owner by default). `via: "api"` (the default)
 * posts to the sign-in endpoint directly, which is quick and immune to dev-server
 * reloads; `via: "form"` types into the sign-in page like a person would.
 */
export async function signIn(
  page: Page,
  email: string = E2E_OWNER_EMAIL,
  {
    via = "api",
    onboard = true,
    password = E2E_PASSWORD,
  }: { via?: "api" | "form"; onboard?: boolean; password?: string } = {},
): Promise<void> {
  if (via === "form") {
    // A cold `next dev` may reload the page while it compiles; retry the submit until it lands.
    await expect(async () => {
      await page.goto(`${E2E_BASE_PATH}/sign-in`);
      await page.getByLabel("Email", { exact: true }).fill(email);
      await page.getByLabel("Password", { exact: true }).fill(password);
      await page.getByRole("button", { name: "Sign in", exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`${E2E_BASE_PATH}(/onboarding)?$`), { timeout: 5_000 });
    }).toPass({ timeout: 30_000 });
  } else {
    let res = await page.request.post(`${E2E_BASE_PATH}/api/auth/sign-in`, { data: { email, password } });
    if (res.status() === 401 && email === E2E_OWNER_EMAIL) {
      res = await page.request.post(`${E2E_BASE_PATH}/api/auth/first-password`, {
        data: { email, password, confirm_password: password },
      });
    }
    expect(res.status(), await res.text()).toBe(200);
    await page.goto(E2E_BASE_PATH);
  }
  if (!onboard) {
    await expect(page).toHaveURL(new RegExp(`${E2E_BASE_PATH}/onboarding$`));
    return;
  }
  await expect(page).toHaveURL(new RegExp(`${E2E_BASE_PATH}(/onboarding)?$`));
  await resetProfile(page);
  if (page.url().endsWith("/onboarding")) await page.goto(E2E_BASE_PATH);
  await expect(page).toHaveURL(new RegExp(`${E2E_BASE_PATH}$`));
}

/**
 * English, and onboarded following every Catalog Topic if this Reader had not
 * finished onboarding. Sensitive Topics cannot be picked in onboarding, so they
 * are opted into afterwards as the Me tab does (with the 18+ confirmation).
 */
async function resetProfile(page: Page): Promise<void> {
  const me = await page.request.get(`${E2E_BASE_PATH}/api/me`);
  expect(me.status()).toBe(200);
  const patch: Record<string, unknown> = { language: "en" };
  let optIns: string[] = [];
  if (!(await me.json()).onboarded) {
    const catalog = (await (await page.request.get(`${E2E_BASE_PATH}/api/topics`)).json()).topics as {
      id: string;
      sensitive: boolean;
    }[];
    patch.topics = catalog.filter((t) => !t.sensitive).map((t) => t.id);
    patch.onboarded = true;
    optIns = catalog.filter((t) => t.sensitive).map((t) => t.id);
  }
  const res = await page.request.patch(`${E2E_BASE_PATH}/api/me`, { data: patch });
  expect(res.status(), await res.text()).toBe(200);
  for (const id of optIns) {
    const optIn = await page.request.post(`${E2E_BASE_PATH}/api/topics/${id}/follow`, { data: { age_confirmed: true } });
    expect(optIn.status(), await optIn.text()).toBe(200);
  }
}
