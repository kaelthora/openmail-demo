import type { ImapFlow } from "imapflow";
import { ingestFetchedEmails } from "@/lib/emailIngest";
import { emitMailRealtime } from "@/lib/mailRealtimeHub";
import {
  createEnvImapClient,
  fetchSequenceRangeFromOpenMailbox,
  GMAIL_INBOX_PATH,
  imapCredentialsConfigured,
} from "@/lib/imap";

const g = globalThis as typeof globalThis & {
  __openmailImapWatchStarted?: boolean;
};

const POLL_MS = 75_000;
const MAX_BACKOFF_MS = 120_000;
const INITIAL_BACKOFF_MS = 4000;

function realtimeEnabled(): boolean {
  return process.env.EMAIL_REALTIME !== "false";
}

async function safeLogout(client: ImapFlow): Promise<void> {
  try {
    await client.logout();
  } catch {
    /* already closed */
  }
}

async function ingestSequenceRange(
  client: ImapFlow,
  startSeq: number,
  endSeq: number,
  lastSeenRef: { current: number }
): Promise<void> {
  if (endSeq < startSeq || startSeq < 1) return;
  const fetched = await fetchSequenceRangeFromOpenMailbox(client, startSeq, endSeq);
  await ingestFetchedEmails(fetched, { accountId: null });
  lastSeenRef.current = Math.max(lastSeenRef.current, endSeq);
}

async function oneImapSession(): Promise<void> {
  const client = createEnvImapClient();
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  const lastSeen = { current: 0 };
  let chain: Promise<void> = Promise.resolve();

  const enqueue = (fromSeq: number, toSeq: number) => {
    chain = chain
      .then(() => ingestSequenceRange(client, fromSeq, toSeq, lastSeen))
      .catch((err) => {
        console.error("[openmail] realtime ingest:", err);
      });
  };

  await client.connect();
  await client.mailboxOpen(GMAIL_INBOX_PATH);
  const mb = client.mailbox;
  if (mb === false || !mb.exists) {
    await safeLogout(client);
    return;
  }
  lastSeen.current = mb.exists;

  emitMailRealtime({
    type: "imap_status",
    state: "connected",
    detail: `INBOX messages=${mb.exists}`,
  });

  const onExists = (data: { prevCount: number; count: number }) => {
    if (data.count > data.prevCount) {
      enqueue(data.prevCount + 1, data.count);
    } else {
      lastSeen.current = data.count;
    }
  };

  client.on("exists", onExists);

  pollTimer = setInterval(() => {
    void (async () => {
      try {
        if (!client.usable) return;
        const st = await client.status(GMAIL_INBOX_PATH, { messages: true });
        const cnt = st.messages;
        if (typeof cnt !== "number" || cnt <= lastSeen.current) return;
        enqueue(lastSeen.current + 1, cnt);
      } catch (e) {
        console.warn("[openmail] IMAP poll:", e);
      }
    })();
  }, POLL_MS);

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const settle = (err?: Error) => {
      if (settled) return;
      settled = true;
      client.removeListener("exists", onExists);
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
      if (err) reject(err);
      else resolve();
    };
    client.once("close", () => settle());
    client.once("error", (e: unknown) =>
      settle(e instanceof Error ? e : new Error(String(e)))
    );
  });

  await chain;
  await safeLogout(client);
}

async function runWatchLoop(): Promise<void> {
  let backoff = INITIAL_BACKOFF_MS;
  for (;;) {
    try {
      emitMailRealtime({
        type: "imap_status",
        state: "reconnecting",
        detail: backoff > INITIAL_BACKOFF_MS ? `retry in ${backoff}ms` : "connecting",
      });
      await oneImapSession();
      backoff = INITIAL_BACKOFF_MS;
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      console.warn("[openmail] IMAP watch:", detail);
      emitMailRealtime({
        type: "imap_status",
        state: "reconnecting",
        detail,
      });
      await new Promise((r) => setTimeout(r, backoff));
      backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
    }
  }
}

/**
 * Starts a single long-lived Gmail INBOX connection (IDLE via ImapFlow EXISTS)
 * with polling fallback. Reconnects with exponential backoff if the session drops.
 *
 * No-op when `EMAIL_USER` / `EMAIL_PASS` are missing or `EMAIL_REALTIME=false`.
 * Safe to call multiple times (singleton).
 */
export function startImapRealtimeWatch(): void {
  if (g.__openmailImapWatchStarted) return;
  if (!realtimeEnabled() || !imapCredentialsConfigured()) return;
  g.__openmailImapWatchStarted = true;
  void runWatchLoop();
}
