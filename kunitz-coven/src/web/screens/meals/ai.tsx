import { Settings as Gear, Sparkles } from "lucide-react";
import { ApiError } from "../../lib/api";
import { useApp } from "../../lib/store";
import "./ai.css";

export interface AiFail {
  message: string;
  status: number;
}

export function toAiFail(e: unknown): AiFail {
  if (e instanceof ApiError) return { message: e.message, status: e.status };
  return { message: e instanceof Error ? e.message : "Something went wrong", status: 500 };
}

/** Friendly message for a failed Sidekick (AI) request; offers a way to Settings when no API key is set. */
export function AiErrorNote({ error, onNavigate }: { error: AiFail; onNavigate?: () => void }) {
  const { go } = useApp();
  const needsKey = error.status === 412 || error.status === 401;
  return (
    <div className="ai-note" role="alert">
      <span className="ai-note-icon" aria-hidden>
        {needsKey ? "🔑" : "😕"}
      </span>
      <div className="grow">
        <div style={{ fontWeight: 700 }}>{needsKey ? "Sidekick needs a key" : "Sidekick couldn't do that"}</div>
        <div style={{ color: "var(--text-2)", marginTop: 2, lineHeight: 1.4 }}>{error.message}</div>
      </div>
      {needsKey && (
        <button
          type="button"
          className="pill white"
          onClick={() => {
            onNavigate?.();
            go("settings");
          }}
        >
          <Gear />
          Open Settings
        </button>
      )}
    </div>
  );
}

/** Animated "thinking" placeholder while Sidekick works. */
export function AiWorking({ text = "Sidekick is thinking…" }: { text?: string }) {
  return (
    <div className="ai-working">
      <Sparkles className="ai-spin" />
      <span>{text}</span>
    </div>
  );
}
