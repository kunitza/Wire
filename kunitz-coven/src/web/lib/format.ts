import { dayOfWeek, parseDate } from "../../shared/dates";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const DOW_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export const monthName = (m0: number, long = false) => (long ? MONTHS_LONG : MONTHS)[m0];

/** "Tue, Sep 8" */
export function headerDate(d: string): string {
  const x = parseDate(d);
  return `${DOW[x.getUTCDay()]}, ${MONTHS[x.getUTCMonth()]} ${x.getUTCDate()}`;
}
/** "Thu 19" */
export function dayLabel(d: string): { dow: string; num: number } {
  const x = parseDate(d);
  return { dow: DOW[x.getUTCDay()], num: x.getUTCDate() };
}
/** "March 22 – 28", "Mar 30 – Apr 5" */
export function rangeLabel(from: string, toInclusive: string): string {
  const a = parseDate(from);
  const b = parseDate(toInclusive);
  if (a.getUTCMonth() === b.getUTCMonth()) return `${MONTHS_LONG[a.getUTCMonth()]} ${a.getUTCDate()} – ${b.getUTCDate()}`;
  return `${MONTHS[a.getUTCMonth()]} ${a.getUTCDate()} – ${MONTHS[b.getUTCMonth()]} ${b.getUTCDate()}`;
}
/** "Wednesday, October 7" */
export function longDate(d: string, withYear = false): string {
  const x = parseDate(d);
  return `${DOW_LONG[x.getUTCDay()]}, ${MONTHS_LONG[x.getUTCMonth()]} ${x.getUTCDate()}${withYear ? `, ${x.getUTCFullYear()}` : ""}`;
}
export function shortDate(d: string): string {
  const x = parseDate(d);
  return `${MONTHS[x.getUTCMonth()]} ${x.getUTCDate()}`;
}

function hm(t: string): [number, number] {
  const [h, m] = t.split(":").map(Number);
  return [h, m];
}

/** "9 AM", "11:30 AM", "13:30" */
export function fmtTime(t: string, h24 = false, withMeridiem = true): string {
  const [h, m] = hm(t.length > 5 ? t.slice(11, 16) : t);
  if (h24) return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  const ap = h < 12 ? "AM" : "PM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}${m ? `:${String(m).padStart(2, "0")}` : ""}${withMeridiem ? ` ${ap}` : ""}`;
}

/** Skylight-style range: "3 – 5 PM", "11:30 AM – 12 PM". */
export function fmtRange(start: string, end: string, h24 = false): string {
  if (h24) return `${fmtTime(start, true)} – ${fmtTime(end, true)}`;
  const s = start.slice(11, 16);
  const e = end.slice(11, 16);
  const sameMeridiem = hm(s)[0] < 12 === hm(e)[0] < 12 && start.slice(0, 10) === end.slice(0, 10);
  return `${fmtTime(s, false, !sameMeridiem)} – ${fmtTime(e)}`;
}

/** Clock for the header: "12:50 PM". */
export function clock(now: Date, h24: boolean): string {
  return fmtTime(`${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`, h24);
}

export function isWeekend(d: string) {
  const w = dayOfWeek(d);
  return w === 0 || w === 6;
}

/** WMO weather code -> emoji. */
export function weatherEmoji(code: number, isDay = true): string {
  if (code === 0) return isDay ? "☀️" : "🌙";
  if (code === 1) return isDay ? "🌤️" : "🌙";
  if (code === 2) return "⛅";
  if (code === 3) return "☁️";
  if (code === 45 || code === 48) return "🌫️";
  if (code >= 51 && code <= 57) return "🌦️";
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return "🌧️";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "🌨️";
  if (code >= 95) return "⛈️";
  return "🌤️";
}
export function weatherLabel(code: number): string {
  if (code === 0) return "Clear";
  if (code <= 2) return "Partly cloudy";
  if (code === 3) return "Cloudy";
  if (code === 45 || code === 48) return "Fog";
  if (code >= 51 && code <= 57) return "Drizzle";
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return "Rain";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "Snow";
  if (code >= 95) return "Thunderstorms";
  return "";
}

// ---- Colors ----
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h.slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
/** Mix a color with white: amount 0 = white, 1 = the color. */
export function tint(hex: string, amount: number): string {
  try {
    const [r, g, b] = hexToRgb(hex);
    const m = (c: number) => Math.round(255 + (c - 255) * amount);
    return `rgb(${m(r)}, ${m(g)}, ${m(b)})`;
  } catch {
    return hex;
  }
}
/** Darken a color (for text on tints / filled check circles). */
export function shade(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex);
  const m = (c: number) => Math.round(c * (1 - amount));
  return `rgb(${m(r)}, ${m(g)}, ${m(b)})`;
}
/** Is white text readable on this color? */
export function isDark(hex: string): boolean {
  const [r, g, b] = hexToRgb(hex);
  return 0.299 * r + 0.587 * g + 0.114 * b < 165;
}

export const PROFILE_COLORS = [
  "#F66951", "#FDB501", "#F3B276", "#D0632A", "#FBAB95", "#CC414B", "#E86FA5", "#B07CC6",
  "#7C6CF2", "#2E86C1", "#4FB3D9", "#5DC6C6", "#3BAF7E", "#8BC34A", "#A0855B", "#8E9AA6",
];

export const LIST_COLORS = ["#8AB4F8", "#F9A08B", "#7FC8A9", "#F9CF7A", "#C4A5E8", "#F48FB1", "#80CBC4", "#BCAAA4"];

export function plural(n: number, w: string) {
  return `${n} ${w}${n === 1 ? "" : "s"}`;
}
