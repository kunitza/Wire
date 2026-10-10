import type { Ctx } from "../context.js";
import { eventsInRange, createLocalEvent } from "../services/events.js";
import { taskInstances, createTask } from "../services/tasks.js";
import { listProfiles } from "../services/profiles.js";
import { listLists, listItems, addItems, findListByName, updateItem } from "../services/lists.js";
import { listCategories, mealsInRange, createMeal } from "../services/meals.js";
import { listRewards } from "../services/rewards.js";
import { createTimer, formatDuration, listTimers } from "../services/timers.js";
import { getWeather } from "./weather.js";
import { runVoiceCommand } from "./voice.js";
import { addDays, localDateOf } from "../../shared/dates.js";
import type { Profile } from "../../shared/types.js";

// "Ask Claude about your household": a Model Context Protocol server (Streamable HTTP transport,
// JSON responses) so Claude Code / Claude Desktop can read and update Haven. Auth is a bearer token
// a parent copies from Settings; the tools are deliberately limited to everyday household actions.

const PROTOCOLS = ["2025-06-18", "2025-03-26", "2024-11-05"];

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

type ToolResult = { content: { type: "text"; text: string }[]; isError?: boolean; structuredContent?: unknown };

class ToolError extends Error {}

const str = { type: "string" } as const;
const DATE = { type: "string", description: "YYYY-MM-DD (household local date)" } as const;

interface Tool {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  readOnly: boolean;
  run: (ctx: Ctx, args: Record<string, unknown>) => unknown;
}

function people(ctx: Ctx, names: unknown, { required = false } = {}): number[] {
  const list = Array.isArray(names) ? names.map(String) : typeof names === "string" && names ? [names] : [];
  const all = listProfiles(ctx);
  const ids: number[] = [];
  for (const n of list) {
    const p = all.find((x) => x.name.toLowerCase() === n.toLowerCase().trim());
    if (!p) throw new ToolError(`No profile named "${n}". Profiles: ${all.map((x) => x.name).join(", ")}`);
    ids.push(p.id);
  }
  if (required && !ids.length) throw new ToolError(`Say who it's for. Profiles: ${all.map((x) => x.name).join(", ")}`);
  return ids;
}

const names = (ctx: Ctx, ids: number[]) => {
  const all = new Map(listProfiles(ctx).map((p) => [p.id, p.name]));
  return ids.map((id) => all.get(id) ?? "?");
};

function range(ctx: Ctx, args: Record<string, unknown>, maxDays = 31) {
  const from = typeof args.from === "string" && /^\d{4}-\d{2}-\d{2}$/.test(args.from) ? args.from : localDateOf(ctx.now());
  const days = Math.max(1, Math.min(maxDays, Math.round(Number(args.days ?? 1)) || 1));
  return { from, to: addDays(from, days) };
}

const TOOLS: Tool[] = [
  {
    name: "get_family",
    title: "Family members",
    description: "List the family's profiles (people and labels) with their colors and star balances.",
    inputSchema: { type: "object", properties: {} },
    readOnly: true,
    run: (ctx) => listProfiles(ctx).map((p: Profile) => ({ name: p.name, kind: p.kind, stars: p.stars, birthday: p.birthday })),
  },
  {
    name: "get_schedule",
    title: "Calendar",
    description: "Get calendar events (Haven + synced Google calendars) and planned meals for a date range.",
    inputSchema: { type: "object", properties: { from: DATE, days: { type: "integer", description: "Number of days (1-31), default 1" } } },
    readOnly: true,
    run: (ctx, a) => {
      const { from, to } = range(ctx, a);
      const cats = new Map(listCategories(ctx).map((c) => [c.id, c.name]));
      return {
        from,
        to: addDays(to, -1),
        events: eventsInRange(ctx, from, to).map((e) => ({
          title: e.title,
          allDay: e.allDay,
          start: e.start,
          end: e.end,
          who: names(ctx, e.profileIds),
          location: e.location,
          notes: e.notes,
          source: e.source,
        })),
        meals: mealsInRange(ctx, from, to).map((m) => ({ date: m.date, meal: cats.get(m.categoryId), title: m.title })),
      };
    },
  },
  {
    name: "create_event",
    title: "Add event",
    description: "Add an event to the Haven calendar. Times are household local time.",
    inputSchema: {
      type: "object",
      required: ["title", "start", "who"],
      properties: {
        title: str,
        start: { type: "string", description: "YYYY-MM-DDTHH:MM for timed events, YYYY-MM-DD for all-day" },
        end: { type: "string", description: "Optional. Exclusive end; same format as start. Default 1 hour / 1 day." },
        who: { type: "array", items: str, description: "Profile names" },
        location: str,
        notes: str,
      },
    },
    readOnly: false,
    run: (ctx, a) => {
      const start = String(a.start ?? "");
      const allDay = /^\d{4}-\d{2}-\d{2}$/.test(start);
      let end = typeof a.end === "string" ? a.end : "";
      if (!end) end = allDay ? addDays(start, 1) : new Date(new Date(start + ":00Z").getTime() + 3600000).toISOString().slice(0, 16);
      const e = createLocalEvent(ctx, {
        title: String(a.title ?? ""),
        allDay,
        start: allDay ? start : start.slice(0, 16),
        end: allDay ? end.slice(0, 10) : end.slice(0, 16),
        profileIds: people(ctx, a.who, { required: true }),
        location: a.location ? String(a.location) : undefined,
        notes: a.notes ? String(a.notes) : undefined,
        repeat: { type: "none" },
      });
      return { added: e.title, start: e.start, end: e.end };
    },
  },
  {
    name: "get_tasks",
    title: "Chores & routines",
    description: "Chores and routines for a day, with who they're for and whether they're done.",
    inputSchema: { type: "object", properties: { date: DATE, person: { type: "string", description: "Optional profile name" } } },
    readOnly: true,
    run: (ctx, a) => {
      const date = typeof a.date === "string" ? a.date : localDateOf(ctx.now());
      const only = a.person ? people(ctx, a.person)[0] : undefined;
      return taskInstances(ctx, date, addDays(date, 1))
        .filter((i) => i.date === date && (only === undefined || i.profileId === only || i.profileId === null))
        .map((i) => ({
          task: i.task.title,
          kind: i.task.kind,
          partOfDay: i.part,
          for: i.profileId === null ? "Up For Grabs" : names(ctx, [i.profileId])[0],
          status: i.status,
          late: i.late,
          stars: i.task.stars,
        }));
    },
  },
  {
    name: "complete_task",
    title: "Check off a chore",
    description: "Mark today's chore or routine as done for someone (awards their stars), e.g. person 'Emma', task 'dishes'.",
    inputSchema: { type: "object", required: ["person", "task"], properties: { person: str, task: str } },
    readOnly: false,
    run: (ctx, a) => {
      const r = runVoiceCommand(ctx, `${String(a.person)} finished ${String(a.task)}`, { allowListAdd: false });
      if (!r.ok) throw new ToolError(r.speech);
      return r.speech;
    },
  },
  {
    name: "add_chore",
    title: "Add chore",
    description: "Create a chore. Leave 'who' empty for Up For Grabs.",
    inputSchema: {
      type: "object",
      required: ["title"],
      properties: {
        title: str,
        who: { type: "array", items: str },
        stars: { type: "integer" },
        date: DATE,
        repeat: { type: "string", enum: ["none", "daily", "weekly"], description: "weekly repeats on the date's weekday" },
      },
    },
    readOnly: false,
    run: (ctx, a) => {
      const date = typeof a.date === "string" ? a.date : localDateOf(ctx.now());
      const rep = a.repeat === "daily" ? { type: "daily" as const, interval: 1 } : a.repeat === "weekly" ? { type: "weekly" as const, interval: 1, days: [new Date(date + "T12:00:00Z").getUTCDay()] } : { type: "none" as const };
      const t = createTask(ctx, {
        kind: "chore",
        title: String(a.title ?? ""),
        description: "",
        emoji: "",
        profileIds: people(ctx, a.who),
        stars: Number(a.stars ?? 0),
        repeat: rep,
        repeatUntil: null,
        date,
        dueTime: null,
        parts: [],
        trackHabit: false,
        maxPerDay: 1,
      });
      return { added: t.title, for: t.profileIds.length ? names(ctx, t.profileIds) : "Up For Grabs" };
    },
  },
  {
    name: "get_lists",
    title: "Lists",
    description: "All lists (grocery, to-dos, etc.) with their unchecked items.",
    inputSchema: { type: "object", properties: { includeChecked: { type: "boolean" } } },
    readOnly: true,
    run: (ctx, a) => {
      const items = listItems(ctx);
      return listLists(ctx).map((l) => ({
        list: l.name,
        type: l.kind,
        items: items.filter((i) => i.listId === l.id && (a.includeChecked || !i.checked)).map((i) => ({ text: i.text, section: i.section || undefined, checked: i.checked })),
      }));
    },
  },
  {
    name: "add_to_list",
    title: "Add to list",
    description: "Add items to a list by name (e.g. 'Grocery List', 'To-Dos').",
    inputSchema: { type: "object", required: ["list", "items"], properties: { list: str, items: { type: "array", items: str } } },
    readOnly: false,
    run: (ctx, a) => {
      const l = findListByName(ctx, String(a.list ?? ""));
      if (!l) throw new ToolError(`No list called "${a.list}". Lists: ${listLists(ctx).map((x) => x.name).join(", ")}`);
      const added = addItems(ctx, l.id, (Array.isArray(a.items) ? a.items : [a.items]).map((t) => ({ text: String(t) })));
      return { list: l.name, added: added.map((i) => i.text) };
    },
  },
  {
    name: "check_list_item",
    title: "Check off list item",
    description: "Check off (or uncheck) an item on a list.",
    inputSchema: { type: "object", required: ["list", "item"], properties: { list: str, item: str, checked: { type: "boolean" } } },
    readOnly: false,
    run: (ctx, a) => {
      const l = findListByName(ctx, String(a.list ?? ""));
      if (!l) throw new ToolError(`No list called "${a.list}"`);
      const want = String(a.item ?? "").toLowerCase();
      const item = listItems(ctx, l.id).find((i) => i.text.toLowerCase() === want) ?? listItems(ctx, l.id).find((i) => i.text.toLowerCase().includes(want));
      if (!item) throw new ToolError(`"${a.item}" isn't on ${l.name}`);
      updateItem(ctx, item.id, { checked: a.checked !== false });
      return { list: l.name, item: item.text, checked: a.checked !== false };
    },
  },
  {
    name: "plan_meal",
    title: "Plan a meal",
    description: "Put a meal on the meal plan, e.g. date 2026-10-12, meal 'Dinner', title 'Tacos'.",
    inputSchema: { type: "object", required: ["date", "meal", "title"], properties: { date: DATE, meal: { type: "string", description: "Meal category, e.g. Breakfast, Lunch, Dinner, Snack" }, title: str } },
    readOnly: false,
    run: (ctx, a) => {
      const cats = listCategories(ctx);
      const cat = cats.find((c) => c.name.toLowerCase() === String(a.meal ?? "").toLowerCase());
      if (!cat) throw new ToolError(`Meal must be one of: ${cats.map((c) => c.name).join(", ")}`);
      createMeal(ctx, { date: String(a.date), categoryId: cat.id, title: String(a.title ?? "") });
      return { planned: a.title, date: a.date, meal: cat.name };
    },
  },
  {
    name: "get_rewards",
    title: "Stars & rewards",
    description: "Each person's star balance and how close they are to each reward.",
    inputSchema: { type: "object", properties: {} },
    readOnly: true,
    run: (ctx) => {
      const rewards = listRewards(ctx);
      return listProfiles(ctx)
        .filter((p) => p.kind === "profile")
        .map((p) => ({
          name: p.name,
          stars: p.stars,
          rewards: rewards
            .filter((r) => r.profileIds.includes(p.id) && !r.redeemedBy.includes(p.id))
            .map((r) => ({ reward: r.title, cost: r.cost, starsNeeded: Math.max(0, r.cost - p.stars) })),
        }));
    },
  },
  {
    name: "get_weather",
    title: "Weather",
    description: "Current weather and the daily forecast for the household's location.",
    inputSchema: { type: "object", properties: {} },
    readOnly: true,
    run: (ctx) => {
      const w = getWeather(ctx);
      if (!w.updatedAt) throw new ToolError("Weather isn't set up yet (add a location in Haven Settings).");
      return { units: w.units, current: w.current, daily: w.daily.slice(0, 10) };
    },
  },
  {
    name: "set_timer",
    title: "Start a timer",
    description: "Start a kitchen timer that rings on the wall display.",
    inputSchema: { type: "object", required: ["minutes"], properties: { minutes: { type: "number" }, label: str } },
    readOnly: false,
    run: (ctx, a) => {
      const t = createTimer(ctx, Number(a.minutes) * 60, a.label ? String(a.label) : undefined);
      return `${t.label} set for ${formatDuration(t.durationSec)}.`;
    },
  },
  {
    name: "list_timers",
    title: "Timers",
    description: "Running kitchen timers and the time left on each.",
    inputSchema: { type: "object", properties: {} },
    readOnly: true,
    run: (ctx) => listTimers(ctx).map((t) => ({ label: t.label, remaining: formatDuration(t.remainingSec), running: t.running, done: t.done })),
  },
];

function ok(id: JsonRpcRequest["id"], result: unknown) {
  return { jsonrpc: "2.0" as const, id: id ?? null, result };
}
function fail(id: JsonRpcRequest["id"], code: number, message: string) {
  return { jsonrpc: "2.0" as const, id: id ?? null, error: { code, message } };
}

function call(ctx: Ctx, name: string, args: Record<string, unknown>): ToolResult {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) throw Object.assign(new Error(`Unknown tool: ${name}`), { rpc: -32602 });
  try {
    const out = tool.run(ctx, args ?? {});
    const text = typeof out === "string" ? out : JSON.stringify(out, null, 1);
    return { content: [{ type: "text", text }] };
  } catch (e) {
    // Tool failures are reported to the model as results so it can correct itself.
    return { content: [{ type: "text", text: (e as Error).message }], isError: true };
  }
}

/** Handle one JSON-RPC message. Returns null for notifications (no response). */
export function handleMcpMessage(ctx: Ctx, msg: JsonRpcRequest, version: string) {
  const isNotification = msg.id === undefined;
  try {
    switch (msg.method) {
      case "initialize": {
        const asked = String(msg.params?.protocolVersion ?? "");
        return ok(msg.id, {
          protocolVersion: PROTOCOLS.includes(asked) ? asked : PROTOCOLS[0],
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: "haven", title: "Haven family hub", version },
          instructions:
            "Haven is the family's wall calendar. Use it to look up and add events, chores, lists, meals, rewards, weather and kitchen timers. Dates/times are the household's local time.",
        });
      }
      case "ping":
        return isNotification ? null : ok(msg.id, {});
      case "tools/list":
        return ok(msg.id, {
          tools: TOOLS.map((t) => ({
            name: t.name,
            title: t.title,
            description: t.description,
            inputSchema: t.inputSchema,
            annotations: { title: t.title, readOnlyHint: t.readOnly, destructiveHint: false, openWorldHint: false },
          })),
        });
      case "tools/call":
        return ok(msg.id, call(ctx, String(msg.params?.name ?? ""), (msg.params?.arguments ?? {}) as Record<string, unknown>));
      default:
        if (isNotification) return null; // e.g. notifications/initialized
        return fail(msg.id, -32601, `Method not found: ${msg.method}`);
    }
  } catch (e) {
    return fail(msg.id, (e as { rpc?: number }).rpc ?? -32603, (e as Error).message);
  }
}

export const MCP_TOOL_NAMES = TOOLS.map((t) => t.name);
