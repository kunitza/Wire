import { openDb } from "./db.js";
import { Bus, SettingsStore, type Ctx } from "./context.js";
import { loadConfig } from "./config.js";
import { buildApp, startBackgroundJobs } from "./app.js";
import { ensureDefaults } from "./seed.js";

const config = loadConfig();
const db = openDb(config.dbFile);
const ctx: Ctx = { db, bus: new Bus(), settings: new SettingsStore(db), config, now: () => new Date() };
ensureDefaults(ctx);

const app = await buildApp(ctx);
await app.listen({ port: config.port, host: config.host });
console.log(`Kunitz Coven is running on http://${config.host === "0.0.0.0" ? "localhost" : config.host}:${config.port}`);
if (!config.disableBackground) startBackgroundJobs(ctx);

const shutdown = async () => {
  await app.close();
  db.close();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
