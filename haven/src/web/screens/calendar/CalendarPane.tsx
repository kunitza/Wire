import { useMemo, useState, type ReactNode } from "react";
import type { CalendarEvent, CalendarView, Meal } from "../../../shared/types";
import { addDays } from "../../../shared/dates";
import { useApp } from "../../lib/store";
import { EventDetails, MealDetails } from "./EventDetails";
import { EventForm, type EventFormProps } from "./EventForm";
import { periodRange, stepAnchor, isCurrentPeriod, periodLabel, type CalSettings } from "./model";
import { CalActionsCtx, useCalSettings, useCalendarData, type AddDefaults } from "./shared";
import { ScheduleView } from "./ScheduleView";
import { DayView } from "./DayView";
import { WeekView } from "./WeekView";
import { MonthView } from "./MonthView";
import "./calendar.css";

export { EventForm, type EventFormProps } from "./EventForm";
export { CountdownBar } from "./CountdownBar";
export { stepAnchor, isCurrentPeriod, periodLabel, periodRange };

/**
 * Provides event details / add / edit dialogs to the calendar views inside it.
 * `openDay` is called when a day number is tapped (e.g. switch to the Day view).
 */
export function CalendarActions({ children, openDay }: { children: ReactNode; openDay?: (d: string) => void }) {
  const [details, setDetails] = useState<CalendarEvent | null>(null);
  const [meal, setMeal] = useState<Meal | null>(null);
  const [form, setForm] = useState<(AddDefaults & { event?: CalendarEvent }) | null>(null);
  const value = useMemo(
    () => ({
      openEvent: (e: CalendarEvent) => setDetails(e),
      openMeal: (m: Meal) => setMeal(m),
      addEvent: (d: AddDefaults) => setForm(d),
      openDay,
    }),
    [openDay],
  );
  return (
    <CalActionsCtx.Provider value={value}>
      {children}
      {details && (
        <EventDetails
          event={details}
          onClose={() => setDetails(null)}
          onEdit={() => {
            setForm({ date: details.start.slice(0, 10), event: details });
            setDetails(null);
          }}
        />
      )}
      {meal && <MealDetails meal={meal} onClose={() => setMeal(null)} />}
      {form && <EventForm key={form.event?.key ?? "new"} {...form} onClose={() => setForm(null)} />}
    </CalActionsCtx.Provider>
  );
}

/** Number of schedule columns: the setting, capped for small spaces. */
export function scheduleDaysFor(s: CalSettings, compact: boolean, isPhone: boolean): number {
  return compact || isPhone ? Math.min(3, s.scheduleDays) : s.scheduleDays;
}

/** Renders one calendar view for a period (no header). */
export function CalendarBody({
  view,
  anchor,
  onAnchor,
  compact = false,
  scheduleDays,
}: {
  view: CalendarView;
  anchor: string;
  onAnchor: (d: string) => void;
  compact?: boolean;
  scheduleDays: number;
}) {
  const s = useCalSettings();
  const { from, to } = periodRange(view, anchor, s, { scheduleDays });
  const { events, meals } = useCalendarData(from, to);
  switch (view) {
    case "schedule":
      return <ScheduleView from={from} to={to} events={events} meals={meals} compact={compact} />;
    case "day":
      return <DayView date={anchor} events={events} meals={meals} compact={compact} onPick={onAnchor} />;
    case "week":
      return <WeekView from={from} events={events} meals={meals} compact={compact} onNextWeek={() => onAnchor(addDays(from, 7))} />;
    case "month":
      return <MonthView from={from} to={to} month={s.monthStartsThisWeek ? null : anchor.slice(0, 7)} events={events} meals={meals} compact={compact} />;
  }
}

/**
 * Compact calendar for the Home screen's calendar panel (the panel draws its own header with the
 * view pill and ‹ Today ›; use `stepAnchor` / `isCurrentPeriod` for those). Tapping a month day
 * number calls `onView("day")` when given.
 */
export function CalendarPane({ view, anchor, onAnchor, onView }: { view: CalendarView; anchor: string; onAnchor: (d: string) => void; onView?: (v: CalendarView) => void }) {
  const s = useCalSettings();
  const openDay = useMemo(
    () =>
      (d: string) => {
        onAnchor(d);
        onView?.("day");
      },
    [onAnchor, onView],
  );
  return (
    <CalendarActions openDay={openDay}>
      <div className="cal-pane">
        <CalendarBody view={view} anchor={anchor} onAnchor={onAnchor} compact scheduleDays={scheduleDaysFor(s, true, false)} />
      </div>
    </CalendarActions>
  );
}

/** Navigation helpers for the Home panel's own ‹ Today › controls (matches CalendarPane's period sizes). */
export function usePaneNav(view: CalendarView, anchor: string) {
  const s = useCalSettings();
  const { today } = useApp();
  const opts = { scheduleDays: scheduleDaysFor(s, true, false) };
  return {
    step: (dir: number) => stepAnchor(view, anchor, dir, s, opts),
    isCurrent: isCurrentPeriod(view, anchor, today, s, opts),
    label: periodLabel(view, anchor, s, false, opts),
  };
}
