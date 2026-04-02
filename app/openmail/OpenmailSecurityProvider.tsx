"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { analyzeLinkUrl, analyzeLinkUrlAsync } from "@/lib/linkSafety";
import { analyzeFileAttachmentAsync } from "@/lib/fileSafety";
import {
  classifyDemoLinkUrl,
  demoLinkExplanation,
  type DemoLinkTier,
} from "@/lib/demoLinkHeuristics";
import { linkTierWithMailRisk } from "@/lib/mailContentSecurity";
import type { MailSecurityInput } from "@/lib/mailSecuritySignals";
import type { MailAttachmentItem } from "@/lib/mailAttachmentItem";
import type { SandboxMode } from "@/lib/sandboxModes";
import { SecurityModal, type SecurityModalProps } from "./components/security/SecurityModal";
import {
  OpenmailSecurityContext,
  type OpenmailSecurityContextValue,
  type UnifiedLinkTier,
} from "./openmailSecurityContext";
import { useOpenmailPreferences } from "./OpenmailPreferencesProvider";

function mapVerdictToTier(
  verdict: "safe" | "suspicious" | "dangerous"
): UnifiedLinkTier {
  if (verdict === "dangerous") return "blocked";
  if (verdict === "suspicious") return "suspicious";
  return "safe";
}

function demoTierToUnified(t: DemoLinkTier): UnifiedLinkTier {
  return t;
}

function openSecureFileMode(
  fileName: string,
  mode: SandboxMode,
  mimeType?: string
): void {
  const q = new URLSearchParams();
  q.set("name", fileName);
  q.set("mode", mode);
  if (mimeType?.trim()) q.set("type", mimeType.trim());
  globalThis.open(`/openmail/safe-file?${q.toString()}`, "_blank", "noopener,noreferrer");
}

function openLinkSandbox(url: string, mode: SandboxMode): void {
  const path = `/openmail/safe-link?url=${encodeURIComponent(url)}&mode=${encodeURIComponent(mode)}`;
  globalThis.open(path, "_blank", "noopener,noreferrer");
}

type LinkModalState =
  | { tier: "safe"; url: string; mailId: string; reason: string }
  | { tier: "suspicious"; url: string; mailId: string; reason: string }
  | { tier: "blocked"; url: string; mailId: string; reason: string };

type AttachmentModalState =
  | {
      kind: "suspicious";
      att: MailAttachmentItem;
      name: string;
      reason: string;
    }
  | {
      kind: "blocked";
      att: MailAttachmentItem;
      name: string;
      reason: string;
    };

function linkModalToSecurityModal(
  m: LinkModalState,
  onDismissSafe: () => void,
  onOpenSecure: (mode: SandboxMode) => void,
  onAckBlocked: () => void,
  safeTierSandboxMode: SandboxMode
): SecurityModalProps {
  if (m.tier === "safe") {
    return {
      open: true,
      variant: "risk",
      severity: "safe",
      title: "Safe link",
      reason:
        m.reason ||
        "AI classifies this destination as low risk. Open it only in the secure environment.",
      detail: m.url,
      role: "dialog",
      primaryAction: {
        label: "Open in secure environment",
        onClick: () => {
          onOpenSecure(safeTierSandboxMode);
          onDismissSafe();
        },
      },
      secondaryAction: { label: "Cancel", onClick: onDismissSafe },
      onBackdropClick: onDismissSafe,
    };
  }
  if (m.tier === "suspicious") {
    return {
      open: true,
      variant: "risk",
      severity: "suspicious",
      title: "Suspicious link",
      reason:
        m.reason ||
        "This link shows suspicious signals. Confirm you trust the destination.",
      detail: m.url,
      role: "alertdialog",
      primaryAction: {
        label: "Open in secure mode",
        onClick: () => {
          onOpenSecure("isolated");
          onDismissSafe();
        },
      },
      secondaryAction: { label: "Cancel", onClick: onDismissSafe },
      onBackdropClick: onDismissSafe,
    };
  }
  return {
    open: true,
    variant: "risk",
    severity: "dangerous",
    title: "Link blocked",
    reason:
      m.reason ||
      "This URL cannot be opened — phishing, impersonation, or policy violation.",
    detail: m.url,
    role: "alertdialog",
    primaryAction: { label: "OK", onClick: onAckBlocked },
    secondaryAction: null,
    onBackdropClick: onAckBlocked,
  };
}

function attachmentSafeModal(
  fileName: string,
  onDismiss: () => void,
  onSecure: () => void
): SecurityModalProps {
  return {
    open: true,
    variant: "risk",
    severity: "safe",
    title: "Safe file",
    reason:
      "AI classifies this attachment as safe. It will not open directly — use the secure environment only.",
    detail: fileName,
    role: "dialog",
    primaryAction: {
      label: "Open in secure environment",
      onClick: () => {
        onSecure();
        onDismiss();
      },
    },
    secondaryAction: { label: "Cancel", onClick: onDismiss },
    onBackdropClick: onDismiss,
  };
}

export { useOpenmailSecurity } from "./openmailSecurityContext";

export function OpenmailSecurityProvider({
  children,
  demoMode,
  onQuarantineMail,
  onMaliciousLinkDetected,
}: {
  children: ReactNode;
  demoMode: boolean;
  onQuarantineMail?: (mailId: string) => void;
  onMaliciousLinkDetected?: () => void;
}) {
  const [linkModal, setLinkModal] = useState<LinkModalState | null>(null);
  const [attachmentSafeTarget, setAttachmentSafeTarget] = useState<{
    name: string;
    mimeType?: string;
  } | null>(null);
  const [attachmentModal, setAttachmentModal] =
    useState<AttachmentModalState | null>(null);
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);
  const [scanningFile, setScanningFile] = useState<{ name: string } | null>(
    null
  );
  const [blockedAttachmentIds, setBlockedAttachmentIds] = useState<Set<string>>(
    () => new Set()
  );
  const mountedRef = useRef(true);
  const { security: secPrefs } = useOpenmailPreferences();

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const linkDisplayTierForMail = useCallback(
    (url: string, mail: MailSecurityInput): UnifiedLinkTier => {
      const base: UnifiedLinkTier = demoMode
        ? demoTierToUnified(classifyDemoLinkUrl(url))
        : mapVerdictToTier(analyzeLinkUrl(url, mail).verdict);
      return linkTierWithMailRisk(base, mail.mailAiRisk);
    },
    [demoMode]
  );

  const handleLinkClick = useCallback(
    async (url: string, mail: MailSecurityInput, mailId: string) => {
      if (mail.mailAiRisk === "high") {
        onMaliciousLinkDetected?.();
        setLinkModal({
          tier: "blocked",
          url,
          mailId,
          reason:
            "This message is flagged high risk. Links are blocked to protect your account.",
        });
        return;
      }

      if (mail.mailAiRisk === "medium") {
        setLinkModal({
          tier: "suspicious",
          url,
          mailId,
          reason:
            "This message is flagged medium risk. Open the destination only in the secure sandbox if you trust it.",
        });
        return;
      }

      let tier: UnifiedLinkTier;
      let reason: string;

      if (demoMode) {
        const demoTier = classifyDemoLinkUrl(url);
        tier = demoTierToUnified(demoTier);
        reason = demoLinkExplanation(url, demoTier);
      } else {
        const result = await analyzeLinkUrlAsync(url, mail);
        tier = mapVerdictToTier(result.verdict);
        reason =
          result.reason ||
          (tier === "safe"
            ? "AI classifies this destination as low risk. Open it only in the secure environment."
            : tier === "suspicious"
              ? "This link shows suspicious signals."
              : "This URL cannot be opened.");
      }

      if (secPrefs.sensitivity === "strict" && tier === "suspicious") {
        tier = "blocked";
        reason =
          reason ||
          "Strict security is on — this link is treated as blocked.";
      }

      if (tier === "safe") {
        setLinkModal({ tier: "safe", url, mailId, reason });
        return;
      }
      if (tier === "suspicious") {
        setLinkModal({ tier: "suspicious", url, mailId, reason });
        return;
      }
      onMaliciousLinkDetected?.();
      setLinkModal({ tier: "blocked", url, mailId, reason });
    },
    [demoMode, onMaliciousLinkDetected, secPrefs.sensitivity]
  );

  const acknowledgeBlockedLink = useCallback(() => {
    if (linkModal?.tier === "blocked") {
      onQuarantineMail?.(linkModal.mailId);
    }
    setLinkModal(null);
  }, [linkModal, onQuarantineMail]);

  const closeAttachmentBlocked = useCallback(() => {
    setAttachmentModal((m) => {
      if (m?.kind === "blocked") {
        const id = m.att.id;
        queueMicrotask(() => {
          setBlockedAttachmentIds((prev) => new Set([...prev, id]));
        });
      }
      return null;
    });
  }, []);

  const handleAttachmentClick = useCallback(
    async (att: MailAttachmentItem, mail: MailSecurityInput) => {
      setAttachmentModal(null);
      setAttachmentSafeTarget(null);

      const blockedReason =
        "This file was blocked: possible phishing, impersonation, or an unsafe type detected by AI.";

      if (mail.mailAiRisk === "high") {
        setAttachmentModal({
          kind: "blocked",
          att,
          name: att.name,
          reason:
            "This message is flagged high risk. Attachments are blocked until the thread is verified.",
        });
        return;
      }

      if (mail.mailAiRisk === "medium") {
        setAttachmentModal({
          kind: "suspicious",
          att,
          name: att.name,
          reason:
            "This message is flagged medium risk. Open files only in isolated secure mode if you trust the sender.",
        });
        return;
      }

      if (att.riskLevel) {
        if (att.riskLevel === "safe") {
          setAttachmentSafeTarget({ name: att.name, mimeType: att.mimeType });
          return;
        }
        if (att.riskLevel === "suspicious") {
          if (secPrefs.blockRiskyAttachments) {
            setAttachmentModal({
              kind: "blocked",
              att,
              name: att.name,
              reason:
                "Blocked by your security settings — risky attachments are not allowed.",
            });
          } else {
            setAttachmentModal({
              kind: "suspicious",
              att,
              name: att.name,
              reason:
                "This file does not match a typical trusted pattern. Use isolated secure mode only if you must open it.",
            });
          }
          return;
        }
        setAttachmentModal({
          kind: "blocked",
          att,
          name: att.name,
          reason: blockedReason,
        });
        return;
      }

      setAnalyzingId(att.id);
      setScanningFile({ name: att.name });
      const minScanMs = 300 + Math.random() * 500;
      try {
        const [result] = await Promise.all([
          analyzeFileAttachmentAsync(att.name, mail),
          new Promise<void>((r) => setTimeout(r, minScanMs)),
        ]);
        if (!mountedRef.current) return;
        setScanningFile(null);
        if (result.verdict === "safe") {
          setAttachmentSafeTarget({ name: att.name, mimeType: att.mimeType });
        } else if (result.verdict === "suspicious") {
          if (secPrefs.blockRiskyAttachments) {
            setAttachmentModal({
              kind: "blocked",
              att,
              name: att.name,
              reason:
                result.reason ||
                "Blocked by your security settings — risky attachments are not allowed.",
            });
          } else {
            setAttachmentModal({
              kind: "suspicious",
              att,
              name: att.name,
              reason: result.reason,
            });
          }
        } else {
          setAttachmentModal({
            kind: "blocked",
            att,
            name: att.name,
            reason: result.reason || blockedReason,
          });
        }
      } catch {
        if (mountedRef.current) setScanningFile(null);
      } finally {
        if (mountedRef.current) setAnalyzingId(null);
      }
    },
    [secPrefs.blockRiskyAttachments]
  );

  const isAttachmentBlocked = useCallback(
    (id: string) => blockedAttachmentIds.has(id),
    [blockedAttachmentIds]
  );

  const value = useMemo<OpenmailSecurityContextValue>(
    () => ({
      demoMode,
      linkDisplayTier: linkDisplayTierForMail,
      handleLinkClick,
      handleAttachmentClick,
      analyzingAttachmentId: analyzingId,
      isAttachmentBlocked,
    }),
    [
      demoMode,
      linkDisplayTierForMail,
      handleLinkClick,
      handleAttachmentClick,
      analyzingId,
      isAttachmentBlocked,
    ]
  );

  const dismissLink = useCallback(() => setLinkModal(null), []);

  const safeLinkSandboxMode: SandboxMode = secPrefs.forceSandboxLinks
    ? "isolated"
    : "normal";

  const linkSecurityModal: SecurityModalProps | null = linkModal
    ? linkModalToSecurityModal(
        linkModal,
        dismissLink,
        (mode) => openLinkSandbox(linkModal.url, mode),
        acknowledgeBlockedLink,
        safeLinkSandboxMode
      )
    : null;

  const attachmentSuspiciousModal: SecurityModalProps | null =
    attachmentModal?.kind === "suspicious"
      ? {
          open: true,
          variant: "risk",
          severity: "suspicious",
          title: "Suspicious file",
          reason: attachmentModal.reason,
          detail: attachmentModal.name,
          role: "alertdialog",
          primaryAction: {
            label: "Open in secure mode",
            onClick: () => {
              openSecureFileMode(
                attachmentModal.name,
                "isolated",
                attachmentModal.att.mimeType
              );
              setAttachmentModal(null);
            },
          },
          secondaryAction: {
            label: "Cancel",
            onClick: () => setAttachmentModal(null),
          },
          onBackdropClick: () => setAttachmentModal(null),
        }
      : null;

  const attachmentBlockedModal: SecurityModalProps | null =
    attachmentModal?.kind === "blocked"
      ? {
          open: true,
          variant: "risk",
          severity: "dangerous",
          title: "File blocked",
          reason: attachmentModal.reason,
          detail: attachmentModal.name,
          role: "alertdialog",
          primaryAction: {
            label: "OK",
            onClick: closeAttachmentBlocked,
          },
          secondaryAction: null,
          onBackdropClick: closeAttachmentBlocked,
        }
      : null;

  const safeFileSandboxMode: SandboxMode = secPrefs.forceSandboxLinks
    ? "isolated"
    : "normal";

  const safeAttachmentModal: SecurityModalProps | null = attachmentSafeTarget
    ? attachmentSafeModal(
        attachmentSafeTarget.name,
        () => setAttachmentSafeTarget(null),
        () =>
          openSecureFileMode(
            attachmentSafeTarget.name,
            safeFileSandboxMode,
            attachmentSafeTarget.mimeType
          )
      )
    : null;

  const scanningModal: SecurityModalProps | null = scanningFile
    ? { open: true, variant: "scanning", fileName: scanningFile.name }
    : null;

  return (
    <OpenmailSecurityContext.Provider value={value}>
      {children}

      {scanningModal ? <SecurityModal {...scanningModal} /> : null}
      {linkSecurityModal ? <SecurityModal {...linkSecurityModal} /> : null}
      {safeAttachmentModal ? <SecurityModal {...safeAttachmentModal} /> : null}
      {attachmentSuspiciousModal ? (
        <SecurityModal {...attachmentSuspiciousModal} />
      ) : null}
      {attachmentBlockedModal ? (
        <SecurityModal {...attachmentBlockedModal} />
      ) : null}
    </OpenmailSecurityContext.Provider>
  );
}
