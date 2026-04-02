/** Shared attachment row for mail UI + security handlers. */
export type MailAttachmentItem = {
  id: string;
  name: string;
  sizeLabel?: string;
  sizeBytes?: number;
  /** MIME / content-type when known (e.g. from sync metadata) */
  mimeType?: string;
  riskLevel?: "safe" | "suspicious" | "blocked";
};
