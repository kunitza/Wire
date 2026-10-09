import { useRef, useState } from "react";
import { Calendar, Check, ChevronDown, ChevronLeft, ChevronRight, LayoutGrid, List as ListIcon } from "lucide-react";
import { Fab, Header } from "../components/shell";
import { Popover, ToggleRow } from "../components/ui";
import { useApp } from "../lib/store";
import { put } from "../lib/api";
import { addDays } from "../../shared/dates";
import type { CalendarView } from "../../shared/types";
import { CalendarPane } from "./calendar/CalendarPane";
import { TodayTasksPane } from "./tasks/TodayTasksPane";
import { ListsPane } from "./lists/ListsPane";
import { HomeAdd } from "./HomeAdd";
import "./home.css";

const VIEWS: { id: CalendarView; label: string }[] = [
  { id: "schedule", label: "Schedule" },
  { id: "day", label: "Day" },
  { id: "week", label: "Week" },
  { id: "month", label: "Month" },
];

const STEP: Record<CalendarView, number> = { schedule: 1, day: 1, week: 7, month: 30 };

export default function HomeScreen() {
  const { settings, today, run, isPhone } = useApp();
  const home = settings.home;
  const [anchor, setAnchor] = useState(today);
  const [customize, setCustomize] = useState<HTMLElement | null>(null);
  const [viewMenu, setViewMenu] = useState<HTMLElement | null>(null);
  const [adding, setAdding] = useState<HTMLElement | null>(null);
  const fabRef = useRef<HTMLDivElement>(null);
  const view = home.calendarView;
  const save = (patch: Partial<typeof home>) => run(() => put("/api/settings", { home: { ...home, ...patch } }));
  const step = (dir: number) => {
    if (view === "month") {
      const [y, m] = anchor.split("-").map(Number);
      const d = new Date(Date.UTC(y, m - 1 + dir, 1));
      setAnchor(d.toISOString().slice(0, 10));
    } else setAnchor(addDays(anchor, dir * (view === "schedule" ? Math.max(1, Math.min(settings.calendar.scheduleDays, isPhone ? 1 : 3)) : STEP[view])));
  };
  const showRight = home.showTasks || home.showLists;

  return (
    <>
      <Header>
        <button className="pill" onClick={(e) => setCustomize(e.currentTarget)}>
          <LayoutGrid />
          <span className="hide-phone">Customize</span>
        </button>
      </Header>
      <div className={`screen home-grid ${showRight ? "" : "solo"}`}>
        <section className="panel home-cal" aria-label="Calendar">
          <div className="panel-head">
            <Calendar />
            Calendar
            <span className="spacer" />
            <button className="pill sm" onClick={(e) => setViewMenu(e.currentTarget)} style={{ textTransform: "none", letterSpacing: 0 }}>
              {VIEWS.find((v) => v.id === view)?.label}
              <ChevronDown size={16} />
            </button>
            <button className="pill icon sm" aria-label="Previous" onClick={() => step(-1)}>
              <ChevronLeft />
            </button>
            <button className="pill sm" style={{ textTransform: "none", letterSpacing: 0 }} disabled={anchor === today} onClick={() => setAnchor(today)}>
              Today
            </button>
            <button className="pill icon sm" aria-label="Next" onClick={() => step(1)}>
              <ChevronRight />
            </button>
          </div>
          <div className="home-cal-body">
            <CalendarPane view={view} anchor={anchor} onAnchor={setAnchor} />
          </div>
        </section>
        {showRight && (
          <div className="home-right">
            {home.showTasks && (
              <section className="panel home-tasks" aria-label="Today's tasks">
                <div className="panel-head">
                  <Check />
                  Today's Tasks
                </div>
                <div className="panel-body">
                  <TodayTasksPane />
                </div>
              </section>
            )}
            {home.showLists && (
              <section className="panel home-lists" aria-label="Lists">
                <div className="panel-head">
                  <ListIcon />
                  Lists
                </div>
                <div className="panel-body">
                  <ListsPane />
                </div>
              </section>
            )}
          </div>
        )}
      </div>
      <div ref={fabRef}>
        <Fab onClick={() => setAdding(fabRef.current?.querySelector("button") ?? null)} />
      </div>
      {adding && <HomeAdd anchor={adding} day={anchor} onClose={() => setAdding(null)} />}

      {viewMenu && (
        <Popover anchor={viewMenu} onClose={() => setViewMenu(null)} width={240} align="center">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              className="menu-row"
              onClick={() => {
                save({ calendarView: v.id });
                setViewMenu(null);
              }}
            >
              <span className="grow">{v.label}</span>
              {v.id === view && <Check />}
            </button>
          ))}
        </Popover>
      )}
      {customize && (
        <Popover anchor={customize} onClose={() => setCustomize(null)} width={380}>
          <div className="col" style={{ gap: 8 }}>
            <div className="menu-row" style={{ background: "transparent", fontWeight: 700, minHeight: 36 }}>
              Show on Home
            </div>
            <ToggleRow label="Calendar" hint="Always shown" on onChange={() => undefined} />
            <ToggleRow label="Today's Tasks" on={home.showTasks} onChange={(v) => save({ showTasks: v })} />
            <ToggleRow label="Lists" on={home.showLists} onChange={(v) => save({ showLists: v })} />
          </div>
        </Popover>
      )}
    </>
  );
}
