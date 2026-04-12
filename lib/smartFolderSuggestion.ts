import type { OpenmailSmartFolderId, ProcessedMail } from "@/lib/mailTypes";
import { extractEmail } from "@/lib/mailAddress";
import type { UserBehaviorMemoryV1 } from "@/lib/userBehaviorMemory";
import {
  folderRouteDomainKey,
  folderRouteSenderKey,
} from "@/lib/smartFolderKeys";

export const SMART_FOLDER_IDS: OpenmailSmartFolderId[] = [
  "inbox",
  "archive",
  "promotions",
  "updates",
  "work",
  "personal",
];

export function smartFolderLabel(id: OpenmailSmartFolderId): string {
  if (id === "inbox") return "Inbox";
  if (id === "archive") return "Archive";
  if (id === "promotions") return "Promotions";
  if (id === "updates") return "Updates";
  if (id === "work") return "Work";
  return "Personal";
}

export function domainFromSenderLine(sender: string): string | null {
  const e = extractEmail(sender.trim());
  if (!e) return null;
  const at = e.lastIndexOf("@");
  if (at < 0) return null;
  return e.slice(at + 1).toLowerCase() || null;
}

function memoryBoostForFolder(
  memory: UserBehaviorMemoryV1,
  domain: string | null,
  senderLine: string,
  folder: OpenmailSmartFolderId
): number {
  const c = memory.folderRouteCounts ?? {};
  let n = 0;
  if (domain) {
    n += c[folderRouteDomainKey(domain, folder)] ?? 0;
  }
  n += c[folderRouteSenderKey(senderLine, folder)] ?? 0;
  return Math.min(0.38, n * 0.065);
}

/**
 * Heuristic + learned routing suggestion for inbox mail.
 */
export function computeSmartFolderSuggestion(
  mail: ProcessedMail,
  memory: UserBehaviorMemoryV1
): { folder: OpenmailSmartFolderId; confidencePct: number } | null {
  if (
    mail.deleted ||
    mail.archived ||
    mail.folder !== "inbox" ||
    mail.openmailFolderSuggestDismissed ||
    mail.openmailSmartFolderTag
  ) {
    return null;
  }

  const senderLine = mail.sender || mail.title || "";
  const domain = domainFromSenderLine(senderLine);
  const blob = `${mail.subject} ${mail.preview} ${mail.content}`.toLowerCase();

  const base: Record<OpenmailSmartFolderId, number> = {
    inbox: 0.22,
    archive: 0.12,
    promotions: 0.14,
    updates: 0.14,
    work: 0.14,
    personal: 0.14,
  };

  if (mail.syncedAi?.intent === "ignore" || mail.syncedAi?.action === "ignore") {
    base.promotions += 0.22;
    base.archive += 0.12;
  }

  if (
    /\b(newsletter|unsubscribe|digest|promo|marketing|limited time|% off|black friday|cyber monday)\b/i.test(
      blob
    )
  ) {
    base.promotions += 0.34;
  }
  if (
    /\b(noreply|no-reply|notifications?@|mailer-daemon|marketing@|news@|digest@)\b/i.test(
      senderLine.toLowerCase()
    )
  ) {
    base.promotions += 0.2;
    base.updates += 0.08;
  }

  if (
    /\b(invoice|receipt|order confirm|shipped|tracking|payment (received|due)|statement|subscription renew)\b/i.test(
      blob
    )
  ) {
    base.updates += 0.36;
  }

  if (
    /\b(meeting|calendar|standup|sprint|roadmap|q[1-4] planning|project:)\b/i.test(
      blob
    )
  ) {
    base.work += 0.28;
  }

  if (
    /\b(hi team|dear team|all hands|internal)\b/i.test(blob) &&
    /@(?:corp\.|company\.|internal\.)/i.test(senderLine)
  ) {
    base.work += 0.18;
  }

  if (
    /\b(family|mom|dad|personal|weekend plans|birthday)\b/i.test(blob) &&
    !/\b(invoice|contract|nda)\b/i.test(blob)
  ) {
    base.personal += 0.22;
  }

  if (mail.priority === "low" && !mail.needsReply) {
    base.archive += 0.1;
    base.promotions += 0.06;
  }

  for (const id of SMART_FOLDER_IDS) {
    base[id] += memoryBoostForFolder(memory, domain, senderLine, id);
  }

  const ranked = [...SMART_FOLDER_IDS].sort((a, b) => base[b]! - base[a]!);
  const best = ranked[0]!;
  const second = ranked[1]!;
  const bestScore = base[best]!;
  const secondScore = base[second]!;

  if (bestScore < 0.36) return null;
  if (bestScore - secondScore < 0.04 && best !== "inbox") return null;

  const rawPct = Math.round(
    Math.min(97, Math.max(52, 52 + (bestScore - 0.35) * 110))
  );
  return { folder: best, confidencePct: rawPct };
}
