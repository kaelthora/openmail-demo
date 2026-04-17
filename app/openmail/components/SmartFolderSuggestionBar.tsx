"use client";

import { useMemo, useState } from "react";
import type { OpenmailSmartFolderId, ProcessedMail } from "@/lib/mailTypes";
import {
  SMART_FOLDER_IDS,
  computeSmartFolderSuggestion,
  domainFromSenderLine,
  smartFolderLabel,
} from "@/lib/smartFolderSuggestion";
import { useMailStore } from "../MailStoreProvider";
import { useUserBehavior } from "../UserBehaviorProvider";

const barBtn =
  "rounded-[10px] border border-white/[0.12] bg-transparent px-2.5 py-1.5 text-[10px] font-semibold text-[var(--text-main)] transition-colors hover:border-white/[0.18] hover:bg-white/[0.06] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/25 disabled:cursor-not-allowed disabled:opacity-40";

const barPrimary =
  "rounded-[10px] border border-emerald-500/45 bg-emerald-600/90 px-2.5 py-1.5 text-[10px] font-semibold text-white transition-colors hover:border-emerald-400/55 hover:bg-emerald-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400/35";

const barGhost =
  "rounded-[10px] border border-transparent bg-transparent px-2 py-1.5 text-[10px] font-medium text-white/[0.45] hover:bg-white/[0.05] hover:text-white/[0.72]";

const suggestPanel =
  "mt-2 rounded-[14px] border border-white/[0.08] bg-[rgba(20,24,32,0.9)] px-4 py-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-[2px]";

type SmartFolderSuggestionBarProps = {
  mail: ProcessedMail;
  /** Only inbox mail in inbox view */
  enabled?: boolean;
};

export function SmartFolderSuggestionBar({
  mail,
  enabled = true,
}: SmartFolderSuggestionBarProps) {
  const { moveMailToSmartFolder, dismissSmartFolderSuggestion, setMails, softDeleteMail } =
    useMailStore();
  const behavior = useUserBehavior();
  const highRiskBlocked =
    mail.securityLevel === "high_risk" || mail.syncedAi?.risk === "high";

  const suggestion = useMemo(() => {
    if (!enabled || !behavior.hydrated) return null;
    return computeSmartFolderSuggestion(mail, behavior.memory);
  }, [mail, behavior.hydrated, behavior.memory, behavior.memoryVersion, enabled]);

  const [changeOpen, setChangeOpen] = useState(false);

  if (!enabled) return null;
  if (highRiskBlocked) {
    return (
      <div className={suggestPanel}>
        <div className="flex items-center gap-1.5">
          <span className="text-[12px] opacity-45" aria-hidden>
            ⚠
          </span>
          <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-red-200/80">
            Security decision
          </span>
        </div>
        <p className="mt-2 text-[11px] font-medium leading-snug text-red-100/90">
          Threat detected.
          <br />
          Action blocked by default.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={barBtn}
            onClick={() =>
              setMails((prev) =>
                prev.map((m) =>
                  m.id === mail.id
                    ? { ...m, important: true, spam: true, linkQuarantine: true, read: true }
                    : m
                )
              )
            }
          >
            Report
          </button>
          <button type="button" className={barBtn} onClick={() => softDeleteMail(mail.id)}>
            Delete
          </button>
        </div>
      </div>
    );
  }
  if (!suggestion) return null;

  const senderLine = mail.sender || mail.title || "";
  const domain = domainFromSenderLine(senderLine);

  const applyChoice = (folder: OpenmailSmartFolderId) => {
    try {
      behavior.recordFolderRoute(domain, senderLine, folder);
      moveMailToSmartFolder(mail.id, folder);
    } finally {
      setChangeOpen(false);
    }
  };

  const otherFolders = SMART_FOLDER_IDS.filter((id) => id !== suggestion.folder);

  return (
    <div className={suggestPanel}>
      <div className="flex items-center gap-1.5">
        <span className="text-[12px] opacity-35" aria-hidden>
          🤖
        </span>
        <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-white/35">
          AI suggestion
        </span>
      </div>
      <p className="mt-2 text-[11px] font-medium leading-snug">
        <span className="text-white/[0.6]">Move to </span>
        <span className="text-[var(--text-main)]">
          {smartFolderLabel(suggestion.folder)}
        </span>
        <span className="tabular-nums text-white/[0.6]">
          {" "}
          ({suggestion.confidencePct}%)
        </span>
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={barPrimary}
          onClick={() => applyChoice(suggestion.folder)}
        >
          Confirm
        </button>
        <div className="relative">
          <button
            type="button"
            className={barBtn}
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
                className="fixed inset-0 z-[40] cursor-default bg-transparent"
                aria-label="Close folder menu"
                onClick={() => setChangeOpen(false)}
              />
              <ul
                className="absolute left-0 top-full z-[50] mt-1 min-w-[9rem] rounded-[10px] border border-white/[0.1] bg-[rgba(20,24,32,0.98)] py-1 shadow-[0_12px_40px_rgba(0,0,0,0.35)] backdrop-blur-sm"
                role="listbox"
              >
                {otherFolders.map((id) => (
                  <li key={id}>
                    <button
                      type="button"
                      role="option"
                      className="w-full px-2.5 py-1.5 text-left text-[11px] text-[var(--text-main)] hover:bg-white/[0.06]"
                      onClick={() => applyChoice(id)}
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
          className={barGhost}
          onClick={() => dismissSmartFolderSuggestion(mail.id)}
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}

const rowBadge =
  "max-w-[7rem] truncate rounded-md border border-white/[0.1] bg-[rgba(20,24,32,0.85)] px-1.5 py-0.5 text-[9px] font-semibold text-[var(--text-main)]";
const rowFileBtn =
  "rounded-md border border-emerald-500/40 bg-emerald-600/85 px-1.5 py-0.5 text-[9px] font-semibold text-white opacity-0 shadow-sm transition-opacity hover:bg-emerald-500 group-hover:opacity-100 focus-visible:opacity-100";

/** Compact smart-folder hint for the message list (replaces the reading-pane bar). */
export function SmartFolderListRowHint({
  mail,
  enabled = true,
}: {
  mail: ProcessedMail;
  enabled?: boolean;
}) {
  const { moveMailToSmartFolder, dismissSmartFolderSuggestion } = useMailStore();
  const behavior = useUserBehavior();
  const highRiskBlocked =
    mail.securityLevel === "high_risk" || mail.syncedAi?.risk === "high";

  const suggestion = useMemo(() => {
    if (!enabled || !behavior.hydrated) return null;
    return computeSmartFolderSuggestion(mail, behavior.memory);
  }, [mail, behavior.hydrated, behavior.memory, behavior.memoryVersion, enabled]);

  const [menuOpen, setMenuOpen] = useState(false);

  if (!enabled) return null;
  if (highRiskBlocked) {
    return (
      <div className="pointer-events-auto mt-1.5 rounded-md border border-red-500/25 bg-red-500/10 px-2 py-1 text-[10px] font-medium text-red-200/90">
        <span className="font-semibold text-red-100">Security decision:</span>{" "}
        Threat detected. Action blocked by default.
      </div>
    );
  }
  if (!suggestion) return null;

  const senderLine = mail.sender || mail.title || "";
  const domain = domainFromSenderLine(senderLine);

  const applyChoice = (folder: OpenmailSmartFolderId) => {
    try {
      behavior.recordFolderRoute(domain, senderLine, folder);
      moveMailToSmartFolder(mail.id, folder);
    } finally {
      setMenuOpen(false);
    }
  };

  return (
    <div
      className="pointer-events-auto relative flex shrink-0 flex-col items-end gap-0.5 pl-1"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <div className="flex max-w-[11rem] flex-col items-end gap-1 sm:max-w-none sm:flex-row sm:items-center">
        <span
          className={rowBadge}
          title={`Suggested: ${smartFolderLabel(suggestion.folder)} · ${suggestion.confidencePct}%`}
        >
          → {smartFolderLabel(suggestion.folder)}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className={rowFileBtn}
            onClick={() => applyChoice(suggestion.folder)}
          >
            File
          </button>
          <button
            type="button"
            className="rounded px-0.5 text-[11px] font-bold text-[color:var(--text-soft)] opacity-0 transition-opacity hover:text-[var(--text-main)] group-hover:opacity-100 focus-visible:opacity-100"
            aria-expanded={menuOpen}
            aria-haspopup="listbox"
            aria-label="Other folders"
            onClick={() => setMenuOpen((o) => !o)}
          >
            ···
          </button>
        </div>
      </div>
      {menuOpen ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-[28] cursor-default bg-transparent"
            aria-label="Close folder menu"
            onClick={() => setMenuOpen(false)}
          />
          <ul
            className="absolute right-0 top-full z-[35] mt-1 min-w-[9.5rem] rounded-lg border border-white/[0.12] bg-[#1a1a1c] py-1 shadow-xl"
            role="listbox"
          >
            {SMART_FOLDER_IDS.map((id) => (
              <li key={id}>
                <button
                  type="button"
                  role="option"
                  className="w-full px-2.5 py-1.5 text-left text-[10px] text-[var(--text-main)] hover:bg-white/[0.08]"
                  onClick={() => applyChoice(id)}
                >
                  {smartFolderLabel(id)}
                </button>
              </li>
            ))}
            <li className="border-t border-white/[0.06]">
              <button
                type="button"
                className="w-full px-2.5 py-1.5 text-left text-[10px] text-[color:var(--text-soft)] hover:bg-white/[0.08]"
                onClick={() => {
                  dismissSmartFolderSuggestion(mail.id);
                  setMenuOpen(false);
                }}
              >
                Dismiss
              </button>
            </li>
          </ul>
        </>
      ) : null}
    </div>
  );
}
