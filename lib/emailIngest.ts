import { analyzeEmail } from "@/lib/ai";
import { prisma } from "@/lib/db";
import { emailDedupeKey } from "@/lib/emailDedupe";
import type { FetchedEmail } from "@/lib/imap";
import { resolveMailIsoDateString } from "@/lib/mailDateIso";
import { emitMailRealtime } from "@/lib/mailRealtimeHub";

export type IngestEmailOptions = {
  /** When set, dedupe scope + FK; omit/null = legacy env inbox (dedupe matches pre–multi-account rows). */
  accountId?: string | null;
};

/**
 * Persists fetched messages with `analyzeEmail` (CORE / synced AI fields).
 * Idempotent via `dedupeKey`.
 */
export async function ingestFetchedEmails(
  fetched: FetchedEmail[],
  options?: IngestEmailOptions
): Promise<{ inserted: number; newIds: string[] }> {
  if (fetched.length === 0) return { inserted: 0, newIds: [] };

  const accountId = options?.accountId ?? null;
  const dedupeScope = accountId?.trim() || null;

  const data = fetched.map((e) => ({
    dedupeKey: emailDedupeKey(e.subject, e.from, e.date, dedupeScope),
    subject: e.subject,
    mailFrom: e.from,
    body: e.body.length > 0 ? e.body : null,
    bodyHtml: e.bodyHtml && e.bodyHtml.length > 0 ? e.bodyHtml : null,
    attachments: e.attachments,
    date: new Date(resolveMailIsoDateString(e.date, new Date())),
  }));

  return prisma.$transaction(async (tx) => {
    const keys = data.map((row) => row.dedupeKey);
    const existing = await tx.email.findMany({
      where: { dedupeKey: { in: keys } },
      select: { dedupeKey: true },
    });
    const seen = new Set(existing.map((r) => r.dedupeKey));
    const fresh = data.filter((row) => !seen.has(row.dedupeKey));
    if (fresh.length === 0) return { inserted: 0, newIds: [] };

    const toInsert = await Promise.all(
      fresh.map(async (row) => {
        const bodyForAi = row.body?.trim()
          ? row.body
          : row.bodyHtml?.trim()
            ? row.bodyHtml
            : "";
        const a = await analyzeEmail({
          subject: row.subject,
          body: bodyForAi,
          attachments: row.attachments.map((x) => ({
            filename: x.filename,
            type: x.type,
            size: x.size,
          })),
        });
        const bodyStored =
          row.body && row.body.length > 0
            ? row.body
            : row.bodyHtml && row.bodyHtml.length > 0
              ? row.bodyHtml
              : null;
        return {
          dedupeKey: row.dedupeKey,
          subject: row.subject,
          mailFrom: row.mailFrom,
          body: bodyStored,
          date: row.date,
          attachments: row.attachments.length > 0 ? row.attachments : undefined,
          risk: a.risk,
          summary: a.summary,
          action: a.action,
          reason: a.reason,
          suggestions: a.suggestions,
          intent: a.intent,
          intentUrgency: a.intentUrgency,
          intentConfidence: a.intentConfidence,
          accountId: accountId ?? null,
        };
      })
    );

    await tx.email.createMany({ data: toInsert });
    const insertedKeys = fresh.map((f) => f.dedupeKey);
    const rows = await tx.email.findMany({
      where: { dedupeKey: { in: insertedKeys } },
      select: { id: true },
      orderBy: { createdAt: "asc" },
    });
    const newIds = rows.map((r) => r.id);
    emitMailRealtime({
      type: "new_mail",
      inserted: fresh.length,
      ids: newIds,
    });
    return { inserted: fresh.length, newIds };
  });
}
