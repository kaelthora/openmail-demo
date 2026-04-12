import type { ProcessedMail } from "@/lib/mailTypes";

/** Feed status — security issues stay `waiting`; RiskBadge shows tier. */
export type SituationState = "waiting" | "resolved" | "auto_handled";

export type SituationUrgency = "low" | "medium" | "high";

/** What the user should understand about the thread right now. */
export type SituationFlowKind = "waiting_reply" | "completed" | "no_action_needed";

export const SITUATION_FEED_MAX = 10;

export type BuildThreadSituationsOptions = {
  /** Mail IDs from the non-undone auto-resolve log (same session). */
  autoHandledMailIds?: ReadonlySet<string>;
};

export type MailThreadSituation = {
  /** Stable key for grouping (subject- or thread-based). */
  id: string;
  title: string;
  contextSummary: string;
  state: SituationState;
  flowKind: SituationFlowKind;
  urgency: SituationUrgency;
  recommendedAction: string;
  messageCount: number;
  mails: ProcessedMail[];
  /** Newest message in the thread — drives CORE selection. */
  anchorMail: ProcessedMail;
  lastActivityAt: number;
};

const RE_SUBJ = /^(re|fwd|fw|aw|sv|antw|vs)\s*:\s*/i;

export function normalizeConversationSubject(subject: string): string {
  let s = subject.trim() || "(No subject)";
  for (let i = 0; i < 8; i++) {
    const next = s.replace(RE_SUBJ, "").trim();
    if (next === s) break;
    s = next;
  }
  return s || "(No subject)";
}

function situationGroupKey(mail: ProcessedMail): string {
  const t = mail.thread?.trim().toLowerCase();
  if (t) return `thread:${t}`;
  return `subj:${normalizeConversationSubject(mail.subject).toLowerCase()}`;
}

function urgencyFromMail(mail: ProcessedMail): SituationUrgency {
  const u = mail.syncedAi?.intentUrgency;
  if (u === "high") return "high";
  if (u === "medium") return "medium";
  if (mail.priority === "urgent") return "high";
  if (mail.priority === "medium") return "medium";
  return "low";
}

function maxUrgency(a: SituationUrgency, b: SituationUrgency): SituationUrgency {
  const r = { low: 0, medium: 1, high: 2 };
  return r[a] >= r[b] ? a : b;
}

function deriveState(
  mails: ProcessedMail[],
  latest: ProcessedMail,
  autoHandledMailIds?: ReadonlySet<string>
): SituationState {
  if (autoHandledMailIds?.has(latest.id)) return "auto_handled";

  if (mails.length > 0 && mails.every((m) => m.resolved)) return "resolved";
  if (latest.resolved) return "resolved";

  const allRead = mails.every((m) => m.read !== false);
  const ignoreish =
    latest.syncedAi?.intent === "ignore" ||
    latest.syncedAi?.action === "ignore";
  if (allRead && ignoreish && !latest.needsReply) return "resolved";

  return "waiting";
}

function deriveFlowKind(
  state: SituationState,
  latest: ProcessedMail,
  mails: ProcessedMail[]
): SituationFlowKind {
  if (state === "resolved") return "completed";

  if (state === "auto_handled") {
    if (latest.openmailAutoReplyDraft?.trim()) return "waiting_reply";
    return "completed";
  }

  const risky =
    mails.some((m) => m.linkQuarantine || m.securityLevel === "high_risk") ||
    latest.securityLevel === "high_risk";
  if (risky) return "waiting_reply";

  if (
    latest.needsReply ||
    latest.syncedAi?.intent === "reply" ||
    latest.syncedAi?.action === "reply"
  ) {
    return "waiting_reply";
  }

  if (
    latest.syncedAi?.intent === "escalate" ||
    latest.syncedAi?.action === "escalate" ||
    latest.syncedAi?.intent === "review"
  ) {
    return "waiting_reply";
  }

  const ignoreish =
    latest.syncedAi?.intent === "ignore" || latest.syncedAi?.action === "ignore";
  if (ignoreish) return "no_action_needed";

  if (!latest.needsReply && mails.every((m) => m.read !== false)) {
    return "no_action_needed";
  }

  return "waiting_reply";
}

function recommendedActionForMail(mail: ProcessedMail): string {
  if (mail.securityLevel === "high_risk" || mail.linkQuarantine) {
    return "Stop — escalate or delete";
  }
  const int = mail.syncedAi?.intent;
  const act = mail.syncedAi?.action;
  if (int === "escalate" || act === "escalate") return "Escalate / flag";
  if (int === "ignore" || act === "ignore") return "Archive or dismiss";
  if (int === "review") return "Review thread & attachments";
  if (mail.needsReply || int === "reply" || act === "reply") return "Send reply";
  const subj = mail.subject.toLowerCase();
  if (/meeting|calendar|invite|reschedule|zoom|teams/.test(subj)) return "Schedule / confirm time";
  if (/invoice|payment|wire/.test(subj)) return "Confirm payment / invoice";
  return "Review or acknowledge";
}

function buildContextSummary(mails: ProcessedMail[]): string {
  const snippets = mails
    .slice()
    .sort((a, b) => mailTime(b) - mailTime(a))
    .map((m) => {
      const sum = m.syncedAi?.summary?.trim();
      if (sum) return sum;
      const p = m.preview?.trim();
      if (p) return p;
      return m.content?.trim().slice(0, 120) ?? "";
    })
    .filter(Boolean);

  if (snippets.length === 0) return "No preview yet.";
  const head = snippets[0]!;
  const clipped = head.length > 180 ? `${head.slice(0, 177)}…` : head;
  if (mails.length === 1) return clipped;
  return `${mails.length} messages — ${clipped}`;
}

function mailTime(mail: ProcessedMail): number {
  const raw = mail.date;
  if (!raw) return 0;
  const t = Date.parse(raw);
  return Number.isNaN(t) ? 0 : t;
}

function stateSortOrder(s: SituationState): number {
  if (s === "waiting") return 0;
  if (s === "auto_handled") return 1;
  return 2;
}

/** Lower = higher priority in feed (waiting + risky first). */
function threadSecuritySortRank(mails: ProcessedMail[]): number {
  if (mails.some((m) => m.linkQuarantine || m.securityLevel === "high_risk")) {
    return 0;
  }
  if (mails.some((m) => m.securityLevel === "suspicious")) return 1;
  return 2;
}

function situationTitleFromLatest(latest: ProcessedMail): string {
  const sum = latest.syncedAi?.summary?.trim();
  if (sum && sum.length >= 12) {
    const oneLine = sum.replace(/\s+/g, " ").trim();
    const clipped =
      oneLine.length > 72 ? `${oneLine.slice(0, 69)}…` : oneLine;
    return clipped.charAt(0).toUpperCase() + clipped.slice(1);
  }
  const normTitle = normalizeConversationSubject(latest.subject);
  return normTitle.charAt(0).toUpperCase() + normTitle.slice(1);
}

function urgencySortRank(u: SituationUrgency): number {
  if (u === "high") return 3;
  if (u === "medium") return 2;
  return 1;
}

/**
 * Group visible mails into thread “situations” for situation-first inbox UX.
 */
export function buildThreadSituations(
  mails: ProcessedMail[],
  options?: BuildThreadSituationsOptions
): MailThreadSituation[] {
  const autoHandledMailIds = options?.autoHandledMailIds;
  const groups = new Map<string, ProcessedMail[]>();
  for (const m of mails) {
    const k = situationGroupKey(m);
    const arr = groups.get(k);
    if (arr) arr.push(m);
    else groups.set(k, [m]);
  }

  const out: MailThreadSituation[] = [];
  for (const [id, threadMails] of groups) {
    const sorted = [...threadMails].sort(
      (a, b) => mailTime(b) - mailTime(a) || a.id.localeCompare(b.id)
    );
    const latest = sorted[0]!;
    let urgency: SituationUrgency = "low";
    for (const m of threadMails) {
      urgency = maxUrgency(urgency, urgencyFromMail(m));
    }
    const state = deriveState(threadMails, latest, autoHandledMailIds);
    const flowKind = deriveFlowKind(state, latest, threadMails);
    const title = situationTitleFromLatest(latest);

    out.push({
      id,
      title,
      contextSummary: buildContextSummary(threadMails),
      state,
      flowKind,
      urgency,
      recommendedAction: recommendedActionForMail(latest),
      messageCount: threadMails.length,
      mails: sorted,
      anchorMail: latest,
      lastActivityAt: mailTime(latest),
    });
  }

  out.sort((a, b) => {
    const ds = stateSortOrder(a.state) - stateSortOrder(b.state);
    if (ds !== 0) return ds;
    const dr =
      threadSecuritySortRank(a.mails) - threadSecuritySortRank(b.mails);
    if (dr !== 0) return dr;
    const du = urgencySortRank(b.urgency) - urgencySortRank(a.urgency);
    if (du !== 0) return du;
    return b.lastActivityAt - a.lastActivityAt;
  });

  return out;
}

export function situationStateLabel(s: SituationState): string {
  if (s === "waiting") return "Waiting";
  if (s === "resolved") return "Resolved";
  return "Auto-handled";
}

export function situationFlowLabel(f: SituationFlowKind): string {
  if (f === "waiting_reply") return "Waiting reply";
  if (f === "completed") return "Completed";
  return "No action needed";
}

export function situationUrgencyLabel(u: SituationUrgency): string {
  if (u === "high") return "High";
  if (u === "medium") return "Medium";
  return "Low";
}
