/**
 * Normalizes message timestamps for IMAP ingest, Prisma rows, and API JSON.
 * Prefers the primary value (envelope / DB `date`), then optional fallback
 * (`createdAt`, internalDate), then current time.
 */
export function resolveMailIsoDateString(
  primary: Date | string | null | undefined,
  fallback?: Date | string | null | undefined
): string {
  const asIso = (raw: Date | string | null | undefined): string | null => {
    if (raw == null) return null;
    if (raw instanceof Date) {
      const t = raw.getTime();
      return Number.isNaN(t) ? null : raw.toISOString();
    }
    if (typeof raw === "string") {
      const s = raw.trim();
      if (!s) return null;
      const d = new Date(s);
      const t = d.getTime();
      return Number.isNaN(t) ? null : d.toISOString();
    }
    return null;
  };
  return asIso(primary) ?? asIso(fallback) ?? new Date().toISOString();
}
