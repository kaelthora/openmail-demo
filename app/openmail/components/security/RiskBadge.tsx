"use client";

import type { SecurityRiskLevel } from "./types";

const STYLES: Record<
  SecurityRiskLevel,
  { label: string; className: string }
> = {
  safe: {
    label: "SAFE",
    className:
      "border-emerald-500/45 bg-emerald-500/15 text-emerald-100/95 [box-shadow:0_0_16px_rgba(52,211,153,0.22)]",
  },
  suspicious: {
    label: "SANDBOX",
    className:
      "border-orange-500/50 bg-orange-500/14 text-orange-50/95 [box-shadow:0_0_20px_rgba(251,146,60,0.28)]",
  },
  trusted_flagged: {
    label: "Trusted · flagged",
    className:
      "max-w-[9.5rem] truncate border-amber-500/50 bg-amber-500/12 text-amber-50/95 [box-shadow:0_0_18px_rgba(245,158,11,0.22)]",
  },
  dangerous: {
    label: "HIGH RISK",
    className:
      "border-red-600 bg-[#450a0a] text-red-50 [box-shadow:0_0_28px_rgba(220,38,38,0.55)] ring-1 ring-red-500/40",
  },
};

export function RiskBadge({
  level,
  size = "md",
}: {
  level: SecurityRiskLevel;
  size?: "sm" | "md";
}) {
  const cfg = STYLES[level];
  const sz =
    size === "sm"
      ? "px-1.5 py-0.5 text-[9px] tracking-[0.12em]"
      : "px-2 py-0.5 text-[10px] tracking-[0.14em]";
  return (
    <span
      data-risk-level={level}
      className={`openmail-risk-badge inline-flex shrink-0 items-center rounded-md border font-semibold ${sz} ${cfg.className}`}
      title={cfg.label}
    >
      {cfg.label}
    </span>
  );
}
