import { createTransport, getTestMessageUrl } from "nodemailer";
import type { HotelCommunicationPayload } from './hotelCommunications';

// SMTP values are infrastructure wiring. Durable property state decides whether
// Hotel communications are eligible for delivery.
export function hotelMailInfrastructureConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_PORT && process.env.SMTP_USER && process.env.SMTP_PASSWORD && process.env.SMTP_FROM);
}

function getBaseUrlForEmails(): string {
  const configured = process.env.PASSWORD_RESET_ORIGIN || process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) return configured.replace(/\/$/, '');
  if (process.env.NODE_ENV === 'production') throw new Error('Email origin is not configured.');
  return 'http://localhost:3001';
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
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
  });
}

function passwordResetEmail({ url }: { url: string }): string {
  const backgroundColor = "#f9f9f9";
  const textColor = "#444444";
  const mainBackgroundColor = "#ffffff";
  const buttonBackgroundColor = "#346df1";
  const buttonBorderColor = "#346df1";
  const buttonTextColor = "#ffffff";

  return `
    <body style="background: ${backgroundColor};">
      <table width="100%" border="0" cellspacing="20" cellpadding="0" style="background: ${mainBackgroundColor}; max-width: 600px; margin: auto; border-radius: 10px;">
        <tr>
          <td align="center" style="padding: 10px 0px 0px 0px; font-size: 18px; font-family: Helvetica, Arial, sans-serif; color: ${textColor};">
            Please click below to reset your password
          </td>
        </tr>
        <tr>
          <td align="center" style="padding: 20px 0;">
            <table border="0" cellspacing="0" cellpadding="0">
              <tr>
                <td align="center" style="border-radius: 5px;" bgcolor="${buttonBackgroundColor}"><a href="${url}" target="_blank" style="font-size: 18px; font-family: Helvetica, Arial, sans-serif; color: ${buttonTextColor}; text-decoration: none; border-radius: 5px; padding: 10px 20px; border: 1px solid ${buttonBorderColor}; display: inline-block; font-weight: bold;">Reset Password</a></td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td align="center" style="padding: 0px 0px 10px 0px; font-size: 16px; line-height: 22px; font-family: Helvetica, Arial, sans-serif; color: ${textColor};">
            If you did not request this email you can safely ignore it.
          </td>
        </tr>
      </table>
    </body>
  `;
}

export async function sendPasswordResetEmail(resetToken: string, to: string, baseUrl?: string): Promise<void> {
  // Use provided baseUrl or fall back to utility function
  const frontendUrl = baseUrl || getBaseUrlForEmails();

  // email the user a token
  const info = await getTransport().sendMail({
    to,
    from: mailFrom(),
    subject: "Your password reset token!",
    html: passwordResetEmail({
      url: `${frontendUrl}/dashboard/reset?token=${resetToken}`,
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

function hotelCommunicationEmail(payload: HotelCommunicationPayload) {
  const recipient = payload.to;
  if (!recipient) throw new Error('Hotel communication recipient is required.');
  const property = escapeHtml(payload.propertyName);
  if (payload.kind === 'contact_received') {
    return {
      subject: `[Website] ${emailHeader(payload.contactSubject)}`,
      html: `<body style="font-family:Arial,sans-serif;color:#222"><h1>${property} website message</h1><p><strong>From:</strong> ${escapeHtml(payload.guestName)} &lt;${escapeHtml(payload.replyTo)}&gt;</p><p><strong>Phone:</strong> ${escapeHtml(payload.contactPhone || 'Not provided')}</p><p><strong>Subject:</strong> ${escapeHtml(payload.contactSubject)}</p><p style="white-space:pre-wrap">${escapeHtml(payload.contactMessage)}</p></body>`,
    };
  }

  const confirmationNumber = payload.confirmationNumber;
  if (!confirmationNumber) throw new Error('Booking communication confirmation number is required.');
  const title = payload.kind === 'booking_confirmation'
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
    ? `<h2>Policy settlement</h2><p>${escapeHtml(payload.cancellationSummary || 'The booked terms were applied.')}</p><p><strong>Refund:</strong> ${escapeHtml(communicationMoney(payload.refundableMinor, payload.currencyCode))}<br/><strong>Policy fee:</strong> ${escapeHtml(communicationMoney(payload.cancellationFeeMinor, payload.currencyCode))}</p>`
    : payload.kind === 'booking_refund'
      ? `<h2>Refund</h2><p>${escapeHtml(payload.cancellationSummary || 'A refund was recorded by the property.')}</p><p><strong>Amount:</strong> ${escapeHtml(communicationMoney(payload.refundableMinor, payload.currencyCode))}</p>`
    : payload.kind === 'booking_modification_response'
      ? `<p><strong>Decision:</strong> ${escapeHtml(payload.modificationDecision || 'reviewed')}</p>${payload.staffNote ? `<p><strong>Property note:</strong> ${escapeHtml(payload.staffNote)}</p>` : ''}`
      : `<p><strong>Total:</strong> ${escapeHtml(total)}</p>`;
  const lookupUrl = `${getBaseUrlForEmails()}/bookings/lookup?confirmation=${encodeURIComponent(confirmationNumber)}&email=${encodeURIComponent(recipient)}`;
  return {
    subject: `${emailHeader(title)} · ${emailHeader(payload.confirmationNumber)} · ${emailHeader(payload.propertyName)}`,
    html: `<body style="font-family:Arial,sans-serif;color:#222"><h1>${escapeHtml(title)}</h1><p>Hello ${escapeHtml(payload.guestName)},</p><p>${payload.kind === 'booking_modification_response' ? `Your change request with ${property} has been reviewed.` : `Your reservation with ${property} has been ${payload.kind === 'booking_confirmation' ? 'confirmed' : payload.kind === 'booking_updated' ? 'updated' : payload.kind === 'booking_no_show' ? 'marked as a no-show under the booked terms' : payload.kind === 'booking_refund' ? 'updated with a refund' : 'cancelled'}.`}</p><p><strong>Confirmation:</strong> ${escapeHtml(payload.confirmationNumber)}<br/><strong>Room:</strong> ${escapeHtml(payload.roomTypeName)}<br/><strong>Arrival:</strong> ${escapeHtml(communicationDate(payload.checkInDate))}<br/><strong>Departure:</strong> ${escapeHtml(communicationDate(payload.checkOutDate))}<br/><strong>Guests:</strong> ${escapeHtml(payload.numberOfGuests)}</p>${cancellation}<p><a href="${escapeHtml(lookupUrl)}">Open the secure reservation lookup</a> using your confirmation number and email.</p><p>Questions? Contact <a href="mailto:${escapeHtml(payload.contactEmail)}">${escapeHtml(payload.contactEmail)}</a>.</p></body>`,
  };
}

/**
 * Delivers one transactionally queued guest/property communication. Errors are
 * intentionally propagated so the outbox can retry and retain dead-letter
 * evidence instead of reporting a false success.
 */
export async function sendHotelCommunicationEmail(payload: HotelCommunicationPayload) {
  const message = hotelCommunicationEmail(payload);
  const info = await getTransport().sendMail({
    to: payload.to,
    from: mailFrom(),
    replyTo: payload.replyTo || undefined,
    subject: message.subject,
    html: message.html,
  });
  return { messageId: info.messageId, accepted: info.accepted, rejected: info.rejected };
}
