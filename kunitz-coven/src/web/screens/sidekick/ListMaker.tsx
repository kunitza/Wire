import { useRef, useState } from "react";
import { Camera, Plus, ShoppingCart, Sparkles, X } from "lucide-react";
import { useApp } from "../../lib/store";
import { fileToAttachment, get, post } from "../../lib/api";
import { Field, Modal, ToggleRow } from "../../components/ui";
import { LIST_COLORS, plural } from "../../lib/format";
import type { List, ListItem } from "../../../shared/types";
import { AiErrorBox, FileThumbs, Thinking, aiCall } from "./parts";

interface Generated {
  name: string;
  items: { text: string; section: string }[];
}

const IDEAS = ["Packing list for a ski weekend", "First day of school supplies", "Birthday party for a 7-year-old", "Spring cleaning checklist", "Camping trip for 4"];

/** "Make a list": describe it (optionally with a photo, e.g. a handwritten list), preview, then create it. */
export function ListMakerDialog({ onClose }: { onClose: () => void }) {
  const { run, toast, go } = useApp();
  const [prompt, setPrompt] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [grocery, setGrocery] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Generated | null>(null);
  const [newItem, setNewItem] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const generate = async () => {
    setBusy(true);
    setError(null);
    const r = await aiCall(async () => {
      const atts = await Promise.all(files.map(fileToAttachment));
      return post<Generated>("/api/ai/list", { prompt, files: atts, grocery });
    });
    setBusy(false);
    if (r.error) setError(r.error);
    if (r.data) setResult({ name: r.data.name, items: r.data.items.filter((i) => i.text.trim()) });
  };

  const create = async (into?: List) => {
    if (!result) return;
    const items = result.items.map((i) => ({ text: i.text.trim(), section: i.section })).filter((i) => i.text);
    const ok = await run(async () => {
      const list =
        into ??
        (await post<List>("/api/lists", {
          name: result.name.trim() || "New list",
          color: grocery ? "#7FC8A9" : LIST_COLORS[Math.floor(Math.random() * LIST_COLORS.length)],
          kind: grocery ? "grocery" : "other",
          hideOnDevice: false,
        }));
      await post<ListItem[]>(`/api/lists/${list.id}/items`, { items });
      return list;
    });
    if (ok) {
      toast(into ? `${plural(items.length, "item")} added to ${into.name}` : `“${ok.name}” created`);
      onClose();
      go("lists");
    }
  };

  const addToGrocery = async () => {
    const data = await get<{ lists: List[] }>("/api/lists").catch(() => null);
    const g = data?.lists.find((l) => l.kind === "grocery");
    if (g) create(g);
    else create();
  };

  if (busy) {
    return (
      <Modal title="Make a list" onClose={onClose} size="narrow">
        <Thinking title="Making your list…" hint="Just a few seconds." />
      </Modal>
    );
  }

  if (result) {
    const sections = [...new Set(result.items.map((i) => i.section))];
    const setItem = (idx: number, text: string) => setResult({ ...result, items: result.items.map((it, j) => (j === idx ? { ...it, text } : it)) });
    const remove = (idx: number) => setResult({ ...result, items: result.items.filter((_, j) => j !== idx) });
    return (
      <Modal
        title="Your list"
        onClose={onClose}
        footer={
          <>
            <button className="pill" onClick={() => setResult(null)} style={{ marginRight: "auto" }}>
              Start over
            </button>
            {grocery && (
              <button className="pill" onClick={addToGrocery} disabled={!result.items.length}>
                <ShoppingCart />
                Add to Grocery List
              </button>
            )}
            <button className="pill primary" onClick={() => create()} disabled={!result.items.length || !result.name.trim()}>
              Create list
            </button>
          </>
        }
      >
        <Field label="List name">
          <input className="input big serif" value={result.name} onChange={(e) => setResult({ ...result, name: e.target.value })} />
        </Field>
        <div className="sk-list-preview">
          {sections.map((sec) => (
            <div key={sec} className="sk-list-section">
              {sec && <h4>{sec}</h4>}
              {result.items.map((it, idx) =>
                it.section === sec ? (
                  <div key={idx} className="sk-list-item">
                    <input value={it.text} onChange={(e) => setItem(idx, e.target.value)} aria-label="Item" />
                    <button className="icon-btn" style={{ width: 40, height: 40, background: "transparent" }} onClick={() => remove(idx)} aria-label={`Remove ${it.text}`}>
                      <X />
                    </button>
                  </div>
                ) : null,
              )}
            </div>
          ))}
          <form
            className="row"
            onSubmit={(e) => {
              e.preventDefault();
              if (!newItem.trim()) return;
              setResult({ ...result, items: [...result.items, { text: newItem.trim(), section: sections[sections.length - 1] ?? "" }] });
              setNewItem("");
            }}
          >
            <input className="input" placeholder="Add an item" value={newItem} onChange={(e) => setNewItem(e.target.value)} />
            <button className="pill icon" style={{ height: 56, width: 56 }} aria-label="Add item" disabled={!newItem.trim()}>
              <Plus />
            </button>
          </form>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      title="Make a list"
      onClose={onClose}
      footer={
        <>
          <button className="pill" onClick={onClose}>
            Cancel
          </button>
          <button className="pill primary" disabled={!prompt.trim() && !files.length} onClick={generate}>
            <Sparkles />
            Make my list
          </button>
        </>
      }
    >
      <Field label="What's the list for?">
        <textarea
          className="textarea"
          placeholder="e.g. Packing list for a ski weekend with two kids"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          autoFocus
          onKeyDown={(e) => e.key === "Enter" && (e.metaKey || e.ctrlKey) && generate()}
        />
      </Field>
      <div className="chips">
        {IDEAS.map((i) => (
          <button key={i} type="button" className="chip text-only" style={{ height: 40, fontSize: 15 }} onClick={() => setPrompt(i)}>
            {i}
          </button>
        ))}
      </div>
      <div className="row wrap">
        <button type="button" className="pill" onClick={() => fileRef.current?.click()}>
          <Camera />
          Add a photo (optional)
        </button>
        <span className="muted" style={{ fontSize: 14 }}>
          A handwritten list, a recipe or a supply list.
        </span>
      </div>
      <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => (e.target.files && setFiles([...files, ...Array.from(e.target.files)].slice(0, 4)), (e.target.value = ""))} />
      <FileThumbs files={files} onRemove={(i) => setFiles(files.filter((_, j) => j !== i))} />
      <ToggleRow label="It's a grocery list" hint="Sort items into store sections." on={grocery} onChange={setGrocery} />
      {error && <AiErrorBox message={error} onClose={onClose} />}
    </Modal>
  );
}
