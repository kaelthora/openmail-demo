import type { MailAiRiskBand } from "@/lib/mailSecuritySignals";
import type { ProcessedMail } from "@/lib/mailTypes";

/** Display tier for link rows (matches app `UnifiedLinkTier`). */
export type LinkDisplayTier = "safe" | "suspicious" | "blocked";

/** Badge tier for attachments (matches UI `SecurityRiskLevel`). */
export type AttachmentBadgeTier = "safe" | "suspicious" | "dangerous";

/**
 * Mail-level AI risk: prefers synced `analyzeEmail` output, then processed security level.
 */
export function getMailAiRiskBand(
  mail: Pick<ProcessedMail, "syncedAi" | "securityLevel">
): MailAiRiskBand {
  const r = mail.syncedAi?.risk;
  if (r === "high" || r === "medium" || r === "safe") return r;
  if (mail.securityLevel === "high_risk") return "high";
  if (mail.securityLevel === "suspicious") return "medium";
  return "safe";
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
