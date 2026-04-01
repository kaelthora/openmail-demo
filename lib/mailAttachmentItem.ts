/** Shared attachment row for mail UI + security handlers. */
export type MailAttachmentItem = {
  id: string;
  name: string;
  sizeLabel?: string;
  sizeBytes?: number;
  riskLevel?: "safe" | "suspicious" | "blocked";
};
