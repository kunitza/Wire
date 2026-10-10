import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import cookie from "@fastify/cookie";
import fastifyStatic from "@fastify/static";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { exec } from "node:child_process";
import os from "node:os";
import type { Ctx } from "./context.js";
import * as profiles from "./services/profiles.js";
import * as tasks from "./services/tasks.js";
import * as events from "./services/events.js";
import * as rewards from "./services/rewards.js";
import * as lists from "./services/lists.js";
import * as meals from "./services/meals.js";
import * as settings from "./services/settings.js";
import * as imports from "./services/imports.js";
import * as ics from "./lib/ics.js";
import * as weather from "./lib/weather.js";
import * as ai from "./lib/ai.js";
import * as email from "./lib/email.js";
import { homeAssistantYaml, runVoiceCommand } from "./lib/voice.js";
import * as timers from "./services/timers.js";
import { handleMcpMessage } from "./lib/mcp.js";
import { seedDemo } from "./seed.js";
import { addDays, localDateOf } from "../shared/dates.js";
import type { ChangeTopic, EditScope } from "../shared/types.js";

const COOKIE = "haven_sid";

const VERSION: string = (() => {
  try {
    const here = path.dirname(new URL(import.meta.url).pathname);
    for (const p of [path.join(here, "..", "..", "package.json"), path.join(here, "..", "package.json")])
      if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, "utf8")).version ?? "dev";
  } catch {
    /* ignore */
  }
  return "dev";
})();

/** Non-loopback IPv4 addresses, home network (192.168/10/172) first, then Tailscale (100.x). */
export function lanAddresses(): string[] {
  const out: string[] = [];
  for (const list of Object.values(os.networkInterfaces()))
    for (const a of list ?? []) if (a.family === "IPv4" && !a.internal) out.push(a.address);
  const rank = (ip: string) => (ip.startsWith("192.168.") ? 0 : ip.startsWith("10.") ? 1 : ip.startsWith("172.") ? 2 : ip.startsWith("100.") ? 3 : 4);
  return out.sort((a, b) => rank(a) - rank(b));
}

/**
 * Host names Kunitz Coven answers to: IP addresses, single-label LAN names (localhost, raspberrypi), home/LAN suffixes
 * and Tailscale MagicDNS, plus COVEN_ALLOWED_HOSTS. Anything else is a public domain, which in a browser means
 * a DNS-rebinding page trying to talk to Kunitz Coven as if it were the same site.
 */
export function isLocalHost(host: string | undefined, extra: string[] = []): boolean {
  if (!host) return false;
  const h = host.toLowerCase().trim();
  if (/^\[[0-9a-f:.]+\](:\d+)?$/.test(h)) return true; // IPv6 literal
  const name = h.replace(/:\d+$/, "").replace(/\.$/, "");
  if (!/^[a-z0-9.-]+$/.test(name)) return false;
  if (extra.includes(name)) return true;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(name)) return true;
  if (!name.includes(".")) return true;
  return /\.(local|lan|home|internal|home\.arpa|localdomain|localhost|ts\.net)$/.test(name);
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

const num = (v: unknown, name = "id"): number => {
  const n = Number(v);
  if (!Number.isFinite(n)) throw new HttpError(400, `Invalid ${name}`);
  return n;
};
const date = (v: unknown, name: string): string => {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new HttpError(400, `Invalid ${name}`);
  return v;
};

export async function buildApp(ctx: Ctx) {
  const app = Fastify({ logger: false, bodyLimit: 40 * 1024 * 1024 });
  await app.register(cookie);

  // Kunitz Coven has no accounts, so make sure requests come from Kunitz Coven's own pages: reject unknown Host names
  // (DNS rebinding) and writes started by another website (cross-site request forgery).
  app.addHook("onRequest", async (req, reply) => {
    const extra = ctx.config.allowedHosts ?? [];
    if (req.headers.host !== undefined && !isLocalHost(req.headers.host, extra))
      return reply.status(403).send({ error: "Unknown host name. Add it to COVEN_ALLOWED_HOSTS in /etc/kunitz-coven.env." });
    const origin = req.headers.origin;
    if (origin !== undefined && !SAFE_METHODS.has(req.method)) {
      let host: string | undefined;
      try {
        host = new URL(origin).host;
      } catch {
        /* "null" or garbage */
      }
      if (!isLocalHost(host, extra)) return reply.status(403).send({ error: "Requests from other websites aren't allowed" });
    }
  });

  // Every browser gets a long-lived session id; Parental Lock unlocks are tracked per session.
  app.addHook("onRequest", async (req, reply) => {
    // Voice commands (Siri/Home Assistant) authenticate with a token and need no browser session.
    if (!req.url.startsWith("/api/") || req.url.startsWith("/api/voice/command")) return;
    let sid = req.cookies[COOKIE];
    if (!sid || !settings.sessionExists(ctx, sid)) {
      sid = settings.newSessionToken(ctx);
      reply.setCookie(COOKIE, sid, { path: "/", httpOnly: true, sameSite: "lax", maxAge: 60 * 60 * 24 * 3650 });
    } else if (req.method !== "GET") {
      settings.touchSession(ctx, sid);
    }
    (req as FastifyRequest & { sid: string }).sid = sid;
  });
  const sid = (req: FastifyRequest) => (req as FastifyRequest & { sid?: string }).sid;
  const guard = (action: "add" | "modify" | "admin") => async (req: FastifyRequest) => {
    if (!settings.mayEdit(ctx, sid(req), action)) throw new HttpError(423, "Locked. Enter the parent PIN to make changes.");
  };
  const add = { preHandler: guard("add") };
  const modify = { preHandler: guard("modify") };
  // Parental Lock settings, secrets and backups: always need the PIN while the lock is on, even if it only covers adding.
  const admin = { preHandler: guard("admin") };
  const pinOk = (pin: unknown) => {
    const r = settings.tryPin(ctx, String(pin ?? ""));
    if (r.retryInSeconds) {
      const min = Math.ceil(r.retryInSeconds / 60);
      throw new HttpError(429, `Too many wrong PINs. Try again in ${min} minute${min === 1 ? "" : "s"}.`);
    }
    return r.ok;
  };

  app.setErrorHandler((err: Error & { status?: number; statusCode?: number }, _req, reply) => {
    const status =
      err instanceof HttpError || err instanceof ai.AiError || err instanceof tasks.TaskError
        ? err.status
        : err instanceof events.EventError ||
            err instanceof rewards.RewardError ||
            err instanceof lists.ListError ||
            err instanceof meals.MealError
          ? 400
          : (err.statusCode ?? (err.message && !(err instanceof TypeError) && !(err instanceof ReferenceError) ? 400 : 500));
    if (status >= 500) console.error(err);
    reply.status(status).send({ error: err.message || "Something went wrong" });
  });

  // ---------- Live updates ----------
  app.get("/api/stream", (req, reply) => {
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    reply.raw.write("retry: 3000\n\n");
    const send = (topics: ChangeTopic[]) => reply.raw.write(`data: ${JSON.stringify(topics)}\n\n`);
    const unsub = ctx.bus.subscribe(send);
    const ping = setInterval(() => reply.raw.write(": ping\n\n"), 25000);
    req.raw.on("close", () => {
      clearInterval(ping);
      unsub();
    });
    reply.hijack();
  });

  // ---------- Session / lock ----------
  app.get("/api/session", async (req) => settings.sessionInfo(ctx, sid(req)));
  app.post("/api/session/unlock", async (req) => {
    const { pin, remember } = (req.body ?? {}) as { pin?: string; remember?: boolean };
    if (!pinOk(pin)) throw new HttpError(403, "Incorrect PIN");
    settings.unlockSession(ctx, sid(req)!, !!remember);
    return settings.sessionInfo(ctx, sid(req));
  });
  app.post("/api/session/lock", async (req) => {
    settings.lockSession(ctx, sid(req)!);
    return settings.sessionInfo(ctx, sid(req));
  });
  app.post("/api/pin", async (req) => {
    const { pin, currentPin } = (req.body ?? {}) as { pin?: string; currentPin?: string };
    const hasPin = settings.getSettings(ctx).lock.hasPin;
    // Changing an existing PIN needs a browser unlocked with it (or the current PIN), even while the lock is off.
    if (hasPin && !settings.sessionInfo(ctx, sid(req)).unlockedUntil && !pinOk(currentPin)) throw new HttpError(403, "Enter the current PIN first");
    settings.setPin(ctx, String(pin ?? ""));
    settings.unlockSession(ctx, sid(req)!, false);
    return { ok: true };
  });

  // ---------- Bootstrap & settings ----------
  app.get("/api/bootstrap", async (req) => ({
    settings: settings.getSettings(ctx),
    session: settings.sessionInfo(ctx, sid(req)),
    profiles: profiles.listProfiles(ctx),
    weather: weather.getWeather(ctx),
    mealCategories: meals.listCategories(ctx),
    calendars: ics.listCalendars(ctx),
    serverTime: ctx.now().toISOString(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  }));
  app.get("/api/settings", async () => settings.getSettings(ctx));
  // View preferences (filters, Home layout) can be changed while locked, like Skylight's filters.
  const VIEW_ONLY: Record<string, string[] | true> = {
    tasks: true,
    home: true,
    calendar: ["hiddenProfiles", "showTaskProgress", "showWeather", "showMeals"],
  };
  const viewOnly = (patch: Record<string, unknown>) =>
    Object.keys(patch).length > 0 &&
    Object.entries(patch).every(([k, v]) => {
      const allow = VIEW_ONLY[k];
      if (allow === true) return true;
      if (!allow || !v || typeof v !== "object") return false;
      const cur = settings.getSettings(ctx)[k as "calendar"] as unknown as Record<string, unknown>;
      return Object.entries(v as object).every(([sub, val]) => allow.includes(sub) || JSON.stringify(cur[sub]) === JSON.stringify(val));
    });
  app.put("/api/settings", async (req) => {
    const patch = (req.body ?? {}) as Record<string, unknown>;
    if (!patch || typeof patch !== "object") throw new HttpError(400, "Invalid settings");
    const action = ["lock", "voice", "ai"].some((k) => k in patch) ? "admin" : viewOnly(patch) ? null : "modify";
    if (action && !settings.mayEdit(ctx, sid(req), action)) throw new HttpError(423, "Locked. Enter the parent PIN to make changes.");
    const before = settings.getSettings(ctx);
    settings.updateSettings(ctx, patch);
    const after = settings.getSettings(ctx);
    if (JSON.stringify(before.location) !== JSON.stringify(after.location) || before.temperatureUnit !== after.temperatureUnit)
      weather.refreshWeather(ctx).catch(() => undefined);
    return after;
  });
  app.put("/api/ai/key", admin, async (req) => {
    const { key } = (req.body ?? {}) as { key?: string };
    ctx.settings.set("anthropicApiKey", key?.trim() || null);
    ctx.bus.emit("settings");
    return settings.getSettings(ctx).ai;
  });
  app.get("/api/backup", admin, async (_req, reply) => {
    const file = path.join(ctx.config.dataDir, `backup-${Date.now()}.db`);
    ctx.db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
    const buf = fs.readFileSync(file);
    fs.unlinkSync(file);
    reply.header("Content-Disposition", `attachment; filename="kunitz-coven-backup-${localDateOf(ctx.now())}.db"`);
    return reply.type("application/octet-stream").send(buf);
  });

  // ---------- Profiles & stars ----------
  app.get("/api/profiles", async () => profiles.listProfiles(ctx));
  app.post("/api/profiles", add, async (req) => profiles.createProfile(ctx, req.body as profiles.ProfileInput));
  app.put("/api/profiles/:id", modify, async (req) => {
    const p = profiles.updateProfile(ctx, num((req.params as { id: string }).id), req.body as profiles.ProfileInput);
    if (!p) throw new HttpError(404, "Profile not found");
    return p;
  });
  app.delete("/api/profiles/:id", modify, async (req) => {
    profiles.archiveProfile(ctx, num((req.params as { id: string }).id));
    return { ok: true };
  });
  app.post("/api/profiles/reorder", modify, async (req) => {
    profiles.reorderProfiles(ctx, ((req.body as { ids: number[] }).ids ?? []).map((x) => num(x)));
    return { ok: true };
  });
  app.post("/api/stars", modify, async (req) => {
    const { profileIds, delta, reason } = req.body as { profileIds: number[]; delta: number; reason?: string };
    if (!profileIds?.length || !Number.isFinite(delta) || delta === 0) throw new HttpError(400, "Choose profiles and an amount");
    for (const id of profileIds) profiles.adjustStars(ctx, num(id), delta, reason ?? (delta > 0 ? "Bonus stars" : "Stars removed"));
    return profiles.listProfiles(ctx);
  });
  // First-run "try it with a demo family" (onboarding). Only on an empty household.
  app.post("/api/demo", add, async () => {
    if (profiles.listProfiles(ctx).length) throw new HttpError(409, "Kunitz Coven already has profiles");
    seedDemo(ctx);
    ctx.bus.emit("profiles", "events", "tasks", "rewards", "lists", "meals", "recipes", "settings");
    weather.refreshWeather(ctx).catch(() => undefined);
    return { ok: true };
  });
  app.get("/api/profiles/:id/ledger", async (req) => profiles.starLedger(ctx, num((req.params as { id: string }).id)));

  // ---------- Synced calendars ----------
  app.get("/api/calendars", async () => ics.listCalendars(ctx));
  app.post("/api/calendars", add, async (req) => {
    const id = ics.addCalendar(ctx, req.body as { name: string; url: string; profileIds: number[]; color?: string });
    try {
      await ics.syncCalendar(ctx, id);
    } catch {
      /* error is shown on the calendar */
    }
    return ics.listCalendars(ctx).find((c) => c.id === id);
  });
  app.put("/api/calendars/:id", modify, async (req) => {
    ics.updateCalendar(ctx, num((req.params as { id: string }).id), req.body as Parameters<typeof ics.updateCalendar>[2]);
    return ics.listCalendars(ctx);
  });
  app.delete("/api/calendars/:id", modify, async (req) => {
    ics.removeCalendar(ctx, num((req.params as { id: string }).id));
    return { ok: true };
  });
  app.post("/api/calendars/sync", async () => {
    await ics.syncAll(ctx);
    return ics.listCalendars(ctx);
  });

  // ---------- Events ----------
  app.get("/api/events", async (req) => {
    const q = req.query as { from: string; to: string };
    return events.eventsInRange(ctx, date(q.from, "from"), date(q.to, "to"));
  });
  app.get("/api/events/:id", async (req) => {
    const e = events.getLocalEvent(ctx, num((req.params as { id: string }).id));
    if (!e) throw new HttpError(404, "Event not found");
    return e;
  });
  app.post("/api/events", add, async (req) => events.createLocalEvent(ctx, req.body as events.LocalEventInputT));
  app.put("/api/events/:id", modify, async (req) => {
    const q = req.query as { scope?: EditScope; occurrence?: string };
    const e = events.updateLocalEvent(ctx, num((req.params as { id: string }).id), req.body as events.LocalEventInputT, q.scope, q.occurrence);
    if (!e) throw new HttpError(404, "Event not found");
    return e;
  });
  app.delete("/api/events/:id", modify, async (req) => {
    const q = req.query as { scope?: EditScope; occurrence?: string };
    events.deleteLocalEvent(ctx, num((req.params as { id: string }).id), q.scope, q.occurrence);
    return { ok: true };
  });
  app.get("/api/countdowns", async () => {
    const window = settings.getSettings(ctx).calendar.showCountdowns;
    return events.upcomingCountdowns(ctx, localDateOf(ctx.now()), window === "always" ? null : window === "3months" ? 92 : 31);
  });

  // ---------- Tasks ----------
  app.get("/api/tasks", async () => tasks.listTasks(ctx));
  app.get("/api/tasks/instances", async (req) => {
    const q = req.query as { from: string; to: string };
    return tasks.taskInstances(ctx, date(q.from, "from"), date(q.to, "to"));
  });
  app.post("/api/tasks", add, async (req) => tasks.createTask(ctx, req.body as tasks.TaskInput));
  app.put("/api/tasks/:id", modify, async (req) => {
    const t = tasks.updateTask(ctx, num((req.params as { id: string }).id), req.body as tasks.TaskInput);
    if (!t) throw new HttpError(404, "Task not found");
    return t;
  });
  app.delete("/api/tasks/:id", modify, async (req) => {
    const q = req.query as { scope?: "all" | "future" | "this"; from?: string; slot?: string; day?: string };
    const id = num((req.params as { id: string }).id);
    if (q.scope === "future" && q.from) tasks.endTaskSeries(ctx, id, date(q.from, "from"));
    else if (q.scope === "this" && q.from) {
      // "Delete only this one" skips that occurrence on the day it's shown (`day`, defaulting to the occurrence itself).
      tasks.completeTask(ctx, {
        taskId: id,
        occurrence: date(q.from, "from"),
        slot: q.slot === undefined || q.slot === "up" ? null : num(q.slot),
        status: "skipped",
        day: date(q.day ?? q.from, "day"),
      });
    } else tasks.deleteTask(ctx, id);
    return { ok: true };
  });
  app.post("/api/tasks/reorder", modify, async (req) => {
    tasks.reorderTasks(ctx, ((req.body as { ids: number[] }).ids ?? []).map((x) => num(x)));
    return { ok: true };
  });
  // Checking off, undoing and skipping are always allowed (Parental Lock doesn't cover them).
  app.post("/api/tasks/:id/complete", async (req) => {
    const b = req.body as Omit<tasks.CompleteArgs, "taskId">;
    return tasks.completeTask(ctx, { ...b, taskId: num((req.params as { id: string }).id) });
  });
  app.post("/api/tasks/:id/uncomplete", async (req) => {
    const b = req.body as { occurrence: string; part?: string | null; slot: number | null };
    return { ok: tasks.uncompleteTask(ctx, num((req.params as { id: string }).id), b.occurrence, (b.part ?? null) as never, b.slot) };
  });

  // ---------- Rewards ----------
  app.get("/api/rewards", async () => rewards.listRewards(ctx));
  app.post("/api/rewards", add, async (req) => rewards.createReward(ctx, req.body as rewards.RewardInput));
  app.put("/api/rewards/:id", modify, async (req) => rewards.updateReward(ctx, num((req.params as { id: string }).id), req.body as rewards.RewardInput));
  app.delete("/api/rewards/:id", modify, async (req) => {
    rewards.deleteReward(ctx, num((req.params as { id: string }).id));
    return { ok: true };
  });
  app.post("/api/rewards/:id/redeem", async (req) =>
    rewards.redeemReward(ctx, num((req.params as { id: string }).id), num((req.body as { profileId: number }).profileId, "profile")),
  );
  app.get("/api/redemptions", async () => rewards.listRedemptions(ctx));
  app.post("/api/redemptions/:id", modify, async (req) => {
    const status = (req.body as { status: string }).status;
    if (status !== "approved" && status !== "declined") throw new HttpError(400, "Invalid status");
    rewards.setRedemptionStatus(ctx, num((req.params as { id: string }).id), status);
    return { ok: true };
  });

  // ---------- Lists (not covered by Parental Lock, like Skylight) ----------
  app.get("/api/lists", async () => ({ lists: lists.listLists(ctx), items: lists.listItems(ctx) }));
  app.post("/api/lists", add, async (req) => lists.createList(ctx, req.body as lists.ListInput));
  app.put("/api/lists/:id", modify, async (req) => {
    lists.updateList(ctx, num((req.params as { id: string }).id), req.body as lists.ListInput);
    return { ok: true };
  });
  app.delete("/api/lists/:id", modify, async (req) => {
    lists.deleteList(ctx, num((req.params as { id: string }).id));
    return { ok: true };
  });
  app.post("/api/lists/reorder", async (req) => {
    lists.reorderLists(ctx, ((req.body as { ids: number[] }).ids ?? []).map((x) => num(x)));
    return { ok: true };
  });
  app.post("/api/lists/:id/items", async (req) => {
    const b = req.body as { items?: { text: string; section?: string }[]; text?: string; section?: string };
    return lists.addItems(ctx, num((req.params as { id: string }).id), b.items ?? [{ text: b.text ?? "", section: b.section }]);
  });
  app.put("/api/items/:id", async (req) => {
    lists.updateItem(ctx, num((req.params as { id: string }).id), req.body as Parameters<typeof lists.updateItem>[2]);
    return { ok: true };
  });
  app.post("/api/items/delete", async (req) => {
    lists.deleteItems(ctx, ((req.body as { ids: number[] }).ids ?? []).map((x) => num(x)));
    return { ok: true };
  });
  app.post("/api/items/reorder", async (req) => {
    lists.reorderItems(ctx, ((req.body as { ids: number[] }).ids ?? []).map((x) => num(x)));
    return { ok: true };
  });
  app.post("/api/lists/:id/clear-completed", async (req) => ({ removed: lists.clearCompleted(ctx, num((req.params as { id: string }).id)) }));
  app.post("/api/lists/:id/sections/rename", async (req) => {
    const b = req.body as { from: string; to: string };
    lists.renameSection(ctx, num((req.params as { id: string }).id), b.from ?? "", b.to ?? "");
    return { ok: true };
  });
  app.post("/api/lists/:id/organize", async (req) => {
    const listId = num((req.params as { id: string }).id);
    const items = lists.listItems(ctx, listId).filter((i) => !i.checked);
    if (!items.length) return { ok: true };
    const out = await ai.organizeList(ctx, items.map((i) => ({ id: i.id, text: i.text })));
    const dupes: number[] = [];
    for (const r of out.items) {
      if (!items.some((i) => i.id === r.id)) continue;
      if (r.duplicateOf !== null && items.some((i) => i.id === r.duplicateOf)) dupes.push(r.id);
      else lists.updateItem(ctx, r.id, { section: r.section });
    }
    if (dupes.length) lists.deleteItems(ctx, dupes);
    return { ok: true, removed: dupes.length };
  });

  // ---------- Meals & recipes ----------
  app.get("/api/meal-categories", async () => meals.listCategories(ctx));
  app.put("/api/meal-categories/:id", modify, async (req) => {
    meals.updateCategory(ctx, num((req.params as { id: string }).id), req.body as Parameters<typeof meals.updateCategory>[2]);
    return meals.listCategories(ctx);
  });
  app.get("/api/meals", async (req) => {
    const q = req.query as { from: string; to: string };
    return meals.mealsInRange(ctx, date(q.from, "from"), date(q.to, "to"));
  });
  app.post("/api/meals", add, async (req) => ({ id: meals.createMeal(ctx, req.body as meals.MealInput) }));
  app.put("/api/meals/:id", modify, async (req) => {
    meals.updateMeal(ctx, num((req.params as { id: string }).id), req.body as meals.MealInput);
    return { ok: true };
  });
  app.delete("/api/meals/:id", modify, async (req) => {
    meals.deleteMeal(ctx, num((req.params as { id: string }).id), (req.query as { occurrence?: string }).occurrence);
    return { ok: true };
  });
  app.get("/api/recipes", async () => meals.listRecipes(ctx));
  app.post("/api/recipes", add, async (req) => meals.createRecipe(ctx, req.body as meals.RecipeInput));
  app.put("/api/recipes/:id", modify, async (req) => meals.updateRecipe(ctx, num((req.params as { id: string }).id), req.body as meals.RecipeInput));
  app.delete("/api/recipes/:id", modify, async (req) => {
    meals.deleteRecipe(ctx, num((req.params as { id: string }).id), (req.query as { withMeals?: string }).withMeals === "1");
    return { ok: true };
  });
  app.post("/api/recipes/:id/grocery", async (req) => ({
    listId: meals.recipeToGrocery(ctx, num((req.params as { id: string }).id), (req.body as { items?: string[] } | undefined)?.items),
  }));

  // ---------- Sidekick (AI) ----------
  app.get("/api/imports", async () => imports.listImports(ctx));
  app.post("/api/ai/import", add, async (req) => {
    const b = req.body as { text?: string; files?: ai.Attachment[]; profileIds?: number[]; label?: string };
    const { id } = imports.startImport(ctx, {
      source: b.files?.length ? "file" : "text",
      label: b.label || b.files?.[0]?.name || (b.text ?? "").slice(0, 60) || "Import",
      text: b.text,
      files: b.files,
      profileIds: (b.profileIds ?? []).map((x) => num(x)),
    });
    return { id };
  });
  app.post("/api/imports/:id/apply", add, async (req) => ({
    created: imports.applyImport(ctx, num((req.params as { id: string }).id), (req.body as { events: Parameters<typeof imports.applyImport>[2] }).events),
  }));
  app.post("/api/imports/:id/dismiss", async (req) => {
    imports.dismissImport(ctx, num((req.params as { id: string }).id));
    return { ok: true };
  });
  app.post("/api/imports/:id/undo", modify, async (req) => {
    imports.undoImport(ctx, num((req.params as { id: string }).id));
    return { ok: true };
  });
  app.post("/api/ai/recipe", add, async (req) => {
    const b = req.body as { prompt?: string; category?: string; servings?: number; photos?: ai.Attachment[]; url?: string };
    return ai.generateRecipe(ctx, { prompt: b.prompt ?? "", category: b.category ?? "Dinner", servings: b.servings ?? 4, photos: b.photos, url: b.url });
  });
  app.post("/api/ai/meal-plan", add, async (req) => {
    const b = req.body as { categoryId: number; prompt?: string; dates: string[]; servings?: number; mode?: "existing" | "new" | "both" };
    const cat = meals.listCategories(ctx).find((c) => c.id === num(b.categoryId, "category"));
    if (!cat) throw new HttpError(400, "Choose a meal type");
    return ai.planMeals(ctx, {
      category: cat.name,
      prompt: b.prompt ?? "",
      dates: (b.dates ?? []).map((d) => date(d, "date")),
      servings: b.servings ?? 4,
      mode: b.mode ?? "both",
      recipes: meals.listRecipes(ctx).map((r) => ({ id: r.id, title: r.title })),
    });
  });
  app.post("/api/ai/list", add, async (req) => {
    const b = req.body as { prompt?: string; files?: ai.Attachment[]; grocery?: boolean };
    return ai.buildList(ctx, { prompt: b.prompt ?? "", files: b.files, grocery: !!b.grocery });
  });
  app.post("/api/ai/activities", add, async (req) => ai.planActivities(ctx, req.body as Parameters<typeof ai.planActivities>[1]));

  // ---------- Weather ----------
  app.get("/api/weather", async () => weather.getWeather(ctx));
  app.post("/api/weather/refresh", async () => weather.refreshWeather(ctx));
  app.get("/api/geocode", async (req) => weather.geocode(String((req.query as { q?: string }).q ?? "")));

  // ---------- Email import ----------
  app.get("/api/email-config", admin, async () => {
    const c = email.getEmailConfig(ctx);
    return c ? { ...c, password: c.password ? "••••••••" : "" } : null;
  });
  app.put("/api/email-config", admin, async (req) => {
    const b = req.body as Partial<email.EmailConfig> | null;
    if (b && b.password === "••••••••") delete b.password;
    email.setEmailConfig(ctx, b);
    return { ok: true };
  });
  app.post("/api/email/check", admin, async () => ({ imported: await email.checkEmail(ctx), settings: settings.getSettings(ctx).email }));

  // ---------- Voice (Siri Shortcuts / Google Home via Home Assistant) ----------
  const voiceAuth = (req: FastifyRequest) => {
    const v = settings.getSettings(ctx).voice;
    if (!v.enabled) throw new HttpError(403, "Voice control is turned off");
    const token = (req.headers["x-coven-token"] as string | undefined) ?? (req.query as { token?: string }).token;
    const expected = settings.voiceToken(ctx);
    const same = (a: string, b: string) => {
      const x = crypto.createHash("sha256").update(a).digest();
      return crypto.timingSafeEqual(x, crypto.createHash("sha256").update(b).digest());
    };
    if (!expected || typeof token !== "string" || !same(token, expected)) throw new HttpError(401, "Bad voice token");
    return v;
  };
  const speak = (reply: FastifyReply, req: FastifyRequest, r: { ok: boolean; speech: string }) =>
    (req.query as { format?: string }).format === "text" ? reply.type("text/plain").send(r.speech) : r;
  app.post("/api/voice/command", async (req, reply) => {
    const v = voiceAuth(req);
    const b = (req.body ?? {}) as { text?: string };
    const text = b.text ?? (req.query as { text?: string }).text ?? "";
    return speak(reply, req, runVoiceCommand(ctx, String(text), { allowListAdd: v.allowListAdd }));
  });
  app.get("/api/voice/command", async (req, reply) => {
    const v = voiceAuth(req);
    return speak(reply, req, runVoiceCommand(ctx, String((req.query as { text?: string }).text ?? ""), { allowListAdd: v.allowListAdd }));
  });
  app.post("/api/voice/token", admin, async () => ({ token: settings.setVoiceToken(ctx) }));
  app.get("/api/voice/setup", admin, async (req) => {
    let token = settings.voiceToken(ctx);
    if (!token) token = settings.setVoiceToken(ctx);
    // On the wall display the page is opened as localhost; phones/Home Assistant need the LAN address.
    let host = req.headers.host ?? `localhost:${ctx.config.port}`;
    if (/^(localhost|127\.|\[::1\])/.test(host) && lanAddresses()[0]) host = `${lanAddresses()[0]}:${ctx.config.port}`;
    const base = `http://${host}`;
    return { token, commandUrl: `${base}/api/voice/command`, homeAssistantYaml: homeAssistantYaml(ctx, base, token) };
  });

  // ---------- Kitchen timers (kid-safe: not covered by Parental Lock) ----------
  app.get("/api/timers", async () => timers.listTimers(ctx));
  app.post("/api/timers", async (req) => {
    const b = (req.body ?? {}) as { seconds?: number; label?: string };
    return timers.createTimer(ctx, Number(b.seconds), typeof b.label === "string" ? b.label : undefined);
  });
  app.post("/api/timers/:id/pause", async (req) => timers.pauseTimer(ctx, num((req.params as { id: string }).id)));
  app.post("/api/timers/:id/resume", async (req) => timers.resumeTimer(ctx, num((req.params as { id: string }).id)));
  app.post("/api/timers/:id/add", async (req) =>
    timers.addTime(ctx, num((req.params as { id: string }).id), Number((req.body as { seconds?: number } | undefined)?.seconds ?? 60)),
  );
  app.delete("/api/timers/:id", async (req) => {
    timers.dismissTimer(ctx, num((req.params as { id: string }).id));
    return { ok: true };
  });

  // ---------- Claude connector (Model Context Protocol over HTTP) ----------
  const tokenMatches = (given: unknown, expected: string | null) => {
    if (!expected || typeof given !== "string") return false;
    const h = (v: string) => crypto.createHash("sha256").update(v).digest();
    return crypto.timingSafeEqual(h(given), h(expected));
  };
  app.post("/mcp", async (req, reply) => {
    const auth = String(req.headers.authorization ?? "");
    const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : undefined;
    if (!tokenMatches(token, ctx.settings.get<string | null>("mcpToken", null))) {
      reply.header("WWW-Authenticate", 'Bearer realm="kunitz-coven"');
      return reply.status(401).send({ jsonrpc: "2.0", id: null, error: { code: -32001, message: "Missing or wrong Kunitz Coven connector token" } });
    }
    const body = req.body as unknown;
    const msgs = Array.isArray(body) ? body : [body];
    if (!msgs.length || msgs.some((m) => !m || typeof m !== "object" || typeof (m as { method?: unknown }).method !== "string"))
      return reply.status(400).send({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Invalid request" } });
    const out = msgs.map((m) => handleMcpMessage(ctx, m as Parameters<typeof handleMcpMessage>[1], VERSION)).filter((r) => r !== null);
    if (!out.length) return reply.status(202).send();
    return reply.type("application/json").send(Array.isArray(body) ? out : out[0]);
  });
  app.get("/mcp", async (_req, reply) => reply.status(405).header("Allow", "POST").send({ error: "Use POST (Streamable HTTP, JSON responses)" }));
  app.get("/api/connector", admin, async (req) => {
    const token = ctx.settings.get<string | null>("mcpToken", null);
    let host = req.headers.host ?? `localhost:${ctx.config.port}`;
    if (/^(localhost|127\.|\[::1\])/.test(host) && lanAddresses()[0]) host = `${lanAddresses()[0]}:${ctx.config.port}`;
    return { enabled: !!token, token, url: `http://${host}/mcp` };
  });
  app.post("/api/connector", admin, async (req) => {
    const on = (req.body as { enabled?: boolean } | undefined)?.enabled !== false;
    if (on) ctx.settings.set("mcpToken", crypto.randomBytes(24).toString("base64url"));
    else ctx.settings.delete("mcpToken");
    ctx.bus.emit("settings");
    return { ok: true };
  });

  // ---------- Display power (sleep mode on the Pi) ----------
  app.post("/api/display", async (req) => {
    const on = !!(req.body as { on?: boolean })?.on;
    const cmd = on ? ctx.config.displayOnCmd : ctx.config.displayOffCmd;
    if (cmd) exec(cmd, (err) => err && console.error(`display command failed: ${err.message}`));
    return { ok: true, ran: !!cmd };
  });

  // ---------- About (version + this Pi's addresses for phones) ----------
  app.get("/api/about", async () => ({ version: VERSION, port: ctx.config.port, addresses: lanAddresses() }));

  // ---------- Health ----------
  app.get("/api/health", async () => ({ ok: true, time: ctx.now().toISOString() }));

  // ---------- Web app ----------
  if (fs.existsSync(ctx.config.webDir)) {
    await app.register(fastifyStatic, { root: ctx.config.webDir, wildcard: false });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith("/api/")) return reply.status(404).send({ error: "Not found" });
      return reply.type("text/html").send(fs.readFileSync(path.join(ctx.config.webDir, "index.html")));
    });
  }

  return app;
}

export function startBackgroundJobs(ctx: Ctx) {
  const every = (ms: number, fn: () => Promise<unknown>) => {
    const run = () => fn().catch((e) => console.error(e?.message ?? e));
    setTimeout(run, 2000);
    return setInterval(run, ms);
  };
  every(10 * 60 * 1000, () => ics.syncAll(ctx));
  every(30 * 60 * 1000, () => weather.refreshWeather(ctx));
  every(2 * 60 * 1000, () => email.checkEmail(ctx));
  // Daily: back up the database (keep 14) and clean out old dismissed imports.
  every(24 * 60 * 60 * 1000, async () => {
    backupDatabase(ctx);
    const cutoff = addDays(localDateOf(ctx.now()), -90);
    ctx.db.prepare("DELETE FROM imports WHERE created_at < ? AND status IN ('dismissed','undone','failed')").run(cutoff);
    // Browsers that never unlocked (or whose unlock ran out) hold no state; don't let them pile up forever.
    ctx.db
      .prepare("DELETE FROM sessions WHERE created_at < ? AND (unlocked_until IS NULL OR unlocked_until < ?)")
      .run(addDays(localDateOf(ctx.now()), -30), ctx.now().toISOString());
  });
}

/** Write data/backups/coven-YYYY-MM-DD.db and prune old copies. */
export function backupDatabase(ctx: Ctx, keep = 14): string | null {
  if (ctx.config.dbFile === ":memory:") return null;
  const dir = path.join(ctx.config.dataDir, "backups");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `coven-${localDateOf(ctx.now())}.db`);
  if (fs.existsSync(file)) fs.unlinkSync(file);
  ctx.db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
  const all = fs.readdirSync(dir).filter((f) => /^coven-\d{4}-\d{2}-\d{2}\.db$/.test(f)).sort();
  for (const old of all.slice(0, Math.max(0, all.length - keep))) fs.unlinkSync(path.join(dir, old));
  return file;
}
