import { useEffect, useRef, useState, type ComponentType } from "react";
import { Bot, Bell, CalendarDays, ChevronLeft, ChevronRight, HardDrive, LayoutGrid, Lock, Mail, Mic, Moon, Settings2, Sparkles, Star, Users } from "lucide-react";
import { Header } from "../../components/shell";
import { useApp } from "../../lib/store";
import { takeRequestedSection, type SettingsSection } from "./nav";
import GeneralSection from "./GeneralSection";
import ProfilesSection from "./ProfilesSection";
import CalendarsSection from "./CalendarsSection";
import DisplaySection from "./DisplaySection";
import LockSection from "./LockSection";
import { RemindersSection, RewardsSection, SleepSection } from "./SimpleSections";
import VoiceSection from "./VoiceSection";
import AiSection from "./AiSection";
import ConnectorSection from "./ConnectorSection";
import EmailSection from "./EmailSection";
import BackupSection from "./BackupSection";
import "./settings.css";

interface SectionDef {
  id: SettingsSection;
  label: string;
  icon: typeof Users;
  bg: string;
  fg: string;
  C: ComponentType;
}

const SECTIONS: SectionDef[] = [
  { id: "general", label: "General", icon: Settings2, bg: "#ECECEC", fg: "#5D6063", C: GeneralSection },
  { id: "profiles", label: "Profiles", icon: Users, bg: "#E3EEF8", fg: "#2E86C1", C: ProfilesSection },
  { id: "calendars", label: "Calendars", icon: CalendarDays, bg: "#FDE3DE", fg: "#E8553D", C: CalendarsSection },
  { id: "display", label: "Calendar display", icon: LayoutGrid, bg: "#FFF1CC", fg: "#C98F00", C: DisplaySection },
  { id: "lock", label: "Parental Lock", icon: Lock, bg: "#E2F2EA", fg: "#2E8B57", C: LockSection },
  { id: "sleep", label: "Sleep", icon: Moon, bg: "#E6E3F7", fg: "#6A5ACD", C: SleepSection },
  { id: "reminders", label: "Reminders", icon: Bell, bg: "#FDE8D7", fg: "#D0632A", C: RemindersSection },
  { id: "rewards", label: "Rewards", icon: Star, bg: "#FFF4CC", fg: "#E0A100", C: RewardsSection },
  { id: "voice", label: "Voice (Siri & Google)", icon: Mic, bg: "#DCEFF5", fg: "#1B8AAE", C: VoiceSection },
  { id: "ai", label: "Sidekick (AI)", icon: Sparkles, bg: "#EEE2F4", fg: "#9B59B6", C: AiSection },
  { id: "connector", label: "Claude connector", icon: Bot, bg: "#F6E6D6", fg: "#CF8130", C: ConnectorSection },
  { id: "email", label: "Email import", icon: Mail, bg: "#E7EFF2", fg: "#2178AF", C: EmailSection },
  { id: "backup", label: "Backup & about", icon: HardDrive, bg: "#ECECEC", fg: "#5D6063", C: BackupSection },
];

function useHint(id: SettingsSection): string {
  const { settings, profiles, calendars } = useApp();
  switch (id) {
    case "general":
      return settings.location?.name ?? "Name, clock, weather";
    case "profiles":
      return `${profiles.length} profile${profiles.length === 1 ? "" : "s"} & labels`;
    case "calendars":
      return calendars.length ? `${calendars.length} Google calendar${calendars.length === 1 ? "" : "s"}` : "Sync Google Calendar";
    case "display":
      return "Views, countdowns, colors";
    case "lock":
      return settings.lock.enabled ? "On" : "Off";
    case "sleep":
      return settings.sleep.enabled ? `${settings.sleep.start} – ${settings.sleep.end}` : "Off";
    case "reminders":
      return settings.reminders.eventsAtTime || settings.reminders.eventsMinutesBefore != null || settings.reminders.tasksWhenDue ? "On" : "Off";
    case "rewards":
      return settings.rewardsNeedApproval ? "Parent approval" : "Instant";
    case "voice":
      return settings.voice.enabled ? "On" : "Off";
    case "ai":
      return settings.ai.available ? "Connected" : "Not connected";
    case "connector":
      return "Ask Claude about your household";
    case "email":
      return settings.email.configured ? settings.email.address ?? "Connected" : "Not set up";
    case "backup":
      return "Download, phone app";
  }
}

function MenuItem({ s, on, onClick }: { s: SectionDef; on: boolean; onClick: () => void }) {
  const hint = useHint(s.id);
  return (
    <button className={`set-menu-item ${on ? "on" : ""}`} onClick={onClick} aria-current={on ? "page" : undefined}>
      <span className="set-icon" style={{ background: s.bg, color: s.fg }}>
        <s.icon />
      </span>
      <span className="grow truncate">
        {s.label}
        <small className="truncate">{hint}</small>
      </span>
      <ChevronRight className="chev" size={22} />
    </button>
  );
}

export default function SettingsScreen() {
  const { isPhone } = useApp();
  const [section, setSection] = useState<SettingsSection | null>(() => takeRequestedSection() ?? (isPhone ? null : "general"));
  const contentRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!isPhone && !section) setSection("general");
  }, [isPhone, section]);
  useEffect(() => {
    contentRef.current?.scrollTo(0, 0);
    contentRef.current?.closest(".screen")?.scrollTo(0, 0);
  }, [section]);

  const current = SECTIONS.find((s) => s.id === section);
  const showMenu = !isPhone || !current;
  return (
    <>
      <Header />
      <div className="screen no-pad">
        <div className="set-layout">
          {showMenu && (
            <nav className="set-menu" aria-label="Settings sections">
              <h1 className="set-title set-menu-title">Settings</h1>
              {SECTIONS.map((s) => (
                <MenuItem key={s.id} s={s} on={s.id === section} onClick={() => setSection(s.id)} />
              ))}
            </nav>
          )}
          {current && (
            <div className="set-content" ref={contentRef}>
              <div className="set-inner" key={current.id}>
                {isPhone && (
                  <button className="pill sm set-back" onClick={() => setSection(null)}>
                    <ChevronLeft />
                    Settings
                  </button>
                )}
                <current.C />
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
