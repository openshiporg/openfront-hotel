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
import { safeQuoteFailureMessage } from '@/features/storefront/lib/qa-workflows';
import {
  COMPLETE_BOOKING_PAYMENT,
  CREATE_STOREFRONT_BOOKING,
  GET_BOOKING_PAYMENT_PROVIDERS,
  GET_ROOM_TYPE,
  GET_STOREFRONT_QUOTE,
  INITIATE_BOOKING_PAYMENT_SESSION,
} from '@/lib/queries';
import { RoomType } from '@/lib/types';
import { primaryRoomImage } from '@/lib/hotel-storefront';
import { useHotelSettings } from '@/features/storefront/components/HotelSettingsProvider';
import { useToast } from '@/components/ui/use-toast';
import { StripeCheckoutForm } from '@/components/booking/StripeCheckoutForm';

interface RoomTypeResponse {
  roomType: RoomType;
}

interface StorefrontQuote {
  roomTypeId: string;
  roomTypeName: string;
  ratePlanId: string;
  ratePlanName: string;
  cancellationPolicy?: string | null;
  mealPlan?: string | null;
  quoteToken: string;
  nights: number;
  numberOfGuests: number;
  ratePerNight: number;
  roomSubtotal: number;
  taxAmount: number;
  feesAmount: number;
  totalAmount: number;
  currencyCode: string;
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
  displayName?: string | null;
  publicClientKey?: string | null;
}

interface BookingPaymentProvidersResponse {
  bookingPaymentProviders: PaymentProvider[];
}

interface BookingPaymentSessionResponse {
  initiateBookingPaymentSession: {
    id: string;
    amount: number;
    clientSecret?: string | null;
    paymentIntentId?: string | null;
    orderId?: string | null;
    approveLink?: string | null;
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
  const identity = useHotelSettings();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { toast } = useToast();

  const [roomType, setRoomType] = React.useState<RoomType | null>(null);
  const [quote, setQuote] = React.useState<StorefrontQuote | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [isCreatingPayment, setIsCreatingPayment] = React.useState(false);
  const [isConfirmingBooking, setIsConfirmingBooking] = React.useState(false);
  const [clientSecret, setClientSecret] = React.useState<string | null>(null);
  const [paymentError, setPaymentError] = React.useState<string | null>(null);
  const [bookingId, setBookingId] = React.useState<string | null>(null);
  const [confirmationNumber, setConfirmationNumber] = React.useState<string>('');
  const [paymentSessionId, setPaymentSessionId] = React.useState<string | null>(null);
  const [paymentProviders, setPaymentProviders] = React.useState<PaymentProvider[]>([]);
  const [providersLoading, setProvidersLoading] = React.useState(true);
  const [providerError, setProviderError] = React.useState<string | null>(null);
  const [selectedPaymentProviderCode, setSelectedPaymentProviderCode] = React.useState<string>('');
  const [paypalApproveLink, setPaypalApproveLink] = React.useState<string | null>(null);
  const selectedProvider = paymentProviders.find((provider) => provider.code === selectedPaymentProviderCode);
  const stripePromise = React.useMemo(
    () => selectedProvider?.code === 'pp_stripe_stripe' && selectedProvider.publicClientKey
      ? loadStripe(selectedProvider.publicClientKey)
      : null,
    [selectedProvider?.code, selectedProvider?.publicClientKey],
  );

  const roomTypeId = searchParams?.get('roomTypeId');
  const requestedRatePlanId = searchParams?.get('ratePlanId');
  const checkIn = searchParams?.get('checkIn');
  const checkOut = searchParams?.get('checkOut');
  const adults = searchParams?.get('adults');
  const children = searchParams?.get('children');
  const promoCode = searchParams?.get('promoCode');

  const adultsCountRaw = parseInt(adults || '1', 10);
  const childrenCountRaw = parseInt(children || '0', 10);
  const adultsCount = Number.isFinite(adultsCountRaw) ? adultsCountRaw : 1;
  const childrenCount = Number.isFinite(childrenCountRaw) ? childrenCountRaw : 0;
  const totalGuests = adultsCount + childrenCount;
  const nightsCount = quote?.nights || 0;
  const roomRate = quote?.ratePerNight || 0;
  const taxAmount = quote?.taxAmount || 0;
  const totalAmount = quote?.totalAmount || 0;

  const [formData, setFormData] = React.useState({
    guestName: '',
    guestEmail: '',
    guestPhone: '',
    specialRequests: '',
  });

  const [existingGuest, setExistingGuest] = React.useState<any>(null);

  React.useEffect(() => {
    const saved = localStorage.getItem('openfront_guest_context');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setFormData((prev) => ({
          ...prev,
          guestName: parsed.name || '',
          guestEmail: parsed.email || '',
          guestPhone: parsed.phone || '',
        }));
        setExistingGuest(parsed);
      } catch (e) {
        /* ignore */
      }
    }
  }, []);

  React.useEffect(() => {
    const fetchRoomType = async () => {
      if (!roomTypeId || !checkIn || !checkOut) {
        setLoading(false);
        return;
      }

      try {
        const roomData = await graphqlClient.request<RoomTypeResponse>(GET_ROOM_TYPE, { id: roomTypeId });
        const ratePlanId = requestedRatePlanId || roomData.roomType.ratePlans?.[0]?.id;
        if (!ratePlanId) throw new Error('No published rate plan is available for this room.');
        const quoteData = await graphqlClient.request<{ storefrontQuote: StorefrontQuote }>(GET_STOREFRONT_QUOTE, {
          roomTypeId,
          ratePlanId,
          checkInDate: new Date(checkIn).toISOString(),
          checkOutDate: new Date(checkOut).toISOString(),
          numberOfAdults: adultsCount,
          numberOfChildren: childrenCount,
          promoCode: promoCode || null,
        });
        setRoomType(roomData.roomType);
        setQuote(quoteData.storefrontQuote);
      } catch {
        toast({ title: 'Unable to price stay', description: safeQuoteFailureMessage(), variant: 'destructive' });
      } finally {
        setLoading(false);
      }
    };

    fetchRoomType();
  }, [roomTypeId, requestedRatePlanId, checkIn, checkOut, adultsCount, childrenCount, promoCode, toast]);

  React.useEffect(() => {
    const fetchPaymentProviders = async () => {
      setProvidersLoading(true);
      setProviderError(null);
      try {
        const data = await graphqlClient.request<BookingPaymentProvidersResponse>(GET_BOOKING_PAYMENT_PROVIDERS);
        const configuredProviders = data.bookingPaymentProviders || [];
        const providers = configuredProviders.filter((provider) =>
          provider.code !== 'pp_stripe_stripe' || Boolean(provider.publicClientKey),
        );
        setPaymentProviders(providers);
        setSelectedPaymentProviderCode((current) =>
          providers.some((provider) => provider.code === current)
            ? current
            : providers[0]?.code || '',
        );
        if (configuredProviders.length === 0) {
          setProviderError('Online payment is not configured for this property. Contact the front desk before booking.');
        } else if (providers.length === 0) {
          setProviderError('The configured payment method is unavailable in this browser build. Contact the front desk before booking.');
        }
      } catch {
        setPaymentProviders([]);
        setSelectedPaymentProviderCode('');
        setProviderError('Payment methods could not be loaded. Retry this page or contact the front desk.');
      } finally {
        setProvidersLoading(false);
      }
    };

    fetchPaymentProviders();
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
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
        numberOfAdults: adultsCount,
        numberOfChildren: childrenCount,
        roomTypeId,
        ratePlanId: quote?.ratePlanId,
        quoteToken: quote?.quoteToken,
        promoCode: promoCode || null,
        specialRequests: formData.specialRequests || '',
      };

      let resolvedBookingId = bookingId;
      let resolvedConfirmationNumber = confirmationNumber;

      if (!resolvedBookingId) {
        const response = await graphqlClient.request<CreateBookingResponse>(CREATE_STOREFRONT_BOOKING, { data: bookingData });
        resolvedBookingId = response.createStorefrontBooking.id;
        resolvedConfirmationNumber = response.createStorefrontBooking.confirmationNumber;
        setBookingId(resolvedBookingId);
        setConfirmationNumber(resolvedConfirmationNumber);
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

      localStorage.setItem(
        'openfront_guest_context',
        JSON.stringify({
          id: existingGuest?.id,
          name: formData.guestName,
          email: formData.guestEmail,
          phone: formData.guestPhone,
          lastBookingId: resolvedBookingId,
        }),
      );

      toast({
        title: 'Booking confirmed',
        description: `Confirmation ${resolvedConfirmationNumber || 'is ready in your reservation details'}`,
      });

      router.push(`/booking/${resolvedBookingId}`);
    } catch {
      const message = 'Unable to confirm the booking. No additional charge was attempted; review the stay and payment details, then try again.';
      setPaymentError(message);
      toast({ title: 'Booking failed', description: message, variant: 'destructive' });
    } finally {
      setIsConfirmingBooking(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.guestName || !formData.guestEmail || !formData.guestPhone) {
      toast({ title: 'Missing information', description: 'Please fill in all required fields.', variant: 'destructive' });
      return;
    }

    if (!checkIn || !checkOut || !roomTypeId) {
      toast({ title: 'Invalid booking', description: 'Missing booking information. Please start over.', variant: 'destructive' });
      return;
    }

    if (!selectedPaymentProviderCode) {
      const message = providerError || 'No payment provider is currently available. Contact the front desk before booking.';
      setPaymentError(message);
      toast({ title: 'Payment provider unavailable', description: message, variant: 'destructive' });
      return;
    }

    if (totalAmount <= 0) {
      toast({ title: 'Invalid amount', description: 'Total amount must be greater than zero.', variant: 'destructive' });
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
        numberOfAdults: adultsCount,
        numberOfChildren: childrenCount,
        roomTypeId,
        ratePlanId: quote?.ratePlanId,
        quoteToken: quote?.quoteToken,
        promoCode: promoCode || null,
        specialRequests: formData.specialRequests || '',
      };

      let resolvedBookingId = bookingId;
      if (!resolvedBookingId) {
        const response = await graphqlClient.request<CreateBookingResponse>(CREATE_STOREFRONT_BOOKING, { data: bookingData });
        resolvedBookingId = response.createStorefrontBooking.id;
        setBookingId(resolvedBookingId);
        setConfirmationNumber(response.createStorefrontBooking.confirmationNumber);
      }

      const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
      const cancelParams = new URLSearchParams({
        roomTypeId,
        ratePlanId: quote?.ratePlanId || '',
        checkIn,
        checkOut,
        adults: String(adultsCount),
        children: String(childrenCount),
      });
      if (promoCode) cancelParams.set('promoCode', promoCode);
      const baseCancelUrl = `${origin}/book?${cancelParams.toString()}`;
      const returnPath = selectedPaymentProviderCode === 'pp_paypal_paypal'
        ? '/paypal/return'
        : '/stripe/return';
      const returnParams = new URLSearchParams({ bookingId: resolvedBookingId });
      const sessionResponse = await graphqlClient.request<BookingPaymentSessionResponse>(INITIATE_BOOKING_PAYMENT_SESSION, {
        bookingId: resolvedBookingId,
        paymentProviderCode: selectedPaymentProviderCode,
        returnUrl: `${origin}${returnPath}?${returnParams.toString()}`,
        cancelUrl: baseCancelUrl,
      });

      const session = sessionResponse.initiateBookingPaymentSession;
      setPaymentSessionId(session.id);

      if (selectedPaymentProviderCode === 'pp_paypal_paypal') {
        const approveLink = session.approveLink;
        if (!approveLink) throw new Error('PayPal approval link was not returned.');
        const url = new URL(approveLink);
        url.searchParams.set('bookingId', resolvedBookingId);
        url.searchParams.set('paymentSessionId', session.id);
        setPaypalApproveLink(url.toString());
      } else {
        const nextClientSecret = session.clientSecret;
        if (!nextClientSecret) throw new Error('Stripe client secret was not returned.');
        setClientSecret(nextClientSecret);
      }
    } catch {
      const message = 'The selected secure payment method could not start. No payment was confirmed; choose another available method or contact the front desk.';
      setPaymentError(message);
      toast({ title: 'Payment failed', description: message, variant: 'destructive' });
    } finally {
      setIsCreatingPayment(false);
    }
  };

  if (loading) {
    return (
      <main className="lodging-page flex min-h-screen items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-[var(--lodging-accent-deep)]" />
      </main>
    );
  }

  if (!roomType || !checkIn || !checkOut) {
    return (
      <main className="lodging-page min-h-screen">
        <div className="lodging-container max-w-xl py-24 text-center">
          <p className="lodging-eyebrow mb-4 text-[var(--lodging-accent-deep)]">Booking</p>
          <h1 className="lodging-headline mb-4">Incomplete details</h1>
          <p className="lodging-lead mx-auto mb-10 max-w-md">
            We couldn&rsquo;t find the room or dates for this reservation. Please start your search again.
          </p>
          <Link href="/rooms" className="lodging-button">Browse available rooms</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="lodging-page min-h-screen">
      <div className="lodging-container max-w-5xl py-12 md:py-16">
        <Link href={`/rooms/${roomTypeId}`} className="lodging-link inline-flex items-center gap-2">
          <ArrowLeft className="h-4 w-4" /> Back to room details
        </Link>

        <header className="mt-8 border-b border-[var(--lodging-rule)] pb-8">
          <p className="lodging-eyebrow mb-3 text-[var(--lodging-accent-deep)]">Direct booking</p>
          <h1 className="lodging-display">Confirm your stay.</h1>
          <p className="lodging-lead mt-5 max-w-xl">
            {existingGuest
              ? `Welcome back, ${existingGuest.name.split(' ')[0]}. We've pre-filled your details from a previous visit—confirm they are still correct.`
              : 'Reserve directly with the property. Your details and payment stay between you and the front desk.'}
          </p>
        </header>

        <div className="mt-10 grid gap-10 lg:grid-cols-[1.4fr_1fr] lg:items-start">
          {/* Guest + payment form */}
          <form onSubmit={handleSubmit} className="min-w-0 space-y-10">
            <section className="space-y-6">
              <h2 className="lodging-title text-[clamp(1.5rem,2.5vw,2rem)]">Guest information</h2>
              <div className="grid gap-5 sm:grid-cols-2">
                <div className="space-y-2">
                  <label htmlFor="guestName" className="lodging-label">Full name</label>
                  <input
                    id="guestName"
                    name="guestName"
                    value={formData.guestName}
                    onChange={handleInputChange}
                    placeholder="Jordan Avery"
                    required
                    className="lodging-input"
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="guestEmail" className="lodging-label">Email</label>
                  <input
                    id="guestEmail"
                    name="guestEmail"
                    type="email"
                    value={formData.guestEmail}
                    onChange={handleInputChange}
                    placeholder="you@example.com"
                    required
                    className="lodging-input"
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="guestPhone" className="lodging-label">Phone</label>
                  <input
                    id="guestPhone"
                    name="guestPhone"
                    type="tel"
                    value={formData.guestPhone}
                    onChange={handleInputChange}
                    placeholder="+1 (555) 123-4567"
                    required
                    className="lodging-input"
                  />
                </div>
                <fieldset className="space-y-2" aria-describedby="payment-provider-state">
                  <legend className="lodging-label">Payment method</legend>
                  {providersLoading ? (
                    <p id="payment-provider-state" role="status" className="text-sm text-[var(--lodging-ink-muted)]">Loading secure payment methods…</p>
                  ) : paymentProviders.length > 0 ? (
                    <div className="grid gap-2" id="payment-provider-state">
                      {paymentProviders.map((provider) => (
                        <label key={provider.id} className="flex cursor-pointer items-center gap-3 border border-[var(--lodging-rule)] p-3 text-sm text-[var(--lodging-ink)]">
                          <input
                            type="radio"
                            name="paymentProvider"
                            value={provider.code}
                            checked={selectedPaymentProviderCode === provider.code}
                            onChange={(event) => {
                              setSelectedPaymentProviderCode(event.target.value);
                              setClientSecret(null);
                              setPaypalApproveLink(null);
                              setPaymentError(null);
                            }}
                          />
                          <span>{provider.displayName || provider.name}</span>
                        </label>
                      ))}
                    </div>
                  ) : (
                    <div id="payment-provider-state" role="alert" className="border-l-2 border-[var(--lodging-danger)] pl-4 text-sm leading-6 text-[var(--lodging-danger)]">
                      <p>{providerError || 'No online payment method is available.'}</p>
                      <Link href="/contact" className="lodging-link mt-2 inline-flex">Contact the front desk</Link>
                    </div>
                  )}
                </fieldset>
              </div>
              <div className="space-y-2">
                <label htmlFor="specialRequests" className="lodging-label">Special requests (optional)</label>
                <textarea
                  id="specialRequests"
                  name="specialRequests"
                  value={formData.specialRequests}
                  onChange={handleInputChange}
                  placeholder="Early check-in, high floor, extra pillows..."
                  rows={3}
                  className="lodging-textarea"
                />
              </div>
            </section>

            <div className="lodging-divider" />

            <section className="space-y-6">
              <div>
                <h2 className="lodging-title text-[clamp(1.5rem,2.5vw,2rem)]">Payment</h2>
                <p className="lodging-lead mt-2 text-base">
                  {clientSecret
                    ? 'Your reservation is held while you complete this secure payment.'
                    : 'Continue to start a secure payment session with your selected provider.'}
                </p>
              </div>

              <button
                type="submit"
                className="lodging-button w-full disabled:opacity-60"
                disabled={providersLoading || !selectedPaymentProviderCode || !!providerError || isCreatingPayment || !!clientSecret || !!paypalApproveLink}
              >
                {isCreatingPayment ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Initializing secure payment...
                  </>
                ) : (
                  <>
                    <CreditCard className="h-4 w-4" /> {clientSecret ? 'Payment ready' : 'Continue to secure payment'}
                  </>
                )}
              </button>

              {paymentError ? (
                <p role="alert" aria-live="polite" className="border-l-2 border-[var(--lodging-danger)] pl-4 text-sm leading-6 text-[var(--lodging-danger)]">
                  {paymentError}
                </p>
              ) : null}

              {paypalApproveLink ? (
                <div className="space-y-5 border-l border-[var(--lodging-rule-strong)] pl-6">
                  <div>
                    <p className="lodging-eyebrow mb-2 text-[var(--lodging-accent-deep)]">PayPal</p>
                    <p className="text-sm leading-6 text-[var(--lodging-ink-muted)]">
                      Approve the charge with PayPal, then return here to complete the reservation.
                    </p>
                  </div>
                  <a href={paypalApproveLink} target="_blank" rel="noopener noreferrer" className="lodging-button inline-flex">
                    Continue to PayPal
                  </a>
                </div>
              ) : null}

              {clientSecret && stripePromise ? (
                <div className="lodging-surface space-y-5 p-6">
                  <Elements stripe={stripePromise} options={{ clientSecret }}>
                    <StripeCheckoutForm
                      amount={totalAmount}
                      bookingId={bookingId!}
                      paymentSessionId={paymentSessionId!}
                      onSuccess={(stripePaymentId) => handlePaymentSuccess(stripePaymentId)}
                      onError={(error) => {
                        setPaymentError(error);
                        toast({ title: 'Payment failed', description: error, variant: 'destructive' });
                      }}
                    />
                  </Elements>
                </div>
              ) : null}
            </section>
          </form>

          {/* Stay summary */}
          <aside className="lg:sticky lg:top-24">
            <div className="lodging-surface space-y-6 p-6 md:p-8">
              <p className="lodging-eyebrow text-[var(--lodging-accent-deep)]">Stay summary</p>
              <div className="aspect-[4/3] overflow-hidden bg-[var(--lodging-paper-3)]">
                <img
                  src={primaryRoomImage(roomType)}
                  alt={roomType.roomImages?.[0]?.altText || `${roomType.name} room`}
                  className="lodging-image h-full w-full"
                />
              </div>
              <h3 className="lodging-title text-[clamp(1.5rem,2.5vw,2rem)]">{roomType.name}</h3>

              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-[var(--lodging-ink-faint)]">Check-in</span>
                  <span className="text-[var(--lodging-ink)]">{format(parseISO(checkIn), 'MMM dd, yyyy')}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--lodging-ink-faint)]">Check-out</span>
                  <span className="text-[var(--lodging-ink)]">{format(parseISO(checkOut), 'MMM dd, yyyy')}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--lodging-ink-faint)]">Duration</span>
                  <span className="text-[var(--lodging-ink)]">{nightsCount} {nightsCount === 1 ? 'night' : 'nights'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--lodging-ink-faint)]">Guests</span>
                  <span className="text-[var(--lodging-ink)]">
                    {totalGuests} ({adultsCount} {adultsCount === 1 ? 'adult' : 'adults'}
                    {childrenCount > 0 ? `, ${childrenCount} ${childrenCount === 1 ? 'child' : 'children'}` : ''})
                  </span>
                </div>
              </div>

              <div className="lodging-divider" />

              <div className="space-y-3 text-sm">
                <div className="flex justify-between text-[var(--lodging-ink-muted)]">
                  <span>Room rate</span>
                  <span>${roomRate.toFixed(2)} × {nightsCount}</span>
                </div>
                <div className="flex justify-between text-[var(--lodging-ink-muted)]">
                  <span>Subtotal</span>
                  <span>${(roomRate * nightsCount).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-[var(--lodging-ink-muted)]">
                  <span>Taxes</span>
                  <span>${taxAmount.toFixed(2)}</span>
                </div>
                <div className="lodging-divider" />
                <div className="flex items-baseline justify-between">
                  <span className="lodging-serif text-xl text-[var(--lodging-ink)]">Total</span>
                  <span className="lodging-serif text-[clamp(1.5rem,2.5vw,2rem)] text-[var(--lodging-ink)]">${totalAmount.toFixed(2)}</span>
                </div>
              </div>

              {quote?.feesAmount ? <div className="flex justify-between text-sm text-[var(--lodging-ink-muted)]"><span>Fees</span><span>${quote.feesAmount.toFixed(2)}</span></div> : null}
              <p className="border-l-2 border-[var(--lodging-accent)] pl-4 text-xs leading-5 text-[var(--lodging-ink-faint)]">
                Prices include the taxes and service charges shown above. After settlement, confirmation delivery is queued with durable retry evidence and the reservation is always available through secure lookup.
                Check-in from {identity.checkIn}, check-out by {identity.checkOut}.
              </p>
              {quote?.cancellationPolicy ? <p className="text-xs leading-5 text-[var(--lodging-ink-faint)]">Booked cancellation policy: {quote.cancellationPolicy.replaceAll('_', ' ')}.</p> : null}
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}

export default function BookPage() {
  return (
    <Suspense
      fallback={
        <main className="lodging-page flex min-h-screen items-center justify-center">
          <Loader2 className="h-7 w-7 animate-spin text-[var(--lodging-accent-deep)]" />
        </main>
      }
    >
      <BookContent />
    </Suspense>
  );
}
