import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import {
  inferProviderLabel,
  parseImapConfigJson,
  parseSmtpConfigJson,
} from "@/lib/accountConfigJson";
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
    const missing = assertDatabaseUrl();
    if (missing) return missing;

    const rows = await prisma.account.findMany({
      orderBy: { createdAt: "asc" },
    });
    const accounts = rows.map((row) => {
      try {
        return sanitizeAccount(row);
      } catch (e) {
        logAccountsRouteError("GET.sanitizeAccount", e);
        throw new Error("Stored account row could not be parsed (imap/smtp JSON)");
      }
    });
    console.info(`[openmail][accounts] fetched ${accounts.length} account(s)`);
    inboxDiag("mail-fetch-api", "GET /api/accounts:ok", {
      accountCount: accounts.length,
      ids: accounts.map((a) => a.id),
    });
    return NextResponse.json({ ok: true as const, accounts });
  } catch (e) {
    logAccountsRouteError("GET", e);
    if (e instanceof Prisma.PrismaClientInitializationError) {
      const message =
        "Could not connect to the database. Check DATABASE_URL and that the database is reachable.";
      inboxDiag("mail-fetch-api", "GET /api/accounts:error", {
        message: message.slice(0, 200),
      });
      return jsonFail(503, message);
    }
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      const message = prismaKnownUserMessage(e);
      inboxDiag("mail-fetch-api", "GET /api/accounts:error", {
        message: message.slice(0, 200),
      });
      return jsonFail(500, message);
    }
    const message =
      e instanceof Error ? e.message : "Failed to list accounts";
    inboxDiag("mail-fetch-api", "GET /api/accounts:error", {
      message: message.slice(0, 200),
    });
    return jsonFail(500, message);
  }
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

    return NextResponse.json({ ok: true as const, account });
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
