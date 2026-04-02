"use client";

import { useMemo, type MouseEvent } from "react";
import {
  useOpenmailSecurity,
  type UnifiedLinkTier,
} from "@/app/openmail/openmailSecurityContext";
import { RiskBadge } from "@/app/openmail/components/security/RiskBadge";
import type { SecurityRiskLevel } from "@/app/openmail/components/security/types";
import type { MailSecurityInput } from "@/lib/mailSecuritySignals";

type Part = { type: "text" | "url"; value: string };

const URL_RE = /(https?:\/\/[^\s<>"')]+|www\.[^\s<>"')]+)/gi;

function linkTierToRisk(tier: UnifiedLinkTier): SecurityRiskLevel {
  if (tier === "blocked") return "dangerous";
  if (tier === "suspicious") return "suspicious";
  return "safe";
}

function parseContentWithLinks(text: string): Part[] {
  const parts: Part[] = [];
  let lastIndex = 0;
  const re = new RegExp(URL_RE.source, "gi");
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > lastIndex) {
      parts.push({ type: "text", value: text.slice(lastIndex, m.index) });
    }
    let raw = m[0].replace(/[.,;:!?)\]]+$/g, "");
    if (!raw) {
      lastIndex = m.index + m[0].length;
      continue;
    }
    if (raw.startsWith("www.")) {
      raw = `https://${raw}`;
    }
    parts.push({ type: "url", value: raw });
    lastIndex = m.index + m[0].length;
  }
  if (lastIndex < text.length) {
    parts.push({ type: "text", value: text.slice(lastIndex) });
  }
  return parts.length > 0 ? parts : [{ type: "text", value: text }];
}

export function EmailBodyWithLinks({
  content,
  mail,
  mailId,
}: {
  content: string;
  mail: MailSecurityInput;
  mailId: string;
}) {
  const { linkDisplayTier, handleLinkClick } = useOpenmailSecurity();

  const securityInput = useMemo(
    () => ({
      sender: mail.sender,
      title: mail.title,
      subject: mail.subject,
      preview: mail.preview,
      content: mail.content,
      mailAiRisk: mail.mailAiRisk,
    }),
    [mail]
  );

  const parts = useMemo(() => parseContentWithLinks(content), [content]);
  const linksBlockedByMail = mail.mailAiRisk === "high";

  function tierClass(url: string): string {
    const t = linkDisplayTier(url, securityInput);
    return ` mail-body-link--risk-${t}`;
  }

  return (
    <div className="mail-body-with-links">
      {parts.map((p, i) =>
        p.type === "text" ? (
          <span key={i}>{p.value}</span>
        ) : (
          <button
            key={i}
            type="button"
            disabled={linksBlockedByMail}
            title={
              linksBlockedByMail
                ? "Links disabled — this message is flagged high risk."
                : undefined
            }
            className={`mail-body-link mail-body-link--with-badge${tierClass(p.value)}${
              linksBlockedByMail ? " mail-body-link--mail-risk-high" : ""
            }`}
            onClick={(e: MouseEvent<HTMLButtonElement>) => {
              e.preventDefault();
              e.stopPropagation();
              if (linksBlockedByMail) return;
              void handleLinkClick(p.value, securityInput, mailId);
            }}
          >
            <RiskBadge
              level={linkTierToRisk(linkDisplayTier(p.value, securityInput))}
              size="sm"
            />
            <span className="mail-body-link-text">{p.value}</span>
          </button>
        )
      )}
    </div>
  );
}
