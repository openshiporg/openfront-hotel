import { createTransport, getTestMessageUrl } from "nodemailer";
import type { HotelCommunicationPayload } from '../communications/commands';
import { HotelOutboxDeliveryError } from '../communications/outbox';
import { configuredSiteOrigin } from './productionConfig';
import { emailButton, emailHeading, emailLayout, emailMuted, emailPanel, emailParagraph, emailTotals } from "./email-layout";

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

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function emailHeader(value: unknown) {
  return String(value ?? '').replace(/[\r\n]+/g, ' ').trim();
}

function communicationMoney(amountMinor: number | null | undefined, currencyCode = 'USD') {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currencyCode,
  }).format(Number(amountMinor || 0) / 100);
}

function communicationDate(value?: string) {
  if (!value) return '';
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC',
  }).format(new Date(value));
}

function holdUntilLabel(payload: HotelCommunicationPayload) {
  if (!payload.holdExpiresAt) return '';
  const zone = payload.propertyTimeZone || 'UTC';
  let label: string;
  try {
    label = new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: zone, timeZoneName: 'short' }).format(new Date(payload.holdExpiresAt));
  } catch {
    label = new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'UTC', timeZoneName: 'short' }).format(new Date(payload.holdExpiresAt));
  }
  return label;
}

function hotelCommunicationEmail(payload: HotelCommunicationPayload) {
  const recipient = payload.to;
  if (!recipient) throw new Error('Hotel communication recipient is required.');
  const property = escapeHtml(payload.propertyName);
  if (payload.kind === 'contact_received') {
    return {
      subject: `[Website] ${emailHeader(payload.contactSubject)}`,
      html: emailLayout({
        storeName: payload.propertyName,
        preheader: payload.contactSubject,
        title: 'Website message',
        body: `${emailPanel(`<strong>From:</strong> ${escapeHtml(payload.guestName)} &lt;${escapeHtml(payload.replyTo)}&gt;<br><strong>Phone:</strong> ${escapeHtml(payload.contactPhone || 'Not provided')}<br><strong>Subject:</strong> ${escapeHtml(payload.contactSubject)}`)}
${emailPanel(`<span style="white-space:pre-wrap;">${escapeHtml(payload.contactMessage)}</span>`)}`,
      }),
    };
  }

  const confirmationNumber = payload.confirmationNumber;
  if (!confirmationNumber) throw new Error('Booking communication confirmation number is required.');
  const title = payload.kind === 'booking_received' ? 'Reservation request received' : payload.kind === 'booking_prearrival' ? 'Your upcoming stay' : payload.kind === 'booking_confirmation'
    ? 'Reservation confirmed'
    : payload.kind === 'booking_updated'
      ? 'Reservation updated'
      : payload.kind === 'booking_modification_response'
        ? `Change request ${payload.modificationDecision || 'reviewed'}`
        : payload.kind === 'booking_no_show'
          ? 'Reservation marked no-show'
          : payload.kind === 'booking_refund'
            ? 'Reservation refund recorded'
            : 'Reservation cancelled';
  const total = communicationMoney(payload.totalAmountMinor, payload.currencyCode);
  const cancellation = payload.kind === 'booking_cancelled' || payload.kind === 'booking_no_show'
    ? `${emailHeading('Policy settlement')}${emailParagraph(escapeHtml(payload.cancellationSummary || 'The booked terms were applied.'))}${emailTotals([{ label: 'Policy fee', value: communicationMoney(payload.cancellationFeeMinor, payload.currencyCode) }, { label: 'Refund', value: communicationMoney(payload.refundableMinor, payload.currencyCode) }])}`
    : payload.kind === 'booking_refund'
      ? `${emailHeading('Refund')}${emailParagraph(escapeHtml(payload.cancellationSummary || 'A refund was recorded by the property.'))}${emailTotals([{ label: 'Refund', value: communicationMoney(payload.refundableMinor, payload.currencyCode) }])}`
    : payload.kind === 'booking_modification_response'
      ? `${emailParagraph(`<strong>Decision:</strong> ${escapeHtml(payload.modificationDecision || 'reviewed')}`)}${payload.staffNote ? emailParagraph(`<strong>Property note:</strong> ${escapeHtml(payload.staffNote)}`) : ''}`
      : emailTotals([{ label: 'Total', value: total }]);
  const lookupUrl = `${getBaseUrlForEmails()}/bookings/lookup?confirmation=${encodeURIComponent(confirmationNumber)}&email=${encodeURIComponent(recipient)}`;
  return {
    subject: `${emailHeader(title)} · ${emailHeader(payload.confirmationNumber)} · ${emailHeader(payload.propertyName)}`,
    html: emailLayout({
      storeName: payload.propertyName,
      preheader: `${title} · ${payload.confirmationNumber}`,
      title,
      body: `${emailParagraph(`Hello ${escapeHtml(payload.guestName)},`)}
${emailParagraph(payload.kind === 'booking_received' ? `We received your reservation request with ${property}. Your room is held${payload.holdExpiresAt ? ` until ${escapeHtml(holdUntilLabel(payload))}` : ' for a short time'}. It is not confirmed until payment is complete, and the hold lapses if it isn't.` : payload.kind === 'booking_prearrival' ? `We look forward to welcoming you to ${property}. Review your arrival details below.` : payload.kind === 'booking_modification_response' ? `Your change request with ${property} has been reviewed.` : `Your reservation with ${property} has been ${payload.kind === 'booking_confirmation' ? 'confirmed' : payload.kind === 'booking_updated' ? 'updated' : payload.kind === 'booking_no_show' ? 'marked as a no-show under the booked terms' : payload.kind === 'booking_refund' ? 'updated with a refund' : 'cancelled'}.`)}
${emailPanel(`<strong>Confirmation:</strong> ${escapeHtml(payload.confirmationNumber)}<br><strong>Room:</strong> ${escapeHtml(payload.roomTypeName)}<br><strong>Arrival:</strong> ${escapeHtml(communicationDate(payload.checkInDate))}<br><strong>Departure:</strong> ${escapeHtml(communicationDate(payload.checkOutDate))}<br><strong>Guests:</strong> ${escapeHtml(payload.numberOfGuests)}`)}
${cancellation}
${emailButton('View your reservation', lookupUrl)}
${emailMuted(`Use your confirmation number and email to open the secure lookup. Questions? Contact <a class="em-link" href="mailto:${escapeHtml(payload.contactEmail)}" style="color:#52525b;text-decoration:underline;">${escapeHtml(payload.contactEmail)}</a>.`)}`,
    }),
  };
}

/**
 * Delivers one transactionally queued guest/property communication. Errors are
 * intentionally propagated so the outbox can retry and retain dead-letter
 * evidence instead of reporting a false success.
 */
export async function sendHotelCommunicationEmail(payload: HotelCommunicationPayload) {
  let sendStarted = false;
  try {
    const message = hotelCommunicationEmail(payload);
    const transport = getTransport();
    const from = mailFrom();
    sendStarted = true;
    const info = await transport.sendMail({
      to: payload.to,
      from,
      replyTo: payload.replyTo || undefined,
      subject: message.subject,
      html: message.html,
    });
    const accepted = (info.accepted || []).map((recipient: any) => String(typeof recipient === 'string' ? recipient : recipient.address).toLowerCase());
    if (!accepted.includes(payload.to.toLowerCase()) || (info.rejected || []).length) {
      throw new HotelOutboxDeliveryError(false);
    }
    // nodemailer's messageId is generated locally; the SMTP reply line is what carries the provider's own id.
    const providerResponse = typeof (info as any).response === 'string' ? (info as any).response.replace(/[\r\n]+/g, ' ').trim().slice(0, 300) : '';
    return { messageId: info.messageId, ...(providerResponse ? { providerResponse } : {}), transportStatus: 'accepted_by_smtp', inboxDeliveryVerified: false };
  } catch (error) {
    if (error instanceof HotelOutboxDeliveryError) throw error;
    throw new HotelOutboxDeliveryError(sendStarted);
  }
}
