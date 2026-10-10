// Calendar-date helpers. A "date" is a local YYYY-MM-DD string; we do date math in UTC
// on those strings so daylight-saving changes never shift a day.
import type { Repeat } from "./types.js";

export function parseDate(d: string): Date {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, day));
}

export function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Today's date in the local timezone of the running process (browser or server). */
export function localToday(now: Date = new Date()): string {
  return localDateOf(now);
}

export function localDateOf(dt: Date): string {
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const d = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function addDays(d: string, n: number): string {
  const x = parseDate(d);
  x.setUTCDate(x.getUTCDate() + n);
  return fmtDate(x);
}

export function addMonths(d: string, n: number): string {
  const x = parseDate(d);
  const day = x.getUTCDate();
  x.setUTCDate(1);
  x.setUTCMonth(x.getUTCMonth() + n);
  const dim = daysInMonth(x.getUTCFullYear(), x.getUTCMonth());
  x.setUTCDate(Math.min(day, dim));
  return fmtDate(x);
}

export function daysInMonth(year: number, month0: number): number {
  return new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
}

export function dayOfWeek(d: string): number {
  return parseDate(d).getUTCDay();
}

export function diffDays(a: string, b: string): number {
  return Math.round((parseDate(a).getTime() - parseDate(b).getTime()) / 86400000);
}

export function startOfWeek(d: string, weekStartsOn: 0 | 1 = 0): string {
  const dow = dayOfWeek(d);
  const back = (dow - weekStartsOn + 7) % 7;
  return addDays(d, -back);
}

export function startOfMonth(d: string): string {
  return d.slice(0, 8) + "01";
}

export function eachDay(from: string, toExclusive: string): string[] {
  const out: string[] = [];
  for (let d = from; d < toExclusive; d = addDays(d, 1)) out.push(d);
  return out;
}

function monthIndex(d: string): number {
  const [y, m] = d.split("-").map(Number);
  return y * 12 + (m - 1);
}

/** Does a repeating item that starts on `start` occur on `date`? */
export function occursOn(repeat: Repeat, start: string, date: string, until?: string | null): boolean {
  if (date < start) return false;
  if (until && date > until) return false;
  switch (repeat.type) {
    case "none":
      return date === start;
    case "daily": {
      const interval = Math.max(1, repeat.interval || 1);
      return diffDays(date, start) % interval === 0;
    }
    case "weekly": {
      const interval = Math.max(1, repeat.interval || 1);
      const days = repeat.days?.length ? repeat.days : [dayOfWeek(start)];
      if (!days.includes(dayOfWeek(date))) return false;
      const weeks = Math.floor(diffDays(startOfWeek(date, 0), startOfWeek(start, 0)) / 7);
      return weeks % interval === 0;
    }
    case "monthly": {
      const interval = Math.max(1, repeat.interval || 1);
      const months = monthIndex(date) - monthIndex(start);
      if (months % interval !== 0) return false;
      const want = repeat.dayOfMonth || parseDate(start).getUTCDate();
      const [y, m, d] = date.split("-").map(Number);
      // Clamp to the last day of short months (e.g. the 31st -> Feb 28).
      return d === Math.min(want, daysInMonth(y, m - 1));
    }
    case "yearly": {
      const s = parseDate(start);
      const x = parseDate(date);
      if (s.getUTCMonth() !== x.getUTCMonth()) return false;
      const want = s.getUTCDate();
      return x.getUTCDate() === Math.min(want, daysInMonth(x.getUTCFullYear(), x.getUTCMonth()));
    }
    case "afterCompletion":
      // Scheduled from the last completion, not the calendar; see the task service.
      return date === start;
  }
}

export function describeRepeat(r: Repeat): string {
  const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  switch (r.type) {
    case "none":
      return "Does not repeat";
    case "daily":
      return r.interval > 1 ? `Every ${r.interval} days` : "Every day";
    case "weekly": {
      const days = [...(r.days || [])].sort().map((d) => names[d]);
      const every = r.interval > 1 ? `Every ${r.interval} weeks` : "Weekly";
      if (days.length === 7) return r.interval > 1 ? `${every}, every day` : "Every day";
      if (days.join() === "Mon,Tue,Wed,Thu,Fri") return r.interval > 1 ? `${every} on weekdays` : "Weekdays";
      return days.length ? `${every} on ${days.join(", ")}` : every;
    }
    case "monthly":
      return `${r.interval > 1 ? `Every ${r.interval} months` : "Monthly"} on day ${r.dayOfMonth}`;
    case "yearly":
      return "Yearly";
    case "afterCompletion": {
      const unit = r.unit + (r.interval === 1 ? "" : "s");
      return `${r.interval} ${unit} after completed`;
    }
  }
}
