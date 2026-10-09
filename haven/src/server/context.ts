import crypto from "node:crypto";
import type { DB } from "./db.js";
import type { ChangeTopic } from "../shared/types.js";

export interface Config {
  port: number;
  host: string;
  dataDir: string;
  dbFile: string;
  webDir: string;
  anthropicApiKey: string | null;
  aiModel: string;
  displayOffCmd: string | null;
  displayOnCmd: string | null;
  /** Disable background timers (calendar sync, weather, email) - used by tests. */
  disableBackground: boolean;
}

type Listener = (topics: ChangeTopic[]) => void;

/** Tiny pub/sub used to push "something changed" notifications to open screens over SSE. */
export class Bus {
  private listeners = new Set<Listener>();
  private pending = new Set<ChangeTopic>();
  private timer: NodeJS.Timeout | null = null;

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit(...topics: ChangeTopic[]) {
    for (const t of topics) this.pending.add(t);
    if (this.timer) return;
    // Coalesce bursts of writes into a single notification.
    this.timer = setTimeout(() => {
      const list = [...this.pending];
      this.pending.clear();
      this.timer = null;
      for (const l of this.listeners) l(list);
    }, 25);
  }

  get size() {
    return this.listeners.size;
  }
}

export class SettingsStore {
  constructor(private db: DB) {}

  get<T>(key: string, fallback: T): T {
    const row = this.db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
    if (!row) return fallback;
    try {
      return JSON.parse(row.value) as T;
    } catch {
      return fallback;
    }
  }

  set(key: string, value: unknown) {
    this.db
      .prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
      .run(key, JSON.stringify(value));
  }

  delete(key: string) {
    this.db.prepare("DELETE FROM settings WHERE key = ?").run(key);
  }
}

export interface Ctx {
  db: DB;
  bus: Bus;
  settings: SettingsStore;
  config: Config;
  now: () => Date;
}

export function hashSecret(secret: string, salt = crypto.randomBytes(16).toString("hex")): string {
  const hash = crypto.scryptSync(secret, salt, 32).toString("hex");
  return `${salt}:${hash}`;
}

export function verifySecret(secret: string, stored: string | null | undefined): boolean {
  if (!stored) return false;
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const test = crypto.scryptSync(secret, salt, 32);
  const expected = Buffer.from(hash, "hex");
  return expected.length === test.length && crypto.timingSafeEqual(expected, test);
}
