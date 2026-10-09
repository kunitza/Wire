// Types shared by the server and the web app.

/** A profile is a "who" (a person, or a group like "Family"); a label is a "what" (Holidays, Soccer). */
export type ProfileKind = "profile" | "label";

export interface Profile {
  id: number;
  name: string;
  color: string; // hex
  avatar: string; // emoji; empty = show the initial
  kind: ProfileKind;
  birthday: string | null; // YYYY-MM-DD
  sort: number;
  stars: number; // computed balance
}

export type RepeatUnit = "day" | "week" | "month" | "year";

/** Recurrence rule used by events, chores, routines and meals. */
export type Repeat =
  | { type: "none" }
  | { type: "daily"; interval: number }
  | { type: "weekly"; interval: number; days: number[] } // 0 = Sunday
  | { type: "monthly"; interval: number; dayOfMonth: number }
  | { type: "yearly" }
  /** Chores only: the next one appears `interval` units after the last completion. */
  | { type: "afterCompletion"; interval: number; unit: RepeatUnit };

export interface CalendarEvent {
  /** Unique per occurrence. */
  key: string;
  source: "local" | "google";
  localId?: number;
  /** Date of this occurrence for repeating local events (used for "edit this event"). */
  occurrence?: string;
  recurring?: boolean;
  calendarId?: number;
  title: string;
  allDay: boolean;
  /** "YYYY-MM-DDTHH:MM" household-local for timed events; "YYYY-MM-DD" for all-day. */
  start: string;
  /** Exclusive end, same format as start. */
  end: string;
  location?: string;
  notes?: string;
  profileIds: number[];
  color?: string;
  countdown?: boolean;
  emoji?: string;
  reminderMinutes?: number | null;
}

export interface LocalEventInput {
  title: string;
  allDay: boolean;
  start: string;
  end: string;
  location?: string;
  notes?: string;
  profileIds: number[];
  repeat: Repeat;
  repeatUntil?: string | null;
  countdown?: boolean;
  emoji?: string;
  /** null = use the household default; -1 = no reminder; otherwise minutes before. */
  reminderMinutes?: number | null;
}

export interface LocalEvent extends LocalEventInput {
  id: number;
  exdates: string[];
}

export type EditScope = "this" | "following" | "all";

export interface SyncedCalendar {
  id: number;
  name: string;
  url: string; // masked when sent to clients
  profileIds: number[];
  color: string | null;
  enabled: boolean;
  lastSync: string | null;
  lastError: string | null;
  eventCount: number;
}

export type DayPart = "morning" | "afternoon" | "evening";
export type TaskKind = "chore" | "routine";

export interface Task {
  id: number;
  kind: TaskKind;
  title: string;
  description: string;
  emoji: string;
  profileIds: number[]; // chores: empty = Up For Grabs
  stars: number;
  repeat: Repeat;
  repeatUntil: string | null;
  /** Due date (chores) or first day (routines). null = anytime chore. */
  date: string | null;
  dueTime: string | null; // HH:MM
  /** Routines only: which parts of the day the routine appears in. */
  parts: DayPart[];
  trackHabit: boolean;
  sort: number;
}

export interface TaskInstance {
  task: Task;
  /** Day the instance belongs to (for late chores: the day it is being shown on). */
  date: string;
  /** Identity of the occurrence used to record completion. */
  occurrence: string;
  part: DayPart | null;
  /** Column (assigned profile); null = Up For Grabs. */
  profileId: number | null;
  status: "open" | "done" | "skipped";
  completedBy: number | null;
  completedAt: string | null;
  late: boolean;
  streak: number;
}

export interface Reward {
  id: number;
  title: string;
  description: string;
  emoji: string;
  cost: number;
  profileIds: number[];
  renew: boolean;
  /** Profiles that have redeemed this (non-renewing) reward. */
  redeemedBy: number[];
}

export interface Redemption {
  id: number;
  rewardId: number;
  rewardTitle: string;
  rewardEmoji: string;
  profileId: number;
  stars: number;
  status: "pending" | "approved" | "declined";
  createdAt: string;
}

export interface StarLedgerEntry {
  id: string;
  profileId: number;
  delta: number;
  reason: string;
  at: string;
}

export interface List {
  id: number;
  name: string;
  color: string;
  kind: "todo" | "grocery" | "other";
  hideOnDevice: boolean;
  sort: number;
  itemCount: number;
  openCount: number;
}

export interface ListItem {
  id: number;
  listId: number;
  text: string;
  section: string;
  checked: boolean;
  sort: number;
}

export interface MealCategory {
  id: number;
  name: string;
  color: string;
  visible: boolean;
  showOnCalendar: boolean;
  sort: number;
}

export interface Meal {
  key: string;
  id: number;
  date: string;
  categoryId: number;
  title: string;
  recipeId: number | null;
  notes: string;
  repeat: Repeat;
  recurring: boolean;
  /** First date of the (repeating) meal series; equals `date` for one-off meals. */
  seriesStart?: string;
  repeatUntil?: string | null;
}

export interface Recipe {
  id: number;
  title: string;
  emoji: string;
  categoryId: number | null;
  ingredients: string[];
  instructions: string;
  sourceUrl: string;
  favorite: boolean;
}

export interface Weather {
  current: { temp: number; code: number; isDay: boolean } | null;
  daily: { date: string; code: number; max: number; min: number; precip: number }[];
  units: "fahrenheit" | "celsius";
  updatedAt: string | null;
}

export type CalendarView = "schedule" | "day" | "week" | "month";

export interface Settings {
  displayName: string;
  weekStartsOn: 0 | 1;
  clock24h: boolean;
  temperatureUnit: "fahrenheit" | "celsius";
  location: { name: string; lat: number; lon: number } | null;
  textSize: "small" | "medium" | "large";
  density: "cozy" | "snug";
  theme: "light" | "dark" | "auto";
  calendar: {
    defaultView: CalendarView;
    scheduleDays: number; // 1-7
    weekStartsToday: boolean;
    monthStartsThisWeek: boolean;
    showCountdowns: "always" | "3months" | "1month";
    colorCodeMultiProfile: boolean;
    shadeWeekends: boolean;
    dimPastEvents: boolean;
    showTaskProgress: boolean;
    showWeather: boolean;
    showMeals: boolean;
    hiddenProfiles: number[];
  };
  tasks: { hiddenProfiles: number[]; showCompleted: boolean; showLate: boolean; showSkipped: boolean; showUpForGrabs: boolean };
  home: { showTasks: boolean; showLists: boolean; calendarView: CalendarView };
  lock: { enabled: boolean; hasPin: boolean; lockAdd: boolean; lockModify: boolean; relockMinutes: number };
  sleep: { enabled: boolean; start: string; end: string };
  reminders: { eventsAtTime: boolean; eventsMinutesBefore: number | null; tasksWhenDue: boolean; sound: boolean };
  funMode: boolean;
  rewardsNeedApproval: boolean;
  voice: { enabled: boolean; allowListAdd: boolean; tokenSet: boolean };
  ai: { available: boolean; model: string; monthlyBudgetUsd: number; spentThisMonthUsd: number };
  email: { configured: boolean; address: string | null; lastCheck: string | null; lastError: string | null };
}

export type ImportStatus = "processing" | "ready" | "applied" | "dismissed" | "failed" | "undone";

export interface ProposedEvent {
  title: string;
  allDay: boolean;
  start: string;
  end: string;
  location?: string;
  notes?: string;
  profileIds: number[];
}

export interface MagicImport {
  id: number;
  source: "text" | "file" | "email";
  label: string;
  status: ImportStatus;
  summary: string;
  events: ProposedEvent[];
  createdEventIds: number[];
  error: string | null;
  createdAt: string;
}

export interface SessionInfo {
  /** True when this browser may add/modify (unlocked, or lock disabled). */
  canEdit: boolean;
  lockEnabled: boolean;
  unlockedUntil: string | null;
}

/** Server-sent change notifications. */
export type ChangeTopic =
  | "profiles"
  | "events"
  | "calendars"
  | "tasks"
  | "rewards"
  | "stars"
  | "lists"
  | "meals"
  | "recipes"
  | "settings"
  | "weather"
  | "imports";
