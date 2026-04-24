'use server'

import { createTransport, getTestMessageUrl } from "nodemailer";

// Utility function to get base URL for emails
function getBaseUrlForEmails(): string {
  if (process.env.SMTP_STORE_LINK) {
    return process.env.SMTP_STORE_LINK;
  }

  // Fallback warning - this should be set in production
  console.warn('SMTP_STORE_LINK not set. Please add SMTP_STORE_LINK to your environment variables for email links to work properly.');
  return 'http://localhost:3001'; // Fallback for development
}

const transport = createTransport({
  // @ts-ignore
  host: process.env.SMTP_HOST || 'smtp.ethereal.email',
  port: process.env.SMTP_PORT || 587,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD,
  },
});

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
  const info = await transport.sendMail({
    to,
    from: process.env.SMTP_FROM,
    subject: "Your password reset token!",
    html: passwordResetEmail({
      url: `${frontendUrl}/dashboard/reset?token=${resetToken}`,
    }),
  });
  if (process.env.SMTP_USER?.includes("ethereal.email")) {
    console.log(`📧 Message Sent!  Preview it at ${getTestMessageUrl(info as any)}`);
  }
}

interface BookingConfirmationData {
  confirmationNumber: string;
  guestName: string;
  guestEmail: string;
  checkInDate: string;
  checkOutDate: string;
  numberOfNights: number;
  roomTypeName: string;
  totalAmount: number;
  numberOfGuests: number;
  specialRequests?: string;
}

function bookingConfirmationEmail(data: BookingConfirmationData): string {
  const backgroundColor = "#f9f9f9";
  const textColor = "#444444";
  const mainBackgroundColor = "#ffffff";
  const primaryColor = "#0066cc";
  const borderColor = "#e0e0e0";

  const checkInDate = new Date(data.checkInDate).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  const checkOutDate = new Date(data.checkOutDate).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  return `
    <body style="background: ${backgroundColor}; font-family: Helvetica, Arial, sans-serif;">
      <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background: ${backgroundColor};">
        <tr>
          <td align="center" style="padding: 40px 20px;">
            <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background: ${mainBackgroundColor}; max-width: 600px; border-radius: 10px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">

              <!-- Header -->
              <tr>
                <td style="padding: 40px 40px 20px 40px; text-align: center; border-bottom: 2px solid ${primaryColor};">
                  <h1 style="margin: 0; color: ${primaryColor}; font-size: 28px;">Grand Hotel</h1>
                  <p style="margin: 10px 0 0 0; color: ${textColor}; font-size: 16px;">Booking Confirmation</p>
                </td>
              </tr>

              <!-- Confirmation Number -->
              <tr>
                <td style="padding: 30px 40px; text-align: center; background: #f8f9fa; border-bottom: 1px solid ${borderColor};">
                  <p style="margin: 0 0 5px 0; color: #666; font-size: 14px;">Confirmation Number</p>
                  <h2 style="margin: 0; color: ${primaryColor}; font-size: 32px; font-weight: bold;">${data.confirmationNumber}</h2>
                </td>
              </tr>

              <!-- Guest Info -->
              <tr>
                <td style="padding: 30px 40px;">
                  <p style="margin: 0 0 20px 0; color: ${textColor}; font-size: 16px;">Dear ${data.guestName},</p>
                  <p style="margin: 0 0 20px 0; color: ${textColor}; font-size: 16px; line-height: 1.6;">
                    Thank you for choosing Grand Hotel! Your reservation has been confirmed. We look forward to welcoming you.
                  </p>
                </td>
              </tr>

              <!-- Booking Details -->
              <tr>
                <td style="padding: 0 40px 30px 40px;">
                  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="border: 1px solid ${borderColor}; border-radius: 5px;">
                    <tr>
                      <td style="padding: 15px; border-bottom: 1px solid ${borderColor}; background: #f8f9fa;">
                        <strong style="color: ${textColor};">Booking Details</strong>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding: 15px;">
                        <table width="100%" border="0" cellspacing="0" cellpadding="0">
                          <tr>
                            <td style="padding: 8px 0; color: #666; font-size: 14px;">Room Type:</td>
                            <td align="right" style="padding: 8px 0; color: ${textColor}; font-size: 14px; font-weight: bold;">${data.roomTypeName}</td>
                          </tr>
                          <tr>
                            <td style="padding: 8px 0; color: #666; font-size: 14px;">Check-in:</td>
                            <td align="right" style="padding: 8px 0; color: ${textColor}; font-size: 14px;">${checkInDate}</td>
                          </tr>
                          <tr>
                            <td style="padding: 8px 0; color: #666; font-size: 14px;">Check-out:</td>
                            <td align="right" style="padding: 8px 0; color: ${textColor}; font-size: 14px;">${checkOutDate}</td>
                          </tr>
                          <tr>
                            <td style="padding: 8px 0; color: #666; font-size: 14px;">Nights:</td>
                            <td align="right" style="padding: 8px 0; color: ${textColor}; font-size: 14px;">${data.numberOfNights}</td>
                          </tr>
                          <tr>
                            <td style="padding: 8px 0; color: #666; font-size: 14px;">Guests:</td>
                            <td align="right" style="padding: 8px 0; color: ${textColor}; font-size: 14px;">${data.numberOfGuests}</td>
                          </tr>
                          ${data.specialRequests ? `
                          <tr>
                            <td colspan="2" style="padding: 8px 0; color: #666; font-size: 14px; border-top: 1px solid ${borderColor};">
                              <strong>Special Requests:</strong><br/>
                              ${data.specialRequests}
                            </td>
                          </tr>
                          ` : ''}
                          <tr>
                            <td style="padding: 15px 0 0 0; color: ${textColor}; font-size: 16px; font-weight: bold; border-top: 2px solid ${borderColor};">Total Amount:</td>
                            <td align="right" style="padding: 15px 0 0 0; color: ${primaryColor}; font-size: 20px; font-weight: bold; border-top: 2px solid ${borderColor};">$${data.totalAmount.toFixed(2)}</td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <!-- View Booking Button -->
              <tr>
                <td align="center" style="padding: 0 40px 30px 40px;">
                  <table border="0" cellspacing="0" cellpadding="0">
                    <tr>
                      <td align="center" style="border-radius: 5px; background: ${primaryColor};">
                        <a href="${getBaseUrlForEmails()}/booking/confirmation/${data.confirmationNumber}"
                           target="_blank"
                           style="font-size: 16px; font-family: Helvetica, Arial, sans-serif; color: #ffffff; text-decoration: none; border-radius: 5px; padding: 12px 30px; border: 1px solid ${primaryColor}; display: inline-block; font-weight: bold;">
                          View Booking Details
                        </a>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <!-- Footer Info -->
              <tr>
                <td style="padding: 30px 40px; border-top: 1px solid ${borderColor}; background: #f8f9fa;">
                  <p style="margin: 0 0 10px 0; color: ${textColor}; font-size: 14px; line-height: 1.6;">
                    <strong>Check-in time:</strong> 3:00 PM<br/>
                    <strong>Check-out time:</strong> 11:00 AM
                  </p>
                  <p style="margin: 15px 0 0 0; color: #666; font-size: 13px; line-height: 1.6;">
                    If you have any questions or need to modify your reservation, please contact us at
                    <a href="mailto:reservations@grandhotel.com" style="color: ${primaryColor};">reservations@grandhotel.com</a>
                  </p>
                </td>
              </tr>

              <!-- Footer -->
              <tr>
                <td align="center" style="padding: 20px 40px; color: #999; font-size: 12px;">
                  <p style="margin: 0;">© ${new Date().getFullYear()} Grand Hotel. All rights reserved.</p>
                </td>
              </tr>

            </table>
          </td>
        </tr>
      </table>
    </body>
  `;
}

export async function sendBookingConfirmationEmail(data: BookingConfirmationData): Promise<void> {
  try {
    const info = await transport.sendMail({
      to: data.guestEmail,
      from: process.env.SMTP_FROM || 'noreply@grandhotel.com',
      subject: `Booking Confirmation - ${data.confirmationNumber} - Grand Hotel`,
      html: bookingConfirmationEmail(data),
    });

    if (process.env.SMTP_USER?.includes("ethereal.email")) {
      console.log(`📧 Booking Confirmation Email Sent!  Preview it at ${getTestMessageUrl(info as any)}`);
    } else {
      console.log(`📧 Booking Confirmation Email sent to ${data.guestEmail}`);
    }
  } catch (error) {
    console.error('Error sending booking confirmation email:', error);
    // Don't throw error - we don't want to fail the booking if email fails
  }
}

interface ReservationUpdateEmailData {
  confirmationNumber: string;
  guestName: string;
  guestEmail: string;
  checkInDate: string;
  checkOutDate: string;
  numberOfNights: number;
  roomTypeName: string;
  totalAmount: number;
  numberOfGuests: number;
  specialRequests?: string;
}

function reservationUpdateEmail(data: ReservationUpdateEmailData, subject: string, message: string): string {
  const textColor = "#444444";
  const borderColor = "#e0e0e0";

  const checkInDate = new Date(data.checkInDate).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  const checkOutDate = new Date(data.checkOutDate).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  return `
    <body style="font-family: Helvetica, Arial, sans-serif; color: ${textColor};">
      <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 600px; margin: 0 auto;">
        <tr>
          <td style="padding: 20px 0; border-bottom: 2px solid ${borderColor};">
            <h2 style="margin: 0;">${subject}</h2>
          </td>
        </tr>
        <tr>
          <td style="padding: 20px 0;">
            <p style="margin: 0 0 10px 0;">Hi ${data.guestName},</p>
            <p style="margin: 0 0 15px 0;">${message}</p>
            <p style="margin: 0 0 10px 0;"><strong>Confirmation:</strong> ${data.confirmationNumber}</p>
            <p style="margin: 0 0 10px 0;"><strong>Room Type:</strong> ${data.roomTypeName}</p>
            <p style="margin: 0 0 10px 0;"><strong>Check-in:</strong> ${checkInDate}</p>
            <p style="margin: 0 0 10px 0;"><strong>Check-out:</strong> ${checkOutDate}</p>
            <p style="margin: 0 0 10px 0;"><strong>Nights:</strong> ${data.numberOfNights}</p>
            <p style="margin: 0 0 10px 0;"><strong>Guests:</strong> ${data.numberOfGuests}</p>
            <p style="margin: 0 0 10px 0;"><strong>Total Amount:</strong> $${data.totalAmount.toFixed(2)}</p>
            ${data.specialRequests ? `<p style="margin: 0 0 10px 0;"><strong>Special Requests:</strong> ${data.specialRequests}</p>` : ''}
          </td>
        </tr>
      </table>
    </body>
  `;
}

export async function sendReservationCancellationEmail(data: ReservationUpdateEmailData): Promise<void> {
  try {
    await transport.sendMail({
      to: data.guestEmail,
      from: process.env.SMTP_FROM || 'noreply@grandhotel.com',
      subject: `Reservation Cancelled - ${data.confirmationNumber}`,
      html: reservationUpdateEmail(
        data,
        'Reservation Cancelled',
        'Your reservation has been cancelled. If this was unexpected, please contact us.'
      ),
    });
  } catch (error) {
    console.error('Error sending reservation cancellation email:', error);
  }
}

export async function sendReservationModificationEmail(data: ReservationUpdateEmailData): Promise<void> {
  try {
    await transport.sendMail({
      to: data.guestEmail,
      from: process.env.SMTP_FROM || 'noreply@grandhotel.com',
      subject: `Reservation Updated - ${data.confirmationNumber}`,
      html: reservationUpdateEmail(
        data,
        'Reservation Updated',
        'Your reservation details have been updated. Please review the new details below.'
      ),
    });
  } catch (error) {
    console.error('Error sending reservation update email:', error);
  }
}
