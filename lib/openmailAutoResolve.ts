import type { ProcessedMail } from "@/lib/mailTypes";
import { rawIntentConfidence } from "@/lib/openmailCoreUi";

/** Model confidence gate for unattended CORE actions (0–1). */
export const OPENMAIL_AUTO_RESOLVE_MIN_CONFIDENCE = 0.85;

export type OpenmailAutoResolveKind = "archive" | "reply_draft" | "mark_done";

export type OpenmailCoreAction =
  | "reply"
  | "schedule"
  | "ignore"
  | "escalate"
  | "review";

/**
 * Decide what CORE should do without the user when confidence is high enough.
 * Never returns an action for risky threads or escalate/review.
 */
export function planOpenmailAutoResolve(
  mail: ProcessedMail,
  core: OpenmailCoreAction
): OpenmailAutoResolveKind | null {
  const conf = rawIntentConfidence(mail);
  if (conf <= OPENMAIL_AUTO_RESOLVE_MIN_CONFIDENCE) return null;

  if (mail.syncedAi?.risk === "high") return null;
  if (mail.securityLevel === "high_risk" || mail.securityLevel === "suspicious") {
    return null;
  }

  if (core === "escalate" || core === "review") return null;

  if (core === "ignore") return "archive";
  if (core === "reply" || core === "schedule") return "reply_draft";
  if (mail.syncedAi?.intentUrgency === "low" || mail.priority === "low") {
    return "mark_done";
  }
  return null;
}

export function openmailAutoResolveKindLabel(kind: OpenmailAutoResolveKind): string {
  if (kind === "archive") return "Archived";
  if (kind === "reply_draft") return "Draft ready";
  return "Marked done";
}
