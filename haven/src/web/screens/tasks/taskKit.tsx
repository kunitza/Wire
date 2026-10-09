// Shared task logic for the Tasks screen, its Week view and the Home "Today's Tasks" pane:
// live data with optimistic check-offs, check/skip/delete actions, details popover, "who did it" sheet
// and the streak celebration.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Check, Clock, Pencil, Repeat as RepeatIcon, SkipForward, Star, Trash2, Users, Zap, House, Undo2 } from "lucide-react";
import type { DayPart, Profile, Task, TaskInstance } from "../../../shared/types";
import { dayOfWeek, describeRepeat, diffDays } from "../../../shared/dates";
import { useApp, useLive } from "../../lib/store";
import { del, post } from "../../lib/api";
import { DOW, fmtTime, isDark, shortDate, tint } from "../../lib/format";
import { Avatar, Confirm, Modal, Popover } from "../../components/ui";
import { TaskForm } from "./TaskForm";

export type Section = DayPart | "chores";
export const SECTIONS: { id: Section; label: string; emoji: string }[] = [
  { id: "morning", label: "Morning", emoji: "🌤️" },
  { id: "afternoon", label: "Afternoon", emoji: "☀️" },
  { id: "evening", label: "Evening", emoji: "🌙" },
  { id: "chores", label: "Chores", emoji: "🧹" },
];
export const UFG_COLOR = "#2FA7A0";
export const MILESTONES = [3, 7, 14, 30, 50, 100];

export const sectionOf = (i: TaskInstance): Section => (i.task.kind === "routine" ? (i.part ?? "morning") : "chores");
export const instKey = (i: TaskInstance) => `${i.task.id}|${i.occurrence}|${i.part ?? ""}|${i.profileId ?? "up"}`;
export const colKey = (profileId: number | null) => (profileId === null ? "up" : String(profileId));

export function partOfDay(now: Date): DayPart {
  const h = now.getHours();
  return h < 12 ? "morning" : h < 18 ? "afternoon" : "evening";
}

/** done / total with skipped excluded. */
export function progressOf(list: TaskInstance[]) {
  let done = 0;
  let total = 0;
  for (const i of list) {
    if (i.status === "skipped") continue;
    total++;
    if (i.status === "done") done++;
  }
  return { done, total };
}

export function colorOf(profile: Profile | null | undefined) {
  return profile?.color ?? UFG_COLOR;
}

/** Second line of a task row: "9 AM · ↻ Weekly", "Late · was due Mon". */
export function taskSubline(i: TaskInstance, today: string, h24: boolean): { late: string | null; text: string[] } {
  const t = i.task;
  const text: string[] = [];
  let late: string | null = null;
  if (i.late) {
    const due = /^\d{4}-\d{2}-\d{2}$/.test(i.occurrence) ? i.occurrence : t.date;
    if (due) late = diffDays(i.date, due) <= 6 ? `Late · was due ${DOW[dayOfWeek(due)]}` : `Late · was due ${shortDate(due)}`;
    else late = "Late";
  }
  if (t.kind === "chore") {
    if (t.dueTime) text.push(fmtTime(t.dueTime, h24));
    else if (!late && t.date && i.date === today) text.push("Today");
    else if (!late && !t.date) text.push("Anytime");
  }
  if (t.kind === "chore" && t.repeat.type !== "none") text.push(`↻ ${shortRepeat(t)}`);
  return { late, text };
}

export function shortRepeat(t: Task): string {
  const r = t.repeat;
  if (r.type === "daily" && r.interval === 1) return "Daily";
  if (r.type === "weekly" && r.interval === 1) {
    if (r.days.length <= 1) return "Weekly";
    if (r.days.length === 7) return "Daily";
    if ([...r.days].sort().join() === "1,2,3,4,5") return "Weekdays";
    return [...r.days].sort().map((d) => DOW[d]).join(", ");
  }
  return describeRepeat(r);
}

// ---------- Small visual pieces ----------
export function UfgAvatar({ size = 72 }: { size?: number }) {
  return (
    <span className="avatar" style={{ width: size, height: size, background: UFG_COLOR, color: "#fff" }} aria-label="Up For Grabs">
      <House size={size * 0.46} strokeWidth={1.7} />
    </span>
  );
}

export function ColAvatar({ profile, size }: { profile: Profile | null; size: number }) {
  return profile ? <Avatar profile={profile} size={size} /> : <UfgAvatar size={size} />;
}

export function DoneChip({ done, total, color }: { done: number; total: number; color: string }) {
  const pct = total ? (done / total) * 100 : 0;
  return (
    <span className="tasks-chip tasks-progress-chip" style={{ background: tint(color, 0.16) }}>
      <span className="fill" style={{ width: `${pct}%`, background: tint(color, 0.42) }} />
      <span className="lbl">
        <Check size={16} strokeWidth={2.5} /> {done}/{total}
      </span>
    </span>
  );
}

export function StarChip({ n, color }: { n: number; color: string }) {
  return (
    <span className="tasks-chip" style={{ background: tint(color, 0.16) }}>
      <span className="lbl">
        <span aria-hidden>⭐</span> {n}
      </span>
    </span>
  );
}

export function TaskChips({ inst }: { inst: TaskInstance }) {
  const showStreak = inst.task.kind === "routine" && inst.task.trackHabit && inst.streak > 0;
  if (!inst.task.stars && !showStreak) return null;
  return (
    <span className="tasks-mini-chips">
      {inst.task.stars > 0 && (
        <span className="tasks-mini-chip" title={`${inst.task.stars} stars`}>
          <Star size={14} /> {inst.task.stars}
        </span>
      )}
      {showStreak && (
        <span className="tasks-mini-chip" title={`${inst.streak} day streak`}>
          <Zap size={14} /> {inst.streak}
        </span>
      )}
    </span>
  );
}

// ---------- Data + actions ----------
interface Override {
  status: TaskInstance["status"];
  completedBy: number | null;
  settled: boolean;
}

export interface TaskController {
  instances: TaskInstance[] | undefined;
  /** Tap on a check circle. */
  toggle: (inst: TaskInstance) => void;
  /** Tap on a row: show details. */
  openDetails: (inst: TaskInstance, anchor: HTMLElement) => void;
  /** Open the add form (optionally with defaults). */
  openForm: (task?: Task | null, defaults?: Partial<Task>) => void;
  overlays: ReactNode;
}

export function useTaskController(from: string, to: string): TaskController {
  const app = useApp();
  const { today, toast, celebrate, settings, profileById, people } = app;
  const { data, reload } = useLive<TaskInstance[]>(`/api/tasks/instances?from=${from}&to=${to}`, ["tasks", "profiles"]);
  const [ov, setOv] = useState<Map<string, Override>>(() => new Map());
  const [who, setWho] = useState<TaskInstance | null>(null);
  const [details, setDetails] = useState<{ inst: TaskInstance; anchor: HTMLElement } | null>(null);
  const [form, setForm] = useState<{ task: Task | null; defaults?: Partial<Task> } | null>(null);
  const [streak, setStreak] = useState<{ profile: Profile; count: number; title: string; heading?: string; subtitle?: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<TaskInstance | null>(null);

  // Drop optimistic overrides once fresh data that includes them has arrived.
  useEffect(() => {
    setOv((m) => {
      if (![...m.values()].some((o) => o.settled)) return m;
      const n = new Map(m);
      for (const [k, o] of n) if (o.settled) n.delete(k);
      return n;
    });
  }, [data]);

  const instances = useMemo(
    () =>
      data?.map((i) => {
        const o = ov.get(instKey(i));
        return o ? { ...i, status: o.status, completedBy: o.completedBy } : i;
      }),
    [data, ov],
  );
  const instRef = useRef(instances);
  instRef.current = instances;

  const mutate = useCallback(
    async (inst: TaskInstance, next: Omit<Override, "settled">, call: () => Promise<unknown>) => {
      const k = instKey(inst);
      setOv((m) => new Map(m).set(k, { ...next, settled: false }));
      try {
        await call();
        setOv((m) => {
          const o = m.get(k);
          return o ? new Map(m).set(k, { ...o, settled: true }) : m;
        });
        return true;
      } catch (e) {
        setOv((m) => {
          const n = new Map(m);
          n.delete(k);
          return n;
        });
        toast(e instanceof Error ? e.message : "Something went wrong");
        return false;
      } finally {
        reload();
      }
    },
    [reload, toast],
  );

  const afterDone = useCallback(
    (inst: TaskInstance) => {
      const list = instRef.current ?? [];
      // Day finished for that column?
      const mine = list.filter((i) => i.date === inst.date && i.profileId === inst.profileId);
      const p = progressOf(mine.map((i) => (instKey(i) === instKey(inst) ? { ...i, status: "done" as const } : i)));
      // Like Skylight: celebrate when someone finishes everything for the day.
      if (p.total > 0 && p.done === p.total) celebrate("day");
      // Habit streak milestone?
      if (inst.task.kind === "routine" && inst.task.trackHabit && inst.date === today && inst.profileId !== null) {
        const parts = list.filter((i) => i.task.id === inst.task.id && i.profileId === inst.profileId && i.date === inst.date && instKey(i) !== instKey(inst));
        if (parts.every((i) => i.status !== "open")) {
          const count = inst.streak + 1;
          const profile = profileById(inst.profileId);
          if (MILESTONES.includes(count) && profile && settings.funMode) return setStreak({ profile, count, title: inst.task.title });
        }
      }
      // "Amazing Week": a routine done on every scheduled day of the week (only when a whole week is loaded).
      if (inst.task.kind === "routine" && inst.profileId !== null && settings.funMode && diffDays(to, from) >= 7) {
        const row = list.filter((i) => i.task.id === inst.task.id && i.profileId === inst.profileId && i.part === inst.part);
        const profile = profileById(inst.profileId);
        if (profile && row.length >= 3 && row.every((i) => instKey(i) === instKey(inst) || i.status === "done"))
          setStreak({ profile, count: row.length, title: inst.task.title, heading: "Amazing Week!", subtitle: `Every day this week · ${inst.task.title}` });
      }
    },
    [celebrate, profileById, settings.funMode, today, from, to],
  );

  const setStatus = useCallback(
    async (inst: TaskInstance, status: "done" | "skipped" | "open", creditTo?: number) => {
      const body = { occurrence: inst.occurrence, part: inst.part, slot: inst.profileId };
      if (status === "open") {
        await mutate(inst, { status: "open", completedBy: null }, () => post(`/api/tasks/${inst.task.id}/uncomplete`, body));
        return;
      }
      if (status === "done") afterDone(inst);
      await mutate(inst, { status, completedBy: status === "done" ? (inst.profileId ?? creditTo ?? null) : null }, () =>
        post(`/api/tasks/${inst.task.id}/complete`, { ...body, creditTo: creditTo ?? null, day: inst.date, status }),
      );
    },
    [afterDone, mutate],
  );

  const toggle = useCallback(
    (inst: TaskInstance) => {
      if (inst.status !== "open") return void setStatus(inst, "open");
      if (inst.profileId === null) return setWho(inst);
      void setStatus(inst, "done");
    },
    [setStatus],
  );

  const doDelete = async (inst: TaskInstance, scope: string) => {
    const occ = /^\d{4}-\d{2}-\d{2}$/.test(inst.occurrence) ? inst.occurrence : inst.date;
    const q = new URLSearchParams({ scope });
    if (scope !== "all") q.set("from", scope === "future" && inst.task.kind === "routine" ? inst.date : occ);
    if (scope === "this") q.set("slot", inst.profileId === null ? "up" : String(inst.profileId));
    await app.run(() => del(`/api/tasks/${inst.task.id}?${q}`), scope === "this" ? "Skipped this one" : "Task deleted");
    reload();
  };

  const overlays = (
    <>
      {details && (
        <TaskDetails
          inst={instances?.find((i) => instKey(i) === instKey(details.inst)) ?? details.inst}
          anchor={details.anchor}
          onClose={() => setDetails(null)}
          onToggle={(i) => {
            setDetails(null);
            toggle(i);
          }}
          onSkip={(i) => {
            setDetails(null);
            void setStatus(i, i.status === "skipped" ? "open" : "skipped");
          }}
          onEdit={(i) => {
            setDetails(null);
            setForm({ task: i.task });
          }}
          onDelete={(i) => {
            setDetails(null);
            setConfirmDelete(i);
          }}
        />
      )}
      {who && (
        <WhoCompleted
          inst={who}
          people={people}
          onClose={() => setWho(null)}
          onPick={(pid) => {
            setWho(null);
            void setStatus(who, "done", pid);
          }}
        />
      )}
      {form && <TaskForm task={form.task} defaults={form.defaults} onClose={() => setForm(null)} onSaved={() => reload()} />}
      {streak && <StreakModal {...streak} onClose={() => setStreak(null)} />}
      {confirmDelete && <DeleteTaskConfirm inst={confirmDelete} onClose={() => setConfirmDelete(null)} onDelete={(scope) => doDelete(confirmDelete, scope)} />}
    </>
  );

  return {
    instances,
    toggle,
    openDetails: (inst, anchor) => setDetails({ inst, anchor }),
    openForm: (task, defaults) => setForm({ task: task ?? null, defaults }),
    overlays,
  };
}

// ---------- Delete ----------
function DeleteTaskConfirm({ inst, onClose, onDelete }: { inst: TaskInstance; onClose: () => void; onDelete: (scope: string) => void }) {
  const t = inst.task;
  const repeating = t.repeat.type !== "none";
  if (!repeating) return <Confirm title={`Delete "${t.title}"?`} message="This removes the task for everyone." onConfirm={() => onDelete("all")} onClose={onClose} />;
  const options =
    t.kind === "routine"
      ? [
          { value: "future", label: "This and all future" },
          { value: "all", label: "All, including past" },
        ]
      : [
          { value: "this", label: "Only this one" },
          { value: "future", label: "This and all future" },
          { value: "all", label: "All, including past" },
        ];
  return <Confirm title={`Delete "${t.title}"?`} message="This is a repeating task." options={options} onConfirm={(o) => onDelete(o ?? "all")} onClose={onClose} />;
}

// ---------- Details popover ----------
function TaskDetails({
  inst,
  anchor,
  onClose,
  onToggle,
  onSkip,
  onEdit,
  onDelete,
}: {
  inst: TaskInstance;
  anchor: HTMLElement;
  onClose: () => void;
  onToggle: (i: TaskInstance) => void;
  onSkip: (i: TaskInstance) => void;
  onEdit: (i: TaskInstance) => void;
  onDelete: (i: TaskInstance) => void;
}) {
  const { profileById, today, settings } = useApp();
  const t = inst.task;
  const col = profileById(inst.profileId);
  const color = colorOf(col);
  const assignees = t.profileIds.map((id) => profileById(id)).filter(Boolean) as Profile[];
  const canSkip = t.kind === "routine" || t.repeat.type !== "none";
  const sub = taskSubline(inst, today, settings.clock24h);
  const doneBy = profileById(inst.completedBy);
  return (
    <Popover anchor={anchor} onClose={onClose} width={440} align="center">
      <div className="tasks-details">
        <div className="row" style={{ gap: 14, alignItems: "flex-start" }}>
          <span className="tasks-details-emoji" style={{ background: tint(color, 0.16) }}>
            {t.emoji || (t.kind === "routine" ? "🔁" : "✅")}
          </span>
          <div className="grow">
            <div className="serif tasks-details-title">{t.title}</div>
            <div className="muted" style={{ fontWeight: 500 }}>
              {t.kind === "routine" ? `Routine · ${inst.part ? inst.part[0].toUpperCase() + inst.part.slice(1) : ""}` : "Chore"}
            </div>
          </div>
        </div>
        {t.description && <p className="tasks-details-desc">{t.description}</p>}
        <div className="tasks-details-facts">
          <div className="row">
            {assignees.length ? <Users /> : <House />}
            <span className="grow">{assignees.length ? assignees.map((p) => p.name).join(", ") : "Up For Grabs"}</span>
            {assignees.length > 0 && (
              <span className="avatar-stack">
                {assignees.slice(0, 4).map((p) => (
                  <Avatar key={p.id} profile={p} size={30} style={{ boxShadow: "0 0 0 2px #fff" }} />
                ))}
              </span>
            )}
          </div>
          {(t.repeat.type !== "none" || t.kind === "routine") && (
            <div className="row">
              <RepeatIcon />
              <span>{describeRepeat(t.repeat)}</span>
            </div>
          )}
          {(sub.late || sub.text.some((x) => !x.startsWith("↻"))) && (
            <div className="row" style={sub.late ? { color: "var(--coral)" } : undefined}>
              <Clock />
              <span>{[sub.late, ...sub.text.filter((x) => !x.startsWith("↻"))].filter(Boolean).join(" · ")}</span>
            </div>
          )}
          {t.stars > 0 && (
            <div className="row">
              <Star />
              <span>
                {t.stars} {t.stars === 1 ? "star" : "stars"}
              </span>
            </div>
          )}
          {t.trackHabit && (
            <div className="row">
              <Zap />
              <span>{inst.streak > 0 ? `${inst.streak} day streak` : "Habit tracking on"}</span>
            </div>
          )}
          {inst.status === "done" && (
            <div className="row" style={{ color: "var(--green)" }}>
              <Check />
              <span>Completed{doneBy && inst.profileId === null ? ` by ${doneBy.name}` : ""}</span>
            </div>
          )}
          {inst.status === "skipped" && (
            <div className="row muted">
              <SkipForward />
              <span>Skipped</span>
            </div>
          )}
        </div>
        <button
          className="pill lg block"
          style={inst.status === "open" ? { background: color, color: isDark(color) ? "#fff" : "#1f1f1f" } : undefined}
          onClick={() => onToggle(inst)}
        >
          {inst.status === "open" ? <Check /> : <Undo2 />}
          {inst.status === "open" ? "Mark as Complete" : inst.status === "done" ? "Mark as Incomplete" : "Mark as Complete"}
        </button>
        <div className="row" style={{ gap: 8 }}>
          {canSkip && inst.status !== "done" && (
            <button className="pill grow" onClick={() => onSkip(inst)}>
              <SkipForward />
              {inst.status === "skipped" ? "Unskip" : "Skip"}
            </button>
          )}
          <button className="pill grow" onClick={() => onEdit(inst)}>
            <Pencil />
            Edit
          </button>
          <button className="pill grow danger" onClick={() => onDelete(inst)}>
            <Trash2 />
            Delete
          </button>
        </div>
      </div>
    </Popover>
  );
}

// ---------- Up For Grabs: who completed it? ----------
function WhoCompleted({ inst, people, onClose, onPick }: { inst: TaskInstance; people: Profile[]; onClose: () => void; onPick: (id: number) => void }) {
  const [pick, setPick] = useState<number | null>(null);
  return (
    <Modal
      title="Complete Task"
      onClose={onClose}
      size="narrow"
      footer={
        <button className="pill primary lg block" disabled={pick === null} onClick={() => pick !== null && onPick(pick)}>
          Complete
        </button>
      }
    >
      <div className="row" style={{ gap: 12 }}>
        <span style={{ fontSize: 34 }}>{inst.task.emoji || "🙌"}</span>
        <div>
          <div style={{ fontWeight: 600, fontSize: 20 }}>{inst.task.title}</div>
          <div className="muted">Who completed it?{inst.task.stars ? ` They'll earn ⭐ ${inst.task.stars}.` : ""}</div>
        </div>
      </div>
      <div className="col" style={{ gap: 8 }} role="radiogroup">
        {people.map((p) => (
          <button
            key={p.id}
            role="radio"
            aria-checked={pick === p.id}
            className="tasks-who-row"
            style={pick === p.id ? { background: tint(p.color, 0.2) } : undefined}
            onClick={() => setPick(p.id)}
          >
            <Avatar profile={p} size={48} />
            <span className="grow serif" style={{ fontSize: 24 }}>
              {p.name}
            </span>
            <span className={`tasks-radio ${pick === p.id ? "on" : ""}`} style={pick === p.id ? { borderColor: p.color, background: p.color } : undefined} />
          </button>
        ))}
      </div>
    </Modal>
  );
}

// ---------- Streak celebration ----------
export function StreakModal({
  profile,
  count,
  title,
  onClose,
  heading,
  subtitle,
}: {
  profile: Profile;
  count: number;
  title: string;
  onClose: () => void;
  heading?: string;
  subtitle?: string;
}) {
  const c = profile.color;
  return (
    <Modal onClose={onClose} size="narrow" className="tasks-streak">
      <div className="tasks-streak-top" style={{ background: tint(c, 0.12), ["--dot" as string]: tint(c, 0.38) }}>
        <button className="icon-btn tasks-streak-x" onClick={onClose} aria-label="Close">
          ✕
        </button>
        <div className="tasks-streak-badge" style={{ background: tint(c, 0.06), boxShadow: `0 0 0 10px ${tint(c, 0.2)}` }}>
          <div className="tasks-streak-blob" style={{ background: tint(c, 0.4) }}>
            <span>{heading ? "🌟" : count >= 7 ? "🔥" : "👏"}</span>
          </div>
          <span className="tasks-streak-count" style={{ background: tint(c, 0.3), color: "#3d3340" }}>
            {count}
          </span>
        </div>
        <div className="tasks-streak-avatar">
          <Avatar profile={profile} size={92} style={{ boxShadow: "0 0 0 4px #fff" }} />
        </div>
      </div>
      <div className="col" style={{ alignItems: "center", gap: 4, padding: "58px 8px 6px", textAlign: "center" }}>
        <div className="serif" style={{ fontSize: 40, lineHeight: 1.1 }}>
          {heading ?? "You're Doing Great!"}
        </div>
        <div style={{ fontSize: 20, color: "var(--text-2)" }}>
          {subtitle ?? `${count}x Streak · ${title}`}
        </div>
      </div>
      <button className="pill lg block" style={{ marginTop: 14, height: 72, fontSize: 22 }} onClick={onClose}>
        Continue
      </button>
    </Modal>
  );
}
