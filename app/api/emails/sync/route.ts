import { NextResponse } from "next/server";
import { ingestFetchedEmails } from "@/lib/emailIngest";
import { parseImapConfigJson } from "@/lib/accountConfigJson";
// DEMO MODE: Prisma disabled for Vercel deployment (stub in lib/db.ts)
import { prisma } from "@/lib/db";
import { fetchEmails, fetchEmailsWithImap } from "@/lib/imap";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let accountId: string | undefined;
  try {
    const b = (await request.json()) as { accountId?: unknown };
    if (typeof b?.accountId === "string" && b.accountId.trim()) {
      accountId = b.accountId.trim();
    }
  } catch {
    /* no JSON body — legacy env sync */
  }

  try {
    if (accountId) {
      const acc = await prisma.account.findUnique({ where: { id: accountId } });
      if (!acc) {
        return NextResponse.json(
          { success: false, error: "Account not found" },
          { status: 404 }
        );
      }
      const imap = parseImapConfigJson(acc.imapConfig);
      if (!imap) {
        return NextResponse.json(
          { success: false, error: "Invalid IMAP configuration on account" },
          { status: 500 }
        );
      }
      console.info(
        `[openmail][IMAP] emails/sync: connecting accountId=${accountId} host=${imap.host}:${imap.port} secure=${imap.port === 993 || imap.security === "ssl"}`
      );
      const fetched = await fetchEmailsWithImap(imap);
      console.info(
        `[openmail][IMAP] emails/sync: connection OK — fetched ${fetched.length} message(s) from INBOX`
      );
      const { inserted } = await ingestFetchedEmails(fetched, { accountId });
      console.info(
        `[openmail][IMAP] emails/sync: inserted ${inserted} new row(s) into database (accountId=${accountId})`
      );
      return NextResponse.json({ success: true, count: inserted, fetched: fetched.length });
    }

    console.info(
      `[openmail][IMAP] emails/sync: legacy mode — Gmail imap.gmail.com:993 (EMAIL_USER / EMAIL_PASS)`
    );
    const fetched = await fetchEmails();
    console.info(
      `[openmail][IMAP] emails/sync: connection OK — fetched ${fetched.length} message(s) from INBOX`
    );
    const { inserted } = await ingestFetchedEmails(fetched, { accountId: null });
    console.info(
      `[openmail][IMAP] emails/sync: inserted ${inserted} new row(s) into database (legacy inbox)`
    );
    return NextResponse.json({ success: true, count: inserted, fetched: fetched.length });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Sync failed";
    const status = message.includes("Missing required environment variable")
      ? 503
      : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
