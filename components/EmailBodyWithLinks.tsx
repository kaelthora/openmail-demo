"use client";

import { useMemo, type MouseEvent } from "react";
import { useOpenmailSecurity } from "@/app/openmail/openmailSecurityContext";
import type { MailSecurityInput } from "@/lib/mailSecuritySignals";

type Part = { type: "text" | "url"; value: string };

const URL_RE = /(https?:\/\/[^\s<>"')]+|www\.[^\s<>"')]+)/gi;

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
    }),
    [mail]
  );

  const parts = useMemo(() => parseContentWithLinks(content), [content]);

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
            className={`mail-body-link${tierClass(p.value)}`}
            onClick={(e: MouseEvent<HTMLButtonElement>) => {
              e.preventDefault();
              e.stopPropagation();
              void handleLinkClick(p.value, securityInput, mailId);
            }}
          >
            {p.value}
          </button>
        )
      )}
    </div>
  );
}
