"use client";

import type { SecurityRiskLevel } from "./types";

const PANEL: Record<
  SecurityRiskLevel,
  { border: string; glow: string; backdropTint: string }
> = {
  safe: {
    border: "border-emerald-500/25",
    glow: "[box-shadow:0_0_48px_rgba(52,211,153,0.14),0_0_80px_rgba(52,211,153,0.06),inset_0_1px_0_rgba(255,255,255,0.06)]",
    backdropTint: "bg-emerald-950/20",
  },
  suspicious: {
    border: "border-amber-500/30",
    glow: "[box-shadow:0_0_52px_rgba(251,191,36,0.22),0_0_90px_rgba(245,158,11,0.08),inset_0_1px_0_rgba(255,255,255,0.06)]",
    backdropTint: "bg-amber-950/25",
  },
  dangerous: {
    border: "border-red-500/40",
    glow: "[box-shadow:0_0_56px_rgba(248,113,113,0.38),0_0_100px_rgba(239,68,68,0.12),inset_0_1px_0_rgba(255,255,255,0.05)]",
    backdropTint: "bg-red-950/30",
  },
};

const BTN_PRIMARY =
  "rounded-xl border border-white/10 bg-white/[0.08] px-4 py-2.5 text-sm font-medium text-white/95 transition-colors duration-200 hover:bg-white/[0.12] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/25";

const BTN_SECURE =
  "rounded-xl border border-cyan-400/35 bg-cyan-500/15 px-4 py-2.5 text-sm font-medium text-cyan-50 transition-colors duration-200 hover:bg-cyan-500/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400/40";

const BTN_SECONDARY =
  "rounded-xl border border-white/[0.08] bg-transparent px-4 py-2.5 text-sm font-medium text-white/55 transition-colors duration-200 hover:border-white/[0.12] hover:bg-white/[0.04] hover:text-white/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/20";

export type SecurityModalProps =
  | {
      open: true;
      variant: "risk";
      severity: SecurityRiskLevel;
      title: string;
      reason?: string;
      detail: string;
      role?: "dialog" | "alertdialog";
      primaryAction?: { label: string; onClick: () => void } | null;
      secondaryAction?: { label: string; onClick: () => void } | null;
      onBackdropClick?: () => void;
    }
  | {
      open: true;
      variant: "scanning";
      fileName: string;
    }
  | { open: false };

export function SecurityModal(props: SecurityModalProps) {
  if (!props.open) return null;

  if (props.variant === "scanning") {
    return (
      <>
        <div
          className="fixed inset-0 z-[100] backdrop-blur-md bg-black/45"
          aria-hidden
        />
        <div
          role="status"
          aria-live="polite"
          aria-busy="true"
          className="fixed left-1/2 top-1/2 z-[101] w-[min(92vw,400px)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-white/[0.08] bg-[rgba(12,18,22,0.88)] p-6 [box-shadow:0_0_40px_rgba(99,102,241,0.12),inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-xl"
          onClick={(e) => e.stopPropagation()}
        >
          <p className="text-center text-sm font-medium tracking-wide text-white/90">
            AI scanning…
          </p>
          <p
            className="mt-2 truncate text-center text-xs text-white/50"
            title={props.fileName}
          >
            {props.fileName.length > 52
              ? `${props.fileName.slice(0, 50)}…`
              : props.fileName}
          </p>
          <div
            className="mt-5 h-1 overflow-hidden rounded-full bg-white/[0.06]"
            aria-hidden
          >
            <div className="security-modal-scan-bar h-full w-1/3 rounded-full bg-cyan-400/50" />
          </div>
        </div>
      </>
    );
  }

  const { severity, title, reason, detail, role, primaryAction, secondaryAction, onBackdropClick } =
    props;
  const skin = PANEL[severity];

  return (
    <>
      <div
        className={`fixed inset-0 z-[100] backdrop-blur-md ${skin.backdropTint} bg-black/40 ${onBackdropClick ? "cursor-pointer" : ""}`}
        aria-hidden
        onClick={onBackdropClick}
      />
      <div
        role={role ?? "dialog"}
        aria-modal="true"
        className={`fixed left-1/2 top-1/2 z-[101] w-[min(92vw,420px)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border bg-[rgba(10,12,14,0.92)] p-6 backdrop-blur-xl ${skin.border} ${skin.glow}`}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-center text-base font-semibold tracking-tight text-white/95">
          {title}
        </h2>
        {reason ? (
          <p className="mt-3 text-center text-[13px] leading-relaxed text-white/70">
            {reason}
          </p>
        ) : null}
        <p
          className="mt-4 break-all text-center font-mono text-[11px] leading-snug text-white/45"
          title={detail}
        >
          {detail.length > 96 ? `${detail.slice(0, 94)}…` : detail}
        </p>
        <div className="mt-6 flex flex-col gap-2">
          {primaryAction ? (
            <button
              type="button"
              className={severity === "dangerous" ? BTN_PRIMARY : BTN_SECURE}
              onClick={primaryAction.onClick}
            >
              {primaryAction.label}
            </button>
          ) : null}
          {secondaryAction ? (
            <button
              type="button"
              className={BTN_SECONDARY}
              onClick={secondaryAction.onClick}
            >
              {secondaryAction.label}
            </button>
          ) : null}
        </div>
      </div>
    </>
  );
}
