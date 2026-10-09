import { useEffect, useMemo, useState } from "react";
import type { CalendarEvent, EditScope, LocalEvent, LocalEventInput, Repeat } from "../../../shared/types";
import { addDays, diffDays, parseDate } from "../../../shared/dates";
import { ApiError, api, get } from "../../lib/api";
import { useApp } from "../../lib/store";
import { Confirm, EmojiPicker, Field, Modal, ProfilePicker, RepeatEditor, ToggleRow } from "../../components/ui";
import { dayOf, defaultStart, lastDay, minutesOf } from "./model";

export interface EventFormProps {
  /** The occurrence being edited (local events only). Omit to add a new event. */
  event?: CalendarEvent;
  /** Defaults for a new event. */
  date?: string;
  time?: string;
  allDay?: boolean;
  profileIds?: number[];
  onClose: () => void;
  onSaved?: () => void;
}

const REMINDERS: { value: string; label: string }[] = [
  { value: "default", label: "Default" },
  { value: "-1", label: "None" },
  { value: "0", label: "At time of event" },
  { value: "5", label: "5 minutes before" },
  { value: "10", label: "10 minutes before" },
  { value: "15", label: "15 minutes before" },
  { value: "30", label: "30 minutes before" },
  { value: "60", label: "1 hour before" },
  { value: "120", label: "2 hours before" },
  { value: "1440", label: "1 day before" },
];

function addMinutes(date: string, time: string, mins: number): [string, string] {
  const t = parseDate(date).getTime() + (minutesOf(`${date}T${time}`) + mins) * 60000;
  const d = new Date(t);
  return [d.toISOString().slice(0, 10), d.toISOString().slice(11, 16)];
}

function minutesBetween(sd: string, st: string, ed: string, et: string) {
  return diffDays(ed, sd) * 1440 + minutesOf(`${ed}T${et}`) - minutesOf(`${sd}T${st}`);
}

/** Add / Edit Event form (a modal). */
export function EventForm({ event, date, time, allDay: allDayDefault, profileIds: presetProfiles, onClose, onSaved }: EventFormProps) {
  const { today, now, settings, profiles, toast } = useApp();
  const editing = !!event?.localId;
  const [series, setSeries] = useState<LocalEvent | null>(null);
  const [loaded, setLoaded] = useState(!editing);

  const initial = useMemo(() => {
    if (event) {
      const ad = event.allDay;
      return {
        title: event.title,
        allDay: ad,
        sd: dayOf(event.start),
        st: ad ? "09:00" : event.start.slice(11, 16),
        ed: ad ? lastDay(event) : dayOf(event.end),
        et: ad ? "10:00" : event.end.slice(11, 16),
        profileIds: event.profileIds,
      };
    }
    const d = date ?? today;
    const st = time ?? defaultStart(d, now);
    const [ed, et] = addMinutes(d, st, 60);
    const visible = profiles.filter((p) => p.kind === "profile" && !settings.calendar.hiddenProfiles.includes(p.id));
    return {
      title: "",
      allDay: !!allDayDefault,
      sd: d,
      st,
      ed: allDayDefault ? d : ed,
      et,
      profileIds: presetProfiles ?? (visible.length === 1 ? [visible[0].id] : []),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [title, setTitle] = useState(initial.title);
  const [allDay, setAllDay] = useState(initial.allDay);
  const [sd, setSd] = useState(initial.sd);
  const [st, setSt] = useState(initial.st);
  const [ed, setEd] = useState(initial.ed);
  const [et, setEt] = useState(initial.et);
  const [profileIds, setProfileIds] = useState<number[]>(initial.profileIds);
  const [repeat, setRepeat] = useState<Repeat>({ type: "none" });
  const [until, setUntil] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(!!event?.countdown);
  const [emoji, setEmoji] = useState(event?.emoji ?? "");
  const [reminder, setReminder] = useState<string>(event?.reminderMinutes == null ? "default" : String(event.reminderMinutes));
  const [location, setLocation] = useState(event?.location ?? "");
  const [notes, setNotes] = useState(event?.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [askScope, setAskScope] = useState(false);

  useEffect(() => {
    if (!editing || !event?.localId) return;
    get<LocalEvent>(`/api/events/${event.localId}`)
      .then((s) => {
        setSeries(s);
        setRepeat(s.repeat);
        setUntil(s.repeatUntil ?? null);
        setLoaded(true);
      })
      .catch((e) => {
        setError(e.message);
        setLoaded(true);
      });
  }, [editing, event?.localId]);

  const recurringSeries = !!series && series.repeat.type !== "none" && !!event?.occurrence;

  // Moving the start keeps the duration.
  const moveStart = (nd: string, nt: string) => {
    if (allDay) {
      const span = Math.max(0, diffDays(ed, sd));
      setSd(nd);
      setEd(addDays(nd, span));
    } else {
      const dur = Math.max(5, minutesBetween(sd, st, ed, et));
      const [d2, t2] = addMinutes(nd, nt, dur);
      setSd(nd);
      setSt(nt);
      setEd(d2);
      setEt(t2);
    }
  };

  const build = (): LocalEventInput | string => {
    if (!title.trim()) return "Give the event a title.";
    if (!profileIds.length) return "Choose who this event is for.";
    if (!sd || !ed || (!allDay && (!st || !et))) return "Choose a start and end.";
    const start = allDay ? sd : `${sd}T${st}`;
    const end = allDay ? addDays(ed, 1) : `${ed}T${et}`;
    if (end <= start) return allDay ? "The end date can't be before the start date." : "The end must be after the start.";
    return {
      title: title.trim(),
      allDay,
      start,
      end,
      location: location.trim() || undefined,
      notes: notes.trim() || undefined,
      profileIds,
      repeat,
      repeatUntil: repeat.type === "none" ? null : until,
      countdown,
      emoji: countdown ? emoji : (series?.emoji ?? ""),
      reminderMinutes: reminder === "default" ? null : Number(reminder),
    };
  };

  const submit = async (scope?: EditScope) => {
    const body = build();
    if (typeof body === "string") return setError(body);
    setError(null);
    setBusy(true);
    try {
      if (editing && event?.localId) {
        let payload = body;
        let q = "";
        if (recurringSeries && scope) {
          q = `?scope=${scope}&occurrence=${event.occurrence}`;
          if (scope === "all" && series) {
            // The form shows this occurrence; move the series start by the same number of days.
            const shiftDays = diffDays(dayOf(body.start), event.occurrence!);
            const spanDays = diffDays(dayOf(body.end), dayOf(body.start));
            const s0 = addDays(dayOf(series.start), shiftDays);
            payload = { ...body, start: s0 + body.start.slice(10), end: addDays(s0, spanDays) + body.end.slice(10) };
          }
        }
        await api("PUT", `/api/events/${event.localId}${q}`, payload);
        toast("Event saved");
      } else {
        await api("POST", "/api/events", body);
        toast("Event added");
      }
      onSaved?.();
      onClose();
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 423)) setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const onSave = () => {
    const body = build();
    if (typeof body === "string") return setError(body);
    if (recurringSeries) setAskScope(true);
    else submit();
  };

  return (
    <Modal
      title={editing ? "Edit Event" : "Add Event"}
      onClose={onClose}
      className="cal-form"
      footer={
        <>
          <button type="button" className="pill lg" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="pill lg primary" disabled={busy || !loaded} onClick={onSave}>
            {busy ? "Saving…" : "Save"}
          </button>
        </>
      }
    >
      <input
        className="input big"
        placeholder="Event title"
        value={title}
        autoFocus={!editing}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && onSave()}
        aria-label="Title"
      />
      <ToggleRow
        label="All day"
        on={allDay}
        onChange={(v) => {
          setAllDay(v);
          // A short timed event that ends after midnight (e.g. the 11 PM default) is still a one-day all-day event.
          if (v && ed > sd && minutesBetween(sd, st, ed, et) < 1440) setEd(sd);
          if (!v && ed === sd && minutesBetween(sd, st, ed, et) <= 0) {
            const [d2, t2] = addMinutes(sd, st, 60);
            setEd(d2);
            setEt(t2);
          }
        }}
      />
      <div className="cal-form-when">
        <span className="label">Starts</span>
        <input className="input" type="date" value={sd} onChange={(e) => e.target.value && moveStart(e.target.value, st)} aria-label="Start date" />
        {!allDay ? (
          <input className="input" type="time" step={300} value={st} onChange={(e) => e.target.value && moveStart(sd, e.target.value)} aria-label="Start time" />
        ) : (
          <span />
        )}
        <span className="label">Ends</span>
        <input className="input" type="date" value={ed} min={sd} onChange={(e) => e.target.value && setEd(e.target.value)} aria-label="End date" />
        {!allDay ? <input className="input" type="time" step={300} value={et} onChange={(e) => e.target.value && setEt(e.target.value)} aria-label="End time" /> : <span />}
      </div>
      <Field label="Who">
        <ProfilePicker value={profileIds} onChange={setProfileIds} />
      </Field>
      <RepeatEditor value={repeat} onChange={setRepeat} anchorDate={sd} until={until} onUntil={setUntil} />
      <ToggleRow label="Countdown" hint="Count down the days to this event in the preview bar." on={countdown} onChange={setCountdown} />
      {countdown && (
        <div className="row" style={{ paddingLeft: 4 }}>
          <EmojiPicker value={emoji} onChange={setEmoji} />
          <span className="muted">{emoji ? "Countdown emoji" : "Pick an emoji, or we'll choose one from the title."}</span>
        </div>
      )}
      <Field label="Reminder">
        <select className="select" value={reminder} onChange={(e) => setReminder(e.target.value)}>
          {REMINDERS.map((r) => (
            <option key={r.value} value={r.value}>
              {r.value === "default" ? `Default (${defaultReminderText(settings.reminders)})` : r.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Location">
        <input className="input" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Add a place" />
      </Field>
      <Field label="Notes">
        <textarea className="textarea" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Add notes" />
      </Field>
      {error && <div className="error-text">{error}</div>}
      {askScope && (
        <Confirm
          title="Save changes to"
          danger={false}
          options={[
            { value: "this", label: "This event" },
            { value: "following", label: "This and following events" },
            { value: "all", label: "All events" },
          ]}
          onConfirm={(o) => submit(o as EditScope)}
          onClose={() => setAskScope(false)}
        />
      )}
    </Modal>
  );
}

export function defaultReminderText(r: { eventsAtTime: boolean; eventsMinutesBefore: number | null }): string {
  const parts: string[] = [];
  if (r.eventsMinutesBefore != null) parts.push(minutesText(r.eventsMinutesBefore));
  if (r.eventsAtTime) parts.push("at time");
  return parts.length ? parts.join(" & ") : "none";
}

export function minutesText(m: number): string {
  if (m <= 0) return "at time of event";
  if (m % 1440 === 0) return `${m / 1440} day${m === 1440 ? "" : "s"} before`;
  if (m % 60 === 0) return `${m / 60} hour${m === 60 ? "" : "s"} before`;
  return `${m} min before`;
}
