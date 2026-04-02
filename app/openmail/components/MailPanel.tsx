"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ProcessedMail } from "@/lib/mailTypes";
import { EmailBodyWithLinks } from "@/components/EmailBodyWithLinks";
import { MailAttachments } from "@/components/MailAttachments";
import { getMailAiRiskBand } from "@/lib/mailContentSecurity";
import type { MailSecurityInput } from "@/lib/mailSecuritySignals";
import type { MailAttachmentItem } from "@/lib/mailAttachmentItem";
import {
  ImapSyncErrorBanner,
  MailListApiError,
  MailListEmptyState,
  MailListSkeleton,
} from "./MailPanelStates";

type MailPanelProps = {
  mails: ProcessedMail[];
  selectedMail: ProcessedMail | null;
  onSelectMail: (mail: ProcessedMail) => void;
  /** When set, middle column shows full message instead of the list. */
  readingMailId: string | null;
  onEnterReading: (mail: ProcessedMail) => void;
  onExitReading: () => void;
  folderLabel: string;
  /** Inbox loading from `/api/emails` */
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
};

type ListDensity = "compact" | "comfortable";
type SortBy = "date" | "subject";

const HOVER_PREVIEW_DELAY_MS = 150;

function mailTimestamp(mail: ProcessedMail): number {
  const raw = mail.date;
  if (!raw) return 0;
  const t = Date.parse(raw);
  return Number.isNaN(t) ? 0 : t;
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
  const preview = firstLines(mail.content, 220, 4);
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
      className="pointer-events-none fixed z-[300] max-w-[min(300px,calc(100vw-16px))] rounded-xl border border-white/[0.1] bg-[rgba(14,14,16,0.96)] p-3 shadow-[0_12px_40px_rgba(0,0,0,0.55),0_0_0_1px_rgba(255,255,255,0.04)] backdrop-blur-md"
      style={{ top, left, width: cardW }}
      role="tooltip"
    >
      <p className="line-clamp-2 text-[13px] font-semibold leading-snug text-[var(--text-main)]">
        {mail.subject}
      </p>
      <p className="mt-1.5 text-[11px] text-[color:var(--text-soft)]">
        {mail.sender || mail.title || "Unknown sender"}
      </p>
      <p className="mt-2 whitespace-pre-wrap border-t border-white/[0.06] pt-2 text-[11px] leading-relaxed text-[#9a9a9a]">
        {preview || mail.preview || "—"}
      </p>
    </div>,
    document.body
  );
}

function MailReadingView({
  mail,
  folderLabel,
  onExitReading,
}: {
  mail: ProcessedMail;
  folderLabel: string;
  onExitReading: () => void;
}) {
  const securityInput = useMemo(() => toSecurityInput(mail), [mail]);
  const attachmentItems = useMemo(() => toAttachmentItems(mail), [mail]);
  const mailRisk = useMemo(() => getMailAiRiskBand(mail), [mail]);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <header className="flex shrink-0 flex-col gap-2 border-b border-[var(--border)] pb-3">
        <button
          type="button"
          className="group flex w-fit items-center gap-1.5 rounded-lg px-2 py-1 text-left text-xs font-medium text-[color:var(--text-soft)] transition-colors hover:bg-white/[0.04] hover:text-[var(--text-main)]"
          onClick={onExitReading}
        >
          <span className="text-[var(--text-main)] transition-transform group-hover:-translate-x-0.5" aria-hidden>
            ←
          </span>
          <span>{folderLabel}</span>
        </button>
        <h2 className="line-clamp-3 min-w-0 text-base font-semibold leading-snug text-[var(--text-main)]">
          {mail.subject}
        </h2>
      </header>

      <div className="mt-3 min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
        <div className="text-xs text-[color:var(--text-soft)]">
          <span className="text-[color:var(--text-soft)]/80">From </span>
          <span className="text-[var(--text-main)]">{mail.sender || mail.title || "—"}</span>
          {mail.date ? (
            <span className="mt-1 block text-[10px] text-[#666]">{mail.date}</span>
          ) : null}
        </div>

        {mailRisk !== "safe" ? (
          <div
            className={`rounded-[10px] border px-3 py-2 text-[11px] leading-snug ${
              mailRisk === "high"
                ? "border-red-500/35 bg-red-500/[0.08] text-red-100/90"
                : "border-amber-500/35 bg-amber-500/[0.08] text-amber-100/90"
            }`}
            role="status"
          >
            {mailRisk === "high" ? (
              <>
                <span className="font-semibold">High risk message — </span>
                links are disabled and attachments are blocked. Do not bypass these
                controls.
              </>
            ) : (
              <>
                <span className="font-semibold">Medium risk message — </span>
                links and attachments open only through the secure sandbox after you
                confirm.
              </>
            )}
          </div>
        ) : null}

        <div className="text-sm leading-relaxed text-[#c4c4c4]">
          <EmailBodyWithLinks
            content={mail.content}
            mail={securityInput}
            mailId={mail.id}
          />
        </div>

        {attachmentItems.length > 0 ? (
          <MailAttachments mail={securityInput} attachments={attachmentItems} />
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
}: MailPanelProps) {
  const [search, setSearch] = useState("");
  const [density, setDensity] = useState<ListDensity>("comfortable");
  const [sortBy, setSortBy] = useState<SortBy>("date");
  const [hoverPreview, setHoverPreview] = useState<{
    mail: ProcessedMail;
    anchor: DOMRect;
  } | null>(null);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearHoverTimer = useCallback(() => {
    if (hoverTimerRef.current !== null) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
  }, []);

  const displayedMails = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = mails;
    if (q) {
      list = mails.filter((mail) => {
        const blob = `${mail.subject} ${mail.sender ?? ""} ${mail.title} ${mail.preview}`.toLowerCase();
        return blob.includes(q);
      });
    }
    const sorted = [...list];
    if (sortBy === "date") {
      sorted.sort((a, b) => mailTimestamp(b) - mailTimestamp(a) || a.id.localeCompare(b.id));
    } else {
      sorted.sort((a, b) => a.subject.localeCompare(b.subject, undefined, { sensitivity: "base" }));
    }
    return sorted;
  }, [mails, search, sortBy]);

  const readingMail = useMemo(
    () => (readingMailId ? mails.find((m) => m.id === readingMailId) ?? null : null),
    [mails, readingMailId]
  );

  useEffect(() => {
    if (readingMailId && !mails.some((m) => m.id === readingMailId)) {
      onExitReading();
    }
  }, [readingMailId, mails, onExitReading]);

  useEffect(() => {
    if (readingMailId) {
      clearHoverTimer();
      setHoverPreview(null);
    }
  }, [readingMailId, clearHoverTimer]);

  useEffect(() => () => clearHoverTimer(), [clearHoverTimer]);

  const gapClass = density === "compact" ? "gap-2" : "gap-4";
  const padClass = density === "compact" ? "p-2.5" : "p-4";
  const titleClass =
    density === "compact"
      ? "line-clamp-2 min-w-0 text-sm font-semibold leading-snug"
      : "line-clamp-2 min-w-0 text-base font-semibold leading-snug";
  const previewLines = density === "compact" ? "line-clamp-1" : "line-clamp-2";

  const handleRowPointerEnter = useCallback(
    (mail: ProcessedMail, el: HTMLElement) => {
      clearHoverTimer();
      hoverTimerRef.current = setTimeout(() => {
        hoverTimerRef.current = null;
        setHoverPreview({ mail, anchor: el.getBoundingClientRect() });
      }, HOVER_PREVIEW_DELAY_MS);
    },
    [clearHoverTimer]
  );

  const handleRowPointerLeave = useCallback(() => {
    clearHoverTimer();
    setHoverPreview(null);
  }, [clearHoverTimer]);

  return (
    <section className="card flex min-h-0 min-w-0 flex-[0.35] flex-col bg-[#0f0f0f] p-4">
      <div className="card flex min-h-0 min-w-0 flex-1 flex-col bg-[#111111] p-3">
        {readingMail ? (
          <MailReadingView
            key={readingMail.id}
            mail={readingMail}
            folderLabel={folderLabel}
            onExitReading={onExitReading}
          />
        ) : (
          <>
            <div className="mb-3 shrink-0 space-y-2 border-b border-[var(--border)] pb-3">
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search mails..."
                disabled={listLoading}
                aria-busy={listLoading}
                className="w-full rounded-[10px] border border-[var(--border)] bg-[var(--bg-main)] px-2.5 py-1.5 text-xs text-[var(--text-main)] placeholder:text-[color:var(--text-soft)] disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="Search mails"
              />
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
                  aria-label="Sort messages"
                >
                  <option value="date">Date</option>
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

            <h2 className="mb-2 shrink-0 text-sm font-semibold">Messages</h2>
            <div className={`flex min-h-0 flex-1 flex-col ${gapClass} overflow-y-auto`}>
              {listLoading ? (
                <MailListSkeleton rows={6} density={density} />
              ) : listFetchError ? (
                <div className="card border-red-500/20 bg-[#0c0c0c] p-2">
                  <MailListApiError
                    message={listFetchError}
                    onRetry={onRetryListFetch ? () => void onRetryListFetch() : undefined}
                  />
                </div>
              ) : displayedMails.length === 0 ? (
                <div className="card border-white/[0.06] bg-[#0c0c0c] p-2">
                  <MailListEmptyState
                    isFiltered={mails.length > 0}
                    folderLabel={folderLabel}
                    inboxEmptyHintDb={inboxEmptyHintDb}
                    onRefresh={onRefreshInbox}
                    refreshing={inboxRefreshing}
                    showRefresh={showInboxRefresh && folderLabel === "Inbox"}
                  />
                </div>
              ) : (
                displayedMails.map((mail) => (
                  <button
                    key={mail.id}
                    type="button"
                    className={`group card select-none ${padClass} text-left ${
                      selectedMail?.id === mail.id
                        ? "scale-[1.01] border-[var(--accent)] bg-[#161616] shadow-[inset_0_0_0_1px_var(--openmail-shadow-accent-ring),0_0_12px_var(--openmail-shadow-accent-md)]"
                        : "bg-[#121212] hover:border-[var(--accent)] hover:bg-[#171717] hover:shadow-[0_0_12px_var(--openmail-shadow-accent-md)]"
                    }`}
                    onClick={() => onSelectMail(mail)}
                    onDoubleClick={() => {
                      onSelectMail(mail);
                      onEnterReading(mail);
                    }}
                    onPointerEnter={(e) => handleRowPointerEnter(mail, e.currentTarget)}
                    onPointerLeave={handleRowPointerLeave}
                  >
                    <div className="mb-1 flex items-center gap-2">
                      {mail.read === false ? (
                        <span
                          className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent)]"
                          aria-hidden
                        />
                      ) : null}
                      <div
                        className={`${titleClass} ${
                          mail.read === false
                            ? "text-[var(--text-main)]"
                            : "text-[color:var(--text-soft)]"
                        }`}
                      >
                        {mail.subject}
                      </div>
                    </div>
                    <div className="line-clamp-1 break-words text-xs text-[#666666]">
                      {mail.sender || mail.title}
                    </div>
                    <div className={`mt-1 text-xs text-[#6d6d6d] ${previewLines}`}>
                      {mail.preview}
                    </div>
                  </button>
                ))
              )}
            </div>
          </>
        )}
      </div>

      {hoverPreview ? (
        <MailHoverPreviewCard mail={hoverPreview.mail} anchor={hoverPreview.anchor} />
      ) : null}
    </section>
  );
}
