import { analyzeMailSecurity } from "@/lib/mailSecuritySignals";
import type { MailItem, ProcessedMail } from "@/lib/mailTypes";
import { OPENMAIL_DEMO_MODE } from "@/lib/openmailDemo";

export function getAttentionScore(
  mail: Pick<ProcessedMail, "confidence" | "intent" | "priority">
): number {
  let score = 0;
  score += mail.confidence || 0;
  if (mail.priority === "urgent") score += 1;
  if (mail.intent === "pay") score += 0.5;
  if (mail.intent === "schedule") score += 0.3;
  return score;
}

export function processMails(inputMails: MailItem[]): ProcessedMail[] {
  return inputMails.map((mail) => {
    const text = `${mail.subject} ${mail.preview}`.toLowerCase();

    let priorityPoints = 0;
    let cluster: ProcessedMail["cluster"] = "other";

    if (text.includes("urgent")) {
      priorityPoints += 50;
      cluster = "urgent";
    }

    if (text.includes("meeting")) {
      priorityPoints += 30;
      cluster = "meeting";
    }

    if (text.includes("invoice") || text.includes("payment")) {
      priorityPoints += 40;
      cluster = "money";
    }

    let intent: ProcessedMail["intent"] = "read";

    if (text.includes("meeting") || text.includes("call")) {
      intent = "schedule";
    }

    if (text.includes("invoice") || text.includes("payment")) {
      intent = "pay";
    }

    if (text.includes("can you") || text.includes("please")) {
      intent = "reply";
    }

    if (text.includes("follow up") || text.includes("just checking")) {
      intent = "follow_up";
    }

    const raw = mail.confidence;
    let intentConfidence = 0.92;
    if (raw != null && raw > 0) {
      intentConfidence = raw > 1 ? raw / 100 : raw;
    }
    intentConfidence = Math.min(0.99, Math.max(0.05, intentConfidence));

    let priority: "urgent" | "medium" | "low" = "low";
    if (cluster === "urgent" || priorityPoints > 50) {
      priority = "urgent";
    } else if (cluster === "meeting" || cluster === "money" || priorityPoints >= 20) {
      priority = "medium";
    }

    const security = analyzeMailSecurity({
      sender: mail.sender,
      title: mail.title,
      subject: mail.subject,
      preview: mail.preview,
      content: mail.content,
    });

    let securityRiskScore = security.riskScore;
    let securityLevel = security.securityLevel;
    let securityReason = security.securityReason;
    let securityAiSubline = security.securityAiSubline;
    let securityWhyBullets = security.whyBullets;

    if (OPENMAIL_DEMO_MODE && mail.demoClassification) {
      const dc = mail.demoClassification;
      securityRiskScore = dc.score;
      if (dc.label === "BLOCKED") {
        securityLevel = "high_risk";
        securityReason = "AI classification: blocked threat";
        securityAiSubline = "Do not interact with links or attachments.";
        securityWhyBullets = [
          "Elevated phishing or malware signals",
          "Automatic protection active",
        ];
      } else if (dc.label === "SUSPICIOUS") {
        securityLevel = "suspicious";
        securityReason = "AI classification: suspicious";
        securityAiSubline = "Review carefully before clicking.";
        securityWhyBullets = [
          "Sender or links do not fully align",
          "Sandbox recommended",
        ];
      } else {
        securityLevel = "safe";
        securityReason = "";
        securityAiSubline = "";
        securityWhyBullets = [
          "No elevated signals in demo profile",
          "Standard handling",
        ];
      }
    }

    const base = {
      ...mail,
      priorityScore: priorityPoints,
      cluster,
      intent,
      intentConfidence,
      priority,
      securityRiskScore,
      securityLevel,
      securityReason,
      securityAiSubline,
      securityWhyBullets,
    };

    return {
      ...base,
      attentionScore: getAttentionScore(base),
    };
  });
}
