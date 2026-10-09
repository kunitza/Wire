import { useCallback, useState, type ReactNode } from "react";
import { Check, Copy, Delete, Lock, MapPin, Search } from "lucide-react";
import { useApp } from "../../lib/store";
import { get, put } from "../../lib/api";
import type { Settings } from "../../../shared/types";

type Patch = { [K in keyof Settings]?: Settings[K] extends object | null ? Partial<NonNullable<Settings[K]>> | Settings[K] : Settings[K] };

/** Save a partial settings object (subject to Parental Lock), then refresh app state. */
export function useSaveSettings() {
  const { run, reload } = useApp();
  return useCallback(
    async (patch: Patch, success?: string) => {
      const r = await run(() => put<Settings>("/api/settings", patch), success);
      if (r) await reload();
      return !!r;
    },
    [run, reload],
  );
}

export function SectionTitle({ children, lead }: { children: ReactNode; lead?: ReactNode }) {
  return (
    <>
      <h1 className="set-title">{children}</h1>
      {lead && <p className="set-lead">{lead}</p>}
    </>
  );
}

export function Group({ title, hint, children }: { title?: ReactNode; hint?: ReactNode; children: ReactNode }) {
  return (
    <section className="set-group">
      {title && <h2 className="set-group-title">{title}</h2>}
      {children}
      {hint && <p className="set-group-hint">{hint}</p>}
    </section>
  );
}

export function Row({ label, hint, children, icon }: { label: ReactNode; hint?: ReactNode; children?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="set-row">
      {icon}
      <div className="grow">
        {label}
        {hint && <small>{hint}</small>}
      </div>
      {children}
    </div>
  );
}

/** A labelled row with a segmented control on the right (wraps under the label on narrow screens). */
export function ChoiceRow<T extends string | number>({
  label,
  hint,
  value,
  options,
  onChange,
}: {
  label: ReactNode;
  hint?: ReactNode;
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="set-row set-choice">
      <div className="grow">
        {label}
        {hint && <small>{hint}</small>}
      </div>
      <div className="segmented" role="radiogroup">
        {options.map((o) => (
          <button key={String(o.value)} type="button" role="radio" aria-checked={o.value === value} className={o.value === value ? "on" : ""} onClick={() => o.value !== value && onChange(o.value)}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Steps({ children, start = 1 }: { children: ReactNode; start?: number }) {
  return (
    <ol className="set-steps" style={start > 1 ? { counterReset: `step ${start - 1}` } : undefined}>
      {children}
    </ol>
  );
}

/** Copy text; falls back to execCommand because the Pi is usually reached over plain http (no Clipboard API). */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through */
  }
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  ta.remove();
  return ok;
}

export function CopyButton({ text, label = "Copy", className = "pill sm" }: { text: string; label?: string; className?: string }) {
  const { toast } = useApp();
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className={className}
      onClick={async () => {
        if (await copyText(text)) {
          setDone(true);
          setTimeout(() => setDone(false), 1600);
        } else toast("Couldn't copy. Select the text and copy it by hand.");
      }}
    >
      {done ? <Check /> : <Copy />}
      {done ? "Copied" : label}
    </button>
  );
}

export function CodeBlock({ code, label }: { code: string; label?: string }) {
  return (
    <div className="set-code-wrap">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <span className="label">{label}</span>
        <CopyButton text={code} />
      </div>
      <pre className="set-code">{code}</pre>
    </div>
  );
}

/** Shown in place of content that needs the parent PIN to view (e.g. secrets). */
export function LockedNotice({ what }: { what: string }) {
  const { unlock } = useApp();
  return (
    <div className="set-card set-locked">
      <span className="set-icon" style={{ background: "#E2F2EA", color: "#2E8B57" }}>
        <Lock />
      </span>
      <div className="grow">
        <strong>Parental Lock is on</strong>
        <div className="muted">Enter the parent PIN to see {what}.</div>
      </div>
      <button className="pill primary" onClick={() => unlock()}>
        Unlock
      </button>
    </div>
  );
}

export interface Place {
  name: string;
  lat: number;
  lon: number;
}

/** Search for a town or city (Open-Meteo geocoding through the server) and pick one. */
export function LocationSearch({ current, onPick, autoFocus }: { current: Place | null; onPick: (p: Place) => void; autoFocus?: boolean }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Place[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const search = async () => {
    if (!q.trim()) return;
    setBusy(true);
    setError(null);
    try {
      setResults(await get<Place[]>(`/api/geocode?q=${encodeURIComponent(q.trim())}`));
    } catch (e) {
      setError((e as Error).message);
      setResults(null);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="col" style={{ gap: 10 }}>
      {current && (
        <div className="set-row">
          <span className="set-icon sm" style={{ background: "#FDE3DE", color: "#F66951" }}>
            <MapPin />
          </span>
          <div className="grow">
            {current.name}
            <small>
              {current.lat.toFixed(2)}, {current.lon.toFixed(2)}
            </small>
          </div>
          <Check size={22} color="var(--green)" />
        </div>
      )}
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          search();
        }}
      >
        <input
          className="input grow"
          placeholder={current ? "Change town or city…" : "Town or city, e.g. Portland, ME"}
          value={q}
          autoFocus={autoFocus}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Search for a town or city"
        />
        <button className="pill primary" type="submit" disabled={busy || !q.trim()} style={{ height: 56 }}>
          <Search />
          {busy ? "Searching…" : "Search"}
        </button>
      </form>
      {error && <div className="error-text">{error}</div>}
      {results && !results.length && <div className="muted">No places found. Try just the town name.</div>}
      {results && results.length > 0 && (
        <div className="col" style={{ gap: 6 }}>
          {results.map((r, i) => (
            <button
              key={i}
              type="button"
              className="menu-row"
              style={{ marginBottom: 0 }}
              onClick={() => {
                onPick(r);
                setResults(null);
                setQ("");
              }}
            >
              <MapPin />
              <span className="grow">{r.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Four dots + a big number pad. Calls onComplete when 4 digits are entered. */
export function PinKeypad({ onComplete, error, size = 80 }: { onComplete: (pin: string) => void; error?: string | null; size?: number }) {
  const [pin, setPin] = useState("");
  const press = (d: string) => {
    if (pin.length >= 4) return;
    const next = pin + d;
    setPin(next);
    if (next.length === 4) {
      setTimeout(() => {
        onComplete(next);
        setPin("");
      }, 120);
    }
  };
  return (
    <div className="col" style={{ alignItems: "center", gap: 16 }}>
      <div className="row" style={{ gap: 16 }} aria-live="polite" aria-label={`${pin.length} of 4 digits`}>
        {[0, 1, 2, 3].map((i) => (
          <span key={i} style={{ width: 20, height: 20, borderRadius: 99, background: i < pin.length ? "var(--text)" : "var(--fill-3)", transition: "background 0.1s" }} />
        ))}
      </div>
      {error && <div className="error-text">{error}</div>}
      <div style={{ display: "grid", gridTemplateColumns: `repeat(3, ${size}px)`, gap: 12 }}>
        {["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "del"].map((k, i) =>
          k === "" ? (
            <span key={i} />
          ) : (
            <button
              key={i}
              type="button"
              className="serif"
              style={{ height: size, borderRadius: 99, background: k === "del" ? "transparent" : "var(--fill-2)", fontSize: size * 0.38, display: "flex", alignItems: "center", justifyContent: "center" }}
              onClick={() => (k === "del" ? setPin(pin.slice(0, -1)) : press(k))}
              aria-label={k === "del" ? "Delete" : k}
            >
              {k === "del" ? <Delete size={28} /> : k}
            </button>
          ),
        )}
      </div>
    </div>
  );
}

export function timeAgo(iso: string | null, now = new Date()): string {
  if (!iso) return "never";
  const s = Math.round((now.getTime() - new Date(iso).getTime()) / 1000);
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hr ago`;
  const d = Math.round(h / 24);
  return `${d} day${d === 1 ? "" : "s"} ago`;
}
