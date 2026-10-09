// Pure calendar helpers: periods, event geometry and colors. No React here.
import type { CalendarEvent, CalendarView, Profile, Settings } from "../../../shared/types";
import { addDays, addMonths, diffDays, localDateOf, startOfMonth, startOfWeek } from "../../../shared/dates";
import { monthName, rangeLabel, headerDate, tint } from "../../lib/format";
import { parseDate } from "../../../shared/dates";

export type CalSettings = Settings["calendar"] & { weekStartsOn: 0 | 1 };

const pad = (n: number) => String(n).padStart(2, "0");

export const dayOf = (v: string) => v.slice(0, 10);

/** Minutes after midnight of a "YYYY-MM-DDTHH:MM" value (0 for a bare date). */
export function minutesOf(v: string): number {
  if (v.length <= 10) return 0;
  return Number(v.slice(11, 13)) * 60 + Number(v.slice(14, 16));
}

export function nowStamp(now: Date): string {
  return `${localDateOf(now)}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

export function hhmm(mins: number): string {
  const m = Math.max(0, Math.min(23 * 60 + 59, Math.round(mins)));
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

/** Last day (inclusive) an event covers. */
export function lastDay(e: Pick<CalendarEvent, "allDay" | "start" | "end">): string {
  const s = dayOf(e.start);
  if (e.allDay) {
    const l = addDays(e.end, -1);
    return l < s ? s : l;
  }
  const ed = dayOf(e.end);
  if (ed > s && e.end.slice(11) === "00:00") return addDays(ed, -1);
  return ed < s ? s : ed;
}

export const onDay = (e: CalendarEvent, d: string) => dayOf(e.start) <= d && lastDay(e) >= d;
export const spansDays = (e: CalendarEvent) => lastDay(e) > dayOf(e.start);
/** Shown as an all-day style bar: all-day events and timed events lasting a day or more. */
export const isBar = (e: CalendarEvent) => e.allDay || (spansDays(e) && diffMinutes(e.start, e.end) >= 24 * 60);

export function diffMinutes(a: string, b: string): number {
  return diffDays(dayOf(b), dayOf(a)) * 1440 + minutesOf(b) - minutesOf(a);
}

export function isPast(e: CalendarEvent, now: Date): boolean {
  if (e.allDay) return e.end <= localDateOf(now);
  return e.end <= nowStamp(now);
}

/** Sort: all-day/bars first, then by start time, then title. */
export function sortEvents(a: CalendarEvent, b: CalendarEvent): number {
  return Number(isBar(b)) - Number(isBar(a)) || a.start.localeCompare(b.start) || a.title.localeCompare(b.title);
}

// ---------- Periods ----------

export function periodRange(view: CalendarView, anchor: string, s: CalSettings, opts: { scheduleDays?: number } = {}): { from: string; to: string } {
  switch (view) {
    case "schedule": {
      const n = Math.max(1, Math.min(7, opts.scheduleDays ?? s.scheduleDays ?? 5));
      return { from: anchor, to: addDays(anchor, n) };
    }
    case "day":
      return { from: anchor, to: addDays(anchor, 1) };
    case "week": {
      const from = s.weekStartsToday ? anchor : startOfWeek(anchor, s.weekStartsOn);
      return { from, to: addDays(from, 7) };
    }
    case "month": {
      if (s.monthStartsThisWeek) {
        const from = startOfWeek(anchor, s.weekStartsOn);
        return { from, to: addDays(from, 35) };
      }
      const first = startOfMonth(anchor);
      const from = startOfWeek(first, s.weekStartsOn);
      const next = addMonths(first, 1);
      const weeks = Math.ceil(diffDays(next, from) / 7);
      return { from, to: addDays(from, weeks * 7) };
    }
  }
}

/** Move the anchor one period back (-1) or forward (+1). */
export function stepAnchor(view: CalendarView, anchor: string, dir: number, s: CalSettings, opts: { scheduleDays?: number } = {}): string {
  switch (view) {
    case "schedule":
      return addDays(anchor, dir * Math.max(1, Math.min(7, opts.scheduleDays ?? s.scheduleDays ?? 5)));
    case "day":
      return addDays(anchor, dir);
    case "week":
      return addDays(s.weekStartsToday ? anchor : startOfWeek(anchor, s.weekStartsOn), dir * 7);
    case "month":
      return s.monthStartsThisWeek ? addDays(anchor, dir * 35) : addMonths(startOfMonth(anchor), dir);
  }
}

/** Is today inside the period shown for `anchor`? */
export function isCurrentPeriod(view: CalendarView, anchor: string, today: string, s: CalSettings, opts: { scheduleDays?: number } = {}): boolean {
  if (view === "month" && !s.monthStartsThisWeek) return anchor.slice(0, 7) === today.slice(0, 7);
  if (view === "schedule" || view === "day") return anchor === today;
  const { from, to } = periodRange(view, anchor, s, opts);
  return today >= from && today < to;
}

/** Label for the period (used in the header while browsing away from today). */
export function periodLabel(view: CalendarView, anchor: string, s: CalSettings, short = false, opts: { scheduleDays?: number } = {}): string {
  const { from, to } = periodRange(view, anchor, s, opts);
  if (view === "day") return short ? headerDate(anchor).replace(/^\w+, /, "") : headerDate(anchor);
  if (view === "month" && !s.monthStartsThisWeek) {
    const d = parseDate(anchor);
    return `${monthName(d.getUTCMonth(), !short)} ${d.getUTCFullYear()}`;
  }
  const last = addDays(to, -1);
  if (from === last) return headerDate(from);
  const lab = rangeLabel(from, last);
  return short ? lab.replace(/^(\w{3})\w+ /, "$1 ") : lab;
}

// ---------- Colors ----------

export const GOOGLE_GRAY = "#9F9A9A";
const FILL = 0.38;
const FILL_PAST = 0.17;

export function eventColors(e: CalendarEvent, profiles: Profile[]): string[] {
  if (e.color) return [e.color];
  const cs = profiles.map((p) => p.color);
  return cs.length ? cs : [GOOGLE_GRAY];
}

/** Background for an event bubble: a flat tint, or hard diagonal stripes for multi-profile events. */
export function eventBackground(colors: string[], opts: { multi: boolean; past: boolean; amount?: number }): string {
  const amt = opts.past ? FILL_PAST : (opts.amount ?? FILL);
  if (!opts.multi || colors.length < 2) return tint(colors[0], amt);
  const list = colors.slice(0, 4);
  const stops = list
    .map((c, i) => {
      const t = tint(c, amt);
      return `${t} ${((i / list.length) * 100).toFixed(1)}% ${(((i + 1) / list.length) * 100).toFixed(1)}%`;
    })
    .join(", ");
  return `linear-gradient(115deg, ${stops})`;
}

// ---------- Layout: overlapping timed events ----------

export interface Placed<T> {
  item: T;
  top: number; // minutes
  bottom: number; // minutes
  col: number;
  cols: number;
}

/** Side-by-side columns for overlapping items (classic calendar clustering). */
export function layoutDay<T>(items: { item: T; start: number; end: number }[], minMinutes: number): Placed<T>[] {
  const sorted = [...items]
    .map((x) => ({ ...x, end: Math.max(x.end, x.start + minMinutes) }))
    .sort((a, b) => a.start - b.start || b.end - a.end);
  const out: Placed<T>[] = [];
  let cluster: Placed<T>[] = [];
  let colEnds: number[] = [];
  let clusterEnd = -1;
  const flush = () => {
    const n = colEnds.length;
    cluster.forEach((p) => (p.cols = n));
    out.push(...cluster);
    cluster = [];
    colEnds = [];
  };
  for (const x of sorted) {
    if (x.start >= clusterEnd && cluster.length) flush();
    let col = colEnds.findIndex((end) => end <= x.start);
    if (col < 0) {
      col = colEnds.length;
      colEnds.push(x.end);
    } else colEnds[col] = x.end;
    cluster.push({ item: x.item, top: x.start, bottom: x.end, col, cols: 1 });
    clusterEnd = Math.max(clusterEnd, x.end);
  }
  if (cluster.length) flush();
  return out;
}

/** Pack multi-day items into lanes inside a run of days. Returns lane index per item. */
export function packLanes<T>(items: { item: T; from: number; to: number }[]): { item: T; from: number; to: number; lane: number }[] {
  const lanes: number[] = []; // last occupied column per lane
  return [...items]
    .sort((a, b) => a.from - b.from || b.to - b.from - (a.to - a.from))
    .map((x) => {
      let lane = lanes.findIndex((last) => last < x.from);
      if (lane < 0) {
        lane = lanes.length;
        lanes.push(x.to);
      } else lanes[lane] = x.to;
      return { ...x, lane };
    });
}

/** Default start for a new event on `date`: the next full hour (today) or 9 AM. */
export function defaultStart(date: string, now: Date): string {
  if (date === localDateOf(now)) return hhmm(Math.min(23, now.getHours() + 1) * 60);
  return "09:00";
}

export function countdownLabel(days: number): string {
  if (days <= 0) return "Today!";
  if (days === 1) return "Tomorrow";
  return `${days} days`;
}
