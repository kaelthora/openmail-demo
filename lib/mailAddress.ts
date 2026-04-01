/** Best-effort extract first email from a From-style string. */
export function extractEmail(from: string): string | null {
  const m = from.match(/([^\s<>]+@[^\s<>]+)/);
  return m ? m[1].replace(/[>,]$/, "") : null;
}
