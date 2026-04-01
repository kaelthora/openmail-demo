type ThreatMemory = {
  blockedDomains: string[];
  flaggedPatterns: string[];
  knownScamKeywords: string[];
};

const threatMemory: ThreatMemory = {
  blockedDomains: [],
  flaggedPatterns: [],
  knownScamKeywords: [
    "urgent",
    "verify account",
    "password reset",
    "wire transfer",
    "gift card",
    "suspended",
    "click here",
  ],
};

function normalize(value: string): string {
  return String(value || "").trim().toLowerCase();
}

function extractDomain(text: string): string[] {
  const matches = text.match(/[a-z0-9.-]+\.[a-z]{2,}/gi) || [];
  return matches.map((item) => normalize(item));
}

export function addThreat(domain?: string, pattern?: string): void {
  const normalizedDomain = normalize(domain || "");
  const normalizedPattern = normalize(pattern || "");

  if (
    normalizedDomain &&
    !threatMemory.blockedDomains.includes(normalizedDomain)
  ) {
    threatMemory.blockedDomains.push(normalizedDomain);
  }

  if (
    normalizedPattern &&
    !threatMemory.flaggedPatterns.includes(normalizedPattern)
  ) {
    threatMemory.flaggedPatterns.push(normalizedPattern);
  }
}

/** Any domain found in body/sender text matches threat memory blocklist → instant dangerous. */
export function hasBlockedDomainMatch(emailContent: string): boolean {
  const content = normalize(emailContent);
  if (!content || threatMemory.blockedDomains.length === 0) return false;

  const domainsInContent = extractDomain(content);
  return domainsInContent.some((domain) =>
    threatMemory.blockedDomains.includes(domain)
  );
}

/** Flagged patterns + known scam keywords (does not include blocked-domain match). */
export function hasScamPatternMatch(emailContent: string): boolean {
  const content = normalize(emailContent);
  if (!content) return false;

  const hasFlaggedPattern = threatMemory.flaggedPatterns.some((pattern) =>
    content.includes(pattern)
  );

  const hasKnownScamKeyword = threatMemory.knownScamKeywords.some((keyword) =>
    content.includes(keyword)
  );

  return hasFlaggedPattern || hasKnownScamKeyword;
}

export function isKnownThreat(emailContent: string): boolean {
  return (
    hasBlockedDomainMatch(emailContent) || hasScamPatternMatch(emailContent)
  );
}

export function getThreatStats() {
  return {
    blockedDomains: threatMemory.blockedDomains.length,
    flaggedPatterns: threatMemory.flaggedPatterns.length,
    knownScamKeywords: threatMemory.knownScamKeywords.length,
  };
}

/** Read-only copy for UI (e.g. dashboard counts, deduping with user rules). */
export function getThreatMemorySnapshot() {
  return {
    blockedDomains: [...threatMemory.blockedDomains],
    flaggedPatterns: [...threatMemory.flaggedPatterns],
  };
}

