import ical from "node-ical";
import rrulePkg from "rrule";
import type { Ctx } from "../context.js";
import { json, tx } from "../db.js";
import { addDays, localDateOf } from "../../shared/dates.js";
import type { SyncedCalendar } from "../../shared/types.js";

const { RRule } = rrulePkg;

export interface ParsedEvent {
  key: string;
  title: string;
  allDay: boolean;
  start: string; // household wall clock
  end: string;
  location: string | null;
  notes: string | null;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Absolute instant -> household-local wall clock "YYYY-MM-DDTHH:MM" (process TZ). */
function wall(d: Date): string {
  return `${localDateOf(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Wall-clock string -> "floating" Date whose UTC fields carry the wall-clock values. */
function floating(w: string): Date {
  const [date, time = "00:00"] = w.split("T");
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  return new Date(Date.UTC(y, m - 1, d, hh, mm));
}

const floatToWall = (d: Date) => d.toISOString().slice(0, 16);

/** The event's IANA time zone (from TZID), if the runtime knows it. UTC events expand in UTC. */
function eventZone(ev: ical.VEvent): string | null {
  const tz = (ev.start as Date & { tz?: string }).tz;
  if (!tz) return null;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz;
  } catch {
    return null; // e.g. a non-standard Windows zone name: fall back to household time
  }
}

const zoneFormatters = new Map<string, Intl.DateTimeFormat>();
/** Absolute instant -> wall clock "YYYY-MM-DDTHH:MM" in the given zone. */
function wallIn(d: Date, zone: string): string {
  let f = zoneFormatters.get(zone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-CA", { timeZone: zone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
    zoneFormatters.set(zone, f);
  }
  const p = Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour === "24" ? "00" : p.hour}:${p.minute}`;
}

/** Wall clock in `zone` -> absolute instant (handles DST; times in a spring-forward gap move forward). */
function instantFromWall(w: string, zone: string): Date {
  const guess = floating(w).getTime();
  let t = guess - (floating(wallIn(new Date(guess), zone)).getTime() - guess);
  const off2 = floating(wallIn(new Date(t), zone)).getTime() - t;
  t = guess - off2;
  return new Date(t);
}

/** Household-local wall clock -> instant. */
function localInstant(w: string): Date {
  const [date, time] = w.split("T");
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  return new Date(y, m - 1, d, hh, mm);
}

function text(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === "string") return v;
  if (typeof v === "object" && v && "val" in v) return String((v as { val: unknown }).val);
  return String(v);
}

function isAllDay(ev: ical.VEvent): boolean {
  return (ev as unknown as { datetype?: string }).datetype === "date" || !!(ev.start as Date & { dateOnly?: boolean })?.dateOnly;
}

function minutesBetween(a: Date, b: Date) {
  return Math.round((b.getTime() - a.getTime()) / 60000);
}

function addMinutesWall(w: string, minutes: number): string {
  return floatToWall(new Date(floating(w).getTime() + minutes * 60000));
}

function makeEvent(ev: ical.VEvent, start: Date, end: Date | undefined, key: string): ParsedEvent {
  const allDay = isAllDay(ev);
  let s: string;
  let e: string;
  if (allDay) {
    s = localDateOf(start);
    e = end ? localDateOf(end) : addDays(s, 1);
    if (e <= s) e = addDays(s, 1);
  } else {
    s = wall(start);
    e = end ? wall(end) : addMinutesWall(s, 60);
    if (e <= s) e = addMinutesWall(s, 30);
  }
  return {
    key,
    title: text(ev.summary)?.trim() || "(No title)",
    allDay,
    start: s,
    end: e,
    location: text(ev.location),
    notes: text(ev.description),
  };
}

/**
 * Parse an iCalendar feed and expand it into concrete occurrences overlapping [from, to)
 * (dates, household-local). Handles RRULE, EXDATE, moved/cancelled single occurrences.
 */
export function expandIcs(body: string, from: string, to: string): ParsedEvent[] {
  const data = ical.sync.parseICS(body);
  const out: ParsedEvent[] = [];
  const overlaps = (p: ParsedEvent) => p.start.slice(0, 10) < to && (p.allDay ? p.end > from : p.end.slice(0, 10) >= from);

  for (const item of Object.values(data)) {
    if (!item || item.type !== "VEVENT") continue;
    const ev = item as ical.VEvent;
    if (!ev.start) continue;
    if ((ev.status as string | undefined)?.toUpperCase() === "CANCELLED") continue;
    const uid = ev.uid || `${text(ev.summary)}-${ev.start.toISOString()}`;
    const allDay = isAllDay(ev);
    const durMin = ev.end ? minutesBetween(ev.start, ev.end) : allDay ? 1440 : 60;

    if (!ev.rrule) {
      // A detached override without a master is still a plain event.
      const p = makeEvent(ev, ev.start, ev.end, ev.recurrenceid ? `${uid}@${ev.start.toISOString()}` : uid);
      if (overlaps(p)) out.push(p);
      continue;
    }

    // Expand the rule in "floating" wall-clock time in the event's own time zone (so "9:00 every
    // Tuesday in London" stays 9:00 London across both countries' DST changes), then convert each
    // occurrence to the household's local time. All-day events are plain dates.
    const zone = allDay ? null : eventZone(ev);
    const toWallZ = (d: Date) => (allDay ? localDateOf(d) + "T00:00" : zone ? wallIn(d, zone) : wall(d));
    // Identity of an occurrence: its date (all-day) or its absolute start minute.
    const keyOf = (d: Date) => (allDay ? localDateOf(d) : d.toISOString().slice(0, 16));
    const orig = { ...ev.rrule.origOptions };
    delete orig.dtstart;
    delete orig.tzid;
    if (orig.until) orig.until = floating(allDay ? localDateOf(orig.until) + "T23:59" : toWallZ(orig.until));
    let rule: InstanceType<typeof RRule>;
    try {
      rule = new RRule({ ...orig, dtstart: floating(toWallZ(ev.start)) });
    } catch {
      continue;
    }
    const spanDays = Math.ceil(durMin / 1440) + 2;
    const starts = rule.between(floating(addDays(from, -spanDays) + "T00:00"), floating(addDays(to, 1) + "T00:00"), true);

    const exKeys = new Set<string>();
    for (const x of Object.values((ev.exdate ?? {}) as Record<string, Date>)) if (x instanceof Date) exKeys.add(keyOf(x));
    const overrides = new Map<string, ical.VEvent>();
    for (const r of Object.values((ev.recurrences ?? {}) as Record<string, ical.VEvent>)) {
      const rid = r.recurrenceid as Date | undefined;
      if (rid instanceof Date) overrides.set(keyOf(rid), r);
    }

    for (const o of starts) {
      const occWall = floatToWall(o);
      const instant = allDay ? null : zone ? instantFromWall(occWall, zone) : localInstant(occWall);
      const k = allDay ? occWall.slice(0, 10) : instant!.toISOString().slice(0, 16);
      if (exKeys.has(k)) continue;
      const ov = overrides.get(k);
      if (ov) {
        overrides.delete(k);
        if ((ov.status as string | undefined)?.toUpperCase() === "CANCELLED" || !ov.start) continue;
        const p = makeEvent({ ...ov, datetype: (ov as unknown as { datetype?: string }).datetype } as ical.VEvent, ov.start, ov.end, `${uid}@${k}`);
        if (overlaps(p)) out.push(p);
        continue;
      }
      const base = { key: `${uid}@${k}`, title: text(ev.summary)?.trim() || "(No title)", location: text(ev.location), notes: text(ev.description) };
      const p: ParsedEvent = allDay
        ? { ...base, allDay: true, start: k, end: addDays(k, Math.max(1, Math.round(durMin / 1440))) }
        : { ...base, allDay: false, start: wall(instant!), end: wall(new Date(instant!.getTime() + durMin * 60000)) };
      if (overlaps(p)) out.push(p);
    }
    // Overrides moved to a time outside the generated set (e.g. moved from a date outside the window).
    for (const [k, ov] of overrides) {
      if ((ov.status as string | undefined)?.toUpperCase() === "CANCELLED" || !ov.start) continue;
      const p = makeEvent(ov, ov.start, ov.end, `${uid}@${k}`);
      if (overlaps(p)) out.push(p);
    }
  }
  return out;
}

// ---- Calendar sources ----

interface CalRow {
  id: number;
  name: string;
  url: string;
  profile_ids: string;
  color: string | null;
  enabled: number;
  last_sync: string | null;
  last_error: string | null;
  event_count: number;
}

export function maskUrl(url: string): string {
  try {
    const u = new URL(url.replace(/^webcal:/i, "https:"));
    return `${u.host}/…${u.pathname.slice(-12)}`;
  } catch {
    return "…";
  }
}

export function listCalendars(ctx: Ctx, mask = true): SyncedCalendar[] {
  const rows = ctx.db
    .prepare(
      `SELECT c.*, (SELECT COUNT(*) FROM synced_events s WHERE s.calendar_id = c.id) AS event_count
         FROM calendars c ORDER BY c.id`,
    )
    .all() as unknown as CalRow[];
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    url: mask ? maskUrl(r.url) : r.url,
    profileIds: json.parse<number[]>(r.profile_ids, []),
    color: r.color,
    enabled: !!r.enabled,
    lastSync: r.last_sync,
    lastError: r.last_error,
    eventCount: r.event_count,
  }));
}

export function addCalendar(ctx: Ctx, input: { name: string; url: string; profileIds: number[]; color?: string | null }) {
  const url = input.url.trim();
  if (!/^(https?|webcal):\/\//i.test(url)) throw new Error("Paste the calendar's secret address in iCal format (it starts with https://)");
  const res = ctx.db
    .prepare("INSERT INTO calendars (name, url, profile_ids, color) VALUES (?, ?, ?, ?)")
    .run(input.name.trim() || "Google Calendar", url, JSON.stringify(input.profileIds ?? []), input.color ?? null);
  ctx.bus.emit("calendars");
  return Number(res.lastInsertRowid);
}

export function updateCalendar(ctx: Ctx, id: number, patch: { name?: string; profileIds?: number[]; color?: string | null; enabled?: boolean; url?: string }) {
  const cur = listCalendars(ctx, false).find((c) => c.id === id);
  if (!cur) throw new Error("Calendar not found");
  ctx.db
    .prepare("UPDATE calendars SET name = ?, url = ?, profile_ids = ?, color = ?, enabled = ? WHERE id = ?")
    .run(
      patch.name?.trim() || cur.name,
      patch.url?.trim() || cur.url,
      JSON.stringify(patch.profileIds ?? cur.profileIds),
      patch.color === undefined ? cur.color : patch.color,
      patch.enabled === undefined ? (cur.enabled ? 1 : 0) : patch.enabled ? 1 : 0,
      id,
    );
  ctx.bus.emit("calendars", "events");
}

export function removeCalendar(ctx: Ctx, id: number) {
  ctx.db.prepare("DELETE FROM calendars WHERE id = ?").run(id);
  ctx.bus.emit("calendars", "events");
}

export type Fetcher = (url: string) => Promise<string>;

const defaultFetcher: Fetcher = async (url) => {
  const res = await fetch(url.replace(/^webcal:/i, "https:"), { signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`Calendar server replied ${res.status} ${res.statusText}`);
  const body = await res.text();
  if (!body.includes("BEGIN:VCALENDAR")) throw new Error("That address didn't return a calendar. Use the 'Secret address in iCal format'.");
  return body;
};

export async function syncCalendar(ctx: Ctx, id: number, fetcher: Fetcher = defaultFetcher): Promise<number> {
  const cal = listCalendars(ctx, false).find((c) => c.id === id);
  if (!cal) throw new Error("Calendar not found");
  const today = localDateOf(ctx.now());
  try {
    const body = await fetcher(cal.url);
    const events = expandIcs(body, addDays(today, -120), addDays(today, 430));
    tx(ctx.db, () => {
      ctx.db.prepare("DELETE FROM synced_events WHERE calendar_id = ?").run(id);
      const stmt = ctx.db.prepare(
        "INSERT OR REPLACE INTO synced_events (calendar_id, key, title, all_day, start, end, location, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      );
      for (const e of events) stmt.run(id, e.key, e.title, e.allDay ? 1 : 0, e.start, e.end, e.location, e.notes);
      ctx.db.prepare("UPDATE calendars SET last_sync = ?, last_error = NULL WHERE id = ?").run(ctx.now().toISOString(), id);
    });
    ctx.bus.emit("events", "calendars");
    return events.length;
  } catch (err) {
    ctx.db.prepare("UPDATE calendars SET last_error = ? WHERE id = ?").run((err as Error).message, id);
    ctx.bus.emit("calendars");
    throw err;
  }
}

export async function syncAll(ctx: Ctx, fetcher?: Fetcher) {
  for (const c of listCalendars(ctx, false)) {
    if (!c.enabled) continue;
    try {
      await syncCalendar(ctx, c.id, fetcher);
    } catch {
      /* recorded on the calendar row */
    }
  }
}
