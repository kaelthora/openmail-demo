"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import type { MailItem } from "@/lib/mailTypes";
import type { OpenMailAccountProfile } from "@/lib/mailAccountConfig";
import { isAccountConfigured } from "@/lib/mailAccountConfig";
import {
  saveStoredAccount,
  clearStoredAccount,
} from "@/lib/mailAccountStorage";
import { extractEmail } from "@/lib/mailAddress";
import type { EmailListItem } from "@/lib/emailListTypes";
import { emailApiItemToMailItem } from "@/lib/mapEmailApiToMailItem";
import { OPENMAIL_DEMO_MODE } from "@/lib/openmailDemo";
import { OPENMAIL_DEMO_MAIL_ITEMS } from "@/lib/openmailDemoMails";
import type {
  ServerInboxScope,
  ServerMailAccountSummary,
} from "@/lib/serverInboxTypes";

const INBOX_SCOPE_KEY = "openmail-inbox-scope-v1";

export type { ServerInboxScope, ServerMailAccountSummary };

export type MailStoreValue = {
  mails: MailItem[];
  setMails: Dispatch<SetStateAction<MailItem[]>>;
  selectedMailId: string;
  setSelectedMailId: Dispatch<SetStateAction<string>>;
  mailsHydrated: boolean;
  mailsLoading: boolean;
  mailsFetchError: string | null;
  refreshMailsFromApi: (opts?: {
    silent?: boolean;
  }) => Promise<{ ok: boolean; error?: string }>;
  /** Prisma-backed mailboxes */
  serverMailAccounts: ServerMailAccountSummary[];
  inboxScope: ServerInboxScope;
  setInboxScopePersist: (scope: ServerInboxScope) => void;
  /** POST `/api/emails/sync` for the active `inboxScope` */
  syncServerInbox: () => Promise<{ ok: boolean; error?: string }>;
  account: OpenMailAccountProfile | null;
  accountHydrated: boolean;
  accountConnected: boolean;
  saveAccount: (profile: OpenMailAccountProfile) => void;
  disconnectAccount: () => void;
  syncFromImap: () => Promise<{ ok: boolean; error?: string }>;
  isSyncing: boolean;
  syncError: string | null;
  clearSyncError: () => void;
  markMailRead: (id: string) => void;
  softDeleteMail: (id: string) => void;
  sendReplyMail: (id: string, replyBody: string) => Promise<void>;
  mockScheduleMail: (id: string) => void;
};

const MailStoreContext = createContext<MailStoreValue | null>(null);

export default function MailStoreProvider({ children }: { children: ReactNode }) {
  const [mails, setMails] = useState<MailItem[]>([]);
  const [selectedMailId, setSelectedMailId] = useState("");
  const [mailsHydrated] = useState(true);
  const [account, setAccount] = useState<OpenMailAccountProfile | null>(null);
  const [accountHydrated] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [mailsLoading, setMailsLoading] = useState(!OPENMAIL_DEMO_MODE);
  const [mailsFetchError, setMailsFetchError] = useState<string | null>(null);
  const [serverMailAccounts, setServerMailAccounts] = useState<
    ServerMailAccountSummary[]
  >([]);
  const [inboxScope, setInboxScope] = useState<ServerInboxScope>("legacy");

  const mailsRef = useRef(mails);
  mailsRef.current = mails;

  const refreshMailsFromApi = useCallback(async (opts?: { silent?: boolean }) => {
    if (OPENMAIL_DEMO_MODE) return { ok: true };
    const silent = opts?.silent === true;
    if (!silent) {
      setMailsFetchError(null);
      setMailsLoading(true);
    }
    try {
      const q =
        inboxScope === "legacy"
          ? "?legacy=1"
          : `?accountId=${encodeURIComponent(inboxScope)}`;
      const res = await fetch(`/api/emails${q}`, { cache: "no-store" });
      const data = (await res.json()) as {
        emails?: EmailListItem[];
        error?: string;
      };
      if (!res.ok) {
        const msg = data.error || "Could not load messages";
        if (!silent) setMailsFetchError(msg);
        return { ok: false, error: msg };
      }
      const incoming = (data.emails ?? []).map(emailApiItemToMailItem);
      setMails((prev) => {
        const rest = prev.filter((m) => m.folder !== "inbox");
        return [...incoming, ...rest];
      });
      setSelectedMailId((sel) => {
        if (sel && incoming.some((m) => m.id === sel)) return sel;
        const first = incoming.find((m) => !m.deleted);
        return first?.id ?? "";
      });
      return { ok: true };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not load messages";
      if (!silent) setMailsFetchError(msg);
      return { ok: false, error: msg };
    } finally {
      if (!silent) setMailsLoading(false);
    }
  }, [inboxScope]);

  const setInboxScopePersist = useCallback((scope: ServerInboxScope) => {
    try {
      sessionStorage.setItem(INBOX_SCOPE_KEY, scope);
    } catch {
      /* private mode */
    }
    setInboxScope(scope);
  }, []);

  const syncServerInbox = useCallback(async () => {
    if (OPENMAIL_DEMO_MODE) return { ok: true };
    try {
      const body =
        inboxScope === "legacy" ? {} : { accountId: inboxScope };
      const res = await fetch("/api/emails/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const sj = (await res.json()) as { success?: boolean; error?: string };
      if (!res.ok || sj.success === false) {
        return { ok: false, error: sj.error || "Server sync failed" };
      }
      return { ok: true };
    } catch {
      return { ok: false, error: "Could not reach sync endpoint" };
    }
  }, [inboxScope]);

  /** Clean boot: demo seeds static inbox; otherwise resolve inbox scope then list loads via effect. */
  useEffect(() => {
    clearStoredAccount();
    setAccount(null);
    setSyncError(null);
    setMailsFetchError(null);
    if (OPENMAIL_DEMO_MODE) {
      setMailsLoading(false);
      setMails(OPENMAIL_DEMO_MAIL_ITEMS);
      setSelectedMailId("");
      return;
    }
    setMails([]);
    setSelectedMailId("");
    void (async () => {
      try {
        const r = await fetch("/api/accounts");
        const j = (await r.json()) as {
          accounts?: ServerMailAccountSummary[];
        };
        const list = j.accounts ?? [];
        setServerMailAccounts(list);
        let saved: string | null = null;
        try {
          saved = sessionStorage.getItem(INBOX_SCOPE_KEY);
        } catch {
          saved = null;
        }
        let next: ServerInboxScope = "legacy";
        if (saved === "legacy") next = "legacy";
        else if (saved && list.some((x) => x.id === saved)) next = saved;
        else if (list.length > 0) next = list[0].id;
        setInboxScope(next);
      } catch {
        setServerMailAccounts([]);
        setInboxScope("legacy");
      }
    })();
  }, []);

  useEffect(() => {
    if (OPENMAIL_DEMO_MODE) return;
    void refreshMailsFromApi();
  }, [inboxScope, refreshMailsFromApi]);

  /** Server push when IMAP watcher ingests new mail (SSE). */
  useEffect(() => {
    if (OPENMAIL_DEMO_MODE) return;
    const es = new EventSource("/api/emails/events");
    es.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data as string) as { type?: string; inserted?: number };
        if (data.type === "new_mail" && (data.inserted ?? 0) > 0) {
          void refreshMailsFromApi({ silent: true });
        }
      } catch {
        /* ignore malformed */
      }
    };
    return () => es.close();
  }, [refreshMailsFromApi]);

  const accountConnected = isAccountConfigured(account);

  const clearSyncError = useCallback(() => setSyncError(null), []);

  const saveAccount = useCallback((profile: OpenMailAccountProfile) => {
    saveStoredAccount(profile);
    setAccount(profile);
  }, []);

  const disconnectAccount = useCallback(() => {
    clearStoredAccount();
    setAccount(null);
    setSyncError(null);
    if (OPENMAIL_DEMO_MODE) {
      setMails(OPENMAIL_DEMO_MAIL_ITEMS);
      setSelectedMailId("");
      return;
    }
    void refreshMailsFromApi();
  }, [refreshMailsFromApi]);

  const markMailRead = useCallback((id: string) => {
    setMails((prev) => {
      const cur = prev.find((m) => m.id === id);
      if (!cur || cur.read !== false) return prev;
      return prev.map((m) => (m.id === id ? { ...m, read: true } : m));
    });
  }, []);

  const softDeleteMail = useCallback((id: string) => {
    setMails((prev) => prev.map((m) => (m.id === id ? { ...m, deleted: true } : m)));
  }, []);

  const syncFromImap = useCallback(async () => {
    if (OPENMAIL_DEMO_MODE) {
      setSyncError(null);
      return { ok: true };
    }
    if (!account || !isAccountConfigured(account)) {
      const msg = "Add a complete account first.";
      setSyncError(msg);
      return { ok: false, error: msg };
    }
    setIsSyncing(true);
    setSyncError(null);
    try {
      const res = await fetch("/api/mail/imap-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account }),
      });
      const data = (await res.json()) as {
        messages?: MailItem[];
        error?: string;
      };
      if (!res.ok) {
        const msg = data.error || "IMAP sync failed";
        setSyncError(msg);
        return { ok: false, error: msg };
      }
      const incoming = data.messages ?? [];
      setMails((prev) => {
        const rest = prev.filter((m) => m.folder !== "inbox");
        return [...rest, ...incoming];
      });
      setSelectedMailId((sel) => {
        if (sel && incoming.some((m) => m.id === sel)) return sel;
        const first = incoming.find((m) => !m.deleted);
        return first?.id ?? sel;
      });
      return { ok: true };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "IMAP sync failed";
      setSyncError(msg);
      return { ok: false, error: msg };
    } finally {
      setIsSyncing(false);
    }
  }, [account]);

  const sendReplyMail = useCallback(
    async (id: string, replyBody: string) => {
      const demoSender = "you@openmail.demo";
      const trimmed = replyBody.trim();
      const src = mailsRef.current.find((m) => m.id === id);
      if (!src) return;

      const to =
        extractEmail(src.sender ?? "") ||
        extractEmail(src.title ?? "") ||
        src.sender?.trim() ||
        "";
      if (!to.includes("@")) {
        throw new Error("Could not determine recipient address");
      }

      const subject = src.subject.startsWith("Re:")
        ? src.subject
        : `Re: ${src.subject}`;

      const sendOverNetwork =
        !OPENMAIL_DEMO_MODE || isAccountConfigured(account);
      if (sendOverNetwork) {
        const payload: Record<string, string> = {
          to,
          subject,
          body: trimmed || " ",
        };
        if (inboxScope !== "legacy") {
          payload.accountId = inboxScope;
        }
        const res = await fetch("/api/emails/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        let data: { success?: boolean; error?: string } = {};
        try {
          data = (await res.json()) as typeof data;
        } catch {
          throw new Error("Invalid response from server");
        }
        if (!res.ok || data.success !== true) {
          throw new Error(data.error || "Send failed");
        }
      }

      const sentId = `sent-${Date.now()}`;
      const preview =
        trimmed.length > 120 ? `${trimmed.slice(0, 117)}...` : trimmed || "(empty)";
      const sent: MailItem = {
        id: sentId,
        folder: "sent",
        read: true,
        title: "You",
        sender: isAccountConfigured(account)
          ? account!.email.trim()
          : demoSender,
        subject,
        preview,
        content: trimmed || "(no body)",
        aiPreview: "Sent message",
        confidence: Math.min(99, src.confidence),
        needsReply: false,
        deleted: false,
        date: new Date().toISOString(),
        x: 50,
        y: 40,
      };

      setMails((prev) =>
        prev
          .map((m) => (m.id === id ? { ...m, read: true, needsReply: false } : m))
          .concat(sent)
      );
    },
    [account, inboxScope]
  );

  const mockScheduleMail = useCallback((id: string) => {
    setMails((prev) =>
      prev.map((m) => (m.id === id ? { ...m, scheduled: true } : m))
    );
  }, []);

  const value = useMemo<MailStoreValue>(
    () => ({
      mails,
      setMails,
      selectedMailId,
      setSelectedMailId,
      mailsHydrated,
      mailsLoading,
      mailsFetchError,
      refreshMailsFromApi,
      serverMailAccounts,
      inboxScope,
      setInboxScopePersist,
      syncServerInbox,
      account,
      accountHydrated,
      accountConnected,
      saveAccount,
      disconnectAccount,
      syncFromImap,
      isSyncing,
      syncError,
      clearSyncError,
      markMailRead,
      softDeleteMail,
      sendReplyMail,
      mockScheduleMail,
    }),
    [
      mails,
      selectedMailId,
      mailsHydrated,
      mailsLoading,
      mailsFetchError,
      refreshMailsFromApi,
      serverMailAccounts,
      inboxScope,
      setInboxScopePersist,
      syncServerInbox,
      account,
      accountHydrated,
      accountConnected,
      saveAccount,
      disconnectAccount,
      syncFromImap,
      isSyncing,
      syncError,
      clearSyncError,
      markMailRead,
      softDeleteMail,
      sendReplyMail,
      mockScheduleMail,
    ]
  );

  return (
    <MailStoreContext.Provider value={value}>{children}</MailStoreContext.Provider>
  );
}

export function useMailStore() {
  const ctx = useContext(MailStoreContext);
  if (!ctx) {
    throw new Error("useMailStore must be used within MailStoreProvider");
  }
  return ctx;
}
