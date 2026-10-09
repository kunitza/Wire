import type { Ctx } from "../context.js";
import { json } from "../db.js";
import { starBalances } from "./profiles.js";
import type { Redemption, Reward } from "../../shared/types.js";

interface Row {
  id: number;
  title: string;
  description: string;
  emoji: string;
  cost: number;
  profile_ids: string;
  renew: number;
}

export class RewardError extends Error {}

export function listRewards(ctx: Ctx): Reward[] {
  const rows = ctx.db.prepare("SELECT * FROM rewards WHERE archived = 0 ORDER BY cost, id").all() as unknown as Row[];
  const redeemed = ctx.db
    .prepare("SELECT reward_id, profile_id FROM redemptions WHERE status IN ('pending','approved')")
    .all() as { reward_id: number; profile_id: number }[];
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    description: r.description,
    emoji: r.emoji,
    cost: r.cost,
    profileIds: json.parse<number[]>(r.profile_ids, []),
    renew: !!r.renew,
    redeemedBy: r.renew ? [] : [...new Set(redeemed.filter((x) => x.reward_id === r.id).map((x) => x.profile_id))],
  }));
}

export type RewardInput = Pick<Reward, "title" | "description" | "emoji" | "cost" | "profileIds" | "renew">;

function validate(input: RewardInput) {
  if (!input.title?.trim()) throw new RewardError("Title is required");
  const cost = Math.round(Number(input.cost));
  if (!(cost >= 1 && cost <= 500)) throw new RewardError("Stars must be between 1 and 500");
  if (!input.profileIds?.length) throw new RewardError("Choose at least one profile");
  return { ...input, title: input.title.trim(), cost };
}

export function createReward(ctx: Ctx, raw: RewardInput): Reward {
  const r = validate(raw);
  const res = ctx.db
    .prepare("INSERT INTO rewards (title, description, emoji, cost, profile_ids, renew) VALUES (?, ?, ?, ?, ?, ?)")
    .run(r.title, r.description ?? "", r.emoji ?? "", r.cost, JSON.stringify(r.profileIds), r.renew ? 1 : 0);
  ctx.bus.emit("rewards");
  return listRewards(ctx).find((x) => x.id === Number(res.lastInsertRowid))!;
}

export function updateReward(ctx: Ctx, id: number, raw: RewardInput): Reward | null {
  const r = validate(raw);
  ctx.db
    .prepare("UPDATE rewards SET title = ?, description = ?, emoji = ?, cost = ?, profile_ids = ?, renew = ? WHERE id = ?")
    .run(r.title, r.description ?? "", r.emoji ?? "", r.cost, JSON.stringify(r.profileIds), r.renew ? 1 : 0, id);
  ctx.bus.emit("rewards");
  return listRewards(ctx).find((x) => x.id === id) ?? null;
}

export function deleteReward(ctx: Ctx, id: number) {
  ctx.db.prepare("UPDATE rewards SET archived = 1 WHERE id = ?").run(id);
  ctx.bus.emit("rewards");
}

/** Redeem a reward for a profile. Stars are deducted immediately (pending requests hold them too). */
export function redeemReward(ctx: Ctx, rewardId: number, profileId: number): Redemption {
  const reward = listRewards(ctx).find((r) => r.id === rewardId);
  if (!reward) throw new RewardError("Reward not found");
  if (!reward.profileIds.includes(profileId)) throw new RewardError("This reward isn't available for that profile");
  if (!reward.renew && reward.redeemedBy.includes(profileId)) throw new RewardError("Already redeemed");
  const balance = starBalances(ctx).get(profileId) ?? 0;
  if (balance < reward.cost) throw new RewardError(`Needs ${reward.cost - balance} more stars`);
  const status = ctx.settings.get<boolean>("rewardsNeedApproval", false) ? "pending" : "approved";
  const res = ctx.db
    .prepare("INSERT INTO redemptions (reward_id, profile_id, stars, status, created_at) VALUES (?, ?, ?, ?, ?)")
    .run(rewardId, profileId, reward.cost, status, ctx.now().toISOString());
  ctx.bus.emit("rewards", "stars", "profiles");
  return listRedemptions(ctx).find((r) => r.id === Number(res.lastInsertRowid))!;
}

export function listRedemptions(ctx: Ctx, limit = 100): Redemption[] {
  return ctx.db
    .prepare(
      `SELECT r.id, r.reward_id AS rewardId, rw.title AS rewardTitle, rw.emoji AS rewardEmoji, r.profile_id AS profileId,
              r.stars, r.status, r.created_at AS createdAt
         FROM redemptions r JOIN rewards rw ON rw.id = r.reward_id ORDER BY r.created_at DESC LIMIT ?`,
    )
    .all(limit) as unknown as Redemption[];
}

export function setRedemptionStatus(ctx: Ctx, id: number, status: "approved" | "declined") {
  ctx.db.prepare("UPDATE redemptions SET status = ? WHERE id = ?").run(status, id);
  ctx.bus.emit("rewards", "stars", "profiles");
}
