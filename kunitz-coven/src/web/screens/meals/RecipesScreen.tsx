import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AlignLeft, CalendarPlus, Heart, Link as LinkIcon, List as ListIcon, Pencil, Search, ShoppingCart, Tag, Trash2 } from "lucide-react";
import type { Recipe } from "../../../shared/types";
import { del, put } from "../../lib/api";
import { useApp, useLive } from "../../lib/store";
import { Fab, Header } from "../../components/shell";
import { Confirm, Modal } from "../../components/ui";
import { strong } from "../lists/color";
import { MealForm } from "./MealForm";
import { NewRecipeModal, RecipeModal } from "./RecipeForm";
import { AddToListModal, CategoryDot, recipeRequest } from "./shared";
import "./meals.css";

type Filter = "all" | "fav" | number;

export default function RecipesScreen() {
  const { mealCategories, isPhone } = useApp();
  const { data: recipes } = useLive<Recipe[]>("/api/recipes", ["recipes"]);
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<number | null>(() => {
    const id = recipeRequest.id;
    recipeRequest.id = null;
    return id;
  });
  const [creating, setCreating] = useState(false);
  // A just-created recipe may not be in the list until the next refetch: don't reset the selection meanwhile.
  const awaiting = useRef<number | null>(null);

  const shown = useMemo(() => {
    const query = q.trim().toLowerCase();
    return (recipes ?? []).filter(
      (r) =>
        (filter === "all" || (filter === "fav" ? r.favorite : r.categoryId === filter)) &&
        (!query || r.title.toLowerCase().includes(query) || r.ingredients.some((i) => i.toLowerCase().includes(query))),
    );
  }, [recipes, filter, q]);

  // On the wall display keep something selected in the detail pane.
  useEffect(() => {
    if (isPhone || !recipes) return;
    if (selected != null && awaiting.current === selected) {
      if (recipes.some((r) => r.id === selected)) awaiting.current = null;
      return;
    }
    if (selected == null || !recipes.some((r) => r.id === selected)) setSelected(shown[0]?.id ?? recipes[0]?.id ?? null);
  }, [isPhone, recipes, shown, selected]);

  const current = recipes?.find((r) => r.id === selected);

  const filters: { id: Filter; label: string; dot: ReactNode; color: string }[] = [
    {
      id: "all",
      label: "All",
      color: "#8E9AA6",
      dot: (
        <span className="ring-dot" style={{ background: "#8E9AA6", color: "#fff", fontWeight: 600, fontSize: 18 }}>
          All
        </span>
      ),
    },
    ...mealCategories.map((c) => ({
      id: c.id as Filter,
      label: c.name,
      color: strong(c.color, 0.64),
      dot: (
        <span className="ring-dot">
          <CategoryDot cat={c} size={60} />
        </span>
      ),
    })),
    {
      id: "fav",
      label: "Favorites",
      color: "#F66951",
      dot: (
        <span className="ring-dot" style={{ background: "#fde4df", color: "var(--coral)" }}>
          <Heart fill="currentColor" size={26} />
        </span>
      ),
    },
  ];

  const list = (
    <div className="rx-left">
      <div className="rx-filters" role="tablist" aria-label="Filter recipes">
        {filters.map((f) => (
          <button
            key={String(f.id)}
            role="tab"
            aria-selected={filter === f.id}
            className={`rx-filter ${filter === f.id ? "on" : ""}`}
            onClick={() => setFilter(f.id)}
          >
            <span style={{ borderRadius: 99, boxShadow: filter === f.id ? `0 0 0 3px #fff, 0 0 0 6px ${f.color}` : undefined }}>{f.dot}</span>
            {f.label}
          </button>
        ))}
      </div>
      <div className="rx-search">
        <Search />
        <input className="input" placeholder="Search recipes" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search recipes" />
      </div>
      <div className="rx-list">
        {recipes && shown.length === 0 && (
          <div className="empty">
            <div className="big">{recipes.length ? "🔍" : "📖"}</div>
            {recipes.length ? "No recipes match." : "Your recipe box is empty."}
            {!recipes.length && (
              <button className="pill primary" onClick={() => setCreating(true)}>
                Add a recipe
              </button>
            )}
          </div>
        )}
        {shown.map((r) => (
          <RecipeRow key={r.id} recipe={r} on={!isPhone && r.id === selected} onOpen={() => setSelected(r.id)} />
        ))}
      </div>
    </div>
  );

  return (
    <>
      <Header />
      <div className="screen">
        <div className="rx">
          {list}
          {!isPhone &&
            (current ? (
              <RecipeDetail recipe={current} onDeleted={() => setSelected(null)} />
            ) : (
              <div className="rx-detail">
                <div className="empty" style={{ flex: 1 }}>
                  <div className="big">🍳</div>
                  <div>Pick a recipe to see it here.</div>
                </div>
              </div>
            ))}
        </div>
      </div>
      <Fab onClick={() => setCreating(true)} label="New recipe" />
      {isPhone && current && (
        <Modal onClose={() => setSelected(null)} title=" ">
          <RecipeDetail recipe={current} onDeleted={() => setSelected(null)} bare />
        </Modal>
      )}
      {creating && (
        <NewRecipeModal
          onClose={() => setCreating(false)}
          onSaved={(r) => {
            awaiting.current = r.id;
            setFilter("all");
            setQ("");
            setSelected(r.id);
          }}
        />
      )}
    </>
  );
}

function RecipeRow({ recipe, on, onOpen }: { recipe: Recipe; on: boolean; onOpen: () => void }) {
  const { mealCategories, run } = useApp();
  const cat = mealCategories.find((c) => c.id === recipe.categoryId);
  return (
    <div
      className={`rx-row ${on ? "on" : ""}`}
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => e.key === "Enter" && onOpen()}
      style={{ cursor: "pointer" }}
    >
      <CategoryDot cat={cat} size={30} />
      {recipe.emoji && <span className="rx-emoji">{recipe.emoji}</span>}
      <span className="grow truncate">{recipe.title}</span>
      <button
        className={`rx-heart ${recipe.favorite ? "on" : ""}`}
        aria-label={recipe.favorite ? "Remove from favorites" : "Add to favorites"}
        aria-pressed={recipe.favorite}
        onClick={(e) => {
          e.stopPropagation();
          run(() => put(`/api/recipes/${recipe.id}`, { favorite: !recipe.favorite }));
        }}
      >
        <Heart fill={recipe.favorite ? "currentColor" : "none"} />
      </button>
    </div>
  );
}

export function RecipeDetail({ recipe, onDeleted, bare = false }: { recipe: Recipe; onDeleted?: () => void; bare?: boolean }) {
  const { mealCategories, run } = useApp();
  const cat = mealCategories.find((c) => c.id === recipe.categoryId);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [planning, setPlanning] = useState(false);
  const [grocery, setGrocery] = useState(false);
  return (
    <div className={bare ? "col" : "rx-detail"} style={bare ? { gap: 20 } : undefined}>
      <div className="row" style={{ alignItems: "flex-start", gap: 12 }}>
        <h2 className="serif rx-title grow">
          {recipe.emoji && <span style={{ marginRight: 14 }}>{recipe.emoji}</span>}
          {recipe.title}
        </h2>
        <button
          className="icon-btn"
          aria-label={recipe.favorite ? "Remove from favorites" : "Add to favorites"}
          aria-pressed={recipe.favorite}
          style={{ color: recipe.favorite ? "var(--coral)" : undefined }}
          onClick={() => run(() => put(`/api/recipes/${recipe.id}`, { favorite: !recipe.favorite }))}
        >
          <Heart fill={recipe.favorite ? "currentColor" : "none"} />
        </button>
        <button className="icon-btn" aria-label="Edit recipe" onClick={() => setEditing(true)}>
          <Pencil />
        </button>
        <button className="icon-btn danger" aria-label="Delete recipe" onClick={() => setDeleting(true)}>
          <Trash2 />
        </button>
      </div>
      <div className="row wrap" style={{ gap: 10 }}>
        <button className="pill lg" onClick={() => setPlanning(true)}>
          <CalendarPlus />
          Plan Meal
        </button>
        <button className="pill lg" onClick={() => setGrocery(true)}>
          <ShoppingCart />
          Add to Grocery List
        </button>
      </div>
      <div className="rx-sec">
        <Tag />
        <div>
          <h4>Category</h4>
          {cat ? (
            <span className="row" style={{ gap: 10 }}>
              <CategoryDot cat={cat} size={30} />
              {cat.name}
            </span>
          ) : (
            <span className="muted">None</span>
          )}
        </div>
      </div>
      <div className="rx-sec">
        <ListIcon />
        <div>
          <h4>Ingredients</h4>
          {recipe.ingredients.length ? (
            <ul>
              {recipe.ingredients.map((i, k) => (
                <li key={k}>{i}</li>
              ))}
            </ul>
          ) : (
            <span className="muted">No ingredients yet</span>
          )}
        </div>
      </div>
      <div className="rx-sec">
        <AlignLeft />
        <div style={{ minWidth: 0 }}>
          <h4>Instructions</h4>
          {recipe.instructions ? <div className="rx-instr">{recipe.instructions}</div> : <span className="muted">No instructions yet</span>}
        </div>
      </div>
      {recipe.sourceUrl && (
        <div className="rx-sec">
          <LinkIcon />
          <div style={{ minWidth: 0 }}>
            <h4>Source</h4>
            <a className="link truncate" style={{ display: "block" }} href={recipe.sourceUrl} target="_blank" rel="noreferrer">
              {recipe.sourceUrl.replace(/^https?:\/\/(www\.)?/, "")}
            </a>
          </div>
        </div>
      )}
      {editing && <RecipeModal recipe={recipe} onClose={() => setEditing(false)} />}
      {planning && (
        <MealForm initial={{ title: recipe.title, recipeId: recipe.id, categoryId: recipe.categoryId ?? undefined }} onClose={() => setPlanning(false)} />
      )}
      {grocery && <AddToListModal title={recipe.title} ingredients={recipe.ingredients} recipeId={recipe.id} onClose={() => setGrocery(false)} />}
      {deleting && (
        <Confirm
          title={`Delete “${recipe.title}”?`}
          options={[
            { value: "recipe", label: "This recipe" },
            { value: "meals", label: "This recipe and planned meals" },
          ]}
          onConfirm={async (v) => {
            if (await run(() => del(`/api/recipes/${recipe.id}${v === "meals" ? "?withMeals=1" : ""}`), "Recipe deleted")) onDeleted?.();
          }}
          onClose={() => setDeleting(false)}
        />
      )}
    </div>
  );
}
