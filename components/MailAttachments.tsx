"use client";

import { useCallback, type MouseEvent } from "react";
import { useOpenmailSecurity } from "@/app/openmail/openmailSecurityContext";
import { RiskBadge } from "@/app/openmail/components/security/RiskBadge";
import { attachmentBadgeWithMailRisk } from "@/lib/mailContentSecurity";
import { analyzeFileAttachment } from "@/lib/fileSafety";
import type { MailSecurityInput } from "@/lib/mailSecuritySignals";
import type { MailAttachmentItem } from "@/lib/mailAttachmentItem";
import type { SecurityRiskLevel } from "@/app/openmail/components/security/types";

export type { MailAttachmentItem } from "@/lib/mailAttachmentItem";

function attachmentRiskBadgeLevel(
  att: MailAttachmentItem,
  mail: MailSecurityInput
): SecurityRiskLevel {
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
}: {
  mail: MailSecurityInput;
  attachments: MailAttachmentItem[];
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
      void handleAttachmentClick(att, securityInput);
    },
    [handleAttachmentClick, securityInput]
  );

  if (!attachments.length) return null;

  const mailBlocksAttachments = securityInput.mailAiRisk === "high";

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
          return (
            <li
              key={att.id}
              className={`mail-attachments-item${
                hardBlocked ? " mail-attachments-item--blocked" : ""
              }`}
            >
              <button
                type="button"
                className={`mail-attachment-btn${
                  hardBlocked ? " mail-attachment-btn--blocked" : ""
                }${riskBtnClass}`}
                onClick={(e) => onClick(e, att)}
                disabled={analyzingAttachmentId !== null || hardBlocked}
                title={
                  hardBlocked
                    ? mailBlocksAttachments
                      ? "Attachments blocked — message flagged high risk"
                      : "Blocked — cannot open this attachment"
                    : undefined
                }
                aria-label={
                  hardBlocked
                    ? `${att.name} — Blocked`
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
