import { useState } from "react";
import { KeyRound, Lock, LockOpen, ShieldCheck } from "lucide-react";
import { useApp } from "../../lib/store";
import { ApiError, post } from "../../lib/api";
import { Modal, ToggleRow } from "../../components/ui";
import { Group, PinKeypad, Row, SectionTitle, useSaveSettings } from "./common";

export function CheckRow({ label, hint, checked, onChange, disabled }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className="check-row" style={{ cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.6 : 1 }}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} style={{ width: 26, height: 26, accentColor: "var(--blue)", flex: "none" }} />
      <span className="grow">
        {label}
        {hint && <small>{hint}</small>}
      </span>
    </label>
  );
}

/** Set or change the 4-digit parent PIN. Changing asks for the current PIN first. */
export function PinSetDialog({ onClose }: { onClose: () => void }) {
  const { settings, reload, toast } = useApp();
  const hasPin = settings.lock.hasPin;
  const [step, setStep] = useState<"current" | "new" | "confirm">(hasPin ? "current" : "new");
  const [current, setCurrent] = useState("");
  const [first, setFirst] = useState("");
  const [error, setError] = useState<string | null>(null);
  const titles = { current: "Enter your current PIN", new: hasPin ? "Choose a new PIN" : "Choose a 4-digit PIN", confirm: "Enter it again" };
  const onComplete = async (pin: string) => {
    setError(null);
    if (step === "current") {
      try {
        await post("/api/session/unlock", { pin, remember: false });
        setCurrent(pin);
        setStep("new");
      } catch (e) {
        setError(e instanceof ApiError && e.status === 429 ? e.message : "That PIN didn't match. Try again.");
      }
    } else if (step === "new") {
      setFirst(pin);
      setStep("confirm");
    } else {
      if (pin !== first) {
        setError("The PINs didn't match. Start again.");
        setFirst("");
        setStep("new");
        return;
      }
      try {
        await post("/api/pin", { pin, currentPin: current });
        await reload();
        toast(hasPin ? "PIN changed" : "PIN set");
        onClose();
      } catch (e) {
        setError(e instanceof ApiError ? e.message : "Couldn't save the PIN");
        setStep(hasPin ? "current" : "new");
      }
    }
  };
  return (
    <Modal title={titles[step]} onClose={onClose} size="narrow">
      <p className="muted" style={{ margin: 0 }}>
        {step === "current"
          ? "To change the PIN, first enter the one you use now."
          : step === "new"
            ? "Kids shouldn't know this one. You'll use it to add or change things when Parental Lock is on."
            : "Just to be sure."}
      </p>
      <PinKeypad key={step} onComplete={onComplete} error={error} />
    </Modal>
  );
}

function RelockSlider({ value, onSave }: { value: number; onSave: (v: number) => void }) {
  const [v, setV] = useState(value);
  const commit = () => v !== value && onSave(v);
  return (
    <div className="set-row" style={{ flexDirection: "column", alignItems: "stretch", gap: 4, paddingTop: 14 }}>
      <div className="row">
        <span className="grow" style={{ fontWeight: 500 }}>
          After no one touches the screen for
        </span>
        <b>
          {v} minute{v === 1 ? "" : "s"}
        </b>
      </div>
      <input
        className="set-slider"
        type="range"
        min={1}
        max={10}
        step={1}
        value={v}
        onChange={(e) => setV(Number(e.target.value))}
        onPointerUp={commit}
        onKeyUp={commit}
        onBlur={commit}
        aria-label="Re-lock after minutes"
      />
      <div className="row muted" style={{ justifyContent: "space-between", fontSize: 14 }}>
        <span>1 min</span>
        <span>10 min</span>
      </div>
    </div>
  );
}

export default function LockSection() {
  const { settings, session, run, reload } = useApp();
  const save = useSaveSettings();
  const [pinDialog, setPinDialog] = useState(false);
  const l = settings.lock;
  const status = !l.enabled ? "Off" : session.canEdit ? "On · unlocked on this screen" : "On · locked";
  return (
    <>
      <SectionTitle lead="Require a parent PIN before anyone adds or changes events, chores, rewards or settings.">Parental Lock</SectionTitle>

      <div className="set-card tinted" style={{ flexDirection: "row", alignItems: "center", gap: 18 }}>
        <span className="set-icon" style={{ width: 64, height: 64, background: l.enabled ? "#E2F2EA" : "#fff", color: l.enabled ? "#2E8B57" : "var(--text-3)" }}>
          {l.enabled && !session.canEdit ? <Lock size={30} /> : l.enabled ? <ShieldCheck size={30} /> : <LockOpen size={30} />}
        </span>
        <div className="grow">
          <div className="serif" style={{ fontSize: 28 }}>
            {status}
          </div>
          <div className="muted">Kids can always check off tasks, use lists and redeem rewards, even when locked.</div>
        </div>
        {l.enabled && session.canEdit && (
          <button
            className="pill outline"
            onClick={async () => {
              await run(() => post("/api/session/lock"), "Locked");
              await reload();
            }}
          >
            <Lock />
            Lock now
          </button>
        )}
      </div>

      <Group title="PIN">
        <Row
          icon={
            <span className="set-icon sm" style={{ background: "#fff", color: "var(--text-2)" }}>
              <KeyRound />
            </span>
          }
          label={l.hasPin ? "Parent PIN is set" : "No PIN yet"}
          hint={l.hasPin ? "••••" : "Set a 4-digit PIN to turn on Parental Lock."}
        >
          <button className={`pill ${l.hasPin ? "white" : "primary"}`} onClick={() => setPinDialog(true)}>
            {l.hasPin ? "Change PIN" : "Set PIN"}
          </button>
        </Row>
      </Group>

      <Group title="Lock" hint={!l.hasPin ? "Set a PIN first." : undefined}>
        <div style={{ opacity: l.hasPin ? 1 : 0.55, pointerEvents: l.hasPin ? undefined : "none" }}>
          <ToggleRow label="Parental Lock" hint="Ask for the PIN before changes." on={l.enabled} onChange={(v) => save({ lock: { enabled: v } }, v ? "Parental Lock is on" : "Parental Lock is off")} />
        </div>
      </Group>

      {l.enabled && (
        <>
          <Group title="Require the PIN to" hint="Pick at least one.">
            <CheckRow
              label="Add events and tasks"
              hint="New events, chores, routines, rewards, meals and recipes."
              checked={l.lockAdd}
              disabled={l.lockAdd && !l.lockModify}
              onChange={(v) => save({ lock: { lockAdd: v } })}
            />
            <CheckRow
              label="Modify events and tasks"
              hint="Editing and deleting, star adjustments, approvals and settings."
              checked={l.lockModify}
              disabled={l.lockModify && !l.lockAdd}
              onChange={(v) => save({ lock: { lockModify: v } })}
            />
          </Group>
          <Group title="Re-lock automatically">
            <RelockSlider value={l.relockMinutes} onSave={(v) => save({ lock: { relockMinutes: v } })} />
          </Group>
        </>
      )}

      <Group title="Forgot the PIN?">
        <div className="set-card">
          <p>
            Open Kunitz Coven on a phone where you chose <b>Remember this device</b> and change the PIN here. Otherwise, on the Raspberry Pi run{" "}
            <span className="set-kbd">npm run reset-pin</span> in the Kunitz Coven folder; it clears the PIN and turns Parental Lock off.
          </p>
        </div>
      </Group>
      {pinDialog && <PinSetDialog onClose={() => setPinDialog(false)} />}
    </>
  );
}
