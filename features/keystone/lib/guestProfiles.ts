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
  if (existing) return existing;
  const names = splitGuestName(name);
  return context.prisma.guest.create({
    data: {
      ...names,
      email: normalizedEmail,
      phone: phone?.trim() || '',
    },
  });
}
