"use client";

import { useEffect, useState } from "react";
import type { GuardianEvaluateResult } from "@/lib/guardianEngine";
import { guardianShortReason } from "@/lib/guardianInterceptCopy";
import { guardianActionLabel } from "@/lib/guardianTrace";

export type GuardianInterceptKind =
  | "click_link"
  | "open_attachment"
  | "send_email";

/** Visual risk tier: drives color (red / orange / green). */
export type GuardianInterceptTier = "block" | "warn" | "safe";

const TIER_STYLES: Record<
  GuardianInterceptTier,
  {
    accent: string;
    bar: string;
    ring: string;
    glow: string;
    badgeBg: string;
    badgeText: string;
    iconColor: string;
  }
> = {
  block: {
    accent: "text-red-200",
    bar: "bg-red-500",
    ring: "ring-red-500/50",
    glow: "[box-shadow:0_0_0_1px_rgba(248,113,113,0.35),0_0_64px_rgba(239,68,68,0.22),0_24px_80px_rgba(0,0,0,0.55)]",
    badgeBg: "bg-red-500/20",
    badgeText: "text-red-100",
    iconColor: "text-red-400",
  },
  warn: {
    accent: "text-amber-100",
    bar: "bg-amber-500",
    ring: "ring-amber-400/45",
    glow: "[box-shadow:0_0_0_1px_rgba(251,191,36,0.35),0_0_56px_rgba(245,158,11,0.2),0_24px_80px_rgba(0,0,0,0.55)]",
    badgeBg: "bg-amber-500/20",
    badgeText: "text-amber-50",
    iconColor: "text-amber-400",
  },
  safe: {
    accent: "text-emerald-100",
    bar: "bg-emerald-500",
    ring: "ring-emerald-400/40",
    glow: "[box-shadow:0_0_0_1px_rgba(52,211,153,0.35),0_0_56px_rgba(16,185,129,0.18),0_24px_80px_rgba(0,0,0,0.55)]",
    badgeBg: "bg-emerald-500/20",
    badgeText: "text-emerald-50",
    iconColor: "text-emerald-400",
  },
};

const BTN_SANDBOX =
  "rounded-xl border border-cyan-400/40 bg-cyan-500/20 px-4 py-3 text-sm font-semibold text-cyan-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] transition-colors hover:bg-cyan-500/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400/50";

const BTN_CANCEL =
  "rounded-xl border border-white/[0.12] bg-white/[0.06] px-4 py-3 text-sm font-semibold text-white/80 transition-colors hover:border-white/[0.18] hover:bg-white/[0.1] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/25";

const BTN_PROCEED =
  "rounded-xl border border-white/15 bg-white/[0.12] px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/[0.18] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/30";

function tierTitle(tier: GuardianInterceptTier): string {
  if (tier === "block") return "Blocked";
  if (tier === "warn") return "Warning";
  return "Looks safe";
}

function proceedLabel(): string {
  return "Proceed";
}

function proceedSublabel(kind: GuardianInterceptKind): string {
  if (kind === "send_email") return "Acknowledge and send";
  if (kind === "click_link") return "Open in browser (less protection)";
  return "Standard open (less isolated)";
}

export type GuardianInterceptModalProps = {
  open: boolean;
  kind: GuardianInterceptKind;
  /** Drives red / orange / green treatment. */
  tier: GuardianInterceptTier;
  result: GuardianEvaluateResult;
  detail: string;
  showSandbox: boolean;
  showProceed: boolean;
  onDismissBlock: () => void;
  onSandbox: () => void;
  onProceed: () => void;
  onCancel: () => void;
  /** Block tier: user explains why to proceed — logs server-side via provider. */
  onOverrideProceed?: (reason: string) => void;
};

const BTN_OVERRIDE =
  "rounded-xl border border-amber-500/40 bg-amber-500/15 px-4 py-3 text-sm font-semibold text-amber-50 transition-colors hover:bg-amber-500/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400/45";

export function GuardianInterceptModal({
  open,
  kind,
  tier,
  result,
  detail,
  showSandbox,
  showProceed,
  onDismissBlock,
  onSandbox,
  onProceed,
  onCancel,
  onOverrideProceed,
}: GuardianInterceptModalProps) {
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");

  useEffect(() => {
    if (!open) return;
    setOverrideOpen(false);
    setOverrideReason("");
  }, [open, kind, tier, detail]);

  if (!open) return null;

  const skin = TIER_STYLES[tier];
  const actionLabel = guardianActionLabel(result.action);
  const short = guardianShortReason(result.reason);
  const isBlock = tier === "block";
  const canOverride = isBlock && typeof onOverrideProceed === "function";

  if (overrideOpen && canOverride) {
    return (
      <div className="fixed inset-0 z-[105] flex items-center justify-center p-4">
        <button
          type="button"
          className="absolute inset-0 cursor-default border-0 bg-black/80 backdrop-blur-[10px]"
          aria-label="Back"
          onClick={() => setOverrideOpen(false)}
        />
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="guardian-override-title"
          className="relative z-[106] w-full max-w-[420px] overflow-hidden rounded-2xl bg-[#0a0b0f]/95 ring-2 ring-amber-400/35 backdrop-blur-xl [box-shadow:0_0_0_1px_rgba(251,191,36,0.25),0_24px_80px_rgba(0,0,0,0.55)]"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="h-1.5 w-full bg-amber-500" aria-hidden />
          <div className="px-6 pb-6 pt-5">
            <h2
              id="guardian-override-title"
              className="text-center text-base font-semibold tracking-tight text-amber-100"
            >
              Request override
            </h2>
            <p className="mt-4 text-center text-[13px] leading-relaxed text-white/80">
              This action is considered unsafe. Explain why you want to proceed.
            </p>
            <textarea
              value={overrideReason}
              onChange={(e) => setOverrideReason(e.target.value)}
              rows={4}
              className="mt-4 w-full resize-y rounded-xl border border-white/[0.12] bg-black/30 px-3 py-2.5 text-[13px] leading-relaxed text-white/90 outline-none placeholder:text-white/35 focus:border-amber-500/40"
              placeholder="Your reason…"
            />
            <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button type="button" className={BTN_CANCEL} onClick={() => setOverrideOpen(false)}>
                Back
              </button>
              <button
                type="button"
                className={BTN_PROCEED}
                disabled={!overrideReason.trim()}
                onClick={() => onOverrideProceed(overrideReason.trim())}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[105] flex items-center justify-center p-4">
      {/* Full-screen dim */}
      <button
        type="button"
        className="absolute inset-0 cursor-default border-0 bg-black/80 backdrop-blur-[10px]"
        aria-label="Dismiss overlay"
        onClick={isBlock ? onDismissBlock : onCancel}
      />

      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="guardian-intercept-title"
        aria-describedby="guardian-intercept-desc"
        className={`relative z-[106] w-full max-w-[420px] overflow-hidden rounded-2xl bg-[#0a0b0f]/95 ring-2 backdrop-blur-xl ${skin.ring} ${skin.glow}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`h-1.5 w-full ${skin.bar}`} aria-hidden />

        <div className="px-6 pb-6 pt-5">
          <div className="flex flex-col items-center">
            <div
              className={`flex h-14 w-14 items-center justify-center rounded-2xl ${skin.badgeBg} ring-1 ring-white/10`}
            >
              <svg
                className={`h-9 w-9 ${skin.iconColor}`}
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden
              >
                <path
                  d="M12 2.5l7 3.2v5.6c0 4.5-2.9 8.7-7 9.7-4.1-1-7-5.2-7-9.7V5.7l7-3.2z"
                  fill="rgba(255,255,255,0.06)"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <p className="mt-3 text-[10px] font-bold uppercase tracking-[0.22em] text-white/50">
              Guardian
            </p>
            <h2
              id="guardian-intercept-title"
              className={`mt-1 text-center text-xl font-bold tracking-tight ${skin.accent}`}
            >
              {tierTitle(tier)}
            </h2>
            <p className="mt-1 text-center text-[11px] font-medium text-white/45">
              {actionLabel}
            </p>
          </div>

          <p
            id="guardian-intercept-desc"
            className="mt-5 text-center text-[15px] font-medium leading-snug text-white/90"
          >
            {short}
          </p>

          <p
            className="mt-3 break-all text-center font-mono text-[10px] leading-relaxed text-white/35"
            title={detail}
          >
            {detail.length > 88 ? `${detail.slice(0, 86)}…` : detail}
          </p>

          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-center">
            {isBlock ? (
              <>
                <button type="button" className={`${BTN_CANCEL} w-full sm:min-w-[140px]`} onClick={onDismissBlock}>
                  Cancel
                </button>
                {canOverride ? (
                  <button
                    type="button"
                    className={`${BTN_OVERRIDE} w-full sm:min-w-[160px]`}
                    onClick={() => setOverrideOpen(true)}
                  >
                    Request override
                  </button>
                ) : null}
              </>
            ) : (
              <>
                {showSandbox ? (
                  <button
                    type="button"
                    className={`${BTN_SANDBOX} w-full sm:w-auto sm:min-w-[120px]`}
                    onClick={onSandbox}
                  >
                    Sandbox
                  </button>
                ) : null}
                <button
                  type="button"
                  className={`${BTN_CANCEL} w-full sm:w-auto sm:min-w-[120px]`}
                  onClick={onCancel}
                >
                  Cancel
                </button>
                {showProceed ? (
                  <button
                    type="button"
                    className={`${BTN_PROCEED} flex w-full flex-col items-center gap-0.5 py-2.5 sm:w-auto sm:min-w-[120px]`}
                    onClick={onProceed}
                  >
                    <span>{proceedLabel()}</span>
                    <span className="text-[10px] font-normal text-white/50">
                      {proceedSublabel(kind)}
                    </span>
                  </button>
                ) : null}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
