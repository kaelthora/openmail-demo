/**
 * OpenMail privacy policy: no third-party analytics, telemetry, or leaky diagnostics.
 * User content is not logged to the console. Mail flows use the user’s provider and
 * first-party API routes; AI uses configured model endpoints only (no tracking hosts).
 */
export const ZERO_TRACKING = true as const;

/** Hostnames used for ads/analytics/telemetry (not mail or AI API). */
const TRACKING_HOST =
  /^(?:[a-z0-9-]+\.)*(?:google-analytics\.com|googletagmanager\.com|analytics\.google\.com|doubleclick\.net|facebook\.net|connect\.facebook\.net|hotjar\.com|mixpanel\.com|segment\.(?:com|io)|sentry\.io|browser\.sentry\.io|ingest\.sentry\.io|vercel-insights\.com|vitals\.vercel-insights\.com|plausible\.io)$/i;

function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

/** Call before fetch() to known absolute URLs; throws in dev with a warning when blocked. */
export function assertNoTrackingUrl(url: string, context = "fetch"): void {
  if (!ZERO_TRACKING) return;
  const host = hostnameOf(url);
  if (!host || !TRACKING_HOST.test(host)) return;
  if (process.env.NODE_ENV !== "production") {
    console.warn(
      `[openmail] ZERO_TRACKING: blocked analytics/telemetry URL (${context})`
    );
  }
  throw new Error("Tracking requests are disabled (ZERO_TRACKING)");
}

/** Replaces verbose logs that could include prompts, email, or PII. */
export function logRedacted(): void {
  console.log("[redacted]");
}

/** Warning line without payload (no error objects that may embed user data). */
export function warnRedacted(scope: string): void {
  console.warn(`${scope} [redacted]`);
}
