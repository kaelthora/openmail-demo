/**
 * One scannable sentence for Guardian Intercept (full trace still lives in logs / settings).
 */
export function guardianShortReason(full: string): string {
  const t = full.replace(/\s+/g, " ").trim();
  if (!t) return "Guardian reviewed this action.";
  const m = t.match(/^[^.!?]+(?:[.!?]+|$)/);
  const first = m?.[0]?.trim() ?? t;
  if (first.length <= 160) return first;
  return `${first.slice(0, 157)}…`;
}
