import type { SyncedIntentKind } from "@/lib/mailTypes";

/** 1–2 short lines for notification body (no HTML). */
export function formatNotificationSummaryLines(summary: string | null | undefined): string {
  const t = (summary ?? "").replace(/\s+/g, " ").trim();
  if (!t) return "New message — open OpenMail for details.";
  const max = 180;
  const one = t.length <= max ? t : `${t.slice(0, max - 1)}…`;
  const mid = one.indexOf(". ");
  if (mid > 40 && mid < one.length - 20) {
    return `${one.slice(0, mid + 1).trim()}\n${one.slice(mid + 2).trim()}`;
  }
  return one;
}

function intentLabel(intent: SyncedIntentKind | null | undefined): string {
  switch (intent) {
    case "reply":
      return "Reply";
    case "ignore":
      return "No reply needed";
    case "escalate":
      return "Review carefully";
    case "review":
      return "Review";
    default:
      return "Triage";
  }
}

export function formatSuggestedActionLine(input: {
  intent: string | null | undefined;
  action: string | null | undefined;
  suggestions: string[] | null | undefined;
}): string {
  const intent = input.intent as SyncedIntentKind | undefined;
  const sug = (input.suggestions ?? []).map((s) => s.trim()).filter(Boolean);
  const first = sug[0] ?? "";
  const act = input.action;

  if (act === "reply" || intent === "reply") {
    if (first) {
      const clip = first.length > 100 ? `${first.slice(0, 99)}…` : first;
      return `Suggested action: Send — “${clip}”`;
    }
    return "Suggested action: Send a reply";
  }
  if (act === "ignore" || intent === "ignore") {
    return "Suggested action: Ignore / archive";
  }
  if (act === "escalate" || intent === "escalate") {
    return "Suggested action: Escalate — open before acting";
  }
  return `Intent: ${intentLabel(intent)} — open to decide`;
}

export function notificationTitle(subject: string | null | undefined, from: string | null | undefined): string {
  const sub = (subject ?? "").trim() || "(no subject)";
  const clip = sub.length > 56 ? `${sub.slice(0, 55)}…` : sub;
  const fromT = (from ?? "").replace(/\s+/g, " ").trim();
  const shortFrom = fromT.length > 36 ? `${fromT.slice(0, 35)}…` : fromT;
  return shortFrom ? `${clip} — ${shortFrom}` : clip;
}
