import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import type { SmtpAccountConfig } from "@/lib/mailAccountConfig";

const GMAIL_SMTP_HOST = "smtp.gmail.com";
const GMAIL_SMTP_PORT = 465;

const globalForSmtp = globalThis as typeof globalThis & {
  __gmailSmtpTransporter?: Transporter;
};

export type SendEmailParams = {
  to: string;
  subject: string;
  text: string;
};

function requireSmtpCredentials(): { user: string; pass: string } {
  const user = process.env.EMAIL_USER?.trim();
  const pass = process.env.EMAIL_PASS?.trim();
  if (!user || !pass) {
    throw new Error("SMTP is not configured: set EMAIL_USER and EMAIL_PASS");
  }
  return { user, pass };
}

function createGmailTransporter(): Transporter {
  const { user, pass } = requireSmtpCredentials();
  return nodemailer.createTransport({
    host: GMAIL_SMTP_HOST,
    port: GMAIL_SMTP_PORT,
    secure: true,
    auth: { user, pass },
    pool: true,
    maxConnections: 2,
    maxMessages: 100,
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 60_000,
  });
}

/**
 * Reuses one pooled transporter in production to avoid extra TLS handshakes.
 * Dev rebuilds per call so credential changes apply without a stale singleton.
 */
function getTransporter(): Transporter {
  if (process.env.NODE_ENV !== "production") {
    return createGmailTransporter();
  }
  globalForSmtp.__gmailSmtpTransporter ??= createGmailTransporter();
  return globalForSmtp.__gmailSmtpTransporter;
}

const LOOSE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function assertValidRecipient(to: string): void {
  if (!LOOSE_EMAIL.test(to)) {
    throw new Error("Invalid recipient email address");
  }
}

/**
 * Sends a plain-text message via Gmail SMTP (App Password when 2FA is on).
 */
export async function sendEmail(params: SendEmailParams): Promise<void> {
  const to = params.to?.trim();
  if (!to) {
    throw new Error("Recipient (to) is required");
  }
  assertValidRecipient(to);

  const subject = params.subject?.trim() ?? "";
  const text = params.text ?? "";

  const { user } = requireSmtpCredentials();
  const transporter = getTransporter();

  await transporter.sendMail({
    from: user,
    to,
    subject: subject || "(no subject)",
    text,
  });
}

/** One-off send using a saved account (not the env Gmail pool). */
export async function sendEmailWithSmtpAccount(
  smtp: SmtpAccountConfig,
  params: SendEmailParams
): Promise<void> {
  const to = params.to?.trim();
  if (!to) {
    throw new Error("Recipient (to) is required");
  }
  assertValidRecipient(to);

  const subject = params.subject?.trim() ?? "";
  const text = params.text ?? "";

  const user = smtp.username.trim();
  if (!user.includes("@")) {
    throw new Error("SMTP username must be an email address for the From header");
  }

  const secure = smtp.security === "ssl";
  const transporter = nodemailer.createTransport({
    host: smtp.host.trim(),
    port: smtp.port,
    secure,
    requireTLS: smtp.security === "tls",
    auth: { user, pass: smtp.password },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 60_000,
  });

  await transporter.sendMail({
    from: user,
    to,
    subject: subject || "(no subject)",
    text,
  });
}
