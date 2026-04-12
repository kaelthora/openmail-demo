import { createHash } from "node:crypto";
import type { EmailAttachmentRow, EmailListItem } from "@/lib/emailListTypes";
import type { FetchedEmail } from "@/lib/imap";
import type { MailItem } from "@/lib/mailTypes";
import { OPENMAIL_DEMO_MAIL_ITEMS } from "@/lib/openmailDemoMails";

/** Stable id for IMAP rows (no DB uid); same message → same id across refreshes for a given account scope. */
export function stableImapListId(
  accountId: string | null,
  index: number,
  f: FetchedEmail
): string {
  const h = createHash("sha256");
  h.update(
    `${accountId ?? "legacy"}\0${index}\0${f.date}\0${f.from ?? ""}\0${f.subject ?? ""}\0${f.body.slice(0, 400)}`
  );
  return `imap-${h.digest("hex").slice(0, 40)}`;
}

function attachmentsToRows(
  f: FetchedEmail
): EmailAttachmentRow[] | null {
  if (!f.attachments?.length) return null;
  return f.attachments.map((a) => ({
    filename: a.filename,
    type: a.type,
    size: a.size,
  }));
}

/**
 * Maps IMAP-fetched messages to `EmailListItem` for `GET /api/mail/fetch` (no database).
 */
export function fetchedEmailsToEmailListItems(
  fetched: FetchedEmail[],
  accountId: string | null
): EmailListItem[] {
  return fetched.map((f, index) => {
    const id = stableImapListId(accountId, index, f);
    return {
      id,
      subject: f.subject,
      from: f.from,
      date: f.date,
      body: f.body.length > 0 ? f.body : null,
      bodyHtml: f.bodyHtml,
      attachments: attachmentsToRows(f),
      risk: null,
      summary: null,
      action: null,
      reason: null,
      suggestions: null,
      intent: null,
      intentUrgency: null,
      intentConfidence: null,
      createdAt: f.date,
      accountId,
    };
  });
}

/** Convert demo `MailItem` inbox entries to API list shape (IMAP failure / no-credentials fallback). */
export function mailItemToEmailListItem(m: MailItem): EmailListItem {
  const from =
    m.sender && m.title
      ? `${m.title} <${m.sender}>`
      : m.sender || m.title || null;
  const attachments: EmailAttachmentRow[] | null =
    m.attachments && m.attachments.length > 0
      ? m.attachments.map((a) => ({
          filename: a.name,
          type: a.mimeType ?? "application/octet-stream",
          size: a.sizeBytes ?? 0,
        }))
      : null;
  const sa = m.syncedAi;
  const iso =
    typeof m.date === "string" && m.date.trim()
      ? m.date
      : new Date().toISOString();
  return {
    id: m.id,
    subject: m.subject,
    from,
    date: iso,
    body: m.content ?? null,
    bodyHtml: null,
    attachments,
    risk: sa?.risk ?? null,
    summary: sa?.summary ?? m.aiPreview ?? null,
    action: sa?.action ?? null,
    reason: sa?.reason ?? null,
    suggestions: sa?.suggestions ?? null,
    intent: sa?.intent ?? null,
    intentUrgency: sa?.intentUrgency ?? null,
    intentConfidence: sa?.intentConfidence ?? null,
    createdAt: iso,
    accountId: m.accountId ?? null,
  };
}

/** Demo inbox fallback when IMAP is unavailable (e.g. Vercel without env credentials). */
export function getDemoFallbackEmailListItems(): EmailListItem[] {
  return OPENMAIL_DEMO_MAIL_ITEMS.filter(
    (m) => m.folder === "inbox" && !m.deleted
  ).map(mailItemToEmailListItem);
}
