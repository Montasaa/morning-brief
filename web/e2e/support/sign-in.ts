// Sign in from the browser the way a Reader does: the sign-in page emails a
// magic link (captured by the fake Resend in E2E_OUTBOX_FILE), then the page
// opens it. Leaves the page on the Brief, signed in.
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
  { via = "api" }: { via?: "api" | "form" } = {},
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
  await expect(page).toHaveURL(new RegExp(`${E2E_BASE_PATH}$`));
}
