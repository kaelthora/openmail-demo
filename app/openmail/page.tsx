"use client";

import {
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMailStore } from "./MailStoreProvider";
import { useOpenmailToast } from "./OpenmailToastProvider";
import { extractEmail } from "@/lib/mailAddress";
import type { OpenmailSmartFolderId, ProcessedMail } from "@/lib/mailTypes";
import { applyIntentMemoryToProcessedMail } from "@/lib/intentMemoryAdjust";
import { processMails } from "@/lib/mailProcess";
import { guardianEvaluate } from "@/lib/guardianEngine";
import { useGuardianTrace } from "./GuardianTraceProvider";
import { getMailAiRiskBand } from "@/lib/mailContentSecurity";
import type { OpenmailSidebarFolderId } from "@/lib/openmailNavFolders";
import { OPENMAIL_DEMO_MODE } from "@/lib/openmailDemo";
import { useOpenmailPreferences } from "./OpenmailPreferencesProvider";
import { useUserBehavior } from "./UserBehaviorProvider";
import { useAttentionEngine } from "./AttentionEngineProvider";
import type { BehaviorCoreAction, BehaviorTone } from "@/lib/userBehaviorMemory";
import { SecurityModal } from "./components/security/SecurityModal";
import { MainLayout } from "./components/MainLayout";
import type { ComposeEmailDraft } from "./components/ComposeEmailModal";
import type { ReplyState, ReplyTone } from "./components/types";
import {
  openmailAutoResolveKindLabel,
  planOpenmailAutoResolve,
  type OpenmailAutoResolveKind,
} from "@/lib/openmailAutoResolve";
import {
  buildThreadSituations,
  SITUATION_FEED_MAX,
} from "@/lib/threadSituations";
import {
  buildTimeCompressionCopy,
  countInboxOpenItems,
  enumerateBatchAutoResolveTargets,
} from "@/lib/openmailTimeCompression";
import {
  evaluateGuardianAutoResponse,
  guardianAutoResponseDescription,
  type GuardianAutoResponseMode,
} from "@/lib/guardianAutoResponse";
import {
  computeSmartFolderSuggestion,
  domainFromSenderLine,
  smartFolderLabel,
} from "@/lib/smartFolderSuggestion";
import { matchCustomFolderNameToSmartTag } from "@/lib/smartFolderKeys";
import { guardianSafeReplyFallback } from "@/lib/ai";

const USER_FOLDERS_STORAGE_KEY = "openmail-user-folders-v1";

type CoreAction = "reply" | "schedule" | "ignore" | "escalate" | "review";
type RiskActionBusy = "block" | "phishing" | "sandbox" | "safe" | null;

const SMART_FOLDER_ALWAYS_KEY = "openmail-smart-folder-always-v1";

/** After SMTP send while IMAP is read-only (no APPEND to provider Sent). */
const OPENMAIL_IMAP_PREVIEW_SENT_NOTE =
  "Message sent (not stored in Gmail Sent folder in preview mode)";

function firstHttpUrl(blob: string): string | null {
  const m = blob.match(/https?:\/\/[^\s<>"')]+/i);
  return m?.[0] ?? null;
}

function readAlwaysFolderMap(): Record<string, OpenmailSmartFolderId> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(SMART_FOLDER_ALWAYS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, OpenmailSmartFolderId> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (
        typeof k === "string" &&
        (v === "archive" ||
          v === "inbox" ||
          v === "promotions" ||
          v === "updates" ||
          v === "work" ||
          v === "personal")
      ) {
        out[k] = v;
      }
    }
    return out;
  } catch {
    return {};
  }
}

function applyReplyTone(input: string, tone: ReplyTone): string {
  const text = input.trim();
  if (!text) return "";
  if (tone === "Friendly") return `${text} Thanks!`;
  if (tone === "Direct") return text.replace(/^Thanks for the note\.?\s*/i, "");
  if (tone === "Short") return text.split(".")[0]?.trim() || text;
  return text;
}

/** Merges loaded AI suggestion lists without clobbering an in-progress draft (fixes async races). */
function commitReplySuggestionsLoaded(
  setReplyState: Dispatch<SetStateAction<ReplyState>>,
  liveMailIdRef: { current: string | undefined },
  prefillDigestRef: { current: { mailId: string; text: string } | null },
  manualEditLoggedRef: { current: string | null },
  mailId: string,
  prefillEditor: boolean,
  raw: string[],
  filled: string
): void {
  setReplyState((prev) => {
    if (liveMailIdRef.current !== mailId) return prev;

    if (prefillEditor) {
      prefillDigestRef.current = filled.trim()
        ? { mailId, text: filled.trim() }
        : null;
      manualEditLoggedRef.current = null;
      return { suggestions: raw, selectedIndex: 0, currentReply: filled };
    }

    if (prev.currentReply.trim().length > 0) {
      const si =
        prev.selectedIndex >= 0 && prev.selectedIndex < raw.length
          ? prev.selectedIndex
          : -1;
      return { ...prev, suggestions: raw, selectedIndex: si };
    }

    prefillDigestRef.current = null;
    manualEditLoggedRef.current = null;
    return { suggestions: raw, selectedIndex: -1, currentReply: "" };
  });
}

function buildEmailContextForAi(mail: ProcessedMail): string {
  const from =
    mail.sender?.trim() || mail.title?.trim() || "Unknown";
  const subj = mail.subject?.trim() || "(no subject)";
  const body =
    (mail.content ?? "").trim() || (mail.preview ?? "").trim() || "(empty)";
  return `From: ${from}\nSubject: ${subj}\n\n${body}`;
}

function detectCoreAction(mail: ProcessedMail | null): CoreAction {
  if (!mail) return "reply";
  const s = mail.subject.toLowerCase();
  const blob = `${s} ${mail.preview} ${mail.content}`.toLowerCase();

  if (
    /escalat|legal|compliance|phish|fraud|breach|lawsuit|court order|security incident/.test(blob) ||
    (/critical|urgent/.test(s) && /security|alert|unauthorized|breach/.test(blob))
  ) {
    return "escalate";
  }
  if (
    /newsletter|unsubscribe|digest|promotional|marketing email|automated message|no reply needed/.test(
      blob
    ) ||
    (mail.intent === "read" && !mail.needsReply && /fyi|for your information/.test(blob))
  ) {
    return "ignore";
  }
  if (/meeting|calendar|invite|reschedule|zoom|teams call|book a time/.test(blob) || mail.intent === "schedule") {
    return "schedule";
  }
  return "reply";
}

function formatActionLabel(action: CoreAction): string {
  if (action === "reply") return "Reply";
  if (action === "schedule") return "Schedule";
  if (action === "ignore") return "Ignore";
  if (action === "review") return "Review";
  return "Escalate";
}

function relevanceScore(mail: ProcessedMail): number {
  const s = mail.subject.toLowerCase();
  let score = mail.priorityScore ?? 0;
  if (mail.priority === "urgent") score += 80;
  if (mail.needsReply) score += 40;
  if (/urgent|asap|immediately|alert|security|critical/.test(s)) score += 60;
  if (/invoice|payment|meeting|confirm|calendar|invite/.test(s)) score += 25;
  if (mail.read === false) score += 10;
  const u = mail.syncedAi?.intentUrgency;
  if (u === "high") score += 35;
  else if (u === "medium") score += 18;
  const int = mail.syncedAi?.intent;
  if (int === "escalate") score += 28;
  if (int === "review") score += 15;
  return score;
}

function pickMostRelevantMail(mails: ProcessedMail[]): ProcessedMail | null {
  if (mails.length === 0) return null;
  return [...mails].sort((a, b) => {
    const d = relevanceScore(b) - relevanceScore(a);
    if (d !== 0) return d;
    return a.id.localeCompare(b.id);
  })[0];
}

/** Prefer Intent Engine `intent`, then legacy triage `action`. */
function coreActionFromDb(mail: ProcessedMail | null): CoreAction | null {
  const sa = mail?.syncedAi;
  if (!sa) return null;
  const i = sa.intent;
  if (i === "reply" || i === "ignore" || i === "escalate" || i === "review") {
    return i;
  }
  const a = sa.action;
  if (a === "reply" || a === "ignore" || a === "escalate") return a;
  return null;
}

/** Offline fallback when live GPT suggestions are unavailable (batch tools, API errors). */
function fallbackReplySuggestions(
  mail: ProcessedMail | null,
  action: CoreAction
): string[] {
  return buildSuggestions(mail, action);
}

function buildSuggestions(mail: ProcessedMail | null, action: CoreAction): string[] {
  if (!mail) {
    return [
      "All clear on my side — thanks for checking in.",
      "I will review new messages as they arrive.",
      "Nothing pending from me right now.",
    ];
  }

  if (action === "escalate") {
    return [
      "Thanks for flagging this. I am escalating this to the appropriate team for review.",
      "Received — I will not act on links until this is verified. Escalating internally now.",
      "Acknowledged. Looping in the right owner; I will follow up once triage is complete.",
    ];
  }
  if (action === "ignore") {
    return [
      "Thanks — no action needed from my side.",
      "Noted. I will archive this thread.",
      "Received. No follow-up required.",
    ];
  }
  if (action === "schedule") {
    return [
      "Thanks for the invite. This time works — please send a calendar hold.",
      "Could we move this to later this week? I have a conflict at the proposed time.",
      "I cannot make this slot. Please share two alternative times that work for you.",
    ];
  }
  if (action === "review") {
    return [
      "Thanks — I received this and need a short window to review the details before confirming.",
      "I am reviewing the attachment and will follow up with questions or approval shortly.",
      "Acknowledged. I will read this carefully and reply once I have verified the facts.",
    ];
  }

  const subject = mail.subject.toLowerCase();
  const hasInvoice = subject.includes("invoice") || subject.includes("payment");
  const hasMeeting = subject.includes("meeting") || subject.includes("call");

  if (mail.intent === "pay" || hasInvoice) {
    return [
      "Thanks for the invoice. I will process the payment today.",
      "Please resend the invoice details and payment link for verification.",
      "I need a bit more time — I will confirm once payment is complete.",
    ];
  }
  if (mail.intent === "schedule" || hasMeeting) {
    return [
      "Thanks for the meeting invite. This time works for me.",
      "Could we move this meeting to a later slot this week?",
      "I cannot make this time. Please send two alternative slots.",
    ];
  }
  if (mail.intent === "reply" || mail.intent === "follow_up") {
    return [
      "Thanks for the note. I will follow up shortly with details.",
      "Got it. I will review and send next steps.",
      "Can you share a bit more context so I can respond accurately?",
    ];
  }
  return [
    "Thanks for the update.",
    "Understood. I will take a look and reply shortly.",
    "Acknowledged.",
  ];
}

const CORE_REPLY_CACHE_MAX = 32;

type CoreReplyCacheEntry = {
  analysisSig: string;
  classificationKey: string;
  coreAction: CoreAction;
  learnFromUsage: boolean;
  memoryVersion: number;
  suggestions: string[];
};

function coreMailAnalysisSig(mail: ProcessedMail | null): string {
  if (!mail) return "";
  return [
    mail.subject,
    (mail.preview ?? "").slice(0, 320),
    (mail.content ?? "").slice(0, 240),
    mail.intent ?? "",
    String(!!mail.needsReply),
    mail.priority ?? "",
    String(mail.priorityScore ?? ""),
    (mail.openmailAutoReplyDraft ?? "").slice(0, 120),
  ].join("\x1f");
}

/** Risk / intent / classification only — not reply text (replies are live GPT). */
function syncedAiClassificationKey(mail: ProcessedMail | null): string {
  const sa = mail?.syncedAi;
  if (!sa) return "";
  return [
    sa.risk,
    sa.summary,
    sa.reason ?? "",
    sa.action ?? "",
    sa.intent ?? "",
    sa.intentUrgency ?? "",
    String(sa.intentConfidence ?? ""),
  ].join("\x1e");
}

function pruneCoreReplyCache(map: Map<string, CoreReplyCacheEntry>, max: number) {
  while (map.size > max) {
    const first = map.keys().next().value;
    if (first === undefined) break;
    map.delete(first);
  }
}

function OpenMailPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const notifyMailId = searchParams.get("mail");

  const {
    mails,
    selectedMailId,
    setSelectedMailId,
    markMailRead,
    softDeleteMail,
    archiveMail,
    sendReplyMail,
    sendComposeMail,
    mailsLoading,
    mailsFetchError,
    refreshMailsFromApi,
    syncFromImap,
    isSyncing,
    syncError,
    clearSyncError,
    accountConnected,
    serverMailAccounts,
    inboxScope,
    setInboxScopePersist,
    syncServerInbox,
    setMails,
    unarchiveMail,
    moveMailToSmartFolder,
  } = useMailStore();
  const toast = useOpenmailToast();
  const { record: recordGuardianTrace } = useGuardianTrace();
  const { hydrated: prefsHydrated, ai: aiPrefs } = useOpenmailPreferences();
  const behavior = useUserBehavior();
  const {
    predictedNextMailId,
    syncSelectedMailId,
    resetSession,
    recordMailOpen,
  } = useAttentionEngine();
  const prevMailIdRef = useRef<string | undefined>(undefined);
  const prefillDigestRef = useRef<{ mailId: string; text: string } | null>(null);
  const manualEditLoggedRef = useRef<string | null>(null);
  /** Guards reply-draft updates so stale async loads cannot clear a newer draft. */
  const liveReplyMailIdRef = useRef<string | undefined>(undefined);
  const coreReplyCacheRef = useRef<Map<string, CoreReplyCacheEntry>>(new Map());
  /** Prevents repeated router/sync work while `?mail=` lags behind `router.replace`. */
  const notifyHandledMailRef = useRef<string | null>(null);
  const [hoverPrefetchMailId, setHoverPrefetchMailId] = useState<string | null>(null);
  const [inboxRefreshing, setInboxRefreshing] = useState(false);
  const [activeFolder, setActiveFolder] =
    useState<OpenmailSidebarFolderId>("inbox");
  const [customFolderNames, setCustomFolderNames] = useState<string[]>([]);
  const [activeInboxSubfolder, setActiveInboxSubfolder] = useState<string | null>(
    null
  );
  const [replyTone, setReplyTone] = useState<ReplyTone>("Professional");

  useEffect(() => {
    if (!prefsHydrated) return;
    setReplyTone(aiPrefs.defaultTone);
  }, [prefsHydrated, aiPrefs.defaultTone]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(USER_FOLDERS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as unknown;
        if (Array.isArray(parsed)) {
          setCustomFolderNames(
            parsed.filter((x): x is string => typeof x === "string" && x.trim().length > 0)
          );
        }
      }
    } catch {
      /* ignore */
    }
  }, []);

  const persistCustomFolderNames = useCallback((next: string[]) => {
    setCustomFolderNames(next);
    try {
      localStorage.setItem(USER_FOLDERS_STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* private mode */
    }
  }, []);

  const handleAddCustomFolder = useCallback(
    (name: string) => {
      const t = name.trim();
      if (!t) return;
      if (customFolderNames.some((x) => x.toLowerCase() === t.toLowerCase())) {
        return;
      }
      persistCustomFolderNames([...customFolderNames, t]);
    },
    [customFolderNames, persistCustomFolderNames]
  );

  const handleRenameCustomFolder = useCallback(
    (oldName: string, newName: string) => {
      const t = newName.trim();
      if (!t || t === oldName) return;
      if (
        customFolderNames.some(
          (x) => x !== oldName && x.toLowerCase() === t.toLowerCase()
        )
      ) {
        return;
      }
      persistCustomFolderNames(
        customFolderNames.map((n) => (n === oldName ? t : n))
      );
      setActiveInboxSubfolder((cur) => (cur === oldName ? t : cur));
    },
    [customFolderNames, persistCustomFolderNames]
  );

  const handleDeleteCustomFolder = useCallback(
    (name: string) => {
      persistCustomFolderNames(customFolderNames.filter((n) => n !== name));
      setActiveInboxSubfolder((cur) => (cur === name ? null : cur));
    },
    [customFolderNames, persistCustomFolderNames]
  );

  const handleSidebarFolderChange = useCallback(
    (folder: OpenmailSidebarFolderId) => {
      setActiveInboxSubfolder(null);
      setActiveFolder(folder);
    },
    []
  );

  const handleSelectInboxSubfolder = useCallback((name: string | null) => {
    setActiveFolder("inbox");
    setActiveInboxSubfolder(name);
  }, []);

  useEffect(() => {
    const id = notifyMailId?.trim();
    if (!id) {
      notifyHandledMailRef.current = null;
      return;
    }
    if (notifyHandledMailRef.current === id) return;
    const found = mails.find((m) => m.id === id && !m.deleted);
    if (!found) return;
    notifyHandledMailRef.current = id;
    setSelectedMailId(id);
    router.replace("/openmail", { scroll: false });
  }, [notifyMailId, mails, setSelectedMailId, router]);

  useEffect(() => {
    alwaysFolderMapRef.current = readAlwaysFolderMap();
  }, []);
  const [replyState, setReplyState] = useState<ReplyState>({
    suggestions: [],
    selectedIndex: -1,
    currentReply: "",
  });
  const replyToneRef = useRef(replyTone);
  replyToneRef.current = replyTone;
  const replyBodyRef = useRef("");
  replyBodyRef.current = replyState.currentReply;
  const recordManualEditRef = useRef(behavior.recordManualEdit);
  recordManualEditRef.current = behavior.recordManualEdit;
  const [readingMailId, setReadingMailId] = useState<string | null>(null);
  const [mailOpenRiskGate, setMailOpenRiskGate] = useState<{
    mail: ProcessedMail;
    tier: "high" | "medium";
  } | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendSuccess, setSendSuccess] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [aiReplyLoading, setAiReplyLoading] = useState(false);
  const [guardianDraftLoading, setGuardianDraftLoading] = useState(false);
  const [resolveAllBusy, setResolveAllBusy] = useState(false);
  const [riskActionBusy, setRiskActionBusy] = useState<RiskActionBusy>(null);
  const alwaysFolderMapRef = useRef<Record<string, OpenmailSmartFolderId>>({});
  const quickPromptShownRef = useRef<Set<string>>(new Set());
  const [quickClassifyPrompt, setQuickClassifyPrompt] = useState<{
    open: boolean;
    mailId: string;
    folder: OpenmailSmartFolderId;
    folderLabel: string;
    confidencePct: number;
    senderLine: string;
    domain: string | null;
  } | null>(null);

  type AutoResolveLogEntry = {
    id: string;
    mailId: string;
    subject: string;
    kind: OpenmailAutoResolveKind;
    kindLabel: string;
    undone: boolean;
  };
  const [autoResolveLog, setAutoResolveLog] = useState<AutoResolveLogEntry[]>([]);
  const autoResolveHandledRef = useRef<Set<string>>(new Set());
  const autoResolveSuppressedRef = useRef<Set<string>>(new Set());

  const processed = useMemo(() => {
    const raw = processMails(mails);
    if (!aiPrefs.learnFromUsage || !behavior.hydrated) return raw;
    return raw.map((m) =>
      applyIntentMemoryToProcessedMail(m, behavior.memory, { enabled: true })
    );
  }, [
    mails,
    aiPrefs.learnFromUsage,
    behavior.hydrated,
    behavior.memory,
    behavior.memoryVersion,
  ]);
  const visibleMails = useMemo(() => {
    if (activeFolder === "trash") {
      return processed.filter((mail) => mail.deleted);
    }
    if (activeFolder === "archive") {
      return processed.filter((mail) => mail.archived && !mail.deleted);
    }
    if (activeFolder === "spam") {
      return processed.filter(
        (mail) =>
          !mail.deleted && !mail.archived && mail.folder === "spam"
      );
    }
    let list = processed.filter(
      (mail) =>
        !mail.deleted &&
        !mail.archived &&
        mail.folder === activeFolder
    );
    if (activeFolder === "inbox" && activeInboxSubfolder?.trim()) {
      const tag = matchCustomFolderNameToSmartTag(activeInboxSubfolder);
      if (tag) {
        list = list.filter((m) => m.openmailSmartFolderTag === tag);
      } else {
        list = [];
      }
    }
    return list;
  }, [processed, activeFolder, activeInboxSubfolder]);

  const autoHandledMailIdsForSituations = useMemo(() => {
    const ids = new Set<string>();
    for (const e of autoResolveLog) {
      if (!e.undone) ids.add(e.mailId);
    }
    return ids;
  }, [autoResolveLog]);

  const inboxSituationFeedAnchorIds = useMemo(() => {
    if (activeFolder !== "inbox") return null;
    const situations = buildThreadSituations(visibleMails, {
      autoHandledMailIds: autoHandledMailIdsForSituations,
    });
    return new Set(
      situations.slice(0, SITUATION_FEED_MAX).map((s) => s.anchorMail.id)
    );
  }, [activeFolder, visibleMails, autoHandledMailIdsForSituations]);

  const selectedMail = useMemo(() => {
    const byId = visibleMails.find((mail) => mail.id === selectedMailId);
    if (byId) return byId;
    if (visibleMails.length === 0) return null;
    return pickMostRelevantMail(visibleMails);
  }, [visibleMails, selectedMailId]);

  liveReplyMailIdRef.current = selectedMail?.id;

  useEffect(() => {
    if (!selectedMail?.id) return;
    markMailRead(selectedMail.id);
  }, [selectedMail?.id, markMailRead]);

  const coreAction = useMemo(() => {
    const fromDb = coreActionFromDb(selectedMail);
    if (fromDb) return fromDb;
    return detectCoreAction(selectedMail);
  }, [selectedMail]);

  const guardianAutoResponseMode: GuardianAutoResponseMode = useMemo(
    () => evaluateGuardianAutoResponse(selectedMail),
    [selectedMail]
  );

  const guardianAutoHandledRef = useRef<Set<string>>(new Set());

  /** Single snapshot for Guardian auto-send — keeps `useEffect` deps array a constant length (React requirement). */
  const guardianAutoEffectSnapshot = useMemo(
    () => ({
      prefsHydrated,
      guardianPref: aiPrefs.guardianAutoResponse,
      mode: guardianAutoResponseMode,
      mailId: selectedMail?.id ?? "",
      activeFolder,
      readingMailId: readingMailId ?? "",
      coreAction,
      aiReplyLoading: aiReplyLoading || guardianDraftLoading,
      sending,
      replyBody: replyState.currentReply,
    }),
    [
      prefsHydrated,
      aiPrefs.guardianAutoResponse,
      guardianAutoResponseMode,
      selectedMail?.id,
      activeFolder,
      readingMailId,
      coreAction,
      aiReplyLoading,
      guardianDraftLoading,
      sending,
      replyState.currentReply,
    ]
  );

  const actionLabel = formatActionLabel(coreAction);

  const handleComposeSent = useCallback(
    async (draft: ComposeEmailDraft) => {
      try {
        const { imapReadOnly } = await sendComposeMail({
          to: draft.to,
          subject: draft.subject,
          body: draft.body,
        });
        const dest = draft.to.trim() || "recipient";
        toast.success(
          imapReadOnly
            ? `Sent to ${dest}. ${OPENMAIL_IMAP_PREVIEW_SENT_NOTE}`
            : `Sent to ${dest}`
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Send failed";
        console.error("[openmail] compose send failed", e);
        toast.error(msg);
        throw e;
      }
    },
    [sendComposeMail, toast]
  );

  const handleImapSyncAction = useCallback(async () => {
    const r = await syncFromImap();
    if (r.ok) toast.success("IMAP sync complete");
    else if (r.error) toast.error(r.error);
  }, [syncFromImap, toast]);

  const handleRefreshInbox = useCallback(async () => {
    if (OPENMAIL_DEMO_MODE) {
      toast.info("Demo mode — inbox is static.");
      return;
    }
    setInboxRefreshing(true);
    try {
      const syncRes = await syncServerInbox();
      const syncMsg = syncRes.ok ? null : syncRes.error || "Server sync failed";
      const r = await refreshMailsFromApi();
      if (!r.ok) {
        toast.error(r.error || "Could not load inbox");
        return;
      }
      if (syncMsg) toast.error(syncMsg);
      else toast.success("Inbox refreshed");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Refresh failed");
    } finally {
      setInboxRefreshing(false);
    }
  }, [refreshMailsFromApi, syncServerInbox, toast]);

  const handleListToolbarMarkRead = useCallback(() => {
    if (!selectedMail) {
      toast.info("Select a message");
      return;
    }
    markMailRead(selectedMail.id);
    toast.success("Marked as read");
  }, [selectedMail, markMailRead, toast]);

  const handleListToolbarDelete = useCallback(() => {
    if (!selectedMail) {
      toast.info("Select a message");
      return;
    }
    softDeleteMail(selectedMail.id);
    setSelectedMailId((id) => (id === selectedMail.id ? "" : id));
    toast.success("Deleted");
  }, [selectedMail, softDeleteMail, setSelectedMailId, toast]);

  const handleListToolbarArchive = useCallback(() => {
    if (!selectedMail) {
      toast.info("Select a message");
      return;
    }
    archiveMail(selectedMail.id);
    toast.success("Archived");
  }, [selectedMail, archiveMail, toast]);

  const handleListToolbarSpam = useCallback(() => {
    if (!selectedMail) {
      toast.info("Select a message");
      return;
    }
    setMails((prev) =>
      prev.map((m) =>
        m.id === selectedMail.id
          ? { ...m, spam: true, read: true, archived: true }
          : m
      )
    );
    toast.success("Marked as spam");
  }, [selectedMail, setMails, toast]);

  const handleListToolbarMove = useCallback(
    (folder: OpenmailSmartFolderId) => {
      if (!selectedMail) {
        toast.info("Select a message");
        return;
      }
      moveMailToSmartFolder(selectedMail.id, folder);
      toast.success(`Moved to ${smartFolderLabel(folder)}`);
    },
    [selectedMail, moveMailToSmartFolder, toast]
  );

  const classificationKey = useMemo(
    () => syncedAiClassificationKey(selectedMail),
    [selectedMail]
  );

  const mailAnalysisSig = useMemo(
    () => coreMailAnalysisSig(selectedMail),
    [selectedMail]
  );

  const refreshLiveReplySuggestions = useCallback(
    async (options?: {
      signal?: AbortSignal;
      skipCache?: boolean;
      /** When true, paste the top suggestion into the editor (explicit “Generate AI reply”). */
      prefillEditor?: boolean;
    }) => {
      const mail = selectedMail;
      const signal = options?.signal;
      const prefillEditor = options?.prefillEditor === true;
      if (!mail) {
        setReplyState({ suggestions: [], selectedIndex: -1, currentReply: "" });
        return;
      }
      if (signal?.aborted) return;

      if (OPENMAIL_DEMO_MODE) {
        let raw = fallbackReplySuggestions(mail, coreAction);
        if (aiPrefs.learnFromUsage && behavior.hydrated) {
          raw = behavior.rankSuggestions(
            raw,
            coreAction as BehaviorCoreAction
          );
        }
        const first = raw[0] ?? "";
        const filled = applyReplyTone(first, replyTone);
        commitReplySuggestionsLoaded(
          setReplyState,
          liveReplyMailIdRef,
          prefillDigestRef,
          manualEditLoggedRef,
          mail.id,
          prefillEditor,
          raw,
          filled
        );
        const cache = coreReplyCacheRef.current;
        cache.set(mail.id, {
          analysisSig: coreMailAnalysisSig(mail),
          classificationKey: syncedAiClassificationKey(mail),
          coreAction,
          learnFromUsage: aiPrefs.learnFromUsage,
          memoryVersion: behavior.memoryVersion,
          suggestions: raw,
        });
        pruneCoreReplyCache(cache, CORE_REPLY_CACHE_MAX);
        setSendError(null);
        setSendSuccess(null);
        return;
      }

      const analysisSig = coreMailAnalysisSig(mail);
      const clsKey = syncedAiClassificationKey(mail);
      const cache = coreReplyCacheRef.current;
      const cached = cache.get(mail.id);
      const cacheHit =
        !options?.skipCache &&
        cached &&
        cached.analysisSig === analysisSig &&
        cached.classificationKey === clsKey &&
        cached.coreAction === coreAction &&
        cached.learnFromUsage === aiPrefs.learnFromUsage &&
        cached.memoryVersion === behavior.memoryVersion &&
        cached.suggestions.length > 0;

      if (cacheHit && cached) {
        let raw = cached.suggestions;
        if (aiPrefs.learnFromUsage && behavior.hydrated) {
          raw = behavior.rankSuggestions(
            raw,
            coreAction as BehaviorCoreAction
          );
        }
        const first = raw[0] ?? "";
        const filled = applyReplyTone(first, replyTone);
        commitReplySuggestionsLoaded(
          setReplyState,
          liveReplyMailIdRef,
          prefillDigestRef,
          manualEditLoggedRef,
          mail.id,
          prefillEditor,
          raw,
          filled
        );
        setSendError(null);
        setSendSuccess(null);
        return;
      }

      setAiReplyLoading(true);
      setSendError(null);
      setSendSuccess(null);
      try {
        const res = await fetch("/api/ai-reply", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal,
          body: JSON.stringify({
            mode: "suggestions",
            email: buildEmailContextForAi(mail),
            tone: replyTone,
            risk: getMailAiRiskBand(mail),
          }),
        });
        const data = (await res.json()) as {
          suggestions?: string[];
          error?: string;
        };
        if (signal?.aborted) return;
        if (!res.ok) {
          throw new Error(data.error || "Could not load reply suggestions");
        }
        if (!Array.isArray(data.suggestions) || data.suggestions.length === 0) {
          throw new Error("No suggestions returned");
        }
        let raw = data.suggestions
          .map((s) => s.replace(/\s+/g, " ").trim())
          .filter(Boolean);
        if (raw.length === 0) throw new Error("Empty suggestions");
        if (aiPrefs.learnFromUsage && behavior.hydrated) {
          raw = behavior.rankSuggestions(
            raw,
            coreAction as BehaviorCoreAction
          );
        }
        const first = raw[0] ?? "";
        const filled = applyReplyTone(first, replyTone);
        commitReplySuggestionsLoaded(
          setReplyState,
          liveReplyMailIdRef,
          prefillDigestRef,
          manualEditLoggedRef,
          mail.id,
          prefillEditor,
          raw,
          filled
        );
        cache.set(mail.id, {
          analysisSig,
          classificationKey: clsKey,
          coreAction,
          learnFromUsage: aiPrefs.learnFromUsage,
          memoryVersion: behavior.memoryVersion,
          suggestions: raw,
        });
        pruneCoreReplyCache(cache, CORE_REPLY_CACHE_MAX);
      } catch (e) {
        const aborted =
          (e instanceof DOMException && e.name === "AbortError") ||
          (e instanceof Error && e.name === "AbortError");
        if (aborted) return;
        const msg = e instanceof Error ? e.message : "Generation failed";
        toast.error(msg);
        let raw = fallbackReplySuggestions(mail, coreAction);
        if (aiPrefs.learnFromUsage && behavior.hydrated) {
          raw = behavior.rankSuggestions(
            raw,
            coreAction as BehaviorCoreAction
          );
        }
        const first = raw[0] ?? "";
        const filled = applyReplyTone(first, replyTone);
        commitReplySuggestionsLoaded(
          setReplyState,
          liveReplyMailIdRef,
          prefillDigestRef,
          manualEditLoggedRef,
          mail.id,
          prefillEditor,
          raw,
          filled
        );
      } finally {
        setAiReplyLoading(false);
      }
    },
    [
      selectedMail,
      replyTone,
      coreAction,
      aiPrefs.learnFromUsage,
      behavior.hydrated,
      behavior.memoryVersion,
      behavior.rankSuggestions,
      toast,
    ]
  );

  const handleHoverPrefetchMail = useCallback((mailId: string | null) => {
    setHoverPrefetchMailId(mailId);
  }, []);

  useEffect(() => {
    syncSelectedMailId(selectedMailId);
  }, [selectedMailId, syncSelectedMailId]);

  useEffect(() => {
    resetSession();
  }, [activeFolder, resetSession]);

  useEffect(() => {
    if (visibleMails.length === 0) {
      if (selectedMailId) setSelectedMailId("");
      return;
    }
    const exists = visibleMails.some((mail) => mail.id === selectedMailId);
    if (!exists || !selectedMailId) {
      let pool = visibleMails;
      if (activeFolder === "inbox" && inboxSituationFeedAnchorIds) {
        const inFeed = visibleMails.filter((m) =>
          inboxSituationFeedAnchorIds.has(m.id)
        );
        if (inFeed.length > 0) pool = inFeed;
      }
      const best = pickMostRelevantMail(pool);
      if (best && best.id !== selectedMailId) setSelectedMailId(best.id);
    }
  }, [
    visibleMails,
    selectedMailId,
    setSelectedMailId,
    activeFolder,
    inboxSituationFeedAnchorIds,
  ]);

  useEffect(() => {
    setReadingMailId(null);
    setHoverPrefetchMailId(null);
  }, [activeFolder]);

  useEffect(() => {
    if (!prefsHydrated || !aiPrefs.autoResolveInbox) return;
    if (activeFolder !== "inbox") return;

    for (const mail of processed) {
      if (mail.folder !== "inbox" || mail.deleted || mail.archived) continue;
      if (mail.resolved) continue;
      if (autoResolveSuppressedRef.current.has(mail.id)) continue;
      if (autoResolveHandledRef.current.has(mail.id)) continue;
      if (mail.openmailAutoReplyDraft?.trim()) continue;

      const core = coreActionFromDb(mail) ?? detectCoreAction(mail);
      const kind = planOpenmailAutoResolve(mail, core);
      if (!kind) continue;
      if (kind === "mark_done" && mail.resolved) continue;

      autoResolveHandledRef.current.add(mail.id);
      const logId = `${Date.now()}-${mail.id}-${kind}`;
      const subjectSnap = mail.subject || "(No subject)";

      const pushLog = () => {
        const kindLabel = openmailAutoResolveKindLabel(kind);
        setAutoResolveLog((prev) =>
          [
            {
              id: logId,
              mailId: mail.id,
              subject: subjectSnap,
              kind,
              kindLabel,
              undone: false,
            },
            ...prev,
          ].slice(0, 40)
        );
      };

      if (kind === "archive") {
        archiveMail(mail.id);
        pushLog();
        continue;
      }

      if (kind === "mark_done") {
        setMails((prev) =>
          prev.map((m) =>
            m.id === mail.id ? { ...m, resolved: true, read: true } : m
          )
        );
        pushLog();
        continue;
      }

      let raw = fallbackReplySuggestions(mail, core);
      if (aiPrefs.learnFromUsage && behavior.hydrated) {
        raw = behavior.rankSuggestions(raw, core as BehaviorCoreAction);
      }
      const learned = behavior.hydrated ? behavior.getLearnedTone() : null;
      const toneForDraft: ReplyTone =
        aiPrefs.learnFromUsage && learned
          ? (learned as ReplyTone)
          : (aiPrefs.defaultTone as ReplyTone);
      const draftBody = applyReplyTone(raw[0] ?? "", toneForDraft);
      setMails((prev) =>
        prev.map((m) =>
          m.id === mail.id
            ? { ...m, openmailAutoReplyDraft: draftBody, read: true }
            : m
        )
      );
      pushLog();
    }
  }, [
    processed,
    prefsHydrated,
    aiPrefs.autoResolveInbox,
    aiPrefs.learnFromUsage,
    aiPrefs.defaultTone,
    activeFolder,
    behavior.hydrated,
    behavior.memoryVersion,
    behavior.rankSuggestions,
    behavior.getLearnedTone,
    archiveMail,
    setMails,
  ]);

  const handleResolveAll = useCallback(() => {
    if (activeFolder !== "inbox") return;
    const targets = enumerateBatchAutoResolveTargets(processed, {
      inferCore: (m) => coreActionFromDb(m) ?? detectCoreAction(m),
      suppressedIds: autoResolveSuppressedRef.current,
      handledIds: autoResolveHandledRef.current,
    });
    if (targets.length === 0) {
      toast.info("Nothing to batch-resolve right now.");
      return;
    }
    setResolveAllBusy(true);
    const now = Date.now();
    try {
      const archiveIds = new Set<string>();
      const markDoneIds = new Set<string>();
      const draftById = new Map<string, string>();
      const logEntries: AutoResolveLogEntry[] = [];

      const learned = behavior.hydrated ? behavior.getLearnedTone() : null;
      const toneForDraft: ReplyTone =
        aiPrefs.learnFromUsage && learned
          ? (learned as ReplyTone)
          : (aiPrefs.defaultTone as ReplyTone);

      for (let i = 0; i < targets.length; i++) {
        const { mail, kind, core } = targets[i]!;
        autoResolveHandledRef.current.add(mail.id);
        const logId = `${now}-${i}-${mail.id}-${kind}`;
        logEntries.push({
          id: logId,
          mailId: mail.id,
          subject: mail.subject || "(No subject)",
          kind,
          kindLabel: openmailAutoResolveKindLabel(kind),
          undone: false,
        });

        if (kind === "archive") {
          archiveIds.add(mail.id);
          continue;
        }
        if (kind === "mark_done") {
          markDoneIds.add(mail.id);
          continue;
        }
        let raw = fallbackReplySuggestions(mail, core);
        if (aiPrefs.learnFromUsage && behavior.hydrated) {
          raw = behavior.rankSuggestions(raw, core as BehaviorCoreAction);
        }
        draftById.set(mail.id, applyReplyTone(raw[0] ?? "", toneForDraft));
      }

      setMails((prev) =>
        prev.map((m) => {
          if (archiveIds.has(m.id)) return { ...m, archived: true, read: true };
          if (markDoneIds.has(m.id)) return { ...m, resolved: true, read: true };
          const d = draftById.get(m.id);
          if (d !== undefined) return { ...m, openmailAutoReplyDraft: d, read: true };
          return m;
        })
      );

      setAutoResolveLog((prev) => [...logEntries, ...prev].slice(0, 40));
      toast.success(
        targets.length === 1
          ? "Resolved 1 inbox item"
          : `Batch-resolved ${targets.length} inbox items`
      );
    } finally {
      setResolveAllBusy(false);
    }
  }, [
    activeFolder,
    processed,
    setMails,
    aiPrefs.learnFromUsage,
    aiPrefs.defaultTone,
    behavior.hydrated,
    behavior.rankSuggestions,
    behavior.getLearnedTone,
    toast,
  ]);

  const timeCompressionCopy = useMemo(() => {
    if (activeFolder !== "inbox" || !prefsHydrated) return null;
    const targets = enumerateBatchAutoResolveTargets(processed, {
      inferCore: (m) => coreActionFromDb(m) ?? detectCoreAction(m),
      suppressedIds: autoResolveSuppressedRef.current,
      handledIds: autoResolveHandledRef.current,
    });
    const open = countInboxOpenItems(processed);
    return buildTimeCompressionCopy(targets, open);
  }, [processed, autoResolveLog, activeFolder, prefsHydrated]);

  const handleUndoAutoResolve = useCallback(
    (entry: AutoResolveLogEntry) => {
      if (entry.undone) return;
      autoResolveSuppressedRef.current.add(entry.mailId);
      autoResolveHandledRef.current.delete(entry.mailId);
      if (entry.kind === "archive") {
        unarchiveMail(entry.mailId);
      } else if (entry.kind === "reply_draft") {
        setMails((p) =>
          p.map((m) =>
            m.id === entry.mailId
              ? { ...m, openmailAutoReplyDraft: undefined }
              : m
          )
        );
      } else if (entry.kind === "mark_done") {
        setMails((p) =>
          p.map((m) =>
            m.id === entry.mailId ? { ...m, resolved: false } : m
          )
        );
      }
      setAutoResolveLog((prev) =>
        prev.map((e) => (e.id === entry.id ? { ...e, undone: true } : e))
      );
    },
    [setMails, unarchiveMail]
  );

  /** Learned/default tone when the selected message changes (live GPT suggestions load in `useEffect`). */
  useLayoutEffect(() => {
    const mailId = selectedMail?.id;
    const mailChanged = mailId !== prevMailIdRef.current;
    if (mailId) prevMailIdRef.current = mailId;
    else prevMailIdRef.current = undefined;

    const toneForApply: ReplyTone = (() => {
      if (!mailChanged) return replyToneRef.current;
      if (!prefsHydrated || !behavior.hydrated) return replyToneRef.current;
      if (aiPrefs.learnFromUsage) {
        const learned = behavior.getLearnedTone();
        if (learned) return learned as ReplyTone;
      }
      return aiPrefs.defaultTone as ReplyTone;
    })();

    if (mailChanged && prefsHydrated && behavior.hydrated) {
      setReplyTone(toneForApply);
    }
  }, [
    selectedMail?.id,
    prefsHydrated,
    behavior.hydrated,
    aiPrefs.learnFromUsage,
    aiPrefs.defaultTone,
  ]);

  /** Load live GPT reply variants when the open message / tone / classification context changes. */
  useEffect(() => {
    if (!selectedMail) {
      prefillDigestRef.current = null;
      setReplyState({ suggestions: [], selectedIndex: -1, currentReply: "" });
      setSendError(null);
      setSendSuccess(null);
      return;
    }

    const ac = new AbortController();
    void refreshLiveReplySuggestions({ signal: ac.signal });

    return () => {
      ac.abort();
    };
  }, [
    selectedMail?.id,
    mailAnalysisSig,
    classificationKey,
    coreAction,
    replyTone,
    refreshLiveReplySuggestions,
  ]);

  /** Guardian Auto Response: when policy + settings allow, send the top GPT draft without tapping Send. */
  useEffect(() => {
    const s = guardianAutoEffectSnapshot;
    if (!s.prefsHydrated) return;
    if (!s.guardianPref) return;
    if (s.mode !== "auto_send") return;
    if (!s.mailId) return;
    if (s.activeFolder !== "inbox") return;
    if (s.readingMailId && s.readingMailId === s.mailId) return;
    if (s.coreAction !== "reply") return;
    if (s.aiReplyLoading || s.sending) return;
    const body = s.replyBody.trim();
    if (!body) return;
    if (guardianAutoHandledRef.current.has(s.mailId)) return;

    guardianAutoHandledRef.current.add(s.mailId);
    void (async () => {
      try {
        setSending(true);
        setSendError(null);
        setSendSuccess(null);
        const { imapReadOnly } = await sendReplyMail(s.mailId, body, {
          guardianAuto: true,
        });
        toast.success(
          imapReadOnly
            ? `Reply auto-sent by AI. ${OPENMAIL_IMAP_PREVIEW_SENT_NOTE}`
            : "Reply auto-sent by AI"
        );
        setSendSuccess("Auto-sent by AI");
        window.setTimeout(() => setSendSuccess(null), 4000);
        coreReplyCacheRef.current.delete(s.mailId);
        await refreshLiveReplySuggestions({ skipCache: true });
      } catch (err) {
        guardianAutoHandledRef.current.delete(s.mailId);
        const msg = err instanceof Error ? err.message : "Auto-send failed";
        toast.error(msg);
        setSendError(msg);
      } finally {
        setSending(false);
      }
    })();
  }, [
    guardianAutoEffectSnapshot,
    sendReplyMail,
    toast,
    refreshLiveReplySuggestions,
  ]);

  useEffect(() => {
    const p = prefillDigestRef.current;
    if (!p || !selectedMail || selectedMail.id !== p.mailId) return;
    const t = replyBodyRef.current.trim();
    if (!t || manualEditLoggedRef.current === p.mailId) return;
    if (t === p.text) return;
    const timer = window.setTimeout(() => {
      if (manualEditLoggedRef.current === p.mailId) return;
      const cur = replyBodyRef.current.trim();
      if (cur === p.text || cur.length < 4) return;
      manualEditLoggedRef.current = p.mailId;
      recordManualEditRef.current();
    }, 700);
    return () => window.clearTimeout(timer);
  }, [replyState.currentReply, selectedMail?.id]);

  function handleSelectMail(mail: ProcessedMail) {
    recordMailOpen(mail.id);
    setSelectedMailId(mail.id);
    setReadingMailId(null);
  }

  const confirmMailOpenRiskGate = useCallback(() => {
    setMailOpenRiskGate((g) => {
      if (!g) return null;
      const { mail } = g;
      queueMicrotask(() => {
        recordMailOpen(mail.id);
        setSelectedMailId(mail.id);
        setReadingMailId(mail.id);
      });
      return null;
    });
  }, [recordMailOpen, setSelectedMailId]);

  const cancelMailOpenRiskGate = useCallback(() => {
    setMailOpenRiskGate(null);
  }, []);

  const handleMailGateBlockReport = useCallback(() => {
    setMailOpenRiskGate((g) => {
      if (!g) return null;
      const id = g.mail.id;
      queueMicrotask(() => {
        setMails((prev) =>
          prev.map((m) =>
            m.id === id
              ? {
                  ...m,
                  important: true,
                  spam: true,
                  linkQuarantine: true,
                  read: true,
                }
              : m
          )
        );
        toast.success("Reported as phishing. Message quarantined for review.");
      });
      return null;
    });
  }, [setMails, toast]);

  function handleEnterReading(mail: ProcessedMail) {
    const g = guardianEvaluate("open_mail", {
      mailId: mail.id,
      subject: mail.subject,
      sender: mail.sender || mail.title,
      preview: mail.preview,
      mailAiRisk: getMailAiRiskBand(mail),
    });
    recordGuardianTrace(g, "client:open_mail");
    if (g.decision === "allow") {
      recordMailOpen(mail.id);
      setSelectedMailId(mail.id);
      setReadingMailId(mail.id);
      return;
    }
    if (g.decision === "block") {
      setMailOpenRiskGate({ mail, tier: "high" });
      return;
    }
    if (g.decision === "warn") {
      setMailOpenRiskGate({ mail, tier: "medium" });
      return;
    }
  }

  function handleExitReading() {
    setReadingMailId(null);
    setQuickClassifyPrompt(null);
  }

  const handleReadingArchive = useCallback(
    (mailId: string) => {
      archiveMail(mailId);
      toast.success("Archived");
    },
    [archiveMail, toast]
  );

  const handleReadingDelete = useCallback(
    (mailId: string) => {
      softDeleteMail(mailId);
      setSelectedMailId((id) => (id === mailId ? "" : id));
      toast.success("Message deleted");
    },
    [softDeleteMail, toast, setSelectedMailId]
  );

  useEffect(() => {
    if (!behavior.hydrated) return;
    if (!selectedMail || selectedMail.folder !== "inbox" || selectedMail.archived) return;
    /** Smart auto-filing surfaces when the user opens the message (reading overlay). */
    if (readingMailId !== selectedMail.id) return;
    if (quickPromptShownRef.current.has(selectedMail.id)) return;

    const senderLine = selectedMail.sender || selectedMail.title || "";
    const domain = domainFromSenderLine(senderLine);
    const autoKey = domain ?? senderLine.toLowerCase().trim();
    if (!autoKey) return;

    const suggestion = computeSmartFolderSuggestion(selectedMail, behavior.memory);
    if (!suggestion || suggestion.folder === "inbox") return;

    const always = alwaysFolderMapRef.current[autoKey];
    if (always) {
      behavior.recordFolderRoute(domain, senderLine, always);
      moveMailToSmartFolder(selectedMail.id, always);
      quickPromptShownRef.current.add(selectedMail.id);
      toast.success(`Filed to ${smartFolderLabel(always)} (always)`);
      return;
    }

    setQuickClassifyPrompt({
      open: true,
      mailId: selectedMail.id,
      folder: suggestion.folder,
      folderLabel: smartFolderLabel(suggestion.folder),
      confidencePct: suggestion.confidencePct,
      senderLine,
      domain,
    });
  }, [
    behavior.hydrated,
    behavior.memory,
    behavior.memoryVersion,
    selectedMail,
    readingMailId,
    moveMailToSmartFolder,
    behavior.recordFolderRoute,
    toast,
  ]);

  const closeQuickClassifyPrompt = useCallback(() => {
    setQuickClassifyPrompt(null);
  }, []);

  const handleQuickClassifyYes = useCallback(() => {
    const p = quickClassifyPrompt;
    if (!p) return;
    behavior.recordFolderRoute(p.domain, p.senderLine, p.folder);
    moveMailToSmartFolder(p.mailId, p.folder);
    quickPromptShownRef.current.add(p.mailId);
    setQuickClassifyPrompt(null);
    toast.success(`Moved to ${p.folderLabel}`);
  }, [quickClassifyPrompt, behavior, moveMailToSmartFolder, toast]);

  const handleQuickClassifyAlways = useCallback(() => {
    const p = quickClassifyPrompt;
    if (!p) return;
    const key = p.domain ?? p.senderLine.toLowerCase().trim();
    if (key) {
      const next = { ...alwaysFolderMapRef.current, [key]: p.folder };
      alwaysFolderMapRef.current = next;
      try {
        localStorage.setItem(SMART_FOLDER_ALWAYS_KEY, JSON.stringify(next));
      } catch {
        /* private mode */
      }
    }
    behavior.recordFolderRoute(p.domain, p.senderLine, p.folder);
    moveMailToSmartFolder(p.mailId, p.folder);
    quickPromptShownRef.current.add(p.mailId);
    setQuickClassifyPrompt(null);
    toast.success(`Always route similar mail to ${p.folderLabel}`);
  }, [quickClassifyPrompt, behavior, moveMailToSmartFolder, toast]);

  const handleQuickClassifyPickAlternate = useCallback(
    (folder: OpenmailSmartFolderId) => {
      const p = quickClassifyPrompt;
      if (!p) return;
      behavior.recordFolderRoute(p.domain, p.senderLine, folder);
      moveMailToSmartFolder(p.mailId, folder);
      quickPromptShownRef.current.add(p.mailId);
      setQuickClassifyPrompt(null);
      toast.success(`Moved to ${smartFolderLabel(folder)}`);
    },
    [quickClassifyPrompt, behavior, moveMailToSmartFolder, toast]
  );

  const handleRiskBlockSender = useCallback(async () => {
    if (!selectedMail) return;
    setRiskActionBusy("block");
    try {
      const senderToken =
        extractEmail(selectedMail.sender || "") ||
        extractEmail(selectedMail.title || "") ||
        (selectedMail.sender || selectedMail.title || "").trim().toLowerCase();
      if (!senderToken) {
        toast.error("No sender address to block.");
        return;
      }
      setMails((prev) =>
        prev.map((m) => {
          const token =
            extractEmail(m.sender || "") ||
            extractEmail(m.title || "") ||
            (m.sender || m.title || "").trim().toLowerCase();
          if (!token || token !== senderToken) return m;
          return { ...m, archived: true, read: true, spam: true };
        })
      );
      toast.success("Sender blocked and related threads hidden.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not block sender");
    } finally {
      setRiskActionBusy(null);
    }
  }, [selectedMail, setMails, toast]);

  const handleRiskReportPhishing = useCallback(async () => {
    if (!selectedMail) return;
    setRiskActionBusy("phishing");
    try {
      setMails((prev) =>
        prev.map((m) =>
          m.id === selectedMail.id
            ? { ...m, important: true, spam: true, linkQuarantine: true, read: true }
            : m
        )
      );
      toast.success("Reported as phishing. Message quarantined for review.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not report phishing");
    } finally {
      setRiskActionBusy(null);
    }
  }, [selectedMail, setMails, toast]);

  const handleRiskOpenSandbox = useCallback(async () => {
    if (!selectedMail) return;
    setRiskActionBusy("sandbox");
    try {
      const blob = `${selectedMail.content ?? ""}\n${selectedMail.preview ?? ""}`;
      const link = firstHttpUrl(blob);
      if (link) {
        window.open(
          `/openmail/safe-link?url=${encodeURIComponent(link)}&mode=isolated`,
          "_blank",
          "noopener,noreferrer"
        );
        return;
      }
      const firstAttachment = selectedMail.attachments?.[0];
      if (firstAttachment?.name) {
        window.open(
          `/openmail/safe-file?name=${encodeURIComponent(firstAttachment.name)}&type=${encodeURIComponent(firstAttachment.mimeType ?? "")}&mode=isolated`,
          "_blank",
          "noopener,noreferrer"
        );
        return;
      }
      toast.info("No link or attachment found to open in sandbox.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not open sandbox");
    } finally {
      setRiskActionBusy(null);
    }
  }, [selectedMail, toast]);

  const handleRiskMarkSafe = useCallback(async () => {
    if (!selectedMail) return;
    setRiskActionBusy("safe");
    try {
      setMails((prev) =>
        prev.map((m) =>
          m.id === selectedMail.id
            ? { ...m, spam: false, important: false, linkQuarantine: false }
            : m
        )
      );
      toast.success("Marked as safe.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not mark safe");
    } finally {
      setRiskActionBusy(null);
    }
  }, [selectedMail, setMails, toast]);

  const handleDecisionBlockAndReport = useCallback(async () => {
    if (!selectedMail) return;
    setRiskActionBusy("block");
    try {
      const senderToken =
        extractEmail(selectedMail.sender || "") ||
        extractEmail(selectedMail.title || "") ||
        (selectedMail.sender || selectedMail.title || "").trim().toLowerCase();
      setMails((prev) =>
        prev.map((m) => {
          const isSelected = m.id === selectedMail.id;
          const token =
            extractEmail(m.sender || "") ||
            extractEmail(m.title || "") ||
            (m.sender || m.title || "").trim().toLowerCase();
          const sameSender =
            !!senderToken && !!token && token === senderToken;
          if (isSelected) {
            return {
              ...m,
              important: true,
              spam: true,
              linkQuarantine: true,
              read: true,
              archived: true,
            };
          }
          if (sameSender) {
            return { ...m, archived: true, read: true, spam: true };
          }
          return m;
        })
      );
      toast.success("Blocked and reported.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not block and report");
    } finally {
      setRiskActionBusy(null);
    }
  }, [selectedMail, setMails, toast]);

  const handleDecisionArchive = useCallback(() => {
    if (!selectedMail) return;
    if (aiPrefs.learnFromUsage) behavior.recordIgnored(selectedMail.id);
    archiveMail(selectedMail.id);
    toast.success("Archived");
  }, [selectedMail, archiveMail, toast, aiPrefs.learnFromUsage, behavior]);

  const handleSelectSuggestion = useCallback(
    (index: number) => {
      setReplyState((prev) => {
        const picked = prev.suggestions[index] ?? "";
        const mailId = selectedMail?.id;
        const action = coreAction as BehaviorCoreAction;
        const learn = aiPrefs.learnFromUsage;
        queueMicrotask(() => {
          if (mailId && learn && picked.trim()) {
            behavior.recordSuggestionSelected(action, picked);
          }
        });
        return {
          ...prev,
          selectedIndex: index,
          currentReply: applyReplyTone(picked, replyTone),
        };
      });
    },
    [selectedMail?.id, coreAction, replyTone, aiPrefs.learnFromUsage, behavior]
  );

  const generateAIReply = useCallback(
    async (_opts?: { suggestionIndex?: number }) => {
      if (!selectedMail) {
        toast.info("Select a message");
        return;
      }
      await refreshLiveReplySuggestions({
        skipCache: true,
        prefillEditor: true,
      });
    },
    [selectedMail, toast, refreshLiveReplySuggestions]
  );

  const insertGuardianSuggestedDraft = useCallback(async () => {
    if (!selectedMail) {
      toast.info("Select a message");
      return;
    }
    if (evaluateGuardianAutoResponse(selectedMail) === "block") {
      toast.error(guardianAutoResponseDescription("block"));
      return;
    }
    const mailId = selectedMail.id;
    const ctx = buildEmailContextForAi(selectedMail);
    const risk = getMailAiRiskBand(selectedMail);

    setGuardianDraftLoading(true);
    setSendError(null);
    try {
      if (OPENMAIL_DEMO_MODE) {
        const text = guardianSafeReplyFallback({ email: ctx, risk });
        setReplyState((prev) => {
          if (liveReplyMailIdRef.current !== mailId) return prev;
          prefillDigestRef.current = { mailId, text: text.trim() };
          manualEditLoggedRef.current = null;
          return {
            ...prev,
            currentReply: text,
            selectedIndex: -1,
          };
        });
        return;
      }

      const res = await fetch("/api/ai-reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "guardian",
          email: ctx,
          risk,
        }),
      });
      const data = (await res.json()) as { reply?: string; error?: string };
      if (!res.ok) {
        throw new Error(data.error || "Could not generate Guardian reply");
      }
      const reply = typeof data.reply === "string" ? data.reply.trim() : "";
      if (!reply) throw new Error("Empty Guardian reply");

      setReplyState((prev) => {
        if (liveReplyMailIdRef.current !== mailId) return prev;
        prefillDigestRef.current = { mailId, text: reply };
        manualEditLoggedRef.current = null;
        return {
          ...prev,
          currentReply: reply,
          selectedIndex: -1,
        };
      });
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Guardian reply failed";
      toast.error(msg);
    } finally {
      setGuardianDraftLoading(false);
    }
  }, [selectedMail, toast]);

  function handleToneChange(tone: ReplyTone) {
    if (aiPrefs.learnFromUsage) {
      behavior.recordTone(tone as BehaviorTone);
    }
    setReplyTone(tone);
    setReplyState((prev) => {
      const fromSuggestion =
        prev.selectedIndex >= 0 && prev.selectedIndex < prev.suggestions.length
          ? prev.suggestions[prev.selectedIndex]
          : prev.currentReply;
      return { ...prev, currentReply: applyReplyTone(fromSuggestion, tone) };
    });
  }

  const handleApplyTopSuggestion = useCallback(() => {
    setReplyState((prev) => {
      const best = prev.suggestions[0] ?? "";
      const mailId = selectedMail?.id;
      const action = coreAction as BehaviorCoreAction;
      const learn = aiPrefs.learnFromUsage;
      queueMicrotask(() => {
        if (mailId && learn && best.trim()) {
          behavior.recordSuggestionSelected(action, best);
        }
      });
      return {
        ...prev,
        selectedIndex: 0,
        currentReply: applyReplyTone(best, replyTone),
      };
    });
  }, [selectedMail?.id, coreAction, replyTone, aiPrefs.learnFromUsage, behavior]);

  const handleProceed = useCallback(async () => {
    if (!selectedMail) return;
    if (coreAction === "ignore") {
      coreReplyCacheRef.current.delete(selectedMail.id);
      if (aiPrefs.learnFromUsage) behavior.recordIgnored(selectedMail.id);
      archiveMail(selectedMail.id);
      toast.success("Archived");
      return;
    }
    if (coreAction === "escalate") {
      coreReplyCacheRef.current.delete(selectedMail.id);
      if (aiPrefs.learnFromUsage) behavior.recordEscalation(selectedMail.id);
      setMails((prev) =>
        prev.map((m) =>
          m.id === selectedMail.id ? { ...m, important: true, read: true } : m
        )
      );
      toast.success("Flagged for follow-up");
      return;
    }

    if (evaluateGuardianAutoResponse(selectedMail) === "block") {
      toast.error(guardianAutoResponseDescription("block"));
      return;
    }

    if (coreAction === "reply" || coreAction === "schedule" || coreAction === "review") {
      return;
    }

    let raw = fallbackReplySuggestions(selectedMail, coreAction);
    if (aiPrefs.learnFromUsage && behavior.hydrated) {
      raw = behavior.rankSuggestions(raw, coreAction as BehaviorCoreAction);
    }
    const best = raw[0] ?? "";
    if (aiPrefs.learnFromUsage && best.trim()) {
      behavior.recordSuggestionSelected(coreAction as BehaviorCoreAction, best);
    }
    const body = applyReplyTone(best, replyTone).trim();
    if (!body) {
      toast.error("No suggestion to send");
      return;
    }

    setSending(true);
    setSendError(null);
    setSendSuccess(null);
    try {
      const { imapReadOnly } = await sendReplyMail(selectedMail.id, body);
      toast.success(
        imapReadOnly
          ? `Reply sent. ${OPENMAIL_IMAP_PREVIEW_SENT_NOTE}`
          : "Reply sent"
      );
      setSendSuccess("Reply sent");
      window.setTimeout(() => setSendSuccess(null), 4000);
      coreReplyCacheRef.current.delete(selectedMail.id);
      await refreshLiveReplySuggestions({ skipCache: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to send reply";
      toast.error(msg);
      setSendError(msg);
    } finally {
      setSending(false);
    }
  }, [
    selectedMail,
    coreAction,
    replyTone,
    aiPrefs.learnFromUsage,
    behavior,
    archiveMail,
    sendReplyMail,
    setMails,
    toast,
    refreshLiveReplySuggestions,
  ]);

  const handleCoreIgnore = useCallback(() => {
    if (!selectedMail) return;
    coreReplyCacheRef.current.delete(selectedMail.id);
    if (aiPrefs.learnFromUsage) behavior.recordIgnored(selectedMail.id);
    void refreshLiveReplySuggestions({ skipCache: true });
  }, [selectedMail, aiPrefs.learnFromUsage, behavior, refreshLiveReplySuggestions]);

  const handleCoreEscalate = useCallback(() => {
    if (!selectedMail) return;
    coreReplyCacheRef.current.delete(selectedMail.id);
    if (aiPrefs.learnFromUsage) behavior.recordEscalation(selectedMail.id);
    void refreshLiveReplySuggestions({ skipCache: true });
  }, [selectedMail, aiPrefs.learnFromUsage, behavior, refreshLiveReplySuggestions]);

  const handleCoreReplyWithSuggestion = useCallback(() => {
    if (!selectedMail) return;
    coreReplyCacheRef.current.delete(selectedMail.id);
    void refreshLiveReplySuggestions({ skipCache: true });
  }, [selectedMail, refreshLiveReplySuggestions]);

  async function handleSendReply() {
    if (!selectedMail) return;
    if (evaluateGuardianAutoResponse(selectedMail) === "block") {
      toast.error(guardianAutoResponseDescription("block"));
      return;
    }
    const body = replyState.currentReply.trim();
    if (!body) return;
    const baseline = applyReplyTone(
      replyState.suggestions[replyState.selectedIndex] ?? "",
      replyTone
    ).trim();
    if (
      aiPrefs.learnFromUsage &&
      baseline &&
      body !== baseline &&
      manualEditLoggedRef.current !== selectedMail.id
    ) {
      manualEditLoggedRef.current = selectedMail.id;
      behavior.recordManualEdit();
    }
    setSending(true);
    setSendError(null);
    setSendSuccess(null);
    try {
      const { imapReadOnly } = await sendReplyMail(selectedMail.id, body);
      toast.success(
        imapReadOnly
          ? `Reply sent. ${OPENMAIL_IMAP_PREVIEW_SENT_NOTE}`
          : "Reply sent"
      );
      setSendSuccess("Reply sent");
      window.setTimeout(() => setSendSuccess(null), 4000);
      coreReplyCacheRef.current.delete(selectedMail.id);
      await refreshLiveReplySuggestions({ skipCache: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to send reply";
      toast.error(msg);
      setSendError(msg);
    } finally {
      setSending(false);
    }
  }

  const folderLabel =
    activeFolder === "inbox"
      ? "Inbox"
      : activeFolder === "sent"
        ? "Sent"
        : activeFolder === "drafts"
          ? "Drafts"
          : activeFolder === "spam"
            ? "Spam"
            : activeFolder === "trash"
              ? "Trash"
              : "Archive";

  const scopedAccount =
    inboxScope !== "legacy"
      ? serverMailAccounts.find((a) => a.id === inboxScope)
      : undefined;

  const navProfilePrimary =
    inboxScope === "legacy"
      ? "Environment (legacy)"
      : scopedAccount?.email ?? "Mailbox";

  const navProfileSecondary = OPENMAIL_DEMO_MODE
    ? "Demo session"
    : "Local OpenMail";

  const autoResolvedVisible = useMemo(
    () => autoResolveLog.filter((e) => !e.undone).slice(0, 14),
    [autoResolveLog]
  );

  return (
    <>
    <MainLayout
      navAccountIdentity={navProfilePrimary}
      navProfilePrimary={navProfilePrimary}
      navProfileSecondary={navProfileSecondary}
      activeFolder={activeFolder}
      onFolderChange={handleSidebarFolderChange}
      customFolders={customFolderNames}
      onAddCustomFolder={handleAddCustomFolder}
      onRenameCustomFolder={handleRenameCustomFolder}
      onDeleteCustomFolder={handleDeleteCustomFolder}
      activeInboxSubfolder={activeInboxSubfolder}
      onSelectInboxSubfolder={handleSelectInboxSubfolder}
      sidebarImapSync={handleImapSyncAction}
      sidebarImapSyncing={isSyncing}
      sidebarAccountConnected={accountConnected}
      showSidebarMailboxActions={!OPENMAIL_DEMO_MODE}
      sidebarServerMailAccounts={serverMailAccounts}
      sidebarInboxScope={inboxScope}
      onSidebarInboxScopeChange={setInboxScopePersist}
      mails={visibleMails}
      selectedMail={selectedMail}
      onSelectMail={handleSelectMail}
      readingMailId={readingMailId}
      onEnterReading={handleEnterReading}
      onExitReading={handleExitReading}
      folderLabel={folderLabel}
      listLoading={activeFolder === "inbox" && mailsLoading}
      listFetchError={activeFolder === "inbox" ? mailsFetchError : null}
      onRetryListFetch={async () => {
        const r = await refreshMailsFromApi();
        if (r.ok) toast.success("Inbox loaded");
        else if (r.error) toast.error(r.error);
      }}
      inboxEmptyHintDb={!OPENMAIL_DEMO_MODE}
      imapSyncError={activeFolder === "inbox" ? syncError : null}
      imapSyncing={isSyncing}
      onDismissImapSyncError={clearSyncError}
      onRetryImapSync={handleImapSyncAction}
      onRefreshInbox={handleRefreshInbox}
      inboxRefreshing={inboxRefreshing}
      showInboxRefresh={!OPENMAIL_DEMO_MODE}
      listToolbar={{
        onRefresh: () => void handleRefreshInbox(),
        refreshBusy: inboxRefreshing,
        onMarkRead: handleListToolbarMarkRead,
        onDelete: handleListToolbarDelete,
        onMove: handleListToolbarMove,
        onArchive: handleListToolbarArchive,
        onSpam: handleListToolbarSpam,
        showMove:
          selectedMail == null || selectedMail.securityLevel !== "high_risk",
      }}
      actionLabel={actionLabel}
      onProceed={handleProceed}
      proceedBusy={sending}
      onApplyTopSuggestion={handleApplyTopSuggestion}
      onCoreIgnore={handleCoreIgnore}
      onCoreEscalate={handleCoreEscalate}
      onCoreReplyWithSuggestion={handleCoreReplyWithSuggestion}
      onRiskBlockSender={handleRiskBlockSender}
      onRiskReportPhishing={handleRiskReportPhishing}
      onRiskOpenSandbox={handleRiskOpenSandbox}
      onRiskMarkSafe={handleRiskMarkSafe}
      onDecisionBlockAndReport={handleDecisionBlockAndReport}
      onDecisionArchive={handleDecisionArchive}
      riskActionBusy={riskActionBusy}
      recommendedCoreAction={coreAction}
      replyState={replyState}
      onReplyChange={(text) =>
        setReplyState((prev) => ({
          ...prev,
          currentReply: text,
        }))
      }
      onSelectSuggestion={handleSelectSuggestion}
      replyTone={replyTone}
      onToneChange={handleToneChange}
      onSendReply={handleSendReply}
      sending={sending}
      sendError={sendError}
      sendSuccess={sendSuccess}
      onGenerateAiReply={generateAIReply}
      onGuardianAssistDraft={insertGuardianSuggestedDraft}
      aiReplyLoading={aiReplyLoading}
      guardianDraftLoading={guardianDraftLoading}
      guardianAutoResponseMode={guardianAutoResponseMode}
      guardianAutoResponseEnabled={aiPrefs.guardianAutoResponse}
      onComposeSent={handleComposeSent}
      onReadingArchive={handleReadingArchive}
      onReadingDelete={handleReadingDelete}
      onHoverPrefetchMail={handleHoverPrefetchMail}
      autoResolvedEntries={
        autoResolvedVisible.length > 0 ? autoResolvedVisible : undefined
      }
      onUndoAutoResolved={handleUndoAutoResolve}
      timeCompression={
        timeCompressionCopy
          ? {
              ...timeCompressionCopy,
              onResolveAll: handleResolveAll,
              busy: resolveAllBusy,
            }
          : undefined
      }
      quickClassifyPrompt={
        quickClassifyPrompt
          ? {
              mailId: quickClassifyPrompt.mailId,
              open: quickClassifyPrompt.open,
              suggestedFolder: quickClassifyPrompt.folder,
              folderLabel: quickClassifyPrompt.folderLabel,
              confidencePct: quickClassifyPrompt.confidencePct,
              onConfirm: handleQuickClassifyYes,
              onAlwaysApply: handleQuickClassifyAlways,
              onPickFolder: handleQuickClassifyPickAlternate,
              onDismiss: closeQuickClassifyPrompt,
            }
          : undefined
      }
    />
    {mailOpenRiskGate ? (
      <SecurityModal
        open
        variant="mailRiskGate"
        tier={mailOpenRiskGate.tier}
        highAlert={
          mailOpenRiskGate.tier === "high"
            ? mailOpenRiskGate.mail.highRiskUi
            : undefined
        }
        onBlockReport={
          mailOpenRiskGate.tier === "high"
            ? handleMailGateBlockReport
            : undefined
        }
        onConfirm={confirmMailOpenRiskGate}
        onCancel={cancelMailOpenRiskGate}
      />
    ) : null}
    </>
  );
}

export default function OpenMailPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[var(--bg-main)] text-[13px] text-[color:var(--text-soft)]">
          Loading…
        </div>
      }
    >
      <OpenMailPageContent />
    </Suspense>
  );
}
