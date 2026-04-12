import { parseImapConfigJson } from "@/lib/accountConfigJson";
import { prisma } from "@/lib/db";
import type { EmailListItem } from "@/lib/emailListTypes";
import { fetchEmails, fetchEmailsWithImap } from "@/lib/imap";
import type { FetchedEmail } from "@/lib/imap";
import { fetchedEmailsToEmailListItems } from "@/lib/imapEmailList";

/** Latest N messages per inbox list response (matches prior `/api/emails` cap). */
export const MAIL_INBOX_LIST_CAP = 50;

/**
 * Server-only: loads INBOX via IMAP for a saved account id or legacy env credentials.
 */
export async function fetchInboxFetchedEmails(
  accountId: string | null
): Promise<FetchedEmail[]> {
  if (accountId) {
    const acc = await prisma.account.findUnique({ where: { id: accountId } });
    if (!acc) {
      throw new Error("Account not found");
    }
    const imap = parseImapConfigJson(acc.imapConfig);
    if (!imap) {
      throw new Error("Invalid IMAP configuration on account");
    }
    return fetchEmailsWithImap(imap);
  }
  return fetchEmails();
}

export async function listInboxEmailListItems(
  accountId: string | null
): Promise<EmailListItem[]> {
  const fetched = await fetchInboxFetchedEmails(accountId);
  return fetchedEmailsToEmailListItems(
    fetched.slice(0, MAIL_INBOX_LIST_CAP),
    accountId
  );
}
