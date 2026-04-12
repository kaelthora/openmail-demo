"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { GuardianEvaluateResult } from "@/lib/guardianEngine";
import {
  createGuardianTraceEntry,
  logGuardianTraceDev,
  type GuardianTraceEntry,
  type GuardianTraceSource,
} from "@/lib/guardianTrace";

const MAX_TRACES = 80;

type GuardianTraceContextValue = {
  traces: GuardianTraceEntry[];
  /** Record a decision for the user-visible log and emit a developer console line. */
  record: (result: GuardianEvaluateResult, source: GuardianTraceSource) => void;
  clear: () => void;
};

const GuardianTraceContext = createContext<GuardianTraceContextValue | null>(
  null
);

export function GuardianTraceProvider({ children }: { children: ReactNode }) {
  const [traces, setTraces] = useState<GuardianTraceEntry[]>([]);

  const record = useCallback(
    (result: GuardianEvaluateResult, source: GuardianTraceSource) => {
      const entry = createGuardianTraceEntry(result, source);
      logGuardianTraceDev(entry);
      setTraces((prev) => {
        const next = [entry, ...prev];
        return next.length > MAX_TRACES ? next.slice(0, MAX_TRACES) : next;
      });
    },
    []
  );

  const clear = useCallback(() => setTraces([]), []);

  const value = useMemo(
    () => ({ traces, record, clear }),
    [traces, record, clear]
  );

  return (
    <GuardianTraceContext.Provider value={value}>
      {children}
    </GuardianTraceContext.Provider>
  );
}

export function useGuardianTrace(): GuardianTraceContextValue {
  const ctx = useContext(GuardianTraceContext);
  if (!ctx) {
    throw new Error("useGuardianTrace must be used within GuardianTraceProvider");
  }
  return ctx;
}
