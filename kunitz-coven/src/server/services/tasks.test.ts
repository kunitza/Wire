import { describe, expect, it } from "vitest";
import { openDb } from "../db.js";
import { Bus, SettingsStore, type Ctx } from "../context.js";
import { createProfile, listProfiles } from "./profiles.js";
import { completeTask, createTask, taskInstances, uncompleteTask } from "./tasks.js";

function ctxAt(iso: string): Ctx {
  const db = openDb(":memory:");
  return {
    db,
    bus: new Bus(),
    settings: new SettingsStore(db),
    config: { port: 0, host: "", dataDir: "/tmp", dbFile: ":memory:", webDir: "", anthropicApiKey: null, aiModel: "claude-opus-5-5", displayOffCmd: null, displayOnCmd: null, disableBackground: true },
    now: () => new Date(iso),
  };
}

describe("repeatable chores", () => {
  it("can be done up to maxPerDay times, earning stars each time, and undone one at a time", () => {
    const ctx = ctxAt("2026-10-07T10:00:00-04:00");
    const emma = createProfile(ctx, { name: "Emma", color: "#B07CC6" });
    const t = createTask(ctx, {
      kind: "chore", title: "Read a book", description: "", emoji: "📖", profileIds: [emma.id], stars: 2,
      repeat: { type: "daily", interval: 1 }, repeatUntil: null, date: "2026-10-01", dueTime: null, parts: [], trackHabit: false, maxPerDay: 3,
    });
    expect(t.maxPerDay).toBe(3);
    const inst = () => taskInstances(ctx, "2026-10-07", "2026-10-08")[0];
    const done = () => completeTask(ctx, { taskId: t.id, occurrence: "2026-10-07", slot: emma.id });
    expect(done().stars).toBe(2);
    expect(inst()).toMatchObject({ status: "open", count: 1 });
    done();
    expect(done().stars).toBe(2);
    expect(inst()).toMatchObject({ status: "done", count: 3 });
    expect(done().alreadyDone).toBe(true); // capped
    expect(listProfiles(ctx)[0].stars).toBe(6);
    uncompleteTask(ctx, t.id, "2026-10-07", null, emma.id);
    expect(inst()).toMatchObject({ status: "open", count: 2 });
    expect(listProfiles(ctx)[0].stars).toBe(4);
  });

  it("routines ignore maxPerDay", () => {
    const ctx = ctxAt("2026-10-07T10:00:00-04:00");
    const emma = createProfile(ctx, { name: "Emma", color: "#B07CC6" });
    const t = createTask(ctx, {
      kind: "routine", title: "Brush teeth", description: "", emoji: "", profileIds: [emma.id], stars: 1,
      repeat: { type: "daily", interval: 1 }, repeatUntil: null, date: "2026-10-01", dueTime: null, parts: ["morning"], trackHabit: false, maxPerDay: 5,
    });
    expect(t.maxPerDay).toBe(1);
  });
});
