import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { E2E_BASE_PATH, E2E_INGEST_TOKEN } from "../playwright.config";

const fixture = JSON.parse(
  readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "test", "fixtures", "edition.morning.json"), "utf8"),
);

test("the bare Brief lists the latest Edition's Item titles, newest first", async ({ page, request }) => {
  const ingest = await request.post(`${E2E_BASE_PATH}/api/editions`, {
    data: fixture,
    headers: { authorization: `Bearer ${E2E_INGEST_TOKEN}` },
  });
  expect(ingest.status()).toBe(200);

  await page.goto(`${E2E_BASE_PATH}`);

  await expect(page.getByTestId("edition")).toHaveText("Morning Edition · 5 Items");
  await expect(page.getByRole("list", { name: "Brief" }).getByRole("listitem")).toHaveText([
    "Truce talks resume over Hodeidah port access",
    "Midfielder back in full training before the weekend",
    "A new open-weights model tops the coding leaderboard",
    "Flood aftermath leaves villages cut off",
    "example/terminal-agent",
  ]);
});
