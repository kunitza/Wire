import type { DayPart, Repeat, TaskKind } from "../../../shared/types";

export interface Preset {
  kind: TaskKind;
  title: string;
  emoji: string;
  stars: number;
  parts?: DayPart[];
  repeat?: Repeat;
}

const daily: Repeat = { type: "daily", interval: 1 };
const weekly = (...days: number[]): Repeat => ({ type: "weekly", interval: 1, days });

/** The "Task Box": ready-made chores and routines that fill the form. */
export const PRESETS: Preset[] = [
  // Morning routines
  { kind: "routine", title: "Make bed", emoji: "🛏️", stars: 1, parts: ["morning"] },
  { kind: "routine", title: "Brush teeth", emoji: "🪥", stars: 1, parts: ["morning", "evening"] },
  { kind: "routine", title: "Get dressed", emoji: "👕", stars: 1, parts: ["morning"] },
  { kind: "routine", title: "Eat breakfast", emoji: "🥞", stars: 1, parts: ["morning"] },
  { kind: "routine", title: "Wash face", emoji: "🧼", stars: 1, parts: ["morning"] },
  { kind: "routine", title: "Take vitamins", emoji: "💊", stars: 1, parts: ["morning"] },
  { kind: "routine", title: "Pack backpack", emoji: "🎒", stars: 1, parts: ["morning"], repeat: weekly(1, 2, 3, 4, 5) },
  // Afternoon routines
  { kind: "routine", title: "Homework", emoji: "📚", stars: 2, parts: ["afternoon"], repeat: weekly(1, 2, 3, 4, 5) },
  { kind: "routine", title: "Practice piano", emoji: "🎹", stars: 2, parts: ["afternoon"] },
  { kind: "routine", title: "Unpack lunchbox", emoji: "🥪", stars: 1, parts: ["afternoon"], repeat: weekly(1, 2, 3, 4, 5) },
  { kind: "routine", title: "Play outside", emoji: "⚽", stars: 1, parts: ["afternoon"] },
  { kind: "routine", title: "Stretch", emoji: "🤸", stars: 1, parts: ["afternoon"] },
  // Evening routines
  { kind: "routine", title: "Read 20 minutes", emoji: "📖", stars: 2, parts: ["evening"] },
  { kind: "routine", title: "Bath time", emoji: "🛁", stars: 1, parts: ["evening"] },
  { kind: "routine", title: "Pajamas on", emoji: "🌙", stars: 1, parts: ["evening"] },
  { kind: "routine", title: "Tidy toys", emoji: "🧸", stars: 1, parts: ["evening"] },
  { kind: "routine", title: "Lay out clothes", emoji: "👟", stars: 1, parts: ["evening"] },
  // Chores
  { kind: "chore", title: "Feed the pet", emoji: "🐶", stars: 1, repeat: daily },
  { kind: "chore", title: "Walk the dog", emoji: "🦮", stars: 2, repeat: daily },
  { kind: "chore", title: "Empty dishwasher", emoji: "🍽️", stars: 2, repeat: weekly(1, 3, 5) },
  { kind: "chore", title: "Set the table", emoji: "🍴", stars: 1, repeat: daily },
  { kind: "chore", title: "Clear the table", emoji: "🧽", stars: 1, repeat: daily },
  { kind: "chore", title: "Take out trash", emoji: "🗑️", stars: 2, repeat: weekly(2) },
  { kind: "chore", title: "Take out recycling", emoji: "♻️", stars: 2, repeat: weekly(4) },
  { kind: "chore", title: "Fold laundry", emoji: "🧺", stars: 2, repeat: weekly(6) },
  { kind: "chore", title: "Put away laundry", emoji: "👚", stars: 2, repeat: weekly(6) },
  { kind: "chore", title: "Clean room", emoji: "🧹", stars: 3, repeat: weekly(6) },
  { kind: "chore", title: "Vacuum", emoji: "🧹", stars: 3, repeat: weekly(0) },
  { kind: "chore", title: "Clean bathroom", emoji: "🚿", stars: 3, repeat: weekly(0) },
  { kind: "chore", title: "Water plants", emoji: "🪴", stars: 1, repeat: { type: "afterCompletion", interval: 3, unit: "day" } },
  { kind: "chore", title: "Wipe counters", emoji: "🧽", stars: 1 },
  { kind: "chore", title: "Help cook dinner", emoji: "🍳", stars: 2 },
  { kind: "chore", title: "Wash the car", emoji: "🚗", stars: 4 },
  { kind: "chore", title: "Rake leaves", emoji: "🍂", stars: 3 },
  { kind: "chore", title: "Grocery helper", emoji: "🛒", stars: 1 },
];
