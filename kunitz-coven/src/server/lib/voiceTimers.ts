import type { Ctx } from "../context.js";
import { createTimer, dismissTimer, findTimer, formatDuration, listTimers } from "../services/timers.js";

// Voice phrases for kitchen timers:
//   "set a timer for 10 minutes", "set a 12 minute pasta timer", "pasta timer for 12 minutes",
//   "how much time is left", "how long on the oven timer", "cancel the pasta timer", "stop the timer".

const NUMBER_WORDS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18,
  nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, ninety: 90,
};

function normalizeNumbers(s: string): string {
  return s
    .replace(/\bhalf an? hour\b/g, "30 minutes")
    .replace(/\ban hour and a half\b/g, "90 minutes")
    .replace(/\b(\d+) and a half (hours?|minutes?)\b/g, (_, n, u) => `${n}.5 ${u}`)
    .replace(/\b(twenty|thirty|forty|fifty)[ -](one|two|three|four|five|six|seven|eight|nine)\b/g, (_, a, b) => String(NUMBER_WORDS[a] + NUMBER_WORDS[b]))
    .replace(/\b(a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|ninety)\b(?=[ -]+(hours?|hrs?|minutes?|mins?|seconds?|secs?)\b)/g, (w) =>
      String(NUMBER_WORDS[w]),
    );
}

/** Parse a duration like "1 hour 30 minutes", "90 seconds", "10-minute". Returns seconds or null. */
export function parseDuration(text: string): number | null {
  const s = normalizeNumbers(text.toLowerCase());
  let total = 0;
  let found = false;
  const re = /(\d+(?:\.\d+)?)[ -]*(hours?|hrs?|h\b|minutes?|mins?|m\b|seconds?|secs?|s\b)/g;
  for (const m of s.matchAll(re)) {
    const n = parseFloat(m[1]);
    const u = m[2][0];
    total += u === "h" ? n * 3600 : u === "m" ? n * 60 : n;
    found = true;
  }
  return found && total > 0 ? Math.round(total) : null;
}

/** Pull a name like "pasta" out of "set a 12 minute pasta timer" / "timer for the oven" / "timer called homework". */
function timerLabel(text: string): string {
  const s = text.toLowerCase();
  const called = s.match(/\b(?:called|named|for the|labeled|labelled)\s+([a-z][a-z ]{1,24}?)(?:\s+(?:for|timer)\b|[.!?]*$)/);
  if (called && !parseDuration(called[1])) return cap(called[1]);
  const before = s.match(/(?:\d+[ -]*(?:hours?|minutes?|mins?|seconds?|secs?)\s+|\b(?:a|an|the|my)\s+)([a-z][a-z ]{1,24}?)\s+timer\b/);
  if (before && !/^(a|an|the|my|new)$/.test(before[1].trim())) return cap(before[1]);
  return "";
}

const cap = (w: string) => {
  const t = w.trim().replace(/\s+/g, " ");
  return t.charAt(0).toUpperCase() + t.slice(1);
};

export function handleTimerCommand(ctx: Ctx, text: string): { ok: boolean; speech: string } | null {
  const s = text.toLowerCase();
  if (!/\btimers?\b/.test(s) && !/\b(time (is )?left|how long)\b/.test(s)) return null;

  if (/\b(cancel|stop|delete|remove|end|turn off|dismiss|clear)\b/.test(s)) {
    const all = listTimers(ctx);
    if (!all.length) return { ok: false, speech: "There aren't any timers running." };
    const which = s.replace(/.*\b(cancel|stop|delete|remove|end|turn off|dismiss|clear)\b/, "").replace(/\b(the|my|all|timers?)\b/g, " ").trim();
    if (/\ball\b/.test(s) || (!which && all.length > 1 && all.some((t) => t.done))) {
      const targets = /\ball\b/.test(s) ? all : all.filter((t) => t.done);
      targets.forEach((t) => dismissTimer(ctx, t.id));
      return { ok: true, speech: targets.length === 1 ? `Stopped the ${targets[0].label} timer.` : `Stopped ${targets.length} timers.` };
    }
    const t = findTimer(ctx, which);
    if (!t) return { ok: false, speech: all.length > 1 ? `Which timer? ${all.map((x) => x.label).join(", ")}.` : "I couldn't find that timer." };
    dismissTimer(ctx, t.id);
    return { ok: true, speech: `Stopped the ${t.label} timer.` };
  }

  if (/\b(how (much|long)|time (is )?left|remaining|status)\b/.test(s)) {
    const all = listTimers(ctx);
    if (!all.length) return { ok: true, speech: "There aren't any timers running." };
    const which = s.replace(/.*\b(on|for)\b/, "").replace(/\b(the|my|timers?|left)\b/g, " ").trim();
    const list = all.length > 1 && which ? [findTimer(ctx, which)].filter(Boolean) : all;
    if (!list.length) return { ok: false, speech: "I couldn't find that timer." };
    return {
      ok: true,
      speech: list
        .map((t) => (t!.done ? `${t!.label} is done!` : `${t!.label}: ${formatDuration(t!.remainingSec)} left${t!.running ? "" : " (paused)"}.`))
        .join(" "),
    };
  }

  const seconds = parseDuration(s);
  if (!seconds) return /\b(set|start|make)\b/.test(s) ? { ok: false, speech: "How long should the timer be?" } : null;
  if (seconds > 24 * 3600) return { ok: false, speech: "Timers can be up to 24 hours." };
  const t = createTimer(ctx, seconds, timerLabel(s));
  return { ok: true, speech: `Okay, ${t.label.toLowerCase().endsWith("timer") ? t.label : `${t.label} timer`} set for ${formatDuration(seconds)}.` };
}
