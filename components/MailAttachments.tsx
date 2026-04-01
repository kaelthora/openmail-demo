"use client";

import { useCallback, type MouseEvent } from "react";
import { useOpenmailSecurity } from "@/app/openmail/openmailSecurityContext";
import type { MailSecurityInput } from "@/lib/mailSecuritySignals";
import type { MailAttachmentItem } from "@/lib/mailAttachmentItem";

export type { MailAttachmentItem } from "@/lib/mailAttachmentItem";

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

  return (
    <div className="mail-attachments" aria-label="Attachments">
      <div className="mail-attachments-label">Attachments</div>
      <ul className="mail-attachments-list">
        {attachments.map((att) => {
          const blocked = isAttachmentBlocked(att.id);
          return (
            <li
              key={att.id}
              className={`mail-attachments-item${
                blocked ? " mail-attachments-item--blocked" : ""
              }`}
            >
              <button
                type="button"
                className={`mail-attachment-btn${
                  blocked ? " mail-attachment-btn--blocked" : ""
                }${
                  att.riskLevel === "suspicious"
                    ? " mail-attachment-btn--risk-suspicious"
                    : att.riskLevel === "blocked"
                      ? " mail-attachment-btn--risk-blocked"
                      : att.riskLevel === "safe"
                        ? " mail-attachment-btn--risk-safe"
                        : ""
                }`}
                onClick={(e) => onClick(e, att)}
                disabled={analyzingAttachmentId !== null || blocked}
                title={
                  blocked
                    ? "Blocked — cannot open this attachment"
                    : undefined
                }
                aria-label={
                  blocked
                    ? `${att.name} — Blocked`
                    : `Open attachment ${att.name}`
                }
              >
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
