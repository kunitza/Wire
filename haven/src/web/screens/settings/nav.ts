import type { Screen } from "../../lib/store";

export type SettingsSection =
  | "general"
  | "profiles"
  | "calendars"
  | "display"
  | "lock"
  | "sleep"
  | "reminders"
  | "rewards"
  | "voice"
  | "connector"
  | "ai"
  | "email"
  | "backup";

const KEY = "haven-settings-section";

/** Open Settings on a specific section (e.g. from Sidekick: "Add API key" -> Settings › Sidekick). */
export function openSettings(go: (s: Screen) => void, section: SettingsSection) {
  try {
    sessionStorage.setItem(KEY, section);
  } catch {
    /* ignore */
  }
  go("settings");
}

/** Read (and clear) a section requested via openSettings. */
export function takeRequestedSection(): SettingsSection | null {
  try {
    const v = sessionStorage.getItem(KEY) as SettingsSection | null;
    sessionStorage.removeItem(KEY);
    return v;
  } catch {
    return null;
  }
}
