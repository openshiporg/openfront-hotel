import { createTransport, getTestMessageUrl } from "nodemailer";
import { configuredSiteOrigin } from './productionConfig';
import { emailButton, emailLayout, emailMuted, emailParagraph } from "./email-layout";

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
