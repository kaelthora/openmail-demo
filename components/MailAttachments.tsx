"use client";

import { useCallback, type MouseEvent } from "react";
import { useOpenmailSecurity } from "@/app/openmail/openmailSecurityContext";
import { RiskBadge } from "@/app/openmail/components/security/RiskBadge";
import {
  attachmentBadgeWithMailRisk,
  type AttachmentBadgeTier,
} from "@/lib/mailContentSecurity";
import { analyzeFileAttachment } from "@/lib/fileSafety";
import type { MailSecurityInput } from "@/lib/mailSecuritySignals";
import type { MailAttachmentItem } from "@/lib/mailAttachmentItem";
export type { MailAttachmentItem } from "@/lib/mailAttachmentItem";

function attachmentRiskBadgeLevel(
  att: MailAttachmentItem,
  mail: MailSecurityInput
): AttachmentBadgeTier {
  if (att.riskLevel === "blocked") return "dangerous";
  if (att.riskLevel === "suspicious") return "suspicious";
  if (att.riskLevel === "safe") return "safe";
  const v = analyzeFileAttachment(att.name, mail).verdict;
  if (v === "dangerous") return "dangerous";
  if (v === "suspicious") return "suspicious";
  return "safe";
}

export function MailAttachments({
  mail,
  attachments,
  mailId,
}: {
  mail: MailSecurityInput;
  attachments: MailAttachmentItem[];
  mailId: string;
}) {
  const {
    handleAttachmentClick,
    analyzingAttachmentId,
    isAttachmentBlocked,
  } = useOpenmailSecurity();

  const securityInput = mail;

  const onClick = useCallback(
    (event: MouseEvent<HTMLButtonElement>, att: MailAttachmentItem) => {
      event.preventDefault();
      event.stopPropagation();
      void handleAttachmentClick(att, securityInput, mailId);
    },
    [handleAttachmentClick, securityInput, mailId]
  );

  if (!attachments.length) return null;

  const mailBlocksAttachments = securityInput.mailAiRisk === "high";
  const mailSandboxAttachments = securityInput.mailAiRisk === "medium";

  return (
    <div className="mail-attachments" aria-label="Attachments">
      <div className="mail-attachments-label">Attachments</div>
      <ul className="mail-attachments-list">
        {attachments.map((att) => {
          const blocked = isAttachmentBlocked(att.id);
          const baseBadge = attachmentRiskBadgeLevel(att, securityInput);
          const badgeLevel = attachmentBadgeWithMailRisk(
            baseBadge,
            securityInput.mailAiRisk
          );
          const riskBtnClass =
            badgeLevel === "dangerous"
              ? " mail-attachment-btn--risk-blocked"
              : badgeLevel === "suspicious"
                ? " mail-attachment-btn--risk-suspicious"
                : att.riskLevel === "safe"
                  ? " mail-attachment-btn--risk-safe"
                  : "";
          const hardBlocked = blocked || mailBlocksAttachments;
          const buttonDisabled =
            analyzingAttachmentId !== null || blocked;
          return (
            <li
              key={att.id}
              className={`mail-attachments-item${
                hardBlocked ? " mail-attachments-item--blocked" : ""
              }${mailSandboxAttachments && !hardBlocked ? " mail-attachments-item--sandbox-mail" : ""}`}
            >
              <button
                type="button"
                className={`mail-attachment-btn${
                  hardBlocked ? " mail-attachment-btn--blocked" : ""
                }${riskBtnClass}`}
                onClick={(e) => onClick(e, att)}
                disabled={buttonDisabled}
                title={
                  hardBlocked
                    ? "Blocked for security"
                    : badgeLevel === "dangerous"
                      ? "Blocked for security"
                      : badgeLevel === "suspicious"
                        ? "Sandbox only — opens in isolated viewer"
                        : "Low risk — click to open"
                }
                aria-label={
                  blocked
                    ? `${att.name} — blocked`
                    : mailBlocksAttachments
                      ? `${att.name} — blocked for security`
                      : `Open attachment ${att.name}`
                }
              >
                <RiskBadge level={badgeLevel} size="sm" />
                <span className="mail-attachment-icon" aria-hidden>
                  {blocked ? "⚠️" : "📎"}
                </span>
                <span className="mail-attachment-name">{att.name}</span>
                {blocked ? (
                  <span className="mail-attachment-blocked-label">Blocked</span>
                ) : null}
                {att.sizeLabel ? (
                  <span className="mail-attachment-size">{att.sizeLabel}</span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
