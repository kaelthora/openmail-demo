export type OpenmailUiTheme = "blacken" | "soft-dark";

export const OPENMAIL_THEME_STORAGE_KEY = "openmail-ui-theme";

export const OPENMAIL_THEME_DEFAULT: OpenmailUiTheme = "blacken";

export function parseOpenmailTheme(raw: string | null): OpenmailUiTheme {
  if (raw === "soft-dark") return "soft-dark";
  return "blacken";
}
