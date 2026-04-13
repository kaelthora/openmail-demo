/**
 * Light segmented controls — pair with `om-light-seg-active` / `om-light-seg-idle`
 * in `globals.css` under `html[data-openmail-theme="soft-intelligence-light"]` (!important).
 * Tailwind: layout/typography only — do not add bg-*, border-white/*, or dark fills here
 * (they fight the global segment styles).
 */
const tr =
  "transition-[background-color,border-color,color,box-shadow] duration-200";

export const OPENMAIL_LIGHT_SEGMENT = {
  flexActive: `om-light-seg-active flex-1 rounded-lg px-3 py-2 text-left text-[11px] font-semibold ${tr}`,
  flexInactive: `om-light-seg-idle flex-1 rounded-lg px-3 py-2 text-left text-[11px] font-medium ${tr}`,

  wrapActive: `om-light-seg-active rounded-lg px-3 py-2 text-left text-[11px] font-semibold ${tr}`,
  wrapInactive: `om-light-seg-idle rounded-lg px-3 py-2 text-left text-[11px] font-medium ${tr}`,

  toolbarActive: `om-light-seg-active rounded-[6px] px-2 py-1 text-left text-[10px] font-semibold ${tr}`,
  toolbarInactive: `om-light-seg-idle rounded-[6px] px-2 py-1 text-left text-[10px] font-medium ${tr}`,

  toneActive: `om-light-seg-active rounded-full px-3 py-1 text-center text-[11px] font-semibold ${tr}`,
  toneInactive: `om-light-seg-idle rounded-full px-3 py-1 text-center text-[11px] font-medium ${tr}`,
} as const;
