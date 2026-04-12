import { NextResponse } from "next/server";
import { formatByteSize } from "@/lib/formatBytes";
import {
  createImapClientFromConfig,
  imapMailboxCandidates,
  imapMailboxOpenOptions,
} from "@/lib/imap";
import { parseMimeSource } from "@/lib/mailparserParse";
import {
  type OpenMailAccountProfile,
  isAccountConfigured,
} from "@/lib/mailAccountConfig";
import { resolveMailIsoDateString } from "@/lib/mailDateIso";
import type { MailItem } from "@/lib/mailTypes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_MESSAGES = 10;

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

  const client = createImapClientFromConfig(account.imap);

  try {
    console.info(
      `[openmail][IMAP] imap-sync connect ${account.imap.host}:${account.imap.port} folder=${folder}`
    );
    await client.connect();
    let openedMailbox: string | null = null;
    const candidates = imapMailboxCandidates(folder, account.imap.host);
    for (const mailboxName of candidates) {
      try {
        await client.mailboxOpen(mailboxName, imapMailboxOpenOptions());
        openedMailbox = mailboxName;
        console.info(
          `[openmail][IMAP] imap-sync opened "${mailboxName}" exists=${client.mailbox ? client.mailbox.exists : "?"}`
        );
        break;
      } catch (e) {
        console.warn(
          `[openmail][IMAP] imap-sync cannot open "${mailboxName}":`,
          e instanceof Error ? e.message : e
        );
      }
    }
    if (!openedMailbox) {
      await client.logout();
      return NextResponse.json(
        {
          error:
            "Could not open mailbox. Verify host/port/security, credentials, and that IMAP is enabled (Gmail: turn on IMAP + use an App Password if 2FA is on).",
        },
        { status: 502 }
      );
    }

    const mb = client.mailbox;
    if (!mb) {
      await client.logout();
      return NextResponse.json(
        { error: "Mailbox open returned no data." },
        { status: 502 }
      );
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

      const buf = Buffer.isBuffer(msg.source)
        ? msg.source
        : Buffer.from(String(msg.source), "utf8");
      const parsed = await parseMimeSource(buf);
      const textBody = parsed.text;
      const preview = textBody.replace(/\s+/g, " ").trim().slice(0, 220);
      const attachmentItems =
        parsed.attachments.length > 0
          ? parsed.attachments.map((a, i) => ({
              id: `imap-${msg.uid}-att-${i}`,
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

      const subject = msg.envelope.subject?.trim() || "(no subject)";
      const seen = msg.flags?.has("\\Seen") ?? false;
      const date = resolveMailIsoDateString(
        msg.envelope.date ?? msg.internalDate,
        new Date()
      );

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
        ...(attachmentItems ? { attachments: attachmentItems } : {}),
      };

      out.push(item);
    }

    await client.logout();

    out.reverse();

    console.info(
      `[openmail][IMAP] imap-sync: fetched ${out.length} message(s) from "${openedMailbox}"`
    );

    return NextResponse.json({ messages: out });
  } catch (e) {
    console.error("[openmail][IMAP] imap-sync failed:", e);
    try {
      await client.logout();
    } catch {
      /* ignore */
    }
    const message = e instanceof Error ? e.message : "IMAP sync failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
