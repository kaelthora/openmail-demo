/**
 * HttpOnly cookie: email from the last successful `/api/connect` IMAP verification.
 * Used by `GET /api/accounts` when Prisma has no rows so the UI still gets a valid list.
 */
export const LAST_IMAP_CONNECT_EMAIL_COOKIE = "openmail_last_imap_email";

/** Cross-site (e.g. Vercel UI → Railway API) requires `SameSite=None` + `Secure`. */
export function lastImapConnectCookieOptions() {
  const prod = process.env.NODE_ENV === "production";
  return {
    httpOnly: true as const,
    path: "/" as const,
    maxAge: 60 * 60 * 24 * 7,
    sameSite: (prod ? "none" : "lax") as "none" | "lax",
    secure: prod,
  };
}
