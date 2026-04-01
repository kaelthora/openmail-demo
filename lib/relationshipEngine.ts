type ContactProfile = {
  email: string;
  preferredTone?: string;
  lastSelectedStyle?: string;
  interactionCount: number;
};

type ContactProfileUpdate = Partial<
  Omit<ContactProfile, "email" | "interactionCount">
> & {
  interactionCount?: number;
};

const contactStore = new Map<string, ContactProfile>();

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function getContactProfile(email: string): ContactProfile {
  const normalizedEmail = normalizeEmail(email);
  const existing = contactStore.get(normalizedEmail);

  if (existing) return existing;

  const created: ContactProfile = {
    email: normalizedEmail,
    preferredTone: "Professional",
    lastSelectedStyle: "Professional",
    interactionCount: 0,
  };

  contactStore.set(normalizedEmail, created);
  return created;
}

export function updateContactProfile(
  email: string,
  data: ContactProfileUpdate
): ContactProfile {
  const current = getContactProfile(email);

  const next: ContactProfile = {
    ...current,
    ...data,
    email: current.email,
    interactionCount:
      data.interactionCount ?? current.interactionCount + 1,
  };

  contactStore.set(current.email, next);
  return next;
}

