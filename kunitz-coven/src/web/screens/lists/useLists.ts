import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { post, put } from "../../lib/api";
import { useApp, useLive } from "../../lib/store";
import type { List, ListItem } from "../../../shared/types";

export interface ListsData {
  lists: List[];
  items: ListItem[];
}

export interface ListActions {
  add: (listId: number, text: string, section?: string) => Promise<void>;
  toggle: (item: ListItem) => Promise<void>;
  update: (item: ListItem, patch: Partial<Pick<ListItem, "text" | "section" | "checked" | "listId">>) => Promise<void>;
  remove: (item: ListItem) => Promise<void>;
  renameSection: (listId: number, from: string, to: string) => Promise<void>;
  clearCompleted: (listId: number) => Promise<void>;
  reorder: (ids: number[]) => Promise<void>;
}

/** Lists + items with optimistic updates (the wall display should feel instant). */
export function useListsModel() {
  const { run, toast } = useApp();
  const { data, reload } = useLive<ListsData>("/api/lists", ["lists"]);
  const [local, setLocal] = useState<ListsData | undefined>(data);
  useEffect(() => {
    if (data) setLocal(data);
  }, [data]);
  const tmp = useRef(-1);
  const patch = useCallback((fn: (items: ListItem[]) => ListItem[]) => setLocal((d) => (d ? { ...d, items: fn(d.items) } : d)), []);

  const actions = useMemo<ListActions>(() => {
    const add = async (listId: number, text: string, section = "") => {
      const t = text.trim();
      if (!t) return;
      const id = tmp.current--;
      patch((items) => [...items, { id, listId, text: t, section, checked: false, sort: 1e9 + -id }]);
      const out = await run(() => post<ListItem[]>(`/api/lists/${listId}/items`, { text: t, section }));
      patch((items) => {
        const rest = items.filter((i) => i.id !== id);
        if (!out?.length) return rest;
        return rest.some((i) => i.id === out[0].id) ? rest : [...rest, out[0]];
      });
    };
    const update: ListActions["update"] = async (item, p) => {
      patch((items) => items.map((i) => (i.id === item.id ? { ...i, ...p } : i)));
      const ok = await run(() => put(`/api/items/${item.id}`, p));
      if (!ok) patch((items) => items.map((i) => (i.id === item.id ? item : i)));
    };
    const toggle = (item: ListItem) => update(item, { checked: !item.checked });
    const remove = async (item: ListItem) => {
      patch((items) => items.filter((i) => i.id !== item.id));
      const ok = await run(() => post("/api/items/delete", { ids: [item.id] }));
      if (!ok) {
        patch((items) => [...items, item]);
        return;
      }
      let undone = false; // the toast stays up after tapping Undo: don't restore twice
      toast(`Deleted “${item.text}”`, {
        label: "Undo",
        run: () => {
          if (undone) return;
          undone = true;
          run(() => post(`/api/lists/${item.listId}/items`, { text: item.text, section: item.section })).then((out) => {
            const added = (out as ListItem[] | undefined)?.[0];
            if (added && item.checked) run(() => put(`/api/items/${added.id}`, { checked: true }));
          });
        },
      });
    };
    const renameSection = async (listId: number, from: string, to: string) => {
      patch((items) => items.map((i) => (i.listId === listId && i.section === from ? { ...i, section: to.trim() } : i)));
      await run(() => post(`/api/lists/${listId}/sections/rename`, { from, to }));
    };
    const clearCompleted = async (listId: number) => {
      patch((items) => items.filter((i) => !(i.listId === listId && i.checked)));
      const out = await run(() => post<{ removed: number }>(`/api/lists/${listId}/clear-completed`));
      if (out) toast(`Cleared ${out.removed} completed item${out.removed === 1 ? "" : "s"}`);
    };
    const reorder = async (ids: number[]) => {
      const pos = new Map(ids.map((id, i) => [id, i + 1]));
      patch((items) => items.map((i) => (pos.has(i.id) ? { ...i, sort: pos.get(i.id)! } : i)));
      await run(() => post("/api/items/reorder", { ids }));
    };
    return { add, update, toggle, remove, renameSection, clearCompleted, reorder };
  }, [patch, run, toast]);

  return { lists: local?.lists, items: local?.items, actions, reload };
}

// ---- Per-device view preferences (localStorage) ----

export function usePref<T>(key: string, initial: T): [T, (v: T) => void] {
  const [v, setV] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(`haven.${key}`);
      return raw == null ? initial : (JSON.parse(raw) as T);
    } catch {
      return initial;
    }
  });
  const set = useCallback(
    (next: T) => {
      setV(next);
      try {
        localStorage.setItem(`haven.${key}`, JSON.stringify(next));
      } catch {
        /* ignore */
      }
    },
    [key],
  );
  return [v, set];
}

/** Order lists for display: hidden-on-device lists are only shown on phones. */
export function visibleLists(lists: List[], isPhone: boolean) {
  return lists.filter((l) => isPhone || !l.hideOnDevice);
}

export function itemsOf(items: ListItem[], listId: number) {
  return items.filter((i) => i.listId === listId);
}
