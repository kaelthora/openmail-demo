"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  OPENMAIL_SETTINGS_DEFAULT,
  OPENMAIL_SETTINGS_STORAGE_KEY,
  parseOpenmailSettingsState,
  serializeOpenmailSettingsState,
  type MockAccount,
  type OpenmailAiPrefs,
  type OpenmailDisplayPrefs,
  type OpenmailSecurityPrefs,
  type OpenmailSettingsState,
  type SettingsSection,
} from "@/lib/openmailSettingsPrefs";

type OpenmailPreferencesContextValue = {
  hydrated: boolean;
  activeSection: SettingsSection;
  setActiveSection: (s: SettingsSection) => void;
  accounts: MockAccount[];
  setAccounts: (updater: (prev: MockAccount[]) => MockAccount[]) => void;
  display: OpenmailDisplayPrefs;
  updateDisplay: (patch: Partial<OpenmailDisplayPrefs>) => void;
  ai: OpenmailAiPrefs;
  updateAi: (patch: Partial<OpenmailAiPrefs>) => void;
  security: OpenmailSecurityPrefs;
  updateSecurity: (patch: Partial<OpenmailSecurityPrefs>) => void;
};

const OpenmailPreferencesContext =
  createContext<OpenmailPreferencesContextValue | null>(null);

function applyDisplayToDocument(display: OpenmailDisplayPrefs): void {
  const root = document.documentElement;
  root.setAttribute("data-openmail-density", display.density);
  root.setAttribute(
    "data-openmail-animations",
    display.animations ? "on" : "off"
  );
}

export function OpenmailPreferencesProvider({ children }: { children: ReactNode }) {
  const [hydrated, setHydrated] = useState(false);
  const [state, setState] = useState<OpenmailSettingsState>(() =>
    parseOpenmailSettingsState(
      typeof window !== "undefined"
        ? localStorage.getItem(OPENMAIL_SETTINGS_STORAGE_KEY)
        : null
    )
  );

  useLayoutEffect(() => {
    applyDisplayToDocument(state.display);
  }, [state.display]);

  useEffect(() => {
    setHydrated(true);
  }, []);

  const persist = useCallback((next: OpenmailSettingsState) => {
    try {
      localStorage.setItem(
        OPENMAIL_SETTINGS_STORAGE_KEY,
        serializeOpenmailSettingsState(next)
      );
    } catch {
      /* private mode */
    }
  }, []);

  const setActiveSection = useCallback(
    (s: SettingsSection) => {
      setState((prev) => {
        const next = { ...prev, activeSection: s };
        persist(next);
        return next;
      });
    },
    [persist]
  );

  const setAccounts = useCallback(
    (updater: (prev: MockAccount[]) => MockAccount[]) => {
      setState((prev) => {
        const next = { ...prev, accounts: updater(prev.accounts) };
        persist(next);
        return next;
      });
    },
    [persist]
  );

  const updateDisplay = useCallback(
    (patch: Partial<OpenmailDisplayPrefs>) => {
      setState((prev) => {
        const next = {
          ...prev,
          display: { ...prev.display, ...patch },
        };
        persist(next);
        return next;
      });
    },
    [persist]
  );

  const updateAi = useCallback(
    (patch: Partial<OpenmailAiPrefs>) => {
      setState((prev) => {
        const next = {
          ...prev,
          ai: { ...prev.ai, ...patch },
        };
        persist(next);
        return next;
      });
    },
    [persist]
  );

  const updateSecurity = useCallback(
    (patch: Partial<OpenmailSecurityPrefs>) => {
      setState((prev) => {
        const next = {
          ...prev,
          security: { ...prev.security, ...patch },
        };
        persist(next);
        return next;
      });
    },
    [persist]
  );

  const value = useMemo<OpenmailPreferencesContextValue>(
    () => ({
      hydrated,
      activeSection: state.activeSection,
      setActiveSection,
      accounts: state.accounts,
      setAccounts,
      display: state.display,
      updateDisplay,
      ai: state.ai,
      updateAi,
      security: state.security,
      updateSecurity,
    }),
    [
      hydrated,
      state.activeSection,
      state.accounts,
      state.display,
      state.ai,
      state.security,
      setActiveSection,
      setAccounts,
      updateDisplay,
      updateAi,
      updateSecurity,
    ]
  );

  return (
    <OpenmailPreferencesContext.Provider value={value}>
      {children}
    </OpenmailPreferencesContext.Provider>
  );
}

export function useOpenmailPreferences(): OpenmailPreferencesContextValue {
  const ctx = useContext(OpenmailPreferencesContext);
  if (!ctx) {
    throw new Error(
      "useOpenmailPreferences must be used within OpenmailPreferencesProvider"
    );
  }
  return ctx;
}
