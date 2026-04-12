import { NextResponse } from "next/server";
import { ingestFetchedEmails } from "@/lib/emailIngest";
import { fetchInboxFetchedEmails } from "@/lib/mailInboxFetch";

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
    const scope = accountId ?? null;
    if (accountId) {
      console.info(
        `[openmail][IMAP] emails/sync: accountId=${accountId} (shared mailInboxFetch)`
      );
    } else {
      console.info(
        `[openmail][IMAP] emails/sync: legacy mode — Gmail IMAP (EMAIL_USER / EMAIL_PASS)`
      );
    }
    const fetched = await fetchInboxFetchedEmails(scope);
    console.info(
      `[openmail][IMAP] emails/sync: fetched ${fetched.length} message(s) from INBOX`
    );
    const { inserted } = await ingestFetchedEmails(fetched, {
      accountId: scope,
    });
    console.info(
      `[openmail][IMAP] emails/sync: inserted ${inserted} new row(s) into database`
    );
    return NextResponse.json({
      success: true,
      count: inserted,
      fetched: fetched.length,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Sync failed";
    const status =
      message.includes("EMAIL_USER") ||
      message.includes("EMAIL_PASS") ||
      message.includes("Missing required environment variable")
        ? 503
        : message === "Account not found"
          ? 404
          : message.includes("Invalid IMAP configuration")
            ? 400
            : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
