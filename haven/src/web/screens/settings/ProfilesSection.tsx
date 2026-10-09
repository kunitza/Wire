import { useState } from "react";
import { ChevronDown, ChevronUp, Pencil, Plus, Trash2 } from "lucide-react";
import { useApp } from "../../lib/store";
import { del, post, put } from "../../lib/api";
import { Avatar, ColorSwatches, Confirm, EmojiPicker, Field, Modal, Stars } from "../../components/ui";
import { PROFILE_COLORS, tint } from "../../lib/format";
import type { Profile, ProfileKind } from "../../../shared/types";
import { Group, SectionTitle } from "./common";

export default function ProfilesSection() {
  const { profiles, run } = useApp();
  const [editing, setEditing] = useState<Profile | "new" | null>(null);
  const move = (i: number, dir: -1 | 1) => {
    const ids = profiles.map((p) => p.id);
    const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    run(() => post("/api/profiles/reorder", { ids }));
  };
  return (
    <>
      <SectionTitle lead="Profiles are the people (and groups like “Family”) that events, chores and rewards belong to. Labels are for things like Holidays or Soccer.">
        <span className="grow">Profiles</span>
        <button className="pill primary" onClick={() => setEditing("new")}>
          <Plus />
          Add
        </button>
      </SectionTitle>

      <Group hint="The order here is the order of columns on the Tasks screen and avatars across Haven.">
        {profiles.length === 0 && (
          <div className="empty">
            <div className="big">👋</div>
            Add the people in your family to get started.
          </div>
        )}
        {profiles.map((p, i) => (
          <div key={p.id} className="set-profile-row" style={{ background: tint(p.color, 0.12) }}>
            <Avatar profile={p} size={52} />
            <div className="grow" style={{ minWidth: 0 }}>
              <div className="name truncate">{p.name}</div>
              <div className="row" style={{ gap: 10, marginTop: 4 }}>
                <span className="set-badge" style={{ background: p.kind === "label" ? "#fff" : tint(p.color, 0.3) }}>
                  {p.kind === "label" ? "Label" : "Profile"}
                </span>
                {p.kind === "profile" && <Stars n={p.stars} style={{ fontSize: 15 }} />}
                {p.birthday && <span className="muted" style={{ fontSize: 15 }}>🎂 {p.birthday.slice(5).replace("-", "/")}</span>}
              </div>
            </div>
            <button className="icon-btn" style={{ background: "#fff" }} onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move ${p.name} up`}>
              <ChevronUp />
            </button>
            <button
              className="icon-btn"
              style={{ background: "#fff" }}
              onClick={() => move(i, 1)}
              disabled={i === profiles.length - 1}
              aria-label={`Move ${p.name} down`}
            >
              <ChevronDown />
            </button>
            <button className="icon-btn" style={{ background: "#fff" }} onClick={() => setEditing(p)} aria-label={`Edit ${p.name}`}>
              <Pencil />
            </button>
          </div>
        ))}
      </Group>
      {editing && <ProfileEditor profile={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </>
  );
}

export function ProfileEditor({ profile, onClose }: { profile: Profile | null; onClose: () => void }) {
  const { run, profiles } = useApp();
  const used = new Set(profiles.map((p) => p.color.toLowerCase()));
  const [name, setName] = useState(profile?.name ?? "");
  const [kind, setKind] = useState<ProfileKind>(profile?.kind ?? "profile");
  const [color, setColor] = useState(profile?.color ?? PROFILE_COLORS.find((c) => !used.has(c.toLowerCase())) ?? PROFILE_COLORS[0]);
  const [avatar, setAvatar] = useState(profile?.avatar ?? "");
  const [useEmoji, setUseEmoji] = useState(!!profile?.avatar || !profile);
  const [birthday, setBirthday] = useState(profile?.birthday ?? "");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const preview: Profile = { id: 0, name: name || "?", color, avatar: useEmoji ? avatar : "", kind, birthday: null, sort: 0, stars: 0 };

  const saveIt = async () => {
    const body = { name: name.trim(), kind, color, avatar: useEmoji ? avatar : "", birthday: kind === "profile" ? birthday || null : null };
    const ok = await run(() => (profile ? put(`/api/profiles/${profile.id}`, body) : post("/api/profiles", body)), profile ? "Profile saved" : `${body.name} added`);
    if (ok) onClose();
  };

  return (
    <Modal
      title={profile ? `Edit ${profile.name}` : kind === "label" ? "New label" : "New profile"}
      onClose={onClose}
      footer={
        <>
          {profile && (
            <button className="pill danger" onClick={() => setConfirmDelete(true)} style={{ marginRight: "auto" }}>
              <Trash2 />
              Delete
            </button>
          )}
          <button className="pill" onClick={onClose}>
            Cancel
          </button>
          <button className="pill primary" disabled={!name.trim()} onClick={saveIt}>
            Save
          </button>
        </>
      }
    >
      <div className="row" style={{ gap: 18 }}>
        <Avatar profile={preview} size={84} />
        <Field label="Name" style={{ flex: 1 }}>
          <input className="input big" value={name} onChange={(e) => setName(e.target.value)} placeholder={kind === "label" ? "e.g. Soccer" : "e.g. Emma"} autoFocus maxLength={30} />
        </Field>
      </div>
      <Field label="Type">
        <div className="segmented" style={{ alignSelf: "flex-start" }}>
          <button type="button" className={kind === "profile" ? "on" : ""} onClick={() => setKind("profile")}>
            Profile (a person or group)
          </button>
          <button type="button" className={kind === "label" ? "on" : ""} onClick={() => setKind("label")}>
            Label (a category)
          </button>
        </div>
      </Field>
      <Field label="Color">
        <ColorSwatches value={color} onChange={setColor} colors={PROFILE_COLORS} />
      </Field>
      <Field label="Avatar">
        <div className="row wrap" style={{ gap: 12 }}>
          <div className="segmented">
            <button type="button" className={useEmoji ? "on" : ""} onClick={() => setUseEmoji(true)}>
              Emoji
            </button>
            <button type="button" className={!useEmoji ? "on" : ""} onClick={() => setUseEmoji(false)}>
              Initial
            </button>
          </div>
          {useEmoji && <EmojiPicker value={avatar} onChange={setAvatar} size={52} />}
        </div>
      </Field>
      {kind === "profile" && (
        <Field label="Birthday (optional)">
          <input className="input" type="date" value={birthday} onChange={(e) => setBirthday(e.target.value)} style={{ maxWidth: 260 }} />
        </Field>
      )}
      {confirmDelete && profile && (
        <Confirm
          title={`Delete ${profile.name}?`}
          message={
            <>
              Events, chores, routines and rewards that belong <b>only</b> to {profile.name} will be removed too. Shared items stay for everyone else.
              {profile.stars > 0 && ` ${profile.name}'s ${profile.stars} stars will be lost.`}
            </>
          }
          onConfirm={async () => {
            if (await run(() => del(`/api/profiles/${profile.id}`), `${profile.name} deleted`)) onClose();
          }}
          onClose={() => setConfirmDelete(false)}
        />
      )}
    </Modal>
  );
}
