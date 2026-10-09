import type { Ctx } from "../context.js";
import { json } from "../db.js";
import { eachDay, occursOn } from "../../shared/dates.js";
import type { Meal, MealCategory, Recipe, Repeat } from "../../shared/types.js";
import { addItems, groceryListId } from "./lists.js";

export class MealError extends Error {}

// ---- Categories ----

interface CatRow {
  id: number;
  name: string;
  color: string;
  visible: number;
  show_on_calendar: number;
  sort: number;
}

export function listCategories(ctx: Ctx): MealCategory[] {
  const rows = ctx.db.prepare("SELECT * FROM meal_categories ORDER BY sort, id").all() as unknown as CatRow[];
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    color: r.color,
    visible: !!r.visible,
    showOnCalendar: !!r.show_on_calendar,
    sort: r.sort,
  }));
}

export function ensureDefaultCategories(ctx: Ctx) {
  if (listCategories(ctx).length) return;
  const defaults: [string, string, boolean][] = [
    ["Breakfast", "#FAB4A8", false],
    ["Lunch", "#A8D4D3", false],
    ["Dinner", "#FDC36D", true],
    ["Snack", "#E6C096", false],
  ];
  const stmt = ctx.db.prepare("INSERT INTO meal_categories (name, color, visible, show_on_calendar, sort) VALUES (?, ?, 1, ?, ?)");
  defaults.forEach(([n, c, cal], i) => stmt.run(n, c, cal ? 1 : 0, i + 1));
}

export function updateCategory(ctx: Ctx, id: number, patch: Partial<Omit<MealCategory, "id" | "sort">>) {
  const cur = listCategories(ctx).find((c) => c.id === id);
  if (!cur) throw new MealError("Category not found");
  const next = { ...cur, ...patch };
  ctx.db
    .prepare("UPDATE meal_categories SET name = ?, color = ?, visible = ?, show_on_calendar = ? WHERE id = ?")
    .run(next.name.trim() || cur.name, next.color, next.visible ? 1 : 0, next.showOnCalendar ? 1 : 0, id);
  ctx.bus.emit("meals");
}

// ---- Recipes ----

interface RecipeRow {
  id: number;
  title: string;
  emoji: string;
  category_id: number | null;
  ingredients: string;
  instructions: string;
  source_url: string;
  favorite: number;
}

const toRecipe = (r: RecipeRow): Recipe => ({
  id: r.id,
  title: r.title,
  emoji: r.emoji,
  categoryId: r.category_id,
  ingredients: json.parse<string[]>(r.ingredients, []),
  instructions: r.instructions,
  sourceUrl: r.source_url,
  favorite: !!r.favorite,
});

export function listRecipes(ctx: Ctx): Recipe[] {
  return (ctx.db.prepare("SELECT * FROM recipes ORDER BY favorite DESC, title COLLATE NOCASE").all() as unknown as RecipeRow[]).map(toRecipe);
}

export function getRecipe(ctx: Ctx, id: number): Recipe | null {
  const r = ctx.db.prepare("SELECT * FROM recipes WHERE id = ?").get(id) as RecipeRow | undefined;
  return r ? toRecipe(r) : null;
}

export type RecipeInput = Omit<Recipe, "id">;

export function createRecipe(ctx: Ctx, input: RecipeInput): Recipe {
  if (!input.title?.trim()) throw new MealError("Recipe name is required");
  const res = ctx.db
    .prepare("INSERT INTO recipes (title, emoji, category_id, ingredients, instructions, source_url, favorite) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(
      input.title.trim(),
      input.emoji ?? "",
      input.categoryId ?? null,
      JSON.stringify((input.ingredients ?? []).map((s) => s.trim()).filter(Boolean)),
      input.instructions ?? "",
      input.sourceUrl ?? "",
      input.favorite ? 1 : 0,
    );
  ctx.bus.emit("recipes");
  return getRecipe(ctx, Number(res.lastInsertRowid))!;
}

export function updateRecipe(ctx: Ctx, id: number, patch: Partial<RecipeInput>): Recipe | null {
  const cur = getRecipe(ctx, id);
  if (!cur) return null;
  const n = { ...cur, ...patch };
  ctx.db
    .prepare("UPDATE recipes SET title = ?, emoji = ?, category_id = ?, ingredients = ?, instructions = ?, source_url = ?, favorite = ? WHERE id = ?")
    .run(
      n.title.trim() || cur.title,
      n.emoji,
      n.categoryId,
      JSON.stringify(n.ingredients.map((s) => s.trim()).filter(Boolean)),
      n.instructions,
      n.sourceUrl,
      n.favorite ? 1 : 0,
      id,
    );
  ctx.bus.emit("recipes", "meals");
  return getRecipe(ctx, id);
}

export function deleteRecipe(ctx: Ctx, id: number, withMeals: boolean) {
  if (withMeals) ctx.db.prepare("DELETE FROM meals WHERE recipe_id = ?").run(id);
  ctx.db.prepare("DELETE FROM recipes WHERE id = ?").run(id);
  ctx.bus.emit("recipes", "meals");
}

export function recipeToGrocery(ctx: Ctx, recipeId: number, items?: string[]): number {
  const recipe = getRecipe(ctx, recipeId);
  if (!recipe) throw new MealError("Recipe not found");
  const list = groceryListId(ctx);
  addItems(ctx, list, (items ?? recipe.ingredients).map((text) => ({ text })));
  return list;
}

// ---- Meals ----

interface MealRow {
  id: number;
  date: string;
  category_id: number;
  title: string;
  recipe_id: number | null;
  notes: string;
  repeat: string;
  repeat_until: string | null;
  exdates: string;
  sort: number;
}

export interface MealInput {
  date: string;
  categoryId: number;
  title: string;
  recipeId?: number | null;
  notes?: string;
  repeat?: Repeat;
  repeatUntil?: string | null;
}

export function mealsInRange(ctx: Ctx, from: string, to: string): Meal[] {
  const rows = ctx.db.prepare("SELECT * FROM meals WHERE date < ? ORDER BY sort, id").all(to) as unknown as MealRow[];
  const out: Meal[] = [];
  const days = eachDay(from, to);
  for (const r of rows) {
    const repeat = json.parse<Repeat>(r.repeat, { type: "none" });
    const ex = json.parse<string[]>(r.exdates, []);
    const base = { id: r.id, categoryId: r.category_id, title: r.title, recipeId: r.recipe_id, notes: r.notes, repeat, seriesStart: r.date, repeatUntil: r.repeat_until };
    if (repeat.type === "none") {
      if (r.date >= from && r.date < to) out.push({ ...base, key: `meal:${r.id}`, date: r.date, recurring: false });
      continue;
    }
    for (const d of days)
      if (occursOn(repeat, r.date, d, r.repeat_until) && !ex.includes(d)) out.push({ ...base, key: `meal:${r.id}:${d}`, date: d, recurring: true });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

export function createMeal(ctx: Ctx, input: MealInput): number {
  if (!input.title?.trim()) throw new MealError("What are we eating?");
  if (!listCategories(ctx).some((c) => c.id === input.categoryId)) throw new MealError("Choose a category");
  const res = ctx.db
    .prepare("INSERT INTO meals (date, category_id, title, recipe_id, notes, repeat, repeat_until) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(
      input.date,
      input.categoryId,
      input.title.trim(),
      input.recipeId ?? null,
      input.notes ?? "",
      JSON.stringify(input.repeat ?? { type: "none" }),
      input.repeatUntil ?? null,
    );
  ctx.bus.emit("meals");
  return Number(res.lastInsertRowid);
}

export function updateMeal(ctx: Ctx, id: number, input: MealInput) {
  if (!input.title?.trim()) throw new MealError("What are we eating?");
  ctx.db
    .prepare("UPDATE meals SET date = ?, category_id = ?, title = ?, recipe_id = ?, notes = ?, repeat = ?, repeat_until = ? WHERE id = ?")
    .run(
      input.date,
      input.categoryId,
      input.title.trim(),
      input.recipeId ?? null,
      input.notes ?? "",
      JSON.stringify(input.repeat ?? { type: "none" }),
      input.repeatUntil ?? null,
      id,
    );
  ctx.bus.emit("meals");
}

/** Remove a meal from the plan (one occurrence of a repeating meal, or the whole thing). Recipes are kept. */
export function deleteMeal(ctx: Ctx, id: number, occurrence?: string) {
  const r = ctx.db.prepare("SELECT * FROM meals WHERE id = ?").get(id) as MealRow | undefined;
  if (!r) return;
  const repeat = json.parse<Repeat>(r.repeat, { type: "none" });
  if (occurrence && repeat.type !== "none") {
    const ex = json.parse<string[]>(r.exdates, []);
    ctx.db.prepare("UPDATE meals SET exdates = ? WHERE id = ?").run(JSON.stringify([...ex, occurrence]), id);
  } else {
    ctx.db.prepare("DELETE FROM meals WHERE id = ?").run(id);
  }
  ctx.bus.emit("meals");
}
