"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useOpenmailTheme } from "../OpenmailThemeProvider";
import { useOpenmailPreferences } from "../OpenmailPreferencesProvider";
import { useMailStore } from "../MailStoreProvider";
import { useOpenmailToast } from "../OpenmailToastProvider";
import { useSmartNotifications } from "../SmartNotificationsProvider";
import type { OpenmailUiTheme } from "@/lib/openmailTheme";
import {
  OPENMAIL_SETTINGS_DEFAULT,
  type OpenmailSecurityPrefs,
  type SettingsSection,
} from "@/lib/openmailSettingsPrefs";
import { OPENMAIL_DEMO_MODE } from "@/lib/openmailDemo";
import { GUARDIAN_ETHICAL_GUARDRAILS } from "@/lib/guardianEngine";
import {
  guardianDecisionLabel,
  guardianRiskLabel,
  guardianTraceSourceLabel,
} from "@/lib/guardianTrace";
import { useGuardianTrace } from "../GuardianTraceProvider";
import { isGmailDomainEmail } from "@/lib/accountConfigJson";
import { GMAIL_APP_PASSWORD_HELP_URL } from "@/lib/gmailConnectionHelp";
import {
  emptyAccountProfile,
  type MailTransportSecurity,
  type OpenMailAccountProfile,
} from "@/lib/mailAccountConfig";
import { apiUrl } from "@/lib/config";

type OpenmailSettingsPanelProps = {
  open: boolean;
  onClose: () => void;
  /** When opening Settings → Accounts from inbox onboarding, pre-select Quick vs Manual. */
  accountsInitialAddMode?: "quick" | "manual" | null;
  onAccountsInitialAddModeConsumed?: () => void;
};

const NAV: Array<{ id: SettingsSection; label: string }> = [
  { id: "accounts", label: "Accounts" },
  { id: "security", label: "Security" },
  { id: "display", label: "Display" },
  { id: "ai", label: "AI" },
];

const navBtnBase =
  "w-full rounded-lg px-3 py-2.5 text-left text-[13px] font-medium transition-[background-color,color] duration-200";
const navBtnIdle =
  "text-[color:var(--text-soft)] hover:bg-white/[0.05] hover:text-[var(--text-main)]";
const navBtnActive =
  "bg-[var(--accent-soft)] text-[var(--text-main)] shadow-[0_0_12px_var(--accent-soft)]";

function isAutoProtectModeEnabled(security: OpenmailSecurityPrefs): boolean {
  return (
    security.sensitivity === "strict" &&
    security.forceSandboxLinks &&
    security.blockRiskyAttachments
  );
}

function ToggleRow({
  label,
  description,
  on,
  onToggle,
}: {
  label: string;
  description?: string;
  on: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="toggle-row flex items-center justify-between gap-3 py-5">
      <div className="min-w-0 flex-1 pr-1">
        <span className="text-[13px] font-medium text-[var(--text-main)]">{label}</span>
        {description ? (
          <p className="mt-1 max-w-[min(100%,22rem)] text-[11px] leading-relaxed text-[color:var(--text-soft)]">
            {description}
          </p>
        ) : null}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        className="toggle focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]/35"
        onClick={onToggle}
      >
        <span
          className={`toggle-track border transition-colors duration-200 ${
            on
              ? "border-[var(--accent)]/50 bg-[var(--accent-soft)]"
              : "border-white/[0.1] bg-[color:var(--openmail-input-bg)]"
          }`}
        >
          <span className="toggle-knob bg-[var(--text-main)] shadow-sm" />
        </span>
      </button>
    </div>
  );
}

function SettingSectionCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="settings-card overflow-hidden rounded-2xl border border-white/[0.08] bg-gradient-to-b from-[#111111] to-[#0c0c0c] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      <header className="border-b border-white/[0.07] pb-3">
        <h3 className="text-[14px] font-semibold tracking-tight text-[var(--text-main)]">
          {title}
        </h3>
        {description ? (
          <p className="mt-1.5 text-[11px] leading-relaxed text-[color:var(--text-soft)]">
            {description}
          </p>
        ) : null}
      </header>
      <div className="divide-y divide-white/[0.06]">{children}</div>
    </section>
  );
}

function SettingField({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="py-4">
      <div className="text-[13px] font-medium text-[var(--text-main)]">{label}</div>
      {description ? (
        <p className="mt-1 max-w-[min(100%,26rem)] text-[11px] leading-relaxed text-[color:var(--text-soft)]">
          {description}
        </p>
      ) : null}
      <div className="mt-3">{children}</div>
    </div>
  );
}

function IconSun({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconMoon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M21 14.5A8.5 8.5 0 0 1 9.5 3 6.5 6.5 0 1 0 21 14.5Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const fieldInputClass =
  "w-full rounded-lg border border-white/[0.1] bg-[color:var(--openmail-input-bg)] px-3 py-2 text-[13px] text-[var(--text-main)] outline-none focus:border-[var(--accent)]/45";

function SettingsAccountsDemo() {
  const prefs = useOpenmailPreferences();
  const [addEmail, setAddEmail] = useState("");
  const [addImap, setAddImap] = useState("");
  const [addSmtp, setAddSmtp] = useState("");
  const [connectBusy, setConnectBusy] = useState(false);

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

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        {prefs.accounts.length === 0 ? (
          <p className="rounded-xl border border-dashed border-white/[0.1] bg-[#0a0a0a]/60 px-3.5 py-6 text-center text-[12px] text-[color:var(--text-soft)]">
            No demo accounts yet. Add one with the form below.
          </p>
        ) : null}
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
          Add demo account
        </div>
        <label className="mb-2 block">
          <span className="mb-1 block text-[10px] text-[color:var(--text-soft)]">
            Email
          </span>
          <input
            className={fieldInputClass}
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
            className={fieldInputClass}
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
            className={fieldInputClass}
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
          {connectBusy ? "Connecting…" : "Add mock account"}
        </button>
      </div>
    </div>
  );
}

const SEC_OPTS: MailTransportSecurity[] = ["ssl", "tls", "none"];

function SettingsAccountsServer({
  settingsOpen,
  accountsActive,
  accountsInitialAddMode,
  onAccountsInitialAddModeConsumed,
}: {
  settingsOpen: boolean;
  accountsActive: boolean;
  accountsInitialAddMode?: "quick" | "manual" | null;
  onAccountsInitialAddModeConsumed?: () => void;
}) {
  const { theme } = useOpenmailTheme();
  const isLight = theme === "soft-intelligence-light";
  const toast = useOpenmailToast();
  const {
    serverMailAccounts,
    inboxScope,
    setInboxScopePersist,
    refreshServerAccounts,
    removeServerAccount,
    syncServerInbox,
    refreshMailsFromApi,
  } = useMailStore();

  const [addMode, setAddMode] = useState<"quick" | "manual">("quick");
  const [addEmail, setAddEmail] = useState("");
  const [addPassword, setAddPassword] = useState("");
  const [addImap, setAddImap] = useState("");
  const [addSmtp, setAddSmtp] = useState("");
  const [imapPort, setImapPort] = useState(993);
  const [smtpPort, setSmtpPort] = useState(587);
  const [imapSec, setImapSec] = useState<MailTransportSecurity>("ssl");
  const [smtpSec, setSmtpSec] = useState<MailTransportSecurity>("tls");
  const [imapUser, setImapUser] = useState("");
  const [smtpUser, setSmtpUser] = useState("");
  const [connectBusy, setConnectBusy] = useState(false);
  const [connectStep, setConnectStep] = useState<string | null>(null);
  const [connectAttempts, setConnectAttempts] = useState(0);
  const [showRetry, setShowRetry] = useState(false);
  const [removeBusy, setRemoveBusy] = useState<string | null>(null);
  const [syncBusy, setSyncBusy] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const lbl = isLight
    ? "mb-1 block text-[10px] font-medium text-[#555]"
    : "mb-1 block text-[10px] text-[color:var(--text-soft)]";
  const lblSection = isLight
    ? "mb-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#555]"
    : "mb-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-[color:var(--text-soft)]";
  const accountsInput = isLight
    ? "w-full rounded-lg border border-[rgba(0,0,0,0.08)] bg-white px-3 py-2 text-[13px] text-[#1a1a1a] shadow-none outline-none transition-[border-color,box-shadow] placeholder:text-neutral-400 focus:border-[rgba(0,0,0,0.16)] focus:shadow-[0_0_0_3px_rgba(100,116,139,0.08)] focus:outline-none"
    : fieldInputClass;
  const warnLegacy = isLight
    ? "rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-950"
    : "rounded-lg border border-amber-500/25 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-100/90";
  const emptyBox = isLight
    ? "rounded-xl border border-dashed border-black/15 bg-white px-3.5 py-6 text-center text-[12px] text-[#555]"
    : "rounded-xl border border-dashed border-white/[0.1] bg-[#0a0a0a] px-3.5 py-6 text-center text-[12px] text-[color:var(--text-soft)]";
  const accountCard = isLight
    ? "rounded-xl border border-black/[0.08] bg-white px-4 py-4 shadow-[0_4px_20px_rgba(0,0,0,0.05)]"
    : "rounded-xl border border-white/[0.08] bg-[#0c0c0c] px-4 py-4";
  const accountMetaLbl = isLight
    ? "text-[10px] font-semibold uppercase tracking-[0.12em] text-[#555]"
    : "text-[10px] font-semibold uppercase tracking-[0.12em] text-[color:var(--text-soft)]";
  const accountDivider = isLight ? "border-black/[0.08]" : "border-white/[0.06]";
  const btnSecondary = isLight
    ? "rounded-lg border border-black/10 bg-white px-2.5 py-1.5 text-[11px] font-medium text-[#1a1a1a] transition-colors hover:border-black/18 hover:bg-[#f6f7f9] disabled:cursor-not-allowed disabled:opacity-50"
    : "rounded-lg border border-white/[0.1] bg-[#141414] px-2.5 py-1.5 text-[11px] font-medium text-[var(--text-main)] transition-colors hover:border-[var(--accent)]/40 disabled:cursor-not-allowed disabled:opacity-40";
  const btnDanger = isLight
    ? "rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-[11px] font-medium text-red-800 transition-colors hover:border-red-300 hover:bg-red-100 disabled:opacity-45"
    : "rounded-lg border border-red-500/25 bg-red-500/5 px-2.5 py-1.5 text-[11px] font-medium text-red-200/90 transition-colors hover:border-red-500/40 disabled:opacity-45";
  const formCard = isLight
    ? "rounded-xl border border-black/[0.08] bg-[#f3f4f6] p-4 shadow-[0_4px_20px_rgba(0,0,0,0.05)]"
    : "rounded-xl border border-white/[0.08] bg-[#0a0a0a] p-4";
  const segBtn = "flex-1 rounded-lg border px-3 py-2 text-[11px] font-medium transition-colors duration-200";
  const segActive = isLight
    ? `${segBtn} border-[var(--openmail-border-accent-strong)] bg-[var(--accent-soft)] font-semibold text-[#1a1a1a] shadow-sm`
    : `${segBtn} border-[var(--accent)]/45 bg-[var(--accent-soft)] text-[var(--text-main)]`;
  const segIdle = isLight
    ? `${segBtn} border-black/10 bg-white text-[#555] hover:border-black/15 hover:bg-[#fafafa]`
    : `${segBtn} border-white/[0.08] bg-[#0c0c0c] text-[color:var(--text-soft)] hover:border-white/[0.12] hover:text-[var(--text-main)]`;
  const formErrBox = isLight
    ? "mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-900"
    : "mb-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[12px] text-red-200/95";
  const connectPrimary = isLight
    ? "w-full rounded-lg border border-[var(--accent)]/50 bg-gradient-to-b from-[var(--accent-soft)] to-slate-200/40 py-2.5 text-[13px] font-semibold text-[#161616] shadow-[0_1px_2px_rgba(0,0,0,0.06)] transition-[filter,opacity] hover:brightness-[1.03] disabled:cursor-not-allowed disabled:opacity-50"
    : "w-full rounded-lg border border-[var(--accent)]/45 bg-[var(--accent-soft)] py-2.5 text-[13px] font-semibold text-[var(--text-main)] transition-opacity hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-40";
  const manualSep = isLight ? "border-t border-black/[0.08]" : "border-t border-white/[0.06]";
  const hintQuick = isLight
    ? "mb-3 text-[11px] leading-relaxed text-[#555]"
    : "mb-3 text-[11px] leading-relaxed text-[color:var(--text-soft)]";

  useEffect(() => {
    if (!settingsOpen || !accountsActive) return;
    void refreshServerAccounts();
  }, [settingsOpen, accountsActive, refreshServerAccounts]);

  useEffect(() => {
    if (!settingsOpen || !accountsActive || !accountsInitialAddMode) return;
    setAddMode(accountsInitialAddMode);
    onAccountsInitialAddModeConsumed?.();
  }, [
    settingsOpen,
    accountsActive,
    accountsInitialAddMode,
    onAccountsInitialAddModeConsumed,
  ]);

  const persistConnectedAccount = useCallback(
    async (profile: OpenMailAccountProfile) => {
      const save = await fetch(apiUrl("/api/accounts"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: profile.email.trim().toLowerCase(),
          imap: profile.imap,
          smtp: profile.smtp,
        }),
      });
      const sj = (await save.json()) as {
        account?: { id: string };
        error?: string;
      };
      if (!save.ok || !sj.account?.id) {
        throw new Error(sj.error || "Could not save account to the database");
      }
      return sj.account.id;
    },
    []
  );

  const handleConnect = useCallback(async () => {
    const sleep = (ms: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, ms));
    const email = addEmail.trim();
    const isGmailQuick =
      addMode === "quick" && email.toLowerCase().endsWith("@gmail.com");
    const password = addPassword;
    setFormError(null);
    setShowRetry(false);
    setConnectAttempts(0);
    if (!email || !password) {
      setFormError("Email and password are required.");
      return;
    }
    if (addMode === "manual") {
      if (!addImap.trim() || !addSmtp.trim()) {
        setFormError("IMAP and SMTP hostnames are required for manual setup.");
        return;
      }
    }
    setConnectBusy(true);
    setConnectStep(
      isGmailQuick ? "Using optimized Gmail connection" : "Connecting securely..."
    );
    try {
      const maxAttempts = isGmailQuick ? 1 : 3;
      let lastErr: string | null = null;
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        setConnectAttempts(attempt);
        let createdId: string | null = null;
        try {
          let res: Response;
          if (addMode === "quick") {
            if (isGmailQuick) {
              console.log("SENDING:", email, password);
              res = await fetch("/api/connect", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  email: email.trim(),
                  password: password.replace(/\s/g, ""),
                }),
              });
            } else {
              res = await fetch(apiUrl("/api/mail/connect-account"), {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ mode: "auto", email, password }),
              });
            }
          } else {
            const base = emptyAccountProfile();
            const manual: OpenMailAccountProfile = {
              ...base,
              id: `tmp-${Date.now()}`,
              label: email.split("@")[0] || "Primary",
              email,
              imap: {
                host: addImap.trim(),
                port: imapPort,
                username: (imapUser.trim() || email).trim(),
                password,
                security: imapSec,
              },
              smtp: {
                host: addSmtp.trim(),
                port: smtpPort,
                username: (smtpUser.trim() || email).trim(),
                password,
                security: smtpSec,
              },
            };
            res = await fetch(apiUrl("/api/mail/connect-account"), {
              method: "POST",
              credentials: "include",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                mode: "manual",
                email,
                password,
                manual,
              }),
            });
          }
          setConnectStep("Verifying server...");
          const data = (await res.json()) as {
            ok?: boolean;
            account?: OpenMailAccountProfile;
            error?: string;
            message?: string;
          };
          if (!res.ok || data.ok === false) {
            throw new Error(data.error || "Could not verify IMAP/SMTP");
          }
          const account =
            data.account ??
            (isGmailQuick
              ? ({
                  ...emptyAccountProfile(),
                  id: `tmp-${Date.now()}`,
                  label: email.split("@")[0] || "Primary",
                  email,
                  imap: {
                    host: "imap.gmail.com",
                    port: 993,
                    username: email,
                    password,
                    security: "ssl",
                  },
                  smtp: {
                    host: "smtp.gmail.com",
                    port: 587,
                    username: email,
                    password,
                    security: "tls",
                  },
                } satisfies OpenMailAccountProfile)
              : null);
          if (!account) {
            throw new Error("Could not verify IMAP/SMTP");
          }
          if (data.message) {
            setConnectStep(data.message);
          }
          createdId = await persistConnectedAccount(account);
          await refreshServerAccounts();
          setInboxScopePersist(createdId);
          setConnectStep("Syncing inbox…");
          const syncRes = await syncServerInbox({ accountId: createdId });
          if (!syncRes.ok) {
            console.warn("[OpenMail] post-connect sync:", syncRes.error);
          }
          setConnectStep("Loading inbox…");
          const loadRes = await refreshMailsFromApi({ accountId: createdId });
          if (!loadRes.ok) {
            throw new Error(loadRes.error || "Could not load inbox");
          }
          lastErr = null;
          toast.success("Account connected and inbox ready");
          break;
        } catch (err) {
          if (createdId) {
            await removeServerAccount(createdId);
          }
          lastErr = err instanceof Error ? err.message : "Connection failed";
          if (attempt < maxAttempts) {
            setConnectStep(
              isGmailQuick
                ? "Using optimized Gmail connection"
                : "Connecting securely..."
            );
            await sleep(1000);
          }
        }
      }
      if (lastErr) {
        if (addMode === "quick") {
          setAddMode("manual");
          setFormError(
            isGmailQuick
              ? "Connection failed. Please retry or use manual setup."
              : "Connection failed. Please retry or use manual setup. Automatic detection could not verify this provider."
          );
        } else {
          setFormError("Connection failed. Please retry or use manual setup.");
        }
        setShowRetry(true);
        return;
      }
      setAddPassword("");
      setAddImap("");
      setAddSmtp("");
      setImapUser("");
      setSmtpUser("");
      setShowRetry(false);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Connection failed");
      setShowRetry(true);
    } finally {
      setConnectBusy(false);
      setConnectStep(null);
    }
  }, [
    addEmail,
    addPassword,
    addMode,
    addImap,
    addSmtp,
    imapPort,
    smtpPort,
    imapSec,
    smtpSec,
    imapUser,
    smtpUser,
    persistConnectedAccount,
    refreshServerAccounts,
    setInboxScopePersist,
    syncServerInbox,
    refreshMailsFromApi,
    removeServerAccount,
    toast,
  ]);

  const handleRemove = useCallback(
    async (id: string) => {
      if (
        !window.confirm(
          "Remove this mailbox from OpenMail? Messages already stored stay in the database; new sync will not use this account."
        )
      ) {
        return;
      }
      setRemoveBusy(id);
      try {
        const r = await removeServerAccount(id);
        if (!r.ok) {
          toast.error(r.error || "Could not remove account");
          return;
        }
        toast.success("Account removed");
        await refreshMailsFromApi();
      } finally {
        setRemoveBusy(null);
      }
    },
    [removeServerAccount, refreshMailsFromApi, toast]
  );

  const handleUseInbox = useCallback(
    async (id: string) => {
      setInboxScopePersist(id);
      const load = await refreshMailsFromApi({ accountId: id });
      if (!load.ok) toast.error(load.error || "Could not load inbox");
      else toast.success("Inbox switched");
    },
    [setInboxScopePersist, refreshMailsFromApi, toast]
  );

  const handlePull = useCallback(
    async (id: string) => {
      setSyncBusy(id);
      try {
        setInboxScopePersist(id);
        const syncRes = await syncServerInbox({ accountId: id });
        const loadRes = await refreshMailsFromApi({ accountId: id });
        if (!syncRes.ok) toast.error(syncRes.error || "Sync failed");
        else if (!loadRes.ok) toast.error(loadRes.error || "Could not refresh list");
        else toast.success("Mailbox synced");
      } finally {
        setSyncBusy(null);
      }
    },
    [setInboxScopePersist, syncServerInbox, refreshMailsFromApi, toast]
  );

  const canSubmit =
    addEmail.trim().length > 0 &&
    addPassword.length > 0 &&
    (addMode === "quick" ||
      (addImap.trim().length > 0 && addSmtp.trim().length > 0));

  return (
    <div className="space-y-5">
      {inboxScope === "legacy" ? (
        <div className={warnLegacy}>
          Inbox scope is <span className="font-semibold">Environment (legacy)</span>
          — the sidebar selector and saved mailboxes below are separate. Choose
          an account to read Prisma-backed mail for that mailbox.
        </div>
      ) : null}

      <div className="space-y-2">
        {serverMailAccounts.length === 0 ? (
          <p className={emptyBox}>
            No saved mailboxes yet. Connect one below. Quick connect
            automatically detects and verifies your email setup.
          </p>
        ) : null}
        {serverMailAccounts.map((a) => {
          const imapH = a.imap?.host ?? "—";
          const smtpH = a.smtp?.host ?? "—";
          const active = inboxScope === a.id;
          return (
            <div key={a.id} className={accountCard}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1 space-y-3">
                  <div>
                    <div className={accountMetaLbl}>
                      Email
                    </div>
                    <div className="mt-1.5 break-all text-[14px] font-medium leading-snug text-[var(--text-main)]">
                      {a.email}
                    </div>
                  </div>
                  {a.provider ? (
                    <p
                      className={
                        isLight ? "text-[12px] text-[#555]" : "text-[12px] text-[color:var(--text-soft)]"
                      }
                    >
                      Provider: {a.provider}
                    </p>
                  ) : null}
                  <div className={`border-t pt-3 ${accountDivider}`}>
                    <div className={accountMetaLbl}>
                      IMAP / SMTP
                    </div>
                    <div
                      className={
                        isLight
                          ? "mt-2 space-y-1 font-mono text-[11px] leading-relaxed text-[#555]"
                          : "mt-2 space-y-1 font-mono text-[11px] leading-relaxed text-[color:var(--text-soft)]"
                      }
                    >
                      <div>IMAP: {imapH}</div>
                      <div>SMTP: {smtpH}</div>
                    </div>
                  </div>
                </div>
                {active ? (
                  <span
                    className={
                      isLight
                        ? "shrink-0 rounded-md border border-[var(--accent)]/40 bg-[var(--accent-soft)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#1a1a1a]"
                        : "shrink-0 rounded-md border border-[var(--accent)]/40 bg-[var(--accent-soft)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-main)]"
                    }
                  >
                    Active inbox
                  </span>
                ) : null}
              </div>
              <div className={`mt-4 flex flex-wrap gap-2 border-t pt-4 ${accountDivider}`}>
                <button
                  type="button"
                  disabled={active}
                  className={btnSecondary}
                  onClick={() => void handleUseInbox(a.id)}
                >
                  Use for inbox
                </button>
                <button
                  type="button"
                  disabled={syncBusy === a.id}
                  className={btnSecondary}
                  onClick={() => void handlePull(a.id)}
                >
                  {syncBusy === a.id ? "Syncing…" : "Sync now"}
                </button>
                <button
                  type="button"
                  disabled={removeBusy === a.id}
                  className={btnDanger}
                  onClick={() => void handleRemove(a.id)}
                >
                  {removeBusy === a.id ? "Removing…" : "Remove"}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className={formCard}>
        <div className="mb-3 flex gap-2">
          <button
            type="button"
            className={addMode === "quick" ? segActive : segIdle}
            onClick={() => setAddMode("quick")}
          >
            Quick connect
          </button>
          <button
            type="button"
            className={addMode === "manual" ? segActive : segIdle}
            onClick={() => setAddMode("manual")}
          >
            Manual
          </button>
        </div>
        <div className={lblSection}>
          Add mailbox
        </div>
        {formError ? (
          <p className={formErrBox}>
            {formError}
          </p>
        ) : null}
        {connectBusy && connectStep ? (
          <p
            className={
              isLight
                ? "mb-3 rounded-lg border border-black/[0.08] bg-white/80 px-3 py-2 text-[12px] text-[#333]"
                : "mb-3 rounded-lg border border-white/[0.08] bg-[#101010] px-3 py-2 text-[12px] text-[var(--text-main)]"
            }
            aria-live="polite"
          >
            {connectStep}
            {connectAttempts > 0 ? ` (attempt ${connectAttempts}/3)` : ""}
          </p>
        ) : null}
        <label className="mb-2 block">
          <span className={lbl}>
            Email
          </span>
          <input
            className={accountsInput}
            value={addEmail}
            onChange={(e) => setAddEmail(e.target.value)}
            placeholder="name@domain.com"
            autoComplete="email"
          />
        </label>
        <label className="mb-2 block">
          <span className={lbl}>
            Password
          </span>
          <input
            className={accountsInput}
            type="password"
            value={addPassword}
            onChange={(e) => setAddPassword(e.target.value)}
            autoComplete="new-password"
          />
        </label>
        {isGmailDomainEmail(addEmail) ? (
          <p className={`${hintQuick} mb-2`}>
            <span className="block font-medium text-[var(--text-main)]">
              For Gmail:
            </span>
            Use an App Password (not your regular password).{" "}
            <a
              href={GMAIL_APP_PASSWORD_HELP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-[var(--accent)] underline underline-offset-2 transition-opacity hover:opacity-90"
            >
              How to generate it
            </a>
          </p>
        ) : null}
        {addMode === "manual" ? (
          <div className={`mb-2 space-y-3 pt-3 ${manualSep}`}>
            <label className="block">
              <span className={lbl}>
                IMAP host
              </span>
              <input
                className={accountsInput}
                value={addImap}
                onChange={(e) => setAddImap(e.target.value)}
                placeholder="imap.example.com"
              />
            </label>
            <div className="flex gap-2">
              <label className="block flex-1">
                <span className={lbl}>
                  IMAP port
                </span>
                <input
                  className={accountsInput}
                  inputMode="numeric"
                  value={imapPort}
                  onChange={(e) =>
                    setImapPort(Number(e.target.value) || 0)
                  }
                />
              </label>
              <label className="block w-[120px] shrink-0">
                <span className={lbl}>
                  Security
                </span>
                <select
                  className={accountsInput}
                  value={imapSec}
                  onChange={(e) =>
                    setImapSec(e.target.value as MailTransportSecurity)
                  }
                >
                  {SEC_OPTS.map((s) => (
                    <option key={s} value={s}>
                      {s.toUpperCase()}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="block">
              <span className={lbl}>
                IMAP username (optional)
              </span>
              <input
                className={accountsInput}
                value={imapUser}
                onChange={(e) => setImapUser(e.target.value)}
                placeholder="Defaults to email"
              />
            </label>
            <label className="block">
              <span className={lbl}>
                SMTP host
              </span>
              <input
                className={accountsInput}
                value={addSmtp}
                onChange={(e) => setAddSmtp(e.target.value)}
                placeholder="smtp.example.com"
              />
            </label>
            <div className="flex gap-2">
              <label className="block flex-1">
                <span className={lbl}>
                  SMTP port
                </span>
                <input
                  className={accountsInput}
                  inputMode="numeric"
                  value={smtpPort}
                  onChange={(e) =>
                    setSmtpPort(Number(e.target.value) || 0)
                  }
                />
              </label>
              <label className="block w-[120px] shrink-0">
                <span className={lbl}>
                  Security
                </span>
                <select
                  className={accountsInput}
                  value={smtpSec}
                  onChange={(e) =>
                    setSmtpSec(e.target.value as MailTransportSecurity)
                  }
                >
                  {SEC_OPTS.map((s) => (
                    <option key={s} value={s}>
                      {s.toUpperCase()}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="block">
              <span className={lbl}>
                SMTP username (optional)
              </span>
              <input
                className={accountsInput}
                value={smtpUser}
                onChange={(e) => setSmtpUser(e.target.value)}
                placeholder="Defaults to email"
              />
            </label>
          </div>
        ) : (
          <p className={hintQuick}>
            Automatically detects and verifies your email setup before saving.
          </p>
        )}
        <button
          type="button"
          disabled={connectBusy || !canSubmit}
          className={connectPrimary}
          onClick={() => void handleConnect()}
        >
          {connectBusy ? "Verifying & saving…" : "Connect and save"}
        </button>
        {showRetry && !connectBusy ? (
          <button
            type="button"
            className={`${btnSecondary} mt-2 w-full`}
            onClick={() => void handleConnect()}
          >
            Retry connection
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function OpenmailSettingsPanel({
  open,
  onClose,
  accountsInitialAddMode = null,
  onAccountsInitialAddModeConsumed,
}: OpenmailSettingsPanelProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const [entered, setEntered] = useState(false);

  const { theme, setTheme } = useOpenmailTheme();
  const isLight = theme === "soft-intelligence-light";
  const prefs = useOpenmailPreferences();
  const { enableSmartNotifications } = useSmartNotifications();
  const toast = useOpenmailToast();
  const { traces: guardianTraces, clear: clearGuardianTrace } =
    useGuardianTrace();

  useEffect(() => {
    if (open) {
      setMounted(true);
      const id = requestAnimationFrame(() => setEntered(true));
      return () => cancelAnimationFrame(id);
    }
    setEntered(false);
  }, [open]);

  /** If transform transition is skipped (reduced motion / browser), onTransitionEnd may never run — still unmount. */
  useEffect(() => {
    if (open) return;
    const t = window.setTimeout(() => setMounted(false), 360);
    return () => clearTimeout(t);
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

  if (!mounted) return null;

  return (
    <div
      className={`fixed inset-0 z-[120] flex justify-end ${!entered ? "pointer-events-none" : ""}`}
      role="presentation"
    >
      <button
        type="button"
        className={`absolute inset-0 bg-black/55 backdrop-blur-[6px] transition-opacity duration-300 ease-out ${
          entered ? "opacity-100" : "pointer-events-none opacity-0"
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
        className={`openmail-settings-panel relative z-[121] flex h-full w-[90vw] max-w-[720px] flex-col border-l border-white/[0.08] bg-[color:var(--openmail-settings-panel-bg)] shadow-[-12px_0_48px_rgba(0,0,0,0.55)] backdrop-blur-xl [-webkit-backdrop-filter:blur(20px)] transition-transform duration-300 ease-out ${
          entered
            ? "pointer-events-auto translate-x-0"
            : "pointer-events-none translate-x-full"
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
              className="openmail-settings-section-content space-y-5"
            >
              {prefs.activeSection === "accounts" ? (
                <SettingSectionCard
                  title="Accounts"
                  description={
                    OPENMAIL_DEMO_MODE
                      ? "Demo mode uses local sample mail only. Add mock accounts to try the UI—nothing is sent over the network."
                      : "Mailboxes are stored in your OpenMail database (Prisma). We verify IMAP/SMTP, then save credentials server-side for sync and sending."
                  }
                >
                  {OPENMAIL_DEMO_MODE ? (
                    <SettingsAccountsDemo />
                  ) : (
                    <SettingsAccountsServer
                      settingsOpen={open}
                      accountsActive={prefs.activeSection === "accounts"}
                      accountsInitialAddMode={accountsInitialAddMode}
                      onAccountsInitialAddModeConsumed={
                        onAccountsInitialAddModeConsumed
                      }
                    />
                  )}
                </SettingSectionCard>
              ) : null}

              {prefs.activeSection === "security" ? (
                <>
                  <SettingSectionCard
                    title="Auto Protect Mode"
                    description="Turns on strict link handling, forces every link through the protected preview, and blocks risky attachments. Uses the same switches below—no separate engine."
                  >
                    <ToggleRow
                      label="Auto Protect Mode"
                      description="When on: Security strictness, Force sandbox for links, and Block risky attachments are all enabled. When off: they return to OpenMail defaults."
                      on={isAutoProtectModeEnabled(prefs.security)}
                      onToggle={() =>
                        prefs.updateSecurity(
                          isAutoProtectModeEnabled(prefs.security)
                            ? { ...OPENMAIL_SETTINGS_DEFAULT.security }
                            : {
                                sensitivity: "strict",
                                forceSandboxLinks: true,
                                blockRiskyAttachments: true,
                              }
                        )
                      }
                    />
                  </SettingSectionCard>
                  <SettingSectionCard
                    title="Links & attachments"
                    description="Decide how OpenMail handles risky URLs and files before you interact with them."
                  >
                    <ToggleRow
                      label="Block risky attachments"
                      description="Prevents high-risk attachments from opening in the normal path—use when you want hard stops on malware bait."
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
                      description="Sends links through the protected preview flow even when they look safe—stronger than tiered link handling alone."
                      on={prefs.security.forceSandboxLinks}
                      onToggle={() =>
                        prefs.updateSecurity({
                          forceSandboxLinks: !prefs.security.forceSandboxLinks,
                        })
                      }
                    />
                  </SettingSectionCard>
                  <SettingSectionCard
                    title="Strictness"
                    description="Controls how aggressively we treat borderline senders and content."
                  >
                    <ToggleRow
                      label="Security strictness"
                      description="When on, more messages are treated as elevated risk (same as the previous Strict preset). Off keeps balanced defaults."
                      on={prefs.security.sensitivity === "strict"}
                      onToggle={() =>
                        prefs.updateSecurity({
                          sensitivity:
                            prefs.security.sensitivity === "strict"
                              ? "normal"
                              : "strict",
                        })
                      }
                    />
                  </SettingSectionCard>
                  <SettingSectionCard
                    title="Guardian ethics"
                    description="Guardian is strict on safety and explicit about tradeoffs. These rules are built into the engine and APIs."
                  >
                    <div className="py-3">
                      <ul className="list-inside list-disc space-y-1.5 text-[11px] leading-relaxed text-[color:var(--text-soft)]">
                        {GUARDIAN_ETHICAL_GUARDRAILS.map((line) => (
                          <li key={line}>{line}</li>
                        ))}
                      </ul>
                      <p className="mt-3 text-[10px] leading-relaxed text-[color:var(--text-soft)]">
                        Warning-level sends need your confirmation in the app, then{" "}
                        <code className="rounded bg-white/[0.06] px-1 py-0.5 text-[9px] text-[var(--text-main)]">
                          guardianWarnAcknowledged
                        </code>{" "}
                        on the server. Notification quick-send cannot bypass a
                        warning.
                      </p>
                    </div>
                  </SettingSectionCard>
                  <SettingSectionCard
                    title="Guardian decision log"
                    description="OpenMail records each automated Guardian decision (what we checked, the outcome, and why). The same events are also printed for developers as one-line JSON in the browser or server console under [GuardianTrace]."
                  >
                    <div className="py-3">
                      <div className="mb-3 flex flex-wrap items-center justify-end gap-2">
                        {guardianTraces.length > 0 ? (
                          <button
                            type="button"
                            className="rounded-lg border border-white/[0.12] px-3 py-1.5 text-[11px] font-medium text-[color:var(--text-soft)] transition-colors hover:border-white/[0.18] hover:text-[var(--text-main)]"
                            onClick={clearGuardianTrace}
                          >
                            Clear log
                          </button>
                        ) : null}
                      </div>
                      {guardianTraces.length === 0 ? (
                        <p className="text-[12px] leading-relaxed text-[color:var(--text-soft)]">
                          No decisions recorded in this session yet. Open a
                          message, follow a link, attach a file, or send mail to
                          populate this log.
                        </p>
                      ) : (
                        <ul
                          className="max-h-[min(50vh,22rem)] space-y-2.5 overflow-y-auto pr-1"
                          aria-label="Guardian decisions, newest first"
                        >
                          {guardianTraces.map((entry) => {
                            const riskPill =
                              entry.riskLevel === "high"
                                ? "border-red-500/35 bg-red-500/10 text-red-200/90"
                                : entry.riskLevel === "medium"
                                  ? "border-amber-500/35 bg-amber-500/10 text-amber-100/90"
                                  : "border-emerald-500/30 bg-emerald-500/8 text-emerald-100/85";
                            const when = new Date(entry.at).toLocaleString(
                              undefined,
                              {
                                dateStyle: "short",
                                timeStyle: "medium",
                              }
                            );
                            return (
                              <li
                                key={entry.id}
                                className="rounded-xl border border-white/[0.08] bg-[#0a0a0a]/75 px-3 py-2.5"
                              >
                                <div className="flex flex-wrap items-center gap-2">
                                  <span
                                    className={`inline-flex rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${riskPill}`}
                                  >
                                    {guardianRiskLabel(entry.riskLevel)}
                                  </span>
                                  <span className="inline-flex rounded-md border border-white/[0.1] bg-white/[0.04] px-2 py-0.5 text-[10px] font-semibold text-[var(--text-main)]">
                                    {guardianDecisionLabel(entry.decision)}
                                  </span>
                                  {entry.requiresExplicitUserConsent ? (
                                    <span className="inline-flex rounded-md border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-[10px] font-semibold text-sky-100/90">
                                      Consent required
                                    </span>
                                  ) : null}
                                  {entry.criticalBlock ? (
                                    <span className="inline-flex rounded-md border border-red-500/40 bg-red-950/40 px-2 py-0.5 text-[10px] font-semibold text-red-100/85">
                                      No bypass
                                    </span>
                                  ) : null}
                                  <span className="text-[10px] text-[color:var(--text-soft)]">
                                    {when}
                                  </span>
                                </div>
                                <p className="mt-1.5 text-[12px] font-medium text-[var(--text-main)]">
                                  {entry.summary}
                                </p>
                                <p className="mt-1 text-[11px] leading-relaxed text-[color:var(--text-soft)]">
                                  {entry.reason}
                                </p>
                                <p className="mt-1.5 text-[10px] text-[color:var(--text-soft)]">
                                  {guardianTraceSourceLabel(entry.source)}
                                  {entry.rule ? ` · rule: ${entry.rule}` : ""}
                                </p>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  </SettingSectionCard>
                </>
              ) : null}

              {prefs.activeSection === "display" ? (
                <>
                  <SettingSectionCard
                    title="Appearance"
                    description="Theme and list density apply across OpenMail."
                  >
                    <SettingField
                      label="Theme"
                      description="Light or soft dark. Your mail and layout stay the same."
                    >
                      <div
                        className="inline-flex rounded-xl border border-white/[0.08] bg-[#0c0c0c] p-1"
                        role="group"
                        aria-label="Theme"
                      >
                        <button
                          type="button"
                          data-active={theme === "soft-intelligence-light" ? "true" : "false"}
                          title="Light"
                          aria-label="Light theme"
                          className={`openmail-theme-choice flex h-10 w-10 items-center justify-center rounded-lg transition-all duration-200 ${
                            theme === "soft-intelligence-light"
                              ? "border border-[var(--accent)]/45 bg-[var(--accent-soft)] text-[var(--text-main)] shadow-[0_0_12px_var(--accent-soft)]"
                              : "border border-transparent text-[color:var(--text-soft)] hover:bg-white/[0.06] hover:text-[var(--text-main)]"
                          }`}
                          onClick={() => setTheme("soft-intelligence-light")}
                        >
                          <IconSun className="h-[18px] w-[18px]" />
                        </button>
                        <button
                          type="button"
                          data-active={theme === "soft-dark" ? "true" : "false"}
                          title="Soft dark"
                          aria-label="Soft dark theme"
                          className={`openmail-theme-choice flex h-10 w-10 items-center justify-center rounded-lg transition-all duration-200 ${
                            theme === "soft-dark"
                              ? "border border-[var(--accent)]/45 bg-[var(--accent-soft)] text-[var(--text-main)] shadow-[0_0_12px_var(--accent-soft)]"
                              : "border border-transparent text-[color:var(--text-soft)] hover:bg-white/[0.06] hover:text-[var(--text-main)]"
                          }`}
                          onClick={() => setTheme("soft-dark")}
                        >
                          <IconMoon className="h-[18px] w-[18px]" />
                        </button>
                      </div>
                    </SettingField>
                    <SettingField
                      label="Message list density"
                      description="Compact shows more rows; comfortable adds padding so scan-and-tap is easier."
                    >
                      <div className="flex gap-2">
                        <button
                          type="button"
                          className={`flex-1 rounded-lg px-3 py-2 text-[11px] font-medium transition-colors duration-200 ${
                            isLight
                              ? prefs.display.density === "compact"
                                ? "bg-white text-gray-900 border border-gray-200"
                                : "bg-gray-100 text-gray-600 border border-gray-200"
                              : prefs.display.density === "compact"
                                ? "bg-[#0c0c0c] text-white"
                                : "bg-[#0c0c0c]/60 text-white/60"
                          }`}
                          onClick={() =>
                            prefs.updateDisplay({ density: "compact" })
                          }
                        >
                          Compact
                        </button>
                        <button
                          type="button"
                          className={`flex-1 rounded-lg px-3 py-2 text-[11px] font-medium transition-colors duration-200 ${
                            isLight
                              ? prefs.display.density === "comfortable"
                                ? "bg-white text-gray-900 border border-gray-200"
                                : "bg-gray-100 text-gray-600 border border-gray-200"
                              : prefs.display.density === "comfortable"
                                ? "bg-[#0c0c0c] text-white"
                                : "bg-[#0c0c0c]/60 text-white/60"
                          }`}
                          onClick={() =>
                            prefs.updateDisplay({ density: "comfortable" })
                          }
                        >
                          Comfortable
                        </button>
                      </div>
                    </SettingField>
                  </SettingSectionCard>
                  <SettingSectionCard
                    title="Notifications"
                    description="Stay on top of new mail when OpenMail is in the background (synced inbox only)."
                  >
                    <ToggleRow
                      label="Smart desktop notifications"
                      description="Shows a short AI summary and suggested action. Actions: Quick send (top suggestion), Open in OpenMail, or Ignore. Requires browser permission. Not used in demo mode."
                      on={prefs.display.smartNotifications}
                      onToggle={() => {
                        void (async () => {
                          if (OPENMAIL_DEMO_MODE) {
                            toast.error("Smart notifications are not available in demo mode.");
                            return;
                          }
                          if (prefs.display.smartNotifications) {
                            prefs.updateDisplay({ smartNotifications: false });
                            return;
                          }
                          const p = await enableSmartNotifications();
                          if (p === "granted") {
                            prefs.updateDisplay({ smartNotifications: true });
                          } else if (p === "denied") {
                            toast.error(
                              "Notifications are blocked. Allow them for this site in the browser, then try again."
                            );
                          } else {
                            toast.error("Notifications are not available in this browser or context.");
                          }
                        })();
                      }}
                    />
                  </SettingSectionCard>
                  <SettingSectionCard
                    title="Motion"
                    description="Turn off if you prefer a calmer UI or want to reduce motion."
                  >
                    <ToggleRow
                      label="Interface animations"
                      description="Subtle transitions in panels, lists, and the reading overlay. Does not affect mail content."
                      on={prefs.display.animations}
                      onToggle={() =>
                        prefs.updateDisplay({
                          animations: !prefs.display.animations,
                        })
                      }
                    />
                  </SettingSectionCard>
                </>
              ) : null}

              {prefs.activeSection === "ai" ? (
                <SettingSectionCard
                  title="AI & CORE"
                  description="Controls how suggestions, risk cards, and reply defaults behave."
                >
                  <ToggleRow
                    label="Auto suggestions"
                    description="Shows ready-made reply lines in CORE when you select a message."
                    on={prefs.ai.autoSuggestions}
                    onToggle={() =>
                      prefs.updateAi({
                        autoSuggestions: !prefs.ai.autoSuggestions,
                      })
                    }
                  />
                  <ToggleRow
                    label="Auto-analyze emails"
                    description="Runs the risk summary and CORE signals when a message is open—turn off for a lighter panel."
                    on={prefs.ai.autoAnalyze}
                    onToggle={() =>
                      prefs.updateAi({ autoAnalyze: !prefs.ai.autoAnalyze })
                    }
                  />
                  <ToggleRow
                    label="Decision strictness"
                    description="Controls how assertive AI decisions are. Higher values prioritize safety and stronger recommendations."
                    on={prefs.ai.aggressionHigh}
                    onToggle={() =>
                      prefs.updateAi({
                        aggressionHigh: !prefs.ai.aggressionHigh,
                      })
                    }
                  />
                  <ToggleRow
                    label="Learn from my usage"
                    description="Remembers which suggestions and tones you pick, ignores, and escalations—reorders drafts and adapts default tone over time. Stored per profile on this device and synced when the server is available."
                    on={prefs.ai.learnFromUsage}
                    onToggle={() =>
                      prefs.updateAi({
                        learnFromUsage: !prefs.ai.learnFromUsage,
                      })
                    }
                  />
                  <ToggleRow
                    label="Auto-resolve inbox"
                    description="When CORE confidence is above 85%, the inbox can archive ignorable mail, pre-fill a reply draft without sending, or mark low-importance items done. You can undo each action from the list."
                    on={prefs.ai.autoResolveInbox}
                    onToggle={() =>
                      prefs.updateAi({
                        autoResolveInbox: !prefs.ai.autoResolveInbox,
                      })
                    }
                  />
                  <ToggleRow
                    label="Guardian auto-response"
                    description="Guardian decides whether a reply may be sent without tapping Send. Safe + reply intent + high confidence can auto-send when this is on. Medium risk always needs your confirmation; high risk blocks sending from CORE."
                    on={prefs.ai.guardianAutoResponse}
                    onToggle={() =>
                      prefs.updateAi({
                        guardianAutoResponse: !prefs.ai.guardianAutoResponse,
                      })
                    }
                  />
                  <SettingField
                    label="Default reply tone"
                    description="Starting tone for new drafts. You can still change tone per message in CORE."
                  >
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
                          className={`rounded-lg px-3 py-2 text-[11px] font-medium transition-colors duration-200 ${
                            isLight
                              ? prefs.ai.defaultTone === tone
                                ? "bg-white text-gray-900 border border-gray-200"
                                : "bg-gray-100 text-gray-600 border border-gray-200"
                              : prefs.ai.defaultTone === tone
                                ? "bg-[#0c0c0c] text-white"
                                : "bg-[#0c0c0c]/60 text-white/60"
                          }`}
                          onClick={() => prefs.updateAi({ defaultTone: tone })}
                        >
                          {tone}
                        </button>
                      ))}
                    </div>
                  </SettingField>
                </SettingSectionCard>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
