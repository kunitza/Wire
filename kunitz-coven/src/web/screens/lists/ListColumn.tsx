import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Check, ChevronUp, MoreVertical, Plus, Trash2 } from "lucide-react";
import type { List, ListItem } from "../../../shared/types";
import { tint } from "../../lib/format";
import { strong } from "./color";
import type { ListActions } from "./useLists";
import { usePref } from "./useLists";
import { useDragReorder } from "./useDragReorder";

interface Group {
  section: string;
  items: ListItem[];
  open: number;
}

const bySort = (a: ListItem, b: ListItem) => a.sort - b.sort || a.id - b.id;

/** Group a list's items into sections (unsectioned first); open items first, completed at the bottom of each group. */
export function groupItems(list: List, items: ListItem[], showCompleted: boolean, holding: Set<number>, extraSections: string[]): Group[] {
  const done = (i: ListItem) => i.checked && !holding.has(i.id);
  const map = new Map<string, ListItem[]>();
  const firstSort = new Map<string, number>();
  for (const i of [...items].sort(bySort)) {
    if (!map.has(i.section)) {
      map.set(i.section, []);
      firstSort.set(i.section, i.sort);
    }
    map.get(i.section)!.push(i);
  }
  for (const s of extraSections) if (!map.has(s)) map.set(s, []);
  let names = [...map.keys()].filter((s) => s !== "");
  if (list.kind === "grocery") names.sort((a, b) => a.localeCompare(b));
  else names = names.sort((a, b) => (firstSort.get(a) ?? Infinity) - (firstSort.get(b) ?? Infinity));
  if (map.has("")) names.unshift("");
  return names
    .map((section) => {
      const all = map.get(section)!;
      const openItems = all.filter((i) => !done(i));
      const doneItems = showCompleted ? all.filter(done) : [];
      return { section, items: [...openItems, ...doneItems], open: all.filter((i) => !i.checked).length };
    })
    .filter((g) => g.items.length > 0 || extraSections.includes(g.section) || (g.section !== "" && g.open > 0));
}

export function ListColumn({
  list,
  items,
  lists,
  actions,
  showCompleted,
  compact = false,
  onMenu,
  extraSections = [],
  onSectionsChange,
  focusSection,
  style,
  onCheckedHidden,
}: {
  list: List;
  items: ListItem[];
  lists: List[];
  actions: ListActions;
  showCompleted: boolean;
  compact?: boolean;
  onMenu?: (anchor: HTMLElement) => void;
  /** Sections created with "Add section" that have no items yet. */
  extraSections?: string[];
  onSectionsChange?: (s: string[]) => void;
  /** Open the inline "add" field of this section (used right after "Add section"). */
  focusSection?: string | null;
  style?: CSSProperties;
  /** Called when an item was checked off and will disappear (completed items hidden). */
  onCheckedHidden?: (item: ListItem) => void;
}) {
  const color = list.color;
  const strongColor = strong(color);
  const rowBg = tint(color, 0.3);
  const [holding, setHolding] = useState<Set<number>>(new Set());
  const [editing, setEditing] = useState<number | null>(null);
  const [addingIn, setAddingIn] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [collapsed, setCollapsed] = usePref<string[]>(`lists.collapsed.${list.id}`, []);
  const [text, setText] = useState("");
  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach((t) => clearTimeout(t)), []);
  useEffect(() => {
    if (focusSection) setAddingIn(focusSection);
  }, [focusSection]);

  const drag = useDragReorder((_group, ordered) => {
    // Put the group's reordered ids back into their slots in the list's overall order.
    const all = [...items].sort(bySort).map((i) => i.id);
    const slots = all.map((id, idx) => (ordered.includes(id) ? idx : -1)).filter((x) => x >= 0);
    slots.forEach((slot, k) => (all[slot] = ordered[k]));
    actions.reorder(all);
  });

  const groups = useMemo(() => groupItems(list, items, showCompleted, holding, extraSections), [list, items, showCompleted, holding, extraSections]);
  const open = items.filter((i) => !i.checked).length;
  const sectioned = groups.some((g) => g.section !== "");
  const sections = useMemo(() => [...new Set([...items.map((i) => i.section), ...extraSections].filter(Boolean))], [items, extraSections]);

  const toggle = (item: ListItem) => {
    if (!item.checked) {
      // Keep the item in place for a moment so the check is visible before it moves/disappears.
      setHolding((h) => new Set(h).add(item.id));
      const t = window.setTimeout(() => {
        setHolding((h) => {
          const n = new Set(h);
          n.delete(item.id);
          return n;
        });
        if (!showCompleted) onCheckedHidden?.(item);
      }, 650);
      timers.current.push(t);
    }
    actions.toggle(item);
  };

  const submitAdd = (section: string, value: string, clear: () => void) => {
    const v = value.trim();
    if (!v) return;
    actions.add(list.id, v, section);
    if (section && extraSections.includes(section)) onSectionsChange?.(extraSections.filter((s) => s !== section));
    clear();
  };

  return (
    <section data-list={list.id} className={`lc ${compact ? "compact" : ""}`} style={{ background: tint(color, 0.14), ...style }} aria-label={list.name}>
      <div className="lc-head">
        <h2 className="serif lc-title">{list.name}</h2>
        <span className="lc-count" style={{ background: strongColor }} aria-label={`${open} open items`}>
          {open}
        </span>
        {onMenu && (
          <button className="lc-menu" aria-label="List options" onClick={(e) => onMenu(e.currentTarget)}>
            <MoreVertical />
          </button>
        )}
      </div>
      <form
        className="lc-addrow"
        onSubmit={(e) => {
          e.preventDefault();
          submitAdd("", text, () => setText(""));
        }}
      >
        <input
          className="lc-add"
          style={{ background: rowBg }}
          placeholder="Add item"
          value={text}
          onChange={(e) => setText(e.target.value)}
          aria-label={`Add item to ${list.name}`}
          enterKeyHint="done"
        />
        {text.trim() && (
          <button className="lc-add-btn" type="submit" aria-label="Add" style={{ background: strongColor }}>
            <Plus />
          </button>
        )}
      </form>
      <div className="lc-body">
        {groups.length === 0 && (
          <div className="lc-empty">
            <span>{items.length ? "🎉" : "📝"}</span>
            {items.length ? "All done!" : "Nothing here yet"}
          </div>
        )}
        {groups.map((g) => {
          const isCollapsed = g.section !== "" && collapsed.includes(g.section);
          return (
            <div key={g.section || "_"} className="lc-group">
              {g.section !== "" && (
                <div className="lc-sec">
                  {renaming === g.section ? (
                    <InlineInput
                      initial={g.section}
                      className="serif lc-sec-input"
                      style={{ background: rowBg }}
                      onDone={(v) => {
                        setRenaming(null);
                        if (v === g.section) return;
                        if (extraSections.includes(g.section) && !items.some((i) => i.section === g.section)) {
                          onSectionsChange?.(
                            v.trim() ? extraSections.map((s) => (s === g.section ? v.trim() : s)) : extraSections.filter((s) => s !== g.section),
                          );
                        } else actions.renameSection(list.id, g.section, v);
                      }}
                      onCancel={() => setRenaming(null)}
                    />
                  ) : (
                    <button className="serif lc-sec-title truncate" onClick={() => setRenaming(g.section)} title="Rename section">
                      {g.section}
                    </button>
                  )}
                  <span className="lc-sec-count" style={{ background: tint(color, 0.4) }}>
                    {g.open}
                  </span>
                  {!compact && (
                    <button
                      className="lc-sec-btn add"
                      aria-label={`Add item to ${g.section}`}
                      onClick={() => setAddingIn(addingIn === g.section ? null : g.section)}
                    >
                      <Plus />
                    </button>
                  )}
                  <button
                    className="lc-sec-btn"
                    aria-label={isCollapsed ? "Expand section" : "Collapse section"}
                    aria-expanded={!isCollapsed}
                    onClick={() => setCollapsed(isCollapsed ? collapsed.filter((s) => s !== g.section) : [...collapsed, g.section])}
                  >
                    <ChevronUp style={{ transform: isCollapsed ? "rotate(180deg)" : undefined, transition: "transform 0.15s" }} />
                  </button>
                </div>
              )}
              {!isCollapsed && (
                <div className="lc-items" data-drag-group={g.section}>
                  {addingIn === g.section && g.section !== "" && (
                    <SectionAdd bg={rowBg} section={g.section} onAdd={(v) => submitAdd(g.section, v, () => undefined)} onClose={() => setAddingIn(null)} />
                  )}
                  {g.items.map((item) =>
                    editing === item.id ? (
                      <ItemEditor
                        key={item.id}
                        item={item}
                        list={list}
                        lists={lists}
                        sections={sections}
                        bg={rowBg}
                        onClose={() => setEditing(null)}
                        actions={actions}
                      />
                    ) : (
                      <ItemRow
                        key={item.id}
                        dragProps={
                          item.checked
                            ? undefined
                            : drag.rowProps(
                                item.id,
                                g.section,
                                g.items.filter((i) => !i.checked).map((i) => i.id),
                              )
                        }
                        style={drag.rowStyle(item.id, g.section)}
                        item={item}
                        bg={item.checked ? tint(color, 0.2) : rowBg}
                        checkColor={strongColor}
                        onToggle={() => toggle(item)}
                        onEdit={() => setEditing(item.id)}
                      />
                    ),
                  )}
                  {g.items.length === 0 && addingIn !== g.section && (
                    <button className="lc-sec-empty" onClick={() => setAddingIn(g.section)}>
                      + Add to {g.section}
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {sectioned && <div style={{ height: 8 }} />}
      </div>
    </section>
  );
}

function ItemRow({
  item,
  bg,
  checkColor,
  onToggle,
  onEdit,
  dragProps,
  style,
}: {
  item: ListItem;
  bg: string;
  checkColor: string;
  onToggle: () => void;
  onEdit: () => void;
  dragProps?: ReturnType<ReturnType<typeof useDragReorder>["rowProps"]>;
  style?: CSSProperties;
}) {
  return (
    <div className={`lc-row ${item.checked ? "done" : ""}`} style={{ background: bg, ...style }} {...dragProps}>
      <button className="lc-text" onClick={onEdit}>
        {item.text}
      </button>
      <button
        className="lc-check"
        role="checkbox"
        aria-checked={item.checked}
        aria-label={item.checked ? `Uncheck ${item.text}` : `Check ${item.text}`}
        onClick={onToggle}
        style={item.checked ? { background: checkColor, boxShadow: "none" } : undefined}
      >
        {item.checked && <Check strokeWidth={3} />}
      </button>
    </div>
  );
}

function InlineInput({
  initial,
  onDone,
  onCancel,
  className,
  style,
}: {
  initial: string;
  onDone: (v: string) => void;
  onCancel: () => void;
  className?: string;
  style?: CSSProperties;
}) {
  const [v, setV] = useState(initial);
  const done = useRef(false);
  const finish = (cancel: boolean) => {
    if (done.current) return;
    done.current = true;
    if (cancel) onCancel();
    else onDone(v);
  };
  return (
    <input
      autoFocus
      className={className}
      style={style}
      value={v}
      onChange={(e) => setV(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") finish(false);
        if (e.key === "Escape") finish(true);
      }}
      onBlur={() => finish(false)}
      aria-label="Section name"
    />
  );
}

function SectionAdd({ bg, section, onAdd, onClose }: { bg: string; section: string; onAdd: (v: string) => void; onClose: () => void }) {
  const [v, setV] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (v.trim()) onAdd(v);
        setV("");
      }}
    >
      <input
        autoFocus
        className="lc-add sm"
        style={{ background: bg }}
        placeholder={`Add to ${section}`}
        value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => {
          if (v.trim()) onAdd(v);
          onClose();
        }}
        onKeyDown={(e) => e.key === "Escape" && onClose()}
      />
    </form>
  );
}

const NEW_SECTION = "\u0000new";

function ItemEditor({
  item,
  list,
  lists,
  sections,
  bg,
  onClose,
  actions,
}: {
  item: ListItem;
  list: List;
  lists: List[];
  sections: string[];
  bg: string;
  onClose: () => void;
  actions: ListActions;
}) {
  const [text, setText] = useState(item.text);
  const [section, setSection] = useState(item.section);
  const [newSection, setNewSection] = useState<string | null>(null);
  const [listId, setListId] = useState(item.listId);
  const ref = useRef<HTMLDivElement>(null);
  const save = () => {
    const sec = newSection !== null ? newSection.trim() : section;
    const patch: Partial<ListItem> = {};
    if (text.trim() && text.trim() !== item.text) patch.text = text.trim();
    if (sec !== item.section) patch.section = sec;
    if (listId !== item.listId) {
      patch.listId = listId;
      // Sections are per list; keep the section only if the other list uses the same one.
      if (patch.section === undefined && item.section) patch.section = item.section;
    }
    if (Object.keys(patch).length) actions.update(item, patch);
    onClose();
  };
  useEffect(() => {
    ref.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, []);
  const opts = [...new Set([...sections, item.section].filter(Boolean))].sort((a, b) => a.localeCompare(b));
  return (
    <div ref={ref} className="lc-edit" style={{ background: bg }} onKeyDown={(e) => e.key === "Escape" && onClose()}>
      <input
        autoFocus
        className="lc-edit-input"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && save()}
        aria-label="Item"
      />
      <div className="lc-edit-grid">
        <label className="field">
          <span className="label">Section</span>
          {newSection !== null ? (
            <input
              className="input"
              autoFocus
              placeholder="New section name"
              value={newSection}
              onChange={(e) => setNewSection(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && save()}
            />
          ) : (
            <select
              className="select"
              value={section}
              onChange={(e) => {
                if (e.target.value === NEW_SECTION) setNewSection("");
                else setSection(e.target.value);
              }}
            >
              <option value="">No section</option>
              {opts.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
              <option value={NEW_SECTION}>New section…</option>
            </select>
          )}
        </label>
        <label className="field">
          <span className="label">List</span>
          <select className="select" value={listId} onChange={(e) => setListId(Number(e.target.value))}>
            {lists.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="row">
        <button
          className="pill danger"
          onClick={() => {
            actions.remove(item);
            onClose();
          }}
        >
          <Trash2 />
          Delete
        </button>
        <span className="spacer" />
        <button className="pill white" onClick={onClose}>
          Cancel
        </button>
        <button className="pill primary" onClick={save}>
          {listId !== list.id ? "Move" : "Done"}
        </button>
      </div>
    </div>
  );
}

export function ListEmptyBoard({ children }: { children?: ReactNode }) {
  return (
    <div className="empty" style={{ height: "100%" }}>
      <div className="big">📝</div>
      <div className="serif" style={{ fontSize: 28 }}>
        No lists yet
      </div>
      {children}
    </div>
  );
}
