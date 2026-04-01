"use client";

import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { SecureEnvironmentShell } from "../../../components/SecureEnvironmentShell";
import { classifyDemoLinkUrl } from "@/lib/demoLinkHeuristics";
import { parseSandboxMode, type SandboxMode } from "@/lib/sandboxModes";

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

  function handleOpenAnyway() {
    if (!target) return;
    if (mode === "restricted") {
      setPhase("escalated");
      return;
    }
    if (tier === "safe") {
      globalThis.open(target, "_blank", "noopener,noreferrer");
      setPhase("opened");
      return;
    }
    setPhase("escalated");
  }

  const heading = sandboxHeading(mode);
  const lead = sandboxLead(mode);

  return (
    <SecureEnvironmentShell sandboxMode={mode}>
      <div className="safe-link-gateway">
        <div
          className={`safe-link-gateway-inner secure-environment-card secure-environment-card--${mode}`}
        >
          {phase === "opened" ? (
            <>
              <h2 className="secure-environment-heading">Opened in new tab</h2>
              <p className="secure-environment-copy">
                This address passed in-sandbox checks as safe for the demo. Close that tab if you
                did not intend to continue.
              </p>
            </>
          ) : phase === "escalated" ? (
            <>
              <h2 className="secure-environment-heading safe-link-escalation-title">
                Link blocked after analysis
              </h2>
              <p className="secure-environment-copy safe-link-escalation-copy">
                SOC advised / Admin notified. The destination was not loaded.
              </p>
              {target ? (
                <p className="link-safety-url safe-link-target" title={target}>
                  {target.length > 120 ? `${target.slice(0, 118)}…` : target}
                </p>
              ) : null}
            </>
          ) : (
            <>
              <h2 className="secure-environment-heading">{heading}</h2>
              <p className="secure-environment-copy">{lead}</p>
              {target ? (
                <>
                  <p className="link-safety-url safe-link-target" title={target}>
                    {target.length > 120 ? `${target.slice(0, 118)}…` : target}
                  </p>
                  <p className="safe-link-no-nav-note" role="status">
                    {mode === "restricted"
                      ? "External navigation is disabled. Override does not imply safety."
                      : "No automatic navigation. Optional explicit action below."}
                  </p>
                  {mode !== "restricted" ? (
                    <div className="safe-link-gateway-actions">
                      <button
                        type="button"
                        className="secure-env-btn safe-link-open-anyway-btn"
                        onClick={handleOpenAnyway}
                      >
                        Open anyway
                      </button>
                    </div>
                  ) : null}
                </>
              ) : (
                <p className="safe-link-invalid">This link could not be opened here.</p>
              )}
            </>
          )}
        </div>
      </div>
    </SecureEnvironmentShell>
  );
}

function sandboxHeading(mode: SandboxMode): string {
  if (mode === "normal") return "Standard sandbox (safe)";
  if (mode === "isolated") return "Isolated sandbox (suspicious)";
  return "Restricted sandbox (override)";
}

function sandboxLead(mode: SandboxMode): string {
  if (mode === "normal") {
    return "Low-risk review context. The URL is shown only — nothing loads until you choose.";
  }
  if (mode === "isolated") {
    return "Suspicious-tier link: isolated monitoring applies. AI still blocks silent redirects and drive-bys.";
  }
  return "Blocked-tier override: read-only inspection. Execution and outbound fetches remain prevented.";
}

export default function SafeLinkPage() {
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
      <SafeLinkContent />
    </Suspense>
  );
}
