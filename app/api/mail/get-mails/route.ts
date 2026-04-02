import { NextResponse } from "next/server";
import { ImapFlow } from "imapflow";
import { formatByteSize } from "@/lib/formatBytes";
import { parseMimeSource } from "@/lib/mailparserParse";
import {
  type OpenMailAccountProfile,
  isAccountConfigured,
} from "@/lib/mailAccountConfig";
import type { MailItem } from "@/lib/mailTypes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_MESSAGES = 20;

function toIso(d: string | Date | undefined): string {
  if (!d) return new Date().toISOString();
  if (d instanceof Date) return d.toISOString();
  const t = Date.parse(d);
  return Number.isNaN(t) ? new Date().toISOString() : new Date(t).toISOString();
}

function buildImapOptions(account: OpenMailAccountProfile) {
  const { imap } = account;
  return {
    host: imap.host.trim(),
    port: imap.port,
    secure: imap.security === "ssl",
    tls: imap.security === "tls" ? {} : undefined,
    logger: false as const,
    auth: {
      user: imap.username.trim(),
      pass: imap.password,
    },
  };
}

function mailboxCandidatesFor(folder: "inbox" | "sent" | "drafts"): string[] {
  if (folder === "sent") {
    return ["Sent", "Sent Items", "Sent Mail", "[Gmail]/Sent Mail", "INBOX.Sent"];
  }
  if (folder === "drafts") {
    return ["Drafts", "[Gmail]/Drafts", "INBOX.Drafts"];
  }
  return ["INBOX"];
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const folderParam = (url.searchParams.get("folder") ?? "inbox").toLowerCase();
  const folder = (folderParam === "sent" || folderParam === "drafts" ? folderParam : "inbox") as
    | "inbox"
    | "sent"
    | "drafts";

  const accountRaw = request.headers.get("x-openmail-account");
  if (!accountRaw) {
    return NextResponse.json({ error: "Missing account header" }, { status: 400 });
  }

  let account: OpenMailAccountProfile;
  try {
    account = JSON.parse(accountRaw) as OpenMailAccountProfile;
  } catch {
    return NextResponse.json({ error: "Invalid account header" }, { status: 400 });
  }

  if (!isAccountConfigured(account)) {
    return NextResponse.json({ error: "Missing or incomplete account configuration" }, { status: 400 });
  }

  const client = new ImapFlow(buildImapOptions(account));
  try {
    await client.connect();
    let openedMailbox: string | null = null;
    for (const mailboxName of mailboxCandidatesFor(folder)) {
      try {
        await client.mailboxOpen(mailboxName);
        openedMailbox = mailboxName;
        break;
      } catch {
        /* try next mailbox */
      }
    }
    if (!openedMailbox) {
      await client.logout();
      return NextResponse.json({ messages: [] as MailItem[] });
    }

    const mb = client.mailbox;
    if (!mb || !mb.exists) {
      await client.logout();
      return NextResponse.json({ messages: [] as MailItem[] });
    }

    const startSeq = Math.max(1, mb.exists - MAX_MESSAGES + 1);
    const range = `${startSeq}:${mb.exists}`;
    const out: MailItem[] = [];
    for await (const msg of client.fetch(range, {
      uid: true,
      envelope: true,
      source: true,
      flags: true,
      internalDate: true,
    })) {
      if (!msg.source || !msg.envelope) continue;
      const buf = Buffer.isBuffer(msg.source)
        ? msg.source
        : Buffer.from(String(msg.source), "utf8");
      const parsed = await parseMimeSource(buf);
      const textBody = parsed.text;
      const preview = textBody.replace(/\s+/g, " ").trim().slice(0, 220);
      const attachmentItems =
        parsed.attachments.length > 0
          ? parsed.attachments.map((a, i) => ({
              id: `imap-${folder}-${msg.uid}-att-${i}`,
              name: a.filename,
              sizeBytes: a.size,
              sizeLabel: formatByteSize(a.size),
            }))
          : undefined;

      const fromAddr = msg.envelope.from?.[0];
      const title =
        fromAddr?.name && fromAddr.name !== fromAddr.address
          ? String(fromAddr.name)
          : fromAddr?.address ?? "Unknown";

      const subj = msg.envelope.subject?.trim() || "(no subject)";
      out.push({
        id: `imap-${folder}-${msg.uid}`,
        title,
        sender: fromAddr?.address,
        subject: subj,
        preview: preview || subj,
        content: textBody || preview || subj,
        aiPreview: "Mailbox message",
        confidence: 70,
        needsReply: false,
        deleted: false,
        folder,
        read: msg.flags?.has("\\Seen") ?? false,
        date: toIso(msg.envelope.date ?? msg.internalDate),
        rfc822MessageId: msg.envelope.messageId?.replace(/^<|>$/g, "") ?? undefined,
        x: 20 + (out.length % 5) * 15,
        y: 20 + (out.length % 4) * 12,
        ...(attachmentItems ? { attachments: attachmentItems } : {}),
      });
    }

    await client.logout();
    out.reverse();
    return NextResponse.json({ messages: out });
  } catch (e) {
    try {
      await client.logout();
    } catch {
      /* ignore */
    }
    const message = e instanceof Error ? e.message : "Folder fetch failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

