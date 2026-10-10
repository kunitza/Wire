import { defineConfig } from "@playwright/test";

const PORT = 8199;
const DIR = "/tmp/haven-e2e";

export default defineConfig({
  testDir: "e2e",
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 1920, height: 1080 },
    launchOptions: { executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" },
    screenshot: "only-on-failure",
  },
  webServer: {
    // Fresh demo database each run, then serve the production build.
    command: `rm -rf ${DIR} && COVEN_DATA_DIR=${DIR} npx tsx src/server/seed.ts && COVEN_DATA_DIR=${DIR} COVEN_NO_BACKGROUND=1 PORT=${PORT} TZ=America/New_York node --disable-warning=ExperimentalWarning dist/server/index.js`,
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
