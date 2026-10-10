// `npm run reset-pin`: forgot the parent PIN? Run this on the Raspberry Pi to clear it and turn Parental Lock off.
import { openDb } from "./db.js";
import { SettingsStore } from "./context.js";
import { loadConfig } from "./config.js";

const config = loadConfig();
const db = openDb(config.dbFile);
const settings = new SettingsStore(db);
settings.delete("pinHash");
settings.delete("pinFailures");
const lock = settings.get<Record<string, unknown> | null>("lock", null);
if (lock) settings.set("lock", { ...lock, enabled: false });
db.prepare("UPDATE sessions SET unlocked_until = NULL").run();
db.close();
console.log(`PIN cleared and Parental Lock turned off (${config.dbFile}).`);
console.log("Reload the Haven screen, then set a new PIN in Settings → Parental Lock.");
