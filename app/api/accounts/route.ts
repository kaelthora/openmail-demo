import { randomUUID } from "crypto";
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

/** Same public shape as `sanitizeAccount`, built from the POST body when Prisma cannot persist. */
function mockAccountFromPayload(
  email: string,
  provider: string | null,
  imap: ImapAccountConfig,
  smtp: SmtpAccountConfig
) {
  return {
    id: `local-${randomUUID()}`,
    email,
    provider,
    imap: {
      host: imap.host,
      port: imap.port,
      username: imap.username,
      security: imap.security,
    },
    smtp: {
      host: smtp.host,
      port: smtp.port,
      username: smtp.username,
      security: smtp.security,
    },
    hasImapPassword: Boolean(imap.password),
    hasSmtpPassword: Boolean(smtp.password),
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
  try {
    let accounts: ReturnType<typeof sanitizeAccount>[] = [];

    const dbUrl =
      typeof process.env.DATABASE_URL === "string" && process.env.DATABASE_URL.trim();
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
  } catch (e) {
    logAccountsRouteError("GET.fatal", e);
    const message = e instanceof Error ? e.message : String(e);
    console.error("[openmail][accounts][GET.fatal] returning empty accounts after error:", message);
    return NextResponse.json({ ok: true as const, accounts: [] }, { status: 200 });
  }
}

export async function POST(request: Request) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch (e) {
      logAccountsRouteError("POST.request.json", e);
      const msg = e instanceof Error ? e.message : "Invalid JSON body";
      return NextResponse.json({ ok: false as const, error: msg }, { status: 400 });
    }

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json(
        { ok: false as const, error: "JSON object body is required" },
        { status: 400 }
      );
    }

    const record = body as Record<string, unknown>;
    const email =
      typeof record.email === "string" ? record.email.trim().toLowerCase() : "";
    if (!email || !email.includes("@")) {
      return NextResponse.json(
        { ok: false as const, error: "Valid email is required" },
        { status: 400 }
      );
    }

    const imap = readImapBody(record.imap);
    const smtp = readSmtpBody(record.smtp);
    if (!imap || !smtp) {
      return NextResponse.json(
        {
          ok: false as const,
          error:
            "Complete imap and smtp objects are required (host, port, username, password, security).",
        },
        { status: 400 }
      );
    }

    const provider =
      typeof record.provider === "string" && record.provider.trim()
        ? record.provider.trim()
        : inferProviderLabel(email);

    try {
      if (!process.env.DATABASE_URL?.trim()) {
        throw new Error(
          "DATABASE_URL is missing or empty — persisting account skipped (mock response)."
        );
      }

      const row = await prisma.account.create({
        data: {
          email,
          provider,
          imapConfig: imap as object,
          smtpConfig: smtp as object,
        },
      });
      console.info(`[openmail][accounts] saved account id=${row.id} email=${email}`);

      try {
        const account = sanitizeAccount(row);
        const res = NextResponse.json({ ok: true as const, account });
        res.cookies.delete(LAST_IMAP_CONNECT_EMAIL_COOKIE);
        return res;
      } catch (sanitizeErr) {
        logAccountsRouteError("POST.sanitizeAccount", sanitizeErr);
        const account = mockAccountFromPayload(email, provider, imap, smtp);
        console.error(
          "[openmail][accounts][POST] sanitize failed after create; returning mock account id=",
          account.id
        );
        const res = NextResponse.json({ ok: true as const, account });
        res.cookies.delete(LAST_IMAP_CONNECT_EMAIL_COOKIE);
        return res;
      }
    } catch (dbErr) {
      logAccountsRouteError("POST.persistence", dbErr);
      const detail =
        dbErr instanceof Error
          ? dbErr.message
          : typeof dbErr === "string"
            ? dbErr
            : JSON.stringify(dbErr);
      console.error(
        "[openmail][accounts][POST.persistence] Prisma / DB error (returning mock account):",
        detail
      );
      if (dbErr instanceof Prisma.PrismaClientKnownRequestError) {
        console.error(
          "[openmail][accounts][POST.persistence] Prisma code:",
          dbErr.code,
          "meta:",
          JSON.stringify(dbErr.meta)
        );
      }
      const account = mockAccountFromPayload(email, provider, imap, smtp);
      const res = NextResponse.json({ ok: true as const, account });
      res.cookies.delete(LAST_IMAP_CONNECT_EMAIL_COOKIE);
      return res;
    }
  } catch (e) {
    logAccountsRouteError("POST.fatal", e);
    const message = e instanceof Error ? e.message : String(e);
    console.error("[openmail][accounts][POST.fatal]", message);
    return NextResponse.json({ ok: false as const, error: message }, { status: 500 });
  }
}
