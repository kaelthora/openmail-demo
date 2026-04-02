import { NextResponse } from "next/server";
import {
  inferProviderLabel,
  parseImapConfigJson,
  parseSmtpConfigJson,
} from "@/lib/accountConfigJson";
import { prisma } from "@/lib/db";
import type { ImapAccountConfig, SmtpAccountConfig } from "@/lib/mailAccountConfig";

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

type RouteCtx = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, ctx: RouteCtx) {
  const { id } = await ctx.params;
  try {
    const existing = await prisma.account.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const curImap = parseImapConfigJson(existing.imapConfig);
    const curSmtp = parseSmtpConfigJson(existing.smtpConfig);
    if (!curImap || !curSmtp) {
      return NextResponse.json({ error: "Corrupt stored config" }, { status: 500 });
    }

    const body = (await request.json()) as {
      email?: unknown;
      provider?: unknown;
      imap?: unknown;
      smtp?: unknown;
    };

    let email = existing.email;
    if (typeof body.email === "string" && body.email.trim()) {
      email = body.email.trim().toLowerCase();
    }

    let provider =
      typeof body.provider === "string" && body.provider.trim()
        ? body.provider.trim()
        : existing.provider ?? inferProviderLabel(email);

    let imap: ImapAccountConfig = curImap;
    if (body.imap && typeof body.imap === "object") {
      const partial = body.imap as Record<string, unknown>;
      const pwd =
        typeof partial.password === "string" && partial.password.length > 0
          ? partial.password
          : curImap.password;
      imap = {
        host:
          typeof partial.host === "string" && partial.host.trim()
            ? partial.host.trim()
            : curImap.host,
        port:
          typeof partial.port === "number" && partial.port > 0
            ? partial.port
            : curImap.port,
        username:
          typeof partial.username === "string" && partial.username.trim()
            ? partial.username.trim()
            : curImap.username,
        password: pwd,
        security:
          partial.security === "ssl" ||
          partial.security === "tls" ||
          partial.security === "none"
            ? partial.security
            : curImap.security,
      };
    }

    let smtp: SmtpAccountConfig = curSmtp;
    if (body.smtp && typeof body.smtp === "object") {
      const partial = body.smtp as Record<string, unknown>;
      const pwd =
        typeof partial.password === "string" && partial.password.length > 0
          ? partial.password
          : curSmtp.password;
      smtp = {
        host:
          typeof partial.host === "string" && partial.host.trim()
            ? partial.host.trim()
            : curSmtp.host,
        port:
          typeof partial.port === "number" && partial.port > 0
            ? partial.port
            : curSmtp.port,
        username:
          typeof partial.username === "string" && partial.username.trim()
            ? partial.username.trim()
            : curSmtp.username,
        password: pwd,
        security:
          partial.security === "ssl" ||
          partial.security === "tls" ||
          partial.security === "none"
            ? partial.security
            : curSmtp.security,
      };
    }

    const row = await prisma.account.update({
      where: { id },
      data: {
        email,
        provider,
        imapConfig: imap as object,
        smtpConfig: smtp as object,
      },
    });

    return NextResponse.json({ account: sanitizeAccount(row) });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Update failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(_request: Request, ctx: RouteCtx) {
  const { id } = await ctx.params;
  try {
    await prisma.account.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
