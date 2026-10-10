import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { AlertCircle, FileText, Sparkles, X } from "lucide-react";
import { useApp } from "../../lib/store";
import { ApiError } from "../../lib/api";
import { openSettings } from "../settings/nav";
import "./sidekick.css";

/** Run an AI request; returns {data} or {error}. A cancelled PIN prompt (423) returns neither. */
export async function aiCall<T>(fn: () => Promise<T>): Promise<{ data?: T; error?: string }> {
  try {
    return { data: await fn() };
  } catch (e) {
    if (e instanceof ApiError && e.status === 423) return {};
    return { error: e instanceof Error ? e.message : "Something went wrong" };
  }
}

export function Thinking({ title, hint }: { title: string; hint?: ReactNode }) {
  return (
    <div className="sk-thinking" role="status" aria-live="polite">
      <div className="orb">
        <Sparkles />
      </div>
      <div className="serif">{title}</div>
      {hint && <div className="muted" style={{ maxWidth: 440, lineHeight: 1.45 }}>{hint}</div>}
    </div>
  );
}

/** True when the error is about the missing API key or the monthly budget (fixable in Settings › Sidekick). */
export const isSetupError = (msg: string | null | undefined) => !!msg && /api key|settings|budget/i.test(msg);

export function AiErrorBox({ message, onClose }: { message: string; onClose?: () => void }) {
  const { go } = useApp();
  const setup = isSetupError(message);
  return (
    <div className="sk-error">
      <AlertCircle />
      <div className="grow">
        <div style={{ fontWeight: 600 }}>{setup ? (/budget/i.test(message) ? "Monthly AI budget used up" : "Sidekick needs an API key") : "Sidekick couldn't do that"}</div>
        <div className="muted" style={{ marginTop: 2, lineHeight: 1.4 }}>
          {message}
        </div>
      </div>
      {setup && (
        <button
          className="pill primary"
          onClick={() => {
            onClose?.();
            openSettings(go, "ai");
          }}
        >
          {/budget/i.test(message) ? "Change budget" : "Add API key"}
        </button>
      )}
    </div>
  );
}

/** Thumbnails for picked files with a remove button. */
export function FileThumbs({ files, onRemove }: { files: File[]; onRemove: (i: number) => void }) {
  const urls = useMemo(() => files.map((f) => (f.type.startsWith("image/") ? URL.createObjectURL(f) : null)), [files]);
  const prev = useRef<(string | null)[]>([]);
  useEffect(() => {
    prev.current.forEach((u) => u && URL.revokeObjectURL(u));
    prev.current = urls;
  }, [urls]);
  useEffect(() => () => prev.current.forEach((u) => u && URL.revokeObjectURL(u)), []);
  if (!files.length) return null;
  return (
    <div className="sk-thumbs">
      {files.map((f, i) => (
        <div key={i} className="sk-thumb" title={f.name}>
          {urls[i] ? (
            <img src={urls[i]!} alt={f.name} />
          ) : (
            <>
              <FileText size={28} color="#9b59b6" />
              <span className="truncate" style={{ maxWidth: "100%" }}>
                {f.name}
              </span>
            </>
          )}
          <button type="button" className="x" onClick={() => onRemove(i)} aria-label={`Remove ${f.name}`}>
            <X size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}

export function CheckBox({ on }: { on: boolean }) {
  return (
    <span className={`sk-checkbox ${on ? "on" : ""}`} aria-hidden>
      {on && (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 6 9 17l-5-5" />
        </svg>
      )}
    </span>
  );
}
