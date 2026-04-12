import type { OpenmailSmartFolderId } from "@/lib/mailTypes";
import { extractEmail } from "@/lib/mailAddress";

/** Maps a user-typed sidebar folder name to a smart-folder tag when it matches known buckets. */
export function matchCustomFolderNameToSmartTag(
  name: string
): OpenmailSmartFolderId | null {
  const k = name.trim().toLowerCase();
  const map: Record<string, OpenmailSmartFolderId> = {
    inbox: "inbox",
    work: "work",
    personal: "personal",
    promotions: "promotions",
    updates: "updates",
    archive: "archive",
  };
  return map[k] ?? null;
}

export function folderRouteDomainKey(
  domain: string,
  folder: OpenmailSmartFolderId
): string {
  return `d:${domain}:${folder}`;
}

export function folderRouteSenderKey(
  senderLine: string,
  folder: OpenmailSmartFolderId
): string {
  const e = extractEmail(senderLine.trim()) ?? senderLine.trim();
  const norm = e.replace(/\s+/g, " ").trim().toLowerCase().slice(0, 96);
  return `s:${norm}:${folder}`;
}
