import type { ImapFlow, MailboxOpenOptions } from "imapflow";

function parseEnvBool(name: string, defaultValue: boolean): boolean {
  const v = process.env[name]?.trim().toLowerCase();
  if (v === "true" || v === "1" || v === "yes") return true;
  if (v === "false" || v === "0" || v === "no") return false;
  return defaultValue;
}

/**
 * When false (default), OpenMail must not mutate mailbox state via IMAP (flags, move, delete, append).
 * Set `OPENMAIL_IMAP_WRITE=true` only if you explicitly allow IMAP writes (e.g. append copy to Sent).
 */
export const ALLOW_IMAP_WRITE = parseEnvBool("OPENMAIL_IMAP_WRITE", false);

/** Strict default: true. Use EXAMINE (read-only) for fetch/sync/watch when supported. */
export const IMAP_READ_ONLY = !ALLOW_IMAP_WRITE;

const IMAP_WRITE_METHODS = new Set([
  "append",
  "messageCopy",
  "messageDelete",
  "messageFlagsAdd",
  "messageFlagsRemove",
  "messageFlagsSet",
  "messageMove",
  "setFlagColor",
  "mailboxCreate",
  "mailboxRename",
  "mailboxDelete",
  "mailboxSubscribe",
  "mailboxUnsubscribe",
]);

const BLOCK_MSG = "IMAP WRITE BLOCKED: Read-only mode enabled";

/**
 * Call before any IMAP operation that mutates server mailbox/message state.
 * Throws when {@link IMAP_READ_ONLY} is true (default).
 */
export function assertImapWriteAllowed(operation?: string): void {
  if (!IMAP_READ_ONLY) return;
  const err = new Error(BLOCK_MSG);
  if (process.env.NODE_ENV !== "production") {
    console.warn("[openmail] Blocked IMAP write [redacted]");
  }
  throw err;
}

/**
 * When read-only mode is on, wraps an ImapFlow so mutating methods throw via {@link assertImapWriteAllowed}.
 * Opening a mailbox with `readOnly: false` is also blocked.
 */
export function guardImapFlowClient(client: ImapFlow): ImapFlow {
  if (!IMAP_READ_ONLY) {
    return client;
  }
  return new Proxy(client, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof prop !== "string") {
        return value;
      }

      if (prop === "mailboxOpen" || prop === "getMailboxLock") {
        if (typeof value !== "function") return value;
        return (...args: unknown[]) => {
          const opts = args[1] as MailboxOpenOptions | undefined;
          if (opts?.readOnly === false) {
            assertImapWriteAllowed(`${prop}(readOnly:false)`);
          }
          return (value as (...a: unknown[]) => unknown).apply(target, args);
        };
      }

      if (IMAP_WRITE_METHODS.has(prop) && typeof value === "function") {
        return (...args: unknown[]) => {
          assertImapWriteAllowed(`ImapFlow.${prop}`);
          return (value as (...a: unknown[]) => unknown).apply(target, args);
        };
      }

      return value;
    },
  }) as ImapFlow;
}

/** Passed to ImapFlow `mailboxOpen` / `getMailboxLock` so the session is READ-ONLY when enforced. */
export function imapMailboxOpenOptions(): MailboxOpenOptions {
  return IMAP_READ_ONLY ? { readOnly: true } : {};
}
