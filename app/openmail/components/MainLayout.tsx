"use client";

import { useCallback, useState } from "react";
import type { ProcessedMail } from "@/lib/mailTypes";
import type { ServerInboxScope, ServerMailAccountSummary } from "@/lib/serverInboxTypes";
import type { ReplyState, ReplyTone } from "./types";
import { ComposeEmailModal, type ComposeEmailDraft } from "./ComposeEmailModal";
import { OpenmailSettingsPanel } from "./OpenmailSettingsPanel";
import { Sidebar } from "./Sidebar";
import { MailPanel } from "./MailPanel";
import { AIPanel } from "./AIPanel";
import { OpenMailTopNav } from "./OpenMailTopNav";

type MainLayoutProps = {
  navCenterTitle?: string | null;
  onNavSearch?: () => void;
  activeFolder: "inbox" | "sent" | "drafts";
  onFolderChange: (folder: "inbox" | "sent" | "drafts") => void;
  sidebarRefreshInbox?: () => void | Promise<void>;
  sidebarInboxRefreshing?: boolean;
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
  coreSummary: string;
  primaryActionLabel: string;
  onPrimaryAction: () => void;
  replyState: ReplyState;
  onReplyChange: (text: string) => void;
  onSelectSuggestion: (index: number) => void;
  replyTone: ReplyTone;
  onToneChange: (tone: ReplyTone) => void;
  onSendReply: () => void;
  sending: boolean;
  sendError: string | null;
  sendSuccess: string | null;
  /** Mock composer send (no backend) */
  onComposeSent?: (draft: ComposeEmailDraft) => void;
};

export function MainLayout({
  navCenterTitle,
  onNavSearch,
  activeFolder,
  onFolderChange,
  sidebarRefreshInbox,
  sidebarInboxRefreshing = false,
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
  coreSummary,
  primaryActionLabel,
  onPrimaryAction,
  replyState,
  onReplyChange,
  onSelectSuggestion,
  replyTone,
  onToneChange,
  onSendReply,
  sending,
  sendError,
  sendSuccess,
  onComposeSent,
}: MainLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const toggleSidebar = useCallback(() => setSidebarOpen((o) => !o), []);
  const [composeOpen, setComposeOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <div className="openmail-app flex h-screen flex-col bg-[var(--bg-main)] text-[var(--text-main)]">
      <OpenMailTopNav
        centerTitle={navCenterTitle}
        sidebarOpen={sidebarOpen}
        onToggleSidebar={toggleSidebar}
        onNewEmail={() => setComposeOpen(true)}
        onSearchClick={onNavSearch}
        onSettingsClick={() => setSettingsOpen(true)}
      />
      <div className="flex min-h-0 flex-1 gap-[var(--openmail-layout-gap,1rem)] px-4 pb-4 pt-3">
        {sidebarOpen ? (
          <Sidebar
            activeFolder={activeFolder}
            onFolderChange={onFolderChange}
            onRefreshInbox={sidebarRefreshInbox}
            inboxRefreshing={sidebarInboxRefreshing}
            onImapSync={sidebarImapSync}
            imapSyncing={sidebarImapSyncing}
            accountConnected={sidebarAccountConnected}
            showMailboxActions={showSidebarMailboxActions}
            serverMailAccounts={sidebarServerMailAccounts}
            inboxScope={sidebarInboxScope}
            onInboxScopeChange={onSidebarInboxScopeChange}
          />
        ) : null}
        <div className="flex min-h-0 min-w-0 flex-1 gap-4">
          <MailPanel
            mails={mails}
            selectedMail={selectedMail}
            onSelectMail={onSelectMail}
            readingMailId={readingMailId}
            onEnterReading={onEnterReading}
            onExitReading={onExitReading}
            folderLabel={folderLabel}
            listLoading={listLoading}
            listFetchError={listFetchError}
            onRetryListFetch={onRetryListFetch}
            inboxEmptyHintDb={inboxEmptyHintDb}
            imapSyncError={imapSyncError}
            imapSyncing={imapSyncing}
            onDismissImapSyncError={onDismissImapSyncError}
            onRetryImapSync={onRetryImapSync}
            onRefreshInbox={onRefreshInbox}
            inboxRefreshing={inboxRefreshing}
            showInboxRefresh={showInboxRefresh}
          />
          <AIPanel
            selectedMail={selectedMail}
            actionLabel={actionLabel}
            coreSummary={coreSummary}
            primaryActionLabel={primaryActionLabel}
            onPrimaryAction={onPrimaryAction}
            replyState={replyState}
            onReplyChange={onReplyChange}
            onSelectSuggestion={onSelectSuggestion}
            replyTone={replyTone}
            onToneChange={onToneChange}
            onSendReply={onSendReply}
            sending={sending}
            sendError={sendError}
            sendSuccess={sendSuccess}
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
        onClose={() => setSettingsOpen(false)}
      />
    </div>
  );
}
