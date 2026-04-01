"use client";

import type { ReactNode } from "react";
import type { SandboxMode } from "@/lib/sandboxModes";

const SANDBOX_SUBLINE: Record<SandboxMode, string> = {
  normal: "Standard sandbox • Low-risk review • No automatic navigation",
  isolated: "Isolated mode • Elevated monitoring • AI-enforced boundaries",
  restricted: "Restricted override • Admin-visible session • Execution blocked",
};

const SANDBOX_STATUS: Record<SandboxMode, string> = {
  normal: "Sandbox: normal",
  isolated: "Sandbox: isolated",
  restricted: "Sandbox: restricted",
};

export function SecureEnvironmentShell({
  children,
  className,
  sandboxMode,
}: {
  children: ReactNode;
  className?: string;
  /** When set, adjusts chrome copy and styling tier for link/file sandboxes. */
  sandboxMode?: SandboxMode;
}) {
  const mode = sandboxMode ?? "normal";
  return (
    <div
      className={[
        "secure-environment",
        `secure-environment--sandbox-${mode}`,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="secure-environment-bg" aria-hidden />
      <div className="secure-environment-pattern" aria-hidden />
      <div className="secure-environment-center">
        <header className="secure-environment-header">
          <div className="secure-environment-brand">
            <div className="secure-environment-label">
              <span className="secure-environment-label-live" aria-hidden />
              <span className="secure-environment-label-text">
                AI Secure Environment
              </span>
            </div>
            <p className="secure-environment-subline">{SANDBOX_SUBLINE[mode]}</p>
          </div>
          <div className="secure-environment-status" role="status">
            <span className="secure-environment-status-dot" aria-hidden />
            {SANDBOX_STATUS[mode]}
          </div>
        </header>
        {children}
      </div>
    </div>
  );
}
