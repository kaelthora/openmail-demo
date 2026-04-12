"use client";

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { GuardianEvaluateResult } from "@/lib/guardianEngine";
import {
  GuardianInterceptModal,
  type GuardianInterceptKind,
  type GuardianInterceptTier,
} from "./components/guardian/GuardianInterceptModal";

export type GuardianInterceptDecision = GuardianInterceptTier;

export type GuardianInterceptParams = {
  kind: GuardianInterceptKind;
  decision: GuardianInterceptDecision;
  result: GuardianEvaluateResult;
  /** Shown as monospace detail (URL, file name, recipient, …). */
  detail: string;
  /**
   * After the user acknowledges a **block** (e.g. quarantine mail, mark attachment blocked).
   */
  onBlockedAcknowledge?: () => void;
  /** Warn / safe: show Sandbox (default: on for link & attachment warn/safe, off for send). */
  allowSandbox?: boolean;
  /** Warn / safe: show Proceed (default: true when not block). */
  allowProceed?: boolean;
};

export type GuardianInterceptOutcome = "sandbox" | "proceed" | "cancel";

type QueuedItem = GuardianInterceptParams & {
  resolve: (out: GuardianInterceptOutcome) => void;
};

type ActiveModal = QueuedItem;

function resolveShowButtons(
  kind: GuardianInterceptKind,
  decision: GuardianInterceptDecision,
  allowSandbox?: boolean,
  allowProceed?: boolean
): { showSandbox: boolean; showProceed: boolean } {
  if (decision === "block") {
    return { showSandbox: false, showProceed: false };
  }
  if (decision === "safe") {
    return {
      showSandbox: allowSandbox ?? true,
      showProceed: allowProceed ?? true,
    };
  }
  return {
    showSandbox: allowSandbox ?? kind !== "send_email",
    showProceed: allowProceed ?? true,
  };
}

const GuardianInterceptContext = createContext<{
  present: (
    params: GuardianInterceptParams
  ) => Promise<GuardianInterceptOutcome>;
} | null>(null);

export function GuardianInterceptProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState<ActiveModal | null>(null);
  const activeRef = useRef(false);
  const queueRef = useRef<QueuedItem[]>([]);

  const present = useCallback((params: GuardianInterceptParams) => {
    return new Promise<GuardianInterceptOutcome>((resolve) => {
      const item: QueuedItem = { ...params, resolve };
      if (!activeRef.current) {
        activeRef.current = true;
        setActive(item);
      } else {
        queueRef.current.push(item);
      }
    });
  }, []);

  const closeAndPump = useCallback(
    (item: ActiveModal, out: GuardianInterceptOutcome) => {
      if (item.decision === "block" && out === "cancel") {
        item.onBlockedAcknowledge?.();
      }
      item.resolve(out);
      setActive(null);
      activeRef.current = false;
      const next = queueRef.current.shift();
      if (next) {
        activeRef.current = true;
        setActive(next);
      }
    },
    []
  );

  const onDismissBlock = useCallback(() => {
    if (!active) return;
    closeAndPump(active, "cancel");
  }, [active, closeAndPump]);

  const onSandbox = useCallback(() => {
    if (!active) return;
    closeAndPump(active, "sandbox");
  }, [active, closeAndPump]);

  const onProceed = useCallback(() => {
    if (!active) return;
    closeAndPump(active, "proceed");
  }, [active, closeAndPump]);

  const onCancel = useCallback(() => {
    if (!active) return;
    closeAndPump(active, "cancel");
  }, [active, closeAndPump]);

  const onOverrideProceed = useCallback(
    (reason: string) => {
      if (!active) return;
      const trimmed = reason.trim();
      if (trimmed.length > 0) {
        console.info(
          `[openmail][Guardian] Request override (${active.kind}):`,
          trimmed.slice(0, 500)
        );
      }
      closeAndPump(active, "proceed");
    },
    [active, closeAndPump]
  );

  const modalProps = active
    ? (() => {
        const { showSandbox, showProceed } = resolveShowButtons(
          active.kind,
          active.decision,
          active.allowSandbox,
          active.allowProceed
        );
        return {
          showSandbox,
          showProceed,
        };
      })()
    : null;

  return (
    <GuardianInterceptContext.Provider value={{ present }}>
      {children}
      {active && modalProps ? (
        <GuardianInterceptModal
          open
          kind={active.kind}
          tier={active.decision}
          result={active.result}
          detail={active.detail}
          showSandbox={modalProps.showSandbox}
          showProceed={modalProps.showProceed}
          onDismissBlock={onDismissBlock}
          onSandbox={onSandbox}
          onProceed={onProceed}
          onCancel={onCancel}
          onOverrideProceed={onOverrideProceed}
        />
      ) : null}
    </GuardianInterceptContext.Provider>
  );
}

export function useGuardianIntercept() {
  const ctx = useContext(GuardianInterceptContext);
  if (!ctx) {
    throw new Error(
      "useGuardianIntercept must be used within GuardianInterceptProvider"
    );
  }
  return ctx;
}
