import type { ProcessedMail } from "@/lib/mailTypes";
import {
  planOpenmailAutoResolve,
  type OpenmailAutoResolveKind,
  type OpenmailCoreAction,
} from "@/lib/openmailAutoResolve";

export type BatchAutoResolveTarget = {
  mail: ProcessedMail;
  kind: OpenmailAutoResolveKind;
  core: OpenmailCoreAction;
};

/**
 * Inbox messages that qualify for the same unattended actions as background auto-resolve.
 */
export function enumerateBatchAutoResolveTargets(
  mails: ProcessedMail[],
  opts: {
    inferCore: (mail: ProcessedMail) => OpenmailCoreAction;
    suppressedIds: ReadonlySet<string>;
    handledIds: ReadonlySet<string>;
  }
): BatchAutoResolveTarget[] {
  const out: BatchAutoResolveTarget[] = [];
  for (const mail of mails) {
    if (mail.folder !== "inbox" || mail.deleted || mail.archived) continue;
    if (mail.resolved) continue;
    if (opts.suppressedIds.has(mail.id)) continue;
    if (opts.handledIds.has(mail.id)) continue;
    if (mail.openmailAutoReplyDraft?.trim()) continue;

    const core = opts.inferCore(mail);
    const kind = planOpenmailAutoResolve(mail, core);
    if (!kind) continue;
    out.push({ mail, kind, core });
  }
  return out;
}

/** Inbox rows still “open” (not archived, not resolved). */
export function countInboxOpenItems(mails: ProcessedMail[]): number {
  return mails.filter(
    (m) =>
      m.folder === "inbox" && !m.deleted && !m.archived && !m.resolved
  ).length;
}

/**
 * Wall-clock feel if user validates batch output (quick skim per draft, tap-through for archive/done).
 */
export function estimateCompressedClearMinutes(
  targets: readonly { kind: OpenmailAutoResolveKind }[]
): number {
  if (targets.length === 0) return 0;
  let sec = 0;
  for (const t of targets) {
    if (t.kind === "reply_draft") sec += 52;
    else sec += 7;
  }
  return Math.max(1, Math.ceil(sec / 60));
}

/** Rough manual triage if each item got individual CORE attention. */
export function estimateManualInboxMinutes(openItemCount: number): number {
  if (openItemCount <= 0) return 0;
  return Math.max(1, Math.ceil(openItemCount * 1.15));
}

export type TimeCompressionCopy = {
  headline: string;
  subline: string | null;
  eligibleCount: number;
  openInboxCount: number;
  compressedMinutes: number;
  manualMinutes: number;
};

export type TimeCompressionPanelProps = TimeCompressionCopy & {
  onResolveAll: () => void;
  busy: boolean;
};

export function buildTimeCompressionCopy(
  targets: readonly BatchAutoResolveTarget[],
  openInboxCount: number
): TimeCompressionCopy | null {
  if (targets.length === 0) return null;
  const compressedMinutes = estimateCompressedClearMinutes(targets);
  const manualMinutes = estimateManualInboxMinutes(openInboxCount);

  const headline =
    targets.length >= openInboxCount && openInboxCount > 0
      ? `You can clear everything in ~${compressedMinutes} min`
      : `Resolve ${targets.length} of ${openInboxCount} inbox items in ~${compressedMinutes} min`;

  const subline =
    manualMinutes > compressedMinutes
      ? `About ~${manualMinutes} min manually → ~${compressedMinutes} min with time compression`
      : null;

  return {
    headline,
    subline,
    eligibleCount: targets.length,
    openInboxCount,
    compressedMinutes,
    manualMinutes,
  };
}
