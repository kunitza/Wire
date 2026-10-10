import { useRef, useState } from "react";
import { Camera, FileText, Image as ImageIcon, Mail, MapPin, Sparkles, Type, Upload } from "lucide-react";
import { useApp, useLive } from "../../lib/store";
import { fileToAttachment, post } from "../../lib/api";
import { Field, Modal, ProfilePicker, Toggle } from "../../components/ui";
import { fmtRange, fmtTime, longDate, plural, tint } from "../../lib/format";
import { addDays, diffDays } from "../../../shared/dates";
import type { MagicImport, ProposedEvent } from "../../../shared/types";
import { openSettings } from "../settings/nav";
import { AiErrorBox, CheckBox, FileThumbs, Thinking, aiCall } from "./parts";

export type ImportSource = "text" | "photo" | "pdf" | "email";

const SOURCES: { id: ImportSource; label: string; icon: typeof Type }[] = [
  { id: "text", label: "Type or paste", icon: Type },
  { id: "photo", label: "Photo", icon: Camera },
  { id: "pdf", label: "PDF or file", icon: FileText },
  { id: "email", label: "Email", icon: Mail },
];

/**
 * Magic Import: turn text, photos, PDFs (or forwarded emails) into calendar events.
 * Self-contained: choose who + source -> Sidekick reads it -> review the drafts -> add to calendar.
 * Usable from anywhere (e.g. the Home/Calendar "+"): `<MagicImportDialog onClose={...} />`.
 */
export function MagicImportDialog({
  onClose,
  initialProfileIds = [],
  initialSource = "text",
  initialText = "",
}: {
  onClose: () => void;
  initialProfileIds?: number[];
  initialSource?: ImportSource;
  initialText?: string;
}) {
  const { settings, go, run } = useApp();
  const [profileIds, setProfileIds] = useState<number[]>(initialProfileIds);
  const [source, setSource] = useState<ImportSource>(initialSource);
  const [text, setText] = useState(initialText);
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importId, setImportId] = useState<number | null>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);
  const docRef = useRef<HTMLInputElement>(null);
  const { data: imports } = useLive<MagicImport[]>(importId ? "/api/imports" : null, ["imports"]);
  const imp = importId ? imports?.find((i) => i.id === importId) : undefined;

  const addFiles = (list: FileList | null) => list && setFiles((f) => [...f, ...Array.from(list)].slice(0, 10));
  const canSubmit = source === "text" ? text.trim().length > 3 : source === "email" ? false : files.length > 0;

  const submit = async () => {
    setBusy(true);
    setError(null);
    const r = await aiCall(async () => {
      const atts = source === "text" ? [] : await Promise.all(files.map(fileToAttachment));
      const label = source === "text" ? text.trim().split("\n")[0].slice(0, 60) : files.length > 1 ? `${files[0].name} + ${files.length - 1} more` : files[0].name;
      return post<{ id: number }>("/api/ai/import", { text: source === "text" ? text : "", files: atts, profileIds, label });
    });
    setBusy(false);
    if (r.error) setError(r.error);
    if (r.data) setImportId(r.data.id);
  };

  // Once the drafts are ready, the review takes over.
  if (imp?.status === "ready") return <ImportReviewModal imp={imp} onClose={onClose} />;

  if (importId) {
    const failed = imp?.status === "failed";
    return (
      <Modal
        title="Magic Import"
        onClose={onClose}
        size="narrow"
        footer={
          failed ? (
            <>
              <button className="pill" onClick={() => run(() => post(`/api/imports/${importId}/dismiss`)).then(onClose)}>
                Dismiss
              </button>
              <button
                className="pill primary"
                onClick={() => {
                  setImportId(null);
                  setError(null);
                }}
              >
                Try again
              </button>
            </>
          ) : (
            <button className="pill block lg" onClick={onClose}>
              Keep working in the background
            </button>
          )
        }
      >
        {failed ? (
          <AiErrorBox message={imp?.error ?? "Import failed"} onClose={onClose} />
        ) : (
          <Thinking
            title={source === "photo" ? "Reading your photo…" : source === "pdf" ? "Reading your file…" : "Reading your text…"}
            hint="This usually takes 10–30 seconds. You can close this; the events will wait for you in Sidekick › Recent imports."
          />
        )}
      </Modal>
    );
  }

  return (
    <Modal
      title="Magic Import"
      onClose={onClose}
      footer={
        source === "email" ? (
          <button className="pill" onClick={onClose}>
            Close
          </button>
        ) : (
          <>
            <button className="pill" onClick={onClose}>
              Cancel
            </button>
            <button className="pill primary" disabled={!canSubmit || busy} onClick={submit}>
              <Sparkles />
              {busy ? "Sending…" : "Find events"}
            </button>
          </>
        )
      }
    >
      <p className="muted" style={{ margin: "-6px 0 0", lineHeight: 1.45 }}>
        Snap a school calendar, paste a team schedule or add a party invitation. Sidekick finds the events and lets you check them before anything is added.
      </p>
      <Field label="Who are these events for? (optional)">
        <ProfilePicker value={profileIds} onChange={setProfileIds} includeLabels />
        <span className="muted" style={{ fontSize: 14 }}>
          {profileIds.length ? "Sidekick will use these unless the text clearly names someone else." : "Leave empty and Sidekick guesses from names it finds."}
        </span>
      </Field>
      <div className="sk-sources" role="tablist">
        {SOURCES.map((s) => (
          <button key={s.id} type="button" role="tab" aria-selected={source === s.id} className={`sk-source ${source === s.id ? "on" : ""}`} onClick={() => setSource(s.id)}>
            <s.icon />
            {s.label}
          </button>
        ))}
      </div>

      {source === "text" && (
        <textarea
          className="textarea"
          style={{ minHeight: 180 }}
          placeholder={"Paste an email, a schedule or just type:\n“Soccer practice Tuesdays and Thursdays 4–5:30 at Riverside Field through November”"}
          value={text}
          onChange={(e) => setText(e.target.value)}
          autoFocus
          aria-label="Text to import"
        />
      )}

      {(source === "photo" || source === "pdf") && (
        <div className="col" style={{ gap: 12 }}>
          <div className="sk-drop">
            {source === "photo" ? <ImageIcon size={34} color="#9b59b6" /> : <FileText size={34} color="#9b59b6" />}
            <div>{source === "photo" ? "Take a photo of a flyer, schedule or school calendar, or choose some from your library." : "Choose a PDF (school calendar, sports schedule) or an .ics/.txt file."}</div>
            <div className="row wrap" style={{ justifyContent: "center" }}>
              {source === "photo" ? (
                <>
                  <button type="button" className="pill primary" onClick={() => cameraRef.current?.click()}>
                    <Camera />
                    Take photo
                  </button>
                  <button type="button" className="pill" onClick={() => libraryRef.current?.click()}>
                    <ImageIcon />
                    Choose photos
                  </button>
                </>
              ) : (
                <button type="button" className="pill primary" onClick={() => docRef.current?.click()}>
                  <Upload />
                  Choose file
                </button>
              )}
            </div>
          </div>
          <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => (addFiles(e.target.files), (e.target.value = ""))} />
          <input ref={libraryRef} type="file" accept="image/*" multiple hidden onChange={(e) => (addFiles(e.target.files), (e.target.value = ""))} />
          <input ref={docRef} type="file" accept="application/pdf,.pdf,.ics,text/calendar,text/plain,.txt" multiple hidden onChange={(e) => (addFiles(e.target.files), (e.target.value = ""))} />
          <FileThumbs files={files} onRemove={(i) => setFiles(files.filter((_, j) => j !== i))} />
          {source === "photo" && files.length > 0 && (
            <textarea className="textarea" style={{ minHeight: 70 }} placeholder="Anything to add? e.g. “Only the 3rd grade events”" value={text} onChange={(e) => setText(e.target.value)} />
          )}
        </div>
      )}

      {source === "email" &&
        (settings.email.configured && settings.email.address ? (
          <div className="sk-summary" style={{ flexDirection: "column", gap: 8 }}>
            <div className="row" style={{ gap: 10 }}>
              <Mail />
              <span>Forward emails and attachments to</span>
            </div>
            <div className="serif" style={{ fontSize: 28, wordBreak: "break-all" }}>
              {settings.email.address}
            </div>
            <div style={{ lineHeight: 1.45 }}>
              Put names in the subject, e.g. <b>“Emma, Jake”</b>, to choose who the events are for. Events from the allowed senders in Settings are added straight to the calendar and show up under Recent
              imports, where you can undo them; emails from anyone else wait there for your review.
            </div>
          </div>
        ) : (
          <div className="sk-summary" style={{ alignItems: "center" }}>
            <Mail />
            <div className="grow">Set up a mailbox for Kunitz Coven to forward school emails and invitations straight to the calendar.</div>
            <button
              className="pill primary"
              onClick={() => {
                onClose();
                openSettings(go, "email");
              }}
            >
              Set up email
            </button>
          </div>
        ))}

      {error && <AiErrorBox message={error} onClose={onClose} />}
    </Modal>
  );
}

// ---------- Draft review ----------

interface Draft extends ProposedEvent {
  include: boolean;
}

function DraftCard({ d, onChange }: { d: Draft; onChange: (d: Draft) => void }) {
  const { profileById, settings } = useApp();
  const color = profileById(d.profileIds[0])?.color ?? "#9B59B6";
  const set = (p: Partial<Draft>) => onChange({ ...d, ...p });
  const sDate = d.start.slice(0, 10);
  const eDate = d.end.slice(0, 10);
  const sTime = d.start.slice(11, 16) || "09:00";
  const eTime = d.end.slice(11, 16) || "10:00";
  const setAllDay = (v: boolean) =>
    v ? set({ allDay: true, start: sDate, end: addDays(eDate > sDate ? eDate : sDate, 1) }) : set({ allDay: false, start: `${sDate}T09:00`, end: `${sDate}T10:00` });
  const shiftDate = (v: string) => {
    if (!v) return;
    const span = diffDays(eDate, sDate);
    set(d.allDay ? { start: v, end: addDays(v, Math.max(1, span)) } : { start: `${v}T${sTime}`, end: `${addDays(v, Math.max(0, span))}T${eTime}` });
  };
  const bad = d.end <= d.start;
  const whenText = d.allDay
    ? diffDays(eDate, sDate) > 1
      ? `${longDate(sDate)} – ${longDate(addDays(eDate, -1))}`
      : `${longDate(sDate)} · All day`
    : `${longDate(sDate)} · ${eDate === sDate ? fmtRange(d.start, d.end, settings.clock24h) : `${fmtTime(d.start, settings.clock24h)} – ${longDate(eDate)} ${fmtTime(d.end, settings.clock24h)}`}`;
  return (
    <div className={`sk-draft ${d.include ? "" : "off"}`} style={{ background: tint(color, 0.16) }}>
      <div className="row" style={{ gap: 12, alignItems: "flex-start" }}>
        <button type="button" onClick={() => set({ include: !d.include })} aria-pressed={d.include} aria-label={d.include ? "Don't add this event" : "Add this event"} style={{ marginTop: 11 }}>
          <CheckBox on={d.include} />
        </button>
        <div className="grow col" style={{ gap: 4 }}>
          <input className="input title-input" value={d.title} onChange={(e) => set({ title: e.target.value })} aria-label="Event title" />
          <div className="muted" style={{ fontSize: 15, paddingLeft: 4 }}>
            {whenText}
          </div>
        </div>
      </div>
      {d.include && (
        <>
          <div className={`when ${d.allDay ? "allday" : ""}`}>
            <label className="field" style={{ alignItems: "flex-start" }}>
              <span className="label">All day</span>
              <div style={{ height: 56, display: "flex", alignItems: "center" }}>
                <Toggle on={d.allDay} onChange={setAllDay} label="All day" />
              </div>
            </label>
            <label className="field">
              <span className="label">{d.allDay ? "Starts" : "Date"}</span>
              <input className="input" type="date" value={sDate} onChange={(e) => shiftDate(e.target.value)} />
            </label>
            {d.allDay ? (
              <label className="field">
                <span className="label">Ends</span>
                <input className="input" type="date" value={addDays(eDate, -1)} min={sDate} onChange={(e) => e.target.value && set({ end: addDays(e.target.value, 1) })} />
              </label>
            ) : (
              <>
                <label className="field">
                  <span className="label">From</span>
                  <input className="input" type="time" value={sTime} onChange={(e) => e.target.value && set({ start: `${sDate}T${e.target.value}` })} />
                </label>
                <label className="field">
                  <span className="label">To{eDate !== sDate ? ` (${longDate(eDate).split(",")[0]})` : ""}</span>
                  <input className="input" type="time" value={eTime} onChange={(e) => e.target.value && set({ end: `${eDate}T${e.target.value}` })} />
                </label>
              </>
            )}
          </div>
          {bad && <div className="error-text">The end is before the start.</div>}
          <ProfilePicker value={d.profileIds} onChange={(ids) => set({ profileIds: ids })} includeLabels />
          <div className="meta">
            <div className="row" style={{ gap: 0, position: "relative" }}>
              <MapPin size={18} style={{ position: "absolute", left: 14, color: "var(--text-3)" }} />
              <input className="input" style={{ paddingLeft: 40 }} placeholder="Location" value={d.location ?? ""} onChange={(e) => set({ location: e.target.value })} />
            </div>
            <input className="input" placeholder="Notes" value={d.notes ?? ""} onChange={(e) => set({ notes: e.target.value })} />
          </div>
        </>
      )}
    </div>
  );
}

/** Review Sidekick's draft events, edit them, and add the chosen ones to the calendar. */
export function ImportReviewModal({ imp, onClose }: { imp: MagicImport; onClose: () => void }) {
  const { run, celebrate, people } = useApp();
  const [drafts, setDrafts] = useState<Draft[]>(() => imp.events.map((e) => ({ ...e, include: true })));
  const chosen = drafts.filter((d) => d.include);
  const invalid = chosen.some((d) => !d.title.trim() || d.end <= d.start);
  const apply = async () => {
    const events: ProposedEvent[] = chosen.map(({ include: _include, ...e }) => ({
      ...e,
      title: e.title.trim(),
      profileIds: e.profileIds.length ? e.profileIds : people[0] ? [people[0].id] : [],
    }));
    const r = await run(() => post(`/api/imports/${imp.id}/apply`, { events }), `${plural(events.length, "event")} added to the calendar`);
    if (r) {
      celebrate("small", ["📅", "✨", "🎉"]);
      onClose();
    }
  };
  const discard = async () => {
    if (await run(() => post(`/api/imports/${imp.id}/dismiss`))) onClose();
  };
  return (
    <Modal
      title="Review events"
      onClose={onClose}
      size="wide"
      actions={
        drafts.length > 1 ? (
          <button className="pill sm" onClick={() => setDrafts(drafts.map((d) => ({ ...d, include: chosen.length !== drafts.length })))}>
            {chosen.length === drafts.length ? "Select none" : "Select all"}
          </button>
        ) : undefined
      }
      footer={
        <>
          <button className="pill" onClick={discard} style={{ marginRight: "auto" }}>
            Discard
          </button>
          <button className="pill" onClick={onClose}>
            Later
          </button>
          <button className="pill primary" disabled={!chosen.length || invalid} onClick={apply}>
            {chosen.length ? `Add ${plural(chosen.length, "event")} to Calendar` : "Add to Calendar"}
          </button>
        </>
      }
    >
      <div className="sk-summary">
        <Sparkles size={22} />
        <div>
          <div style={{ fontWeight: 600 }}>{imp.label}</div>
          <div>{imp.summary || `Found ${plural(drafts.length, "event")}.`} Check the details, then add them.</div>
        </div>
      </div>
      {!drafts.length && (
        <div className="empty">
          <div className="big">🤔</div>
          Sidekick didn't find any events in this one.
        </div>
      )}
      {drafts.map((d, i) => (
        <DraftCard key={i} d={d} onChange={(nd) => setDrafts(drafts.map((x, j) => (j === i ? nd : x)))} />
      ))}
    </Modal>
  );
}
