import { useEffect, useState, type ReactNode } from "react";
import { AlertTriangle, Eye, EyeOff, Globe, Mic, RefreshCw, Send, Braces, Volume2 } from "lucide-react";
import { useApp } from "../../lib/store";
import { get, post } from "../../lib/api";
import { Confirm, ToggleRow } from "../../components/ui";
import { CodeBlock, CopyButton, Group, LockedNotice, SectionTitle, Steps, useSaveSettings } from "./common";

interface VoiceSetup {
  token: string;
  commandUrl: string;
  homeAssistantYaml: string;
}

const EXAMPLES = ["Emma finished the dishes", "What does Jake have left?", "How many stars does Emma have?", "Add milk to the grocery list"];

function TestPhrase({ token }: { token: string }) {
  const [text, setText] = useState("");
  const [reply, setReply] = useState<{ ok: boolean; speech: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const send = async (t: string) => {
    if (!t.trim()) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/voice/command?token=${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: t }),
      });
      const body = (await res.json()) as { ok?: boolean; speech?: string; error?: string };
      setReply({ ok: res.ok && !!body.ok, speech: body.speech ?? body.error ?? "No reply" });
    } catch (e) {
      setReply({ ok: false, speech: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="set-card">
      <h3>Test a phrase</h3>
      <p>Type what you'd say to Siri. This really runs the command, so checking off a chore here checks it off for real.</p>
      <form
        className="set-input-row"
        onSubmit={(e) => {
          e.preventDefault();
          send(text);
        }}
      >
        <input className="input grow" style={{ background: "#fff" }} placeholder="e.g. Emma finished the dishes" value={text} onChange={(e) => setText(e.target.value)} aria-label="Phrase to test" />
        <button className="pill primary" style={{ height: 56 }} disabled={busy || !text.trim()}>
          <Send />
          {busy ? "Sending…" : "Send"}
        </button>
      </form>
      <div className="chips">
        {EXAMPLES.map((e) => (
          <button key={e} type="button" className="chip text-only" style={{ background: "#fff", height: 38, fontSize: 15 }} onClick={() => setText(e)}>
            {e}
          </button>
        ))}
      </div>
      {reply && (
        <div className="row" style={{ alignItems: "flex-start", gap: 12 }}>
          <span className="set-icon sm" style={{ background: reply.ok ? "#E2F2EA" : "#FDE3DE", color: reply.ok ? "#2E8B57" : "#D64545" }}>
            <Volume2 />
          </span>
          <div style={{ background: "#fff", borderRadius: "6px 20px 20px 20px", padding: "12px 16px", fontSize: 18, lineHeight: 1.4 }} aria-live="polite">
            “{reply.speech}”
          </div>
        </div>
      )}
    </div>
  );
}

function ShortcutAction({ icon, color, title, children }: { icon: ReactNode; color: string; title: string; children?: ReactNode }) {
  return (
    <div className="set-shortcut">
      <span className="ic" style={{ background: color }}>
        {icon}
      </span>
      <div style={{ minWidth: 0 }}>
        <b>{title}</b>
        {children && <small>{children}</small>}
      </div>
    </div>
  );
}

export default function VoiceSection() {
  const { settings, session, run } = useApp();
  const v = settings.voice;
  const saveSettings = useSaveSettings();
  const save = (patch: Partial<{ enabled: boolean; allowListAdd: boolean }>) => saveSettings({ voice: patch });
  const [setup, setSetup] = useState<VoiceSetup | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reveal, setReveal] = useState(false);
  const [confirmRegen, setConfirmRegen] = useState(false);
  const canSee = session.canEdit;

  useEffect(() => {
    if (!v.enabled || !canSee) return;
    get<VoiceSetup>("/api/voice/setup")
      .then(setSetup)
      .catch((e) => setError(e.message));
  }, [v.enabled, canSee]);

  // The server already swaps localhost for the Pi's LAN address when it knows one; only warn if it couldn't.
  const isLocal = /^https?:\/\/(localhost|127\.|\[::1\])/.test(setup?.commandUrl ?? "");
  const masked = setup ? `${"•".repeat(Math.max(4, setup.token.length - 4))}${setup.token.slice(-4)}` : "";

  return (
    <>
      <SectionTitle lead="Let kids check off chores by voice: “Hey Siri, chore done… Emma finished the dishes.” Voice can only check off tasks, say what's left, read star balances and (if you allow it) add to lists.">
        Voice (Siri & Google)
      </SectionTitle>
      <Group>
        <ToggleRow label="Voice commands" hint="Allow Siri Shortcuts and Home Assistant to talk to Haven." on={v.enabled} onChange={(x) => save({ enabled: x })} />
        <ToggleRow label="Allow adding to lists by voice" hint="“Add milk to the grocery list”" on={v.allowListAdd} onChange={(x) => save({ allowListAdd: x })} />
      </Group>

      {v.enabled && !canSee && <LockedNotice what="the voice token and setup guides" />}
      {v.enabled && canSee && error && <div className="error-text">{error}</div>}

      {v.enabled && canSee && setup && (
        <>
          <Group title="Your voice link" hint="The token is like a password for voice commands. Anyone with it on your network can check off chores.">
            <div className="set-row" style={{ flexWrap: "wrap" }}>
              <div className="grow">
                Voice token
                <small style={{ fontFamily: "ui-monospace, Menlo, monospace", fontSize: 15, wordBreak: "break-all", color: "var(--text)" }}>{reveal ? setup.token : masked}</small>
              </div>
              <div className="row" style={{ gap: 8 }}>
                <button className="pill sm white" onClick={() => setReveal(!reveal)}>
                  {reveal ? <EyeOff /> : <Eye />}
                  {reveal ? "Hide" : "Show"}
                </button>
                <CopyButton text={setup.token} className="pill sm white" />
                <button className="pill sm white" onClick={() => setConfirmRegen(true)}>
                  <RefreshCw />
                  Regenerate
                </button>
              </div>
            </div>
            <div className="set-row" style={{ flexWrap: "wrap" }}>
              <div className="grow" style={{ minWidth: 0 }}>
                Command URL
                <small style={{ fontFamily: "ui-monospace, Menlo, monospace", fontSize: 15, wordBreak: "break-all", color: "var(--text)" }}>{setup.commandUrl}</small>
              </div>
              <CopyButton text={setup.commandUrl} className="pill sm white" />
            </div>
            {isLocal && (
              <div className="set-row" style={{ background: "#FFF6E0" }}>
                <AlertTriangle color="#b7791f" />
                <div className="grow" style={{ fontWeight: 400 }}>
                  This address uses <b>localhost</b>, which only works on the Pi itself. On phones, replace it with the Pi's IP address (run <span className="set-kbd">hostname -I</span> on the
                  Pi), e.g. <span className="set-kbd">http://192.168.1.50:8080/api/voice/command</span>.
                </div>
              </div>
            )}
          </Group>

          <TestPhrase token={setup.token} />

          <Group title="Siri (iPhone & iPad)">
            <div className="set-card">
              <h3>Make a “Chore done” shortcut</h3>
              <Steps>
                <li>
                  <div>
                    Open the <b>Shortcuts</b> app and tap <b>+</b> to make a new shortcut. Add these four actions:
                  </div>
                </li>
              </Steps>
              <div className="col" style={{ gap: 8, paddingLeft: 48 }}>
                <ShortcutAction icon={<Mic />} color="#FF9500" title="Dictate Text">
                  Stop Listening: After Pause
                </ShortcutAction>
                <ShortcutAction icon={<Globe />} color="#007AFF" title="Get Contents of URL">
                  URL: the command URL above · Method: <b>POST</b> · Headers: <b>X-Haven-Token</b> = your token · Request Body: <b>JSON</b>, key <b>text</b> = <i>Dictated Text</i>
                </ShortcutAction>
                <ShortcutAction icon={<Braces />} color="#8E8E93" title="Get Dictionary Value">
                  Get <b>Value</b> for <b>speech</b> in <i>Contents of URL</i>
                </ShortcutAction>
                <ShortcutAction icon={<Volume2 />} color="#AF52DE" title="Speak Text">
                  <i>Dictionary Value</i>
                </ShortcutAction>
              </div>
              <Steps start={2}>
                <li>
                  <div>
                    Name the shortcut <b>Chore done</b>. Now say <i>“Hey Siri, chore done”</i>, then <i>“Emma finished the dishes”</i>. Siri reads back the reply (stars earned and what's
                    left).
                  </div>
                </li>
                <li>
                  <div>
                    <b>One-tap shortcuts per chore:</b> duplicate it and replace <i>Dictate Text</i> with a <b>Text</b> action like <i>“Jake finished feeding the dog”</i>. Name it “Jake fed
                    the dog” and add it to the Home Screen or an Apple Watch face.
                  </div>
                </li>
                <li>
                  <div>
                    The phone must be on your <b>home Wi-Fi</b> (or connected with <b>Tailscale</b>) and the URL must use the Pi's IP address, not localhost.
                  </div>
                </li>
              </Steps>
            </div>
          </Group>

          <Group title="Google Home / Nest">
            <div className="set-card">
              <h3>Through Home Assistant</h3>
              <p>Google Home can't call a web address directly, so it goes through Home Assistant, which Google can talk to.</p>
              <Steps>
                <li>
                  <div>
                    Install <b>Home Assistant</b> (free; on another Pi or the same one with Docker) and subscribe to <b>Home Assistant Cloud by Nabu Casa</b> (about $65/year) to link it
                    with Google.
                  </div>
                </li>
                <li>
                  <div>
                    Paste this into Home Assistant's <span className="set-kbd">configuration.yaml</span> and restart. It has one script per child and chore for today; copy it again after
                    adding chores.
                  </div>
                </li>
              </Steps>
              <CodeBlock code={setup.homeAssistantYaml} label="configuration.yaml" />
              <Steps start={3}>
                <li>
                  <div>
                    In Home Assistant: <b>Settings → Home Assistant Cloud → Google Assistant</b>, expose the <b>Haven …</b> scripts.
                  </div>
                </li>
                <li>
                  <div>
                    In the Google Home app: <b>Automations → + → Household</b>. Starter: <i>When I say to Google Assistant</i> “<b>Emma finished dishes</b>”. Action: <i>Adjust home devices</i>{" "}
                    → <b>Haven Emma Dishes</b> → <b>Turn on</b>.
                  </div>
                </li>
              </Steps>
            </div>
          </Group>
        </>
      )}
      {confirmRegen && (
        <Confirm
          title="Make a new voice token?"
          message="Shortcuts and Home Assistant using the old token stop working until you paste in the new one."
          confirmLabel="Regenerate"
          onConfirm={async () => {
            const r = await run(() => post<{ token: string }>("/api/voice/token"), "New token made");
            if (r) setSetup(await get<VoiceSetup>("/api/voice/setup"));
          }}
          onClose={() => setConfirmRegen(false)}
        />
      )}
    </>
  );
}
