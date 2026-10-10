import { useEffect, useState } from "react";
import { Download, Eye, EyeOff, RefreshCw } from "lucide-react";
import { useApp } from "../../lib/store";
import { get, post } from "../../lib/api";
import { Confirm, ToggleRow } from "../../components/ui";
import { CodeBlock, CopyButton, Group, LockedNotice, SectionTitle, Steps } from "./common";

interface Connector {
  enabled: boolean;
  token: string | null;
  url: string;
}

const ASK = [
  "What's on our calendar this weekend?",
  "Add soccer practice for Jake every Tuesday at 4… actually just this Tuesday",
  "What chores does Emma still have today?",
  "Put milk, eggs and bananas on the grocery list",
  "Plan dinners for next week using what's already on our meal plan",
  "How many stars does Jake need for the LEGO set?",
  "Start a 20 minute homework timer",
];

/** Settings › Claude connector: lets Claude Code / Claude Desktop read and update Haven (MCP). */
export default function ConnectorSection() {
  const { session, run, settings } = useApp();
  const canSee = !session.lockEnabled || session.canEdit;
  const [c, setC] = useState<Connector | null>(null);
  const [reveal, setReveal] = useState(false);
  const [regen, setRegen] = useState(false);
  const load = () => {
    if (canSee) get<Connector>("/api/connector").then(setC).catch(() => setC(null));
  };
  useEffect(load, [canSee, settings]);
  const toggle = async (on: boolean) => {
    if (await run(() => post("/api/connector", { enabled: on }), on ? "Claude connector turned on" : "Claude connector turned off")) load();
  };
  const token = c?.token ?? "";
  const masked = token ? `${token.slice(0, 4)}${"•".repeat(16)}` : "";
  const claudeCode = `claude mcp add --transport http haven ${c?.url ?? ""} --header "Authorization: Bearer ${token}"`;
  const desktop = JSON.stringify(
    { mcpServers: { haven: { command: "node", args: ["/path/to/haven-mcp.mjs"], env: { HAVEN_URL: c?.url ?? "", HAVEN_TOKEN: token } } } },
    null,
    2,
  );

  return (
    <>
      <SectionTitle lead="Ask Claude about your household — “what's on Thursday?”, “add milk to the grocery list”, “what does Emma have left?” — from Claude on a computer at home.">
        Claude connector
      </SectionTitle>

      {!canSee && <LockedNotice what="the Claude connector" />}

      {canSee && c && (
        <>
          <Group hint="Uses the Model Context Protocol. Claude can read the calendar, chores, lists, meals, stars and weather, and add events, chores, list items, meals and timers. It can't delete anything or change settings.">
            <ToggleRow label="Allow Claude to connect" hint={c.enabled ? "On — anyone with the token on your network can use it" : "Off"} on={c.enabled} onChange={toggle} />
          </Group>

          {c.enabled && (
            <>
              <Group title="Connection">
                <div className="set-row" style={{ flexWrap: "wrap" }}>
                  <div className="grow">
                    Address
                    <small style={{ fontFamily: "ui-monospace, Menlo, monospace", fontSize: 15, color: "var(--text)", wordBreak: "break-all" }}>{c.url}</small>
                  </div>
                  <CopyButton text={c.url} />
                </div>
                <div className="set-row" style={{ flexWrap: "wrap" }}>
                  <div className="grow">
                    Token
                    <small style={{ fontFamily: "ui-monospace, Menlo, monospace", fontSize: 15, color: "var(--text)", wordBreak: "break-all" }}>{reveal ? token : masked}</small>
                  </div>
                  <button className="pill sm" onClick={() => setReveal(!reveal)}>
                    {reveal ? <EyeOff /> : <Eye />}
                    {reveal ? "Hide" : "Show"}
                  </button>
                  <CopyButton text={token} />
                  <button className="pill sm" onClick={() => setRegen(true)}>
                    <RefreshCw />
                    New token
                  </button>
                </div>
              </Group>

              <Group title="Claude Code (terminal)">
                <div className="set-card">
                  <p>Run this once on a computer on your home Wi-Fi (or Tailscale):</p>
                  <CodeBlock code={claudeCode} />
                  <p className="muted">Then just ask, e.g. “Using Haven, what's on our calendar tomorrow?”</p>
                </div>
              </Group>

              <Group title="Claude Desktop app">
                <div className="set-card">
                  <Steps>
                    <li>
                      <div>
                        Install <b>Node.js</b> on that computer (nodejs.org), then download the small Haven bridge script and save it somewhere permanent.
                        <div style={{ marginTop: 8 }}>
                          <a className="pill sm" href="/haven-mcp.mjs" download="haven-mcp.mjs">
                            <Download />
                            Download haven-mcp.mjs
                          </a>
                        </div>
                      </div>
                    </li>
                    <li>
                      <div>
                        In Claude Desktop open <b>Settings → Developer → Edit Config</b> and add this (change the path to where you saved the script):
                      </div>
                    </li>
                  </Steps>
                  <CodeBlock code={desktop} label="claude_desktop_config.json" />
                  <p className="muted">Restart Claude Desktop. “haven” appears in the tools menu.</p>
                </div>
              </Group>

              <Group title="Things to ask">
                <div className="chips">
                  {ASK.map((q) => (
                    <span key={q} className="chip text-only" style={{ background: "var(--fill-2)", height: "auto", minHeight: 40, padding: "8px 14px" }}>
                      {q}
                    </span>
                  ))}
                </div>
                <p className="muted" style={{ fontSize: 15 }}>
                  Claude on the web or the Claude phone app can't reach Haven, because Haven only runs on your home network (by design — it isn't exposed to the internet).
                </p>
              </Group>
            </>
          )}
        </>
      )}
      {regen && (
        <Confirm
          title="Make a new token?"
          message="Claude apps using the old token will stop working until you update them."
          confirmLabel="New token"
          danger={false}
          onConfirm={() => toggle(true)}
          onClose={() => setRegen(false)}
        />
      )}
    </>
  );
}
