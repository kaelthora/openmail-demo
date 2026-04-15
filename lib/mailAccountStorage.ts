import type { OpenMailAccountProfile } from "@/lib/mailAccountConfig";

const STORAGE_KEY = "openmail-account-v1";
const STORAGE_MULTI_KEY = "openmail-accounts-v1";
/** In-memory session restore (tab-scoped) — survives MailStore remounts without persisting secrets to localStorage. */
const ACCOUNT_SESSION_KEY = "openmail-account-session-v1";

/** All localStorage keys used for account / IMAP credentials (extend if OAuth is added). */
const ACCOUNT_AUTH_STORAGE_KEYS = [
  STORAGE_KEY,
  STORAGE_MULTI_KEY,
] as const;

export { isAccountConfigured } from "@/lib/mailAccountConfig";

type MultiAccountState = {
  accounts: OpenMailAccountProfile[];
  activeAccountId: string | null;
};

function toMultiState(profile: OpenMailAccountProfile | null): MultiAccountState {
  if (!profile) return { accounts: [], activeAccountId: null };
  return { accounts: [profile], activeAccountId: profile.id };
}

export function loadAccountSession(): OpenMailAccountProfile | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(ACCOUNT_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as OpenMailAccountProfile;
    if (!parsed || typeof parsed !== "object" || typeof parsed.email !== "string") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/** Persist active account for the tab session (rehydrate after subtree remounts, e.g. Settings overlay). */
export function saveAccountSession(profile: OpenMailAccountProfile | null): void {
  if (typeof window === "undefined") return;
  try {
    if (!profile) {
      sessionStorage.removeItem(ACCOUNT_SESSION_KEY);
      return;
    }
    sessionStorage.setItem(ACCOUNT_SESSION_KEY, JSON.stringify(profile));
  } catch {
    /* private mode / quota */
  }
}

export function loadStoredAccount(): OpenMailAccountProfile | null {
  if (typeof window === "undefined") return null;
  try {
    const multiRaw = localStorage.getItem(STORAGE_MULTI_KEY);
    if (multiRaw) {
      const parsed = JSON.parse(multiRaw) as MultiAccountState;
      if (parsed && Array.isArray(parsed.accounts)) {
        const active =
          parsed.accounts.find((a) => a.id === parsed.activeAccountId) ?? parsed.accounts[0] ?? null;
        if (active) return active;
      }
    }
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as OpenMailAccountProfile;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveStoredAccount(profile: OpenMailAccountProfile): void {
  if (typeof window === "undefined") return;
  void profile;
  /* Credentials stay in memory only (MailStoreProvider). Do not persist IMAP/SMTP secrets. */
}

export function clearStoredAccount(): void {
  if (typeof window === "undefined") return;
  for (const key of ACCOUNT_AUTH_STORAGE_KEYS) {
    localStorage.removeItem(key);
  }
}
