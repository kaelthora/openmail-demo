/**
 * Client-side decision intelligence for CORE: intents, primary verb, link tiers, quick replies.
 */

import { classifyDemoLinkUrl } from "@/lib/demoLinkHeuristics";
import { analyzeLinkUrl, type LinkSafetyVerdict } from "@/lib/linkSafety";
import {
  extractUrlsFromText,
  getMailAiRiskBand,
  linkTierWithMailRisk,
  type LinkDisplayTier,
} from "@/lib/mailContentSecurity";
import {
  analyzeMailSecurity,
  type MailSecurityInput,
} from "@/lib/mailSecuritySignals";
import type { ProcessedMail } from "@/lib/mailTypes";
import { OPENMAIL_DEMO_MODE } from "@/lib/openmailDemo";

/** Mirrors `CoreRecommendedAction` — kept local so `lib/` does not import `app/`. */
type CoreActionInput =
  | "reply"
  | "schedule"
  | "ignore"
  | "escalate"
  | "review"
  | null;

export type AiDecisionVerb = "reply" | "block" | "ignore";

export type LinkRiskLabel = "BLOCKED" | "CAUTION" | "VERIFIED";

export type LinkRiskSample = { url: string; host: string; label: LinkRiskLabel };

function verdictToTier(v: LinkSafetyVerdict): LinkDisplayTier {
  if (v === "dangerous") return "blocked";
  if (v === "suspicious") return "suspicious";
  return "safe";
}

function tierToLabel(t: LinkDisplayTier): LinkRiskLabel {
  if (t === "blocked") return "BLOCKED";
  if (t === "suspicious") return "CAUTION";
  return "VERIFIED";
}

export function mailToSecurityInput(mail: ProcessedMail): MailSecurityInput {
  return {
    sender: mail.sender,
    title: mail.title,
    subject: mail.subject,
    preview: mail.preview,
    content: mail.content,
    mailAiRisk: getMailAiRiskBand(mail),
  };
}

function linkTierForUrl(
  url: string,
  mailInput: MailSecurityInput,
  opts: { demoMode: boolean; autoProtectMode: boolean }
): LinkDisplayTier {
  const base: LinkDisplayTier = opts.demoMode
    ? classifyDemoLinkUrl(url)
    : verdictToTier(analyzeLinkUrl(url, mailInput).verdict);
  let tier = linkTierWithMailRisk(base, mailInput.mailAiRisk);
  if (opts.autoProtectMode && tier === "suspicious") {
    tier = "blocked";
  }
  return tier;
}

export type LinkRiskSummary = {
  blocked: number;
  caution: number;
  verified: number;
  uniqueUrlCount: number;
  samples: LinkRiskSample[];
};

export function summarizeLinkRisksForMail(
  mail: ProcessedMail,
  opts?: { demoMode?: boolean; autoProtectMode?: boolean }
): LinkRiskSummary {
  const demoMode = opts?.demoMode ?? OPENMAIL_DEMO_MODE;
  const autoProtectMode = opts?.autoProtectMode ?? false;
  const text = [mail.subject, mail.preview, mail.content].filter(Boolean).join("\n");
  const urls = [...new Set(extractUrlsFromText(text))];
  const mailInput = mailToSecurityInput(mail);
  let blocked = 0;
  let caution = 0;
  let verified = 0;
  const samples: LinkRiskSample[] = [];
  const seenHosts = new Set<string>();

  for (const url of urls.slice(0, 24)) {
    const tier = linkTierForUrl(url, mailInput, { demoMode, autoProtectMode });
    const label = tierToLabel(tier);
    if (label === "BLOCKED") blocked += 1;
    else if (label === "CAUTION") caution += 1;
    else verified += 1;

    let host = url;
    try {
      host = new URL(url).hostname;
    } catch {
      /* keep raw */
    }
    if (samples.length < 5 && !seenHosts.has(host)) {
      seenHosts.add(host);
      samples.push({ url, host, label });
    }
  }

  return {
    blocked,
    caution,
    verified,
    uniqueUrlCount: urls.length,
    samples,
  };
}

/** Human-readable intent tags for the CORE panel. */
export function deriveIntentTags(mail: ProcessedMail): string[] {
  const tags: string[] = [];
  const input = mailToSecurityInput(mail);
  const { signals } = analyzeMailSecurity(input);

  if (signals.financialUrgencyScam || signals.giftCardScam || signals.urgencyMoneyExternalSender) {
    tags.push("Financial pressure");
  }
  if (signals.emotionalManipulation) {
    tags.push("Emotional manipulation");
  }
  if (signals.brandImpersonation || signals.ceoAuthorityImpersonation) {
    tags.push("Impersonation");
  }
  if (signals.emotionalManipulationUrgent || mail.syncedAi?.intentUrgency === "high") {
    tags.push("Urgency");
  }
  if (signals.suspiciousLinks.length > 0) {
    tags.push("Suspicious links");
  }
  if (signals.zeroToleranceHit) {
    tags.push("High-risk pattern");
  }
  if (signals.contentRisk >= 55) {
    tags.push("Risky content");
  }

  const intent = mail.syncedAi?.intent;
  if (intent === "review" && !tags.includes("Needs review")) tags.push("Needs review");
  if (intent === "escalate" && !tags.includes("Escalation")) tags.push("Escalation");
  if (intent === "reply" && mail.needsReply && tags.length === 0) {
    tags.push("Expects reply");
  }

  if (tags.length === 0 && mail.needsReply) {
    tags.push("Expects reply");
  }
  if (tags.length === 0) {
    tags.push("No elevated intent");
  }

  return [...new Set(tags)].slice(0, 8);
}

export function derivePrimaryAiDecision(
  mail: ProcessedMail | null,
  recommendedCoreAction: CoreActionInput
): { verb: AiDecisionVerb; explanation: string } {
  if (!mail) {
    return { verb: "reply", explanation: "Select a message for an automated decision." };
  }
  const band = getMailAiRiskBand(mail);
  if (band === "high") {
    return {
      verb: "block",
      explanation: "High risk — do not engage, click links, or send sensitive data.",
    };
  }
  if (band === "medium") {
    return {
      verb: "block",
      explanation: "Elevated risk — verify out-of-band before replying or opening links.",
    };
  }

  const core = recommendedCoreAction;
  if (core === "ignore") {
    return { verb: "ignore", explanation: "Safe to archive — no reply expected." };
  }
  if (core === "escalate") {
    return {
      verb: "block",
      explanation: "Escalate internally — do not act on requests in this thread alone.",
    };
  }
  if (core === "review") {
    return {
      verb: "reply",
      explanation: "Review details, then reply only after you trust the sender and content.",
    };
  }
  if (core === "schedule") {
    return { verb: "reply", explanation: "Calendar / logistics thread — respond with availability." };
  }
  return { verb: "reply", explanation: "Safe context — draft a reply when you are ready." };
}

function toneOpening(tone: string): string {
  const t = tone.toLowerCase();
  if (t.includes("friendly")) return "Hi — thanks";
  if (t.includes("direct")) return "Thanks";
  if (t.includes("short")) return "Thanks";
  return "Thank you";
}

/** Short inserts aligned with current tone (complement GPT suggestions). */
export function buildContextQuickReplies(
  mail: ProcessedMail,
  tone: string
): string[] {
  const open = toneOpening(tone);
  const subj = (mail.subject || "your note").replace(/\s+/g, " ").trim();
  const who = (mail.sender || "").includes("@")
    ? (mail.sender || "").split("<")[0].trim() || "there"
    : mail.sender?.trim() || "there";

  const lines: string[] = [
    `${open} for ${subj.slice(0, 60)}${subj.length > 60 ? "…" : ""}. I will follow up shortly.`,
    `${open}, ${who}. Could you confirm the key ask in one line so I can respond accurately?`,
    `${open}. I received this and will review — expect a reply today.`,
  ];

  if (mail.needsReply) {
    lines.unshift(
      `${open} — I am on this and will send next steps once I have verified the details.`
    );
  }

  return [...new Set(lines)].slice(0, 4);
}
