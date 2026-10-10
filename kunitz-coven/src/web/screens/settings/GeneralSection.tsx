import { useState } from "react";
import { PartyPopper } from "lucide-react";
import { useApp } from "../../lib/store";
import { ToggleRow } from "../../components/ui";
import { headerDate } from "../../lib/format";
import { ChoiceRow, Group, LocationSearch, SectionTitle, useSaveSettings } from "./common";

export default function GeneralSection() {
  const { settings, today } = useApp();
  const save = useSaveSettings();
  const [name, setName] = useState(settings.displayName);
  const saveName = () => {
    if (name.trim() !== settings.displayName) save({ displayName: name.trim() }, name.trim() ? "Display name saved" : "Showing the date again");
  };
  return (
    <>
      <SectionTitle>General</SectionTitle>

      <Group title="Display name" hint={`Shown at the top of the screen instead of the date (${headerDate(today)}). Leave empty to show the date.`}>
        <div className="set-input-row">
          <input
            className="input grow"
            placeholder="e.g. The Gardner Family"
            value={name}
            maxLength={40}
            onChange={(e) => setName(e.target.value)}
            onBlur={saveName}
            onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
            aria-label="Display name"
          />
          {settings.displayName && (
            <button
              className="pill"
              style={{ height: 56 }}
              onClick={() => {
                setName("");
                save({ displayName: "" }, "Showing the date again");
              }}
            >
              Show date
            </button>
          )}
        </div>
      </Group>

      <Group title="Date & time">
        <ChoiceRow
          label="Time format"
          value={settings.clock24h ? "24" : "12"}
          options={[
            { value: "12", label: "12-hour (3:30 PM)" },
            { value: "24", label: "24-hour (15:30)" },
          ]}
          onChange={(v) => save({ clock24h: v === "24" })}
        />
        <ChoiceRow
          label="Week starts on"
          value={settings.weekStartsOn}
          options={[
            { value: 0, label: "Sunday" },
            { value: 1, label: "Monday" },
          ]}
          onChange={(v) => save({ weekStartsOn: v })}
        />
      </Group>

      <Group title="Weather" hint="Weather comes from Open-Meteo (free, no account needed). Only the town's coordinates are used.">
        <LocationSearch current={settings.location} onPick={(p) => save({ location: p }, `Weather location set to ${p.name}`)} />
        <ChoiceRow
          label="Temperature"
          value={settings.temperatureUnit}
          options={[
            { value: "fahrenheit", label: "°F" },
            { value: "celsius", label: "°C" },
          ]}
          onChange={(v) => save({ temperatureUnit: v })}
        />
      </Group>

      <Group title="Appearance">
        <ChoiceRow
          label="Text size"
          value={settings.textSize}
          options={[
            { value: "small", label: <span style={{ fontSize: 14 }}>Small</span> },
            { value: "medium", label: <span style={{ fontSize: 16 }}>Medium</span> },
            { value: "large", label: <span style={{ fontSize: 18 }}>Large</span> },
          ]}
          onChange={(v) => save({ textSize: v })}
        />
        <ChoiceRow
          label="Display density"
          hint="Snug fits more on the screen."
          value={settings.density}
          options={[
            { value: "cozy", label: "Cozy" },
            { value: "snug", label: "Snug" },
          ]}
          onChange={(v) => save({ density: v })}
        />
        <ToggleRow
          icon={
            <span className="set-icon sm" style={{ background: "#FFF1CC", color: "#C98F00" }}>
              <PartyPopper />
            </span>
          }
          label="Fun mode"
          hint="Celebrate finished chores and rewards with a shower of emoji."
          on={settings.funMode}
          onChange={(v) => save({ funMode: v })}
        />
      </Group>
    </>
  );
}
