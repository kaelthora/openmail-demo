import OpenAI from "openai";

export type EmailRisk = "high" | "medium" | "safe";

export type EmailAction = "reply" | "ignore" | "escalate";

export type EmailAnalysis = {
  risk: EmailRisk;
  summary: string;
  action: EmailAction;
  suggestions: string[];
  reason: string;
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
    required: ["risk", "summary", "action", "reason", "suggestions"],
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

function normalizeAnalysis(raw: unknown): EmailAnalysis | null {
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
  return {
    risk,
    summary: summary.slice(0, 280),
    action,
    reason: reason.slice(0, 450),
    suggestions,
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

  return {
    risk,
    summary,
    action,
    suggestions: fallbackSuggestions(action),
    reason,
  };
}

async function callOpenAIAnalysis(
  input: EmailAnalyzeInput
): Promise<EmailAnalysis> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
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

  const userContent = [
    `Subject: ${input.subject?.trim() || "(no subject)"}`,
    `Attachments (metadata only): ${formatAttachments(input.attachments)}`,
    "",
    "Body:",
    truncateBody(input.body || ""),
  ].join("\n");

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
    return analyzeEmailHeuristic(input);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    return analyzeEmailHeuristic(input);
  }

  const normalized = normalizeAnalysis(parsed);
  return normalized ?? analyzeEmailHeuristic(input);
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
    console.warn(
      "[openmail] analyzeEmail LLM failed, using heuristic:",
      e instanceof Error ? e.message : e
    );
    return analyzeEmailHeuristic(input);
  }
}
