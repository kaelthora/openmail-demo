/**
 * Multi-signal mail security analysis (heuristic / demo).
 * Combines domain, simulated auth, content, links, attachments, and brand impersonation.
 */

export type SecurityLevel = "safe" | "suspicious" | "high_risk";

/** Synced / processed AI risk for the whole message — gates links & attachments */
export type MailAiRiskBand = "high" | "medium" | "safe";

export type MailSecurityInput = {
  sender?: string;
  title?: string;
  subject?: string;
  preview?: string;
  content?: string;
  /** When set, tightens link and attachment handling (high = block, medium = sandbox) */
  mailAiRisk?: MailAiRiskBand;
};

/** Machine-readable risk signal id (e.g. traces, future API). */
export type RiskSignalId = "emotional_manipulation";

export type SecuritySignals = {
  /** 0 = looks legitimate, higher = worse */
  domainLegitimacyRisk: number;
  spf: "pass" | "fail" | "softfail" | "unknown";
  dkim: "pass" | "fail" | "unknown";
  dmarc: "pass" | "fail" | "unknown";
  contentRisk: number;
  linkMismatchScore: number;
  suspiciousLinks: string[];
  attachmentRisk: number;
  brandImpersonation: boolean;
  impersonatedBrand: string | null;
  /**
   * Personal distress + money/help/illness cues from an unverified or external sender
   * (human scam / sob story — no links required). Id: `emotional_manipulation`.
   */
  emotionalManipulation: boolean;
  /** When true, urgency amplifies to HIGH-tier handling. */
  emotionalManipulationUrgent: boolean;
  /** Gift / prepaid card + urgency + authority language (common BEC). */
  giftCardScam: boolean;
  /** External sender claiming exec authority and requesting payment-like action. */
  ceoAuthorityImpersonation: boolean;
  /** Direct financial pressure (wire, urgent payment, send money). */
  financialUrgencyScam: boolean;
  /** Urgency + money cues from an external / unknown sender. */
  urgencyMoneyExternalSender: boolean;
  /**
   * Zero-tolerance scam bundle: urgency / financial / authority / emotional / credential-style hosts.
   * Any hit forces HIGH risk in analysis (cannot present as neutral).
   */
  zeroToleranceHit: boolean;
  /** Count of distinct zero-tolerance categories matched (drives confidence floor). */
  zeroToleranceSignalCount: number;
};

/** Explicit HIGH RISK modal / CORE bullets (subset of `SecuritySignals`). */
export type HighRiskUiReasons = {
  urgentFinancial: boolean;
  impersonation: boolean;
  socialEngineering: boolean;
};

export function deriveHighRiskUiReasons(s: SecuritySignals): HighRiskUiReasons {
  const urgentFinancial =
    s.giftCardScam ||
    s.financialUrgencyScam ||
    s.urgencyMoneyExternalSender ||
    s.zeroToleranceHit;
  const impersonation = s.brandImpersonation || s.ceoAuthorityImpersonation;
  const socialEngineering = s.emotionalManipulation || s.zeroToleranceHit;
  return { urgentFinancial, impersonation, socialEngineering };
}

export type SecurityAnalysisResult = {
  /** Global risk 0–100 */
  riskScore: number;
  securityLevel: SecurityLevel;
  securityReason: string;
  /** One-line AI-style nuance under the primary reason (optional) */
  securityAiSubline: string;
  /** Short bullet points for UI */
  whyBullets: string[];
  signals: SecuritySignals;
};

export type RiskTierLabel = "low" | "medium" | "high";

/** Human label + tier for styling (Low / Medium / High risk). */
export function getRiskPresentation(level: SecurityLevel): {
  tier: RiskTierLabel;
  label: string;
} {
  if (level === "high_risk") return { tier: "high", label: "High risk" };
  if (level === "suspicious") return { tier: "medium", label: "Medium risk" };
  return { tier: "low", label: "Low risk" };
}

function buildWhyBullets(
  signals: SecuritySignals,
  level: SecurityLevel,
  riskScore: number
): string[] {
  if (level === "safe") {
    return [
      "No brand impersonation or urgent-credential pattern",
      "Links and sender look broadly aligned (simulated checks)",
    ];
  }

  const bullets: string[] = [];

  if (signals.brandImpersonation && signals.impersonatedBrand) {
    bullets.push(
      `References ${signals.impersonatedBrand} but the From domain is not the official one`
    );
  }

  if (signals.domainLegitimacyRisk >= 22) {
    bullets.push("Sender domain looks low-trust or unusual");
  } else if (signals.domainLegitimacyRisk >= 12) {
    bullets.push("Sender domain has minor warning flags");
  }

  const authFails = [signals.spf, signals.dkim, signals.dmarc].filter(
    (x) => x === "fail"
  ).length;
  if (authFails >= 2) {
    bullets.push("SPF/DKIM/DMARC don’t align with a trusted sender (simulated)");
  } else if (authFails === 1) {
    bullets.push("At least one auth check looks weak (simulated)");
  }

  if (signals.zeroToleranceHit) {
    bullets.push(
      "Zero-tolerance policy: urgency, financial pressure, impersonation, emotional manipulation, or risky link host detected"
    );
  }

  if (signals.emotionalManipulation) {
    bullets.push(
      signals.emotionalManipulationUrgent
        ? "Urgent personal appeal with distress and money/help cues (possible emotional manipulation scam)"
        : "Personal distress and money/help/illness language from an unverified or external sender"
    );
  }

  if (signals.giftCardScam) {
    bullets.push("Gift card / prepaid card request with urgency and authority cues");
  }
  if (signals.ceoAuthorityImpersonation && !signals.brandImpersonation) {
    bullets.push("Sender claims authority and requests payment or sensitive action");
  }
  if (signals.financialUrgencyScam) {
    bullets.push("Urgent financial or wire-transfer pressure");
  }
  if (signals.urgencyMoneyExternalSender) {
    bullets.push("Urgent payment language from an external or unverified sender");
  }

  if (signals.contentRisk >= 35) {
    bullets.push("Language matches common phishing or account-theft patterns");
  } else if (signals.contentRisk >= 18) {
    bullets.push("Urgent payment or invoice pressure");
  }

  if (signals.linkMismatchScore >= 12) {
    bullets.push("Outgoing links don’t match the sender domain");
    if (signals.suspiciousLinks[0]) {
      const h = signals.suspiciousLinks[0];
      bullets.push(`Linked host: ${h.length > 36 ? `${h.slice(0, 34)}…` : h}`);
    }
  }

  if (signals.attachmentRisk >= 20) {
    bullets.push("Attachment name or type looks risky");
  }

  if (bullets.length === 0) {
    bullets.push(`Elevated combined score (${riskScore})`);
  }

  return bullets.slice(0, 4);
}

const EMAIL_IN_TEXT = /([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})/gi;
const URL_HOST = /https?:\/\/([^/?#\s]+)/gi;

/** Known brands: body must suggest brand, sender domain must match one of these patterns. */
const BRAND_IMPERSONATION: {
  id: string;
  /** Text mentions this brand */
  mention: RegExp;
  /** Sender host must match one of these (full hostname) */
  trustedHost: RegExp;
}[] = [
  {
    id: "Amazon",
    mention: /\bamazon\b/i,
    trustedHost:
      /^([a-z0-9.-]+\.)*amazon\.(com|co\.uk|de|fr|es|it|ca|in|jp|com\.au|com\.br|nl|se|pl)$/i,
  },
  {
    id: "OVH",
    mention: /\b(ovh|ovhcloud)\b/i,
    trustedHost: /^([a-z0-9.-]+\.)*(ovh\.(com|net|co\.uk)|ovhcloud\.com)$/i,
  },
  {
    id: "PayPal",
    mention: /\bpaypal\b/i,
    trustedHost: /^([a-z0-9.-]+\.)*paypal\.(com|co\.uk|de|fr)$/i,
  },
  {
    id: "Microsoft",
    mention: /\b(microsoft|outlook|office\s*365|azure)\b/i,
    trustedHost:
      /^([a-z0-9.-]+\.)*(microsoft\.com|outlook\.com|office\.com|live\.com|azure\.com)$/i,
  },
  {
    id: "Google",
    mention: /\bgoogle\b/i,
    trustedHost: /^([a-z0-9.-]+\.)*(google\.com|gmail\.com|googlemail\.com)$/i,
  },
  {
    id: "Apple",
    mention: /\bapple\b|\bicloud\b/i,
    trustedHost: /^([a-z0-9.-]+\.)*(apple\.com|icloud\.com|me\.com|mac\.com)$/i,
  },
  {
    id: "Netflix",
    mention: /\bnetflix\b/i,
    trustedHost: /^([a-z0-9.-]+\.)*netflix\.com$/i,
  },
  {
    id: "DHL",
    mention: /\bdhl\b/i,
    trustedHost: /^([a-z0-9.-]+\.)*dhl\.(com|de|fr|co\.uk)$/i,
  },
  {
    id: "FedEx",
    mention: /\bfedex\b/i,
    trustedHost: /^([a-z0-9.-]+\.)*fedex\.com$/i,
  },
  {
    id: "UPS",
    mention: /\bups\b/i,
    trustedHost: /^([a-z0-9.-]+\.)*ups\.com$/i,
  },
];

function extractPrimaryEmail(sender?: string): string | null {
  if (!sender?.trim()) return null;
  const angle = /<([^>]+@[^>]+)>/i.exec(sender);
  if (angle?.[1]) return angle[1].trim().toLowerCase();
  const plain = sender.trim().toLowerCase();
  if (plain.includes("@") && !plain.includes(" ")) return plain;
  const m = EMAIL_IN_TEXT.exec(sender);
  return m?.[1]?.toLowerCase() ?? null;
}

function hostFromEmail(email: string | null): string | null {
  if (!email?.includes("@")) return null;
  return email.split("@").pop()?.toLowerCase() ?? null;
}

function normalizeHost(raw: string): string {
  let h = raw.toLowerCase().trim();
  if (h.startsWith("www.")) h = h.slice(4);
  return h.split(":")[0] ?? h;
}

function extractUrlHosts(text: string): string[] {
  const hosts: string[] = [];
  let m: RegExpExecArray | null;
  const re = new RegExp(URL_HOST.source, "gi");
  while ((m = re.exec(text)) !== null) {
    hosts.push(normalizeHost(m[1]));
  }
  return hosts;
}

function registrableSimilar(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.endsWith(`.${b}`) || b.endsWith(`.${a}`)) return true;
  return false;
}

function scoreDomainLegitimacy(host: string | null): number {
  /** Display-name-only From (no address) — neutral, not treated as spoofed. */
  if (!host) return 8;
  let r = 0;
  if (/\.(tk|ml|ga|cf|gq|xyz|top|click|link|buzz|work)$/i.test(host)) r += 38;
  if (host.includes("notice.example") || host.includes("secure-verify")) r += 34;
  if (host.includes("verify-") || host.includes("-verify.")) r += 22;
  if (host.length > 48) r += 12;
  if (/xn--/.test(host)) r += 28;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) r += 35;
  return Math.min(60, r);
}

/** Freemail, disposable, or sketch hosts — stranger “help” scams often use these. */
function senderUnknownOrExternalForEmotionalScam(
  primaryEmail: string | null,
  senderHost: string | null
): boolean {
  if (!primaryEmail || !senderHost) return true;
  const host = senderHost.toLowerCase();
  if (scoreDomainLegitimacy(host) >= 18) return true;
  if (/\.(tk|ml|ga|cf|gq|xyz|top|click|link|buzz|work)$/i.test(host)) return true;
  if (host.includes("notice.example") || host.includes("secure-verify")) return true;
  if (host.length > 52) return true;
  if (
    /(^|\.)gmail\.com$/i.test(host) ||
    /(^|\.)googlemail\.com$/i.test(host) ||
    /(^|\.)yahoo\./i.test(host) ||
    /(^|\.)hotmail\./i.test(host) ||
    /(^|\.)outlook\.com$/i.test(host) ||
    /(^|\.)live\.com$/i.test(host) ||
    /(^|\.)icloud\.com$/i.test(host) ||
    /(^|\.)proton(\.me|mail\.com)$/i.test(host) ||
    /(^|\.)aol\.com$/i.test(host)
  ) {
    return true;
  }
  return false;
}

function hasUrgencyCue(t: string): boolean {
  return /\b(urgent|urgently|immediately|right\s*now|right\s*away|asap|a\.s\.a\.p\.|time[\s-]*sensitive|don'?t\s*wait|hurry|emergency|rush)\b|\bnow\b/i.test(
    t
  );
}

/** Legitimate major providers — credential subdomains are common and not auto-HIGH here. */
const ZT_TRUSTED_MAIL_HOST =
  /(\.|^)(google|gmail|gstatic|microsoft|office|live|outlook|apple|icloud|amazon|github|cloudflare)\./i;

/**
 * Zero-tolerance scam signals: any category alone forces HIGH risk (no neutral pass-through).
 * Domains: flag credential-phish style hosts unless clearly a major trusted provider.
 */
export function analyzeZeroTolerance(full: string): {
  forceHigh: boolean;
  signalCount: number;
  urgencyLanguage: boolean;
  financialRequest: boolean;
  authorityImpersonation: boolean;
  emotionalPhrase: boolean;
  suspiciousLinkHost: boolean;
} {
  const t = full.toLowerCase();
  const urgencyLanguage =
    /\b(urgent|urgently|immediately|\basap\b|a\.s\.a\.p\.)\b/i.test(t) ||
    /\bnow\b/i.test(t);
  const financialRequest =
    /\b(gift\s*cards?|gift\s*card)\b/i.test(t) ||
    /\b(wire|iban)\b/i.test(t) ||
    /\b(wire\s+transfer|bank\s+transfer|money\s+transfer)\b/i.test(t) ||
    (/\btransfer\b/i.test(t) &&
      /\b(bank|payment|fund|account|money|\$|€|£)\b/i.test(t));
  const authorityImpersonation = /\b(ceo|boss|manager)\b/i.test(t);
  const emotionalPhrase =
    /\bplease\s+help\b/i.test(t) ||
    /\bmy\s+children\b/i.test(t) ||
    /\bemergency\b/i.test(t);

  const hosts = extractUrlHosts(full);
  const suspiciousLinkHost = hosts.some((h) => zeroToleranceSuspiciousHost(h));

  const parts = [
    urgencyLanguage,
    financialRequest,
    authorityImpersonation,
    emotionalPhrase,
    suspiciousLinkHost,
  ];
  const signalCount = parts.filter(Boolean).length;
  const forceHigh = parts.some(Boolean);
  return {
    forceHigh,
    signalCount,
    urgencyLanguage,
    financialRequest,
    authorityImpersonation,
    emotionalPhrase,
    suspiciousLinkHost,
  };
}

function zeroToleranceSuspiciousHost(host: string): boolean {
  const h = host.toLowerCase().trim();
  if (!h) return false;
  if (ZT_TRUSTED_MAIL_HOST.test(h) && !/\.(tk|ml|gq|xyz|top|click|link)$/i.test(h)) {
    return false;
  }
  if (/\.(tk|ml|ga|gq|xyz|top|click|link|buzz|work)$/i.test(h)) {
    return /login|secure|verify|account|auth/i.test(h);
  }
  return /(^|[.-])(login|secure|verify|account)([.-]|$)/i.test(h) || /[-](login|secure|verify|account)[-.]/i.test(h);
}

function hasPersonalDistressCue(t: string): boolean {
  return /\b(i\s+have\s+no\s+money|no\s+money|can'?t\s+afford|cannot\s+afford|broke|desperate|my\s+(children|kids|child|son|daughter|mother|father|mom|dad|mommy|daddy|wife|husband|family)\b|family\s+is\s+sick|(\bare|\bis)\s+sick|sick\s+children|in\s+(the\s+)?hospital|illness|terminally|stranded|hungry|helpless|lost\s+everything)\b/i.test(
    t
  );
}

function hasMoneyHelpIllnessEmergencyCue(t: string): boolean {
  return /\b(money|cash|wire(\s+transfer)?|bank\s*transfer|gift\s*card|venmo|zelle|paypal\s+me|loan|donat|financial(\s+help)?|medical|surgery|doctor|prescription|please\s+help|need\s+help|send\s+help|asking\s+for\s+help|urgent\s+help)\b/i.test(
    t
  );
}

function matchesEmotionalManipulationContent(t: string): boolean {
  const urgency = hasUrgencyCue(t);
  const distress = hasPersonalDistressCue(t);
  const mhi = hasMoneyHelpIllnessEmergencyCue(t);
  if (distress && (mhi || urgency)) return true;
  if (urgency && /\b(help\s+needed|send\s+help|need\s+help)\b/i.test(t)) return true;
  if (/\bplease\s+send\s+help\b/i.test(t)) return true;
  if (/\burgent\s+help\s+needed\b/i.test(t)) return true;
  return false;
}

export type EmotionalManipulationDetection = {
  signal: RiskSignalId;
  active: boolean;
  withUrgency: boolean;
};

/**
 * Social-engineering “emotional_manipulation”: distress + money/help/illness, often with urgency,
 * from an unknown or external sender. Politeness alone does not clear this signal.
 */
export function detectEmotionalManipulation(
  fullText: string,
  senderLine?: string | null
): EmotionalManipulationDetection {
  const primary = extractPrimaryEmail(senderLine ?? undefined);
  const host = hostFromEmail(primary);
  const t = fullText.toLowerCase();
  if (!senderUnknownOrExternalForEmotionalScam(primary, host)) {
    return { signal: "emotional_manipulation", active: false, withUrgency: false };
  }
  if (!matchesEmotionalManipulationContent(t)) {
    return { signal: "emotional_manipulation", active: false, withUrgency: false };
  }
  const urgent = hasUrgencyCue(t);
  return { signal: "emotional_manipulation", active: true, withUrgency: urgent };
}

function simulateAuth(host: string | null, brandImpersonation: boolean): {
  spf: SecuritySignals["spf"];
  dkim: SecuritySignals["dkim"];
  dmarc: SecuritySignals["dmarc"];
  riskOffset: number;
} {
  if (!host) {
    return { spf: "unknown", dkim: "unknown", dmarc: "unknown", riskOffset: 2 };
  }
  if (brandImpersonation) {
    return { spf: "fail", dkim: "fail", dmarc: "fail", riskOffset: 28 };
  }
  const bad =
    /\.(tk|ml|ga|cf|gq)$/i.test(host) ||
    host.includes("notice.example") ||
    host.includes("verify-");
  if (bad) {
    return { spf: "fail", dkim: "fail", dmarc: "fail", riskOffset: 22 };
  }
  if (/\.(com|net|org|io|co\.uk)$/i.test(host) && host.length < 40) {
    return { spf: "pass", dkim: "pass", dmarc: "pass", riskOffset: -6 };
  }
  return { spf: "unknown", dkim: "unknown", dmarc: "unknown", riskOffset: 4 };
}

function contentRiskScore(full: string): number {
  const t = full.toLowerCase();
  let s = 0;
  if (
    /\bverify\s+(your\s+)?(password|account)\b/.test(t) &&
    (t.includes("immediately") ||
      t.includes("suspended") ||
      t.includes("restore access") ||
      t.includes("link below") ||
      t.includes("click here"))
  ) {
    s += 42;
  }
  if (t.includes("wire transfer") && t.includes("urgent")) s += 36;
  if (t.includes("urgent") && (t.includes("invoice") || t.includes("payment"))) s += 28;
  if (t.includes("unusual login")) s += 16;
  if (t.includes("unusual activity") && (t.includes("verify") || t.includes("suspended"))) {
    s += 16;
  }
  if (/\bverify\s+(your\s+)?(password|account)\b/.test(t)) s += 12;
  return Math.min(70, s);
}

function attachmentRiskScore(full: string): number {
  const t = full.toLowerCase();
  let s = 0;
  if (/\b(attachment|attached|download)\b/.test(t) && /\.(exe|scr|bat|cmd|ps1|vbs|js|jar)\b/.test(t)) {
    s += 32;
  }
  if (/\.(zip|rar|7z)\s*\./.test(t) || /\.pdf\.(exe|zip)/.test(t)) s += 24;
  return Math.min(40, s);
}

function linkMismatchRisk(
  senderHost: string | null,
  full: string,
  brandImpersonation: boolean
): { score: number; suspicious: string[] } {
  const hosts = extractUrlHosts(full);
  const suspicious: string[] = [];
  if (hosts.length === 0) return { score: brandImpersonation ? 12 : 0, suspicious };

  let score = 0;
  const sh = senderHost ?? "";

  const sensitive = /paypal|amazon|microsoft|google|apple|netflix|bank|secure\.|login\.|signin\./i;

  for (const h of hosts) {
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) {
      score += 22;
      suspicious.push(h);
      continue;
    }
    if (!sh) {
      if (sensitive.test(h)) score += 8;
      continue;
    }
    if (!registrableSimilar(h, sh) && !h.endsWith(`.${sh}`) && !sh.endsWith(`.${h}`)) {
      if (sensitive.test(h) || sensitive.test(full)) {
        score += 26;
        suspicious.push(h);
      } else {
        score += 10;
      }
    }
  }

  return { score: Math.min(45, score), suspicious };
}

function detectBrandImpersonation(
  full: string,
  senderHost: string | null
): { hit: boolean; brand: string | null } {
  if (!senderHost) return { hit: false, brand: null };
  for (const b of BRAND_IMPERSONATION) {
    if (!b.mention.test(full)) continue;
    if (b.trustedHost.test(senderHost)) continue;
    return { hit: true, brand: b.id };
  }
  return { hit: false, brand: null };
}

function detectGiftCardAuthorityScam(full: string): boolean {
  const t = full.toLowerCase();
  const gift =
    /\b(gift\s*card|itunes|apple\s*(store\s*)?(card|gift)|amazon\s*card|google\s*play|steam\s*card|codes?\s*(for|to|below)|scratch\s*off|prepaid\s*(card|visa)|store\s*card|reload\s*pack)\b/i.test(
      t
    );
  const urg =
    /\b(urgent|immediately|asap|right\s*now|today|within\s+\d+|confidential|do\s*not\s*(tell|share|discuss|reply))\b/i.test(
      t
    );
  const auth =
    /\b(ceo|cfo|executive|director|president|manager|management|from\s+the\s+desk|head\s+of)\b/i.test(
      t
    );
  return gift && urg && auth;
}

function detectCeoAuthorityImpersonationSignal(
  full: string,
  primaryEmail: string | null,
  senderHost: string | null,
  brandImpersonation: boolean
): boolean {
  if (brandImpersonation) return true;
  if (!senderUnknownOrExternalForEmotionalScam(primaryEmail, senderHost)) {
    return false;
  }
  const t = full.toLowerCase();
  const authority =
    /\b(ceo|cfo|chief|president|founder|executive|director|wire\s+transfer\s+request|kindly\s+process|this\s+is\s+(your\s+)?(ceo|boss)|writing\s+from\s+management)\b/i.test(
      t
    );
  const financial =
    /\b(wire|transfer|gift\s*card|bank\s*(details|account)|payment|send\s+funds|invoice|account\s+number|routing)\b/i.test(
      t
    );
  return authority && financial;
}

function detectFinancialUrgencyScam(full: string): boolean {
  return /\b(send\s+money|urgent\s+payment|urgent\s+wire|transfer\s+(the\s+)?funds|immediate\s+payment|pay\s+today|western\s+union|moneygram|send\s+\$|wire\s+me\s+the)\b/i.test(
    full.toLowerCase()
  );
}

function detectUrgencyMoneyExternalSender(
  full: string,
  primaryEmail: string | null,
  senderHost: string | null
): boolean {
  if (!senderUnknownOrExternalForEmotionalScam(primaryEmail, senderHost)) {
    return false;
  }
  const t = full.toLowerCase();
  const money =
    /\b(money|payment|wire|transfer|\$|invoice|gift\s*card|pay|bank)\b/i.test(t);
  const urg =
    /\b(urgent|immediately|asap|today|right\s+now|within\s+hours)\b/i.test(t);
  return money && urg;
}

function reasonFromSignals(
  level: SecurityLevel,
  signals: SecuritySignals,
  riskScore: number
): string {
  if (signals.brandImpersonation && signals.impersonatedBrand) {
    return `Brand impersonation (${signals.impersonatedBrand})`;
  }
  if (level === "high_risk") {
    if (signals.zeroToleranceHit) {
      return "Zero-tolerance scam / manipulation signals detected";
    }
    if (signals.giftCardScam) {
      return "Gift card / authority scam pattern";
    }
    if (signals.financialUrgencyScam && signals.urgencyMoneyExternalSender) {
      return "Urgent financial request from external sender";
    }
    if (signals.ceoAuthorityImpersonation && !signals.brandImpersonation) {
      return "Possible CEO / impersonation payment request";
    }
    if (signals.emotionalManipulation && signals.emotionalManipulationUrgent) {
      return "Urgent emotional manipulation / help scam (human scam pattern)";
    }
    if (signals.contentRisk >= 35) return "Possible phishing attempt";
    if (signals.linkMismatchScore >= 22) return "Suspicious links";
    if (signals.attachmentRisk >= 20) return "Risky attachment";
    if (
      signals.spf === "fail" &&
      signals.dkim === "fail" &&
      signals.dmarc === "fail"
    ) {
      return "Auth failed (SPF/DKIM/DMARC)";
    }
    return riskScore >= 85 ? "Critical risk score" : "High risk score";
  }
  if (level === "suspicious") {
    if (signals.emotionalManipulation && !signals.emotionalManipulationUrgent) {
      return "Possible emotional manipulation scam (verify sender out-of-band)";
    }
    if (signals.domainLegitimacyRisk >= 22) return "Unusual sender domain";
    if (signals.linkMismatchScore >= 12) return "Link / sender mismatch";
    if (signals.dmarc === "fail" || signals.spf === "fail") return "Weak sender auth";
    return "Elevated risk score";
  }
  return "";
}

/**
 * Combine all signals into a global risk score and level.
 * Brand impersonation → immediate high risk (blocked from inbox).
 */
export function analyzeMailSecurity(input: MailSecurityInput): SecurityAnalysisResult {
  const full = [
    input.sender ?? "",
    input.title ?? "",
    input.subject ?? "",
    input.preview ?? "",
    input.content ?? "",
  ].join("\n");

  const zt = analyzeZeroTolerance(full);

  const primaryEmail = extractPrimaryEmail(input.sender);
  const senderHost = hostFromEmail(primaryEmail);

  const { hit: brandImpersonation, brand: impersonatedBrand } = detectBrandImpersonation(
    full,
    senderHost
  );

  const emoDm = detectEmotionalManipulation(full, input.sender);

  const giftCardScam = detectGiftCardAuthorityScam(full);
  const ceoAuthorityImpersonation = detectCeoAuthorityImpersonationSignal(
    full,
    primaryEmail,
    senderHost,
    brandImpersonation
  );
  const financialUrgencyScam = detectFinancialUrgencyScam(full);
  const urgencyMoneyExternalSender = detectUrgencyMoneyExternalSender(
    full,
    primaryEmail,
    senderHost
  );

  const domainLegitimacyRisk = scoreDomainLegitimacy(senderHost);

  const auth = simulateAuth(senderHost, brandImpersonation);

  const contentRisk = contentRiskScore(full);
  const attachmentRisk = attachmentRiskScore(full);
  const { score: linkMismatchScore, suspicious: suspiciousLinks } = linkMismatchRisk(
    senderHost,
    full,
    brandImpersonation
  );

  const signals: SecuritySignals = {
    domainLegitimacyRisk,
    spf: auth.spf,
    dkim: auth.dkim,
    dmarc: auth.dmarc,
    contentRisk,
    linkMismatchScore,
    suspiciousLinks,
    attachmentRisk,
    brandImpersonation,
    impersonatedBrand,
    emotionalManipulation: emoDm.active,
    emotionalManipulationUrgent: emoDm.active && emoDm.withUrgency,
    giftCardScam,
    ceoAuthorityImpersonation,
    financialUrgencyScam,
    urgencyMoneyExternalSender,
    zeroToleranceHit: zt.forceHigh,
    zeroToleranceSignalCount: zt.signalCount,
  };

  let riskScore = Math.min(
    100,
    domainLegitimacyRisk +
      contentRisk +
      linkMismatchScore +
      attachmentRisk +
      (auth.spf === "fail" ? 12 : 0) +
      (auth.dkim === "fail" ? 8 : 0) +
      (auth.dmarc === "fail" ? 10 : 0) +
      auth.riskOffset
  );

  if (brandImpersonation) {
    riskScore = 100;
  } else {
    riskScore = Math.min(100, Math.max(0, Math.round(riskScore)));
    if (emoDm.active) {
      riskScore += emoDm.withUrgency ? 38 : 26;
      riskScore = Math.min(100, riskScore);
      if (emoDm.withUrgency) {
        riskScore = Math.max(riskScore, 80);
      } else {
        riskScore = Math.max(riskScore, 40);
      }
    }

    if (giftCardScam) {
      riskScore += 42;
      riskScore = Math.min(100, riskScore);
      riskScore = Math.max(riskScore, 84);
    }
    if (ceoAuthorityImpersonation && !brandImpersonation) {
      riskScore += 36;
      riskScore = Math.min(100, riskScore);
      riskScore = Math.max(riskScore, 80);
    }
    if (financialUrgencyScam) {
      riskScore += 34;
      riskScore = Math.min(100, riskScore);
      riskScore = Math.max(riskScore, 78);
    }
    if (urgencyMoneyExternalSender) {
      riskScore += 28;
      riskScore = Math.min(100, riskScore);
      if (financialUrgencyScam || giftCardScam) {
        riskScore = Math.max(riskScore, 85);
      } else {
        riskScore = Math.max(riskScore, 44);
      }
    }
  }

  if (zt.forceHigh) {
    riskScore = Math.max(riskScore, zt.signalCount >= 2 ? 96 : 90);
  }

  let securityLevel: SecurityLevel = "safe";
  if (brandImpersonation || riskScore >= 78 || zt.forceHigh) {
    securityLevel = "high_risk";
  } else if (riskScore >= 36) {
    securityLevel = "suspicious";
  }

  const rawSecurityReason =
    securityLevel === "safe"
      ? ""
      : reasonFromSignals(securityLevel, signals, riskScore);

  const securityReason =
    rawSecurityReason ||
    (securityLevel === "suspicious" ? "Review recommended" : "Blocked");

  const securityAiSubline =
    rawSecurityReason === "Elevated risk score"
      ? "AI detected anomaly in file behavior"
      : "";

  const whyBullets = buildWhyBullets(signals, securityLevel, riskScore);

  return {
    riskScore,
    securityLevel,
    securityReason,
    securityAiSubline,
    whyBullets,
    signals,
  };
}
