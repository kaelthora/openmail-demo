/**
 * Structure for future IMAP/SMTP sync — persistence not wired in MVP.
 */
export type MailTransportSecurity = "ssl" | "tls" | "none";

export type ImapAccountConfig = {
  host: string;
  port: number;
  username: string;
  password: string;
  security: MailTransportSecurity;
};

export type SmtpAccountConfig = {
  host: string;
  port: number;
  username: string;
  password: string;
  security: MailTransportSecurity;
};

export type OpenMailAccountProfile = {
  id: string;
  label: string;
  email: string;
  imap: ImapAccountConfig;
  smtp: SmtpAccountConfig;
};

export const emptyAccountProfile = (): OpenMailAccountProfile => ({
  id: "local-1",
  label: "Primary",
  email: "",
  imap: {
    host: "",
    port: 993,
    username: "",
    password: "",
    security: "ssl",
  },
  smtp: {
    host: "",
    port: 587,
    username: "",
    password: "",
    security: "tls",
  },
});

type MailProviderPreset = {
  domains: string[];
  imap: Pick<ImapAccountConfig, "host" | "port" | "security">;
  smtp: Pick<SmtpAccountConfig, "host" | "port" | "security">;
};

const MAIL_PROVIDER_PRESETS: MailProviderPreset[] = [
  {
    domains: ["gmail.com", "googlemail.com"],
    imap: { host: "imap.gmail.com", port: 993, security: "ssl" },
    smtp: { host: "smtp.gmail.com", port: 587, security: "tls" },
  },
  {
    domains: ["outlook.com", "hotmail.com", "live.com"],
    imap: { host: "outlook.office365.com", port: 993, security: "ssl" },
    smtp: { host: "smtp.office365.com", port: 587, security: "tls" },
  },
  {
    domains: ["yahoo.com", "ymail.com"],
    imap: { host: "imap.mail.yahoo.com", port: 993, security: "ssl" },
    smtp: { host: "smtp.mail.yahoo.com", port: 587, security: "tls" },
  },
];

function inferProviderPreset(email: string): MailProviderPreset | null {
  const domain = email.trim().toLowerCase().split("@")[1] ?? "";
  if (!domain) return null;
  return MAIL_PROVIDER_PRESETS.find((preset) => preset.domains.includes(domain)) ?? null;
}

export function applyProviderConfigFromEmail(
  profile: OpenMailAccountProfile,
  email: string
): OpenMailAccountProfile {
  const preset = inferProviderPreset(email);
  if (!preset) {
    return { ...profile, email };
  }

  return {
    ...profile,
    email,
    imap: {
      ...profile.imap,
      ...preset.imap,
      username: email,
    },
    smtp: {
      ...profile.smtp,
      ...preset.smtp,
      username: email,
    },
  };
}

export function isAccountConfigured(
  profile: OpenMailAccountProfile | null
): profile is OpenMailAccountProfile {
  if (!profile) return false;
  const imapOk =
    Boolean(profile.email?.trim()) &&
    Boolean(profile.imap.host?.trim()) &&
    Boolean(profile.imap.username?.trim()) &&
    Boolean(profile.imap.password);
  const smtpOk =
    Boolean(profile.smtp.host?.trim()) &&
    Boolean(profile.smtp.username?.trim()) &&
    Boolean(profile.smtp.password);
  return imapOk && smtpOk;
}
