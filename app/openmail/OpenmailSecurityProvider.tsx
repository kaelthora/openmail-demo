"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { analyzeLinkUrl, analyzeLinkUrlAsync } from "@/lib/linkSafety";
import { analyzeFileAttachmentAsync } from "@/lib/fileSafety";
import { classifyDemoLinkUrl, type DemoLinkTier } from "@/lib/demoLinkHeuristics";
import type { MailSecurityInput } from "@/lib/mailSecuritySignals";
import type { MailAttachmentItem } from "@/lib/mailAttachmentItem";
import type { SandboxMode } from "@/lib/sandboxModes";
import {
  OpenmailSecurityContext,
  type OpenmailSecurityContextValue,
  type UnifiedLinkTier,
} from "./openmailSecurityContext";

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

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function simulateFileOpen(fileName: string): void {
  const w = globalThis.open("", "_blank", "noopener,noreferrer");
  if (!w) return;
  w.document.title = fileName;
  w.document.body.innerHTML = `<pre style="font-family:system-ui,sans-serif;padding:24px;line-height:1.5;background:#0f172a;color:#e2e8f0;margin:0">Verified safe — preview:\n\n<strong>${escapeHtml(
    fileName
  )}</strong></pre>`;
}

function openSecureFileMode(fileName: string, mode: SandboxMode): void {
  const path = `/openmail/safe-file?name=${encodeURIComponent(fileName)}&mode=${encodeURIComponent(mode)}`;
  globalThis.open(path, "_blank", "noopener,noreferrer");
}

function openLinkSandbox(url: string, mode: SandboxMode): void {
  const path = `/openmail/safe-link?url=${encodeURIComponent(url)}&mode=${encodeURIComponent(mode)}`;
  globalThis.open(path, "_blank", "noopener,noreferrer");
}

type LinkModalState =
  | { tier: "safe"; url: string; mailId: string }
  | { tier: "suspicious"; url: string; mailId: string }
  | { tier: "blocked"; url: string; mailId: string };

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
    };

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
  const [attachmentSafeName, setAttachmentSafeName] = useState<string | null>(
    null
  );
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

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const linkDisplayTierForMail = useCallback(
    (url: string, mail: MailSecurityInput): UnifiedLinkTier => {
      if (demoMode) return demoTierToUnified(classifyDemoLinkUrl(url));
      return mapVerdictToTier(analyzeLinkUrl(url, mail).verdict);
    },
    [demoMode]
  );

  const handleLinkClick = useCallback(
    async (url: string, mail: MailSecurityInput, mailId: string) => {
      let tier: UnifiedLinkTier;
      if (demoMode) {
        tier = demoTierToUnified(classifyDemoLinkUrl(url));
      } else {
        const result = await analyzeLinkUrlAsync(url, mail);
        tier = mapVerdictToTier(result.verdict);
      }

      if (tier === "safe") {
        setLinkModal({ tier: "safe", url, mailId });
        return;
      }
      if (tier === "suspicious") {
        setLinkModal({ tier: "suspicious", url, mailId });
        return;
      }
      onMaliciousLinkDetected?.();
      setLinkModal({ tier: "blocked", url, mailId });
    },
    [demoMode, onMaliciousLinkDetected]
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

  const overrideBlockedAttachmentSandbox = useCallback(() => {
    setAttachmentModal((m) => {
      if (m?.kind === "blocked") {
        const name = m.name;
        queueMicrotask(() => openSecureFileMode(name, "restricted"));
      }
      return null;
    });
  }, []);

  const handleAttachmentClick = useCallback(
    async (att: MailAttachmentItem, mail: MailSecurityInput) => {
      setAttachmentModal(null);
      setAttachmentSafeName(null);

      if (att.riskLevel) {
        if (att.riskLevel === "safe") {
          setAttachmentSafeName(att.name);
          return;
        }
        if (att.riskLevel === "suspicious") {
          setAttachmentModal({
            kind: "suspicious",
            att,
            name: att.name,
            reason:
              "This file does not match a typical trusted pattern. Use the isolated viewer only.",
          });
          return;
        }
        setAttachmentModal({
          kind: "blocked",
          att,
          name: att.name,
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
          setAttachmentSafeName(att.name);
        } else if (result.verdict === "suspicious") {
          setAttachmentModal({
            kind: "suspicious",
            att,
            name: att.name,
            reason: result.reason,
          });
        } else {
          setAttachmentModal({
            kind: "blocked",
            att,
            name: att.name,
          });
        }
      } catch {
        if (mountedRef.current) setScanningFile(null);
      } finally {
        if (mountedRef.current) setAnalyzingId(null);
      }
    },
    []
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

  return (
    <OpenmailSecurityContext.Provider value={value}>
      {children}

      {scanningFile ? (
        <>
          <div className="link-safety-backdrop" aria-hidden />
          <div
            role="status"
            aria-live="polite"
            aria-busy="true"
            className="link-safety-modal glass-panel glass-depth-2 attachment-scan-modal openmail-security-modal-root"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="attachment-scan-modal-inner">
              <p className="attachment-scan-title">Scanning file…</p>
              <p className="attachment-scan-sub" title={scanningFile.name}>
                {scanningFile.name.length > 48
                  ? `${scanningFile.name.slice(0, 46)}…`
                  : scanningFile.name}
              </p>
              <div className="attachment-scan-progress" aria-hidden>
                <div className="attachment-scan-progress-bar" />
              </div>
            </div>
          </div>
        </>
      ) : null}

      {linkModal?.tier === "safe" ? (
        <>
          <div
            className="link-safety-backdrop link-safety-backdrop--risk-safe"
            aria-hidden
            onClick={() => setLinkModal(null)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="unified-link-safe-title"
            className="link-safety-modal glass-panel glass-depth-2 link-safety-modal--risk-safe openmail-security-modal-root"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="openmail-safe-link-indicator" aria-hidden />
            <h3 id="unified-link-safe-title" className="link-safety-title">
              Safe link
            </h3>
            <p className="link-safety-reason text-[12px] text-white/75 leading-relaxed">
              AI classifies this destination as low risk. You can open it directly or review in a
              standard sandbox.
            </p>
            <p className="link-safety-url" title={linkModal.url}>
              {linkModal.url.length > 72
                ? `${linkModal.url.slice(0, 70)}…`
                : linkModal.url}
            </p>
            <div className="link-safety-actions link-safety-actions--stack">
              <button
                type="button"
                className="link-safety-btn link-safety-btn--primary button magnetic-ui button-liquid"
                onClick={() => {
                  globalThis.open(linkModal.url, "_blank", "noopener,noreferrer");
                  setLinkModal(null);
                }}
              >
                Open link
              </button>
              <button
                type="button"
                className="link-safety-btn link-safety-btn--secure button magnetic-ui button-liquid"
                onClick={() => {
                  openLinkSandbox(linkModal.url, "normal");
                  setLinkModal(null);
                }}
              >
                Open in sandbox (optional)
              </button>
              <button
                type="button"
                className="link-safety-btn link-safety-btn--secondary button magnetic-ui button-liquid"
                onClick={() => setLinkModal(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        </>
      ) : null}

      {linkModal?.tier === "suspicious" ? (
        <>
          <div
            className="link-safety-backdrop link-safety-backdrop--demo-suspicious"
            aria-hidden
            onClick={() => setLinkModal(null)}
          />
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="unified-link-suspicious-title"
            className="link-safety-modal glass-panel glass-depth-2 link-safety-modal--demo-suspicious openmail-security-modal-root"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="unified-link-suspicious-title" className="link-safety-title">
              Potential risk detected
            </h3>
            <p className="link-safety-reason text-[12px] text-white/75 leading-relaxed">
              AI recommends an isolated review before any navigation.
            </p>
            <p className="link-safety-url" title={linkModal.url}>
              {linkModal.url.length > 72
                ? `${linkModal.url.slice(0, 70)}…`
                : linkModal.url}
            </p>
            <div className="link-safety-actions link-safety-actions--stack">
              <button
                type="button"
                className="link-safety-btn link-safety-btn--secure button magnetic-ui button-liquid"
                onClick={() => {
                  openLinkSandbox(linkModal.url, "isolated");
                  setLinkModal(null);
                }}
              >
                Open in secure sandbox
              </button>
              <button
                type="button"
                className="link-safety-btn link-safety-btn--secondary button magnetic-ui button-liquid"
                onClick={() => setLinkModal(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        </>
      ) : null}

      {linkModal?.tier === "blocked" ? (
        <>
          <div
            className="link-safety-backdrop link-safety-backdrop--demo-blocked"
            aria-hidden
            onClick={() => setLinkModal(null)}
          />
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="unified-link-blocked-title"
            className="link-safety-modal glass-panel glass-depth-2 link-safety-modal--demo-blocked openmail-security-modal-root"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="unified-link-blocked-title" className="link-safety-title">
              Threat blocked
            </h3>
            <p className="link-safety-reason text-[12px] text-white/80 leading-relaxed">
              This content has been prevented from executing.
            </p>
            <p className="link-safety-url" title={linkModal.url}>
              {linkModal.url.length > 72
                ? `${linkModal.url.slice(0, 70)}…`
                : linkModal.url}
            </p>
            <div className="link-safety-actions link-safety-actions--stack">
              <button
                type="button"
                className="link-safety-btn link-safety-btn--primary button magnetic-ui button-liquid"
                onClick={acknowledgeBlockedLink}
              >
                OK
              </button>
              <button
                type="button"
                className="link-safety-btn link-safety-btn--secondary button magnetic-ui button-liquid text-[10px]"
                onClick={() => {
                  openLinkSandbox(linkModal.url, "restricted");
                  setLinkModal(null);
                }}
              >
                Override in sandbox (advanced)
              </button>
            </div>
          </div>
        </>
      ) : null}

      {attachmentSafeName ? (
        <>
          <div
            className="link-safety-backdrop"
            aria-hidden
            onClick={() => setAttachmentSafeName(null)}
          />
          <div
            role="dialog"
            aria-modal="true"
            className="link-safety-modal glass-panel glass-depth-2 link-safety-modal--risk-safe openmail-security-modal-root"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="openmail-safe-link-indicator" aria-hidden />
            <h3 className="link-safety-title">Safe file</h3>
            <p className="link-safety-reason">
              AI classifies this attachment as safe. Open a preview or use the standard sandbox.
            </p>
            <p className="link-safety-url" title={attachmentSafeName}>
              {attachmentSafeName.length > 72
                ? `${attachmentSafeName.slice(0, 70)}…`
                : attachmentSafeName}
            </p>
            <div className="link-safety-actions link-safety-actions--stack">
              <button
                type="button"
                className="link-safety-btn link-safety-btn--primary button magnetic-ui button-liquid"
                onClick={() => {
                  simulateFileOpen(attachmentSafeName);
                  setAttachmentSafeName(null);
                }}
              >
                Open preview
              </button>
              <button
                type="button"
                className="link-safety-btn link-safety-btn--secure button magnetic-ui button-liquid"
                onClick={() => {
                  openSecureFileMode(attachmentSafeName, "normal");
                  setAttachmentSafeName(null);
                }}
              >
                Open in sandbox (optional)
              </button>
              <button
                type="button"
                className="link-safety-btn link-safety-btn--secondary button magnetic-ui button-liquid"
                onClick={() => setAttachmentSafeName(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        </>
      ) : null}

      {attachmentModal?.kind === "suspicious" ? (
        <>
          <div
            className="link-safety-backdrop link-safety-backdrop--attachment-risk"
            aria-hidden
            onClick={() => setAttachmentModal(null)}
          />
          <div
            role="alertdialog"
            aria-modal="true"
            className="link-safety-modal glass-panel glass-depth-2 link-safety-modal--suspicious attachment-risk-modal attachment-risk-modal--suspicious openmail-security-modal-root"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="link-safety-title attachment-risk-modal-title">
              Potential risk detected
            </h3>
            <p className="link-safety-reason">{attachmentModal.reason}</p>
            <p className="link-safety-url" title={attachmentModal.name}>
              {attachmentModal.name.length > 72
                ? `${attachmentModal.name.slice(0, 70)}…`
                : attachmentModal.name}
            </p>
            <div className="link-safety-actions link-safety-actions--stack">
              <button
                type="button"
                className="link-safety-btn link-safety-btn--secure button magnetic-ui button-liquid"
                onClick={() => {
                  openSecureFileMode(attachmentModal.name, "isolated");
                  setAttachmentModal(null);
                }}
              >
                Open in secure sandbox
              </button>
              <button
                type="button"
                className="link-safety-btn link-safety-btn--secondary button magnetic-ui button-liquid"
                onClick={() => setAttachmentModal(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        </>
      ) : null}

      {attachmentModal?.kind === "blocked" ? (
        <>
          <div
            className="link-safety-backdrop link-safety-backdrop--attachment-risk"
            aria-hidden
            onClick={closeAttachmentBlocked}
          />
          <div
            role="alertdialog"
            aria-modal="true"
            className="link-safety-modal glass-panel glass-depth-2 link-safety-modal--dangerous attachment-risk-modal attachment-risk-modal--dangerous openmail-security-modal-root"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="link-safety-title attachment-risk-modal-title">
              Threat blocked
            </h3>
            <p className="link-safety-reason">
              This content has been prevented from executing.
            </p>
            <p className="link-safety-url" title={attachmentModal.name}>
              {attachmentModal.name.length > 72
                ? `${attachmentModal.name.slice(0, 70)}…`
                : attachmentModal.name}
            </p>
            <div className="link-safety-actions link-safety-actions--stack">
              <button
                type="button"
                className="link-safety-btn link-safety-btn--primary button magnetic-ui button-liquid"
                onClick={closeAttachmentBlocked}
              >
                OK
              </button>
              <button
                type="button"
                className="link-safety-btn link-safety-btn--secondary button magnetic-ui button-liquid text-[10px]"
                onClick={overrideBlockedAttachmentSandbox}
              >
                Override in sandbox (advanced)
              </button>
            </div>
          </div>
        </>
      ) : null}
    </OpenmailSecurityContext.Provider>
  );
}
