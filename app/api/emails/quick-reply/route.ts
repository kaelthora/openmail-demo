import { NextResponse } from "next/server";
import { parseSmtpConfigJson } from "@/lib/accountConfigJson";
import { prisma } from "@/lib/db";
import { extractEmail } from "@/lib/mailAddress";
import { guardianEvaluate } from "@/lib/guardianEngine";
import { recordGuardianTraceDev } from "@/lib/guardianTrace";
import { sendEmail, sendEmailWithSmtpAccount } from "@/lib/smtp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY = 512 * 1024;
const MAX_SUBJECT = 998;

function parseSuggestions(value: unknown): string[] {
  if (value == null) return [];
  if (!Array.isArray(value)) return [];
  return value.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
}

type Body = { mailId?: unknown };

export async function POST(request: Request) {
  let json: Body;
  try {
    json = (await request.json()) as Body;
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const mailId = typeof json.mailId === "string" ? json.mailId.trim() : "";
  if (!mailId) {
    return NextResponse.json(
      { success: false, error: "mailId is required" },
      { status: 400 }
    );
  }

  try {
    const row = await prisma.email.findUnique({
      where: { id: mailId },
      select: {
        subject: true,
        mailFrom: true,
        suggestions: true,
        risk: true,
        accountId: true,
      },
    });

    if (!row) {
      return NextResponse.json(
        { success: false, error: "Message not found" },
        { status: 404 }
      );
    }

    if (row.risk === "high") {
      return NextResponse.json(
        {
          success: false,
          error: "Quick send is disabled for high-risk messages — open OpenMail.",
        },
        { status: 422 }
      );
    }

    const suggestions = parseSuggestions(row.suggestions);
    const body = (suggestions[0] ?? "").trim();
    if (!body) {
      return NextResponse.json(
        {
          success: false,
          error: "No AI reply suggestion stored for this message.",
        },
        { status: 400 }
      );
    }

    const fromRaw = row.mailFrom ?? "";
    const to = extractEmail(fromRaw) || fromRaw.trim();
    if (!to.includes("@")) {
      return NextResponse.json(
        { success: false, error: "Could not determine recipient address" },
        { status: 400 }
      );
    }

    const subj = (row.subject ?? "").trim() || "(no subject)";
    const subject = subj.startsWith("Re:") ? subj : `Re: ${subj}`;

    const text = body.length > MAX_BODY ? body.slice(0, MAX_BODY) : body;
    if (subject.length > MAX_SUBJECT) {
      return NextResponse.json(
        { success: false, error: "Subject too long" },
        { status: 400 }
      );
    }

    const gSend = guardianEvaluate("send_email", {
      to,
      subject,
      body: text,
    });
    recordGuardianTraceDev(gSend, "server:quick_reply");
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

    if (gSend.decision === "warn") {
      return NextResponse.json(
        {
          success: false,
          error: `${gSend.reason} Use OpenMail to review the warning and send with your confirmation—quick send cannot bypass a Guardian warning.`,
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
      typeof row.accountId === "string" && row.accountId.trim()
        ? row.accountId.trim()
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
      await sendEmailWithSmtpAccount(smtp, { to, subject, text });
    } else {
      await sendEmail({ to, subject, text });
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Send failed";
    const isConfig =
      message.includes("SMTP is not configured") ||
      message.includes("EMAIL_USER") ||
      message.includes("EMAIL_PASS");
    const status = isConfig ? 503 : 502;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
