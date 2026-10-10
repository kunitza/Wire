import { useState } from "react";
import { Clock, MapPin, Sparkles } from "lucide-react";
import { useApp } from "../../lib/store";
import { post } from "../../lib/api";
import { Field, Modal, ProfilePicker } from "../../components/ui";
import { fmtRange, longDate } from "../../lib/format";
import { addDays, dayOfWeek } from "../../../shared/dates";
import { AiErrorBox, CheckBox, Thinking, aiCall } from "./parts";

interface Option {
  title: string;
  description: string;
  start: string;
  end: string;
  location: string;
}

const BUDGETS = [
  { value: "free", label: "Free" },
  { value: "$", label: "$" },
  { value: "$$", label: "$$" },
  { value: "$$$", label: "$$$" },
];

/** Upcoming weekend day (today if it's already the weekend). */
function nextWeekend(today: string): string {
  const w = dayOfWeek(today);
  return w === 0 || w === 6 ? today : addDays(today, 6 - w);
}

export function ActivityPlannerDialog({ onClose }: { onClose: () => void }) {
  const { settings, today, people, run, celebrate, profileById } = useApp();
  const day = nextWeekend(today);
  const [kind, setKind] = useState<"local" | "family">("local");
  const [location, setLocation] = useState(settings.location?.name ?? "");
  const [start, setStart] = useState(`${day}T10:00`);
  const [end, setEnd] = useState(`${day}T16:00`);
  const [who, setWho] = useState<number[]>([]);
  const [budget, setBudget] = useState("$");
  const [vibe, setVibe] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [options, setOptions] = useState<Option[] | null>(null);
  const [picked, setPicked] = useState<Set<number>>(new Set());

  const plan = async () => {
    setBusy(true);
    setError(null);
    const r = await aiCall(() =>
      post<{ options: Option[] }>("/api/ai/activities", {
        kind,
        location,
        start,
        end,
        budget: budget === "free" ? "free" : budget,
        vibe,
        people: who.map((id) => profileById(id)?.name).filter(Boolean),
      }),
    );
    setBusy(false);
    if (r.error) setError(r.error);
    if (r.data) {
      setOptions(r.data.options.slice(0, 4));
      setPicked(new Set());
    }
  };

  const add = async () => {
    if (!options) return;
    const ids = who.length ? who : people[0] ? [people[0].id] : [];
    const chosen = options.filter((_, i) => picked.has(i));
    const ok = await run(async () => {
      for (const o of chosen) {
        await post("/api/events", { title: o.title, allDay: false, start: o.start, end: o.end, location: o.location, notes: o.description, profileIds: ids, repeat: { type: "none" } });
      }
      return true;
    }, `${chosen.length === 1 ? "1 activity" : `${chosen.length} activities`} added to the calendar`);
    if (ok) {
      celebrate("small", ["🎈", "🌳", "✨"]);
      onClose();
    }
  };

  if (busy) {
    return (
      <Modal title="Activity planner" onClose={onClose} size="narrow">
        <Thinking title="Finding fun things to do…" hint="Sidekick suggests kinds of places and activities; double-check opening times before you go." />
      </Modal>
    );
  }

  if (options) {
    return (
      <Modal
        title="Ideas for you"
        onClose={onClose}
        footer={
          <>
            <button className="pill" onClick={() => setOptions(null)} style={{ marginRight: "auto" }}>
              Change details
            </button>
            <button className="pill" onClick={plan}>
              <Sparkles />
              More ideas
            </button>
            <button className="pill primary" disabled={!picked.size} onClick={add}>
              {picked.size ? `Add ${picked.size} to Calendar` : "Add to Calendar"}
            </button>
          </>
        }
      >
        {!options.length && (
          <div className="empty">
            <div className="big">🤷</div>
            No ideas this time. Try a different vibe or a longer window.
          </div>
        )}
        {options.map((o, i) => {
          const on = picked.has(i);
          const sameDay = o.start.slice(0, 10) === o.end.slice(0, 10);
          return (
            <button
              key={i}
              type="button"
              className={`sk-option ${on ? "on" : ""}`}
              aria-pressed={on}
              onClick={() => {
                const n = new Set(picked);
                if (on) n.delete(i);
                else n.add(i);
                setPicked(n);
              }}
            >
              <CheckBox on={on} />
              <div className="grow">
                <div className="t">{o.title}</div>
                <div className="d">{o.description}</div>
                <div className="m">
                  <span className="row" style={{ gap: 6 }}>
                    <Clock size={16} />
                    {longDate(o.start.slice(0, 10))}
                    {sameDay && o.start.length > 10 ? ` · ${fmtRange(o.start, o.end, settings.clock24h)}` : ""}
                  </span>
                  {o.location && (
                    <span className="row" style={{ gap: 6 }}>
                      <MapPin size={16} />
                      {o.location}
                    </span>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </Modal>
    );
  }

  return (
    <Modal
      title="Activity planner"
      onClose={onClose}
      footer={
        <>
          <button className="pill" onClick={onClose}>
            Cancel
          </button>
          <button className="pill primary" disabled={!start || !end || end <= start} onClick={plan}>
            <Sparkles />
            Get ideas
          </button>
        </>
      }
    >
      <div className="segmented" style={{ alignSelf: "flex-start" }}>
        <button type="button" className={kind === "local" ? "on" : ""} onClick={() => setKind("local")}>
          🌳 Local outing
        </button>
        <button type="button" className={kind === "family" ? "on" : ""} onClick={() => setKind("family")}>
          🏡 Family activity
        </button>
      </div>
      <Field label="Near">
        <input className="input" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Town or neighborhood" />
      </Field>
      <div className="form-grid">
        <Field label="From">
          <input className="input" type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
        </Field>
        <Field label="Until">
          <input className="input" type="datetime-local" value={end} min={start} onChange={(e) => setEnd(e.target.value)} />
        </Field>
      </div>
      <Field label="Who's going?">
        <ProfilePicker value={who} onChange={setWho} includeLabels={false} />
      </Field>
      <Field label="Budget">
        <div className="segmented" style={{ alignSelf: "flex-start" }}>
          {BUDGETS.map((b) => (
            <button key={b.value} type="button" className={budget === b.value ? "on" : ""} onClick={() => setBudget(b.value)} style={{ minWidth: 70, justifyContent: "center" }}>
              {b.label}
            </button>
          ))}
        </div>
      </Field>
      <Field label="Vibe (optional)">
        <input className="input" value={vibe} onChange={(e) => setVibe(e.target.value)} placeholder="e.g. outdoorsy, rainy-day, toddler-friendly, something new" />
      </Field>
      {error && <AiErrorBox message={error} onClose={onClose} />}
    </Modal>
  );
}
