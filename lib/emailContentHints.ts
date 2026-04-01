/** Same URL shapes as `EmailBodyWithLinks` — list cards can hint before open. */
const DETECTABLE_URL = /https?:\/\/[^\s<>"')]+|www\.[^\s<>"')]+/i;

export function mailContainsDetectableUrls(mail: {
  subject?: string;
  preview?: string;
  content?: string;
}): boolean {
  const blob = [mail.subject, mail.preview, mail.content]
    .filter(Boolean)
    .join("\n");
  return Boolean(blob && DETECTABLE_URL.test(blob));
}
