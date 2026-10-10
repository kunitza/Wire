import { useState } from "react";
import { Check, ShoppingCart } from "lucide-react";
import type { List, ListItem, MealCategory } from "../../../shared/types";
import { get, post } from "../../lib/api";
import { tint } from "../../lib/format";
import { useApp } from "../../lib/store";
import { Modal } from "../../components/ui";
import { strong } from "../lists/color";

/** Colors used for meal categories (pastels, like Skylight's defaults). */
export const MEAL_COLORS = ["#FAB4A8", "#A8D4D3", "#FDC36D", "#E6C096", "#C9B6E4", "#B5D99C", "#F7A8C8", "#A9C7F0"];

export const tileBg = (c: string) => tint(c, 0.82);
export const emptyBg = (c: string) => tint(c, 0.26);

/** Colored circle with the category's first letter (B / L / D / S). */
export function CategoryDot({ cat, size = 32 }: { cat: Pick<MealCategory, "name" | "color"> | undefined; size?: number }) {
  const color = cat ? strong(cat.color, 0.64) : "#bbb";
  return (
    <span
      aria-hidden
      style={{
        width: size,
        height: size,
        borderRadius: 99,
        background: color,
        color: "#fff",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: size * 0.45,
        fontWeight: 600,
        flex: "none",
        lineHeight: 1,
      }}
    >
      {(cat?.name ?? "?").slice(0, 1).toUpperCase()}
    </span>
  );
}

/** One-shot hand-off: open this recipe when the Recipes screen mounts (from a meal's "Open Recipe"). */
export const recipeRequest: { id: number | null } = { id: null };

/** Add items to the household grocery list (the list named "Grocery List", else the first grocery list, else a new one). */
export async function addToGroceryList(items: string[]): Promise<string> {
  const { lists } = await get<{ lists: List[]; items: ListItem[] }>("/api/lists");
  let list = lists.find((l) => l.name.toLowerCase() === "grocery list") ?? lists.find((l) => l.kind === "grocery");
  if (!list) list = await post<List>("/api/lists", { name: "Grocery List", color: "#7FC8A9", kind: "grocery", hideOnDevice: false });
  await post(`/api/lists/${list.id}/items`, { items: items.map((text) => ({ text })) });
  return list.name;
}

/** Choose which ingredients to add to the Grocery List. */
export function AddToListModal({
  title,
  ingredients,
  recipeId,
  onClose,
}: {
  title: string;
  ingredients: string[];
  recipeId: number | null;
  onClose: () => void;
}) {
  const { run } = useApp();
  const options = ingredients.length ? ingredients : [title];
  const [chosen, setChosen] = useState<boolean[]>(() => options.map(() => true));
  const n = chosen.filter(Boolean).length;
  const add = async () => {
    const items = options.filter((_, i) => chosen[i]);
    const ok = await run(
      async () => {
        if (recipeId && ingredients.length) await post(`/api/recipes/${recipeId}/grocery`, { items });
        else await addToGroceryList(items);
        return true;
      },
      `Added ${n} item${n === 1 ? "" : "s"} to the Grocery List`,
    );
    if (ok) onClose();
  };
  return (
    <Modal
      title="Add to Grocery List"
      onClose={onClose}
      size="narrow"
      footer={
        <>
          <button className="pill" onClick={onClose}>
            Cancel
          </button>
          <button className="pill primary" disabled={!n} onClick={add}>
            <ShoppingCart />
            Add {n} item{n === 1 ? "" : "s"}
          </button>
        </>
      }
    >
      <div className="row" style={{ justifyContent: "space-between" }}>
        <span className="muted">{title}</span>
        {options.length > 1 && (
          <button className="link" onClick={() => setChosen(options.map(() => n !== options.length))}>
            {n === options.length ? "Select none" : "Select all"}
          </button>
        )}
      </div>
      <div className="col" style={{ gap: 8 }}>
        {options.map((o, i) => (
          <button
            key={i}
            type="button"
            className="check-row"
            style={{ textAlign: "left", width: "100%" }}
            onClick={() => setChosen(chosen.map((c, j) => (j === i ? !c : c)))}
            aria-pressed={chosen[i]}
          >
            <span className="grow" style={{ color: chosen[i] ? undefined : "var(--text-3)" }}>
              {o}
            </span>
            <span className={`gl-box ${chosen[i] ? "on" : ""}`}>{chosen[i] && <Check size={20} strokeWidth={3} />}</span>
          </button>
        ))}
      </div>
    </Modal>
  );
}

/** − n + stepper. */
export function Stepper({
  value,
  onChange,
  min = 1,
  max = 20,
  label,
}: {
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  label?: string;
}) {
  return (
    <div className="stepper" role="group" aria-label={label}>
      <button type="button" onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} aria-label="Fewer">
        −
      </button>
      <span>{value}</span>
      <button type="button" onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label="More">
        +
      </button>
    </div>
  );
}

/** Category picker chips. */
export function CategoryChips({ cats, value, onChange }: { cats: MealCategory[]; value: number | null; onChange: (id: number) => void }) {
  return (
    <div className="chips">
      {cats.map((c) => (
        <button
          key={c.id}
          type="button"
          className={`chip ${value === c.id ? "on" : ""}`}
          style={value === c.id ? { borderColor: strong(c.color, 0.5), background: tint(c.color, 0.3) } : undefined}
          onClick={() => onChange(c.id)}
        >
          <CategoryDot cat={c} size={32} />
          {c.name}
        </button>
      ))}
    </div>
  );
}
