// Screenshot helper: node scripts/shot.mjs <url> <out.png> [width] [height] [clickSelector...]
// Uses the pre-installed Chromium.
import { chromium } from "@playwright/test";
import fs from "node:fs";

const [url, out, w = "1920", h = "1080", ...clicks] = process.argv.slice(2);
const exe = ["/opt/pw-browsers/chromium-1194/chrome-linux/chrome"].find((p) => fs.existsSync(p));
const browser = await chromium.launch({ executablePath: exe });
const page = await browser.newPage({ viewport: { width: Number(w), height: Number(h) }, deviceScaleFactor: 1 });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
await page.goto(url, { waitUntil: "networkidle" });
await page.waitForTimeout(600);
for (const sel of clicks) {
  await page.locator(sel).first().click();
  await page.waitForTimeout(500);
}
await page.screenshot({ path: out });
if (errors.length) console.log("Browser errors:\n" + errors.join("\n"));
await browser.close();
