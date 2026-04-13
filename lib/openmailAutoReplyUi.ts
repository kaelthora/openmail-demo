import type { ProcessedMail } from "@/lib/mailTypes";
import { getMailAiRiskBand } from "@/lib/mailContentSecurity";
import { rawIntentConfidence } from "@/lib/openmailCoreUi";

/** Matches `CoreRecommendedAction` in the OpenMail app. */
export type ReplyAssistCoreAction =
  | "reply"
  | "schedule"
  | "ignore"
  | "escalate"
  | "review";

/** Raw intent confidence at or above → treat AI reply draft as validated / “ready”. */
export const AUTO_REPLY_CONFIDENT_RAW = 0.78;

/** Raw intent confidence at or above → nudge one-tap send after a quick read. */
export const IMMEDIATE_SEND_CONFIDENT_RAW = 0.92;

export type ReplyAssistUiState = {
  replyLike: boolean;
  readyToSend: boolean;
  suggestImmediateSend: boolean;
};

function securityBlocksTrustedSend(mail: ProcessedMail | null): boolean {
  if (!mail) return true;
  if (getMailAiRiskBand(mail) === "high") return true;
  if (mail.linkQuarantine) return true;
  return false;
}

function isReplyLikeAction(action: ReplyAssistCoreAction | null): boolean {
  return (
    action === "reply" || action === "schedule" || action === "review"
  );
}

/**
 * Drives “Ready to send” and immediate-send nudges from intent confidence + security.
 */
export function getReplyAssistUiState(
  mail: ProcessedMail | null,
  coreAction: ReplyAssistCoreAction | null,
  draftTrimmed: string,
  opts?: { hasOpenmailAutoReplyDraft?: boolean }
): ReplyAssistUiState {
  const replyLike = isReplyLikeAction(coreAction);
  const raw = rawIntentConfidence(mail);
  const autoPrefilled = !!opts?.hasOpenmailAutoReplyDraft;
  const modelConfident = raw >= AUTO_REPLY_CONFIDENT_RAW;
  const blocked = securityBlocksTrustedSend(mail);

  const readyToSend =
    replyLike &&
    draftTrimmed.length > 0 &&
    !blocked &&
    (modelConfident || autoPrefilled);

  const suggestImmediateSend =
    replyLike &&
    coreAction !== "review" &&
    draftTrimmed.length > 0 &&
    !blocked &&
    raw >= IMMEDIATE_SEND_CONFIDENT_RAW;

  return { replyLike, readyToSend, suggestImmediateSend };
}
