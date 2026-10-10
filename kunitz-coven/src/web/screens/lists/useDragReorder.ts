import { useCallback, useEffect, useRef, useState, type CSSProperties, type MouseEvent as RMouseEvent, type PointerEvent as RPointerEvent } from "react";

interface DragState {
  id: number;
  group: string;
  ids: number[]; // order of the draggable rows in the group when the drag started
  rects: { top: number; height: number }[];
  from: number;
  startY: number;
  y: number;
}

const GAP = 10;
const HOLD_MS = 320;

/**
 * Press-and-hold (touch) or press-and-move (mouse) to drag a row up/down within its group.
 * Rows must carry `data-drag-id`; `container` is the element that holds the rows.
 */
export function useDragReorder(onDrop: (group: string, orderedIds: number[]) => void) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  dragRef.current = drag;
  const pending = useRef<{ timer: number; x: number; y: number; cancel: () => void } | null>(null);
  const suppressClick = useRef(false);

  const begin = (el: HTMLElement, id: number, group: string, ids: number[], y: number) => {
    const container = el.closest("[data-drag-group]") as HTMLElement | null;
    if (!container) return;
    const rows = ids.map((i) => container.querySelector<HTMLElement>(`[data-drag-id="${i}"]`));
    if (rows.some((r) => !r)) return;
    const rects = rows.map((r) => {
      const b = r!.getBoundingClientRect();
      return { top: b.top, height: b.height };
    });
    suppressClick.current = true;
    navigator.vibrate?.(15);
    setDrag({ id, group, ids, rects, from: ids.indexOf(id), startY: y, y });
  };

  const target = (d: DragState) => {
    const r = d.rects[d.from];
    const center = r.top + r.height / 2 + (d.y - d.startY);
    let t = 0;
    d.rects.forEach((o, i) => {
      if (i !== d.from && o.top + o.height / 2 < center) t++;
    });
    return t;
  };

  useEffect(() => {
    if (!drag) return;
    const move = (e: PointerEvent) => setDrag((d) => (d ? { ...d, y: e.clientY } : d));
    const up = () => {
      const d = dragRef.current;
      setDrag(null);
      if (!d) return;
      const t = target(d);
      if (t !== d.from) {
        const ids = d.ids.filter((x) => x !== d.id);
        ids.splice(t, 0, d.id);
        onDrop(d.group, ids);
      }
      setTimeout(() => (suppressClick.current = false), 50);
    };
    const block = (e: TouchEvent) => e.preventDefault();
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    window.addEventListener("touchmove", block, { passive: false });
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      window.removeEventListener("touchmove", block);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!drag]);

  /** Props for a draggable row. */
  const rowProps = useCallback(
    (id: number, group: string, ids: number[]) => ({
      "data-drag-id": id,
      onPointerDown: (e: RPointerEvent<HTMLElement>) => {
        if (e.button !== 0 || (e.target as HTMLElement).closest(".lc-check")) return;
        const el = e.currentTarget;
        const x0 = e.clientX;
        const y0 = e.clientY;
        const mouse = e.pointerType === "mouse";
        const cleanup = () => {
          clearTimeout(p.timer);
          window.removeEventListener("pointermove", onMove);
          window.removeEventListener("pointerup", cleanup);
          window.removeEventListener("pointercancel", cleanup);
          pending.current = null;
        };
        const onMove = (ev: PointerEvent) => {
          const dx = Math.abs(ev.clientX - x0);
          const dy = Math.abs(ev.clientY - y0);
          if (mouse && dy > 6 && dy > dx) {
            cleanup();
            begin(el, id, group, ids, y0);
            setDrag((d) => (d ? { ...d, y: ev.clientY } : d));
          } else if (!mouse && (dx > 8 || dy > 8)) cleanup();
        };
        const p = { timer: window.setTimeout(() => (cleanup(), begin(el, id, group, ids, y0)), HOLD_MS), x: x0, y: y0, cancel: cleanup };
        pending.current?.cancel();
        pending.current = p;
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", cleanup);
        window.addEventListener("pointercancel", cleanup);
      },
      onClickCapture: (e: RMouseEvent) => {
        if (suppressClick.current) {
          e.stopPropagation();
          e.preventDefault();
        }
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  /** Style for a row while a drag is in progress (the dragged row follows the pointer; others make room). */
  const rowStyle = (id: number, group: string): CSSProperties | undefined => {
    const d = drag;
    if (!d || d.group !== group) return undefined;
    const i = d.ids.indexOf(id);
    if (i < 0) return undefined;
    if (id === d.id)
      return {
        transform: `translateY(${d.y - d.startY}px) scale(1.02)`,
        boxShadow: "0 14px 30px rgba(20,30,40,0.18)",
        zIndex: 5,
        position: "relative",
        transition: "box-shadow .15s",
        cursor: "grabbing",
      };
    const t = target(d);
    const h = d.rects[d.from].height + GAP;
    let shift = 0;
    if (d.from < t && i > d.from && i <= t) shift = -h;
    if (d.from > t && i >= t && i < d.from) shift = h;
    return { transform: `translateY(${shift}px)`, transition: "transform .15s ease" };
  };

  return { dragging: drag?.id ?? null, rowProps, rowStyle };
}
