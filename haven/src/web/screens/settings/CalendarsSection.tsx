import { useState, type ReactNode } from "react";
import { AlertCircle, CheckCircle2, Link2, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useApp } from "../../lib/store";
import { del, post, put } from "../../lib/api";
import { AvatarStack, Confirm, Field, ProfilePicker, Toggle } from "../../components/ui";
import { plural } from "../../lib/format";
import type { SyncedCalendar } from "../../../shared/types";
import { Group, SectionTitle, Steps, timeAgo } from "./common";

/** Make low-level sync errors understandable. */
export function calendarError(msg: string): string {
  if (/fetch failed|ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ETIMEDOUT|timeout|aborted/i.test(msg)) return "Couldn't reach that address. Check the link and the Pi's internet connection.";
  if (/ 40[134] /.test(msg)) return "Google said no. Make sure you copied the full secret address (it ends in basic.ics).";
  return msg;
}

/** How to find the "Secret address in iCal format" in Google Calendar. */
export function GoogleSteps() {
  return (
    <Steps>
      <li>
        <div>
          On a computer, open <b>calendar.google.com</b>. Next to the calendar you want under <i>My calendars</i>, click <b>⋮ → Settings and sharing</b>.
        </div>
      </li>
      <li>
        <div>
          Scroll down to <b>Integrate calendar</b> and copy the <b>Secret address in iCal format</b> (it ends in <span className="set-kbd">basic.ics</span>).
        </div>
      </li>
      <li>
        <div>Paste it below and choose whose calendar it is. Haven checks for changes every 10 minutes.</div>
      </li>
    </Steps>
  );
}

/** Name + secret URL (+ linked profiles) form. Adds the calendar and syncs it right away. */
export function CalendarAddForm({
  onAdded,
  showProfiles = true,
  extra,
}: {
  onAdded?: (c: SyncedCalendar) => void;
  showProfiles?: boolean;
  extra?: ReactNode;
}) {
  const { run, toast } = useApp();
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [profileIds, setProfileIds] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    const cal = await run(() => post<SyncedCalendar>("/api/calendars", { name: name.trim() || "Google Calendar", url: url.trim(), profileIds }));
    setBusy(false);
    if (!cal) return;
    if (cal.lastError) toast(`Added, but it couldn't sync yet. ${calendarError(cal.lastError)}`);
    else toast(`${cal.name} added · ${plural(cal.eventCount, "event")}`);
    setName("");
    setUrl("");
    setProfileIds([]);
    onAdded?.(cal);
  };
  return (
    <form
      className="col"
      style={{ gap: 14 }}
      onSubmit={(e) => {
        e.preventDefault();
        if (url.trim() && !busy) submit();
      }}
    >
      <Field label="Name">
        <input className="input" placeholder="e.g. Laura's work" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
      </Field>
      <Field label="Secret address in iCal format">
        <input
          className="input"
          placeholder="https://calendar.google.com/calendar/ical/…/basic.ics"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
        />
      </Field>
      {showProfiles && (
        <Field label="Show these events for">
          <ProfilePicker value={profileIds} onChange={setProfileIds} includeLabels />
        </Field>
      )}
      {extra}
      <button className="pill primary lg" type="submit" disabled={!url.trim() || busy} style={{ alignSelf: "flex-start" }}>
        {busy ? <RefreshCw className="set-spin" /> : <Plus />}
        {busy ? "Adding & syncing…" : "Add calendar"}
      </button>
    </form>
  );
}

function CalendarRow({ cal }: { cal: SyncedCalendar }) {
  const { run, profiles, now } = useApp();
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const linked = profiles.filter((p) => cal.profileIds.includes(p.id));
  const update = (patch: Partial<Pick<SyncedCalendar, "enabled" | "profileIds" | "name">>) => run(() => put(`/api/calendars/${cal.id}`, patch));
  return (
    <div className="set-cal-row" style={{ opacity: cal.enabled ? 1 : 0.7 }}>
      <div className="row" style={{ gap: 14 }}>
        <span className="set-icon" style={{ background: "#fff", color: "#E8553D" }}>
          <Link2 />
        </span>
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="serif truncate" style={{ fontSize: 24 }}>
            {cal.name}
          </div>
          <div className="muted truncate" style={{ fontSize: 14 }}>
            {cal.url}
          </div>
        </div>
        <Toggle on={cal.enabled} onChange={(v) => update({ enabled: v })} label={`Sync ${cal.name}`} />
      </div>
      <div className="row wrap" style={{ gap: 10, justifyContent: "space-between" }}>
        {cal.lastError ? (
          <span className="set-status err" style={{ flex: "1 1 300px" }}>
            <AlertCircle />
            {calendarError(cal.lastError)}
          </span>
        ) : cal.lastSync ? (
          <span className="set-status ok">
            <CheckCircle2 />
            Synced {timeAgo(cal.lastSync, now)} · {plural(cal.eventCount, "event")}
          </span>
        ) : (
          <span className="set-status warn">Not synced yet</span>
        )}
        <div className="row" style={{ gap: 8 }}>
          <button className="pill sm white" onClick={() => setEditing(!editing)}>
            {linked.length ? <AvatarStack profiles={linked} size={24} /> : null}
            {editing ? "Done" : linked.length ? "Change" : "Choose profiles"}
          </button>
          <button className="pill sm white" onClick={() => setConfirm(true)} aria-label={`Remove ${cal.name}`}>
            <Trash2 />
            Remove
          </button>
        </div>
      </div>
      {editing && (
        <div className="col" style={{ gap: 8 }}>
          <span className="label">Show these events for</span>
          <ProfilePicker value={cal.profileIds} onChange={(ids) => update({ profileIds: ids })} includeLabels />
        </div>
      )}
      {confirm && (
        <Confirm
          title={`Remove ${cal.name}?`}
          message="Its events disappear from Haven. Nothing changes in Google Calendar."
          confirmLabel="Remove"
          onConfirm={() => run(() => del(`/api/calendars/${cal.id}`), "Calendar removed")}
          onClose={() => setConfirm(false)}
        />
      )}
    </div>
  );
}

export default function CalendarsSection() {
  const { calendars, run } = useApp();
  const [syncing, setSyncing] = useState(false);
  const [adding, setAdding] = useState(calendars.length === 0);
  return (
    <>
      <SectionTitle lead="Show your Google Calendars on Haven. Events sync one way (Google → Haven) using each calendar's private iCal address; no Google sign-in needed.">
        <span className="grow">Calendars</span>
        {calendars.length > 0 && (
          <button
            className="pill"
            disabled={syncing}
            onClick={async () => {
              setSyncing(true);
              await run(() => post("/api/calendars/sync"), "Calendars synced");
              setSyncing(false);
            }}
          >
            <RefreshCw className={syncing ? "set-spin" : ""} />
            {syncing ? "Syncing…" : "Sync now"}
          </button>
        )}
      </SectionTitle>

      {calendars.length > 0 && (
        <Group title="Synced calendars">
          {calendars.map((c) => (
            <CalendarRow key={c.id} cal={c} />
          ))}
        </Group>
      )}

      <Group title="Add a Google Calendar">
        {adding ? (
          <div className="set-card">
            <GoogleSteps />
            <div style={{ height: 1, background: "var(--fill-3)", margin: "4px 0" }} />
            <CalendarAddForm />
          </div>
        ) : (
          <button className="menu-row" onClick={() => setAdding(true)} style={{ minHeight: 64 }}>
            <Plus />
            Add another calendar
          </button>
        )}
      </Group>
      <p className="set-group-hint">Tip: Apple iCloud and Outlook calendars work too. Use their public or shared “ICS” / “webcal” link.</p>
    </>
  );
}
