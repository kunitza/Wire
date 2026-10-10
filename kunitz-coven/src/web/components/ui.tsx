import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X, Check } from "lucide-react";
import type { Profile, Repeat, RepeatUnit } from "../../shared/types";
import { dayOfWeek, parseDate } from "../../shared/dates";
import { DOW, isDark, tint } from "../lib/format";
import { useApp } from "../lib/store";

// ---------- Avatar ----------
export function Avatar({ profile, size = 40, ring = false, style }: { profile?: Profile | null; size?: number; ring?: boolean; style?: CSSProperties }) {
  if (!profile) return <span className="avatar" style={{ width: size, height: size, background: "#ddd", ...style }} />;
  const emoji = profile.avatar && profile.avatar.trim();
  const base: CSSProperties = {
    width: size,
    height: size,
    fontSize: emoji ? size * 0.58 : size * 0.44,
    boxShadow: ring ? `0 0 0 ${Math.max(2, size / 22)}px #fff, 0 0 0 ${Math.max(3, size / 14)}px ${profile.color}` : undefined,
    ...style,
  };
  if (emoji) return <span className="avatar emoji" style={{ ...base, background: tint(profile.color, 0.28) }} aria-label={profile.name}>{emoji}</span>;
  return (
    <span className="avatar" style={{ ...base, background: profile.color, color: isDark(profile.color) ? "#fff" : "#1f1f1f" }} aria-label={profile.name}>
      {profile.name.slice(0, 1).toUpperCase()}
    </span>
  );
}

export function AvatarStack({ profiles, size = 28, max = 3 }: { profiles: Profile[]; size?: number; max?: number }) {
  const shown = profiles.slice(0, max);
  return (
    <span className="avatar-stack">
      {shown.map((p) => (
        <Avatar key={p.id} profile={p} size={size} style={{ boxShadow: "0 0 0 2px #fff" }} />
      ))}
      {profiles.length > max && (
        <span className="avatar" style={{ width: size, height: size, background: "#e5e5e5", color: "#555", fontSize: size * 0.38, boxShadow: "0 0 0 2px #fff" }}>
          +{profiles.length - max}
        </span>
      )}
    </span>
  );
}

// ---------- Toggle / checkbox rows ----------
export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label?: string }) {
  return <button type="button" role="switch" aria-checked={on} aria-label={label} className={`toggle ${on ? "on" : ""}`} onClick={() => onChange(!on)} />;
}

export function ToggleRow({ label, hint, on, onChange, icon }: { label: ReactNode; hint?: ReactNode; on: boolean; onChange: (v: boolean) => void; icon?: ReactNode }) {
  return (
    <label className="check-row" style={{ cursor: "pointer" }}>
      {icon}
      <span className="grow">
        {label}
        {hint && <small>{hint}</small>}
      </span>
      <Toggle on={on} onChange={onChange} label={typeof label === "string" ? label : undefined} />
    </label>
  );
}

// ---------- Modal ----------
export function Modal({
  title,
  onClose,
  children,
  footer,
  actions,
  size,
  className,
}: {
  title?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  actions?: ReactNode;
  size?: "wide" | "narrow";
  className?: string;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return createPortal(
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${size ?? ""} ${className ?? ""}`} role="dialog" aria-modal="true">
        {(title || actions) && (
          <div className="modal-head">
            <h2>{title}</h2>
            {actions}
            <button className="icon-btn" onClick={onClose} aria-label="Close">
              <X />
            </button>
          </div>
        )}
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

// ---------- Popover anchored to an element ----------
export function Popover({
  anchor,
  onClose,
  children,
  width = 380,
  align = "end",
}: {
  anchor: HTMLElement | null;
  onClose: () => void;
  children: ReactNode;
  width?: number;
  align?: "start" | "end" | "center";
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  useLayoutEffect(() => {
    if (!anchor) return;
    const r = anchor.getBoundingClientRect();
    const w = Math.min(width, window.innerWidth - 16);
    let left = align === "end" ? r.right - w : align === "start" ? r.left : r.left + r.width / 2 - w / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - w - 8));
    let top = r.bottom + 8;
    const h = ref.current?.offsetHeight ?? 300;
    if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 8);
    setPos({ top, left });
  }, [anchor, width, align]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return createPortal(
    <div className="overlay clear" onMouseDown={(e) => e.target === e.currentTarget && onClose()} style={{ display: "block", padding: 0 }}>
      <div ref={ref} className="popover" style={{ width: Math.min(width, window.innerWidth - 16), top: pos?.top ?? -9999, left: pos?.left ?? 0 }}>
        {children}
      </div>
    </div>,
    document.body,
  );
}

// ---------- Confirm ----------
export function Confirm({
  title,
  message,
  confirmLabel = "Delete",
  danger = true,
  onConfirm,
  onClose,
  options,
}: {
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: (option?: string) => void;
  onClose: () => void;
  /** Multiple choices, e.g. "This event" / "This and following" / "All events". */
  options?: { value: string; label: string }[];
}) {
  return (
    <Modal title={title} onClose={onClose} size="narrow">
      {message && <div style={{ color: "var(--text-2)" }}>{message}</div>}
      {options ? (
        <div className="col">
          {options.map((o) => (
            <button
              key={o.value}
              className={`pill lg block ${danger ? "danger" : "primary"}`}
              onClick={() => {
                onConfirm(o.value);
                onClose();
              }}
            >
              {o.label}
            </button>
          ))}
          <button className="pill lg block" onClick={onClose}>
            Cancel
          </button>
        </div>
      ) : (
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button className="pill" onClick={onClose}>
            Cancel
          </button>
          <button
            className={`pill ${danger ? "danger" : "primary"}`}
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            {confirmLabel}
          </button>
        </div>
      )}
    </Modal>
  );
}

// ---------- Profile picker ----------
export function ProfilePicker({
  value,
  onChange,
  multiple = true,
  includeLabels = true,
  allowNone = false,
}: {
  value: number[];
  onChange: (ids: number[]) => void;
  multiple?: boolean;
  includeLabels?: boolean;
  allowNone?: boolean;
}) {
  const { profiles } = useApp();
  const list = profiles.filter((p) => includeLabels || p.kind === "profile");
  return (
    <div className="chips">
      {list.map((p) => {
        const on = value.includes(p.id);
        return (
          <button
            type="button"
            key={p.id}
            className={`chip ${on ? "on" : ""}`}
            style={on ? { borderColor: p.color, background: tint(p.color, 0.18) } : undefined}
            onClick={() => {
              if (multiple) onChange(on ? value.filter((x) => x !== p.id) : [...value, p.id]);
              else onChange(on && allowNone ? [] : [p.id]);
            }}
          >
            <Avatar profile={p} size={32} />
            {p.name}
            {on && <Check size={18} />}
          </button>
        );
      })}
    </div>
  );
}

// ---------- Progress ring ----------
export function ProgressRing({ size, value, color, track = "rgba(0,0,0,0.08)", stroke = 4, children }: { size: number; value: number; color: string; track?: string; stroke?: number; children?: ReactNode }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <span className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeDasharray={c}
          strokeDashoffset={c * (1 - Math.max(0, Math.min(1, value)))}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.4s" }}
        />
      </svg>
      {children}
    </span>
  );
}

// ---------- Check circle (task) ----------
export function CheckCircle({ done, color, size = 44, onClick, label }: { done: boolean; color: string; size?: number; onClick?: () => void; label?: string }) {
  return (
    <button
      type="button"
      aria-label={label ?? (done ? "Mark incomplete" : "Mark complete")}
      aria-pressed={done}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
      style={{
        width: size,
        height: size,
        borderRadius: 99,
        flex: "none",
        background: done ? color : "#fff",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#fff",
        boxShadow: done ? "none" : "inset 0 0 0 1.5px rgba(0,0,0,0.08)",
        transition: "background 0.15s, transform 0.1s",
      }}
    >
      {done && <Check size={size * 0.55} strokeWidth={3} />}
    </button>
  );
}

// ---------- Emoji picker ----------
const EMOJI = (
  "🧹 🧺 🧽 🪣 🧼 🛏️ 🪥 🦷 🛁 🚿 👕 👟 🎒 📚 📖 ✏️ 🎹 🎸 🥁 🎨 ⚽ 🏀 🏈 ⚾ 🎾 🏊 🚴 🤸 🧘 💪 🏃 🐶 🐱 🐟 🐹 🐰 🪴 🌻 🗑️ ♻️ 🍽️ 🍳 🥞 🥗 🌮 🍕 🍝 🍔 🥪 🍎 🍌 🥕 🥦 🍪 🧁 🎂 🍦 🛒 💊 🩺 🦷 🏥 🚗 🚌 ✈️ 🏖️ 🏕️ 🎢 🎬 🎮 🧩 🧸 🎁 🎉 🎈 🏆 ⭐ 💰 📅 ⏰ 💡 📞 💻 📝 ❤️ 🌙 ☀️ 😊 🦄 🦖 🐻 🦊 🐼 🐸 🐵 🦁 🐯 🐨 🐧 🐢 🐙 🦋 🌈 🚀 👑 🏡 👨‍👩‍👧‍👦"
).split(" ");

export function EmojiPicker({ value, onChange, size = 56 }: { value: string; onChange: (e: string) => void; size?: number }) {
  const [open, setOpen] = useState<HTMLElement | null>(null);
  return (
    <>
      <button
        type="button"
        className="icon-btn"
        style={{ width: size, height: size, fontSize: size * 0.5, background: "var(--fill-2)", borderRadius: 16 }}
        onClick={(e) => setOpen(e.currentTarget)}
        aria-label="Choose emoji"
      >
        {value || <span style={{ fontSize: 14, color: "var(--text-3)" }}>Emoji</span>}
      </button>
      {open && (
        <Popover anchor={open} onClose={() => setOpen(null)} width={420} align="start">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(8, 1fr)", gap: 4 }}>
            {EMOJI.map((e, i) => (
              <button
                key={i}
                type="button"
                style={{ fontSize: 28, height: 46, borderRadius: 12 }}
                onClick={() => {
                  onChange(e);
                  setOpen(null);
                }}
              >
                {e}
              </button>
            ))}
          </div>
          <div className="row" style={{ marginTop: 10 }}>
            <input className="input" placeholder="Or type any emoji" maxLength={8} onChange={(e) => e.target.value && onChange(e.target.value)} />
            <button
              type="button"
              className="pill"
              onClick={() => {
                onChange("");
                setOpen(null);
              }}
            >
              None
            </button>
          </div>
        </Popover>
      )}
    </>
  );
}

// ---------- Repeat editor ----------
export function RepeatEditor({
  value,
  onChange,
  anchorDate,
  until,
  onUntil,
  allowAfterCompletion = false,
  units = ["day", "week", "month", "year"],
}: {
  value: Repeat;
  onChange: (r: Repeat) => void;
  anchorDate: string;
  until?: string | null;
  onUntil?: (d: string | null) => void;
  allowAfterCompletion?: boolean;
  units?: RepeatUnit[];
}) {
  const on = value.type !== "none";
  const basedOnCompletion = value.type === "afterCompletion";
  // Moving the start date carries a rule that was based on the old date (weekday / day of month) with it,
  // so "Repeats" turned on before picking the date doesn't leave the first occurrence off the pattern.
  const prevAnchor = useRef(anchorDate);
  useEffect(() => {
    const prev = prevAnchor.current;
    prevAnchor.current = anchorDate;
    if (!prev || !anchorDate || prev === anchorDate) return;
    if (value.type === "weekly" && value.days.length === 1 && value.days[0] === dayOfWeek(prev)) onChange({ ...value, days: [dayOfWeek(anchorDate)] });
    else if (value.type === "monthly" && value.dayOfMonth === parseDate(prev).getUTCDate()) onChange({ ...value, dayOfMonth: parseDate(anchorDate).getUTCDate() });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchorDate]);
  const unit: RepeatUnit =
    value.type === "daily" ? "day" : value.type === "weekly" ? "week" : value.type === "monthly" ? "month" : value.type === "yearly" ? "year" : value.type === "afterCompletion" ? value.unit : "week";
  const interval = "interval" in value ? value.interval : 1;
  const set = (u: RepeatUnit, n: number, completion = basedOnCompletion) => {
    if (completion) return onChange({ type: "afterCompletion", interval: Math.max(1, n), unit: u });
    if (u === "day") onChange({ type: "daily", interval: Math.max(1, n) });
    else if (u === "week") onChange({ type: "weekly", interval: Math.max(1, n), days: value.type === "weekly" ? value.days : [dayOfWeek(anchorDate)] });
    else if (u === "month") onChange({ type: "monthly", interval: Math.max(1, n), dayOfMonth: parseDate(anchorDate).getUTCDate() });
    else onChange({ type: "yearly" });
  };
  return (
    <div className="col" style={{ gap: 12 }}>
      <ToggleRow label="Repeats" on={on} onChange={(v) => (v ? set("week", 1, false) : onChange({ type: "none" }))} />
      {on && (
        <div className="col" style={{ gap: 12, paddingLeft: 4 }}>
          {allowAfterCompletion && (
            <div className="segmented" style={{ alignSelf: "flex-start" }}>
              <button type="button" className={!basedOnCompletion ? "on" : ""} onClick={() => set(unit, interval, false)}>
                Based on scheduled date
              </button>
              <button type="button" className={basedOnCompletion ? "on" : ""} onClick={() => set(unit === "year" ? "week" : unit, interval, true)}>
                Based on completed date
              </button>
            </div>
          )}
          <div className="row">
            <span style={{ fontWeight: 600 }}>{basedOnCompletion ? "After" : "Every"}</span>
            {unit !== "year" && (
              <input
                className="input"
                type="number"
                min={1}
                max={99}
                value={interval}
                onChange={(e) => set(unit, Number(e.target.value) || 1)}
                style={{ width: 90 }}
                aria-label="Interval"
              />
            )}
            <select className="select" value={unit} onChange={(e) => set(e.target.value as RepeatUnit, interval)} style={{ width: 170 }} aria-label="Unit">
              {units
                .filter((u) => !(basedOnCompletion && u === "year"))
                .map((u) => (
                  <option key={u} value={u}>
                    {u}
                    {interval > 1 ? "s" : ""}
                  </option>
                ))}
            </select>
          </div>
          {value.type === "weekly" && (
            <div className="row wrap">
              <span style={{ fontWeight: 600 }}>On</span>
              <div className="daychips">
                {DOW.map((d, i) => (
                  <button
                    type="button"
                    key={d}
                    className={value.days.includes(i) ? "on" : ""}
                    onClick={() => {
                      const days = value.days.includes(i) ? value.days.filter((x) => x !== i) : [...value.days, i].sort();
                      if (days.length) onChange({ ...value, days });
                    }}
                    aria-pressed={value.days.includes(i)}
                    aria-label={d}
                  >
                    {d.slice(0, 2)}
                  </button>
                ))}
              </div>
            </div>
          )}
          {value.type === "monthly" && <div className="muted">On day {value.dayOfMonth} of the month</div>}
          {onUntil && (
            <div className="row">
              <span style={{ fontWeight: 600, whiteSpace: "nowrap" }}>Repeats until</span>
              <input className="input" type="date" value={until ?? ""} onChange={(e) => onUntil(e.target.value || null)} style={{ maxWidth: 220 }} />
              {until && (
                <button type="button" className="pill sm" onClick={() => onUntil(null)}>
                  Forever
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------- Star chip ----------
export function Stars({ n, style }: { n: number; style?: CSSProperties }) {
  return (
    <span className="row" style={{ gap: 4, fontWeight: 600, ...style }}>
      <span aria-hidden>⭐</span>
      {n}
    </span>
  );
}

export function Field({ label, children, style }: { label: string; children: ReactNode; style?: CSSProperties }) {
  return (
    <div className="field" style={style}>
      <label>{label}</label>
      {children}
    </div>
  );
}

export function ColorSwatches({ value, onChange, colors }: { value: string; onChange: (c: string) => void; colors: string[] }) {
  return (
    <div className="row wrap" style={{ gap: 8 }}>
      {colors.map((c) => (
        <button
          type="button"
          key={c}
          aria-label={c}
          onClick={() => onChange(c)}
          style={{ width: 40, height: 40, borderRadius: 99, background: c, boxShadow: value.toLowerCase() === c.toLowerCase() ? "0 0 0 3px #fff, 0 0 0 5px #1f1f1f" : "none" }}
        />
      ))}
      <label style={{ position: "relative", width: 40, height: 40, borderRadius: 99, background: "conic-gradient(red, yellow, lime, cyan, blue, magenta, red)", cursor: "pointer" }} title="Custom color">
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} style={{ opacity: 0, position: "absolute", inset: 0, cursor: "pointer" }} />
      </label>
    </div>
  );
}
