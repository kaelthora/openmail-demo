import type { FetchedEmail } from "@/lib/imap";

export type IngestEmailOptions = {
  /** When set, dedupe scope + FK; omit/null = legacy env inbox (dedupe matches pre–multi-account rows). */
  accountId?: string | null;
};

// DEMO MODE: Prisma disabled for Vercel deployment — IMAP fetch runs elsewhere; nothing persisted to DB.

/**
 * Persists fetched messages with `analyzeEmail` (CORE / synced AI fields).
 * Idempotent via `dedupeKey`.
 */
export async function ingestFetchedEmails(
  fetched: FetchedEmail[],
  _options?: IngestEmailOptions
): Promise<{ inserted: number; newIds: string[] }> {
  if (fetched.length === 0) return { inserted: 0, newIds: [] };
  return { inserted: 0, newIds: [] };
}
