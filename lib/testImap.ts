import { ImapFlow } from "imapflow";
import { guardImapFlowClient, imapMailboxOpenOptions } from "@/lib/imapReadOnly";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function testImap(
  email: string,
  password: string,
  maxAttempts = 2
) {
  let lastErr: Error | null = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const imapConfig = {
      host: "imap.gmail.com",
      port: 993,
      secure: true,
      auth: {
        user: email,
        pass: password,
      },
      tls: true,
      tlsOptions: {
        rejectUnauthorized: false,
      },
      connTimeout: 10000,
      authTimeout: 10000,
    };
    console.log("IMAP TEST:", email);
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
        // ignore cleanup failures
      }
    }
  }

  throw new Error(`IMAP connection failed: ${lastErr?.message || "Unknown error"}`);
}
