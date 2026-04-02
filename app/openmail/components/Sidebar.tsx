"use client";

import type {
  ServerInboxScope,
  ServerMailAccountSummary,
} from "@/lib/serverInboxTypes";

type SidebarProps = {
  activeFolder: "inbox" | "sent" | "drafts";
  onFolderChange: (folder: "inbox" | "sent" | "drafts") => void;
  onRefreshInbox?: () => void | Promise<void>;
  inboxRefreshing?: boolean;
  onImapSync?: () => void | Promise<void>;
  imapSyncing?: boolean;
  accountConnected?: boolean;
  showMailboxActions?: boolean;
  /** Server-side saved mailboxes + legacy env inbox */
  serverMailAccounts?: ServerMailAccountSummary[];
  inboxScope?: ServerInboxScope;
  onInboxScopeChange?: (scope: ServerInboxScope) => void;
};

export function Sidebar({
  activeFolder,
  onFolderChange,
  onRefreshInbox,
  inboxRefreshing = false,
  onImapSync,
  imapSyncing = false,
  accountConnected = false,
  showMailboxActions = false,
  serverMailAccounts = [],
  inboxScope = "legacy",
  onInboxScopeChange,
}: SidebarProps) {
  const folders: Array<{ id: "inbox" | "sent" | "drafts"; label: string }> = [
    { id: "inbox", label: "Inbox" },
    { id: "sent", label: "Sent" },
    { id: "drafts", label: "Drafts" },
  ];

  return (
    <aside className="openmail-sidebar card flex w-64 flex-col bg-[#111111] p-[var(--openmail-sidebar-pad,1rem)]">
      <h2 className="mb-3 text-sm font-semibold tracking-wide">Folders</h2>
      <nav className="flex flex-col gap-2">
        {folders.map((folder) => (
          <button
            key={folder.id}
            type="button"
            className={`rounded-[10px] border px-3 py-2 text-left text-sm transition-colors duration-150 ${
              activeFolder === folder.id
                ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text-main)] shadow-[0_0_10px_var(--accent-soft)]"
                : "border-[var(--border)] bg-[var(--bg-main)] text-[color:var(--text-soft)] hover:border-white/[0.12] hover:text-[var(--text-main)]"
            }`}
            onClick={() => onFolderChange(folder.id)}
          >
            {folder.label}
          </button>
        ))}
      </nav>

      {showMailboxActions && onRefreshInbox ? (
        <div className="mt-5 border-t border-white/[0.06] pt-4">
          <h3 className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-[color:var(--text-soft)]">
            Mailbox
          </h3>
          {onInboxScopeChange ? (
            <label className="mb-3 flex flex-col gap-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-[color:var(--text-soft)]">
                Inbox account
              </span>
              <select
                className="rounded-[10px] border border-white/[0.1] bg-[#0c0c0c] px-2.5 py-2 text-xs text-[var(--text-main)] outline-none focus:border-[var(--accent)]/50"
                value={inboxScope}
                onChange={(e) => {
                  const v = e.target.value;
                  onInboxScopeChange(v === "legacy" ? "legacy" : v);
                }}
              >
                <option value="legacy">Environment (legacy)</option>
                {serverMailAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.email}
                    {a.provider ? ` · ${a.provider}` : ""}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <div className="flex flex-col gap-2">
            <button
              type="button"
              disabled={inboxRefreshing}
              className="rounded-[10px] border border-[var(--border)] bg-[#0c0c0c] px-3 py-2 text-left text-xs font-medium text-[var(--text-main)] transition-colors hover:border-[var(--accent)]/45 disabled:cursor-not-allowed disabled:opacity-45"
              onClick={() => void onRefreshInbox()}
              title="Sync from IMAP into the database for the selected account, then reload the list"
            >
              {inboxRefreshing ? "Refreshing…" : "Refresh inbox"}
            </button>
            {accountConnected && onImapSync ? (
              <button
                type="button"
                disabled={imapSyncing}
                className="rounded-[10px] border border-white/[0.08] bg-[#0c0c0c] px-3 py-2 text-left text-xs font-medium text-[color:var(--text-soft)] transition-colors hover:border-amber-500/35 hover:text-[var(--text-main)] disabled:cursor-not-allowed disabled:opacity-45"
                onClick={() => void onImapSync()}
              >
                {imapSyncing ? "IMAP syncing…" : "Sync from IMAP"}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </aside>
  );
}
