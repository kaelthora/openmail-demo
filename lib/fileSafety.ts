import {
  analyzeMailSecurity,
  type MailSecurityInput,
} from "./mailSecuritySignals";

export type FileSafetyVerdict = "safe" | "suspicious" | "dangerous";

export type FileSafetyResult = {
  verdict: FileSafetyVerdict;
  reason: string;
  riskScore: number;
};

/** Blocked executable / script extensions — can run code. */
const DANGEROUS_EXT =
  /^(exe|scr|bat|cmd|ps1|vbs|js|jar|msi|dll|com|pif|hta|reg|app|deb|rpm)$/i;

/** Macro-enabled Office — not auto-blocked, but warned. */
const MACRO_OFFICE_EXT = /^(docm|xlsm|pptm)$/i;
const SAFE_DOC_EXT =
  /^(pdf|txt|md|rtf|doc|docx|xls|xlsx|ppt|pptx|csv|png|jpg|jpeg|gif|webp)$/i;
const ARCHIVE_EXT = /^(zip|rar|7z|tar|gz)$/i;

function pressureLanguageScore(text: string): number {
  const t = text.toLowerCase();
  let s = 0;
  if (/\b(urgent|immediately|asap|today only|final notice|act now)\b/.test(t)) s += 10;
  if (/\b(invoice overdue|payment failed|wire transfer|gift card|verify account)\b/.test(t)) s += 8;
  return Math.min(18, s);
}

function fileBaseName(name: string): string {
  const parts = name.trim().split(/[/\\]/);
  return parts[parts.length - 1] ?? name;
}

function lastExtension(name: string): string {
  const base = fileBaseName(name).toLowerCase();
  const dot = base.lastIndexOf(".");
  return dot >= 0 ? base.slice(dot + 1) : "";
}

/**
 * Heuristic “AI file check”: filename rules + same security engine as mail analysis,
 * with the attachment name appended to the synthetic body text.
 */
export function analyzeFileAttachment(
  fileName: string,
  mail: MailSecurityInput
): FileSafetyResult {
  const trimmed = fileName.trim();
  if (!trimmed) {
    return {
      verdict: "dangerous",
      reason: "Missing file name — cannot verify.",
      riskScore: 100,
    };
  }

  const base = fileBaseName(trimmed);
  const lower = base.toLowerCase();
  const ext = lastExtension(trimmed);

  if (DANGEROUS_EXT.test(ext)) {
    return {
      verdict: "dangerous",
      reason:
        "Executable and script attachments are blocked — they can run code on your device.",
      riskScore: 100,
    };
  }

  if (
    /\.(pdf|docx?|xlsx?|pptx?|png|jpe?g|gif|webp|zip|rar|7z|txt)\.(exe|scr|bat|cmd|js|jar|msi|com)$/i.test(
      lower
    )
  ) {
    return {
      verdict: "dangerous",
      reason:
        "This file name looks like a disguised executable (double extension).",
      riskScore: 100,
    };
  }

  let riskScore = 10;
  let topReason = "";

  if (MACRO_OFFICE_EXT.test(ext)) {
    riskScore += 42;
    topReason =
      "Macro-enabled Office files can run scripts. Only open if you fully trust the sender.";
  } else if (ARCHIVE_EXT.test(ext)) {
    riskScore += 26;
    topReason = "Compressed attachments often hide unknown file content.";
  } else if (!SAFE_DOC_EXT.test(ext)) {
    riskScore += 34;
    topReason = "Unknown attachment type — open only with caution.";
  }

  riskScore += pressureLanguageScore(
    [mail.subject ?? "", mail.preview ?? "", mail.content ?? ""].join("\n")
  );

  const augmented = `${mail.content ?? ""}\nattachment: ${base}`;
  const result = analyzeMailSecurity({ ...mail, content: augmented });

  if (result.securityLevel === "high_risk") {
    riskScore += 28;
    if (!topReason) {
      topReason =
        result.securityReason ||
        "This attachment matches high-risk signals in context.";
    }
  } else if (result.securityLevel === "suspicious") {
    riskScore += 14;
  }

  riskScore = Math.max(0, Math.min(100, Math.round(riskScore)));

  if (riskScore >= 75) {
    return {
      verdict: "dangerous",
      reason:
        topReason ||
        result.securityReason ||
        "This attachment matches high-risk signals in context.",
      riskScore,
    };
  }

  if (riskScore >= 40) {
    return {
      verdict: "suspicious",
      reason:
        topReason ||
        result.securityReason ||
        "This attachment looks suspicious given the message context.",
      riskScore,
    };
  }

  return { verdict: "safe", reason: "", riskScore };
}

export function analyzeFileAttachmentAsync(
  fileName: string,
  mail: MailSecurityInput
): Promise<FileSafetyResult> {
  const delay = 80 + Math.floor(Math.random() * 81);
  return new Promise((resolve) => {
    globalThis.setTimeout(() => {
      resolve(analyzeFileAttachment(fileName, mail));
    }, delay);
  });
}
