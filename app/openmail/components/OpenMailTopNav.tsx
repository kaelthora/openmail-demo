"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type OpenMailTopNavProps = {
  centerTitle?: string | null;
  onSearchClick?: () => void;
  onSettingsClick?: () => void;
  /** Folders column visibility */
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  onNewEmail: () => void;
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

const navIconBtn =
  "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[var(--text-soft)] transition-colors duration-200 hover:bg-white/[0.06] hover:text-[var(--text-main)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/20";

const menuItemClass =
  "flex w-full items-center rounded-lg px-3 py-2.5 text-left text-[13px] font-medium text-[var(--text-main)] transition-colors hover:bg-white/[0.06] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/20";

export function OpenMailTopNav({
  centerTitle,
  onSearchClick,
  onSettingsClick,
  sidebarOpen,
  onToggleSidebar,
  onNewEmail,
}: OpenMailTopNavProps) {
  const title = centerTitle?.trim() ?? "";
  const [menuOpen, setMenuOpen] = useState(false);
  const menuWrapRef = useRef<HTMLDivElement>(null);

  const closeMenu = useCallback(() => setMenuOpen(false), []);

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      const el = menuWrapRef.current;
      if (el && !el.contains(e.target as Node)) closeMenu();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeMenu();
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen, closeMenu]);

  return (
    <header
      className="openmail-topnav relative z-10 flex h-12 shrink-0 items-stretch border-b border-white/[0.06] bg-[rgba(10,10,10,0.6)] backdrop-blur-md [-webkit-backdrop-filter:blur(12px)]"
      role="banner"
    >
      <div className="grid h-full w-full grid-cols-[1fr_auto_1fr] items-center px-3 sm:px-4">
        <div ref={menuWrapRef} className="relative flex min-w-0 items-center gap-3">
          <button
            type="button"
            className={navIconBtn}
            aria-label="Menu"
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            onClick={() => setMenuOpen((o) => !o)}
          >
            <IconMenu className="h-[18px] w-[18px]" />
          </button>
          {menuOpen ? (
            <div
              role="menu"
              className="absolute left-0 top-[calc(100%+6px)] z-[60] min-w-[200px] rounded-xl border border-white/[0.08] bg-[#111111] py-1 shadow-[0_16px_48px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.04)]"
            >
              <button
                type="button"
                role="menuitem"
                className={menuItemClass}
                onClick={() => {
                  onNewEmail();
                  closeMenu();
                }}
              >
                New email
              </button>
              <button
                type="button"
                role="menuitem"
                className={menuItemClass}
                onClick={() => {
                  onToggleSidebar();
                  closeMenu();
                }}
              >
                {sidebarOpen ? "Hide folders" : "Show folders"}
              </button>
            </div>
          ) : null}
          <span className="select-none text-[13px] font-medium tracking-[0.02em] text-[var(--text-soft)] [text-shadow:0_0_20px_rgba(255,255,255,0.12),0_0_40px_rgba(255,255,255,0.04)]">
            OpenMail
          </span>
        </div>

        <div className="flex min-h-0 justify-center px-2">
          {title ? (
            <span className="max-w-[40vw] truncate text-center text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--text-soft)]/70">
              {title}
            </span>
          ) : null}
        </div>

        <div className="flex items-center justify-end gap-0.5">
          <button
            type="button"
            className={navIconBtn}
            aria-label="Search"
            onClick={onSearchClick}
          >
            <IconSearch className="h-[18px] w-[18px]" />
          </button>
          <button
            type="button"
            className={navIconBtn}
            aria-label="Settings"
            onClick={onSettingsClick}
          >
            <IconSettings className="h-[18px] w-[18px]" />
          </button>
          <button
            type="button"
            className="ml-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/[0.06] bg-white/[0.05] text-[10px] font-medium text-[var(--text-soft)] transition-colors duration-200 hover:border-white/[0.1] hover:bg-white/[0.08] hover:text-[var(--text-main)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/20"
            aria-label="Account"
          >
            <span className="opacity-80">?</span>
          </button>
        </div>
      </div>
    </header>
  );
}
