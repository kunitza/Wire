import { useEffect, useRef, useState, type ReactNode } from "react";
import { CalendarDays, SlidersHorizontal, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Pencil, Plus, Sparkles } from "lucide-react";
import type { Meal, MealCategory, Recipe } from "../../../shared/types";
import { addDays, eachDay, startOfWeek } from "../../../shared/dates";
import { put } from "../../lib/api";
import { dayLabel, rangeLabel, shortDate } from "../../lib/format";
import { useApp, useLive } from "../../lib/store";
import { Fab, Header } from "../../components/shell";
import { ColorSwatches, Field, Modal, Popover, Toggle, ToggleRow } from "../../components/ui";
import { MealDetails, MealForm, type MealDraft } from "./MealForm";
import { PlanWithSidekick } from "./PlanWithSidekick";
import { CategoryDot, MEAL_COLORS, emptyBg, tileBg } from "./shared";
import "./meals.css";

export default function MealsScreen() {
  const { today, settings, mealCategories, isPhone } = useApp();
  const [anchor, setAnchor] = useState(today);
  // The wall display stays open overnight: follow "today" at midnight unless the user paged away.
  const lastToday = useRef(today);
  useEffect(() => {
    if (lastToday.current !== today) {
      setAnchor((a) => (a === lastToday.current ? today : a));
      lastToday.current = today;
    }
  }, [today]);
  const weekStart = startOfWeek(anchor, settings.weekStartsOn);
  const days = eachDay(weekStart, addDays(weekStart, 7));
  const { data: meals } = useLive<Meal[]>(`/api/meals?from=${weekStart}&to=${addDays(weekStart, 7)}`, ["meals", "recipes"]);
  const { data: recipes } = useLive<Recipe[]>("/api/recipes", ["recipes"]);
  const [catsOpen, setCatsOpen] = useState<HTMLElement | null>(null);
  const [form, setForm] = useState<{ meal?: Meal; initial?: Partial<MealDraft> } | null>(null);
  const [details, setDetails] = useState<{ meal: Meal; anchor: HTMLElement } | null>(null);
  const [plan, setPlan] = useState(false);
  const cats = mealCategories.filter((c) => c.visible);
  const isThisWeek = days.includes(today);
  // Phones list the week as one long column: start at today rather than Sunday.
  const loaded = !!meals;
  useEffect(() => {
    if (isPhone && isThisWeek && loaded) document.querySelector(".meals-day.today")?.scrollIntoView({ block: "start" });
  }, [isPhone, isThisWeek, loaded, weekStart]);

  const cell = (date: string, cat: MealCategory) => (meals ?? []).filter((m) => m.date === date && m.categoryId === cat.id);
  const recipeOf = (m: Meal) => recipes?.find((r) => r.id === m.recipeId);
  const openAdd = (date: string, categoryId: number) => setForm({ initial: { date, categoryId } });

  return (
    <>
      <Header
        title={
          isPhone ? (
            <button className="meals-phone-title" onClick={() => setAnchor(today)} aria-label="Go to this week">
              {shortRange(days[0], days[6])}
            </button>
          ) : undefined
        }
      >
        <span className="hide-phone meals-range">{rangeLabel(days[0], days[6])}</span>
        <button className={`pill ${isPhone ? "icon" : ""}`} onClick={(e) => setCatsOpen(e.currentTarget)} aria-expanded={!!catsOpen} aria-label="Categories">
          {isPhone ? <SlidersHorizontal /> : "Categories"}
          {!isPhone && (catsOpen ? <ChevronUp /> : <ChevronDown />)}
        </button>
        <button className="pill icon" aria-label="Previous week" onClick={() => setAnchor(addDays(weekStart, -7))}>
          <ChevronLeft />
        </button>
        {!isPhone && (
          <button className="pill" disabled={isThisWeek} onClick={() => setAnchor(today)}>
            Today
          </button>
        )}
        <button className="pill icon" aria-label="Next week" onClick={() => setAnchor(addDays(weekStart, 7))}>
          <ChevronRight />
        </button>
        <button className={`pill sk-pill ${isPhone ? "icon" : ""}`} onClick={() => setPlan(true)} aria-label="Plan with Sidekick">
          <Sparkles />
          {!isPhone && "Plan with Sidekick"}
        </button>
      </Header>

      <div className="screen">
        {cats.length === 0 ? (
          <div className="empty" style={{ height: "100%" }}>
            <div className="big">🍽️</div>
            <div>All meal categories are hidden.</div>
            <button className="pill" onClick={(e) => setCatsOpen(e.currentTarget)}>
              Show categories
            </button>
          </div>
        ) : isPhone ? (
          <div className="meals-days">
            {days.map((d) => {
              const dl = dayLabel(d);
              return (
                <section key={d} className={`meals-day ${d === today ? "today" : ""}`}>
                  <h2 className="serif meals-dayhead">
                    {dl.dow} <span className={d === today ? "today-num" : ""}>{dl.num}</span>
                  </h2>
                  {cats.map((c) => {
                    const ms = cell(d, c);
                    return (
                      <div key={c.id} className="meals-dayrow">
                        <CategoryDot cat={c} size={30} />
                        <div className="meals-dayrow-tiles">
                          {ms.map((m) => (
                            <button
                              key={m.key}
                              className="meal-tile"
                              style={{ background: tileBg(c.color) }}
                              onClick={(e) => setDetails({ meal: m, anchor: e.currentTarget })}
                            >
                              {recipeOf(m)?.emoji && <span className="meal-emoji">{recipeOf(m)?.emoji}</span>}
                              {m.title}
                            </button>
                          ))}
                          {ms.length === 0 && (
                            <button className="meal-tile blank" style={{ background: emptyBg(c.color) }} onClick={() => openAdd(d, c.id)}>
                              <Plus size={18} /> {c.name}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </section>
              );
            })}
          </div>
        ) : (
          <div className="meals-grid" style={{ gridTemplateRows: `auto repeat(${cats.length}, minmax(${cats.length > 3 ? 132 : 170}px, 1fr))` }}>
            <div />
            {days.map((d) => {
              const dl = dayLabel(d);
              return (
                <div key={d} className="meals-head serif">
                  {dl.dow} <span className={d === today ? "today-num" : ""}>{dl.num}</span>
                </div>
              );
            })}
            {cats.map((c) => (
              <CategoryRow key={c.id} cat={c}>
                {days.map((d) => {
                  const ms = cell(d, c);
                  return (
                    <div key={d} className="meals-cell">
                      {ms.map((m) => (
                        <button
                          key={m.key}
                          className={`meal-tile ${details?.meal.key === m.key ? "active" : ""}`}
                          style={{ background: tileBg(c.color) }}
                          onClick={(e) => setDetails({ meal: m, anchor: e.currentTarget })}
                        >
                          <span className="meal-text">
                            {recipeOf(m)?.emoji && <span className="meal-emoji">{recipeOf(m)?.emoji}</span>}
                            {m.title}
                          </span>
                        </button>
                      ))}
                      {ms.length === 0 ? (
                        <button
                          className="meal-tile blank"
                          style={{ background: emptyBg(c.color) }}
                          onClick={() => openAdd(d, c.id)}
                          aria-label={`Add ${c.name} on ${d}`}
                        >
                          <Plus className="meal-plus" />
                        </button>
                      ) : null}
                    </div>
                  );
                })}
              </CategoryRow>
            ))}
          </div>
        )}
      </div>
      <Fab onClick={() => setForm({ initial: { date: isThisWeek ? today : weekStart } })} label="Add meal" />

      {catsOpen && <CategoriesPopover anchor={catsOpen} onClose={() => setCatsOpen(null)} />}
      {details && (
        <Popover anchor={details.anchor} onClose={() => setDetails(null)} width={480} align="center">
          <MealDetails
            meal={details.meal}
            recipe={recipeOf(details.meal)}
            onClose={() => setDetails(null)}
            onEdit={() => {
              setForm({ meal: details.meal });
              setDetails(null);
            }}
          />
        </Popover>
      )}
      {form && <MealForm meal={form.meal} initial={form.initial} onClose={() => setForm(null)} />}
      {plan && meals && recipes && <PlanWithSidekick weekStart={weekStart} meals={meals} recipes={recipes} onClose={() => setPlan(false)} />}
    </>
  );
}

function CategoryRow({ cat, children }: { cat: MealCategory; children: ReactNode }) {
  return (
    <>
      <div className="meals-label">
        <span>{cat.name}</span>
      </div>
      {children}
    </>
  );
}

function CategoriesPopover({ anchor, onClose }: { anchor: HTMLElement; onClose: () => void }) {
  const { mealCategories, run } = useApp();
  const [editing, setEditing] = useState<MealCategory | null>(null);
  const update = (c: MealCategory, patch: Partial<MealCategory>) => run(() => put(`/api/meal-categories/${c.id}`, { ...c, ...patch }));
  return (
    <>
      <Popover anchor={anchor} onClose={onClose} width={440} align="end">
        <div className="col" style={{ gap: 10 }}>
          {mealCategories.map((c) => (
            <div key={c.id} className="row" style={{ gap: 10 }}>
              <div className="cat-row grow">
                <CategoryDot cat={c} size={34} />
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="truncate" style={{ fontWeight: 500 }}>
                    {c.name}
                  </div>
                  {c.showOnCalendar && (
                    <div className="cat-sub">
                      <CalendarDays size={14} /> On calendar
                    </div>
                  )}
                </div>
                <Toggle on={c.visible} onChange={(v) => update(c, { visible: v })} label={`Show ${c.name}`} />
              </div>
              <button className="cat-edit" aria-label={`Edit ${c.name}`} onClick={() => setEditing(c)}>
                <Pencil />
              </button>
            </div>
          ))}
        </div>
      </Popover>
      {editing && <CategoryEditModal cat={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function CategoryEditModal({ cat, onClose }: { cat: MealCategory; onClose: () => void }) {
  const { run } = useApp();
  const [name, setName] = useState(cat.name);
  const [color, setColor] = useState(cat.color);
  const [visible, setVisible] = useState(cat.visible);
  const [onCal, setOnCal] = useState(cat.showOnCalendar);
  const save = async () => {
    if (await run(() => put(`/api/meal-categories/${cat.id}`, { name: name.trim() || cat.name, color, visible, showOnCalendar: onCal }), "Category saved"))
      onClose();
  };
  return (
    <Modal
      title="Edit category"
      onClose={onClose}
      size="narrow"
      footer={
        <>
          <button className="pill" onClick={onClose}>
            Cancel
          </button>
          <button className="pill primary" onClick={save}>
            Save
          </button>
        </>
      }
    >
      <div className="row">
        <CategoryDot cat={{ name: name || cat.name, color }} size={56} />
        <input
          className="input big grow"
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-label="Category name"
          onKeyDown={(e) => e.key === "Enter" && save()}
        />
      </div>
      <Field label="Color">
        <ColorSwatches value={color} onChange={setColor} colors={MEAL_COLORS} />
      </Field>
      <ToggleRow label="Show in meal plan" on={visible} onChange={setVisible} />
      <ToggleRow label="Show on calendar" hint="Planned meals appear on the Calendar" on={onCal} onChange={setOnCal} />
    </Modal>
  );
}

/** "Oct 4 – 10" / "Sep 28 – Oct 4" */
function shortRange(a: string, b: string) {
  return a.slice(0, 7) === b.slice(0, 7) ? `${shortDate(a)} – ${Number(b.slice(8))}` : `${shortDate(a)} – ${shortDate(b)}`;
}
