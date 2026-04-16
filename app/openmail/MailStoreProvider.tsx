"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import type { MailItem, OpenmailSmartFolderId } from "@/lib/mailTypes";
import type { OpenMailAccountProfile } from "@/lib/mailAccountConfig";
import { isAccountConfigured } from "@/lib/mailAccountConfig";
import {
  saveStoredAccount,
  clearStoredAccount,
  loadStoredAccount,
  loadAccountSession,
  saveAccountSession,
} from "@/lib/mailAccountStorage";
import { extractEmail } from "@/lib/mailAddress";
import type { EmailListItem } from "@/lib/emailListTypes";
import { emailApiItemToMailItem } from "@/lib/mapEmailApiToMailItem";
import { OPENMAIL_DEMO_MODE } from "@/lib/openmailDemo";
import { OPENMAIL_DEMO_MAIL_ITEMS } from "@/lib/openmailDemoMails";
import { guardianEvaluate } from "@/lib/guardianEngine";
import { useGuardianIntercept } from "./GuardianInterceptProvider";
import { useGuardianTrace } from "./GuardianTraceProvider";
import type {
  ServerInboxScope,
  ServerMailAccountSummary,
} from "@/lib/serverInboxTypes";
import {
  isAccountNotFoundInboxMessage,
  isLegacyImapEnvMissingMessage,
} from "@/lib/legacyImapEnvMissing";
import { useOpenmailPreferences } from "./OpenmailPreferencesProvider";
import { inboxDiag } from "@/lib/openmailInboxDiag";

const INBOX_SCOPE_KEY = "openmail-inbox-scope-v1";
const INBOX_CACHE_KEY = "openmail-inbox-cache-v1";
const INBOX_CACHE_KEY_ALT = "openmail-inbox-cache";

/** Survives React Strict Mode remount so hydrate log fires once per tab load. */
let inboxHydrateDiagModuleLogged = false;

let latestRequestId = 0;

type InboxSessionCache = {
  mails: MailItem[];
  selectedMailId: string;
  inboxScope: ServerInboxScope;
};

function loadInboxSessionCache(): InboxSessionCache | null {
  if (typeof window === "undefined") return null;
  for (const key of [INBOX_CACHE_KEY, INBOX_CACHE_KEY_ALT]) {
    try {
      const raw = sessionStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as Partial<InboxSessionCache>;
      if (!parsed || !Array.isArray(parsed.mails)) continue;
      const selected =
        typeof parsed.selectedMailId === "string" ? parsed.selectedMailId : "";
      const scope =
        typeof parsed.inboxScope === "string" && parsed.inboxScope.length > 0
          ? (parsed.inboxScope as ServerInboxScope)
          : "legacy";
      return { mails: parsed.mails, selectedMailId: selected, inboxScope: scope };
    } catch {
      /* try next key */
    }
  }
  return null;
}

/** After loading `/api/accounts`, keep scope valid so mail fetch never uses a removed id. */
function reconcileInboxScopeAfterAccountListLoad(
  prev: ServerInboxScope,
  list: ServerMailAccountSummary[]
): ServerInboxScope {
  if (list.length === 0) return "legacy";
  if (prev === "legacy") return "legacy";
  if (list.some((a) => a.id === prev)) return prev;
  return list[0]!.id;
}

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
    /** When set, load this inbox without waiting for `inboxScope` state (e.g. Settings). */
    accountId?: ServerInboxScope;
  }) => Promise<{ ok: boolean; error?: string; setupRequired?: boolean }>;
  /** Legacy inbox with no `EMAIL_*` env — show connect-mailbox UI (no saved Prisma accounts). */
  inboxSetupRequired: boolean;
  /** Prisma-backed mailboxes */
  serverMailAccounts: ServerMailAccountSummary[];
  inboxScope: ServerInboxScope;
  setInboxScopePersist: (scope: ServerInboxScope) => void;
  /** POST `/api/emails/sync` after `GET /api/mail/fetch` for the active `inboxScope`, or `accountId` when provided. */
  syncServerInbox: (opts?: {
    accountId?: ServerInboxScope;
  }) => Promise<{ ok: boolean; error?: string }>;
  /** Reload `/api/accounts` (e.g. after add/remove in Settings). */
  refreshServerAccounts: () => Promise<{ ok: boolean; error?: string }>;
  /** DELETE Prisma account, refresh list, and fix `inboxScope` if it pointed at the row. */
  removeServerAccount: (id: string) => Promise<{ ok: boolean; error?: string }>;
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
  archiveMail: (id: string) => void;
  unarchiveMail: (id: string) => void;
  /** Apply smart-folder routing (archive, tag, or keep inbox). */
  moveMailToSmartFolder: (id: string, target: OpenmailSmartFolderId) => void;
  dismissSmartFolderSuggestion: (id: string) => void;
  sendReplyMail: (
    id: string,
    replyBody: string,
    opts?: { guardianAuto?: boolean }
  ) => Promise<{ imapReadOnly: boolean }>;
  /** New message: POST `/api/emails/send`, then append a local Sent item. */
  sendComposeMail: (draft: {
    to: string;
    subject: string;
    body: string;
  }) => Promise<{ imapReadOnly: boolean }>;
  mockScheduleMail: (id: string) => void;
};

const MailStoreContext = createContext<MailStoreValue | null>(null);

export default function MailStoreProvider({ children }: { children: ReactNode }) {
  const { record: recordGuardianTrace } = useGuardianTrace();
  const { present: presentGuardianIntercept } = useGuardianIntercept();
  const { display } = useOpenmailPreferences();
  const smartNotificationsEnabledRef = useRef(display.smartNotifications);
  smartNotificationsEnabledRef.current = display.smartNotifications;
  const cached = useMemo(
    () => (OPENMAIL_DEMO_MODE ? null : loadInboxSessionCache()),
    []
  );
  const [mails, setMails] = useState<MailItem[]>(() =>
    OPENMAIL_DEMO_MODE ? [] : cached?.mails ?? []
  );
  const [selectedMailId, setSelectedMailId] = useState(
    OPENMAIL_DEMO_MODE ? "" : cached?.selectedMailId ?? ""
  );
  const [mailsHydrated] = useState(true);
  const [account, setAccount] = useState<OpenMailAccountProfile | null>(() =>
    OPENMAIL_DEMO_MODE ? null : loadStoredAccount() ?? loadAccountSession()
  );
  const [accountHydrated] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [mailsLoading, setMailsLoading] = useState(!OPENMAIL_DEMO_MODE);
  const [mailsFetchError, setMailsFetchError] = useState<string | null>(null);
  const [inboxSetupRequired, setInboxSetupRequired] = useState(false);
  const [serverMailAccounts, setServerMailAccounts] = useState<
    ServerMailAccountSummary[]
  >([]);
  const [inboxScope, setInboxScope] = useState<ServerInboxScope>(
    OPENMAIL_DEMO_MODE ? "legacy" : cached?.inboxScope ?? "legacy"
  );

  const mailsRef = useRef(mails);
  mailsRef.current = mails;

  useLayoutEffect(() => {
    if (OPENMAIL_DEMO_MODE || inboxHydrateDiagModuleLogged) return;
    inboxHydrateDiagModuleLogged = true;
    inboxDiag("mail-store", "hydrate:initialState", {
      mailsCount: mails.length,
      inboxRows: mails.filter((m) => m.folder === "inbox").length,
      selectedMailId,
      inboxScope,
      hadSessionCache: cached != null,
      sessionCacheMails: cached?.mails?.length ?? 0,
    });
    // Intentionally once per page load (see module flag); snapshot right after first paint.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- diagnostic snapshot only
  }, []);

  /** Latest silent inbox fetch — superseded requests abort so UI never flashes stale data. */
  const silentInboxFetchRef = useRef<AbortController | null>(null);
  /** Coalesce burst `new_mail` events to one refresh per animation frame (instant vs fixed delay). */
  const sseInboxRefreshRafRef = useRef<number | null>(null);

  const refreshMailsFromApi = useCallback(async (opts?: {
    silent?: boolean;
    accountId?: ServerInboxScope;
  }) => {
    if (OPENMAIL_DEMO_MODE) return { ok: true };
    const requestId = Date.now();
    latestRequestId = requestId;
    const silent = opts?.silent === true;
    const scope = opts?.accountId ?? inboxScope;
    inboxDiag("mail-store", "refreshMailsFromApi:start", {
      silent,
      scope,
      inboxScopeState: inboxScope,
      accountIdOpt: opts?.accountId ?? null,
      prevMailsTotal: mailsRef.current.length,
      prevInboxCount: mailsRef.current.filter((m) => m.folder === "inbox")
        .length,
    });
    if (!silent) {
      setMailsFetchError(null);
      const keepListVisible = mailsRef.current.some(
        (m) => m.folder === "inbox" && !m.deleted
      );
      if (!keepListVisible) {
        setMailsLoading(true);
      }
    } else {
      silentInboxFetchRef.current?.abort();
      const ac = new AbortController();
      silentInboxFetchRef.current = ac;
    }
    const signal = silent ? silentInboxFetchRef.current?.signal : undefined;
    try {
      const q =
        scope === "legacy"
          ? "?legacy=1"
          : `?accountId=${encodeURIComponent(scope)}`;
      const res = await fetch(`/api/mail/fetch${q}`, {
        cache: "no-store",
        signal,
      });
      const data = (await res.json()) as {
        emails?: EmailListItem[];
        error?: string;
        setupRequired?: boolean;
      };
      inboxDiag("mail-store", "refreshMailsFromApi:response", {
        silent,
        scope,
        httpStatus: res.status,
        ok: res.ok,
        emailCount: Array.isArray(data.emails) ? data.emails.length : -1,
        setupRequired: data.setupRequired === true,
        errorSnippet: typeof data.error === "string" ? data.error.slice(0, 160) : null,
      });
      if (requestId !== latestRequestId) {
        console.warn("[OpenMail] Ignoring outdated response");
        return { ok: true };
      }
      if (!res.ok) {
        const msg = data.error || "Could not load messages";
        /** Stale/deleted saved account, or legacy env missing — onboarding, not outage. */
        const onboardingFetch =
          isAccountNotFoundInboxMessage(msg) ||
          (scope === "legacy" && isLegacyImapEnvMissingMessage(msg));
        if (onboardingFetch) {
          inboxDiag("mail-store", "refreshMailsFromApi:onboardingStripInbox", {
            scope,
            msgSnippet: msg.slice(0, 120),
          });
          setInboxSetupRequired(true);
          setMailsFetchError(null);
          setMails((prev) => prev.filter((m) => m.folder !== "inbox"));
          setSelectedMailId("");
          return { ok: true, setupRequired: true };
        }
        setInboxSetupRequired(false);
        if (!silent) setMailsFetchError(msg);
        inboxDiag("mail-store", "refreshMailsFromApi:httpErrorNoMerge", {
          scope,
          msgSnippet: msg.slice(0, 120),
        });
        return { ok: false, error: msg };
      }
      if (data.setupRequired === true) {
        inboxDiag("mail-store", "refreshMailsFromApi:setupRequiredStripInbox", {
          scope,
          emailCount: Array.isArray(data.emails) ? data.emails.length : 0,
        });
        setInboxSetupRequired(true);
        setMailsFetchError(null);
        setMails((prev) => {
          console.warn("[OpenMail] setupRequired → preserving inbox");
          return prev;
        });
        setSelectedMailId("");
        return { ok: true, setupRequired: true };
      }
      setInboxSetupRequired(false);
      const incoming = (data.emails ?? []).map(emailApiItemToMailItem);
      const incomingInbox = incoming.filter((m) => m.folder === "inbox");
      setMails((prev) => {
        if (!incomingInbox || incomingInbox.length === 0) {
          console.warn("[OpenMail] Empty inbox fetch → keeping previous inbox");
          return prev;
        }
        const rest = prev.filter((m) => m.folder !== "inbox");
        const next = [...incomingInbox, ...rest];
        inboxDiag("mail-store", "refreshMailsFromApi:mergeInbox", {
          silent,
          scope,
          prevTotal: prev.length,
          prevInbox: prev.filter((m) => m.folder === "inbox").length,
          incomingInbox: incomingInbox.length,
          restNonInbox: rest.length,
          nextTotal: next.length,
        });
        return next;
      });
      if (incomingInbox.length > 0) {
        setSelectedMailId((sel) => {
          if (sel && incoming.some((m) => m.id === sel)) return sel;
          const first = incoming.find((m) => !m.deleted);
          return first?.id ?? "";
        });
      }
      return { ok: true };
    } catch (e) {
      const aborted =
        (e instanceof DOMException && e.name === "AbortError") ||
        (e instanceof Error && e.name === "AbortError");
      if (silent && aborted) {
        inboxDiag("mail-store", "refreshMailsFromApi:abortedSilent", { scope });
        return { ok: true };
      }
      setInboxSetupRequired(false);
      const msg = e instanceof Error ? e.message : "Could not load messages";
      if (!silent) setMailsFetchError(msg);
      inboxDiag("mail-store", "refreshMailsFromApi:catch", {
        scope,
        silent,
        aborted,
        msg,
      });
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

  const syncServerInbox = useCallback(async (opts?: {
    accountId?: ServerInboxScope;
  }) => {
    if (OPENMAIL_DEMO_MODE) return { ok: true };
    try {
      const scope = opts?.accountId ?? inboxScope;
      const body = scope === "legacy" ? {} : { accountId: scope };
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

  const refreshServerAccounts = useCallback(async () => {
    if (OPENMAIL_DEMO_MODE) return { ok: true };
    try {
      const r = await fetch("/api/accounts", { cache: "no-store" });
      const j = (await r.json()) as {
        accounts?: ServerMailAccountSummary[];
        error?: string;
      };
      if (!r.ok) {
        const msg = j.error || "Could not load accounts";
        return { ok: false, error: msg };
      }
      const list = j.accounts ?? [];
      setServerMailAccounts(list);
      setInboxScope((prev) => {
        if (list.length === 0) {
          if (prev !== "legacy") {
            const hasInbox = mailsRef.current.some(
              (m) => m.folder === "inbox" && !m.deleted
            );
            if (hasInbox) return prev;
          }
          if (prev === "legacy") return prev;
          try {
            sessionStorage.setItem(INBOX_SCOPE_KEY, "legacy");
          } catch {
            /* private mode */
          }
          return "legacy";
        }
        const next = reconcileInboxScopeAfterAccountListLoad(prev, list);
        if (next === prev) return prev;
        try {
          sessionStorage.setItem(INBOX_SCOPE_KEY, next);
        } catch {
          /* private mode */
        }
        return next;
      });
      return { ok: true };
    } catch {
      return { ok: false, error: "Could not load accounts" };
    }
  }, []);

  const removeServerAccount = useCallback(
    async (id: string) => {
      if (OPENMAIL_DEMO_MODE) return { ok: true };
      try {
        const res = await fetch(`/api/accounts/${encodeURIComponent(id)}`, {
          method: "DELETE",
        });
        if (!res.ok) {
          const j = (await res.json().catch(() => ({}))) as { error?: string };
          return { ok: false, error: j.error || "Could not remove account" };
        }
        const r2 = await fetch("/api/accounts", { cache: "no-store" });
        const j2 = (await r2.json()) as {
          accounts?: ServerMailAccountSummary[];
        };
        const list = j2.accounts ?? [];
        setServerMailAccounts(list);
        let next: ServerInboxScope;
        if (inboxScope === id) next = list[0]?.id ?? "legacy";
        else if (inboxScope === "legacy") next = "legacy";
        else
          next = list.some((x) => x.id === inboxScope)
            ? inboxScope
            : list[0]?.id ?? "legacy";
        setInboxScopePersist(next);
        return { ok: true };
      } catch {
        return { ok: false, error: "Could not remove account" };
      }
    },
    [inboxScope, setInboxScopePersist]
  );

  /** Clean boot: demo seeds static inbox; otherwise resolve inbox scope then list loads via effect. */
  useEffect(() => {
    setSyncError(null);
    setMailsFetchError(null);
    setInboxSetupRequired(false);
    if (OPENMAIL_DEMO_MODE) {
      setMailsLoading(false);
      setMails(OPENMAIL_DEMO_MAIL_ITEMS);
      setSelectedMailId("");
      return;
    }
    inboxDiag("mail-store", "boot:accountsFetchStart", {
      initialMailsCount: mailsRef.current.length,
      initialInboxScope: inboxScope,
    });
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
        const prevScope: ServerInboxScope =
          !saved || saved === "legacy" ? "legacy" : saved;
        const next = reconcileInboxScopeAfterAccountListLoad(prevScope, list);
        inboxDiag("mail-store", "boot:accountsResolved", {
          accountsHttpOk: r.ok,
          accountsCount: list.length,
          savedScopeKey: saved,
          prevScope,
          nextScope: next,
          scopeChanged: next !== prevScope,
        });
        try {
          sessionStorage.setItem(INBOX_SCOPE_KEY, next);
        } catch {
          /* private mode */
        }
        setInboxScope(next);
      } catch (bootErr) {
        inboxDiag("mail-store", "boot:accountsFetchFailed", {
          err: bootErr instanceof Error ? bootErr.message : String(bootErr),
        });
        setServerMailAccounts([]);
        setInboxScope("legacy");
      }
    })();
  }, []);

  useEffect(() => {
    if (OPENMAIL_DEMO_MODE) return;
    inboxDiag("mail-store", "effect:inboxScopeChanged→refresh", {
      inboxScope,
    });
    void refreshMailsFromApi();
  }, [inboxScope, refreshMailsFromApi]);

  /** Persist current inbox/session snapshot so remounts (e.g. opening settings) rehydrate instantly. */
  useEffect(() => {
    if (OPENMAIL_DEMO_MODE) return;
    try {
      const payload = JSON.stringify({
        mails,
        selectedMailId,
        inboxScope,
      } satisfies InboxSessionCache);
      sessionStorage.setItem(INBOX_CACHE_KEY, payload);
      sessionStorage.setItem(INBOX_CACHE_KEY_ALT, payload);
    } catch {
      /* private mode */
    }
  }, [mails, selectedMailId, inboxScope]);

  /** Server push when IMAP watcher ingests new mail (SSE). Ingest already ran analyzeEmail; rAF-coalesced silent fetch runs full client pipeline same frame. */
  useEffect(() => {
    if (OPENMAIL_DEMO_MODE) return;
    const es = new EventSource("/api/emails/events");
    es.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data as string) as {
          type?: string;
          inserted?: number;
          ids?: unknown;
        };
        if (data.type === "new_mail" && (data.inserted ?? 0) > 0) {
          const ids = Array.isArray(data.ids)
            ? data.ids.filter((x): x is string => typeof x === "string" && x.trim().length > 0)
            : [];
          if (
            typeof window !== "undefined" &&
            ids.length > 0 &&
            smartNotificationsEnabledRef.current
          ) {
            window.dispatchEvent(new CustomEvent("openmail-new-mail", { detail: { ids } }));
          }
          if (sseInboxRefreshRafRef.current != null) {
            cancelAnimationFrame(sseInboxRefreshRafRef.current);
          }
          sseInboxRefreshRafRef.current = requestAnimationFrame(() => {
            sseInboxRefreshRafRef.current = null;
            void refreshMailsFromApi({ silent: true });
          });
        }
      } catch {
        /* ignore malformed */
      }
    };
    return () => {
      es.close();
      if (sseInboxRefreshRafRef.current != null) {
        cancelAnimationFrame(sseInboxRefreshRafRef.current);
        sseInboxRefreshRafRef.current = null;
      }
    };
  }, [refreshMailsFromApi]);

  const accountConnected = isAccountConfigured(account);

  const clearSyncError = useCallback(() => setSyncError(null), []);

  const saveAccount = useCallback((profile: OpenMailAccountProfile) => {
    saveStoredAccount(profile);
    saveAccountSession(profile);
    setAccount(profile);
  }, []);

  const disconnectAccount = useCallback(() => {
    clearStoredAccount();
    saveAccountSession(null);
    setAccount(null);
    setSyncError(null);
    if (OPENMAIL_DEMO_MODE) {
      setMails(OPENMAIL_DEMO_MAIL_ITEMS);
      setSelectedMailId("");
      return;
    }
    void refreshMailsFromApi();
  }, [refreshMailsFromApi]);

  useEffect(() => {
    if (OPENMAIL_DEMO_MODE) return;
    saveAccountSession(account);
  }, [account]);

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

  const archiveMail = useCallback((id: string) => {
    setMails((prev) =>
      prev.map((m) =>
        m.id === id ? { ...m, archived: true, read: true } : m
      )
    );
  }, []);

  const unarchiveMail = useCallback((id: string) => {
    setMails((prev) =>
      prev.map((m) => (m.id === id ? { ...m, archived: false } : m))
    );
  }, []);

  const moveMailToSmartFolder = useCallback(
    (id: string, target: OpenmailSmartFolderId) => {
      setMails((prev) =>
        prev.map((m) => {
          if (m.id !== id) return m;
          if (target === "archive") {
            return {
              ...m,
              archived: true,
              read: true,
              openmailFolderSuggestDismissed: true,
              openmailSmartFolderTag: undefined,
            };
          }
          if (target === "inbox") {
            return {
              ...m,
              archived: false,
              openmailSmartFolderTag: undefined,
              openmailFolderSuggestDismissed: true,
            };
          }
          return {
            ...m,
            archived: false,
            openmailSmartFolderTag: target,
            openmailFolderSuggestDismissed: true,
            read: true,
          };
        })
      );
    },
    []
  );

  const dismissSmartFolderSuggestion = useCallback((id: string) => {
    setMails((prev) =>
      prev.map((m) =>
        m.id === id ? { ...m, openmailFolderSuggestDismissed: true } : m
      )
    );
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
    async (
      id: string,
      replyBody: string,
      opts?: { guardianAuto?: boolean }
    ) => {
      const demoSender = "you@openmail.demo";
      const trimmed = replyBody.trim();
      const src = mailsRef.current.find((m) => m.id === id);
      if (!src) {
        throw new Error("Message not found");
      }

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

      const gReply = guardianEvaluate("send_email", {
        to,
        subject,
        body: trimmed || " ",
      });
      recordGuardianTrace(gReply, "client:send_reply");
      if (gReply.decision === "block") {
        await presentGuardianIntercept({
          kind: "send_email",
          decision: "block",
          result: gReply,
          detail: to,
        });
        throw new Error(gReply.reason);
      }
      if (gReply.decision === "warn") {
        const out = await presentGuardianIntercept({
          kind: "send_email",
          decision: "warn",
          result: gReply,
          detail: to,
        });
        if (out === "cancel" || out === "sandbox") {
          throw new Error("Send cancelled");
        }
      }

      const sendOverNetwork =
        !OPENMAIL_DEMO_MODE || isAccountConfigured(account);
      let imapReadOnly = true;
      if (sendOverNetwork) {
        const payload: Record<string, string | boolean> = {
          to,
          subject,
          body: trimmed || " ",
        };
        if (inboxScope !== "legacy") {
          payload.accountId = inboxScope;
        }
        if (gReply.decision === "warn") {
          payload.guardianWarnAcknowledged = true;
        }
        const res = await fetch("/api/emails/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        let data: {
          success?: boolean;
          error?: string;
          imapReadOnly?: boolean;
        } = {};
        try {
          data = (await res.json()) as typeof data;
        } catch {
          throw new Error("Invalid response from server");
        }
        if (!res.ok || data.success !== true) {
          throw new Error(data.error || "Send failed");
        }
        imapReadOnly = data.imapReadOnly === true;
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
        ...(opts?.guardianAuto ? { openmailAutoSentByAi: true } : {}),
      };

      setMails((prev) =>
        prev
          .map((m) => (m.id === id ? { ...m, read: true, needsReply: false } : m))
          .concat(sent)
      );
      return { imapReadOnly };
    },
    [account, inboxScope, presentGuardianIntercept, recordGuardianTrace]
  );

  const sendComposeMail = useCallback(
    async (draft: { to: string; subject: string; body: string }) => {
      const demoSender = "you@openmail.demo";
      const rawTo = draft.to.trim();
      const to =
        extractEmail(rawTo) ||
        rawTo;
      if (!to.includes("@")) {
        throw new Error("Recipient must include a valid email address");
      }

      const subject = draft.subject.trim() || "(no subject)";
      const trimmed = draft.body.trim();

      const gNew = guardianEvaluate("send_email", {
        to,
        subject,
        body: trimmed || " ",
      });
      recordGuardianTrace(gNew, "client:send_compose");
      if (gNew.decision === "block") {
        await presentGuardianIntercept({
          kind: "send_email",
          decision: "block",
          result: gNew,
          detail: to,
        });
        throw new Error(gNew.reason);
      }
      if (gNew.decision === "warn") {
        const out = await presentGuardianIntercept({
          kind: "send_email",
          decision: "warn",
          result: gNew,
          detail: to,
        });
        if (out === "cancel" || out === "sandbox") {
          throw new Error("Send cancelled");
        }
      }

      const sendOverNetwork =
        !OPENMAIL_DEMO_MODE || isAccountConfigured(account);
      let imapReadOnly = true;
      if (sendOverNetwork) {
        const payload: Record<string, string | boolean> = {
          to,
          subject,
          body: trimmed || " ",
        };
        if (inboxScope !== "legacy") {
          payload.accountId = inboxScope;
        }
        if (gNew.decision === "warn") {
          payload.guardianWarnAcknowledged = true;
        }
        const res = await fetch("/api/emails/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        let data: {
          success?: boolean;
          error?: string;
          imapReadOnly?: boolean;
        } = {};
        try {
          data = (await res.json()) as typeof data;
        } catch {
          throw new Error("Invalid response from server");
        }
        if (!res.ok || data.success !== true) {
          throw new Error(data.error || "Send failed");
        }
        imapReadOnly = data.imapReadOnly === true;
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
        confidence: 50,
        needsReply: false,
        deleted: false,
        date: new Date().toISOString(),
        x: 50,
        y: 40,
      };

      setMails((prev) => prev.concat(sent));
      return { imapReadOnly };
    },
    [account, inboxScope, presentGuardianIntercept, recordGuardianTrace]
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
      inboxSetupRequired,
      refreshMailsFromApi,
      serverMailAccounts,
      inboxScope,
      setInboxScopePersist,
      syncServerInbox,
      refreshServerAccounts,
      removeServerAccount,
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
      archiveMail,
      unarchiveMail,
      moveMailToSmartFolder,
      dismissSmartFolderSuggestion,
      sendReplyMail,
      sendComposeMail,
      mockScheduleMail,
    }),
    [
      mails,
      selectedMailId,
      mailsHydrated,
      mailsLoading,
      mailsFetchError,
      inboxSetupRequired,
      refreshMailsFromApi,
      serverMailAccounts,
      inboxScope,
      setInboxScopePersist,
      syncServerInbox,
      refreshServerAccounts,
      removeServerAccount,
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
      archiveMail,
      unarchiveMail,
      moveMailToSmartFolder,
      dismissSmartFolderSuggestion,
      sendReplyMail,
      sendComposeMail,
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
