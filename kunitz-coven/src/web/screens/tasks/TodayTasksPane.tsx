import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Profile, TaskInstance } from "../../../shared/types";
import { addDays } from "../../../shared/dates";
import { useApp } from "../../lib/store";
import { tint } from "../../lib/format";
import { ColAvatar, DoneChip, StarChip, colorOf, partOfDay, progressOf, useTaskController, type TaskController } from "./taskKit";
import { TaskRow } from "./rows";
import "./tasks.css";

export { TaskForm } from "./TaskForm";

const PER_PAGE = 4;

/**
 * "Today's Tasks" panel on the Home screen: a 2x2 grid of compact profile cards (people first, then Up For Grabs).
 *
 * Paging: by default the pane draws its own small ‹ › buttons inside the enclosing `.panel-head` (via a portal),
 * or inline above the grid if there is none. To draw them yourself, pass `page` + `onPage`, and read the number of
 * pages from `onPages` (use <TodayTasksPager/> if you like). On phones all cards are stacked and there is no paging.
 */
export function TodayTasksPane({ page, onPage, onPages }: { page?: number; onPage?: (p: number) => void; onPages?: (n: number) => void } = {}) {
  const { today, people, settings, isPhone, now } = useApp();
  const ctl = useTaskController(today, addDays(today, 1));
  const [own, setOwn] = useState(0);
  const controlled = page !== undefined;
  const ts = settings.tasks;
  const list = (ctl.instances ?? []).filter((i) => i.date === today);
  const hasUfg = list.some((i) => i.profileId === null);
  const cards: (Profile | null)[] = [...people.filter((p) => !ts.hiddenProfiles.includes(p.id)), ...(ts.showUpForGrabs && hasUfg ? [null] : [])];
  const pages = isPhone ? 1 : Math.max(1, Math.ceil(cards.length / PER_PAGE));
  const pg = Math.min(controlled ? page : own, pages - 1);
  const setPg = (p: number) => (controlled ? onPage?.(p) : setOwn(p));
  useEffect(() => onPages?.(pages), [pages, onPages]);

  const ref = useRef<HTMLDivElement>(null);
  const [head, setHead] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => {
    const h = ref.current?.closest(".panel")?.querySelector<HTMLElement>(":scope > .panel-head");
    setHead(h ?? null);
  }, []);

  const shown = isPhone ? cards : cards.slice(pg * PER_PAGE, pg * PER_PAGE + PER_PAGE);
  const pager = !controlled && pages > 1 && <TodayTasksPager page={pg} pages={pages} onPage={setPg} />;
  const part = partOfDay(now);

  return (
    <div className="ttp" ref={ref}>
      {pager && (head ? createPortal(pager, head) : <div className="ttp-pager-inline">{pager}</div>)}
      {!ctl.instances ? null : cards.length === 0 ? (
        <div className="ttp-empty">
          <div className="big">😊</div>
          Nothing to do today.
        </div>
      ) : (
        <div className={`ttp-grid ${cards.length <= 2 ? "rows-1" : ""}`}>
          {shown.map((p) => (
            <CompactCard key={p?.id ?? "up"} profile={p} list={list.filter((i) => i.profileId === (p?.id ?? null))} part={part} ctl={ctl} />
          ))}
        </div>
      )}
      {ctl.overlays}
    </div>
  );
}

export function TodayTasksPager({ page, pages, onPage }: { page: number; pages: number; onPage: (p: number) => void }) {
  return (
    <span className="ttp-pager">
      <button className="pill icon sm" aria-label="Previous profiles" disabled={page <= 0} onClick={() => onPage(page - 1)}>
        <ChevronLeft />
      </button>
      <button className="pill icon sm" aria-label="More profiles" disabled={page >= pages - 1} onClick={() => onPage(page + 1)}>
        <ChevronRight />
      </button>
    </span>
  );
}

function CompactCard({ profile, list, part, ctl }: { profile: Profile | null; list: TaskInstance[]; part: string; ctl: TaskController }) {
  const { settings } = useApp();
  const ts = settings.tasks;
  const color = colorOf(profile);
  const prog = progressOf(list);
  // Like the wall view: routines for the current part of the day, plus chores.
  const items = list.filter(
    (i) =>
      (i.task.kind === "chore" || i.part === part) &&
      (ts.showCompleted || i.status !== "done") &&
      (ts.showSkipped || i.status !== "skipped") &&
      (ts.showLate || !i.late),
  );
  const showStars = !!profile && (profile.stars !== 0 || list.some((i) => i.task.stars > 0));
  const allDone = prog.total > 0 && prog.done === prog.total;
  return (
    <section className="ttp-card" style={{ background: tint(color, 0.08) }} aria-label={profile?.name ?? "Up For Grabs"}>
      <header className="ttp-head">
        <ColAvatar profile={profile} size={64} />
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="serif ttp-name truncate">{profile?.name ?? "Up For Grabs"}</div>
          <div className="tasks-col-chips">
            <DoneChip done={prog.done} total={prog.total} color={color} />
            {showStars && <StarChip n={profile!.stars} color={color} />}
          </div>
        </div>
      </header>
      <div className="ttp-body">
        {items.length ? (
          items.map((i) => <TaskRow key={`${i.task.id}|${i.occurrence}|${i.part}`} inst={i} color={color} compact ctl={ctl} />)
        ) : (
          <div className="ttp-empty">
            <div className="big">{allDone ? "🎉" : "😊"}</div>
            {allDone ? "All done today!" : list.length ? "Nothing to do right now." : "Nothing to do today."}
          </div>
        )}
      </div>
    </section>
  );
}
