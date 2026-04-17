/**
 * Default production API host (no path). Override with `NEXT_PUBLIC_API_URL`
 * (scheme + host only, e.g. `https://my-app.up.railway.app`).
 */
export const API_BASE = "https://openmail-demo-production.up.railway.app";

export const API_URL = process.env.NEXT_PUBLIC_API_URL || API_BASE;

/** Origin only — strips paths like `/api` if present on `NEXT_PUBLIC_API_URL`. */
export function backendOrigin(): string {
  const raw = (API_URL || API_BASE).trim().replace(/\/+$/, "");
  try {
    return new URL(raw).origin;
  } catch {
    try {
      return new URL(API_BASE.trim().replace(/\/+$/, "")).origin;
    } catch {
      return "https://openmail-demo-production.up.railway.app";
    }
  }
}

/**
 * Absolute URL for backend HTTP APIs. Always targets `/api/...` on `backendOrigin()`.
 *
 * Accepts `accounts`, `/accounts`, `api/accounts`, `/api/accounts`,
 * `inbox?legacy=1`, `/api/emails/events`, etc.
 */
export function apiUrl(path: string): string {
  const origin = backendOrigin();
  let rest = path.trim().replace(/^\/+/, "");
  if (!rest) {
    throw new Error("apiUrl: path is required");
  }
  if (rest === "api" || rest.startsWith("api/")) {
    rest = rest === "api" ? "" : rest.slice(4);
  }
  if (!rest) {
    throw new Error("apiUrl: empty path after normalization");
  }
  return `${origin}/api/${rest}`;
}
