import { NextRequest, NextResponse } from 'next/server';
import { sendBookingConfirmationEmail } from '@/features/keystone/lib/mail';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      confirmationNumber,
      guestName,
      guestEmail,
      checkInDate,
      checkOutDate,
      numberOfNights,
      roomTypeName,
      totalAmount,
      numberOfGuests,
      specialRequests,
    } = body;

    // Validate required fields
    if (!confirmationNumber || !guestName || !guestEmail || !checkInDate || !checkOutDate) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Send the booking confirmation email
    await sendBookingConfirmationEmail({
      confirmationNumber,
      guestName,
      guestEmail,
      checkInDate,
      checkOutDate,
      numberOfNights,
      roomTypeName,
      totalAmount,
      numberOfGuests,
      specialRequests,
    });

    return NextResponse.json({
      success: true,
      message: 'Booking confirmation email sent successfully',
    });
  } catch (error: any) {
    console.error('Error sending booking confirmation email:', error);
    // Return success even if email fails - we don't want to fail the booking
    return NextResponse.json({
      success: true,
      message: 'Booking created but email sending failed',
      error: error.message,
    });
  }
}
