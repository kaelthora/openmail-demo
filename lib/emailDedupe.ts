import { createHash } from "node:crypto";

/**
 * Normalized composite key for duplicate detection.
 * When `accountKey` is omitted or empty, matches legacy hashes (env inbox only).
 */
export function emailDedupeKey(
  subject: string | null,
  from: string | null,
  dateIso: string | null,
  accountKey?: string | null
): string {
  const s = subject ?? "";
  const f = from ?? "";
  const d = dateIso ?? "";
  const acc = accountKey?.trim() ? `\x1e${accountKey.trim()}` : "";
  return createHash("sha256").update(`${s}\x1e${f}\x1e${d}${acc}`, "utf8").digest("hex");
}
