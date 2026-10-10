import type { Ctx } from "../context.js";
import type { KitchenTimer } from "../../shared/types.js";

// Kitchen timers live on the server so a timer set by voice or on a phone rings on the wall display.

interface Row {
  id: number;
  label: string;
  duration_sec: number;
  ends_at: string | null;
  remaining_sec: number | null;
  created_at: string;
}

export class TimerError extends Error {}

const MAX_SEC = 24 * 3600;

function toTimer(r: Row, now: Date): KitchenTimer {
  const remaining = r.ends_at ? Math.max(0, Math.round((new Date(r.ends_at).getTime() - now.getTime()) / 1000)) : (r.remaining_sec ?? 0);
  return {
    id: r.id,
    label: r.label,
    durationSec: r.duration_sec,
    endsAt: r.ends_at,
    remainingSec: remaining,
    running: !!r.ends_at,
    done: !!r.ends_at && remaining === 0,
    createdAt: r.created_at,
  };
}

export function listTimers(ctx: Ctx): KitchenTimer[] {
  const now = ctx.now();
  const rows = ctx.db.prepare("SELECT * FROM timers WHERE dismissed = 0 ORDER BY id").all() as unknown as Row[];
  return rows.map((r) => toTimer(r, now)).sort((a, b) => Number(b.done) - Number(a.done) || a.remainingSec - b.remainingSec);
}

function get(ctx: Ctx, id: number): KitchenTimer {
  const r = ctx.db.prepare("SELECT * FROM timers WHERE id = ? AND dismissed = 0").get(id) as Row | undefined;
  if (!r) throw new TimerError("Timer not found");
  return toTimer(r, ctx.now());
}

export function createTimer(ctx: Ctx, seconds: number, label?: string): KitchenTimer {
  const sec = Math.round(Number(seconds));
  if (!(sec >= 1 && sec <= MAX_SEC)) throw new TimerError("Timers can be from 1 second to 24 hours");
  const name = (label ?? "").trim().slice(0, 40) || defaultLabel(sec);
  const now = ctx.now();
  const res = ctx.db
    .prepare("INSERT INTO timers (label, duration_sec, ends_at, created_at) VALUES (?, ?, ?, ?)")
    .run(name, sec, new Date(now.getTime() + sec * 1000).toISOString(), now.toISOString());
  ctx.bus.emit("timers");
  return get(ctx, Number(res.lastInsertRowid));
}

export function defaultLabel(sec: number): string {
  return `${formatDuration(sec)} timer`;
}

export function formatDuration(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const parts: string[] = [];
  if (h) parts.push(`${h} hour${h === 1 ? "" : "s"}`);
  if (m) parts.push(`${m} minute${m === 1 ? "" : "s"}`);
  if (s && !h) parts.push(`${s} second${s === 1 ? "" : "s"}`);
  return parts.join(" ") || "0 seconds";
}

export function pauseTimer(ctx: Ctx, id: number): KitchenTimer {
  const t = get(ctx, id);
  if (t.running && !t.done) {
    ctx.db.prepare("UPDATE timers SET ends_at = NULL, remaining_sec = ? WHERE id = ?").run(t.remainingSec, id);
    ctx.bus.emit("timers");
  }
  return get(ctx, id);
}

export function resumeTimer(ctx: Ctx, id: number): KitchenTimer {
  const t = get(ctx, id);
  if (!t.running && t.remainingSec > 0) {
    ctx.db
      .prepare("UPDATE timers SET ends_at = ?, remaining_sec = NULL WHERE id = ?")
      .run(new Date(ctx.now().getTime() + t.remainingSec * 1000).toISOString(), id);
    ctx.bus.emit("timers");
  }
  return get(ctx, id);
}

/** Add (or remove, with a negative number) time. Adding to a finished timer restarts it. */
export function addTime(ctx: Ctx, id: number, seconds: number): KitchenTimer {
  const t = get(ctx, id);
  const remaining = Math.min(MAX_SEC, Math.max(0, t.remainingSec + Math.round(seconds)));
  if (t.running || t.done) {
    ctx.db
      .prepare("UPDATE timers SET ends_at = ?, duration_sec = MAX(duration_sec, ?) WHERE id = ?")
      .run(new Date(ctx.now().getTime() + remaining * 1000).toISOString(), remaining, id);
  } else {
    ctx.db.prepare("UPDATE timers SET remaining_sec = ? WHERE id = ?").run(remaining, id);
  }
  ctx.bus.emit("timers");
  return get(ctx, id);
}

/** Cancel a running timer or dismiss a ringing one. */
export function dismissTimer(ctx: Ctx, id: number) {
  ctx.db.prepare("UPDATE timers SET dismissed = 1 WHERE id = ?").run(id);
  ctx.bus.emit("timers");
}

/** Find a timer by (part of) its label, for voice. */
export function findTimer(ctx: Ctx, words: string): KitchenTimer | null {
  const all = listTimers(ctx);
  const w = words.toLowerCase().replace(/\btimer\b/g, "").trim();
  if (!w) return all.length === 1 ? all[0] : null;
  return all.find((t) => t.label.toLowerCase().includes(w)) ?? null;
}
