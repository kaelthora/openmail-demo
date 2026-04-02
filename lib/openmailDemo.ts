/**
 * OpenMail standalone demo — static inbox, no `/api/emails`.
 * Set `NEXT_PUBLIC_OPENMAIL_DEMO_MODE=true` to enable (default: API inbox).
 */
export const OPENMAIL_DEMO_MODE =
  typeof process !== "undefined" &&
  process.env.NEXT_PUBLIC_OPENMAIL_DEMO_MODE === "true";
