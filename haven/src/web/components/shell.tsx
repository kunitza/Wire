import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Calendar, CheckSquare, Star, Utensils, BookOpen, Sparkles, Moon, Settings as Gear, List as ListIcon, Home, Lock, Unlock, Check, MoreHorizontal, AlertCircle } from "lucide-react";
import { useApp, type Screen } from "../lib/store";
import { clock, fmtTime, headerDate, weatherEmoji } from "../lib/format";
import { post, get, put } from "../lib/api";
import { Modal, ToggleRow } from "./ui";
import type { CalendarEvent, SessionInfo, TaskInstance } from "../../shared/types";
import { addDays } from "../../shared/dates";

const NAV: { id: Screen; label: string; icon: typeof Calendar }[] = [
  { id: "calendar", label: "Calendar", icon: Calendar },
  { id: "lists", label: "Lists", icon: ListIcon },
  { id: "tasks", label: "Tasks", icon: CheckSquare },
  { id: "rewards", label: "Rewards", icon: Star },
  { id: "meals", label: "Meals", icon: Utensils },
  { id: "recipes", label: "Recipes", icon: BookOpen },
  { id: "sidekick", label: "Sidekick", icon: Sparkles },
];

export function Sidebar({ onSleep }: { onSleep: () => void }) {
  const { screen, go, session, unlock, run, reload } = useApp();
  return (
    <nav className="sidebar" aria-label="Main">
      <button className={`brand ${screen === "home" ? "active" : ""}`} onClick={() => go("home")}>
        <span className="mark">H</span>
        Home
      </button>
      {NAV.map((n) => (
        <button key={n.id} className={`nav-item ${screen === n.id ? "active" : ""}`} onClick={() => go(n.id)}>
          <n.icon />
          {n.label}
        </button>
      ))}
      <div className="spacer" />
      {session.lockEnabled && (
        <button
          className="nav-item"
          onClick={async () => {
            if (session.canEdit) {
              await run(() => post("/api/session/lock"));
              await reload();
            } else await unlock();
          }}
        >
          {session.canEdit ? <Unlock /> : <Lock />}
          {session.canEdit ? "Unlocked" : "Locked"}
        </button>
      )}
      <button className="nav-item" onClick={onSleep}>
        <Moon />
        Sleep
      </button>
      <button className={`nav-item ${screen === "settings" ? "active" : ""}`} onClick={() => go("settings")}>
        <Gear />
        Settings
      </button>
    </nav>
  );
}

export function BottomNav() {
  const { screen, go } = useApp();
  const [more, setMore] = useState(false);
  const main: { id: Screen; label: string; icon: typeof Calendar }[] = [
    { id: "home", label: "Home", icon: Home },
    { id: "calendar", label: "Calendar", icon: Calendar },
    { id: "tasks", label: "Tasks", icon: CheckSquare },
    { id: "lists", label: "Lists", icon: ListIcon },
  ];
  const rest: { id: Screen; label: string; icon: typeof Calendar }[] = [
    { id: "rewards", label: "Rewards", icon: Star },
    { id: "meals", label: "Meals", icon: Utensils },
    { id: "recipes", label: "Recipes", icon: BookOpen },
    { id: "sidekick", label: "Sidekick", icon: Sparkles },
    { id: "settings", label: "Settings", icon: Gear },
  ];
  return (
    <>
      <nav className="bottom-nav" aria-label="Main">
        {main.map((n) => (
          <button key={n.id} className={screen === n.id ? "active" : ""} onClick={() => go(n.id)}>
            <n.icon />
            {n.label}
          </button>
        ))}
        <button className={rest.some((r) => r.id === screen) ? "active" : ""} onClick={() => setMore(true)}>
          <MoreHorizontal />
          More
        </button>
      </nav>
      {more && (
        <Modal title="More" onClose={() => setMore(false)}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
            {rest.map((n) => (
              <button
                key={n.id}
                className="col"
                style={{ alignItems: "center", padding: 14, borderRadius: 20, background: "var(--fill-2)", gap: 8 }}
                onClick={() => {
                  go(n.id);
                  setMore(false);
                }}
              >
                <n.icon size={28} />
                {n.label}
              </button>
            ))}
          </div>
        </Modal>
      )}
    </>
  );
}

/** Top information bar: date, time, weather and the screen's own controls. */
export function Header({ children, title }: { children?: ReactNode; title?: ReactNode }) {
  const { now, today, settings, weather, go } = useApp();
  const name = settings.displayName.trim();
  return (
    <header className="header">
      {/* A long display name truncates instead of pushing the screen's controls off the edge. */}
      <div className="date" style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", lineHeight: 1.2 }}>
        {title ?? (name || headerDate(today))}
      </div>
      <div className="time" style={{ flex: "none" }}>
        {clock(now, settings.clock24h)}
      </div>
      {weather.current ? (
        <div className="wx hide-phone" title="Weather">
          <span className="wx-icon">{weatherEmoji(weather.current.code, weather.current.isDay)}</span>
          {weather.current.temp}°
        </div>
      ) : (
        <button className="icon-btn hide-phone" title="Add your address for weather" onClick={() => go("settings")} style={{ background: "transparent" }}>
          <AlertCircle />
        </button>
      )}
      <div className="controls" style={{ flex: "none" }}>
        {children}
      </div>
    </header>
  );
}

export function Fab({ onClick, label = "Add" }: { onClick: () => void; label?: string }) {
  return (
    <button className="fab" onClick={onClick} aria-label={label}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round">
        <path d="M12 5v14M5 12h14" />
      </svg>
    </button>
  );
}

// ---------- PIN pad ----------
export function PinPad() {
  const { pinPrompt, setPinPrompt, reload, toast } = useApp();
  const [pin, setPin] = useState("");
  const [error, setError] = useState(false);
  const [remember, setRemember] = useState(false);
  const [forgot, setForgot] = useState(false);
  useEffect(() => {
    setPin("");
    setError(false);
    // "Remember this device" is a per-unlock choice; never carry it over to the next prompt.
    setRemember(false);
  }, [pinPrompt]);
  if (!pinPrompt) return null;
  const close = (ok: boolean) => {
    pinPrompt.resolve(ok);
    setPinPrompt(null);
  };
  const submit = async (p: string) => {
    try {
      await post<SessionInfo>("/api/session/unlock", { pin: p, remember });
      await reload();
      close(true);
    } catch {
      setError(true);
      setPin("");
      if (navigator.vibrate) navigator.vibrate(120);
    }
  };
  const press = (d: string) => {
    if (pin.length >= 4) return;
    const next = pin + d;
    setPin(next);
    setError(false);
    if (next.length === 4) submit(next);
  };
  return (
    <Modal title="Enter PIN to make changes" onClose={() => close(false)} size="narrow">
      <div className="col" style={{ alignItems: "center", gap: 18 }}>
        <div className="row" style={{ gap: 16 }} aria-live="polite">
          {[0, 1, 2, 3].map((i) => (
            <span key={i} style={{ width: 22, height: 22, borderRadius: 99, background: i < pin.length ? "var(--text)" : "var(--fill-3)", transition: "background 0.1s" }} />
          ))}
        </div>
        {error && <div className="error-text">That PIN didn't match. Try again.</div>}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 84px)", gap: 14 }}>
          {["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"].map((k, i) =>
            k === "" ? (
              <span key={i} />
            ) : (
              <button
                key={i}
                className="serif"
                style={{ height: 84, borderRadius: 99, background: "var(--fill-2)", fontSize: 32 }}
                onClick={() => (k === "⌫" ? setPin(pin.slice(0, -1)) : press(k))}
                aria-label={k === "⌫" ? "Delete" : k}
              >
                {k}
              </button>
            ),
          )}
        </div>
        <div style={{ width: "100%" }}>
          <ToggleRow label="Remember this device" hint="For a parent's phone. Stays unlocked until you lock it." on={remember} onChange={setRemember} />
        </div>
        <button className="link" onClick={() => setForgot(true)}>
          Forgot PIN?
        </button>
      </div>
      {forgot && (
        <Modal title="Forgot PIN?" onClose={() => setForgot(false)} size="narrow">
          <p style={{ margin: 0, lineHeight: 1.5 }}>
            Open Haven on a device you marked "Remember this device" and set a new PIN in Settings → Parental Lock. If none is unlocked, run{" "}
            <code>npm run reset-pin</code> on the Raspberry Pi (see the README).
          </p>
          <button
            className="pill primary"
            onClick={() => {
              setForgot(false);
              toast("See README → Reset the PIN");
            }}
          >
            OK
          </button>
        </Modal>
      )}
    </Modal>
  );
}

export function Toasts() {
  const { toasts } = useApp();
  // Tapping a toast's action (e.g. Undo) runs it once and hides the toast.
  const [done, setDone] = useState<Set<number>>(() => new Set());
  return createPortal(
    <div className="toast-wrap" role="status" aria-live="polite">
      {toasts
        .filter((t) => !done.has(t.id))
        .map((t) => (
          <div key={t.id} className="toast">
            {t.text}
            {t.action && (
              <button
                onClick={() => {
                  setDone((d) => new Set(d).add(t.id));
                  t.action!.run();
                }}
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
    </div>,
    document.body,
  );
}

// ---------- Celebrations ----------
const SEASONAL = (): string[] => {
  const m = new Date().getMonth();
  if (m === 9) return ["🎃", "👻", "🍬", "🦇", "🍂"];
  if (m === 11) return ["🎄", "⛄", "❄️", "🎁", "✨"];
  if (m === 1) return ["💖", "💝", "💕", "🌹", "✨"];
  if (m >= 5 && m <= 7) return ["☀️", "🍉", "🏖️", "🌈", "✨"];
  if (m >= 2 && m <= 4) return ["🌷", "🌸", "🐣", "🌈", "✨"];
  return ["🎉", "⭐", "🎊", "🥳", "✨"];
};

export function EmojiRain() {
  const { celebration, settings } = useApp();
  const [items, setItems] = useState<{ id: number; e: string; left: number; size: number; dur: number; delay: number; rot: number }[]>([]);
  useEffect(() => {
    if (!celebration || !settings.funMode) return;
    const set = celebration.emoji.length ? celebration.emoji : celebration.kind === "reward" ? ["🎁", "⭐", "🎉", "🥳", "✨"] : SEASONAL();
    const n = celebration.kind === "small" ? 18 : 70;
    setItems(
      Array.from({ length: n }, (_, i) => ({
        id: celebration.id + i,
        e: set[i % set.length],
        left: Math.random() * 100,
        size: 28 + Math.random() * 40,
        dur: 2.4 + Math.random() * 2.2,
        delay: Math.random() * (celebration.kind === "small" ? 0.4 : 1.4),
        rot: Math.round(Math.random() * 540 - 270),
      })),
    );
    const t = setTimeout(() => setItems([]), 5500);
    return () => clearTimeout(t);
  }, [celebration, settings.funMode]);
  if (!items.length) return null;
  return createPortal(
    <div className="emoji-rain" aria-hidden>
      {items.map((it) => (
        <span
          key={it.id}
          style={{ left: `${it.left}%`, fontSize: it.size, animationDuration: `${it.dur}s`, animationDelay: `${it.delay}s`, ["--rot" as string]: `${it.rot}deg` }}
        >
          {it.e}
        </span>
      ))}
    </div>,
    document.body,
  );
}

// ---------- Sleep mode ----------
function minutes(t: string) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}
export function inSleepWindow(now: Date, start: string, end: string) {
  const n = now.getHours() * 60 + now.getMinutes();
  const s = minutes(start);
  const e = minutes(end);
  return s <= e ? n >= s && n < e : n >= s || n < e;
}

export function SleepController() {
  const { settings, now, sleeping, setSleeping } = useApp();
  const wokeAt = useRef<number>(0);
  const scheduled = settings.sleep.enabled && inSleepWindow(now, settings.sleep.start, settings.sleep.end);
  const lastScheduled = useRef(scheduled);
  useEffect(() => {
    // Enter sleep when the window starts; leave when it ends. A tap wakes it for 5 minutes.
    if (scheduled && !lastScheduled.current) setSleeping(true);
    if (!scheduled && lastScheduled.current) setSleeping(false);
    if (scheduled && !sleeping && Date.now() - wokeAt.current > 5 * 60000 && wokeAt.current) setSleeping(true);
    lastScheduled.current = scheduled;
    // `now` ticks every 15s so a tap-to-wake inside the window goes back to sleep after 5 minutes.
  }, [scheduled, sleeping, setSleeping, now]);
  useEffect(() => {
    if (scheduled && !wokeAt.current) setSleeping(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    // Ask the Pi to switch the monitor off/on (if configured).
    post("/api/display", { on: !sleeping }).catch(() => undefined);
  }, [sleeping]);
  if (!sleeping) return null;
  return createPortal(
    <div
      className="sleep-screen"
      onClick={() => {
        wokeAt.current = Date.now();
        setSleeping(false);
      }}
      aria-label="Sleeping. Tap to wake."
    />,
    document.body,
  );
}

export function SleepDialog({ onClose }: { onClose: () => void }) {
  const { settings, run, setSleeping } = useApp();
  const [s, setS] = useState(settings.sleep);
  return (
    <Modal
      title="Sleep"
      onClose={onClose}
      size="narrow"
      footer={
        <>
          <button
            className="pill outline"
            onClick={() => {
              setSleeping(true);
              onClose();
            }}
          >
            Enter Sleep Mode Now
          </button>
          <button
            className="pill primary"
            onClick={async () => {
              if (await run(() => put("/api/settings", { sleep: s }), "Sleep schedule saved")) onClose();
            }}
          >
            Save
          </button>
        </>
      }
    >
      <ToggleRow label="Sleep Mode Schedule" hint="The screen turns off overnight. Tap anywhere to wake it." on={s.enabled} onChange={(v) => setS({ ...s, enabled: v })} />
      {s.enabled && (
        <div className="form-grid">
          <label className="field">
            <span className="label">From</span>
            <input className="input" type="time" value={s.start} onChange={(e) => setS({ ...s, start: e.target.value })} />
          </label>
          <label className="field">
            <span className="label">To</span>
            <input className="input" type="time" value={s.end} onChange={(e) => setS({ ...s, end: e.target.value })} />
          </label>
        </div>
      )}
    </Modal>
  );
}

// ---------- Reminders ----------
interface Due {
  key: string;
  kind: "event" | "task";
  title: string;
  when: string;
  profileIds: number[];
}

export function Reminders() {
  const { settings, today, now, profileById } = useApp();
  const [due, setDue] = useState<Due[]>([]);
  const h24 = settings.clock24h;
  const fired = useRef(new Set<string>(JSON.parse(sessionStorage.getItem("haven-reminded") ?? "[]")));
  const minute = Math.floor(now.getTime() / 60000);
  useEffect(() => {
    const r = settings.reminders;
    if (!r.eventsAtTime && r.eventsMinutesBefore == null && !r.tasksWhenDue) return;
    let cancelled = false;
    (async () => {
      const [events, tasks] = await Promise.all([
        // Through tomorrow, so "1 day before" (and late-evening "15 minutes before") reminders for tomorrow's events fire.
        get<CalendarEvent[]>(`/api/events?from=${today}&to=${addDays(today, 2)}`),
        r.tasksWhenDue ? get<TaskInstance[]>(`/api/tasks/instances?from=${today}&to=${addDays(today, 1)}`) : Promise.resolve([]),
      ]);
      if (cancelled) return;
      const nowMs = Date.now();
      const hits: Due[] = [];
      const check = (key: string, at: number, item: Omit<Due, "key">) => {
        if (nowMs >= at && nowMs - at < 5 * 60000 && !fired.current.has(key)) {
          fired.current.add(key);
          hits.push({ key, ...item });
        }
      };
      for (const e of events) {
        if (e.allDay || e.start.slice(0, 10) < today) continue;
        const at = new Date(e.start).getTime();
        const custom = e.reminderMinutes;
        if (custom === -1) continue;
        const item = { kind: "event" as const, title: e.title, when: e.start, profileIds: e.profileIds };
        if (custom != null) check(`${e.key}:c`, at - custom * 60000, item);
        else {
          if (r.eventsMinutesBefore != null) check(`${e.key}:b`, at - r.eventsMinutesBefore * 60000, item);
          if (r.eventsAtTime) check(`${e.key}:a`, at, item);
        }
      }
      for (const t of tasks) {
        if (!t.task.dueTime || t.status !== "open" || t.date !== today) continue;
        check(`task:${t.task.id}:${t.occurrence}:${t.profileId}`, new Date(`${today}T${t.task.dueTime}`).getTime(), {
          kind: "task",
          title: t.task.title,
          when: `${today}T${t.task.dueTime}`,
          profileIds: t.profileId ? [t.profileId] : [],
        });
      }
      sessionStorage.setItem("haven-reminded", JSON.stringify([...fired.current].slice(-300)));
      if (hits.length) {
        setDue((d) => [...d, ...hits]);
        if (r.sound) chime();
      }
    })().catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minute, today]);
  const people = useMemo(() => due.map((d) => d.profileIds.map((id) => profileById(id)).filter(Boolean)), [due, profileById]);
  if (!due.length) return null;
  return (
    <Modal title="Reminders" onClose={() => setDue([])} size="narrow" footer={<button className="pill primary block lg" onClick={() => setDue([])}>Dismiss</button>}>
      {due.map((d, i) => (
        <div key={d.key} className="row" style={{ background: d.kind === "event" ? "#e3f0fa" : "#cfe5f5", borderRadius: 99, padding: "10px 16px", gap: 14 }}>
          <span className="avatar" style={{ width: 40, height: 40, background: "#fff", color: "var(--blue)" }}>
            {d.kind === "event" ? <Calendar size={20} /> : <Check size={20} />}
          </span>
          <div className="grow">
            <div style={{ fontWeight: 600 }}>{d.title}</div>
            <div className="muted">
              {d.when.slice(0, 10) > today ? "Tomorrow, " : ""}
              {fmtTime(d.when, h24)}
            </div>
          </div>
          <span>{people[i].map((p) => p!.avatar || p!.name[0]).join(" ")}</span>
        </div>
      ))}
    </Modal>
  );
}

function chime() {
  try {
    const ac = new AudioContext();
    [880, 1320].forEach((f, i) => {
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.frequency.value = f;
      o.connect(g);
      g.connect(ac.destination);
      const t = ac.currentTime + i * 0.22;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.3, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
      o.start(t);
      o.stop(t + 0.65);
    });
  } catch {
    /* audio may be blocked until a tap */
  }
}
