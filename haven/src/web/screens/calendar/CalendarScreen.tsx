import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, ChevronLeft, ChevronRight, EyeOff } from "lucide-react";
import type { CalendarView } from "../../../shared/types";
import { Fab, Header } from "../../components/shell";
import { Popover } from "../../components/ui";
import { useApp } from "../../lib/store";
import { CalendarActions, CalendarBody, scheduleDaysFor } from "./CalendarPane";
import { CountdownBar } from "./CountdownBar";
import { FilterPopover } from "./FilterPopover";
import { isCurrentPeriod, periodLabel, periodRange, stepAnchor } from "./model";
import { useCalActions, useCalSettings } from "./shared";
import "./calendar.css";

const VIEWS: { id: CalendarView; label: string }[] = [
  { id: "schedule", label: "Schedule" },
  { id: "day", label: "Day" },
  { id: "week", label: "Week" },
  { id: "month", label: "Month" },
];

export default function CalendarScreen() {
  const { today, isPhone } = useApp();
  const s = useCalSettings();
  const [view, setView] = useState<CalendarView>(() => {
    try {
      const v = sessionStorage.getItem("haven-cal-view") as CalendarView | null;
      if (v && VIEWS.some((x) => x.id === v)) return v;
    } catch {
      /* ignore */
    }
    return isPhone && s.defaultView !== "day" ? "schedule" : s.defaultView;
  });
  const [anchor, setAnchor] = useState(today);
  const [viewMenu, setViewMenu] = useState<HTMLElement | null>(null);
  const [filter, setFilter] = useState<HTMLElement | null>(null);

  // Follow "today" across midnight when showing the current day.
  const lastToday = useRef(today);
  useEffect(() => {
    if (lastToday.current !== today) {
      setAnchor((a) => (a === lastToday.current ? today : a));
      lastToday.current = today;
    }
  }, [today]);

  const chooseView = (v: CalendarView) => {
    setView(v);
    try {
      sessionStorage.setItem("haven-cal-view", v);
    } catch {
      /* ignore */
    }
  };

  const scheduleDays = scheduleDaysFor(s, false, isPhone);
  const opts = { scheduleDays };
  const current = isCurrentPeriod(view, anchor, today, s, opts);
  const step = (dir: number) => setAnchor(stepAnchor(view, anchor, dir, s, opts));
  const title = current || isPhone ? undefined : periodLabel(view, anchor, s, false, opts);

  const touch = useRef<{ x: number; y: number } | null>(null);

  return (
    <CalendarActions
      openDay={(d) => {
        setAnchor(d);
        chooseView("day");
      }}
    >
      <Header title={title}>
        <button type="button" className={`pill ${isPhone ? "sm" : ""}`} onClick={(e) => setViewMenu(e.currentTarget)} aria-haspopup="menu">
          {VIEWS.find((v) => v.id === view)?.label}
          <ChevronDown />
        </button>
        <button type="button" className={`pill ${isPhone ? "icon sm" : ""}`} onClick={(e) => setFilter(e.currentTarget)} aria-label="Filter">
          <EyeOff />
          {!isPhone && "Filter"}
        </button>
        {!isPhone && (
          <>
            <button type="button" className="pill icon" onClick={() => step(-1)} aria-label="Previous">
              <ChevronLeft />
            </button>
            <button type="button" className={`pill ${current ? "cal-today-on" : ""}`} onClick={() => setAnchor(today)}>
              Today
            </button>
            <button type="button" className="pill icon" onClick={() => step(1)} aria-label="Next">
              <ChevronRight />
            </button>
          </>
        )}
      </Header>
      <div className="screen no-pad cal-screen">
        {isPhone && (
          <div className="cal-phone-nav">
            <button type="button" className="pill icon sm" onClick={() => step(-1)} aria-label="Previous">
              <ChevronLeft />
            </button>
            <span className="serif cal-phone-label truncate">{periodLabel(view, anchor, s, false, opts)}</span>
            <button type="button" className="pill icon sm" onClick={() => step(1)} aria-label="Next">
              <ChevronRight />
            </button>
            <button type="button" className={`pill sm ${current ? "cal-today-on" : ""}`} onClick={() => setAnchor(today)}>
              Today
            </button>
          </div>
        )}
        <CountdownBarWithActions />
        <div
          className="cal-body"
          onTouchStart={(e) => (touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY })}
          onTouchEnd={(e) => {
            const t = touch.current;
            touch.current = null;
            if (!t) return;
            const dx = e.changedTouches[0].clientX - t.x;
            const dy = e.changedTouches[0].clientY - t.y;
            if (Math.abs(dx) > 80 && Math.abs(dx) > Math.abs(dy) * 2) step(dx < 0 ? 1 : -1);
          }}
        >
          <CalendarBody view={view} anchor={anchor} onAnchor={setAnchor} scheduleDays={scheduleDays} />
        </div>
      </div>
      <AddFab view={view} anchor={anchor} scheduleDays={scheduleDays} />
      {viewMenu && (
        <Popover anchor={viewMenu} onClose={() => setViewMenu(null)} width={260}>
          <div role="menu">
            {VIEWS.map((v) => (
              <button
                key={v.id}
                type="button"
                role="menuitemradio"
                aria-checked={v.id === view}
                className="menu-row"
                onClick={() => {
                  chooseView(v.id);
                  setViewMenu(null);
                }}
              >
                <span className="grow">{v.label}</span>
                {v.id === view && <Check />}
              </button>
            ))}
          </div>
        </Popover>
      )}
      {filter && <FilterPopover anchor={filter} onClose={() => setFilter(null)} />}
    </CalendarActions>
  );
}

function CountdownBarWithActions() {
  const { openEvent } = useCalActions();
  return <CountdownBar onOpenEvent={openEvent} />;
}

function AddFab({ view, anchor, scheduleDays }: { view: CalendarView; anchor: string; scheduleDays: number }) {
  const { today } = useApp();
  const s = useCalSettings();
  const { addEvent } = useCalActions();
  const { from, to } = periodRange(view, anchor, s, { scheduleDays });
  const date =
    view === "day" ? anchor : today >= from && today < to ? today : view === "month" && !s.monthStartsThisWeek ? anchor.slice(0, 8) + "01" : from;
  return <Fab onClick={() => addEvent({ date })} label="Add event" />;
}
