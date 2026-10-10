import type { Ctx } from "../context.js";
import { json, tx } from "../db.js";
import { addDays, diffDays, occursOn } from "../../shared/dates.js";
import type { CalendarEvent, EditScope, LocalEvent, LocalEventInput, Repeat } from "../../shared/types.js";

// All times are household-local wall-clock strings: "YYYY-MM-DDTHH:MM" for timed events,
// "YYYY-MM-DD" (end exclusive) for all-day events.

interface Row {
  id: number;
  title: string;
  all_day: number;
  start: string;
  end: string;
  location: string | null;
  notes: string | null;
  profile_ids: string;
  repeat: string;
  repeat_until: string | null;
  exdates: string;
  countdown: number;
  emoji: string;
  reminder_minutes: number | null;
}

function toLocal(r: Row): LocalEvent {
  return {
    id: r.id,
    title: r.title,
    allDay: !!r.all_day,
    start: r.start,
    end: r.end,
    location: r.location ?? undefined,
    notes: r.notes ?? undefined,
    profileIds: json.parse<number[]>(r.profile_ids, []),
    repeat: json.parse<Repeat>(r.repeat, { type: "none" }),
    repeatUntil: r.repeat_until,
    exdates: json.parse<string[]>(r.exdates, []),
    countdown: !!r.countdown,
    emoji: r.emoji,
    reminderMinutes: r.reminder_minutes,
  };
}

export class EventError extends Error {}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DT_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

/** Guess an emoji for a countdown from its title (Skylight does this automatically). */
export function guessEmoji(title: string): string {
  const t = title.toLowerCase();
  const table: [RegExp, string][] = [
    [/birthday|bday|b-day/, "🎂"],
    [/christmas|xmas/, "🎄"],
    [/halloween/, "🎃"],
    [/thanksgiving/, "🦃"],
    [/easter/, "🐣"],
    [/valentine/, "💝"],
    [/new year/, "🎆"],
    [/vacation|trip|holiday|beach/, "🏖️"],
    [/flight|fly|airport/, "✈️"],
    [/disney|park/, "🎢"],
    [/camp/, "🏕️"],
    [/school|class/, "🏫"],
    [/graduat/, "🎓"],
    [/wedding|anniversary/, "💍"],
    [/game|soccer|football|baseball|basketball|hockey/, "🏆"],
    [/concert|show|recital|play/, "🎭"],
    [/party/, "🎉"],
    [/baby/, "👶"],
    [/doctor|dentist|appointment/, "🩺"],
  ];
  for (const [re, e] of table) if (re.test(t)) return e;
  return "📅";
}

function normalize(input: LocalEventInput): LocalEventInput {
  if (!input.title?.trim()) throw new EventError("Title is required");
  const re = input.allDay ? DATE_RE : DT_RE;
  if (!re.test(input.start) || !re.test(input.end)) throw new EventError("Invalid start or end");
  if (input.end <= input.start) throw new EventError("End must be after start");
  if (!input.profileIds?.length) throw new EventError("Choose at least one profile");
  const out = { ...input, title: input.title.trim() };
  if (out.countdown && !out.emoji) out.emoji = guessEmoji(out.title);
  return out;
}

export function getLocalEvent(ctx: Ctx, id: number): LocalEvent | null {
  const r = ctx.db.prepare("SELECT * FROM events WHERE id = ?").get(id) as Row | undefined;
  return r ? toLocal(r) : null;
}

function insert(ctx: Ctx, e: LocalEventInput, exdates: string[] = [], importId: number | null = null): number {
  const res = ctx.db
    .prepare(
      `INSERT INTO events (title, all_day, start, end, location, notes, profile_ids, repeat, repeat_until, exdates,
                           countdown, emoji, reminder_minutes, import_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      e.title,
      e.allDay ? 1 : 0,
      e.start,
      e.end,
      e.location || null,
      e.notes || null,
      JSON.stringify(e.profileIds ?? []),
      JSON.stringify(e.repeat ?? { type: "none" }),
      e.repeatUntil || null,
      JSON.stringify(exdates),
      e.countdown ? 1 : 0,
      e.emoji ?? "",
      e.reminderMinutes ?? null,
      importId,
    );
  return Number(res.lastInsertRowid);
}

function write(ctx: Ctx, id: number, e: LocalEventInput, exdates: string[]) {
  ctx.db
    .prepare(
      `UPDATE events SET title = ?, all_day = ?, start = ?, end = ?, location = ?, notes = ?, profile_ids = ?,
              repeat = ?, repeat_until = ?, exdates = ?, countdown = ?, emoji = ?, reminder_minutes = ? WHERE id = ?`,
    )
    .run(
      e.title,
      e.allDay ? 1 : 0,
      e.start,
      e.end,
      e.location || null,
      e.notes || null,
      JSON.stringify(e.profileIds ?? []),
      JSON.stringify(e.repeat ?? { type: "none" }),
      e.repeatUntil || null,
      JSON.stringify(exdates),
      e.countdown ? 1 : 0,
      e.emoji ?? "",
      e.reminderMinutes ?? null,
      id,
    );
}

export function createLocalEvent(ctx: Ctx, input: LocalEventInput, importId: number | null = null): LocalEvent {
  const id = insert(ctx, normalize(input), [], importId);
  ctx.bus.emit("events");
  return getLocalEvent(ctx, id)!;
}

const day = (v: string) => v.slice(0, 10);
const shift = (v: string, n: number) => addDays(day(v), n) + v.slice(10);

/**
 * Update a local event. For repeating events, `scope` + `occurrence` choose between editing
 * just this occurrence, this and following, or the whole series.
 */
export function updateLocalEvent(
  ctx: Ctx,
  id: number,
  raw: LocalEventInput,
  scope: EditScope = "all",
  occurrence?: string,
): LocalEvent | null {
  const cur = getLocalEvent(ctx, id);
  if (!cur) return null;
  const input = normalize(raw);
  const recurring = cur.repeat.type !== "none";
  if (!recurring || scope === "all" || !occurrence) {
    write(ctx, id, input, input.repeat.type === "none" ? [] : cur.exdates);
    ctx.bus.emit("events");
    return getLocalEvent(ctx, id);
  }
  let newId = id;
  tx(ctx.db, () => {
    if (scope === "this") {
      write(ctx, id, { ...cur }, [...cur.exdates, occurrence]);
      newId = insert(ctx, { ...input, repeat: { type: "none" }, repeatUntil: null });
    } else {
      // this and following
      if (occurrence <= day(cur.start)) {
        write(ctx, id, input, cur.exdates);
      } else {
        write(ctx, id, { ...cur, repeatUntil: addDays(occurrence, -1) }, cur.exdates);
        newId = insert(ctx, input, cur.exdates.filter((d) => d >= occurrence));
      }
    }
  });
  ctx.bus.emit("events");
  return getLocalEvent(ctx, newId);
}

export function deleteLocalEvent(ctx: Ctx, id: number, scope: EditScope = "all", occurrence?: string) {
  const cur = getLocalEvent(ctx, id);
  if (!cur) return;
  if (cur.repeat.type === "none" || scope === "all" || !occurrence) {
    ctx.db.prepare("DELETE FROM events WHERE id = ?").run(id);
  } else if (scope === "this") {
    write(ctx, id, cur, [...cur.exdates, occurrence]);
  } else if (occurrence <= day(cur.start)) {
    ctx.db.prepare("DELETE FROM events WHERE id = ?").run(id);
  } else {
    write(ctx, id, { ...cur, repeatUntil: addDays(occurrence, -1) }, cur.exdates);
  }
  ctx.bus.emit("events");
}

function expandLocal(e: LocalEvent, from: string, to: string): CalendarEvent[] {
  const startDay = day(e.start);
  const span = Math.max(0, diffDays(day(e.end), startDay) - (e.allDay ? 1 : 0));
  const out: CalendarEvent[] = [];
  const base = {
    source: "local" as const,
    localId: e.id,
    title: e.title,
    allDay: e.allDay,
    location: e.location,
    notes: e.notes,
    profileIds: e.profileIds,
    countdown: e.countdown,
    emoji: e.emoji,
    reminderMinutes: e.reminderMinutes,
    recurring: e.repeat.type !== "none",
  };
  if (e.repeat.type === "none") {
    if (startDay < to && addDays(startDay, span) >= from)
      out.push({ ...base, key: `local:${e.id}`, occurrence: startDay, start: e.start, end: e.end });
    return out;
  }
  for (let d = addDays(from, -span); d < to; d = addDays(d, 1)) {
    if (!occursOn(e.repeat, startDay, d, e.repeatUntil) || e.exdates.includes(d)) continue;
    const n = diffDays(d, startDay);
    out.push({ ...base, key: `local:${e.id}:${d}`, occurrence: d, start: shift(e.start, n), end: shift(e.end, n) });
  }
  return out;
}

interface SyncedRow {
  calendar_id: number;
  key: string;
  title: string;
  all_day: number;
  start: string;
  end: string;
  location: string | null;
  notes: string | null;
  profile_ids: string;
  color: string | null;
}

/** All events (local + synced) overlapping [from, to). */
export function eventsInRange(ctx: Ctx, from: string, to: string): CalendarEvent[] {
  const locals = (ctx.db.prepare("SELECT * FROM events").all() as unknown as Row[]).map(toLocal);
  const out: CalendarEvent[] = locals.flatMap((e) => expandLocal(e, from, to));

  // Synced values are wall-clock strings, so string comparison works for overlap.
  const synced = ctx.db
    .prepare(
      `SELECT s.*, c.profile_ids, c.color FROM synced_events s JOIN calendars c ON c.id = s.calendar_id
        WHERE c.enabled = 1 AND s.start < ? AND s.end > ?`,
    )
    .all(to, from) as unknown as SyncedRow[];
  for (const s of synced) {
    out.push({
      key: `google:${s.calendar_id}:${s.key}`,
      source: "google",
      calendarId: s.calendar_id,
      title: s.title,
      allDay: !!s.all_day,
      start: s.start,
      end: s.end,
      location: s.location ?? undefined,
      notes: s.notes ?? undefined,
      profileIds: json.parse<number[]>(s.profile_ids, []),
      color: s.color ?? undefined,
    });
  }
  out.sort(
    (a, b) =>
      day(a.start).localeCompare(day(b.start)) || Number(b.allDay) - Number(a.allDay) || a.start.localeCompare(b.start) || a.title.localeCompare(b.title),
  );
  return out;
}

/** Upcoming countdown events (first occurrence on/after today) within the display window. */
export function upcomingCountdowns(ctx: Ctx, today: string, windowDays: number | null): (CalendarEvent & { daysUntil: number })[] {
  const horizon = addDays(today, windowDays ?? 730);
  const events = eventsInRange(ctx, today, horizon).filter((e) => e.countdown);
  const seen = new Set<number>();
  const out: (CalendarEvent & { daysUntil: number })[] = [];
  for (const e of events) {
    if (e.localId === undefined || seen.has(e.localId)) continue;
    if (day(e.start) < today) continue;
    seen.add(e.localId);
    out.push({ ...e, daysUntil: diffDays(day(e.start), today) });
  }
  return out.sort((a, b) => a.daysUntil - b.daysUntil);
}

/** Undo a Magic Import: delete the events it created. */
export function deleteEventsForImport(ctx: Ctx, importId: number) {
  ctx.db.prepare("DELETE FROM events WHERE import_id = ?").run(importId);
  ctx.bus.emit("events");
}
export type LocalEventInputT = LocalEventInput;
