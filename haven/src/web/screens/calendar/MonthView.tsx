import { useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CalendarEvent, Meal } from "../../../shared/types";
import { addDays, diffDays, eachDay } from "../../../shared/dates";
import { useApp } from "../../lib/store";
import { DOW, isWeekend, longDate, monthName, plural } from "../../lib/format";
import { dayHeading } from "./DayView";
import { Popover } from "../../components/ui";
import { dayOf, isBar, lastDay, onDay, packLanes, sortEvents } from "./model";
import { EventBlock, EventChip, MealChip, WeatherTag, useCalActions, useEventLook } from "./shared";

interface Props {
  from: string;
  to: string;
  /** Month in focus ("YYYY-MM"), or null when the grid starts on the current week. */
  month: string | null;
  events: CalendarEvent[];
  meals: Meal[];
  compact?: boolean;
}

type Single = { kind: "event"; e: CalendarEvent } | { kind: "meal"; m: Meal };

export function MonthView(props: Props) {
  const { isPhone } = useApp();
  // Phones (including the Home panel) get dots + the chosen day's agenda; chips don't fit 7 columns at phone width.
  if (isPhone) return <PhoneMonth {...props} />;
  return <GridMonth {...props} />;
}

function dayLabel(d: string) {
  const n = Number(d.slice(8));
  return n === 1 ? `${monthName(Number(d.slice(5, 7)) - 1)} 1` : String(n);
}

function GridMonth({ from, to, events, meals, compact }: Props) {
  const { today, settings } = useApp();
  const { openDay, addEvent } = useCalActions();
  const weeks = Math.round(diffDays(to, from) / 7);
  const body = useRef<HTMLDivElement>(null);
  const [rowH, setRowH] = useState(120);
  const [more, setMore] = useState<{ el: HTMLElement; date: string } | null>(null);
  useLayoutEffect(() => {
    const el = body.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setRowH(el.clientHeight / weeks));
    ro.observe(el);
    setRowH(el.clientHeight / weeks);
    return () => ro.disconnect();
  }, [weeks]);
  const gap = 3;
  const fit = (chip: number, num: number) => Math.floor((rowH - num - 4 + gap) / (chip + gap));
  // Prefer roomy chips; shrink them a little when that buys a third row.
  const roomy = !compact && fit(30, 38) >= 3;
  const chipH = roomy ? 30 : compact ? 22 : 25;
  const numH = roomy ? 38 : compact ? 28 : 32;
  const slots = Math.max(2, Math.min(4, fit(chipH, numH)));

  const dows = Array.from({ length: 7 }, (_, i) => DOW[(i + settings.weekStartsOn) % 7]);
  const shade = settings.calendar.shadeWeekends;

  return (
    <div className={`cal-month ${compact ? "compact" : ""} ${roomy ? "" : "tight"}`} style={{ ["--chip" as string]: `${chipH}px`, ["--num" as string]: `${numH}px` }}>
      <div className="cal-month-dows">
        {dows.map((d) => (
          <span key={d} className="serif">
            {d}
          </span>
        ))}
      </div>
      <div className="cal-month-body" ref={body}>
        {Array.from({ length: weeks }, (_, w) => {
          const wFrom = addDays(from, w * 7);
          const days = eachDay(wFrom, addDays(wFrom, 7));
          // Multi-day bars, packed into lanes (only the first `slots - 1` lanes are drawn as bars).
          const multi = events.filter((e) => isBar(e) && lastDay(e) > dayOf(e.start) && dayOf(e.start) <= days[6] && lastDay(e) >= wFrom);
          const lanes = packLanes(multi.map((e) => ({ item: e, from: Math.max(0, diffDays(dayOf(e.start), wFrom)), to: Math.min(6, diffDays(lastDay(e), wFrom)) })));
          const drawn = lanes.filter((l) => l.lane < slots - 1);
          const overflowBars = new Set(lanes.filter((l) => l.lane >= slots - 1).map((l) => l.item.key));
          return (
            <div
              key={wFrom}
              className="cal-mrow"
              style={{ gridTemplateRows: `${numH}px repeat(${slots}, ${chipH}px) 1fr`, rowGap: gap }}
            >
              {days.map((d, i) => (
                <div
                  key={d}
                  className={`cal-mcell ${shade && isWeekend(d) ? "weekend" : ""}`}
                  style={{ gridColumn: i + 1, gridRow: "1 / -1" }}
                  onClick={() => addEvent({ date: d })}
                >
                  <div className="cal-mcell-top">
                    <WeatherTag date={d} />
                    <button
                      type="button"
                      className={`cal-mnum serif ${d === today ? "today" : d < today ? "past" : ""} ${d.endsWith("-01") ? "first" : ""}`}
                      onClick={(ev) => {
                        ev.stopPropagation();
                        openDay?.(d);
                      }}
                    >
                      {d === today ? Number(d.slice(8)) : dayLabel(d)}
                    </button>
                  </div>
                </div>
              ))}
              {drawn.map(({ item: e, from: a, to: b, lane }) => (
                <EventChip
                  key={`${e.key}-bar`}
                  e={e}
                  style={{ gridColumn: `${a + 1} / ${b + 2}`, gridRow: lane + 2 }}
                  continues={{ left: dayOf(e.start) < wFrom, right: lastDay(e) > days[6] }}
                />
              ))}
              {days.map((d, i) => {
                const taken = new Set(drawn.filter((l) => l.from <= i && l.to >= i).map((l) => l.lane));
                const singles: Single[] = [
                  ...events
                    .filter((e) => onDay(e, d) && (overflowBars.has(e.key) || !(isBar(e) && lastDay(e) > dayOf(e.start))))
                    .sort(sortEvents)
                    .map((e) => ({ kind: "event" as const, e })),
                  ...meals.filter((m) => m.date === d).map((m) => ({ kind: "meal" as const, m })),
                ];
                const free = Array.from({ length: slots }, (_, s) => s).filter((s) => !taken.has(s));
                const fits = singles.length <= free.length;
                const usable = fits ? free : free.filter((s) => s < slots - 1);
                const shown = singles.slice(0, usable.length);
                const hidden = singles.length - shown.length;
                return [
                  ...shown.map((it, k) => {
                    const style = { gridColumn: i + 1, gridRow: usable[k] + 2 };
                    return it.kind === "event" ? <EventChip key={`${it.e.key}-${d}`} e={it.e} style={style} /> : <MealChip key={it.m.key} m={it.m} style={style} />;
                  }),
                  hidden > 0 && (
                    <button
                      type="button"
                      key={`more-${d}`}
                      className="cal-more"
                      style={{ gridColumn: i + 1, gridRow: slots + 1 }}
                      onClick={(ev) => {
                        ev.stopPropagation();
                        setMore({ el: ev.currentTarget, date: d });
                      }}
                    >
                      {hidden} more
                    </button>
                  ),
                ];
              })}
            </div>
          );
        })}
      </div>
      {more && <DayPopover anchor={more.el} date={more.date} events={events} meals={meals} onClose={() => setMore(null)} />}
    </div>
  );
}

function DayPopover({ anchor, date, events, meals, onClose }: { anchor: HTMLElement; date: string; events: CalendarEvent[]; meals: Meal[]; onClose: () => void }) {
  const evs = events.filter((e) => onDay(e, date)).sort(sortEvents);
  const ms = meals.filter((m) => m.date === date);
  return (
    <Popover anchor={anchor} onClose={onClose} width={400} align="center">
      <div className="cal-daypop">
        <div className="serif cal-daypop-title">{longDate(date).split(", ")[1]}</div>
        <div className="muted">{evs.length ? plural(evs.length, "event") : "No events"}</div>
        <div className="col" style={{ gap: 6, marginTop: 6 }}>
          {evs.map((e) => (
            <EventBlock key={e.key} e={e} />
          ))}
          {ms.map((m) => (
            <MealChip key={m.key} m={m} block />
          ))}
        </div>
      </div>
    </Popover>
  );
}

/** Phone: a compact month with colored dots and the chosen day's agenda below. */
function PhoneMonth({ from, to, month, events, meals }: Props) {
  const { today, settings } = useApp();
  const look = useEventLook();
  const days = useMemo(() => eachDay(from, to), [from, to]);
  const initial = days.includes(today) ? today : month ? `${month}-01` : from;
  const [sel, setSel] = useState(initial);
  const selected = days.includes(sel) ? sel : initial;
  const dows = Array.from({ length: 7 }, (_, i) => DOW[(i + settings.weekStartsOn) % 7]);
  const evs = events.filter((e) => onDay(e, selected)).sort(sortEvents);
  const ms = meals.filter((m) => m.date === selected);
  return (
    <div className="cal-pmonth">
      <div className="cal-pmonth-grid">
        {dows.map((d) => (
          <span key={d} className="cal-pmonth-dow">
            {d.slice(0, 2)}
          </span>
        ))}
        {days.map((d) => {
          const de = events.filter((e) => onDay(e, d));
          const other = month && d.slice(0, 7) !== month;
          return (
            <button key={d} type="button" className={`cal-pday ${d === selected ? "sel" : ""} ${other ? "other" : ""}`} onClick={() => setSel(d)}>
              <span className={`cal-num ${d === today ? "today" : ""} ${d < today ? "past" : ""}`}>{Number(d.slice(8))}</span>
              <span className="cal-dots">
                {de.slice(0, 3).map((e) => (
                  <i key={e.key} style={{ background: look(e).color }} />
                ))}
              </span>
            </button>
          );
        })}
      </div>
      <div className="cal-pmonth-day">
        <div className="serif cal-day-heading">{dayHeading(selected, today)}</div>
        {evs.length === 0 && ms.length === 0 && <div className="muted" style={{ padding: "8px 2px" }}>No events</div>}
        <div className="col" style={{ gap: 6 }}>
          {evs.map((e) => (
            <EventBlock key={e.key} e={e} />
          ))}
          {ms.map((m) => (
            <MealChip key={m.key} m={m} block />
          ))}
        </div>
      </div>
    </div>
  );
}
