"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  bumpHoverTotal,
  emaScrollVelocity,
  predictNextOpenMailId,
  type AttentionSnapshot,
} from "@/lib/attentionEngine";

const MAX_RECENT_OPENS = 12;

export type AttentionEngineContextValue = {
  predictedNextMailId: string | null;
  setOrderedMailIds: (ids: readonly string[]) => void;
  syncSelectedMailId: (id: string) => void;
  onRowPointerEnter: (mailId: string) => void;
  onRowPointerLeave: (mailId: string) => void;
  onListScroll: (scrollTop: number) => void;
  recordMailOpen: (mailId: string) => void;
  resetSession: () => void;
};

const AttentionEngineContext = createContext<AttentionEngineContextValue | null>(
  null
);

function buildSnapshot(
  orderedIds: readonly string[],
  selectedId: string,
  hoverMailId: string | null,
  hoverStartedAt: number | null,
  hoverTotals: Map<string, number>,
  scrollVelocity: number,
  recentOpens: string[]
): AttentionSnapshot {
  const now = Date.now();
  const hoverSessionDwellMs =
    hoverMailId && hoverStartedAt != null
      ? Math.max(0, now - hoverStartedAt)
      : 0;

  return {
    orderedIds,
    selectedId: selectedId || null,
    hoverMailId,
    hoverSessionDwellMs,
    hoverTotalsMs: hoverTotals,
    scrollVelocity,
    recentOpens: [...recentOpens],
  };
}

export function AttentionEngineProvider({ children }: { children: ReactNode }) {
  const [orderedIds, setOrderedIdsState] = useState<readonly string[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [predictedNextMailId, setPredictedNextMailId] = useState<string | null>(
    null
  );

  const hoverMailIdRef = useRef<string | null>(null);
  const hoverStartedAtRef = useRef<number | null>(null);
  const hoverTotalsRef = useRef(new Map<string, number>());
  const scrollTopRef = useRef(0);
  const scrollTimeRef = useRef(0);
  const scrollVelocityRef = useRef(0);
  const recentOpensRef = useRef<string[]>([]);
  const rafFlushRef = useRef<number | null>(null);
  const hoverTickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const flushPrediction = useCallback(() => {
    const snap = buildSnapshot(
      orderedIds,
      selectedId,
      hoverMailIdRef.current,
      hoverStartedAtRef.current,
      hoverTotalsRef.current,
      scrollVelocityRef.current,
      recentOpensRef.current
    );
    const next = predictNextOpenMailId(snap);
    setPredictedNextMailId((prev) => (prev === next ? prev : next));
  }, [orderedIds, selectedId]);

  const scheduleFlush = useCallback(() => {
    if (typeof window === "undefined") return;
    if (rafFlushRef.current != null) {
      cancelAnimationFrame(rafFlushRef.current);
    }
    rafFlushRef.current = requestAnimationFrame(() => {
      rafFlushRef.current = null;
      flushPrediction();
    });
  }, [flushPrediction]);

  useEffect(
    () => () => {
      if (rafFlushRef.current != null) {
        cancelAnimationFrame(rafFlushRef.current);
      }
      if (hoverTickRef.current != null) {
        clearInterval(hoverTickRef.current);
      }
    },
    []
  );

  const setOrderedMailIds = useCallback((ids: readonly string[]) => {
    setOrderedIdsState((prev) => {
      if (
        prev.length === ids.length &&
        prev.every((id, i) => id === ids[i])
      ) {
        return prev;
      }
      return [...ids];
    });
  }, []);

  const syncSelectedMailId = useCallback((id: string) => {
    setSelectedId(id);
  }, []);

  const onRowPointerEnter = useCallback(
    (mailId: string) => {
      if (hoverTickRef.current != null) {
        clearInterval(hoverTickRef.current);
        hoverTickRef.current = null;
      }
      hoverMailIdRef.current = mailId;
      hoverStartedAtRef.current = Date.now();
      scheduleFlush();
      hoverTickRef.current = setInterval(() => {
        scheduleFlush();
      }, 110);
    },
    [scheduleFlush]
  );

  const onRowPointerLeave = useCallback(
    (mailId: string) => {
      if (hoverTickRef.current != null) {
        clearInterval(hoverTickRef.current);
        hoverTickRef.current = null;
      }
      const start = hoverStartedAtRef.current;
      const cur = hoverMailIdRef.current;
      if (cur === mailId && start != null) {
        bumpHoverTotal(hoverTotalsRef.current, mailId, Date.now() - start);
      }
      if (cur === mailId) {
        hoverMailIdRef.current = null;
        hoverStartedAtRef.current = null;
      }
      scheduleFlush();
    },
    [scheduleFlush]
  );

  const onListScroll = useCallback(
    (scrollTop: number) => {
      const now = Date.now();
      const prevTop = scrollTopRef.current;
      const prevT = scrollTimeRef.current;
      scrollTopRef.current = scrollTop;
      scrollTimeRef.current = now;
      if (prevT > 0) {
        const dt = Math.max(1, now - prevT);
        const dy = scrollTop - prevTop;
        const instant = dy / dt;
        scrollVelocityRef.current = emaScrollVelocity(
          scrollVelocityRef.current,
          instant
        );
      }
      scheduleFlush();
    },
    [scheduleFlush]
  );

  const recordMailOpen = useCallback(
    (mailId: string) => {
      const ring = recentOpensRef.current;
      ring.push(mailId);
      if (ring.length > MAX_RECENT_OPENS) {
        ring.splice(0, ring.length - MAX_RECENT_OPENS);
      }
      scheduleFlush();
    },
    [scheduleFlush]
  );

  /** Clear hover / scroll / open-pattern signals (e.g. folder change). List order stays until MailPanel updates. */
  const resetSession = useCallback(() => {
    if (hoverTickRef.current != null) {
      clearInterval(hoverTickRef.current);
      hoverTickRef.current = null;
    }
    hoverMailIdRef.current = null;
    hoverStartedAtRef.current = null;
    hoverTotalsRef.current = new Map();
    scrollTopRef.current = 0;
    scrollTimeRef.current = 0;
    scrollVelocityRef.current = 0;
    recentOpensRef.current = [];
    scheduleFlush();
  }, [scheduleFlush]);

  useEffect(() => {
    flushPrediction();
  }, [flushPrediction]);

  const value = useMemo(
    () => ({
      predictedNextMailId,
      setOrderedMailIds,
      syncSelectedMailId,
      onRowPointerEnter,
      onRowPointerLeave,
      onListScroll,
      recordMailOpen,
      resetSession,
    }),
    [
      predictedNextMailId,
      setOrderedMailIds,
      syncSelectedMailId,
      onRowPointerEnter,
      onRowPointerLeave,
      onListScroll,
      recordMailOpen,
      resetSession,
    ]
  );

  return (
    <AttentionEngineContext.Provider value={value}>
      {children}
    </AttentionEngineContext.Provider>
  );
}

export function useAttentionEngine(): AttentionEngineContextValue {
  const ctx = useContext(AttentionEngineContext);
  if (!ctx) {
    throw new Error("useAttentionEngine must be used within AttentionEngineProvider");
  }
  return ctx;
}
