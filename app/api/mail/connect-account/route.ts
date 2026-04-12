import { NextResponse } from "next/server";
import { ImapFlow } from "imapflow";
import nodemailer from "nodemailer";
import {
  emptyAccountProfile,
  type OpenMailAccountProfile,
  type MailTransportSecurity,
} from "@/lib/mailAccountConfig";
import { guardImapFlowClient, imapMailboxOpenOptions } from "@/lib/imapReadOnly";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ConnectBody = {
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
  const usernameTemplate = body.match(/<username>([^<]+)<\/username>/i)?.[1]?.trim() ?? "%EMAILADDRESS%";
  return { host, port, security: parseSecurity(socketType), usernameTemplate };
}

async function resolveAutoConfig(email: string) {
  const domain = extractDomain(email);
  if (!domain) throw new Error("Invalid email domain");
  const res = await fetch(`https://autoconfig.thunderbird.net/v1.1/${domain}`, {
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

function buildProfileFromAuto(email: string, password: string, auto: Awaited<ReturnType<typeof resolveAutoConfig>>) {
  const profile = emptyAccountProfile();
  const label = email.split("@")[0] || "Primary";
  const imapUser =
    auto.imap.usernameTemplate === "%EMAILLOCALPART%"
      ? label
      : email;
  const smtpUser =
    auto.smtp.usernameTemplate === "%EMAILLOCALPART%"
      ? label
      : email;
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

async function verifyImap(account: OpenMailAccountProfile) {
  console.log("[connect-account] IMAP EMAIL:", account.email);
  console.log("[connect-account] IMAP CONFIG:", {
    host: account.imap.host,
    port: account.imap.port,
    secure: account.imap.security === "ssl",
    security: account.imap.security,
    username: account.imap.username,
  });
  const client = guardImapFlowClient(
    new ImapFlow({
      host: account.imap.host.trim(),
      port: account.imap.port,
      secure: account.imap.security === "ssl",
      connectionTimeout: 10000,
      socketTimeout: 10000,
      tls: account.imap.security === "tls" ? {} : undefined,
      logger: false,
      auth: {
        user: account.imap.username.trim(),
        pass: account.imap.password,
      },
    })
  );
  try {
    await client.connect();
    await client.mailboxOpen("INBOX", imapMailboxOpenOptions());
  } finally {
    try {
      await client.logout();
    } catch {
      // ignore logout failures; connection test already concluded
    }
  }
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

export async function POST(request: Request) {
  console.log("=== CONNECT ACCOUNT START ===");
  try {
    console.log("[connect-account] API HIT");
    let body: ConnectBody;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { ok: false, error: "Invalid request body" },
        { status: 400 }
      );
    }

    const email = (body.email ?? "").trim();
    const password = body.password ?? "";
    const mode = body.mode ?? "auto";

    if (!email || !password) {
      return NextResponse.json(
        { ok: false, error: "Email and password are required" },
        { status: 400 }
      );
    }

    let account: OpenMailAccountProfile;
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
      const auto = await resolveAutoConfig(email);
      account = buildProfileFromAuto(email, password, auto);
    }

    console.log("[connect-account] CONNECTING...");
    await verifyImap(account);
    console.log("[connect-account] CONNECTED SUCCESS");
    await verifySmtp(account);
    return NextResponse.json({ ok: true, account });
  } catch (e) {
    console.error("=== IMAP ERROR ===");
    console.error(e);
    if (e instanceof Error) {
      console.error("MESSAGE:", e.message);
      console.error("STACK:", e.stack);
    } else {
      console.error("MESSAGE:", String(e));
    }
    const raw = e instanceof Error ? e.message : "Could not connect";
    const lower = raw.toLowerCase();
    const friendly = lower.includes("auth")
      ? "Authentication failed. Check your email and password."
      : lower.includes("timeout")
        ? "Server timeout. Check host/port and network."
        : lower.includes("certificate") || lower.includes("tls")
          ? "Secure connection failed. Verify security mode and ports."
          : "Connection failed. Verify your provider settings.";
    return NextResponse.json({ ok: false, error: friendly }, { status: 500 });
  }
}

