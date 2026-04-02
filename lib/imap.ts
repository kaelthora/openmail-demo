import { ImapFlow } from "imapflow";
import type { ImapAccountConfig } from "@/lib/mailAccountConfig";
import { parseMimeSource, type ParsedAttachmentMeta } from "@/lib/mailparserParse";

const GMAIL_IMAP_HOST = "imap.gmail.com";
const GMAIL_IMAP_PORT = 993;
export const GMAIL_INBOX_PATH = "INBOX";
const INBOX = GMAIL_INBOX_PATH;
const FETCH_LIMIT = 20;

/** True when server-side IMAP env credentials are present (Gmail INBOX). */
export function imapCredentialsConfigured(): boolean {
  return !!(process.env.EMAIL_USER?.trim() && process.env.EMAIL_PASS?.trim());
}

/** Shared client options for long-lived watch + one-shot fetch. */
export function createEnvImapClient(): ImapFlow {
  const user = process.env.EMAIL_USER?.trim();
  const pass = process.env.EMAIL_PASS?.trim();
  if (!user || !pass) {
    throw new Error("Missing required environment variable: EMAIL_USER / EMAIL_PASS");
  }
  return new ImapFlow({
    host: GMAIL_IMAP_HOST,
    port: GMAIL_IMAP_PORT,
    secure: true,
    logger: false,
    auth: { user, pass },
  });
}

/** IMAP client from a saved account (any provider). */
export function createImapClientFromConfig(imap: ImapAccountConfig): ImapFlow {
  const secure = imap.security === "ssl";
  return new ImapFlow({
    host: imap.host.trim(),
    port: imap.port,
    secure,
    tls: imap.security === "tls" ? {} : undefined,
    logger: false,
    auth: { user: imap.username.trim(), pass: imap.password },
  });
}

export type FetchedEmail = {
  subject: string | null;
  from: string | null;
  date: string | null;
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
): string | null {
  const raw = envelopeDate ?? internalDate;
  if (!raw) return null;
  const d = raw instanceof Date ? raw : new Date(raw);
  const t = d.getTime();
  return Number.isNaN(t) ? null : d.toISOString();
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
  try {
    await client.connect();
    const lock = await client.getMailboxLock(INBOX);
    try {
      const mb = client.mailbox;
      if (mb === false || !mb.exists) {
        return [];
      }
      const exists = mb.exists;
      const startSeq = Math.max(1, exists - FETCH_LIMIT + 1);
      return collectFetchedForRange(client, startSeq, exists);
    } finally {
      lock.release();
    }
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
