import { useState } from "react";
import { ArrowLeft, ArrowRight, Check, Plus, Trash2, X } from "lucide-react";
import { useApp } from "../lib/store";
import { api, del, post, put } from "../lib/api";
import { ColorSwatches, EmojiPicker, Popover, ToggleRow } from "../components/ui";
import { Toasts } from "../components/shell";
import { PROFILE_COLORS, tint } from "../lib/format";
import type { Profile, SyncedCalendar } from "../../shared/types";
import { ChoiceRow, LocationSearch, PinKeypad, type Place } from "./settings/common";
import { CalendarAddForm, GoogleSteps, calendarError } from "./settings/CalendarsSection";
import { CovenMark } from "./settings/BackupSection";
import "./settings/settings.css";
import "./settings/onboarding.css";

interface Person {
  key: number;
  name: string;
  color: string;
  avatar: string;
}

interface AddedCal {
  cal: SyncedCalendar;
  people: number[]; // Person keys
}

const STEPS = ["welcome", "family", "place", "calendar", "pin", "done"] as const;
type Step = (typeof STEPS)[number];

let nextKey = 1;
const NICE = ["#F66951", "#2E86C1", "#B07CC6", "#3BAF7E", "#E86FA5", "#4FB3D9", "#D0632A", "#7C6CF2", "#8BC34A", "#A0855B"];
/** A new family member row with the first nice color nobody has yet. */
const person = (existing: Person[], p: Partial<Person> = {}): Person => {
  const used = new Set(existing.map((x) => x.color));
  return { key: nextKey++, name: "", color: NICE.find((c) => !used.has(c)) ?? PROFILE_COLORS[existing.length % PROFILE_COLORS.length], avatar: "", ...p };
};

function PersonRow({ p, onChange, onRemove, canRemove, autoFocus }: { p: Person; onChange: (p: Person) => void; onRemove: () => void; canRemove: boolean; autoFocus?: boolean }) {
  const [colorAnchor, setColorAnchor] = useState<HTMLElement | null>(null);
  return (
    <div className="ob-person" style={{ background: tint(p.color, 0.16) }}>
      <EmojiPicker value={p.avatar} onChange={(avatar) => onChange({ ...p, avatar })} size={56} />
      <input
        className="input grow"
        placeholder="Name"
        value={p.name}
        maxLength={30}
        onChange={(e) => onChange({ ...p, name: e.target.value })}
        autoFocus={autoFocus}
        aria-label="Name"
      />
      <button type="button" className="ob-color" style={{ background: p.color }} onClick={(e) => setColorAnchor(e.currentTarget)} aria-label="Choose color" />
      <button type="button" className="icon-btn" style={{ background: "transparent", visibility: canRemove ? "visible" : "hidden" }} onClick={onRemove} aria-label="Remove">
        <X />
      </button>
      {colorAnchor && (
        <Popover anchor={colorAnchor} onClose={() => setColorAnchor(null)} width={400}>
          <ColorSwatches
            value={p.color}
            colors={PROFILE_COLORS}
            onChange={(color) => {
              onChange({ ...p, color });
              setColorAnchor(null);
            }}
          />
        </Popover>
      )}
    </div>
  );
}

/** Chips to link a calendar to not-yet-created family members. */
function DraftPicker({ people, value, onChange }: { people: Person[]; value: number[]; onChange: (v: number[]) => void }) {
  return (
    <div className="chips">
      {people.map((p) => {
        const on = value.includes(p.key);
        return (
          <button
            key={p.key}
            type="button"
            className={`chip ${on ? "on" : ""}`}
            style={on ? { borderColor: p.color, background: tint(p.color, 0.18) } : undefined}
            onClick={() => onChange(on ? value.filter((k) => k !== p.key) : [...value, p.key])}
          >
            <span className="avatar" style={{ width: 32, height: 32, background: p.avatar ? tint(p.color, 0.28) : p.color, color: "#fff", fontSize: p.avatar ? 18 : 14 }}>
              {p.avatar || p.name.slice(0, 1).toUpperCase()}
            </span>
            {p.name}
            {on && <Check size={18} />}
          </button>
        );
      })}
    </div>
  );
}

export default function Onboarding() {
  const { settings, reload, celebrate, toast } = useApp();
  const [step, setStep] = useState<Step>("welcome");
  const [people, setPeople] = useState<Person[]>(() => [person([])]);
  const [place, setPlace] = useState<Place | null>(settings.location);
  const [clock24h, setClock24h] = useState(settings.clock24h);
  const [unit, setUnit] = useState(settings.temperatureUnit);
  const [cals, setCals] = useState<AddedCal[]>([]);
  const [calPeople, setCalPeople] = useState<number[]>([]);
  const [pin, setPin] = useState<string | null>(null);
  const [firstPin, setFirstPin] = useState<string | null>(null);
  const [pinError, setPinError] = useState<string | null>(null);
  const [lockOn, setLockOn] = useState(true);
  const [busy, setBusy] = useState(false);

  const named = people.filter((p) => p.name.trim());
  const idx = STEPS.indexOf(step);
  const go = (d: 1 | -1) => setStep(STEPS[Math.max(0, Math.min(STEPS.length - 1, idx + d))]);

  const finish = async () => {
    setBusy(true);
    try {
      await put("/api/settings", { location: place, clock24h, temperatureUnit: unit });
      const ids = new Map<number, number>();
      for (const p of named) {
        const created = await post<Profile>("/api/profiles", { name: p.name.trim(), color: p.color, avatar: p.avatar, kind: "profile" });
        ids.set(p.key, created.id);
      }
      for (const c of cals) {
        const profileIds = c.people.map((k) => ids.get(k)).filter((x): x is number => !!x);
        if (profileIds.length) await put(`/api/calendars/${c.cal.id}`, { profileIds });
      }
      if (pin) {
        await post("/api/pin", { pin });
        if (lockOn) await put("/api/settings", { lock: { enabled: true } });
      }
      celebrate("day", ["🏡", "🎉", "✨", "💛", "🌈"]);
      await reload();
    } catch (e) {
      toast((e as Error).message);
      setBusy(false);
    }
  };

  const loadDemo = async () => {
    setBusy(true);
    try {
      await api("POST", "/api/demo", {});
      await reload();
    } catch (e) {
      toast((e as Error).message);
      setBusy(false);
    }
  };

  const skipAll = async () => {
    try {
      localStorage.setItem("haven-skip-onboarding", "1");
    } catch {
      /* ignore */
    }
    await reload();
  };

  const footer = (opts: { next?: string; canNext?: boolean; skip?: boolean }) => (
    <div className="ob-foot">
      <button className="pill lg" onClick={() => go(-1)}>
        <ArrowLeft />
        Back
      </button>
      <span className="spacer" />
      {opts.skip && (
        <button className="ob-skip" onClick={() => go(1)}>
          Skip
        </button>
      )}
      <button className="pill primary lg" disabled={opts.canNext === false} onClick={() => go(1)}>
        {opts.next ?? "Next"}
        <ArrowRight />
      </button>
    </div>
  );

  return (
    <div className="ob">
      <div className="ob-shapes" aria-hidden>
        <span className="s1" />
        <span className="s2" />
        <span className="s3" />
        <span className="s4" />
        <span className="s5" />
      </div>
      <div className="ob-wrap">
        {step !== "welcome" && (
          <div className="ob-top">
            <CovenMark size={44} />
            <span className="brand">Kunitz Coven</span>
            <div className="ob-dots" aria-label={`Step ${idx} of ${STEPS.length - 1}`}>
              {STEPS.slice(1).map((s, i) => (
                <span key={s} className={i < idx ? "on" : ""} />
              ))}
            </div>
          </div>
        )}

        {step === "welcome" && (
          <div className="ob-card ob-welcome" style={{ marginTop: "max(0px, calc(50vh - 360px))" }}>
            <CovenMark size={120} />
            <h1>Welcome to Kunitz Coven</h1>
            <p className="lead" style={{ maxWidth: 560, margin: 0 }}>
              Let's set up your family hub: the calendar, chores, meals and lists everyone can see. It takes about three minutes.
            </p>
            <button className="pill primary lg" style={{ marginTop: 10, minWidth: 260, height: 68, fontSize: 20 }} onClick={() => go(1)}>
              Let's set up your family hub
              <ArrowRight />
            </button>
            <div className="row" style={{ gap: 18, marginTop: 4, flexWrap: "wrap", justifyContent: "center" }}>
              <button className="link" onClick={loadDemo} disabled={busy}>
                {busy ? "Loading…" : "Try it with a demo family"}
              </button>
              <span className="muted">·</span>
              <button className="link" style={{ color: "var(--text-2)" }} onClick={skipAll}>
                Skip setup
              </button>
            </div>
          </div>
        )}

        {step === "family" && (
          <div className="ob-card">
            <h1>Who's in your family?</h1>
            <p className="lead">Add everyone who'll have events and chores. Pick an emoji and a color for each; you can change them later.</p>
            <div className="col" style={{ gap: 10 }}>
              {people.map((p, i) => (
                <PersonRow
                  key={p.key}
                  p={p}
                  autoFocus={i === people.length - 1 && i > 0}
                  canRemove={people.length > 1}
                  onChange={(np) => setPeople(people.map((x) => (x.key === p.key ? np : x)))}
                  onRemove={() => setPeople(people.filter((x) => x.key !== p.key))}
                />
              ))}
            </div>
            <div className="ob-quick">
              <button className="pill" onClick={() => setPeople([...people, person(people)])}>
                <Plus />
                Add another person
              </button>
              {!people.some((p) => p.name.trim().toLowerCase() === "family") && (
                <button
                  className="pill"
                  onClick={() => {
                    const empty = people.find((p) => !p.name.trim());
                    const fam = { name: "Family", avatar: "🏡", color: "#FDB501" };
                    setPeople(empty ? people.map((p) => (p === empty ? { ...p, ...fam } : p)) : [...people, person(people, fam)]);
                  }}
                >
                  🏡 Add “Family” for shared events
                </button>
              )}
            </div>
            {footer({ canNext: named.length > 0 })}
          </div>
        )}

        {step === "place" && (
          <div className="ob-card">
            <h1>Where do you live?</h1>
            <p className="lead">Your town is used for the weather forecast on the calendar.</p>
            <LocationSearch current={place} onPick={setPlace} autoFocus={!place} />
            <ChoiceRow
              label="Clock"
              value={clock24h ? "24" : "12"}
              options={[
                { value: "12", label: "12-hour" },
                { value: "24", label: "24-hour" },
              ]}
              onChange={(v) => setClock24h(v === "24")}
            />
            <ChoiceRow
              label="Temperature"
              value={unit}
              options={[
                { value: "fahrenheit", label: "°F" },
                { value: "celsius", label: "°C" },
              ]}
              onChange={setUnit}
            />
            {footer({ skip: !place })}
          </div>
        )}

        {step === "calendar" && (
          <div className="ob-card">
            <h1>Bring in Google Calendar</h1>
            <p className="lead">Optional. Show events from your Google Calendars alongside the family's. You can add more later in Settings.</p>
            {cals.length > 0 && (
              <div className="col" style={{ gap: 8 }}>
                {cals.map((c) => (
                  <div key={c.cal.id} className="set-row">
                    <div className="grow">
                      {c.cal.name}
                      <small style={{ color: c.cal.lastError ? "var(--danger)" : "var(--green)" }}>
                        {c.cal.lastError ? calendarError(c.cal.lastError) : `Synced · ${c.cal.eventCount} events`}
                        {c.people.length > 0 && ` · for ${named.filter((p) => c.people.includes(p.key)).map((p) => p.name).join(", ")}`}
                      </small>
                    </div>
                    <button
                      className="icon-btn"
                      style={{ background: "#fff" }}
                      aria-label={`Remove ${c.cal.name}`}
                      onClick={async () => {
                        await del(`/api/calendars/${c.cal.id}`).catch(() => undefined);
                        setCals(cals.filter((x) => x.cal.id !== c.cal.id));
                      }}
                    >
                      <Trash2 />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="set-card">
              <GoogleSteps />
              <div style={{ height: 1, background: "var(--fill-3)" }} />
              <CalendarAddForm
                showProfiles={false}
                onAdded={(cal) => {
                  setCals([...cals, { cal, people: calPeople }]);
                  setCalPeople([]);
                }}
                extra={
                  <div className="field">
                    <label>Whose calendar is it?</label>
                    <DraftPicker people={named} value={calPeople} onChange={setCalPeople} />
                  </div>
                }
              />
            </div>
            {footer({ skip: cals.length === 0 })}
          </div>
        )}

        {step === "pin" && (
          <div className="ob-card">
            <h1>Parental Lock</h1>
            <p className="lead">Optional. Choose a 4-digit parent PIN so kids can't change the calendar or chores. They can still check off tasks, use lists and redeem rewards.</p>
            <div className="ob-pin">
              <div className="col" style={{ alignItems: "center" }}>
                {pin ? (
                  <div className="col" style={{ alignItems: "center", gap: 14, padding: "30px 0" }}>
                    <span className="set-icon" style={{ width: 84, height: 84, background: "#E2F2EA", color: "#2E8B57" }}>
                      <Check size={40} />
                    </span>
                    <div className="serif" style={{ fontSize: 28 }}>
                      PIN chosen
                    </div>
                    <button
                      className="link"
                      onClick={() => {
                        setPin(null);
                        setFirstPin(null);
                      }}
                    >
                      Choose a different PIN
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="serif" style={{ fontSize: 26 }}>
                      {firstPin ? "Enter it again" : "Choose a PIN"}
                    </div>
                    <PinKeypad
                      key={firstPin ? "confirm" : "new"}
                      size={74}
                      error={pinError}
                      onComplete={(p) => {
                        setPinError(null);
                        if (!firstPin) setFirstPin(p);
                        else if (p === firstPin) setPin(p);
                        else {
                          setFirstPin(null);
                          setPinError("The PINs didn't match. Try again.");
                        }
                      }}
                    />
                  </>
                )}
              </div>
              <div className="col" style={{ gap: 10 }}>
                <ToggleRow label="Turn on Parental Lock" hint="Ask for the PIN before adding or changing things." on={!!pin && lockOn} onChange={setLockOn} />
                <p className="muted" style={{ margin: "4px 6px", lineHeight: 1.45, fontSize: 15 }}>
                  On a parent's phone, unlock once and choose “Remember this device”. Forgot the PIN? Run <span className="set-kbd">npm run reset-pin</span> on the Pi.
                </p>
              </div>
            </div>
            {footer({ skip: !pin })}
          </div>
        )}

        {step === "done" && (
          <div className="ob-card">
            <h1>You're all set! 🎉</h1>
            <p className="lead">Here's your Kunitz Coven. Next, add events and chores with the blue + button, or try Sidekick to import a school calendar from a photo.</p>
            <div className="ob-summary">
              <div className="set-row">
                <div className="grow">
                  Family
                  <small>{named.map((p) => `${p.avatar ? p.avatar + " " : ""}${p.name}`).join(" · ")}</small>
                </div>
                <Check color="var(--green)" />
              </div>
              <div className="set-row">
                <div className="grow">
                  Weather
                  <small>{place ? place.name : "Not set (add it later in Settings › General)"}</small>
                </div>
                {place && <Check color="var(--green)" />}
              </div>
              <div className="set-row">
                <div className="grow">
                  Google Calendar
                  <small>{cals.length ? cals.map((c) => c.cal.name).join(", ") : "None yet (Settings › Calendars)"}</small>
                </div>
                {cals.length > 0 && <Check color="var(--green)" />}
              </div>
              <div className="set-row">
                <div className="grow">
                  Parental Lock
                  <small>{pin ? (lockOn ? "On" : "PIN set, lock off") : "Off"}</small>
                </div>
                {pin && <Check color="var(--green)" />}
              </div>
            </div>
            <div className="ob-foot">
              <button className="pill lg" onClick={() => go(-1)} disabled={busy}>
                <ArrowLeft />
                Back
              </button>
              <span className="spacer" />
              <button className="pill primary lg ob-start" onClick={finish} disabled={busy}>
                {busy ? "Setting up…" : "Start using Kunitz Coven"}
                {!busy && <ArrowRight />}
              </button>
            </div>
          </div>
        )}
      </div>
      <Toasts />
    </div>
  );
}
