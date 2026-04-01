"use client";

import { Suspense, useCallback, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { SecureEnvironmentShell } from "../../../components/SecureEnvironmentShell";
import { parseSandboxMode, type SandboxMode } from "@/lib/sandboxModes";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function openSimulatedPreview(fileName: string): void {
  const w = globalThis.open("", "_blank", "noopener,noreferrer");
  if (!w) return;
  w.document.title = fileName;
  w.document.body.innerHTML = `<pre style="font-family:system-ui,sans-serif;padding:24px;line-height:1.5;background:#0a1418;color:#ccfbf1;margin:0;border:0">AI Secure Environment — preview:\n\n<strong>${escapeHtml(
    fileName
  )}</strong>\n\nIn a desktop client, this would open in a sandboxed viewer.</pre>`;
}

function fileHeading(mode: SandboxMode): string {
  if (mode === "normal") return "Attachment preview (standard)";
  if (mode === "isolated") return "Attachment preview (isolated)";
  return "Attachment preview (restricted override)";
}

function fileLead(mode: SandboxMode): string {
  if (mode === "normal") {
    return "Standard sandbox: simulated preview only. No execution path from the inbox.";
  }
  if (mode === "isolated") {
    return "Isolated sandbox: macros and scripts stay inert. One explicit preview action.";
  }
  return "Restricted override: session is logged. Preview is simulated — malware cannot run here.";
}

function SafeFileContent() {
  const searchParams = useSearchParams();
  const raw = searchParams.get("name") ?? "";
  const mode = parseSandboxMode(searchParams.get("mode"));

  const fileName = useMemo(() => {
    const t = raw.trim();
    if (!t) return "";
    try {
      return decodeURIComponent(t);
    } catch {
      return t;
    }
  }, [raw]);

  const [actionPulse, setActionPulse] = useState(false);
  const [previewBtnAck, setPreviewBtnAck] = useState(false);
  const [restrictedAck, setRestrictedAck] = useState(() => mode !== "restricted");

  const triggerPreview = useCallback((name: string) => {
    setPreviewBtnAck(true);
    setActionPulse(true);
    window.setTimeout(() => {
      setPreviewBtnAck(false);
      setActionPulse(false);
    }, 420);
    openSimulatedPreview(name);
  }, []);

  return (
    <SecureEnvironmentShell
      sandboxMode={mode}
      className={actionPulse ? "secure-environment--action-pulse" : undefined}
    >
      <div className="safe-link-gateway">
        <div
          className={`safe-link-gateway-inner secure-environment-card secure-environment-card--${mode}`}
        >
          <p className="safe-sandbox-banner safe-sandbox-banner--mode" role="status">
            {mode === "normal"
              ? "Mode: normal (safe)"
              : mode === "isolated"
                ? "Mode: isolated (suspicious)"
                : "Mode: restricted (blocked override)"}
          </p>
          <h2 className="secure-environment-heading">{fileHeading(mode)}</h2>
          <p className="secure-environment-copy">{fileLead(mode)}</p>
          {fileName ? (
            <>
              <p
                className="link-safety-url safe-link-target secure-file-name"
                title={fileName}
              >
                {fileName.length > 120 ? `${fileName.slice(0, 118)}…` : fileName}
              </p>
              <p className="secure-file-scan-status" role="status">
                {mode === "restricted"
                  ? "Override active • Execution path disabled"
                  : mode === "isolated"
                    ? "Isolated scan • Scripting neutralized"
                    : "Scanned • No active threat detected (demo profile)"}
              </p>
              {mode === "restricted" && !restrictedAck ? (
                <div className="safe-file-restricted-gate">
                  <p className="secure-environment-copy text-[11px] text-red-200/90">
                    You are opening a blocked file under an advanced override. This session may be
                    reviewed by administrators.
                  </p>
                  <button
                    type="button"
                    className="secure-env-btn safe-link-open-anyway-btn"
                    onClick={() => setRestrictedAck(true)}
                  >
                    I understand — show preview
                  </button>
                </div>
              ) : (
                <div className="safe-link-gateway-actions">
                  <button
                    type="button"
                    className={`secure-env-btn${
                      previewBtnAck ? " secure-env-btn--acknowledge" : ""
                    }`}
                    onClick={() => triggerPreview(fileName)}
                  >
                    Open preview
                  </button>
                </div>
              )}
            </>
          ) : (
            <p className="safe-link-invalid">No file specified.</p>
          )}
        </div>
      </div>
    </SecureEnvironmentShell>
  );
}

export default function SafeFilePage() {
  return (
    <Suspense
      fallback={
        <SecureEnvironmentShell sandboxMode="normal">
          <div className="safe-link-gateway">
            <div className="safe-link-gateway-inner secure-environment-card">
              <p className="safe-link-loading">Loading…</p>
            </div>
          </div>
        </SecureEnvironmentShell>
      }
    >
      <SafeFileContent />
    </Suspense>
  );
}
