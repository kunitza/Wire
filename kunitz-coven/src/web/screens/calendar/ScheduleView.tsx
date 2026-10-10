import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { CalendarEvent, Meal } from "../../../shared/types";
import { dayOfWeek, diffDays, eachDay } from "../../../shared/dates";
import { useApp } from "../../lib/store";
import { DOW, fmtTime, isWeekend } from "../../lib/format";
import { dayOf, hhmm, isBar, lastDay, layoutDay, minutesOf, onDay, packLanes } from "./model";
import { EventAvatars, MealChip, WeatherTag, eventTime, titleOf, useCalActions, useEventLook } from "./shared";

interface Props {
  from: string;
  to: string;
  events: CalendarEvent[];
  meals: Meal[];
  compact?: boolean;
}

type BarItem = { kind: "event"; e: CalendarEvent } | { kind: "meal"; m: Meal };

export function ScheduleView({ from, to, events, meals, compact }: Props) {
  const { today, now, settings, isPhone } = useApp();
  const { addEvent, openEvent } = useCalActions();
  const look = useEventLook();
  const days = useMemo(() => eachDay(from, to), [from, to]);
  const n = days.length;
  const hourH = compact || isPhone ? 54 : 64;
  const scroller = useRef<HTMLDivElement>(null);
  const [colW, setColW] = useState(200);
  useLayoutEffect(() => {
    const el = scroller.current;
    const body = el?.querySelector(".cal-col") as HTMLElement | null;
    if (!el || !body) return;
    const measure = () => setColW(body.offsetWidth);
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    return () => ro.disconnect();
  }, [n]);

  // Start scrolled to about an hour before now (or 7 AM on other days).
  const showsToday = days.includes(today);
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const h = showsToday ? Math.max(0, now.getHours() - 1) : 7;
    el.scrollTop = h * hourH;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to, hourH]);

  const bars = useMemo(() => {
    const items: { item: BarItem; from: number; to: number }[] = [];
    for (const e of events) {
      if (!isBar(e)) continue;
      const a = Math.max(0, diffDays(dayOf(e.start), from));
      const b = Math.min(n - 1, diffDays(lastDay(e), from));
      if (b < 0 || a > n - 1) continue;
      items.push({ item: { kind: "event", e }, from: a, to: b });
    }
    for (const m of meals) {
      const i = diffDays(m.date, from);
      if (i >= 0 && i < n) items.push({ item: { kind: "meal", m }, from: i, to: i });
    }
    return packLanes(items);
  }, [events, meals, from, n]);

  const timed = useMemo(
    () =>
      days.map((d) =>
        layoutDay(
          events
            .filter((e) => !isBar(e) && onDay(e, d))
            .map((e) => {
              const s = dayOf(e.start) < d ? 0 : minutesOf(e.start);
              const end = dayOf(e.end) > d ? 1440 : minutesOf(e.end);
              return { item: e, start: s, end: end > s ? end : s + 30 };
            }),
          hourH >= 60 ? 28 : 32,
        ),
      ),
    [days, events, hourH],
  );

  const nowMin = now.getHours() * 60 + now.getMinutes();
  const cols = `var(--cal-gutter) repeat(${n}, minmax(0, 1fr))`;

  return (
    <div className={`cal-sched ${compact ? "compact" : ""}`} ref={scroller} style={{ ["--hour" as string]: `${hourH}px` }}>
      <div className="cal-sched-head">
        <div className="cal-sched-days" style={{ gridTemplateColumns: cols }}>
          <span />
          {days.map((d) => (
            <div key={d} className={`cal-sched-dayhead ${settings.calendar.shadeWeekends && isWeekend(d) ? "weekend" : ""}`}>
              <span className="cal-dayname serif">
                {DOW[dayOfWeek(d)]} <span className={`cal-num ${d === today ? "today" : ""}`}>{Number(d.slice(8))}</span>
              </span>
              <WeatherTag date={d} />
            </div>
          ))}
        </div>
        {bars.length > 0 && (
          <div className="cal-allday" style={{ gridTemplateColumns: cols }}>
            {bars.map(({ item, from: a, to: b, lane }) => {
              const style = { gridColumn: `${a + 2} / ${b + 3}`, gridRow: lane + 1 };
              if (item.kind === "meal") return <MealChip key={item.m.key} m={item.m} style={style} />;
              const e = item.e;
              const l = look(e);
              return (
                <AllDayPill key={e.key} e={e} style={style} background={l.background} past={l.past} cutL={dayOf(e.start) < from} cutR={lastDay(e) >= to} />
              );
            })}
          </div>
        )}
      </div>
      <div className="cal-sched-body" style={{ gridTemplateColumns: cols, height: hourH * 24 }}>
        <div className="cal-gutter">
          {Array.from({ length: 23 }, (_, i) => i + 1).map((h) => (
            <span key={h} style={{ top: h * hourH }}>
              {fmtTime(`${String(h).padStart(2, "0")}:00`, settings.clock24h)}
            </span>
          ))}
        </div>
        {days.map((d, i) => (
          <div
            key={d}
            className={`cal-col ${settings.calendar.shadeWeekends && isWeekend(d) ? "weekend" : ""}`}
            onClick={(ev) => {
              const r = ev.currentTarget.getBoundingClientRect();
              const mins = Math.floor(((ev.clientY - r.top) / hourH) * 2) * 30;
              addEvent({ date: d, time: hhmm(Math.min(mins, 23 * 60)) });
            }}
          >
            {timed[i].map((p) => {
              const e = p.item;
              const l = look(e);
              const h = ((p.bottom - p.top) / 60) * hourH - 3;
              const w = colW / p.cols - 8;
              const narrow = w < 84;
              const tall = h >= (compact ? 46 : 50) && !narrow;
              return (
                <button
                  type="button"
                  key={e.key}
                  className={`cal-timed ${l.past ? "past" : ""} ${narrow ? "narrow" : tall ? "" : "short"}`}
                  style={{
                    top: (p.top / 60) * hourH + 1,
                    height: h,
                    left: `calc(${(p.col / p.cols) * 100}% + 4px)`,
                    width: `calc(${100 / p.cols}% - 8px)`,
                    background: l.background,
                  }}
                  onClick={(ev) => {
                    ev.stopPropagation();
                    openEvent(e);
                  }}
                  title={e.title}
                >
                  <span className={`cal-title ${narrow ? "" : tall && h > 90 ? "wrap" : "truncate"}`}>{titleOf(e)}</span>
                  {tall && (
                    <span className="cal-timed-row">
                      <span className="cal-time truncate">{eventTime(e, settings.clock24h)}</span>
                      {w >= 150 && <EventAvatars e={e} profiles={l.profiles} size={compact ? 22 : 28} max={2} />}
                    </span>
                  )}
                </button>
              );
            })}
            {d === today && (
              <div className="cal-nowline" style={{ top: (nowMin / 60) * hourH }} aria-hidden>
                <span />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function AllDayPill({ e, style, background, past, cutL, cutR }: { e: CalendarEvent; style: CSSProperties; background: string; past: boolean; cutL: boolean; cutR: boolean }) {
  const { openEvent } = useCalActions();
  return (
    <button
      type="button"
      className={`cal-chip allday ${past ? "past" : ""} ${cutL ? "cont-l" : ""} ${cutR ? "cont-r" : ""}`}
      style={{ ...style, background }}
      onClick={(ev) => {
        ev.stopPropagation();
        openEvent(e);
      }}
      title={e.title}
    >
      <span className="truncate">{titleOf(e)}</span>
    </button>
  );
}
