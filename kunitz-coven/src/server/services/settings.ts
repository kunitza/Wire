import crypto from "node:crypto";
import type { Ctx } from "../context.js";
import { hashSecret, verifySecret } from "../context.js";
import type { SessionInfo, Settings } from "../../shared/types.js";

/** Settings stored as individual keys so partial updates are simple. Secrets live under separate keys. */
export const DEFAULTS = {
  displayName: "",
  weekStartsOn: 0 as 0 | 1,
  clock24h: false,
  temperatureUnit: "fahrenheit" as const,
  location: null as Settings["location"],
  textSize: "medium" as const,
  density: "cozy" as const,
  theme: "light" as const,
  calendar: {
    defaultView: "week",
    scheduleDays: 5,
    weekStartsToday: false,
    monthStartsThisWeek: false,
    showCountdowns: "always",
    colorCodeMultiProfile: true,
    shadeWeekends: false,
    dimPastEvents: true,
    showTaskProgress: true,
    showWeather: true,
    showMeals: true,
    hiddenProfiles: [],
  } as Settings["calendar"],
  tasks: { hiddenProfiles: [], showCompleted: true, showLate: true, showSkipped: false, showUpForGrabs: true } as Settings["tasks"],
  home: { showTasks: true, showLists: true, calendarView: "schedule" } as Settings["home"],
  lock: { enabled: false, lockAdd: true, lockModify: true, relockMinutes: 3 },
  sleep: { enabled: false, start: "21:30", end: "06:30" },
  reminders: { eventsAtTime: true, eventsMinutesBefore: 15, tasksWhenDue: true, sound: true } as Settings["reminders"],
  funMode: true,
  rewardsNeedApproval: false,
  voice: { enabled: true, allowListAdd: false },
  ai: { monthlyBudgetUsd: 5 },
};

type Stored = typeof DEFAULTS;
type Key = keyof Stored;

function read<K extends Key>(ctx: Ctx, k: K): Stored[K] {
  const v = ctx.settings.get<Stored[K]>(k, DEFAULTS[k]);
  const d = DEFAULTS[k];
  // Merge objects so newly added fields get their defaults.
  if (d && typeof d === "object" && !Array.isArray(d) && v && typeof v === "object") return { ...d, ...v } as Stored[K];
  return v;
}

export function aiSpentThisMonth(ctx: Ctx): number {
  const month = ctx.now().toISOString().slice(0, 7);
  const row = ctx.db.prepare("SELECT COALESCE(SUM(cost_usd), 0) AS s FROM ai_usage WHERE month = ?").get(month) as { s: number };
  return Math.round(row.s * 100) / 100;
}

export function getSettings(ctx: Ctx): Settings {
  const lock = read(ctx, "lock");
  const voice = read(ctx, "voice");
  const email = ctx.settings.get<{ address?: string; host?: string } | null>("emailConfig", null);
  return {
    displayName: read(ctx, "displayName"),
    weekStartsOn: read(ctx, "weekStartsOn"),
    clock24h: read(ctx, "clock24h"),
    temperatureUnit: read(ctx, "temperatureUnit"),
    location: read(ctx, "location"),
    textSize: read(ctx, "textSize"),
    density: read(ctx, "density"),
    theme: read(ctx, "theme"),
    calendar: read(ctx, "calendar"),
    tasks: read(ctx, "tasks"),
    home: read(ctx, "home"),
    lock: { ...lock, hasPin: !!ctx.settings.get<string | null>("pinHash", null) },
    sleep: read(ctx, "sleep"),
    reminders: read(ctx, "reminders"),
    funMode: read(ctx, "funMode"),
    rewardsNeedApproval: read(ctx, "rewardsNeedApproval"),
    voice: { ...voice, tokenSet: !!ctx.settings.get<string | null>("voiceToken", null) },
    ai: {
      available: !!aiKey(ctx),
      model: ctx.config.aiModel,
      monthlyBudgetUsd: read(ctx, "ai").monthlyBudgetUsd,
      spentThisMonthUsd: aiSpentThisMonth(ctx),
    },
    email: {
      configured: !!email?.host,
      address: email?.address ?? null,
      lastCheck: ctx.settings.get<string | null>("emailLastCheck", null),
      lastError: ctx.settings.get<string | null>("emailLastError", null),
    },
  };
}

export function aiKey(ctx: Ctx): string | null {
  return ctx.settings.get<string | null>("anthropicApiKey", null) || ctx.config.anthropicApiKey;
}

const EDITABLE: Key[] = [
  "displayName",
  "weekStartsOn",
  "clock24h",
  "temperatureUnit",
  "location",
  "textSize",
  "density",
  "theme",
  "calendar",
  "tasks",
  "home",
  "lock",
  "sleep",
  "reminders",
  "funMode",
  "rewardsNeedApproval",
  "voice",
  "ai",
];

export function updateSettings(ctx: Ctx, patch: Record<string, unknown>) {
  if (patch.lock && (patch.lock as { enabled?: boolean }).enabled && !ctx.settings.get("pinHash", null))
    throw new Error("Set a PIN before turning on Parental Lock");
  for (const k of EDITABLE) {
    if (!(k in patch)) continue;
    const v = patch[k];
    const d = DEFAULTS[k];
    const isGroup = !!d && typeof d === "object" && !Array.isArray(d);
    // A group of settings (calendar, lock, ...) can only be patched with an object; anything else would break every screen.
    if (isGroup && (!v || typeof v !== "object" || Array.isArray(v))) throw new Error(`Invalid ${k} settings`);
    if (isGroup) {
      // Only known sub-keys are stored; computed fields (hasPin, tokenSet, ...) are dropped.
      const cur = read(ctx, k) as Record<string, unknown>;
      const next: Record<string, unknown> = { ...cur };
      for (const sub of Object.keys(d as object)) if (sub in (v as object)) next[sub] = (v as Record<string, unknown>)[sub];
      ctx.settings.set(k, next);
    } else {
      ctx.settings.set(k, v);
    }
  }
  ctx.bus.emit("settings");
}

// ---- Parental lock / sessions ----

/** Setting a new PIN also signs out every unlocked or "remembered" device, so an old PIN stops working everywhere. */
export function setPin(ctx: Ctx, pin: string) {
  if (!/^\d{4}$/.test(pin)) throw new Error("PIN must be 4 digits");
  ctx.settings.set("pinHash", hashSecret(pin));
  ctx.settings.delete("pinFailures");
  ctx.db.prepare("UPDATE sessions SET unlocked_until = NULL").run();
  ctx.bus.emit("settings");
}

export function checkPin(ctx: Ctx, pin: string): boolean {
  return verifySecret(pin, ctx.settings.get<string | null>("pinHash", null));
}

/** Wrong PINs allowed before a pause; each further batch doubles the pause (1, 2, 4 … 60 minutes). */
const PIN_TRIES = 5;

/**
 * Check a PIN typed on any screen, with a household-wide back-off so the 10,000 possible PINs can't
 * simply be tried one after another. Returns `{ ok }`, or `{ ok: false, retryInSeconds }` while paused.
 */
export function tryPin(ctx: Ctx, pin: string): { ok: boolean; retryInSeconds?: number } {
  const f = ctx.settings.get<{ count: number; until: string | null }>("pinFailures", { count: 0, until: null });
  const now = ctx.now();
  if (f.until && f.until > now.toISOString()) return { ok: false, retryInSeconds: Math.ceil((Date.parse(f.until) - now.getTime()) / 1000) };
  if (checkPin(ctx, pin)) {
    if (f.count) ctx.settings.delete("pinFailures");
    return { ok: true };
  }
  const count = f.count + 1;
  const pauseMinutes = count % PIN_TRIES === 0 ? Math.min(60, 2 ** (count / PIN_TRIES - 1)) : 0;
  ctx.settings.set("pinFailures", { count, until: pauseMinutes ? new Date(now.getTime() + pauseMinutes * 60000).toISOString() : null });
  return { ok: false };
}

export function newSessionToken(ctx: Ctx): string {
  const token = crypto.randomBytes(24).toString("base64url");
  ctx.db.prepare("INSERT INTO sessions (token, created_at) VALUES (?, ?)").run(token, ctx.now().toISOString());
  return token;
}

const TRUSTED = "9999-12-31T00:00:00.000Z";

export function sessionExists(ctx: Ctx, token: string): boolean {
  return !!ctx.db.prepare("SELECT 1 FROM sessions WHERE token = ?").get(token);
}

/** Unlock editing on this browser. `remember` trusts the device (e.g. a parent's phone) until locked again. */
export function unlockSession(ctx: Ctx, token: string, remember: boolean) {
  const lock = read(ctx, "lock");
  const until = remember ? TRUSTED : new Date(ctx.now().getTime() + lock.relockMinutes * 60000).toISOString();
  ctx.db.prepare("UPDATE sessions SET unlocked_until = ? WHERE token = ?").run(until, token);
}

/** Activity on an unlocked (non-trusted) screen pushes the re-lock timer back. */
export function touchSession(ctx: Ctx, token: string) {
  const row = ctx.db.prepare("SELECT unlocked_until FROM sessions WHERE token = ?").get(token) as { unlocked_until: string | null } | undefined;
  if (!row?.unlocked_until || row.unlocked_until === TRUSTED || row.unlocked_until < ctx.now().toISOString()) return;
  const lock = read(ctx, "lock");
  ctx.db
    .prepare("UPDATE sessions SET unlocked_until = ? WHERE token = ?")
    .run(new Date(ctx.now().getTime() + lock.relockMinutes * 60000).toISOString(), token);
}

export function lockSession(ctx: Ctx, token: string) {
  ctx.db.prepare("UPDATE sessions SET unlocked_until = NULL WHERE token = ?").run(token);
}

export function sessionInfo(ctx: Ctx, token: string | undefined): SessionInfo {
  const lock = read(ctx, "lock");
  const lockEnabled = lock.enabled && !!ctx.settings.get("pinHash", null);
  const row = token
    ? (ctx.db.prepare("SELECT unlocked_until FROM sessions WHERE token = ?").get(token) as { unlocked_until: string | null } | undefined)
    : undefined;
  const until = row?.unlocked_until ?? null;
  const unlocked = !!until && until > ctx.now().toISOString();
  return { canEdit: !lockEnabled || unlocked, lockEnabled, unlockedUntil: unlocked ? until : null };
}

/**
 * Whether an add (or modify) action is allowed for this browser under the lock settings. "admin" actions
 * (Parental Lock itself, secrets, backups) always need an unlocked browser while the lock is on.
 */
export function mayEdit(ctx: Ctx, token: string | undefined, action: "add" | "modify" | "admin"): boolean {
  const info = sessionInfo(ctx, token);
  if (info.canEdit) return true;
  if (action === "admin") return false;
  const lock = read(ctx, "lock");
  return action === "add" ? !lock.lockAdd : !lock.lockModify;
}

export function setVoiceToken(ctx: Ctx): string {
  const token = crypto.randomBytes(18).toString("base64url");
  ctx.settings.set("voiceToken", token);
  ctx.bus.emit("settings");
  return token;
}

export function voiceToken(ctx: Ctx): string | null {
  return ctx.settings.get<string | null>("voiceToken", null);
}
