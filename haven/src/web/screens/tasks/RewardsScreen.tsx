import { useState } from "react";
import { Check, History, Hourglass, Star, Trash2 } from "lucide-react";
import type { Profile, Redemption, Reward, StarLedgerEntry } from "../../../shared/types";
import { Fab, Header } from "../../components/shell";
import { Avatar, Confirm, EmojiPicker, Field, Modal, ProfilePicker, ToggleRow } from "../../components/ui";
import { useApp, useLive } from "../../lib/store";
import { del, post, put } from "../../lib/api";
import { isDark, shortDate, tint, fmtTime } from "../../lib/format";
import { localDateOf } from "../../../shared/dates";
import { StarChip } from "./taskKit";
import { StarStepper } from "./TaskForm";
import "./tasks.css";

type RewardInput = Pick<Reward, "title" | "description" | "emoji" | "cost" | "profileIds" | "renew">;

export default function RewardsScreen() {
  const { people, isPhone, profileById, run, celebrate } = useApp();
  const { data: rewards, reload } = useLive<Reward[]>("/api/rewards", ["rewards", "profiles"]);
  const { data: redemptions, reload: reloadRedemptions } = useLive<Redemption[]>("/api/redemptions", ["rewards", "stars"]);
  const [edit, setEdit] = useState<{ reward: Reward | null; profileIds?: number[] } | null>(null);
  const [redeem, setRedeem] = useState<{ reward: Reward; profile: Profile } | null>(null);
  const [redeemed, setRedeemed] = useState<{ reward: Reward; profile: Profile; pending: boolean } | null>(null);
  const [give, setGive] = useState(false);
  const [history, setHistory] = useState(false);
  const pending = (redemptions ?? []).filter((r) => r.status === "pending");

  const doRedeem = async (reward: Reward, profile: Profile) => {
    const r = await run(() => post<Redemption>(`/api/rewards/${reward.id}/redeem`, { profileId: profile.id }));
    if (!r) return;
    celebrate("reward", reward.emoji ? [reward.emoji, "⭐", "🎉", "✨"] : undefined);
    setRedeemed({ reward, profile, pending: r.status === "pending" });
    reload();
    reloadRedemptions();
  };
  const decide = async (r: Redemption, status: "approved" | "declined") => {
    await run(() => post(`/api/redemptions/${r.id}`, { status }), status === "approved" ? "Approved" : "Declined — stars returned");
    reloadRedemptions();
    reload();
  };

  return (
    <>
      <Header>
        <button className={`pill ${isPhone ? "icon" : ""}`} onClick={() => setGive(true)} aria-label="Give stars">
          <Star />
          {!isPhone && "Give stars"}
        </button>
        <button className={`pill ${isPhone ? "icon" : ""}`} onClick={() => setHistory(true)} aria-label="Star history">
          <History />
          {!isPhone && "History"}
        </button>
      </Header>
      <div className="screen no-pad tasks-screen">
        {pending.length > 0 && (
          <div className="rw-pending" aria-label="Waiting for approval">
            {pending.map((r) => {
              const p = profileById(r.profileId);
              return (
                <div key={r.id} className="rw-pending-row">
                  <Avatar profile={p} size={44} />
                  <span className="grow">
                    <b>{p?.name ?? "Someone"}</b> wants{" "}
                    <b>
                      {r.rewardEmoji} {r.rewardTitle}
                    </b>{" "}
                    <span className="muted">· ⭐ {r.stars}</span>
                  </span>
                  <button className="pill sm danger" onClick={() => decide(r, "declined")}>
                    Decline
                  </button>
                  <button className="pill sm primary" onClick={() => decide(r, "approved")}>
                    <Check />
                    Approve
                  </button>
                </div>
              );
            })}
          </div>
        )}
        {!rewards ? null : !people.length ? (
          <div className="empty" style={{ flex: 1 }}>
            <div className="big">🎁</div>
            <div>Add family members in Settings to start earning stars.</div>
          </div>
        ) : (
          <div className="rw-board">
            {[...people].sort((a, b) => Number(!rewards?.some((r) => r.profileIds.includes(a.id))) - Number(!rewards?.some((r) => r.profileIds.includes(b.id)))).map((p) => (
              <RewardColumn
                key={p.id}
                profile={p}
                rewards={(rewards ?? []).filter((r) => r.profileIds.includes(p.id))}
                loading={!rewards}
                pending={pending.filter((r) => r.profileId === p.id)}
                onRedeem={(reward) => setRedeem({ reward, profile: p })}
                onEdit={(reward) => setEdit({ reward })}
                onAdd={() => setEdit({ reward: null, profileIds: [p.id] })}
              />
            ))}
          </div>
        )}
      </div>
      <Fab onClick={() => setEdit({ reward: null })} label="Add reward" />

      {edit && <RewardForm reward={edit.reward} profileIds={edit.profileIds} onClose={() => setEdit(null)} onSaved={reload} />}
      {redeem && (
        <Confirm
          title={`Redeem ${redeem.reward.title}?`}
          message={
            <span>
              {redeem.profile.name} has ⭐ {redeem.profile.stars}. This uses ⭐ {redeem.reward.cost}, leaving ⭐ {redeem.profile.stars - redeem.reward.cost}.
            </span>
          }
          confirmLabel={`Redeem ⭐ ${redeem.reward.cost}`}
          danger={false}
          onClose={() => setRedeem(null)}
          onConfirm={() => doRedeem(redeem.reward, redeem.profile)}
        />
      )}
      {redeemed && (
        <Modal onClose={() => setRedeemed(null)} size="narrow">
          <div className="rw-celebrate">
            <div className="big">{redeemed.reward.emoji || "🎉"}</div>
            <div className="serif" style={{ fontSize: 38, lineHeight: 1.15, marginTop: 16 }}>
              🎉 {redeemed.profile.name} {redeemed.pending ? "asked for" : "redeemed"} {redeemed.reward.title}!
            </div>
            <div className="muted" style={{ marginTop: 10, fontSize: 18 }}>
              {redeemed.pending ? "A grown-up needs to approve it." : `⭐ ${redeemed.reward.cost} used`}
            </div>
          </div>
          <button className="pill lg block" style={{ marginTop: 10 }} onClick={() => setRedeemed(null)}>
            Yay!
          </button>
        </Modal>
      )}
      {give && <GiveStars onClose={() => setGive(false)} />}
      {history && <StarHistory onClose={() => setHistory(false)} />}
    </>
  );
}

function RewardColumn({
  profile,
  rewards,
  loading,
  pending,
  onRedeem,
  onEdit,
  onAdd,
}: {
  profile: Profile;
  rewards: Reward[];
  loading: boolean;
  pending: Redemption[];
  onRedeem: (r: Reward) => void;
  onEdit: (r: Reward) => void;
  onAdd: () => void;
}) {
  const c = profile.color;
  const strongText = isDark(c) ? "#fff" : "#1f1f1f";
  return (
    <section className="rw-col" style={{ background: tint(c, 0.08) }} aria-label={profile.name}>
      <header className="tasks-col-head">
        <Avatar profile={profile} size={76} />
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="serif tasks-col-name truncate">{profile.name}</div>
          <div className="tasks-col-chips">
            <StarChip n={profile.stars} color={c} />
          </div>
        </div>
      </header>
      <div className="rw-body">
        {!loading && rewards.length === 0 && (
          <div className="empty" style={{ flex: 1 }}>
            <div className="big">🎁</div>
            <div>No rewards yet.</div>
            <button className="pill white" onClick={onAdd}>
              Add a reward
            </button>
          </div>
        )}
        {rewards.map((r) => {
          const redeemedOnce = !r.renew && r.redeemedBy.includes(profile.id);
          const waiting = pending.some((x) => x.rewardId === r.id);
          const can = profile.stars >= r.cost;
          return (
            <div key={r.id} className="rw-card" role="button" tabIndex={0} onClick={() => onEdit(r)} aria-label={`${r.title}, ${r.cost} stars`}>
              <div className="rw-card-title serif">
                {r.emoji && <span className="e">{r.emoji}</span>}
                <span className="grow">{r.title}</span>
              </div>
              {r.description && <div className="rw-card-desc">{r.description}</div>}
              {waiting && (!r.renew || !can) ? (
                <div className="rw-muted">
                  <Hourglass size={18} /> Waiting for approval
                </div>
              ) : redeemedOnce ? (
                <div className="rw-muted">
                  Redeemed <Check size={18} />
                </div>
              ) : can ? (
                <button
                  className="rw-redeem"
                  style={{ background: c, color: strongText }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onRedeem(r);
                  }}
                >
                  Redeem <span aria-hidden>⭐</span> {r.cost}
                </button>
              ) : (
                <div className="rw-progress" style={{ background: tint(c, 0.22) }} aria-label={`${Math.max(0, profile.stars)} of ${r.cost} stars`}>
                  <span className="fill" style={{ width: `${Math.max(0, Math.min(100, (profile.stars / r.cost) * 100))}%`, background: tint(c, 0.5) }} />
                  <span className="lbl">
                    <Star size={18} /> {Math.max(0, profile.stars)}/{r.cost}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function RewardForm({ reward, profileIds, onClose, onSaved }: { reward: Reward | null; profileIds?: number[]; onClose: () => void; onSaved: () => void }) {
  const { toast } = useApp();
  const [r, setR] = useState<RewardInput>(() =>
    reward
      ? { title: reward.title, description: reward.description, emoji: reward.emoji, cost: reward.cost, profileIds: reward.profileIds, renew: reward.renew }
      : { title: "", description: "", emoji: "🎁", cost: 10, profileIds: profileIds ?? [], renew: true },
  );
  const [error, setError] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);
  const set = (p: Partial<RewardInput>) => {
    setR((x) => ({ ...x, ...p }));
    setError(null);
  };
  const save = async () => {
    if (!r.title.trim()) return setError("Give the reward a name.");
    if (!r.profileIds.length) return setError("Choose who can earn it.");
    try {
      if (reward) await put(`/api/rewards/${reward.id}`, r);
      else await post("/api/rewards", r);
      toast(reward ? "Reward saved" : "Reward added");
      onSaved();
      onClose();
    } catch (e) {
      if (e instanceof Error && e.message !== "Locked") setError(e.message);
    }
  };
  return (
    <Modal
      title={reward ? "Edit Reward" : "Add Reward"}
      onClose={onClose}
      footer={
        <>
          {reward && (
            <button className="pill danger" style={{ marginRight: "auto" }} onClick={() => setConfirmDel(true)}>
              <Trash2 />
              Delete
            </button>
          )}
          <button className="pill" onClick={onClose}>
            Cancel
          </button>
          <button className="pill primary" onClick={save}>
            {reward ? "Save" : "Add Reward"}
          </button>
        </>
      }
    >
      <div className="row" style={{ gap: 12 }}>
        <EmojiPicker value={r.emoji} onChange={(e) => set({ emoji: e })} size={68} />
        <input className="input big" placeholder="e.g. Ice cream trip" value={r.title} onChange={(e) => set({ title: e.target.value })} autoFocus={!reward} />
      </div>
      <textarea className="textarea" style={{ minHeight: 70 }} placeholder="Description (optional)" value={r.description} onChange={(e) => set({ description: e.target.value })} />
      <div className="check-row">
        <span className="grow">
          Stars needed
          <small>1 – 500</small>
        </span>
        <StarStepper value={r.cost} min={1} max={500} onChange={(n) => set({ cost: n })} />
      </div>
      <ToggleRow label="Renew after redeeming" hint="Can be redeemed again and again. Off = one time per person." on={r.renew} onChange={(v) => set({ renew: v })} />
      <Field label="Who can earn it">
        <ProfilePicker value={r.profileIds} onChange={(ids) => set({ profileIds: ids })} includeLabels={false} />
      </Field>
      {error && (
        <div className="error-text" role="alert">
          {error}
        </div>
      )}
      {confirmDel && reward && (
        <Confirm
          title={`Delete "${reward.title}"?`}
          message="Past redemptions stay in the star history."
          onClose={() => setConfirmDel(false)}
          onConfirm={async () => {
            try {
              await del(`/api/rewards/${reward.id}`);
              toast("Reward deleted");
              onSaved();
              onClose();
            } catch (e) {
              if (e instanceof Error && e.message !== "Locked") setError(e.message);
            }
          }}
        />
      )}
    </Modal>
  );
}

function GiveStars({ onClose }: { onClose: () => void }) {
  const { people, run, celebrate } = useApp();
  const [ids, setIds] = useState<number[]>([]);
  const [sign, setSign] = useState<1 | -1>(1);
  const [amount, setAmount] = useState(1);
  const [reason, setReason] = useState("");
  const chosen = people.filter((p) => ids.includes(p.id));
  const delta = sign * amount;
  const confirm = async () => {
    const ok = await run(
      () => post("/api/stars", { profileIds: ids, delta, reason: reason.trim() || (delta > 0 ? "Bonus stars" : "Stars removed") }),
      `${delta > 0 ? "Gave" : "Removed"} ⭐ ${amount}`,
    );
    if (ok) {
      if (delta > 0) celebrate("small", ["⭐", "🌟", "✨"]);
      onClose();
    }
  };
  return (
    <Modal
      title="Give Stars"
      onClose={onClose}
      size="narrow"
      footer={
        <>
          <button className="pill" onClick={onClose}>
            Cancel
          </button>
          <button className="pill primary" disabled={!ids.length || !amount} onClick={confirm}>
            Confirm
          </button>
        </>
      }
    >
      <Field label="Who">
        <ProfilePicker value={ids} onChange={setIds} includeLabels={false} />
      </Field>
      <div className="row wrap" style={{ gap: 12, justifyContent: "space-between" }}>
        <div className="segmented">
          <button className={sign === 1 ? "on" : ""} onClick={() => setSign(1)}>
            Give
          </button>
          <button className={sign === -1 ? "on" : ""} onClick={() => setSign(-1)}>
            Remove
          </button>
        </div>
        <span className="tasks-stepper-wrap">
          <StarStepper value={amount} min={1} max={500} onChange={setAmount} />
        </span>
      </div>
      <input className="input" placeholder={sign > 0 ? "Reason, e.g. Helped with groceries" : "Reason (optional)"} value={reason} onChange={(e) => setReason(e.target.value)} />
      {chosen.length > 0 && (
        <table className="rw-gs-table">
          <tbody>
            {chosen.map((p) => (
              <tr key={p.id}>
                <td style={{ width: 52 }}>
                  <Avatar profile={p} size={36} />
                </td>
                <td style={{ fontWeight: 600 }}>{p.name}</td>
                <td>
                  ⭐ {p.stars} <span className="muted">→</span> <span style={{ color: delta > 0 ? "var(--green)" : "var(--danger)" }}>{p.stars + delta}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Modal>
  );
}

function StarHistory({ onClose }: { onClose: () => void }) {
  const { people, settings, profileById } = useApp();
  const [pid, setPid] = useState<number | null>((people.find((p) => p.stars !== 0) ?? people[0])?.id ?? null);
  const { data } = useLive<StarLedgerEntry[]>(pid ? `/api/profiles/${pid}/ledger` : null, ["stars", "tasks", "rewards"]);
  const p = profileById(pid);
  return (
    <Modal title="Star History" onClose={onClose}>
      <ProfilePicker value={pid ? [pid] : []} onChange={(v) => v.length && setPid(v[0])} multiple={false} includeLabels={false} />
      {p && (
        <div className="row" style={{ gap: 10, fontSize: 20 }}>
          <span className="serif" style={{ fontSize: 28 }}>
            {p.name}
          </span>
          <StarChip n={p.stars} color={p.color} />
        </div>
      )}
      <div className="col" style={{ gap: 8 }}>
        {data && data.length === 0 && <div className="empty">No stars yet.</div>}
        {(data ?? []).map((e) => {
          const d = new Date(e.at);
          return (
            <div key={e.id} className="rw-ledger-row">
              <span className="grow">
                <div style={{ fontWeight: 600 }}>{e.reason}</div>
                <div className="muted" style={{ fontSize: 14 }}>
                  {shortDate(localDateOf(d))} · {fmtTime(`${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`, settings.clock24h)}
                </div>
              </span>
              <span className="d" style={{ color: e.delta > 0 ? "var(--green)" : "var(--danger)" }}>
                {e.delta > 0 ? "+" : ""}
                {e.delta} ⭐
              </span>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}
