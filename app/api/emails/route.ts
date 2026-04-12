import { NextResponse } from "next/server";
import { parseImapConfigJson } from "@/lib/accountConfigJson";
// DEMO MODE: Prisma disabled for Vercel deployment (stub in lib/db.ts) — only used for account IMAP config lookup
import { prisma } from "@/lib/db";
import type { EmailListItem } from "@/lib/emailListTypes";
import {
  fetchedEmailsToEmailListItems,
  getDemoFallbackEmailListItems,
} from "@/lib/imapEmailList";
import {
  fetchEmails,
  fetchEmailsWithImap,
  imapCredentialsConfigured,
} from "@/lib/imap";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LIST_CAP = 50;

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const scopeId = url.searchParams.get("accountId")?.trim() ?? null;

    let emails: EmailListItem[] = [];

    try {
      if (scopeId) {
        const acc = await prisma.account.findUnique({ where: { id: scopeId } });
        if (!acc) {
          return NextResponse.json({ emails: [] });
        }
        const imap = parseImapConfigJson(acc.imapConfig);
        if (!imap) {
          return NextResponse.json({ emails: [] });
        }
        const fetched = await fetchEmailsWithImap(imap);
        emails = fetchedEmailsToEmailListItems(
          fetched.slice(0, LIST_CAP),
          scopeId
        );
      } else if (imapCredentialsConfigured()) {
        const fetched = await fetchEmails();
        emails = fetchedEmailsToEmailListItems(
          fetched.slice(0, LIST_CAP),
          null
        );
      } else {
        // No DB and no env IMAP — demo content so inbox is usable (e.g. Vercel).
        emails = getDemoFallbackEmailListItems().slice(0, 20);
      }
    } catch (e) {
      // IMAP failure — demo fallback so the app still shows a populated inbox.
      console.error("[api/emails] IMAP fetch failed, using demo fallback", e);
      emails = getDemoFallbackEmailListItems().slice(0, 20);
    }

    return NextResponse.json({ emails: emails.slice(0, LIST_CAP) });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load emails";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
