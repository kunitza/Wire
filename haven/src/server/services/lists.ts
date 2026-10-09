import type { Ctx } from "../context.js";
import type { List, ListItem } from "../../shared/types.js";

export class ListError extends Error {}

interface ListRow {
  id: number;
  name: string;
  color: string;
  kind: List["kind"];
  hide_on_device: number;
  sort: number;
  item_count: number;
  open_count: number;
}

export function listLists(ctx: Ctx): List[] {
  const rows = ctx.db
    .prepare(
      `SELECT l.*, COUNT(i.id) AS item_count, COALESCE(SUM(CASE WHEN i.checked = 0 THEN 1 ELSE 0 END), 0) AS open_count
         FROM lists l LEFT JOIN list_items i ON i.list_id = l.id GROUP BY l.id ORDER BY l.sort, l.id`,
    )
    .all() as unknown as ListRow[];
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    color: r.color,
    kind: r.kind,
    hideOnDevice: !!r.hide_on_device,
    sort: r.sort,
    itemCount: r.item_count,
    openCount: r.open_count,
  }));
}

export type ListInput = Pick<List, "name" | "color" | "kind" | "hideOnDevice">;

export function createList(ctx: Ctx, input: ListInput): List {
  if (!input.name?.trim()) throw new ListError("Name is required");
  const sort = (ctx.db.prepare("SELECT COALESCE(MAX(sort), 0) + 1 AS s FROM lists").get() as { s: number }).s;
  const res = ctx.db
    .prepare("INSERT INTO lists (name, color, kind, hide_on_device, sort) VALUES (?, ?, ?, ?, ?)")
    .run(input.name.trim(), input.color, input.kind ?? "other", input.hideOnDevice ? 1 : 0, sort);
  ctx.bus.emit("lists");
  return listLists(ctx).find((l) => l.id === Number(res.lastInsertRowid))!;
}

export function updateList(ctx: Ctx, id: number, input: ListInput) {
  if (!input.name?.trim()) throw new ListError("Name is required");
  ctx.db
    .prepare("UPDATE lists SET name = ?, color = ?, kind = ?, hide_on_device = ? WHERE id = ?")
    .run(input.name.trim(), input.color, input.kind, input.hideOnDevice ? 1 : 0, id);
  ctx.bus.emit("lists");
}

export function reorderLists(ctx: Ctx, ids: number[]) {
  const stmt = ctx.db.prepare("UPDATE lists SET sort = ? WHERE id = ?");
  ids.forEach((id, i) => stmt.run(i + 1, id));
  ctx.bus.emit("lists");
}

export function deleteList(ctx: Ctx, id: number) {
  ctx.db.prepare("DELETE FROM lists WHERE id = ?").run(id);
  ctx.bus.emit("lists");
}

interface ItemRow {
  id: number;
  list_id: number;
  text: string;
  section: string;
  checked: number;
  sort: number;
}

const toItem = (r: ItemRow): ListItem => ({
  id: r.id,
  listId: r.list_id,
  text: r.text,
  section: r.section,
  checked: !!r.checked,
  sort: r.sort,
});

export function listItems(ctx: Ctx, listId?: number): ListItem[] {
  const rows = (
    listId === undefined
      ? ctx.db.prepare("SELECT * FROM list_items ORDER BY list_id, sort, id").all()
      : ctx.db.prepare("SELECT * FROM list_items WHERE list_id = ? ORDER BY sort, id").all(listId)
  ) as unknown as ItemRow[];
  return rows.map(toItem);
}

export function addItems(ctx: Ctx, listId: number, items: { text: string; section?: string }[]): ListItem[] {
  if (!ctx.db.prepare("SELECT id FROM lists WHERE id = ?").get(listId)) throw new ListError("List not found");
  let sort = (ctx.db.prepare("SELECT COALESCE(MAX(sort), 0) AS s FROM list_items WHERE list_id = ?").get(listId) as { s: number }).s;
  const stmt = ctx.db.prepare("INSERT INTO list_items (list_id, text, section, sort) VALUES (?, ?, ?, ?)");
  const ids: number[] = [];
  for (const it of items) {
    const text = it.text?.trim();
    if (!text) continue;
    ids.push(Number(stmt.run(listId, text, (it.section ?? "").trim(), ++sort).lastInsertRowid));
  }
  ctx.bus.emit("lists");
  return listItems(ctx, listId).filter((i) => ids.includes(i.id));
}

export function updateItem(ctx: Ctx, id: number, patch: Partial<Pick<ListItem, "text" | "section" | "checked" | "listId">>) {
  const cur = ctx.db.prepare("SELECT * FROM list_items WHERE id = ?").get(id) as ItemRow | undefined;
  if (!cur) throw new ListError("Item not found");
  const listId = patch.listId ?? cur.list_id;
  if (listId !== cur.list_id && !ctx.db.prepare("SELECT id FROM lists WHERE id = ?").get(listId)) throw new ListError("List not found");
  // An item moved to another list goes to the end of it.
  const sort =
    listId === cur.list_id
      ? cur.sort
      : (ctx.db.prepare("SELECT COALESCE(MAX(sort), 0) + 1 AS s FROM list_items WHERE list_id = ?").get(listId) as { s: number }).s;
  ctx.db
    .prepare("UPDATE list_items SET text = ?, section = ?, checked = ?, list_id = ?, sort = ? WHERE id = ?")
    .run(
      patch.text?.trim() || cur.text,
      (patch.section ?? cur.section).trim(),
      patch.checked === undefined ? cur.checked : patch.checked ? 1 : 0,
      listId,
      sort,
      id,
    );
  ctx.bus.emit("lists");
}

export function reorderItems(ctx: Ctx, ids: number[]) {
  const stmt = ctx.db.prepare("UPDATE list_items SET sort = ? WHERE id = ?");
  ids.forEach((id, i) => stmt.run(i + 1, id));
  ctx.bus.emit("lists");
}

export function deleteItems(ctx: Ctx, ids: number[]) {
  const stmt = ctx.db.prepare("DELETE FROM list_items WHERE id = ?");
  for (const id of ids) stmt.run(id);
  ctx.bus.emit("lists");
}

export function clearCompleted(ctx: Ctx, listId: number): number {
  const res = ctx.db.prepare("DELETE FROM list_items WHERE list_id = ? AND checked = 1").run(listId);
  ctx.bus.emit("lists");
  return Number(res.changes);
}

/** Rename a section (empty name dissolves it into the unsectioned group). */
export function renameSection(ctx: Ctx, listId: number, from: string, to: string) {
  ctx.db.prepare("UPDATE list_items SET section = ? WHERE list_id = ? AND section = ?").run(to.trim(), listId, from);
  ctx.bus.emit("lists");
}

/** The list ingredients go to: the list named "Grocery List", else the first grocery list, else a new one. */
export function groceryListId(ctx: Ctx): number {
  const lists = listLists(ctx);
  const named = lists.find((l) => l.name.toLowerCase() === "grocery list");
  if (named) return named.id;
  const grocery = lists.find((l) => l.kind === "grocery");
  if (grocery) return grocery.id;
  return createList(ctx, { name: "Grocery List", color: "#7FC8A9", kind: "grocery", hideOnDevice: false }).id;
}

/** Find a list by (fuzzy) name, for voice commands. */
export function findListByName(ctx: Ctx, name: string): List | null {
  const n = name.toLowerCase().replace(/\blist\b/g, "").trim();
  const lists = listLists(ctx);
  return (
    lists.find((l) => l.name.toLowerCase() === name.toLowerCase()) ??
    lists.find((l) => l.name.toLowerCase().replace(/\blist\b/g, "").trim() === n) ??
    lists.find((l) => n && l.name.toLowerCase().includes(n)) ??
    null
  );
}
