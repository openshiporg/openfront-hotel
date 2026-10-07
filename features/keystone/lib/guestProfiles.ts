export const DEFAULT_GUEST_COMMUNICATION_PREFERENCES = {
  emailMarketing: false,
  smsNotifications: false,
  phoneNotifications: false,
  preferredLanguage: 'en',
  newsletterSubscribed: false,
} as const;

export function guestCommunicationPreferencesForCreate(value?: unknown) {
  return value ?? { ...DEFAULT_GUEST_COMMUNICATION_PREFERENCES };
}

export function normalizeGuestEmail(value: string) {
  const email = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('A valid guest email is required.');
  return email;
}

export function splitGuestName(value: string) {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) throw new Error('Guest name is required.');
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(' ') || 'Guest',
  };
}

export async function ensureGuestProfile(
  context: any,
  { name, email, phone }: { name: string; email: string; phone?: string | null }
) {
  const normalizedEmail = normalizeGuestEmail(email);
  const existing = await context.prisma.guest.findUnique({ where: { email: normalizedEmail } });
  if (existing) {
    if (existing.isBlacklisted) throw new Error('This guest cannot be accepted; contact the property manager.');
    return existing;
  }
  const names = splitGuestName(name);
  return context.prisma.guest.create({
    data: {
      ...names,
      email: normalizedEmail,
      phone: phone?.trim() || '',
      // Do not let the checked-in database default infer promotional consent.
      communicationPreferences: guestCommunicationPreferencesForCreate(),
    },
  });
}
