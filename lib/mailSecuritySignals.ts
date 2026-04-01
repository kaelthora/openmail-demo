/**
 * Multi-signal mail security analysis (heuristic / demo).
 * Combines domain, simulated auth, content, links, attachments, and brand impersonation.
 */

export type SecurityLevel = "safe" | "suspicious" | "high_risk";

export type MailSecurityInput = {
  sender?: string;
  title?: string;
  subject?: string;
  preview?: string;
  content?: string;
};

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
};

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

function reasonFromSignals(
  level: SecurityLevel,
  signals: SecuritySignals,
  riskScore: number
): string {
  if (signals.brandImpersonation && signals.impersonatedBrand) {
    return `Brand impersonation (${signals.impersonatedBrand})`;
  }
  if (level === "high_risk") {
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

  const primaryEmail = extractPrimaryEmail(input.sender);
  const senderHost = hostFromEmail(primaryEmail);

  const { hit: brandImpersonation, brand: impersonatedBrand } = detectBrandImpersonation(
    full,
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
  }

  let securityLevel: SecurityLevel = "safe";
  if (brandImpersonation || riskScore >= 78) {
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
