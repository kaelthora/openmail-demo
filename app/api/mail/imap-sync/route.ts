import { NextResponse } from "next/server";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
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
  const secure = imap.security === "ssl";
  return {
    host: imap.host.trim(),
    port: imap.port,
    secure,
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

export async function POST(request: Request) {
  let body: { account?: OpenMailAccountProfile; folder?: "inbox" | "sent" | "drafts" };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const account = body.account;
  const folder = body.folder ?? "inbox";
  if (!account || !isAccountConfigured(account)) {
    return NextResponse.json(
      { error: "Missing or incomplete account configuration" },
      { status: 400 }
    );
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
        /* try next candidate */
      }
    }
    if (!openedMailbox) {
      await client.logout();
      return NextResponse.json({ messages: [] as MailItem[] });
    }

    const mb = client.mailbox;
    if (!mb) {
      await client.logout();
      return NextResponse.json({ messages: [] as MailItem[] });
    }

    const exists = mb.exists;
    if (!exists) {
      await client.logout();
      return NextResponse.json({ messages: [] as MailItem[] });
    }

    const startSeq = Math.max(1, exists - MAX_MESSAGES + 1);
    const range = `${startSeq}:${exists}`;
    const out: MailItem[] = [];

    for await (const msg of client.fetch(range, {
      uid: true,
      envelope: true,
      source: true,
      flags: true,
      internalDate: true,
    })) {
      if (!msg.source || !msg.envelope) continue;

      let textBody = "";
      let preview = "";
      try {
        const parsed = await simpleParser(msg.source);
        textBody =
          typeof parsed.text === "string"
            ? parsed.text
            : parsed.html
              ? String(parsed.html).replace(/<[^>]+>/g, " ").slice(0, 20000)
              : "";
        preview = textBody.replace(/\s+/g, " ").trim().slice(0, 220);
      } catch {
        textBody = "";
        preview = "";
      }

      const fromAddr = msg.envelope.from?.[0];
      const title =
        fromAddr?.name && fromAddr.name !== fromAddr.address
          ? String(fromAddr.name)
          : fromAddr?.address ?? "Unknown";

      const subject = msg.envelope.subject?.trim() || "(no subject)";
      const seen = msg.flags?.has("\\Seen") ?? false;
      const date = toIso(msg.envelope.date ?? msg.internalDate);

      const messageId =
        msg.envelope.messageId?.replace(/^<|>$/g, "") ?? undefined;

      const item: MailItem = {
        id: `imap-${msg.uid}`,
        title,
        sender: fromAddr?.address,
        subject,
        preview: preview || subject,
        content: textBody || preview || subject,
        aiPreview: "Mailbox message",
        confidence: 70,
        needsReply: false,
        deleted: false,
        folder,
        read: seen,
        date,
        rfc822MessageId: messageId,
        x: 20 + (out.length % 5) * 15,
        y: 20 + (out.length % 4) * 12,
      };

      out.push(item);
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
    const message = e instanceof Error ? e.message : "IMAP sync failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
