/**
 * Detects the legacy-IMAP “env vars not set” errors from `lib/imap.ts`
 * (`requireLegacyImapUser` / `requireLegacyImapPass`). Used by API + client
 * so first-run never surfaces these as generic inbox failures.
 */
export function isLegacyImapEnvMissingMessage(msg: string): boolean {
  const m = (msg || "").trim();
  if (!m) return false;
  if (!(m.includes("EMAIL_USER") || m.includes("EMAIL_PASS"))) return false;
  return (
    m.includes("not configured") ||
    m.includes("connect a saved account") ||
    m.includes("Set EMAIL_USER") ||
    m.includes("Set EMAIL_PASS")
  );
}
