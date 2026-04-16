import type {
  ImapAccountConfig,
  MailTransportSecurity,
  SmtpAccountConfig,
} from "@/lib/mailAccountConfig";

function asSecurity(v: unknown): MailTransportSecurity {
  if (v === "ssl" || v === "tls" || v === "none") return v;
  return "ssl";
}

export function parseImapConfigJson(value: unknown): ImapAccountConfig | null {
  if (!value || typeof value !== "object") return null;
  const o = value as Record<string, unknown>;
  const host = typeof o.host === "string" ? o.host.trim() : "";
  const port = typeof o.port === "number" && o.port > 0 ? o.port : 0;
  const username = typeof o.username === "string" ? o.username.trim() : "";
  const password = typeof o.password === "string" ? o.password : "";
  if (!host || !port || !username || !password) return null;
  return {
    host,
    port,
    username,
    password,
    security: asSecurity(o.security),
  };
}

export function parseSmtpConfigJson(value: unknown): SmtpAccountConfig | null {
  if (!value || typeof value !== "object") return null;
  const o = value as Record<string, unknown>;
  const host = typeof o.host === "string" ? o.host.trim() : "";
  const port = typeof o.port === "number" && o.port > 0 ? o.port : 0;
  const username = typeof o.username === "string" ? o.username.trim() : "";
  const password = typeof o.password === "string" ? o.password : "";
  if (!host || !port || !username || !password) return null;
  return {
    host,
    port,
    username,
    password,
    security: asSecurity(o.security),
  };
}

/** True when the address is hosted on Gmail / Google Mail. */
export function isGmailDomainEmail(email: string): boolean {
  const d = email.trim().toLowerCase().split("@")[1] ?? "";
  return d === "gmail.com" || d === "googlemail.com";
}

export function inferProviderLabel(email: string): string | null {
  const d = email.trim().toLowerCase().split("@")[1] ?? "";
  if (!d) return null;
  if (d === "gmail.com" || d === "googlemail.com") return "gmail";
  if (
    d === "outlook.com" ||
    d === "hotmail.com" ||
    d === "live.com" ||
    d.endsWith(".onmicrosoft.com")
  ) {
    return "outlook";
  }
  if (d.includes("yahoo")) return "yahoo";
  return "custom";
}
