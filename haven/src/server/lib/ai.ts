import Anthropic from "@anthropic-ai/sdk";
import type { Ctx } from "../context.js";
import { aiKey, aiSpentThisMonth } from "../services/settings.js";
import { addDays, dayOfWeek, localDateOf } from "../../shared/dates.js";
import type { ProposedEvent } from "../../shared/types.js";

// Sidekick-style AI features, powered by Claude via the Anthropic API.

export class AiError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

/** USD per million tokens (input, output). */
const PRICING: Record<string, [number, number]> = {
  "claude-opus-5-5": [4, 20],
  "claude-sonnet-5-5": [2, 10],
  "claude-haiku-5-5": [0.1, 0.5],
  "claude-fable-5-1": [10, 50],
};

export interface Attachment {
  mediaType: string;
  base64: string;
  name?: string;
}

type Block = Anthropic.Beta.BetaContentBlockParam;

let clientCache: { key: string; client: Anthropic } | null = null;
function client(ctx: Ctx): Anthropic {
  const key = aiKey(ctx);
  if (!key) throw new AiError("Add an Anthropic API key in Settings → Sidekick to use AI features.", 412);
  if (clientCache?.key !== key) clientCache = { key, client: new Anthropic({ apiKey: key }) };
  return clientCache.client;
}

/** Test hook: replace the model call. */
export type AiRunner = (args: { feature: string; system: string; content: Block[]; schema: object }) => Promise<unknown>;
let runnerOverride: AiRunner | null = null;
export function setAiRunner(r: AiRunner | null) {
  runnerOverride = r;
}

export function attachmentBlocks(files: Attachment[]): Block[] {
  const blocks: Block[] = [];
  for (const f of files) {
    if (f.mediaType === "application/pdf") {
      blocks.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: f.base64 } });
    } else if (["image/jpeg", "image/png", "image/gif", "image/webp"].includes(f.mediaType)) {
      blocks.push({
        type: "image",
        source: { type: "base64", media_type: f.mediaType as "image/jpeg" | "image/png" | "image/gif" | "image/webp", data: f.base64 },
      });
    } else if (f.mediaType.startsWith("text/") || f.mediaType === "application/json" || f.mediaType === "text/calendar") {
      blocks.push({ type: "text", text: `Attached file ${f.name ?? ""}:\n${Buffer.from(f.base64, "base64").toString("utf8")}` });
    } else {
      throw new AiError(`Unsupported file type: ${f.mediaType}. Use a photo, PDF or text.`);
    }
  }
  return blocks;
}

async function run<T>(ctx: Ctx, feature: string, system: string, content: Block[], schema: object): Promise<T> {
  if (runnerOverride) return (await runnerOverride({ feature, system, content, schema })) as T;
  const budget = ctx.settings.get<{ monthlyBudgetUsd: number }>("ai", { monthlyBudgetUsd: 5 }).monthlyBudgetUsd;
  if (aiSpentThisMonth(ctx) >= budget) throw new AiError(`This month's AI budget ($${budget}) is used up. Raise it in Settings.`, 429);
  const model = ctx.config.aiModel;
  let res: Anthropic.Beta.BetaMessage;
  try {
    res = await client(ctx).beta.messages.create({
      model,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: { type: "json_schema", schema: schema as Record<string, unknown> } },
      system,
      messages: [{ role: "user", content }],
    });
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) throw new AiError("The Anthropic API key was rejected. Check it in Settings.", 401);
    if (err instanceof Anthropic.RateLimitError) throw new AiError("Claude is busy right now. Try again in a minute.", 429);
    if (err instanceof Anthropic.APIConnectionError) throw new AiError("Couldn't reach Claude. Check the internet connection.", 503);
    if (err instanceof Anthropic.APIError) throw new AiError(`Claude request failed: ${err.message}`, 502);
    throw err;
  }
  const [inP, outP] = PRICING[model] ?? PRICING["claude-opus-5-5"];
  const cost = (res.usage.input_tokens * inP + res.usage.output_tokens * outP) / 1e6;
  ctx.db
    .prepare("INSERT INTO ai_usage (month, feature, input_tokens, output_tokens, cost_usd, at) VALUES (?, ?, ?, ?, ?, ?)")
    .run(ctx.now().toISOString().slice(0, 7), feature, res.usage.input_tokens, res.usage.output_tokens, cost, ctx.now().toISOString());
  ctx.bus.emit("settings");
  if (res.stop_reason === "refusal") throw new AiError("Claude declined to process that content.");
  if (res.stop_reason === "max_tokens") throw new AiError("That was too long to process in one go. Try a shorter document.");
  const text = res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new AiError("Claude returned an unexpected response. Try again.", 502);
  }
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function dateContext(ctx: Ctx) {
  const today = localDateOf(ctx.now());
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return `Today is ${WEEKDAYS[dayOfWeek(today)]} ${today}. The household time zone is ${tz}.`;
}

// ---------- Magic Import: turn emails, PDFs, photos and text into calendar events ----------

const eventSchema = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "events"],
  properties: {
    summary: { type: "string", description: "One short sentence describing what was found." },
    events: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "allDay", "start", "end", "location", "notes", "profileNames"],
        properties: {
          title: { type: "string" },
          allDay: { type: "boolean" },
          start: { type: "string", description: "YYYY-MM-DD for all-day events, otherwise YYYY-MM-DDTHH:MM (24h local time)" },
          end: { type: "string", description: "Exclusive end. All-day: the day AFTER the last day (YYYY-MM-DD). Timed: YYYY-MM-DDTHH:MM" },
          location: { type: "string" },
          notes: { type: "string" },
          profileNames: { type: "array", items: { type: "string" } },
        },
      },
    },
  },
};

export async function extractEvents(
  ctx: Ctx,
  input: { text?: string; files?: Attachment[]; profiles: { id: number; name: string }[]; defaultProfileIds: number[] },
): Promise<{ summary: string; events: ProposedEvent[] }> {
  const content: Block[] = [...attachmentBlocks(input.files ?? [])];
  if (input.text?.trim()) content.push({ type: "text", text: input.text.trim() });
  if (!content.length) throw new AiError("Add some text, a photo or a PDF to import.");
  const names = input.profiles.map((p) => p.name).join(", ");
  const system = [
    "You turn school emails, flyers, schedules, invitations and screenshots into calendar events for a family wall calendar.",
    dateContext(ctx),
    `Family profiles: ${names}. Put a profile name in profileNames only when the content clearly concerns that person; otherwise leave it empty.`,
    "Rules: Only include items with a specific date. Resolve relative dates ('next Friday') from today. If a year is missing, use the next upcoming occurrence.",
    "Timed events without an end time last 1 hour. Events without a time are all-day. Keep titles short (under 40 characters) and specific, e.g. 'Field trip: Science Museum'.",
    "Put useful details (what to bring, cost, contact) in notes. Do not invent events. If nothing qualifies, return an empty list.",
  ].join("\n");
  const out = await run<{ summary: string; events: (Omit<ProposedEvent, "profileIds"> & { profileNames: string[] })[] }>(
    ctx,
    "import",
    system,
    content,
    eventSchema,
  );
  const byName = new Map(input.profiles.map((p) => [p.name.toLowerCase(), p.id]));
  const events: ProposedEvent[] = [];
  for (const e of out.events ?? []) {
    const ev = normalizeEvent(e);
    if (!ev) continue;
    const ids = (e.profileNames ?? []).map((n) => byName.get(n.toLowerCase())).filter((x): x is number => x !== undefined);
    events.push({ ...ev, profileIds: input.defaultProfileIds.length ? input.defaultProfileIds : ids });
  }
  return { summary: out.summary ?? "", events };
}

function normalizeEvent(e: { title: string; allDay: boolean; start: string; end: string; location?: string; notes?: string }) {
  const d = /^\d{4}-\d{2}-\d{2}$/;
  const dt = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
  if (!e.title?.trim()) return null;
  if (e.allDay) {
    const start = e.start.slice(0, 10);
    if (!d.test(start)) return null;
    let end = (e.end || "").slice(0, 10);
    if (!d.test(end) || end <= start) end = addDays(start, 1);
    return { title: e.title.trim(), allDay: true, start, end, location: e.location || undefined, notes: e.notes || undefined };
  }
  if (!dt.test(e.start)) return null;
  const start = e.start.slice(0, 16);
  let end = dt.test(e.end ?? "") ? e.end.slice(0, 16) : "";
  if (!end || end <= start) {
    const t = new Date(start + ":00Z");
    t.setUTCHours(t.getUTCHours() + 1);
    end = t.toISOString().slice(0, 16);
  }
  return { title: e.title.trim(), allDay: false, start, end, location: e.location || undefined, notes: e.notes || undefined };
}

// ---------- Recipes & meal planning ----------

const recipeProps = {
  title: { type: "string" },
  emoji: { type: "string", description: "One food emoji" },
  ingredients: { type: "array", items: { type: "string" }, description: "One ingredient per line with quantity, e.g. '2 cups flour'" },
  instructions: { type: "string", description: "Numbered steps, one per line" },
};
const recipeSchema = {
  type: "object",
  additionalProperties: false,
  required: ["title", "emoji", "ingredients", "instructions"],
  properties: recipeProps,
};

export interface GeneratedRecipe {
  title: string;
  emoji: string;
  ingredients: string[];
  instructions: string;
}

export async function generateRecipe(
  ctx: Ctx,
  input: { prompt: string; category: string; servings: number; photos?: Attachment[]; url?: string },
): Promise<GeneratedRecipe> {
  const content: Block[] = [...attachmentBlocks(input.photos ?? [])];
  const asks = [
    `Meal type: ${input.category}. Servings: ${input.servings || 4}.`,
    input.photos?.length ? "The photos show what's in our fridge/pantry - build the recipe mostly from those ingredients." : "",
    input.url ? `Turn the recipe at or described by this link into our format (if you can't see the page, write a faithful recipe for the dish its title names): ${input.url}` : "",
    input.prompt?.trim() ? `Request: ${input.prompt.trim()}` : "",
  ].filter(Boolean);
  content.push({ type: "text", text: asks.join("\n") });
  return run<GeneratedRecipe>(
    ctx,
    "recipe",
    "You are a practical family cook. Write one family-friendly recipe that's realistic on a weeknight. Keep instructions concise.",
    content,
    recipeSchema,
  );
}

export interface PlannedMeal {
  date: string;
  existingRecipeId: number | null;
  title: string;
  emoji: string;
  ingredients: string[];
  instructions: string;
}

export async function planMeals(
  ctx: Ctx,
  input: {
    category: string;
    prompt: string;
    dates: string[];
    servings: number;
    mode: "existing" | "new" | "both";
    recipes: { id: number; title: string }[];
  },
): Promise<PlannedMeal[]> {
  if (!input.dates.length) throw new AiError("Pick at least one day.");
  if (input.mode === "existing" && !input.recipes.length) throw new AiError("You don't have any saved recipes yet.");
  const schema = {
    type: "object",
    additionalProperties: false,
    required: ["meals"],
    properties: {
      meals: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["date", "existingRecipeId", "title", "emoji", "ingredients", "instructions"],
          properties: {
            date: { type: "string" },
            existingRecipeId: { type: ["integer", "null"], description: "id of a saved recipe, or null for a new one" },
            ...recipeProps,
          },
        },
      },
    },
  };
  const modeText =
    input.mode === "existing"
      ? "Only use saved recipes (set existingRecipeId, leave ingredients/instructions empty)."
      : input.mode === "new"
        ? "Create new recipes only (existingRecipeId null)."
        : "Mix saved recipes and new ones.";
  const text = [
    dateContext(ctx),
    `Plan ${input.category} for these dates: ${input.dates.join(", ")} (exactly one meal per date). Feeding ${input.servings || 4}.`,
    input.prompt ? `Preferences: ${input.prompt}` : "",
    modeText,
    input.recipes.length ? `Saved recipes (id: title):\n${input.recipes.map((r) => `${r.id}: ${r.title}`).join("\n")}` : "",
    "Vary the meals across the week.",
  ]
    .filter(Boolean)
    .join("\n");
  const out = await run<{ meals: PlannedMeal[] }>(
    ctx,
    "meal-plan",
    "You are a family meal planner. Suggest realistic, varied, kid-friendly meals.",
    [{ type: "text", text }],
    schema,
  );
  const ids = new Set(input.recipes.map((r) => r.id));
  return (out.meals ?? [])
    .filter((m) => input.dates.includes(m.date))
    .map((m) => ({ ...m, existingRecipeId: m.existingRecipeId !== null && ids.has(m.existingRecipeId) ? m.existingRecipeId : null }));
}

// ---------- Lists ----------

const listSchema = {
  type: "object",
  additionalProperties: false,
  required: ["name", "items"],
  properties: {
    name: { type: "string" },
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["text", "section"],
        properties: { text: { type: "string" }, section: { type: "string" } },
      },
    },
  },
};

export async function buildList(ctx: Ctx, input: { prompt: string; files?: Attachment[]; grocery: boolean }) {
  const content: Block[] = [...attachmentBlocks(input.files ?? [])];
  content.push({ type: "text", text: input.prompt?.trim() || "Turn this into a list." });
  return run<{ name: string; items: { text: string; section: string }[] }>(
    ctx,
    "list",
    [
      "You create practical household checklists (packing lists, to-dos, shopping lists).",
      dateContext(ctx),
      input.grocery
        ? "Group items into store sections (Produce, Dairy, Meat & Seafood, Bakery, Pantry, Frozen, Household, etc.)."
        : "Group items into short, sensible sections; use an empty section if grouping doesn't help.",
      "Items are short (under 40 characters). Give the list a short name.",
    ].join("\n"),
    content,
    listSchema,
  );
}

/** Grocery "Organize": dedupe and sort items into store sections. Returns the section for each item id. */
export async function organizeList(ctx: Ctx, items: { id: number; text: string }[]) {
  const schema = {
    type: "object",
    additionalProperties: false,
    required: ["items"],
    properties: {
      items: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["id", "section", "duplicateOf"],
          properties: {
            id: { type: "integer" },
            section: { type: "string" },
            duplicateOf: { type: ["integer", "null"], description: "id of an earlier item this duplicates, else null" },
          },
        },
      },
    },
  };
  return run<{ items: { id: number; section: string; duplicateOf: number | null }[] }>(
    ctx,
    "organize",
    "Sort grocery items into store sections (Produce, Dairy & Eggs, Meat & Seafood, Bakery, Pantry, Frozen, Snacks, Drinks, Household, Personal Care, Other). Mark duplicates.",
    [{ type: "text", text: items.map((i) => `${i.id}: ${i.text}`).join("\n") }],
    schema,
  );
}

// ---------- Activity planner ----------

export async function planActivities(
  ctx: Ctx,
  input: { kind: "local" | "family"; location: string; start: string; end: string; budget: string; vibe: string; people: string[] },
) {
  const schema = {
    type: "object",
    additionalProperties: false,
    required: ["options"],
    properties: {
      options: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["title", "description", "start", "end", "location"],
          properties: {
            title: { type: "string" },
            description: { type: "string" },
            start: { type: "string", description: "YYYY-MM-DDTHH:MM" },
            end: { type: "string", description: "YYYY-MM-DDTHH:MM" },
            location: { type: "string" },
          },
        },
      },
    },
  };
  const text = [
    dateContext(ctx),
    `Suggest up to 4 ${input.kind === "local" ? "kinds of local outings" : "family activities"} near ${input.location || "home"}.`,
    `Window: ${input.start} to ${input.end}. Who: ${input.people.join(", ") || "the family"}. Budget: ${input.budget || "any"}. Vibe: ${input.vibe || "fun"}.`,
    "You can't browse the web, so suggest types of places/activities that commonly exist (e.g. 'Apple picking at a local orchard') rather than inventing specific businesses or events. Fit each within the window.",
  ].join("\n");
  return run<{ options: { title: string; description: string; start: string; end: string; location: string }[] }>(
    ctx,
    "activity",
    "You plan fun, realistic family activities.",
    [{ type: "text", text }],
    schema,
  );
}
