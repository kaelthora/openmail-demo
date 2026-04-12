/** Stored attachment metadata (no file bytes). */
export type EmailAttachmentRow = {
  filename: string;
  type: string;
  size: number;
};

/** Shape of each item in `GET /api/emails` → `{ emails }`. */
export type EmailListItem = {
  id: string;
  subject: string | null;
  from: string | null;
  /** ISO-8601; server always resolves from `date` or `createdAt`. */
  date: string;
  body: string | null;
  bodyHtml: string | null;
  attachments: EmailAttachmentRow[] | null;
  risk: string | null;
  summary: string | null;
  action: string | null;
  reason: string | null;
  suggestions: string[] | null;
  intent: string | null;
  intentUrgency: string | null;
  intentConfidence: number | null;
  createdAt: string;
  /** Server mailbox; null = legacy env inbox */
  accountId: string | null;
};
