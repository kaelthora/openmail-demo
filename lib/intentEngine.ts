/**
 * Intent Engine — infers what the user should do next (separate from legacy triage `action`).
 */

export type IntentKind = "reply" | "ignore" | "escalate" | "review";

export type IntentUrgency = "low" | "medium" | "high";

export type IntentInference = {
  intent: IntentKind;
  intentUrgency: IntentUrgency;
  intentConfidence: number;
};

export type IntentEngineInput = {
  subject: string | null;
  body: string;
};

const REVIEW_RE =
  /\b(invoice|contract|please review|read carefully|attachment|approval needed|sign (off|here)|due date|legal review|compliance|policy update|terms and conditions)\b/i;

const URGENT_RE =
  /\burgent|asap|immediately|eod\b|end of day|within the hour|critical\b/i;

const SOON_RE = /\b(this week|by tomorrow|by friday|soon\b|next few days)\b/i;

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0.55;
  return Math.min(0.97, Math.max(0.32, n));
}

/**
 * Deterministic intent from subject/body + existing triage labels (used as LLM fallback).
 */
export function inferIntentLocal(
  input: IntentEngineInput,
  risk: "high" | "medium" | "safe",
  action: "reply" | "ignore" | "escalate"
): IntentInference {
  const text = `${input.subject ?? ""}\n${input.body}`.toLowerCase();

  let intent: IntentKind =
    action === "ignore"
      ? "ignore"
      : action === "escalate"
        ? "escalate"
        : "reply";

  if (intent === "reply") {
    if (risk === "high") {
      intent = "escalate";
    } else if (
      risk === "medium" &&
      /\b(invoice|payment|wire|contract|purchase order)\b/i.test(text)
    ) {
      intent = "review";
    } else if (REVIEW_RE.test(text) && !/\b(newsletter|unsubscribe|no[- ]?reply)\b/i.test(text)) {
      intent = "review";
    }
  }

  let intentUrgency: IntentUrgency = "low";
  if (risk === "high") intentUrgency = "high";
  else if (risk === "medium") intentUrgency = "medium";

  if (URGENT_RE.test(text)) intentUrgency = "high";
  else if (SOON_RE.test(text) && intentUrgency === "low") intentUrgency = "medium";

  let intentConfidence = 0.7;
  if (risk === "high") intentConfidence = 0.88;
  if (action === "ignore") intentConfidence = 0.8;
  if (intent === "review") intentConfidence = 0.66;
  if (intent === "escalate" && risk === "high") intentConfidence = 0.91;
  if (risk === "safe" && intent === "reply") intentConfidence = 0.58;

  return {
    intent,
    intentUrgency,
    intentConfidence: clamp01(intentConfidence),
  };
}

export function parseIntentKind(v: unknown): IntentKind | null {
  if (v === "reply" || v === "ignore" || v === "escalate" || v === "review")
    return v;
  return null;
}

export function parseIntentUrgency(v: unknown): IntentUrgency | null {
  if (v === "low" || v === "medium" || v === "high") return v;
  return null;
}

export function parseIntentConfidence(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  return clamp01(v);
}
