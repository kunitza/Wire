import { useApp } from "../../lib/store";
import { ToggleRow } from "../../components/ui";
import type { CalendarView, Settings } from "../../../shared/types";
import { ChoiceRow, Group, Row, SectionTitle, useSaveSettings } from "./common";

export default function DisplaySection() {
  const { settings } = useApp();
  const save = useSaveSettings();
  const c = settings.calendar;
  const set = (patch: Partial<Settings["calendar"]>) => save({ calendar: patch });
  return (
    <>
      <SectionTitle lead="How the Calendar screen looks on this family hub.">Calendar display</SectionTitle>
      <Group title="Views">
        <ChoiceRow<CalendarView>
          label="Default view"
          value={c.defaultView}
          options={[
            { value: "schedule", label: "Schedule" },
            { value: "day", label: "Day" },
            { value: "week", label: "Week" },
            { value: "month", label: "Month" },
          ]}
          onChange={(v) => set({ defaultView: v })}
        />
        <Row label="Days in Schedule view" hint="How many day columns the Schedule view shows." className="set-choice">
          <div className="segmented" style={{ background: "#fff" }}>
            {[1, 2, 3, 4, 5, 6, 7].map((n) => (
              <button
                key={n}
                type="button"
                className={c.scheduleDays === n ? "on" : ""}
                style={c.scheduleDays === n ? { background: "var(--blue)", color: "#fff", boxShadow: "none", padding: "0 14px" } : { padding: "0 14px" }}
                onClick={() => set({ scheduleDays: n })}
                aria-label={`${n} days`}
              >
                {n}
              </button>
            ))}
          </div>
        </Row>
        <ToggleRow label="Week starts on the current day" hint="Week view always begins with today instead of Sunday/Monday." on={c.weekStartsToday} onChange={(v) => set({ weekStartsToday: v })} />
        <ToggleRow label="Month starts on the current week" hint="Month view begins with this week, so you always see what's ahead." on={c.monthStartsThisWeek} onChange={(v) => set({ monthStartsThisWeek: v })} />
      </Group>
      <Group title="Countdowns">
        <ChoiceRow
          label="Show countdowns"
          hint="Events marked as countdowns appear at the top of the calendar."
          value={c.showCountdowns}
          options={[
            { value: "always", label: "Always" },
            { value: "3months", label: "3 months before" },
            { value: "1month", label: "1 month before" },
          ]}
          onChange={(v) => set({ showCountdowns: v })}
        />
      </Group>
      <Group title="Look">
        <ToggleRow
          label="Color-code multi-profile events"
          hint="Events for several people show each person's color. Off: they use a neutral color."
          on={c.colorCodeMultiProfile}
          onChange={(v) => set({ colorCodeMultiProfile: v })}
        />
        <ToggleRow label="Shade weekends" on={c.shadeWeekends} onChange={(v) => set({ shadeWeekends: v })} />
        <ToggleRow label="Dim past events" hint="Events that have ended fade out." on={c.dimPastEvents} onChange={(v) => set({ dimPastEvents: v })} />
        <ToggleRow label="Show weather in day headers" on={c.showWeather} onChange={(v) => set({ showWeather: v })} />
        <ToggleRow label="Show meals on the calendar" on={c.showMeals} onChange={(v) => set({ showMeals: v })} />
        <ToggleRow label="Show task progress" hint="Progress rings for each person's chores." on={c.showTaskProgress} onChange={(v) => set({ showTaskProgress: v })} />
      </Group>
    </>
  );
}
