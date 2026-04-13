import { NextResponse } from "next/server";
import type { EmailListItem } from "@/lib/emailListTypes";
import {
  isAccountNotFoundInboxMessage,
  isLegacyImapEnvMissingMessage,
} from "@/lib/legacyImapEnvMissing";
import { listInboxEmailListItems } from "@/lib/mailInboxFetch";

export type ParsedInboxScope =
  | { ok: true; accountId: string | null }
  | { ok: false; response: Response };

/**
 * Resolves inbox scope from URL (GET) or JSON body (POST).
 * Legacy Gmail env mode requires `legacy=1` or `{ "legacy": true }`.
 */
export async function parseInboxFetchRequest(
  request: Request
): Promise<ParsedInboxScope> {
  const url = new URL(request.url);
  const fromQueryAccount = url.searchParams.get("accountId")?.trim();
  if (fromQueryAccount) {
    return { ok: true, accountId: fromQueryAccount };
  }
  if (url.searchParams.get("legacy") === "1") {
    return { ok: true, accountId: null };
  }

  if (request.method !== "GET") {
    try {
      const b = (await request.json()) as {
        accountId?: unknown;
        legacy?: unknown;
      };
      if (typeof b?.accountId === "string" && b.accountId.trim()) {
        return { ok: true, accountId: b.accountId.trim() };
      }
      if (b?.legacy === true) {
        return { ok: true, accountId: null };
      }
    } catch {
      /* no / invalid JSON body */
    }
  }

  return {
    ok: false,
    response: NextResponse.json(
      {
        error:
          "Specify a saved account (accountId) or legacy IMAP (?legacy=1 or { \"legacy\": true }).",
        emails: [] as EmailListItem[],
      },
      { status: 400 }
    ),
  };
}

export function inboxFetchErrorStatus(message: string): number {
  if (message.includes("EMAIL_USER") || message.includes("EMAIL_PASS")) {
    return 503;
  }
  if (message === "Account not found") return 404;
  if (message.includes("Invalid IMAP configuration")) return 400;
  return 500;
}

export async function jsonMailInboxListResponse(
  accountId: string | null
): Promise<Response> {
  try {
    const emails = await listInboxEmailListItems(accountId);
    return NextResponse.json({ emails });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load mail";
    /** Legacy IMAP with no env vars — first-run, not a server outage. */
    if (accountId == null && isLegacyImapEnvMissingMessage(message)) {
      return NextResponse.json({
        emails: [] as EmailListItem[],
        setupRequired: true,
      });
    }
    /** Prisma row gone (e.g. removed account) — prompt to connect, not 404 error UI. */
    if (accountId != null && isAccountNotFoundInboxMessage(message)) {
      return NextResponse.json({
        emails: [] as EmailListItem[],
        setupRequired: true,
      });
    }
    const status = inboxFetchErrorStatus(message);
    return NextResponse.json(
      { error: message, emails: [] as EmailListItem[] },
      { status }
    );
  }
}
