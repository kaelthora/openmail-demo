"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useMailStore } from "./MailStoreProvider";
import { useOpenmailToast } from "./OpenmailToastProvider";
import type { ProcessedMail } from "@/lib/mailTypes";
import { processMails } from "@/lib/mailProcess";
import { OPENMAIL_DEMO_MODE } from "@/lib/openmailDemo";
import { useOpenmailPreferences } from "./OpenmailPreferencesProvider";
import { MainLayout } from "./components/MainLayout";
import type { ComposeEmailDraft } from "./components/ComposeEmailModal";
import type { ReplyState, ReplyTone } from "./components/types";

type CoreAction = "reply" | "schedule" | "ignore" | "escalate";

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
  return "Escalate";
}

function getActionSummary(mail: ProcessedMail | null, action: CoreAction): string {
  if (!mail) return "Inbox is clear — nothing needs you right now.";
  if (action === "escalate") return "Do not rush a normal reply — get the right eyes on this first.";
  if (action === "ignore") return "This can be ignored.";
  if (action === "schedule") return "You should schedule this.";
  const s = mail.subject.toLowerCase();
  if (/meeting|calendar|invite|confirm/.test(s)) return "This needs a quick confirmation.";
  if (/invoice|payment/.test(s)) return "One line of acknowledgment is enough.";
  if (mail.needsReply) return "A short reply moves this forward.";
  return "You can handle this in 5 seconds.";
}

function getPrimaryActionLabel(action: CoreAction, mail: ProcessedMail | null): string {
  if (!mail) return "Acknowledge";
  if (action === "escalate") return "Escalate";
  if (action === "ignore") return "Dismiss";
  if (action === "schedule") return "Schedule";
  const s = mail.subject.toLowerCase();
  if (/meeting|calendar|invite|confirm/.test(s)) return "Confirm";
  return "Acknowledge";
}

function relevanceScore(mail: ProcessedMail): number {
  const s = mail.subject.toLowerCase();
  let score = mail.priorityScore ?? 0;
  if (mail.priority === "urgent") score += 80;
  if (mail.needsReply) score += 40;
  if (/urgent|asap|immediately|alert|security|critical/.test(s)) score += 60;
  if (/invoice|payment|meeting|confirm|calendar|invite/.test(s)) score += 25;
  if (mail.read === false) score += 10;
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

function coreActionFromSynced(mail: ProcessedMail | null): CoreAction | null {
  const a = mail?.syncedAi?.action;
  if (a === "reply" || a === "ignore" || a === "escalate") return a;
  return null;
}

/** Prefer DB `suggestions` when present; otherwise heuristic `buildSuggestions`. */
function getCoreSuggestions(mail: ProcessedMail | null, action: CoreAction): string[] {
  const synced = mail?.syncedAi?.suggestions;
  if (synced && synced.length > 0) return synced;
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

export default function OpenMailPage() {
  const {
    mails,
    selectedMailId,
    setSelectedMailId,
    markMailRead,
    sendReplyMail,
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
  } = useMailStore();
  const toast = useOpenmailToast();
  const { hydrated: prefsHydrated, ai: aiPrefs } = useOpenmailPreferences();
  const [inboxRefreshing, setInboxRefreshing] = useState(false);
  const [activeFolder, setActiveFolder] = useState<"inbox" | "sent" | "drafts">("inbox");
  const [replyTone, setReplyTone] = useState<ReplyTone>("Professional");

  useEffect(() => {
    if (!prefsHydrated) return;
    setReplyTone(aiPrefs.defaultTone);
  }, [prefsHydrated, aiPrefs.defaultTone]);
  const [replyState, setReplyState] = useState<ReplyState>({
    suggestions: [],
    selectedIndex: 0,
    currentReply: "",
  });
  const [readingMailId, setReadingMailId] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendSuccess, setSendSuccess] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const processed = useMemo(() => processMails(mails), [mails]);
  const visibleMails = useMemo(
    () => processed.filter((mail) => !mail.deleted && mail.folder === activeFolder),
    [processed, activeFolder]
  );
  const selectedMail = useMemo(() => {
    const byId = visibleMails.find((mail) => mail.id === selectedMailId);
    if (byId) return byId;
    if (visibleMails.length === 0) return null;
    return pickMostRelevantMail(visibleMails);
  }, [visibleMails, selectedMailId]);

  const coreAction = useMemo(() => {
    const fromDb = coreActionFromSynced(selectedMail);
    if (fromDb) return fromDb;
    return detectCoreAction(selectedMail);
  }, [selectedMail]);

  const actionLabel = formatActionLabel(coreAction);
  const coreSummary = useMemo(() => {
    const fromDb = selectedMail?.syncedAi?.summary?.trim();
    if (fromDb) return fromDb;
    return getActionSummary(selectedMail, coreAction);
  }, [selectedMail, coreAction]);

  const primaryActionLabel = getPrimaryActionLabel(coreAction, selectedMail);

  const handleComposeSent = useCallback(
    (draft: ComposeEmailDraft) => {
      const hasTo = draft.to.trim().length > 0;
      toast.success(
        hasTo
          ? `Message queued (demo) — to ${draft.to.trim()}`
          : "Message queued (demo)"
      );
    },
    [toast]
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

  const syncedAiKey = useMemo(() => {
    const sa = selectedMail?.syncedAi;
    if (!sa) return "";
    return [
      sa.risk,
      sa.summary,
      sa.reason ?? "",
      sa.action ?? "",
      sa.suggestions.join("\n"),
    ].join("\x1e");
  }, [selectedMail?.syncedAi]);

  useEffect(() => {
    if (visibleMails.length === 0) {
      if (selectedMailId) setSelectedMailId("");
      return;
    }
    const exists = visibleMails.some((mail) => mail.id === selectedMailId);
    if (!exists || !selectedMailId) {
      const best = pickMostRelevantMail(visibleMails);
      if (best) setSelectedMailId(best.id);
    }
  }, [visibleMails, selectedMailId, setSelectedMailId]);

  useEffect(() => {
    setReadingMailId(null);
  }, [activeFolder]);

  function applyTone(input: string, tone: ReplyTone): string {
    const text = input.trim();
    if (!text) return "";
    if (tone === "Friendly") return `${text} Thanks!`;
    if (tone === "Direct") return text.replace(/^Thanks for the note\.?\s*/i, "");
    if (tone === "Short") return text.split(".")[0]?.trim() || text;
    return text;
  }

  useEffect(() => {
    if (selectedMail) {
      markMailRead(selectedMail.id);
    }
    const suggestions = getCoreSuggestions(selectedMail, coreAction);
    const best = suggestions[0] ?? "";
    setReplyState({
      suggestions,
      selectedIndex: 0,
      currentReply: applyTone(best, replyTone),
    });
    setSendError(null);
    setSendSuccess(null);
  }, [selectedMail?.id, syncedAiKey, replyTone, markMailRead, coreAction]);

  function handleSelectMail(mail: ProcessedMail) {
    setSelectedMailId(mail.id);
    setReadingMailId(null);
  }

  function handleEnterReading(mail: ProcessedMail) {
    setSelectedMailId(mail.id);
    setReadingMailId(mail.id);
  }

  function handleExitReading() {
    setReadingMailId(null);
  }

  function handleSelectSuggestion(index: number) {
    setReplyState((prev) => {
      const picked = prev.suggestions[index] ?? "";
      return {
        ...prev,
        selectedIndex: index,
        currentReply: applyTone(picked, replyTone),
      };
    });
  }

  function handleToneChange(tone: ReplyTone) {
    setReplyTone(tone);
    setReplyState((prev) => {
      const fromSuggestion = prev.suggestions[prev.selectedIndex] ?? prev.currentReply;
      return { ...prev, currentReply: applyTone(fromSuggestion, tone) };
    });
  }

  function handlePrimaryAction() {
    setReplyState((prev) => {
      const best = prev.suggestions[0] ?? "";
      return {
        ...prev,
        selectedIndex: 0,
        currentReply: applyTone(best, replyTone),
      };
    });
  }

  async function handleSendReply() {
    if (!selectedMail) return;
    const body = replyState.currentReply.trim();
    if (!body) return;
    setSending(true);
    setSendError(null);
    setSendSuccess(null);
    try {
      await sendReplyMail(selectedMail.id, body);
      toast.success("Reply sent");
      setSendSuccess("Reply sent");
      window.setTimeout(() => setSendSuccess(null), 4000);
      const next = getCoreSuggestions(
        selectedMail,
        coreActionFromSynced(selectedMail) ?? detectCoreAction(selectedMail)
      );
      const best = next[0] ?? "";
      setReplyState({
        suggestions: next,
        selectedIndex: 0,
        currentReply: applyTone(best, replyTone),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to send reply";
      toast.error(msg);
      setSendError(msg);
    } finally {
      setSending(false);
    }
  }

  const navCenterTitle =
    activeFolder === "inbox"
      ? "Inbox"
      : activeFolder === "sent"
        ? "Sent"
        : "Drafts";

  return (
    <MainLayout
      navCenterTitle={navCenterTitle}
      activeFolder={activeFolder}
      onFolderChange={setActiveFolder}
      sidebarRefreshInbox={handleRefreshInbox}
      sidebarInboxRefreshing={inboxRefreshing}
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
      folderLabel={navCenterTitle}
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
      actionLabel={actionLabel}
      coreSummary={coreSummary}
      primaryActionLabel={primaryActionLabel}
      onPrimaryAction={handlePrimaryAction}
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
      onComposeSent={handleComposeSent}
    />
  );
}
