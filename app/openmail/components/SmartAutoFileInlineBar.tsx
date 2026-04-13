"use client";

import { useEffect, useState } from "react";
import type { OpenmailSmartFolderId } from "@/lib/mailTypes";
import { SMART_FOLDER_IDS, smartFolderLabel } from "@/lib/smartFolderSuggestion";
import { useOpenmailTheme } from "../OpenmailThemeProvider";

const btnBase =
  "rounded-[10px] border px-3 py-1.5 text-[11px] font-semibold transition-[background-color,border-color,opacity,box-shadow] duration-150 ease-out focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400/35";

/** Dark card — message view smart filing. */
const panelSurfaceDark =
  "rounded-[14px] border border-white/[0.08] bg-[#1c1c1c] px-5 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-[2px]";

const btnPrimary =
  `${btnBase} border-emerald-500/45 bg-emerald-600/90 text-white hover:border-emerald-400/55 hover:bg-emerald-500`;

const btnOutline =
  `${btnBase} border-white/[0.12] bg-transparent text-[var(--text-main)] hover:border-white/[0.18] hover:bg-white/[0.06]`;

const btnAlways =
  `${btnBase} border-white/[0.08] bg-white/[0.04] text-[var(--text-main)] opacity-45 hover:opacity-70`;

const btnGhost =
  "rounded-[10px] border border-transparent bg-transparent px-2 py-1.5 text-[12px] font-medium text-white/[0.45] transition-colors hover:bg-white/[0.05] hover:text-white/[0.72] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/20";

const btnInactiveLight =
  `${btnBase} border-gray-200 bg-gray-100 text-gray-700 hover:bg-gray-200/90`;

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
  const { theme } = useOpenmailTheme();
  const isLight = theme === "soft-intelligence-light";
  const [changeOpen, setChangeOpen] = useState(false);

  useEffect(() => {
    setChangeOpen(false);
  }, [suggestedFolder, folderLabel]);

  const alternateFolders = SMART_FOLDER_IDS.filter((id) => id !== suggestedFolder);

  const panelClass = isLight
    ? "rounded-[14px] border border-gray-200 bg-white px-5 py-4 shadow-sm"
    : panelSurfaceDark;

  return (
    <div
      className={`openmail-smart-filing-inline mt-4 w-full max-w-full ${panelClass}`}
      role="region"
      aria-label="Smart filing suggestion"
    >
      <div className="flex items-center gap-2">
        <span
          className={`text-[13px] ${isLight ? "text-gray-400" : "opacity-40"}`}
          aria-hidden
        >
          🤖
        </span>
        <span
          className={`text-[10px] font-semibold uppercase tracking-[0.14em] ${
            isLight ? "text-gray-500" : "text-white/35"
          }`}
        >
          AI suggestion
        </span>
      </div>
      <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span
          className={`text-[14px] font-medium ${
            isLight ? "text-gray-900" : "text-[var(--text-main)]"
          }`}
        >
          Move to {folderLabel}?
        </span>
        <span
          className={`tabular-nums text-[13px] ${
            isLight ? "text-gray-600" : "text-white/[0.6]"
          }`}
        >
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
            className={isLight ? btnInactiveLight : btnOutline}
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
                className={`absolute left-0 top-[calc(100%+6px)] z-[27] max-h-[min(40vh,200px)] min-w-[11rem] overflow-y-auto rounded-[10px] py-1 shadow-[0_12px_40px_rgba(0,0,0,0.35)] backdrop-blur-sm ${
                  isLight
                    ? "border border-gray-200 bg-white"
                    : "border border-white/[0.1] bg-[#1c1c1c]"
                }`}
                role="listbox"
              >
                {alternateFolders.map((id) => (
                  <li key={id}>
                    <button
                      type="button"
                      role="option"
                      className={`w-full px-3 py-2 text-left text-[12px] transition-colors duration-150 ${
                        isLight
                          ? "text-gray-900 hover:bg-gray-100"
                          : "text-[var(--text-main)] hover:bg-white/[0.06]"
                      }`}
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
        <button
          type="button"
          className={isLight ? btnInactiveLight : btnAlways}
          onClick={onAlwaysApply}
        >
          Always
        </button>
        <button
          type="button"
          className={isLight ? btnInactiveLight : btnGhost}
          onClick={onDismiss}
        >
          Not now
        </button>
      </div>
    </div>
  );
}
