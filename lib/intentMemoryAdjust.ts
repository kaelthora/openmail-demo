import { getAttentionScore } from "@/lib/mailProcess";
import type { ProcessedMail } from "@/lib/mailTypes";
import type { UserBehaviorMemoryV1 } from "@/lib/userBehaviorMemory";

import type { IntentKind, IntentUrgency } from "./intentEngine";

type SyncedAction = "reply" | "ignore" | "escalate";

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0.55;
  return Math.min(0.99, Math.max(0.05, n));
}

function stepDownUrgency(u: IntentUrgency): IntentUrgency {
  if (u === "high") return "medium";
  return "low";
}

function priorityFromUrgency(
  urgency: IntentUrgency,
  previous: ProcessedMail["priority"]
): ProcessedMail["priority"] {
  if (urgency === "high") return "urgent";
  if (urgency === "medium") {
    return previous === "urgent" ? "urgent" : "medium";
  }
  return previous === "urgent" ? "medium" : "low";
}

/**
 * Refines persisted AI triage using local user memory (ignore / escalate / edit habits).
 * Does not change mail shape — only intent fields, confidence, and derived priority.
 */
export function applyIntentMemoryToProcessedMail(
  mail: ProcessedMail,
  memory: UserBehaviorMemoryV1 | null | undefined,
  opts?: { enabled?: boolean }
): ProcessedMail {
  if (opts?.enabled === false || !memory || !mail.syncedAi) {
    return mail;
  }

  const sa = mail.syncedAi;
  const cold = memory.totalEvents < 10;

  let intent: IntentKind =
    sa.intent === "reply" ||
    sa.intent === "ignore" ||
    sa.intent === "escalate" ||
    sa.intent === "review"
      ? sa.intent
      : sa.action === "ignore"
        ? "ignore"
        : sa.action === "escalate"
          ? "escalate"
          : "reply";

  let action: SyncedAction =
    sa.action === "reply" || sa.action === "ignore" || sa.action === "escalate"
      ? sa.action
      : intent === "ignore"
        ? "ignore"
        : intent === "escalate"
          ? "escalate"
          : "reply";

  let intentUrgency: IntentUrgency =
    sa.intentUrgency === "low" ||
    sa.intentUrgency === "medium" ||
    sa.intentUrgency === "high"
      ? sa.intentUrgency
      : "medium";

  let intentConfidence =
    typeof sa.intentConfidence === "number" && Number.isFinite(sa.intentConfidence)
      ? clamp01(sa.intentConfidence)
      : clamp01(mail.intentConfidence);

  const risk = sa.risk;

  const ignoreN = memory.ignoredMailIds.length;
  const escalateN = memory.escalatedMailIds.length;
  const picks = memory.suggestionPickTotal;
  const edits = memory.manualEditCount;

  const ignoreHabit = Math.min(1, ignoreN / 22);
  const escalateHabit = Math.min(1, escalateN / 16);
  const editDenom = Math.max(10, picks + edits);
  const editLoad = Math.min(1, edits / editDenom);

  /** User frequently rewrites AI drafts → soften stated model certainty. */
  if (!cold || edits >= 4) {
    const discount = 1 - 0.38 * editLoad;
    intentConfidence = clamp01(intentConfidence * discount);
  }

  if (!cold && risk === "safe" && (intent === "reply" || intent === "review")) {
    if (ignoreHabit > 0.14) {
      intentUrgency = stepDownUrgency(intentUrgency);
    }
    if (ignoreHabit > 0.38 && intent === "reply") {
      intent = "ignore";
      action = "ignore";
    }
  }

  if (!cold) {
    if (escalateHabit > 0.22 && risk === "medium" && action === "reply") {
      intent = "review";
    }
    if (escalateHabit > 0.42 && risk === "medium" && action === "reply") {
      intent = "escalate";
      action = "escalate";
    }
    if (escalateHabit > 0.28 && risk === "high" && intent === "reply") {
      intent = "escalate";
      action = "escalate";
    }
  }

  if (action === "ignore") intent = "ignore";
  else if (action === "escalate") intent = "escalate";

  const nextSa = {
    ...sa,
    intent,
    action,
    intentUrgency,
    intentConfidence,
  };

  const nextPriority = priorityFromUrgency(intentUrgency, mail.priority);
  const base: ProcessedMail = {
    ...mail,
    syncedAi: nextSa,
    intentConfidence,
    priority: nextPriority,
  };

  return {
    ...base,
    attentionScore: getAttentionScore(base),
  };
}
