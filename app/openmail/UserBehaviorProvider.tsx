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
  BEHAVIOR_LS_KEY,
  BEHAVIOR_PROFILE_LS_KEY,
  createEmptyMemory,
  getDominantActionTendency as computeDominantActionTendency,
  getLearnedTone as computeLearnedTone,
  getRiskTolerance01 as computeRiskTolerance01,
  parseBehaviorMemory,
  rankSuggestionsByMemory,
  recordEscalatedMail,
  recordFolderRouteChoice as memRecordFolderRouteChoice,
  recordIgnoredMail,
  recordManualEdit as memRecordManualEdit,
  recordSuggestionPick,
  recordToneChoice,
  type BehaviorCoreAction,
  type BehaviorTone,
  type UserBehaviorMemoryV1,
} from "@/lib/userBehaviorMemory";
import type { OpenmailSmartFolderId } from "@/lib/mailTypes";
import { apiUrl } from "@/lib/config";

export type UserBehaviorContextValue = {
  hydrated: boolean;
  profileKey: string;
  memory: UserBehaviorMemoryV1;
  memoryVersion: number;
  rankSuggestions: (suggestions: string[], coreAction: BehaviorCoreAction) => string[];
  recordSuggestionSelected: (coreAction: BehaviorCoreAction, text: string) => void;
  recordTone: (tone: BehaviorTone) => void;
  recordManualEdit: () => void;
  recordIgnored: (mailId: string) => void;
  recordEscalation: (mailId: string) => void;
  recordFolderRoute: (
    domain: string | null,
    senderLine: string,
    folder: OpenmailSmartFolderId
  ) => void;
  getLearnedTone: (minToneEvents?: number) => BehaviorTone | null;
  /** O(1) EMA scalar from ignore / escalate / picks / edits — no extra storage reads. */
  getRiskTolerance01: () => number;
  /** O(1) argmax over `actionTendencyCounts` when enough signal. */
  getDominantActionTendency: () => BehaviorCoreAction | null;
};

const UserBehaviorContext = createContext<UserBehaviorContextValue | null>(null);

function loadProfileKey(): string {
  if (typeof window === "undefined") return "";
  try {
    let k = localStorage.getItem(BEHAVIOR_PROFILE_LS_KEY)?.trim();
    if (!k) {
      k =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `p-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
      localStorage.setItem(BEHAVIOR_PROFILE_LS_KEY, k);
    }
    return k;
  } catch {
    return `anon-${Math.random().toString(36).slice(2)}`;
  }
}

function readLocalMemory(): UserBehaviorMemoryV1 {
  if (typeof window === "undefined") return createEmptyMemory();
  try {
    const raw = localStorage.getItem(BEHAVIOR_LS_KEY);
    if (!raw) return createEmptyMemory();
    return parseBehaviorMemory(JSON.parse(raw) as unknown);
  } catch {
    return createEmptyMemory();
  }
}

export function UserBehaviorProvider({ children }: { children: ReactNode }) {
  const [hydrated, setHydrated] = useState(false);
  const [profileKey, setProfileKey] = useState("");
  const [memory, setMemory] = useState<UserBehaviorMemoryV1>(createEmptyMemory);
  const [memoryVersion, setMemoryVersion] = useState(0);
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const profileKeyRef = useRef("");
  const memoryRef = useRef(memory);
  memoryRef.current = memory;
  profileKeyRef.current = profileKey;

  const persistLocal = useCallback((m: UserBehaviorMemoryV1) => {
    try {
      localStorage.setItem(BEHAVIOR_LS_KEY, JSON.stringify(m));
    } catch {
      /* private mode */
    }
  }, []);

  const flushRemote = useCallback((m: UserBehaviorMemoryV1, key: string) => {
    if (!key) return;
    void fetch(apiUrl("/api/user-behavior"), {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profileKey: key, memory: m }),
    }).catch(() => {});
  }, []);

  const schedulePersist = useCallback(
    (m: UserBehaviorMemoryV1) => {
      persistLocal(m);
      const key = profileKeyRef.current;
      if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
      persistTimerRef.current = setTimeout(() => {
        persistTimerRef.current = null;
        flushRemote(m, key);
      }, 1400);
    },
    [persistLocal, flushRemote]
  );

  const applyMemory = useCallback(
    (updater: (x: UserBehaviorMemoryV1) => UserBehaviorMemoryV1) => {
      setMemory((prev) => {
        const next = updater(prev);
        schedulePersist(next);
        return next;
      });
      setMemoryVersion((v) => v + 1);
    },
    [schedulePersist]
  );

  useEffect(() => {
    const pk = loadProfileKey();
    setProfileKey(pk);
    profileKeyRef.current = pk;
    const local = readLocalMemory();
    setMemory(local);
    memoryRef.current = local;
    setHydrated(true);

    void (async () => {
      try {
        const r = await fetch(
          apiUrl(`/api/user-behavior?profileKey=${encodeURIComponent(pk)}`),
          { credentials: "include" }
        );
        if (!r.ok) return;
        const j: { memory?: unknown; updatedAt?: string } = await r.json();
        if (!j.memory) return;
        const remote = parseBehaviorMemory(j.memory);
        const ru = new Date(j.updatedAt ?? 0).getTime();
        setMemory((prev) => {
          const lu = new Date(prev.updatedAt).getTime();
          if (ru > lu) {
            memoryRef.current = remote;
            try {
              localStorage.setItem(BEHAVIOR_LS_KEY, JSON.stringify(remote));
            } catch {
              /* noop */
            }
            return remote;
          }
          return prev;
        });
        setMemoryVersion((x) => x + 1);
      } catch {
        /* offline */
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-time bootstrap
  }, []);

  const rankSuggestions = useCallback(
    (suggestions: string[], coreAction: BehaviorCoreAction) =>
      rankSuggestionsByMemory(suggestions, coreAction, memoryRef.current),
    [memoryVersion]
  );

  const recordSuggestionSelected = useCallback(
    (coreAction: BehaviorCoreAction, text: string) => {
      applyMemory((m) => recordSuggestionPick(m, coreAction, text));
    },
    [applyMemory]
  );

  const recordTone = useCallback(
    (tone: BehaviorTone) => {
      applyMemory((m) => recordToneChoice(m, tone));
    },
    [applyMemory]
  );

  const recordManualEditCb = useCallback(() => {
    applyMemory((m) => memRecordManualEdit(m));
  }, [applyMemory]);

  const recordIgnored = useCallback(
    (mailId: string) => {
      applyMemory((m) => recordIgnoredMail(m, mailId));
    },
    [applyMemory]
  );

  const recordEscalation = useCallback(
    (mailId: string) => {
      applyMemory((m) => recordEscalatedMail(m, mailId));
    },
    [applyMemory]
  );

  const recordFolderRoute = useCallback(
    (domain: string | null, senderLine: string, folder: OpenmailSmartFolderId) => {
      applyMemory((m) => memRecordFolderRouteChoice(m, domain, senderLine, folder));
    },
    [applyMemory]
  );

  const getLearnedToneCb = useCallback((minToneEvents?: number) => {
    return computeLearnedTone(memoryRef.current, { minToneEvents });
  }, [memoryVersion]);

  const getRiskTolerance01Cb = useCallback(() => {
    return computeRiskTolerance01(memoryRef.current);
  }, [memoryVersion]);

  const getDominantActionTendencyCb = useCallback(() => {
    return computeDominantActionTendency(memoryRef.current);
  }, [memoryVersion]);

  const value = useMemo<UserBehaviorContextValue>(
    () => ({
      hydrated,
      profileKey,
      memory,
      memoryVersion,
      rankSuggestions,
      recordSuggestionSelected,
      recordTone,
      recordManualEdit: recordManualEditCb,
      recordIgnored,
      recordEscalation,
      recordFolderRoute,
      getLearnedTone: getLearnedToneCb,
      getRiskTolerance01: getRiskTolerance01Cb,
      getDominantActionTendency: getDominantActionTendencyCb,
    }),
    [
      hydrated,
      profileKey,
      memory,
      memoryVersion,
      rankSuggestions,
      recordSuggestionSelected,
      recordTone,
      recordManualEditCb,
      recordIgnored,
      recordEscalation,
      recordFolderRoute,
      getLearnedToneCb,
      getRiskTolerance01Cb,
      getDominantActionTendencyCb,
    ]
  );

  return (
    <UserBehaviorContext.Provider value={value}>
      {children}
    </UserBehaviorContext.Provider>
  );
}

export function useUserBehavior(): UserBehaviorContextValue {
  const ctx = useContext(UserBehaviorContext);
  if (!ctx) {
    throw new Error("useUserBehavior must be used within UserBehaviorProvider");
  }
  return ctx;
}
