export const OPENMAIL_SETTINGS_STORAGE_KEY = "openmail-settings-v1";

/** Matches `ReplyTone` in app/openmail/components/types */
export type PrefsReplyTone =
  | "Professional"
  | "Friendly"
  | "Direct"
  | "Short";

export type SettingsSection = "accounts" | "display" | "ai" | "security";

export type MockAccountStatus = "connected" | "syncing" | "error";

export type MockAccount = {
  id: string;
  email: string;
  imapHost: string;
  smtpHost: string;
  status: MockAccountStatus;
};

export type OpenmailDisplayPrefs = {
  density: "compact" | "comfortable";
  animations: boolean;
};

export type OpenmailAiPrefs = {
  autoSuggestions: boolean;
  autoAnalyze: boolean;
  defaultTone: PrefsReplyTone;
};

export type OpenmailSecurityPrefs = {
  blockRiskyAttachments: boolean;
  forceSandboxLinks: boolean;
  sensitivity: "strict" | "normal";
};

export type OpenmailSettingsState = {
  activeSection: SettingsSection;
  accounts: MockAccount[];
  display: OpenmailDisplayPrefs;
  ai: OpenmailAiPrefs;
  security: OpenmailSecurityPrefs;
};

export const OPENMAIL_SETTINGS_DEFAULT: OpenmailSettingsState = {
  activeSection: "display",
  accounts: [
    {
      id: "mock-1",
      email: "you@example.com",
      imapHost: "imap.example.com",
      smtpHost: "smtp.example.com",
      status: "connected",
    },
  ],
  display: {
    density: "comfortable",
    animations: true,
  },
  ai: {
    autoSuggestions: true,
    autoAnalyze: true,
    defaultTone: "Professional",
  },
  security: {
    blockRiskyAttachments: false,
    forceSandboxLinks: false,
    sensitivity: "normal",
  },
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function parseSection(v: unknown): SettingsSection {
  if (v === "accounts" || v === "display" || v === "ai" || v === "security")
    return v;
  return OPENMAIL_SETTINGS_DEFAULT.activeSection;
}

function parseTone(v: unknown): PrefsReplyTone {
  if (
    v === "Professional" ||
    v === "Friendly" ||
    v === "Direct" ||
    v === "Short"
  )
    return v;
  return OPENMAIL_SETTINGS_DEFAULT.ai.defaultTone;
}

function parseAccount(raw: unknown): MockAccount | null {
  if (!isRecord(raw)) return null;
  const id = typeof raw.id === "string" ? raw.id : "";
  const email = typeof raw.email === "string" ? raw.email : "";
  const imapHost = typeof raw.imapHost === "string" ? raw.imapHost : "";
  const smtpHost = typeof raw.smtpHost === "string" ? raw.smtpHost : "";
  const st = raw.status;
  const status: MockAccountStatus =
    st === "connected" || st === "syncing" || st === "error" ? st : "connected";
  if (!id || !email) return null;
  return { id, email, imapHost, smtpHost, status };
}

export function parseOpenmailSettingsState(raw: string | null): OpenmailSettingsState {
  if (!raw?.trim()) return { ...OPENMAIL_SETTINGS_DEFAULT, accounts: [...OPENMAIL_SETTINGS_DEFAULT.accounts] };
  try {
    const j: unknown = JSON.parse(raw);
    if (!isRecord(j)) return { ...OPENMAIL_SETTINGS_DEFAULT, accounts: [...OPENMAIL_SETTINGS_DEFAULT.accounts] };

    const accountsIn = Array.isArray(j.accounts) ? j.accounts : [];
    const accounts = accountsIn
      .map(parseAccount)
      .filter((a): a is MockAccount => a !== null);
    const mergedAccounts =
      accounts.length > 0 ? accounts : [...OPENMAIL_SETTINGS_DEFAULT.accounts];

    const displayIn = isRecord(j.display) ? j.display : {};
    const density = displayIn.density === "compact" ? "compact" : "comfortable";
    const animations =
      typeof displayIn.animations === "boolean"
        ? displayIn.animations
        : OPENMAIL_SETTINGS_DEFAULT.display.animations;

    const aiIn = isRecord(j.ai) ? j.ai : {};
    const ai: OpenmailAiPrefs = {
      autoSuggestions:
        typeof aiIn.autoSuggestions === "boolean"
          ? aiIn.autoSuggestions
          : OPENMAIL_SETTINGS_DEFAULT.ai.autoSuggestions,
      autoAnalyze:
        typeof aiIn.autoAnalyze === "boolean"
          ? aiIn.autoAnalyze
          : OPENMAIL_SETTINGS_DEFAULT.ai.autoAnalyze,
      defaultTone: parseTone(aiIn.defaultTone),
    };

    const secIn = isRecord(j.security) ? j.security : {};
    const sensitivity =
      secIn.sensitivity === "strict" ? "strict" : "normal";
    const security: OpenmailSecurityPrefs = {
      blockRiskyAttachments:
        typeof secIn.blockRiskyAttachments === "boolean"
          ? secIn.blockRiskyAttachments
          : OPENMAIL_SETTINGS_DEFAULT.security.blockRiskyAttachments,
      forceSandboxLinks:
        typeof secIn.forceSandboxLinks === "boolean"
          ? secIn.forceSandboxLinks
          : OPENMAIL_SETTINGS_DEFAULT.security.forceSandboxLinks,
      sensitivity,
    };

    return {
      activeSection: parseSection(j.activeSection),
      accounts: mergedAccounts,
      display: { density, animations },
      ai,
      security,
    };
  } catch {
    return { ...OPENMAIL_SETTINGS_DEFAULT, accounts: [...OPENMAIL_SETTINGS_DEFAULT.accounts] };
  }
}

export function serializeOpenmailSettingsState(s: OpenmailSettingsState): string {
  return JSON.stringify(s);
}
