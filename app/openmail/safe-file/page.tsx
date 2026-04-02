"use client";

import { Suspense, useCallback, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { SecureEnvironmentShell } from "../../../components/SecureEnvironmentShell";
import { AttachmentSandboxViewer } from "../components/security/AttachmentSandboxViewer";
import { SecureViewer } from "../components/security/SecureViewer";
import { parseSandboxMode } from "@/lib/sandboxModes";

function decodeParam(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  try {
    return decodeURIComponent(t);
  } catch {
    return t;
  }
}

function SafeFileContent() {
  const searchParams = useSearchParams();
  const rawName = searchParams.get("name") ?? "";
  const mode = parseSandboxMode(searchParams.get("mode"));
  const rawType = searchParams.get("type") ?? "";

  const fileName = useMemo(() => decodeParam(rawName), [rawName]);
  const mimeType = useMemo(() => {
    const d = decodeParam(rawType);
    return d || undefined;
  }, [rawType]);

  const [actionPulse, setActionPulse] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  const triggerPreview = useCallback(() => {
    setActionPulse(true);
    window.setTimeout(() => setActionPulse(false), 420);
    setPreviewOpen(true);
  }, []);

  const restricted = mode === "restricted";

  const shellClass = [
    actionPulse ? "secure-environment--action-pulse" : undefined,
    previewOpen ? "secure-file--preview-open" : undefined,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <SecureViewer
      sandboxMode={mode}
      sessionSubline={
        mode === "isolated"
          ? "Isolated session active"
          : restricted
            ? "Restricted session — preview disabled"
            : "Secure session active"
      }
      targetLabel={fileName}
      onOpenPreview={() => {
        if (!fileName || restricted) return;
        triggerPreview();
      }}
      previewDisabled={restricted}
      previewDisabledNote={
        restricted
          ? "Blocked files cannot be previewed. Direct opening from the inbox is never allowed."
          : undefined
      }
      className={shellClass || undefined}
    >
      {previewOpen && fileName ? (
        <AttachmentSandboxViewer
          fileName={fileName}
          mimeType={mimeType}
          onClose={() => setPreviewOpen(false)}
        />
      ) : null}
    </SecureViewer>
  );
}

export default function SafeFilePage() {
  return (
    <Suspense
      fallback={
        <SecureEnvironmentShell sandboxMode="normal" showDefaultHeader={false}>
          <div className="safe-link-gateway w-full">
            <div className="secure-viewer-card">
              <p className="secure-viewer-brand">AI SECURE ENVIRONMENT</p>
              <p className="text-sm text-white/50">Loading…</p>
            </div>
          </div>
        </SecureEnvironmentShell>
      }
    >
      <SafeFileContent />
    </Suspense>
  );
}
