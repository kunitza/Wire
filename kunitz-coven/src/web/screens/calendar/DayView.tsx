import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { CalendarEvent, Meal } from "../../../shared/types";
import { addDays, addMonths, eachDay, parseDate, startOfMonth, startOfWeek } from "../../../shared/dates";
import { useApp } from "../../lib/store";
import { DOW, longDate, monthName } from "../../lib/format";
import { onDay, sortEvents } from "./model";
import { EventBlock, MealChip, WeatherTag, useCalActions, useWeatherFor } from "./shared";
import { weatherLabel } from "../../lib/format";

interface Props {
  date: string;
  events: CalendarEvent[];
  meals: Meal[];
  compact?: boolean;
  onPick: (d: string) => void;
}

export function dayHeading(date: string, today: string): string {
  if (date === today) return "Today";
  if (date === addDays(today, 1)) return "Tomorrow";
  if (date === addDays(today, -1)) return "Yesterday";
  return longDate(date);
}

export function DayView({ date, events, meals, compact, onPick }: Props) {
  const { today, isPhone } = useApp();
  const { addEvent } = useCalActions();
  const wx = useWeatherFor()(date);
  const evs = events.filter((e) => onDay(e, date)).sort(sortEvents);
  const ms = meals.filter((m) => m.date === date);
  const showMini = !isPhone && !compact;
  return (
    <div className={`cal-day ${compact ? "compact" : ""}`}>
      {showMini && <MiniMonth date={date} onPick={onPick} />}
      <div className="cal-day-main">
        <div className="cal-day-head">
          <div className="serif cal-day-heading">{dayHeading(date, today)}</div>
          {wx && (
            <span className="cal-day-wx">
              <WeatherTag date={date} temp /> <span className="muted">{weatherLabel(wx.code)}</span>
            </span>
          )}
        </div>
        <div className="cal-day-list">
          {evs.map((e) => (
            <EventBlock key={e.key} e={e} size={compact ? "md" : "lg"} />
          ))}
          {ms.map((m) => (
            <MealChip key={m.key} m={m} block />
          ))}
          {!evs.length && !ms.length && (
            <div className="empty" style={{ paddingTop: compact ? 20 : 60 }}>
              <div className="big">😊</div>
              <div>Nothing on the calendar.</div>
              <button type="button" className="pill" onClick={() => addEvent({ date })}>
                Add Event
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MiniMonth({ date, onPick }: { date: string; onPick: (d: string) => void }) {
  const { today, settings } = useApp();
  const [month, setMonth] = useState(startOfMonth(date));
  useEffect(() => setMonth(startOfMonth(date)), [date]);
  const from = startOfWeek(month, settings.weekStartsOn);
  const days = eachDay(from, addDays(from, 42));
  const m = parseDate(month);
  const dows = Array.from({ length: 7 }, (_, i) => DOW[(i + settings.weekStartsOn) % 7]);
  return (
    <div className="cal-mini">
      <div className="cal-mini-head">
        <span className="serif">
          {monthName(m.getUTCMonth(), true)} {m.getUTCFullYear()}
        </span>
        <span className="row" style={{ gap: 4 }}>
          <button type="button" className="pill icon sm" aria-label="Previous month" onClick={() => setMonth(addMonths(month, -1))}>
            <ChevronLeft />
          </button>
          <button type="button" className="pill icon sm" aria-label="Next month" onClick={() => setMonth(addMonths(month, 1))}>
            <ChevronRight />
          </button>
        </span>
      </div>
      <div className="cal-mini-grid">
        {dows.map((d) => (
          <span key={d} className="cal-mini-dow">
            {d}
          </span>
        ))}
        {days.map((d) => (
          <button
            key={d}
            type="button"
            className={`cal-mini-day ${d < today ? "past" : ""} ${d === today ? "today" : ""} ${d === date ? "sel" : ""}`}
            onClick={() => onPick(d)}
          >
            <span>{Number(d.slice(8))}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
