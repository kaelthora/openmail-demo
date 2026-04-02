"use client";

import type { ReactNode } from "react";
import { SecureEnvironmentShell } from "@/components/SecureEnvironmentShell";
import type { SandboxMode } from "@/lib/sandboxModes";

type SecureViewerProps = {
  sandboxMode: SandboxMode;
  /** Shown under the main label (e.g. isolated vs secure session). */
  sessionSubline?: string;
  targetLabel: string;
  onOpenPreview: () => void;
  previewDisabled?: boolean;
  previewDisabledNote?: string;
  className?: string;
  children?: ReactNode;
};

function defaultSessionLine(mode: SandboxMode): string {
  if (mode === "isolated") return "Isolated session active";
  if (mode === "restricted") return "Restricted session — preview disabled";
  return "Secure session active";
}

export function SecureViewer({
  sandboxMode,
  sessionSubline,
  targetLabel,
  onOpenPreview,
  previewDisabled = false,
  previewDisabledNote,
  className,
  children,
}: SecureViewerProps) {
  const sub = sessionSubline ?? defaultSessionLine(sandboxMode);
  return (
    <SecureEnvironmentShell
      sandboxMode={sandboxMode}
      className={className}
      showDefaultHeader={false}
    >
      <div className="safe-link-gateway w-full">
        <div
          className={`secure-viewer-card secure-environment-card secure-environment-card--${sandboxMode}`}
        >
          <p className="secure-viewer-brand">AI SECURE ENVIRONMENT</p>
          <p className="secure-viewer-session">{sub}</p>
          {targetLabel ? (
            <p className="secure-viewer-target" title={targetLabel}>
              {targetLabel.length > 140
                ? `${targetLabel.slice(0, 138)}…`
                : targetLabel}
            </p>
          ) : null}
          <div className="secure-viewer-actions">
            <button
              type="button"
              className="secure-viewer-btn"
              onClick={onOpenPreview}
              disabled={previewDisabled}
            >
              Open preview
            </button>
          </div>
          {previewDisabled && previewDisabledNote ? (
            <p className="secure-viewer-note">{previewDisabledNote}</p>
          ) : null}
          {children}
        </div>
      </div>
    </SecureEnvironmentShell>
  );
}
