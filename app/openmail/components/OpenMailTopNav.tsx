"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useOpenmailTheme } from "@/app/openmail/OpenmailThemeProvider";
import { useAppMode } from "@/app/AppModeProvider";

type OpenMailTopNavProps = {
  /** Mailbox / session label (email or legacy env). */
  accountIdentity: string;
  /** Current folder: Inbox, Sent, Drafts. */
  folderLabel: string;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  onFocusSearch: () => void;
  onSettingsPanelOpen: () => void;
  profilePrimary: string;
  profileSecondary?: string | null;
};

function IconMenu({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M5 7h14M5 12h14M5 17h14"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconSearch({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="11" cy="11" r="6.25" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M15.5 15.5L20 20"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconSettings({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.26.604.852.997 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconMoon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 1 0 10.5 10.5Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconSun({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="3.5" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M12 2.75v2.5M12 18.75v2.5M21.25 12h-2.5M5.25 12h-2.5M18.54 5.46l-1.77 1.77M7.23 16.77l-1.77 1.77M18.54 18.54l-1.77-1.77M7.23 7.23 5.46 5.46"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconUser({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="8" r="3.25" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M6.5 19.25c0-3.04 2.46-5.5 5.5-5.5s5.5 2.46 5.5 5.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

const navIconBtn =
  "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[var(--text-soft)] transition-colors duration-200 hover:bg-white/[0.06] hover:text-[var(--text-main)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/20";

function accountAvatarInitials(identity: string): string {
  const t = identity.trim();
  if (!t) return "?";
  if (t.includes("@")) {
    const local = t.split("@")[0] ?? "";
    const a = (local.match(/[a-zA-Z0-9]/g) ?? []).slice(0, 2).join("");
    return a.toUpperCase() || "?";
  }
  const letters = t.replace(/[^a-zA-Z0-9]/g, "").slice(0, 2);
  return letters.toUpperCase() || t.slice(0, 2).toUpperCase();
}

export function OpenMailTopNav({
  accountIdentity,
  folderLabel,
  sidebarOpen,
  onToggleSidebar,
  onFocusSearch,
  onSettingsPanelOpen,
  profilePrimary,
  profileSecondary,
}: OpenMailTopNavProps) {
  const { appMode } = useAppMode();
  const { theme, setTheme } = useOpenmailTheme();
  const identity = accountIdentity.trim() || "OpenMail";
  const folder = folderLabel.trim() || "Inbox";
  const initials = useMemo(() => accountAvatarInitials(identity), [identity]);
  const profileInitials = useMemo(
    () => accountAvatarInitials(profilePrimary.trim() || identity),
    [profilePrimary, identity]
  );
  const [profileOpen, setProfileOpen] = useState(false);
  const profileWrapRef = useRef<HTMLDivElement>(null);
  const darkMode = theme === "soft-dark";
  const modeBadgeDemo = appMode === "demo";

  useEffect(() => {
    if (!profileOpen) return;
    const onDoc = (e: MouseEvent) => {
      const el = profileWrapRef.current;
      if (el && !el.contains(e.target as Node)) setProfileOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setProfileOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [profileOpen]);

  return (
    <header
      className="openmail-topnav relative z-10 flex min-h-[52px] shrink-0 items-stretch border-b border-white/[0.06] bg-[color:var(--openmail-topnav-bg)] backdrop-blur-md [-webkit-backdrop-filter:blur(12px)]"
      role="banner"
    >
      <div className="grid w-full grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 px-3 py-1.5 sm:px-4">
        <div className="flex min-w-0 items-center">
          <button
            type="button"
            className={navIconBtn}
            aria-label={sidebarOpen ? "Hide folder list" : "Show folder list"}
            aria-pressed={sidebarOpen}
            onClick={() => {
              setProfileOpen(false);
              onToggleSidebar();
            }}
          >
            <IconMenu className="h-[18px] w-[18px]" />
          </button>
        </div>

        <div className="flex min-h-0 max-w-[min(58vw,440px)] min-w-0 flex-col items-center justify-center px-2">
          <div className="flex max-w-full items-center gap-2.5">
            <div
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--accent)]/35 bg-gradient-to-br from-[var(--accent-soft)]/90 to-[#1a1a1e] text-[11px] font-bold tracking-tight text-[var(--text-main)] shadow-[0_0_20px_var(--accent-soft),0_0_1px_rgba(255,255,255,0.08)]"
              aria-hidden
            >
              {initials.length >= 2 ? (
                initials
              ) : (
                <IconUser className="h-[17px] w-[17px] text-[var(--text-main)]/90" />
              )}
            </div>
            <p
              className="min-w-0 truncate text-left text-[13px] font-semibold leading-snug tracking-tight text-[var(--text-main)]"
              title={`${identity} · ${folder}`}
            >
              <span className="text-[var(--text-main)]">{identity}</span>
              <span className="mx-1.5 text-[color:var(--text-soft)]/70" aria-hidden>
                •
              </span>
              <span className="font-medium text-[color:var(--text-soft)]">{folder}</span>
            </p>
            <span
              className={`inline-flex shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] ${
                modeBadgeDemo
                  ? "border-amber-500/40 bg-amber-500/15 text-amber-200 shadow-[0_0_14px_rgba(245,158,11,0.18)]"
                  : "border-emerald-500/35 bg-emerald-500/12 text-emerald-200/90"
              }`}
              title={modeBadgeDemo ? "Demo inbox (static threats)" : "Live inbox"}
            >
              {modeBadgeDemo ? "DEMO MODE" : "LIVE INBOX"}
            </span>
          </div>
        </div>

        <div className="flex min-w-0 items-center justify-end gap-0.5">
          <button
            type="button"
            className={navIconBtn}
            aria-label="Search mails"
            onClick={() => {
              setProfileOpen(false);
              onFocusSearch();
            }}
          >
            <IconSearch className="h-[18px] w-[18px]" />
          </button>
          <button
            type="button"
            className={navIconBtn}
            aria-label="Settings"
            onClick={() => {
              setProfileOpen(false);
              onSettingsPanelOpen();
            }}
          >
            <IconSettings className="h-[18px] w-[18px]" />
          </button>
          <button
            type="button"
            className={navIconBtn}
            aria-label={darkMode ? "Switch to light theme" : "Switch to dark theme"}
            aria-pressed={darkMode}
            onClick={() => {
              setProfileOpen(false);
              setTheme(darkMode ? "soft-intelligence-light" : "soft-dark");
            }}
          >
            {darkMode ? (
              <IconSun className="h-[18px] w-[18px]" />
            ) : (
              <IconMoon className="h-[18px] w-[18px]" />
            )}
          </button>

          <div ref={profileWrapRef} className="relative ml-0.5">
            <button
              type="button"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--accent)]/30 bg-gradient-to-br from-[var(--accent-soft)]/80 to-white/[0.05] text-[10px] font-bold tracking-tight text-[var(--text-main)] shadow-[0_0_16px_var(--accent-soft)] transition-colors duration-200 hover:border-[var(--accent)]/45 hover:bg-white/[0.08] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/20"
              aria-label="Account"
              aria-expanded={profileOpen}
              aria-haspopup="dialog"
              onClick={() => {
                setProfileOpen((o) => !o);
              }}
            >
              {profileInitials.length >= 2 ? (
                profileInitials
              ) : (
                <IconUser className="h-[17px] w-[17px] text-[var(--text-soft)]" />
              )}
            </button>
            {profileOpen ? (
              <div
                role="dialog"
                aria-label="Signed-in account"
                className="openmail-nav-popover absolute right-0 top-[calc(100%+6px)] z-[60] w-[min(280px,calc(100vw-24px))] rounded-xl border border-white/[0.08] bg-[color:var(--openmail-nav-popover-bg)] px-3 py-3 shadow-[0_16px_48px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.04)]"
              >
                <p className="truncate text-[13px] font-semibold text-[var(--text-main)]">
                  {profilePrimary}
                </p>
                {profileSecondary?.trim() ? (
                  <p className="mt-0.5 truncate text-[11px] text-[color:var(--text-soft)]">
                    {profileSecondary.trim()}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </header>
  );
}
