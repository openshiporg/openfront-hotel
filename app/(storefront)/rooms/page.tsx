'use client';

import * as React from 'react';
import { Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { ArrowLeft, Loader2, SlidersHorizontal, X } from 'lucide-react';
import { format, differenceInDays, parseISO } from 'date-fns';
import { DateRange } from 'react-day-picker';

import { graphqlClient } from '@/lib/graphql-client';
import { GET_ROOM_TYPES, GET_AVAILABLE_ROOMS } from '@/lib/queries';
import { RoomType } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { RoomCard } from '@/components/booking/RoomCard';
import { SearchWidget } from '@/components/booking/SearchWidget';
import { Skeleton } from '@/components/ui/skeleton';
import { Slider } from '@/components/ui/slider';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';

interface RoomTypesResponse {
  roomTypes: RoomType[];
}

interface AvailableRoomsResponse {
  roomTypes: RoomType[];
  bookings: Array<{
    id: string;
    checkInDate: string;
    checkOutDate: string;
    roomAssignments: Array<{
      id: string;
      room?: { id: string } | null;
      roomType: { id: string };
    }>;
  }>;
}

const AMENITY_OPTIONS = [
  { value: 'wifi', label: 'WiFi' },
  { value: 'tv', label: 'TV' },
  { value: 'minibar', label: 'Minibar' },
  { value: 'balcony', label: 'Balcony' },
  { value: 'ac', label: 'Air Conditioning' },
  { value: 'bathtub', label: 'Bathtub' },
  { value: 'ocean_view', label: 'Ocean View' },
  { value: 'city_view', label: 'City View' },
  { value: 'jacuzzi', label: 'Jacuzzi' },
  { value: 'kitchenette', label: 'Kitchenette' },
] as const;

const SORT_OPTIONS = [
  { value: 'price_asc', label: 'Price: Low to High' },
  { value: 'price_desc', label: 'Price: High to Low' },
  { value: 'occupancy_asc', label: 'Occupancy: Low to High' },
  { value: 'occupancy_desc', label: 'Occupancy: High to Low' },
  { value: 'size_asc', label: 'Size: Small to Large' },
  { value: 'size_desc', label: 'Size: Large to Small' },
] as const;

function RoomsContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [roomTypes, setRoomTypes] = React.useState<RoomType[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const checkIn = searchParams?.get('checkIn');
  const checkOut = searchParams?.get('checkOut');
  const adults = searchParams?.get('adults');
  const children = searchParams?.get('children');

  // Filter states from URL params
  const selectedAmenities = React.useMemo(() => {
    const amenitiesParam = searchParams?.get('amenities');
    return amenitiesParam ? amenitiesParam.split(',') : [];
  }, [searchParams]);

  const [priceRange, setPriceRange] = React.useState<[number, number]>([0, 1000]);
  const sortBy = searchParams?.get('sortBy') || 'price_asc';

  const nights = checkIn && checkOut
    ? differenceInDays(parseISO(checkOut), parseISO(checkIn))
    : 1;

  // Calculate max price from room types
  React.useEffect(() => {
    if (roomTypes.length > 0) {
      const maxPrice = Math.max(...roomTypes.map(rt => rt.baseRate));
      const priceRangeParam = searchParams?.get('priceRange');
      if (priceRangeParam) {
        const [min, max] = priceRangeParam.split('-').map(Number);
        setPriceRange([min, max]);
      } else {
        setPriceRange([0, Math.ceil(maxPrice / 100) * 100]);
      }
    }
  }, [roomTypes, searchParams]);

  // Update URL with filter params
  const updateFilters = React.useCallback((updates: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams?.toString());

    Object.entries(updates).forEach(([key, value]) => {
      if (value === null || value === '') {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    });

    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }, [searchParams, router, pathname]);

  const toggleAmenity = (amenity: string) => {
    const newAmenities = selectedAmenities.includes(amenity)
      ? selectedAmenities.filter(a => a !== amenity)
      : [...selectedAmenities, amenity];

    updateFilters({ amenities: newAmenities.length > 0 ? newAmenities.join(',') : null });
  };

  const handlePriceRangeChange = (value: number[]) => {
    setPriceRange([value[0], value[1]]);
  };

  const applyPriceRange = () => {
    updateFilters({ priceRange: `${priceRange[0]}-${priceRange[1]}` });
  };

  const handleSortChange = (value: string) => {
    updateFilters({ sortBy: value });
  };

  const clearFilters = () => {
    setPriceRange([0, Math.max(...roomTypes.map(rt => rt.baseRate))]);
    const params = new URLSearchParams();
    if (checkIn) params.set('checkIn', checkIn);
    if (checkOut) params.set('checkOut', checkOut);
    if (adults) params.set('adults', adults);
    if (children) params.set('children', children);
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  };

  React.useEffect(() => {
    const fetchRoomTypes = async () => {
      try {
        setLoading(true);

        if (checkIn && checkOut) {
          const data = await graphqlClient.request<AvailableRoomsResponse>(
            GET_AVAILABLE_ROOMS,
            {
              checkInDate: new Date(checkIn).toISOString(),
              checkOutDate: new Date(checkOut).toISOString(),
            }
          );

          const bookedRoomIds = new Set<string>();
          const bookedRoomTypeIds = new Map<string, number>();

          data.bookings.forEach(booking => {
            booking.roomAssignments.forEach(assignment => {
              if (assignment.room?.id) {
                bookedRoomIds.add(assignment.room.id);
              }
              const roomTypeId = assignment.roomType.id;
              bookedRoomTypeIds.set(roomTypeId, (bookedRoomTypeIds.get(roomTypeId) || 0) + 1);
            });
          });

          const roomTypesWithAvailability = data.roomTypes.map(roomType => {
            const availableRooms = (roomType.rooms || []).filter(
              room => room.status === 'vacant' && !bookedRoomIds.has(room.id)
            );

            const roomTypeBookings = bookedRoomTypeIds.get(roomType.id) || 0;
            const totalAvailable = Math.max(0, availableRooms.length - roomTypeBookings);

            return {
              ...roomType,
              rooms: availableRooms,
              roomsCount: totalAvailable,
            };
          });

          setRoomTypes(roomTypesWithAvailability || []);
        } else {
          const data = await graphqlClient.request<RoomTypesResponse>(GET_ROOM_TYPES);
          setRoomTypes(data.roomTypes || []);
        }

        setError(null);
      } catch (err) {
        console.error('Error fetching room types:', err);
        setError('Failed to load rooms. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    fetchRoomTypes();
  }, [checkIn, checkOut]);

  // Apply all filters
  const filteredRoomTypes = React.useMemo(() => {
    let filtered = [...roomTypes];

    // Filter by guest count
    if (adults) {
      const totalGuests = parseInt(adults) + (parseInt(children || '0'));
      filtered = filtered.filter(rt => rt.maxOccupancy >= totalGuests);
    }

    // Filter by amenities
    if (selectedAmenities.length > 0) {
      filtered = filtered.filter(rt => {
        const roomAmenities = rt.amenities || [];
        return selectedAmenities.every(amenity => roomAmenities.includes(amenity));
      });
    }

    // Filter by price range
    const priceRangeParam = searchParams?.get('priceRange');
    if (priceRangeParam) {
      const [min, max] = priceRangeParam.split('-').map(Number);
      filtered = filtered.filter(rt => rt.baseRate >= min && rt.baseRate <= max);
    }

    return filtered;
  }, [roomTypes, adults, children, selectedAmenities, searchParams]);

  // Apply sorting
  const sortedRoomTypes = React.useMemo(() => {
    const sorted = [...filteredRoomTypes];

    switch (sortBy) {
      case 'price_asc':
        return sorted.sort((a, b) => a.baseRate - b.baseRate);
      case 'price_desc':
        return sorted.sort((a, b) => b.baseRate - a.baseRate);
      case 'occupancy_asc':
        return sorted.sort((a, b) => a.maxOccupancy - b.maxOccupancy);
      case 'occupancy_desc':
        return sorted.sort((a, b) => b.maxOccupancy - a.maxOccupancy);
      case 'size_asc':
        return sorted.sort((a, b) => (a.squareFeet || 0) - (b.squareFeet || 0));
      case 'size_desc':
        return sorted.sort((a, b) => (b.squareFeet || 0) - (a.squareFeet || 0));
      default:
        return sorted;
    }
  }, [filteredRoomTypes, sortBy]);

  const roomsWithAvailability = React.useMemo(() => {
    return sortedRoomTypes.map(roomType => ({
      ...roomType,
      availableCount: roomType.roomsCount || 0,
    }));
  }, [sortedRoomTypes]);

  const hasActiveFilters = selectedAmenities.length > 0 || searchParams?.get('priceRange');

  const FilterSidebar = () => (
    <div className="space-y-6">
      <div>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold tracking-[-0.03em] text-[color:oklch(0.24_0.02_58)]">Refine this stay</h3>
            <p className="mt-1 text-sm text-[color:oklch(0.43_0.03_58)]">Filter by nightly rate and the comforts guests tend to care about first.</p>
          </div>
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              <X className="h-4 w-4 mr-1" />
              Clear
            </Button>
          )}
        </div>

        {/* Price Range */}
        <div className="mb-6">
          <Label className="mb-3 block font-medium text-[color:oklch(0.3_0.03_58)]">Nightly rate</Label>
          <div className="px-2">
            <Slider
              value={priceRange}
              onValueChange={handlePriceRangeChange}
              max={Math.max(1000, ...roomTypes.map(rt => rt.baseRate))}
              min={0}
              step={10}
              className="mb-4"
            />
            <div className="flex items-center justify-between text-sm text-muted-foreground mb-2">
              <span>${priceRange[0]}</span>
              <span>${priceRange[1]}</span>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="w-full"
              onClick={applyPriceRange}
            >
              Apply Price Range
            </Button>
          </div>
        </div>

        {/* Amenities */}
        <div>
          <Label className="mb-3 block font-medium text-[color:oklch(0.3_0.03_58)]">Stay details</Label>
          <div className="space-y-2">
            {AMENITY_OPTIONS.map((amenity) => (
              <div key={amenity.value} className="flex items-center space-x-2">
                <Checkbox
                  id={amenity.value}
                  checked={selectedAmenities.includes(amenity.value)}
                  onCheckedChange={() => toggleAmenity(amenity.value)}
                />
                <label
                  htmlFor={amenity.value}
                  className="cursor-pointer text-sm font-medium leading-none text-[color:oklch(0.36_0.03_58)] peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  {amenity.label}
                </label>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="hotel-page min-h-screen">
      <div className="container mx-auto px-4 py-10">
        <Button variant="ghost" asChild className="mb-6 rounded-full text-[color:oklch(0.36_0.03_58)] hover:bg-white/60">
          <Link href="/">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Home
          </Link>
        </Button>

        <div className="mb-8">
          {checkIn && checkOut ? (
            <div className="hotel-surface mb-6 rounded-[2rem] p-6 sm:p-7">
              <div className="hotel-kicker mb-3">Live availability</div>
              <h2 className="text-3xl font-semibold tracking-[-0.04em] text-[color:oklch(0.22_0.02_58)]">Rooms for your selected stay</h2>
              <p className="mb-4 mt-2 text-sm leading-6 text-[color:oklch(0.4_0.03_58)] sm:text-base">
                {format(parseISO(checkIn), 'MMM dd, yyyy')} - {format(parseISO(checkOut), 'MMM dd, yyyy')}
                {' • '}
                {nights} night{nights !== 1 ? 's' : ''}
                {adults && (
                  <>
                    {' • '}
                    {parseInt(adults) + parseInt(children || '0')} guest{parseInt(adults) + parseInt(children || '0') !== 1 ? 's' : ''}
                  </>
                )}
                {' • '}Direct-booking rates shown before taxes and fees.
              </p>
              <details className="group">
                <summary className="hotel-link list-none cursor-pointer text-sm font-medium">
                  <span className="group-open:hidden">Adjust dates or guests</span>
                  <span className="hidden group-open:inline">Hide search form</span>
                </summary>
                <div className="mt-4">
                  <SearchWidget />
                </div>
              </details>
            </div>
          ) : (
            <div className="hotel-surface mb-6 rounded-[2rem] p-6 sm:p-7">
              <div className="hotel-kicker mb-3">Start with the right room type</div>
              <h2 className="text-3xl font-semibold tracking-[-0.04em] text-[color:oklch(0.22_0.02_58)]">Browse rooms, then narrow the stay.</h2>
              <p className="mb-4 mt-2 max-w-2xl text-sm leading-6 text-[color:oklch(0.4_0.03_58)] sm:text-base">
                Compare layouts, amenities, and rate style before you commit to dates. When you are ready, switch into live availability.
              </p>
              <SearchWidget />
            </div>
          )}
        </div>

        <div className="flex gap-8">
          {/* Desktop Sidebar */}
          <aside className="hidden w-64 flex-shrink-0 lg:block">
            <div className="hotel-surface sticky top-8 rounded-[1.8rem] p-6">
              <FilterSidebar />
            </div>
          </aside>

          {/* Main Content */}
          <div className="flex-1">
            {/* Mobile Filter & Sort Bar */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
              <div className="flex items-center gap-2 w-full sm:w-auto">
                {/* Mobile Filter Sheet */}
                <Sheet>
                  <SheetTrigger asChild>
                    <Button variant="outline" className="hotel-surface lg:hidden flex-1 rounded-full border-0 bg-transparent sm:flex-none">
                      <SlidersHorizontal className="h-4 w-4 mr-2" />
                      Filters
                      {hasActiveFilters && (
                        <Badge variant="secondary" className="ml-2">
                          {selectedAmenities.length + (searchParams?.get('priceRange') ? 1 : 0)}
                        </Badge>
                      )}
                    </Button>
                  </SheetTrigger>
                  <SheetContent side="left" className="hotel-page border-r-[color:oklch(0.84_0.02_75)]">
                    <SheetHeader>
                      <SheetTitle>Filters</SheetTitle>
                      <SheetDescription>
                        Refine your search to find the perfect room
                      </SheetDescription>
                    </SheetHeader>
                    <div className="mt-6">
                      <FilterSidebar />
                    </div>
                  </SheetContent>
                </Sheet>

                {/* Sort Select */}
                <Select value={sortBy} onValueChange={handleSortChange}>
                  <SelectTrigger className="w-full rounded-full border-[color:oklch(0.84_0.02_75)] bg-white/85 sm:w-[220px]">
                    <SelectValue placeholder="Sort by" />
                  </SelectTrigger>
                  <SelectContent>
                    {SORT_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Active Filters Display */}
              {hasActiveFilters && (
                <div className="flex flex-wrap items-center gap-2">
                  {selectedAmenities.map((amenity) => (
                    <Badge key={amenity} variant="secondary" className="gap-1">
                      {AMENITY_OPTIONS.find(a => a.value === amenity)?.label}
                      <X
                        className="h-3 w-3 cursor-pointer"
                        onClick={() => toggleAmenity(amenity)}
                      />
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            {loading ? (
              <div className="grid gap-6 md:grid-cols-2">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="space-y-4 border rounded-lg p-6">
                    <Skeleton className="h-8 w-3/4" />
                    <Skeleton className="h-4 w-1/2" />
                    <Skeleton className="h-20 w-full" />
                    <Skeleton className="h-10 w-full" />
                  </div>
                ))}
              </div>
            ) : error ? (
              <div className="text-center py-12">
                <p className="text-red-600 dark:text-red-400 text-lg mb-4">{error}</p>
                <Button onClick={() => window.location.reload()}>Try Again</Button>
              </div>
            ) : roomsWithAvailability.length === 0 ? (
              <div className="hotel-surface rounded-[2rem] py-12 text-center">
                <p className="mb-4 text-lg text-[color:oklch(0.34_0.03_58)]">
                  No room types match this stay yet.
                </p>
                <p className="mb-6 text-sm text-[color:oklch(0.45_0.03_58)]">
                  Try widening your filters, shifting the dates, or reducing the number of guests.
                </p>
                {hasActiveFilters && (
                  <Button variant="outline" onClick={clearFilters} className="mb-4">
                    Clear All Filters
                  </Button>
                )}
                <Button asChild>
                  <Link href="/">Return to Home</Link>
                </Button>
              </div>
            ) : (
              <>
                <div className="mb-4 text-sm text-[color:oklch(0.42_0.03_58)]">
                  Showing {roomsWithAvailability.length} room type{roomsWithAvailability.length !== 1 ? 's' : ''} with hospitality-first direct booking details.
                </div>
                <div className="grid gap-6 md:grid-cols-2">
                  {roomsWithAvailability.map((roomType) => (
                    <RoomCard
                      key={roomType.id}
                      roomType={roomType}
                      availableCount={roomType.availableCount}
                      nights={nights}
                      totalPrice={roomType.baseRate * nights}
                      searchParams={searchParams?.toString()}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function RoomsPageFallback() {
  return (
    <div className="hotel-page flex min-h-screen items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin" />
    </div>
  );
}

export default function RoomsPage() {
  return (
    <Suspense fallback={<RoomsPageFallback />}>
      <RoomsContent />
    </Suspense>
  );
}
