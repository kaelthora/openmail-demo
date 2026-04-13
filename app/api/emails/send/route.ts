import { NextResponse } from "next/server";
import { parseSmtpConfigJson } from "@/lib/accountConfigJson";
// DEMO MODE: Prisma disabled for Vercel deployment (stub in lib/db.ts)
import { prisma } from "@/lib/db";
import { guardianEvaluate } from "@/lib/guardianEngine";
import { recordGuardianTraceDev } from "@/lib/guardianTrace";
import { sendEmail, sendEmailWithSmtpAccount } from "@/lib/smtp";
import { IMAP_READ_ONLY } from "@/lib/imapReadOnly";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY = 512 * 1024;
const MAX_SUBJECT = 998;

type SendBody = {
  to?: unknown;
  subject?: unknown;
  body?: unknown;
  accountId?: unknown;
  /** Set to true only after the user confirmed a Guardian `warn` in the client. */
  guardianWarnAcknowledged?: unknown;
};

function asNonEmptyString(v: unknown, label: string): string {
  if (typeof v !== "string") {
    throw new Error(`${label} must be a string`);
  }
  const t = v.trim();
  if (!t) {
    throw new Error(`${label} is required`);
  }
  return t;
}

export async function POST(request: Request) {
  let json: SendBody;
  try {
    json = (await request.json()) as SendBody;
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  try {
    const to = asNonEmptyString(json.to, "to");
    const subjectRaw =
      typeof json.subject === "string" ? json.subject.trim() : "";
    if (subjectRaw.length > MAX_SUBJECT) {
      return NextResponse.json(
        { success: false, error: `subject exceeds ${MAX_SUBJECT} characters` },
        { status: 400 }
      );
    }

    const body =
      typeof json.body === "string" ? json.body : json.body == null ? "" : String(json.body);
    if (body.length > MAX_BODY) {
      return NextResponse.json(
        { success: false, error: `body exceeds ${MAX_BODY} bytes` },
        { status: 400 }
      );
    }

    const gSend = guardianEvaluate("send_email", {
      to,
      subject: subjectRaw,
      body,
    });
    recordGuardianTraceDev(gSend, "server:send");
    const warnAck = json.guardianWarnAcknowledged === true;

    if (gSend.decision === "block") {
      return NextResponse.json(
        {
          success: false,
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
          success: false,
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

    const aid =
      typeof json.accountId === "string" && json.accountId.trim()
        ? json.accountId.trim()
        : null;

    if (aid) {
      const acc = await prisma.account.findUnique({ where: { id: aid } });
      if (!acc) {
        return NextResponse.json(
          { success: false, error: "Account not found" },
          { status: 404 }
        );
      }
      const smtp = parseSmtpConfigJson(acc.smtpConfig);
      if (!smtp) {
        return NextResponse.json(
          { success: false, error: "Invalid SMTP configuration" },
          { status: 500 }
        );
      }
      await sendEmailWithSmtpAccount(smtp, {
        to,
        subject: subjectRaw,
        text: body,
      });
    } else {
      await sendEmail({ to, subject: subjectRaw, text: body });
    }

    return NextResponse.json({ success: true, imapReadOnly: IMAP_READ_ONLY });
  } catch (e) {
    console.error("[openmail] POST /api/emails/send failed [redacted]");
    const message = e instanceof Error ? e.message : "Send failed";
    const isConfig =
      message.includes("SMTP is not configured") ||
      message.includes("EMAIL_USER") ||
      message.includes("EMAIL_PASS");
    const isClient =
      message.includes("Invalid") ||
      message.includes("required") ||
      message.includes("must be a string");
    const status = isConfig ? 503 : isClient ? 400 : 502;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
