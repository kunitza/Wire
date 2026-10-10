import type { ReactNode } from "react";
import { CircleCheckBig, CloudSun, Timer, Utensils, Users } from "lucide-react";
import type { Settings } from "../../../shared/types";
import { put } from "../../lib/api";
import { useApp } from "../../lib/store";
import { Avatar, Popover, Toggle } from "../../components/ui";
import { setHideCountdowns, useHideCountdowns } from "./shared";

function FRow({ icon, label, on, onChange }: { icon: ReactNode; label: ReactNode; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="menu-row cal-frow">
      <span className="cal-frow-icon">{icon}</span>
      <span className="grow truncate">{label}</span>
      <Toggle on={on} onChange={onChange} label={typeof label === "string" ? label : undefined} />
    </label>
  );
}

/** Calendar filter: display toggles plus show/hide per profile (stored in settings). */
export function FilterPopover({ anchor, onClose }: { anchor: HTMLElement; onClose: () => void }) {
  const { settings, profiles, run, reload } = useApp();
  const c = settings.calendar;
  const hideCd = useHideCountdowns();
  const save = async (patch: Partial<Settings["calendar"]>) => {
    if (await run(() => put("/api/settings", { calendar: patch }))) await reload();
  };
  const allOn = profiles.every((p) => !c.hiddenProfiles.includes(p.id));
  return (
    <Popover anchor={anchor} onClose={onClose} width={400}>
      <div className="cal-filter">
        <FRow icon={<CircleCheckBig />} label="Task progress" on={c.showTaskProgress} onChange={(v) => save({ showTaskProgress: v })} />
        <FRow icon={<CloudSun />} label="Weather forecast" on={c.showWeather} onChange={(v) => save({ showWeather: v })} />
        <FRow icon={<Utensils />} label="Show meals" on={c.showMeals} onChange={(v) => save({ showMeals: v })} />
        <FRow icon={<Timer />} label="Countdowns" on={!hideCd} onChange={(v) => setHideCountdowns(!v)} />
        <div className="cal-filter-sep" />
        <FRow icon={<Users />} label="Select All" on={allOn} onChange={(v) => save({ hiddenProfiles: v ? [] : profiles.map((p) => p.id) })} />
        {profiles.map((p) => (
          <FRow
            key={p.id}
            icon={<Avatar profile={p} size={34} />}
            label={p.name}
            on={!c.hiddenProfiles.includes(p.id)}
            onChange={(v) => save({ hiddenProfiles: v ? c.hiddenProfiles.filter((x) => x !== p.id) : [...c.hiddenProfiles, p.id] })}
          />
        ))}
      </div>
    </Popover>
  );
}
