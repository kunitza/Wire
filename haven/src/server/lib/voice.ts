import type { Ctx } from "../context.js";
import { completeTask, currentPart, taskInstances, uncompleteTask } from "../services/tasks.js";
import { listProfiles, starBalances } from "../services/profiles.js";
import { addItems, findListByName, groceryListId } from "../services/lists.js";
import { localDateOf } from "../../shared/dates.js";
import type { DayPart, Profile, TaskInstance } from "../../shared/types.js";

// Kid-safe voice commands for Siri Shortcuts / Google Home (via Home Assistant).
// Only check-offs, undo, "what's left", star balances and (optionally) adding to a list are possible.

export interface VoiceResult {
  ok: boolean;
  speech: string;
  action?: "complete" | "undo" | "status" | "stars" | "list-add" | "none";
}

const FILLER = new Set(
  "i im i'm we just finished finish done did do completed complete has have had her his their my the a an all is are was with of for up already ok okay hey please can you mark checked check off it today task chore job".split(
    " ",
  ),
);

function stem(w: string) {
  return w.replace(/'s$/, "").replace(/(ing|ed|es|s)$/, "");
}

function tokens(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s']/gu, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.replace(/'s$/, ""));
}

function findProfile(words: string[], profiles: Profile[]): Profile | null {
  for (const p of profiles) {
    const name = tokens(p.name);
    for (let i = 0; i + name.length <= words.length; i++) if (name.every((n, j) => words[i + j] === n)) return p;
  }
  return null;
}

function score(title: string, words: string[]): number {
  const t = tokens(title).map(stem).filter((w) => !FILLER.has(w));
  if (!t.length) return 0;
  const w = new Set(words.map(stem));
  const hits = t.filter((x) => w.has(x) || [...w].some((y) => y.length > 3 && (x.startsWith(y) || y.startsWith(x)))).length;
  return hits / t.length + hits * 0.01;
}

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function todaysInstances(ctx: Ctx): TaskInstance[] {
  const today = localDateOf(ctx.now());
  const tomorrow = new Date(ctx.now().getTime() + 86400000);
  return taskInstances(ctx, today, localDateOf(tomorrow)).filter((i) => i.date === today);
}

function remainingFor(ctx: Ctx, profileId: number): TaskInstance[] {
  return todaysInstances(ctx).filter((i) => i.profileId === profileId && i.status === "open");
}

export function runVoiceCommand(ctx: Ctx, text: string, opts: { allowListAdd: boolean }): VoiceResult {
  const raw = text.trim();
  if (!raw) return { ok: false, speech: "I didn't catch that.", action: "none" };
  const profiles = listProfiles(ctx).filter((p) => p.kind === "profile");
  const lower = raw.toLowerCase();
  const words = tokens(raw);
  const person = findProfile(words, profiles);
  const nameWords = new Set(person ? tokens(person.name) : []);
  const rest = words.filter((w) => !nameWords.has(w));

  // Add to a list: "add milk to the grocery list"
  const add = lower.match(/^(?:please\s+)?(?:add|put)\s+(.+?)\s+(?:to|on)\s+(?:the\s+|my\s+|our\s+)?(.+?)(?:\s+list)?[.!?]*$/);
  if (add) {
    if (!opts.allowListAdd) return { ok: false, speech: "Adding to lists by voice is turned off.", action: "none" };
    const list = findListByName(ctx, add[2]) ?? (/(grocer|shopping|store)/.test(add[2]) ? { id: groceryListId(ctx), name: "Grocery List" } : null);
    if (!list) return { ok: false, speech: `I couldn't find a list called ${add[2]}.`, action: "none" };
    const items = add[1].split(/,|\band\b/).map((s) => s.trim()).filter(Boolean);
    addItems(ctx, list.id, items.map((t) => ({ text: t.charAt(0).toUpperCase() + t.slice(1) })));
    return { ok: true, speech: `Added ${items.join(" and ")} to ${list.name}.`, action: "list-add" };
  }

  // Star balance: "how many stars does Emma have"
  if (/\b(stars?|points?)\b/.test(lower) && /\b(how many|balance|count|have|got)\b/.test(lower)) {
    if (!person) return { ok: false, speech: "Whose stars should I check?", action: "none" };
    const n = starBalances(ctx).get(person.id) ?? 0;
    return { ok: true, speech: `${person.name} has ${plural(n, "star")}.`, action: "stars" };
  }

  // Status: "what does Jake have left" / "Emma's chores"
  if (/\b(left|remaining|to do|todo|what|which|list)\b/.test(lower) && !/\b(done|finished|completed)\b/.test(lower)) {
    if (!person) return { ok: false, speech: "Whose chores should I check?", action: "none" };
    const left = remainingFor(ctx, person.id);
    if (!left.length) return { ok: true, speech: `${person.name} is all done for today! 🎉`, action: "status" };
    const names = left.slice(0, 6).map((i) => i.task.title);
    return {
      ok: true,
      speech: `${person.name} has ${plural(left.length, "thing")} left: ${names.join(", ")}${left.length > 6 ? ", and more" : ""}.`,
      action: "status",
    };
  }

  const undo = /\b(undo|not done|didn't|did not|uncheck|wasn't|was not|take back)\b/.test(lower);
  const instances = todaysInstances(ctx).filter((i) => i.status !== "skipped");
  const part = (["morning", "afternoon", "evening"] as DayPart[]).find((p) => lower.includes(p));
  const meaningful = rest.filter((w) => !FILLER.has(w) && !["undo", "not", "didn't", "uncheck"].includes(w));

  // Whole routine: "Emma finished her morning routine"
  if (person && /\broutine\b/.test(lower)) {
    const p = part ?? currentPart(ctx.now());
    const items = instances.filter((i) => i.task.kind === "routine" && i.part === p && i.profileId === person.id);
    if (!items.length) return { ok: false, speech: `${person.name} doesn't have a ${p} routine today.`, action: "none" };
    let stars = 0;
    for (const i of items) {
      if (undo) {
        if (i.status === "done") uncompleteTask(ctx, i.task.id, i.occurrence, i.part, i.profileId);
      } else if (i.status === "open") stars += completeTask(ctx, { taskId: i.task.id, occurrence: i.occurrence, part: i.part, slot: i.profileId }).stars;
    }
    if (undo) return { ok: true, speech: `Okay, I unchecked ${person.name}'s ${p} routine.`, action: "undo" };
    return { ok: true, speech: celebrate(ctx, person, `the ${p} routine`, stars), action: "complete" };
  }

  if (!meaningful.length) return { ok: false, speech: person ? `What did ${person.name} finish?` : "Which chore was finished?", action: "none" };

  const candidates = instances.filter((i) => {
    if (undo ? i.status !== "done" : i.status !== "open") return false;
    if (!person) return true;
    return i.profileId === person.id || (i.profileId === null && (!undo || i.completedBy === person.id));
  });
  const scored = candidates
    .map((i) => ({ i, s: score(i.task.title, meaningful) + (part && i.part === part ? 0.05 : 0) + (i.part === currentPart(ctx.now()) ? 0.02 : 0) }))
    .filter((x) => x.s >= 0.5)
    .sort((a, b) => b.s - a.s);
  if (!scored.length) {
    const who = person ? `${person.name} ` : "";
    return { ok: false, speech: undo ? `I couldn't find a finished task like that for ${who || "anyone"}.` : `I couldn't find an unfinished task like that for ${who || "anyone"}today.`, action: "none" };
  }
  const best = scored[0];
  const sameTask = scored.filter((x) => x.i.task.id === best.i.task.id);
  // Same chore for several kids and no name given: ask who.
  if (!person && sameTask.some((x) => x.i.profileId !== best.i.profileId)) {
    return { ok: false, speech: `Who finished ${best.i.task.title}?`, action: "none" };
  }
  if (scored.length > 1 && scored[1].i.task.id !== best.i.task.id && Math.abs(scored[1].s - best.s) < 0.01) {
    return { ok: false, speech: `Did you mean ${best.i.task.title} or ${scored[1].i.task.title}?`, action: "none" };
  }
  const inst = best.i;
  if (undo) {
    uncompleteTask(ctx, inst.task.id, inst.occurrence, inst.part, inst.profileId);
    return { ok: true, speech: `Okay, ${inst.task.title} is marked not done.`, action: "undo" };
  }
  if (inst.profileId === null && !person) return { ok: false, speech: `Who finished ${inst.task.title}?`, action: "none" };
  const owner = person ?? profiles.find((p) => p.id === inst.profileId)!;
  const { stars } = completeTask(ctx, {
    taskId: inst.task.id,
    occurrence: inst.occurrence,
    part: inst.part,
    slot: inst.profileId,
    creditTo: inst.profileId === null ? owner.id : undefined,
  });
  return { ok: true, speech: celebrate(ctx, owner, inst.task.title, stars), action: "complete" };
}

function celebrate(ctx: Ctx, person: Profile, what: string, stars: number): string {
  const left = remainingFor(ctx, person.id).length;
  const balance = starBalances(ctx).get(person.id) ?? 0;
  const cheers = ["Nice job", "Great work", "Awesome", "Way to go", "High five"];
  const cheer = cheers[Math.floor(Math.random() * cheers.length)];
  const parts = [`${cheer}, ${person.name}! ${what.charAt(0).toUpperCase() + what.slice(1)} is done.`];
  if (stars > 0) parts.push(`You earned ${plural(stars, "star")} and have ${balance} now.`);
  parts.push(left ? `${plural(left, "thing")} left today.` : "That's everything for today!");
  return parts.join(" ");
}

/** Home Assistant YAML (rest_command + one script per kid & chore) for the Google Home route. */
export function homeAssistantYaml(ctx: Ctx, baseUrl: string, token: string): string {
  const profiles = listProfiles(ctx).filter((p) => p.kind === "profile");
  const tasks = todaysInstances(ctx);
  const seen = new Set<string>();
  const lines: string[] = [
    "# Paste into Home Assistant's configuration.yaml, restart, then expose the scripts to Google",
    "# (Settings → Voice assistants → Expose). In the Google Home app, create a routine:",
    '#   Starter: "When I say to Google: Emma finished dishes"  →  Action: Adjust home devices → "Haven Emma Dishes" → Turn on',
    "rest_command:",
    "  haven_voice:",
    `    url: "${baseUrl}/api/voice/command"`,
    "    method: post",
    "    headers:",
    `      X-Haven-Token: "${token}"`,
    '    content_type: "application/json"',
    "    payload: '{\"text\": \"{{ text }}\"}'",
    "",
    "script:",
  ];
  const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  for (const p of profiles) {
    for (const i of tasks.filter((t) => t.profileId === p.id || t.profileId === null)) {
      const id = `haven_${slug(p.name)}_${slug(i.task.title)}`;
      if (seen.has(id)) continue;
      seen.add(id);
      lines.push(
        `  ${id}:`,
        `    alias: "Haven ${p.name} ${i.task.title.replace(/"/g, "'")}"`,
        "    sequence:",
        "      - action: rest_command.haven_voice",
        "        data:",
        `          text: "${p.name} finished ${i.task.title.replace(/"/g, "'")}"`,
      );
    }
  }
  return lines.join("\n") + "\n";
}
