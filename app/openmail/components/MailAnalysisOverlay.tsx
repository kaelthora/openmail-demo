"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

const STEP_MS = 300;
const PAUSE_AFTER_STEPS_MS = 200;
const FADE_OUT_MS = 300;
const HIGH_RISK_FLASH_MS = 160;

const STEPS = [
  "Checking sender",
  "Verifying domain integrity",
  "Detecting intent",
  "Evaluating risk",
] as const;

export type MailAnalysisOverlayProps = {
  /** When true, overlay uses a stronger red pulse before release (high-risk mail). */
  highRisk?: boolean;
  /** Called after the exit fade completes — parent should set `isAnalyzing` false. */
  onComplete: () => void;
};

/**
 * Mandatory visual “AI security scan” gate before the reading pane is usable.
 * Timing only; does not call backend or change AI data.
 */
export function MailAnalysisOverlay({ highRisk = false, onComplete }: MailAnalysisOverlayProps) {
  const [shownSteps, setShownSteps] = useState(1);
  const [riskFlash, setRiskFlash] = useState(false);
  const [exiting, setExiting] = useState(false);
  const onCompleteRef = useRef(onComplete);
  useLayoutEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    let cancelled = false;
    const run = (fn: () => void) => {
      if (!cancelled) fn();
    };

    const media =
      typeof window !== "undefined"
        ? window.matchMedia("(prefers-reduced-motion: reduce)")
        : null;
    const reduced = media?.matches === true;

    const ids: ReturnType<typeof setTimeout>[] = [];
    const schedule = (fn: () => void, ms: number) => {
      const id: ReturnType<typeof setTimeout> = setTimeout(() => run(fn), ms);
      ids.push(id);
      return id;
    };

    if (reduced) {
      setShownSteps(STEPS.length);
      schedule(() => setExiting(true), 280);
      schedule(() => onCompleteRef.current(), 280 + FADE_OUT_MS);
      return () => {
        cancelled = true;
        ids.forEach(clearTimeout);
      };
    }

    for (let i = 1; i < STEPS.length; i++) {
      schedule(() => setShownSteps(i + 1), STEP_MS * i);
    }

    const exitAt = STEP_MS * (STEPS.length - 1) + PAUSE_AFTER_STEPS_MS;

    if (highRisk) {
      const flashAt = STEP_MS * (STEPS.length - 1) + 40;
      schedule(() => setRiskFlash(true), flashAt);
      schedule(() => setRiskFlash(false), flashAt + HIGH_RISK_FLASH_MS);
    }

    schedule(() => setExiting(true), exitAt);
    schedule(() => onCompleteRef.current(), exitAt + FADE_OUT_MS);

    return () => {
      cancelled = true;
      ids.forEach(clearTimeout);
    };
  }, [highRisk]);

  return (
    <div
      className={`pointer-events-auto absolute inset-0 z-[30] flex flex-col items-center justify-center overflow-hidden rounded-2xl transition-[opacity,transform] duration-300 ease-in-out motion-reduce:transition-none ${
        exiting ? "opacity-0 [transform:scale(0.985)]" : "opacity-100 [transform:scale(1)]"
      }`}
      role="status"
      aria-live="polite"
      aria-busy={!exiting}
    >
      {/* Backdrop: dark glass + blur + security glow */}
      <div
        className={`absolute inset-0 rounded-2xl bg-[rgba(6,6,8,0.92)] backdrop-blur-md [-webkit-backdrop-filter:blur(14px)] transition-[box-shadow] duration-200 ease-out ${
          riskFlash
            ? "shadow-[inset_0_0_0_1px_rgba(248,113,113,0.55),0_0_48px_rgba(239,68,68,0.45),0_0_80px_rgba(249,115,22,0.2)]"
            : "shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06),0_0_36px_rgba(249,115,22,0.12),0_0_64px_rgba(239,68,68,0.08)]"
        }`}
        aria-hidden
      />
      <div className="relative z-[1] flex max-w-[min(22rem,90vw)] flex-col items-center px-6 py-8 text-center">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[color:var(--text-soft)]">
          Security
        </p>
        <h2 className="mt-2 text-balance text-base font-semibold leading-snug text-[var(--text-main)] sm:text-lg">
          OpenMail is analyzing this message
        </h2>
        <ul className="mt-6 w-full space-y-3 text-left text-[13px] leading-snug text-[color:var(--text-soft)]">
          {STEPS.map((label, i) => {
            const visible = i < shownSteps;
            return (
              <li
                key={label}
                className={`flex items-start gap-2.5 transition-[opacity,transform] duration-300 ease-out motion-reduce:transition-none ${
                  visible
                    ? "translate-x-0 opacity-100"
                    : "pointer-events-none -translate-x-1 opacity-0"
                }`}
              >
                <span
                  className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                    visible
                      ? i === shownSteps - 1
                        ? "animate-pulse bg-orange-400 shadow-[0_0_10px_rgba(251,146,60,0.9)]"
                        : "bg-emerald-400/80"
                      : "bg-white/10"
                  }`}
                  aria-hidden
                />
                <span className="min-w-0 flex-1 text-[var(--text-main)]">
                  <span className="text-[color:var(--text-soft)]">→ </span>
                  {label}
                  {visible && i === shownSteps - 1 ? (
                    <span
                      className="ml-1.5 inline-block h-3 w-10 translate-y-0.5 rounded-sm bg-gradient-to-r from-white/5 via-white/20 to-white/5 opacity-80 animate-pulse motion-reduce:animate-none"
                      aria-hidden
                    />
                  ) : null}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
