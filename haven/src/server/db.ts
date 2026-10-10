import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

export type DB = DatabaseSync;

const MIGRATIONS: string[] = [
  `
  CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);

  CREATE TABLE profiles (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    color TEXT NOT NULL,
    avatar TEXT NOT NULL DEFAULT '',
    kind TEXT NOT NULL DEFAULT 'profile',
    birthday TEXT,
    sort INTEGER NOT NULL DEFAULT 0,
    archived INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE calendars (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    profile_ids TEXT NOT NULL DEFAULT '[]',
    color TEXT,
    enabled INTEGER NOT NULL DEFAULT 1,
    last_sync TEXT,
    last_error TEXT
  );

  CREATE TABLE synced_events (
    calendar_id INTEGER NOT NULL REFERENCES calendars(id) ON DELETE CASCADE,
    key TEXT NOT NULL,
    title TEXT NOT NULL,
    all_day INTEGER NOT NULL,
    start TEXT NOT NULL,
    end TEXT NOT NULL,
    location TEXT,
    notes TEXT,
    PRIMARY KEY (calendar_id, key)
  );
  CREATE INDEX synced_events_start ON synced_events(start);

  CREATE TABLE events (
    id INTEGER PRIMARY KEY,
    title TEXT NOT NULL,
    all_day INTEGER NOT NULL DEFAULT 0,
    start TEXT NOT NULL,
    end TEXT NOT NULL,
    location TEXT,
    notes TEXT,
    profile_ids TEXT NOT NULL DEFAULT '[]',
    repeat TEXT NOT NULL DEFAULT '{"type":"none"}',
    repeat_until TEXT,
    exdates TEXT NOT NULL DEFAULT '[]',
    countdown INTEGER NOT NULL DEFAULT 0,
    emoji TEXT NOT NULL DEFAULT '',
    reminder_minutes INTEGER,
    import_id INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE tasks (
    id INTEGER PRIMARY KEY,
    kind TEXT NOT NULL DEFAULT 'chore',
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    emoji TEXT NOT NULL DEFAULT '',
    profile_ids TEXT NOT NULL DEFAULT '[]',
    stars INTEGER NOT NULL DEFAULT 0,
    repeat TEXT NOT NULL DEFAULT '{"type":"none"}',
    repeat_until TEXT,
    date TEXT,
    due_time TEXT,
    parts TEXT NOT NULL DEFAULT '[]',
    track_habit INTEGER NOT NULL DEFAULT 0,
    sort INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (date('now')),
    archived INTEGER NOT NULL DEFAULT 0
  );

  -- One row per finished (or skipped) task occurrence.
  CREATE TABLE completions (
    id INTEGER PRIMARY KEY,
    task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    occurrence TEXT NOT NULL, -- scheduled day (or 'once' for undated one-off chores)
    part TEXT NOT NULL DEFAULT '', -- routine part of day
    slot TEXT NOT NULL, -- assigned profile id as text, or 'up' for Up For Grabs
    day TEXT NOT NULL, -- day it was actually checked off
    profile_id INTEGER, -- who gets the credit
    status TEXT NOT NULL DEFAULT 'done', -- done | skipped
    stars INTEGER NOT NULL DEFAULT 0,
    completed_at TEXT NOT NULL,
    UNIQUE (task_id, occurrence, part, slot)
  );
  CREATE INDEX completions_day ON completions(day);

  CREATE TABLE rewards (
    id INTEGER PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    emoji TEXT NOT NULL DEFAULT '',
    cost INTEGER NOT NULL,
    profile_ids TEXT NOT NULL DEFAULT '[]',
    renew INTEGER NOT NULL DEFAULT 0,
    archived INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE redemptions (
    id INTEGER PRIMARY KEY,
    reward_id INTEGER NOT NULL REFERENCES rewards(id),
    profile_id INTEGER NOT NULL,
    stars INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'approved',
    created_at TEXT NOT NULL
  );

  CREATE TABLE star_adjustments (
    id INTEGER PRIMARY KEY,
    profile_id INTEGER NOT NULL,
    delta INTEGER NOT NULL,
    reason TEXT NOT NULL DEFAULT '',
    at TEXT NOT NULL
  );

  CREATE TABLE lists (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    color TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'other',
    hide_on_device INTEGER NOT NULL DEFAULT 0,
    sort INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE list_items (
    id INTEGER PRIMARY KEY,
    list_id INTEGER NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    section TEXT NOT NULL DEFAULT '',
    checked INTEGER NOT NULL DEFAULT 0,
    sort INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE meal_categories (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    color TEXT NOT NULL,
    visible INTEGER NOT NULL DEFAULT 1,
    show_on_calendar INTEGER NOT NULL DEFAULT 0,
    sort INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE recipes (
    id INTEGER PRIMARY KEY,
    title TEXT NOT NULL,
    emoji TEXT NOT NULL DEFAULT '',
    category_id INTEGER REFERENCES meal_categories(id) ON DELETE SET NULL,
    ingredients TEXT NOT NULL DEFAULT '[]',
    instructions TEXT NOT NULL DEFAULT '',
    source_url TEXT NOT NULL DEFAULT '',
    favorite INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE meals (
    id INTEGER PRIMARY KEY,
    date TEXT NOT NULL,
    category_id INTEGER NOT NULL REFERENCES meal_categories(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    recipe_id INTEGER REFERENCES recipes(id) ON DELETE SET NULL,
    notes TEXT NOT NULL DEFAULT '',
    repeat TEXT NOT NULL DEFAULT '{"type":"none"}',
    repeat_until TEXT,
    exdates TEXT NOT NULL DEFAULT '[]',
    sort INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX meals_date ON meals(date);

  CREATE TABLE imports (
    id INTEGER PRIMARY KEY,
    source TEXT NOT NULL,
    label TEXT NOT NULL,
    status TEXT NOT NULL,
    summary TEXT NOT NULL DEFAULT '',
    events TEXT NOT NULL DEFAULT '[]',
    created_event_ids TEXT NOT NULL DEFAULT '[]',
    error TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE ai_usage (
    id INTEGER PRIMARY KEY,
    month TEXT NOT NULL,
    feature TEXT NOT NULL,
    input_tokens INTEGER NOT NULL,
    output_tokens INTEGER NOT NULL,
    cost_usd REAL NOT NULL,
    at TEXT NOT NULL
  );

  CREATE TABLE sessions (
    token TEXT PRIMARY KEY,
    device TEXT NOT NULL DEFAULT 'device',
    unlocked_until TEXT,
    created_at TEXT NOT NULL
  );
  `,
  // v2: repeatable chores, kitchen timers
  `
  ALTER TABLE tasks ADD COLUMN max_per_day INTEGER NOT NULL DEFAULT 1;
  ALTER TABLE completions ADD COLUMN count INTEGER NOT NULL DEFAULT 1;
  CREATE TABLE timers (
    id INTEGER PRIMARY KEY,
    label TEXT NOT NULL,
    duration_sec INTEGER NOT NULL,
    ends_at TEXT,
    remaining_sec INTEGER,
    dismissed INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );
  `,
];

export function openDb(file: string): DB {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 3000;");
  migrate(db);
  return db;
}

function migrate(db: DB) {
  const row = db.prepare("PRAGMA user_version").get() as { user_version: number };
  let version = row.user_version;
  while (version < MIGRATIONS.length) {
    db.exec("BEGIN");
    try {
      db.exec(MIGRATIONS[version]);
      version++;
      db.exec(`PRAGMA user_version = ${version}`);
      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
  }
}

export function tx<T>(db: DB, fn: () => T): T {
  db.exec("BEGIN");
  try {
    const out = fn();
    db.exec("COMMIT");
    return out;
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

export const json = {
  parse<T>(s: string | null | undefined, fallback: T): T {
    if (!s) return fallback;
    try {
      return JSON.parse(s) as T;
    } catch {
      return fallback;
    }
  },
};
