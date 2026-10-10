import { useState } from "react";
import { Minus, Plus, Package, Trash2 } from "lucide-react";
import type { DayPart, Repeat, Task, TaskKind } from "../../../shared/types";
import { useApp } from "../../lib/store";
import { del, post, put } from "../../lib/api";
import { DOW } from "../../lib/format";
import { Confirm, EmojiPicker, Field, Modal, ProfilePicker, RepeatEditor, Toggle, ToggleRow } from "../../components/ui";
import { PRESETS, type Preset } from "./presets";
import "./tasks.css";

type TaskInput = Omit<Task, "id" | "sort">;

const PARTS: { id: DayPart; label: string; emoji: string }[] = [
  { id: "morning", label: "Morning", emoji: "🌤️" },
  { id: "afternoon", label: "Afternoon", emoji: "☀️" },
  { id: "evening", label: "Evening", emoji: "🌙" },
];

interface Draft {
  kind: TaskKind;
  title: string;
  emoji: string;
  description: string;
  stars: number;
  profileIds: number[];
  upForGrabs: boolean;
  hasDate: boolean;
  date: string;
  hasTime: boolean;
  dueTime: string;
  repeat: Repeat;
  repeatUntil: string | null;
  routineRepeat: Repeat;
  parts: DayPart[];
  trackHabit: boolean;
  maxPerDay: number;
}

function initial(task: Task | null | undefined, defaults: Partial<Task> | undefined, today: string): Draft {
  const t = { ...(defaults ?? {}), ...(task ?? {}) } as Partial<Task>;
  const kind = t.kind ?? "chore";
  return {
    kind,
    title: t.title ?? "",
    emoji: t.emoji ?? "",
    description: t.description ?? "",
    stars: t.stars ?? (task ? 0 : 1),
    profileIds: t.profileIds ?? [],
    upForGrabs: !!task && kind === "chore" && !(t.profileIds ?? []).length,
    hasDate: task ? !!t.date : true,
    date: t.date ?? today,
    hasTime: !!t.dueTime,
    dueTime: t.dueTime ?? "09:00",
    repeat: kind === "chore" ? (t.repeat ?? { type: "none" }) : { type: "none" },
    repeatUntil: t.repeatUntil ?? null,
    routineRepeat: kind === "routine" && t.repeat && (t.repeat.type === "daily" || t.repeat.type === "weekly") ? t.repeat : { type: "daily", interval: 1 },
    parts: t.parts?.length ? t.parts : ["morning"],
    trackHabit: t.trackHabit ?? (task ? false : true),
    maxPerDay: t.maxPerDay ?? 1,
  };
}

/** Add / edit a chore or routine. */
export function TaskForm({
  task,
  defaults,
  onClose,
  onSaved,
}: {
  task?: Task | null;
  defaults?: Partial<Task>;
  onClose: () => void;
  onSaved?: (t: Task) => void;
}) {
  const { today, people, toast } = useApp();
  const [d, setD] = useState<Draft>(() => initial(task, defaults, today));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [box, setBox] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const set = (patch: Partial<Draft>) => {
    setD((x) => ({ ...x, ...patch }));
    setError(null);
  };
  const isChore = d.kind === "chore";

  const applyPreset = (p: Preset) => {
    set({
      kind: p.kind,
      title: p.title,
      emoji: p.emoji,
      stars: p.stars,
      ...(p.kind === "routine"
        ? { parts: p.parts ?? ["morning"], routineRepeat: p.repeat && (p.repeat.type === "daily" || p.repeat.type === "weekly") ? p.repeat : { type: "daily", interval: 1 } }
        : { repeat: p.repeat ?? { type: "none" }, hasDate: true, upForGrabs: d.upForGrabs }),
    });
    setBox(false);
  };

  const save = async () => {
    if (!d.title.trim()) return setError("Give the task a name.");
    if (isChore && !d.upForGrabs && !d.profileIds.length) return setError("Choose who it's for, or make it Up for Grabs.");
    if (!isChore && !d.profileIds.length) return setError("Routines need at least one person.");
    if (!isChore && !d.parts.length) return setError("Choose when in the day.");
    const repeating = isChore && d.repeat.type !== "none";
    const body: TaskInput = {
      kind: d.kind,
      title: d.title.trim(),
      emoji: d.emoji,
      description: d.description.trim(),
      stars: d.stars,
      profileIds: isChore && d.upForGrabs ? [] : d.profileIds,
      repeat: isChore ? d.repeat : d.routineRepeat,
      repeatUntil: isChore ? (repeating ? d.repeatUntil : null) : (task?.repeatUntil ?? null),
      date: isChore ? (d.hasDate || repeating ? d.date : null) : (task?.kind === "routine" && task.date ? task.date : today),
      dueTime: isChore && (d.hasDate || repeating) && d.hasTime ? d.dueTime : null,
      parts: isChore ? [] : d.parts,
      trackHabit: isChore ? false : d.trackHabit,
      maxPerDay: isChore ? d.maxPerDay : 1,
    };
    setSaving(true);
    try {
      const saved = task ? await put<Task>(`/api/tasks/${task.id}`, body) : await post<Task>("/api/tasks", body);
      toast(task ? "Task saved" : `Added "${saved.title}"`);
      onSaved?.(saved);
      onClose();
    } catch (e) {
      if (e instanceof Error && e.message !== "Locked") setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const rr = d.routineRepeat;
  const rrInterval = rr.type === "daily" || rr.type === "weekly" ? rr.interval : 1;

  return (
    <Modal
      title={task ? `Edit ${task.kind === "routine" ? "Routine" : "Chore"}` : "Add Task"}
      onClose={onClose}
      className="tasks-form"
      actions={
        <button className="pill" onClick={() => setBox(true)}>
          <Package />
          Task Box
        </button>
      }
      footer={
        <>
          {task && (
            <button className="pill danger" onClick={() => setConfirmDel(true)} style={{ marginRight: "auto" }}>
              <Trash2 />
              Delete
            </button>
          )}
          <button className="pill" onClick={onClose}>
            Cancel
          </button>
          <button className="pill primary" disabled={saving} onClick={save}>
            {task ? "Save" : "Add Task"}
          </button>
        </>
      }
    >
      <div className="tasks-kind">
        {(["chore", "routine"] as TaskKind[]).map((k) => (
          <button key={k} type="button" className={d.kind === k ? "on" : ""} onClick={() => set({ kind: k })} aria-pressed={d.kind === k}>
            <span className="e">{k === "chore" ? "🧹" : "🔁"}</span>
            <span>
              <b>{k === "chore" ? "Chore" : "Routine"}</b>
              <small>{k === "chore" ? "A job to get done, once or on repeat" : "Part of the daily rhythm"}</small>
            </span>
          </button>
        ))}
      </div>

      <div className="row" style={{ gap: 12 }}>
        <EmojiPicker value={d.emoji} onChange={(e) => set({ emoji: e })} size={68} />
        <input className="input big" placeholder={isChore ? "e.g. Empty dishwasher" : "e.g. Brush teeth"} value={d.title} onChange={(e) => set({ title: e.target.value })} autoFocus={!task} />
      </div>
      <textarea className="textarea" style={{ minHeight: 70 }} placeholder="Description (optional)" value={d.description} onChange={(e) => set({ description: e.target.value })} />

      <div className="check-row">
        <span className="grow">
          Stars
          <small>Earned when it's done</small>
        </span>
        <StarStepper value={d.stars} onChange={(n) => set({ stars: n })} />
      </div>
      {isChore && (
        <div className="check-row">
          <span className="grow">
            Times per day
            <small>{d.maxPerDay > 1 ? `Can be done up to ${d.maxPerDay} times a day — stars each time` : "Done once (set 2+ for things like \"read a book\")"}</small>
          </span>
          <StarStepper value={d.maxPerDay} onChange={(n) => set({ maxPerDay: n })} min={1} max={20} icon="✕" label="Times per day" />
        </div>
      )}

      <Field label="Assign to">
        {isChore && <ToggleRow label="Up for Grabs" hint="Anyone can do it — whoever does gets the stars" on={d.upForGrabs} onChange={(v) => set({ upForGrabs: v, profileIds: v ? [] : d.profileIds })} icon={<span style={{ fontSize: 24 }}>🏠</span>} />}
        {!(isChore && d.upForGrabs) && (people.length ? <ProfilePicker value={d.profileIds} onChange={(ids) => set({ profileIds: ids })} includeLabels={false} /> : <div className="muted">Add family members in Settings first.</div>)}
      </Field>

      {isChore ? (
        <>
          <ToggleRow label="Date" hint={d.hasDate ? undefined : "Anytime — stays on today's list until done"} on={d.hasDate || d.repeat.type !== "none"} onChange={(v) => set({ hasDate: v, ...(v ? {} : { repeat: { type: "none" }, hasTime: false }) })} />
          {(d.hasDate || d.repeat.type !== "none") && (
            <div className="form-grid">
              <input className="input" type="date" value={d.date} onChange={(e) => e.target.value && set({ date: e.target.value })} aria-label="Date" />
              <div className="check-row" style={{ paddingRight: 8 }}>
                <span className="grow">Due time</span>
                {d.hasTime && (
                  <input className="input" type="time" value={d.dueTime} onChange={(e) => set({ dueTime: e.target.value })} aria-label="Due time" style={{ width: 150, height: 44, background: "#fff" }} />
                )}
                <Toggle on={d.hasTime} onChange={(v) => set({ hasTime: v })} label="Due time" />
              </div>
            </div>
          )}
          <RepeatEditor
            value={d.repeat}
            onChange={(r) => set({ repeat: r, ...(r.type !== "none" ? { hasDate: true } : {}) })}
            anchorDate={d.date}
            until={d.repeatUntil}
            onUntil={(u) => set({ repeatUntil: u })}
            allowAfterCompletion
          />
        </>
      ) : (
        <>
          <ToggleRow label="Track Habit" hint="Count streaks and celebrate milestones" on={d.trackHabit} onChange={(v) => set({ trackHabit: v })} icon={<span style={{ fontSize: 24 }}>⚡</span>} />
          <Field label="Repeats">
            <div className="row wrap" style={{ gap: 12 }}>
              <span style={{ fontWeight: 600 }}>Every</span>
              <input
                className="input"
                type="number"
                min={1}
                max={99}
                value={rrInterval}
                aria-label="Interval"
                style={{ width: 90 }}
                onChange={(e) => {
                  const n = Math.max(1, Math.min(99, Number(e.target.value) || 1));
                  set({ routineRepeat: rr.type === "weekly" ? { ...rr, interval: n } : { type: "daily", interval: n } });
                }}
              />
              <div className="segmented">
                <button type="button" className={rr.type === "daily" ? "on" : ""} onClick={() => set({ routineRepeat: { type: "daily", interval: rrInterval } })}>
                  Day{rrInterval > 1 ? "s" : ""}
                </button>
                <button
                  type="button"
                  className={rr.type === "weekly" ? "on" : ""}
                  onClick={() => set({ routineRepeat: { type: "weekly", interval: rrInterval, days: rr.type === "weekly" ? rr.days : [0, 1, 2, 3, 4, 5, 6] } })}
                >
                  Week{rrInterval > 1 ? "s" : ""}
                </button>
              </div>
            </div>
            {rr.type === "weekly" && (
              <div className="daychips" style={{ marginTop: 10 }}>
                {DOW.map((name, i) => {
                  const on = rr.days.includes(i);
                  return (
                    <button
                      key={name}
                      type="button"
                      className={on ? "on" : ""}
                      aria-pressed={on}
                      aria-label={name}
                      onClick={() => {
                        const days = on ? rr.days.filter((x) => x !== i) : [...rr.days, i].sort();
                        if (days.length) set({ routineRepeat: { ...rr, days } });
                      }}
                    >
                      {name.slice(0, 2)}
                    </button>
                  );
                })}
              </div>
            )}
          </Field>
          <Field label="In the">
            <div className="chips">
              {PARTS.map((p) => {
                const on = d.parts.includes(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    className={`chip text-only ${on ? "on" : ""}`}
                    aria-pressed={on}
                    onClick={() => set({ parts: on ? d.parts.filter((x) => x !== p.id) : PARTS.map((x) => x.id).filter((x) => x === p.id || d.parts.includes(x)) })}
                  >
                    <span style={{ fontSize: 20 }}>{p.emoji}</span> {p.label}
                  </button>
                );
              })}
            </div>
          </Field>
        </>
      )}
      {error && (
        <div className="error-text" role="alert">
          {error}
        </div>
      )}

      {box && <TaskBox kind={d.kind} onPick={applyPreset} onClose={() => setBox(false)} />}
      {confirmDel && task && (
        <Confirm
          title={`Delete "${task.title}"?`}
          message="It disappears for everyone. Stars already earned are kept."
          onClose={() => setConfirmDel(false)}
          onConfirm={async () => {
            try {
              await del(`/api/tasks/${task.id}`);
              toast("Task deleted");
              onClose();
            } catch (e) {
              if (e instanceof Error && e.message !== "Locked") setError(e.message);
            }
          }}
        />
      )}
    </Modal>
  );
}

export function StarStepper({
  value,
  onChange,
  min = 0,
  max = 500,
  icon = "⭐",
  label = "Stars",
}: {
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  icon?: string;
  label?: string;
}) {
  const clamp = (n: number) => Math.max(min, Math.min(max, Math.round(n)));
  return (
    <div className="tasks-stepper">
      <button type="button" className="icon-btn" aria-label={`Fewer ${label.toLowerCase()}`} onClick={() => onChange(clamp(value - 1))} disabled={value <= min}>
        <Minus />
      </button>
      <span className="tasks-stepper-val">
        <span aria-hidden>{icon}</span>
        <input type="number" min={min} max={max} value={value} aria-label={label} onChange={(e) => onChange(clamp(Number(e.target.value) || 0))} />
      </span>
      <button type="button" className="icon-btn" aria-label={`More ${label.toLowerCase()}`} onClick={() => onChange(clamp(value + 1))} disabled={value >= max}>
        <Plus />
      </button>
    </div>
  );
}

function TaskBox({ kind, onPick, onClose }: { kind: TaskKind; onPick: (p: Preset) => void; onClose: () => void }) {
  const [k, setK] = useState<TaskKind>(kind);
  const list = PRESETS.filter((p) => p.kind === k);
  return (
    <Modal
      title="Task Box"
      onClose={onClose}
      size="wide"
      actions={
        <div className="segmented">
          <button className={k === "chore" ? "on" : ""} onClick={() => setK("chore")}>
            Chores
          </button>
          <button className={k === "routine" ? "on" : ""} onClick={() => setK("routine")}>
            Routines
          </button>
        </div>
      }
    >
      <div className="muted">Pick one to fill in the form — you can change anything after.</div>
      <div className="tasks-box-grid">
        {list.map((p) => (
          <button key={p.title} type="button" className="tasks-box-tile" onClick={() => onPick(p)}>
            <span className="e">{p.emoji}</span>
            <span className="t">{p.title}</span>
            <span className="s">
              ⭐ {p.stars}
              {p.parts ? ` · ${p.parts.map((x) => x[0].toUpperCase() + x.slice(1, 3)).join(", ")}` : p.repeat && p.repeat.type !== "none" ? ` · ${repeatShort(p.repeat)}` : ""}
            </span>
          </button>
        ))}
      </div>
    </Modal>
  );
}

function repeatShort(r: Repeat): string {
  if (r.type === "daily") return "Daily";
  if (r.type === "weekly") return r.days.length === 1 ? `${DOW[r.days[0]]}s` : r.days.map((x) => DOW[x].slice(0, 2)).join(" ");
  if (r.type === "afterCompletion") return `Every ${r.interval} ${r.unit}s`;
  return "";
}

