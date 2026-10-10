import { useEffect, useMemo, useState } from "react";
import { CalendarDays, CalendarRange, CheckCircle2, ChevronLeft, ChevronRight, Clock, EyeOff, House, SkipForward } from "lucide-react";
import type { DayPart, Profile, Settings, Task, TaskInstance } from "../../../shared/types";
import { addDays, eachDay, startOfWeek } from "../../../shared/dates";
import { Fab, Header } from "../../components/shell";
import { Avatar, Popover, ProgressRing, ToggleRow } from "../../components/ui";
import { useApp } from "../../lib/store";
import { put } from "../../lib/api";
import { dayLabel, headerDate, rangeLabel, shortDate, tint } from "../../lib/format";
import { ColAvatar, DoneChip, SECTIONS, StarChip, TaskChips, UfgAvatar, colKey, colorOf, partOfDay, progressOf, sectionOf, useTaskController, type Section, type TaskController } from "./taskKit";
import { ColumnTabs, RingButton, TaskCheck, TaskRow } from "./rows";
import "./tasks.css";

type View = "day" | "week";

function lsGet(k: string): string | null {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}
function lsSet(k: string, v: string) {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* ignore */
  }
}

export default function TasksScreen() {
  const { today, settings, isPhone } = useApp();
  const [view, setViewState] = useState<View>(() => (lsGet("haven-tasks-view") === "week" ? "week" : "day"));
  const [offset, setOffset] = useState(0);
  const [filter, setFilter] = useState<HTMLElement | null>(null);
  const setView = (v: View) => {
    setViewState(v);
    setOffset(0);
    lsSet("haven-tasks-view", v);
  };
  const day = addDays(today, offset);
  const weekStart = addDays(startOfWeek(today, settings.weekStartsOn), offset * 7);
  const from = view === "day" ? day : weekStart;
  const to = view === "day" ? addDays(day, 1) : addDays(weekStart, 7);
  const ctl = useTaskController(from, to);
  const dl = dayLabel(day);
  const title = isPhone
    ? view === "day"
      ? `${dl.dow} ${dl.num}`
      : `${shortDate(weekStart)}`
    : offset === 0
      ? undefined
      : view === "day"
        ? headerDate(day)
        : rangeLabel(weekStart, addDays(weekStart, 6));

  return (
    <>
      <Header title={title}>
        <div className="segmented" role="tablist">
          <button className={view === "day" ? "on" : ""} onClick={() => setView("day")} role="tab" aria-selected={view === "day"}>
            <CalendarDays aria-label={isPhone ? "Day" : undefined} />
            {!isPhone && "Day"}
          </button>
          <button className={view === "week" ? "on" : ""} onClick={() => setView("week")} role="tab" aria-selected={view === "week"}>
            <CalendarRange aria-label={isPhone ? "Week" : undefined} />
            {!isPhone && "Week"}
          </button>
        </div>
        <button className={`pill ${isPhone ? "icon" : ""}`} onClick={(e) => setFilter(e.currentTarget)} aria-label="Filter">
          <EyeOff />
          {!isPhone && "Filter"}
        </button>
        <button className="pill icon" aria-label={view === "day" ? "Previous day" : "Previous week"} onClick={() => setOffset(offset - 1)}>
          <ChevronLeft />
        </button>
        {(!isPhone || offset !== 0) && (
          <button className="pill" disabled={offset === 0} onClick={() => setOffset(0)}>
            {view === "day" ? "Today" : isPhone ? "Now" : "This Week"}
          </button>
        )}
        <button className="pill icon" aria-label={view === "day" ? "Next day" : "Next week"} onClick={() => setOffset(offset + 1)}>
          <ChevronRight />
        </button>
      </Header>
      <div className="screen no-pad tasks-screen">
        {view === "day" ? <DayBoard day={day} ctl={ctl} /> : <WeekBoard weekStart={weekStart} ctl={ctl} />}
      </div>
      <Fab onClick={() => ctl.openForm(null, view === "day" && offset !== 0 ? { date: day } : undefined)} label="Add task" />
      {ctl.overlays}
      {filter && <FilterPopover anchor={filter} onClose={() => setFilter(null)} />}
    </>
  );
}

// ---------- Filter ----------
function FilterPopover({ anchor, onClose }: { anchor: HTMLElement; onClose: () => void }) {
  const { settings, people, run } = useApp();
  const [ts, setTs] = useState(settings.tasks);
  useEffect(() => setTs(settings.tasks), [settings.tasks]);
  const save = (patch: Partial<Settings["tasks"]>) => {
    const next = { ...ts, ...patch };
    setTs(next);
    run(() => put("/api/settings", { tasks: next })).then((r) => r === undefined && setTs(settings.tasks));
  };
  return (
    <Popover anchor={anchor} onClose={onClose} width={420}>
      <div className="col" style={{ gap: 8 }}>
        <div className="tasks-pop-h">Show</div>
        <ToggleRow icon={<CheckCircle2 />} label="Completed tasks" on={ts.showCompleted} onChange={(v) => save({ showCompleted: v })} />
        <ToggleRow icon={<Clock />} label="Late chores" on={ts.showLate} onChange={(v) => save({ showLate: v })} />
        <ToggleRow icon={<SkipForward />} label="Skipped tasks" on={ts.showSkipped} onChange={(v) => save({ showSkipped: v })} />
        <ToggleRow icon={<House />} label="Up For Grabs" on={ts.showUpForGrabs} onChange={(v) => save({ showUpForGrabs: v })} />
        <div className="tasks-pop-h">Profiles</div>
        {people.map((p) => (
          <ToggleRow
            key={p.id}
            icon={<Avatar profile={p} size={36} />}
            label={p.name}
            on={!ts.hiddenProfiles.includes(p.id)}
            onChange={(v) => save({ hiddenProfiles: v ? ts.hiddenProfiles.filter((x) => x !== p.id) : [...ts.hiddenProfiles, p.id] })}
          />
        ))}
      </div>
    </Popover>
  );
}

// ---------- Day view ----------
function DayBoard({ day, ctl }: { day: string; ctl: TaskController }) {
  const { people, settings, now, today, isPhone } = useApp();
  const ts = settings.tasks;
  const [board, setBoard] = useState<HTMLDivElement | null>(null);
  const [vis, setVis] = useState<Record<string, Partial<Record<Section, boolean>>>>({});
  useEffect(() => setVis({}), [day]);
  const list = useMemo(() => (ctl.instances ?? []).filter((i) => i.date === day), [ctl.instances, day]);
  if (!ctl.instances) return <div className="tasks-board" aria-busy="true" />;
  const ufg = list.filter((i) => i.profileId === null);
  const cols: (Profile | null)[] = [...(ts.showUpForGrabs && ufg.length ? [null] : []), ...people.filter((p) => !ts.hiddenProfiles.includes(p.id))];
  if (!cols.length)
    return (
      <div className="empty" style={{ height: "100%" }}>
        <div className="big">👀</div>
        <div>Everyone is hidden. Use Filter to show profiles.</div>
      </div>
    );
  const part = partOfDay(now);
  return (
    <>
      {isPhone && cols.length > 1 && <ColumnTabs cols={cols} board={board} />}
      <div className="tasks-board" ref={setBoard}>
        {cols.map((p) => {
          const k = colKey(p?.id ?? null);
          return (
            <DayColumn
              key={k}
              profile={p}
              list={list.filter((i) => i.profileId === (p?.id ?? null))}
              isToday={day === today}
              part={part}
              vis={vis[k] ?? {}}
              onVis={(s, v) => setVis((m) => ({ ...m, [k]: { ...m[k], [s]: v } }))}
              ctl={ctl}
            />
          );
        })}
      </div>
    </>
  );
}

function DayColumn({
  profile,
  list,
  isToday,
  part,
  vis,
  onVis,
  ctl,
}: {
  profile: Profile | null;
  list: TaskInstance[];
  isToday: boolean;
  part: DayPart;
  vis: Partial<Record<Section, boolean>>;
  onVis: (s: Section, v: boolean) => void;
  ctl: TaskController;
}) {
  const { settings } = useApp();
  const ts = settings.tasks;
  const color = colorOf(profile);
  const prog = progressOf(list);
  const shown = list.filter((i) => (ts.showCompleted || i.status !== "done") && (ts.showSkipped || i.status !== "skipped") && (ts.showLate || !i.late));
  const present = SECTIONS.filter((s) => list.some((i) => sectionOf(i) === s.id));
  const hasRoutines = present.some((s) => s.id !== "chores");
  const isVisible = (s: Section) => vis[s] ?? (s === "chores" || !isToday || s === part);
  const visibleSections = present.filter((s) => isVisible(s.id));
  const showStars = !!profile && (profile.stars !== 0 || list.some((i) => i.task.stars > 0));
  return (
    <section className="tasks-col" style={{ background: tint(color, 0.07) }} aria-label={profile?.name ?? "Up For Grabs"}>
      <header className="tasks-col-head">
        <ColAvatar profile={profile} size={76} />
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="serif tasks-col-name truncate">{profile?.name ?? "Up For Grabs"}</div>
          <div className="tasks-col-chips">
            <DoneChip done={prog.done} total={prog.total} color={color} />
            {showStars && <StarChip n={profile!.stars} color={color} />}
          </div>
        </div>
      </header>
      {hasRoutines && (
        <div className="tasks-rings">
          {present.map((s) => {
            const p = progressOf(list.filter((i) => sectionOf(i) === s.id));
            return <RingButton key={s.id} section={s} on={isVisible(s.id)} done={p.done} total={p.total} color={color} onClick={() => onVis(s.id, !isVisible(s.id))} />;
          })}
        </div>
      )}
      <div className="tasks-col-body">
        {list.length === 0 ? (
          <div className="empty tasks-col-empty">
            <div className="big">😊</div>
            <div>{isToday ? "Nothing to do today." : "Nothing to do."}</div>
          </div>
        ) : visibleSections.length === 0 ? (
          <div className="tasks-col-hint">Tap {present.map((s) => s.label).join(", ").replace(/, ([^,]*)$/, " or $1")} to see tasks.</div>
        ) : (
          visibleSections.map((s) => {
            const items = shown.filter((i) => sectionOf(i) === s.id);
            const all = list.filter((i) => sectionOf(i) === s.id);
            const p = progressOf(all);
            return (
              <div key={s.id} className="tasks-section">
                <h3 className="serif tasks-section-h">{s.label}</h3>
                {items.map((i) => (
                  <TaskRow key={`${i.task.id}|${i.occurrence}|${i.part}`} inst={i} color={color} ctl={ctl} />
                ))}
                {!items.length && <div className="tasks-col-hint">{p.total > 0 && p.done === p.total ? "All done! 🎉" : "Nothing to show."}</div>}
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}

// ---------- Week view ----------
interface WeekRow {
  key: string;
  task: Task;
  section: Section;
  cells: Map<string, TaskInstance>;
}

function WeekBoard({ weekStart, ctl }: { weekStart: string; ctl: TaskController }) {
  const { people, settings, today, profileById, isPhone } = useApp();
  const ts = settings.tasks;
  const days = eachDay(weekStart, addDays(weekStart, 7));
  const inWeek = useMemo(() => (ctl.instances ?? []).filter((i) => i.date >= weekStart && i.date < addDays(weekStart, 7)), [ctl.instances, weekStart]);
  const hasUfg = inWeek.some((i) => i.profileId === null);
  const cols: (Profile | null)[] = [...people.filter((p) => !ts.hiddenProfiles.includes(p.id)), ...(ts.showUpForGrabs && hasUfg ? [null] : [])];
  const [selKey, setSelKey] = useState<string>(() => lsGet("haven-tasks-week-profile") ?? "");
  const [hidden, setHidden] = useState<Partial<Record<Section, boolean>>>({});
  const sel = cols.find((p) => colKey(p?.id ?? null) === selKey) ?? cols[0];
  const selK = sel === undefined ? "" : colKey(sel?.id ?? null);
  const color = colorOf(sel);
  const mine = inWeek.filter((i) => colKey(i.profileId) === selK && (ts.showSkipped || i.status !== "skipped") && (ts.showLate || !i.late));

  const rows: WeekRow[] = [];
  const byKey = new Map<string, WeekRow>();
  for (const i of mine) {
    const section = sectionOf(i);
    const k = `${section}|${i.task.id}`;
    let r = byKey.get(k);
    if (!r) {
      r = { key: k, task: i.task, section, cells: new Map() };
      byKey.set(k, r);
      rows.push(r);
    }
    const cur = r.cells.get(i.date);
    // Prefer an open instance (e.g. today's) over an older one in the same cell.
    if (!cur || (cur.status !== "open" && i.status === "open")) r.cells.set(i.date, i);
  }
  const present = SECTIONS.filter((s) => rows.some((r) => r.section === s.id));
  const visible = present.filter((s) => !hidden[s.id]);
  const star = sel ? profileById(sel.id)?.stars ?? 0 : null;

  if (!ctl.instances) return <div className="tasks-week" aria-busy="true" />;
  return (
    <div className="tasks-week">
      <div className="tasks-week-top">
        <div className="tasks-week-people">
          {cols.map((p) => {
            const k = colKey(p?.id ?? null);
            const on = k === selK;
            const prog = progressOf(inWeek.filter((i) => colKey(i.profileId) === k));
            const c = colorOf(p);
            return (
              <button
                key={k}
                className={`tasks-week-person ${on ? "on" : ""}`}
                onClick={() => {
                  setSelKey(k);
                  lsSet("haven-tasks-week-profile", k);
                }}
                aria-pressed={on}
              >
                <ProgressRing size={70} value={prog.total ? prog.done / prog.total : 0} color={c} track={on ? tint(c, 0.25) : "transparent"} stroke={3}>
                  <span style={{ display: "flex", borderRadius: 99, boxShadow: on ? "0 0 0 1.5px #1f1f1f" : undefined, padding: on ? 0 : 0 }}>
                    {p ? <Avatar profile={p} size={58} /> : <UfgAvatar size={58} />}
                  </span>
                </ProgressRing>
                <span className="truncate">{p?.name ?? "Up For Grabs"}</span>
              </button>
            );
          })}
        </div>
        <div className="tasks-week-rings">
          {present.map((s) => {
            const p = progressOf(mine.filter((i) => sectionOf(i) === s.id));
            return <RingButton key={s.id} section={s} on={!hidden[s.id]} done={p.done} total={p.total} color={color} size={62} onClick={() => setHidden((h) => ({ ...h, [s.id]: !h[s.id] }))} />;
          })}
          {star !== null && (
            <div className="tasks-week-star">
              <span className="tasks-week-star-icon" style={{ background: tint(color, 0.16) }}>
                ⭐
              </span>
              <span>{star}</span>
            </div>
          )}
        </div>
      </div>
      <div className="tasks-week-scroll">
        <div className="tasks-week-panel" style={{ background: tint(color, 0.07) }}>
          {!sel && sel !== null ? (
            <div className="empty">
              <div className="big">👀</div>
              <div>Everyone is hidden. Use Filter to show profiles.</div>
            </div>
          ) : rows.length === 0 ? (
            <div className="empty" style={{ padding: 60 }}>
              <div className="big">😊</div>
              <div>Nothing to do this week.</div>
            </div>
          ) : visible.length === 0 ? (
            <div className="tasks-col-hint" style={{ padding: 30 }}>
              All sections are hidden. Tap {present.map((s) => s.label).join(", ").replace(/, ([^,]*)$/, " or $1")} above.
            </div>
          ) : (
            visible.map((s, si) => (
              <div key={s.id} className="tasks-week-section">
                <div className="tasks-week-grid tasks-week-head">
                  <h3 className="serif tasks-section-h">{s.label}</h3>
                  {si === 0 &&
                    days.map((d) => {
                      const l = dayLabel(d);
                      return (
                        <div key={d} className={`serif tasks-week-day ${d === today ? "today" : ""}`}>
                          {l.dow} <span className="n">{l.num}</span>
                        </div>
                      );
                    })}
                </div>
                {rows
                  .filter((r) => r.section === s.id)
                  .map((r) => {
                    const first = [...r.cells.values()].find((i) => i.date === today) ?? [...r.cells.values()][0];
                    return (
                      <div key={r.key} className="tasks-week-grid tasks-week-row" style={{ background: tint(color, 0.15) }}>
                        <button className="tasks-week-task" onClick={(e) => ctl.openDetails(first, e.currentTarget)}>
                          <span className="tasks-week-emoji">{r.task.emoji}</span>
                          <span className="grow" style={{ minWidth: 0 }}>
                            <span className="tasks-row-title truncate" style={{ display: "block" }}>
                              {r.task.title}
                            </span>
                            <TaskChips inst={first} />
                          </span>
                        </button>
                        {days.map((d) => {
                          const i = r.cells.get(d);
                          return <div key={d} className="tasks-week-cell">{i && <TaskCheck inst={i} color={color} size={isPhone ? 30 : 40} ctl={ctl} />}</div>;
                        })}
                      </div>
                    );
                  })}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
