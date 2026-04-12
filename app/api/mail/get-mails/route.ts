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

  const client = createImapClientFromConfig(account.imap);
  try {
    console.info(
      `[openmail][IMAP] get-mails connect ${account.imap.host}:${account.imap.port} folder=${folder}`
    );
    await client.connect();
    console.info(
      `[openmail][IMAP] get-mails: TLS connection established to ${account.imap.host}:${account.imap.port}`
    );
    let openedMailbox: string | null = null;
    for (const mailboxName of imapMailboxCandidates(folder, account.imap.host)) {
      try {
        await client.mailboxOpen(mailboxName, imapMailboxOpenOptions());
        openedMailbox = mailboxName;
        break;
      } catch (e) {
        console.warn(
          `[openmail][IMAP] get-mails cannot open "${mailboxName}":`,
          e instanceof Error ? e.message : e
        );
      }
    }
    if (!openedMailbox) {
      await client.logout();
      return NextResponse.json(
        {
          error:
            "Could not open mailbox. Check IMAP settings and that IMAP is enabled (Gmail: App Password + IMAP on).",
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
    if (!mb.exists) {
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
        date: resolveMailIsoDateString(
          msg.envelope.date ?? msg.internalDate,
          new Date()
        ),
        rfc822MessageId: msg.envelope.messageId?.replace(/^<|>$/g, "") ?? undefined,
        x: 20 + (out.length % 5) * 15,
        y: 20 + (out.length % 4) * 12,
        ...(attachmentItems ? { attachments: attachmentItems } : {}),
      });
    }

    await client.logout();
    out.reverse();
    console.info(
      `[openmail][IMAP] get-mails: fetched ${out.length} message(s) folder=${folder}`
    );
    return NextResponse.json({ messages: out });
  } catch (e) {
    console.error("[openmail][IMAP] get-mails failed:", e);
    try {
      await client.logout();
    } catch {
      /* ignore */
    }
    const message = e instanceof Error ? e.message : "Folder fetch failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

