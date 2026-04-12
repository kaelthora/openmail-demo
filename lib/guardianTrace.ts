import type {
  GuardianAction,
  GuardianDecision,
  GuardianEvaluateResult,
  GuardianRiskLevel,
} from "@/lib/guardianEngine";

export type GuardianTraceSource =
  | "client:open_mail"
  | "client:link"
  | "client:attachment"
  | "client:send_reply"
  | "client:send_compose"
  | "api:evaluate"
  | "server:send"
  | "server:quick_reply"
  | "server:legacy_send";

export type GuardianTraceEntry = {
  id: string;
  /** ISO-8601 timestamp */
  at: string;
  action: GuardianAction;
  riskLevel: GuardianRiskLevel;
  decision: GuardianDecision;
  reason: string;
  rule?: string;
  source: GuardianTraceSource;
  /** Short user-facing line */
  summary: string;
  requiresExplicitUserConsent: boolean;
  criticalBlock: boolean;
};

const ACTION_LABEL: Record<GuardianAction, string> = {
  open_mail: "Open message",
  click_link: "Open link",
  open_attachment: "Open attachment",
  send_email: "Send email",
};

const DECISION_LABEL: Record<GuardianDecision, string> = {
  allow: "Allowed",
  warn: "Warning",
  block: "Blocked",
};

const RISK_LABEL: Record<GuardianRiskLevel, string> = {
  low: "Low risk",
  medium: "Medium risk",
  high: "High risk",
};

const SOURCE_LABEL: Record<GuardianTraceSource, string> = {
  "client:open_mail": "This device · open message",
  "client:link": "This device · link",
  "client:attachment": "This device · attachment",
  "client:send_reply": "This device · send reply",
  "client:send_compose": "This device · compose send",
  "api:evaluate": "API · evaluate",
  "server:send": "Server · send mail",
  "server:quick_reply": "Server · quick reply",
  "server:legacy_send": "Server · legacy send",
};

export function guardianTraceSourceLabel(source: GuardianTraceSource): string {
  return SOURCE_LABEL[source];
}

export function guardianActionLabel(action: GuardianAction): string {
  return ACTION_LABEL[action];
}

export function guardianDecisionLabel(decision: GuardianDecision): string {
  return DECISION_LABEL[decision];
}

export function guardianRiskLabel(level: GuardianRiskLevel): string {
  return RISK_LABEL[level];
}

function traceSummary(result: GuardianEvaluateResult): string {
  return `${ACTION_LABEL[result.action]} — ${DECISION_LABEL[result.decision]} (${RISK_LABEL[result.riskLevel]})`;
}

let idCounter = 0;

export function createGuardianTraceEntry(
  result: GuardianEvaluateResult,
  source: GuardianTraceSource
): GuardianTraceEntry {
  idCounter += 1;
  return {
    id: `gt-${Date.now()}-${idCounter}-${Math.random().toString(36).slice(2, 7)}`,
    at: new Date().toISOString(),
    action: result.action,
    riskLevel: result.riskLevel,
    decision: result.decision,
    reason: result.reason,
    rule: result.rule,
    source,
    summary: traceSummary(result),
    requiresExplicitUserConsent: result.requiresExplicitUserConsent,
    criticalBlock: result.criticalBlock,
  };
}

/**
 * Developer log — structured JSON on one line for grep/agents.
 * Runs in Node (API routes) and in the browser (client decisions).
 */
export function logGuardianTraceDev(entry: GuardianTraceEntry): void {
  const payload = {
    tag: "GuardianTrace",
    ...entry,
  };
  const line = JSON.stringify(payload);
  if (typeof console !== "undefined" && console.info) {
    console.info(`[GuardianTrace] ${line}`);
  }
}

export function recordGuardianTraceDev(
  result: GuardianEvaluateResult,
  source: GuardianTraceSource
): GuardianTraceEntry {
  const entry = createGuardianTraceEntry(result, source);
  logGuardianTraceDev(entry);
  return entry;
}
