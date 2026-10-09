import { useState } from "react";
import { CheckCircle2, ExternalLink, KeyRound, Sparkles } from "lucide-react";
import { useApp } from "../../lib/store";
import { put } from "../../lib/api";
import { Confirm } from "../../components/ui";
import { Group, Row, SectionTitle, Steps, useSaveSettings } from "./common";

export function money(n: number) {
  return `$${n.toFixed(2)}`;
}

export default function AiSection() {
  const { settings, run, reload } = useApp();
  const save = useSaveSettings();
  const ai = settings.ai;
  const [key, setKey] = useState("");
  const [budget, setBudget] = useState(String(ai.monthlyBudgetUsd));
  const [confirmRemove, setConfirmRemove] = useState(false);
  const pct = ai.monthlyBudgetUsd > 0 ? Math.min(1, ai.spentThisMonthUsd / ai.monthlyBudgetUsd) : 0;

  const saveKey = async (k: string | null) => {
    const r = await run(() => put("/api/ai/key", { key: k }), k ? "API key saved. Sidekick is ready!" : "API key removed");
    if (r) {
      setKey("");
      await reload();
    }
  };

  return (
    <>
      <SectionTitle lead="Sidekick uses Claude, by Anthropic, to turn photos, PDFs, emails and text into calendar events, plan meals, write recipes, build lists and suggest activities.">
        Sidekick (AI)
      </SectionTitle>

      <div className="set-card" style={{ background: "#F6EFFA", flexDirection: "row", alignItems: "center", gap: 18 }}>
        <span className="set-icon" style={{ width: 64, height: 64, background: "#EEE2F4", color: "#9B59B6" }}>
          <Sparkles size={30} />
        </span>
        <div className="grow">
          <div className="serif" style={{ fontSize: 28 }}>
            {ai.available ? "Claude is connected" : "Not connected yet"}
          </div>
          <div className="muted">Model: {ai.model}</div>
        </div>
        {ai.available && <CheckCircle2 size={32} color="var(--green)" />}
      </div>

      <Group title="Anthropic API key" hint="A Claude.ai subscription (Pro or Max) can't be used here; Haven needs an API key, which is billed per use. Typical family use costs well under $1 a month.">
        {ai.available ? (
          <Row
            icon={
              <span className="set-icon sm" style={{ background: "#fff", color: "var(--text-2)" }}>
                <KeyRound />
              </span>
            }
            label="API key saved"
            hint="Stored only on this Haven device."
          >
            <button className="pill white" onClick={() => setConfirmRemove(true)}>
              Remove
            </button>
          </Row>
        ) : (
          <div className="set-card">
            <Steps>
              <li>
                <div>
                  Sign in at{" "}
                  <a className="link" href="https://console.anthropic.com" target="_blank" rel="noreferrer">
                    console.anthropic.com <ExternalLink size={14} style={{ verticalAlign: -2 }} />
                  </a>{" "}
                  (a free account).
                </div>
              </li>
              <li>
                <div>
                  Under <b>Billing</b>, add a few dollars of credit.
                </div>
              </li>
              <li>
                <div>
                  Under <b>API keys</b>, choose <b>Create key</b>, name it “Haven” and paste it here.
                </div>
              </li>
            </Steps>
          </div>
        )}
        <form
          className="set-input-row"
          onSubmit={(e) => {
            e.preventDefault();
            if (key.trim()) saveKey(key.trim());
          }}
        >
          <input
            className="input grow"
            type="password"
            placeholder={ai.available ? "Paste a new key to replace it" : "sk-ant-api03-…"}
            value={key}
            onChange={(e) => setKey(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            aria-label="Anthropic API key"
          />
          <button className="pill primary" style={{ height: 56 }} disabled={!key.trim()}>
            Save key
          </button>
        </form>
      </Group>

      <Group title="Monthly budget" hint="Sidekick stops for the rest of the month once this is reached.">
        <div className="set-row" style={{ flexDirection: "column", alignItems: "stretch", gap: 12, padding: 18 }}>
          <div className="row wrap">
            <div className="grow">
              <div className="serif" style={{ fontSize: 30 }}>
                {money(ai.spentThisMonthUsd)} <span className="muted" style={{ fontSize: 20 }}>of {money(ai.monthlyBudgetUsd)} this month</span>
              </div>
            </div>
            <label className="row" style={{ gap: 8 }}>
              <span className="label">Budget $</span>
              <input
                className="input"
                type="number"
                min={0}
                step={1}
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
                onBlur={() => {
                  const n = Math.max(0, Number(budget) || 0);
                  if (n !== ai.monthlyBudgetUsd) save({ ai: { monthlyBudgetUsd: n } }, "Budget saved");
                }}
                onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                style={{ width: 110, background: "#fff" }}
                aria-label="Monthly budget in dollars"
              />
            </label>
          </div>
          <div className="set-meter" aria-hidden>
            <span style={{ width: `${pct * 100}%`, background: pct > 0.9 ? "var(--coral)" : undefined }} />
          </div>
        </div>
      </Group>
      {confirmRemove && (
        <Confirm title="Remove the API key?" message="Sidekick features stop working until you add a key again." confirmLabel="Remove" onConfirm={() => saveKey(null)} onClose={() => setConfirmRemove(false)} />
      )}
    </>
  );
}
