export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  "https://openmail-demo-production.up.railway.app";

export function apiUrl(path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${API_URL}${normalizedPath}`;
}
