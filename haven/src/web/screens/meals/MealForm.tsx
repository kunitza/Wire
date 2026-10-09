import { useMemo, useState } from "react";
import { BookOpen, CalendarDays, Link2, Pencil, Repeat as RepeatIcon, ShoppingCart, StickyNote, Tag, Trash2, X, List as ListIcon } from "lucide-react";
import type { Meal, Recipe, Repeat } from "../../../shared/types";
import { describeRepeat } from "../../../shared/dates";
import { del, post, put } from "../../lib/api";
import { longDate } from "../../lib/format";
import { useApp, useLive } from "../../lib/store";
import { Confirm, Field, Modal, RepeatEditor, ToggleRow } from "../../components/ui";
import { AddToListModal, CategoryChips, CategoryDot, recipeRequest } from "./shared";

export interface MealDraft {
  date: string;
  categoryId: number;
  title: string;
  recipeId: number | null;
  notes: string;
  repeat: Repeat;
  repeatUntil: string | null;
}

/**
 * Add or edit a planned meal ("What are we eating?" with recipe autocomplete).
 * Pass `meal` to edit; `initial` pre-fills a new meal (e.g. the tapped day + category, or a recipe to plan).
 */
export function MealForm({ meal, initial, onClose, onSaved }: { meal?: Meal; initial?: Partial<MealDraft>; onClose: () => void; onSaved?: () => void }) {
  const { mealCategories, today, run } = useApp();
  const { data: recipes } = useLive<Recipe[]>("/api/recipes", ["recipes"]);
  const cats = mealCategories;
  const [d, setD] = useState<MealDraft>(() => ({
    date: meal?.date ?? initial?.date ?? today,
    categoryId: meal?.categoryId ?? initial?.categoryId ?? cats.find((c) => c.visible)?.id ?? cats[0]?.id,
    title: meal?.title ?? initial?.title ?? "",
    recipeId: meal?.recipeId ?? initial?.recipeId ?? null,
    notes: meal?.notes ?? initial?.notes ?? "",
    repeat: meal?.repeat ?? initial?.repeat ?? { type: "none" },
    repeatUntil: meal?.repeatUntil ?? initial?.repeatUntil ?? null,
  }));
  const [saveRecipe, setSaveRecipe] = useState(false);
  const [suggest, setSuggest] = useState(false);
  const [scopeAsk, setScopeAsk] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const set = (p: Partial<MealDraft>) => setD((x) => ({ ...x, ...p }));
  const linked = recipes?.find((r) => r.id === d.recipeId);
  const q = d.title.trim().toLowerCase();
  const matches = useMemo(
    () =>
      (recipes ?? [])
        .filter((r) => r.id !== d.recipeId && (!q || r.title.toLowerCase().includes(q)))
        .sort((a, b) => Number(b.categoryId === d.categoryId) - Number(a.categoryId === d.categoryId) || Number(b.favorite) - Number(a.favorite))
        .slice(0, 6),
    [recipes, q, d.recipeId, d.categoryId],
  );

  const body = (draft: MealDraft) => ({ ...draft, title: draft.title.trim(), repeatUntil: draft.repeat.type === "none" ? null : draft.repeatUntil });

  const save = async (scope?: string) => {
    if (!d.title.trim()) return;
    let draft = d;
    if (saveRecipe && !d.recipeId) {
      const r = await run(() =>
        post<Recipe>("/api/recipes", {
          title: d.title.trim(),
          emoji: "",
          categoryId: d.categoryId,
          ingredients: [],
          instructions: d.notes,
          sourceUrl: "",
          favorite: false,
        }),
      );
      if (!r) return;
      draft = { ...d, recipeId: r.id };
    }
    let ok: unknown;
    if (!meal) ok = await run(() => post("/api/meals", body(draft)), "Meal added");
    else if (meal.recurring && scope === "this") {
      ok = await run(async () => {
        await del(`/api/meals/${meal.id}?occurrence=${meal.date}`);
        return post("/api/meals", body({ ...draft, repeat: { type: "none" }, repeatUntil: null }));
      }, "Meal updated");
    } else {
      // Editing the whole series keeps its first date unless the date was changed here.
      const start = meal.recurring && draft.date === meal.date ? (meal.seriesStart ?? meal.date) : draft.date;
      ok = await run(() => put(`/api/meals/${meal.id}`, body({ ...draft, date: start })), "Meal updated");
    }
    if (ok) {
      onSaved?.();
      onClose();
    }
  };

  const trySave = () => {
    if (meal?.recurring) setScopeAsk(true);
    else save();
  };

  return (
    <Modal
      title={meal ? "Edit meal" : "Add meal"}
      onClose={onClose}
      footer={
        <>
          {meal && (
            <button className="pill danger" onClick={() => setDeleting(true)} style={{ marginRight: "auto" }}>
              <Trash2 />
              Delete
            </button>
          )}
          <button className="pill" onClick={onClose}>
            Cancel
          </button>
          <button className="pill primary" disabled={!d.title.trim()} onClick={trySave}>
            Save
          </button>
        </>
      }
    >
      <div className="mf-title">
        <input
          className="input big"
          autoFocus={!meal && !d.title}
          placeholder="What are we eating?"
          value={d.title}
          onChange={(e) => {
            const title = e.target.value;
            set({ title, recipeId: title.trim() ? d.recipeId : null });
            setSuggest(true);
          }}
          onFocus={() => !d.title && setSuggest(true)}
          onBlur={() => setTimeout(() => setSuggest(false), 150)}
          onKeyDown={(e) => {
            if (e.key === "Escape" && suggest && matches.length > 0) {
              // Only close the suggestions, not the whole form.
              e.stopPropagation();
              setSuggest(false);
            }
            if (e.key === "Enter" && !suggest) trySave();
          }}
          aria-label="Meal"
        />
        {suggest && matches.length > 0 && (
          <div className="mf-suggest" role="listbox">
            <div className="mf-suggest-head">From your recipes</div>
            {matches.map((r) => (
              <button
                key={r.id}
                type="button"
                role="option"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  set({ title: r.title, recipeId: r.id, categoryId: d.title ? d.categoryId : (r.categoryId ?? d.categoryId) });
                  setSuggest(false);
                }}
              >
                <span className="mf-emoji">{r.emoji || "🍽️"}</span>
                <span className="grow truncate">{r.title}</span>
                <CategoryDot cat={cats.find((c) => c.id === r.categoryId)} size={26} />
              </button>
            ))}
          </div>
        )}
      </div>
      {linked && (
        <div className="mf-linked">
          <Link2 size={18} />
          <span className="grow truncate">
            Recipe: <b>{linked.title}</b>
          </span>
          <button
            type="button"
            className="icon-btn"
            style={{ width: 34, height: 34, background: "transparent" }}
            aria-label="Unlink recipe"
            onClick={() => set({ recipeId: null })}
          >
            <X size={18} />
          </button>
        </div>
      )}
      <div className="form-grid">
        <Field label="Date">
          <input className="input" type="date" value={d.date} onChange={(e) => e.target.value && set({ date: e.target.value })} />
        </Field>
      </div>
      <Field label="Category">
        <CategoryChips cats={cats} value={d.categoryId} onChange={(id) => set({ categoryId: id })} />
      </Field>
      <RepeatEditor
        value={d.repeat}
        onChange={(repeat) => set({ repeat })}
        anchorDate={d.date}
        until={d.repeatUntil}
        onUntil={(repeatUntil) => set({ repeatUntil })}
      />
      <Field label="Notes">
        <textarea className="textarea" style={{ minHeight: 80 }} placeholder="Optional" value={d.notes} onChange={(e) => set({ notes: e.target.value })} />
      </Field>
      {!d.recipeId && <ToggleRow label="Save to Recipes" hint="Keep this meal in your recipe box" on={saveRecipe} onChange={setSaveRecipe} />}

      {scopeAsk && meal && (
        <Confirm
          title="Edit repeating meal"
          danger={false}
          options={[
            { value: "this", label: "This meal" },
            { value: "all", label: "All meals" },
          ]}
          onConfirm={(v) => save(v)}
          onClose={() => setScopeAsk(false)}
        />
      )}
      {deleting && meal && (
        <DeleteMeal
          meal={meal}
          onClose={() => setDeleting(false)}
          onDone={() => {
            onSaved?.();
            onClose();
          }}
        />
      )}
    </Modal>
  );
}

/** Confirm deleting a meal; repeating meals ask "This meal / All meals". */
export function DeleteMeal({ meal, onClose, onDone }: { meal: Meal; onClose: () => void; onDone?: () => void }) {
  const { run } = useApp();
  const remove = async (scope?: string) => {
    const url = meal.recurring && scope === "this" ? `/api/meals/${meal.id}?occurrence=${meal.date}` : `/api/meals/${meal.id}`;
    if (await run(() => del(url), "Meal removed")) onDone?.();
  };
  return meal.recurring ? (
    <Confirm
      title={`Delete “${meal.title}”?`}
      message="This meal repeats."
      options={[
        { value: "this", label: "This meal" },
        { value: "all", label: "All meals" },
      ]}
      onConfirm={remove}
      onClose={onClose}
    />
  ) : (
    <Confirm
      title={`Delete “${meal.title}”?`}
      message="It will be removed from the meal plan. Saved recipes are kept."
      onConfirm={() => remove()}
      onClose={onClose}
    />
  );
}

/** Contents of the popover shown when tapping a planned meal. */
export function MealDetails({ meal, recipe, onEdit, onClose }: { meal: Meal; recipe?: Recipe; onEdit: () => void; onClose: () => void }) {
  const { mealCategories, go } = useApp();
  const cat = mealCategories.find((c) => c.id === meal.categoryId);
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState(false);
  return (
    <div className="md">
      <div className="row" style={{ alignItems: "flex-start" }}>
        <h3 className="serif md-title grow">
          {recipe?.emoji && <span style={{ marginRight: 10 }}>{recipe.emoji}</span>}
          {meal.title}
        </h3>
        <button className="icon-btn" aria-label="Edit meal" onClick={onEdit}>
          <Pencil />
        </button>
        <button className="icon-btn danger" aria-label="Delete meal" onClick={() => setDeleting(true)}>
          <Trash2 />
        </button>
      </div>
      <div className="row wrap" style={{ gap: 10 }}>
        <button className="pill" onClick={() => setAdding(true)}>
          <ShoppingCart />
          Add to List
        </button>
        {recipe && (
          <button
            className="pill"
            onClick={() => {
              recipeRequest.id = recipe.id;
              onClose();
              go("recipes");
            }}
          >
            <BookOpen />
            Open Recipe
          </button>
        )}
      </div>
      <div className="md-row">
        <CalendarDays />
        <span>{longDate(meal.date)}</span>
      </div>
      {meal.recurring && (
        <div className="md-row">
          <RepeatIcon />
          <span>{describeRepeat(meal.repeat)}</span>
        </div>
      )}
      <div className="md-row">
        <Tag />
        <div className="col" style={{ gap: 6 }}>
          <b>Category</b>
          <span className="row" style={{ gap: 10 }}>
            <CategoryDot cat={cat} size={30} />
            {cat?.name}
          </span>
        </div>
      </div>
      {meal.notes && (
        <div className="md-row">
          <StickyNote />
          <span style={{ whiteSpace: "pre-wrap" }}>{meal.notes}</span>
        </div>
      )}
      {recipe && recipe.ingredients.length > 0 && (
        <div className="md-row">
          <ListIcon />
          <div>
            <b>Ingredients</b>
            <ul className="md-ing">
              {recipe.ingredients.map((i, k) => (
                <li key={k}>{i}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
      {adding && <AddToListModal title={meal.title} ingredients={recipe?.ingredients ?? []} recipeId={recipe?.id ?? null} onClose={() => setAdding(false)} />}
      {deleting && <DeleteMeal meal={meal} onClose={() => setDeleting(false)} onDone={onClose} />}
    </div>
  );
}
