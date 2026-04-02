"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useOpenmailTheme } from "../OpenmailThemeProvider";
import { useOpenmailPreferences } from "../OpenmailPreferencesProvider";
import type { OpenmailUiTheme } from "@/lib/openmailTheme";
import type { SettingsSection } from "@/lib/openmailSettingsPrefs";

type OpenmailSettingsPanelProps = {
  open: boolean;
  onClose: () => void;
};

const NAV: Array<{ id: SettingsSection; label: string }> = [
  { id: "accounts", label: "Accounts" },
  { id: "display", label: "Display" },
  { id: "ai", label: "AI" },
  { id: "security", label: "Security" },
];

const navBtnBase =
  "w-full rounded-lg px-3 py-2.5 text-left text-[13px] font-medium transition-[background-color,color] duration-200";
const navBtnIdle =
  "text-[color:var(--text-soft)] hover:bg-white/[0.05] hover:text-[var(--text-main)]";
const navBtnActive =
  "bg-[var(--accent-soft)] text-[var(--text-main)] shadow-[0_0_12px_var(--accent-soft)]";

const segClass =
  "rounded-lg border border-white/[0.08] bg-[#0c0c0c]/90 px-3 py-2 text-[11px] font-medium transition-colors duration-200";
const segOn =
  "border-[var(--accent)]/45 bg-[var(--accent-soft)] text-[var(--text-main)]";
const segOff =
  "text-[color:var(--text-soft)] hover:border-white/[0.12] hover:text-[var(--text-main)]";

function ToggleRow({
  label,
  on,
  onToggle,
}: {
  label: string;
  on: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <span className="text-[13px] text-[var(--text-main)]">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        className={`relative h-7 w-12 shrink-0 rounded-full border transition-colors duration-200 ${
          on
            ? "border-[var(--accent)]/50 bg-[var(--accent-soft)]"
            : "border-white/[0.1] bg-[#141414]"
        }`}
        onClick={onToggle}
      >
        <span
          className={`absolute top-0.5 h-6 w-6 rounded-full bg-[var(--text-main)] shadow transition-transform duration-200 ${
            on ? "translate-x-5" : "translate-x-0.5"
          }`}
        />
      </button>
    </div>
  );
}

export function OpenmailSettingsPanel({
  open,
  onClose,
}: OpenmailSettingsPanelProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const [entered, setEntered] = useState(false);

  const { theme, setTheme } = useOpenmailTheme();
  const prefs = useOpenmailPreferences();

  const [addEmail, setAddEmail] = useState("");
  const [addImap, setAddImap] = useState("");
  const [addSmtp, setAddSmtp] = useState("");
  const [connectBusy, setConnectBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setMounted(true);
      const id = requestAnimationFrame(() => setEntered(true));
      return () => cancelAnimationFrame(id);
    }
    setEntered(false);
  }, [open]);

  const onPanelTransitionEnd = useCallback(
    (e: React.TransitionEvent<HTMLDivElement>) => {
      if (e.propertyName !== "transform") return;
      if (!open) setMounted(false);
    },
    [open]
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => panelRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, [open]);

  const connectMock = useCallback(() => {
    if (!addEmail.trim() || !addImap.trim() || !addSmtp.trim()) return;
    setConnectBusy(true);
    const email = addEmail.trim();
    const imapHost = addImap.trim();
    const smtpHost = addSmtp.trim();
    const id = `acct-${Date.now()}`;
    window.setTimeout(() => {
      prefs.setAccounts((prev) => [
        ...prev,
        {
          id,
          email,
          imapHost,
          smtpHost,
          status: "connected" as const,
        },
      ]);
      setAddEmail("");
      setAddImap("");
      setAddSmtp("");
      setConnectBusy(false);
    }, 900);
  }, [addEmail, addImap, addSmtp, prefs]);

  if (!mounted) return null;

  const sectionTitle = (() => {
    const n = NAV.find((x) => x.id === prefs.activeSection);
    return n?.label ?? "Settings";
  })();

  return (
    <div className="fixed inset-0 z-[120] flex justify-end" role="presentation">
      <button
        type="button"
        className={`absolute inset-0 bg-black/55 backdrop-blur-[6px] transition-opacity duration-300 ease-out ${
          entered ? "opacity-100" : "opacity-0"
        }`}
        aria-label="Close settings"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`openmail-settings-panel relative z-[121] flex h-full w-[min(420px,100vw)] flex-col border-l border-white/[0.08] bg-[rgba(12,12,12,0.82)] shadow-[-12px_0_48px_rgba(0,0,0,0.55)] backdrop-blur-xl [-webkit-backdrop-filter:blur(20px)] transition-transform duration-300 ease-out ${
          entered ? "translate-x-0" : "translate-x-full"
        }`}
        onTransitionEnd={onPanelTransitionEnd}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex shrink-0 items-center justify-between border-b border-white/[0.06] px-5 py-3.5">
          <h2
            id={titleId}
            className="text-[15px] font-semibold tracking-tight text-[var(--text-main)]"
          >
            Settings
          </h2>
          <button
            type="button"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-[color:var(--text-soft)] transition-colors hover:bg-white/[0.06] hover:text-[var(--text-main)]"
            aria-label="Close"
            onClick={onClose}
          >
            <span className="text-lg leading-none">×</span>
          </button>
        </header>

        <div className="flex min-h-0 flex-1">
          <nav
            className="flex w-[132px] shrink-0 flex-col gap-0.5 border-r border-white/[0.06] p-3"
            aria-label="Settings sections"
          >
            {NAV.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`${navBtnBase} ${
                  prefs.activeSection === item.id ? navBtnActive : navBtnIdle
                }`}
                onClick={() => prefs.setActiveSection(item.id)}
              >
                {item.label}
              </button>
            ))}
          </nav>

          <div className="min-h-0 min-w-0 flex-1 overflow-y-auto p-5">
            <div
              key={prefs.activeSection}
              className="openmail-settings-section-content"
            >
            <h3 className="mb-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--text-soft)]">
              {sectionTitle}
            </h3>

            {prefs.activeSection === "accounts" ? (
              <div className="space-y-5">
                <div className="space-y-2">
                  {prefs.accounts.map((a) => (
                    <div
                      key={a.id}
                      className="rounded-xl border border-white/[0.08] bg-[#0c0c0c]/90 px-3.5 py-3"
                    >
                      <div className="text-[13px] font-medium text-[var(--text-main)]">
                        {a.email}
                      </div>
                      <div className="mt-1 text-[11px] text-[color:var(--text-soft)]">
                        {a.imapHost} · {a.smtpHost}
                      </div>
                      <div
                        className={`mt-2 inline-flex rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                          a.status === "connected"
                            ? "border-emerald-500/35 bg-emerald-500/10 text-emerald-200/90"
                            : a.status === "syncing"
                              ? "border-amber-500/35 bg-amber-500/10 text-amber-100/90"
                              : "border-red-500/35 bg-red-500/10 text-red-200/90"
                        }`}
                      >
                        {a.status}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="rounded-xl border border-white/[0.08] bg-[#0a0a0a]/80 p-4">
                  <div className="mb-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-[color:var(--text-soft)]">
                    Add account
                  </div>
                  <label className="mb-2 block">
                    <span className="mb-1 block text-[10px] text-[color:var(--text-soft)]">
                      Email
                    </span>
                    <input
                      className="w-full rounded-lg border border-white/[0.1] bg-[#141414] px-3 py-2 text-[13px] text-[var(--text-main)] outline-none focus:border-[var(--accent)]/45"
                      value={addEmail}
                      onChange={(e) => setAddEmail(e.target.value)}
                      placeholder="name@domain.com"
                      autoComplete="email"
                    />
                  </label>
                  <label className="mb-2 block">
                    <span className="mb-1 block text-[10px] text-[color:var(--text-soft)]">
                      IMAP host
                    </span>
                    <input
                      className="w-full rounded-lg border border-white/[0.1] bg-[#141414] px-3 py-2 text-[13px] text-[var(--text-main)] outline-none focus:border-[var(--accent)]/45"
                      value={addImap}
                      onChange={(e) => setAddImap(e.target.value)}
                      placeholder="imap.domain.com"
                    />
                  </label>
                  <label className="mb-3 block">
                    <span className="mb-1 block text-[10px] text-[color:var(--text-soft)]">
                      SMTP host
                    </span>
                    <input
                      className="w-full rounded-lg border border-white/[0.1] bg-[#141414] px-3 py-2 text-[13px] text-[var(--text-main)] outline-none focus:border-[var(--accent)]/45"
                      value={addSmtp}
                      onChange={(e) => setAddSmtp(e.target.value)}
                      placeholder="smtp.domain.com"
                    />
                  </label>
                  <button
                    type="button"
                    disabled={
                      connectBusy ||
                      !addEmail.trim() ||
                      !addImap.trim() ||
                      !addSmtp.trim()
                    }
                    className="w-full rounded-lg border border-[var(--accent)]/45 bg-[var(--accent-soft)] py-2.5 text-[13px] font-semibold text-[var(--text-main)] transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
                    onClick={connectMock}
                  >
                    {connectBusy ? "Connecting…" : "Connect"}
                  </button>
                </div>
              </div>
            ) : null}

            {prefs.activeSection === "display" ? (
              <div className="space-y-1">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-[color:var(--text-soft)]">
                  Theme
                </p>
                <div className="mb-5 flex gap-2">
                  {(
                    [
                      { id: "blacken" as OpenmailUiTheme, label: "Blacken" },
                      { id: "soft-dark" as OpenmailUiTheme, label: "Soft Dark" },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      className={`${segClass} flex-1 ${
                        theme === opt.id ? segOn : segOff
                      }`}
                      onClick={() => setTheme(opt.id)}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>

                <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-[color:var(--text-soft)]">
                  Density
                </p>
                <div className="mb-5 flex gap-2">
                  <button
                    type="button"
                    className={`${segClass} flex-1 ${
                      prefs.display.density === "compact" ? segOn : segOff
                    }`}
                    onClick={() => prefs.updateDisplay({ density: "compact" })}
                  >
                    Compact
                  </button>
                  <button
                    type="button"
                    className={`${segClass} flex-1 ${
                      prefs.display.density === "comfortable" ? segOn : segOff
                    }`}
                    onClick={() =>
                      prefs.updateDisplay({ density: "comfortable" })
                    }
                  >
                    Comfortable
                  </button>
                </div>

                <ToggleRow
                  label="Animations"
                  on={prefs.display.animations}
                  onToggle={() =>
                    prefs.updateDisplay({
                      animations: !prefs.display.animations,
                    })
                  }
                />
              </div>
            ) : null}

            {prefs.activeSection === "ai" ? (
              <div className="space-y-1">
                <ToggleRow
                  label="Auto suggestions"
                  on={prefs.ai.autoSuggestions}
                  onToggle={() =>
                    prefs.updateAi({
                      autoSuggestions: !prefs.ai.autoSuggestions,
                    })
                  }
                />
                <ToggleRow
                  label="Auto analyze emails"
                  on={prefs.ai.autoAnalyze}
                  onToggle={() =>
                    prefs.updateAi({ autoAnalyze: !prefs.ai.autoAnalyze })
                  }
                />
                <p className="mb-2 mt-4 text-[10px] font-semibold uppercase tracking-[0.12em] text-[color:var(--text-soft)]">
                  Default tone
                </p>
                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      "Professional",
                      "Friendly",
                      "Direct",
                      "Short",
                    ] as const
                  ).map((tone) => (
                    <button
                      key={tone}
                      type="button"
                      className={`${segClass} ${
                        prefs.ai.defaultTone === tone ? segOn : segOff
                      }`}
                      onClick={() => prefs.updateAi({ defaultTone: tone })}
                    >
                      {tone}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {prefs.activeSection === "security" ? (
              <div className="space-y-1">
                <ToggleRow
                  label="Block risky attachments"
                  on={prefs.security.blockRiskyAttachments}
                  onToggle={() =>
                    prefs.updateSecurity({
                      blockRiskyAttachments:
                        !prefs.security.blockRiskyAttachments,
                    })
                  }
                />
                <ToggleRow
                  label="Force sandbox for links"
                  on={prefs.security.forceSandboxLinks}
                  onToggle={() =>
                    prefs.updateSecurity({
                      forceSandboxLinks: !prefs.security.forceSandboxLinks,
                    })
                  }
                />
                <p className="mb-2 mt-4 text-[10px] font-semibold uppercase tracking-[0.12em] text-[color:var(--text-soft)]">
                  Sensitivity
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className={`${segClass} flex-1 ${
                      prefs.security.sensitivity === "strict" ? segOn : segOff
                    }`}
                    onClick={() =>
                      prefs.updateSecurity({ sensitivity: "strict" })
                    }
                  >
                    Strict
                  </button>
                  <button
                    type="button"
                    className={`${segClass} flex-1 ${
                      prefs.security.sensitivity === "normal" ? segOn : segOff
                    }`}
                    onClick={() =>
                      prefs.updateSecurity({ sensitivity: "normal" })
                    }
                  >
                    Normal
                  </button>
                </div>
              </div>
            ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
