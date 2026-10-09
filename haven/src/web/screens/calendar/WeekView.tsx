import { useMemo } from "react";
import type { CalendarEvent, Meal } from "../../../shared/types";
import { addDays, dayOfWeek, eachDay } from "../../../shared/dates";
import { useApp } from "../../lib/store";
import { DOW, isWeekend, plural, rangeLabel } from "../../lib/format";
import { onDay, sortEvents } from "./model";
import { EventBlock, MealChip, WeatherTag, useCalActions } from "./shared";

interface Props {
  from: string;
  events: CalendarEvent[];
  meals: Meal[];
  compact?: boolean;
  onNextWeek: () => void;
}

export function WeekView({ from, events, meals, compact, onNextWeek }: Props) {
  const { today, settings, isPhone } = useApp();
  const { addEvent } = useCalActions();
  const days = useMemo(() => eachDay(from, addDays(from, 7)), [from]);
  const next = addDays(from, 7);
  const list = isPhone && !compact;

  return (
    <div className={`cal-week ${list ? "list" : ""} ${compact ? "compact" : ""}`}>
      {days.map((d) => {
        const evs = events.filter((e) => onDay(e, d)).sort(sortEvents);
        const ms = meals.filter((m) => m.date === d);
        const count = evs.length;
        return (
          <section key={d} className={`cal-wcell ${settings.calendar.shadeWeekends && isWeekend(d) ? "weekend" : ""}`} aria-label={d}>
            <div className="cal-wcell-head">
              <span className="cal-dayname serif">
                {DOW[dayOfWeek(d)]} <span className={`cal-num ${d === today ? "today" : ""}`}>{Number(d.slice(8))}</span>
              </span>
              <WeatherTag date={d} temp />
            </div>
            <div className="cal-wcell-sub">
              <span>{count ? `${plural(count, "event")}${d === today ? " today" : ""}` : "No events"}</span>
              <button type="button" className="cal-add" onClick={() => addEvent({ date: d })}>
                + Add Event
              </button>
            </div>
            <div className="cal-wcell-list">
              {evs.map((e) => (
                <EventBlock key={e.key} e={e} size={compact ? "sm" : "md"} />
              ))}
              {ms.map((m) => (
                <MealChip key={m.key} m={m} block />
              ))}
            </div>
          </section>
        );
      })}
      <button type="button" className="cal-wcell cal-next" onClick={onNextWeek}>
        <span className="cal-dayname serif">Next Week</span>
        <span className="cal-wcell-sub">{rangeLabel(next, addDays(next, 6))}</span>
      </button>
    </div>
  );
}
