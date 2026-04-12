import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import type { EmailAttachmentRow, EmailListItem } from "@/lib/emailListTypes";
import { resolveMailIsoDateString } from "@/lib/mailDateIso";
function parseSuggestions(value: unknown): string[] | null {
  if (value == null) return null;
  if (!Array.isArray(value)) return null;
  const out = value.filter((x): x is string => typeof x === "string");
  return out.length > 0 ? out : null;
}

function parseAttachments(value: unknown): EmailAttachmentRow[] | null {
  if (value == null) return null;
  if (!Array.isArray(value)) return null;
  const out: EmailAttachmentRow[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const filename = typeof o.filename === "string" ? o.filename : "";
    const type = typeof o.type === "string" ? o.type : "application/octet-stream";
    const size = typeof o.size === "number" && o.size >= 0 ? o.size : 0;
    if (filename) out.push({ filename, type, size });
  }
  return out.length > 0 ? out : null;
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LIMIT = 50;

/** Aligns with Prisma select; cast until `npx prisma generate` refreshes client types. */
type EmailApiRow = {
  id: string;
  subject: string | null;
  mailFrom: string | null;
  body: string | null;
  attachments: unknown;
  date: Date | null;
  risk: string | null;
  summary: string | null;
  action: string | null;
  reason: string | null;
  suggestions: unknown;
  intent: string | null;
  intentUrgency: string | null;
  intentConfidence: number | null;
  createdAt: Date;
  accountId: string | null;
};

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const legacy = url.searchParams.get("legacy") === "1";
    const scopeId = url.searchParams.get("accountId")?.trim();

    const where =
      scopeId && scopeId.length > 0
        ? { accountId: scopeId }
        : legacy
          ? { accountId: null }
          : undefined;

    const rowsRaw = await prisma.email.findMany({
      where,
      take: LIMIT,
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        subject: true,
        mailFrom: true,
        body: true,
        attachments: true,
        date: true,
        risk: true,
        summary: true,
        action: true,
        reason: true,
        suggestions: true,
        intent: true,
        intentUrgency: true,
        intentConfidence: true,
        createdAt: true,
        accountId: true,
      },
    });

    const rows = rowsRaw as unknown as EmailApiRow[];

    const emails: EmailListItem[] = rows.map((r) => ({
      id: r.id,
      subject: r.subject,
      from: r.mailFrom,
      date: resolveMailIsoDateString(r.date, r.createdAt),
      body: r.body,
      bodyHtml: null,
      attachments: parseAttachments(r.attachments),
      risk: r.risk,
      summary: r.summary,
      action: r.action,
      reason: r.reason,
      suggestions: parseSuggestions(r.suggestions),
      intent: r.intent,
      intentUrgency: r.intentUrgency,
      intentConfidence:
        typeof r.intentConfidence === "number" && Number.isFinite(r.intentConfidence)
          ? r.intentConfidence
          : null,
      createdAt: r.createdAt.toISOString(),
      accountId: r.accountId ?? null,
    }));

    return NextResponse.json({ emails });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load emails";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
