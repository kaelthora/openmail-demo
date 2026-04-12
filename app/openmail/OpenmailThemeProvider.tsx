"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  OPENMAIL_THEME_DEFAULT,
  OPENMAIL_THEME_STORAGE_KEY,
  type OpenmailUiTheme,
  parseOpenmailTheme,
} from "@/lib/openmailTheme";

type OpenmailThemeContextValue = {
  theme: OpenmailUiTheme;
  setTheme: (t: OpenmailUiTheme) => void;
};

const OpenmailThemeContext = createContext<OpenmailThemeContextValue | null>(
  null
);

function applyThemeToDocument(theme: OpenmailUiTheme): void {
  document.documentElement.setAttribute("data-openmail-theme", theme);
}

function readStoredTheme(): OpenmailUiTheme {
  if (typeof window === "undefined") return OPENMAIL_THEME_DEFAULT;
  try {
    return parseOpenmailTheme(localStorage.getItem(OPENMAIL_THEME_STORAGE_KEY));
  } catch {
    return OPENMAIL_THEME_DEFAULT;
  }
}

export function OpenmailThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<OpenmailUiTheme>(
    OPENMAIL_THEME_DEFAULT
  );
  const [prefsReady, setPrefsReady] = useState(false);

  useEffect(() => {
    const stored = readStoredTheme();
    setThemeState(stored);
    applyThemeToDocument(stored);
    setPrefsReady(true);
  }, []);

  useEffect(() => {
    if (!prefsReady) return;
    applyThemeToDocument(theme);
    try {
      localStorage.setItem(OPENMAIL_THEME_STORAGE_KEY, theme);
    } catch {
      /* private mode */
    }
  }, [theme, prefsReady]);

  const setTheme = useCallback((t: OpenmailUiTheme) => {
    setThemeState(t);
  }, []);

  const value = useMemo(() => ({ theme, setTheme }), [theme, setTheme]);

  return (
    <OpenmailThemeContext.Provider value={value}>
      {children}
    </OpenmailThemeContext.Provider>
  );
}

export function useOpenmailTheme(): OpenmailThemeContextValue {
  const ctx = useContext(OpenmailThemeContext);
  if (!ctx) {
    throw new Error("useOpenmailTheme must be used within OpenmailThemeProvider");
  }
  return ctx;
}
