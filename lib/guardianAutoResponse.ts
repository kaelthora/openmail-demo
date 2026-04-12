import { getMailAiRiskBand } from "@/lib/mailContentSecurity";
import type { ProcessedMail } from "@/lib/mailTypes";

/**
 * Guardian Auto Response — decides whether the app may send a reply without the user
 * pressing Send, based on synced triage (risk, intent, confidence).
 *
 * - **block** — high risk: no outbound reply (user cannot send from CORE).
 * - **require_validation** — medium risk, or safe but not auto-eligible: user must confirm.
 * - **auto_send** — safe + reply intent + confidence &gt; 85%: policy allows automatic send (if pref on).
 */
export type GuardianAutoResponseMode =
  | "auto_send"
  | "require_validation"
  | "block";

const CONFIDENCE_AUTO_THRESHOLD = 0.85;

function isReplyIntent(mail: ProcessedMail): boolean {
  const sa = mail.syncedAi;
  if (!sa) return false;
  if (sa.intent === "reply") return true;
  if (sa.intent == null && sa.action === "reply") return true;
  return false;
}

function intentConfidence(mail: ProcessedMail): number | null {
  const c = mail.syncedAi?.intentConfidence;
  if (typeof c !== "number" || !Number.isFinite(c)) return null;
  return c;
}

/**
 * Evaluates whether Guardian allows auto-send, requires manual send, or blocks send entirely.
 * Uses the same risk band as the rest of the app (`getMailAiRiskBand`).
 */
export function evaluateGuardianAutoResponse(
  mail: ProcessedMail | null
): GuardianAutoResponseMode {
  if (!mail) return "require_validation";

  const band = getMailAiRiskBand(mail);
  if (band === "high") return "block";
  if (band === "medium") return "require_validation";

  const conf = intentConfidence(mail);
  if (
    isReplyIntent(mail) &&
    conf != null &&
    conf > CONFIDENCE_AUTO_THRESHOLD
  ) {
    return "auto_send";
  }

  return "require_validation";
}

export function guardianAutoResponseDescription(
  mode: GuardianAutoResponseMode
): string {
  if (mode === "block") {
    return "Guardian blocked sending: high-risk message. Do not reply from this thread.";
  }
  if (mode === "require_validation") {
    return "Guardian requires your confirmation before sending.";
  }
  return "Guardian approved: this thread qualifies for automatic reply when enabled in settings.";
}
