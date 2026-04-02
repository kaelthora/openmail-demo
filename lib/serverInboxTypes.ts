/** Row from `GET /api/accounts` (no secrets). */
export type ServerMailAccountSummary = {
  id: string;
  email: string;
  provider: string | null;
};

/** `legacy` = env inbox rows (`Email.accountId` null). Otherwise Prisma `Account.id`. */
export type ServerInboxScope = "legacy" | string;
