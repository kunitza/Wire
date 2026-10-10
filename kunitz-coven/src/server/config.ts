import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Config } from "./context.js";

const here = path.dirname(fileURLToPath(import.meta.url));
// dist/server -> repo root, or src/server -> repo root.
const root = path.resolve(here, "..", "..");

export function loadConfig(env = process.env): Config {
  const dataDir = path.resolve(env.COVEN_DATA_DIR ?? path.join(root, "data"));
  return {
    port: Number(env.PORT ?? 8080),
    host: env.HOST ?? "0.0.0.0",
    dataDir,
    dbFile: path.join(dataDir, "coven.db"),
    webDir: path.resolve(env.COVEN_WEB_DIR ?? path.join(root, "dist", "web")),
    anthropicApiKey: env.ANTHROPIC_API_KEY || null,
    aiModel: env.COVEN_AI_MODEL || "claude-opus-5-5",
    displayOffCmd: env.COVEN_DISPLAY_OFF_CMD || null,
    displayOnCmd: env.COVEN_DISPLAY_ON_CMD || null,
    disableBackground: env.COVEN_NO_BACKGROUND === "1",
    allowedHosts: (env.COVEN_ALLOWED_HOSTS ?? "")
      .split(",")
      .map((h) => h.trim().toLowerCase())
      .filter(Boolean),
  };
}
