import type { MailAiRiskBand } from "@/lib/mailSecuritySignals";
import type { ProcessedMail } from "@/lib/mailTypes";

/** Display tier for link rows (matches app `UnifiedLinkTier`). */
export type LinkDisplayTier = "safe" | "suspicious" | "blocked";

/** Badge tier for attachments (matches UI `SecurityRiskLevel`). */
export type AttachmentBadgeTier = "safe" | "suspicious" | "dangerous";

const BAND_RANK: Record<MailAiRiskBand, number> = {
  safe: 0,
  medium: 1,
  high: 2,
};

function maxMailAiRiskBand(
  a: MailAiRiskBand,
  b: MailAiRiskBand
): MailAiRiskBand {
  return BAND_RANK[a] >= BAND_RANK[b] ? a : b;
}

/**
 * Mail-level AI risk: merges synced `analyzeEmail` output with processed security level.
 * Heuristic/high_risk flags cannot be downgraded by a “safe” synced classification.
 */
export function getMailAiRiskBand(
  mail: Pick<ProcessedMail, "syncedAi" | "securityLevel">
): MailAiRiskBand {
  const r = mail.syncedAi?.risk;
  let band: MailAiRiskBand =
    r === "high" || r === "medium" || r === "safe" ? r : "safe";
  if (mail.securityLevel === "high_risk") {
    band = maxMailAiRiskBand(band, "high");
  } else if (mail.securityLevel === "suspicious") {
    band = maxMailAiRiskBand(band, "medium");
  }
  return band;
}

/**
 * Extract http(s) and www URLs from plain text (same rules as mail body parser).
 */
const URL_RE = /(https?:\/\/[^\s<>"')]+|www\.[^\s<>"')]+)/gi;

export function extractUrlsFromText(text: string): string[] {
  const out: string[] = [];
  const re = new RegExp(URL_RE.source, "gi");
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    let raw = m[0].replace(/[.,;:!?)\]]+$/g, "");
    if (!raw) continue;
    if (raw.startsWith("www.")) raw = `https://${raw}`;
    out.push(raw);
  }
  return out;
}

/** Elevate per-link tier when the message itself is flagged medium/high. */
export function linkTierWithMailRisk(
  base: LinkDisplayTier,
  mailRisk: MailAiRiskBand | undefined
): LinkDisplayTier {
  const m = mailRisk ?? "safe";
  if (m === "high") return "blocked";
  if (m === "medium") {
    if (base === "blocked") return "blocked";
    return "suspicious";
  }
  return base;
}

/** Elevate attachment badge when the message is flagged medium/high. */
export function attachmentBadgeWithMailRisk(
  base: AttachmentBadgeTier,
  mailRisk: MailAiRiskBand | undefined
): AttachmentBadgeTier {
  const m = mailRisk ?? "safe";
  if (m === "high") return "dangerous";
  if (m === "medium") {
    if (base === "dangerous") return "dangerous";
    return "suspicious";
  }
  return base;
}
