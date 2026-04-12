"use client";

import { useEffect, useState } from "react";
import type { OpenmailSmartFolderId } from "@/lib/mailTypes";
import { SMART_FOLDER_IDS, smartFolderLabel } from "@/lib/smartFolderSuggestion";

const btnBase =
  "rounded-[10px] border px-3 py-1.5 text-[11px] font-semibold transition-[background-color,border-color,opacity,box-shadow] duration-150 ease-out focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400/35";

/** Dark card-aligned surface (matches premium list / reading chrome). */
const panelSurface =
  "rounded-[14px] border border-white/[0.08] bg-[rgba(20,24,32,0.9)] px-5 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-[2px]";

const btnPrimary =
  `${btnBase} border-emerald-500/45 bg-emerald-600/90 text-white hover:border-emerald-400/55 hover:bg-emerald-500`;

const btnOutline =
  `${btnBase} border-white/[0.12] bg-transparent text-[var(--text-main)] hover:border-white/[0.18] hover:bg-white/[0.06]`;

const btnAlways =
  `${btnBase} border-white/[0.08] bg-white/[0.04] text-[var(--text-main)] opacity-45 hover:opacity-70`;

const btnGhost =
  "rounded-[10px] border border-transparent bg-transparent px-2 py-1.5 text-[12px] font-medium text-white/[0.45] transition-colors hover:bg-white/[0.05] hover:text-white/[0.72] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/20";

export type SmartAutoFileInlineBarProps = {
  suggestedFolder: OpenmailSmartFolderId;
  folderLabel: string;
  confidencePct: number;
  onConfirm: () => void;
  onAlwaysApply: () => void;
  onPickFolder: (folder: OpenmailSmartFolderId) => void;
  onDismiss: () => void;
};

/**
 * Inline smart-filing suggestion (reading view). Replaces the old floating prompt.
 */
export function SmartAutoFileInlineBar({
  suggestedFolder,
  folderLabel,
  confidencePct,
  onConfirm,
  onAlwaysApply,
  onPickFolder,
  onDismiss,
}: SmartAutoFileInlineBarProps) {
  const [changeOpen, setChangeOpen] = useState(false);

  useEffect(() => {
    setChangeOpen(false);
  }, [suggestedFolder, folderLabel]);

  const alternateFolders = SMART_FOLDER_IDS.filter((id) => id !== suggestedFolder);

  return (
    <div
      className={`openmail-smart-filing-inline mt-4 w-full max-w-full ${panelSurface}`}
      role="region"
      aria-label="Smart filing suggestion"
    >
      <div className="flex items-center gap-2">
        <span className="text-[13px] opacity-40" aria-hidden>
          🤖
        </span>
        <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/35">
          AI suggestion
        </span>
      </div>
      <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="text-[14px] font-medium text-[var(--text-main)]">
          Move to {folderLabel}?
        </span>
        <span className="tabular-nums text-[13px] text-white/[0.6]">
          ({confidencePct}%)
        </span>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button type="button" className={btnPrimary} onClick={onConfirm}>
          Confirm
        </button>
        <div className="relative">
          <button
            type="button"
            className={btnOutline}
            aria-expanded={changeOpen}
            aria-haspopup="listbox"
            onClick={() => setChangeOpen((o) => !o)}
          >
            Change
          </button>
          {changeOpen ? (
            <>
              <button
                type="button"
                className="fixed inset-0 z-[26] cursor-default bg-transparent"
                aria-label="Close folder menu"
                onClick={() => setChangeOpen(false)}
              />
              <ul
                className="absolute left-0 top-[calc(100%+6px)] z-[27] max-h-[min(40vh,200px)] min-w-[11rem] overflow-y-auto rounded-[10px] border border-white/[0.1] bg-[rgba(20,24,32,0.98)] py-1 shadow-[0_12px_40px_rgba(0,0,0,0.35)] backdrop-blur-sm"
                role="listbox"
              >
                {alternateFolders.map((id) => (
                  <li key={id}>
                    <button
                      type="button"
                      role="option"
                      className="w-full px-3 py-2 text-left text-[12px] text-[var(--text-main)] transition-colors duration-150 hover:bg-white/[0.06]"
                      onClick={() => {
                        setChangeOpen(false);
                        onPickFolder(id);
                      }}
                    >
                      {smartFolderLabel(id)}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
        <button type="button" className={btnAlways} onClick={onAlwaysApply}>
          Always
        </button>
        <button type="button" className={btnGhost} onClick={onDismiss}>
          Not now
        </button>
      </div>
    </div>
  );
}
