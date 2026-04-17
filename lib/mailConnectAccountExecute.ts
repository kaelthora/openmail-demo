import { NextResponse } from "next/server";
import { ImapFlow } from "imapflow";
import nodemailer from "nodemailer";
import {
  emptyAccountProfile,
  type OpenMailAccountProfile,
  type MailTransportSecurity,
} from "@/lib/mailAccountConfig";
import { guardImapFlowClient, imapMailboxOpenOptions } from "@/lib/imapReadOnly";
import { assertNoTrackingUrl } from "@/lib/zeroTracking";

export type MailConnectAccountBody = {
  mode?: "auto" | "manual";
  email?: string;
  password?: string;
  manual?: Partial<OpenMailAccountProfile>;
};

function parseSecurity(socketType: string | undefined): MailTransportSecurity {
  const s = (socketType ?? "").toUpperCase();
  if (s.includes("SSL")) return "ssl";
  if (s.includes("STARTTLS") || s.includes("TLS")) return "tls";
  return "none";
}

function extractDomain(email: string): string {
  return email.trim().toLowerCase().split("@")[1] ?? "";
}

function isGmailAddress(email: string): boolean {
  return email.trim().toLowerCase().endsWith("@gmail.com");
}

function parseServerBlock(xml: string, type: "imap" | "smtp") {
  const rx = new RegExp(
    `<(incomingServer|outgoingServer)[^>]*type="${type}"[^>]*>([\\s\\S]*?)<\\/\\1>`,
    "i"
  );
  const m = xml.match(rx);
  if (!m) return null;
  const body = m[2] ?? "";
  const host = body.match(/<hostname>([^<]+)<\/hostname>/i)?.[1]?.trim() ?? "";
  const port = Number(body.match(/<port>([^<]+)<\/port>/i)?.[1] ?? 0);
  const socketType = body.match(/<socketType>([^<]+)<\/socketType>/i)?.[1];
  const usernameTemplate =
    body.match(/<username>([^<]+)<\/username>/i)?.[1]?.trim() ?? "%EMAILADDRESS%";
  return { host, port, security: parseSecurity(socketType), usernameTemplate };
}

async function resolveAutoConfig(email: string) {
  const domain = extractDomain(email);
  if (!domain) throw new Error("Invalid email domain");
  const autoconfigUrl = `https://autoconfig.thunderbird.net/v1.1/${domain}`;
  assertNoTrackingUrl(autoconfigUrl, "mail-autoconfig");
  const res = await fetch(autoconfigUrl, {
    cache: "no-store",
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error("Provider auto-configuration unavailable");
  const xml = await res.text();
  const imap = parseServerBlock(xml, "imap");
  const smtp = parseServerBlock(xml, "smtp");
  if (!imap || !smtp || !imap.host || !smtp.host || !imap.port || !smtp.port) {
    throw new Error("Provider settings incomplete");
  }
  return {
    imap,
    smtp,
  };
}

function buildProfileFromAuto(
  email: string,
  password: string,
  auto: Awaited<ReturnType<typeof resolveAutoConfig>>
) {
  const profile = emptyAccountProfile();
  const label = email.split("@")[0] || "Primary";
  const imapUser =
    auto.imap.usernameTemplate === "%EMAILLOCALPART%" ? label : email;
  const smtpUser =
    auto.smtp.usernameTemplate === "%EMAILLOCALPART%" ? label : email;
  return {
    ...profile,
    id: `acc-${Date.now()}`,
    label,
    email,
    imap: {
      host: auto.imap.host,
      port: auto.imap.port,
      security: auto.imap.security,
      username: imapUser,
      password,
    },
    smtp: {
      host: auto.smtp.host,
      port: auto.smtp.port,
      security: auto.smtp.security,
      username: smtpUser,
      password,
    },
  } satisfies OpenMailAccountProfile;
}

function buildProfileForGmail(email: string, password: string): OpenMailAccountProfile {
  const profile = emptyAccountProfile();
  const label = email.split("@")[0] || "Primary";
  return {
    ...profile,
    id: `acc-${Date.now()}`,
    label,
    email,
    imap: {
      host: "imap.gmail.com",
      port: 993,
      security: "ssl",
      username: email,
      password,
    },
    smtp: {
      host: "smtp.gmail.com",
      port: 587,
      security: "tls",
      username: email,
      password,
    },
  } satisfies OpenMailAccountProfile;
}

async function verifyImap(account: OpenMailAccountProfile) {
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  const maxAttempts = 2;
  let lastErr: Error | null = null;
  const useGmailConfig = isGmailAddress(account.email);
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const imapConfig = {
      host: useGmailConfig ? "imap.gmail.com" : account.imap.host.trim(),
      port: useGmailConfig ? 993 : account.imap.port,
      secure: useGmailConfig ? true : account.imap.security === "ssl",
      auth: {
        user: account.imap.username.trim(),
        pass: account.imap.password,
      },
      tls: true,
      tlsOptions: {
        rejectUnauthorized: false,
      },
      connTimeout: 10000,
      authTimeout: 10000,
    };
    console.log("IMAP: starting connection", imapConfig.auth.user);
    const client = guardImapFlowClient(
      new ImapFlow({
        host: imapConfig.host,
        port: imapConfig.port,
        secure: imapConfig.secure,
        connectionTimeout: imapConfig.connTimeout,
        greetingTimeout: imapConfig.authTimeout,
        socketTimeout: imapConfig.authTimeout,
        tls: {
          rejectUnauthorized: imapConfig.tlsOptions.rejectUnauthorized,
          servername: imapConfig.host,
        },
        logger: false,
        auth: imapConfig.auth,
      })
    );
    try {
      await client.connect();
      await client.mailboxOpen("INBOX", imapMailboxOpenOptions());
      console.log("IMAP: SUCCESS");
      return;
    } catch (err) {
      console.error("IMAP: ERROR", err);
      lastErr =
        err instanceof Error ? err : new Error("Unknown IMAP connection error");
      if (attempt < maxAttempts) {
        await sleep(1000);
      }
    } finally {
      try {
        await client.logout();
      } catch {
        // ignore logout failures; connection test already concluded
      }
    }
  }
  throw new Error(
    `IMAP connection failed: ${lastErr?.message || "Unknown error"}`
  );
}

async function verifySmtp(account: OpenMailAccountProfile) {
  const transporter = nodemailer.createTransport({
    host: account.smtp.host.trim(),
    port: account.smtp.port,
    secure: account.smtp.security === "ssl",
    requireTLS: account.smtp.security === "tls",
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 10000,
    auth: {
      user: account.smtp.username.trim(),
      pass: account.smtp.password,
    },
  });
  await transporter.verify();
}

export async function executeMailConnectAccountPost(
  body: MailConnectAccountBody
): Promise<Response> {
  try {
    const email = (body.email ?? "").trim();
    const password = (body.password ?? "").replace(/\s/g, "");
    const mode = body.mode ?? "auto";
    console.log("CONNECT:", email);

    if (!email || !password) {
      return NextResponse.json(
        { ok: false, error: "Email and password are required" },
        { status: 400 }
      );
    }

    let account: OpenMailAccountProfile;
    let optimizedMessage: string | undefined;
    if (mode === "manual") {
      const manual = body.manual;
      if (!manual) {
        return NextResponse.json(
          { ok: false, error: "Manual settings are required" },
          { status: 400 }
        );
      }
      const base = emptyAccountProfile();
      account = {
        ...base,
        ...manual,
        id: manual.id || `acc-${Date.now()}`,
        label: manual.label || email.split("@")[0] || "Primary",
        email,
        imap: {
          ...base.imap,
          ...manual.imap,
          username: manual.imap?.username || email,
          password: manual.imap?.password || password,
        },
        smtp: {
          ...base.smtp,
          ...manual.smtp,
          username: manual.smtp?.username || email,
          password: manual.smtp?.password || password,
        },
      };
    } else {
      if (isGmailAddress(email)) {
        account = buildProfileForGmail(email, password);
        optimizedMessage = "Using optimized Gmail connection";
      } else {
        const auto = await resolveAutoConfig(email);
        account = buildProfileFromAuto(email, password, auto);
      }
    }

    await verifyImap(account);
    try {
      await verifySmtp(account);
    } catch {
      console.warn(
        "[connect] SMTP verification failed but IMAP succeeded — allowing connection"
      );
    }
    return NextResponse.json({ ok: true, account, message: optimizedMessage });
  } catch (e) {
    const raw = e instanceof Error ? e.message : "Could not connect";
    console.error("IMAP: ERROR", raw);
    return NextResponse.json({ ok: false, error: raw }, { status: 500 });
  }
}
