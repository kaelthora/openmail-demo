/**
 * Attention Engine — session signals (hover, clicks, scroll) to predict the next
 * message the user will open, so CORE can prefetch intent + suggestions.
 */

export const ATTENTION_HOVER_DWELL_STRONG_MS = 140;
export const ATTENTION_HOVER_SCORE_MIN_MS = 200;
export const ATTENTION_SCROLL_VELOCITY_THRESHOLD = 2.5;

export type AttentionSnapshot = {
  orderedIds: readonly string[];
  selectedId: string | null;
  /** Row currently under pointer (if any). */
  hoverMailId: string | null;
  /** Dwell on `hoverMailId` this hover session (0 if none). */
  hoverSessionDwellMs: number;
  /** Cumulative hover time per mail this session (ms). */
  hoverTotalsMs: ReadonlyMap<string, number>;
  /** EMA of scroll velocity (+ = user scrolling down the list). */
  scrollVelocity: number;
  /** Recent opens, oldest → newest. */
  recentOpens: readonly string[];
};

/**
 * Pick the most likely next mail to open from lightweight UI signals.
 */
export function predictNextOpenMailId(s: AttentionSnapshot): string | null {
  const {
    orderedIds,
    selectedId,
    hoverMailId,
    hoverSessionDwellMs,
    hoverTotalsMs,
    scrollVelocity,
    recentOpens,
  } = s;

  if (orderedIds.length === 0) return null;

  const idx =
    selectedId && orderedIds.length > 0 ? orderedIds.indexOf(selectedId) : -1;

  const neighborFallback = (): string | null => {
    if (idx < 0) return orderedIds[0] ?? null;
    if (idx < orderedIds.length - 1) return orderedIds[idx + 1]!;
    if (idx > 0) return orderedIds[idx - 1]!;
    return null;
  };

  if (
    hoverMailId &&
    hoverMailId !== selectedId &&
    hoverSessionDwellMs >= ATTENTION_HOVER_DWELL_STRONG_MS
  ) {
    return hoverMailId;
  }

  if (idx >= 0) {
    if (
      scrollVelocity > ATTENTION_SCROLL_VELOCITY_THRESHOLD &&
      idx < orderedIds.length - 1
    ) {
      return orderedIds[idx + 1]!;
    }
    if (
      scrollVelocity < -ATTENTION_SCROLL_VELOCITY_THRESHOLD &&
      idx > 0
    ) {
      return orderedIds[idx - 1]!;
    }
  }

  let bestId: string | null = null;
  let bestMs = 0;
  for (const [id, ms] of hoverTotalsMs) {
    if (id === selectedId) continue;
    if (ms > bestMs) {
      bestMs = ms;
      bestId = id;
    }
  }
  if (bestId && bestMs >= ATTENTION_HOVER_SCORE_MIN_MS) {
    return bestId;
  }

  if (recentOpens.length >= 2) {
    const a = recentOpens[recentOpens.length - 2]!;
    const b = recentOpens[recentOpens.length - 1]!;
    const ia = orderedIds.indexOf(a);
    const ib = orderedIds.indexOf(b);
    if (ib === ia + 1 && ib >= 0 && ib < orderedIds.length - 1) {
      return orderedIds[ib + 1]!;
    }
    if (ib === ia - 1 && ib > 0) {
      return orderedIds[ib - 1]!;
    }
  }

  return neighborFallback();
}

export function bumpHoverTotal(
  map: Map<string, number>,
  mailId: string,
  deltaMs: number
): void {
  if (deltaMs <= 0) return;
  const cap = 120_000;
  const next = Math.min(cap, (map.get(mailId) ?? 0) + deltaMs);
  map.set(mailId, next);
}

const SCROLL_VEL_EMA_ALPHA = 0.35;

export function emaScrollVelocity(
  prev: number,
  instant: number
): number {
  return prev + SCROLL_VEL_EMA_ALPHA * (instant - prev);
}
