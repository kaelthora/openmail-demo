export const API_BASE = "https://openmail-demo-production.up.railway.app";

export const API_URL = process.env.NEXT_PUBLIC_API_URL || API_BASE;

export function apiUrl(path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const base = API_URL.replace(/\/$/, "");
  return `${base}${normalizedPath}`;
}
