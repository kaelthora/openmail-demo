export type OpenmailUiTheme = "soft-dark" | "soft-intelligence-light";

export const OPENMAIL_THEME_STORAGE_KEY = "openmail-ui-theme-v1";

/** Default: Light (premium). Legacy values map to Soft dark. */
export const OPENMAIL_THEME_DEFAULT: OpenmailUiTheme = "soft-intelligence-light";

const THEMES: readonly OpenmailUiTheme[] = ["soft-dark", "soft-intelligence-light"];

const LEGACY_MAP: Record<string, OpenmailUiTheme> = {
  blacken: "soft-dark",
  "soft-intelligence": "soft-dark",
};

export function parseOpenmailTheme(raw: string | null): OpenmailUiTheme {
  if (raw && (THEMES as readonly string[]).includes(raw)) {
    return raw as OpenmailUiTheme;
  }
  if (raw && LEGACY_MAP[raw]) {
    return LEGACY_MAP[raw];
  }
  return OPENMAIL_THEME_DEFAULT;
}
