'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { ArrowLeft, Users, Bed, Maximize, CheckCircle, Calendar, CreditCard, Play } from 'lucide-react';
import { format, differenceInDays, parseISO } from 'date-fns';
import { DateRange } from 'react-day-picker';

import { graphqlClient } from '@/lib/graphql-client';
import { GET_ROOM_TYPE, GET_ROOM_TYPES } from '@/lib/queries';
import { RoomType } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { DateRangePicker } from '@/components/booking/DateRangePicker';
import { GuestSelector } from '@/components/booking/GuestSelector';
import { RoomImageGallery } from '@/components/booking/RoomImageGallery';
import { RoomCard } from '@/components/booking/RoomCard';

interface RoomTypeResponse {
  roomType: RoomType;
}

const AMENITY_LABELS: Record<string, string> = {
  wifi: 'WiFi',
  tv: 'TV',
  minibar: 'Minibar',
  balcony: 'Balcony',
  coffee_maker: 'Coffee Maker',
  safe: 'Safe',
  bathtub: 'Bathtub',
  shower: 'Shower',
  ac: 'Air Conditioning',
  heating: 'Heating',
  desk: 'Desk',
  iron: 'Iron',
  hair_dryer: 'Hair Dryer',
  room_service: 'Room Service',
  ocean_view: 'Ocean View',
  city_view: 'City View',
  garden_view: 'Garden View',
  kitchenette: 'Kitchenette',
  jacuzzi: 'Jacuzzi',
  fireplace: 'Fireplace',
};

const BED_CONFIG_LABELS: Record<string, string> = {
  king: '1 King Bed',
  queen: '1 Queen Bed',
  double_queen: '2 Queen Beds',
  twin: '1 Twin Bed',
  double_twin: '2 Twin Beds',
  king_sofa: '1 King Bed + Sofa',
  queen_sofa: '1 Queen Bed + Sofa',
  suite: 'Suite',
};

// Mock images for demonstration - in production, these would come from the API
const getMockImages = (roomTypeName: string) => [
  {
    id: '1',
    url: `https://images.unsplash.com/photo-1611892440504-42a792e24d32?w=800&auto=format&fit=crop`,
    alt: `${roomTypeName} - Main view`,
    isPrimary: true,
  },
  {
    id: '2',
    url: `https://images.unsplash.com/photo-1590490360182-c33d57733427?w=800&auto=format&fit=crop`,
    alt: `${roomTypeName} - Bedroom`,
  },
  {
    id: '3',
    url: `https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?w=800&auto=format&fit=crop`,
    alt: `${roomTypeName} - Bathroom`,
  },
  {
    id: '4',
    url: `https://images.unsplash.com/photo-1578683010236-d716f9a3f461?w=800&auto=format&fit=crop`,
    alt: `${roomTypeName} - View`,
  },
  {
    id: '5',
    url: `https://images.unsplash.com/photo-1631049307264-da0ec9d70304?w=800&auto=format&fit=crop`,
    alt: `${roomTypeName} - Amenities`,
  },
];

export default function RoomDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [roomType, setRoomType] = React.useState<RoomType | null>(null);
  const [similarRooms, setSimilarRooms] = React.useState<RoomType[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [bookingNotice, setBookingNotice] = React.useState<string | null>(null);

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

  const nights = dateRange?.from && dateRange?.to
    ? differenceInDays(dateRange.to, dateRange.from)
    : 1;

  const roomRate = roomType?.baseRate || 0;
  const subtotal = roomRate * nights;
  const taxRate = 0.10;
  const taxAmount = subtotal * taxRate;
  const totalAmount = subtotal + taxAmount;

  React.useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);

        // Fetch room type details
        const roomData = await graphqlClient.request<RoomTypeResponse>(GET_ROOM_TYPE, {
          id: params?.slug,
        });
        setRoomType(roomData.roomType);

        // Fetch all room types for similar rooms
        const allRoomsData = await graphqlClient.request<{ roomTypes: RoomType[] }>(GET_ROOM_TYPES);

        // Filter similar rooms (exclude current, limit to 3, similar occupancy)
        const similar = allRoomsData.roomTypes
          .filter(rt => rt.id !== params?.slug)
          .filter(rt => Math.abs(rt.maxOccupancy - roomData.roomType.maxOccupancy) <= 2)
          .slice(0, 3);

        setSimilarRooms(similar);
        setError(null);
      } catch (err) {
        console.error('Error fetching data:', err);
        setError('Failed to load room details. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    if (params?.slug) {
      fetchData();
    }
  }, [params?.slug]);

  const handleBookNow = () => {
    if (!dateRange?.from || !dateRange?.to) {
      setBookingNotice('Choose arrival and departure dates before continuing to booking.');
      return;
    }

    setBookingNotice(null);

    const bookingParams = new URLSearchParams({
      roomTypeId: params?.slug as string,
      checkIn: format(dateRange.from, 'yyyy-MM-dd'),
      checkOut: format(dateRange.to, 'yyyy-MM-dd'),
      adults: guests.adults.toString(),
      children: guests.children.toString(),
      nights: nights.toString(),
      rate: roomRate.toString(),
      total: totalAmount.toFixed(2),
    });

    router.push(`/book?${bookingParams.toString()}`);
  };

  if (loading) {
    return (
      <div className="hotel-page min-h-screen">
        <div className="container mx-auto px-4 py-8">
          <Skeleton className="h-12 w-3/4 mb-6" />
          <div className="grid lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-6">
              <Skeleton className="h-64 w-full" />
              <Skeleton className="h-32 w-full" />
            </div>
            <div>
              <Skeleton className="h-96 w-full" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !roomType) {
    return (
      <div className="hotel-page min-h-screen">
        <div className="container mx-auto px-4 py-8">
          <div className="hotel-surface rounded-[2rem] py-12 text-center">
            <p className="mb-4 text-lg text-[color:oklch(0.39_0.05_45)]">
              {error || 'Room not found'}
            </p>
            <Button asChild className="rounded-full bg-[color:oklch(0.34_0.08_45)] text-white hover:bg-[color:oklch(0.3_0.08_42)]">
              <Link href="/rooms">Back to rooms</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="hotel-page min-h-screen">
      <div className="container mx-auto px-4 py-10">
        <Button variant="ghost" asChild className="mb-6 rounded-full text-[color:oklch(0.36_0.03_58)] hover:bg-white/60">
          <Link href={`/rooms${searchParams?.toString() ? `?${searchParams.toString()}` : ''}`}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to results
          </Link>
        </Button>

        <div className="grid lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            {/* Photo Gallery */}
            <div className="hotel-surface rounded-[2rem] p-6">
              <RoomImageGallery
                images={getMockImages(roomType.name)}
                roomName={roomType.name}
              />
            </div>

            <div className="hotel-surface rounded-[2rem] p-8">
              <div className="hotel-kicker mb-3">Direct booking room detail</div>
              <h1 className="hotel-title mb-4 font-semibold text-[color:oklch(0.22_0.02_58)]">{roomType.name}</h1>

              <div className="flex flex-wrap gap-4 mb-6">
                {roomType.bedConfiguration && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Bed className="h-5 w-5" />
                    <span>{BED_CONFIG_LABELS[roomType.bedConfiguration] || roomType.bedConfiguration}</span>
                  </div>
                )}
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Users className="h-5 w-5" />
                  <span>Up to {roomType.maxOccupancy} guests</span>
                </div>
                {roomType.squareFeet && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Maximize className="h-5 w-5" />
                    <span>{roomType.squareFeet} sq ft</span>
                  </div>
                )}
              </div>

              <Separator className="my-6" />

              <div>
                <h2 className="mb-4 text-2xl font-semibold tracking-[-0.03em] text-[color:oklch(0.24_0.02_58)]">Room features</h2>
                {roomType.amenities && roomType.amenities.length > 0 ? (
                  <div className="grid sm:grid-cols-2 gap-3">
                    {roomType.amenities.map((amenity) => (
                      <div key={amenity} className="flex items-center gap-2">
                        <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400 flex-shrink-0" />
                        <span>{AMENITY_LABELS[amenity] || amenity}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground">No amenities listed</p>
                )}
              </div>

              {roomType.ratePlans && roomType.ratePlans.length > 0 && (
                <>
                  <Separator className="my-6" />
                  <div>
                    <h2 className="mb-4 text-2xl font-semibold tracking-[-0.03em] text-[color:oklch(0.24_0.02_58)]">Available rate plans</h2>
                    <div className="space-y-3">
                      {roomType.ratePlans.map((plan) => (
                        <Card key={plan.id}>
                          <CardHeader>
                            <CardTitle className="text-lg">{plan.name}</CardTitle>
                            {plan.description && (
                              <CardDescription>{plan.description}</CardDescription>
                            )}
                          </CardHeader>
                          <CardContent className="space-y-2">
                            <div className="flex items-center justify-between text-sm">
                              <span>Base Rate:</span>
                              <span className="font-semibold">${plan.baseRate}/night</span>
                            </div>
                            <div className="flex items-center justify-between text-sm">
                              <span>Minimum Stay:</span>
                              <span>{plan.minimumStay} night{plan.minimumStay !== 1 ? 's' : ''}</span>
                            </div>
                            <div className="flex items-center justify-between text-sm">
                              <span>Cancellation:</span>
                              <Badge variant="outline">{plan.cancellationPolicy}</Badge>
                            </div>
                            <div className="flex items-center justify-between text-sm">
                              <span>Meal Plan:</span>
                              <Badge variant="secondary">{plan.mealPlan.replace('_', ' ')}</Badge>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Similar Rooms Section */}
            {similarRooms.length > 0 && (
              <div className="hotel-surface rounded-[2rem] p-8">
                <h2 className="mb-6 text-2xl font-semibold tracking-[-0.03em] text-[color:oklch(0.24_0.02_58)]">Similar rooms</h2>
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
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
            )}
          </div>

          <div className="lg:col-span-1">
            <Card className="hotel-surface sticky top-24 rounded-[2rem] border-0 bg-transparent shadow-none">
              <CardHeader>
                <div className="hotel-kicker mb-2">Reserve with the property</div>
                <CardTitle className="text-2xl tracking-[-0.03em] text-[color:oklch(0.24_0.02_58)]">Build your stay</CardTitle>
                <CardDescription className="text-[color:oklch(0.42_0.03_58)]">
                  Confirm dates, guests, and your direct-booking estimate before checkout.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-[color:oklch(0.31_0.03_58)]">Stay dates</label>
                  <DateRangePicker
                    dateRange={dateRange}
                    onDateRangeChange={setDateRange}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-[color:oklch(0.31_0.03_58)]">Guest count</label>
                  <GuestSelector guests={guests} onGuestsChange={setGuests} />
                </div>

                <Separator />

                <div className="space-y-2">
                  <div className="flex justify-between text-sm text-[color:oklch(0.38_0.03_58)]">
                    <span>${roomRate} × {nights} night{nights !== 1 ? 's' : ''}</span>
                    <span>${subtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm text-[color:oklch(0.38_0.03_58)]">
                    <span>Taxes & fees</span>
                    <span>${taxAmount.toFixed(2)}</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between text-lg font-bold text-[color:oklch(0.22_0.02_58)]">
                    <span>Total</span>
                    <span>${totalAmount.toFixed(2)}</span>
                  </div>
                </div>

                <div className="rounded-[1.5rem] bg-[color:color-mix(in_oklab,white_78%,oklch(0.95_0.02_82))] p-4 text-sm leading-6 text-[color:oklch(0.38_0.03_58)]">
                  You are booking directly with the hotel. Confirmation details, guest requests, and changes stay with the property team.
                </div>

                {bookingNotice ? (
                  <div className="rounded-[1.25rem] border border-[color:oklch(0.83_0.05_45)] bg-[color:oklch(0.97_0.02_70)] px-4 py-3 text-sm text-[color:oklch(0.38_0.05_45)]">
                    {bookingNotice}
                  </div>
                ) : null}
              </CardContent>
              <CardFooter>
                <Button
                  className="h-12 w-full rounded-full bg-[color:oklch(0.34_0.08_45)] text-white hover:bg-[color:oklch(0.3_0.08_42)]"
                  size="lg"
                  onClick={handleBookNow}
                  disabled={!dateRange?.from || !dateRange?.to}
                >
                  <CreditCard className="mr-2 h-5 w-5" />
                  Continue to secure booking
                </Button>
              </CardFooter>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
