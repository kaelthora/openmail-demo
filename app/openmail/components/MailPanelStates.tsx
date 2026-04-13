"use client";

import { useOpenmailTheme } from "../OpenmailThemeProvider";

type MailListSkeletonProps = {
  rows?: number;
  density: "compact" | "comfortable";
};

export function MailListSkeleton({ rows = 6, density }: MailListSkeletonProps) {
  const pad = density === "compact" ? "p-2.5" : "p-4";
  return (
    <div
      className="flex flex-col gap-3 py-1"
      aria-busy="true"
      aria-label="Loading messages"
    >
      {Array.from({ length: rows }, (_, k) => (
        <div
          key={k}
          className={`openmail-skeleton-card card rounded-[10px] border border-[var(--border)] bg-[#0e0e0e] ${pad} shadow-none`}
        >
          <div className="mb-2.5 flex items-center gap-2">
            <div className="openmail-skeleton-shine h-2 w-2 shrink-0 rounded-full bg-white/[0.06]" />
            <div className="openmail-skeleton-shine h-3.5 flex-1 max-w-[78%] rounded-md bg-white/[0.06]" />
          </div>
          <div className="openmail-skeleton-shine mb-2 h-2.5 w-[38%] rounded-md bg-white/[0.05]" />
          <div className="openmail-skeleton-shine h-2.5 w-full rounded-md bg-white/[0.04]" />
          <div className="openmail-skeleton-shine mt-2 h-2.5 w-[88%] rounded-md bg-white/[0.035]" />
        </div>
      ))}
    </div>
  );
}

export function ImapSyncErrorBanner({
  message,
  syncing,
  onDismiss,
  onRetry,
}: {
  message: string;
  syncing?: boolean;
  onDismiss: () => void;
  onRetry: () => void | Promise<void>;
}) {
  return (
    <div
      className="mb-3 shrink-0 rounded-[10px] border border-amber-500/30 bg-amber-500/[0.07] px-3 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
      role="alert"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-amber-200/85">
            IMAP / mailbox sync
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-amber-100/88">{message}</p>
        </div>
        <button
          type="button"
          className="shrink-0 rounded-md px-1.5 py-0.5 text-lg leading-none text-amber-200/60 transition-colors hover:bg-white/[0.06] hover:text-amber-100"
          aria-label="Dismiss IMAP error"
          onClick={onDismiss}
        >
          ×
        </button>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={syncing}
          className="rounded-[8px] border border-amber-500/35 bg-[#121212] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-amber-100/95 transition-colors hover:border-amber-400/50 disabled:cursor-not-allowed disabled:opacity-50"
          onClick={() => void onRetry()}
        >
          {syncing ? "Syncing…" : "Retry sync"}
        </button>
      </div>
    </div>
  );
}

export function MailListInboxOnboarding({
  onConnectGmail,
  onManualSetup,
  onRetryCheck,
}: {
  onConnectGmail: () => void;
  onManualSetup: () => void;
  onRetryCheck?: () => void | Promise<void>;
}) {
  const { theme } = useOpenmailTheme();
  const isLight = theme === "soft-intelligence-light";
  return (
    <div className="flex min-h-[220px] flex-col items-center justify-center gap-4 px-3 py-10 text-center">
      <div
        className="flex h-14 w-14 items-center justify-center rounded-2xl border border-[var(--accent)]/35 bg-[var(--accent-soft)] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
        aria-hidden
      >
        <svg
          className="h-7 w-7 text-[var(--accent)]"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.25"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
          />
        </svg>
      </div>
      <div className="max-w-[280px] space-y-2">
        <p className="text-sm font-semibold text-[var(--text-main)]">
          No inbox connected yet
        </p>
        <p className="text-xs leading-relaxed text-[color:var(--text-soft)]">
          OpenMail needs access to your email to start.
        </p>
      </div>
      <div className="flex w-full max-w-[280px] flex-col gap-2 sm:flex-row sm:justify-center">
        <button
          type="button"
          className="w-full rounded-[10px] border border-[var(--accent)]/45 bg-[var(--accent-soft)] px-4 py-2.5 text-xs font-semibold text-[var(--text-main)] shadow-[0_1px_0_rgba(255,255,255,0.04)] transition-[filter,opacity] hover:brightness-[1.03] sm:flex-1"
          onClick={() => void onConnectGmail()}
        >
          Connect Gmail
        </button>
        <button
          type="button"
          className={
            isLight
              ? "w-full rounded-[10px] border border-[rgba(0,0,0,0.15)] bg-transparent px-4 py-2.5 text-xs font-semibold text-[rgba(0,0,0,0.75)] shadow-none transition-[background-color,border-color] hover:border-[rgba(0,0,0,0.25)] hover:bg-[rgba(0,0,0,0.04)] sm:flex-1"
              : "w-full rounded-[10px] border border-white/[0.1] bg-[#141414] px-4 py-2.5 text-xs font-semibold text-[var(--text-main)] transition-colors hover:border-[var(--accent)]/40 sm:flex-1"
          }
          onClick={() => void onManualSetup()}
        >
          Manual setup
        </button>
      </div>
      <p className="max-w-[280px] text-[10px] leading-relaxed text-[color:var(--text-soft)]">
        IMAP read-only. Your emails stay on your provider.
      </p>
      {onRetryCheck ? (
        <button
          type="button"
          className={`text-[10px] font-medium text-[color:var(--text-soft)] underline underline-offset-2 transition-colors hover:text-[var(--text-main)] ${
            isLight ? "decoration-black/[0.18]" : "decoration-white/15"
          }`}
          onClick={() => void onRetryCheck()}
        >
          I&apos;ve connected — refresh inbox
        </button>
      ) : null}
    </div>
  );
}

export function MailListApiError({
  message,
  onRetry,
  hideForOnboarding = false,
}: {
  message: string;
  onRetry?: () => void | Promise<void>;
  /** When inbox onboarding is active, never render the technical error UI. */
  hideForOnboarding?: boolean;
}) {
  if (hideForOnboarding) return null;
  return (
    <div className="flex min-h-[200px] flex-col items-center justify-center gap-4 px-2 py-8 text-center">
      <div
        className="flex h-12 w-12 items-center justify-center rounded-2xl border border-red-500/35 bg-red-500/[0.08] text-lg text-red-200/90"
        aria-hidden
      >
        !
      </div>
      <div className="max-w-[240px] space-y-1.5">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-red-200/80">
          Inbox unavailable
        </p>
        <p className="text-xs leading-relaxed text-[color:var(--text-soft)]">{message}</p>
        <p className="text-[10px] leading-relaxed text-[#5c5c5c]">
          API or network error while loading messages from the server.
        </p>
      </div>
      {onRetry ? (
        <button
          type="button"
          className="rounded-[10px] border border-[var(--border)] bg-[#141414] px-4 py-2 text-xs font-semibold text-[var(--text-main)] shadow-[0_0_0_1px_var(--openmail-shadow-accent-sm)] transition-colors hover:border-[var(--accent)]/60"
          onClick={() => void onRetry()}
        >
          Try again
        </button>
      ) : null}
    </div>
  );
}

export function MailListEmptyState({
  isFiltered,
  folderLabel,
  inboxEmptyHintDb,
  onRefresh,
  refreshing,
  showRefresh,
  emptyTitle,
  emptyDetail,
}: {
  isFiltered: boolean;
  folderLabel: string;
  inboxEmptyHintDb?: boolean;
  onRefresh?: () => void | Promise<void>;
  refreshing?: boolean;
  showRefresh?: boolean;
  /** Overrides default “No matches” heading when list is filtered empty */
  emptyTitle?: string;
  /** Overrides default filtered empty subline */
  emptyDetail?: string;
}) {
  return (
    <div className="flex min-h-[220px] flex-col items-center justify-center gap-4 px-3 py-10 text-center">
      <div
        className="relative flex h-14 w-14 items-center justify-center rounded-2xl border border-white/[0.08] bg-[#0c0c0c] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
        aria-hidden
      >
        <svg
          className="h-7 w-7 text-[var(--text-soft)] opacity-50"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.25"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
          />
        </svg>
        <span className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full border border-[var(--border)] bg-[#111] text-[10px] text-[var(--accent)]">
          0
        </span>
      </div>
      <div className="max-w-[260px] space-y-1">
        <p className="text-sm font-semibold text-[var(--text-main)]">
          {isFiltered
            ? emptyTitle ?? "No matches"
            : `${folderLabel} is empty`}
        </p>
        <p className="text-xs leading-relaxed text-[color:var(--text-soft)]">
          {isFiltered
            ? emptyDetail ?? "Try another search or clear filters."
            : inboxEmptyHintDb && folderLabel === "Inbox"
              ? "Pull the latest messages from your mail source, or confirm your database and IMAP settings."
              : "You are all caught up. New messages will appear here when they arrive."}
        </p>
      </div>
      {showRefresh && onRefresh ? (
        <button
          type="button"
          disabled={refreshing}
          className="rounded-[10px] border border-[var(--accent)]/40 bg-[var(--accent-soft)] px-4 py-2 text-xs font-semibold text-[var(--text-main)] transition-colors hover:border-[var(--accent)]/70 disabled:cursor-not-allowed disabled:opacity-50"
          onClick={() => void onRefresh()}
        >
          {refreshing ? "Refreshing…" : "Refresh inbox"}
        </button>
      ) : null}
    </div>
  );
}
