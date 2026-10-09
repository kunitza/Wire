// Shared calendar building blocks: data hook, actions context, event bubbles/chips.
import { createContext, useContext, useMemo, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import type { CalendarEvent, Meal, MealCategory, Profile } from "../../../shared/types";
import { useApp, useLive } from "../../lib/store";
import { Avatar, AvatarStack } from "../../components/ui";
import { fmtRange, fmtTime, shortDate, weatherEmoji } from "../../lib/format";
import { dayOf, eventBackground, eventColors, isPast, lastDay, type CalSettings } from "./model";

// ---------- Settings helpers ----------

export function useCalSettings(): CalSettings {
  const { settings } = useApp();
  return useMemo(() => ({ ...settings.calendar, weekStartsOn: settings.weekStartsOn }), [settings.calendar, settings.weekStartsOn]);
}

/** Countdowns can be hidden from the preview bar per device (the server setting only controls the window). */
const HIDE_KEY = "haven-cal-hide-countdowns";
const hideListeners = new Set<() => void>();
function readHide(): boolean {
  try {
    return localStorage.getItem(HIDE_KEY) === "1";
  } catch {
    return false;
  }
}
export function setHideCountdowns(v: boolean) {
  try {
    localStorage.setItem(HIDE_KEY, v ? "1" : "0");
  } catch {
    /* ignore */
  }
  hideListeners.forEach((l) => l());
}
export function useHideCountdowns(): boolean {
  return useSyncExternalStore(
    (l) => {
      hideListeners.add(l);
      return () => hideListeners.delete(l);
    },
    readHide,
    () => false,
  );
}

// ---------- Data ----------

export function useEventProfiles() {
  const { profileById } = useApp();
  return (e: Pick<CalendarEvent, "profileIds">) => e.profileIds.map((id) => profileById(id)).filter((p): p is Profile => !!p);
}

/** Events (and meals) overlapping [from, to), filtered by the calendar's hidden profiles. */
export function useCalendarData(from: string, to: string) {
  const { settings, mealCategories, profiles } = useApp();
  const hidden = settings.calendar.hiddenProfiles;
  const { data: raw } = useLive<CalendarEvent[]>(`/api/events?from=${from}&to=${to}`, ["events", "calendars"]);
  const { data: rawMeals } = useLive<Meal[]>(settings.calendar.showMeals ? `/api/meals?from=${from}&to=${to}` : null, ["meals"]);
  const events = useMemo(() => {
    const known = new Set(profiles.map((p) => p.id));
    return (raw ?? []).filter((e) => {
      const ids = e.profileIds.filter((id) => known.has(id));
      return !ids.length || ids.some((id) => !hidden.includes(id));
    });
  }, [raw, hidden, profiles]);
  const meals = useMemo(() => {
    if (!settings.calendar.showMeals) return [];
    const cats = new Map(mealCategories.map((c) => [c.id, c]));
    return (rawMeals ?? []).filter((m) => cats.get(m.categoryId)?.showOnCalendar && m.date >= from && m.date < to);
  }, [rawMeals, mealCategories, settings.calendar.showMeals, from, to]);
  return { events, meals, loading: raw === undefined };
}

export function useMealCategory() {
  const { mealCategories } = useApp();
  return (m: Meal): MealCategory | undefined => mealCategories.find((c) => c.id === m.categoryId);
}

export function useWeatherFor() {
  const { weather, settings, today } = useApp();
  return (date: string) => {
    if (!settings.calendar.showWeather || date < today) return null;
    return weather.daily.find((d) => d.date === date) ?? null;
  };
}

// ---------- Actions context ----------

export interface AddDefaults {
  date: string;
  time?: string;
  allDay?: boolean;
}

interface CalActions {
  openEvent: (e: CalendarEvent) => void;
  openMeal: (m: Meal) => void;
  addEvent: (d: AddDefaults) => void;
  /** Open a day (Day view in the full screen). */
  openDay?: (date: string) => void;
}

export const CalActionsCtx = createContext<CalActions | null>(null);
export function useCalActions(): CalActions {
  const v = useContext(CalActionsCtx);
  if (!v) throw new Error("Calendar actions missing");
  return v;
}

// ---------- Event look ----------

export function useEventLook() {
  const { settings, now } = useApp();
  const profilesOf = useEventProfiles();
  return (e: CalendarEvent, amount?: number) => {
    const profiles = profilesOf(e);
    const past = settings.calendar.dimPastEvents && isPast(e, now);
    const colors = eventColors(e, profiles);
    return {
      profiles,
      past,
      color: colors[0],
      background: eventBackground(colors, { multi: settings.calendar.colorCodeMultiProfile && !e.color, past, amount }),
    };
  };
}

export function eventTime(e: CalendarEvent, h24: boolean): string {
  if (e.allDay) {
    const l = lastDay(e);
    return l > e.start ? `${shortDate(e.start)} – ${shortDate(l)}` : "All day";
  }
  if (dayOf(e.end) > dayOf(e.start) && lastDay(e) > dayOf(e.start)) return `${fmtTime(e.start, h24)} – ${shortDate(dayOf(e.end))}, ${fmtTime(e.end, h24)}`;
  return fmtRange(e.start, e.end, h24);
}

export function EventAvatars({ e, profiles, size = 30, max = 3 }: { e: CalendarEvent; profiles: Profile[]; size?: number; max?: number }) {
  if (!profiles.length)
    return e.source === "google" ? (
      <span className="avatar cal-g" style={{ width: size, height: size, fontSize: size * 0.45 }}>
        G
      </span>
    ) : null;
  if (profiles.length === 1) return <Avatar profile={profiles[0]} size={size} style={{ boxShadow: "0 0 0 2px rgba(255,255,255,.7)" }} />;
  return <AvatarStack profiles={profiles} size={size} max={max} />;
}

/** Title with the countdown emoji (unless it is only the generic calendar fallback). */
export function titleOf(e: CalendarEvent) {
  return e.emoji && e.countdown && e.emoji !== "📅" ? `${e.emoji} ${e.title}` : e.title;
}

/** Two-line bubble: title, time; avatars at the right. Used by Week, Day and lists. */
export function EventBlock({ e, size = "md", showDate = false }: { e: CalendarEvent; size?: "sm" | "md" | "lg"; showDate?: boolean }) {
  const { settings } = useApp();
  const look = useEventLook();
  const { openEvent } = useCalActions();
  const l = look(e);
  return (
    <button
      type="button"
      className={`cal-block ${size} ${l.past ? "past" : ""}`}
      style={{ background: l.background }}
      onClick={(ev) => {
        ev.stopPropagation();
        openEvent(e);
      }}
    >
      <span className="cal-block-text">
        <span className="cal-title truncate">{titleOf(e)}</span>
        <span className="cal-time truncate">
          {showDate && !e.allDay ? `${shortDate(dayOf(e.start))} · ` : ""}
          {eventTime(e, settings.clock24h)}
        </span>
      </span>
      <EventAvatars e={e} profiles={l.profiles} size={size === "lg" ? 34 : size === "sm" ? 26 : 30} />
    </button>
  );
}

/** One-line chip for the month grid. */
export function EventChip({ e, style, continues }: { e: CalendarEvent; style?: CSSProperties; continues?: { left: boolean; right: boolean } }) {
  const { settings } = useApp();
  const look = useEventLook();
  const { openEvent } = useCalActions();
  const l = look(e);
  const timed = !e.allDay;
  return (
    <button
      type="button"
      className={`cal-chip ${l.past ? "past" : ""} ${continues?.left ? "cont-l" : ""} ${continues?.right ? "cont-r" : ""}`}
      style={{ background: l.background, ...style }}
      onClick={(ev) => {
        ev.stopPropagation();
        openEvent(e);
      }}
      title={e.title}
    >
      {timed && <span className="cal-chip-time">{fmtTime(e.start, settings.clock24h)}</span>}
      <span className="truncate">{titleOf(e)}</span>
    </button>
  );
}

export function MealChip({ m, block = false, style }: { m: Meal; block?: boolean; style?: CSSProperties }) {
  const cat = useMealCategory()(m);
  const { openMeal } = useCalActions();
  const color = cat?.color ?? "#9F9F9F";
  return (
    <button
      type="button"
      className={block ? "cal-block meal" : "cal-chip meal"}
      style={{ boxShadow: `inset 0 0 0 2px ${color}`, ...style }}
      onClick={(ev) => {
        ev.stopPropagation();
        openMeal(m);
      }}
      title={`${cat?.name ?? "Meal"}: ${m.title}`}
    >
      {block ? (
        <span className="cal-block-text">
          <span className="cal-title truncate">{m.title}</span>
          <span className="cal-time truncate" style={{ color }}>
            {cat?.name ?? "Meal"}
          </span>
        </span>
      ) : (
        <span className="truncate">{m.title}</span>
      )}
    </button>
  );
}

export function WeatherTag({ date, temp = false }: { date: string; temp?: boolean }) {
  const w = useWeatherFor()(date);
  if (!w) return null;
  return (
    <span className="cal-wx" title={`${w.max}° / ${w.min}°`}>
      <span aria-hidden>{weatherEmoji(w.code)}</span>
      {temp && <span className="serif">{w.max}°</span>}
    </span>
  );
}

export function DayNum({ date, today, children }: { date: string; today: string; children?: ReactNode }) {
  const num = Number(date.slice(8, 10));
  return <span className={`cal-num ${date === today ? "today" : ""}`}>{children ?? num}</span>;
}

export function useLocalState<T>(key: string, init: T): [T, (v: T) => void] {
  const [v, setV] = useState<T>(() => {
    try {
      const s = sessionStorage.getItem(key);
      return s ? (JSON.parse(s) as T) : init;
    } catch {
      return init;
    }
  });
  return [
    v,
    (x: T) => {
      setV(x);
      try {
        sessionStorage.setItem(key, JSON.stringify(x));
      } catch {
        /* ignore */
      }
    },
  ];
}
