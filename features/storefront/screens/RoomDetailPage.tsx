'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { ArrowLeft, Users, Bed, Maximize, CheckCircle, Calendar, CreditCard } from 'lucide-react';
import { format, differenceInDays, parseISO } from 'date-fns';
import { DateRange } from 'react-day-picker';

import { graphqlClient } from '@/lib/graphql-client';
import { GET_ROOM_TYPE, GET_ROOM_TYPES, GET_STOREFRONT_QUOTE } from '@/lib/queries';
import { RoomType } from '@/lib/types';
import { AMENITY_LABELS, BED_CONFIG_LABELS, roomCopy, roomImages } from '@/lib/hotel-storefront';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { DateRangePicker } from '@/components/booking/DateRangePicker';
import { GuestSelector } from '@/components/booking/GuestSelector';
import { RoomImageGallery } from '@/components/booking/RoomImageGallery';
import { RoomCard } from '@/components/booking/RoomCard';
import { quotePreflightMessage, safeQuoteFailureMessage, selectInitialPublicRatePlan } from '@/features/storefront/lib/qa-workflows';

interface RoomTypeResponse {
  roomType: RoomType;
}

interface StorefrontQuote {
  ratePlanId: string;
  ratePlanName: string;
  nights: number;
  ratePerNight: number;
  roomSubtotal: number;
  taxAmount: number;
  feesAmount: number;
  totalAmount: number;
}

function cancellationCopy(policy?: string | null) {
  if (policy === 'flexible') return 'Full refund until 48 hours before arrival; first night retained after that.';
  if (policy === 'moderate') return 'Full refund until 7 days before arrival; 50% until 48 hours before arrival.';
  if (policy === 'strict') return '50% refund until 14 days before arrival; non-refundable after that.';
  return 'Non-refundable after booking.';
}

export default function RoomDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [roomType, setRoomType] = React.useState<RoomType | null>(null);
  const [quote, setQuote] = React.useState<StorefrontQuote | null>(null);
  const [quoteLoading, setQuoteLoading] = React.useState(false);
  const [similarRooms, setSimilarRooms] = React.useState<RoomType[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [bookingNotice, setBookingNotice] = React.useState<string | null>(null);
  const [selectedRatePlanId, setSelectedRatePlanId] = React.useState('');
  const [promoCode, setPromoCode] = React.useState('');

  const checkInParam = searchParams?.get('checkIn');
  const checkOutParam = searchParams?.get('checkOut');
  const adultsParam = searchParams?.get('adults');
  const childrenParam = searchParams?.get('children');

  const [dateRange, setDateRange] = React.useState<DateRange | undefined>(() => {
    if (checkInParam && checkOutParam) {
      return {
        from: parseISO(checkInParam),
        to: parseISO(checkOutParam),
      };
    }
    return undefined;
  });

  const [guests, setGuests] = React.useState({
    adults: adultsParam ? parseInt(adultsParam) : 2,
    children: childrenParam ? parseInt(childrenParam) : 0,
  });

  const nights = quote?.nights || (dateRange?.from && dateRange?.to
    ? differenceInDays(dateRange.to, dateRange.from)
    : 1);
  const roomRate = quote?.ratePerNight || roomType?.baseRate || 0;
  const subtotal = quote?.roomSubtotal || 0;
  const taxAmount = quote?.taxAmount || 0;
  const feesAmount = quote?.feesAmount || 0;
  const totalAmount = quote?.totalAmount || 0;
  const selectedRatePlan = roomType?.ratePlans?.find((plan) => plan.id === selectedRatePlanId) || null;

  React.useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);

        // Fetch room type details
        const roomData = await graphqlClient.request<RoomTypeResponse>(GET_ROOM_TYPE, {
          id: params?.slug,
        });
        setRoomType(roomData.roomType);
        const requestedPlan = searchParams?.get('ratePlanId');
        const initialPlan = selectInitialPublicRatePlan(roomData.roomType.ratePlans, requestedPlan);
        setSelectedRatePlanId(initialPlan?.id || '');
        setPromoCode(searchParams?.get('promoCode') || '');

        // Fetch all room types for similar rooms
        const allRoomsData = await graphqlClient.request<{ roomTypes: RoomType[] }>(GET_ROOM_TYPES);

        // Filter similar rooms (exclude current, limit to 3, similar occupancy)
        const similar = allRoomsData.roomTypes
          .filter(rt => rt.id !== params?.slug)
          .filter(rt => Math.abs(rt.maxOccupancy - roomData.roomType.maxOccupancy) <= 2)
          .slice(0, 3);

        setSimilarRooms(similar);
        setError(null);
      } catch {
        setError('Failed to load room details. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    if (params?.slug) {
      fetchData();
    }
  }, [params?.slug, searchParams]);

  const requestQuote = React.useCallback(async (): Promise<StorefrontQuote | null> => {
    const preflight = quotePreflightMessage(dateRange, selectedRatePlan, promoCode);
    if (preflight || !params?.slug || !dateRange?.from || !dateRange.to || !selectedRatePlanId) {
      setQuote(null);
      setBookingNotice(preflight);
      return null;
    }

    setQuoteLoading(true);
    try {
      const data = await graphqlClient.request<{ storefrontQuote: StorefrontQuote }>(GET_STOREFRONT_QUOTE, {
        roomTypeId: params.slug,
        ratePlanId: selectedRatePlanId,
        checkInDate: dateRange.from.toISOString(),
        checkOutDate: dateRange.to.toISOString(),
        numberOfAdults: guests.adults,
        numberOfChildren: guests.children,
        promoCode: promoCode.trim() || null,
      });
      setQuote(data.storefrontQuote);
      setBookingNotice(null);
      return data.storefrontQuote;
    } catch {
      setQuote(null);
      setBookingNotice(safeQuoteFailureMessage());
      return null;
    } finally {
      setQuoteLoading(false);
    }
  }, [dateRange, guests.adults, guests.children, params?.slug, promoCode, selectedRatePlan, selectedRatePlanId]);

  React.useEffect(() => {
    setQuote(null);
    const timer = setTimeout(() => { void requestQuote(); }, 150);
    return () => clearTimeout(timer);
  }, [requestQuote]);

  const handleBookNow = async () => {
    const preflight = quotePreflightMessage(dateRange, selectedRatePlan, promoCode);
    if (preflight || !dateRange?.from || !dateRange.to) {
      setBookingNotice(preflight);
      return;
    }

    const currentQuote = quote || await requestQuote();
    if (!currentQuote) return;
    setBookingNotice(null);

    const bookingParams = new URLSearchParams({
      roomTypeId: params?.slug as string,
      ratePlanId: currentQuote.ratePlanId,
      checkIn: format(dateRange.from, 'yyyy-MM-dd'),
      checkOut: format(dateRange.to, 'yyyy-MM-dd'),
      adults: guests.adults.toString(),
      children: guests.children.toString(),
    });
    if (promoCode.trim()) bookingParams.set('promoCode', promoCode.trim());

    router.push(`/book?${bookingParams.toString()}`);
  };

  if (loading) {
    return (
      <div className="lodging-container py-10">
        <Skeleton className="mb-6 h-12 w-3/4" />
        <div className="grid gap-8 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <Skeleton className="h-64 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
          <Skeleton className="h-96 w-full" />
        </div>
      </div>
    );
  }

  if (error || !roomType) {
    return (
      <div className="lodging-container py-16">
        <div className="lodging-surface py-12 text-center">
          <p className="mb-4 text-lg text-[var(--lodging-ink-muted)]">{error || 'Room not found'}</p>
          <Link href="/rooms" className="lodging-button inline-flex">
            Back to rooms
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="lodging-container py-10">
      <Link
        href={`/rooms${searchParams?.toString() ? `?${searchParams.toString()}` : ''}`}
        className="lodging-link mb-8 inline-flex items-center gap-2"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to results
      </Link>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,0.75fr)]">
        <div className="space-y-6">
          <div className="lodging-surface p-4 md:p-5">
            <RoomImageGallery images={roomImages(roomType)} roomName={roomType.name} />
          </div>

          <div className="lodging-surface p-6 md:p-8">
            <p className="lodging-eyebrow mb-3">Room detail</p>
            <h1 className="lodging-headline mb-4">{roomType.name}</h1>
            <p className="mb-6 max-w-2xl leading-8 text-[var(--lodging-ink-muted)]">{roomCopy(roomType)}</p>

            <div className="mb-6 flex flex-wrap gap-4 text-[var(--lodging-ink-muted)]">
              {roomType.bedConfiguration ? (
                <div className="flex items-center gap-2">
                  <Bed className="h-5 w-5 text-[var(--lodging-accent-deep)]" />
                  <span>{BED_CONFIG_LABELS[roomType.bedConfiguration] || roomType.bedConfiguration}</span>
                </div>
              ) : null}
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-[var(--lodging-accent-deep)]" />
                <span>Up to {roomType.maxOccupancy} guests</span>
              </div>
              {roomType.squareFeet ? (
                <div className="flex items-center gap-2">
                  <Maximize className="h-5 w-5 text-[var(--lodging-accent-deep)]" />
                  <span>{roomType.squareFeet} sq ft</span>
                </div>
              ) : null}
            </div>

            <Separator className="my-6" />

            <div>
              <h2 className="lodging-title mb-4 text-[clamp(1.35rem,2vw,1.75rem)]">Room features</h2>
              {roomType.amenities && roomType.amenities.length > 0 ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {roomType.amenities.map((amenity) => (
                    <div key={amenity} className="flex items-center gap-2 text-[var(--lodging-ink-muted)]">
                      <CheckCircle className="h-5 w-5 shrink-0 text-[var(--lodging-accent-deep)]" />
                      <span>{AMENITY_LABELS[amenity] || amenity}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[var(--lodging-ink-faint)]">No amenities listed</p>
              )}
            </div>

            {roomType.ratePlans && roomType.ratePlans.length > 0 ? (
              <>
                <Separator className="my-6" />
                <div>
                  <h2 className="lodging-title mb-4 text-[clamp(1.35rem,2vw,1.75rem)]">Rate plans</h2>
                  <div className="space-y-3">
                    {roomType.ratePlans.map((plan) => {
                      const selected = selectedRatePlanId === plan.id;
                      return (
                        <button
                          key={plan.id}
                          type="button"
                          aria-pressed={selected}
                          onClick={() => {
                            setSelectedRatePlanId(plan.id);
                            setQuote(null);
                            setBookingNotice(null);
                            if (!plan.isPromotional) setPromoCode('');
                          }}
                          className={`w-full border p-5 text-left transition-colors ${selected ? 'border-[var(--lodging-accent-deep)] bg-[var(--lodging-accent-pale)]' : 'border-[var(--lodging-rule)] hover:border-[var(--lodging-rule-strong)]'}`}
                        >
                          <span className="flex items-start justify-between gap-4">
                            <span>
                              <span className="font-medium text-[var(--lodging-ink)]">{plan.name}</span>
                              {plan.description ? (
                                <span className="mt-1 block text-sm text-[var(--lodging-ink-muted)]">{plan.description}</span>
                              ) : null}
                            </span>
                            <span className="lodging-pill">{selected ? 'Selected' : 'Choose'}</span>
                          </span>
                          <span className="mt-4 grid gap-2 text-sm text-[var(--lodging-ink-muted)] sm:grid-cols-2">
                            <span><span className="text-[var(--lodging-ink-faint)]">Nightly rate</span><span className="ml-2 font-medium text-[var(--lodging-ink)]">${plan.baseRate}</span></span>
                            <span><span className="text-[var(--lodging-ink-faint)]">Minimum stay</span><span className="ml-2">{plan.minimumStay} night{plan.minimumStay !== 1 ? 's' : ''}</span></span>
                            <span className="sm:col-span-2"><span className="text-[var(--lodging-ink-faint)]">Cancellation</span><span className="ml-2">{cancellationCopy(plan.cancellationPolicy)}</span></span>
                            <span><span className="text-[var(--lodging-ink-faint)]">Meal plan</span><span className="ml-2">{plan.mealPlan.replace('_', ' ')}</span></span>
                            {plan.isPromotional ? <span>Promo code required</span> : null}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </>
            ) : null}
          </div>

          {similarRooms.length > 0 ? (
            <div className="lodging-surface p-6 md:p-8">
              <h2 className="lodging-title mb-6 text-[clamp(1.35rem,2vw,1.75rem)]">Similar rooms</h2>
              <div className="grid gap-6 md:grid-cols-2">
                {similarRooms.map((room) => (
                  <RoomCard
                    key={room.id}
                    roomType={room}
                    nights={1}
                    totalPrice={room.baseRate}
                    searchParams={searchParams?.toString()}
                  />
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <div>
          <div className="lodging-surface sticky top-28 p-6">
            <p className="lodging-eyebrow mb-2">Reserve</p>
            <h2 className="lodging-title mb-2 text-[clamp(1.35rem,2vw,1.75rem)]">Build your stay</h2>
            <p className="mb-6 text-sm leading-6 text-[var(--lodging-ink-muted)]">
              Confirm dates, guests, and your direct-booking estimate before checkout.
            </p>

            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-[var(--lodging-ink)]">Stay dates</label>
                <DateRangePicker dateRange={dateRange} onDateRangeChange={setDateRange} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-[var(--lodging-ink)]">Guest count</label>
                <GuestSelector guests={guests} onGuestsChange={setGuests} />
              </div>
              <div className="border border-[var(--lodging-rule)] p-4 text-sm">
                <span className="text-[var(--lodging-ink-faint)]">Selected rate</span>
                <p className="mt-1 font-medium text-[var(--lodging-ink)]">{selectedRatePlan?.name || 'Choose a rate plan'}</p>
                {selectedRatePlan ? <p className="mt-1 leading-5 text-[var(--lodging-ink-muted)]">{cancellationCopy(selectedRatePlan.cancellationPolicy)}</p> : null}
              </div>
              {selectedRatePlan?.isPromotional ? (
                <div className="space-y-2">
                  <label htmlFor="promoCode" className="text-sm font-medium text-[var(--lodging-ink)]">Promo code</label>
                  <input id="promoCode" value={promoCode} onChange={(event) => setPromoCode(event.target.value)} className="lodging-input" autoComplete="off" />
                </div>
              ) : null}
              <Separator />
              <div className="space-y-2 text-sm text-[var(--lodging-ink-muted)]">
                <div className="flex justify-between">
                  <span>
                    ${roomRate} × {nights} night{nights !== 1 ? 's' : ''}
                  </span>
                  <span>${subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Taxes</span>
                  <span>${taxAmount.toFixed(2)}</span>
                </div>
                {feesAmount > 0 ? <div className="flex justify-between"><span>Fees</span><span>${feesAmount.toFixed(2)}</span></div> : null}
                <Separator />
                <div className="flex justify-between text-base font-semibold text-[var(--lodging-ink)]">
                  <span>Total</span>
                  <span>${totalAmount.toFixed(2)}</span>
                </div>
              </div>
              <div className="bg-[var(--lodging-paper-2)] p-4 text-sm leading-6 text-[var(--lodging-ink-muted)]">
                You are booking directly with the hotel. Confirmation details and changes stay with the property team.
              </div>
              {bookingNotice ? (
                <div role="alert" aria-live="polite" className="border border-[var(--lodging-rule-strong)] bg-[var(--lodging-accent-pale)] px-4 py-3 text-sm text-[var(--lodging-accent-deep)]">
                  {bookingNotice}
                </div>
              ) : null}
              <button
                type="button"
                className="lodging-button h-12 w-full disabled:cursor-not-allowed disabled:opacity-50"
                onClick={() => { void handleBookNow(); }}
                disabled={!dateRange?.from || !dateRange?.to || !selectedRatePlanId}
              >
                <CreditCard className="h-5 w-5" />
                {quoteLoading ? 'Checking rate…' : 'Continue to booking'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
