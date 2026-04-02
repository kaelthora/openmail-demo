import type { EmailAttachmentRow, EmailListItem } from "@/lib/emailListTypes";
import { formatByteSize } from "@/lib/formatBytes";
import type { MailItem, SyncedAiAnalysis } from "@/lib/mailTypes";

const PREVIEW_MAX = 220;

/** Single-line preview for list rows (truncated body). */
export function truncateBodyPreview(body: string | null, max = PREVIEW_MAX): string {
  if (!body?.trim()) return "(no preview)";
  const t = body.replace(/\s+/g, " ").trim();
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`;
}

function parseFromDisplay(from: string | null): { title: string; sender: string } {
  if (!from?.trim()) return { title: "Unknown", sender: "" };
  const m = from.match(/^(.*?)\s*<([^>]+)>$/);
  if (m) {
    const addr = m[2].trim();
    const name = m[1].replace(/^["']|["']$/g, "").trim();
    return { title: name || addr, sender: addr };
  }
  const t = from.trim();
  return { title: t, sender: t };
}

function mapStoredAttachments(
  emailId: string,
  list: EmailAttachmentRow[] | null | undefined
): MailItem["attachments"] {
  if (!list?.length) return undefined;
  return list.map((a, i) => ({
    id: `${emailId}-att-${i}`,
    name: a.filename,
    sizeBytes: a.size,
    sizeLabel: formatByteSize(a.size),
    mimeType: a.type,
  }));
}

function parseSyncedAi(e: EmailListItem): SyncedAiAnalysis | undefined {
  const riskOk =
    e.risk === "high" || e.risk === "medium" || e.risk === "safe" ? e.risk : null;
  const actionOk =
    e.action === "reply" || e.action === "ignore" || e.action === "escalate"
      ? e.action
      : null;
  const summary = e.summary?.trim() ?? "";
  const reason = e.reason?.trim() ?? null;
  const suggestions = (e.suggestions ?? []).filter(
    (s): s is string => typeof s === "string" && s.trim().length > 0
  );

  const hasPayload =
    riskOk != null ||
    summary.length > 0 ||
    reason != null ||
    suggestions.length > 0 ||
    actionOk != null;
  if (!hasPayload) return undefined;

  return {
    risk: riskOk ?? "safe",
    summary,
    reason,
    action: actionOk,
    suggestions,
  };
}

/** Maps `GET /api/emails` rows into `MailItem` for the OpenMail UI. */
export function emailApiItemToMailItem(e: EmailListItem): MailItem {
  const { title, sender } = parseFromDisplay(e.from);
  const subject = e.subject?.trim() || "(no subject)";
  const body = e.body ?? "";

  const syncedAi = parseSyncedAi(e);

  const attachmentItems = mapStoredAttachments(e.id, e.attachments);

  return {
    id: e.id,
    title,
    sender: sender || undefined,
    subject,
    preview: truncateBodyPreview(body),
    content: body,
    aiPreview: e.summary?.trim() || "Synced message",
    confidence: 72,
    needsReply: e.action === "reply",
    deleted: false,
    folder: "inbox",
    read: true,
    date: e.date ?? e.createdAt,
    rfc822MessageId: undefined,
    x: 20,
    y: 20,
    accountId: e.accountId ?? null,
    ...(attachmentItems ? { attachments: attachmentItems } : {}),
    ...(syncedAi ? { syncedAi } : {}),
  };
}
