import OpenAI from "openai";
import {
  inferIntentLocal,
  parseIntentConfidence,
  parseIntentKind,
  parseIntentUrgency,
  type IntentKind,
  type IntentUrgency,
} from "@/lib/intentEngine";

export type EmailRisk = "high" | "medium" | "safe";

export type EmailAction = "reply" | "ignore" | "escalate";

export type EmailAnalysis = {
  risk: EmailRisk;
  summary: string;
  action: EmailAction;
  suggestions: string[];
  reason: string;
  intent: IntentKind;
  intentUrgency: IntentUrgency;
  intentConfidence: number;
};

/** Attachment metadata only (no file bytes). */
export type EmailAnalyzeAttachment = {
  filename: string;
  type: string;
  size: number;
};

export type EmailAnalyzeInput = {
  subject: string | null;
  body: string;
  attachments?: EmailAnalyzeAttachment[];
};

const MAX_BODY_CHARS = 14_000;
const MAX_ATTACHMENTS_LIST = 24;

const ANALYSIS_JSON_SCHEMA = {
  name: "email_analysis",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: [
      "risk",
      "summary",
      "action",
      "reason",
      "suggestions",
      "intent",
      "intentUrgency",
      "intentConfidence",
    ],
    properties: {
      risk: { type: "string", enum: ["high", "medium", "safe"] },
      summary: { type: "string" },
      action: { type: "string", enum: ["reply", "ignore", "escalate"] },
      reason: { type: "string" },
      suggestions: {
        type: "array",
        items: { type: "string" },
        minItems: 2,
        maxItems: 4,
      },
      intent: {
        type: "string",
        enum: ["reply", "ignore", "escalate", "review"],
      },
      intentUrgency: {
        type: "string",
        enum: ["low", "medium", "high"],
      },
      intentConfidence: { type: "number", minimum: 0, maximum: 1 },
    },
  },
} as const;

const SYSTEM_PROMPT = `You are a fast inbox triage assistant. Classify one email for security and handling.
Rules:
- risk "high": phishing, credential theft, malware/suspicious attachments, impersonation, urgent payment fraud, crypto seed requests, legal threats used to pressure action.
- risk "medium": invoices/payments, account alerts, unsolicited links, mild pressure — user should verify sender before acting.
- risk "safe": routine personal/work mail, newsletters (if clearly bulk), automated receipts with no pressure.
- action "ignore" only for obvious bulk/marketing/no-reply noise that needs no response.
- action "escalate" for high risk or serious compliance/security incidents.
- action "reply" for normal threads and medium-risk where a cautious reply may be appropriate.
- intent: finer UX than action — use "review" when the user should read attachments, verify facts, or confirm details before replying (invoices, contracts, policy, approvals). Use "reply"/"ignore"/"escalate" aligned with action when appropriate; "escalate" intent matches serious incidents.
- intentUrgency: "high" if deadlines or strong pressure; "medium" for this-week / needs attention; "low" for routine.
- intentConfidence: your calibrated certainty 0–1 for the intent+urgency call.
- summary: one line, max ~200 characters, no newlines.
- reason: brief factual justification, max ~350 characters.
- suggestions: 2–4 short reply drafts the user could send (neutral, professional). For escalate/ignore, use safe non-committal wording.`;

function truncateBody(text: string): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= MAX_BODY_CHARS) return t;
  return `${t.slice(0, MAX_BODY_CHARS)}…`;
}

function formatAttachments(list: EmailAnalyzeAttachment[] | undefined): string {
  if (!list?.length) return "(none)";
  const slice = list.slice(0, MAX_ATTACHMENTS_LIST);
  const parts = slice.map(
    (a) => `${a.filename} [${a.type}, ${a.size} bytes]`
  );
  let s = parts.join("; ");
  if (list.length > MAX_ATTACHMENTS_LIST) {
    s += `; +${list.length - MAX_ATTACHMENTS_LIST} more`;
  }
  return s;
}

function clampSuggestions(action: EmailAction, suggestions: string[]): string[] {
  const cleaned = suggestions
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter((s) => s.length > 0)
    .slice(0, 4);
  if (cleaned.length >= 2) return cleaned;
  return fallbackSuggestions(action);
}

function fallbackSuggestions(action: EmailAction): string[] {
  if (action === "escalate") {
    return [
      "Thanks — I am forwarding this for internal review and will not use links or attachments until verified.",
      "Acknowledged. I will not act on this until our security team confirms.",
    ];
  }
  if (action === "ignore") {
    return [
      "No reply needed from me; I will archive this thread.",
      "Noted — treating as low-priority automated mail.",
    ];
  }
  return [
    "Thanks for your message. I will review and reply shortly.",
    "Got it — I will follow up with next steps soon.",
  ];
}

function coerceIntentWithTriage(
  input: EmailAnalyzeInput,
  risk: EmailRisk,
  action: EmailAction,
  parsed: {
    intent: IntentKind | null;
    intentUrgency: IntentUrgency | null;
    intentConfidence: number | null;
  }
): Pick<EmailAnalysis, "intent" | "intentUrgency" | "intentConfidence"> {
  const fb = inferIntentLocal(
    { subject: input.subject, body: input.body },
    risk,
    action
  );
  let intent = parsed.intent ?? fb.intent;
  let intentUrgency = parsed.intentUrgency ?? fb.intentUrgency;
  let intentConfidence = parsed.intentConfidence ?? fb.intentConfidence;

  if (action === "ignore") intent = "ignore";
  else if (action === "escalate") intent = "escalate";
  else if (risk === "high" && intent === "reply") intent = "escalate";

  return { intent, intentUrgency, intentConfidence };
}

function normalizeAnalysis(
  raw: unknown,
  input: EmailAnalyzeInput
): EmailAnalysis | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const risk = o.risk;
  const action = o.action;
  if (risk !== "high" && risk !== "medium" && risk !== "safe") return null;
  if (action !== "reply" && action !== "ignore" && action !== "escalate")
    return null;
  const summary = typeof o.summary === "string" ? o.summary.trim() : "";
  const reason = typeof o.reason === "string" ? o.reason.trim() : "";
  if (!summary || !reason) return null;
  const sug = o.suggestions;
  if (!Array.isArray(sug)) return null;
  const suggestions = clampSuggestions(
    action,
    sug.filter((x): x is string => typeof x === "string")
  );

  const triageIntent = coerceIntentWithTriage(input, risk, action, {
    intent: parseIntentKind(o.intent),
    intentUrgency: parseIntentUrgency(o.intentUrgency),
    intentConfidence: parseIntentConfidence(o.intentConfidence),
  });

  return {
    risk,
    summary: summary.slice(0, 280),
    action,
    reason: reason.slice(0, 450),
    suggestions,
    ...triageIntent,
  };
}

/** Fast local fallback when no API key or the model call fails. */
export function analyzeEmailHeuristic(input: EmailAnalyzeInput): EmailAnalysis {
  const attachNote =
    input.attachments?.length ?
      ` Attachments: ${input.attachments.map((a) => a.filename).join(", ")}.`
      : "";
  const raw = `${input.subject ?? ""}\n\n${input.body}${attachNote}`.trim();
  const text = raw.toLowerCase();

  const HIGH =
    /\b(phish|phishing|wire transfer|urgent.*(password|verify|account)|verify your (account|identity)|crypto.*wallet|seed phrase|gift card.*(code|pin)|\bmalware\b|compromised account|click (here|now).*immediately)\b/i;
  const MEDIUM =
    /\b(invoice|payment due|unusual (login|activity)|security alert|suspended|locked.*account|confirm (your )?details|update (billing|payment))\b/i;
  const IGNORE =
    /\b(newsletter|unsubscribe|digest|no[- ]?reply|automated message|promotional|marketing email|do not reply)\b/i;
  const ESCALATE =
    /\b(legal|compliance|lawsuit|subpoena|court order|breach|security incident|escalat|fraud alert|regulator)\b/i;

  let risk: EmailRisk = "safe";
  let action: EmailAction = "reply";
  let reason =
    "No strong risk or automation signals — treat as normal correspondence.";

  if (IGNORE.test(text)) {
    risk = "safe";
    action = "ignore";
    reason = "Looks like bulk, marketing, or automated mail — usually safe to skip.";
  } else if (HIGH.test(text)) {
    risk = "high";
    action = "escalate";
    reason =
      "Content matches high-risk patterns (credential, payment pressure, or impersonation-style cues).";
  } else if (ESCALATE.test(text) && !IGNORE.test(text)) {
    risk = "high";
    action = "escalate";
    reason =
      "Legal, compliance, or incident-style language — get human review before replying.";
  } else if (MEDIUM.test(text)) {
    risk = "medium";
    action = "reply";
    reason =
      "Financial or account-related language — verify sender before sharing data or paying.";
  }

  const preview = raw.replace(/\s+/g, " ").slice(0, 160);
  const shortPreview =
    preview.length < raw.length ? `${preview}…` : preview || "(empty message)";
  const summary =
    risk === "high"
      ? `High attention: ${shortPreview}`
      : risk === "medium"
        ? `Review carefully: ${shortPreview}`
        : action === "ignore"
          ? `Low priority / bulk: ${shortPreview}`
          : `Routine message: ${shortPreview}`;

  const inferred = inferIntentLocal(input, risk, action);
  return {
    risk,
    summary,
    action,
    suggestions: fallbackSuggestions(action),
    reason,
    intent: inferred.intent,
    intentUrgency: inferred.intentUrgency,
    intentConfidence: inferred.intentConfidence,
  };
}

async function callOpenAIAnalysis(
  input: EmailAnalyzeInput
): Promise<EmailAnalysis> {
  const userContent = [
    `Subject: ${input.subject?.trim() || "(no subject)"}`,
    `Attachments (metadata only): ${formatAttachments(input.attachments)}`,
    "",
    "Body:",
    truncateBody(input.body || ""),
  ].join("\n");

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    console.log("AI SOURCE:", {
      usingOpenAI: false,
      model: null,
      promptLength: userContent.length,
      route: "analyzeEmail",
      reason: "OPENAI_API_KEY unset",
    });
    return analyzeEmailHeuristic(input);
  }

  const model = process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";
  const baseURL = process.env.OPENAI_BASE_URL?.trim();

  const client = new OpenAI({
    apiKey,
    baseURL: baseURL || undefined,
    timeout: 28_000,
    maxRetries: 1,
  });

  const completion = await client.chat.completions.create({
    model,
    temperature: 0.2,
    max_completion_tokens: 500,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userContent },
    ],
    response_format: {
      type: "json_schema",
      json_schema: ANALYSIS_JSON_SCHEMA,
    },
  });

  const text = completion.choices[0]?.message?.content;
  if (!text) {
    console.log("AI SOURCE:", {
      usingOpenAI: false,
      model,
      promptLength: userContent.length,
      route: "analyzeEmail",
      reason: "empty model content",
    });
    return analyzeEmailHeuristic(input);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    console.log("AI SOURCE:", {
      usingOpenAI: false,
      model,
      promptLength: userContent.length,
      route: "analyzeEmail",
      reason: "JSON parse failed",
    });
    return analyzeEmailHeuristic(input);
  }

  const normalized = normalizeAnalysis(parsed, input);
  if (!normalized) {
    console.log("AI SOURCE:", {
      usingOpenAI: false,
      model,
      promptLength: userContent.length,
      route: "analyzeEmail",
      reason: "normalizeAnalysis rejected payload",
    });
    return analyzeEmailHeuristic(input);
  }

  console.log("AI SOURCE:", {
    usingOpenAI: true,
    model,
    promptLength: userContent.length,
    route: "analyzeEmail",
  });
  return normalized;
}

/**
 * Email triage via OpenAI (gpt-4o-mini by default). Falls back to heuristics if
 * `OPENAI_API_KEY` is unset or the request fails. Uses structured JSON for reliable parsing.
 */
export async function analyzeEmail(
  input: EmailAnalyzeInput
): Promise<EmailAnalysis> {
  try {
    return await callOpenAIAnalysis(input);
  } catch (e) {
    const bodyLen = truncateBody(input.body || "").length;
    console.log("AI SOURCE:", {
      usingOpenAI: false,
      model: process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini",
      promptLength: bodyLen,
      route: "analyzeEmail",
      reason: "exception",
      error: e instanceof Error ? e.message : String(e),
    });
    console.warn(
      "[openmail] analyzeEmail LLM failed, using heuristic:",
      e instanceof Error ? e.message : e
    );
    return analyzeEmailHeuristic(input);
  }
}

export type GenerateReplyInput = {
  email: string;
  tone: string;
  risk: string;
};

/**
 * Generate a reply draft via OpenAI. Requires `OPENAI_API_KEY`.
 * Used by `/api/ai-reply`.
 */
export async function generateReply(input: GenerateReplyInput): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    console.log("AI SOURCE:", {
      usingOpenAI: false,
      model: null,
      promptLength: 0,
      route: "generateReply",
      reason: "OPENAI_API_KEY unset",
    });
    throw new Error("OPENAI_API_KEY is not configured");
  }

  const model = process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";
  const baseURL = process.env.OPENAI_BASE_URL?.trim();

  const client = new OpenAI({
    apiKey,
    baseURL: baseURL || undefined,
    timeout: 28_000,
    maxRetries: 1,
  });

  const prompt = [
    "You are the AI core of OpenMail.",
    "",
    `Tone: ${input.tone}`,
    `Risk: ${input.risk}`,
    "",
    "Email:",
    input.email,
    "",
    "Generate a concise, human reply:",
  ].join("\n");

  const completion = await client.chat.completions.create({
    model,
    messages: [
      {
        role: "system",
        content: "You generate contextual email replies.",
      },
      { role: "user", content: prompt },
    ],
    temperature: 0.4,
    max_completion_tokens: 1024,
  });

  const text = completion.choices[0]?.message?.content?.trim();
  if (!text) {
    console.log("AI SOURCE:", {
      usingOpenAI: false,
      model,
      promptLength: prompt.length,
      route: "generateReply",
      reason: "empty model response",
    });
    throw new Error("Empty model response");
  }

  console.log("AI SOURCE:", {
    usingOpenAI: true,
    model,
    promptLength: prompt.length,
    route: "generateReply",
  });

  return text;
}

const REPLY_VARIANTS_JSON_SCHEMA = {
  name: "reply_variants",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["replies"],
    properties: {
      replies: {
        type: "array",
        items: { type: "string" },
        minItems: 3,
        maxItems: 4,
      },
    },
  },
} as const;

/**
 * Returns 3–4 distinct reply drafts in one OpenAI call (same credentials as `generateReply`).
 */
export async function generateReplySuggestions(
  input: GenerateReplyInput
): Promise<string[]> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    console.log("AI SOURCE:", {
      usingOpenAI: false,
      model: null,
      promptLength: 0,
      route: "generateReplySuggestions",
      reason: "OPENAI_API_KEY unset",
    });
    throw new Error("OPENAI_API_KEY is not configured");
  }

  const model = process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";
  const baseURL = process.env.OPENAI_BASE_URL?.trim();

  const client = new OpenAI({
    apiKey,
    baseURL: baseURL || undefined,
    timeout: 28_000,
    maxRetries: 1,
  });

  const prompt = [
    "You are the writing assistant for OpenMail (not a security product).",
    "",
    `Tone: ${input.tone}`,
    `Risk context (for phrasing only): ${input.risk}`,
    "",
    "Email:",
    input.email,
    "",
    "Generate exactly 3 distinct, concise reply options the user could send. Be friendly, professional, and helpful—assist normal correspondence. Each must be a complete message, contextual to the email above, not generic filler.",
  ].join("\n");

  const completion = await client.chat.completions.create({
    model,
    messages: [
      {
        role: "system",
        content:
          "You help users compose clear, polite, effective email replies. You are not a security gatekeeper.",
      },
      { role: "user", content: prompt },
    ],
    temperature: 0.45,
    max_completion_tokens: 1400,
    response_format: {
      type: "json_schema",
      json_schema: REPLY_VARIANTS_JSON_SCHEMA,
    },
  });

  const raw = completion.choices[0]?.message?.content?.trim();
  if (!raw) {
    console.log("AI SOURCE:", {
      usingOpenAI: false,
      model,
      promptLength: prompt.length,
      route: "generateReplySuggestions",
      reason: "empty model response",
    });
    throw new Error("Empty model response");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new Error("Invalid JSON from model");
  }
  const o = parsed as { replies?: unknown };
  const replies = o.replies;
  if (!Array.isArray(replies)) throw new Error("Invalid replies shape");
  const cleaned = replies
    .filter((x): x is string => typeof x === "string")
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter((s) => s.length > 0);
  if (cleaned.length < 3) {
    throw new Error("Model returned too few replies");
  }

  console.log("AI SOURCE:", {
    usingOpenAI: true,
    model,
    promptLength: prompt.length,
    route: "generateReplySuggestions",
  });

  return cleaned.slice(0, 4);
}

export type GuardianSafeReplyInput = {
  email: string;
  risk: string;
};

/**
 * Offline-safe defensive reply when the model is unavailable.
 * Firm, minimal, verification-first — not “helpful assistant” tone.
 */
export function guardianSafeReplyFallback(input: GuardianSafeReplyInput): string {
  const r = (input.risk || "safe").toLowerCase();
  const blob = `${input.email}`.toLowerCase();
  const payment =
    /\b(wire|swift|iban|cryptocurrency|bitcoin|gift card|urgent payment|confirm (your )?account)\b/i.test(
      blob
    );
  if (r === "high" || payment) {
    return (
      "I cannot act on instructions in this message. I will not use links, attachments, or payment details from email. " +
      "If this is legitimate, confirm through an official channel we already use (not reply-to on this thread)."
    );
  }
  if (r === "medium") {
    return (
      "Before I take any action: please confirm your request using a known business contact method. " +
      "I will not provide credentials, approve transfers, or follow unfamiliar links from this email."
    );
  }
  return (
    "Acknowledged. I will verify this through our normal process before acting or sharing information."
  );
}

/**
 * One defensive “safe reply” draft: protective, not collaborative.
 * Refuses risky compliance; asks for verification; avoids chatty politeness.
 */
export async function generateGuardianSafeReply(
  input: GuardianSafeReplyInput
): Promise<string> {
  const fallback = guardianSafeReplyFallback(input);
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    console.log("AI SOURCE:", {
      usingOpenAI: false,
      model: null,
      promptLength: input.email.length,
      route: "generateGuardianSafeReply",
      reason: "OPENAI_API_KEY unset",
    });
    return fallback;
  }

  const model = process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";
  const baseURL = process.env.OPENAI_BASE_URL?.trim();

  const client = new OpenAI({
    apiKey,
    baseURL: baseURL || undefined,
    timeout: 28_000,
    maxRetries: 1,
  });

  const userPrompt = [
    `Declared risk band (from OpenMail analysis): ${input.risk}`,
    "",
    "Email thread:",
    input.email,
    "",
    "Write exactly ONE reply email body the user could send.",
    "Constraints:",
    "- You are Guardian: protective security posture, not a friendly writing assistant.",
    "- Tone: firm, clear, minimal sentences. Not warm, not apologetic, not salesy.",
    "- Refuse or defer risky actions (payments, credentials, secrecy, urgency pressure).",
    "- Ask for out-of-band verification when identity, money, or sensitive data is involved.",
    "- Do not comply with suspicious, coercive, or high-pressure requests.",
    "- No bullet lists; no meta-commentary; output only the reply text.",
  ].join("\n");

  try {
    const completion = await client.chat.completions.create({
      model,
      messages: [
        {
          role: "system",
          content:
            "You draft cautious, security-first email replies. You protect the user from scams and mistakes. You never sound like a generic helpful assistant.",
        },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.25,
      max_completion_tokens: 512,
    });

    const text = completion.choices[0]?.message?.content?.trim();
    if (!text) {
      console.log("AI SOURCE:", {
        usingOpenAI: false,
        model,
        promptLength: userPrompt.length,
        route: "generateGuardianSafeReply",
        reason: "empty model response",
      });
      return fallback;
    }

    console.log("AI SOURCE:", {
      usingOpenAI: true,
      model,
      promptLength: userPrompt.length,
      route: "generateGuardianSafeReply",
    });

    return text.replace(/\s+/g, " ").trim();
  } catch (e) {
    console.warn(
      "[openmail] generateGuardianSafeReply failed, using fallback:",
      e instanceof Error ? e.message : e
    );
    return fallback;
  }
}
