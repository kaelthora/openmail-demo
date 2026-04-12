import type { OpenmailSmartFolderId } from "@/lib/mailTypes";
import { folderRouteDomainKey, folderRouteSenderKey } from "@/lib/smartFolderKeys";

export const BEHAVIOR_LS_KEY = "openmail-user-behavior-memory-v1";
export const BEHAVIOR_PROFILE_LS_KEY = "openmail-behavior-profile-key-v1";

const MAX_MAIL_ID_MEMO = 420;
const MAX_SUGGESTION_KEY_ENTRIES = 900;

export type BehaviorTone = "Professional" | "Friendly" | "Direct" | "Short";

export type BehaviorCoreAction =
  | "reply"
  | "schedule"
  | "ignore"
  | "escalate"
  | "review";

export type UserBehaviorMemoryV1 = {
  version: 1;
  updatedAt: string;
  totalEvents: number;
  ignoredMailIds: string[];
  escalatedMailIds: string[];
  suggestionPickTotal: number;
  manualEditCount: number;
  actionTendencyCounts?: Partial<Record<BehaviorCoreAction, number>>;
  toneCounts?: Partial<Record<BehaviorTone, number>>;
  /** Global pick counts keyed by trimmed suggestion text. */
  suggestionPickCounts?: Record<string, number>;
  /** Per–core-action pick counts keyed by trimmed suggestion text. */
  suggestionPicksByAction?: Partial<Record<BehaviorCoreAction, Record<string, number>>>;
  folderRouteCounts?: Record<string, number>;
};

function bumpUpdated(m: UserBehaviorMemoryV1): UserBehaviorMemoryV1 {
  return { ...m, updatedAt: new Date().toISOString() };
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0.55;
  return Math.min(0.97, Math.max(0.03, n));
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string");
}

function asRecordNumber(v: unknown): Record<string, number> {
  if (!v || typeof v !== "object") return {};
  const out: Record<string, number> = {};
  for (const [k, val] of Object.entries(v)) {
    if (typeof val === "number" && Number.isFinite(val)) out[k] = val;
  }
  return out;
}

function asNestedSuggestionPicks(
  v: unknown
): Partial<Record<BehaviorCoreAction, Record<string, number>>> {
  if (!v || typeof v !== "object") return {};
  const out: Partial<Record<BehaviorCoreAction, Record<string, number>>> = {};
  const acts: BehaviorCoreAction[] = [
    "reply",
    "schedule",
    "ignore",
    "escalate",
    "review",
  ];
  for (const a of acts) {
    const raw = (v as Record<string, unknown>)[a];
    if (raw && typeof raw === "object") {
      out[a] = asRecordNumber(raw);
    }
  }
  return out;
}

function asPartialActionCounts(
  v: unknown
): Partial<Record<BehaviorCoreAction, number>> {
  if (!v || typeof v !== "object") return {};
  const out: Partial<Record<BehaviorCoreAction, number>> = {};
  const acts: BehaviorCoreAction[] = [
    "reply",
    "schedule",
    "ignore",
    "escalate",
    "review",
  ];
  for (const a of acts) {
    const n = (v as Record<string, unknown>)[a];
    if (typeof n === "number" && Number.isFinite(n)) out[a] = n;
  }
  return out;
}

function asToneCounts(v: unknown): Partial<Record<BehaviorTone, number>> {
  if (!v || typeof v !== "object") return {};
  const tones: BehaviorTone[] = ["Professional", "Friendly", "Direct", "Short"];
  const out: Partial<Record<BehaviorTone, number>> = {};
  for (const t of tones) {
    const n = (v as Record<string, unknown>)[t];
    if (typeof n === "number" && Number.isFinite(n)) out[t] = n;
  }
  return out;
}

export function createEmptyMemory(): UserBehaviorMemoryV1 {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    totalEvents: 0,
    ignoredMailIds: [],
    escalatedMailIds: [],
    suggestionPickTotal: 0,
    manualEditCount: 0,
    actionTendencyCounts: {},
    toneCounts: {},
    suggestionPickCounts: {},
    suggestionPicksByAction: {},
    folderRouteCounts: {},
  };
}

export function parseBehaviorMemory(raw: unknown): UserBehaviorMemoryV1 {
  const base = createEmptyMemory();
  if (!raw || typeof raw !== "object") return base;
  const o = raw as Record<string, unknown>;

  const totalEvents =
    typeof o.totalEvents === "number" && Number.isFinite(o.totalEvents)
      ? Math.max(0, Math.floor(o.totalEvents))
      : base.totalEvents;
  const suggestionPickTotal =
    typeof o.suggestionPickTotal === "number" && Number.isFinite(o.suggestionPickTotal)
      ? Math.max(0, Math.floor(o.suggestionPickTotal))
      : base.suggestionPickTotal;
  const manualEditCount =
    typeof o.manualEditCount === "number" && Number.isFinite(o.manualEditCount)
      ? Math.max(0, Math.floor(o.manualEditCount))
      : base.manualEditCount;

  const ignoredMailIds = asStringArray(o.ignoredMailIds).slice(-MAX_MAIL_ID_MEMO);
  const escalatedMailIds = asStringArray(o.escalatedMailIds).slice(-MAX_MAIL_ID_MEMO);

  const updatedAt =
    typeof o.updatedAt === "string" && o.updatedAt.trim()
      ? o.updatedAt
      : base.updatedAt;

  return {
    version: 1,
    updatedAt,
    totalEvents,
    ignoredMailIds,
    escalatedMailIds,
    suggestionPickTotal,
    manualEditCount,
    actionTendencyCounts: asPartialActionCounts(o.actionTendencyCounts),
    toneCounts: asToneCounts(o.toneCounts),
    suggestionPickCounts: trimSuggestionMap(asRecordNumber(o.suggestionPickCounts)),
    suggestionPicksByAction: trimNestedPicks(asNestedSuggestionPicks(o.suggestionPicksByAction)),
    folderRouteCounts: asRecordNumber(o.folderRouteCounts),
  };
}

function trimSuggestionMap(m: Record<string, number>): Record<string, number> {
  const entries = Object.entries(m);
  if (entries.length <= MAX_SUGGESTION_KEY_ENTRIES) return m;
  entries.sort((a, b) => b[1] - a[1]);
  return Object.fromEntries(entries.slice(0, MAX_SUGGESTION_KEY_ENTRIES));
}

function trimNestedPicks(
  m: Partial<Record<BehaviorCoreAction, Record<string, number>>>
): Partial<Record<BehaviorCoreAction, Record<string, number>>> {
  const out: Partial<Record<BehaviorCoreAction, Record<string, number>>> = {};
  for (const [k, v] of Object.entries(m)) {
    if (!v) continue;
    out[k as BehaviorCoreAction] = trimSuggestionMap(v);
  }
  return out;
}

export function rankSuggestionsByMemory(
  suggestions: string[],
  coreAction: BehaviorCoreAction,
  memory: UserBehaviorMemoryV1
): string[] {
  if (suggestions.length <= 1) return suggestions;
  const perAction = memory.suggestionPicksByAction?.[coreAction] ?? {};
  const global = memory.suggestionPickCounts ?? {};
  const scored = suggestions.map((s, i) => {
    const t = s.trim();
    const w = (perAction[t] ?? 0) * 1.18 + (global[t] ?? 0) * 0.32;
    return { s, i, w };
  });
  scored.sort((a, b) => b.w - a.w || a.i - b.i);
  return scored.map((x) => x.s);
}

export function recordSuggestionPick(
  m: UserBehaviorMemoryV1,
  coreAction: BehaviorCoreAction,
  text: string
): UserBehaviorMemoryV1 {
  const t = text.trim().slice(0, 480);
  if (!t) return bumpUpdated(m);

  const byAction: Partial<Record<BehaviorCoreAction, Record<string, number>>> = {
    ...(m.suggestionPicksByAction ?? {}),
  };
  const inner = { ...(byAction[coreAction] ?? {}) };
  inner[t] = (inner[t] ?? 0) + 1;
  byAction[coreAction] = trimSuggestionMap(inner);

  const global = trimSuggestionMap({
    ...(m.suggestionPickCounts ?? {}),
    [t]: (m.suggestionPickCounts?.[t] ?? 0) + 1,
  });

  const act = { ...(m.actionTendencyCounts ?? {}) };
  act[coreAction] = (act[coreAction] ?? 0) + 1;

  return bumpUpdated({
    ...m,
    suggestionPicksByAction: byAction,
    suggestionPickCounts: global,
    actionTendencyCounts: act,
    suggestionPickTotal: m.suggestionPickTotal + 1,
    totalEvents: m.totalEvents + 1,
  });
}

export function recordToneChoice(
  m: UserBehaviorMemoryV1,
  tone: BehaviorTone
): UserBehaviorMemoryV1 {
  const tc = { ...(m.toneCounts ?? {}) };
  tc[tone] = (tc[tone] ?? 0) + 1;
  return bumpUpdated({
    ...m,
    toneCounts: tc,
    totalEvents: m.totalEvents + 1,
  });
}

export function recordManualEdit(m: UserBehaviorMemoryV1): UserBehaviorMemoryV1 {
  return bumpUpdated({
    ...m,
    manualEditCount: m.manualEditCount + 1,
    totalEvents: m.totalEvents + 1,
  });
}

export function recordIgnoredMail(
  m: UserBehaviorMemoryV1,
  mailId: string
): UserBehaviorMemoryV1 {
  if (!mailId.trim()) return bumpUpdated(m);
  if (m.ignoredMailIds.includes(mailId)) return bumpUpdated(m);
  const next = [...m.ignoredMailIds, mailId].slice(-MAX_MAIL_ID_MEMO);
  return bumpUpdated({
    ...m,
    ignoredMailIds: next,
    totalEvents: m.totalEvents + 1,
  });
}

export function recordEscalatedMail(
  m: UserBehaviorMemoryV1,
  mailId: string
): UserBehaviorMemoryV1 {
  if (!mailId.trim()) return bumpUpdated(m);
  if (m.escalatedMailIds.includes(mailId)) return bumpUpdated(m);
  const next = [...m.escalatedMailIds, mailId].slice(-MAX_MAIL_ID_MEMO);
  return bumpUpdated({
    ...m,
    escalatedMailIds: next,
    totalEvents: m.totalEvents + 1,
  });
}

export function recordFolderRouteChoice(
  m: UserBehaviorMemoryV1,
  domain: string | null,
  senderLine: string,
  folder: OpenmailSmartFolderId
): UserBehaviorMemoryV1 {
  const counts = { ...(m.folderRouteCounts ?? {}) };
  if (domain) {
    const k = folderRouteDomainKey(domain, folder);
    counts[k] = (counts[k] ?? 0) + 1;
  }
  const k2 = folderRouteSenderKey(senderLine, folder);
  counts[k2] = (counts[k2] ?? 0) + 1;
  return bumpUpdated({
    ...m,
    folderRouteCounts: counts,
    totalEvents: m.totalEvents + 1,
  });
}

export function getLearnedTone(
  memory: UserBehaviorMemoryV1,
  opts?: { minToneEvents?: number }
): BehaviorTone | null {
  const min = opts?.minToneEvents ?? 6;
  const tc = memory.toneCounts ?? {};
  const total = (Object.values(tc) as number[]).reduce((a, b) => a + (b ?? 0), 0);
  if (total < min) return null;
  let best: BehaviorTone | null = null;
  let bestN = 0;
  for (const [k, v] of Object.entries(tc) as [BehaviorTone, number][]) {
    if ((v ?? 0) > bestN) {
      bestN = v ?? 0;
      best = k;
    }
  }
  return best;
}

/** Scalar habit signal: higher ≈ more comfortable batching / dismissing low-risk mail. */
export function getRiskTolerance01(memory: UserBehaviorMemoryV1): number {
  const ign = memory.ignoredMailIds.length;
  const esc = memory.escalatedMailIds.length;
  const picks = memory.suggestionPickTotal;
  const edits = memory.manualEditCount;
  const denom = Math.max(10, ign + esc + picks * 0.35 + edits * 0.45 + 1);
  const raw = (ign + picks * 0.12 + 0.4) / denom;
  return clamp01(raw * 0.88 + 0.06);
}

export function getDominantActionTendency(
  memory: UserBehaviorMemoryV1
): BehaviorCoreAction | null {
  if (memory.totalEvents < 12) return null;
  const c = memory.actionTendencyCounts;
  if (!c) return null;
  let best: BehaviorCoreAction | null = null;
  let bestN = 0;
  for (const [k, v] of Object.entries(c) as [BehaviorCoreAction, number][]) {
    if (typeof v === "number" && v > bestN) {
      bestN = v;
      best = k;
    }
  }
  return bestN >= 5 ? best : null;
}
