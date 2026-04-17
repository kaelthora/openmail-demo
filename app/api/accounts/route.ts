import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import {
  inferProviderLabel,
  parseImapConfigJson,
  parseSmtpConfigJson,
} from "@/lib/accountConfigJson";
import { LAST_IMAP_CONNECT_EMAIL_COOKIE } from "@/lib/lastImapConnectCookie";
import { prisma } from "@/lib/db";
import type { ImapAccountConfig, SmtpAccountConfig } from "@/lib/mailAccountConfig";
import { inboxDiag } from "@/lib/openmailInboxDiag";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonFail(status: number, error: string) {
  return NextResponse.json({ ok: false as const, error }, { status });
}

function logAccountsRouteError(phase: string, error: unknown): void {
  const prefix = `[openmail][accounts][${phase}]`;
  if (error instanceof Error) {
    console.error(prefix, error.message);
    if (error.stack) console.error(prefix, "stack:\n", error.stack);
  } else {
    console.error(prefix, String(error));
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    console.error(
      prefix,
      `PrismaClientKnownRequestError code=${error.code} meta=${JSON.stringify(error.meta)}`
    );
  }
  if (error instanceof Prisma.PrismaClientValidationError) {
    console.error(prefix, "PrismaClientValidationError:", error.message);
  }
  if (error instanceof Prisma.PrismaClientInitializationError) {
    console.error(prefix, "PrismaClientInitializationError:", error.message);
  }
}

function assertDatabaseUrl(): NextResponse | null {
  const url = process.env.DATABASE_URL;
  if (typeof url !== "string" || !url.trim()) {
    const error =
      "Database is not configured: DATABASE_URL is missing or empty. Set it in the deployment environment.";
    console.error("[openmail][accounts]", error);
    return jsonFail(503, error);
  }
  return null;
}

function prismaKnownUserMessage(e: Prisma.PrismaClientKnownRequestError): string {
  switch (e.code) {
    case "P2002":
      return "A database record with this unique value already exists.";
    case "P2003":
      return "Foreign key constraint failed.";
    case "P2025":
      return "Record not found.";
    default:
      return e.message || "Database request failed.";
  }
}

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

/** Fallback row when Prisma is empty but `/api/connect` succeeded (cookie). */
function tempAccountFromLastConnectEmail(email: string) {
  const e = email.trim().toLowerCase();
  return {
    id: "temp",
    email: e,
    provider: null as string | null,
    imap: null,
    smtp: null,
    hasImapPassword: false,
    hasSmtpPassword: false,
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

/**
 * Always HTTP 200 with `{ ok: true, accounts }`.
 * If Prisma fails or is empty, falls back to last successful IMAP connect (cookie), else `[]`.
 */
export async function GET() {
  let accounts: ReturnType<typeof sanitizeAccount>[] = [];

  const dbUrl = typeof process.env.DATABASE_URL === "string" && process.env.DATABASE_URL.trim();
  if (dbUrl) {
    try {
      const rows = await prisma.account.findMany({
        orderBy: { createdAt: "asc" },
      });
      for (const row of rows) {
        try {
          accounts.push(sanitizeAccount(row));
        } catch (e) {
          logAccountsRouteError("GET.sanitizeAccount", e);
        }
      }
    } catch (e) {
      logAccountsRouteError("GET.prisma", e);
      accounts = [];
    }
  }

  if (accounts.length === 0) {
    try {
      const jar = await cookies();
      const last = jar.get(LAST_IMAP_CONNECT_EMAIL_COOKIE)?.value ?? "";
      if (last.includes("@")) {
        accounts = [tempAccountFromLastConnectEmail(last)];
      }
    } catch (e) {
      logAccountsRouteError("GET.cookies", e);
      accounts = [];
    }
  }

  console.info(`[openmail][accounts] GET returning ${accounts.length} account(s)`);
  inboxDiag("mail-fetch-api", "GET /api/accounts:ok", {
    accountCount: accounts.length,
    ids: accounts.map((a) => a.id),
  });
  return NextResponse.json({ ok: true as const, accounts }, { status: 200 });
}

export async function POST(request: Request) {
  try {
    const missing = assertDatabaseUrl();
    if (missing) return missing;

    let body: unknown;
    try {
      body = await request.json();
    } catch (e) {
      logAccountsRouteError("POST.request.json", e);
      return jsonFail(400, "Invalid JSON body");
    }

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return jsonFail(400, "JSON object body is required");
    }

    const record = body as Record<string, unknown>;
    const email =
      typeof record.email === "string" ? record.email.trim().toLowerCase() : "";
    if (!email || !email.includes("@")) {
      return jsonFail(400, "Valid email is required");
    }

    const imap = readImapBody(record.imap);
    const smtp = readSmtpBody(record.smtp);
    if (!imap || !smtp) {
      return jsonFail(
        400,
        "Complete imap and smtp objects are required (host, port, username, password, security)."
      );
    }

    const provider =
      typeof record.provider === "string" && record.provider.trim()
        ? record.provider.trim()
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

    let account;
    try {
      account = sanitizeAccount(row);
    } catch (e) {
      logAccountsRouteError("POST.sanitizeAccount", e);
      return jsonFail(
        500,
        "Account was created but the response could not be built (invalid stored shape)."
      );
    }

    const res = NextResponse.json({ ok: true as const, account });
    res.cookies.delete(LAST_IMAP_CONNECT_EMAIL_COOKIE);
    return res;
  } catch (e) {
    logAccountsRouteError("POST", e);

    if (e instanceof Prisma.PrismaClientInitializationError) {
      return jsonFail(
        503,
        "Could not connect to the database. Check DATABASE_URL and that the database is reachable."
      );
    }
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      const status = e.code === "P2002" ? 409 : 500;
      return jsonFail(status, prismaKnownUserMessage(e));
    }
    if (e instanceof Prisma.PrismaClientValidationError) {
      return jsonFail(400, "Invalid data for database schema.");
    }

    const message = e instanceof Error ? e.message : "Create failed";
    return jsonFail(500, message);
  }
}
