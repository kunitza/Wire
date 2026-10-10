import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import type { Ctx } from "../context.js";
import { startImport, profilesFromSubject } from "../services/imports.js";
import type { Attachment } from "./ai.js";

/**
 * "Email to calendar": Kunitz Coven checks a mailbox you control (e.g. a Gmail address with an app password)
 * and turns new messages into calendar events. Put profile names in the subject ("Emma, Jake") to assign them.
 */
export interface EmailConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  mailbox: string;
  address: string; // the address people forward to (shown in Settings)
  allowedSenders: string[]; // empty = anyone, but their events wait for review instead of being added
}

export function getEmailConfig(ctx: Ctx): EmailConfig | null {
  const c = ctx.settings.get<EmailConfig | null>("emailConfig", null);
  return c?.host ? c : null;
}

export function setEmailConfig(ctx: Ctx, c: Partial<EmailConfig> | null) {
  if (!c) {
    ctx.settings.delete("emailConfig");
  } else {
    const cur = getEmailConfig(ctx);
    const host = c.host ?? cur?.host ?? "imap.gmail.com";
    const user = c.user ?? cur?.user ?? "";
    const secure = c.secure ?? cur?.secure ?? true;
    // The saved password is only reused for the same account on the same server, so it can't be sent elsewhere.
    const keep = !!cur && cur.host === host && cur.user === user && (secure || !cur.secure) ? cur.password : "";
    if (!c.password && cur?.password && !keep) throw new Error("Enter the app password again for the new server or account");
    ctx.settings.set("emailConfig", {
      host,
      port: Number(c.port ?? cur?.port ?? 993),
      secure,
      user,
      password: c.password || keep || "",
      mailbox: c.mailbox ?? cur?.mailbox ?? "INBOX",
      address: c.address ?? cur?.address ?? c.user ?? "",
      allowedSenders: c.allowedSenders ?? cur?.allowedSenders ?? [],
    } satisfies EmailConfig);
  }
  ctx.settings.delete("emailLastError");
  ctx.bus.emit("settings");
}

const SUPPORTED = ["application/pdf", "image/jpeg", "image/png", "image/gif", "image/webp", "text/plain", "text/calendar"];

let running = false;

/** Check the mailbox once. Returns how many messages were imported. */
export async function checkEmail(ctx: Ctx): Promise<number> {
  const cfg = getEmailConfig(ctx);
  if (!cfg || running) return 0;
  running = true;
  const client = new ImapFlow({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: { user: cfg.user, pass: cfg.password },
    logger: false,
  });
  let count = 0;
  try {
    await client.connect();
    const lock = await client.getMailboxLock(cfg.mailbox);
    try {
      const uids = (await client.search({ seen: false }, { uid: true })) || [];
      for (const uid of uids) {
        const msg = await client.fetchOne(String(uid), { source: true }, { uid: true });
        if (!msg || !msg.source) continue;
        const mail = await simpleParser(msg.source);
        await client.messageFlagsAdd(String(uid), ["\\Seen"], { uid: true });
        const from = mail.from?.value?.[0]?.address?.toLowerCase() ?? "";
        if (cfg.allowedSenders.length && !cfg.allowedSenders.map((s) => s.toLowerCase()).includes(from)) continue;
        // Anyone can send mail (and fake a From address), so events are only added without review when the sender
        // is on the allowed list and the receiving server didn't flag the From address as forged.
        const auth = mail.headers.get("authentication-results");
        const forged = /\bdmarc=fail\b/i.test(String(Array.isArray(auth) ? auth[0] : (auth ?? "")));
        const trusted = cfg.allowedSenders.length > 0 && !forged;
        const subject = mail.subject ?? "(no subject)";
        const files: Attachment[] = (mail.attachments ?? [])
          .filter((a) => SUPPORTED.includes(a.contentType))
          .slice(0, 8)
          .map((a) => ({ mediaType: a.contentType, base64: a.content.toString("base64"), name: a.filename }));
        const body = [mail.text ?? "", typeof mail.html === "string" && !mail.text ? mail.html.replace(/<[^>]+>/g, " ") : ""].join("\n").trim();
        startImport(ctx, {
          source: "email",
          label: `${subject}${from ? ` — ${from}` : ""}`,
          text: `Subject: ${subject}\n\n${body.slice(0, 60000)}`,
          files,
          profileIds: profilesFromSubject(ctx, subject),
          autoApply: trusted,
        });
        count++;
      }
    } finally {
      lock.release();
    }
    await client.logout();
    ctx.settings.delete("emailLastError");
  } catch (err) {
    ctx.settings.set("emailLastError", (err as Error).message);
    try {
      await client.logout();
    } catch {
      /* ignore */
    }
  } finally {
    running = false;
    ctx.settings.set("emailLastCheck", ctx.now().toISOString());
    ctx.bus.emit("settings");
  }
  return count;
}
