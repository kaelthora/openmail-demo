import type { MailTransportSecurity } from "@/lib/mailAccountConfig";

/** Public server/IMAP endpoint summary (no passwords). From `GET /api/accounts`. */
export type ServerMailAccountEndpoint = {
  host: string;
  port: number;
  username: string;
  security: MailTransportSecurity;
};

/** Row from `GET /api/accounts` (no secrets). */
export type ServerMailAccountSummary = {
  id: string;
  email: string;
  provider: string | null;
  imap?: ServerMailAccountEndpoint | null;
  smtp?: ServerMailAccountEndpoint | null;
  hasImapPassword?: boolean;
  hasSmtpPassword?: boolean;
};

/** `legacy` = environment / default inbox in UI. Otherwise Prisma `Account.id` for sync target. */
export type ServerInboxScope = "legacy" | string;
