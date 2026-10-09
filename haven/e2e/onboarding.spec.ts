import { expect, test } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";

// First run on an empty database: the setup wizard creates the family and lands on Home.
const PORT = 8197;
const DIR = "/tmp/haven-e2e-empty";
let server: ChildProcess;

test.beforeAll(async () => {
  fs.rmSync(DIR, { recursive: true, force: true });
  server = spawn("node", ["--disable-warning=ExperimentalWarning", "dist/server/index.js"], {
    env: { ...process.env, HAVEN_DATA_DIR: DIR, HAVEN_NO_BACKGROUND: "1", PORT: String(PORT) },
    stdio: "ignore",
  });
  for (let i = 0; i < 80; i++) {
    try {
      if ((await fetch(`http://localhost:${PORT}/api/health`)).ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("server did not start");
});
test.afterAll(() => server?.kill());

test("setup wizard creates the family and opens Home", async ({ page }) => {
  await page.goto(`http://localhost:${PORT}/`);
  await page.getByRole("button", { name: /set up your family hub/i }).click();
  const names = page.getByPlaceholder("Name");
  await names.first().fill("Andy");
  await page.getByRole("button", { name: /add (another|someone|person)/i }).first().click().catch(() => undefined);
  if ((await names.count()) > 1) await names.nth(1).fill("Emma");
  // Walk through the remaining optional steps.
  for (let i = 0; i < 8; i++) {
    const start = page.getByRole("button", { name: /start using haven/i });
    if (await start.isVisible().catch(() => false)) {
      await start.click();
      break;
    }
    const skip = page.locator(".ob-skip");
    if (await skip.isVisible().catch(() => false)) await skip.click();
    else await page.locator(".ob-foot .pill.primary").click();
    await page.waitForTimeout(200);
  }
  await expect(page.getByText("Today's Tasks", { exact: false })).toBeVisible({ timeout: 10000 });
  await expect(page.getByText("Andy", { exact: true }).first()).toBeVisible();
  const profiles = await (await fetch(`http://localhost:${PORT}/api/profiles`)).json();
  expect(profiles.map((p: { name: string }) => p.name)).toContain("Andy");
});
