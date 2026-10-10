import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ListItem } from "../../../shared/types";
import { useApp } from "../../lib/store";
import { ListColumn } from "./ListColumn";
import { itemsOf, useListsModel, usePref, visibleLists } from "./useLists";
import "./lists.css";

/**
 * Lists panel on the Home screen: two list cards side by side (one on phones), paged with ‹ ›.
 * The ‹ › buttons are portaled into the enclosing `.panel`'s `.panel-head` (top-right), or rendered
 * inline above the cards when there is no panel head.
 */
export function ListsPane() {
  const { isPhone, toast, go } = useApp();
  const { lists, items, actions } = useListsModel();
  const [showCompleted] = usePref("lists.showCompleted", true);
  const [page, setPage] = usePref("home.listsPage", 0);
  const rootRef = useRef<HTMLDivElement>(null);
  const [head, setHead] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => {
    setHead(rootRef.current?.closest(".panel")?.querySelector<HTMLElement>(".panel-head") ?? null);
  }, []);

  const shown = lists ? visibleLists(lists, isPhone) : [];
  const per = isPhone ? 1 : 2;
  const maxStart = Math.max(0, shown.length - per);
  const start = Math.min(Math.max(0, page), maxStart);
  const cards = shown.slice(start, start + per);

  const nav =
    shown.length > per ? (
      <span className="lp-nav">
        <button aria-label="Previous lists" disabled={start === 0} onClick={() => setPage(Math.max(0, start - 1))}>
          <ChevronLeft />
        </button>
        <button aria-label="Next lists" disabled={start >= maxStart} onClick={() => setPage(Math.min(maxStart, start + 1))}>
          <ChevronRight />
        </button>
      </span>
    ) : null;

  const onCheckedHidden = (item: ListItem) =>
    toast(`Checked off “${item.text}”`, { label: "Undo", run: () => actions.update({ ...item, checked: true }, { checked: false }) });

  return (
    <div ref={rootRef} style={{ height: "100%", display: "flex", flexDirection: "column", gap: 10 }}>
      {head ? nav && createPortal(nav, head) : nav && <div className="row">{nav}</div>}
      {lists && items && shown.length === 0 && (
        <div className="empty" style={{ flex: 1 }}>
          <div className="big">📝</div>
          <div>No lists yet</div>
          <button className="pill primary" onClick={() => go("lists")}>
            Create a list
          </button>
        </div>
      )}
      {lists && items && cards.length > 0 && (
        <div className={`lp ${cards.length === 1 ? "one" : ""}`} style={{ flex: 1 }}>
          {cards.map((l) => (
            <ListColumn
              key={l.id}
              list={l}
              items={itemsOf(items, l.id)}
              lists={lists}
              actions={actions}
              showCompleted={showCompleted}
              compact
              onCheckedHidden={onCheckedHidden}
            />
          ))}
        </div>
      )}
    </div>
  );
}
