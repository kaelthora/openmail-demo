import type { SecurityLevel as MailSecurityLevel } from "@/lib/mailSecuritySignals";

export type MailFolder = "inbox" | "sent" | "drafts";

/** AI analysis persisted from sync (`analyzeEmail`) — drives CORE when present */
export type SyncedAiAnalysis = {
  risk: "high" | "medium" | "safe";
  summary: string;
  reason: string | null;
  action: "reply" | "ignore" | "escalate" | null;
  suggestions: string[];
};

export type MailItem = {
  id: string;
  title: string;
  subject: string;
  preview: string;
  content: string;
  aiPreview: string;
  confidence: number;
  needsReply: boolean;
  deleted: boolean;
  /** Mailbox folder (IMAP-ready mental model) */
  folder: MailFolder;
  /** Read state for inbox UX */
  read?: boolean;
  important?: boolean;
  age?: number;
  spam?: boolean;
  priority?: "urgent" | "medium" | "low";
  date?: string;
  sender?: string;
  project?: string;
  thread?: string;
  x?: number;
  y?: number;
  resolved?: boolean;
  scheduled?: boolean;
  attachments?: Array<{
    id: string;
    name: string;
    sizeLabel?: string;
    sizeBytes?: number;
    mimeType?: string;
    /** Demo/static: skip async scan; drive modals directly */
    riskLevel?: "safe" | "suspicious" | "blocked";
  }>;
  /** RFC Message-ID for threading / replies */
  rfc822MessageId?: string;
  /** Demo: fixed AI threat label + score for UI and folder rules */
  demoClassification?: {
    label: "SAFE" | "SUSPICIOUS" | "BLOCKED";
    score: number;
  };
  /** Demo: keep high_risk mail visible in main inbox (e.g. crypto trap) */
  demoAlwaysShowInInbox?: boolean;
  /** Link-defense UI: force quarantine classification on next process */
  linkQuarantine?: boolean;
  /** From DB email sync — CORE panel prefers this over local heuristics */
  syncedAi?: SyncedAiAnalysis;
  /** DB mailbox owner; undefined for client-only / demo mail */
  accountId?: string | null;
};

export type ProcessedMail = MailItem & {
  priorityScore: number;
  cluster: "urgent" | "meeting" | "money" | "other";
  intent: "read" | "schedule" | "pay" | "reply" | "follow_up";
  intentConfidence: number;
  attentionScore: number;
  securityRiskScore: number;
  securityLevel: MailSecurityLevel;
  securityReason: string;
  securityAiSubline: string;
  securityWhyBullets: string[];
};
