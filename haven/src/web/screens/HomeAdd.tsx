import { Calendar, CheckSquare, Sparkles, List as ListIcon } from "lucide-react";
import { Popover } from "../components/ui";
import { useApp } from "../lib/store";

/** The Home screen's + button: choose what to add. */
export function HomeAdd({ anchor, onClose }: { anchor: HTMLElement; day: string; onClose: () => void }) {
  const { go } = useApp();
  const pick = (s: "calendar" | "tasks" | "lists" | "sidekick") => {
    onClose();
    go(s);
  };
  return (
    <Popover anchor={anchor} onClose={onClose} width={320}>
      <button className="menu-row" onClick={() => pick("calendar")}>
        <Calendar /> Add event
      </button>
      <button className="menu-row" onClick={() => pick("tasks")}>
        <CheckSquare /> Add task
      </button>
      <button className="menu-row" onClick={() => pick("lists")}>
        <ListIcon /> Add to a list
      </button>
      <button className="menu-row" onClick={() => pick("sidekick")}>
        <Sparkles /> Import with Sidekick
      </button>
    </Popover>
  );
}
