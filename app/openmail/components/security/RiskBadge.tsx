"use client";

import type { SecurityRiskLevel } from "./types";

const STYLES: Record<
  SecurityRiskLevel,
  { label: string; className: string }
> = {
  safe: {
    label: "SAFE",
    className:
      "border-emerald-500/35 bg-emerald-500/10 text-emerald-200/90 [box-shadow:0_0_14px_rgba(52,211,153,0.12)]",
  },
  suspicious: {
    label: "SUSPICIOUS",
    className:
      "border-amber-500/40 bg-amber-500/10 text-amber-100/90 [box-shadow:0_0_18px_rgba(251,191,36,0.18)]",
  },
  dangerous: {
    label: "DANGEROUS",
    className:
      "border-red-500/45 bg-red-500/12 text-red-100/95 [box-shadow:0_0_20px_rgba(248,113,113,0.28)]",
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
      className={`inline-flex shrink-0 items-center rounded-md border font-semibold ${sz} ${cfg.className}`}
      title={cfg.label}
    >
      {cfg.label}
    </span>
  );
}
