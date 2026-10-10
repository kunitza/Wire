import { useState } from "react";
import { Calendar, CheckSquare, Sparkles, List as ListIcon } from "lucide-react";
import { Popover } from "../components/ui";
import { useApp } from "../lib/store";
import { EventForm } from "./calendar/CalendarPane";
import { TaskForm } from "./tasks/TodayTasksPane";

/** The Home screen's + button: add an event or a task right here, or jump to lists / Sidekick. */
export function HomeAdd({ anchor, day, onClose }: { anchor: HTMLElement; day: string; onClose: () => void }) {
  const { go } = useApp();
  const [form, setForm] = useState<"event" | "task" | null>(null);
  if (form === "event") return <EventForm date={day} onClose={onClose} />;
  if (form === "task") return <TaskForm onClose={onClose} />;
  const jump = (s: "lists" | "sidekick") => {
    onClose();
    go(s);
  };
  return (
    <Popover anchor={anchor} onClose={onClose} width={320}>
      <button className="menu-row" onClick={() => setForm("event")}>
        <Calendar /> Add event
      </button>
      <button className="menu-row" onClick={() => setForm("task")}>
        <CheckSquare /> Add task
      </button>
      <button className="menu-row" onClick={() => jump("lists")}>
        <ListIcon /> Add to a list
      </button>
      <button className="menu-row" onClick={() => jump("sidekick")}>
        <Sparkles /> Import with Sidekick
      </button>
    </Popover>
  );
}
