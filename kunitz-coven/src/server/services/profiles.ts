import type { Ctx } from "../context.js";
import type { Profile, ProfileKind, StarLedgerEntry } from "../../shared/types.js";

interface Row {
  id: number;
  name: string;
  color: string;
  avatar: string;
  kind: ProfileKind;
  birthday: string | null;
  sort: number;
}

export function starBalances(ctx: Ctx): Map<number, number> {
  const rows = ctx.db
    .prepare(
      `SELECT profile_id, SUM(delta) AS total FROM (
         SELECT profile_id, stars AS delta FROM completions WHERE profile_id IS NOT NULL
         UNION ALL SELECT profile_id, delta FROM star_adjustments
         UNION ALL SELECT profile_id, -stars FROM redemptions WHERE status IN ('pending','approved')
       ) GROUP BY profile_id`,
    )
    .all() as { profile_id: number; total: number }[];
  return new Map(rows.map((r) => [r.profile_id, r.total ?? 0]));
}

export function listProfiles(ctx: Ctx): Profile[] {
  const rows = ctx.db.prepare("SELECT * FROM profiles WHERE archived = 0 ORDER BY sort, id").all() as unknown as Row[];
  const stars = starBalances(ctx);
  return rows.map((r) => ({ ...r, stars: stars.get(r.id) ?? 0 }));
}

export function getProfile(ctx: Ctx, id: number): Profile | null {
  return listProfiles(ctx).find((p) => p.id === id) ?? null;
}

export interface ProfileInput {
  name: string;
  color: string;
  avatar?: string;
  kind?: ProfileKind;
  birthday?: string | null;
}

export function createProfile(ctx: Ctx, input: ProfileInput): Profile {
  const sort = (ctx.db.prepare("SELECT COALESCE(MAX(sort), 0) + 1 AS s FROM profiles").get() as { s: number }).s;
  if (!input.name?.trim()) throw new Error("Name is required");
  const res = ctx.db
    .prepare("INSERT INTO profiles (name, color, avatar, kind, birthday, sort) VALUES (?, ?, ?, ?, ?, ?)")
    .run(input.name.trim(), input.color, input.avatar ?? "", input.kind ?? "profile", input.birthday || null, sort);
  ctx.bus.emit("profiles");
  return getProfile(ctx, Number(res.lastInsertRowid))!;
}

export function updateProfile(ctx: Ctx, id: number, input: Partial<ProfileInput>): Profile | null {
  const cur = getProfile(ctx, id);
  if (!cur) return null;
  ctx.db
    .prepare("UPDATE profiles SET name = ?, color = ?, avatar = ?, kind = ?, birthday = ? WHERE id = ?")
    .run(
      (input.name ?? cur.name).trim(),
      input.color ?? cur.color,
      input.avatar ?? cur.avatar,
      input.kind ?? cur.kind,
      input.birthday === undefined ? cur.birthday : input.birthday || null,
      id,
    );
  ctx.bus.emit("profiles");
  return getProfile(ctx, id);
}

export function reorderProfiles(ctx: Ctx, ids: number[]) {
  const stmt = ctx.db.prepare("UPDATE profiles SET sort = ? WHERE id = ?");
  ids.forEach((id, i) => stmt.run(i + 1, id));
  ctx.bus.emit("profiles");
}

/**
 * Profiles are archived rather than deleted so star history stays consistent. Like Skylight, items that
 * belonged only to this profile go with it; shared items just lose it.
 */
export function archiveProfile(ctx: Ctx, id: number) {
  const strip = (table: string, extra = "") => {
    const rows = ctx.db.prepare(`SELECT id, profile_ids FROM ${table} WHERE 1=1 ${extra}`).all() as { id: number; profile_ids: string }[];
    for (const r of rows) {
      const ids: number[] = JSON.parse(r.profile_ids);
      if (!ids.includes(id)) continue;
      const rest = ids.filter((x) => x !== id);
      if (rest.length) ctx.db.prepare(`UPDATE ${table} SET profile_ids = ? WHERE id = ?`).run(JSON.stringify(rest), r.id);
      else if (table === "events") ctx.db.prepare("DELETE FROM events WHERE id = ?").run(r.id);
      else if (table === "calendars") ctx.db.prepare("UPDATE calendars SET profile_ids = '[]' WHERE id = ?").run(r.id);
      else ctx.db.prepare(`UPDATE ${table} SET archived = 1 WHERE id = ?`).run(r.id);
    }
  };
  ctx.db.prepare("UPDATE profiles SET archived = 1 WHERE id = ?").run(id);
  strip("events");
  strip("tasks", "AND archived = 0");
  strip("rewards", "AND archived = 0");
  strip("calendars");
  ctx.bus.emit("profiles", "tasks", "events", "rewards", "calendars");
}

export function adjustStars(ctx: Ctx, profileId: number, delta: number, reason: string) {
  ctx.db
    .prepare("INSERT INTO star_adjustments (profile_id, delta, reason, at) VALUES (?, ?, ?, ?)")
    .run(profileId, Math.round(delta), reason, ctx.now().toISOString());
  ctx.bus.emit("stars", "profiles");
}

export function starLedger(ctx: Ctx, profileId: number, limit = 50): StarLedgerEntry[] {
  const rows = ctx.db
    .prepare(
      `SELECT * FROM (
         SELECT 'c' || c.id AS id, c.profile_id AS profileId, c.stars AS delta,
                COALESCE(NULLIF(t.emoji, '') || ' ', '') || t.title AS reason, c.completed_at AS at
           FROM completions c JOIN tasks t ON t.id = c.task_id
          WHERE c.profile_id = ? AND c.stars <> 0
         UNION ALL
         SELECT 'a' || id, profile_id, delta, CASE WHEN reason = '' THEN 'Adjustment' ELSE reason END, at
           FROM star_adjustments WHERE profile_id = ?
         UNION ALL
         SELECT 'r' || r.id, r.profile_id, -r.stars, rw.emoji || ' ' || rw.title || ' (' || r.status || ')', r.created_at
           FROM redemptions r JOIN rewards rw ON rw.id = r.reward_id
          WHERE r.profile_id = ? AND r.status IN ('pending','approved')
       ) ORDER BY at DESC LIMIT ?`,
    )
    .all(profileId, profileId, profileId, limit) as unknown as StarLedgerEntry[];
  return rows;
}
