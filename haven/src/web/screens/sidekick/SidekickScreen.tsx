import { useState } from "react";
import { BookOpen, CalendarPlus, Compass, FileText, ListChecks, Loader2, Mail, Sparkles, Type, Undo2, Utensils, Image as ImageIcon } from "lucide-react";
import { Fab, Header } from "../../components/shell";
import { useApp, useLive } from "../../lib/store";
import { post } from "../../lib/api";
import { plural } from "../../lib/format";
import type { MagicImport } from "../../../shared/types";
import { openSettings } from "../settings/nav";
import { timeAgo } from "../settings/common";
import { MagicImportDialog, ImportReviewModal } from "./MagicImport";
import { ListMakerDialog } from "./ListMaker";
import { ActivityPlannerDialog } from "./ActivityPlanner";
import { isSetupError } from "./parts";
import "./sidekick.css";

export { MagicImportDialog, ImportReviewModal };

const money = (n: number) => `$${n.toFixed(2)}`;

type Dialog = "import" | "list" | "activity" | null;

function importIcon(imp: MagicImport) {
  if (imp.source === "email") return Mail;
  if (imp.source === "text") return Type;
  return /\.(pdf|ics|txt)/i.test(imp.label) ? FileText : ImageIcon;
}

function ImportRow({ imp, onReview }: { imp: MagicImport; onReview: () => void }) {
  const { run, go, now } = useApp();
  const Icon = importIcon(imp);
  const n = imp.status === "applied" || imp.status === "undone" ? imp.createdEventIds.length || imp.events.length : imp.events.length;
  return (
    <div className={`sk-import ${imp.status === "ready" ? "ready" : ""} ${imp.status === "undone" ? "dim" : ""}`}>
      <span className="ic">{imp.status === "processing" ? <Loader2 className="sk-spin" color="#9b59b6" /> : <Icon />}</span>
      <div className="grow" style={{ minWidth: 0 }}>
        <div className="title truncate">{imp.label || "Import"}</div>
        {imp.status === "failed" ? (
          <div className="err">{imp.error}</div>
        ) : (
          <div className="sub truncate">
            {imp.status === "processing" && "Sidekick is reading it…"}
            {imp.status === "ready" && (imp.events.length ? `${plural(n, "event")} found · waiting for review` : "No events found")}
            {imp.status === "applied" && `${plural(n, "event")} added`}
            {imp.status === "undone" && "Undone"}
            {" · "}
            {timeAgo(imp.createdAt, now)}
            {imp.source === "email" && " · by email"}
          </div>
        )}
      </div>
      <div className="row actions" style={{ gap: 8 }}>
        {imp.status === "ready" && (
          <>
            <button className="pill white" onClick={() => run(() => post(`/api/imports/${imp.id}/dismiss`))}>
              Discard
            </button>
            {imp.events.length > 0 && (
              <button className="pill primary" onClick={onReview}>
                Review
              </button>
            )}
          </>
        )}
        {imp.status === "applied" && (
          <button className="pill white" onClick={() => run(() => post(`/api/imports/${imp.id}/undo`), "Import undone. Its events were removed.")}>
            <Undo2 />
            Undo import
          </button>
        )}
        {imp.status === "failed" && (
          <>
            <button className="pill white" onClick={() => run(() => post(`/api/imports/${imp.id}/dismiss`))}>
              Dismiss
            </button>
            {isSetupError(imp.error) && (
              <button className="pill primary" onClick={() => openSettings(go, "ai")}>
                {/budget/i.test(imp.error ?? "") ? "Change budget" : "Add API key"}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default function SidekickScreen() {
  const { settings, go } = useApp();
  const ai = settings.ai;
  const [dialog, setDialog] = useState<Dialog>(null);
  const [reviewId, setReviewId] = useState<number | null>(null);
  const { data: imports } = useLive<MagicImport[]>("/api/imports", ["imports"]);
  const visible = (imports ?? []).filter((i) => i.status !== "dismissed").slice(0, 25);
  const reviewing = reviewId ? imports?.find((i) => i.id === reviewId && i.status === "ready") : undefined;

  const actions = [
    { id: "import", title: "Import events", desc: "From a photo, PDF, email or text", icon: CalendarPlus, bg: "#EEE2F4", fg: "#9B59B6", run: () => setDialog("import") },
    { id: "meals", title: "Plan meals", desc: "A week of dinners in seconds", icon: Utensils, bg: "#F6E4D6", fg: "#D0632A", run: () => go("meals") },
    { id: "recipe", title: "New recipe", desc: "From an idea, a photo or a link", icon: BookOpen, bg: "#DCEBF1", fg: "#3C8DB0", run: () => go("recipes") },
    { id: "list", title: "Make a list", desc: "Packing, party, chores, groceries", icon: ListChecks, bg: "#F7EFD2", fg: "#C49A06", run: () => setDialog("list") },
    { id: "activity", title: "Activity planner", desc: "Ideas for the weekend", icon: Compass, bg: "#E1F1DD", fg: "#4E9F3D", run: () => setDialog("activity") },
  ];

  return (
    <>
      <Header>
        <span className="sk-spend" title="Sidekick spending this month">
          <Sparkles />
          {money(ai.spentThisMonthUsd)} of {money(ai.monthlyBudgetUsd)} this month
        </span>
      </Header>
      <div className="screen">
        <div className="sk-wrap">
          <div className="sk-hero">
            <span className="sk-orb">
              <Sparkles />
            </span>
            <div>
              <h1>Hi, I'm Sidekick.</h1>
              <p>Your family's helper, powered by Claude. What can I take off your plate?</p>
            </div>
          </div>

          {!ai.available && (
            <div className="sk-banner">
              <span className="sk-orb" style={{ width: 56, height: 56, background: "#fff" }}>
                <Sparkles size={28} />
              </span>
              <div className="grow">
                <b>Connect Claude to use Sidekick</b>
                <div className="muted" style={{ marginTop: 2 }}>
                  Add an Anthropic API key in Settings. It takes two minutes and usually costs less than $1 a month.
                </div>
              </div>
              <button className="pill primary lg" onClick={() => openSettings(go, "ai")}>
                Open Settings
              </button>
            </div>
          )}

          <div className="sk-grid">
            {actions.map((a) => (
              <button key={a.id} className="sk-card" onClick={a.run}>
                <span className="circle" style={{ background: a.bg, color: a.fg }}>
                  <a.icon />
                </span>
                <span className="t">{a.title}</span>
                <span className="d">{a.desc}</span>
              </button>
            ))}
          </div>

          <section>
            <h2 className="sk-section-title">
              Recent imports
              {settings.email.configured && settings.email.address && (
                <span className="row" style={{ gap: 6, textTransform: "none", letterSpacing: 0, fontWeight: 500, color: "var(--text-3)", marginLeft: "auto" }}>
                  <Mail size={16} />
                  Forward emails to {settings.email.address}
                </span>
              )}
            </h2>
            {imports && !visible.length ? (
              <div className="sk-import" style={{ justifyContent: "center", color: "var(--text-2)", minHeight: 110 }}>
                <span style={{ fontSize: 34 }}>📸</span>
                Snap a school calendar or a party invite and Sidekick will put it on the calendar.
              </div>
            ) : (
              <div className="sk-imports">
                {visible.map((imp) => (
                  <ImportRow key={imp.id} imp={imp} onReview={() => setReviewId(imp.id)} />
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
      <Fab onClick={() => setDialog("import")} label="Import events" />
      {dialog === "import" && <MagicImportDialog onClose={() => setDialog(null)} />}
      {dialog === "list" && <ListMakerDialog onClose={() => setDialog(null)} />}
      {dialog === "activity" && <ActivityPlannerDialog onClose={() => setDialog(null)} />}
      {reviewing && <ImportReviewModal imp={reviewing} onClose={() => setReviewId(null)} />}
    </>
  );
}
