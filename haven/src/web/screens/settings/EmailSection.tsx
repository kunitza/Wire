import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, ChevronDown, ChevronUp, MailCheck, Sparkles } from "lucide-react";
import { useApp } from "../../lib/store";
import { api, get, post, put } from "../../lib/api";
import { Confirm, Field, ToggleRow } from "../../components/ui";
import type { Settings } from "../../../shared/types";
import { Group, LockedNotice, SectionTitle, Steps, timeAgo } from "./common";

interface EmailConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  mailbox: string;
  address: string;
  allowedSenders: string[];
}

const BLANK: EmailConfig = { host: "imap.gmail.com", port: 993, secure: true, user: "", password: "", mailbox: "INBOX", address: "", allowedSenders: [] };

export default function EmailSection() {
  const { settings, session, run, reload, toast, now } = useApp();
  const e = settings.email;
  const [cfg, setCfg] = useState<EmailConfig | null>(null);
  const [senders, setSenders] = useState("");
  const [advanced, setAdvanced] = useState(false);
  const [checking, setChecking] = useState(false);
  const [confirmOff, setConfirmOff] = useState(false);

  useEffect(() => {
    if (!session.canEdit) return;
    get<EmailConfig | null>("/api/email-config")
      .then((c) => {
        setCfg(c ?? BLANK);
        setSenders((c?.allowedSenders ?? []).join(", "));
      })
      .catch(() => setCfg(BLANK));
  }, [session.canEdit, e.configured]);

  const set = (patch: Partial<EmailConfig>) => cfg && setCfg({ ...cfg, ...patch });
  const saveIt = async () => {
    if (!cfg) return;
    const body = {
      ...cfg,
      user: cfg.user.trim(),
      address: (cfg.address || cfg.user).trim(),
      allowedSenders: senders
        .split(/[,\s]+/)
        .map((s) => s.trim())
        .filter(Boolean),
    };
    const ok = await run(() => put("/api/email-config", body));
    if (!ok) return;
    await reload();
    toast("Saved. Checking the mailbox…");
    check();
  };
  const check = async () => {
    setChecking(true);
    const r = await run(() => post<{ imported: number; settings: Settings["email"] }>("/api/email/check"));
    setChecking(false);
    await reload();
    if (r) toast(r.settings.lastError ? `Couldn't check: ${r.settings.lastError}` : r.imported ? `Found ${r.imported} new email${r.imported === 1 ? "" : "s"}` : "No new emails");
  };

  return (
    <>
      <SectionTitle lead="Forward school newsletters, party invitations, sports schedules and PDFs to your Haven email address. Sidekick reads them and adds the events for you.">
        Email import
      </SectionTitle>

      {!settings.ai.available && (
        <div className="set-row" style={{ background: "#F6EFFA" }}>
          <Sparkles color="#9B59B6" />
          <div className="grow" style={{ fontWeight: 400 }}>
            Email import uses Sidekick, so connect Claude first in <b>Sidekick (AI)</b>.
          </div>
        </div>
      )}

      {e.configured && (
        <Group title="Status">
          <div className="set-card" style={{ gap: 10 }}>
            <div className="row" style={{ gap: 14 }}>
              <span className="set-icon" style={{ background: "#fff", color: "var(--blue)" }}>
                <MailCheck />
              </span>
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="muted" style={{ fontSize: 14 }}>
                  Forward emails to
                </div>
                <div className="serif truncate" style={{ fontSize: 26 }}>
                  {e.address}
                </div>
              </div>
              <button className="pill white" onClick={check} disabled={checking || !session.canEdit}>
                {checking ? "Checking…" : "Check now"}
              </button>
            </div>
            {e.lastError ? (
              <span className="set-status err">
                <AlertCircle />
                {e.lastError}
              </span>
            ) : (
              <span className="set-status ok">
                <CheckCircle2 />
                Last checked {timeAgo(e.lastCheck, now)} · checks every 2 minutes
              </span>
            )}
            <p style={{ fontSize: 15 }}>
              Put names in the subject to assign events, e.g. <b>“Emma, Jake”</b>. Events from email are added straight to the calendar; undo them from Sidekick › Recent imports.
            </p>
          </div>
        </Group>
      )}

      {!session.canEdit ? (
        <LockedNotice what="the email settings" />
      ) : (
        cfg && (
          <>
            {!e.configured && (
              <Group title="Set up (about 5 minutes)">
                <div className="set-card">
                  <Steps>
                    <li>
                      <div>
                        Create a <b>new Gmail address just for Haven</b> (e.g. <i>gardnerfamily.haven@gmail.com</i>). Haven reads every new email in it, so don't use your personal inbox.
                      </div>
                    </li>
                    <li>
                      <div>
                        In that Google account, turn on <b>2-Step Verification</b>, then open <b>myaccount.google.com/apppasswords</b> and create an <b>app password</b> named “Haven”.
                      </div>
                    </li>
                    <li>
                      <div>Enter the address and the 16-letter app password below. Then forward an email to it to try it out.</div>
                    </li>
                  </Steps>
                </div>
              </Group>
            )}
            <Group title="Mailbox">
              <div className="set-card">
                <div className="form-grid">
                  <Field label="Email address">
                    <input
                      className="input"
                      style={{ background: "#fff" }}
                      type="email"
                      placeholder="family.haven@gmail.com"
                      value={cfg.user}
                      onChange={(ev) => set({ user: ev.target.value, address: cfg.address === cfg.user ? ev.target.value : cfg.address })}
                      autoComplete="off"
                    />
                  </Field>
                  <Field label="App password">
                    <input
                      className="input"
                      style={{ background: "#fff" }}
                      type="password"
                      placeholder="abcd efgh ijkl mnop"
                      value={cfg.password}
                      onChange={(ev) => set({ password: ev.target.value })}
                      autoComplete="new-password"
                    />
                  </Field>
                </div>
                <Field label="Only accept emails from (optional)">
                  <input
                    className="input"
                    style={{ background: "#fff" }}
                    placeholder="laura@example.com, andy@example.com"
                    value={senders}
                    onChange={(ev) => setSenders(ev.target.value)}
                  />
                </Field>
                <span className="muted" style={{ fontSize: 15, marginTop: -6 }}>
                  Recommended: list the parents' addresses so your forwards go straight onto the calendar. Left empty, emails from anyone are read but wait in Sidekick for you to review.
                </span>
                <button type="button" className="link row" style={{ gap: 4, alignSelf: "flex-start" }} onClick={() => setAdvanced(!advanced)}>
                  {advanced ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                  Advanced (other email providers)
                </button>
                {advanced && (
                  <div className="col" style={{ gap: 12 }}>
                    <div className="form-grid">
                      <Field label="IMAP server">
                        <input className="input" style={{ background: "#fff" }} value={cfg.host} onChange={(ev) => set({ host: ev.target.value })} />
                      </Field>
                      <Field label="Port">
                        <input className="input" style={{ background: "#fff" }} type="number" value={cfg.port} onChange={(ev) => set({ port: Number(ev.target.value) || 993 })} />
                      </Field>
                      <Field label="Folder">
                        <input className="input" style={{ background: "#fff" }} value={cfg.mailbox} onChange={(ev) => set({ mailbox: ev.target.value })} />
                      </Field>
                      <Field label="Forwarding address shown to the family">
                        <input className="input" style={{ background: "#fff" }} value={cfg.address} onChange={(ev) => set({ address: ev.target.value })} placeholder={cfg.user} />
                      </Field>
                    </div>
                    <ToggleRow label="Use SSL/TLS" on={cfg.secure} onChange={(v) => set({ secure: v })} />
                  </div>
                )}
                <div className="row wrap" style={{ gap: 10 }}>
                  <button className="pill primary" disabled={!cfg.user.trim() || !cfg.password || !cfg.host.trim()} onClick={saveIt}>
                    {e.configured ? "Save changes" : "Connect mailbox"}
                  </button>
                  {e.configured && (
                    <button className="pill white" onClick={() => setConfirmOff(true)}>
                      Turn off email import
                    </button>
                  )}
                </div>
              </div>
            </Group>
          </>
        )
      )}
      {confirmOff && (
        <Confirm
          title="Turn off email import?"
          message="Haven stops checking the mailbox and forgets the password. Events already imported stay."
          confirmLabel="Turn off"
          onConfirm={async () => {
            if (await run(() => api("PUT", "/api/email-config", null), "Email import turned off")) {
              setCfg(BLANK);
              await reload();
            }
          }}
          onClose={() => setConfirmOff(false)}
        />
      )}
    </>
  );
}
