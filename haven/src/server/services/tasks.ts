import type { Ctx } from "../context.js";
import { json } from "../db.js";
import { addDays, addMonths, eachDay, localDateOf, occursOn } from "../../shared/dates.js";
import type { DayPart, Repeat, Task, TaskInstance, TaskKind } from "../../shared/types.js";

interface Row {
  id: number;
  kind: TaskKind;
  title: string;
  description: string;
  emoji: string;
  profile_ids: string;
  stars: number;
  repeat: string;
  repeat_until: string | null;
  date: string | null;
  due_time: string | null;
  parts: string;
  track_habit: number;
  sort: number;
  created_at: string;
}

function toTask(r: Row): Task & { createdAt: string } {
  return {
    id: r.id,
    kind: r.kind,
    title: r.title,
    description: r.description,
    emoji: r.emoji,
    profileIds: json.parse<number[]>(r.profile_ids, []),
    stars: r.stars,
    repeat: json.parse<Repeat>(r.repeat, { type: "none" }),
    repeatUntil: r.repeat_until,
    date: r.date,
    dueTime: r.due_time,
    parts: json.parse<DayPart[]>(r.parts, []),
    trackHabit: !!r.track_habit,
    sort: r.sort,
    createdAt: r.created_at,
  };
}

export class TaskError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

export function listTasks(ctx: Ctx): Task[] {
  const rows = ctx.db.prepare("SELECT * FROM tasks WHERE archived = 0 ORDER BY sort, id").all() as unknown as Row[];
  return rows.map(toTask).map(({ createdAt: _c, ...t }) => t);
}

function listTaskRows(ctx: Ctx) {
  return (ctx.db.prepare("SELECT * FROM tasks WHERE archived = 0 ORDER BY sort, id").all() as unknown as Row[]).map(toTask);
}

export function getTask(ctx: Ctx, id: number): Task | null {
  const r = ctx.db.prepare("SELECT * FROM tasks WHERE id = ? AND archived = 0").get(id) as Row | undefined;
  if (!r) return null;
  const { createdAt: _c, ...t } = toTask(r);
  return t;
}

export type TaskInput = Omit<Task, "id" | "sort">;

const ALL_PARTS: DayPart[] = ["morning", "afternoon", "evening"];

function normalize(input: TaskInput, today: string): TaskInput {
  const t = { ...input };
  t.title = (t.title ?? "").trim();
  if (!t.title) throw new TaskError("Title is required");
  t.stars = Math.max(0, Math.min(500, Math.round(Number(t.stars) || 0)));
  t.profileIds = [...new Set(t.profileIds ?? [])];
  t.repeat = t.repeat ?? { type: "none" };
  t.description = t.description ?? "";
  t.emoji = t.emoji ?? "";
  t.trackHabit = !!t.trackHabit;
  t.repeatUntil = t.repeatUntil || null;
  t.dueTime = t.dueTime || null;
  if (t.kind === "routine") {
    if (!t.profileIds.length) throw new TaskError("Routines need at least one person");
    t.parts = (t.parts ?? []).filter((p) => ALL_PARTS.includes(p));
    if (!t.parts.length) t.parts = ["morning"];
    if (t.repeat.type === "none" || t.repeat.type === "afterCompletion") t.repeat = { type: "daily", interval: 1 };
    t.date = t.date || today;
    t.dueTime = null;
  } else {
    t.parts = [];
    t.trackHabit = false;
    // A repeating chore needs an anchor day.
    if (t.repeat.type !== "none" && !t.date) t.date = today;
    if (!t.date) t.dueTime = null;
  }
  return t;
}

export function createTask(ctx: Ctx, raw: TaskInput): Task {
  const input = normalize(raw, localDateOf(ctx.now()));
  const sort = (ctx.db.prepare("SELECT COALESCE(MAX(sort), 0) + 1 AS s FROM tasks").get() as { s: number }).s;
  const res = ctx.db
    .prepare(
      `INSERT INTO tasks (kind, title, description, emoji, profile_ids, stars, repeat, repeat_until, date, due_time,
                          parts, track_habit, sort, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.kind,
      input.title,
      input.description,
      input.emoji,
      JSON.stringify(input.profileIds),
      input.stars,
      JSON.stringify(input.repeat),
      input.repeatUntil,
      input.date,
      input.dueTime,
      JSON.stringify(input.parts),
      input.trackHabit ? 1 : 0,
      sort,
      localDateOf(ctx.now()),
    );
  ctx.bus.emit("tasks");
  return getTask(ctx, Number(res.lastInsertRowid))!;
}

export function updateTask(ctx: Ctx, id: number, patch: Partial<TaskInput>): Task | null {
  const cur = getTask(ctx, id);
  if (!cur) return null;
  const input = normalize({ ...cur, ...patch }, localDateOf(ctx.now()));
  ctx.db
    .prepare(
      `UPDATE tasks SET kind = ?, title = ?, description = ?, emoji = ?, profile_ids = ?, stars = ?, repeat = ?,
              repeat_until = ?, date = ?, due_time = ?, parts = ?, track_habit = ? WHERE id = ?`,
    )
    .run(
      input.kind,
      input.title,
      input.description,
      input.emoji,
      JSON.stringify(input.profileIds),
      input.stars,
      JSON.stringify(input.repeat),
      input.repeatUntil,
      input.date,
      input.dueTime,
      JSON.stringify(input.parts),
      input.trackHabit ? 1 : 0,
      id,
    );
  ctx.bus.emit("tasks");
  return getTask(ctx, id);
}

export function reorderTasks(ctx: Ctx, ids: number[]) {
  const stmt = ctx.db.prepare("UPDATE tasks SET sort = ? WHERE id = ?");
  ids.forEach((id, i) => stmt.run(i + 1, id));
  ctx.bus.emit("tasks");
}

/** Archived rather than deleted so past completions (and the stars they earned) survive. */
export function deleteTask(ctx: Ctx, id: number) {
  ctx.db.prepare("UPDATE tasks SET archived = 1 WHERE id = ?").run(id);
  ctx.bus.emit("tasks");
}

/** "Delete this and future": end the series the day before `from`. */
export function endTaskSeries(ctx: Ctx, id: number, from: string) {
  const t = getTask(ctx, id);
  if (!t) return;
  if (t.date && from <= t.date) return deleteTask(ctx, id);
  ctx.db.prepare("UPDATE tasks SET repeat_until = ? WHERE id = ?").run(addDays(from, -1), id);
  ctx.bus.emit("tasks");
}

interface CompletionRow {
  task_id: number;
  occurrence: string;
  part: string;
  slot: string;
  day: string;
  profile_id: number | null;
  status: "done" | "skipped";
  completed_at: string;
}

const slotOf = (profileId: number | null) => (profileId === null ? "up" : String(profileId));
const ckey = (taskId: number, occurrence: string, part: string, slot: string) => `${taskId}|${occurrence}|${part}|${slot}`;

function addInterval(day: string, n: number, unit: string): string {
  switch (unit) {
    case "week":
      return addDays(day, 7 * n);
    case "month":
      return addMonths(day, n);
    case "year":
      return addMonths(day, 12 * n);
    default:
      return addDays(day, n);
  }
}

/** Scheduled occurrences of a repeating task strictly before `before`, newest first (bounded search). */
function previousOccurrence(task: Task, before: string, horizon = 400): string | null {
  if (!task.date) return null;
  for (let i = 1, d = addDays(before, -1); i <= horizon && d >= task.date; i++, d = addDays(d, -1)) {
    if (occursOn(task.repeat, task.date, d, task.repeatUntil)) return d;
  }
  return null;
}

/** Which part of the day it is now (midnight–noon morning, noon–6pm afternoon, 6pm–midnight evening). */
export function currentPart(now: Date): DayPart {
  const h = now.getHours();
  return h < 12 ? "morning" : h < 18 ? "afternoon" : "evening";
}

/**
 * Expand tasks into per-day, per-person instances for [from, to).
 *
 * Rules (mirroring Skylight):
 *  - Routines appear on each scheduled day, once per part of day; they never roll over.
 *  - A chore with a date that isn't done on time rolls over to today ("late") until completed;
 *    for a repeating chore only its latest missed occurrence rolls over, until the next one is due.
 *  - An undated chore ("anytime") shows on today until done.
 *  - Completed chores show on the day they were checked off.
 */
export function taskInstances(ctx: Ctx, from: string, to: string, opts: { kind?: TaskKind } = {}): TaskInstance[] {
  const now = ctx.now();
  const today = localDateOf(now);
  const tasks = listTaskRows(ctx).filter((t) => !opts.kind || t.kind === opts.kind);
  const comps = ctx.db
    .prepare(
      "SELECT task_id, occurrence, part, slot, day, profile_id, status, completed_at FROM completions WHERE occurrence >= ? OR occurrence = 'once' OR day >= ?",
    )
    .all(addDays(from, -400), from) as unknown as CompletionRow[];
  const byKey = new Map(comps.map((c) => [ckey(c.task_id, c.occurrence, c.part, c.slot), c]));
  const inRange = (d: string) => d >= from && d < to;
  const showToday = inRange(today);
  const days = eachDay(from, to);
  const out: TaskInstance[] = [];

  const push = (task: Task, date: string, occurrence: string, part: DayPart | null, slot: number | null, late: boolean) => {
    const c = byKey.get(ckey(task.id, occurrence, part ?? "", slotOf(slot)));
    out.push({
      task,
      date,
      occurrence,
      part,
      profileId: slot,
      status: c ? c.status : "open",
      completedBy: c?.profile_id ?? null,
      completedAt: c?.completed_at ?? null,
      late,
      streak: 0,
    });
  };

  for (const row of tasks) {
    const { createdAt, ...task } = row;
    const slots: (number | null)[] = task.profileIds.length ? task.profileIds : [null];

    if (task.kind === "routine") {
      const parts = task.parts.length ? task.parts : (["morning"] as DayPart[]);
      for (const slot of slots)
        for (const date of days) {
          if (!occursOn(task.repeat, task.date ?? createdAt, date, task.repeatUntil)) continue;
          for (const part of parts) push(task, date, date, part, slot, false);
        }
      continue;
    }

    for (const slot of slots) {
      const s = slotOf(slot);
      // One-off chores (dated or anytime).
      if (task.repeat.type === "none") {
        const occ = task.date ?? "once";
        const c = byKey.get(ckey(task.id, occ, "", s));
        if (c) {
          if (inRange(c.day)) push(task, c.day, occ, null, slot, !!task.date && c.day > task.date);
        } else if (task.date && task.date >= today) {
          if (inRange(task.date)) push(task, task.date, occ, null, slot, false);
        } else if (showToday) {
          push(task, today, occ, null, slot, !!task.date);
        }
        continue;
      }

      // Repeat based on the last completion.
      if (task.repeat.type === "afterCompletion") {
        const { interval, unit } = task.repeat;
        const mine = comps
          .filter((c) => c.task_id === task.id && c.slot === s)
          .sort((a, b) => a.day.localeCompare(b.day));
        let due = task.date ?? createdAt;
        for (const c of mine) {
          if (inRange(c.day)) push(task, c.day, c.occurrence, null, slot, c.day > c.occurrence);
          due = addInterval(c.day, Math.max(1, interval), unit);
        }
        if (task.repeatUntil && due > task.repeatUntil) continue;
        if (due >= today) {
          if (inRange(due)) push(task, due, due, null, slot, false);
        } else if (showToday) {
          push(task, today, due, null, slot, true);
        }
        continue;
      }

      // Scheduled repeats.
      const anchor = task.date ?? createdAt;
      for (const date of days) {
        if (!occursOn(task.repeat, anchor, date, task.repeatUntil)) continue;
        const c = byKey.get(ckey(task.id, date, "", s));
        if (date < today && !c) continue; // missed: handled by roll-over below
        if (c && c.day !== date) continue; // completed late: shown on the day it was checked
        push(task, date, date, null, slot, false);
      }
      // Late completions of earlier occurrences that were checked off inside the range.
      for (const c of comps) {
        if (c.task_id === task.id && c.slot === s && c.part === "" && c.day !== c.occurrence && inRange(c.day))
          push(task, c.day, c.occurrence, null, slot, true);
      }
      // Roll the latest missed occurrence forward onto today (until the next one is due).
      if (showToday && !occursOn(task.repeat, anchor, today, task.repeatUntil)) {
        const prev = previousOccurrence({ ...task, date: anchor }, today);
        if (prev && !byKey.has(ckey(task.id, prev, "", s))) push(task, today, prev, null, slot, true);
      }
    }
  }

  // Habit streaks for routines.
  const streakCache = new Map<string, number>();
  for (const inst of out) {
    if (inst.task.kind !== "routine" || !inst.task.trackHabit) continue;
    const k = `${inst.task.id}|${slotOf(inst.profileId)}`;
    if (!streakCache.has(k)) streakCache.set(k, habitStreak(inst.task, inst.profileId, byKey, today));
    inst.streak = streakCache.get(k)!;
  }

  const partRank = { morning: 0, afternoon: 1, evening: 2 } as const;
  out.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      Number(a.task.kind === "chore") - Number(b.task.kind === "chore") ||
      (a.part ? partRank[a.part] : 3) - (b.part ? partRank[b.part] : 3) ||
      Number(b.late) - Number(a.late) ||
      (a.task.dueTime ?? "99").localeCompare(b.task.dueTime ?? "99") ||
      a.task.sort - b.task.sort,
  );
  return out;
}

/** Consecutive scheduled days fully done (skips pause, don't break). Today counts only once done. */
function habitStreak(task: Task, slot: number | null, byKey: Map<string, CompletionRow>, today: string): number {
  const parts = task.parts.length ? task.parts : ["morning"];
  const s = slotOf(slot);
  let streak = 0;
  for (let i = 0, d = today; i < 400 && task.date && d >= task.date; i++, d = addDays(d, -1)) {
    if (!occursOn(task.repeat, task.date, d, task.repeatUntil)) continue;
    const statuses = parts.map((p) => byKey.get(ckey(task.id, d, p, s))?.status);
    if (statuses.every((x) => x === "done" || x === "skipped")) {
      if (statuses.some((x) => x === "done")) streak++;
      continue;
    }
    if (d === today) continue; // today not finished yet - doesn't break the streak
    break;
  }
  return streak;
}

export interface CompleteArgs {
  taskId: number;
  occurrence: string;
  part?: DayPart | null;
  /** Assigned profile column, or null for Up For Grabs. */
  slot: number | null;
  /** Who did it (required for Up For Grabs). */
  creditTo?: number | null;
  /** Day it's being checked off (defaults to today). */
  day?: string;
  status?: "done" | "skipped";
}

export function completeTask(ctx: Ctx, a: CompleteArgs): { stars: number; alreadyDone: boolean } {
  const task = getTask(ctx, a.taskId);
  if (!task) throw new TaskError("Task not found", 404);
  if (a.slot !== null && !task.profileIds.includes(a.slot)) throw new TaskError("That task isn't assigned to this person");
  if (a.slot === null && task.profileIds.length) throw new TaskError("This task is assigned to specific people");
  const status = a.status ?? "done";
  if (status === "skipped" && task.kind === "chore" && task.repeat.type === "none")
    throw new TaskError("Only routines and repeating chores can be skipped");
  const credit = a.slot ?? a.creditTo ?? null;
  if (a.slot === null && status === "done" && credit === null) throw new TaskError("Choose who completed this task");
  const part = task.kind === "routine" ? (a.part ?? task.parts[0] ?? "morning") : "";
  const existing = ctx.db
    .prepare("SELECT status FROM completions WHERE task_id = ? AND occurrence = ? AND part = ? AND slot = ?")
    .get(task.id, a.occurrence, part, slotOf(a.slot)) as { status: string } | undefined;
  if (existing) return { stars: 0, alreadyDone: true };
  const stars = status === "done" && credit !== null ? task.stars : 0;
  const now = ctx.now();
  ctx.db
    .prepare(
      `INSERT INTO completions (task_id, occurrence, part, slot, day, profile_id, status, stars, completed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(task.id, a.occurrence, part, slotOf(a.slot), a.day ?? localDateOf(now), status === "done" ? credit : null, status, stars, now.toISOString());
  ctx.bus.emit("tasks", "stars", "profiles");
  return { stars, alreadyDone: false };
}

export function uncompleteTask(ctx: Ctx, taskId: number, occurrence: string, part: DayPart | null, slot: number | null): boolean {
  const res = ctx.db
    .prepare("DELETE FROM completions WHERE task_id = ? AND occurrence = ? AND part = ? AND slot = ?")
    .run(taskId, occurrence, part ?? "", slotOf(slot));
  ctx.bus.emit("tasks", "stars", "profiles");
  return Number(res.changes) > 0;
}

/** Per-profile progress for a day: done / total (skipped excluded). */
export function dayProgress(instances: TaskInstance[], day: string): Map<number | null, { done: number; total: number }> {
  const m = new Map<number | null, { done: number; total: number }>();
  for (const i of instances) {
    if (i.date !== day || i.status === "skipped") continue;
    const k = i.status === "done" && i.profileId === null ? i.completedBy : i.profileId;
    const cur = m.get(k) ?? { done: 0, total: 0 };
    cur.total++;
    if (i.status === "done") cur.done++;
    m.set(k, cur);
  }
  return m;
}
