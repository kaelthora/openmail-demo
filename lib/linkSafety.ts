import {
  analyzeMailSecurity,
  type MailSecurityInput,
} from "./mailSecuritySignals";

export type LinkSafetyVerdict = "safe" | "suspicious" | "dangerous";

export type LinkSafetyResult = {
  verdict: LinkSafetyVerdict;
  reason: string;
  riskScore: number;
};

const KNOWN_SAFE_DOMAIN_RE =
  /(^|\.)((google|gmail|googlemail|youtube|gstatic|microsoft|office|outlook|live|apple|icloud|amazon|github|linkedin|slack|dropbox|notion|openai|cloudflare)\.(com|org|net)|microsoftonline\.com)$/i;

const SUSPICIOUS_TLD_RE = /\.(tk|ml|ga|cf|gq|xyz|top|click|link|buzz|work|shop|zip)$/i;
const SAFE_BRANDS = [
  "google",
  "microsoft",
  "apple",
  "amazon",
  "paypal",
  "github",
  "linkedin",
] as const;

function normalizeHost(host: string): string {
  const h = host.toLowerCase().trim();
  return h.startsWith("www.") ? h.slice(4) : h;
}

function hostFromSender(sender?: string): string | null {
  if (!sender) return null;
  const m = /([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})/i.exec(sender);
  const email = m?.[1]?.toLowerCase() ?? "";
  if (!email.includes("@")) return null;
  const host = email.split("@")[1];
  return host ? normalizeHost(host) : null;
}

function relatedHosts(a: string, b: string): boolean {
  return a === b || a.endsWith(`.${b}`) || b.endsWith(`.${a}`);
}

function pressureLanguageScore(text: string): number {
  const t = text.toLowerCase();
  let s = 0;
  if (/\b(urgent|immediately|asap|right now|today only|final notice|last warning)\b/.test(t)) s += 14;
  if (/\b(act now|verify now|suspended|account locked|payment failed|wire transfer|gift card)\b/.test(t)) s += 10;
  return Math.min(24, s);
}

function looksRandomHost(host: string): boolean {
  const core = host.replace(/\.[a-z.]+$/i, "");
  return /[a-z]{8,}\d{3,}|[a-z0-9]{14,}/i.test(core);
}

function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    Array(n + 1).fill(0)
  );
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }
  return dp[m][n];
}

function typoSquatScore(host: string): number {
  const firstLabel = host.split(".")[0] ?? host;
  for (const brand of SAFE_BRANDS) {
    if (firstLabel === brand) continue;
    if (Math.abs(firstLabel.length - brand.length) > 2) continue;
    if (levenshteinDistance(firstLabel, brand) <= 1) {
      return 26;
    }
  }
  return 0;
}

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
      riskScore: 100,
    };
  }

  const proto = parsed.protocol.toLowerCase();
  if (proto !== "http:" && proto !== "https:") {
    return {
      verdict: "dangerous",
      reason: "Only secure web links (http/https) can be opened from email.",
      riskScore: 100,
    };
  }

  const host = normalizeHost(parsed.hostname);
  const senderHost = hostFromSender(mail.sender);

  /** Demo: deterministic “malicious” URLs for the link-defense UX (never opens). */
  if (
    host.includes("malicious-demo") ||
    host.endsWith(".bad") ||
    /(^|\.)evil-link\.demo$/.test(host)
  ) {
    return {
      verdict: "dangerous",
      reason: "Domain flagged as suspicious (AI analysis).",
      riskScore: 100,
    };
  }

  let riskScore = 8;
  let topReason = "";

  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
    riskScore += 48;
    topReason = "Links that use raw IP addresses are often used in phishing.";
  }

  if (senderHost && !relatedHosts(senderHost, host)) {
    riskScore += 34;
    if (!topReason) topReason = "Link domain does not match the sender domain.";
  }

  if (SUSPICIOUS_TLD_RE.test(host)) {
    riskScore += 24;
    if (!topReason) topReason = "Link uses a high-risk domain suffix.";
  }

  if (host.includes("xn--") || host.includes("--")) {
    riskScore += 18;
    if (!topReason) topReason = "Link host shows obfuscation patterns.";
  }

  if (looksRandomHost(host)) {
    riskScore += 22;
    if (!topReason) topReason = "Link host appears random or machine-generated.";
  }

  const typoScore = typoSquatScore(host);
  if (typoScore > 0) {
    riskScore += typoScore;
    if (!topReason) topReason = "Link resembles a typo-squatted trusted brand.";
  }

  if (KNOWN_SAFE_DOMAIN_RE.test(host)) {
    riskScore -= 18;
  }

  riskScore += pressureLanguageScore(
    [mail.subject ?? "", mail.preview ?? "", mail.content ?? ""].join("\n")
  );

  const result = analyzeMailSecurity({
    ...mail,
    content: `${mail.content ?? ""}\n${trimmed}`,
  });

  if (result.securityLevel === "high_risk") {
    riskScore += 26;
    if (!topReason) {
      topReason =
        result.securityReason ||
        "This link matches high-risk patterns. Opening it is not recommended.";
    }
  } else if (result.securityLevel === "suspicious") {
    riskScore += 14;
  }

  riskScore = Math.max(0, Math.min(100, Math.round(riskScore)));

  if (riskScore >= 75) {
    return {
      verdict: "dangerous",
      reason:
        topReason ||
        result.securityReason ||
        "This link matches high-risk patterns. Opening it is not recommended.",
      riskScore,
    };
  }

  if (riskScore >= 40) {
    return {
      verdict: "suspicious",
      reason:
        topReason ||
        result.securityReason ||
        "This link shows suspicious signals. Confirm you trust the destination.",
      riskScore,
    };
  }

  return { verdict: "safe", reason: "", riskScore };
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
