import { NextResponse } from "next/server";
// DEMO MODE: Prisma disabled for Vercel deployment (stub in lib/db.ts)
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_IDS = 12;

type ByIdEmailRow = {
  id: string;
  subject: string | null;
  mailFrom: string | null;
  summary: string | null;
  action: string | null;
  reason: string | null;
  suggestions: unknown;
  intent: string | null;
  intentUrgency: string | null;
  intentConfidence: number | null;
  risk: string | null;
  accountId: string | null;
};

function parseSuggestions(value: unknown): string[] {
  if (value == null) return [];
  if (!Array.isArray(value)) return [];
  return value.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const raw = searchParams.get("ids") ?? "";
  const ids = raw
    .split(/[,]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, MAX_IDS);

  if (ids.length === 0) {
    return NextResponse.json({ items: [] as unknown[] });
  }

  try {
    const rows = (await prisma.email.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        subject: true,
        mailFrom: true,
        summary: true,
        action: true,
        reason: true,
        suggestions: true,
        intent: true,
        intentUrgency: true,
        intentConfidence: true,
        risk: true,
        accountId: true,
      },
    })) as ByIdEmailRow[];

    const order = new Map(ids.map((id, i) => [id, i]));
    rows.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));

    const items = rows.map((r) => ({
      id: r.id,
      subject: r.subject,
      from: r.mailFrom,
      summary: r.summary,
      action: r.action,
      reason: r.reason,
      suggestions: parseSuggestions(r.suggestions),
      intent: r.intent,
      intentUrgency: r.intentUrgency,
      intentConfidence: r.intentConfidence,
      risk: r.risk,
      accountId: r.accountId,
    }));

    return NextResponse.json({ items });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Lookup failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
