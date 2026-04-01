"use client";

import { createContext, useContext } from "react";
import type { MailSecurityInput } from "@/lib/mailSecuritySignals";
import type { MailAttachmentItem } from "@/lib/mailAttachmentItem";

export type UnifiedLinkTier = "safe" | "suspicious" | "blocked";

export type OpenmailSecurityContextValue = {
  demoMode: boolean;
  linkDisplayTier: (url: string, mail: MailSecurityInput) => UnifiedLinkTier;
  handleLinkClick: (
    url: string,
    mail: MailSecurityInput,
    mailId: string
  ) => Promise<void>;
  handleAttachmentClick: (
    att: MailAttachmentItem,
    mail: MailSecurityInput
  ) => Promise<void>;
  analyzingAttachmentId: string | null;
  isAttachmentBlocked: (id: string) => boolean;
};

export const OpenmailSecurityContext =
  createContext<OpenmailSecurityContextValue | null>(null);

export function useOpenmailSecurity(): OpenmailSecurityContextValue {
  const ctx = useContext(OpenmailSecurityContext);
  if (!ctx) {
    throw new Error(
      "useOpenmailSecurity must be used within OpenmailSecurityProvider"
    );
  }
  return ctx;
}
