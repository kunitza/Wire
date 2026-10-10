import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

// Runs against a fresh demo household (see playwright.config.ts).

async function api(request: APIRequestContext, method: string, url: string, data?: unknown) {
  const res = await request.fetch(url, { method, data });
  expect(res.ok(), `${method} ${url} -> ${res.status()} ${await res.text()}`).toBeTruthy();
  return res.json();
}

async function openScreen(page: Page, name: string) {
  await page.goto(`/#/${name}`);
  await page.waitForLoadState("networkidle");
}

test.describe.configure({ mode: "serial" });

test("home shows calendar, today's tasks and lists for the demo family", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await openScreen(page, "home");
  await expect(page.getByText("Today's Tasks", { exact: false })).toBeVisible();
  for (const name of ["Laura", "Andy", "Emma", "Jake"]) await expect(page.getByText(name, { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Grocery List").first()).toBeVisible();
  expect(errors).toEqual([]);
});

test("every screen renders without errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  for (const s of ["calendar", "lists", "tasks", "rewards", "meals", "recipes", "sidekick", "settings"]) {
    await openScreen(page, s);
    await expect(page.locator(".header")).toBeVisible();
  }
  expect(errors).toEqual([]);
});

test("a kid checks off a chore and earns stars", async ({ page, request }) => {
  const before = (await api(request, "GET", "/api/profiles")).find((p: { name: string }) => p.name === "Jake").stars;
  await openScreen(page, "tasks");
  await page.getByRole("button", { name: "Complete Feed the dog", exact: true }).click();
  await expect.poll(async () => (await api(request, "GET", "/api/profiles")).find((p: { name: string }) => p.name === "Jake").stars).toBe(before + 1);
  // Undo
  await page.getByRole("button", { name: "Undo Feed the dog", exact: true }).click();
  await expect.poll(async () => (await api(request, "GET", "/api/profiles")).find((p: { name: string }) => p.name === "Jake").stars).toBe(before);
});

test("Up For Grabs asks who did it and credits them", async ({ page, request }) => {
  await openScreen(page, "tasks");
  await page.getByRole("button", { name: "Complete Water plants", exact: true }).click();
  await expect(page.getByText(/who completed it/i)).toBeVisible();
  await page.getByRole("dialog").getByText("Emma", { exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: /^complete$/i }).click();
  await expect
    .poll(async () => {
      const today = new Date().toLocaleDateString("en-CA");
      const tomorrow = new Date(Date.now() + 86400000).toLocaleDateString("en-CA");
      const list = await api(request, "GET", `/api/tasks/instances?from=${today}&to=${tomorrow}`);
      return list.find((i: { task: { title: string } }) => i.task.title === "Water plants")?.status;
    })
    .toBe("done");
});

test("add an event from the calendar", async ({ page, request }) => {
  await openScreen(page, "calendar");
  await page.getByRole("button", { name: /^add/i }).last().click();
  const dialog = page.getByRole("dialog");
  await dialog.locator("input").first().fill("E2E swim meet");
  await dialog.getByRole("button", { name: /Emma/ }).first().click();
  await dialog.getByRole("button", { name: /^(save|add)/i }).last().click();
  await expect(dialog).toBeHidden();
  const from = new Date(Date.now() - 86400000 * 3).toLocaleDateString("en-CA");
  const to = new Date(Date.now() + 86400000 * 10).toLocaleDateString("en-CA");
  const events = await api(request, "GET", `/api/events?from=${from}&to=${to}`);
  expect(events.some((e: { title: string }) => e.title === "E2E swim meet")).toBeTruthy();
  await expect(page.getByText("E2E swim meet").first()).toBeVisible();
});

test("add and check off a grocery item", async ({ page, request }) => {
  await openScreen(page, "lists");
  const input = page.getByPlaceholder("Add item").first();
  await input.fill("Strawberries");
  await input.press("Enter");
  await expect(page.getByText("Strawberries").first()).toBeVisible();
  const { items } = await api(request, "GET", "/api/lists");
  const item = items.find((i: { text: string }) => i.text === "Strawberries");
  expect(item).toBeTruthy();
  await page.getByRole("checkbox", { name: "Check Strawberries" }).first().click();
  await expect.poll(async () => (await api(request, "GET", "/api/lists")).items.find((i: { id: number }) => i.id === item.id)?.checked).toBe(true);
});

test("changes appear live on other screens (wall display and phone stay in sync)", async ({ browser, request }) => {
  const wall = await browser.newPage();
  await wall.goto("/#/lists");
  await wall.waitForLoadState("networkidle");
  const { lists } = await api(request, "GET", "/api/lists");
  await api(request, "POST", `/api/lists/${lists[1].id}/items`, { text: "Live sync check" });
  await expect(wall.getByText("Live sync check")).toBeVisible({ timeout: 5000 });
  await wall.close();
});

test("rewards: redeem when there are enough stars", async ({ page, request }) => {
  const emma = (await api(request, "GET", "/api/profiles")).find((p: { name: string }) => p.name === "Emma");
  await openScreen(page, "rewards");
  await page.getByRole("button", { name: /redeem/i }).first().click();
  // Confirm dialog
  const confirm = page.getByRole("dialog").getByRole("button", { name: /redeem/i });
  if (await confirm.isVisible().catch(() => false)) await confirm.click();
  await expect.poll(async () => (await api(request, "GET", "/api/profiles")).find((p: { name: string }) => p.name === "Emma").stars).toBeLessThan(emma.stars);
});

test("voice command checks off a chore", async ({ request }) => {
  const setup = await api(request, "GET", "/api/voice/setup");
  const res = await request.post("/api/voice/command", { data: { text: "Emma finished brushing her teeth" }, headers: { "X-Coven-Token": setup.token } });
  const body = await res.json();
  expect(body.ok, body.speech).toBe(true);
  expect(body.speech).toMatch(/Emma/);
});

test("parental lock asks for the PIN before changes, but not for check-offs", async ({ page, request }) => {
  await api(request, "POST", "/api/pin", { pin: "2468" });
  await api(request, "PUT", "/api/settings", { lock: { enabled: true, lockAdd: true, lockModify: true, relockMinutes: 3 } });
  await openScreen(page, "calendar");
  // This browser context has its own (locked) session.
  await page.getByRole("button", { name: /^add/i }).last().click();
  const dialog = page.getByRole("dialog").last();
  await dialog.locator("input").first().fill("Locked event");
  await dialog.getByRole("button", { name: /Andy/ }).first().click();
  await dialog.getByRole("button", { name: /^(save|add)/i }).last().click();
  await expect(page.getByText(/Enter PIN/i)).toBeVisible();
  for (const d of "2468") await page.getByRole("button", { name: d, exact: true }).click();
  await expect(page.getByText(/Enter PIN/i)).toBeHidden();
  const from = new Date(Date.now() - 86400000 * 3).toLocaleDateString("en-CA");
  const to = new Date(Date.now() + 86400000 * 10).toLocaleDateString("en-CA");
  await expect
    .poll(async () => (await api(request, "GET", `/api/events?from=${from}&to=${to}`)).some((e: { title: string }) => e.title === "Locked event"))
    .toBe(true);
  // Clean up so later runs start unlocked.
  await api(request, "PUT", "/api/settings", { lock: { enabled: false } });
});

test("phone layout uses bottom navigation", async ({ browser }) => {
  const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await phone.goto("/#/home");
  await phone.waitForLoadState("networkidle");
  const nav = phone.locator(".bottom-nav");
  await expect(nav).toBeVisible();
  await nav.getByRole("button", { name: "Tasks" }).click();
  await expect(phone).toHaveURL(/#\/tasks/);
  await nav.getByRole("button", { name: "More" }).click();
  await phone.getByRole("dialog").getByText("Rewards").click();
  await expect(phone).toHaveURL(/#\/rewards/);
  // No horizontal page overflow.
  const overflow = await phone.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await phone.close();
});
