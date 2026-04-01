/**
 * Phishing Layer System (PLS) — lightweight multi-signal scoring (client-side, O(n) on body length).
 */

import { hasBlockedDomainMatch } from "@/lib/threatEngine";

export type PlsRiskLevel = "safe" | "suspicious" | "dangerous";

export type PlsLayerScores = {
  ai: number;
  threatMemory: number;
  pattern: number;
  link: number;
};

export type PlsResult = {
  risk_level: PlsRiskLevel;
  /** Combined score 0–100 */
  score: number;
  layers: PlsLayerScores;
};

function norm(s: string): string {
  return String(s || "")
    .trim()
    .toLowerCase();
}

/** Domains mentioned in text (simple token scan; fast). */
function extractDomainsFromText(text: string): string[] {
  const matches = norm(text).match(/[a-z0-9][a-z0-9.-]*\.[a-z]{2,}/g) || [];
  return Array.from(new Set(matches.map((m) => m.replace(/^\.+/, ""))));
}

const URGENCY = [
  "urgent",
  "immediately",
  "right away",
  "act now",
  "expire",
  "expires",
  "suspended",
  "verify now",
  "confirm now",
  "limited time",
  "asap",
  "within 24 hours",
  "account locked",
];

const PHISH_KEYWORDS = [
  "password",
  "wire transfer",
  "gift card",
  "click here",
  "verify account",
  "unusual activity",
  "social security",
  "tax refund",
  "invoice attached",
];

const URL_RE = /https?:\/\/[^\s<>"')\]]+/gi;

const RISKY_TLD = [
  ".tk",
  ".ml",
  ".ga",
  ".cf",
  ".gq",
  ".xyz",
  ".top",
  ".click",
  ".download",
  ".loan",
];

/** Single URL quick heuristics; returns 0–14 contribution before cap. */
function linkLayerPoints(rawUrl: string): number {
  let pts = 0;
  const cleaned = rawUrl.replace(/[.,;]+$/g, "");
  const m = cleaned.match(/^https?:\/\/([^/\s:#?]+)/i);
  if (!m) return 0;
  const host = norm(m[1]);
  if (!host) return 0;

  // Literal IPv4 in host
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) pts += 12;
  // Userinfo abuse
  if (host.includes("@")) pts += 8;

  const segments = host.split(".");
  if (segments.length > 4) pts += 5;

  for (const t of RISKY_TLD) {
    if (host.endsWith(t)) {
      pts += 9;
      break;
    }
  }

  const hyphenCount = (host.match(/-/g) || []).length;
  if (hyphenCount >= 3) pts += 6;
  else if (hyphenCount >= 2) pts += 3;

  // Long compound host often used in phishing
  if (host.length > 36) pts += 4;

  return Math.min(14, pts);
}

function aiLayerPoints(level: PlsRiskLevel): number {
  if (level === "dangerous") return 44;
  if (level === "suspicious") return 26;
  return 6;
}

/**
 * Combine AI verdict, threat memory, lexical patterns, and link heuristics.
 */
export function evaluatePls(input: {
  threatContext: string;
  apiRiskLevel: PlsRiskLevel;
  learnedBlockedDomains: string[];
}): PlsResult {
  const ctx = norm(input.threatContext);

  const ai = aiLayerPoints(input.apiRiskLevel);

  let threatMemory = 0;
  const engineBlock = hasBlockedDomainMatch(input.threatContext);
  const doms = extractDomainsFromText(ctx);
  const learned = input.learnedBlockedDomains.map((d) => norm(d)).filter(Boolean);
  const learnedHit =
    learned.length > 0 && doms.some((d) => learned.includes(d));

  if (engineBlock || learnedHit) threatMemory = 44;

  let pattern = 0;
  for (const w of URGENCY) {
    if (ctx.includes(w)) pattern += 3;
  }
  for (const w of PHISH_KEYWORDS) {
    if (ctx.includes(w)) pattern += 3;
  }
  pattern = Math.min(20, pattern);

  let link = 0;
  const urls = ctx.match(URL_RE) || [];
  for (let i = 0; i < urls.length && i < 8; i++) {
    link += linkLayerPoints(urls[i]);
  }
  link = Math.min(22, link);

  const raw = ai + threatMemory + pattern + link;
  const score = Math.min(100, Math.round(raw));

  let risk_level: PlsRiskLevel = "safe";
  if (score >= 64) risk_level = "dangerous";
  else if (score >= 34) risk_level = "suspicious";

  // Hard guard: known blocked domain in content → dangerous
  if (engineBlock || learnedHit) risk_level = "dangerous";

  return {
    risk_level,
    score,
    layers: {
      ai,
      threatMemory,
      pattern,
      link,
    },
  };
}
