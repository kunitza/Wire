import { useEffect, useRef, useState } from "react";
import { Camera, Keyboard, Link as LinkIcon, Sparkles, X, ImagePlus } from "lucide-react";
import type { Recipe } from "../../../shared/types";
import { fileToAttachment, post, put } from "../../lib/api";
import { useApp } from "../../lib/store";
import { EmojiPicker, Field, Modal } from "../../components/ui";
import { AiErrorNote, AiWorking, toAiFail, type AiFail } from "./ai";
import { CategoryChips, Stepper } from "./shared";

export interface RecipeDraft {
  title: string;
  emoji: string;
  categoryId: number | null;
  /** One ingredient per line. */
  ingredients: string;
  instructions: string;
  sourceUrl: string;
}

export const draftFromRecipe = (r?: Partial<Recipe>): RecipeDraft => ({
  title: r?.title ?? "",
  emoji: r?.emoji ?? "",
  categoryId: r?.categoryId ?? null,
  ingredients: (r?.ingredients ?? []).join("\n"),
  instructions: r?.instructions ?? "",
  sourceUrl: r?.sourceUrl ?? "",
});

export const recipeBody = (d: RecipeDraft, favorite = false) => ({
  title: d.title.trim(),
  emoji: d.emoji,
  categoryId: d.categoryId,
  ingredients: d.ingredients
    .split("\n")
    .map((s) => s.replace(/^\s*[-•*]\s*/, "").trim())
    .filter(Boolean),
  instructions: d.instructions.trim(),
  sourceUrl: d.sourceUrl.trim(),
  favorite,
});

/** Controlled recipe fields: title + emoji, category, ingredients (one per line), instructions, source link. */
export function RecipeForm({ value, onChange, autoFocus }: { value: RecipeDraft; onChange: (d: RecipeDraft) => void; autoFocus?: boolean }) {
  const { mealCategories } = useApp();
  const set = (p: Partial<RecipeDraft>) => onChange({ ...value, ...p });
  return (
    <>
      <div className="row">
        <EmojiPicker value={value.emoji} onChange={(emoji) => set({ emoji })} size={68} />
        <input
          className="input big grow"
          autoFocus={autoFocus}
          placeholder="Recipe name"
          value={value.title}
          onChange={(e) => set({ title: e.target.value })}
          aria-label="Recipe name"
        />
      </div>
      <Field label="Category">
        <CategoryChips cats={mealCategories} value={value.categoryId} onChange={(id) => set({ categoryId: value.categoryId === id ? null : id })} />
      </Field>
      <Field label="Ingredients (one per line)">
        <textarea
          className="textarea"
          style={{ minHeight: 150 }}
          placeholder={"2 cups flour\n1 tsp salt"}
          value={value.ingredients}
          onChange={(e) => set({ ingredients: e.target.value })}
        />
      </Field>
      <Field label="Instructions">
        <textarea
          className="textarea"
          style={{ minHeight: 150 }}
          placeholder="1. Preheat the oven…"
          value={value.instructions}
          onChange={(e) => set({ instructions: e.target.value })}
        />
      </Field>
      <Field label="Source link">
        <input className="input" type="url" placeholder="https://" value={value.sourceUrl} onChange={(e) => set({ sourceUrl: e.target.value })} />
      </Field>
    </>
  );
}

/** Edit an existing recipe (or create one from a draft). */
export function RecipeModal({ recipe, onClose, onSaved }: { recipe?: Recipe; onClose: () => void; onSaved?: (r: Recipe) => void }) {
  const { run } = useApp();
  const [d, setD] = useState(() => draftFromRecipe(recipe));
  const save = async () => {
    const body = recipeBody(d, recipe?.favorite);
    const out = await run(
      () => (recipe ? put<Recipe>(`/api/recipes/${recipe.id}`, body) : post<Recipe>("/api/recipes", body)),
      recipe ? "Recipe saved" : "Saved to Recipes",
    );
    if (out) {
      onSaved?.(out);
      onClose();
    }
  };
  return (
    <Modal
      title={recipe ? "Edit recipe" : "New recipe"}
      onClose={onClose}
      footer={
        <>
          <button className="pill" onClick={onClose}>
            Cancel
          </button>
          <button className="pill primary" disabled={!d.title.trim()} onClick={save}>
            Save
          </button>
        </>
      }
    >
      <RecipeForm value={d} onChange={setD} autoFocus={!recipe} />
    </Modal>
  );
}

type Tab = "type" | "sidekick" | "fridge" | "link";
const TABS: { id: Tab; label: string; icon: typeof Keyboard }[] = [
  { id: "type", label: "Type", icon: Keyboard },
  { id: "sidekick", label: "Sidekick", icon: Sparkles },
  { id: "fridge", label: "Fridge photo", icon: Camera },
  { id: "link", label: "From link", icon: LinkIcon },
];

/** New recipe: type it in, or let Sidekick write it (from a prompt, fridge photos or a link). The draft is editable before saving. */
export function NewRecipeModal({ onClose, onSaved, initialTab = "type" }: { onClose: () => void; onSaved?: (r: Recipe) => void; initialTab?: Tab }) {
  const { mealCategories, run } = useApp();
  const [tab, setTab] = useState<Tab>(initialTab);
  const [draft, setDraft] = useState<RecipeDraft>(() => draftFromRecipe());
  const [generated, setGenerated] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [url, setUrl] = useState("");
  const [servings, setServings] = useState(4);
  const [categoryId, setCategoryId] = useState<number | null>(
    mealCategories.find((c) => c.name.toLowerCase() === "dinner")?.id ?? mealCategories[0]?.id ?? null,
  );
  const [photos, setPhotos] = useState<{ file: File; url: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AiFail | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const photosRef = useRef(photos);
  photosRef.current = photos;
  useEffect(() => () => photosRef.current.forEach((p) => URL.revokeObjectURL(p.url)), []);

  const showForm = tab === "type" || generated;

  const generate = async () => {
    setBusy(true);
    setError(null);
    try {
      const category = mealCategories.find((c) => c.id === categoryId)?.name ?? "Dinner";
      const body: Record<string, unknown> = { prompt, category, servings };
      if (tab === "fridge") body.photos = await Promise.all(photos.map((p) => fileToAttachment(p.file)));
      if (tab === "link") body.url = url.trim();
      const out = await post<{ title: string; emoji: string; ingredients: string[]; instructions: string }>("/api/ai/recipe", body);
      setDraft(draftFromRecipe({ ...out, categoryId, sourceUrl: tab === "link" ? url.trim() : "" }));
      setGenerated(true);
    } catch (e) {
      setError(toAiFail(e));
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    const out = await run(() => post<Recipe>("/api/recipes", recipeBody(draft)), "Saved to Recipes");
    if (out) {
      onSaved?.(out);
      onClose();
    }
  };

  const canGenerate =
    tab === "sidekick" ? !!prompt.trim() : tab === "fridge" ? photos.length > 0 : tab === "link" ? /^https?:\/\/\S+\.\S+/.test(url.trim()) : false;

  return (
    <Modal
      title={generated ? "Review recipe" : "New recipe"}
      onClose={onClose}
      footer={
        showForm ? (
          <>
            {generated && (
              <button className="pill" onClick={() => setGenerated(false)} style={{ marginRight: "auto" }}>
                Back
              </button>
            )}
            <button className="pill" onClick={onClose}>
              Cancel
            </button>
            <button className="pill primary" disabled={!draft.title.trim()} onClick={save}>
              Save to Recipes
            </button>
          </>
        ) : (
          <>
            <button className="pill" onClick={onClose}>
              Cancel
            </button>
            <button className="pill primary" disabled={!canGenerate || busy} onClick={generate}>
              <Sparkles />
              Generate recipe
            </button>
          </>
        )
      }
    >
      {!generated && (
        <div className="segmented" role="tablist" style={{ alignSelf: "flex-start", maxWidth: "100%", overflowX: "auto" }}>
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              className={tab === t.id ? "on" : ""}
              onClick={() => {
                setTab(t.id);
                setError(null);
              }}
            >
              <t.icon />
              {t.label}
            </button>
          ))}
        </div>
      )}
      {busy ? (
        <AiWorking
          text={tab === "fridge" ? "Sidekick is looking in your fridge…" : tab === "link" ? "Sidekick is reading the recipe…" : "Sidekick is writing a recipe…"}
        />
      ) : showForm ? (
        <>
          {generated && (
            <div className="nr-draft-note">
              <Sparkles size={20} />
              Here's a draft from Sidekick. Make any changes, then save it.
            </div>
          )}
          <RecipeForm value={draft} onChange={setDraft} autoFocus={tab === "type"} />
        </>
      ) : (
        <>
          {tab === "sidekick" && (
            <Field label="What would you like to make?">
              <textarea
                className="textarea"
                autoFocus
                placeholder="e.g. A cozy one-pot chicken soup the kids will eat"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
              />
            </Field>
          )}
          {tab === "fridge" && (
            <>
              <Field label="Photos of your fridge or pantry (up to 5)">
                <div className="nr-photos">
                  {photos.map((p, i) => (
                    <div key={p.url} className="nr-photo" style={{ backgroundImage: `url(${p.url})` }}>
                      <button type="button" aria-label="Remove photo" onClick={() => setPhotos(photos.filter((_, j) => j !== i))}>
                        <X size={16} />
                      </button>
                    </div>
                  ))}
                  {photos.length < 5 && (
                    <button type="button" className="nr-add-photo" onClick={() => fileRef.current?.click()}>
                      <ImagePlus size={28} />
                      Add photo
                    </button>
                  )}
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  multiple
                  hidden
                  onChange={(e) => {
                    const files = Array.from(e.target.files ?? []).filter((f) => f.type.startsWith("image/"));
                    setPhotos([...photos, ...files.map((file) => ({ file, url: URL.createObjectURL(file) }))].slice(0, 5));
                    e.target.value = "";
                  }}
                />
              </Field>
              <Field label="Craving something?">
                <input className="input" placeholder="Optional, e.g. something with pasta" value={prompt} onChange={(e) => setPrompt(e.target.value)} />
              </Field>
            </>
          )}
          {tab === "link" && (
            <Field label="Recipe link">
              <input
                className="input"
                type="url"
                autoFocus
                placeholder="https://www.example.com/best-lasagna"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            </Field>
          )}
          {tab !== "link" && (
            <div className="form-grid">
              <Field label="Servings">
                <Stepper value={servings} onChange={setServings} label="Servings" />
              </Field>
            </div>
          )}
          <Field label="Category">
            <CategoryChips cats={mealCategories} value={categoryId} onChange={setCategoryId} />
          </Field>
          {error && <AiErrorNote error={error} onNavigate={onClose} />}
        </>
      )}
    </Modal>
  );
}
