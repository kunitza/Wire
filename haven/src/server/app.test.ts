import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { openDb } from "./db.js";
import { Bus, SettingsStore, type Ctx } from "./context.js";
import { buildApp } from "./app.js";
import { ensureDefaults } from "./seed.js";
import { setAiRunner } from "./lib/ai.js";
import { syncCalendar, addCalendar } from "./lib/ics.js";
import fs from "node:fs";
import path from "node:path";
import type { TaskInstance } from "../shared/types.js";

// Tests run with TZ=America/New_York (see package.json).
let now = new Date("2026-10-07T10:00:00-04:00"); // Wednesday morning
let ctx: Ctx;
let app: FastifyInstance;
let cookie = "";

async function call(method: string, url: string, body?: unknown, headers: Record<string, string> = {}) {
  const res = await app.inject({ method: method as "GET", url, payload: body as object, headers: { cookie, ...headers } });
  const set = res.headers["set-cookie"];
  if (set) cookie = String(Array.isArray(set) ? set[0] : set).split(";")[0];
  const json = res.headers["content-type"]?.toString().includes("json") ? res.json() : res.body;
  return { status: res.statusCode, body: json };
}
const ok = async (method: string, url: string, body?: unknown) => {
  const r = await call(method, url, body);
  if (r.status >= 400) throw new Error(`${method} ${url} -> ${r.status} ${JSON.stringify(r.body)}`);
  return r.body;
};

beforeEach(async () => {
  now = new Date("2026-10-07T10:00:00-04:00");
  const db = openDb(":memory:");
  ctx = {
    db,
    bus: new Bus(),
    settings: new SettingsStore(db),
    config: {
      port: 0,
      host: "127.0.0.1",
      dataDir: "/tmp",
      dbFile: ":memory:",
      webDir: "/nonexistent",
      anthropicApiKey: null,
      aiModel: "claude-opus-5-5",
      displayOffCmd: null,
      displayOnCmd: null,
      disableBackground: true,
    },
    now: () => now,
  };
  ensureDefaults(ctx);
  app = await buildApp(ctx);
  cookie = "";
});
afterEach(async () => {
  setAiRunner(null);
  await app.close();
});

async function family() {
  const emma = await ok("POST", "/api/profiles", { name: "Emma", color: "#B07CC6" });
  const jake = await ok("POST", "/api/profiles", { name: "Jake", color: "#3BAF7E" });
  return { emma, jake };
}
const chore = (over: object) => ({
  kind: "chore",
  title: "Chore",
  description: "",
  emoji: "",
  profileIds: [],
  stars: 1,
  repeat: { type: "none" },
  repeatUntil: null,
  date: "2026-10-07",
  dueTime: null,
  parts: [],
  trackHabit: false,
  ...over,
});
const instances = (from: string, to: string) => ok("GET", `/api/tasks/instances?from=${from}&to=${to}`) as Promise<TaskInstance[]>;

describe("bootstrap", () => {
  it("starts with default lists and meal categories", async () => {
    const b = await ok("GET", "/api/bootstrap");
    expect(b.mealCategories.map((c: { name: string }) => c.name)).toEqual(["Breakfast", "Lunch", "Dinner", "Snack"]);
    const l = await ok("GET", "/api/lists");
    expect(l.lists.map((x: { name: string }) => x.name)).toEqual(["Grocery List", "To-Dos"]);
    expect(b.session.canEdit).toBe(true);
  });
});

describe("chores and routines", () => {
  it("awards stars on completion and removes them on undo", async () => {
    const { emma } = await family();
    const t = await ok("POST", "/api/tasks", chore({ title: "Dishes", profileIds: [emma.id], stars: 3 }));
    const [inst] = await instances("2026-10-07", "2026-10-08");
    expect(inst.status).toBe("open");
    await ok("POST", `/api/tasks/${t.id}/complete`, { occurrence: inst.occurrence, slot: emma.id });
    expect((await ok("GET", "/api/profiles"))[0].stars).toBe(3);
    await ok("POST", `/api/tasks/${t.id}/uncomplete`, { occurrence: inst.occurrence, slot: emma.id });
    expect((await ok("GET", "/api/profiles"))[0].stars).toBe(0);
  });

  it("rolls a late one-off chore forward and records it on the day it was checked", async () => {
    const { emma } = await family();
    const t = await ok("POST", "/api/tasks", chore({ title: "Clean room", profileIds: [emma.id], date: "2026-10-05" }));
    let list = await instances("2026-10-04", "2026-10-11");
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ date: "2026-10-07", late: true, occurrence: "2026-10-05" });
    await ok("POST", `/api/tasks/${t.id}/complete`, { occurrence: "2026-10-05", slot: emma.id });
    now = new Date("2026-10-08T10:00:00-04:00");
    list = await instances("2026-10-04", "2026-10-11");
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ date: "2026-10-07", status: "done" });
  });

  it("shows undated chores today until done", async () => {
    const { jake } = await family();
    await ok("POST", "/api/tasks", chore({ title: "Fix bike", profileIds: [jake.id], date: null }));
    expect((await instances("2026-10-07", "2026-10-08"))[0].date).toBe("2026-10-07");
    expect(await instances("2026-10-08", "2026-10-09")).toHaveLength(0);
  });

  it("repeats weekly chores and rolls only the latest missed one", async () => {
    const { jake } = await family();
    await ok("POST", "/api/tasks", chore({ title: "Trash", profileIds: [jake.id], date: "2026-09-01", repeat: { type: "weekly", interval: 1, days: [1] } }));
    const list = await instances("2026-10-05", "2026-10-12");
    // Monday 10/5 was missed -> shown late today (Wed); the next Monday 10/12 is outside the range.
    expect(list.map((i) => [i.date, i.occurrence, i.late])).toEqual([["2026-10-07", "2026-10-05", true]]);
  });

  it("supports repeat-after-completion chores", async () => {
    const { emma } = await family();
    const t = await ok("POST", "/api/tasks", chore({ title: "Change sheets", profileIds: [emma.id], date: "2026-10-07", repeat: { type: "afterCompletion", interval: 2, unit: "week" } }));
    let [i] = await instances("2026-10-07", "2026-10-08");
    await ok("POST", `/api/tasks/${t.id}/complete`, { occurrence: i.occurrence, slot: emma.id });
    const next = (await instances("2026-10-07", "2026-11-01")).filter((x) => x.status === "open");
    expect(next.map((x) => x.date)).toEqual(["2026-10-21"]);
    [i] = await instances("2026-10-07", "2026-10-08");
    expect(i.status).toBe("done");
  });

  it("requires choosing who did an Up For Grabs chore and credits them", async () => {
    const { jake } = await family();
    const t = await ok("POST", "/api/tasks", chore({ title: "Tidy playroom", stars: 4 }));
    const [i] = await instances("2026-10-07", "2026-10-08");
    expect(i.profileId).toBeNull();
    expect((await call("POST", `/api/tasks/${t.id}/complete`, { occurrence: i.occurrence, slot: null })).status).toBe(400);
    await ok("POST", `/api/tasks/${t.id}/complete`, { occurrence: i.occurrence, slot: null, creditTo: jake.id });
    const profiles = await ok("GET", "/api/profiles");
    expect(profiles.find((p: { id: number }) => p.id === jake.id).stars).toBe(4);
    const [after] = await instances("2026-10-07", "2026-10-08");
    expect(after.completedBy).toBe(jake.id);
  });

  it("creates one routine instance per part of day and tracks streaks with skips", async () => {
    const { emma } = await family();
    const t = await ok("POST", "/api/tasks", chore({ kind: "routine", title: "Brush teeth", profileIds: [emma.id], parts: ["morning", "evening"], trackHabit: true, date: "2026-10-01", repeat: { type: "daily", interval: 1 } }));
    const today = await instances("2026-10-07", "2026-10-08");
    expect(today.map((i) => i.part)).toEqual(["morning", "evening"]);
    for (const day of ["2026-10-04", "2026-10-06"])
      for (const part of ["morning", "evening"]) await ok("POST", `/api/tasks/${t.id}/complete`, { occurrence: day, part, slot: emma.id, day });
    for (const part of ["morning", "evening"]) await ok("POST", `/api/tasks/${t.id}/complete`, { occurrence: "2026-10-05", part, slot: emma.id, status: "skipped" });
    const [m] = await instances("2026-10-07", "2026-10-08");
    expect(m.streak).toBe(2); // 4th and 6th, 5th skipped; today unfinished doesn't break it
  });

  it("keeps stars when a chore is deleted", async () => {
    const { emma } = await family();
    const t = await ok("POST", "/api/tasks", chore({ title: "Dishes", profileIds: [emma.id], stars: 5 }));
    await ok("POST", `/api/tasks/${t.id}/complete`, { occurrence: "2026-10-07", slot: emma.id });
    await ok("DELETE", `/api/tasks/${t.id}`);
    expect((await ok("GET", "/api/profiles"))[0].stars).toBe(5);
    expect(await instances("2026-10-07", "2026-10-08")).toHaveLength(0);
  });
});

describe("parental lock", () => {
  it("blocks adding/modifying when locked but still allows check-offs, lists and rewards", async () => {
    const { emma } = await family();
    const t = await ok("POST", "/api/tasks", chore({ title: "Dishes", profileIds: [emma.id], stars: 10 }));
    await ok("POST", "/api/pin", { pin: "1234" });
    await ok("PUT", "/api/settings", { lock: { enabled: true, lockAdd: true, lockModify: true, relockMinutes: 2 } });
    await ok("POST", "/api/session/lock");
    expect((await call("POST", "/api/tasks", chore({ title: "x" }))).status).toBe(423);
    expect((await call("PUT", "/api/settings", { funMode: false })).status).toBe(423);
    // Filters are view preferences and stay usable while locked.
    expect((await call("PUT", "/api/settings", { tasks: { showCompleted: false } })).status).toBe(200);
    expect((await call("PUT", "/api/settings", { calendar: { hiddenProfiles: [emma.id] } })).status).toBe(200);
    expect((await call("PUT", "/api/settings", { calendar: { shadeWeekends: true } })).status).toBe(423);
    await ok("POST", `/api/tasks/${t.id}/complete`, { occurrence: "2026-10-07", slot: emma.id });
    const lists = await ok("GET", "/api/lists");
    await ok("POST", `/api/lists/${lists.lists[0].id}/items`, { text: "Milk" });
    const reward = await (async () => {
      await ok("POST", "/api/session/unlock", { pin: "1234" });
      const r = await ok("POST", "/api/rewards", { title: "Movie", description: "", emoji: "🎬", cost: 5, profileIds: [emma.id], renew: true });
      await ok("POST", "/api/session/lock");
      return r;
    })();
    await ok("POST", `/api/rewards/${reward.id}/redeem`, { profileId: emma.id });
    expect((await ok("GET", "/api/profiles"))[0].stars).toBe(5);
  });

  it("rejects a wrong PIN and re-locks after inactivity", async () => {
    await ok("POST", "/api/pin", { pin: "4321" });
    await ok("PUT", "/api/settings", { lock: { enabled: true, relockMinutes: 2 } });
    await ok("POST", "/api/session/lock");
    expect((await call("POST", "/api/session/unlock", { pin: "0000" })).status).toBe(403);
    expect((await ok("POST", "/api/session/unlock", { pin: "4321" })).canEdit).toBe(true);
    now = new Date(now.getTime() + 3 * 60000);
    expect((await ok("GET", "/api/session")).canEdit).toBe(false);
  });

  it("can only lock adding", async () => {
    await ok("POST", "/api/pin", { pin: "1111" });
    const { emma } = await family();
    await ok("PUT", "/api/settings", { lock: { enabled: true, lockAdd: true, lockModify: false } });
    await ok("POST", "/api/session/lock");
    expect((await call("POST", "/api/profiles", { name: "Zed", color: "#000000" })).status).toBe(423);
    expect((await call("PUT", `/api/profiles/${emma.id}`, { name: "Emmy" })).status).toBe(200);
  });
});

describe("rewards", () => {
  it("only redeems when affordable, and one-time rewards only once", async () => {
    const { emma } = await family();
    const r = await ok("POST", "/api/rewards", { title: "LEGO", description: "", emoji: "🧱", cost: 10, profileIds: [emma.id], renew: false });
    expect((await call("POST", `/api/rewards/${r.id}/redeem`, { profileId: emma.id })).status).toBe(400);
    await ok("POST", "/api/stars", { profileIds: [emma.id], delta: 25 });
    await ok("POST", `/api/rewards/${r.id}/redeem`, { profileId: emma.id });
    expect((await call("POST", `/api/rewards/${r.id}/redeem`, { profileId: emma.id })).status).toBe(400);
    expect((await ok("GET", "/api/rewards"))[0].redeemedBy).toEqual([emma.id]);
    expect((await ok("GET", "/api/profiles"))[0].stars).toBe(15);
    const ledger = await ok("GET", `/api/profiles/${emma.id}/ledger`);
    expect(ledger.map((l: { delta: number }) => l.delta).sort()).toEqual([-10, 25]);
  });

  it("validates the star cost range", async () => {
    const { emma } = await family();
    expect((await call("POST", "/api/rewards", { title: "x", cost: 501, profileIds: [emma.id] })).status).toBe(400);
  });
});

describe("events", () => {
  const base = { allDay: false, profileIds: [] as number[], repeat: { type: "none" } };

  it("requires a profile and expands weekly events with edit scopes", async () => {
    const { emma } = await family();
    expect((await call("POST", "/api/events", { ...base, title: "x", start: "2026-10-07T09:00", end: "2026-10-07T10:00" })).status).toBe(400);
    const e = await ok("POST", "/api/events", {
      ...base,
      title: "Swim",
      start: "2026-10-05T17:00",
      end: "2026-10-05T18:00",
      profileIds: [emma.id],
      repeat: { type: "weekly", interval: 1, days: [1, 3] },
    });
    let list = await ok("GET", "/api/events?from=2026-10-05&to=2026-10-19");
    expect(list.map((x: { start: string }) => x.start)).toEqual(["2026-10-05T17:00", "2026-10-07T17:00", "2026-10-12T17:00", "2026-10-14T17:00"]);
    // Move just Wednesday the 7th.
    await ok("PUT", `/api/events/${e.id}?scope=this&occurrence=2026-10-07`, { ...base, title: "Swim (late)", start: "2026-10-07T18:00", end: "2026-10-07T19:00", profileIds: [emma.id] });
    list = await ok("GET", "/api/events?from=2026-10-05&to=2026-10-19");
    expect(list.map((x: { title: string; start: string }) => `${x.title}@${x.start}`)).toContain("Swim (late)@2026-10-07T18:00");
    expect(list).toHaveLength(4);
    // Change this and following from the 12th.
    await ok("PUT", `/api/events/${e.id}?scope=following&occurrence=2026-10-12`, {
      ...base,
      title: "Swim team",
      start: "2026-10-12T16:00",
      end: "2026-10-12T17:00",
      profileIds: [emma.id],
      repeat: { type: "weekly", interval: 1, days: [1] },
    });
    list = await ok("GET", "/api/events?from=2026-10-05&to=2026-10-27");
    expect(list.map((x: { title: string; start: string }) => `${x.title}@${x.start}`)).toEqual([
      "Swim@2026-10-05T17:00",
      "Swim (late)@2026-10-07T18:00",
      "Swim team@2026-10-12T16:00",
      "Swim team@2026-10-19T16:00",
      "Swim team@2026-10-26T16:00",
    ]);
    // Delete one occurrence.
    const series = list.find((x: { title: string }) => x.title === "Swim team");
    await ok("DELETE", `/api/events/${series.localId}?scope=this&occurrence=2026-10-19`);
    list = await ok("GET", "/api/events?from=2026-10-18&to=2026-10-20");
    expect(list).toHaveLength(0);
  });

  it("shows multi-day all-day events on every day they cover and lists countdowns", async () => {
    const { emma } = await family();
    await ok("POST", "/api/events", { ...base, allDay: true, title: "Emma's birthday", start: "2026-10-20", end: "2026-10-21", profileIds: [emma.id], countdown: true });
    await ok("POST", "/api/events", { ...base, allDay: true, title: "Camp", start: "2026-10-01", end: "2026-10-10", profileIds: [emma.id] });
    expect((await ok("GET", "/api/events?from=2026-10-09&to=2026-10-10")).map((e: { title: string }) => e.title)).toEqual(["Camp"]);
    expect(await ok("GET", "/api/events?from=2026-10-10&to=2026-10-11")).toHaveLength(0);
    const cds = await ok("GET", "/api/countdowns");
    expect(cds[0]).toMatchObject({ title: "Emma's birthday", daysUntil: 13, emoji: "🎂" });
  });
});

describe("demo family", () => {
  it("seeds only an empty household", async () => {
    await ok("POST", "/api/demo");
    expect((await ok("GET", "/api/profiles")).length).toBeGreaterThan(3);
    expect((await call("POST", "/api/demo")).status).toBe(409);
  });
});

describe("voice", () => {
  async function setup() {
    const { emma, jake } = await family();
    const dishes = await ok("POST", "/api/tasks", chore({ title: "Empty dishwasher", profileIds: [emma.id], stars: 2 }));
    await ok("POST", "/api/tasks", chore({ title: "Feed the dog", profileIds: [jake.id], stars: 1 }));
    await ok("POST", "/api/tasks", chore({ title: "Feed the fish", profileIds: [emma.id, jake.id], stars: 1 }));
    await ok("POST", "/api/tasks", chore({ kind: "routine", title: "Make bed", stars: 0, profileIds: [emma.id], parts: ["morning"], repeat: { type: "daily", interval: 1 } }));
    await ok("POST", "/api/tasks", chore({ kind: "routine", title: "Brush teeth", stars: 0, profileIds: [emma.id], parts: ["morning"], repeat: { type: "daily", interval: 1 } }));
    const { token } = await ok("GET", "/api/voice/setup");
    const say = async (text: string) =>
      (await app.inject({ method: "POST", url: "/api/voice/command", payload: { text }, headers: { "x-haven-token": token } })).json();
    return { emma, jake, dishes, say, token };
  }

  it("rejects requests without the token", async () => {
    await setup();
    const r = await app.inject({ method: "POST", url: "/api/voice/command", payload: { text: "hi" } });
    expect(r.statusCode).toBe(401);
  });

  it("checks off chores from natural phrases", async () => {
    const { say } = await setup();
    const r = await say("Emma finished emptying the dishwasher");
    expect(r.ok).toBe(true);
    expect(r.speech).toMatch(/Emma.*Empty dishwasher is done.*2 stars/);
    expect((await say("Jake fed the dog")).ok).toBe(true);
    expect((await say("Hey Google, Jake fed the dog")).ok).toBe(false); // already done
  });

  it("asks who when a shared chore has no name, and handles routines, status, stars and undo", async () => {
    const { say } = await setup();
    expect((await say("the fish was fed")).speech).toMatch(/Who finished Feed the fish/);
    expect((await say("Emma finished her morning routine")).speech).toMatch(/morning routine is done/);
    expect((await say("what does Jake have left")).speech).toMatch(/Jake has 2 things left: Feed the dog, Feed the fish/);
    expect((await say("How many stars does Emma have")).speech).toBe("Emma has 0 stars.");
    await say("Emma emptied the dishwasher");
    expect((await say("How many stars does Emma have")).speech).toBe("Emma has 2 stars.");
    const u = await say("undo Emma dishwasher");
    expect(u.speech).toBe("Okay, Empty dishwasher is marked not done.");
    expect((await say("How many stars does Emma have")).speech).toBe("Emma has 0 stars.");
  });

  it("only adds to lists when allowed", async () => {
    const { say } = await setup();
    expect((await say("add milk and eggs to the grocery list")).ok).toBe(false);
    await ok("PUT", "/api/settings", { voice: { allowListAdd: true } });
    expect((await say("add milk and eggs to the grocery list")).speech).toBe("Added milk and eggs to Grocery List.");
    const lists = await ok("GET", "/api/lists");
    expect(lists.items.map((i: { text: string }) => i.text)).toEqual(["Milk", "Eggs"]);
  });

  it("lets an unlocked browser see the voice setup while Parental Lock is on", async () => {
    await ok("POST", "/api/pin", { pin: "1234" });
    await ok("PUT", "/api/settings", { lock: { enabled: true } });
    expect((await ok("GET", "/api/voice/setup")).token).toBeTruthy();
    await ok("POST", "/api/session/lock");
    expect((await call("GET", "/api/voice/setup")).status).toBe(423);
  });

  it("generates Home Assistant config", async () => {
    await setup();
    const s = await ok("GET", "/api/voice/setup");
    expect(s.homeAssistantYaml).toContain("haven_emma_empty_dishwasher");
    expect(s.homeAssistantYaml).toContain(`X-Haven-Token: "${s.token}"`);
  });
});

describe("lists and meals", () => {
  it("adds, checks and clears list items; sends recipe ingredients to the grocery list", async () => {
    const { lists } = await ok("GET", "/api/lists");
    const g = lists[0];
    const items = await ok("POST", `/api/lists/${g.id}/items`, { items: [{ text: "Milk", section: "Dairy" }, { text: "Bread" }] });
    await ok("PUT", `/api/items/${items[0].id}`, { checked: true });
    expect((await ok("POST", `/api/lists/${g.id}/clear-completed`)).removed).toBe(1);
    const cats = await ok("GET", "/api/meal-categories");
    const r = await ok("POST", "/api/recipes", { title: "Tacos", emoji: "🌮", categoryId: cats[2].id, ingredients: ["Tortillas", "Beans"], instructions: "", sourceUrl: "", favorite: false });
    await ok("POST", `/api/recipes/${r.id}/grocery`);
    const after = await ok("GET", "/api/lists");
    expect(after.items.filter((i: { listId: number }) => i.listId === g.id).map((i: { text: string }) => i.text)).toEqual(["Bread", "Tortillas", "Beans"]);
  });

  it("plans repeating meals and removes a single occurrence", async () => {
    const cats = await ok("GET", "/api/meal-categories");
    const { id } = await ok("POST", "/api/meals", { date: "2026-10-02", categoryId: cats[2].id, title: "Pizza", repeat: { type: "weekly", interval: 1, days: [5] } });
    let meals = await ok("GET", "/api/meals?from=2026-10-01&to=2026-10-31");
    expect(meals.map((m: { date: string }) => m.date)).toEqual(["2026-10-02", "2026-10-09", "2026-10-16", "2026-10-23", "2026-10-30"]);
    await ok("DELETE", `/api/meals/${id}?occurrence=2026-10-16`);
    meals = await ok("GET", "/api/meals?from=2026-10-01&to=2026-10-31");
    expect(meals).toHaveLength(4);
  });
});

describe("Sidekick", () => {
  it("imports events through a draft that is reviewed, applied and undone", async () => {
    const { emma } = await family();
    setAiRunner(async ({ feature }) => {
      expect(feature).toBe("import");
      return {
        summary: "Found 2 school events",
        events: [
          { title: "Picture day", allDay: true, start: "2026-10-15", end: "2026-10-15", location: "", notes: "Wear blue", profileNames: ["Emma"] },
          { title: "Parent conference", allDay: false, start: "2026-10-20T15:00", end: "", location: "Room 4", notes: "", profileNames: [] },
        ],
      };
    });
    const { id } = await ok("POST", "/api/ai/import", { text: "Picture day is Oct 15..." });
    await new Promise((r) => setTimeout(r, 20));
    const [imp] = await ok("GET", "/api/imports");
    expect(imp).toMatchObject({ id, status: "ready", summary: "Found 2 school events" });
    expect(imp.events[0]).toMatchObject({ allDay: true, start: "2026-10-15", end: "2026-10-16", profileIds: [emma.id] });
    expect(imp.events[1]).toMatchObject({ start: "2026-10-20T15:00", end: "2026-10-20T16:00", profileIds: [emma.id] });
    await ok("POST", `/api/imports/${id}/apply`, { events: imp.events });
    expect(await ok("GET", "/api/events?from=2026-10-01&to=2026-11-01")).toHaveLength(2);
    await ok("POST", `/api/imports/${id}/undo`);
    expect(await ok("GET", "/api/events?from=2026-10-01&to=2026-11-01")).toHaveLength(0);
  });

  it("explains when no API key is configured", async () => {
    const r = await call("POST", "/api/ai/recipe", { prompt: "tacos" });
    expect(r.status).toBe(412);
    expect(r.body.error).toMatch(/API key/);
  });
});

describe("calendar sync", () => {
  it("syncs a Google iCal feed into the calendar under the linked profile", async () => {
    const { jake } = await family();
    const id = addCalendar(ctx, { name: "Family", url: "https://calendar.google.com/calendar/ical/x/private-abc/basic.ics", profileIds: [jake.id] });
    const body = fs.readFileSync(path.join(import.meta.dirname, "lib/__fixtures__/google.ics"), "utf8");
    const n = await syncCalendar(ctx, id, async () => body);
    expect(n).toBeGreaterThan(5);
    const list = await ok("GET", "/api/events?from=2026-10-19&to=2026-10-26");
    expect(list[0]).toMatchObject({ title: "Soccer practice", source: "google", profileIds: [jake.id], start: "2026-10-20T16:00" });
    const cals = await ok("GET", "/api/calendars");
    expect(cals[0].url).not.toContain("private-abc");
  });
});
