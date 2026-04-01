/**
 * Central AI orchestration — security (PLS + rules) unified with contact,
 * conversation, and global threat memory for tone, risk, and reply shaping.
 */

import { buildArsReply } from "@/lib/arsEngine";
import { getContext } from "@/lib/contextEngine";
import { evaluatePls, type PlsResult } from "@/lib/plsEngine";
import { getContactProfile } from "@/lib/relationshipEngine";
import {
  addThreat,
  getThreatMemorySnapshot,
  getThreatStats,
  hasBlockedDomainMatch,
  hasScamPatternMatch,
} from "@/lib/threatEngine";

export type AiCoreRiskLevel = "safe" | "suspicious" | "dangerous";
export type AiCoreAction = "allow" | "flag" | "quarantine";
export type AiCoreTone = "professional" | "friendly" | "formal";

export type AiCoreEmail = {
  sender: string;
  subject: string;
  content: string;
  id?: number | string;
};

/** Snapshot of relationship + thread + corpus (all optional for backward compat). */
export type AiContactProfileSnapshot = {
  email: string;
  preferredTone?: string;
  lastSelectedStyle?: string;
  interactionCount: number;
};

export type AiConversationSnapshot = {
  lastMessages: string[];
  lastSummary: string;
};

export type AiThreatMemorySnapshot = {
  blockedDomains: number;
  flaggedPatterns: number;
  knownScamKeywords: number;
};

export type AiGlobalContext = {
  contact?: AiContactProfileSnapshot;
  conversation?: AiConversationSnapshot;
  threatMemory?: AiThreatMemorySnapshot;
};

export type AiUserContext = {
  learnedBlockedDomains: string[];
  blockedSenders: string[];
  safeSenders: string[];
  apiRiskLevel: AiCoreRiskLevel;
  apiSummary?: string;
  apiConfidence?: number;
  /** When set, adjusts risk, explanation tone, and suggested replies. */
  globalContext?: AiGlobalContext;
};

export type AiCoreResult = {
  risk_level: AiCoreRiskLevel;
  action: AiCoreAction;
  explanation: string;
  suggestedReply: string | null;
  /** Effective voice used for suggestedReply / ARS. */
  tone: AiCoreTone;
  /** Human-readable notes on how global context influenced the outcome. */
  contextNotes: string[];
};

export type AiCoreFullResult = AiCoreResult & {
  pls: PlsResult;
  threat_blocked_domain: boolean;
  threat_scam_pattern: boolean;
  memoryHit: boolean;
};

export function extractDomainsFromEmailContent(content: string): string[] {
  const matches =
    String(content || "")
      .toLowerCase()
      .match(/[a-z0-9.-]+\.[a-z]{2,}/g) || [];
  return Array.from(new Set(matches));
}

const DANGEROUS_CONTENT_KEYWORDS = [
  "urgent",
  "verify now",
  "account suspended",
  "password reset",
  "click here",
  "security alert",
  "confirm identity",
];

export function ingestDangerousMailThreats(mail: AiCoreEmail): void {
  const domains = extractDomainsFromEmailContent(mail.content);
  domains.forEach((d) => addThreat(d));

  const content = String(mail.content || "").toLowerCase();
  DANGEROUS_CONTENT_KEYWORDS.forEach((keyword) => {
    if (content.includes(keyword)) addThreat("", keyword);
  });
}

export function getThreatIntelSnapshot() {
  return getThreatMemorySnapshot();
}

export function getThreatMemoryMetrics(): AiThreatMemorySnapshot {
  const s = getThreatStats();
  return {
    blockedDomains: s.blockedDomains,
    flaggedPatterns: s.flaggedPatterns,
    knownScamKeywords: s.knownScamKeywords,
  };
}

export function inspectThreatMemory(context: string): {
  blockedDomain: boolean;
  scamPattern: boolean;
  memoryHit: boolean;
} {
  const blockedDomain = hasBlockedDomainMatch(context);
  const scamPattern = hasScamPatternMatch(context);
  return {
    blockedDomain,
    scamPattern,
    memoryHit: blockedDomain || scamPattern,
  };
}

export function recordUserBlockedDomain(domain: string): void {
  const d = String(domain || "").trim().toLowerCase();
  if (d) addThreat(d);
}

/** Stable key for profile + context stores (email if present, else normalized sender slug). */
export function contactKeyFromEmail(email: AiCoreEmail): string {
  const from = norm(email.sender);
  const angle = from.match(/<([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})>/i);
  if (angle) return angle[1];
  const bare = from.match(/([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})/i);
  if (bare) return bare[1];
  const slug = from.replace(/[^a-z0-9]+/g, ".").replace(/^\.|\.$/g, "");
  return (slug || "unknown").slice(0, 80) + ".contact.local";
}

/** Build unified global snapshot for orchestration (contact + thread + corpus). */
export function buildGlobalContextSnapshot(email: AiCoreEmail): AiGlobalContext {
  const key = contactKeyFromEmail(email);
  const profile = getContactProfile(key);
  const conv = getContext(key);
  return {
    contact: {
      email: profile.email,
      preferredTone: profile.preferredTone,
      lastSelectedStyle: profile.lastSelectedStyle,
      interactionCount: profile.interactionCount,
    },
    conversation: {
      lastMessages: [...conv.lastMessages],
      lastSummary: conv.lastSummary,
    },
    threatMemory: getThreatMemoryMetrics(),
  };
}

export function getEffectiveTone(global?: AiGlobalContext): AiCoreTone {
  if (!global?.contact) return "professional";
  const raw = (
    global.contact.preferredTone ||
    global.contact.lastSelectedStyle ||
    ""
  ).toLowerCase();
  if (raw.includes("friend") || raw.includes("casual")) return "friendly";
  if (raw.includes("formal") || raw.includes("legal")) return "formal";
  return "professional";
}

/** ARS / Sent — tone- and thread-aware when options omitted, uses live global snapshot. */
export function composeAutoDefenseReply(
  mail: AiCoreEmail,
  options?: { tone?: AiCoreTone; threadHint?: string }
): { to: string; subject: string; body: string } {
  const global = buildGlobalContextSnapshot(mail);
  const tone = options?.tone ?? getEffectiveTone(global);
  const threadHint =
    options?.threadHint ?? (global.conversation?.lastSummary || "");

  const base = buildArsReply({
    sender: mail.sender,
    subject: mail.subject,
    content: mail.content,
  });

  const body = weaveDefenseBody(tone, threadHint, base.body);
  return { ...base, body };
}

function weaveDefenseBody(
  tone: AiCoreTone,
  threadHint: string,
  fallbackBody: string
): string {
  const thread =
    threadHint && threadHint.length > 0
      ? `\n\n(We’re replying carefully given recent thread context on file.)`
      : "";

  if (tone === "friendly") {
    return [
      "Hi — thanks for your message.",
      "",
      "We’ve flagged this as needing a quick security review, so we won’t act on anything sensitive from this thread.",
      thread,
      "",
      "If this is really you, please reach out through a channel we already trust.",
      "",
      "Thanks again,",
    ]
      .filter(Boolean)
      .join("\n");
  }

  if (tone === "formal") {
    return [
      "Sir/Madam,",
      "",
      "This correspondence has been classified for security review. No operational action will be taken on the basis of this message.",
      thread,
      "",
      "Kindly use an established, authenticated channel should the matter be legitimate.",
      "",
      "Respectfully,",
    ]
      .join("\n");
  }

  return thread ? `${fallbackBody}${thread}` : fallbackBody;
}

function norm(s: string): string {
  return String(s || "").trim().toLowerCase();
}

export function mailThreatContext(email: AiCoreEmail): string {
  return [
    String(email.sender || ""),
    String(email.subject || ""),
    String(email.content || ""),
  ].join("\n");
}

export function extractSenderDomain(email: AiCoreEmail): string {
  const senderText = norm(email.sender);
  const senderEmailMatch = senderText.match(
    /[a-z0-9._%+-]+@([a-z0-9.-]+\.[a-z]{2,})/
  );
  if (senderEmailMatch?.[1]) return senderEmailMatch[1];

  const contentText = String(email.content || "");
  const urlMatch = contentText.match(/https?:\/\/([a-z0-9.-]+\.[a-z]{2,})/i);
  if (urlMatch?.[1]) return urlMatch[1].toLowerCase();

  return senderText.replace(/\s+/g, "-");
}

function mapAction(level: AiCoreRiskLevel): AiCoreAction {
  if (level === "dangerous") return "quarantine";
  if (level === "suspicious") return "flag";
  return "allow";
}

type CoreSignals = {
  risk_level: AiCoreRiskLevel;
  pls: PlsResult;
  threatMemDomain: boolean;
  threatMemPattern: boolean;
  domainBlocked: boolean;
  senderBlocked: boolean;
  senderTrusted: boolean;
  contextRiskNote?: string;
};

export function resolveEmailCore(
  email: AiCoreEmail,
  userContext: AiUserContext
): CoreSignals {
  const threatCtx = mailThreatContext(email);
  const sender = norm(email.sender);
  const domain = String(extractSenderDomain(email) || "")
    .trim()
    .toLowerCase();

  const pls = evaluatePls({
    threatContext: threatCtx,
    apiRiskLevel: userContext.apiRiskLevel,
    learnedBlockedDomains: userContext.learnedBlockedDomains,
  });

  const threatMemDomain = hasBlockedDomainMatch(threatCtx);
  const threatMemPattern = hasScamPatternMatch(threatCtx);

  const domainBlocked = userContext.learnedBlockedDomains.some(
    (d) => norm(d) === domain
  );
  const senderBlocked = userContext.blockedSenders.some(
    (s) => norm(s) === sender
  );
  const senderTrusted = userContext.safeSenders.includes(sender);

  let risk_level: AiCoreRiskLevel = pls.risk_level;

  if (domainBlocked || senderBlocked) {
    risk_level = "dangerous";
  } else if (senderTrusted) {
    risk_level = "safe";
  }

  return {
    risk_level,
    pls,
    threatMemDomain,
    threatMemPattern,
    domainBlocked,
    senderBlocked,
    senderTrusted,
  };
}

/**
 * Adjust risk using contact familiarity, thread emptiness, and corpus size.
 * Never overrides hard blocks, trust, or dangerous + memory hits.
 */
function applyGlobalRiskNudge(
  core: CoreSignals,
  global?: AiGlobalContext
): CoreSignals {
  if (!global) return core;
  if (core.domainBlocked || core.senderBlocked || core.senderTrusted) {
    return core;
  }
  if (core.risk_level === "dangerous") return core;

  const interactions = global.contact?.interactionCount ?? 0;
  const tm = global.threatMemory;
  const corpusWeight =
    (tm?.blockedDomains ?? 0) + (tm?.flaggedPatterns ?? 0);
  const stranger = interactions === 0;
  const familiar = interactions >= 2;
  const hasThread = (global.conversation?.lastMessages?.length ?? 0) > 0;

  let risk = core.risk_level;
  let contextRiskNote: string | undefined;

  if (
    familiar &&
    risk === "suspicious" &&
    !core.threatMemDomain &&
    !core.threatMemPattern &&
    core.pls.score <= 40
  ) {
    risk = "safe";
    contextRiskNote =
      "Risk softened: familiar contact, no threat-memory hits, and moderate PLS.";
  } else if (
    stranger &&
    !hasThread &&
    risk === "safe" &&
    core.pls.score >= 31 &&
    core.pls.score < 36
  ) {
    risk = "suspicious";
    contextRiskNote =
      "Risk raised slightly: new contact, no prior thread, borderline PLS.";
  } else if (
    corpusWeight >= 8 &&
    risk === "safe" &&
    core.pls.score >= 26 &&
    core.pls.score < 34
  ) {
    risk = "suspicious";
    contextRiskNote =
      "Risk raised slightly: large threat corpus on file — extra caution.";
  }

  return { ...core, risk_level: risk, contextRiskNote };
}

export function finalizeEmailCore(
  email: AiCoreEmail,
  userContext: AiUserContext
): CoreSignals {
  const base = resolveEmailCore(email, userContext);
  return applyGlobalRiskNudge(base, userContext.globalContext);
}

function buildExplanation(
  core: CoreSignals,
  apiSummary: string | undefined,
  global: AiGlobalContext | undefined,
  tone: AiCoreTone
): string {
  const parts: string[] = [];

  parts.push(`Unified tone: ${tone}.`);

  if (core.domainBlocked) {
    parts.push(
      "Treated as dangerous: the sender domain is on your blocked list."
    );
  } else if (core.senderBlocked) {
    parts.push(
      "Treated as dangerous: this sender is on your blocked list."
    );
  } else if (core.senderTrusted) {
    parts.push(
      "Sender is trusted in your rules, so the message is allowed even if other signals were elevated."
    );
  }

  if (core.contextRiskNote) {
    parts.push(`Context adjustment: ${core.contextRiskNote}`);
  }

  if (global?.contact) {
    const c = global.contact;
    parts.push(
      `Contact profile: ${c.interactionCount} prior interactions; preferred tone “${c.preferredTone || "default"}”.`
    );
  }

  if (global?.conversation?.lastSummary) {
    parts.push(`Conversation context: ${global.conversation.lastSummary}`);
  }

  if (global?.threatMemory) {
    const m = global.threatMemory;
    parts.push(
      `Threat memory (global): ${m.blockedDomains} blocked domains, ${m.flaggedPatterns} learned patterns, ${m.knownScamKeywords} baseline keywords.`
    );
  }

  parts.push(
    `PLS composite ${core.pls.score}/100 — layers: AI ${core.pls.layers.ai}, threat memory ${core.pls.layers.threatMemory}, patterns ${core.pls.layers.pattern}, links ${core.pls.layers.link}.`
  );

  if (core.threatMemDomain) {
    parts.push("Threat memory: content references a known blocked domain.");
  }
  if (core.threatMemPattern && !core.domainBlocked && !core.senderBlocked) {
    parts.push(
      "Threat memory: wording matches known scam or flagged patterns."
    );
  }

  if (apiSummary) {
    parts.push(`AI summary: ${apiSummary}`);
  }

  if (core.risk_level === "dangerous") {
    parts.push(
      "Action: quarantine and run Auto Defense (block domain/sender, update threat memory)."
    );
  } else if (core.risk_level === "suspicious") {
    parts.push(
      "Action: flag for review — verify identity and links before acting."
    );
  } else {
    parts.push("Action: allow — no decisive threat at this time.");
  }

  return parts.join(" ");
}

function buildContextualSuggestedReply(
  email: AiCoreEmail,
  risk_level: AiCoreRiskLevel,
  global: AiGlobalContext | undefined,
  tone: AiCoreTone
): string | null {
  const thread = global?.conversation?.lastSummary?.trim() || "";

  if (risk_level === "dangerous") {
    return composeAutoDefenseReply(email, { tone, threadHint: thread }).body;
  }

  if (risk_level === "suspicious") {
    const threadBit = thread
      ? ` Given our recent thread (“${thread.slice(0, 80)}${thread.length > 80 ? "…" : ""}”), `
      : " ";
    if (tone === "friendly") {
      return `Hey —${threadBit}I’m not able to handle anything sensitive over email. If this is really you, ping me on our usual channel.`;
    }
    if (tone === "formal") {
      return `Good day.${threadBit}Sensitive requests cannot be processed via this channel. Please use an authenticated contact path.`;
    }
    return `Thanks for your message.${threadBit}I can’t handle sensitive requests over email. If this is legitimate, please use our usual verified contact channel.`;
  }

  return null;
}

function collectContextNotes(
  core: CoreSignals,
  global?: AiGlobalContext,
  tone?: AiCoreTone
): string[] {
  const notes: string[] = [];
  if (tone) notes.push(`Reply voice: ${tone}`);
  if (core.contextRiskNote) notes.push(core.contextRiskNote);
  if (global?.threatMemory && global.threatMemory.blockedDomains > 5) {
    notes.push("Corpus-aware: elevated baseline vigilance.");
  }
  return notes;
}

export function processEmail(
  email: AiCoreEmail,
  userContext: AiUserContext
): AiCoreFullResult {
  const tuned = finalizeEmailCore(email, userContext);
  const tone = getEffectiveTone(userContext.globalContext);
  const action = mapAction(tuned.risk_level);
  const explanation = buildExplanation(
    tuned,
    userContext.apiSummary,
    userContext.globalContext,
    tone
  );
  const suggestedReply = buildContextualSuggestedReply(
    email,
    tuned.risk_level,
    userContext.globalContext,
    tone
  );
  const contextNotes = collectContextNotes(
    tuned,
    userContext.globalContext,
    tone
  );

  return {
    risk_level: tuned.risk_level,
    action,
    explanation,
    suggestedReply,
    tone,
    contextNotes,
    pls: tuned.pls,
    threat_blocked_domain: tuned.threatMemDomain,
    threat_scam_pattern: tuned.threatMemPattern,
    memoryHit: tuned.threatMemDomain || tuned.threatMemPattern,
  };
}

export function resolveEmailRiskLevel(
  email: AiCoreEmail,
  userContext: AiUserContext
): AiCoreRiskLevel {
  return finalizeEmailCore(email, userContext).risk_level;
}

export function getPlsSnapshot(
  email: AiCoreEmail,
  userContext: AiUserContext
): PlsResult {
  return resolveEmailCore(email, userContext).pls;
}
