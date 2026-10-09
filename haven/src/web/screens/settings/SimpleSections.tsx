import { Moon } from "lucide-react";
import { useApp } from "../../lib/store";
import { ToggleRow } from "../../components/ui";
import { fmtTime } from "../../lib/format";
import { Group, Row, SectionTitle, useSaveSettings } from "./common";

export function SleepSection() {
  const { settings, setSleeping } = useApp();
  const save = useSaveSettings();
  const s = settings.sleep;
  return (
    <>
      <SectionTitle lead="Turn the screen off overnight so it doesn't light up the room. Tap anywhere to wake it.">Sleep</SectionTitle>
      <Group>
        <ToggleRow label="Sleep mode schedule" hint={s.enabled ? `Every night ${fmtTime(s.start, settings.clock24h)} – ${fmtTime(s.end, settings.clock24h)}` : "Off"} on={s.enabled} onChange={(v) => save({ sleep: { enabled: v } })} />
        {s.enabled && (
          <div className="form-grid">
            <Row label="From">
              <input className="input" type="time" value={s.start} onChange={(e) => e.target.value && save({ sleep: { start: e.target.value } })} style={{ width: 170, background: "#fff" }} />
            </Row>
            <Row label="To">
              <input className="input" type="time" value={s.end} onChange={(e) => e.target.value && save({ sleep: { end: e.target.value } })} style={{ width: 170, background: "#fff" }} />
            </Row>
          </div>
        )}
      </Group>
      <button className="pill outline lg" style={{ alignSelf: "flex-start" }} onClick={() => setSleeping(true)}>
        <Moon />
        Enter sleep mode now
      </button>
      <p className="set-group-hint">
        On the Raspberry Pi, Haven can also switch the monitor off while sleeping. Set <span className="set-kbd">HAVEN_DISPLAY_OFF_CMD</span> and{" "}
        <span className="set-kbd">HAVEN_DISPLAY_ON_CMD</span> (see the README).
      </p>
    </>
  );
}

const BEFORE: { value: number | null; label: string }[] = [
  { value: null, label: "None" },
  { value: 5, label: "5 min" },
  { value: 10, label: "10 min" },
  { value: 15, label: "15 min" },
  { value: 30, label: "30 min" },
  { value: 60, label: "1 hr" },
  { value: 120, label: "2 hr" },
];

export function RemindersSection() {
  const { settings } = useApp();
  const save = useSaveSettings();
  const r = settings.reminders;
  return (
    <>
      <SectionTitle lead="Pop-up reminders on this screen for events and chores with a time.">Reminders</SectionTitle>
      <Group title="Events" hint="You can also set a reminder on a single event when you edit it.">
        <ToggleRow label="At time of event" on={r.eventsAtTime} onChange={(v) => save({ reminders: { eventsAtTime: v } })} />
        <div className="set-row" style={{ flexWrap: "wrap" }}>
          <div className="grow">Also remind me before</div>
          <div className="chips">
            {BEFORE.map((b) => (
              <button
                key={String(b.value)}
                type="button"
                className={`chip text-only ${r.eventsMinutesBefore === b.value ? "on" : ""}`}
                style={r.eventsMinutesBefore === b.value ? { background: "var(--blue)", color: "#fff", borderColor: "var(--blue)" } : { background: "#fff" }}
                onClick={() => save({ reminders: { eventsMinutesBefore: b.value } })}
              >
                {b.label}
              </button>
            ))}
          </div>
        </div>
      </Group>
      <Group title="Tasks">
        <ToggleRow label="When a task is due" hint="For chores with a due time." on={r.tasksWhenDue} onChange={(v) => save({ reminders: { tasksWhenDue: v } })} />
      </Group>
      <Group title="Sound">
        <ToggleRow label="Play a chime" on={r.sound} onChange={(v) => save({ reminders: { sound: v } })} />
      </Group>
    </>
  );
}

export function RewardsSection() {
  const { settings } = useApp();
  const save = useSaveSettings();
  return (
    <>
      <SectionTitle lead="Kids earn stars for chores and routines and spend them on rewards.">Rewards</SectionTitle>
      <Group hint="When on, a redeemed reward waits on the Rewards screen until a parent approves it. The stars are held until then (and returned if declined).">
        <ToggleRow label="Redemptions need parent approval" on={settings.rewardsNeedApproval} onChange={(v) => save({ rewardsNeedApproval: v })} />
      </Group>
    </>
  );
}
