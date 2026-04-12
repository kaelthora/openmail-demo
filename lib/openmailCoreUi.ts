import type { ProcessedMail } from "@/lib/mailTypes";

/** Raw model confidence 0–1 (synced `intentConfidence` preferred, else processed mail). */
export function rawIntentConfidence(mail: ProcessedMail | null): number {
  if (!mail) return 0.72;
  const sc = mail.syncedAi?.intentConfidence;
  if (typeof sc === "number" && Number.isFinite(sc)) {
    return Math.min(1, Math.max(0, sc));
  }
  const ic = mail.intentConfidence;
  if (typeof ic === "number" && Number.isFinite(ic)) {
    return Math.min(1, Math.max(0, ic));
  }
  return 0.72;
}

export type CoreIntentGuidanceKind = "recommended" | "review_suggested";

/** UI copy thresholds for intent trust (independent of displayed % bar). */
export function coreIntentGuidanceFromConfidence(
  raw: number
): CoreIntentGuidanceKind | null {
  if (raw > 0.8) return "recommended";
  if (raw < 0.5) return "review_suggested";
  return null;
}

export type CoreTrustTier = "high" | "moderate" | "low";

/** Intent trust band for CORE header (0–1 model confidence). */
export function coreTrustTierFromRaw(raw: number): CoreTrustTier {
  if (raw >= 0.72) return "high";
  if (raw < 0.45) return "low";
  return "moderate";
}

/** Display 0–100% from raw intent confidence. */
export function coreIntentTrustPercent(raw: number): number {
  return Math.round(Math.min(100, Math.max(0, raw * 100)));
}

export function coreTrustTierLabel(tier: CoreTrustTier): string {
  if (tier === "high") return "High confidence";
  if (tier === "moderate") return "Moderate confidence";
  return "Low confidence";
}

/** Plain-text snippet for CORE (prefers list preview, else stripped HTML body). */
export function coreMailPreviewPlain(mail: ProcessedMail | null): string {
  if (!mail) return "";
  const p = mail.preview?.replace(/\s+/g, " ").trim();
  if (p) return p;
  const raw = mail.content ?? "";
  const stripped = raw
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return stripped;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Phrases in message text that commonly correlate with elevated risk (demo + real). */
const RISK_TEXT_SNIPPETS_RE =
  /\b(?:verify your (?:account|identity)|wire transfer|gift card|password reset|account (?:suspended|locked|compromised)|unusual (?:activity|login)|click (?:here|below|this link)|urgent action required|confirm your (?:details|information)|update your payment|tax refund|invoice attached|crypto wallet|seed phrase)\b/gi;

/**
 * Model certainty for the current CORE assessment (intent + security band).
 * Not a statistical guarantee — UX signal for trust.
 */
export function coreAiConfidencePercent(
  mail: ProcessedMail | null,
  opts?: { aggressionHigh?: boolean }
): number | null {
  if (!mail) return null;

  const intentBase =
    typeof mail.syncedAi?.intentConfidence === "number" &&
    Number.isFinite(mail.syncedAi.intentConfidence)
      ? mail.syncedAi.intentConfidence
      : typeof mail.intentConfidence === "number" && Number.isFinite(mail.intentConfidence)
        ? mail.intentConfidence
        : 0.78;

  let pct = Math.round(Math.min(0.97, Math.max(0.52, intentBase)) * 100);

  if (mail.syncedAi?.risk === "high") {
    pct = Math.min(96, Math.max(pct, 88));
  } else if (mail.syncedAi?.risk === "medium") {
    pct = Math.min(92, Math.max(pct, 76));
  } else if (mail.syncedAi?.risk === "safe") {
    pct = Math.min(95, Math.max(pct, 74));
  }

  if (mail.securityLevel === "high_risk") {
    pct = Math.min(97, Math.max(pct, 86));
  } else if (mail.securityLevel === "suspicious") {
    pct = Math.min(94, Math.max(pct, 72));
  } else if (mail.securityLevel === "safe") {
    pct = Math.min(96, Math.max(pct, 70));
  }

  const rs = mail.securityRiskScore;
  if (typeof rs === "number" && rs >= 70) {
    pct = Math.min(98, pct + 4);
  }

  if (opts?.aggressionHigh) {
    pct = Math.min(99, pct + 4);
  }

  return Math.min(99, Math.max(55, pct));
}

function addPhrase(set: Set<string>, raw: string) {
  const t = raw.replace(/\s+/g, " ").trim();
  if (t.length >= 3 && t.length <= 120) set.add(t);
}

/**
 * Phrases to highlight in the CORE email snippet (risk triggers).
 */
export function collectRiskHighlightPhrases(mail: ProcessedMail | null): string[] {
  if (!mail) return [];
  const set = new Set<string>();

  for (const b of mail.securityWhyBullets) {
    addPhrase(set, b);
    for (const chunk of b.split(/[,;•]/)) addPhrase(set, chunk);
  }

  const reason = mail.syncedAi?.reason?.trim() || mail.securityReason?.trim();
  if (reason) {
    for (const chunk of reason.split(/[.;]/)) addPhrase(set, chunk);
  }

  const sum = mail.syncedAi?.summary?.trim();
  if (sum) {
    for (const chunk of sum.split(/[.;]/)) addPhrase(set, chunk);
  }

  const blob = `${mail.subject}\n${mail.preview}\n${mail.content}`;
  let m: RegExpExecArray | null;
  RISK_TEXT_SNIPPETS_RE.lastIndex = 0;
  while ((m = RISK_TEXT_SNIPPETS_RE.exec(blob)) !== null) {
    addPhrase(set, m[0]);
  }

  return [...set].sort((a, b) => b.length - a.length).slice(0, 18);
}

export type TextHighlightSegment = { text: string; hit: boolean };

export function splitTextWithHighlights(
  text: string,
  phrases: string[]
): TextHighlightSegment[] {
  const clean = [...new Set(phrases.map((p) => p.trim()).filter((p) => p.length >= 3))]
    .sort((a, b) => b.length - a.length)
    .slice(0, 24);
  if (!text || clean.length === 0) return [{ text, hit: false }];

  const pattern = clean.map(escapeRegExp).join("|");
  if (!pattern) return [{ text, hit: false }];

  const re = new RegExp(`(${pattern})`, "gi");
  const parts = text.split(re).filter((p) => p.length > 0);
  return parts.map((part) => ({
    text: part,
    hit: clean.some((c) => c.toLowerCase() === part.toLowerCase()),
  }));
}

// --- CORE explainability: risk / urgency / intent highlights + “Detected because” ---

export type CoreExplainHighlightKind = "risk" | "urgency" | "intent";

export type CoreExplainSegment = {
  text: string;
  kind: CoreExplainHighlightKind | null;
};

type ExplainHit = { pattern: string; kind: CoreExplainHighlightKind };

function explainKindPriority(k: CoreExplainHighlightKind): number {
  if (k === "risk") return 0;
  if (k === "urgency") return 1;
  return 2;
}

const URGENCY_TRIGGER_RES: RegExp[] = [
  /\b(?:urgent|urgently|asap|a\.s\.a\.p\.|eod|e\.o\.d\.|end of (?:the )?day|immediately|right away|within the hour)\b/gi,
  /\b(?:by tomorrow|by (?:monday|tuesday|wednesday|thursday|friday)|deadline|expires (?:on|soon)|today only|final notice)\b/gi,
  /\b(?:this week|as soon as possible|at your earliest|time-?sensitive|rush)\b/gi,
];

function collectRiskExplainPhrases(mail: ProcessedMail): string[] {
  const set = new Set<string>();
  const blob = `${mail.subject}\n${mail.preview}\n${mail.content}`;
  let m: RegExpExecArray | null;
  RISK_TEXT_SNIPPETS_RE.lastIndex = 0;
  while ((m = RISK_TEXT_SNIPPETS_RE.exec(blob)) !== null) {
    addPhrase(set, m[0]);
  }
  for (const b of mail.securityWhyBullets.slice(0, 3)) {
    addPhrase(set, b);
  }
  if (mail.securityLevel !== "safe") {
    const reason = mail.syncedAi?.reason?.trim() || mail.securityReason?.trim();
    if (reason) {
      const first = reason.split(/[.;]/)[0]?.trim();
      if (first) addPhrase(set, first);
    }
  }
  return [...set].sort((a, b) => b.length - a.length).slice(0, 14);
}

function collectUrgencyExplainPhrases(mail: ProcessedMail): string[] {
  const set = new Set<string>();
  const blob = `${mail.subject}\n${mail.preview}\n${mail.content}`;
  for (const re of URGENCY_TRIGGER_RES) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(blob)) !== null) {
      addPhrase(set, m[0]);
    }
  }
  if (mail.syncedAi?.intentUrgency === "high") {
    addPhrase(set, "urgent");
  }
  return [...set].sort((a, b) => b.length - a.length).slice(0, 12);
}

function collectIntentExplainPhrases(mail: ProcessedMail): string[] {
  const set = new Set<string>();
  const blob = `${mail.subject}\n${mail.preview}\n${mail.content}`;
  const run = (re: RegExp) => {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(blob)) !== null) {
      addPhrase(set, m[0]);
    }
  };
  const si = mail.syncedAi?.intent;
  if (si === "ignore") {
    run(/\b(?:unsubscribe|newsletter|no[- ]?reply needed|promotional|digest)\b/gi);
  } else if (si === "escalate") {
    run(/\b(?:escalat|phish|breach|compliance|legal|fraud|lawsuit|security incident)\b/gi);
  } else if (si === "review") {
    run(
      /\b(?:please review|contract|attachment|approval needed|sign (?:off|here)|invoice attached)\b/gi
    );
  } else if (si === "reply") {
    run(
      /\b(?:please (?:reply|confirm)|can you|could you|let me know|waiting for your|need your response)\b/gi
    );
  }
  if (mail.intent === "pay") {
    run(/\b(?:invoice|payment due|wire transfer|remit|purchase order)\b/gi);
  }
  if (mail.intent === "schedule") {
    run(/\b(?:meeting|calendar invite|zoom|teams call|reschedule|book a time)\b/gi);
  }
  if (mail.intent === "follow_up") {
    run(/\b(?:follow(?:[ -])?up|checking in|any update|circling back)\b/gi);
  }
  if (mail.intent === "reply" && !si) {
    run(/\b(?:can you|please|would you)\b/gi);
  }
  return [...set].sort((a, b) => b.length - a.length).slice(0, 12);
}

function mergeExplainHits(
  risk: string[],
  urgency: string[],
  intent: string[]
): ExplainHit[] {
  const map = new Map<string, ExplainHit>();

  const tryAdd = (pattern: string, kind: CoreExplainHighlightKind) => {
    const t = pattern.replace(/\s+/g, " ").trim();
    if (t.length < 3 || t.length > 96) return;
    const key = t.toLowerCase();
    const prev = map.get(key);
    if (
      !prev ||
      explainKindPriority(kind) < explainKindPriority(prev.kind)
    ) {
      map.set(key, { pattern: t, kind });
    }
  };

  for (const p of risk) tryAdd(p, "risk");
  for (const p of urgency) tryAdd(p, "urgency");
  for (const p of intent) tryAdd(p, "intent");

  return [...map.values()].sort((a, b) => b.pattern.length - a.pattern.length);
}

/**
 * Phrase hits for snippet highlighting (risk > urgency > intent on overlap).
 */
export function buildCoreExplainHighlightHits(
  mail: ProcessedMail | null
): ExplainHit[] {
  if (!mail) return [];
  return mergeExplainHits(
    collectRiskExplainPhrases(mail),
    collectUrgencyExplainPhrases(mail),
    collectIntentExplainPhrases(mail)
  );
}

export function splitTextWithExplainHighlights(
  text: string,
  hits: ExplainHit[]
): CoreExplainSegment[] {
  if (!text) return [{ text: "", kind: null }];
  if (hits.length === 0) return [{ text, kind: null }];

  const ordered = [...hits].sort((a, b) => b.pattern.length - a.pattern.length);
  const patternStr = ordered.map((h) => escapeRegExp(h.pattern)).join("|");
  if (!patternStr) return [{ text, kind: null }];

  const re = new RegExp(`(${patternStr})`, "gi");
  const parts = text.split(re).filter((p) => p.length > 0);
  return parts.map((part) => {
    const hit = ordered.find(
      (h) => h.pattern.toLowerCase() === part.toLowerCase()
    );
    return { text: part, kind: hit?.kind ?? null };
  });
}

/**
 * 1–2 short transparency lines for CORE (AI reason, then urgency/intent or security).
 */
export function buildCoreDetectionReasons(mail: ProcessedMail | null): string[] {
  if (!mail) return [];
  const out: string[] = [];
  const sa = mail.syncedAi;

  const firstClause = (s: string | null | undefined, max = 130) => {
    if (!s) return "";
    const t = s.replace(/\s+/g, " ").trim().split(/[.;\n]/)[0]?.trim() ?? "";
    if (t.length < 14) return "";
    return t.length <= max ? t : `${t.slice(0, max - 1)}…`;
  };

  const r = firstClause(sa?.reason);
  if (r) out.push(r);

  if (out.length < 2 && sa?.intentUrgency === "high") {
    out.push(
      "Urgency is elevated from time-sensitive or deadline language in the message."
    );
  }

  if (out.length < 2 && sa?.intent) {
    const byIntent: Record<string, string> = {
      reply:
        "Intent reads as a thread that expects a direct reply or confirmation.",
      ignore:
        "Intent reads as low-touch or bulk mail that often needs no response.",
      escalate:
        "Intent flags content we recommend escalating before you click or reply.",
      review:
        "Intent is to review details or attachments carefully before acting.",
    };
    const line = byIntent[sa.intent];
    if (line && !out.some((x) => x.slice(0, 40) === line.slice(0, 40))) {
      out.push(line);
    }
  }

  if (out.length === 0 && mail.securityReason?.trim()) {
    out.push(firstClause(mail.securityReason) || mail.securityReason.trim().slice(0, 130));
  }

  if (out.length < 2 && mail.securityWhyBullets.length > 0) {
    const b = firstClause(mail.securityWhyBullets[0]);
    if (b && !out.some((x) => x.toLowerCase().includes(b.slice(0, 24).toLowerCase()))) {
      out.push(b);
    }
  }

  if (out.length === 0 && sa?.summary?.trim()) {
    out.push(firstClause(sa.summary) || sa.summary.trim().slice(0, 130));
  }

  return out.slice(0, 2);
}
