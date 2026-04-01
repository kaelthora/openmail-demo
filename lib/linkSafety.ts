import {
  analyzeMailSecurity,
  type MailSecurityInput,
} from "./mailSecuritySignals";

export type LinkSafetyVerdict = "safe" | "suspicious" | "dangerous";

export type LinkSafetyResult = {
  verdict: LinkSafetyVerdict;
  reason: string;
};

/**
 * Heuristic “AI link check” using the same multi-signal engine as mail analysis,
 * with the clicked URL emphasized in the combined text.
 */
export function analyzeLinkUrl(
  rawUrl: string,
  mail: MailSecurityInput
): LinkSafetyResult {
  const trimmed = rawUrl.trim();
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return {
      verdict: "dangerous",
      reason: "This link could not be validated — it may be malformed or unsafe.",
    };
  }

  const proto = parsed.protocol.toLowerCase();
  if (proto !== "http:" && proto !== "https:") {
    return {
      verdict: "dangerous",
      reason: "Only secure web links (http/https) can be opened from email.",
    };
  }

  const host = parsed.hostname.toLowerCase();

  /** Demo: deterministic “malicious” URLs for the link-defense UX (never opens). */
  if (
    host.includes("malicious-demo") ||
    host.endsWith(".bad") ||
    /(^|\.)evil-link\.demo$/.test(host)
  ) {
    return {
      verdict: "dangerous",
      reason: "Domain flagged as suspicious (AI analysis).",
    };
  }

  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
    return {
      verdict: "dangerous",
      reason: "Links that use a raw IP address are often used in phishing and are blocked.",
    };
  }

  const result = analyzeMailSecurity({
    ...mail,
    content: `${mail.content ?? ""}\n${trimmed}`,
  });

  if (result.securityLevel === "high_risk") {
    return {
      verdict: "dangerous",
      reason:
        result.securityReason ||
        "This link matches high-risk patterns. Opening it is not recommended.",
    };
  }

  if (result.securityLevel === "suspicious") {
    return {
      verdict: "suspicious",
      reason:
        result.securityReason ||
        "This link shows suspicious signals. Confirm you trust the destination.",
    };
  }

  return { verdict: "safe", reason: "" };
}

/** Small async delay so the check feels intentional (matches app “AI think” timing). */
export function analyzeLinkUrlAsync(
  rawUrl: string,
  mail: MailSecurityInput
): Promise<LinkSafetyResult> {
  const delay = 80 + Math.floor(Math.random() * 81);
  return new Promise((resolve) => {
    globalThis.setTimeout(() => {
      resolve(analyzeLinkUrl(rawUrl, mail));
    }, delay);
  });
}
