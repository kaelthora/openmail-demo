/**
 * Light segmented / toggle buttons — use ONLY when `theme === "soft-intelligence-light"`.
 * Do not merge with `segClass`, `openmail-reply-tone-chip`, or other dark-segment classes.
 * Lives under `app/openmail/` so Tailwind is guaranteed to scan these class strings.
 */
const tr =
  "transition-[background-color,border-color,color,box-shadow] duration-200";

export const OPENMAIL_LIGHT_SEGMENT = {
  flexActive: `flex-1 rounded-lg border border-black/10 !bg-white px-3 py-2 text-left text-[11px] font-semibold !text-[#111827] shadow-sm ${tr}`,
  flexInactive: `flex-1 rounded-lg border border-black/5 !bg-black/[0.04] px-3 py-2 text-left text-[11px] font-medium !text-black/60 shadow-none hover:!bg-black/[0.08] ${tr}`,

  wrapActive: `rounded-lg border border-black/10 !bg-white px-3 py-2 text-left text-[11px] font-semibold !text-[#111827] shadow-sm ${tr}`,
  wrapInactive: `rounded-lg border border-black/5 !bg-black/[0.04] px-3 py-2 text-left text-[11px] font-medium !text-black/60 shadow-none hover:!bg-black/[0.08] ${tr}`,

  toolbarActive: `rounded-[6px] border border-black/10 !bg-white px-2 py-1 text-left text-[10px] font-semibold !text-[#111827] shadow-sm ${tr}`,
  toolbarInactive: `rounded-[6px] border border-black/5 !bg-black/[0.04] px-2 py-1 text-left text-[10px] font-medium !text-black/60 shadow-none hover:!bg-black/[0.08] ${tr}`,

  toneActive: `rounded-full border border-black/10 !bg-white px-3 py-1 text-center text-[11px] font-semibold !text-[#111827] shadow-sm ${tr}`,
  toneInactive: `rounded-full border border-black/5 !bg-black/[0.04] px-3 py-1 text-center text-[11px] font-medium !text-black/60 shadow-none hover:!bg-black/[0.08] ${tr}`,
} as const;
