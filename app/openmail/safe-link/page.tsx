"use client";

import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { SecureEnvironmentShell } from "../../../components/SecureEnvironmentShell";
import { SecureViewer } from "../components/security/SecureViewer";
import { classifyDemoLinkUrl } from "@/lib/demoLinkHeuristics";
import { parseSandboxMode } from "@/lib/sandboxModes";

function SafeLinkContent() {
  const searchParams = useSearchParams();
  const raw = searchParams.get("url") ?? "";
  const mode = parseSandboxMode(searchParams.get("mode"));
  const [phase, setPhase] = useState<"review" | "escalated" | "opened">("review");

  const target = useMemo(() => {
    if (!raw.trim()) return null;
    try {
      const u = new URL(raw);
      if (u.protocol !== "http:" && u.protocol !== "https:") return null;
      return u.href;
    } catch {
      try {
        const u = new URL(decodeURIComponent(raw));
        if (u.protocol !== "http:" && u.protocol !== "https:") return null;
        return u.href;
      } catch {
        return null;
      }
    }
  }, [raw]);

  const tier = target ? classifyDemoLinkUrl(target) : null;

  function handleOpenPreview() {
    if (!target) return;
    if (mode === "restricted") return;
    if (tier === "safe") {
      globalThis.open(target, "_blank", "noopener,noreferrer");
      setPhase("opened");
      return;
    }
    setPhase("escalated");
  }

  const sessionSubline =
    mode === "isolated"
      ? "Isolated session active"
      : mode === "restricted"
        ? "Restricted session — navigation disabled"
        : "Secure session active";

  if (phase === "review" && target) {
    return (
      <SecureViewer
        sandboxMode={mode}
        sessionSubline={sessionSubline}
        targetLabel={target}
        onOpenPreview={handleOpenPreview}
        previewDisabled={mode === "restricted"}
        previewDisabledNote={
          mode === "restricted"
            ? "Blocked links cannot be opened from this environment."
            : undefined
        }
      />
    );
  }

  return (
    <SecureEnvironmentShell sandboxMode={mode} showDefaultHeader={false}>
      <div className="safe-link-gateway w-full">
        <div
          className={`secure-viewer-card secure-environment-card secure-environment-card--${mode}`}
        >
          {phase === "opened" ? (
            <>
              <p className="secure-viewer-brand">AI SECURE ENVIRONMENT</p>
              <p className="secure-viewer-session">Session complete</p>
              <p className="mt-3 text-sm leading-relaxed text-white/70">
                Destination opened in a new tab. Close it if you did not intend to continue.
              </p>
            </>
          ) : phase === "escalated" ? (
            <>
              <p className="secure-viewer-brand">AI SECURE ENVIRONMENT</p>
              <p className="secure-viewer-session">Link held after analysis</p>
              <p className="mt-3 text-sm leading-relaxed text-amber-100/80">
                This tier does not allow direct navigation. The destination was not loaded.
              </p>
              {target ? (
                <p className="secure-viewer-target" title={target}>
                  {target.length > 140 ? `${target.slice(0, 138)}…` : target}
                </p>
              ) : null}
            </>
          ) : (
            <>
              <p className="secure-viewer-brand">AI SECURE ENVIRONMENT</p>
              <p className="secure-viewer-session">{sessionSubline}</p>
              <p className="safe-link-invalid mt-3">This link could not be opened here.</p>
            </>
          )}
        </div>
      </div>
    </SecureEnvironmentShell>
  );
}

export default function SafeLinkPage() {
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
      <SafeLinkContent />
    </Suspense>
  );
}
