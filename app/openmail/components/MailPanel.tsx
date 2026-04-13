"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import type { OpenmailSmartFolderId, ProcessedMail } from "@/lib/mailTypes";
import { EmailBodyWithLinks } from "@/components/EmailBodyWithLinks";
import { MailAttachments } from "@/components/MailAttachments";
import { getMailAiRiskBand } from "@/lib/mailContentSecurity";
import type { SecurityRiskLevel } from "@/app/openmail/components/security/types";
import { RiskBadge } from "@/app/openmail/components/security/RiskBadge";
import { useOpenmailTheme } from "@/app/openmail/OpenmailThemeProvider";
import type { MailSecurityInput } from "@/lib/mailSecuritySignals";
import type { MailAttachmentItem } from "@/lib/mailAttachmentItem";
import {
  ImapSyncErrorBanner,
  MailListApiError,
  MailListEmptyState,
  MailListInboxOnboarding,
  MailListSkeleton,
} from "./MailPanelStates";
import type { OpenmailAutoResolveKind } from "@/lib/openmailAutoResolve";
import {
  buildThreadSituations,
  situationFlowLabel,
  situationStateLabel,
  situationUrgencyLabel,
  SITUATION_FEED_MAX,
  type SituationUrgency,
} from "@/lib/threadSituations";
import { useAttentionEngine } from "../AttentionEngineProvider";
import { useMailStore } from "../MailStoreProvider";
import { OPENMAIL_DEMO_MODE } from "@/lib/openmailDemo";
import { isInboxOnboardingFetchMessage } from "@/lib/legacyImapEnvMissing";
import type { TimeCompressionPanelProps } from "@/lib/openmailTimeCompression";
import { SmartAutoFileInlineBar } from "./SmartAutoFileInlineBar";
import { MailListToolbar } from "./MailListToolbar";
import { SmartFolderListRowHint } from "./SmartFolderSuggestionBar";
import {
  filterMailsForSmartTab,
  OPENMAIL_SMART_LIST_TABS,
  type OpenmailSmartListTabId,
} from "@/lib/openmailListSmartTabs";

export type AutoResolvedMailboxEntry = {
  id: string;
  mailId: string;
  subject: string;
  kind: OpenmailAutoResolveKind;
  kindLabel: string;
  undone: boolean;
};

type MailPanelProps = {
  mails: ProcessedMail[];
  selectedMail: ProcessedMail | null;
  onSelectMail: (mail: ProcessedMail) => void;
  /** When set, full message opens as an overlay on the list (CORE panel unchanged). */
  readingMailId: string | null;
  onEnterReading: (mail: ProcessedMail) => void;
  onExitReading: () => void;
  folderLabel: string;
  /** Inbox loading from `/api/mail/fetch` */
  listLoading?: boolean;
  listFetchError?: string | null;
  onRetryListFetch?: () => void | Promise<void>;
  inboxEmptyHintDb?: boolean;
  /** Last IMAP sync failure (shown in inbox list column) */
  imapSyncError?: string | null;
  imapSyncing?: boolean;
  onDismissImapSyncError?: () => void;
  onRetryImapSync?: () => void | Promise<void>;
  onRefreshInbox?: () => void | Promise<void>;
  inboxRefreshing?: boolean;
  showInboxRefresh?: boolean;
  /** Wired from top nav search control */
  listSearchInputRef?: RefObject<HTMLInputElement | null>;
  onReadingArchive?: (mailId: string) => void;
  onReadingDelete?: (mailId: string) => void;
  /** Precompute CORE suggestions while the pointer rests on a row (before click). */
  onHoverPrefetchMail?: (mailId: string | null) => void;
  autoResolvedEntries?: AutoResolvedMailboxEntry[];
  onUndoAutoResolved?: (entry: AutoResolvedMailboxEntry) => void;
  timeCompression?: TimeCompressionPanelProps;
  /** Smart filing — shown inline in the reading overlay for the matching message. */
  smartFilingPrompt?: {
    mailId: string;
    open: boolean;
    suggestedFolder: OpenmailSmartFolderId;
    folderLabel: string;
    confidencePct: number;
    onConfirm: () => void;
    onAlwaysApply: () => void;
    onPickFolder: (folder: OpenmailSmartFolderId) => void;
    onDismiss: () => void;
  } | null;
  /** First-time: no legacy env and no saved mailbox — neutral onboarding instead of error. */
  showInboxOnboarding?: boolean;
  onInboxConnectGmail?: () => void;
  onInboxManualSetup?: () => void;
  /** Gmail-style icon row above the thread list. */
  listToolbar?: {
    onRefresh: () => void;
    refreshBusy?: boolean;
    onMarkRead: () => void;
    onDelete: () => void;
    onMove: (folder: OpenmailSmartFolderId) => void;
    onArchive: () => void;
    onSpam: () => void;
    showMove?: boolean;
  } | null;
};

type ListDensity = "compact" | "comfortable";
type SortBy = "date" | "subject";

const HOVER_PREVIEW_DELAY_MS = 150;

function listRowRiskBadgeLevel(mail: ProcessedMail): SecurityRiskLevel {
  const band = getMailAiRiskBand(mail);
  if (band === "high" || mail.securityLevel === "high_risk") {
    return "dangerous";
  }
  if (band === "medium" && mail.securityLevel === "suspicious") {
    return "trusted_flagged";
  }
  if (band === "medium") return "suspicious";
  return "safe";
}

/** Light theme: left-rail accent on list cards (blocked / urgent / safe). */
function cardAccentClassForMail(mail: ProcessedMail): string {
  const level = listRowRiskBadgeLevel(mail);
  if (level === "dangerous") return "openmail-card-accent--blocked";
  if (mail.syncedAi?.intentUrgency === "high") return "openmail-card-accent--urgent";
  if (level === "suspicious" || level === "trusted_flagged") {
    return "openmail-card-accent--urgent";
  }
  if (level === "safe") return "openmail-card-accent--safe";
  return "";
}

function cardAccentClassForSituation(
  riskLevel: SecurityRiskLevel,
  urgency: SituationUrgency
): string {
  if (riskLevel === "dangerous") return "openmail-card-accent--blocked";
  if (urgency === "high") return "openmail-card-accent--urgent";
  if (riskLevel === "suspicious" || riskLevel === "trusted_flagged") {
    return "openmail-card-accent--urgent";
  }
  if (riskLevel === "safe") return "openmail-card-accent--safe";
  return "";
}

type InboxIntentTag = {
  label: "Needs reply" | "Archive" | "Risk" | "Follow-up";
  toneClass: string;
};

function inboxIntentTag(mail: ProcessedMail): InboxIntentTag | null {
  const risk = getMailAiRiskBand(mail);
  if (risk === "high") {
    return {
      label: "Risk",
      toneClass:
        "openmail-status-badge openmail-status-badge--blocked border-red-500/35 bg-red-500/12 text-red-100/90",
    };
  }
  if (risk === "medium" && listRowRiskBadgeLevel(mail) !== "trusted_flagged") {
    return {
      label: "Risk",
      toneClass:
        "openmail-status-badge openmail-status-badge--blocked border-red-500/35 bg-red-500/12 text-red-100/90",
    };
  }

  const aiIntent = mail.syncedAi?.intent;
  const aiAction = mail.syncedAi?.action;
  if (aiIntent === "ignore" || aiAction === "ignore") {
    return {
      label: "Archive",
      toneClass:
        "openmail-status-badge openmail-status-badge--meta border-white/[0.14] bg-white/[0.05] text-[color:var(--text-soft)]",
    };
  }

  if (
    mail.intent === "follow_up" ||
    aiIntent === "review" ||
    mail.syncedAi?.intentUrgency === "high"
  ) {
    return {
      label: "Follow-up",
      toneClass:
        "openmail-status-badge openmail-status-badge--waiting border-sky-500/35 bg-sky-500/12 text-sky-100/90",
    };
  }

  if (aiIntent === "reply" || mail.needsReply) {
    return {
      label: "Needs reply",
      toneClass:
        "openmail-status-badge openmail-status-badge--safe border-emerald-500/35 bg-emerald-500/12 text-emerald-100/90",
    };
  }

  return null;
}

function mailTimestamp(mail: ProcessedMail): number {
  const raw = mail.date;
  if (!raw) return 0;
  const t = Date.parse(raw);
  return Number.isNaN(t) ? 0 : t;
}

function mailSearchBlob(mail: ProcessedMail): string {
  const ai = mail.syncedAi;
  const parts = [
    mail.subject,
    mail.sender,
    mail.title,
    mail.preview,
    ai?.summary,
    ai?.reason,
    ai?.risk,
    ai?.intent,
    ai?.action,
    mail.securityLevel,
    mail.securityReason,
    mail.securityAiSubline,
    ...mail.securityWhyBullets,
    mail.intent,
  ];
  return parts
    .filter((x): x is string => typeof x === "string" && x.length > 0)
    .join(" ")
    .toLowerCase();
}

function toSecurityInput(mail: ProcessedMail): MailSecurityInput {
  return {
    sender: mail.sender,
    title: mail.title,
    subject: mail.subject,
    preview: mail.preview,
    content: mail.content,
    mailAiRisk: getMailAiRiskBand(mail),
  };
}

function toAttachmentItems(mail: ProcessedMail): MailAttachmentItem[] {
  if (!mail.attachments?.length) return [];
  return mail.attachments.map((a) => ({
    id: a.id,
    name: a.name,
    sizeLabel: a.sizeLabel,
    sizeBytes: a.sizeBytes,
    mimeType: a.mimeType,
    riskLevel: a.riskLevel,
  }));
}

function formatMailDate(raw: string | undefined): string {
  if (!raw?.trim()) return "";
  const t = Date.parse(raw);
  if (Number.isNaN(t)) return raw.trim();
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(t);
  } catch {
    return raw.trim();
  }
}

/** Prefer message date; some payloads only expose createdAt (UI-only fallback, no API change). */
function mailListRowDateSource(mail: ProcessedMail): string | undefined {
  const fromDate = mail.date;
  if (typeof fromDate === "string" && fromDate.trim()) return fromDate.trim();
  const created = (mail as unknown as { createdAt?: unknown }).createdAt;
  if (typeof created === "string" && created.trim()) return created.trim();
  return undefined;
}

function parseListRowInstant(raw: string): number | null {
  let t = Date.parse(raw);
  if (!Number.isNaN(t)) return t;
  if (!raw.includes("T") && /^\d{4}-\d{2}-\d{2}\s/.test(raw)) {
    t = Date.parse(raw.replace(/^(\d{4}-\d{2}-\d{2})\s+/, "$1T"));
    if (!Number.isNaN(t)) return t;
  }
  return null;
}

/** Date + time for list rows (always show calendar date, not time-only for “today”). */
function formatListRowTime(raw: string | undefined): string {
  if (!raw?.trim()) return "";
  const ms = parseListRowInstant(raw.trim());
  if (ms == null) return "";
  const d = new Date(ms);
  const now = new Date();
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      ...(d.getFullYear() !== now.getFullYear() ? { year: "numeric" as const } : {}),
      hour: "numeric",
      minute: "2-digit",
    }).format(d);
  } catch {
    return "";
  }
}

function firstLines(text: string, maxChars: number, maxLines: number): string {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) return "";
  const lines = normalized.split("\n").slice(0, maxLines);
  let out = lines.join("\n");
  if (out.length > maxChars) {
    out = `${out.slice(0, maxChars - 1)}…`;
  }
  return out;
}

function MailHoverPreviewCard({
  mail,
  anchor,
}: {
  mail: ProcessedMail;
  anchor: DOMRect;
}) {
  const bodySnippet =
    mail.preview?.trim().length > 0
      ? firstLines(mail.preview, 240, 5)
      : firstLines(mail.content, 240, 5);
  const estH = 200;
  const vw = typeof window !== "undefined" ? window.innerWidth : 400;
  const vh = typeof window !== "undefined" ? window.innerHeight : 600;
  let top = anchor.bottom + 8;
  if (top + estH > vh - 8) {
    top = Math.max(8, anchor.top - estH - 8);
  }
  const cardW = Math.min(300, vw - 16);
  const left = Math.max(8, Math.min(anchor.left, vw - cardW - 8));

  return createPortal(
    <div
      className="openmail-mail-hover-preview pointer-events-none fixed z-[300] max-w-[min(300px,calc(100vw-16px))] rounded-xl p-3"
      style={{ top, left, width: cardW }}
      role="tooltip"
    >
      <p className="line-clamp-3 text-[13px] font-medium leading-snug text-[var(--text-main)]">
        {mail.subject || "(No subject)"}
      </p>
      <p className="openmail-mail-hover-preview-snippet">
        {bodySnippet || "—"}
      </p>
    </div>,
    document.body
  );
}

function IconReply({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M9 10L4 15l5 5M20 4v7a4 4 0 0 1-4 4H4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconArchive({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 7h16v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M8 11h8M8 15h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M9 3h6l1 2H8l1-2Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

function IconTrash({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 7h16M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2m2 0v11a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V7h10Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const readingQuickBtn =
  "inline-flex items-center justify-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.04] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--text-main)] transition-colors hover:border-white/[0.14] hover:bg-white/[0.08] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/25";

function MailReadingView({
  mail,
  folderLabel,
  onClose,
  onReply,
  onArchive,
  onDelete,
  smartFiling,
}: {
  mail: ProcessedMail;
  folderLabel: string;
  onClose: () => void;
  onReply?: () => void;
  onArchive?: (mailId: string) => void;
  onDelete?: (mailId: string) => void;
  smartFiling?: {
    suggestedFolder: OpenmailSmartFolderId;
    folderLabel: string;
    confidencePct: number;
    onConfirm: () => void;
    onAlwaysApply: () => void;
    onPickFolder: (folder: OpenmailSmartFolderId) => void;
    onDismiss: () => void;
  } | null;
}) {
  const { theme } = useOpenmailTheme();
  const isLightTheme = theme === "soft-intelligence-light";
  const securityInput = useMemo(() => toSecurityInput(mail), [mail]);
  const attachmentItems = useMemo(() => toAttachmentItems(mail), [mail]);
  const mailRisk = useMemo(() => getMailAiRiskBand(mail), [mail]);
  const senderLine = mail.sender || mail.title || "—";
  const subjectLine = mail.subject?.trim() || "(No subject)";
  const dateLine = formatMailDate(mail.date);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <header className="openmail-reading-header shrink-0 border-b border-white/[0.08] px-6 pb-5 pt-5 sm:px-8 sm:pb-6 sm:pt-6">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <button
            type="button"
            autoFocus
            className="group flex w-fit min-w-0 items-center gap-2 rounded-xl px-2 py-1.5 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-[color:var(--text-soft)] transition-colors hover:bg-white/[0.05] hover:text-[var(--text-main)]"
            onClick={onClose}
          >
            <span className="text-[var(--text-main)] transition-transform group-hover:-translate-x-0.5" aria-hidden>
              ←
            </span>
            <span className="truncate">{folderLabel}</span>
          </button>
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            {onReply ? (
              <button type="button" className={readingQuickBtn} onClick={() => onReply()}>
                <IconReply className="h-3.5 w-3.5 text-[color:var(--text-soft)]" />
                Reply
              </button>
            ) : null}
            {onArchive ? (
              <button
                type="button"
                className={readingQuickBtn}
                onClick={() => onArchive(mail.id)}
              >
                <IconArchive className="h-3.5 w-3.5 text-[color:var(--text-soft)]" />
                Archive
              </button>
            ) : null}
            {onDelete ? (
              <button
                type="button"
                className={`${readingQuickBtn} border-red-500/25 text-red-200/95 hover:border-red-400/40 hover:bg-red-500/10`}
                onClick={() => onDelete(mail.id)}
              >
                <IconTrash className="h-3.5 w-3.5 opacity-90" />
                Delete
              </button>
            ) : null}
          </div>
        </div>

        <div className="space-y-3">
          <p className="text-[13px] font-medium leading-relaxed text-[var(--text-main)]">
            <span className="mr-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--text-soft)]">
              From
            </span>
            <span className="break-words">{senderLine}</span>
          </p>
          <h2
            id="mail-read-title"
            className="text-balance text-lg font-semibold leading-snug tracking-tight text-[var(--text-main)] sm:text-xl"
          >
            {subjectLine}
          </h2>
          {dateLine ? (
            <p className="text-[12px] font-medium tabular-nums text-[color:var(--text-soft)]">{dateLine}</p>
          ) : null}
        </div>

        {smartFiling ? (
          <SmartAutoFileInlineBar
            suggestedFolder={smartFiling.suggestedFolder}
            folderLabel={smartFiling.folderLabel}
            confidencePct={smartFiling.confidencePct}
            onConfirm={smartFiling.onConfirm}
            onAlwaysApply={smartFiling.onAlwaysApply}
            onPickFolder={smartFiling.onPickFolder}
            onDismiss={smartFiling.onDismiss}
          />
        ) : null}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-7 sm:px-10 sm:py-9">
        {mailRisk !== "safe" ? (
          <div
            className={
              mailRisk === "high"
                ? isLightTheme
                  ? "mb-4 rounded-xl border-2 border-red-600 bg-[#fef2f2] px-4 py-3.5 text-[13px] leading-relaxed text-[#7f1d1d]"
                  : "mb-4 rounded-xl border-2 border-red-500/60 bg-red-950/50 px-4 py-3.5 text-[12px] leading-relaxed text-red-100/95"
                : isLightTheme
                  ? "mb-4 rounded-xl border-2 border-[#ff9800] bg-[#fff4e5] px-4 py-3.5 shadow-none"
                  : "mb-4 rounded-xl border-2 border-amber-500/75 bg-amber-950/55 px-4 py-3.5 text-[13px] leading-relaxed text-amber-50/95"
            }
            role="alert"
          >
            {mailRisk === "high" ? (
              <>
                <p
                  className={
                    isLightTheme
                      ? "text-[15px] font-bold text-[#991b1b]"
                      : "text-[13px] font-bold text-red-100"
                  }
                >
                  High risk — unsafe content
                </p>
                <p className="mt-2 text-[13px] leading-snug">
                  Links are disabled and attachments are blocked. Do not bypass these
                  controls.
                </p>
              </>
            ) : (
              <>
                <p
                  className={
                    isLightTheme
                      ? "text-[15px] font-bold text-[#b45309]"
                      : "text-[15px] font-bold text-amber-100"
                  }
                >
                  ⚠️ Elevated risk detected
                </p>
                <p
                  className={`mt-2 text-[13px] font-semibold leading-snug ${
                    isLightTheme ? "text-[#7c2d12]" : "text-amber-100/90"
                  }`}
                >
                  Review before you click. Typical reasons we show this:
                </p>
                <ul
                  className={`mt-2 list-inside list-disc space-y-1.5 text-[13px] leading-snug ${
                    isLightTheme ? "text-[#7c2d12]" : "text-amber-50/95"
                  }`}
                >
                  <li>Suspicious link</li>
                  <li>External redirection</li>
                  <li>Potential phishing</li>
                </ul>
                <p
                  className={`mt-3 text-[12px] leading-snug ${
                    isLightTheme ? "text-[#7c2d12]" : "text-amber-100/85"
                  }`}
                >
                  Use links and attachments only through the secure sandbox after you
                  confirm each action.
                </p>
              </>
            )}
          </div>
        ) : null}

        <div className="text-[15px] leading-[1.65] text-[var(--text-main)]">
          <EmailBodyWithLinks
            content={mail.content}
            mail={securityInput}
            mailId={mail.id}
          />
        </div>

        {attachmentItems.length > 0 ? (
          <MailAttachments
            mail={securityInput}
            attachments={attachmentItems}
            mailId={mail.id}
          />
        ) : null}
      </div>
    </div>
  );
}

export function MailPanel({
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
  listSearchInputRef,
  onReadingArchive,
  onReadingDelete,
  onHoverPrefetchMail,
  autoResolvedEntries,
  onUndoAutoResolved,
  timeCompression,
  smartFilingPrompt = null,
  listToolbar = null,
  showInboxOnboarding = false,
  onInboxConnectGmail,
  onInboxManualSetup,
}: MailPanelProps) {
  const { mailsFetchError: storeMailsFetchError } = useMailStore();
  const listErrorCombined = (listFetchError ?? storeMailsFetchError ?? "").trim();
  const inboxOnboardingUiActive =
    showInboxOnboarding ||
    (!OPENMAIL_DEMO_MODE &&
      folderLabel === "Inbox" &&
      isInboxOnboardingFetchMessage(listErrorCombined));
  const effectiveListFetchError = inboxOnboardingUiActive
    ? null
    : (listFetchError ?? storeMailsFetchError ?? null);
  const { setOrderedMailIds, onRowPointerEnter, onRowPointerLeave, onListScroll } =
    useAttentionEngine();
  const [search, setSearch] = useState("");
  const [smartListTab, setSmartListTab] =
    useState<OpenmailSmartListTabId>("inbox");
  const [density, setDensity] = useState<ListDensity>("comfortable");
  const [sortBy, setSortBy] = useState<SortBy>("date");
  const showSituationFeed = folderLabel === "Inbox";

  useEffect(() => {
    if (folderLabel !== "Inbox") setSmartListTab("inbox");
  }, [folderLabel]);

  const autoHandledMailIds = useMemo(() => {
    const ids = new Set<string>();
    for (const e of autoResolvedEntries ?? []) {
      if (!e.undone) ids.add(e.mailId);
    }
    return ids;
  }, [autoResolvedEntries]);
  const [overlayAnimOpen, setOverlayAnimOpen] = useState(false);
  const [hoverPreview, setHoverPreview] = useState<{
    mail: ProcessedMail;
    anchor: DOMRect;
  } | null>(null);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const overlayCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearHoverTimer = useCallback(() => {
    if (hoverTimerRef.current !== null) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
  }, []);

  const clearOverlayCloseTimer = useCallback(() => {
    if (overlayCloseTimerRef.current !== null) {
      clearTimeout(overlayCloseTimerRef.current);
      overlayCloseTimerRef.current = null;
    }
  }, []);

  const mailsAfterSearch = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return mails;
    return mails.filter((mail) => mailSearchBlob(mail).includes(q));
  }, [mails, search]);

  const mailsAfterSmartTab = useMemo(() => {
    if (folderLabel !== "Inbox") return mailsAfterSearch;
    return filterMailsForSmartTab(
      mailsAfterSearch,
      smartListTab,
      autoHandledMailIds
    );
  }, [
    folderLabel,
    mailsAfterSearch,
    smartListTab,
    autoHandledMailIds,
  ]);

  const displayedMails = useMemo(() => {
    const sorted = [...mailsAfterSmartTab];
    if (sortBy === "date") {
      sorted.sort((a, b) => mailTimestamp(b) - mailTimestamp(a) || a.id.localeCompare(b.id));
    } else {
      sorted.sort((a, b) => a.subject.localeCompare(b.subject, undefined, { sensitivity: "base" }));
    }
    return sorted;
  }, [mailsAfterSmartTab, sortBy]);

  const emptyFromSmartTabOnly =
    folderLabel === "Inbox" &&
    smartListTab !== "inbox" &&
    mailsAfterSearch.length > 0 &&
    displayedMails.length === 0;

  const threadSituations = useMemo(() => {
    const base = buildThreadSituations(displayedMails, {
      autoHandledMailIds: showSituationFeed ? autoHandledMailIds : undefined,
    });
    if (sortBy === "subject") {
      return [...base].sort((a, b) =>
        a.title.localeCompare(b.title, undefined, { sensitivity: "base" })
      );
    }
    return base;
  }, [displayedMails, sortBy, showSituationFeed, autoHandledMailIds]);

  const situationFeed = useMemo(
    () => threadSituations.slice(0, SITUATION_FEED_MAX),
    [threadSituations]
  );
  const situationFeedOverflow = Math.max(0, threadSituations.length - situationFeed.length);

  const attentionOrderedIds = useMemo(() => {
    if (showSituationFeed) {
      return situationFeed.map((s) => s.anchorMail.id);
    }
    return displayedMails.map((m) => m.id);
  }, [showSituationFeed, situationFeed, displayedMails]);

  useLayoutEffect(() => {
    setOrderedMailIds(attentionOrderedIds);
  }, [setOrderedMailIds, attentionOrderedIds]);

  const readingMail = useMemo(
    () => (readingMailId ? mails.find((m) => m.id === readingMailId) ?? null : null),
    [mails, readingMailId]
  );

  const smartFilingForReading = useMemo(() => {
    if (!smartFilingPrompt?.open || !readingMail) return null;
    if (smartFilingPrompt.mailId !== readingMail.id) return null;
    return {
      suggestedFolder: smartFilingPrompt.suggestedFolder,
      folderLabel: smartFilingPrompt.folderLabel,
      confidencePct: smartFilingPrompt.confidencePct,
      onConfirm: smartFilingPrompt.onConfirm,
      onAlwaysApply: smartFilingPrompt.onAlwaysApply,
      onPickFolder: smartFilingPrompt.onPickFolder,
      onDismiss: smartFilingPrompt.onDismiss,
    };
  }, [smartFilingPrompt, readingMail]);

  const closeReadingAnimated = useCallback(
    (afterClose?: () => void) => {
      setOverlayAnimOpen(false);
      clearOverlayCloseTimer();
      overlayCloseTimerRef.current = setTimeout(() => {
        overlayCloseTimerRef.current = null;
        onExitReading();
        afterClose?.();
      }, 200);
    },
    [onExitReading, clearOverlayCloseTimer]
  );

  useEffect(() => {
    clearOverlayCloseTimer();
    if (!readingMail) {
      setOverlayAnimOpen(false);
      return;
    }
    setOverlayAnimOpen(false);
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => setOverlayAnimOpen(true));
    });
    return () => cancelAnimationFrame(id);
  }, [readingMail?.id, clearOverlayCloseTimer]);

  useEffect(() => {
    if (readingMailId && !mails.some((m) => m.id === readingMailId)) {
      onExitReading();
    }
  }, [readingMailId, mails, onExitReading]);

  useEffect(() => {
    if (readingMailId) {
      onHoverPrefetchMail?.(null);
      clearHoverTimer();
      setHoverPreview(null);
    }
  }, [readingMailId, clearHoverTimer, onHoverPrefetchMail]);

  useEffect(() => {
    if (!readingMailId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeReadingAnimated();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [readingMailId, closeReadingAnimated]);

  useEffect(
    () => () => {
      clearHoverTimer();
      clearOverlayCloseTimer();
    },
    [clearHoverTimer, clearOverlayCloseTimer]
  );

  const gapClass = density === "compact" ? "gap-2.5" : "gap-5";
  const padClass = density === "compact" ? "p-3" : "p-5";
  const titleClass =
    density === "compact"
      ? "line-clamp-2 min-w-0 text-sm font-semibold leading-snug"
      : "line-clamp-2 min-w-0 text-base font-semibold leading-snug";
  const previewLines = density === "compact" ? "line-clamp-1" : "line-clamp-2";

  const handleRowPointerEnter = useCallback(
    (mail: ProcessedMail, el: HTMLElement) => {
      onRowPointerEnter(mail.id);
      onHoverPrefetchMail?.(mail.id);
      clearHoverTimer();
      hoverTimerRef.current = setTimeout(() => {
        hoverTimerRef.current = null;
        setHoverPreview({ mail, anchor: el.getBoundingClientRect() });
      }, HOVER_PREVIEW_DELAY_MS);
    },
    [onRowPointerEnter, clearHoverTimer, onHoverPrefetchMail]
  );

  const handleRowPointerLeave = useCallback(
    (mailId: string) => {
      onRowPointerLeave(mailId);
      onHoverPrefetchMail?.(null);
      clearHoverTimer();
      setHoverPreview(null);
    },
    [onRowPointerLeave, clearHoverTimer, onHoverPrefetchMail]
  );

  return (
    <section className="openmail-list-column card flex min-h-0 min-w-0 flex-[0.35] flex-col bg-[color:var(--openmail-list-outer)] p-4">
      <div className="openmail-list-surface card relative flex min-h-0 min-w-0 flex-1 flex-col bg-[color:var(--openmail-list-inner)] p-3">
        <h2 className="openmail-list-section-title mb-4 shrink-0 text-[17px] font-semibold leading-tight tracking-tight text-[var(--text-main)]">
          {folderLabel}{" "}
          <span className="text-[15px] font-medium tabular-nums text-[color:var(--text-soft)]">
            ({displayedMails.length})
          </span>
        </h2>
        <div className="mb-4 shrink-0 space-y-2 border-b border-[var(--border)] pb-4">
          <div className="relative">
            <input
              ref={listSearchInputRef}
              data-openmail-list-search="true"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search situations, emails, or intent…"
              disabled={listLoading}
              aria-busy={listLoading}
              className="openmail-list-search-input w-full rounded-[10px] border border-[var(--border)] bg-[var(--bg-main)] py-1.5 pl-7 pr-2.5 text-xs text-[var(--text-main)] placeholder:text-[color:var(--text-soft)] disabled:cursor-not-allowed disabled:opacity-50"
              aria-label="Smart search: subject, sender, risk, and intent"
            />
            <span
              className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[11px] opacity-55"
              aria-hidden
            >
              ✦
            </span>
          </div>
          <p className="text-[10px] leading-snug text-[color:var(--text-soft)]/90">
            Matches subject, sender, AI risk, and intent tags.
          </p>
          {folderLabel === "Inbox" ? (
            <div
              className="flex gap-0.5 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              role="tablist"
              aria-label="Smart inbox views"
            >
              {OPENMAIL_SMART_LIST_TABS.map((tab) => {
                const active = smartListTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    title={tab.description}
                    className={`relative shrink-0 rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition-[color,box-shadow] duration-200 ${
                      active
                        ? "text-[var(--text-main)] shadow-[0_0_14px_var(--accent-soft),inset_0_-2px_0_0_var(--accent)]"
                        : "text-[color:var(--text-soft)] hover:text-[var(--text-main)]/95"
                    }`}
                    onClick={() => setSmartListTab(tab.id)}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-[8px] border border-[var(--border)] p-0.5">
              <button
                type="button"
                className={`rounded-[6px] px-2 py-1 text-[10px] font-medium ${
                  density === "compact"
                    ? "bg-[var(--accent-soft)] text-[var(--text-main)]"
                    : "text-[color:var(--text-soft)]"
                }`}
                onClick={() => setDensity("compact")}
              >
                Compact
              </button>
              <button
                type="button"
                className={`rounded-[6px] px-2 py-1 text-[10px] font-medium ${
                  density === "comfortable"
                    ? "bg-[var(--accent-soft)] text-[var(--text-main)]"
                    : "text-[color:var(--text-soft)]"
                }`}
                onClick={() => setDensity("comfortable")}
              >
                Comfortable
              </button>
            </div>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortBy)}
              className="ml-auto min-w-0 flex-1 rounded-[8px] border border-[var(--border)] bg-[var(--bg-main)] px-2 py-1 text-[10px] text-[var(--text-main)] sm:flex-none sm:min-w-[7rem]"
              aria-label={showSituationFeed ? "Sort situations" : "Sort messages"}
            >
              <option value="date">{showSituationFeed ? "Recent activity" : "Date"}</option>
              <option value="subject">Subject</option>
            </select>
          </div>
        </div>

        {imapSyncError && onDismissImapSyncError && onRetryImapSync ? (
          <ImapSyncErrorBanner
            message={imapSyncError}
            syncing={imapSyncing}
            onDismiss={onDismissImapSyncError}
            onRetry={onRetryImapSync}
          />
        ) : null}

        {showSituationFeed && timeCompression ? (
          <div className="mb-3 shrink-0 rounded-[11px] border border-cyan-500/35 bg-cyan-950/25 px-3 py-2.5 shadow-[0_0_24px_rgba(34,211,238,0.08)]">
            <div className="text-[11px] font-semibold leading-snug text-cyan-100/95">
              {timeCompression.headline}
            </div>
            {timeCompression.subline ? (
              <div className="mt-1 text-[10px] leading-snug text-[color:var(--text-soft)]">
                {timeCompression.subline}
              </div>
            ) : null}
            <button
              type="button"
              className="mt-2.5 w-full rounded-[9px] border border-cyan-400/40 bg-cyan-500/15 px-3 py-2 text-[11px] font-bold uppercase tracking-[0.12em] text-cyan-50 transition-colors hover:border-cyan-300/55 hover:bg-cyan-500/25 disabled:cursor-not-allowed disabled:opacity-45"
              onClick={() => timeCompression.onResolveAll()}
              disabled={
                timeCompression.busy ||
                listLoading ||
                !!effectiveListFetchError ||
                inboxOnboardingUiActive ||
                displayedMails.length === 0
              }
            >
              {timeCompression.busy ? "Resolving…" : "Resolve all"}
            </button>
          </div>
        ) : null}

        {showSituationFeed ? (
          <p className="mb-3 text-[10px] leading-snug text-[color:var(--text-soft)]">
            Up to {SITUATION_FEED_MAX} active situations (threads merged). Work each thread in CORE —
            not individual messages.
          </p>
        ) : null}

        {autoResolvedEntries && autoResolvedEntries.length > 0 ? (
          <div className="mb-3 shrink-0 rounded-[10px] border border-emerald-500/25 bg-emerald-950/20 px-2.5 py-2">
            <div className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-emerald-200/90">
              Auto-resolved emails
            </div>
            <ul className="mt-2 max-h-[9.5rem] space-y-2 overflow-y-auto pr-0.5">
              {autoResolvedEntries.map((row) => (
                <li
                  key={row.id}
                  className="flex items-start justify-between gap-2 rounded-md border border-white/[0.06] bg-black/20 px-2 py-1.5"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-[9px] font-semibold uppercase tracking-wide text-emerald-200/75">
                      {row.kindLabel}
                    </div>
                    <div className="truncate text-[11px] leading-snug text-[var(--text-main)]">
                      {row.subject}
                    </div>
                  </div>
                  {onUndoAutoResolved ? (
                    <button
                      type="button"
                      className="shrink-0 rounded-md border border-white/[0.12] bg-white/[0.06] px-2 py-0.5 text-[10px] font-semibold text-[var(--text-main)] transition-colors hover:border-emerald-400/35 hover:bg-emerald-500/15"
                      onClick={() => onUndoAutoResolved(row)}
                    >
                      Undo
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {listToolbar && !inboxOnboardingUiActive ? (
          <MailListToolbar
            disabled={!selectedMail}
            refreshBusy={listToolbar.refreshBusy}
            onRefresh={listToolbar.onRefresh}
            onMarkRead={listToolbar.onMarkRead}
            onDelete={listToolbar.onDelete}
            onMove={listToolbar.onMove}
            onArchive={listToolbar.onArchive}
            onSpam={listToolbar.onSpam}
            showMove={listToolbar.showMove !== false}
          />
        ) : null}

        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
          <div
            className={`flex min-h-0 flex-1 flex-col transition-opacity duration-200 ${
              readingMail ? "opacity-45" : "opacity-100"
            }`}
            aria-hidden={readingMail ? true : undefined}
          >
            <div
              className={`openmail-thread-list flex min-h-0 flex-1 flex-col ${gapClass} overflow-y-auto`}
              onScroll={(e) => onListScroll(e.currentTarget.scrollTop)}
            >
              {/* Priority: loading → onboarding (exclusive) → error → empty → list */}
              {listLoading ? (
                <MailListSkeleton rows={6} density={density} />
              ) : inboxOnboardingUiActive ? (
                <div className="openmail-list-state-card card border-[var(--accent)]/20 bg-[var(--openmail-list-inner)] p-2">
                  <MailListInboxOnboarding
                    onConnectGmail={onInboxConnectGmail ?? (() => {})}
                    onManualSetup={onInboxManualSetup ?? (() => {})}
                    onRetryCheck={
                      onRetryListFetch ? () => void onRetryListFetch() : undefined
                    }
                  />
                </div>
              ) : effectiveListFetchError ? (
                <div className="openmail-list-state-card card border-red-500/20 bg-[var(--openmail-list-inner)] p-2">
                  <MailListApiError
                    message={effectiveListFetchError}
                    hideForOnboarding={inboxOnboardingUiActive}
                    onRetry={onRetryListFetch ? () => void onRetryListFetch() : undefined}
                  />
                </div>
              ) : displayedMails.length === 0 ? (
                <div className="openmail-list-state-card card border-white/[0.06] bg-[var(--openmail-list-inner)] p-2">
                  <MailListEmptyState
                    isFiltered={mails.length > 0 && displayedMails.length === 0}
                    folderLabel={folderLabel}
                    inboxEmptyHintDb={inboxEmptyHintDb}
                    onRefresh={onRefreshInbox}
                    refreshing={inboxRefreshing}
                    showRefresh={
                      showInboxRefresh &&
                      folderLabel === "Inbox" &&
                      !listToolbar
                    }
                    emptyTitle={
                      emptyFromSmartTabOnly ? "No messages in this tab" : undefined
                    }
                    emptyDetail={
                      emptyFromSmartTabOnly
                        ? "Try another tab, or choose Inbox to see everything that matches your search."
                        : undefined
                    }
                  />
                </div>
              ) : showSituationFeed ? (
                <>
                  {situationFeed.map((situation) => {
                  const anchor = situation.anchorMail;
                  const timeLine = formatListRowTime(
                    mailListRowDateSource(anchor)
                  );
                  const situationSelected =
                    !!selectedMail &&
                    situation.mails.some((m) => m.id === selectedMail.id);
                  const riskLevel = listRowRiskBadgeLevel(anchor);
                  const cardAccent = cardAccentClassForSituation(
                    riskLevel,
                    situation.urgency
                  );
                  const state = situation.state;
                  const stateChip =
                    state === "waiting"
                      ? "openmail-status-badge openmail-status-badge--waiting border-sky-500/30 bg-sky-950/35 text-sky-100/90"
                      : state === "auto_handled"
                        ? "openmail-status-badge openmail-status-badge--safe border-emerald-500/30 bg-emerald-950/30 text-emerald-100/90"
                        : "openmail-status-badge openmail-status-badge--safe border-emerald-500/30 bg-emerald-950/30 text-emerald-100/90";
                  const flowChip =
                    situation.flowKind === "waiting_reply"
                      ? "openmail-status-badge openmail-status-badge--waiting-reply border-violet-500/25 bg-violet-950/25 text-violet-100/85"
                      : situation.flowKind === "completed"
                        ? "openmail-status-badge openmail-status-badge--meta border-white/[0.1] bg-white/[0.05] text-[color:var(--text-soft)]"
                        : "openmail-status-badge openmail-status-badge--meta border-white/[0.08] bg-transparent text-[#7a7a7a]";
                  const urgChip =
                    situation.urgency === "high"
                      ? "openmail-status-badge openmail-status-badge--high-urgency border-amber-500/35 bg-amber-950/30 text-amber-100/90"
                      : situation.urgency === "medium"
                        ? "openmail-status-badge openmail-status-badge--meta border-white/[0.12] bg-white/[0.06] text-[color:var(--text-soft)]"
                        : "openmail-status-badge openmail-status-badge--meta border-white/[0.08] bg-transparent text-[#6d6d6d]";
                  return (
                    <button
                      key={situation.id}
                      type="button"
                      data-situation-selected={situationSelected ? "true" : "false"}
                      className={`openmail-situation-row group card select-none ${padClass} text-left transition-[transform,background-color,border-color,box-shadow] duration-200 ease-out motion-reduce:transition-none ${cardAccent} ${
                        situationSelected
                          ? "openmail-situation-row--selected scale-[1.01] border-[var(--accent)] bg-[#161616] shadow-[inset_0_0_0_1px_var(--openmail-shadow-accent-ring),0_0_12px_var(--openmail-shadow-accent-md)]"
                          : "border-[var(--border)] bg-[#121212] hover:border-[var(--accent)] hover:bg-[#171717] hover:shadow-[0_0_12px_var(--openmail-shadow-accent-md)]"
                      }`}
                      onClick={() => onSelectMail(anchor)}
                      onDoubleClick={(e) => {
                        e.preventDefault();
                        onSelectMail(anchor);
                        onEnterReading(anchor);
                      }}
                      onPointerEnter={(e) =>
                        handleRowPointerEnter(anchor, e.currentTarget)
                      }
                      onPointerLeave={() => handleRowPointerLeave(anchor.id)}
                    >
                      <div className="mb-1.5 flex items-start justify-between gap-2">
                        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                          <span
                            className={`rounded-md border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${stateChip}`}
                          >
                            {situationStateLabel(state)}
                          </span>
                          <span
                            className={`rounded-md border px-1.5 py-0.5 text-[9px] font-semibold tracking-wide ${flowChip}`}
                          >
                            {situationFlowLabel(situation.flowKind)}
                          </span>
                          <span
                            className={`rounded-md border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${urgChip}`}
                          >
                            {situationUrgencyLabel(situation.urgency)} urgency
                          </span>
                          {situation.messageCount > 1 ? (
                            <span className="openmail-status-badge openmail-status-badge--meta rounded-md border border-white/[0.08] bg-white/[0.04] px-1.5 py-0.5 text-[9px] font-semibold tabular-nums text-[color:var(--text-soft)]">
                              {situation.messageCount} msgs
                            </span>
                          ) : null}
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                          <span className="text-right text-xs tabular-nums text-[color:var(--text-soft)] opacity-60">
                            {timeLine || "—"}
                          </span>
                          <RiskBadge level={riskLevel} size="sm" />
                        </div>
                      </div>
                      <div
                        className={`${titleClass} text-[var(--text-main)]`}
                      >
                        {situation.title}
                      </div>
                      <p className={`mt-1.5 text-[11px] leading-relaxed text-[#8a8a8a] ${previewLines}`}>
                        {situation.contextSummary}
                      </p>
                      <div className="mt-2 rounded-lg border border-[var(--accent)]/20 bg-[var(--accent-soft)]/15 px-2 py-1.5 text-[10px] font-medium leading-snug text-[var(--accent)]">
                        <span className="font-semibold text-[color:var(--text-soft)]">
                          Recommended:{" "}
                        </span>
                        {situation.recommendedAction}
                      </div>
                    </button>
                  );
                })}
                  {situationFeedOverflow > 0 ? (
                    <p className="px-1 py-2 text-center text-[10px] text-[color:var(--text-soft)]">
                      +{situationFeedOverflow} more situation
                      {situationFeedOverflow === 1 ? "" : "s"} not shown — refine search or sort
                    </p>
                  ) : null}
                </>
              ) : (
                displayedMails.map((mail) => {
                  const riskLevel = listRowRiskBadgeLevel(mail);
                  const cardAccent = cardAccentClassForMail(mail);
                  const intentTag = folderLabel === "Inbox" ? inboxIntentTag(mail) : null;
                  const smartFolderEnabled =
                    folderLabel === "Inbox" && mail.folder === "inbox" && !mail.archived;
                  const senderLine = (mail.sender || mail.title || "—").trim();
                  const subjectLine = mail.subject?.trim() || "(No subject)";
                  const timeLine = formatListRowTime(mailListRowDateSource(mail));
                  return (
                  <div
                    key={mail.id}
                    className={`openmail-thread-row group card flex select-none flex-col gap-0 ${padClass} transition-[transform,background-color,border-color,box-shadow] duration-200 ease-out motion-reduce:transition-none ${cardAccent} ${
                      selectedMail?.id === mail.id
                        ? "openmail-thread-row--selected scale-[1.01] border-[var(--accent)] bg-[#161616] shadow-[inset_0_0_0_1px_var(--openmail-shadow-accent-ring),0_0_12px_var(--openmail-shadow-accent-md)]"
                        : "border-[var(--border)] bg-[#121212] hover:border-[var(--accent)] hover:bg-[#171717] hover:shadow-[0_0_12px_var(--openmail-shadow-accent-md)]"
                    }${
                      mail.resolved
                        ? " openmail-thread-row--resolved border-emerald-500/20 bg-[#101814]/90 opacity-95"
                        : ""
                    }`}
                  >
                  <button
                    type="button"
                    className="min-w-0 w-full text-left outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/35"
                    onClick={() => onSelectMail(mail)}
                    onDoubleClick={(e) => {
                      e.preventDefault();
                      onSelectMail(mail);
                      onEnterReading(mail);
                    }}
                    onPointerEnter={(e) => handleRowPointerEnter(mail, e.currentTarget)}
                    onPointerLeave={() => handleRowPointerLeave(mail.id)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span
                        className={`openmail-mail-sender min-w-0 flex-1 truncate text-[14px] leading-snug ${
                          mail.read === false
                            ? "font-semibold text-[var(--text-main)]"
                            : "font-semibold text-[color:var(--text-soft)]"
                        }`}
                      >
                        {senderLine}
                      </span>
                      <span className="openmail-mail-time shrink-0 text-right text-xs tabular-nums text-[color:var(--text-soft)] opacity-60">
                        {timeLine || "—"}
                      </span>
                    </div>
                    <div className="mt-2 flex min-w-0 items-start justify-between gap-2">
                      <p className="min-w-0 flex-1 truncate text-[13px] leading-snug text-[color:var(--text-soft)]">
                        <span
                          className={`openmail-mail-subject ${
                            mail.read === false
                              ? "font-semibold text-[var(--text-main)]"
                              : "font-medium text-[color:var(--text-soft)]"
                          }`}
                        >
                          {subjectLine}
                        </span>
                        <span className="openmail-mail-preview font-normal">
                          {" "}
                          — {mail.preview ?? ""}
                        </span>
                      </p>
                      <div className="flex shrink-0 items-center gap-1.5">
                        {intentTag ? (
                          <span
                            className={`inline-flex max-w-[5.5rem] truncate rounded-md border px-1.5 py-0.5 text-[9px] font-semibold tracking-wide ${intentTag.toneClass}`}
                            title={`AI intent: ${intentTag.label}`}
                          >
                            {intentTag.label}
                          </span>
                        ) : null}
                        {folderLabel === "Sent" && mail.openmailAutoSentByAi ? (
                          <span
                            className="openmail-status-badge openmail-status-badge--waiting-reply inline-flex max-w-[9rem] truncate rounded-md border border-violet-400/35 bg-violet-950/40 px-1.5 py-0.5 text-[9px] font-semibold tracking-wide text-violet-100/95"
                            title="This reply was sent automatically by Guardian"
                          >
                            Auto-sent by AI
                          </span>
                        ) : null}
                        <RiskBadge level={riskLevel} size="sm" />
                      </div>
                    </div>
                  </button>
                  <SmartFolderListRowHint mail={mail} enabled={smartFolderEnabled} />
                  </div>
                  );
                })
              )}
            </div>
          </div>

          {readingMail ? (
            <>
              <button
                type="button"
                aria-label="Close message"
                className={`absolute inset-0 z-[24] rounded-[12px] border-0 bg-black/50 backdrop-blur-md transition-opacity duration-200 ease-out motion-reduce:transition-none ${
                  overlayAnimOpen
                    ? "opacity-100"
                    : "pointer-events-none opacity-0"
                }`}
                onClick={() => closeReadingAnimated()}
              />
              <div className="pointer-events-none absolute inset-0 z-[25] flex min-h-0 items-stretch justify-center p-2.5 sm:p-3.5">
                <div
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="mail-read-title"
                  className={`openmail-reading-dialog flex min-h-0 w-full max-w-full flex-col overflow-hidden rounded-2xl border border-white/[0.1] bg-[rgba(11,11,13,0.94)] shadow-[0_28px_72px_rgba(0,0,0,0.72),inset_0_1px_0_rgba(255,255,255,0.06)] transition-[opacity,transform] duration-200 ease-out motion-reduce:transition-none [-webkit-backdrop-filter:blur(20px)] backdrop-blur-xl ${
                    overlayAnimOpen
                      ? "pointer-events-auto scale-100 opacity-100"
                      : "pointer-events-none scale-[0.97] opacity-0"
                  }`}
                >
                  <MailReadingView
                    key={readingMail.id}
                    mail={readingMail}
                    folderLabel={folderLabel}
                    smartFiling={smartFilingForReading}
                    onClose={() => closeReadingAnimated()}
                    onReply={() => closeReadingAnimated()}
                    onArchive={
                      onReadingArchive
                        ? () =>
                            closeReadingAnimated(() =>
                              onReadingArchive(readingMail.id)
                            )
                        : undefined
                    }
                    onDelete={
                      onReadingDelete
                        ? () =>
                            closeReadingAnimated(() =>
                              onReadingDelete(readingMail.id)
                            )
                        : undefined
                    }
                  />
                </div>
              </div>
            </>
          ) : null}
        </div>
      </div>

      {hoverPreview && !readingMail ? (
        <MailHoverPreviewCard mail={hoverPreview.mail} anchor={hoverPreview.anchor} />
      ) : null}
    </section>
  );
}
