'use client';

import * as React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useParams } from 'next/navigation';
import { CheckCircle2, Calendar as CalendarIcon, Users, Mail, Phone, FileText, Printer, Download, QrCode, MapPin, Edit, X as XIcon } from 'lucide-react';
import { format, parseISO } from 'date-fns';

import { graphqlClient } from '@/lib/graphql-client';
import { CANCEL_BOOKING } from '@/lib/queries';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

interface Booking {
  id: string;
  confirmationNumber: string;
  guestName: string;
  guestEmail: string;
  guestPhone: string;
  checkInDate: string;
  checkOutDate: string;
  numberOfGuests: number;
  numberOfAdults: number;
  numberOfChildren?: number;
  numberOfNights: number;
  roomRate?: number;
  taxAmount?: number;
  feesAmount?: number;
  totalAmount: number;
  status: string;
  paymentStatus?: string;
  specialRequests?: string;
  roomAssignments?: Array<{
    id: string;
    roomType?: { name: string };
    room?: { roomNumber: string };
    ratePerNight?: number;
  }>;
}

interface BookingResponse {
  booking: Booking;
}

const GET_BOOKING = `
  query GetBooking($id: ID!) {
    booking(where: { id: $id }) {
      id
      confirmationNumber
      guestName
      guestEmail
      guestPhone
      checkInDate
      checkOutDate
      numberOfGuests
      numberOfAdults
      numberOfChildren
      numberOfNights
      roomRate
      taxAmount
      feesAmount
      totalAmount
      status
      paymentStatus
      specialRequests
      roomAssignments {
        id
        roomType {
          name
        }
        room {
          roomNumber
        }
        ratePerNight
      }
    }
  }
`;

// Generate .ics calendar file
const generateCalendarFile = (booking: Booking) => {
  const startDate = format(parseISO(booking.checkInDate), "yyyyMMdd'T'150000");
  const endDate = format(parseISO(booking.checkOutDate), "yyyyMMdd'T'110000");

  const icsContent = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Grand Hotel//Booking Confirmation//EN
BEGIN:VEVENT
UID:booking-${booking.id}@grandhotel.com
DTSTAMP:${format(new Date(), "yyyyMMdd'T'HHmmss")}
DTSTART:${startDate}
DTEND:${endDate}
SUMMARY:Grand Hotel Stay - ${booking.confirmationNumber}
DESCRIPTION:Hotel booking confirmation for ${booking.guestName}.\\nConfirmation: ${booking.confirmationNumber}\\nGuests: ${booking.numberOfGuests}
LOCATION:Grand Hotel, Downtown
STATUS:CONFIRMED
END:VEVENT
END:VCALENDAR`;

  const blob = new Blob([icsContent], { type: 'text/calendar' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `booking-${booking.confirmationNumber}.ics`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

// Generate QR code URL (using a public QR code API)
const getQRCodeUrl = (booking: Booking) => {
  const qrData = encodeURIComponent(JSON.stringify({
    confirmation: booking.confirmationNumber,
    name: booking.guestName,
    checkIn: booking.checkInDate,
    checkOut: booking.checkOutDate,
  }));
  return `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${qrData}`;
};

export default function BookingConfirmationPage() {
  const params = useParams();
  const [booking, setBooking] = React.useState<Booking | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [showQRCode, setShowQRCode] = React.useState(false);
  const [showCancelDialog, setShowCancelDialog] = React.useState(false);
  const [isCancelling, setIsCancelling] = React.useState(false);
  const [cancelError, setCancelError] = React.useState<string | null>(null);

  const bookingId = params?.id as string;

  React.useEffect(() => {
    const fetchBooking = async () => {
      try {
        setLoading(true);
        const data = await graphqlClient.request<BookingResponse>(
          GET_BOOKING,
          { id: bookingId }
        );

        if (data.booking) {
          setBooking(data.booking);
          setError(null);
        } else {
          setError('Booking not found');
        }
      } catch (err) {
        console.error('Error fetching booking:', err);
        setError('Failed to load booking details. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    if (bookingId) {
      fetchBooking();
    }
  }, [bookingId]);

  const handlePrint = () => {
    window.print();
  };

  const handleCancelBooking = async () => {
    if (!booking || isCancelling) return;

    setIsCancelling(true);
    setCancelError(null);

    try {
      const refundAmount = booking.paymentStatus === 'paid' ? booking.totalAmount : undefined;
      const response = await graphqlClient.request<{ cancelBooking: Booking }>(
        CANCEL_BOOKING,
        {
          bookingId: booking.id,
          refundAmount,
          refundReason: 'Guest requested cancellation',
        }
      );

      setBooking({
        ...booking,
        status: response.cancelBooking.status,
        paymentStatus: response.cancelBooking.paymentStatus,
      });
      setShowCancelDialog(false);
    } catch (err) {
      setCancelError(err instanceof Error ? err.message : 'Unable to cancel booking.');
    } finally {
      setIsCancelling(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
        <div className="container mx-auto px-4 py-8 max-w-3xl">
          <Skeleton className="h-12 w-3/4 mb-6" />
          <Skeleton className="h-64 w-full mb-4" />
          <Skeleton className="h-48 w-full" />
        </div>
      </div>
    );
  }

  if (error || !booking) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
        <div className="container mx-auto px-4 py-8 max-w-3xl">
          <div className="text-center py-12">
            <p className="text-red-600 dark:text-red-400 text-lg mb-4">
              {error || 'Booking not found'}
            </p>
            <Button asChild>
              <Link href="/">Return to Home</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const STATUS_COLORS = {
    pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
    confirmed: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    checked_in: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
    checked_out: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200',
    cancelled: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  };

  const canCancel = booking.status === 'confirmed' || booking.status === 'pending';

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <div className="container mx-auto px-4 py-8 max-w-3xl">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 dark:bg-green-900 mb-4">
            <CheckCircle2 className="h-10 w-10 text-green-600 dark:text-green-300" />
          </div>
          <h1 className="text-4xl font-bold mb-2">Booking Confirmed!</h1>
          <p className="text-xl text-muted-foreground">
            We've sent a confirmation email to {booking.guestEmail}
          </p>
        </div>

        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-2xl">Reservation Details</CardTitle>
                <CardDescription className="mt-2">
                  Confirmation Number:{' '}
                  <span className="font-mono font-bold text-foreground text-lg">
                    {booking.confirmationNumber}
                  </span>
                </CardDescription>
              </div>
              <Badge className={STATUS_COLORS[booking.status as keyof typeof STATUS_COLORS] || 'bg-gray-100'}>
                {booking.status?.replace('_', ' ').toUpperCase()}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <Users className="h-5 w-5" />
                Guest Information
              </h3>
              <div className="grid sm:grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-muted-foreground">Name</div>
                  <div className="font-medium">{booking.guestName}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Email</div>
                  <div className="font-medium flex items-center gap-1">
                    <Mail className="h-4 w-4" />
                    {booking.guestEmail}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground">Phone</div>
                  <div className="font-medium flex items-center gap-1">
                    <Phone className="h-4 w-4" />
                    {booking.guestPhone}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground">Guests</div>
                  <div className="font-medium">
                    {booking.numberOfGuests}{' '}
                    ({booking.numberOfAdults} adult{booking.numberOfAdults !== 1 ? 's' : ''}
                    {booking.numberOfChildren && booking.numberOfChildren > 0
                      ? `, ${booking.numberOfChildren} child${booking.numberOfChildren !== 1 ? 'ren' : ''}`
                      : ''})
                  </div>
                </div>
              </div>
            </div>

            <Separator />

            <div>
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <CalendarIcon className="h-5 w-5" />
                Stay Information
              </h3>
              <div className="grid sm:grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-muted-foreground">Check-in</div>
                  <div className="font-medium">
                    {format(parseISO(booking.checkInDate), 'EEEE, MMMM dd, yyyy')}
                  </div>
                  <div className="text-xs text-muted-foreground">After 3:00 PM</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Check-out</div>
                  <div className="font-medium">
                    {format(parseISO(booking.checkOutDate), 'EEEE, MMMM dd, yyyy')}
                  </div>
                  <div className="text-xs text-muted-foreground">Before 11:00 AM</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Total Nights</div>
                  <div className="font-medium">{booking.numberOfNights}</div>
                </div>
              </div>
            </div>

            <Separator />

            {booking.roomAssignments && booking.roomAssignments.length > 0 && (
              <>
                <div>
                  <h3 className="font-semibold mb-3">Room Details</h3>
                  <div className="space-y-3">
                    {booking.roomAssignments.map((assignment) => (
                      <div
                        key={assignment.id}
                        className="bg-slate-50 dark:bg-slate-900 p-4 rounded-lg"
                      >
                        <div className="font-medium text-lg mb-2">
                          {assignment.roomType?.name}
                        </div>
                        {assignment.room && (
                          <div className="text-sm text-muted-foreground">
                            Room Number: {assignment.room.roomNumber}
                          </div>
                        )}
                        {assignment.ratePerNight && (
                          <div className="text-sm text-muted-foreground">
                            Rate: ${assignment.ratePerNight}/night
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
                <Separator />
              </>
            )}

            {booking.specialRequests && (
              <>
                <div>
                  <h3 className="font-semibold mb-3 flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    Special Requests
                  </h3>
                  <p className="text-sm bg-slate-50 dark:bg-slate-900 p-4 rounded-lg">
                    {booking.specialRequests}
                  </p>
                </div>
                <Separator />
              </>
            )}

            <div>
              <h3 className="font-semibold mb-3">Payment Summary</h3>
              <div className="space-y-2 text-sm">
                {booking.roomRate && (
                  <div className="flex justify-between">
                    <span>Room charges</span>
                    <span>${booking.roomRate.toFixed(2)}</span>
                  </div>
                )}
                {booking.taxAmount && booking.taxAmount > 0 && (
                  <div className="flex justify-between">
                    <span>Taxes</span>
                    <span>${booking.taxAmount.toFixed(2)}</span>
                  </div>
                )}
                {booking.feesAmount && booking.feesAmount > 0 && (
                  <div className="flex justify-between">
                    <span>Fees</span>
                    <span>${booking.feesAmount.toFixed(2)}</span>
                  </div>
                )}
                <Separator />
                <div className="flex justify-between font-bold text-lg">
                  <span>Total Amount</span>
                  <span>${booking.totalAmount?.toFixed(2)}</span>
                </div>
                <div className="bg-blue-50 dark:bg-blue-950 p-3 rounded-lg mt-4">
                  <p className="text-sm text-blue-900 dark:text-blue-100">
                    Payment will be collected at the hotel upon check-in.
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-4 print:hidden">
          <Button onClick={handlePrint} variant="outline">
            <Printer className="mr-2 h-4 w-4" />
            Print
          </Button>
          <Button onClick={() => generateCalendarFile(booking)} variant="outline">
            <Download className="mr-2 h-4 w-4" />
            Add to Calendar
          </Button>
          <Dialog open={showQRCode} onOpenChange={setShowQRCode}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <QrCode className="mr-2 h-4 w-4" />
                QR Code
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Mobile Check-in QR Code</DialogTitle>
                <DialogDescription>
                  Scan this QR code at the hotel for quick mobile check-in
                </DialogDescription>
              </DialogHeader>
              <div className="flex flex-col items-center py-6">
                <div className="relative w-[200px] h-[200px] mb-4">
                  <Image
                    src={getQRCodeUrl(booking)}
                    alt="Check-in QR Code"
                    fill
                    className="object-contain"
                  />
                </div>
                <p className="text-sm text-center text-muted-foreground">
                  Confirmation: {booking.confirmationNumber}
                </p>
              </div>
            </DialogContent>
          </Dialog>
          <Button asChild>
            <Link href="/">Home</Link>
          </Button>
        </div>

        {/* Modify/Cancel Booking Buttons */}
        {canCancel && (
          <div className="mt-8 flex gap-4 print:hidden">
            <Button variant="outline" className="h-12 flex-1 rounded-full border-[color:oklch(0.82_0.02_75)] text-[color:oklch(0.38_0.03_58)] hover:bg-white/60" disabled>
              <Edit className="mr-2 h-4 w-4" />
              Modify dates
            </Button>
            <Dialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
              <DialogTrigger asChild>
                <Button variant="outline" className="h-12 flex-1 rounded-full border-[color:oklch(0.83_0.05_45)] text-[color:oklch(0.38_0.05_45)] hover:bg-[color:oklch(0.97_0.02_70)]">
                  <XIcon className="mr-2 h-4 w-4" />
                  Cancel stay
                </Button>
              </DialogTrigger>
              <DialogContent className="rounded-[2rem]">
                <DialogHeader>
                  <DialogTitle className="text-2xl font-semibold tracking-[-0.02em]">Cancel your reservation?</DialogTitle>
                  <DialogDescription className="text-[color:oklch(0.42_0.03_58)]">
                    This will immediately release your room back to inventory.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-6 pt-4">
                  {booking.paymentStatus === 'paid' && (
                    <div className="rounded-[1.25rem] bg-[color:oklch(0.96_0.03_45)] p-4 text-sm text-[color:oklch(0.34_0.08_45)]">
                      A full refund of <span className="font-bold">${booking.totalAmount.toFixed(2)}</span> will be processed to your original payment method within 5-7 business days.
                    </div>
                  )}
                  {cancelError && (
                    <p className="text-sm font-medium text-[color:oklch(0.38_0.05_45)]">{cancelError}</p>
                  )}
                  <div className="flex justify-end gap-3">
                    <Button
                      variant="outline"
                      className="rounded-full border-[color:oklch(0.82_0.02_75)] px-6"
                      onClick={() => setShowCancelDialog(false)}
                      disabled={isCancelling}
                    >
                      Keep my booking
                    </Button>
                    <Button
                      className="rounded-full bg-[color:oklch(0.34_0.08_45)] px-6 text-white hover:bg-[color:oklch(0.3_0.08_42)]"
                      onClick={handleCancelBooking}
                      disabled={isCancelling}
                    >
                      {isCancelling ? 'Cancelling...' : 'Confirm cancellation'}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        )}

        {/* Hotel Contact & Location Info */}
        <div className="mt-10 grid gap-6 print:hidden md:grid-cols-2">
          <Card className="hotel-surface rounded-[2rem] border-0 p-2 shadow-none">
            <CardHeader className="p-6 pb-2">
              <CardTitle className="flex items-center gap-2 text-lg font-semibold text-[color:oklch(0.24_0.02_58)]">
                <Phone className="h-5 w-5 text-[color:oklch(0.34_0.08_45)]" />
                Hotel contact
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5 p-6 text-sm">
              <div>
                <div className="font-bold text-[color:oklch(0.31_0.03_58)]">The Openfront Collection</div>
                <div className="text-[color:oklch(0.46_0.03_58)]">123 Coastal Drive</div>
                <div className="text-[color:oklch(0.46_0.03_58)]">Laguna Beach, CA 92651</div>
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-[color:oklch(0.34_0.08_45)]">
                  <Phone className="h-3.5 w-3.5" />
                  (555) 123-4567
                </div>
                <div className="flex items-center gap-2 text-[color:oklch(0.34_0.08_45)]">
                  <Mail className="h-3.5 w-3.5" />
                  concierge@openfront-hotel.com
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="hotel-surface rounded-[2rem] border-0 p-2 shadow-none">
            <CardHeader className="p-6 pb-2">
              <CardTitle className="flex items-center gap-2 text-lg font-semibold text-[color:oklch(0.24_0.02_58)]">
                <MapPin className="h-5 w-5 text-[color:oklch(0.34_0.08_45)]" />
                Arrival & parking
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 p-6 text-sm">
              <p className="text-[color:oklch(0.46_0.03_58)]">
                Located on the oceanfront, 15 minutes from the airport. Valet and self-parking are available for all guests.
              </p>
              <div className="space-y-1 text-[color:oklch(0.31_0.03_58)]">
                <div className="flex justify-between">
                  <span>Valet parking</span>
                  <span className="font-semibold">$45/night</span>
                </div>
                <div className="flex justify-between">
                  <span>Self-parking</span>
                  <span className="font-semibold">$30/night</span>
                </div>
              </div>
              <Button variant="link" className="h-auto p-0 text-[color:oklch(0.34_0.08_45)]" asChild>
                <Link href="/location">
                  <MapPin className="mr-1.5 h-3.5 w-3.5" />
                  Get directions
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>

        <Card className="hotel-surface mt-8 rounded-[2rem] border-0 p-2 shadow-none print:hidden">
          <CardHeader className="p-6 pb-2">
            <CardTitle className="text-lg font-semibold text-[color:oklch(0.24_0.02_58)]">Policies & procedures</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6 p-6 text-sm text-[color:oklch(0.46_0.03_58)]">
            <div>
              <div className="mb-1 font-bold text-[color:oklch(0.31_0.03_58)]">Schedule</div>
              <p>Check-in is available after 3:00 PM. Check-out is strictly by 11:00 AM to allow for sanitization. Late requests are subject to availability.</p>
            </div>
            <div>
              <div className="mb-1 font-bold text-[color:oklch(0.31_0.03_58)]">Requirements</div>
              <p>A valid government photo ID and the credit card used for booking must be presented at check-in. A $100/night incidental hold will be placed on your card.</p>
            </div>
            <div className="rounded-[1.25rem] bg-[color:oklch(0.95_0.02_220)] p-4">
              <p className="text-[color:oklch(0.32_0.08_230)]">
                <strong>Pro-tip:</strong> Use the "QR check-in" button above to skip the front desk queue if you have no luggage to check.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
