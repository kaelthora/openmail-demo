import { NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { ImapFlow } from "imapflow";
import MailComposer from "nodemailer/lib/mail-composer";
import {
  type OpenMailAccountProfile,
  isAccountConfigured,
} from "@/lib/mailAccountConfig";
import { guardImapFlowClient, IMAP_READ_ONLY } from "@/lib/imapReadOnly";
import { guardianEvaluate } from "@/lib/guardianEngine";
import { recordGuardianTraceDev } from "@/lib/guardianTrace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SendBody = {
  account?: OpenMailAccountProfile;
  to?: string;
  subject?: string;
  text?: string;
  inReplyTo?: string;
  references?: string;
  guardianWarnAcknowledged?: boolean;
};

type MailboxListEntry = {
  path?: string;
  name?: string;
  specialUse?: string;
  flags?: Set<string> | string[];
};

async function buildRawMessage(
  from: string,
  to: string,
  subject: string,
  text: string,
  inReplyTo?: string,
  references?: string
): Promise<Buffer> {
  const headers: Record<string, string> = {};
  if (inReplyTo?.trim()) {
    const v = inReplyTo.trim();
    headers["In-Reply-To"] = v.startsWith("<") ? v : `<${v}>`;
  }
  if (references?.trim()) {
    headers.References = references.trim();
  }
  const composer = new MailComposer({
    from,
    to,
    subject,
    text,
    headers: Object.keys(headers).length ? headers : undefined,
    date: new Date(),
  });
  return composer.compile().build();
}

function pickSentMailbox(mailboxes: MailboxListEntry[]): string | null {
  for (const box of mailboxes) {
    const specialUse = (box.specialUse ?? "").toLowerCase();
    if (specialUse === "\\sent") return box.path ?? box.name ?? null;
    const flags = Array.isArray(box.flags) ? box.flags : box.flags ? [...box.flags] : [];
    if (flags.some((f) => String(f).toLowerCase() === "\\sent")) {
      return box.path ?? box.name ?? null;
    }
  }

  const allNames = mailboxes
    .map((b) => b.path ?? b.name ?? "")
    .filter(Boolean);
  const priorityPatterns = [
    /\[gmail\]\/sent mail/i,
    /^sent items$/i,
    /^sent mail$/i,
    /^sent$/i,
    /^inbox\.sent$/i,
  ];
  for (const pattern of priorityPatterns) {
    const hit = allNames.find((name) => pattern.test(name));
    if (hit) return hit;
  }
  const loose = allNames.find((name) => /sent/i.test(name));
  return loose ?? null;
}

async function appendToSentMailbox(
  account: OpenMailAccountProfile,
  raw: Buffer
) {
  const client = guardImapFlowClient(
    new ImapFlow({
      host: account.imap.host.trim(),
      port: account.imap.port,
      secure: account.imap.security === "ssl",
      tls: account.imap.security === "tls" ? {} : undefined,
      auth: {
        user: account.imap.username.trim(),
        pass: account.imap.password,
      },
      logger: false,
      connectionTimeout: 10000,
      socketTimeout: 10000,
    })
  );

  try {
    await client.connect();
    const boxes: MailboxListEntry[] = [];
    const list = await client.list();
    for (const box of list) {
      boxes.push(box as MailboxListEntry);
    }
    const mailbox = pickSentMailbox(boxes);
    if (!mailbox) return;
    await client.append(mailbox, raw, ["\\Seen"]);
  } finally {
    try {
      await client.logout();
    } catch {
      /* ignore */
    }
  }
}

export async function POST(request: Request) {
  let body: SendBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { account, to, subject, text, inReplyTo, references } = body;
  if (!account || !isAccountConfigured(account)) {
    return NextResponse.json(
      { error: "Missing or incomplete account configuration" },
      { status: 400 }
    );
  }

  const toAddr = to?.trim();
  if (!toAddr?.includes("@")) {
    return NextResponse.json({ error: "Invalid recipient" }, { status: 400 });
  }

  const subj = subject?.trim() || "(no subject)";
  const bodyText = text ?? "";

  const gSend = guardianEvaluate("send_email", {
    to: toAddr,
    subject: subj,
    body: bodyText,
  });
  recordGuardianTraceDev(gSend, "server:legacy_send");
  const warnAck = body.guardianWarnAcknowledged === true;

  if (gSend.decision === "block") {
    return NextResponse.json(
      {
        error: gSend.reason,
        guardian: {
          decision: gSend.decision,
          rule: gSend.rule,
          riskLevel: gSend.riskLevel,
          requiresExplicitUserConsent: gSend.requiresExplicitUserConsent,
          criticalBlock: gSend.criticalBlock,
        },
      },
      { status: 403 }
    );
  }

  if (gSend.decision === "warn" && !warnAck) {
    return NextResponse.json(
      {
        error: gSend.reason,
        guardian: {
          decision: gSend.decision,
          rule: gSend.rule,
          riskLevel: gSend.riskLevel,
          requiresExplicitUserConsent: true,
          criticalBlock: false,
        },
      },
      { status: 403 }
    );
  }

  const smtp = account.smtp;
  const secure = smtp.security === "ssl";

  const transporter = nodemailer.createTransport({
    host: smtp.host.trim(),
    port: smtp.port,
    secure,
    auth: {
      user: smtp.username.trim(),
      pass: smtp.password,
    },
    requireTLS: smtp.security === "tls",
  });

  try {
    await transporter.sendMail({
      from: account.email.trim(),
      to: toAddr,
      subject: subj,
      text: bodyText,
      headers:
        inReplyTo?.trim() || references?.trim()
          ? {
              ...(inReplyTo?.trim()
                ? {
                    "In-Reply-To": inReplyTo.trim().startsWith("<")
                      ? inReplyTo.trim()
                      : `<${inReplyTo.trim()}>`,
                  }
                : {}),
              ...(references?.trim() ? { References: references.trim() } : {}),
            }
          : undefined,
    });
    try {
      const raw = await buildRawMessage(
        account.email.trim(),
        toAddr,
        subj,
        bodyText,
        inReplyTo,
        references
      );
      await appendToSentMailbox(account, raw);
    } catch {
      console.warn("[mail/send] Could not append to IMAP sent folder [redacted]");
    }

    return NextResponse.json({ ok: true, imapReadOnly: IMAP_READ_ONLY });
  } catch (e) {
    const message = e instanceof Error ? e.message : "SMTP send failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
