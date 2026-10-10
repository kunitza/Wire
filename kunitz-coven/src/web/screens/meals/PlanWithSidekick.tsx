import { useState } from "react";
import { Check, ChevronDown, Sparkles } from "lucide-react";
import type { Meal, Recipe } from "../../../shared/types";
import { addDays, dayOfWeek, eachDay } from "../../../shared/dates";
import { post } from "../../lib/api";
import { DOW, dayLabel } from "../../lib/format";
import { useApp } from "../../lib/store";
import { Field, Modal, ToggleRow } from "../../components/ui";
import { AiErrorNote, AiWorking, toAiFail, type AiFail } from "./ai";
import { CategoryChips, Stepper } from "./shared";

interface PlannedMeal {
  date: string;
  existingRecipeId: number | null;
  title: string;
  emoji: string;
  ingredients: string[];
  instructions: string;
}
interface Row extends PlannedMeal {
  on: boolean;
  open: boolean;
}

type Mode = "existing" | "new" | "both";

/** "Plan with Sidekick": ask for a week of meals, review them, then add to the plan (and the Grocery List). */
export function PlanWithSidekick({ weekStart, meals, recipes, onClose }: { weekStart: string; meals: Meal[]; recipes: Recipe[]; onClose: () => void }) {
  const { mealCategories, today, run, toast } = useApp();
  const cats = mealCategories.filter((c) => c.visible).length ? mealCategories.filter((c) => c.visible) : mealCategories;
  const [categoryId, setCategoryId] = useState(cats.find((c) => c.name.toLowerCase() === "dinner")?.id ?? cats[0]?.id);
  const days = eachDay(weekStart, addDays(weekStart, 7));
  const free = (cid: number) => days.filter((d) => d >= today && !meals.some((m) => m.date === d && m.categoryId === cid));
  const [dates, setDates] = useState<string[]>(() => free(categoryId));
  const [prompt, setPrompt] = useState("");
  const [servings, setServings] = useState(4);
  const [mode, setMode] = useState<Mode>(recipes.length ? "both" : "new");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AiFail | null>(null);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [grocery, setGrocery] = useState(true);
  const [saving, setSaving] = useState(false);

  const generate = async () => {
    setBusy(true);
    setError(null);
    try {
      const out = await post<PlannedMeal[]>("/api/ai/meal-plan", { categoryId, prompt, dates: [...dates].sort(), servings, mode });
      setRows(out.sort((a, b) => a.date.localeCompare(b.date)).map((m) => ({ ...m, on: true, open: false })));
    } catch (e) {
      setError(toAiFail(e));
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!rows) return;
    setSaving(true);
    const chosen = rows.filter((r) => r.on && r.title.trim());
    const ok = await run(async () => {
      const made = new Map<string, number>();
      for (const r of chosen) {
        const existing = savedFor(r);
        let recipeId = existing?.id ?? made.get(r.title.trim().toLowerCase()) ?? null;
        if (!recipeId) {
          const created = await post<Recipe>("/api/recipes", {
            title: r.title.trim(),
            emoji: r.emoji,
            categoryId,
            ingredients: r.ingredients,
            instructions: r.instructions,
            sourceUrl: "",
            favorite: false,
          });
          recipeId = created.id;
          made.set(r.title.trim().toLowerCase(), created.id);
        }
        await post("/api/meals", { date: r.date, categoryId, title: r.title.trim(), recipeId, notes: "", repeat: { type: "none" }, repeatUntil: null });
        if (grocery && (existing?.ingredients.length || r.ingredients.length)) await post(`/api/recipes/${recipeId}/grocery`, {});
      }
      return true;
    });
    setSaving(false);
    if (ok) {
      toast(`Added ${chosen.length} meal${chosen.length === 1 ? "" : "s"} to the plan${grocery ? " and groceries to your list" : ""}`);
      onClose();
    }
  };

  /** The saved recipe a proposed meal refers to (by id, or by an identical title). */
  const savedFor = (r: PlannedMeal) => {
    const t = r.title.trim().toLowerCase();
    const byId = r.existingRecipeId ? recipes.find((x) => x.id === r.existingRecipeId) : undefined;
    if (byId && byId.title.trim().toLowerCase() === t) return byId;
    return recipes.find((x) => x.title.trim().toLowerCase() === t);
  };
  const setRow = (i: number, p: Partial<Row>) => setRows((rs) => rs && rs.map((r, j) => (j === i ? { ...r, ...p } : r)));
  const n = rows?.filter((r) => r.on).length ?? 0;

  return (
    <Modal
      size="wide"
      title={
        <span className="row" style={{ gap: 12 }}>
          <Sparkles size={28} color="#6b5bd6" />
          {rows ? "Your meal plan" : "Plan with Sidekick"}
        </span>
      }
      onClose={onClose}
      footer={
        rows ? (
          <>
            <button className="pill" onClick={() => setRows(null)} disabled={saving}>
              Back
            </button>
            <button className="pill" onClick={generate} disabled={saving}>
              <Sparkles />
              Try again
            </button>
            <button className="pill primary" onClick={save} disabled={!n || saving}>
              {saving ? "Adding…" : `Add to meal plan (${n})`}
            </button>
          </>
        ) : (
          <>
            <button className="pill" onClick={onClose}>
              Cancel
            </button>
            <button className="pill primary" onClick={generate} disabled={busy || !dates.length || !categoryId}>
              <Sparkles />
              Generate
            </button>
          </>
        )
      }
    >
      {busy ? (
        <AiWorking text="Sidekick is planning your meals…" />
      ) : rows ? (
        <>
          {rows.length === 0 && <div className="empty">Sidekick didn't suggest anything. Try different wording.</div>}
          <div className="col" style={{ gap: 10 }}>
            {rows.map((r, i) => {
              const dl = dayLabel(r.date);
              const existing = savedFor(r);
              return (
                <div key={i} className={`pm-row ${r.on ? "" : "off"}`}>
                  <div className="pm-main">
                    <button className={`gl-box ${r.on ? "on" : ""}`} aria-label={r.on ? "Don't include" : "Include"} onClick={() => setRow(i, { on: !r.on })}>
                      {r.on && <Check size={20} strokeWidth={3} />}
                    </button>
                    <div className="pm-day serif">
                      <span>{dl.dow}</span>
                      <b>{dl.num}</b>
                    </div>
                    <span className="pm-emoji">{existing?.emoji || r.emoji || "🍽️"}</span>
                    <input className="pm-title" value={r.title} onChange={(e) => setRow(i, { title: e.target.value })} aria-label="Meal" />
                    {existing && <span className="pm-badge">Saved recipe</span>}
                    <button className="icon-btn" aria-label="Details" aria-expanded={r.open} onClick={() => setRow(i, { open: !r.open })}>
                      <ChevronDown style={{ transform: r.open ? "rotate(180deg)" : undefined, transition: "transform .15s" }} />
                    </button>
                  </div>
                  {r.open && (
                    <div className="pm-detail">
                      {existing ? (
                        <div className="muted">From your recipe box ({existing.ingredients.length} ingredients).</div>
                      ) : (
                        <>
                          <Field label="Ingredients (one per line)">
                            <textarea
                              className="textarea"
                              value={r.ingredients.join("\n")}
                              onChange={(e) => setRow(i, { ingredients: e.target.value.split("\n") })}
                            />
                          </Field>
                          <Field label="Instructions">
                            <textarea className="textarea" value={r.instructions} onChange={(e) => setRow(i, { instructions: e.target.value })} />
                          </Field>
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <ToggleRow label="Add ingredients to Grocery List" on={grocery} onChange={setGrocery} />
        </>
      ) : (
        <>
          <Field label="Meal type">
            <CategoryChips
              cats={cats}
              value={categoryId}
              onChange={(id) => {
                setCategoryId(id);
                setDates(free(id));
              }}
            />
          </Field>
          <Field label="What sounds good?">
            <textarea
              className="textarea"
              style={{ minHeight: 90 }}
              placeholder="e.g. Quick weeknight dinners, one vegetarian night, the kids love pasta"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
            />
          </Field>
          <Field label="Which days?">
            <div className="pm-days">
              {days.map((d) => {
                const on = dates.includes(d);
                const taken = meals.some((m) => m.date === d && m.categoryId === categoryId);
                return (
                  <button
                    key={d}
                    type="button"
                    className={on ? "on" : ""}
                    onClick={() => setDates(on ? dates.filter((x) => x !== d) : [...dates, d])}
                    aria-pressed={on}
                    title={taken ? "Already has a meal" : undefined}
                  >
                    <span>{DOW[dayOfWeek(d)]}</span>
                    <b>{dayLabel(d).num}</b>
                    {taken && <i aria-hidden />}
                  </button>
                );
              })}
            </div>
          </Field>
          <div className="form-grid">
            <Field label="How many mouths to feed?">
              <Stepper value={servings} onChange={setServings} label="Servings" />
            </Field>
            <Field label="Which recipes?">
              <div className="segmented" style={{ alignSelf: "flex-start" }}>
                {(
                  [
                    ["existing", "Only saved"],
                    ["new", "Generate new"],
                    ["both", "Both"],
                  ] as [Mode, string][]
                ).map(([m, label]) => (
                  <button key={m} type="button" className={mode === m ? "on" : ""} onClick={() => setMode(m)} disabled={m === "existing" && !recipes.length}>
                    {label}
                  </button>
                ))}
              </div>
            </Field>
          </div>
          {error && <AiErrorNote error={error} onNavigate={onClose} />}
        </>
      )}
    </Modal>
  );
}
