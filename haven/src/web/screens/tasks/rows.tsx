import type React from "react";
import { useEffect, useState } from "react";
import { SkipForward } from "lucide-react";
import type { Profile, TaskInstance } from "../../../shared/types";
import { useApp } from "../../lib/store";
import { tint } from "../../lib/format";
import { Avatar, CheckCircle, ProgressRing } from "../../components/ui";
import { ColAvatar, TaskChips, taskSubline, type Section, type TaskController } from "./taskKit";

/** The check circle, or a "skipped" circle that unskips when tapped. */
export function TaskCheck({ inst, color, size = 44, ctl }: { inst: TaskInstance; color: string; size?: number; ctl: TaskController }) {
  if (inst.status === "skipped")
    return (
      <button
        type="button"
        className="tasks-skipped-circle"
        style={{ width: size, height: size }}
        aria-label="Skipped. Tap to unskip"
        onClick={(e) => {
          e.stopPropagation();
          ctl.toggle(inst);
        }}
      >
        <SkipForward size={size * 0.42} />
      </button>
    );
  const max = inst.task.maxPerDay || 1;
  if (max > 1 && inst.status !== "done") {
    // Repeatable chore: a ring that fills a step each time, with the count inside.
    return (
      <button
        type="button"
        className="tasks-multi-check"
        aria-label={`Complete ${inst.task.title} (${inst.count} of ${max} done)`}
        onClick={(e) => {
          e.stopPropagation();
          ctl.toggle(inst);
        }}
        style={{ width: size, height: size }}
      >
        <ProgressRing size={size} value={inst.count / max} color={color} track="rgba(0,0,0,0.06)" stroke={4}>
          <span style={{ position: "relative", fontWeight: 700, fontSize: size * 0.32, color: inst.count ? "#1f1f1f" : "#9f9f9f" }}>
            {inst.count}/{max}
          </span>
        </ProgressRing>
      </button>
    );
  }
  return <CheckCircle done={inst.status === "done"} color={color} size={size} onClick={() => ctl.toggle(inst)} label={`${inst.status === "done" ? "Undo" : "Complete"} ${inst.task.title}`} />;
}

/** A chore or routine row inside a profile column. Routines with an emoji get Skylight's big emoji card. */
export function TaskRow({ inst, color, compact = false, ctl }: { inst: TaskInstance; color: string; compact?: boolean; ctl: TaskController }) {
  const { today, settings, profileById } = useApp();
  const done = inst.status === "done";
  const skipped = inst.status === "skipped";
  const sub = taskSubline(inst, today, settings.clock24h);
  const bg = done ? tint(color, 0.42) : tint(color, compact ? 0.13 : 0.15);
  const by = inst.profileId === null && done ? profileById(inst.completedBy) : undefined;
  const big = !compact && inst.task.kind === "routine" && !!inst.task.emoji;
  const open = (e: React.MouseEvent<HTMLElement> | React.KeyboardEvent<HTMLElement>) => ctl.openDetails(inst, e.currentTarget);
  const onKey = (e: React.KeyboardEvent<HTMLElement>) => {
    if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      open(e);
    }
  };
  const subline = (sub.late || sub.text.length > 0 || skipped) && (
    <div className="tasks-row-sub truncate">
      {skipped && "Skipped · "}
      {sub.late && <span className="late">{sub.late}</span>}
      {sub.late && sub.text.length > 0 && " · "}
      {sub.text.join(" · ")}
    </div>
  );
  const cls = `tasks-row ${compact ? "compact" : ""} ${big ? "big" : ""} ${done ? "done" : ""} ${skipped ? "skipped" : ""} ${inst.late ? "late" : ""}`;
  if (big)
    return (
      <div className={cls} style={{ background: bg }} onClick={open} onKeyDown={onKey} role="button" tabIndex={0}>
        <div className="tasks-row-bigemoji" aria-hidden>
          {inst.task.emoji}
        </div>
        <div className="row" style={{ gap: 12 }}>
          <div className="grow">
            <div className="tasks-row-title">{inst.task.title}</div>
            {subline}
            <TaskChips inst={inst} />
          </div>
          <TaskCheck inst={inst} color={color} ctl={ctl} />
        </div>
      </div>
    );
  return (
    <div className={cls} style={{ background: bg }} onClick={open} onKeyDown={onKey} role="button" tabIndex={0}>
      {inst.task.emoji && (
        <span className="tasks-row-emoji" aria-hidden>
          {inst.task.emoji}
        </span>
      )}
      <div className="grow">
        <div className="tasks-row-title truncate">{inst.task.title}</div>
        {!compact && subline}
        {compact && sub.late && <div className="tasks-row-sub"><span className="late">Late</span></div>}
        {!compact && <TaskChips inst={inst} />}
      </div>
      {by && <Avatar profile={by} size={compact ? 26 : 32} style={{ boxShadow: "0 0 0 2px #fff" }} />}
      <TaskCheck inst={inst} color={color} size={compact ? 38 : 44} ctl={ctl} />
    </div>
  );
}

export function RingButton({
  section,
  on,
  done,
  total,
  color,
  onClick,
  size = 68,
}: {
  section: { id: Section; label: string; emoji: string };
  on: boolean;
  done: number;
  total: number;
  color: string;
  onClick: () => void;
  size?: number;
}) {
  return (
    <button type="button" className={`tasks-ring ${on ? "on" : ""}`} onClick={onClick} aria-pressed={on} aria-label={`${section.label}: ${done} of ${total} done`}>
      <ProgressRing size={size} value={total ? done / total : 0} color={color} track={tint(color, 0.22)} stroke={3.5}>
        <span className="tasks-ring-inner" style={{ width: size - 12, height: size - 12, fontSize: size * 0.4, background: on ? "#fff" : tint(color, 0.14) }}>
          {section.emoji}
        </span>
      </ProgressRing>
      <span className="tasks-ring-lbl">{section.label}</span>
    </button>
  );
}

/**
 * Phones show one profile column at a time (swipe sideways). This strip of names above the board shows
 * which column is in view and jumps to another one.
 */
export function ColumnTabs({ cols, board }: { cols: (Profile | null)[]; board: HTMLElement | null }) {
  const [active, setActive] = useState(0);
  useEffect(() => {
    if (!board) return;
    const onScroll = () => {
      const first = board.firstElementChild as HTMLElement | null;
      if (!first) return;
      const gap = parseFloat(getComputedStyle(board).columnGap) || 0;
      setActive(Math.max(0, Math.min(cols.length - 1, Math.round(board.scrollLeft / (first.offsetWidth + gap)))));
    };
    onScroll();
    board.addEventListener("scroll", onScroll, { passive: true });
    return () => board.removeEventListener("scroll", onScroll);
  }, [board, cols.length]);
  useEffect(() => {
    document.querySelector(".tasks-coltabs .on")?.scrollIntoView({ inline: "nearest", block: "nearest" });
  }, [active]);
  return (
    <div className="tasks-coltabs" role="tablist" aria-label="Profiles">
      {cols.map((p, i) => (
        <button
          key={p?.id ?? "up"}
          role="tab"
          aria-selected={i === active}
          className={i === active ? "on" : ""}
          onClick={() => (board?.children[i] as HTMLElement | undefined)?.scrollIntoView({ behavior: "smooth", inline: "start", block: "nearest" })}
        >
          <ColAvatar profile={p} size={30} />
          {p?.name ?? "Up For Grabs"}
        </button>
      ))}
    </div>
  );
}
