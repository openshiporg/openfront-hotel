import { createTransport, getTestMessageUrl } from "nodemailer";
import { configuredSiteOrigin } from './productionConfig';
import { emailButton, emailLayout, emailMuted, emailParagraph, emailTotals, escapeHtml } from "./email-layout";
import { formatStayDate } from '../../../lib/hotelCalendarDate';

// SMTP values are infrastructure wiring. Durable property state decides whether
// Hotel communications are eligible for delivery.
export function hotelMailInfrastructureConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_PORT && process.env.SMTP_USER && process.env.SMTP_PASSWORD && process.env.SMTP_FROM);
}

function getBaseUrlForEmails(): string {
  const configured = process.env.PASSWORD_RESET_ORIGIN || configuredSiteOrigin();
  if (configured) return configured.replace(/\/$/, '');
  if (process.env.NODE_ENV === 'production') throw new Error('Email origin is not configured.');
  // Local development: the origin follows PORT rather than a literal port.
  const port = process.env.PORT?.trim();
  return port && /^\d+$/.test(port) ? `http://localhost:${port}` : 'http://localhost';
}

function mailFrom() {
  if (process.env.SMTP_FROM) return process.env.SMTP_FROM;
  if (process.env.NODE_ENV === 'production') throw new Error('Email sender is not configured.');
  return 'stay@thealderhouse.example';
}

function getTransport() {
  if (!hotelMailInfrastructureConfigured()) throw new Error('Email delivery infrastructure is unconfigured.');
  const host = process.env.SMTP_HOST || (process.env.NODE_ENV === 'production' ? '' : 'smtp.ethereal.email');
  if (!host) throw new Error('SMTP is not configured.');
  return createTransport({
    host,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_PORT === '465',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
  });
}

function passwordResetEmail({ url }: { url: string }): string {
  return emailLayout({
    preheader: "Use this link to choose a new password.",
    title: "Reset your password",
    body: `${emailParagraph("We received a request to reset the password for your account. Use the button below to choose a new one.")}
${emailButton("Reset password", url)}
${emailMuted("If you did not request this, you can safely ignore this email. Your password will not change.")}`,
  });
}

/** The guest's booking confirmation, sent once when a payment confirms the reservation. */
export async function sendBookingConfirmationEmail(context: any, bookingId: string): Promise<string | null> {
  if (!hotelMailInfrastructureConfigured()) return null;
  const booking = await context.prisma.booking.findUnique({
    where: { id: bookingId },
    select: { confirmationNumber: true, guestName: true, guestEmail: true, checkInDate: true, checkOutDate: true,
      numberOfGuests: true, totalAmountMinor: true, balanceDueMinor: true, currencyCode: true,
      roomAssignments: { select: { roomType: { select: { name: true } } } } },
  });
  if (!booking?.guestEmail) return null;
  const settings = await context.prisma.hotelSettings.findFirst({ select: { propertyName: true, checkInTime: true, checkOutTime: true } });
  const hotel = settings?.propertyName || 'the hotel';
  const money = (minor: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: booking.currencyCode || 'USD' }).format(Number(minor || 0) / 100);
  const date = (value: Date) => formatStayDate(value.toISOString(), { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  const rooms = [...new Set(booking.roomAssignments.map((a: any) => a.roomType?.name).filter(Boolean))].join(', ');
  const url = `${getBaseUrlForEmails()}/bookings/lookup`;
  const html = emailLayout({
    storeName: settings?.propertyName || undefined,
    preheader: `Reservation ${booking.confirmationNumber} is confirmed.`,
    title: 'Your reservation is confirmed',
    body: `${emailParagraph(`Thank you, ${escapeHtml(booking.guestName || 'guest')}. Your stay at ${escapeHtml(hotel)} is confirmed.`)}
${emailTotals([
      { label: 'Confirmation number', value: booking.confirmationNumber },
      ...(rooms ? [{ label: 'Room', value: rooms }] : []),
      { label: 'Arrival', value: `${date(booking.checkInDate)}${settings?.checkInTime ? ` from ${settings.checkInTime}` : ''}` },
      { label: 'Departure', value: `${date(booking.checkOutDate)}${settings?.checkOutTime ? ` by ${settings.checkOutTime}` : ''}` },
      { label: 'Guests', value: String(booking.numberOfGuests || 1) },
      { label: 'Balance due', value: money(booking.balanceDueMinor ?? 0) },
      { label: 'Total', value: money(booking.totalAmountMinor) },
    ])}
${emailButton('View your reservation', url)}
${emailMuted('Look it up any time with your confirmation number and this email address.')}`,
  });
  const info = await getTransport().sendMail({
    to: booking.guestEmail,
    from: mailFrom(),
    subject: `Reservation confirmed: ${booking.confirmationNumber}`,
    html,
  });
  console.log('Booking confirmation email sent', { bookingId, messageId: info.messageId });
  return info.messageId || null;
}

export async function sendPasswordResetEmail(resetToken: string, to: string, baseUrl?: string, audience: 'staff' | 'guest' = 'staff'): Promise<void> {
  // Use provided baseUrl or fall back to utility function
  const frontendUrl = baseUrl || getBaseUrlForEmails();
  const resetPath = audience === 'guest'
    ? `/account/reset?token=${encodeURIComponent(resetToken)}&email=${encodeURIComponent(to)}`
    : `/dashboard/reset?token=${resetToken}`;

  // email the user a token
  const info = await getTransport().sendMail({
    to,
    from: mailFrom(),
    subject: "Your password reset token!",
    html: passwordResetEmail({
      url: `${frontendUrl}${resetPath}`,
    }),
  });
  if (process.env.SMTP_USER?.includes("ethereal.email")) {
    console.log(`📧 Message Sent!  Preview it at ${getTestMessageUrl(info as any)}`);
  }
}
