import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import type { Ctx } from "../context.js";
import { startImport, profilesFromSubject } from "../services/imports.js";
import type { Attachment } from "./ai.js";

/**
 * "Email to calendar": Haven checks a mailbox you control (e.g. a Gmail address with an app password)
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
  allowedSenders: string[]; // empty = anyone
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
    ctx.settings.set("emailConfig", {
      host: c.host ?? cur?.host ?? "imap.gmail.com",
      port: Number(c.port ?? cur?.port ?? 993),
      secure: c.secure ?? cur?.secure ?? true,
      user: c.user ?? cur?.user ?? "",
      password: c.password || cur?.password || "",
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
          autoApply: true,
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
