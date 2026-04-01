type ContactContext = {
  lastMessages: string[];
  lastSummary: string;
};

const contextStore = new Map<string, ContactContext>();

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function summarize(messages: string[]): string {
  if (messages.length === 0) return "";
  const latest = messages[messages.length - 1];
  const clipped =
    latest.length > 120 ? `${latest.slice(0, 117)}...` : latest;
  return `Recent focus: ${clipped}`;
}

export function getContext(email: string): ContactContext {
  const key = normalizeEmail(email);
  const existing = contextStore.get(key);

  if (existing) return existing;

  const created: ContactContext = {
    lastMessages: [],
    lastSummary: "",
  };

  contextStore.set(key, created);
  return created;
}

export function updateContext(
  email: string,
  newMessage: string
): ContactContext {
  const key = normalizeEmail(email);
  const current = getContext(key);
  const cleaned = String(newMessage || "").trim();

  const nextMessages = cleaned
    ? [...current.lastMessages, cleaned].slice(-5)
    : current.lastMessages;

  const next: ContactContext = {
    lastMessages: nextMessages,
    lastSummary: summarize(nextMessages),
  };

  contextStore.set(key, next);
  return next;
}

/** Clear all in-memory thread context (e.g. “New Mail” fresh compose). */
export function resetAllContext(): void {
  contextStore.clear();
}

