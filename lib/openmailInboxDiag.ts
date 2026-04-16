/**
 * Temporary inbox diagnostics (empty-after-refresh investigation).
 * Filter console: `[OpenMail:inbox-diag]`
 */
const TAG = "[OpenMail:inbox-diag]";

export function inboxDiag(
  source: "mail-store" | "mail-fetch-api",
  event: string,
  payload?: Record<string, unknown>
): void {
  try {
    console.info(TAG, source, event, {
      t: typeof performance !== "undefined" ? performance.now() : Date.now(),
      ...payload,
    });
  } catch {
    /* ignore */
  }
}
