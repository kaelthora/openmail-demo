"use client";

import {
  Archive,
  FileEdit,
  Folder,
  Inbox,
  MoreHorizontal,
  Send,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ComponentType } from "react";
import type { OpenmailSidebarFolderId } from "@/lib/openmailNavFolders";
import type {
  ServerInboxScope,
  ServerMailAccountSummary,
} from "@/lib/serverInboxTypes";

type SidebarProps = {
  activeFolder: OpenmailSidebarFolderId;
  onFolderChange: (folder: OpenmailSidebarFolderId) => void;
  customFolders?: string[];
  onAddCustomFolder?: (name: string) => void;
  onRenameCustomFolder?: (oldName: string, newName: string) => void;
  onDeleteCustomFolder?: (name: string) => void;
  activeInboxSubfolder?: string | null;
  onSelectInboxSubfolder?: (name: string | null) => void;
  onCompose?: () => void;
  onImapSync?: () => void | Promise<void>;
  imapSyncing?: boolean;
  accountConnected?: boolean;
  showMailboxActions?: boolean;
  serverMailAccounts?: ServerMailAccountSummary[];
  inboxScope?: ServerInboxScope;
  onInboxScopeChange?: (scope: ServerInboxScope) => void;
};

const newMailSidebarBtn =
  "mb-4 flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--accent)]/40 bg-[var(--accent-soft)]/35 px-3 py-2.5 text-[13px] font-semibold text-[var(--text-main)] shadow-[0_0_22px_var(--accent-soft),0_0_1px_rgba(255,255,255,0.06)] transition-[border-color,background-color,box-shadow] hover:border-[var(--accent)]/55 hover:bg-[var(--accent-soft)]/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/20";

const folderRowBase =
  "openmail-folder-btn group flex w-full items-center gap-2 rounded-[var(--radius,12px)] border px-3 py-2 text-left text-[13px] leading-none transition-[background-color,color,border-color] duration-[180ms] ease-[cubic-bezier(0.22,1,0.36,1)]";

const folderRowInactive = `${folderRowBase} border-transparent bg-transparent text-[color:var(--text-soft)] hover:bg-white/[0.045] hover:text-[var(--text-main)]`;

const folderRowActive = `${folderRowBase} border-[var(--accent)]/18 bg-[var(--accent-soft)]/28 text-[var(--text-main)]`;

const iconBase =
  "openmail-folder-icon pointer-events-none h-4 w-4 shrink-0 transition-opacity duration-[180ms] ease-[cubic-bezier(0.22,1,0.36,1)]";

function FolderRow({
  icon: Icon,
  label,
  selected,
  onClick,
}: {
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      data-active={selected ? "true" : "false"}
      className={selected ? folderRowActive : folderRowInactive}
      onClick={onClick}
    >
      <Icon
        className={`${iconBase} ${
          selected ? "opacity-100" : "opacity-[0.72] group-hover:opacity-90"
        }`}
        strokeWidth={1.5}
        aria-hidden
      />
      <span className="min-w-0 flex-1 truncate leading-[1.25]">{label}</span>
    </button>
  );
}

function CustomFolderItem({
  name,
  active,
  allFolderNames,
  onSelect,
  onRename,
  onDelete,
}: {
  name: string;
  active: boolean;
  allFolderNames: string[];
  onSelect: () => void;
  onRename: (newName: string) => void;
  onDelete: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const rowRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const skipBlurCommitRef = useRef(false);

  useEffect(() => {
    if (!editing) setDraft(name);
  }, [name, editing]);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  useEffect(() => {
    if (!menuOpen && !deleteConfirm) return;
    const close = (e: MouseEvent) => {
      const t = e.target as Node;
      if (rowRef.current?.contains(t)) return;
      setMenuOpen(false);
      setDeleteConfirm(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menuOpen, deleteConfirm]);

  useEffect(() => {
    if (!menuOpen && !deleteConfirm) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMenuOpen(false);
        setDeleteConfirm(false);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [menuOpen, deleteConfirm]);

  const commitRename = useCallback(() => {
    if (skipBlurCommitRef.current) {
      return;
    }
    const t = draft.trim();
    if (!t) {
      setDraft(name);
      setEditing(false);
      return;
    }
    if (t === name) {
      setEditing(false);
      return;
    }
    const taken = allFolderNames.some(
      (n) => n !== name && n.toLowerCase() === t.toLowerCase()
    );
    if (taken) {
      setDraft(name);
      setEditing(false);
      return;
    }
    onRename(t);
    setEditing(false);
  }, [draft, name, allFolderNames, onRename]);

  const cancelRename = useCallback(() => {
    skipBlurCommitRef.current = true;
    setDraft(name);
    setEditing(false);
    window.requestAnimationFrame(() => {
      skipBlurCommitRef.current = false;
    });
  }, [name]);

  const rowClass = active ? folderRowActive : folderRowInactive;

  return (
    <div ref={rowRef} className="group/item relative w-full">
      {editing ? (
        <div
          className={`${rowClass} flex items-center gap-2 pr-2`}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <Folder
            className={`${iconBase} opacity-[0.72]`}
            strokeWidth={1.5}
            aria-hidden
          />
          <input
            ref={inputRef}
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitRename();
              }
              if (e.key === "Escape") {
                e.preventDefault();
                cancelRename();
              }
            }}
            onBlur={() => {
              if (skipBlurCommitRef.current) return;
              commitRename();
            }}
            className="min-w-0 flex-1 rounded-[8px] border border-[var(--border)] bg-[var(--openmail-input-bg)] px-2 py-1 text-[13px] text-[var(--text-main)] outline-none focus:border-[var(--accent)]/45"
            aria-label="Rename folder"
          />
        </div>
      ) : (
        <>
          <button
            type="button"
            data-active={active ? "true" : "false"}
            className={`${rowClass} w-full pr-8`}
            onClick={onSelect}
          >
            <Folder
              className={`${iconBase} ${
                active ? "opacity-100" : "opacity-[0.72] group-hover:opacity-90"
              }`}
              strokeWidth={1.5}
              aria-hidden
            />
            <span className="min-w-0 flex-1 truncate pr-1 text-left leading-[1.25]">
              {name}
            </span>
          </button>
          <button
            type="button"
            className="absolute right-1.5 top-1/2 z-[2] flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg border border-transparent text-[color:var(--text-soft)] opacity-0 transition-opacity duration-150 ease-out hover:border-white/[0.08] hover:bg-white/[0.05] hover:!opacity-100 hover:text-[var(--text-main)] group-hover/item:pointer-events-auto group-hover/item:opacity-40 focus-visible:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/20 pointer-events-none"
            aria-label="Folder actions"
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onClick={(e) => {
              e.stopPropagation();
              setDeleteConfirm(false);
              setMenuOpen((o) => !o);
            }}
          >
            <MoreHorizontal className="h-4 w-4" strokeWidth={1.75} aria-hidden />
          </button>

          {menuOpen ? (
            <div
              role="menu"
              className="fade-in absolute right-0 top-[calc(100%+4px)] z-30 min-w-[9rem] rounded-[10px] border border-[var(--border)] bg-[var(--openmail-input-bg)] py-1 shadow-[0_8px_28px_rgba(0,0,0,0.35)]"
            >
              <button
                type="button"
                role="menuitem"
                className="flex w-full px-3 py-2 text-left text-[12px] text-[color:var(--text-main)] transition-colors hover:bg-white/[0.06]"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setMenuOpen(false);
                  setEditing(true);
                  setDraft(name);
                }}
              >
                Rename
              </button>
              <button
                type="button"
                role="menuitem"
                className="flex w-full px-3 py-2 text-left text-[12px] text-[color:var(--text-soft)] transition-colors hover:bg-white/[0.06] hover:text-[var(--text-main)]"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setMenuOpen(false);
                  setDeleteConfirm(true);
                }}
              >
                Delete
              </button>
            </div>
          ) : null}

          {deleteConfirm ? (
            <div
              className="fade-in absolute right-0 top-[calc(100%+4px)] z-40 w-[min(100%,220px)] rounded-[10px] border border-[var(--border)] bg-[var(--bg-main)] p-3 shadow-[0_8px_28px_rgba(0,0,0,0.4)]"
              role="dialog"
              aria-label="Confirm delete folder"
            >
              <p className="text-[12px] leading-snug text-[color:var(--text-main)]">
                Delete this folder?
              </p>
              <div className="mt-3 flex justify-end gap-2">
                <button
                  type="button"
                  className="rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-[11px] font-medium text-[color:var(--text-soft)] transition-colors hover:bg-white/[0.05] hover:text-[var(--text-main)]"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setDeleteConfirm(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-red-500/35 bg-red-950/25 px-2.5 py-1.5 text-[11px] font-medium text-red-200/95 transition-colors hover:bg-red-950/40"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    setDeleteConfirm(false);
                    onDelete();
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

const SYSTEM_FOLDERS: Array<{
  id: OpenmailSidebarFolderId;
  label: string;
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
}> = [
  { id: "inbox", label: "Inbox", icon: Inbox },
  { id: "drafts", label: "Drafts", icon: FileEdit },
  { id: "sent", label: "Sent", icon: Send },
  { id: "spam", label: "Spam", icon: ShieldAlert },
  { id: "trash", label: "Trash", icon: Trash2 },
  { id: "archive", label: "Archive", icon: Archive },
];

export function Sidebar({
  activeFolder,
  onFolderChange,
  customFolders = [],
  onAddCustomFolder,
  onRenameCustomFolder,
  onDeleteCustomFolder,
  activeInboxSubfolder = null,
  onSelectInboxSubfolder,
  onCompose,
  onImapSync,
  imapSyncing = false,
  accountConnected = false,
  showMailboxActions = false,
  serverMailAccounts = [],
  inboxScope = "legacy",
  onInboxScopeChange,
}: SidebarProps) {
  const [addingFolder, setAddingFolder] = useState(false);
  const [folderInput, setFolderInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (addingFolder) inputRef.current?.focus();
  }, [addingFolder]);

  const systemInboxActive =
    activeFolder === "inbox" && activeInboxSubfolder == null;

  const finishAddFolder = () => {
    const t = folderInput.trim();
    if (t) onAddCustomFolder?.(t);
    setFolderInput("");
    setAddingFolder(false);
  };

  const folderSelected = (id: OpenmailSidebarFolderId) => {
    if (id === "inbox") return systemInboxActive;
    return activeFolder === id;
  };

  const canManageCustom =
    onRenameCustomFolder &&
    onDeleteCustomFolder &&
    onSelectInboxSubfolder;

  return (
    <aside className="openmail-sidebar card flex w-64 flex-col bg-[color:var(--openmail-sidebar-surface)] p-[var(--openmail-sidebar-pad,1.125rem)]">
      {onCompose ? (
        <button type="button" className={newMailSidebarBtn} onClick={onCompose}>
          <span className="text-[15px] font-normal leading-none" aria-hidden>
            +
          </span>
          New Mail
        </button>
      ) : null}

      {showMailboxActions ? (
        <div className="mb-6 border-b border-white/[0.06] pb-5">
          <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--text-soft)]">
            Mailbox / account
          </h2>
          {onInboxScopeChange ? (
            <label className="mb-3 flex flex-col gap-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-[color:var(--text-soft)]">
                Inbox account
              </span>
              <select
                className="openmail-sidebar-select rounded-[10px] border border-white/[0.1] bg-[var(--openmail-input-bg)] px-2.5 py-2 text-xs text-[var(--text-main)] outline-none focus:border-[var(--accent)]/50"
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
          {accountConnected && onImapSync ? (
            <button
              type="button"
              disabled={imapSyncing}
              className="openmail-sidebar-action w-full rounded-[10px] border border-white/[0.08] bg-[var(--openmail-input-bg)] px-3 py-2 text-left text-xs font-medium text-[color:var(--text-soft)] transition-colors hover:border-amber-500/35 hover:text-[var(--text-main)] disabled:cursor-not-allowed disabled:opacity-45"
              onClick={() => void onImapSync()}
            >
              {imapSyncing ? "IMAP syncing…" : "Sync from IMAP"}
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--text-soft)]">
          Folders
        </h2>
        {onAddCustomFolder ? (
          <button
            type="button"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-white/[0.1] bg-[var(--openmail-input-bg)] text-[15px] font-light leading-none text-[color:var(--text-soft)] transition-colors hover:border-[var(--accent)]/40 hover:text-[var(--text-main)]"
            title="New folder"
            aria-label="Add folder"
            onClick={() => {
              setAddingFolder(true);
            }}
          >
            +
          </button>
        ) : null}
      </div>

      {addingFolder ? (
        <div className="mb-3">
          <input
            ref={inputRef}
            type="text"
            value={folderInput}
            onChange={(e) => setFolderInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                finishAddFolder();
              }
              if (e.key === "Escape") {
                setFolderInput("");
                setAddingFolder(false);
              }
            }}
            onBlur={() => {
              if (!folderInput.trim()) setAddingFolder(false);
            }}
            placeholder="Folder name"
            className="w-full rounded-[10px] border border-white/[0.12] bg-[var(--openmail-input-bg)] px-2.5 py-2 text-[13px] text-[var(--text-main)] outline-none placeholder:text-[color:var(--text-soft)] focus:border-[var(--accent)]/45"
          />
        </div>
      ) : null}

      <nav className="flex flex-col gap-1.5">
        {SYSTEM_FOLDERS.map((folder) => (
          <FolderRow
            key={folder.id}
            icon={folder.icon}
            label={folder.label}
            selected={folderSelected(folder.id)}
            onClick={() => onFolderChange(folder.id)}
          />
        ))}

        {customFolders.length > 0 && onSelectInboxSubfolder ? (
          <div className="mt-1 border-t border-white/[0.06] pt-3">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-[color:var(--text-soft)]">
              Your folders
            </p>
            <div className="flex flex-col gap-1.5">
              {canManageCustom
                ? customFolders.map((name) => (
                    <CustomFolderItem
                      key={name}
                      name={name}
                      active={
                        activeFolder === "inbox" &&
                        activeInboxSubfolder === name
                      }
                      allFolderNames={customFolders}
                      onSelect={() => onSelectInboxSubfolder(name)}
                      onRename={(newName) =>
                        onRenameCustomFolder!(name, newName)
                      }
                      onDelete={() => onDeleteCustomFolder!(name)}
                    />
                  ))
                : customFolders.map((name) => {
                    const active =
                      activeFolder === "inbox" &&
                      activeInboxSubfolder === name;
                    return (
                      <button
                        key={name}
                        type="button"
                        data-active={active ? "true" : "false"}
                        className={active ? folderRowActive : folderRowInactive}
                        onClick={() => onSelectInboxSubfolder(name)}
                      >
                        <Folder
                          className={`${iconBase} ${
                            active
                              ? "opacity-100"
                              : "opacity-[0.72] group-hover:opacity-90"
                          }`}
                          strokeWidth={1.5}
                          aria-hidden
                        />
                        <span className="min-w-0 flex-1 truncate leading-[1.25]">
                          {name}
                        </span>
                      </button>
                    );
                  })}
            </div>
          </div>
        ) : null}
      </nav>
    </aside>
  );
}
