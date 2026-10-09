import { Download, Smartphone } from "lucide-react";
import { useApp } from "../../lib/store";
import { CopyButton, Group, Row, SectionTitle, Steps } from "./common";

/** Keep in step with package.json. */
const VERSION = "1.0.0";

export default function BackupSection() {
  const { unlock, settings, profiles, calendars } = useApp();
  const origin = location.origin;
  const isLocal = /^(localhost|127\.|\[::1\])/.test(location.hostname);
  const download = async () => {
    if (!(await unlock())) return;
    const a = document.createElement("a");
    a.href = "/api/backup";
    a.download = "";
    document.body.appendChild(a);
    a.click();
    a.remove();
  };
  return (
    <>
      <SectionTitle>Backup & about</SectionTitle>

      <Group title="Backup" hint="To restore: stop Haven on the Pi, replace data/haven.db with the backup file (renamed to haven.db) and start Haven again.">
        <Row
          icon={
            <span className="set-icon sm" style={{ background: "#fff", color: "var(--blue)" }}>
              <Download />
            </span>
          }
          label="Download a backup"
          hint="One file with everything: profiles, events, chores, stars, lists, meals, recipes and settings."
        >
          <button className="pill primary" onClick={download}>
            Download
          </button>
        </Row>
      </Group>

      <Group title="Use Haven on your phone">
        <div className="set-card">
          <div className="row wrap" style={{ gap: 14 }}>
            <span className="set-icon" style={{ background: "#fff", color: "var(--blue)" }}>
              <Smartphone />
            </span>
            <div className="grow" style={{ minWidth: 0 }}>
              <div className="muted" style={{ fontSize: 14 }}>
                Open on your phone
              </div>
              <div className="serif" style={{ fontSize: 26, wordBreak: "break-all" }}>
                {isLocal ? "http://<the Pi's IP address>:" + (location.port || "80") : origin}
              </div>
            </div>
            {!isLocal && <CopyButton text={origin} className="pill white" />}
          </div>
          <Steps>
            {isLocal && (
              <li>
                <div>
                  Find the Pi's address by running <span className="set-kbd">hostname -I</span> on it (e.g. 192.168.1.50).
                </div>
              </li>
            )}
            <li>
              <div>On a phone connected to your home Wi-Fi, open that address in Safari or Chrome.</div>
            </li>
            <li>
              <div>
                <b>iPhone:</b> tap <b>Share → Add to Home Screen</b>. <b>Android:</b> tap <b>⋮ → Add to Home screen</b>. Haven opens like an app.
              </div>
            </li>
            <li>
              <div>
                Unlock with the parent PIN and choose <b>Remember this device</b> so your phone can always make changes.
              </div>
            </li>
          </Steps>
          <p style={{ fontSize: 15 }}>
            <b>Away from home?</b> Install <b>Tailscale</b> (free) on the Pi and your phones. Then open Haven anywhere using the Pi's Tailscale name, e.g.{" "}
            <span className="set-kbd">http://haven-pi:{location.port || "8080"}</span>. Nothing is exposed to the internet.
          </p>
        </div>
      </Group>

      <Group title="About">
        <div className="set-card" style={{ gap: 6 }}>
          <div className="row" style={{ gap: 14 }}>
            <HavenMark size={52} />
            <div>
              <div className="serif" style={{ fontSize: 30 }}>
                Haven
              </div>
              <div className="muted">Version {VERSION} · self-hosted family hub</div>
            </div>
          </div>
          <p style={{ fontSize: 15, marginTop: 8 }}>
            {profiles.length} profiles · {calendars.length} synced calendar{calendars.length === 1 ? "" : "s"} · Sidekick {settings.ai.available ? `on (${settings.ai.model})` : "off"}. Your
            data stays on this device.
          </p>
        </div>
      </Group>
    </>
  );
}

/** The Haven house mark (used in About and Onboarding). */
export function HavenMark({ size = 48 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <rect width="64" height="64" rx="18" fill="#E9F1F7" />
      <path d="M14 31 32 16l18 15" fill="none" stroke="#2178AF" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M19 28v18a3 3 0 0 0 3 3h20a3 3 0 0 0 3-3V28" fill="#fff" stroke="#2178AF" strokeWidth="4" strokeLinejoin="round" />
      <path d="M32 43.5s-6.5-3.8-6.5-8.3a3.6 3.6 0 0 1 6.5-2.1 3.6 3.6 0 0 1 6.5 2.1c0 4.5-6.5 8.3-6.5 8.3Z" fill="#F66951" />
    </svg>
  );
}
