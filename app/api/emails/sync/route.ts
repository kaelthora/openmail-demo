import { NextResponse } from "next/server";
import { ingestFetchedEmails } from "@/lib/emailIngest";
import { parseImapConfigJson } from "@/lib/accountConfigJson";
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
      const fetched = await fetchEmailsWithImap(imap);
      const { inserted } = await ingestFetchedEmails(fetched, { accountId });
      return NextResponse.json({ success: true, count: inserted });
    }

    const fetched = await fetchEmails();
    const { inserted } = await ingestFetchedEmails(fetched, { accountId: null });
    return NextResponse.json({ success: true, count: inserted });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Sync failed";
    const status = message.includes("Missing required environment variable")
      ? 503
      : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
