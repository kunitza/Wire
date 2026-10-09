import { useEffect, useState, type ReactNode } from "react";
import { AlignLeft, Bell, CalendarDays, Info, MapPin, Pencil, Repeat as RepeatIcon, Timer, Trash2, Users } from "lucide-react";
import type { CalendarEvent, EditScope, LocalEvent, Meal } from "../../../shared/types";
import { describeRepeat, diffDays } from "../../../shared/dates";
import { del, get } from "../../lib/api";
import { useApp } from "../../lib/store";
import { Avatar, Confirm, Modal } from "../../components/ui";
import { fmtRange, fmtTime, longDate, shortDate, weatherEmoji, weatherLabel } from "../../lib/format";
import { countdownLabel, dayOf, lastDay } from "./model";
import { useEventLook, useMealCategory } from "./shared";
import { defaultReminderText, minutesText } from "./EventForm";

function whenText(e: CalendarEvent, h24: boolean): string {
  const sd = dayOf(e.start);
  const ld = lastDay(e);
  if (e.allDay) return ld > sd ? `${longDate(sd)} – ${longDate(ld)} · All day` : `${longDate(sd)} · All day`;
  if (ld > sd) return `${longDate(sd)}, ${fmtTime(e.start, h24)} – ${shortDate(dayOf(e.end))}, ${fmtTime(e.end, h24)}`;
  return `${longDate(sd)} · ${fmtRange(e.start, e.end, h24)}`;
}

function Row({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="cal-drow">
      <span className="cal-drow-icon">{icon}</span>
      <div className="grow">{children}</div>
    </div>
  );
}

export function EventDetails({ event, onClose, onEdit }: { event: CalendarEvent; onClose: () => void; onEdit: () => void }) {
  const { settings, today, weather, calendars, run, toast } = useApp();
  const look = useEventLook()(event);
  const [series, setSeries] = useState<LocalEvent | null>(null);
  const [confirm, setConfirm] = useState(false);
  const google = event.source === "google";

  useEffect(() => {
    if (!event.localId) return;
    get<LocalEvent>(`/api/events/${event.localId}`)
      .then(setSeries)
      .catch(() => undefined);
  }, [event.localId]);

  const recurring = !!event.recurring || (!!series && series.repeat.type !== "none");
  const sd = dayOf(event.start);
  const daysUntil = diffDays(sd, today);
  const wx = settings.calendar.showWeather && daysUntil >= 0 && daysUntil <= 7 ? weather.daily.find((d) => d.date === sd) : undefined;
  const cal = google ? calendars.find((c) => c.id === event.calendarId) : undefined;
  const reminder =
    event.allDay || google
      ? null
      : event.reminderMinutes == null
        ? `Default (${defaultReminderText(settings.reminders)})`
        : event.reminderMinutes < 0
          ? "No reminder"
          : event.reminderMinutes === 0
            ? "At time of event"
            : minutesText(event.reminderMinutes);

  const remove = async (scope?: string) => {
    const q = recurring && scope && event.occurrence ? `?scope=${scope as EditScope}&occurrence=${event.occurrence}` : "";
    const ok = await run(() => del(`/api/events/${event.localId}${q}`));
    if (ok) {
      toast("Event deleted");
      onClose();
    }
  };

  return (
    <Modal
      title={
        <span className="cal-dtitle">
          <span className="cal-dswatch" style={{ background: look.background }} />
          {event.emoji && event.countdown ? `${event.emoji} ` : ""}
          {event.title}
        </span>
      }
      onClose={onClose}
      size="narrow"
      className="cal-details"
      actions={
        !google && (
          <>
            <button className="icon-btn" aria-label="Edit event" onClick={onEdit}>
              <Pencil />
            </button>
            <button className="icon-btn danger" aria-label="Delete event" onClick={() => setConfirm(true)}>
              <Trash2 />
            </button>
          </>
        )
      }
    >
      <Row icon={<CalendarDays />}>{whenText(event, settings.clock24h)}</Row>
      {recurring && series && (
        <Row icon={<RepeatIcon />}>
          {describeRepeat(series.repeat)}
          {series.repeatUntil ? ` · until ${shortDate(series.repeatUntil)}` : ""}
        </Row>
      )}
      {reminder && <Row icon={<Bell />}>{reminder}</Row>}
      {look.profiles.length > 0 && (
        <Row icon={<Users />}>
          <div className="row wrap" style={{ gap: 8 }}>
            {look.profiles.map((p) => (
              <span key={p.id} className="cal-person" style={{ background: `color-mix(in srgb, ${p.color} 16%, white)` }}>
                <Avatar profile={p} size={30} />
                {p.name}
              </span>
            ))}
          </div>
        </Row>
      )}
      {event.location && (
        <Row icon={<MapPin />}>
          <span style={{ whiteSpace: "pre-wrap" }}>{event.location}</span>
        </Row>
      )}
      {event.notes && (
        <Row icon={<AlignLeft />}>
          <span style={{ whiteSpace: "pre-wrap", color: "var(--text-2)" }}>{event.notes}</span>
        </Row>
      )}
      {wx && (
        <Row icon={<span style={{ fontSize: 22 }}>{weatherEmoji(wx.code)}</span>}>
          {weatherLabel(wx.code) || "Forecast"} · {wx.max}° / {wx.min}°{wx.precip ? ` · ${wx.precip}% rain` : ""}
        </Row>
      )}
      {event.countdown && daysUntil >= 0 && (
        <Row icon={<Timer />}>{daysUntil === 0 ? "Today!" : `${countdownLabel(daysUntil)} until event`}</Row>
      )}
      {google && (
        <Row icon={<Info />}>
          <span className="muted">From {cal?.name ? `${cal.name} (Google Calendar)` : "Google Calendar"} · read only</span>
        </Row>
      )}
      {confirm &&
        (recurring ? (
          <Confirm
            title="Delete repeating event"
            message={`“${event.title}” repeats. What should be deleted?`}
            options={[
              { value: "this", label: "This event" },
              { value: "following", label: "This and following events" },
              { value: "all", label: "All events" },
            ]}
            onConfirm={(o) => remove(o)}
            onClose={() => setConfirm(false)}
          />
        ) : (
          <Confirm title="Delete event?" message={`“${event.title}” will be removed from the calendar.`} onConfirm={() => remove()} onClose={() => setConfirm(false)} />
        ))}
    </Modal>
  );
}

export function MealDetails({ meal, onClose }: { meal: Meal; onClose: () => void }) {
  const { go } = useApp();
  const cat = useMealCategory()(meal);
  return (
    <Modal title={meal.title} onClose={onClose} size="narrow" className="cal-details">
      <Row icon={<CalendarDays />}>
        {longDate(meal.date)} · <span style={{ color: cat?.color, fontWeight: 600 }}>{cat?.name ?? "Meal"}</span>
      </Row>
      {meal.notes && (
        <Row icon={<AlignLeft />}>
          <span style={{ whiteSpace: "pre-wrap" }}>{meal.notes}</span>
        </Row>
      )}
      <button
        className="pill lg"
        onClick={() => {
          onClose();
          go(meal.recipeId ? "recipes" : "meals");
        }}
      >
        {meal.recipeId ? "Open Recipe" : "Open Meal Plan"}
      </button>
    </Modal>
  );
}
