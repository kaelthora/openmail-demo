"use client";

import { useCallback, useRef, useState } from "react";
import type { OpenmailSidebarFolderId } from "@/lib/openmailNavFolders";
import type { OpenmailSmartFolderId, ProcessedMail } from "@/lib/mailTypes";
import type { ServerInboxScope, ServerMailAccountSummary } from "@/lib/serverInboxTypes";
import type { TimeCompressionPanelProps } from "@/lib/openmailTimeCompression";
import type { SettingsSection } from "@/lib/openmailSettingsPrefs";
import type { GuardianAutoResponseMode } from "@/lib/guardianAutoResponse";
import { useOpenmailPreferences } from "../OpenmailPreferencesProvider";
import { useMailStore } from "../MailStoreProvider";
import { OPENMAIL_DEMO_MODE } from "@/lib/openmailDemo";
import { isInboxOnboardingFetchMessage } from "@/lib/legacyImapEnvMissing";
import type { CoreRecommendedAction, ReplyState, ReplyTone } from "./types";
import { ComposeEmailModal, type ComposeEmailDraft } from "./ComposeEmailModal";
import { OpenmailSettingsPanel } from "./OpenmailSettingsPanel";
import { Sidebar } from "./Sidebar";
import { MailPanel, type AutoResolvedMailboxEntry } from "./MailPanel";
import { AIPanel } from "./AIPanel";
import { OpenMailTopNav } from "./OpenMailTopNav";
export type { CoreRecommendedAction } from "./types";

type MainLayoutProps = {
  /** Shown in top bar as account identity + breadcrumb. */
  navAccountIdentity: string;
  navProfilePrimary: string;
  navProfileSecondary?: string | null;
  activeFolder: OpenmailSidebarFolderId;
  onFolderChange: (folder: OpenmailSidebarFolderId) => void;
  customFolders?: string[];
  onAddCustomFolder?: (name: string) => void;
  onRenameCustomFolder?: (oldName: string, newName: string) => void;
  onDeleteCustomFolder?: (name: string) => void;
  activeInboxSubfolder?: string | null;
  onSelectInboxSubfolder?: (name: string | null) => void;
  sidebarImapSync?: () => void | Promise<void>;
  sidebarImapSyncing?: boolean;
  sidebarAccountConnected?: boolean;
  showSidebarMailboxActions?: boolean;
  sidebarServerMailAccounts?: ServerMailAccountSummary[];
  sidebarInboxScope?: ServerInboxScope;
  onSidebarInboxScopeChange?: (scope: ServerInboxScope) => void;
  mails: ProcessedMail[];
  selectedMail: ProcessedMail | null;
  onSelectMail: (mail: ProcessedMail) => void;
  readingMailId: string | null;
  onEnterReading: (mail: ProcessedMail) => void;
  onExitReading: () => void;
  folderLabel: string;
  listLoading?: boolean;
  listFetchError?: string | null;
  /** No env + no saved mailbox — inbox list shows connect flow instead of error. */
  showInboxOnboarding?: boolean;
  onRetryListFetch?: () => void | Promise<void>;
  /** Show DB/sync hint when inbox is empty (non-demo) */
  inboxEmptyHintDb?: boolean;
  imapSyncError?: string | null;
  imapSyncing?: boolean;
  onDismissImapSyncError?: () => void;
  onRetryImapSync?: () => void | Promise<void>;
  onRefreshInbox?: () => void | Promise<void>;
  inboxRefreshing?: boolean;
  showInboxRefresh?: boolean;
  actionLabel: string;
  onProceed: () => void | Promise<void>;
  proceedBusy?: boolean;
  onApplyTopSuggestion?: () => void;
  onCoreIgnore?: () => void;
  onCoreEscalate?: () => void;
  onCoreReplyWithSuggestion?: () => void;
  onRiskBlockSender?: () => void | Promise<void>;
  onRiskReportPhishing?: () => void | Promise<void>;
  onRiskOpenSandbox?: () => void | Promise<void>;
  onRiskMarkSafe?: () => void | Promise<void>;
  /** High-risk Decision Engine primary: block sender + report phishing in one step. */
  onDecisionBlockAndReport?: () => void | Promise<void>;
  /** Safe / medium secondary: archive message (Ignore or Archive label in UI). */
  onDecisionArchive?: () => void | Promise<void>;
  riskActionBusy?: "block" | "phishing" | "sandbox" | "safe" | null;
  recommendedCoreAction?: CoreRecommendedAction | null;
  replyState: ReplyState;
  onReplyChange: (text: string) => void;
  onSelectSuggestion: (index: number) => void;
  replyTone: ReplyTone;
  onToneChange: (tone: ReplyTone) => void;
  onSendReply: () => void;
  sending: boolean;
  sendError: string | null;
  sendSuccess: string | null;
  onGenerateAiReply?: (opts?: { suggestionIndex?: number }) => Promise<void>;
  /** Fills the reply draft from Guardian-approved / fetched text; never sends. */
  onGuardianAssistDraft?: () => void | Promise<void>;
  aiReplyLoading?: boolean;
  guardianDraftLoading?: boolean;
  guardianAutoResponseMode?: GuardianAutoResponseMode;
  guardianAutoResponseEnabled?: boolean;
  /** Composer send — may POST `/api/emails/send`; reject to keep draft open. */
  onComposeSent?: (draft: ComposeEmailDraft) => void | Promise<void>;
  onReadingArchive?: (mailId: string) => void;
  onReadingDelete?: (mailId: string) => void;
  onHoverPrefetchMail?: (mailId: string | null) => void;
  autoResolvedEntries?: AutoResolvedMailboxEntry[];
  onUndoAutoResolved?: (entry: AutoResolvedMailboxEntry) => void;
  /** Inbox: time estimate + batch resolve all (high-confidence auto-resolve). */
  timeCompression?: TimeCompressionPanelProps;
  quickClassifyPrompt?: {
    mailId: string;
    open: boolean;
    suggestedFolder: OpenmailSmartFolderId;
    folderLabel: string;
    confidencePct: number;
    onConfirm: () => void;
    onAlwaysApply: () => void;
    onPickFolder: (folder: OpenmailSmartFolderId) => void;
    onDismiss: () => void;
  };
  listToolbar?: {
    onRefresh: () => void;
    refreshBusy?: boolean;
    onMarkRead: () => void;
    onDelete: () => void;
    onMove: (folder: OpenmailSmartFolderId) => void;
    onArchive: () => void;
    onSpam: () => void;
    /** When false, hide non-critical “Move to folder” (e.g. HIGH RISK mail selected). */
    showMove?: boolean;
  } | null;
};

export function MainLayout({
  navAccountIdentity,
  navProfilePrimary,
  navProfileSecondary,
  activeFolder,
  onFolderChange,
  customFolders = [],
  onAddCustomFolder,
  onRenameCustomFolder,
  onDeleteCustomFolder,
  activeInboxSubfolder = null,
  onSelectInboxSubfolder,
  sidebarImapSync,
  sidebarImapSyncing = false,
  sidebarAccountConnected = false,
  showSidebarMailboxActions = false,
  sidebarServerMailAccounts = [],
  sidebarInboxScope = "legacy",
  onSidebarInboxScopeChange,
  mails,
  selectedMail,
  onSelectMail,
  readingMailId,
  onEnterReading,
  onExitReading,
  folderLabel,
  listLoading = false,
  listFetchError = null,
  showInboxOnboarding = false,
  onRetryListFetch,
  inboxEmptyHintDb = false,
  imapSyncError = null,
  imapSyncing = false,
  onDismissImapSyncError,
  onRetryImapSync,
  onRefreshInbox,
  inboxRefreshing = false,
  showInboxRefresh = false,
  actionLabel,
  onProceed,
  proceedBusy = false,
  onApplyTopSuggestion,
  onCoreIgnore,
  onCoreEscalate,
  onCoreReplyWithSuggestion,
  onRiskBlockSender,
  onRiskReportPhishing,
  onRiskOpenSandbox,
  onRiskMarkSafe,
  onDecisionBlockAndReport,
  onDecisionArchive,
  riskActionBusy = null,
  recommendedCoreAction = null,
  replyState,
  onReplyChange,
  onSelectSuggestion,
  replyTone,
  onToneChange,
  onSendReply,
  sending,
  sendError,
  sendSuccess,
  onGenerateAiReply,
  onGuardianAssistDraft,
  aiReplyLoading = false,
  guardianDraftLoading = false,
  guardianAutoResponseMode = "require_validation",
  guardianAutoResponseEnabled = false,
  onComposeSent,
  onReadingArchive,
  onReadingDelete,
  onHoverPrefetchMail,
  autoResolvedEntries,
  onUndoAutoResolved,
  timeCompression,
  quickClassifyPrompt,
  listToolbar = null,
}: MainLayoutProps) {
  const { mailsFetchError: storeListFetchError } = useMailStore();
  const listErrorCombined = listFetchError ?? storeListFetchError ?? null;
  /** Prop OR legacy env message in store (fixes silent refresh leaving stale error). */
  const inboxOnboardingUiActive =
    showInboxOnboarding ||
    (!OPENMAIL_DEMO_MODE &&
      !!listErrorCombined &&
      isInboxOnboardingFetchMessage(listErrorCombined));
  const effectiveListFetchError = inboxOnboardingUiActive
    ? null
    : (listFetchError ?? null);
  const prefs = useOpenmailPreferences();
  const listSearchInputRef = useRef<HTMLInputElement>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const toggleSidebar = useCallback(() => setSidebarOpen((o) => !o), []);
  const [composeOpen, setComposeOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [accountsAddModeIntent, setAccountsAddModeIntent] = useState<
    "quick" | "manual" | null
  >(null);

  const openSettingsSection = useCallback(
    (section: SettingsSection) => {
      prefs.setActiveSection(section);
      setAccountsAddModeIntent(null);
      setSettingsOpen(true);
    },
    [prefs]
  );

  const openAccountsConnectFlow = useCallback(
    (mode: "quick" | "manual") => {
      prefs.setActiveSection("accounts");
      setAccountsAddModeIntent(mode);
      setSettingsOpen(true);
    },
    [prefs]
  );

  const handleCloseSettings = useCallback(() => {
    setSettingsOpen(false);
    setAccountsAddModeIntent(null);
  }, []);

  const consumeAccountsAddModeIntent = useCallback(() => {
    setAccountsAddModeIntent(null);
  }, []);

  const focusListSearch = useCallback(() => {
    const el = listSearchInputRef.current;
    if (!el) return;
    el.focus();
    el.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, []);

  return (
    <div className="openmail-app flex h-screen flex-col bg-[var(--bg-main)] text-[var(--text-main)]">
      <OpenMailTopNav
        accountIdentity={navAccountIdentity}
        folderLabel={folderLabel}
        sidebarOpen={sidebarOpen}
        onToggleSidebar={toggleSidebar}
        onFocusSearch={focusListSearch}
        onSettingsPanelOpen={() => {
          setAccountsAddModeIntent(null);
          setSettingsOpen(true);
        }}
        profilePrimary={navProfilePrimary}
        profileSecondary={navProfileSecondary}
      />
      <div className="flex min-h-0 flex-1 gap-[var(--openmail-layout-gap,1.25rem)] px-5 pb-6 pt-4">
        {sidebarOpen ? (
          <Sidebar
            activeFolder={activeFolder}
            onFolderChange={onFolderChange}
            customFolders={customFolders}
            onAddCustomFolder={onAddCustomFolder}
            onRenameCustomFolder={onRenameCustomFolder}
            onDeleteCustomFolder={onDeleteCustomFolder}
            activeInboxSubfolder={activeInboxSubfolder}
            onSelectInboxSubfolder={onSelectInboxSubfolder}
            onCompose={() => setComposeOpen(true)}
            onImapSync={sidebarImapSync}
            imapSyncing={sidebarImapSyncing}
            accountConnected={sidebarAccountConnected}
            showMailboxActions={showSidebarMailboxActions}
            serverMailAccounts={sidebarServerMailAccounts}
            inboxScope={sidebarInboxScope}
            onInboxScopeChange={onSidebarInboxScopeChange}
          />
        ) : null}
        <div className="flex min-h-0 min-w-0 flex-1 gap-5">
          <MailPanel
            mails={mails}
            selectedMail={selectedMail}
            onSelectMail={onSelectMail}
            readingMailId={readingMailId}
            onEnterReading={onEnterReading}
            onExitReading={onExitReading}
            folderLabel={folderLabel}
            listLoading={listLoading}
            listFetchError={effectiveListFetchError}
            showInboxOnboarding={inboxOnboardingUiActive}
            onInboxConnectGmail={() => openAccountsConnectFlow("quick")}
            onInboxManualSetup={() => openAccountsConnectFlow("manual")}
            onRetryListFetch={onRetryListFetch}
            inboxEmptyHintDb={inboxEmptyHintDb}
            imapSyncError={imapSyncError}
            imapSyncing={imapSyncing}
            onDismissImapSyncError={onDismissImapSyncError}
            onRetryImapSync={onRetryImapSync}
            onRefreshInbox={onRefreshInbox}
            inboxRefreshing={inboxRefreshing}
            showInboxRefresh={showInboxRefresh}
            listSearchInputRef={listSearchInputRef}
            onReadingArchive={onReadingArchive}
            onReadingDelete={onReadingDelete}
            onHoverPrefetchMail={onHoverPrefetchMail}
            autoResolvedEntries={autoResolvedEntries}
            onUndoAutoResolved={onUndoAutoResolved}
            timeCompression={timeCompression}
            smartFilingPrompt={quickClassifyPrompt ?? null}
            listToolbar={listToolbar}
          />
          <AIPanel
            selectedMail={selectedMail}
            readingMailId={readingMailId}
            actionLabel={actionLabel}
            onProceed={onProceed}
            proceedBusy={proceedBusy}
            onApplyTopSuggestion={onApplyTopSuggestion}
            onCoreIgnore={onCoreIgnore}
            onCoreEscalate={onCoreEscalate}
            onCoreReplyWithSuggestion={onCoreReplyWithSuggestion}
            onRiskBlockSender={onRiskBlockSender}
            onRiskReportPhishing={onRiskReportPhishing}
            onRiskOpenSandbox={onRiskOpenSandbox}
            onRiskMarkSafe={onRiskMarkSafe}
            onDecisionBlockAndReport={onDecisionBlockAndReport}
            onDecisionArchive={onDecisionArchive}
            riskActionBusy={riskActionBusy}
            recommendedCoreAction={recommendedCoreAction}
            replyState={replyState}
            onReplyChange={onReplyChange}
            onSelectSuggestion={onSelectSuggestion}
            replyTone={replyTone}
            onToneChange={onToneChange}
            onSendReply={onSendReply}
            sending={sending}
            sendError={sendError}
            sendSuccess={sendSuccess}
            onGenerateAiReply={onGenerateAiReply}
            onGuardianAssistDraft={onGuardianAssistDraft}
            aiReplyLoading={aiReplyLoading}
            guardianDraftLoading={guardianDraftLoading}
            guardianAutoResponseMode={guardianAutoResponseMode}
            guardianAutoResponseEnabled={guardianAutoResponseEnabled}
          />
        </div>
      </div>
      <ComposeEmailModal
        open={composeOpen}
        onClose={() => setComposeOpen(false)}
        onSend={(draft) => onComposeSent?.(draft)}
      />
      <OpenmailSettingsPanel
        open={settingsOpen}
        onClose={handleCloseSettings}
        accountsInitialAddMode={accountsAddModeIntent}
        onAccountsInitialAddModeConsumed={consumeAccountsAddModeIntent}
      />
    </div>
  );
}
