import { useEffect, useMemo, useState } from "react";
import { Timer } from "lucide-react";
import type { CalendarEvent, TaskInstance } from "../../../shared/types";
import { addDays } from "../../../shared/dates";
import { useApp, useLive } from "../../lib/store";
import { Avatar, AvatarStack, Popover, ProgressRing } from "../../components/ui";
import { tint } from "../../lib/format";
import { countdownLabel } from "./model";
import { useEventProfiles, useHideCountdowns } from "./shared";

type Countdown = CalendarEvent & { daysUntil: number };

/**
 * The pale-pink preview bar under the header: rotating countdowns on the left and per-profile
 * task progress rings on the right. Renders nothing when there is nothing to show.
 */
export function CountdownBar({ onOpenEvent, showTasks: showTasksProp }: { onOpenEvent?: (e: CalendarEvent) => void; showTasks?: boolean }) {
  const { settings, today, people, go, isPhone } = useApp();
  const hide = useHideCountdowns();
  const profilesOf = useEventProfiles();
  const hidden = settings.calendar.hiddenProfiles;
  const { data: countdowns } = useLive<Countdown[]>("/api/countdowns", ["events", "settings", "calendars"]);
  const showTasks = (showTasksProp ?? settings.calendar.showTaskProgress) && !isPhone;
  const { data: inst } = useLive<TaskInstance[]>(showTasks ? `/api/tasks/instances?from=${today}&to=${addDays(today, 1)}` : null, ["tasks"]);
  const [idx, setIdx] = useState(0);
  const [open, setOpen] = useState<HTMLElement | null>(null);

  const list = useMemo(
    () =>
      hide
        ? []
        : (countdowns ?? []).filter((c) => {
            const ids = c.profileIds;
            return !ids.length || ids.some((id) => !hidden.includes(id));
          }),
    [countdowns, hide, hidden],
  );

  const rings = useMemo(() => {
    if (!showTasks || !inst) return [];
    return people
      .filter((p) => !hidden.includes(p.id))
      .map((p) => {
        const mine = inst.filter((i) => i.profileId === p.id && i.date === today && i.status !== "skipped");
        return { p, total: mine.length, done: mine.filter((i) => i.status === "done").length };
      })
      .filter((r) => r.total > 0);
  }, [showTasks, inst, people, hidden, today]);

  useEffect(() => {
    if (list.length < 2) return;
    const t = setInterval(() => setIdx((i) => i + 1), 5000);
    return () => clearInterval(t);
  }, [list.length]);

  if (!list.length && !rings.length) return null;
  const cur = list.length ? list[idx % list.length] : null;

  return (
    <div className="preview-bar cal-preview">
      <button type="button" className="cal-preview-cd" onClick={(e) => list.length && setOpen(e.currentTarget)} disabled={!list.length} aria-label="Countdowns">
        {cur ? (
          <>
            <Timer className="cal-preview-icon" />
            <span key={cur.key} className="seg cal-preview-text">
              <span className="truncate">
                {cur.emoji && cur.emoji !== "📅" ? `${cur.emoji} ` : ""}
                {cur.title}
              </span>
              <span className="cal-preview-days">{cur.daysUntil === 0 ? "Today!" : `· ${countdownLabel(cur.daysUntil)}`}</span>
            </span>
            {list.length > 1 && (
              <span className="cal-preview-dots" aria-hidden>
                {list.slice(0, 6).map((c, i) => (
                  <i key={c.key} className={i === idx % list.length ? "on" : ""} />
                ))}
              </span>
            )}
          </>
        ) : (
          <span className="muted">Today's tasks</span>
        )}
      </button>
      {rings.length > 0 && (
        <button type="button" className="cal-preview-rings" onClick={() => go("tasks")} aria-label="Task progress">
          {rings.map(({ p, total, done }) => (
            <span key={p.id} className="cal-ring" title={`${p.name}: ${done} of ${total} done`}>
              <ProgressRing size={40} value={done / total} color={p.color} stroke={3.5}>
                <Avatar profile={p} size={30} />
              </ProgressRing>
              <span className="cal-ring-n">
                {done}/{total}
              </span>
            </span>
          ))}
        </button>
      )}
      {open && (
        <Popover anchor={open} onClose={() => setOpen(null)} width={560} align="start">
          <div className="cal-cd-title serif">Countdowns</div>
          <div className="cal-cd-grid">
            {list.map((c) => {
              const ps = profilesOf(c);
              const color = c.color ?? ps[0]?.color ?? "#F66951";
              return (
                <button
                  type="button"
                  key={c.key}
                  className="cal-cd-card"
                  style={{ background: tint(color, 0.2) }}
                  onClick={() => {
                    setOpen(null);
                    onOpenEvent?.(c);
                  }}
                >
                  <span className="cal-cd-emoji">{c.emoji || "📅"}</span>
                  <span className="cal-cd-name">{c.title}</span>
                  <span className="cal-cd-days serif">{c.daysUntil === 0 ? "Today!" : countdownLabel(c.daysUntil)}</span>
                  <AvatarStack profiles={ps} size={28} />
                </button>
              );
            })}
          </div>
        </Popover>
      )}
    </div>
  );
}
