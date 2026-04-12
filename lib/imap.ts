import { ImapFlow } from "imapflow";
import type { ImapAccountConfig } from "@/lib/mailAccountConfig";
import { guardImapFlowClient, imapMailboxOpenOptions } from "@/lib/imapReadOnly";
import { resolveMailIsoDateString } from "@/lib/mailDateIso";
import { parseMimeSource, type ParsedAttachmentMeta } from "@/lib/mailparserParse";

const GMAIL_IMAP_HOST = "imap.gmail.com";
const GMAIL_IMAP_PORT = 993;
export const GMAIL_INBOX_PATH = "INBOX";
/** Latest N messages per INBOX fetch (list + sync). */
export const IMAP_INBOX_FETCH_LIMIT = 20;
const FETCH_LIMIT = IMAP_INBOX_FETCH_LIMIT;

const IMAP_CONN_MS = 60_000;
const IMAP_GREET_MS = 25_000;
const IMAP_SOCKET_MS = 120_000;

function logImap(level: "info" | "warn" | "error", msg: string, extra?: unknown): void {
  const line = `[openmail][IMAP] ${msg}`;
  if (level === "info") console.info(line, extra ?? "");
  else if (level === "warn") console.warn(line, extra ?? "");
  else console.error(line, extra ?? "");
}

/** True when server-side IMAP env credentials are present (Gmail INBOX). */
export function imapCredentialsConfigured(): boolean {
  return !!(process.env.EMAIL_USER?.trim() && process.env.EMAIL_PASS?.trim());
}

function imapFlowOptionsFromConfig(imap: ImapAccountConfig) {
  const host = imap.host.trim();
  const port = imap.port;
  const security = imap.security;
  /** Port 993 is implicit SSL; STARTTLS is typical on 143 with security=tls. */
  const secure = security === "ssl" || port === 993;
  const useStartTls = security === "tls" && port !== 993;
  const tls =
    secure || useStartTls ? ({ servername: host } as const) : undefined;

  return {
    host,
    port,
    secure,
    tls,
    connectionTimeout: IMAP_CONN_MS,
    greetingTimeout: IMAP_GREET_MS,
    socketTimeout: IMAP_SOCKET_MS,
    auth: {
      user: imap.username.trim(),
      pass: imap.password,
    },
    logger: false as const,
  };
}

/** Shared client options for long-lived watch + one-shot fetch. */
export function createEnvImapClient(): ImapFlow {
  const user = process.env.EMAIL_USER?.trim();
  const pass = process.env.EMAIL_PASS?.trim();
  if (!user || !pass) {
    throw new Error("Missing required environment variable: EMAIL_USER / EMAIL_PASS");
  }
  return guardImapFlowClient(
    new ImapFlow({
      host: GMAIL_IMAP_HOST,
      port: GMAIL_IMAP_PORT,
      secure: true,
      tls: { servername: GMAIL_IMAP_HOST },
      connectionTimeout: IMAP_CONN_MS,
      greetingTimeout: IMAP_GREET_MS,
      socketTimeout: IMAP_SOCKET_MS,
      logger: false,
      auth: { user, pass },
    })
  );
}

/** IMAP client from a saved account (any provider). */
export function createImapClientFromConfig(imap: ImapAccountConfig): ImapFlow {
  return guardImapFlowClient(new ImapFlow(imapFlowOptionsFromConfig(imap)));
}

/**
 * Folder paths to try when opening mailboxes (Gmail exposes INBOX; some clients use variants).
 * For Gmail, ensure IMAP is enabled in Google Account settings and use an App Password if 2FA is on.
 */
export function imapMailboxCandidates(
  folder: "inbox" | "sent" | "drafts",
  host: string
): string[] {
  if (folder === "sent") {
    return [
      "Sent",
      "Sent Items",
      "Sent Mail",
      "[Gmail]/Sent Mail",
      "INBOX.Sent",
    ];
  }
  if (folder === "drafts") {
    return ["Drafts", "[Gmail]/Drafts", "INBOX.Drafts"];
  }
  const h = host.toLowerCase();
  if (h.includes("gmail.com") || h.includes("googlemail.com")) {
    return ["INBOX", "[Gmail]/Inbox", "Inbox"];
  }
  if (
    h.includes("outlook.") ||
    h.includes("hotmail.") ||
    h.includes("live.") ||
    h.includes("office365")
  ) {
    return ["INBOX", "Inbox"];
  }
  return ["INBOX", "Inbox"];
}

export type FetchedEmail = {
  subject: string | null;
  from: string | null;
  /** Always a valid ISO-8601 string (envelope/internalDate, else now). */
  date: string;
  /** Clean plain-text body */
  body: string;
  /** Optional HTML body */
  bodyHtml: string | null;
  /** Attachment metadata only (no binary stored) */
  attachments: ParsedAttachmentMeta[];
};

function requireEnv(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return v;
}

function envelopeFromToString(
  from: { name?: string; address?: string }[] | false | undefined
): string | null {
  if (!from || from.length === 0) return null;
  const first = from[0];
  if (!first?.address) return null;
  const name = first.name?.trim();
  if (name && name !== first.address) {
    return `${name} <${first.address}>`;
  }
  return first.address;
}

function envelopeDateToIso(
  envelopeDate: Date | string | undefined,
  internalDate: Date | string | undefined
): string {
  return resolveMailIsoDateString(envelopeDate ?? internalDate, new Date());
}

async function safeLogout(client: ImapFlow): Promise<void> {
  try {
    await client.logout();
  } catch {
    /* connection may already be closed */
  }
}

/**
 * Fetches the latest messages from Gmail INBOX via IMAP.
 * Requires `EMAIL_USER` and `EMAIL_PASS` (Gmail: use an App Password if 2FA is on).
 */
async function collectFetchedForRange(
  client: ImapFlow,
  startSeq: number,
  endSeq: number
): Promise<FetchedEmail[]> {
  if (endSeq < startSeq || startSeq < 1) return [];
  const range = `${startSeq}:${endSeq}`;
  const rows: FetchedEmail[] = [];

  for await (const msg of client.fetch(range, {
    envelope: true,
    source: true,
    internalDate: true,
  })) {
    if (!msg.envelope) continue;

    let body = "";
    let bodyHtml: string | null = null;
    let attachments: ParsedAttachmentMeta[] = [];
    if (msg.source) {
      const src = Buffer.isBuffer(msg.source)
        ? msg.source
        : Buffer.from(String(msg.source), "utf8");
      const parsed = await parseMimeSource(src);
      body = parsed.text;
      bodyHtml = parsed.html;
      attachments = parsed.attachments;
    }

    rows.push({
      subject: msg.envelope.subject?.trim() ?? null,
      from: envelopeFromToString(msg.envelope.from),
      date: envelopeDateToIso(msg.envelope.date, msg.internalDate),
      body,
      bodyHtml,
      attachments,
    });
  }

  rows.reverse();
  return rows;
}

/**
 * Fetch message sequence numbers `startSeq`…`endSeq` on the **already selected** mailbox.
 * Used by the realtime watcher (IDLE / EXISTS).
 */
export async function fetchSequenceRangeFromOpenMailbox(
  client: ImapFlow,
  startSeq: number,
  endSeq: number
): Promise<FetchedEmail[]> {
  return collectFetchedForRange(client, startSeq, endSeq);
}

export async function fetchEmailsWithImap(
  imap: ImapAccountConfig
): Promise<FetchedEmail[]> {
  const client = createImapClientFromConfig(imap);
  const host = imap.host.trim();
  const paths = imapMailboxCandidates("inbox", host);
  let lastErr: unknown = null;

  try {
    logImap("info", `connecting ${host}:${imap.port} (ssl=${imap.security === "ssl" || imap.port === 993}) user=${imap.username.trim()}`);
    await client.connect();
    logImap("info", `connected ${host}`);

    for (const path of paths) {
      try {
        const lock = await client.getMailboxLock(path, imapMailboxOpenOptions());
        try {
          const mb = client.mailbox;
          if (mb === false) {
            logImap("warn", `mailbox ${path}: no snapshot after open`);
            continue;
          }
          const exists = mb.exists;
          logImap("info", `opened "${path}" exists=${exists}`);
          if (exists === 0) {
            return [];
          }
          const startSeq = Math.max(1, exists - FETCH_LIMIT + 1);
          const rows = await collectFetchedForRange(client, startSeq, exists);
          logImap("info", `fetched ${rows.length} message(s) seq ${startSeq}:${exists}`);
          return rows;
        } finally {
          lock.release();
        }
      } catch (e) {
        lastErr = e;
        logImap(
          "warn",
          `failed to open/fetch "${path}": ${e instanceof Error ? e.message : String(e)}`
        );
      }
    }

    const hint =
      host.includes("gmail.com") || host.includes("googlemail.com")
        ? " For Gmail: enable IMAP in Google Account settings and use an App Password if 2FA is enabled."
        : "";
    const msg =
      lastErr instanceof Error
        ? `${lastErr.message}${hint}`
        : `Could not open mailbox on ${host}. Tried: ${paths.join(", ")}.${hint}`;
    throw lastErr instanceof Error ? lastErr : new Error(msg);
  } catch (e) {
    logImap(
      "error",
      `fetchEmailsWithImap: ${e instanceof Error ? e.message : String(e)}`,
      e
    );
    throw e;
  } finally {
    await safeLogout(client);
  }
}

export async function fetchEmails(): Promise<FetchedEmail[]> {
  requireEnv("EMAIL_USER");
  requireEnv("EMAIL_PASS");
  const imap: ImapAccountConfig = {
    host: GMAIL_IMAP_HOST,
    port: GMAIL_IMAP_PORT,
    username: requireEnv("EMAIL_USER"),
    password: requireEnv("EMAIL_PASS"),
    security: "ssl",
  };
  return fetchEmailsWithImap(imap);
}

export {
  ALLOW_IMAP_WRITE,
  assertImapWriteAllowed,
  guardImapFlowClient,
  IMAP_READ_ONLY,
  imapMailboxOpenOptions,
} from "@/lib/imapReadOnly";
