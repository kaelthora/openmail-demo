import type { MailItem } from "@/lib/mailTypes";

/** High-risk demo inbox: mixed safe + phishing + scam patterns for AI protection UX. */
export const OPENMAIL_DEMO_MAIL_ITEMS: MailItem[] = [
  {
    id: "demo-google-security",
    folder: "inbox",
    title: "Google",
    sender: "no-reply@accounts.google.com",
    subject: "Critical: Unusual sign-in attempt blocked",
    preview:
      "Someone just used your password. If this wasn’t you, secure your account immediately using the link below.",
    content: `Hello,

We blocked a suspicious sign-in to your Google Account from an unrecognized device in Eastern Europe.

When: ${new Date().toLocaleString()}
Device: Unknown browser on Windows

If this was you, you can ignore this message. If not, someone else may have your password.

Verify and secure your account now (expires in 4 hours):
https://google-security-verify.net/login-challenge?session=demo&src=urgent

Do not forward this email.

Thanks,
The Google Accounts team`,
    aiPreview: "Spoofed security alert with urgency and off-domain link",
    confidence: 91,
    needsReply: false,
    deleted: false,
    read: false,
    date: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    x: 42,
    y: 38,
    rfc822MessageId: "<demo-google-security@openmail.demo>",
    demoClassification: { label: "SUSPICIOUS", score: 74 },
  },
  {
    id: "demo-amazon-scam",
    folder: "inbox",
    title: "Amazon",
    sender: "shipping@amaz0n-delivery.net",
    subject: "Action required: Your package could not be delivered",
    preview:
      "We attempted delivery but no one was available. Open the attached shipping summary and reschedule.",
    content: `Hello Amazon customer,

We tried to deliver your order #408-9921144-2201833 today but no one was available to sign.

To reschedule delivery, review the attached shipping details and confirm your address within 48 hours.

Reschedule online:
https://amazon-delivery-fail.xyz/reship?order=demo&ref=prime

Regards,
Amazon Shipping Support`,
    aiPreview: "Typosquat sender + fake delivery failure + attachment",
    confidence: 86,
    needsReply: false,
    deleted: false,
    read: false,
    date: new Date(Date.now() - 14 * 60 * 60 * 1000).toISOString(),
    x: 55,
    y: 48,
    rfc822MessageId: "<demo-amazon-scam@openmail.demo>",
    demoClassification: { label: "SUSPICIOUS", score: 69 },
    attachments: [
      {
        id: "att-amazon-pdf",
        name: "shipping-details.pdf",
        sizeLabel: "248 KB",
        sizeBytes: 253952,
        riskLevel: "suspicious",
      },
    ],
  },
  {
    id: "demo-crypto-blocked",
    folder: "inbox",
    title: "Ledger Security",
    sender: "support@wallet-drain.xyz",
    subject: "URGENT: Wallet compromised",
    preview:
      "Unauthorized outgoing transactions detected. Freeze and recover your assets using the emergency portal.",
    content: `URGENT SECURITY NOTICE

Our systems flagged a drain attempt on your primary wallet. Several outbound transfers were initiated from an IP in a high-risk jurisdiction.

We have attached an emergency recovery tool. Do not use any other installer.

You must also revoke access via the official recovery endpoint:
https://wallet-drain.xyz/emergency-recover?wallet=demo

Failure to act within 2 hours may result in total loss.

— Ledger Security Operations`,
    aiPreview: "High-pressure crypto recovery phishing",
    confidence: 93,
    needsReply: false,
    deleted: false,
    read: false,
    date: new Date(Date.now() - 40 * 60 * 1000).toISOString(),
    x: 50,
    y: 52,
    rfc822MessageId: "<demo-crypto-blocked@openmail.demo>",
    demoClassification: { label: "BLOCKED", score: 97 },
    demoAlwaysShowInInbox: true,
    attachments: [
      {
        id: "att-ledger-recovery",
        name: "Emergency-Recovery.dmg",
        sizeLabel: "1.2 MB",
        sizeBytes: 1258291,
        riskLevel: "blocked",
      },
    ],
  },
  {
    id: "demo-client-safe",
    folder: "inbox",
    title: "Alex Rivera",
    sender: "alex.rivera@northwind.design",
    subject: "Re: Q1 deck — timeline confirmation",
    preview:
      "Thanks for the draft. Can we lock the review for Monday? I added a calendar placeholder.",
    content: `Hi,

The latest deck looks great. Let’s lock the exec review for Monday 10:00 PT.

Optional video room (internal):
https://meet.northwind.design/q1-review

If you need another slot, propose two alternatives and I’ll pick one.

Thanks,
Alex`,
    aiPreview: "Routine client coordination — trusted domain",
    confidence: 84,
    needsReply: true,
    deleted: false,
    read: true,
    date: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
    x: 48,
    y: 44,
    rfc822MessageId: "<demo-client-safe@openmail.demo>",
    demoClassification: { label: "SAFE", score: 14 },
    attachments: [
      {
        id: "att-safe-outline",
        name: "Q1-outline.docx",
        sizeLabel: "42 KB",
        sizeBytes: 43008,
        riskLevel: "safe",
      },
    ],
  },
];
