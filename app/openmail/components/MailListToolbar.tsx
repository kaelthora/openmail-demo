"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { OpenmailSmartFolderId } from "@/lib/mailTypes";
import { SMART_FOLDER_IDS, smartFolderLabel } from "@/lib/smartFolderSuggestion";

const iconBtn =
  "relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-transparent text-[var(--text-soft)] transition-[background-color,color,border-color,box-shadow] duration-150 ease-out hover:border-[var(--border)] hover:bg-[var(--bg-main)] hover:text-[var(--text-main)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]/35 disabled:pointer-events-none disabled:opacity-35";

function IconRefresh({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconRead({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M2 12s4-5 10-5 10 5 10 5-4 5-10 5-10-5-10-5Z"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <circle cx="12" cy="12" r="2.5" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function IconTrash({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconFolderMove({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path d="M12 11v6M9 14l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function IconArchive({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 7h16M6 7v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7M9 12h6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconSpam({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 9v4M12 17h.01M5.07 19h13.86a2 2 0 0 0 1.73-3l-6.93-12a2 2 0 0 0-3.46 0l-6.93 12a2 2 0 0 0 1.73 3Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export type MailListToolbarProps = {
  disabled?: boolean;
  refreshBusy?: boolean;
  onRefresh: () => void;
  onMarkRead: () => void;
  onDelete: () => void;
  onMove: (folder: OpenmailSmartFolderId) => void;
  onArchive: () => void;
  onSpam: () => void;
};

export function MailListToolbar({
  disabled = false,
  refreshBusy = false,
  onRefresh,
  onMarkRead,
  onDelete,
  onMove,
  onArchive,
  onSpam,
}: MailListToolbarProps) {
  const [moveOpen, setMoveOpen] = useState(false);
  const moveRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!moveOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (moveRef.current && !moveRef.current.contains(e.target as Node)) {
        setMoveOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [moveOpen]);

  const pickMove = useCallback(
    (id: OpenmailSmartFolderId) => {
      setMoveOpen(false);
      onMove(id);
    },
    [onMove]
  );

  return (
    <div
      className="openmail-list-toolbar mb-3 flex flex-wrap items-center gap-0.5 border-b border-[var(--border)] pb-3"
      role="toolbar"
      aria-label="Inbox actions"
    >
      <button
        type="button"
        className={iconBtn}
        title="Refresh"
        aria-label="Refresh inbox"
        disabled={disabled || refreshBusy}
        onClick={onRefresh}
      >
        <IconRefresh className={`h-[18px] w-[18px] ${refreshBusy ? "animate-spin" : ""}`} />
      </button>
      <button
        type="button"
        className={iconBtn}
        title="Mark as read"
        aria-label="Mark selected as read"
        disabled={disabled}
        onClick={onMarkRead}
      >
        <IconRead className="h-[18px] w-[18px]" />
      </button>
      <button
        type="button"
        className={iconBtn}
        title="Delete"
        aria-label="Delete selected"
        disabled={disabled}
        onClick={onDelete}
      >
        <IconTrash className="h-[18px] w-[18px]" />
      </button>
      <div className="relative" ref={moveRef}>
        <button
          type="button"
          className={iconBtn}
          title="Move to folder"
          aria-label="Move to folder"
          aria-expanded={moveOpen}
          aria-haspopup="listbox"
          disabled={disabled}
          onClick={() => setMoveOpen((o) => !o)}
        >
          <IconFolderMove className="h-[18px] w-[18px]" />
        </button>
        {moveOpen ? (
          <ul
            className="absolute left-0 top-[calc(100%+4px)] z-40 min-w-[10.5rem] rounded-[10px] border border-[var(--border)] bg-[var(--bg-surface)] py-1 shadow-[0_8px_24px_rgba(0,0,0,0.18)]"
            role="listbox"
          >
            {SMART_FOLDER_IDS.filter((id) => id !== "inbox").map((id) => (
              <li key={id}>
                <button
                  type="button"
                  role="option"
                  className="w-full px-3 py-2 text-left text-[12px] text-[var(--text-main)] transition-colors hover:bg-white/[0.06]"
                  onClick={() => pickMove(id)}
                >
                  {smartFolderLabel(id)}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <button
        type="button"
        className={iconBtn}
        title="Archive"
        aria-label="Archive selected"
        disabled={disabled}
        onClick={onArchive}
      >
        <IconArchive className="h-[18px] w-[18px]" />
      </button>
      <button
        type="button"
        className={iconBtn}
        title="Spam"
        aria-label="Mark as spam"
        disabled={disabled}
        onClick={onSpam}
      >
        <IconSpam className="h-[18px] w-[18px]" />
      </button>
    </div>
  );
}
