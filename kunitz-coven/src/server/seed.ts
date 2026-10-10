import { fileURLToPath } from "node:url";
import type { Ctx } from "./context.js";
import { ensureDefaultCategories, createRecipe, createMeal, listCategories } from "./services/meals.js";
import { listLists, createList, addItems } from "./services/lists.js";
import { createProfile, listProfiles } from "./services/profiles.js";
import { createTask } from "./services/tasks.js";
import { createReward } from "./services/rewards.js";
import { createLocalEvent } from "./services/events.js";
import { addDays, localDateOf, startOfWeek } from "../shared/dates.js";

/** Things every household starts with (like Skylight): meal categories, a Grocery List and To-Dos. */
export function ensureDefaults(ctx: Ctx) {
  ensureDefaultCategories(ctx);
  if (!ctx.settings.get<boolean>("defaultsCreated", false)) {
    if (!listLists(ctx).length) {
      createList(ctx, { name: "Grocery List", color: "#7FC8A9", kind: "grocery", hideOnDevice: false });
      createList(ctx, { name: "To-Dos", color: "#8AB4F8", kind: "todo", hideOnDevice: false });
    }
    ctx.settings.set("defaultsCreated", true);
  }
}

/** Demo household used for screenshots, tests and trying things out. */
export function seedDemo(ctx: Ctx) {
  ensureDefaults(ctx);
  if (listProfiles(ctx).length) return;
  const today = localDateOf(ctx.now());
  const wk = startOfWeek(today, 0);
  const mom = createProfile(ctx, { name: "Laura", color: "#F66951", avatar: "🌻" });
  const dad = createProfile(ctx, { name: "Andy", color: "#2E86C1", avatar: "🧔" });
  const emma = createProfile(ctx, { name: "Emma", color: "#B07CC6", avatar: "🦄" });
  const jake = createProfile(ctx, { name: "Jake", color: "#3BAF7E", avatar: "🦖" });
  const family = createProfile(ctx, { name: "Family", color: "#FDB501", avatar: "🏡" });
  createProfile(ctx, { name: "Holidays", color: "#CC414B", avatar: "🎉", kind: "label" });

  const ev = (title: string, d: number, s: string | null, e: string | null, who: number[], extra: object = {}) =>
    createLocalEvent(ctx, {
      title,
      allDay: !s,
      start: s ? `${addDays(today, d)}T${s}` : addDays(today, d),
      end: e ? `${addDays(today, d)}T${e}` : addDays(today, d + 1),
      profileIds: who,
      repeat: { type: "none" },
      ...extra,
    });
  ev("School drop-off", 0, "07:45", "08:15", [dad.id, emma.id, jake.id], { repeat: { type: "weekly", interval: 1, days: [1, 2, 3, 4, 5] } });
  ev("Soccer practice", 1, "16:00", "17:30", [jake.id], { location: "Riverside Field" });
  ev("Piano lesson", 2, "15:30", "16:15", [emma.id]);
  ev("Book club", 0, "19:00", "21:00", [mom.id]);
  ev("Dentist", 3, "09:00", "10:00", [emma.id, mom.id], { notes: "Bring insurance card" });
  ev("Date night", 4, "18:30", "21:30", [mom.id, dad.id]);
  ev("Farmers market", 5, "09:00", "11:00", [family.id]);
  ev("Grandma visits", 6, null, null, [family.id]);
  ev("Emma's birthday party", 12, "14:00", "17:00", [emma.id, family.id], { countdown: true });
  ev("Beach vacation", 30, null, null, [family.id], { countdown: true, end: addDays(today, 37) });
  ev("Work trip", -2, null, null, [dad.id], { end: addDays(today, 0) });

  const t = (title: string, emoji: string, who: number[], stars: number, extra: object = {}) =>
    createTask(ctx, {
      kind: "chore",
      title,
      description: "",
      emoji,
      profileIds: who,
      stars,
      repeat: { type: "none" },
      repeatUntil: null,
      date: today,
      dueTime: null,
      parts: [],
      trackHabit: false,
      ...extra,
    });
  const r = (title: string, emoji: string, who: number[], parts: ("morning" | "afternoon" | "evening")[], stars = 1) =>
    t(title, emoji, who, stars, { kind: "routine", parts, repeat: { type: "daily", interval: 1 }, trackHabit: true, date: addDays(today, -10) });
  r("Make bed", "🛏️", [emma.id, jake.id], ["morning"]);
  r("Brush teeth", "🪥", [emma.id, jake.id], ["morning", "evening"]);
  r("Get dressed", "👕", [jake.id], ["morning"]);
  r("Pack backpack", "🎒", [emma.id, jake.id], ["afternoon"]);
  r("Homework", "📚", [emma.id], ["afternoon"], 2);
  r("Read 20 minutes", "📖", [emma.id, jake.id], ["evening"], 2);
  t("Feed the dog", "🐶", [jake.id], 1, { repeat: { type: "daily", interval: 1 } });
  t("Empty dishwasher", "🍽️", [emma.id], 2, { repeat: { type: "weekly", interval: 1, days: [1, 3, 5] }, date: wk });
  t("Take out trash", "🗑️", [dad.id], 0, { repeat: { type: "weekly", interval: 1, days: [2] }, date: wk, dueTime: "19:00" });
  t("Tidy playroom", "🧸", [], 3);
  t("Water plants", "🪴", [], 1);
  t("Call plumber", "🔧", [mom.id], 0);
  t("Clean room", "🧹", [emma.id, jake.id], 3, { repeat: { type: "weekly", interval: 1, days: [6] }, date: wk });

  createReward(ctx, { title: "Pick the movie", description: "", emoji: "🎬", cost: 10, profileIds: [emma.id, jake.id], renew: true });
  createReward(ctx, { title: "Ice cream trip", description: "", emoji: "🍦", cost: 25, profileIds: [emma.id, jake.id], renew: true });
  createReward(ctx, { title: "Stay up 30 min late", description: "", emoji: "🌙", cost: 15, profileIds: [emma.id, jake.id], renew: true });
  createReward(ctx, { title: "New LEGO set", description: "", emoji: "🧱", cost: 100, profileIds: [jake.id], renew: false });
  createReward(ctx, { title: "Sleepover", description: "", emoji: "🏕️", cost: 60, profileIds: [emma.id], renew: false });
  ctx.db.prepare("INSERT INTO star_adjustments (profile_id, delta, reason, at) VALUES (?, ?, ?, ?)").run(emma.id, 18, "Great report card", ctx.now().toISOString());
  ctx.db.prepare("INSERT INTO star_adjustments (profile_id, delta, reason, at) VALUES (?, ?, ?, ?)").run(jake.id, 7, "Helped a neighbor", ctx.now().toISOString());

  const cats = listCategories(ctx);
  const cat = (n: string) => cats.find((c) => c.name === n)!.id;
  const tacos = createRecipe(ctx, {
    title: "Sheet-pan chicken tacos",
    emoji: "🌮",
    categoryId: cat("Dinner"),
    ingredients: ["1.5 lb chicken thighs", "2 bell peppers", "1 onion", "2 tbsp taco seasoning", "8 tortillas", "Salsa", "Shredded cheese"],
    instructions: "1. Heat oven to 425°F.\n2. Slice chicken, peppers and onion; toss with seasoning and oil.\n3. Roast 20 minutes.\n4. Serve in warm tortillas with toppings.",
    sourceUrl: "",
    favorite: true,
  });
  const pancakes = createRecipe(ctx, {
    title: "Banana pancakes",
    emoji: "🥞",
    categoryId: cat("Breakfast"),
    ingredients: ["2 ripe bananas", "2 eggs", "1 cup flour", "1 cup milk", "1 tsp baking powder"],
    instructions: "1. Mash bananas.\n2. Whisk in eggs and milk.\n3. Stir in flour and baking powder.\n4. Cook on a buttered griddle.",
    sourceUrl: "",
    favorite: false,
  });
  const meal = (d: number, c: string, title: string, recipeId: number | null = null) =>
    createMeal(ctx, { date: addDays(wk, d), categoryId: cat(c), title, recipeId });
  meal(0, "Breakfast", "Banana pancakes", pancakes.id);
  meal(1, "Dinner", "Spaghetti & meatballs");
  meal(2, "Dinner", "Sheet-pan chicken tacos", tacos.id);
  meal(3, "Dinner", "Salmon & rice bowls");
  meal(4, "Dinner", "Pizza night 🍕");
  meal(5, "Lunch", "Grilled cheese & tomato soup");
  meal(6, "Dinner", "Slow-cooker chili");
  meal(2, "Lunch", "Turkey wraps");
  meal(4, "Snack", "Apple slices & PB");

  const lists = listLists(ctx);
  const grocery = lists.find((l) => l.kind === "grocery")!;
  addItems(ctx, grocery.id, [
    { text: "Bananas", section: "Produce" },
    { text: "Avocados", section: "Produce" },
    { text: "Spinach", section: "Produce" },
    { text: "Milk", section: "Dairy & Eggs" },
    { text: "Greek yogurt", section: "Dairy & Eggs" },
    { text: "Eggs", section: "Dairy & Eggs" },
    { text: "Sourdough bread", section: "Bakery" },
    { text: "Coffee", section: "Pantry" },
  ]);
  const todos = lists.find((l) => l.kind === "todo")!;
  addItems(ctx, todos.id, [{ text: "Sign field trip form" }, { text: "Book summer camp" }, { text: "Return library books" }, { text: "Schedule car service" }]);
  createList(ctx, { name: "Packing: Beach", color: "#F9CF7A", kind: "other", hideOnDevice: false });
  const packing = listLists(ctx).find((l) => l.name === "Packing: Beach")!;
  addItems(ctx, packing.id, [{ text: "Sunscreen" }, { text: "Swimsuits" }, { text: "Beach towels" }, { text: "Snacks" }]);

  // A couple of things already done today so the screens look lived-in.
  ctx.settings.set("location", { name: "Austin, Texas, US", lat: 30.267, lon: -97.743 });
}

// `npm run seed:demo`
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { openDb } = await import("./db.js");
  const { Bus, SettingsStore } = await import("./context.js");
  const { loadConfig } = await import("./config.js");
  const config = loadConfig();
  const db = openDb(config.dbFile);
  const ctx: Ctx = { db, bus: new Bus(), settings: new SettingsStore(db), config, now: () => new Date() };
  seedDemo(ctx);
  console.log(`Demo data written to ${config.dbFile}`);
  db.close();
}
