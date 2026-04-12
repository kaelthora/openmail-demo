import { getMailAiRiskBand } from "@/lib/mailContentSecurity";
import type { ProcessedMail } from "@/lib/mailTypes";

export type OpenmailSmartListTabId =
  | "inbox"
  | "urgent"
  | "awaiting"
  | "low_priority"
  | "auto_handled";

export type OpenmailSmartListTabDef = {
  id: OpenmailSmartListTabId;
  label: string;
  /** Hover / title: what this tab shows */
  description: string;
};

export const OPENMAIL_SMART_LIST_TABS: readonly OpenmailSmartListTabDef[] = [
  {
    id: "inbox",
    label: "Inbox",
    description: "All messages in this folder (no smart filter).",
  },
  {
    id: "urgent",
    label: "Urgent",
    description: "High risk signals or high-priority items that need attention first.",
  },
  {
    id: "awaiting",
    label: "Awaiting Response",
    description: "Emails that look like they need your reply.",
  },
  {
    id: "low_priority",
    label: "Low Priority",
    description: "Looks safe and low-urgency — skim when you have time.",
  },
  {
    id: "auto_handled",
    label: "Auto-handled",
    description: "Marked done or processed by AI auto-resolve.",
  },
] as const;

function isUrgent(mail: ProcessedMail): boolean {
  const band = getMailAiRiskBand(mail);
  if (band === "high") return true;
  if (mail.priority === "urgent") return true;
  if (mail.cluster === "urgent") return true;
  if (mail.important) return true;
  if (mail.syncedAi?.intentUrgency === "high") return true;
  return false;
}

function isAwaitingResponse(mail: ProcessedMail): boolean {
  if (mail.needsReply) return true;
  if (mail.syncedAi?.intent === "reply" || mail.syncedAi?.action === "reply") {
    return true;
  }
  if (mail.intent === "reply" || mail.intent === "follow_up") return true;
  return false;
}

function isLowPriority(mail: ProcessedMail): boolean {
  const band = getMailAiRiskBand(mail);
  if (band !== "safe") return false;
  if (mail.needsReply) return false;
  if (mail.syncedAi?.intentUrgency === "high" || mail.syncedAi?.intentUrgency === "medium") {
    return false;
  }
  const intent = mail.syncedAi?.intent;
  if (intent === "reply" || intent === "escalate" || intent === "review") return false;
  return true;
}

function isAutoHandled(mail: ProcessedMail, autoHandledIds: ReadonlySet<string>): boolean {
  if (autoHandledIds.has(mail.id)) return true;
  if (mail.resolved) return true;
  return false;
}

export function mailMatchesSmartTab(
  mail: ProcessedMail,
  tab: OpenmailSmartListTabId,
  autoHandledIds: ReadonlySet<string>
): boolean {
  switch (tab) {
    case "inbox":
      return true;
    case "urgent":
      return isUrgent(mail);
    case "awaiting":
      return isAwaitingResponse(mail);
    case "low_priority":
      return isLowPriority(mail);
    case "auto_handled":
      return isAutoHandled(mail, autoHandledIds);
    default:
      return true;
  }
}

export function filterMailsForSmartTab(
  mails: ProcessedMail[],
  tab: OpenmailSmartListTabId,
  autoHandledIds: ReadonlySet<string>
): ProcessedMail[] {
  if (tab === "inbox") return mails;
  return mails.filter((m) => mailMatchesSmartTab(m, tab, autoHandledIds));
}
