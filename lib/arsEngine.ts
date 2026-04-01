/**
 * Auto Response Security — neutral, non-confrontational outbound copy.
 * Suitable for logging to Sent without escalating the sender.
 */

export type ArsMailRef = {
  sender: string;
  subject: string;
  content?: string;
};

export function buildArsReply(mail: ArsMailRef): {
  to: string;
  subject: string;
  body: string;
} {
  const rawSubject = String(mail.subject || "(no subject)").trim();
  const subject = /^re:\s/i.test(rawSubject)
    ? rawSubject
    : `Re: ${rawSubject}`;

  const body = [
    "Thank you for your message.",
    "",
    "This message has been flagged as suspicious during a routine security review. No action will be taken based on its contents.",
    "",
    "If your request is legitimate, please contact us through a channel you already know to be authentic.",
    "",
    "Kind regards",
  ].join("\n");

  return {
    to: String(mail.sender || "Sender").trim(),
    subject,
    body,
  };
}
