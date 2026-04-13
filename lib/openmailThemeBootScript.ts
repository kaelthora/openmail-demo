import {
  OPENMAIL_THEME_DEFAULT,
  OPENMAIL_THEME_STORAGE_KEY,
} from "@/lib/openmailTheme";

/**
 * Runs before first paint (see `app/openmail/layout.tsx` Script strategy).
 * Sets `html[data-openmail-theme]` from localStorage so CSS tokens and
 * theme-scoped rules match the stored preference before React hydrates.
 */
export function getOpenmailThemeBootScript(): string {
  const K = JSON.stringify(OPENMAIL_THEME_STORAGE_KEY);
  const D = JSON.stringify("soft-dark");
  const L = JSON.stringify("soft-intelligence-light");
  const def = JSON.stringify(OPENMAIL_THEME_DEFAULT);
  return `(function(){var K=${K};var D=${D};var L=${L};var LEG={blacken:D,"soft-intelligence":D};var t=null;try{t=localStorage.getItem(K);}catch(e){}var th=${def};if(t===D||t===L)th=t;else if(t&&Object.prototype.hasOwnProperty.call(LEG,t))th=LEG[t];document.documentElement.setAttribute("data-openmail-theme",th);})();`;
}
