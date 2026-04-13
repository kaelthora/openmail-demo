/**
 * Light-mode segmented / toggle chip styles (aligned with Settings → Accounts
 * Quick connect / Manual). Use only when theme is `soft-intelligence-light`.
 */
const tx = "transition-[background-color,border-color,color,box-shadow] duration-200";

export const OPENMAIL_LIGHT_SEGMENT = {
  /** Accounts Quick/Manual, Settings Display density (flex-1, 11px, rounded-lg) */
  flexActive: `flex-1 rounded-lg border border-[rgba(0,0,0,0.08)] bg-[#ffffff] px-3 py-2 text-[11px] font-semibold text-[#111827] shadow-[0_1px_3px_rgba(0,0,0,0.06)] ${tx}`,
  flexInactive: `flex-1 rounded-lg border border-[rgba(0,0,0,0.06)] bg-[rgba(0,0,0,0.04)] px-3 py-2 text-[11px] font-medium text-[rgba(0,0,0,0.6)] hover:bg-[rgba(0,0,0,0.07)] ${tx}`,

  /** Settings → AI default reply tone (wrapped row, no flex-1) */
  wrapActive: `rounded-lg border border-[rgba(0,0,0,0.08)] bg-[#ffffff] px-3 py-2 text-[11px] font-semibold text-[#111827] shadow-[0_1px_3px_rgba(0,0,0,0.06)] ${tx}`,
  wrapInactive: `rounded-lg border border-[rgba(0,0,0,0.06)] bg-[rgba(0,0,0,0.04)] px-3 py-2 text-[11px] font-medium text-[rgba(0,0,0,0.6)] hover:bg-[rgba(0,0,0,0.07)] ${tx}`,

  /** Mail list toolbar Compact / Comfortable (compact sizing, unchanged padding) */
  toolbarActive: `rounded-[6px] border border-[rgba(0,0,0,0.08)] bg-[#ffffff] px-2 py-1 text-[10px] font-semibold text-[#111827] shadow-[0_1px_3px_rgba(0,0,0,0.06)] ${tx}`,
  toolbarInactive: `rounded-[6px] border border-[rgba(0,0,0,0.06)] bg-[rgba(0,0,0,0.04)] px-2 py-1 text-[10px] font-medium text-[rgba(0,0,0,0.6)] hover:bg-[rgba(0,0,0,0.07)] ${tx}`,

  /** AI panel tone pills (rounded-full) */
  toneActive: `rounded-full border border-[rgba(0,0,0,0.08)] bg-[#ffffff] px-3 py-1 text-[11px] font-semibold text-[#111827] shadow-[0_1px_3px_rgba(0,0,0,0.06)] ${tx}`,
  toneInactive: `rounded-full border border-[rgba(0,0,0,0.06)] bg-[rgba(0,0,0,0.04)] px-3 py-1 text-[11px] font-medium text-[rgba(0,0,0,0.6)] hover:bg-[rgba(0,0,0,0.07)] ${tx}`,
} as const;
