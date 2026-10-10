import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Pause, Play, Plus, X, Timer as TimerIcon, BellOff } from "lucide-react";
import { Modal } from "./ui";
import { useApp, useLive } from "../lib/store";
import { del, post } from "../lib/api";
import type { KitchenTimer } from "../../shared/types";
import "./timers.css";

// Kitchen timers: set from any screen, a phone, Siri/Google or Claude; they ring on every open screen
// (the wall display included) until someone dismisses them.

const PRESETS = [1, 2, 3, 5, 10, 15, 20, 30, 45, 60];
const LABELS = ["🍝 Pasta", "🍪 Oven", "🥚 Eggs", "📚 Homework", "📺 Screen time", "🛁 Bath", "🎹 Practice", "🧘 Quiet time"];

export function openTimers() {
  window.dispatchEvent(new Event("haven:timers"));
}

function fmt(sec: number): string {
  const s = Math.max(0, Math.ceil(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}` : `${m}:${String(r).padStart(2, "0")}`;
}

/** Seconds left right now (counts down locally between server updates). */
function left(t: KitchenTimer, now: number): number {
  return t.endsAt ? Math.max(0, (new Date(t.endsAt).getTime() - now) / 1000) : t.remainingSec;
}

function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const i = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(i);
  }, [active]);
  return now;
}

export function useTimers() {
  const { data, reload } = useLive<KitchenTimer[]>("/api/timers", ["timers"]);
  return { timers: data ?? [], reload };
}

/** Floating tray of running timers + the ringing alarm + the timers panel. Mounted once in the shell. */
export function TimerLayer() {
  const { timers } = useTimers();
  const { run, setSleeping, isPhone } = useApp();
  const [panel, setPanel] = useState(false);
  const now = useNow(timers.length > 0);
  useEffect(() => {
    const on = () => setPanel(true);
    window.addEventListener("haven:timers", on);
    return () => window.removeEventListener("haven:timers", on);
  }, []);
  const ringing = useMemo(() => timers.filter((t) => t.endsAt && left(t, now) <= 0), [timers, now]);
  const running = timers.filter((t) => !ringing.includes(t));

  // Leave room at the bottom of screens so the timer chips don't cover content.
  useEffect(() => {
    document.documentElement.classList.toggle("has-timers", running.length > 0);
  }, [running.length]);

  // Wake the screen when a timer goes off.
  useEffect(() => {
    if (ringing.length) setSleeping(false);
  }, [ringing.length, setSleeping]);
  useAlarm(ringing.length > 0);

  return (
    <>
      {running.length > 0 && !panel &&
        createPortal(
          <div className={`timer-tray ${isPhone ? "phone" : ""}`}>
            {running.map((t) => (
              <button key={t.id} className={`timer-chip ${t.endsAt ? "" : "paused"}`} onClick={() => setPanel(true)} aria-label={`${t.label}, ${fmt(left(t, now))} left`}>
                <TimerIcon size={18} />
                <span className="truncate">{t.label}</span>
                <b>{fmt(left(t, now))}</b>
              </button>
            ))}
          </div>,
          document.body,
        )}
      {panel && <TimerPanel timers={timers} now={now} onClose={() => setPanel(false)} />}
      {ringing.length > 0 &&
        createPortal(
          <div className="timer-alarm" role="alertdialog" aria-label="Timer finished">
            <div className="timer-alarm-card">
              <div className="timer-alarm-icon">⏰</div>
              <div className="serif timer-alarm-title">Time's up!</div>
              <div className="timer-alarm-labels">{ringing.map((t) => t.label).join(" · ")}</div>
              <div className="row" style={{ gap: 14, justifyContent: "center", flexWrap: "wrap" }}>
                <button className="pill lg" onClick={() => ringing.forEach((t) => run(() => post(`/api/timers/${t.id}/add`, { seconds: 60 })))}>
                  <Plus /> 1 minute
                </button>
                <button className="pill lg primary" style={{ minWidth: 220 }} onClick={() => ringing.forEach((t) => run(() => del(`/api/timers/${t.id}`)))}>
                  <BellOff /> Dismiss
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

function TimerPanel({ timers, now, onClose }: { timers: KitchenTimer[]; now: number; onClose: () => void }) {
  const { run } = useApp();
  const [label, setLabel] = useState("");
  const [min, setMin] = useState(10);
  const [sec, setSec] = useState(0);
  const start = async (seconds: number, l = label) => {
    if (seconds <= 0) return;
    if (await run(() => post("/api/timers", { seconds, label: l.replace(/^\p{Extended_Pictographic}\s*/u, "").trim() ? l : "" }))) setLabel("");
  };
  return (
    <Modal title="Timers" onClose={onClose} size="wide">
      {timers.length > 0 && (
        <div className="col" style={{ gap: 10 }}>
          {timers.map((t) => {
            const l = left(t, now);
            const pct = t.durationSec ? Math.min(1, l / t.durationSec) : 0;
            return (
              <div key={t.id} className={`timer-row ${t.endsAt && l <= 0 ? "ringing" : ""}`}>
                <div className="timer-row-bar" style={{ width: `${pct * 100}%` }} />
                <div className="grow" style={{ position: "relative" }}>
                  <div className="timer-row-label truncate">{t.label}</div>
                  <div className="timer-row-time serif">{t.endsAt && l <= 0 ? "Done!" : fmt(l)}</div>
                </div>
                <div className="row" style={{ position: "relative", gap: 8 }}>
                  <button className="pill" onClick={() => run(() => post(`/api/timers/${t.id}/add`, { seconds: 60 }))}>
                    +1 min
                  </button>
                  {t.endsAt ? (
                    l > 0 && (
                      <button className="pill icon" aria-label="Pause" onClick={() => run(() => post(`/api/timers/${t.id}/pause`))}>
                        <Pause />
                      </button>
                    )
                  ) : (
                    <button className="pill icon" aria-label="Resume" onClick={() => run(() => post(`/api/timers/${t.id}/resume`))}>
                      <Play />
                    </button>
                  )}
                  <button className="pill icon danger" aria-label={`Cancel ${t.label}`} onClick={() => run(() => del(`/api/timers/${t.id}`))}>
                    <X />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="timer-new">
        <div className="label">New timer</div>
        <input className="input" placeholder="Name (optional), e.g. Pasta" value={label} maxLength={40} onChange={(e) => setLabel(e.target.value)} />
        <div className="chips">
          {LABELS.map((l) => (
            <button key={l} type="button" className={`chip text-only ${label === l ? "on" : ""}`} onClick={() => setLabel(label === l ? "" : l)}>
              {l}
            </button>
          ))}
        </div>
        <div className="label" style={{ marginTop: 6 }}>
          Tap a time to start
        </div>
        <div className="timer-presets">
          {PRESETS.map((m) => (
            <button key={m} type="button" className="timer-preset" onClick={() => start(m * 60)}>
              <b>{m}</b>
              <span>min</span>
            </button>
          ))}
        </div>
        <div className="row wrap" style={{ gap: 10 }}>
          <span style={{ fontWeight: 600 }}>Or</span>
          <input className="input" type="number" min={0} max={1440} value={min} onChange={(e) => setMin(Math.max(0, Number(e.target.value) || 0))} style={{ width: 110 }} aria-label="Minutes" />
          <span>min</span>
          <input className="input" type="number" min={0} max={59} value={sec} onChange={(e) => setSec(Math.max(0, Math.min(59, Number(e.target.value) || 0)))} style={{ width: 100 }} aria-label="Seconds" />
          <span>sec</span>
          <button className="pill primary" disabled={min * 60 + sec <= 0} onClick={() => start(min * 60 + sec)}>
            <Play /> Start
          </button>
        </div>
        <p className="muted" style={{ margin: 0, fontSize: 15 }}>
          Tip: "Hey Siri, chore done" → "set a 10 minute pasta timer" works too.
        </p>
      </div>
    </Modal>
  );
}

/** Repeating two-tone beep while `on`. Browsers may block sound until the screen has been tapped once. */
function useAlarm(on: boolean) {
  const ctxRef = useRef<AudioContext | null>(null);
  useEffect(() => {
    if (!on) return;
    let stopped = false;
    const ac = ctxRef.current ?? new AudioContext();
    ctxRef.current = ac;
    const beep = () => {
      if (stopped) return;
      try {
        if (ac.state === "suspended") void ac.resume();
        [0, 0.25, 0.5].forEach((d, i) => {
          const o = ac.createOscillator();
          const g = ac.createGain();
          o.type = "sine";
          o.frequency.value = i === 1 ? 1175 : 988;
          o.connect(g);
          g.connect(ac.destination);
          const t = ac.currentTime + d;
          g.gain.setValueAtTime(0.0001, t);
          g.gain.exponentialRampToValueAtTime(0.4, t + 0.02);
          g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
          o.start(t);
          o.stop(t + 0.22);
        });
      } catch {
        /* audio unavailable */
      }
    };
    beep();
    const i = setInterval(beep, 1600);
    return () => {
      stopped = true;
      clearInterval(i);
    };
  }, [on]);
}
