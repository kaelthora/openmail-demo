/**
 * Risk-aligned sandbox presentation for links and attachments.
 * - normal: verified / low-risk review (optional path for safe content)
 * - isolated: elevated monitoring for suspicious content
 * - restricted: admin-visible override for blocked content only
 */
export type SandboxMode = "normal" | "isolated" | "restricted";

export function parseSandboxMode(raw: string | null | undefined): SandboxMode {
  if (raw === "isolated" || raw === "restricted" || raw === "normal") {
    return raw;
  }
  return "normal";
}
