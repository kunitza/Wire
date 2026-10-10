import type { Ctx } from "../context.js";
import { json, tx } from "../db.js";
import { AiError, extractEvents, type Attachment } from "../lib/ai.js";
import { createLocalEvent, deleteEventsForImport } from "./events.js";
import { listProfiles } from "./profiles.js";
import type { MagicImport, ProposedEvent } from "../../shared/types.js";

interface Row {
  id: number;
  source: MagicImport["source"];
  label: string;
  status: MagicImport["status"];
  summary: string;
  events: string;
  created_event_ids: string;
  error: string | null;
  created_at: string;
}

const toImport = (r: Row): MagicImport => ({
  id: r.id,
  source: r.source,
  label: r.label,
  status: r.status,
  summary: r.summary,
  events: json.parse<ProposedEvent[]>(r.events, []),
  createdEventIds: json.parse<number[]>(r.created_event_ids, []),
  error: r.error,
  createdAt: r.created_at,
});

export function listImports(ctx: Ctx, limit = 50): MagicImport[] {
  return (ctx.db.prepare("SELECT * FROM imports ORDER BY id DESC LIMIT ?").all(limit) as unknown as Row[]).map(toImport);
}

export function getImport(ctx: Ctx, id: number): MagicImport | null {
  const r = ctx.db.prepare("SELECT * FROM imports WHERE id = ?").get(id) as Row | undefined;
  return r ? toImport(r) : null;
}

/** Match profile names in an email subject ("Jake, Emma") to profile ids. */
export function profilesFromSubject(ctx: Ctx, subject: string): number[] {
  const profiles = listProfiles(ctx);
  const words = subject
    .toLowerCase()
    .split(/[,;&+/]|\band\b/)
    .map((s) => s.replace(/^(re|fw|fwd):/g, "").trim())
    .filter(Boolean);
  const ids = new Set<number>();
  for (const w of words) for (const p of profiles) if (w === p.name.toLowerCase()) ids.add(p.id);
  return [...ids];
}

/**
 * Start an import. The AI call runs in the background; the import moves to "ready" with
 * draft events that a person reviews before they're added. With `autoApply` (email), drafts are added right away.
 */
export function startImport(
  ctx: Ctx,
  input: { source: MagicImport["source"]; label: string; text?: string; files?: Attachment[]; profileIds: number[]; autoApply?: boolean },
): { id: number; done: Promise<void> } {
  const res = ctx.db
    .prepare("INSERT INTO imports (source, label, status, created_at) VALUES (?, ?, 'processing', ?)")
    .run(input.source, input.label.slice(0, 120), ctx.now().toISOString());
  const id = Number(res.lastInsertRowid);
  ctx.bus.emit("imports");
  const done = (async () => {
    try {
      const profiles = listProfiles(ctx).filter((p) => p.kind === "profile");
      const out = await extractEvents(ctx, { text: input.text, files: input.files, profiles, defaultProfileIds: input.profileIds });
      // Events need a profile: fall back to the first profile when nothing matched.
      const fallback = profiles[0]?.id;
      const events = out.events.map((e) => ({ ...e, profileIds: e.profileIds.length ? e.profileIds : fallback ? [fallback] : [] }));
      ctx.db
        .prepare("UPDATE imports SET status = 'ready', summary = ?, events = ? WHERE id = ?")
        .run(out.summary || `${events.length} event${events.length === 1 ? "" : "s"} found`, JSON.stringify(events), id);
      if (input.autoApply && events.length) applyImport(ctx, id, events);
    } catch (err) {
      const msg = err instanceof AiError ? err.message : `Import failed: ${(err as Error).message}`;
      ctx.db.prepare("UPDATE imports SET status = 'failed', error = ? WHERE id = ?").run(msg, id);
    }
    ctx.bus.emit("imports");
  })();
  return { id, done };
}

/** Add the (possibly edited) draft events to the calendar. */
export function applyImport(ctx: Ctx, id: number, events: ProposedEvent[]): number[] {
  const imp = getImport(ctx, id);
  if (!imp) throw new Error("Import not found");
  if (imp.status === "applied") throw new Error("Already added");
  const created = tx(ctx.db, () =>
    events.map(
      (e) =>
        createLocalEvent(
          ctx,
          { ...e, repeat: { type: "none" }, profileIds: e.profileIds },
          id,
        ).id,
    ),
  );
  ctx.db
    .prepare("UPDATE imports SET status = 'applied', events = ?, created_event_ids = ? WHERE id = ?")
    .run(JSON.stringify(events), JSON.stringify(created), id);
  ctx.bus.emit("imports", "events");
  return created;
}

export function dismissImport(ctx: Ctx, id: number) {
  ctx.db.prepare("UPDATE imports SET status = 'dismissed' WHERE id = ? AND status IN ('ready','failed','processing')").run(id);
  ctx.bus.emit("imports");
}

export function undoImport(ctx: Ctx, id: number) {
  deleteEventsForImport(ctx, id);
  ctx.db.prepare("UPDATE imports SET status = 'undone' WHERE id = ?").run(id);
  ctx.bus.emit("imports", "events");
}
