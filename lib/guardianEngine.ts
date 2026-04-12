/**
 * Guardian Engine — central policy for critical OpenMail actions.
 * Returns allow | warn | block for: open_mail, click_link, open_attachment, send_email.
 *
 * ## Ethical guardrails (strict, transparent, user-respecting)
 *
 * - **Clear explanations** — Every outcome states what was evaluated, what we concluded,
 *   and why (plain language; analyzer detail is preserved, not replaced with vague text).
 * - **Critical risks visible** — Blocks and high-severity findings are described explicitly;
 *   we do not soften or hide them.
 * - **No silent auto-action on uncertainty** — A `warn` means the action must not complete
 *   without the user's explicit consent (client confirm; server requires
 *   `guardianWarnAcknowledged` for sends). Notification quick-send never bypasses a warn.
 * - **Override policy** — After a `warn`, the user may choose to proceed. After a `block`
 *   with `criticalBlock: true`, there is no bypass (today all blocks are critical).
 */

import { analyzeFileAttachment } from "@/lib/fileSafety";
import { analyzeLinkUrl } from "@/lib/linkSafety";
import { analyzeMailSecurity, type MailSecurityInput } from "@/lib/mailSecuritySignals";
import type { MailAiRiskBand } from "@/lib/mailSecuritySignals";

export type GuardianAction =
  | "open_mail"
  | "click_link"
  | "open_attachment"
  | "send_email";

export type GuardianDecision = "allow" | "warn" | "block";

/** Coarse risk tier for traces and UI (aligned with decision by default). */
export type GuardianRiskLevel = "low" | "medium" | "high";

export type GuardianEvaluateResult = {
  action: GuardianAction;
  decision: GuardianDecision;
  riskLevel: GuardianRiskLevel;
  reason: string;
  /** Optional machine-readable tag for logging */
  rule?: string;
  /**
   * When true, the action must not complete without explicit user confirmation
   * (e.g. confirm dialog; for sends, server must see `guardianWarnAcknowledged`).
   */
  requiresExplicitUserConsent: boolean;
  /**
   * When true, do not offer “proceed anyway” / bypass in UI.
   * All current `block` outcomes are critical.
   */
  criticalBlock: boolean;
};

/** Documented principles; surfaced for settings, docs, or diagnostics. */
export const GUARDIAN_ETHICAL_GUARDRAILS = [
  "Explain every decision in plain language (what we checked, what we concluded, and why).",
  "Surface critical risks explicitly—no vague or minimized wording for severe outcomes.",
  "Never complete a guarded action without explicit user consent when the outcome is uncertain (warn).",
  "Offer a path to continue after warnings; do not offer bypass for critical blocks.",
] as const;

const WARN_CONSENT_TAIL =
  "You can continue only after you explicitly confirm—OpenMail will not complete this automatically.";

const CRITICAL_BLOCK_TAIL =
  "This is a critical safety block; OpenMail will not offer a bypass.";

function riskLevelFromDecision(d: GuardianDecision): GuardianRiskLevel {
  if (d === "block") return "high";
  if (d === "warn") return "medium";
  return "low";
}

type FinishInput = Pick<
  GuardianEvaluateResult,
  "action" | "decision" | "reason"
> & { rule?: string };

function finish(input: FinishInput): GuardianEvaluateResult {
  return {
    ...input,
    riskLevel: riskLevelFromDecision(input.decision),
    requiresExplicitUserConsent: input.decision === "warn",
    criticalBlock: input.decision === "block",
  };
}

/** Append consent copy for warn outcomes (idempotent if already present). */
function withWarnConsentCopy(specificReason: string): string {
  const t = specificReason.trim();
  if (t.includes("explicitly confirm")) return t;
  return `${t} ${WARN_CONSENT_TAIL}`;
}

/** Ensure critical blocks state severity and no-bypass policy. */
function withCriticalBlockCopy(specificReason: string): string {
  const t = specificReason.trim();
  if (t.includes("critical safety block")) return t;
  return `${t} ${CRITICAL_BLOCK_TAIL}`;
}

export type GuardianOpenMailPayload = {
  mailId: string;
  subject?: string;
  sender?: string;
  preview?: string;
  mailAiRisk?: MailAiRiskBand;
};

export type GuardianClickLinkPayload = {
  mailId: string;
  url: string;
  sender?: string;
  title?: string;
  subject?: string;
  preview?: string;
  content?: string;
  mailAiRisk?: MailAiRiskBand;
};

export type GuardianOpenAttachmentPayload = {
  mailId: string;
  fileName: string;
  mimeType?: string;
  attachmentRiskLevel?: "safe" | "suspicious" | "blocked";
  sender?: string;
  title?: string;
  subject?: string;
  preview?: string;
  content?: string;
  mailAiRisk?: MailAiRiskBand;
};

export type GuardianSendEmailPayload = {
  to: string;
  subject?: string;
  body?: string;
};

function verdictToDecision(
  v: "safe" | "suspicious" | "dangerous"
): GuardianDecision {
  if (v === "dangerous") return "block";
  if (v === "suspicious") return "warn";
  return "allow";
}

function securityLevelToDecision(
  level: "safe" | "suspicious" | "high_risk"
): GuardianDecision {
  if (level === "high_risk") return "block";
  if (level === "suspicious") return "warn";
  return "allow";
}

function mailRiskToDecision(r: MailAiRiskBand | undefined): GuardianDecision {
  if (r === "high") return "block";
  if (r === "medium") return "warn";
  return "allow";
}

function asMailInput(p: {
  sender?: string;
  title?: string;
  subject?: string;
  preview?: string;
  content?: string;
  mailAiRisk?: MailAiRiskBand;
}): MailSecurityInput {
  return {
    sender: p.sender,
    title: p.title,
    subject: p.subject,
    preview: p.preview,
    content: p.content,
    mailAiRisk: p.mailAiRisk,
  };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function str(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

export function parseGuardianPayload(
  action: GuardianAction,
  payload: unknown
):
  | GuardianOpenMailPayload
  | GuardianClickLinkPayload
  | GuardianOpenAttachmentPayload
  | GuardianSendEmailPayload
  | null {
  if (!isRecord(payload)) return null;
  switch (action) {
    case "open_mail": {
      const mailId = str(payload.mailId)?.trim();
      if (!mailId) return null;
      return {
        mailId,
        subject: str(payload.subject),
        sender: str(payload.sender),
        preview: str(payload.preview),
        mailAiRisk: payload.mailAiRisk as MailAiRiskBand | undefined,
      };
    }
    case "click_link": {
      const mailId = str(payload.mailId)?.trim();
      const url = str(payload.url)?.trim();
      if (!mailId || !url) return null;
      return {
        mailId,
        url,
        sender: str(payload.sender),
        title: str(payload.title),
        subject: str(payload.subject),
        preview: str(payload.preview),
        content: str(payload.content),
        mailAiRisk: payload.mailAiRisk as MailAiRiskBand | undefined,
      };
    }
    case "open_attachment": {
      const mailId = str(payload.mailId)?.trim();
      const fileName = str(payload.fileName)?.trim();
      if (!mailId || !fileName) return null;
      const ar = str(payload.attachmentRiskLevel);
      const attachmentRiskLevel =
        ar === "safe" || ar === "suspicious" || ar === "blocked" ? ar : undefined;
      return {
        mailId,
        fileName,
        mimeType: str(payload.mimeType),
        attachmentRiskLevel,
        sender: str(payload.sender),
        title: str(payload.title),
        subject: str(payload.subject),
        preview: str(payload.preview),
        content: str(payload.content),
        mailAiRisk: payload.mailAiRisk as MailAiRiskBand | undefined,
      };
    }
    case "send_email": {
      const to = str(payload.to)?.trim();
      if (!to) return null;
      return {
        to,
        subject: str(payload.subject),
        body: str(payload.body),
      };
    }
    default:
      return null;
  }
}

/**
 * Core evaluation — safe to run on server or client (pure heuristics).
 * `guardian.evaluate(action, payload)` maps here.
 */
export function guardianEvaluate(
  action: GuardianAction,
  payload: unknown
): GuardianEvaluateResult {
  const parsed = parseGuardianPayload(action, payload);
  if (!parsed) {
    return finish({
      action,
      decision: "block",
      reason: withCriticalBlockCopy(
        "We could not validate this request because required fields are missing or invalid. Until it can be checked properly, the action is blocked."
      ),
      rule: "invalid_payload",
    });
  }

  switch (action) {
    case "open_mail": {
      const p = parsed as GuardianOpenMailPayload;
      const d = mailRiskToDecision(p.mailAiRisk);
      if (d === "block") {
        return finish({
          action,
          decision: "block",
          reason: withCriticalBlockCopy(
            "This message is classified as high risk (for example phishing or fraud signals). Opening it here is blocked—we state that clearly rather than downplaying the risk."
          ),
          rule: "mail_risk_high",
        });
      }
      if (d === "warn") {
        return finish({
          action,
          decision: "warn",
          reason: withWarnConsentCopy(
            "This message shows elevated risk. Review the sender and content carefully before using any links or attachments."
          ),
          rule: "mail_risk_medium",
        });
      }
      return finish({
        action,
        decision: "allow",
        reason:
          "No strong mail-level risk signals from our checks. You may open the message; links and attachments are still evaluated separately when you use them.",
        rule: "mail_risk_safe",
      });
    }

    case "click_link": {
      const p = parsed as GuardianClickLinkPayload;
      const mail = asMailInput(p);
      const mailGate = mailRiskToDecision(p.mailAiRisk);
      if (mailGate === "block") {
        return finish({
          action,
          decision: "block",
          reason: withCriticalBlockCopy(
            "Links are blocked because the surrounding message is high risk—we do not open paths that could expose you in that context."
          ),
          rule: "link_mail_blocked",
        });
      }
      const link = analyzeLinkUrl(p.url, mail);
      const linkDecision = verdictToDecision(link.verdict);
      if (linkDecision === "block") {
        const detail =
          link.reason?.trim() ||
          "The URL matches dangerous or deceptive patterns in our checks.";
        return finish({
          action,
          decision: "block",
          reason: withCriticalBlockCopy(
            `Opening this link is blocked. ${detail}`
          ),
          rule: "link_dangerous",
        });
      }
      if (mailGate === "warn" || linkDecision === "warn") {
        const specific =
          mailGate === "warn"
            ? "The message is medium risk, so the link should open only in a protected flow after you confirm."
            : link.reason?.trim() ||
              "The URL looks suspicious (for example misleading or unusual). Use sandboxed viewing if you continue.";
        return finish({
          action,
          decision: "warn",
          reason: withWarnConsentCopy(specific),
          rule: "link_warn",
        });
      }
      return finish({
        action,
        decision: "allow",
        reason:
          link.reason?.trim() ||
          "The URL passed our automated link checks in this context; you still choose whether to open it.",
        rule: "link_safe",
      });
    }

    case "open_attachment": {
      const p = parsed as GuardianOpenAttachmentPayload;
      const mail = asMailInput(p);
      const mailGate = mailRiskToDecision(p.mailAiRisk);
      if (mailGate === "block") {
        return finish({
          action,
          decision: "block",
          reason: withCriticalBlockCopy(
            "Attachments are blocked because the surrounding message is high risk."
          ),
          rule: "attachment_mail_blocked",
        });
      }
      if (p.attachmentRiskLevel === "blocked") {
        return finish({
          action,
          decision: "block",
          reason: withCriticalBlockCopy(
            "This attachment is flagged as blocked based on type, name, or context—we are not hiding that assessment."
          ),
          rule: "attachment_tier_blocked",
        });
      }
      const file = analyzeFileAttachment(p.fileName, mail);
      const fileD = verdictToDecision(file.verdict);
      if (fileD === "block") {
        const detail =
          file.reason?.trim() ||
          "The file shows high-risk characteristics in our checks.";
        return finish({
          action,
          decision: "block",
          reason: withCriticalBlockCopy(
            `Opening this attachment is blocked. ${detail}`
          ),
          rule: "attachment_dangerous",
        });
      }
      if (
        mailGate === "warn" ||
        fileD === "warn" ||
        p.attachmentRiskLevel === "suspicious"
      ) {
        const specific =
          file.reason?.trim() ||
          "This attachment needs extra caution—use an isolated viewer or skip opening if you are unsure.";
        return finish({
          action,
          decision: "warn",
          reason: withWarnConsentCopy(specific),
          rule: "attachment_warn",
        });
      }
      return finish({
        action,
        decision: "allow",
        reason:
          "The attachment passed filename and context checks we run here; opening it remains your choice.",
        rule: "attachment_safe",
      });
    }

    case "send_email": {
      const p = parsed as GuardianSendEmailPayload;
      const blob = `${p.to}\n${p.subject ?? ""}\n${p.body ?? ""}`;
      const analyzed = analyzeMailSecurity({
        subject: p.subject ?? "(no subject)",
        content: blob,
        preview: (p.body ?? "").slice(0, 400),
      });
      const d = securityLevelToDecision(analyzed.securityLevel);
      if (d === "block") {
        const detail =
          analyzed.securityReason?.trim() ||
          "The outgoing content matches high-risk patterns (for example possible scams or sensitive exfiltration).";
        return finish({
          action,
          decision: "block",
          reason: withCriticalBlockCopy(
            `Sending is blocked. ${detail}`
          ),
          rule: "send_high_risk",
        });
      }
      if (d === "warn") {
        const detail =
          analyzed.securityReason?.trim() ||
          "Recipient or body text looks unusual—double-check before anything is sent.";
        return finish({
          action,
          decision: "warn",
          reason: withWarnConsentCopy(detail),
          rule: "send_suspicious",
        });
      }
      return finish({
        action,
        decision: "allow",
        reason:
          "Outgoing content passed our heuristic send checks; sending still only happens when you choose to send.",
        rule: "send_ok",
      });
    }
  }
}

/** Namespace-style export for API docs / imports */
export const guardian = {
  evaluate: guardianEvaluate,
  ethicalGuardrails: GUARDIAN_ETHICAL_GUARDRAILS,
} as const;
