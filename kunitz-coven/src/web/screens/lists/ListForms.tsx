import { useRef, useState } from "react";
import { Camera, Sparkles, X } from "lucide-react";
import type { List, ListItem } from "../../../shared/types";
import { fileToAttachment, post, put } from "../../lib/api";
import { LIST_COLORS, tint } from "../../lib/format";
import { useApp } from "../../lib/store";
import { ColorSwatches, Field, Modal, ToggleRow } from "../../components/ui";
import { AiErrorNote, AiWorking, toAiFail, type AiFail } from "../meals/ai";

const KINDS: { id: List["kind"]; label: string; emoji: string }[] = [
  { id: "todo", label: "To do", emoji: "✅" },
  { id: "grocery", label: "Grocery", emoji: "🛒" },
  { id: "other", label: "Other", emoji: "📝" },
];

/** Create or edit a list (name, type, color, hide on device). */
export function ListEditModal({ list, lists, onClose, onSaved }: { list?: List; lists: List[]; onClose: () => void; onSaved?: (l: List) => void }) {
  const { run } = useApp();
  const unused = LIST_COLORS.find((c) => !lists.some((l) => l.color.toLowerCase() === c.toLowerCase())) ?? LIST_COLORS[lists.length % LIST_COLORS.length];
  const [name, setName] = useState(list?.name ?? "");
  const [kind, setKind] = useState<List["kind"]>(list?.kind ?? "todo");
  const [color, setColor] = useState(list?.color ?? unused);
  const [hide, setHide] = useState(list?.hideOnDevice ?? false);
  const save = async () => {
    const body = { name: name.trim(), kind, color, hideOnDevice: hide };
    if (!body.name) return;
    if (list) {
      if (await run(() => put(`/api/lists/${list.id}`, body), "List saved")) onClose();
    } else {
      const out = await run(() => post<List>("/api/lists", body));
      if (out) {
        onSaved?.(out);
        onClose();
      }
    }
  };
  return (
    <Modal
      title={list ? "Edit list" : "New list"}
      onClose={onClose}
      size="narrow"
      footer={
        <>
          <button className="pill" onClick={onClose}>
            Cancel
          </button>
          <button className="pill primary" disabled={!name.trim()} onClick={save}>
            {list ? "Save" : "Create list"}
          </button>
        </>
      }
    >
      <input
        className="input big"
        autoFocus
        placeholder="List name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && save()}
        style={{ background: tint(color, 0.22) }}
        aria-label="List name"
      />
      <Field label="Type">
        <div className="segmented" style={{ alignSelf: "flex-start" }}>
          {KINDS.map((k) => (
            <button key={k.id} type="button" className={kind === k.id ? "on" : ""} onClick={() => setKind(k.id)}>
              <span aria-hidden>{k.emoji}</span>
              {k.label}
            </button>
          ))}
        </div>
      </Field>
      <Field label="Color">
        <ColorSwatches value={color} onChange={setColor} colors={LIST_COLORS} />
      </Field>
      <ToggleRow label="Hide on wall display" hint="Only show this list on phones" on={hide} onChange={setHide} />
    </Modal>
  );
}

interface Draft {
  name: string;
  items: { text: string; section: string; on: boolean }[];
}

/** "Make a list with Sidekick": prompt (and/or photo) -> preview -> create list. */
export function AiListModal({ lists, onClose, onCreated }: { lists: List[]; onClose: () => void; onCreated?: (l: List) => void }) {
  const { run, toast } = useApp();
  const [prompt, setPrompt] = useState("");
  const [grocery, setGrocery] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AiFail | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [color, setColor] = useState(LIST_COLORS.find((c) => !lists.some((l) => l.color.toLowerCase() === c.toLowerCase())) ?? LIST_COLORS[0]);
  const fileRef = useRef<HTMLInputElement>(null);

  const generate = async () => {
    setBusy(true);
    setError(null);
    try {
      const attachments = await Promise.all(files.map(fileToAttachment));
      const out = await post<{ name: string; items: { text: string; section: string }[] }>("/api/ai/list", { prompt, files: attachments, grocery });
      setDraft({ name: out.name, items: out.items.map((i) => ({ ...i, on: true })) });
    } catch (e) {
      setError(toAiFail(e));
    } finally {
      setBusy(false);
    }
  };

  const create = async () => {
    if (!draft) return;
    const chosen = draft.items.filter((i) => i.on && i.text.trim());
    const list = await run(() =>
      post<List>("/api/lists", { name: draft.name.trim() || "New list", kind: grocery ? "grocery" : "other", color, hideOnDevice: false }),
    );
    if (!list) return;
    if (chosen.length) await run(() => post<ListItem[]>(`/api/lists/${list.id}/items`, { items: chosen.map(({ text, section }) => ({ text, section })) }));
    toast(`Created “${list.name}”`);
    onCreated?.(list);
    onClose();
  };

  const sections = draft ? [...new Set(draft.items.map((i) => i.section))] : [];
  return (
    <Modal
      title={
        <span className="row" style={{ gap: 12 }}>
          <Sparkles size={28} color="#6b5bd6" />
          {draft ? "Review your list" : "Make a list with Sidekick"}
        </span>
      }
      onClose={onClose}
      footer={
        draft ? (
          <>
            <button className="pill" onClick={() => setDraft(null)}>
              Back
            </button>
            <button className="pill primary" onClick={create} disabled={!draft.items.some((i) => i.on)}>
              Create list ({draft.items.filter((i) => i.on).length})
            </button>
          </>
        ) : (
          <>
            <button className="pill" onClick={onClose}>
              Cancel
            </button>
            <button className="pill primary" onClick={generate} disabled={busy || (!prompt.trim() && !files.length)}>
              <Sparkles />
              Make list
            </button>
          </>
        )
      }
    >
      {busy ? (
        <AiWorking text="Sidekick is writing your list…" />
      ) : draft ? (
        <>
          <input
            className="input big"
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            aria-label="List name"
            style={{ background: tint(color, 0.22) }}
          />
          <ColorSwatches value={color} onChange={setColor} colors={LIST_COLORS} />
          <div className="col" style={{ gap: 8 }}>
            {sections.map((s) => (
              <div key={s || "_"} className="col" style={{ gap: 8 }}>
                {s && <div className="ai-preview-sec">{s}</div>}
                {draft.items.map((it, idx) =>
                  it.section !== s ? null : (
                    <label key={idx} className={`ai-preview-row ${it.on ? "" : "off"}`}>
                      <input
                        type="checkbox"
                        checked={it.on}
                        onChange={(e) => setDraft({ ...draft, items: draft.items.map((x, j) => (j === idx ? { ...x, on: e.target.checked } : x)) })}
                        style={{ width: 22, height: 22, accentColor: "var(--blue)" }}
                      />
                      <input
                        type="text"
                        value={it.text}
                        onChange={(e) => setDraft({ ...draft, items: draft.items.map((x, j) => (j === idx ? { ...x, text: e.target.value } : x)) })}
                      />
                    </label>
                  ),
                )}
              </div>
            ))}
          </div>
        </>
      ) : (
        <>
          <Field label="What do you need a list for?">
            <textarea
              className="textarea"
              autoFocus
              placeholder="e.g. Packing list for a beach weekend with two kids"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
            />
          </Field>
          <div className="row wrap">
            <button className="pill" type="button" onClick={() => fileRef.current?.click()}>
              <Camera />
              Add a photo or file
            </button>
            {files.map((f, i) => (
              <span key={i} className="chip text-only" style={{ paddingRight: 6 }}>
                <span className="truncate" style={{ maxWidth: 200 }}>
                  {f.name}
                </span>
                <button
                  type="button"
                  className="icon-btn"
                  style={{ width: 32, height: 32, background: "transparent" }}
                  aria-label="Remove file"
                  onClick={() => setFiles(files.filter((_, j) => j !== i))}
                >
                  <X size={16} />
                </button>
              </span>
            ))}
            <input
              ref={fileRef}
              type="file"
              accept="image/*,application/pdf,text/plain"
              multiple
              hidden
              onChange={(e) => {
                setFiles([...files, ...Array.from(e.target.files ?? [])].slice(0, 5));
                e.target.value = "";
              }}
            />
          </div>
          <ToggleRow label="It's a shopping list" hint="Group items by store section" on={grocery} onChange={setGrocery} />
          {error && <AiErrorNote error={error} onNavigate={onClose} />}
        </>
      )}
    </Modal>
  );
}
