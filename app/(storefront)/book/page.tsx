'use client';

import * as React from 'react';
import { Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { ArrowLeft, CreditCard, Loader2 } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { Elements } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';

import { graphqlClient } from '@/lib/graphql-client';
import {
  COMPLETE_BOOKING_PAYMENT,
  CREATE_STOREFRONT_BOOKING,
  GET_BOOKING_PAYMENT_PROVIDERS,
  GET_ROOM_TYPE,
  INITIATE_BOOKING_PAYMENT_SESSION,
} from '@/lib/queries';
import { RoomType } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/components/ui/use-toast';
import { StripeCheckoutForm } from '@/components/booking/StripeCheckoutForm';

const stripePromise = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  ? loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)
  : null;

interface RoomTypeResponse {
  roomType: RoomType;
}

interface CreateBookingResponse {
  createStorefrontBooking: {
    id: string;
    confirmationNumber: string;
  };
}

interface PaymentProvider {
  id: string;
  name: string;
  code: string;
  metadata?: {
    provider?: string;
    displayName?: string;
    publishableKey?: string | null;
    clientId?: string | null;
    sandbox?: boolean;
  } | null;
}

interface BookingPaymentProvidersResponse {
  bookingPaymentProviders: PaymentProvider[];
}

interface BookingPaymentSessionResponse {
  initiateBookingPaymentSession: {
    id: string;
    amount: number;
    data?: {
      clientSecret?: string | null;
      paymentIntentId?: string | null;
      orderId?: string | null;
      approveLink?: string | null;
    } | null;
    paymentProvider?: PaymentProvider | null;
  };
}

interface CompleteBookingPaymentResponse {
  completeBookingPayment: {
    id: string;
    status: string;
    providerPaymentId?: string | null;
    paymentProvider?: PaymentProvider | null;
  };
}

function BookContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { toast } = useToast();

  const [roomType, setRoomType] = React.useState<RoomType | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [isCreatingPayment, setIsCreatingPayment] = React.useState(false);
  const [isConfirmingBooking, setIsConfirmingBooking] = React.useState(false);
  const [clientSecret, setClientSecret] = React.useState<string | null>(null);
  const [paymentError, setPaymentError] = React.useState<string | null>(null);
  const [bookingId, setBookingId] = React.useState<string | null>(null);
  const [paymentSessionId, setPaymentSessionId] = React.useState<string | null>(null);
  const [paymentProviders, setPaymentProviders] = React.useState<PaymentProvider[]>([]);
  const [selectedPaymentProviderCode, setSelectedPaymentProviderCode] = React.useState<string>('pp_stripe_stripe');
  const [paypalApproveLink, setPaypalApproveLink] = React.useState<string | null>(null);

  const roomTypeId = searchParams?.get('roomTypeId');
  const checkIn = searchParams?.get('checkIn');
  const checkOut = searchParams?.get('checkOut');
  const adults = searchParams?.get('adults');
  const children = searchParams?.get('children');
  const nights = searchParams?.get('nights');
  const total = searchParams?.get('total');

  const nightsCountRaw = parseInt(nights || '1', 10);
  const nightsCount = Number.isFinite(nightsCountRaw) ? nightsCountRaw : 1;
  const roomRateRaw = parseFloat(searchParams?.get('rate') || '0');
  const roomRate = Number.isFinite(roomRateRaw) ? roomRateRaw : 0;
  const totalAmountRaw = parseFloat(total || '0');
  const totalAmount = Number.isFinite(totalAmountRaw) ? totalAmountRaw : 0;
  const adultsCountRaw = parseInt(adults || '1', 10);
  const childrenCountRaw = parseInt(children || '0', 10);
  const adultsCount = Number.isFinite(adultsCountRaw) ? adultsCountRaw : 1;
  const childrenCount = Number.isFinite(childrenCountRaw) ? childrenCountRaw : 0;
  const totalGuests = adultsCount + childrenCount;
  const taxAmount = totalAmount - (roomRate * nightsCount);

  const [formData, setFormData] = React.useState({
    guestName: '',
    guestEmail: '',
    guestPhone: '',
    specialRequests: '',
  });

  const [existingGuest, setExistingGuest] = React.useState<any>(null);

  // Attempt to load from localStorage/session for return guests
  React.useEffect(() => {
    const saved = localStorage.getItem('openfront_guest_context');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setFormData(prev => ({
          ...prev,
          guestName: parsed.name || '',
          guestEmail: parsed.email || '',
          guestPhone: parsed.phone || '',
        }));
        setExistingGuest(parsed);
      } catch (e) {}
    }
  }, []);

  React.useEffect(() => {
    const fetchRoomType = async () => {
      if (!roomTypeId) {
        setLoading(false);
        return;
      }

      try {
        const data = await graphqlClient.request<RoomTypeResponse>(GET_ROOM_TYPE, {
          id: roomTypeId,
        });
        setRoomType(data.roomType);
      } catch (err) {
        console.error('Error fetching room type:', err);
        toast({
          title: 'Error',
          description: 'Failed to load room details.',
          variant: 'destructive',
        });
      } finally {
        setLoading(false);
      }
    };

    fetchRoomType();
  }, [roomTypeId, toast]);

  React.useEffect(() => {
    const fetchPaymentProviders = async () => {
      try {
        const data = await graphqlClient.request<BookingPaymentProvidersResponse>(
          GET_BOOKING_PAYMENT_PROVIDERS
        );
        const providers = data.bookingPaymentProviders || [];
        setPaymentProviders(providers);

        if (providers.some((provider) => provider.code === 'pp_stripe_stripe')) {
          setSelectedPaymentProviderCode('pp_stripe_stripe');
        } else if (providers[0]?.code) {
          setSelectedPaymentProviderCode(providers[0].code);
        }
      } catch (error) {
        console.error('Failed to load payment providers:', error);
      }
    };

    fetchPaymentProviders();
  }, []);

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handlePaymentSuccess = async (providerPaymentId: string, paymentSessionIdOverride?: string) => {
    if (isConfirmingBooking) return;

    setPaymentError(null);
    setIsConfirmingBooking(true);

    try {
      if (!checkIn || !checkOut || !roomTypeId) {
        throw new Error('Missing booking information. Please start over.');
      }

      const bookingData = {
        guestName: formData.guestName,
        guestEmail: formData.guestEmail,
        guestPhone: formData.guestPhone,
        checkInDate: new Date(checkIn).toISOString(),
        checkOutDate: new Date(checkOut).toISOString(),
        numberOfGuests: totalGuests,
        numberOfAdults: adultsCount,
        numberOfChildren: childrenCount,
        roomRate: roomRate * nightsCount,
        taxAmount: taxAmount,
        feesAmount: 0,
        totalAmount: totalAmount,
        depositAmount: 0,
        balanceDue: 0,
        status: 'confirmed',
        paymentStatus: 'paid',
        source: 'website',
        specialRequests: formData.specialRequests || '',
        roomAssignments: {
          create: [
            {
              roomType: { connect: { id: roomTypeId } },
              guestName: formData.guestName,
              ratePerNight: roomRate,
              specialRequests: formData.specialRequests || '',
            },
          ],
        },
      };

      let resolvedBookingId = bookingId;
      let confirmationNumber = '';

      if (!resolvedBookingId) {
        const response = await graphqlClient.request<CreateBookingResponse>(
          CREATE_STOREFRONT_BOOKING,
          { data: bookingData }
        );
        resolvedBookingId = response.createStorefrontBooking.id;
        confirmationNumber = response.createStorefrontBooking.confirmationNumber;
        setBookingId(resolvedBookingId);
      }

      const resolvedPaymentSessionId = paymentSessionIdOverride || paymentSessionId;

      if (!resolvedBookingId || !resolvedPaymentSessionId) {
        throw new Error('Missing booking payment session. Please restart payment.');
      }

      await graphqlClient.request<CompleteBookingPaymentResponse>(COMPLETE_BOOKING_PAYMENT, {
        bookingId: resolvedBookingId,
        paymentSessionId: resolvedPaymentSessionId,
        providerPaymentId,
      });

      // Save guest context for future sessions
      localStorage.setItem('openfront_guest_context', JSON.stringify({
        id: existingGuest?.id,
        name: formData.guestName,
        email: formData.guestEmail,
        phone: formData.guestPhone,
        lastBookingId: resolvedBookingId,
      }));

      toast({
        title: 'Booking Confirmed!',
        description: `Your confirmation number is ${confirmationNumber || 'ready in reservation details'}`,
      });

      router.push(`/booking/${resolvedBookingId}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to confirm booking.';
      setPaymentError(message);
      toast({
        title: 'Booking Failed',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setIsConfirmingBooking(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.guestName || !formData.guestEmail || !formData.guestPhone) {
      toast({
        title: 'Missing Information',
        description: 'Please fill in all required fields.',
        variant: 'destructive',
      });
      return;
    }

    if (!checkIn || !checkOut || !roomTypeId) {
      toast({
        title: 'Invalid Booking',
        description: 'Missing booking information. Please start over.',
        variant: 'destructive',
      });
      return;
    }

    if (!selectedPaymentProviderCode) {
      toast({
        title: 'Payment provider unavailable',
        description: 'No payment provider is currently available.',
        variant: 'destructive',
      });
      return;
    }

    if (totalAmount <= 0) {
      toast({
        title: 'Invalid amount',
        description: 'Total amount must be greater than zero.',
        variant: 'destructive',
      });
      return;
    }

    setIsCreatingPayment(true);
    setPaymentError(null);
    setPaypalApproveLink(null);

    try {
      const bookingData = {
        guestName: formData.guestName,
        guestEmail: formData.guestEmail,
        guestPhone: formData.guestPhone,
        checkInDate: new Date(checkIn).toISOString(),
        checkOutDate: new Date(checkOut).toISOString(),
        numberOfGuests: totalGuests,
        numberOfAdults: adultsCount,
        numberOfChildren: childrenCount,
        roomRate: roomRate * nightsCount,
        taxAmount: taxAmount,
        feesAmount: 0,
        totalAmount: totalAmount,
        depositAmount: 0,
        balanceDue: totalAmount,
        status: 'pending',
        paymentStatus: 'unpaid',
        source: 'website',
        specialRequests: formData.specialRequests || '',
        roomAssignments: {
          create: [
            {
              roomType: { connect: { id: roomTypeId } },
              guestName: formData.guestName,
              ratePerNight: roomRate,
              specialRequests: formData.specialRequests || '',
            },
          ],
        },
      };

      let resolvedBookingId = bookingId;
      if (!resolvedBookingId) {
        const response = await graphqlClient.request<CreateBookingResponse>(
          CREATE_STOREFRONT_BOOKING,
          { data: bookingData }
        );
        resolvedBookingId = response.createStorefrontBooking.id;
        setBookingId(resolvedBookingId);
      }

      const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
      const baseCancelUrl = `${origin}/book?roomTypeId=${roomTypeId}&checkIn=${checkIn}&checkOut=${checkOut}&adults=${adultsCount}&children=${childrenCount}&nights=${nightsCount}&total=${totalAmount}`;
      const sessionResponse = await graphqlClient.request<BookingPaymentSessionResponse>(
        INITIATE_BOOKING_PAYMENT_SESSION,
        {
          bookingId: resolvedBookingId,
          paymentProviderCode: selectedPaymentProviderCode,
          amount: totalAmount,
          currency: 'USD',
          returnUrl: `${origin}/paypal/return?bookingId=${resolvedBookingId}`,
          cancelUrl: baseCancelUrl,
        }
      );

      const session = sessionResponse.initiateBookingPaymentSession;
      setPaymentSessionId(session.id);

      if (selectedPaymentProviderCode === 'pp_paypal_paypal') {
        const approveLink = session.data?.approveLink;
        if (!approveLink) {
          throw new Error('PayPal approval link was not returned.');
        }
        const url = new URL(approveLink);
        url.searchParams.set('bookingId', resolvedBookingId);
        url.searchParams.set('paymentSessionId', session.id);
        setPaypalApproveLink(url.toString());
      } else if (selectedPaymentProviderCode === 'pp_manual_manual') {
        await handlePaymentSuccess('manual', session.id);
      } else {
        const nextClientSecret = session.data?.clientSecret;
        if (!nextClientSecret) {
          throw new Error('Stripe client secret was not returned.');
        }
        setClientSecret(nextClientSecret);
      }
    } catch (err) {
      console.error('Error creating payment intent:', err);
      toast({
        title: 'Payment Failed',
        description: err instanceof Error ? err.message : 'Unable to start payment. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsCreatingPayment(false);
    }
  };

  if (loading) {
    return (
      <div className="hotel-page flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[color:oklch(0.34_0.08_45)]" />
      </div>
    );
  }

  if (!roomType || !checkIn || !checkOut) {
    return (
      <div className="hotel-page min-h-screen">
        <div className="container mx-auto px-4 py-16">
          <div className="hotel-surface mx-auto max-w-md rounded-[2rem] p-8 text-center">
            <h2 className="hotel-title mb-4 text-2xl font-semibold">Incomplete details</h2>
            <p className="mb-8 text-[color:oklch(0.44_0.03_58)]">
              We couldn't find the room or dates for this reservation. Please start your search again.
            </p>
            <Button asChild className="rounded-full bg-[color:oklch(0.34_0.08_45)] text-white hover:bg-[color:oklch(0.3_0.08_42)]">
              <Link href="/rooms">Browse available rooms</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="hotel-page min-h-screen">
      <div className="container mx-auto max-w-5xl px-4 py-10">
        <Button variant="ghost" asChild className="mb-6 rounded-full text-[color:oklch(0.36_0.03_58)] hover:bg-white/60">
          <Link href={`/rooms/${roomTypeId}`}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to room details
          </Link>
        </Button>

        <div className="hotel-kicker mb-3">Direct booking portal</div>
        <h1 className="hotel-title mb-10 text-4xl font-semibold text-[color:oklch(0.22_0.02_58)]">Confirm your stay</h1>

        <div className="grid gap-8 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <Card className="hotel-surface rounded-[2rem] border-0 bg-transparent shadow-none">
              <CardHeader className="px-0 pb-6 pt-0">
                <CardTitle className="text-2xl font-semibold tracking-[-0.03em] text-[color:oklch(0.24_0.02_58)]">
                  {existingGuest ? `Welcome back, ${existingGuest.name.split(' ')[0]}` : 'Guest information'}
                </CardTitle>
                <CardDescription className="text-[color:oklch(0.42_0.03_58)]">
                  {existingGuest 
                    ? "We've pre-filled your details from your last stay. Please confirm they are still correct."
                    : "Please provide your contact details for confirmation."}
                </CardDescription>
              </CardHeader>
              <CardContent className="hotel-surface rounded-[2rem] p-8">
                <form onSubmit={handleSubmit} className="space-y-6">
                  <div className="space-y-2">
                    <Label htmlFor="guestName">Full Name</Label>
                    <Input
                      id="guestName"
                      name="guestName"
                      value={formData.guestName}
                      onChange={handleInputChange}
                      placeholder="John Doe"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="guestEmail">Email Address</Label>
                    <Input
                      id="guestEmail"
                      name="guestEmail"
                      type="email"
                      value={formData.guestEmail}
                      onChange={handleInputChange}
                      placeholder="john@example.com"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="guestPhone">Phone Number</Label>
                    <Input
                      id="guestPhone"
                      name="guestPhone"
                      type="tel"
                      value={formData.guestPhone}
                      onChange={handleInputChange}
                      placeholder="+1 (555) 123-4567"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="specialRequests">Special Requests (Optional)</Label>
                    <Textarea
                      id="specialRequests"
                      name="specialRequests"
                      value={formData.specialRequests}
                      onChange={handleInputChange}
                      placeholder="Early check-in, high floor, extra pillows, etc."
                      rows={4}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="payment-provider">Payment Method</Label>
                    <select
                      id="payment-provider"
                      value={selectedPaymentProviderCode}
                      onChange={(event) => {
                        setSelectedPaymentProviderCode(event.target.value);
                        setClientSecret(null);
                        setPaypalApproveLink(null);
                        setPaymentError(null);
                      }}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      {paymentProviders.map((provider) => (
                        <option key={provider.id} value={provider.code}>
                          {provider.metadata?.displayName || provider.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <Button
                    type="submit"
                    size="lg"
                    className="h-12 w-full rounded-full bg-[color:oklch(0.34_0.08_45)] text-white hover:bg-[color:oklch(0.3_0.08_42)]"
                    disabled={isCreatingPayment || !!clientSecret || !!paypalApproveLink}
                  >
                    {isCreatingPayment ? (
                      <>
                        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                        Initializing secure payment...
                      </>
                    ) : (
                      <>
                        <CreditCard className="mr-2 h-5 w-5" />
                        {clientSecret ? 'Payment ready' : 'Continue to secure payment'}
                      </>
                    )}
                  </Button>

                  {paypalApproveLink && (
                    <div className="space-y-6 border-t border-[color:oklch(0.88_0.01_82)] pt-8">
                      <div>
                        <h3 className="text-xl font-semibold tracking-[-0.02em] text-[color:oklch(0.24_0.02_58)]">Continue with PayPal</h3>
                        <p className="text-sm text-[color:oklch(0.42_0.03_58)]">
                          Use PayPal to approve the charge, then return here to complete the reservation.
                        </p>
                      </div>
                      <Button asChild className="w-full rounded-full bg-[color:oklch(0.34_0.08_45)] text-white hover:bg-[color:oklch(0.3_0.08_42)]">
                        <a href={paypalApproveLink} target="_blank" rel="noopener noreferrer">
                          Continue to PayPal
                        </a>
                      </Button>
                    </div>
                  )}

                  {clientSecret && stripePromise && (
                    <div className="space-y-6 border-t border-[color:oklch(0.88_0.01_82)] pt-8">
                      <div>
                        <h3 className="text-xl font-semibold tracking-[-0.02em] text-[color:oklch(0.24_0.02_58)]">Finalize payment</h3>
                        <p className="text-sm text-[color:oklch(0.42_0.03_58)]">
                          Your reservation is held while you complete this secure payment.
                        </p>
                      </div>
                      <div className="hotel-surface-muted rounded-[1.5rem] p-6">
                        <Elements stripe={stripePromise} options={{ clientSecret }}>
                          <StripeCheckoutForm
                            amount={totalAmount}
                            onSuccess={(stripePaymentId) => {
                              handlePaymentSuccess(stripePaymentId);
                            }}
                            onError={(error) => {
                              setPaymentError(error);
                              toast({
                                title: 'Payment Failed',
                                description: error,
                                variant: 'destructive',
                              });
                            }}
                          />
                        </Elements>
                      </div>
                      {paymentError && (
                        <div className="rounded-[1.25rem] border border-[color:oklch(0.83_0.05_45)] bg-[color:oklch(0.97_0.02_70)] px-4 py-3 text-sm text-[color:oklch(0.38_0.05_45)]">
                          {paymentError}
                        </div>
                      )}
                    </div>
                  )}
                </form>
              </CardContent>
            </Card>
          </div>

          <div className="lg:col-span-1">
            <Card className="hotel-surface sticky top-24 rounded-[2rem] border-0 bg-transparent shadow-none">
              <CardHeader className="px-0 pb-6 pt-0">
                <CardTitle className="text-2xl font-semibold tracking-[-0.03em] text-[color:oklch(0.24_0.02_58)]">Stay summary</CardTitle>
              </CardHeader>
              <CardContent className="hotel-surface space-y-6 rounded-[2rem] p-8">
                <div>
                  <div className="hotel-kicker mb-1">Accommodation</div>
                  <h3 className="text-lg font-semibold text-[color:oklch(0.24_0.02_58)]">{roomType.name}</h3>
                  <div className="mt-4 space-y-2 text-sm text-[color:oklch(0.38_0.03_58)]">
                    <div className="flex justify-between">
                      <span className="font-medium">Check-in</span>
                      <span>{format(parseISO(checkIn), 'MMM dd, yyyy')}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-medium">Check-out</span>
                      <span>{format(parseISO(checkOut), 'MMM dd, yyyy')}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-medium">Duration</span>
                      <span>{nights} night{nightsCount !== 1 ? 's' : ''}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-medium">Guests</span>
                      <span>
                        {totalGuests}
                        {' '}
                        ({adultsCount} adult{adultsCount !== 1 ? 's' : ''}
                        {childrenCount > 0 && `, ${childrenCount} child${childrenCount !== 1 ? 'ren' : ''}`})
                      </span>
                    </div>
                  </div>
                </div>

                <Separator className="bg-[color:oklch(0.88_0.01_82)]" />

                <div className="space-y-3 text-sm">
                  <div className="flex justify-between text-[color:oklch(0.42_0.03_58)]">
                    <span>Room rate</span>
                    <span>${roomRate.toFixed(2)} × {nights}</span>
                  </div>
                  <div className="flex justify-between text-[color:oklch(0.42_0.03_58)]">
                    <span>Subtotal</span>
                    <span>${(roomRate * nightsCount).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-[color:oklch(0.42_0.03_58)]">
                    <span>Taxes & fees</span>
                    <span>${taxAmount.toFixed(2)}</span>
                  </div>
                  <Separator className="bg-[color:oklch(0.88_0.01_82)]" />
                  <div className="flex justify-between text-xl font-bold text-[color:oklch(0.22_0.02_58)]">
                    <span>Total cost</span>
                    <span>${totalAmount.toFixed(2)}</span>
                  </div>
                </div>

                <div className="rounded-[1.25rem] bg-[color:color-mix(in_oklab,white_78%,oklch(0.95_0.02_82))] p-4 text-xs leading-5 text-[color:oklch(0.46_0.03_58)]">
                  Prices are inclusive of all local taxes and service charges. You will receive a full confirmation email immediately after payment.
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function BookPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    }>
      <BookContent />
    </Suspense>
  );
}
