export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  "https://openmail-demo-production.up.railway.app";

export function apiUrl(path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  // Browser calls should stay same-origin to hit Next API routes (/api/*)
  // and avoid cross-origin/CORS + route mismatch issues.
  if (typeof window !== "undefined") {
    return normalizedPath;
  }
  return `${API_URL}${normalizedPath}`;
}
