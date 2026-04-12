"use client";

import { useEffect, useRef } from "react";
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
    border: "border-orange-500/70",
    glow: "[box-shadow:0_0_48px_rgba(249,115,22,0.42),0_0_88px_rgba(234,88,12,0.18),inset_0_1px_0_rgba(255,255,255,0.07)]",
    backdropTint: "bg-orange-950/30",
  },
  trusted_flagged: {
    border: "border-amber-500/35",
    glow: "[box-shadow:0_0_48px_rgba(245,158,11,0.2),0_0_80px_rgba(180,83,9,0.08),inset_0_1px_0_rgba(255,255,255,0.06)]",
    backdropTint: "bg-amber-950/25",
  },
  dangerous: {
    border: "border-red-500/70",
    glow: "[box-shadow:0_0_56px_rgba(248,113,113,0.42),0_0_100px_rgba(239,68,68,0.14),inset_0_1px_0_rgba(255,255,255,0.06)]",
    backdropTint: "bg-red-950/30",
  },
};

const BTN_PRIMARY =
  "rounded-xl border border-white/10 bg-white/[0.08] px-4 py-2.5 text-sm font-medium text-white/95 transition-colors duration-200 hover:bg-white/[0.12] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/25";

const BTN_SECURE =
  "rounded-xl border border-cyan-400/35 bg-cyan-500/15 px-4 py-2.5 text-sm font-medium text-cyan-50 transition-colors duration-200 hover:bg-cyan-500/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400/40";

const BTN_SECONDARY =
  "rounded-xl border border-white/[0.08] bg-transparent px-4 py-2.5 text-sm font-medium text-white/55 transition-colors duration-200 hover:border-white/[0.12] hover:bg-white/[0.04] hover:text-white/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/20";

/** Primary for mail open gate — high risk (destructive proceed). */
const BTN_MAIL_GATE_HIGH_PRIMARY =
  "rounded-xl border border-red-400/55 bg-gradient-to-b from-red-600 to-red-700 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_0_28px_rgba(239,68,68,0.42)] transition-[filter,box-shadow] duration-150 hover:from-red-500 hover:to-red-600 hover:shadow-[0_0_36px_rgba(239,68,68,0.5)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-400/55";

/** Primary for mail open gate — medium risk. */
const BTN_MAIL_GATE_MEDIUM_PRIMARY =
  "rounded-xl border border-orange-400/50 bg-gradient-to-b from-orange-600 to-orange-700 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_0_26px_rgba(249,115,22,0.38)] transition-[filter,box-shadow] duration-150 hover:from-orange-500 hover:to-orange-600 hover:shadow-[0_0_34px_rgba(249,115,22,0.48)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-400/50";

const RISK_OVERLAY = "bg-black/60 backdrop-blur-sm";

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
      variant: "mailRiskGate";
      /** High = stop wall; medium = warning. */
      tier: "high" | "medium";
      onConfirm: () => void;
      onCancel: () => void;
    }
  | {
      open: true;
      variant: "scanning";
      fileName: string;
    }
  | { open: false };

function MailRiskGateModal({
  tier,
  onConfirm,
  onCancel,
}: {
  tier: "high" | "medium";
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const isHigh = tier === "high";

  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const panelSkin = isHigh
    ? "border-2 border-red-500 [box-shadow:0_0_56px_rgba(248,113,113,0.45),0_0_100px_rgba(239,68,68,0.15),inset_0_1px_0_rgba(255,255,255,0.06)]"
    : "border-2 border-orange-500 [box-shadow:0_0_48px_rgba(249,115,22,0.42),0_0_88px_rgba(234,88,12,0.2),inset_0_1px_0_rgba(255,255,255,0.07)]";

  return (
    <>
      <div
        className={`fixed inset-0 z-[100] ${RISK_OVERLAY}`}
        aria-hidden
        onClick={onCancel}
      />
      <div
        className="fixed inset-0 z-[101] flex items-center justify-center p-4 pointer-events-none"
      >
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="openmail-mail-risk-title"
          className={`openmail-risk-modal-panel pointer-events-auto w-[min(92vw,440px)] rounded-2xl border bg-[rgba(10,12,14,0.96)] p-6 backdrop-blur-xl ${panelSkin}`}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mb-3 flex flex-col items-center gap-2 text-center">
            <span
              className={`text-2xl leading-none ${isHigh ? "drop-shadow-[0_0_12px_rgba(239,68,68,0.55)]" : "drop-shadow-[0_0_12px_rgba(249,115,22,0.45)]"}`}
              aria-hidden
            >
              ⚠️
            </span>
            <h2
              id="openmail-mail-risk-title"
              className="text-base font-semibold tracking-tight text-white/95"
            >
              {isHigh ? "High risk detected" : "Elevated risk"}
            </h2>
          </div>
          {isHigh ? (
            <div className="space-y-3 text-center text-[13px] leading-relaxed text-white/80">
              <p>This message is considered dangerous.</p>
              <p>It may involve fraud, impersonation, or data theft.</p>
              <p className="text-white/90">Opening it is not recommended.</p>
            </div>
          ) : (
            <div className="space-y-3 text-center text-[13px] leading-relaxed text-white/80">
              <p>This message presents potential risk.</p>
              <p>The sender or content cannot be fully trusted.</p>
              <p className="text-orange-100/90">
                Proceed only if you recognize and expect this message.
              </p>
            </div>
          )}
          <div className="mt-6 flex flex-col gap-2">
            <button
              type="button"
              className={isHigh ? BTN_MAIL_GATE_HIGH_PRIMARY : BTN_MAIL_GATE_MEDIUM_PRIMARY}
              onClick={onConfirm}
            >
              {isHigh ? "Open anyway (unsafe)" : "Open safely"}
            </button>
            <button
              ref={cancelRef}
              type="button"
              className={BTN_SECONDARY}
              onClick={onCancel}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

export function SecurityModal(props: SecurityModalProps) {
  if (!props.open) return null;

  if (props.variant === "scanning") {
    return (
      <>
        <div
          className="fixed inset-0 z-[100] backdrop-blur-sm bg-black/60"
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

  if (props.variant === "mailRiskGate") {
    return (
      <MailRiskGateModal
        tier={props.tier}
        onConfirm={props.onConfirm}
        onCancel={props.onCancel}
      />
    );
  }

  const { severity, title, reason, detail, role, primaryAction, secondaryAction, onBackdropClick } =
    props;
  const skin = PANEL[severity];

  return (
    <>
      <div
        className={`fixed inset-0 z-[100] ${RISK_OVERLAY} ${onBackdropClick ? "cursor-pointer" : ""}`}
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
