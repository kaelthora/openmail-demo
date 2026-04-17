"use client";

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type AppMode = "demo" | "real";
const OPENMAIL_MODE_KEY = "openmail_mode";

type AppModeContextValue = {
  appMode: AppMode | null;
  setAppMode: (mode: AppMode | null) => void;
};

const AppModeContext = createContext<AppModeContextValue | null>(null);

export function AppModeProvider({ children }: { children: ReactNode }) {
  const [appMode, setAppModeState] = useState<AppMode | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const qMode = new URLSearchParams(window.location.search).get("mode");
      if (qMode === "demo" || qMode === "real") return qMode;
      const saved = localStorage.getItem(OPENMAIL_MODE_KEY);
      return saved === "demo" || saved === "real" ? saved : null;
    } catch {
      return null;
    }
  });

  const setAppMode = (mode: AppMode | null) => {
    setAppModeState(mode);
    if (typeof window === "undefined") return;
    try {
      if (mode) localStorage.setItem(OPENMAIL_MODE_KEY, mode);
      else localStorage.removeItem(OPENMAIL_MODE_KEY);
    } catch {
      /* private mode */
    }
  };

  const value = useMemo<AppModeContextValue>(
    () => ({
      appMode,
      setAppMode,
    }),
    [appMode]
  );

  return <AppModeContext.Provider value={value}>{children}</AppModeContext.Provider>;
}

export function useAppMode(): AppModeContextValue {
  const ctx = useContext(AppModeContext);
  if (!ctx) {
    throw new Error("useAppMode must be used within AppModeProvider");
  }
  return ctx;
}

