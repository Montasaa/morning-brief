// Sign in from the browser the way a Reader does: the sign-in page emails a
// magic link (captured by the fake Resend in E2E_OUTBOX_FILE), then the page
// opens it. Leaves the page on the Brief, signed in.
//
// The database lives for the whole run, so the helper also puts the Reader's
// Interest Profile in a known state: a first-time Reader finishes onboarding
// following (and opted into) every Catalog Topic (so their Brief is the whole
// Edition), and the language is set back to English. Pass `{ onboard: false }` to land on
// onboarding instead, as a new Reader does.
import { existsSync, readFileSync } from "node:fs";
import { expect, type Page } from "@playwright/test";
import { E2E_BASE_PATH, E2E_OUTBOX_FILE, E2E_OWNER_EMAIL } from "../../playwright.config";

/** The newest magic link the fake Resend sent to `email`, or null. */
export function lastMagicLink(email: string): string | null {
  if (!existsSync(E2E_OUTBOX_FILE)) return null;
  const messages = readFileSync(E2E_OUTBOX_FILE, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as { to: string; text: string });
  for (const message of messages.reverse()) {
    if (message.to !== email.toLowerCase()) continue;
    const link = /https?:\/\/\S+\/api\/auth\/callback\?token=[\w-]+/.exec(message.text);
    if (link) return link[0];
  }
  return null;
}

/**
 * Sign `page` in as `email` (the Owner by default). `via: "api"` (the default)
 * asks for the link with a direct POST, which is quick and immune to dev-server
 * reloads; `via: "form"` types into the sign-in page like a person would.
 */
export async function signIn(
  page: Page,
  email: string = E2E_OWNER_EMAIL,
  { via = "api", onboard = true }: { via?: "api" | "form"; onboard?: boolean } = {},
): Promise<void> {
  const before = lastMagicLink(email);
  if (via === "form") {
    // A cold `next dev` may reload the page while it compiles; retry the submit until it lands.
    await expect(async () => {
      await page.goto(`${E2E_BASE_PATH}/sign-in`);
      await page.getByLabel("Email").fill(email);
      await page.getByRole("button", { name: "Email me a sign-in link" }).click();
      await expect(page.getByTestId("link-sent")).toBeVisible({ timeout: 5_000 });
    }).toPass({ timeout: 30_000 });
  } else {
    const res = await page.request.post(`${E2E_BASE_PATH}/api/auth/magic-link`, { data: { email } });
    expect(res.status()).toBe(200);
  }
  await expect.poll(() => lastMagicLink(email)).not.toBe(before);
  await page.goto(lastMagicLink(email)!);
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
