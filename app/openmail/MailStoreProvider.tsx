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
import { OPENMAIL_DEMO_MODE } from "@/lib/openmailDemo";
import { OPENMAIL_DEMO_MAIL_ITEMS } from "@/lib/openmailDemoMails";

export type MailStoreValue = {
  mails: MailItem[];
  setMails: Dispatch<SetStateAction<MailItem[]>>;
  selectedMailId: string;
  setSelectedMailId: Dispatch<SetStateAction<string>>;
  mailsHydrated: boolean;
  account: OpenMailAccountProfile | null;
  accountHydrated: boolean;
  accountConnected: boolean;
  saveAccount: (profile: OpenMailAccountProfile) => void;
  disconnectAccount: () => void;
  syncFromImap: () => Promise<void>;
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

  const mailsRef = useRef(mails);
  mailsRef.current = mails;

  /** Clean boot: demo seeds static inbox; otherwise empty and no restored session. */
  useEffect(() => {
    clearStoredAccount();
    setAccount(null);
    setMails(OPENMAIL_DEMO_MODE ? OPENMAIL_DEMO_MAIL_ITEMS : []);
    setSelectedMailId("");
    setSyncError(null);
  }, []);

  const accountConnected = isAccountConfigured(account);

  const clearSyncError = useCallback(() => setSyncError(null), []);

  const saveAccount = useCallback((profile: OpenMailAccountProfile) => {
    saveStoredAccount(profile);
    setAccount(profile);
  }, []);

  const disconnectAccount = useCallback(() => {
    clearStoredAccount();
    setAccount(null);
    setMails(OPENMAIL_DEMO_MODE ? OPENMAIL_DEMO_MAIL_ITEMS : []);
    setSelectedMailId("");
    setSyncError(null);
  }, []);

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
      return;
    }
    if (!account || !isAccountConfigured(account)) {
      setSyncError("Add a complete account first.");
      return;
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
        throw new Error(data.error || "Sync failed");
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
    } catch (e) {
      setSyncError(e instanceof Error ? e.message : "Sync failed");
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
        if (!isAccountConfigured(account)) {
          throw new Error("No account connected");
        }
        const res = await fetch("/api/mail/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            account: account!,
            to,
            subject,
            text: trimmed || " ",
            inReplyTo: src.rfc822MessageId,
          }),
        });

        const data = (await res.json()) as { error?: string };
        if (!res.ok) {
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
    [account]
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
