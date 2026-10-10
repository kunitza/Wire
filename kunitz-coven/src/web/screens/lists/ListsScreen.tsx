import { useRef, useState, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, Eye, EyeOff, FolderPlus, ListPlus, Pencil, Sparkles, Trash2, Wand2, Eraser } from "lucide-react";
import type { List, ListItem } from "../../../shared/types";
import { Fab, Header } from "../../components/shell";
import { Confirm, Modal, Popover } from "../../components/ui";
import { del, post } from "../../lib/api";
import { useApp } from "../../lib/store";
import { AiErrorNote, AiWorking, toAiFail, type AiFail } from "../meals/ai";
import { ListColumn, ListEmptyBoard } from "./ListColumn";
import { AiListModal, ListEditModal } from "./ListForms";
import { itemsOf, useListsModel, usePref, visibleLists } from "./useLists";
import "./lists.css";

export default function ListsScreen() {
  const { isPhone, run, toast } = useApp();
  const { lists, items, actions } = useListsModel();
  const [showCompleted, setShowCompleted] = usePref("lists.showCompleted", true);
  const [menu, setMenu] = useState<{ list: List; anchor: HTMLElement } | null>(null);
  const [editing, setEditing] = useState<List | "new" | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [fabMenu, setFabMenu] = useState<HTMLElement | null>(null);
  const [confirm, setConfirm] = useState<{ kind: "clear" | "delete"; list: List } | null>(null);
  const [extraSections, setExtraSections] = useState<Record<number, string[]>>({});
  const [focusSection, setFocusSection] = useState<{ listId: number; section: string } | null>(null);
  const [newSection, setNewSection] = useState<List | null>(null);
  const [organizing, setOrganizing] = useState<{ list: List; error?: AiFail } | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const fabRef = useRef<HTMLDivElement>(null);

  const shown = lists ? visibleLists(lists, isPhone) : [];
  const [active, setActive] = useState(0);
  const onBoardScroll = () => {
    const el = boardRef.current;
    const first = el?.querySelector<HTMLElement>(".lc");
    if (!el || !first) return;
    const i = Math.round(el.scrollLeft / (first.offsetWidth + 12));
    if (i !== active) {
      setActive(i);
      document.querySelectorAll(".lists-tabs button")[i]?.scrollIntoView({ inline: "nearest", block: "nearest" });
    }
  };

  const scrollTo = (listId: number) => {
    requestAnimationFrame(() => {
      const el = boardRef.current?.querySelector<HTMLElement>(`[data-list="${listId}"]`);
      el?.scrollIntoView({ behavior: "smooth", inline: "start", block: "nearest" });
    });
  };

  const onCheckedHidden = (item: ListItem) =>
    toast(`Checked off “${item.text}”`, { label: "Undo", run: () => actions.update({ ...item, checked: true }, { checked: false }) });

  // Move among the lists shown here (lists hidden on this device keep their place in between).
  const move = (list: List, dir: -1 | 1) => {
    if (!lists) return;
    const i = shown.findIndex((l) => l.id === list.id);
    const other = shown[i + dir];
    if (i < 0 || !other) return;
    const ids = lists.map((l) => l.id);
    const a = ids.indexOf(list.id);
    const b = ids.indexOf(other.id);
    [ids[a], ids[b]] = [ids[b], ids[a]];
    run(() => post("/api/lists/reorder", { ids }));
  };

  const organize = async (list: List) => {
    setOrganizing({ list });
    try {
      const out = await post<{ ok: boolean; removed?: number }>(`/api/lists/${list.id}/organize`);
      setOrganizing(null);
      toast(out.removed ? `Organized! Removed ${out.removed} duplicate${out.removed === 1 ? "" : "s"}.` : "Organized into store sections ✨");
    } catch (e) {
      setOrganizing({ list, error: toAiFail(e) });
    }
  };

  const menuList = menu?.list;
  const menuItems = menuList && items ? itemsOf(items, menuList.id) : [];
  const doneCount = menuItems.filter((i) => i.checked).length;
  const menuIndex = menuList ? shown.findIndex((l) => l.id === menuList.id) : -1;

  return (
    <>
      <Header>
        <button className="pill" onClick={() => setShowCompleted(!showCompleted)} aria-pressed={showCompleted}>
          {showCompleted ? <Eye /> : <EyeOff />}
          <span className="hide-phone">{showCompleted ? "Showing completed" : "Completed hidden"}</span>
        </button>
      </Header>
      {isPhone && shown.length > 1 && (
        <div className="lists-tabs" role="tablist">
          {shown.map((l, i) => (
            <button key={l.id} className={i === active ? "on" : ""} onClick={() => scrollTo(l.id)}>
              <span className="list-color-dot" style={{ background: l.color }} />
              {l.name}
            </button>
          ))}
        </div>
      )}
      <div className="screen no-pad">
        {!lists || !items ? null : shown.length === 0 ? (
          <ListEmptyBoard>
            <button className="pill primary lg" onClick={() => setEditing("new")}>
              <ListPlus />
              New list
            </button>
          </ListEmptyBoard>
        ) : (
          <div className="lists-board" ref={boardRef} onScroll={isPhone ? onBoardScroll : undefined}>
            {shown.map((l) => (
              <ListColumn
                key={l.id}
                list={l}
                items={itemsOf(items, l.id)}
                lists={lists}
                actions={actions}
                showCompleted={showCompleted}
                onMenu={(anchor) => setMenu({ list: l, anchor })}
                extraSections={extraSections[l.id] ?? []}
                onSectionsChange={(s) => setExtraSections({ ...extraSections, [l.id]: s })}
                focusSection={focusSection?.listId === l.id ? focusSection.section : null}
                onCheckedHidden={onCheckedHidden}
              />
            ))}
            <div className="lists-end" />
          </div>
        )}
      </div>
      <div ref={fabRef}>
        <Fab onClick={() => setFabMenu(fabRef.current?.querySelector("button") ?? null)} label="New list" />
      </div>

      {fabMenu && (
        <Popover anchor={fabMenu} onClose={() => setFabMenu(null)} width={360} align="end">
          <button
            className="menu-row"
            onClick={() => {
              setFabMenu(null);
              setEditing("new");
            }}
          >
            <ListPlus />
            <span className="grow">New list</span>
          </button>
          <button
            className="menu-row sk-pill"
            onClick={() => {
              setFabMenu(null);
              setAiOpen(true);
            }}
          >
            <Sparkles />
            <span className="grow">Make a list with Sidekick</span>
          </button>
        </Popover>
      )}

      {menu && menuList && (
        <Popover anchor={menu.anchor} onClose={() => setMenu(null)} width={340} align="end">
          <MenuRow icon={<Pencil />} label="Edit list" onClick={() => (setMenu(null), setEditing(menuList))} />
          <MenuRow icon={<FolderPlus />} label="Add section" onClick={() => (setMenu(null), setNewSection(menuList))} />
          <MenuRow
            icon={<Eraser />}
            label={doneCount ? `Clear completed (${doneCount})` : "Clear completed"}
            disabled={!doneCount}
            onClick={() => (setMenu(null), setConfirm({ kind: "clear", list: menuList }))}
          />
          {menuList.kind === "grocery" && (
            <MenuRow icon={<Wand2 />} label="Organize with Sidekick" className="sk-pill" onClick={() => (setMenu(null), organize(menuList))} />
          )}
          {!isPhone && (
            <div className="row" style={{ gap: 8, marginBottom: 8 }}>
              <MenuRow flat icon={<ArrowLeft />} label="Move left" disabled={menuIndex <= 0} onClick={() => (setMenu(null), move(menuList, -1))} />
              <MenuRow
                flat
                icon={<ArrowRight />}
                label="Move right"
                disabled={menuIndex >= shown.length - 1}
                onClick={() => (setMenu(null), move(menuList, 1))}
              />
            </div>
          )}
          <MenuRow icon={<Trash2 />} label="Delete list" danger onClick={() => (setMenu(null), setConfirm({ kind: "delete", list: menuList }))} />
        </Popover>
      )}

      {editing && lists && (
        <ListEditModal
          list={editing === "new" ? undefined : editing}
          lists={lists}
          onClose={() => setEditing(null)}
          onSaved={(l) => {
            toast(`Created “${l.name}”`);
            scrollTo(l.id);
          }}
        />
      )}
      {aiOpen && lists && <AiListModal lists={lists} onClose={() => setAiOpen(false)} onCreated={(l) => scrollTo(l.id)} />}

      {newSection && (
        <SectionNameModal
          onClose={() => setNewSection(null)}
          onSave={(name) => {
            const cur = extraSections[newSection.id] ?? [];
            const exists = items?.some((i) => i.listId === newSection.id && i.section === name);
            if (!exists && !cur.includes(name)) setExtraSections({ ...extraSections, [newSection.id]: [...cur, name] });
            setFocusSection({ listId: newSection.id, section: name });
            setNewSection(null);
          }}
        />
      )}

      {confirm?.kind === "clear" && (
        <Confirm
          title="Clear completed?"
          message={`Remove ${doneCount || items?.filter((i) => i.listId === confirm.list.id && i.checked).length} checked item(s) from “${confirm.list.name}”.`}
          confirmLabel="Clear"
          onConfirm={() => actions.clearCompleted(confirm.list.id)}
          onClose={() => setConfirm(null)}
        />
      )}
      {confirm?.kind === "delete" && (
        <Confirm
          title={`Delete “${confirm.list.name}”?`}
          message="The list and all of its items will be removed."
          onConfirm={() => run(() => del(`/api/lists/${confirm.list.id}`), "List deleted")}
          onClose={() => setConfirm(null)}
        />
      )}
      {organizing && (
        <Modal title="Organize with Sidekick" onClose={() => setOrganizing(null)} size="narrow">
          {organizing.error ? (
            <AiErrorNote error={organizing.error} onNavigate={() => setOrganizing(null)} />
          ) : (
            <AiWorking text={`Sorting “${organizing.list.name}” into store sections…`} />
          )}
        </Modal>
      )}
    </>
  );
}

function MenuRow({
  icon,
  label,
  onClick,
  disabled,
  danger,
  className,
  flat,
}: {
  flat?: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  className?: string;
}) {
  return (
    <button
      className={`menu-row ${className ?? ""}`}
      onClick={onClick}
      disabled={disabled}
      style={{ opacity: disabled ? 0.4 : 1, color: danger ? "var(--danger)" : undefined, marginBottom: flat ? 0 : undefined }}
    >
      {icon}
      <span className="grow">{label}</span>
    </button>
  );
}

function SectionNameModal({ onClose, onSave }: { onClose: () => void; onSave: (name: string) => void }) {
  const [name, setName] = useState("");
  return (
    <Modal
      title="Add section"
      onClose={onClose}
      size="narrow"
      footer={
        <>
          <button className="pill" onClick={onClose}>
            Cancel
          </button>
          <button className="pill primary" disabled={!name.trim()} onClick={() => onSave(name.trim())}>
            Add section
          </button>
        </>
      }
    >
      <input
        className="input big"
        autoFocus
        placeholder="e.g. Produce, Weekend, Kids"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && name.trim() && onSave(name.trim())}
      />
    </Modal>
  );
}
