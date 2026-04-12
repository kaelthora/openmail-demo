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
  /** Desktop notifications for new mail (summary, intent, quick actions). */
  smartNotifications: boolean;
};

export type OpenmailAiPrefs = {
  autoSuggestions: boolean;
  autoAnalyze: boolean;
  /** Stronger CORE judgments and slightly higher confidence display. */
  aggressionHigh: boolean;
  /** Rank suggestions and pick reply tone from past usage (per profile). */
  learnFromUsage: boolean;
  /** High-confidence inbox triage: archive / draft / mark done before you open mail. */
  autoResolveInbox: boolean;
  /**
   * When safe + reply intent + high confidence, Guardian may send the top GPT reply
   * without pressing Send. Medium risk always requires confirmation; high risk blocks send.
   */
  guardianAutoResponse: boolean;
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
  accounts: [],
  display: {
    density: "comfortable",
    animations: true,
    smartNotifications: false,
  },
  ai: {
    autoSuggestions: true,
    autoAnalyze: true,
    aggressionHigh: false,
    learnFromUsage: true,
    autoResolveInbox: true,
    guardianAutoResponse: false,
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
    const smartNotifications =
      typeof displayIn.smartNotifications === "boolean"
        ? displayIn.smartNotifications
        : OPENMAIL_SETTINGS_DEFAULT.display.smartNotifications;

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
      aggressionHigh:
        typeof aiIn.aggressionHigh === "boolean"
          ? aiIn.aggressionHigh
          : OPENMAIL_SETTINGS_DEFAULT.ai.aggressionHigh,
      learnFromUsage:
        typeof aiIn.learnFromUsage === "boolean"
          ? aiIn.learnFromUsage
          : OPENMAIL_SETTINGS_DEFAULT.ai.learnFromUsage,
      autoResolveInbox:
        typeof aiIn.autoResolveInbox === "boolean"
          ? aiIn.autoResolveInbox
          : OPENMAIL_SETTINGS_DEFAULT.ai.autoResolveInbox,
      guardianAutoResponse:
        typeof aiIn.guardianAutoResponse === "boolean"
          ? aiIn.guardianAutoResponse
          : OPENMAIL_SETTINGS_DEFAULT.ai.guardianAutoResponse,
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
      display: { density, animations, smartNotifications },
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
