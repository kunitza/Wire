import type { CalendarView } from "../../../shared/types";

/** Calendar used inside the Home screen panel. */
export function CalendarPane(_props: { view: CalendarView; anchor: string; onAnchor: (d: string) => void }) {
  return <div className="empty">Calendar</div>;
}
