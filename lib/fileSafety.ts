import {
  analyzeMailSecurity,
  type MailSecurityInput,
} from "./mailSecuritySignals";

export type FileSafetyVerdict = "safe" | "suspicious" | "dangerous";

export type FileSafetyResult = {
  verdict: FileSafetyVerdict;
  reason: string;
};

/** Blocked executable / script extensions — can run code. */
const DANGEROUS_EXT =
  /^(exe|scr|bat|cmd|ps1|vbs|js|jar|msi|dll|com|pif|hta|reg|app|deb|rpm)$/i;

/** Macro-enabled Office — not auto-blocked, but warned. */
const MACRO_OFFICE_EXT = /^(docm|xlsm|pptm)$/i;

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
    return { verdict: "dangerous", reason: "Missing file name — cannot verify." };
  }

  const base = fileBaseName(trimmed);
  const lower = base.toLowerCase();
  const ext = lastExtension(trimmed);

  if (DANGEROUS_EXT.test(ext)) {
    return {
      verdict: "dangerous",
      reason:
        "Executable and script attachments are blocked — they can run code on your device.",
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
    };
  }

  if (MACRO_OFFICE_EXT.test(ext)) {
    return {
      verdict: "suspicious",
      reason:
        "Macro-enabled Office files can run scripts. Only open if you fully trust the sender.",
    };
  }

  const augmented = `${mail.content ?? ""}\nattachment: ${base}`;
  const result = analyzeMailSecurity({ ...mail, content: augmented });

  if (result.securityLevel === "high_risk") {
    return {
      verdict: "dangerous",
      reason:
        result.securityReason ||
        "This attachment matches high-risk signals in context.",
    };
  }

  if (result.securityLevel === "suspicious") {
    return {
      verdict: "suspicious",
      reason:
        result.securityReason ||
        "This attachment looks suspicious given the message context.",
    };
  }

  return { verdict: "safe", reason: "" };
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
