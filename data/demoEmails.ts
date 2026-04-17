export const demoEmails = [
  {
    id: "1",
    from: "security@goog1e-verification.com",
    subject: "URGENT: Your account will be suspended",
    preview: "Immediate action required",
    risk: "high",
    tags: ["urgency", "impersonation", "link"],
    hasAttachment: false,
    hasLink: true,
  },
  {
    id: "2",
    from: "invoice@crypto-payments.io",
    subject: "Payment required - overdue invoice",
    preview: "Final notice before escalation",
    risk: "high",
    tags: ["money", "pressure"],
    hasAttachment: true,
    hasLink: false,
  },
  {
    id: "3",
    from: "drive@google.com",
    subject: "Document shared with you",
    preview: "Please review",
    risk: "medium",
    tags: ["attachment"],
    hasAttachment: true,
    hasLink: false,
  },
] as const;

