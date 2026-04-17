import { NextResponse } from "next/server";
import {
  inferProviderLabel,
  parseImapConfigJson,
  parseSmtpConfigJson,
} from "@/lib/accountConfigJson";
// DEMO MODE: Prisma disabled for Vercel deployment (stub in lib/db.ts)
import { prisma } from "@/lib/db";
import type { ImapAccountConfig, SmtpAccountConfig } from "@/lib/mailAccountConfig";
import { inboxDiag } from "@/lib/openmailInboxDiag";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sanitizeAccount(a: {
  id: string;
  email: string;
  provider: string | null;
  imapConfig: unknown;
  smtpConfig: unknown;
}) {
  const imap = parseImapConfigJson(a.imapConfig);
  const smtp = parseSmtpConfigJson(a.smtpConfig);
  return {
    id: a.id,
    email: a.email,
    provider: a.provider,
    imap: imap
      ? {
          host: imap.host,
          port: imap.port,
          username: imap.username,
          security: imap.security,
        }
      : null,
    smtp: smtp
      ? {
          host: smtp.host,
          port: smtp.port,
          username: smtp.username,
          security: smtp.security,
        }
      : null,
    hasImapPassword: Boolean(imap?.password),
    hasSmtpPassword: Boolean(smtp?.password),
  };
}

function readImapBody(raw: unknown): ImapAccountConfig | null {
  if (!raw || typeof raw !== "object") return null;
  return parseImapConfigJson(raw);
}

function readSmtpBody(raw: unknown): SmtpAccountConfig | null {
  if (!raw || typeof raw !== "object") return null;
  return parseSmtpConfigJson(raw);
}

export async function GET() {
  try {
    const rows = await prisma.account.findMany({
      orderBy: { createdAt: "asc" },
    });
    const accounts = rows.map(sanitizeAccount);
    console.info(`[openmail][accounts] fetched ${accounts.length} account(s)`);
    inboxDiag("mail-fetch-api", "GET /api/accounts:ok", {
      accountCount: accounts.length,
      ids: accounts.map((a) => a.id),
    });
    return NextResponse.json({ accounts });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to list accounts";
    console.error(`[openmail][accounts] fetch failed: ${message}`);
    inboxDiag("mail-fetch-api", "GET /api/accounts:error", {
      message: message.slice(0, 200),
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      email?: unknown;
      provider?: unknown;
      imap?: unknown;
      smtp?: unknown;
    };
    const email =
      typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!email || !email.includes("@")) {
      return NextResponse.json({ error: "Valid email is required" }, { status: 400 });
    }
    const imap = readImapBody(body.imap);
    const smtp = readSmtpBody(body.smtp);
    if (!imap || !smtp) {
      return NextResponse.json(
        { error: "Complete imap and smtp blocks with host, port, username, password, security" },
        { status: 400 }
      );
    }
    const provider =
      typeof body.provider === "string" && body.provider.trim()
        ? body.provider.trim()
        : inferProviderLabel(email);

    const row = await prisma.account.create({
      data: {
        email,
        provider,
        imapConfig: imap as object,
        smtpConfig: smtp as object,
      },
    });
    console.info(`[openmail][accounts] saved account id=${row.id} email=${email}`);

    return NextResponse.json({ account: sanitizeAccount(row) });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Create failed";
    console.error(`[openmail][accounts] save failed: ${message}`);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
