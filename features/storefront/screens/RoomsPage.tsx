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

interface AvailableRoomType extends RoomType {
  availableCount: number;
}

interface AvailableRoomsResponse {
  roomTypes: AvailableRoomType[];
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

          setRoomTypes(
            (data.roomTypes || []).map((roomType) => ({
              ...roomType,
              roomsCount: roomType.availableCount,
            }))
          );
        } else {
          const data = await graphqlClient.request<RoomTypesResponse>(GET_ROOM_TYPES);
          setRoomTypes(data.roomTypes || []);
        }

        setError(null);
      } catch {
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
    <main>
      <section className="border-b border-[var(--lodging-rule)] bg-[var(--lodging-paper-2)]">
        <div className="lodging-container py-16">
          <Link href="/" className="lodging-link mb-8 inline-flex">Back home</Link>
          <div className="lodging-grid-break">
            <div className="min-w-0">
              <p className="lodging-eyebrow mb-4">Rooms & availability</p>
              <h1 className="lodging-display">Spaces for your stay.</h1>
              <p className="mt-6 max-w-xl leading-8 text-[var(--lodging-ink-muted)]">
                Compare room types with live availability, direct-booking rates, and the detail expected from a boutique hotel.
              </p>
            </div>
            <SearchWidget />
          </div>
        </div>
      </section>

      <section className="lodging-container py-14">
        {checkIn && checkOut ? (
          <div className="mb-10 border-b border-[var(--lodging-rule)] pb-6">
            <p className="lodging-eyebrow mb-2 text-[var(--lodging-accent-deep)]">Live availability</p>
            <p className="text-[var(--lodging-ink-muted)]">
              {format(parseISO(checkIn), 'MMM dd, yyyy')} — {format(parseISO(checkOut), 'MMM dd, yyyy')} · {nights} night{nights !== 1 ? 's' : ''}
              {adults ? ` · ${parseInt(adults) + parseInt(children || '0')} guest${parseInt(adults) + parseInt(children || '0') !== 1 ? 's' : ''}` : ''}
            </p>
          </div>
        ) : null}

        <div data-qa-layout="room-results-grid" className="grid min-w-0 gap-10 lg:grid-cols-[260px_minmax(0,1fr)]">
          <aside className="hidden lg:block">
            <div className="sticky top-28 border-r border-[var(--lodging-rule)] pr-8">
              <FilterSidebar />
            </div>
          </aside>

          <div data-qa-layout="room-results-content" className="min-w-0">
            <div className="mb-8 flex min-w-0 flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm text-[var(--lodging-ink-muted)]">
                {loading ? 'Loading rooms…' : `Showing ${roomsWithAvailability.length} room type${roomsWithAvailability.length !== 1 ? 's' : ''}`}
              </div>
              <div data-qa-layout="room-results-toolbar" className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center">
                <Sheet>
                  <SheetTrigger asChild>
                    <button className="lodging-button-ghost min-h-0 py-3 lg:hidden">
                      <SlidersHorizontal className="mr-2 h-4 w-4" /> Filters
                    </button>
                  </SheetTrigger>
                  <SheetContent side="left" className="bg-[var(--lodging-paper)]">
                    <SheetHeader>
                      <SheetTitle>Refine this stay</SheetTitle>
                      <SheetDescription>Filter rooms by nightly rate and stay details.</SheetDescription>
                    </SheetHeader>
                    <div className="mt-8">
                      <FilterSidebar />
                    </div>
                  </SheetContent>
                </Sheet>
                <Select value={sortBy} onValueChange={handleSortChange}>
                  <SelectTrigger data-qa-layout="room-results-sort" className="w-full min-w-0 rounded-none border-[var(--lodging-rule)] bg-[var(--lodging-paper)] sm:w-[220px]">
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
            </div>

            {hasActiveFilters ? (
              <div className="mb-8 flex flex-wrap items-center gap-3 border-y border-[var(--lodging-rule)] py-4">
                {selectedAmenities.map((amenity) => (
                  <button key={amenity} onClick={() => toggleAmenity(amenity)} className="text-xs text-[var(--lodging-ink-muted)]">
                    {AMENITY_OPTIONS.find(a => a.value === amenity)?.label} ×
                  </button>
                ))}
                <button onClick={clearFilters} className="lodging-link">Clear Filters</button>
              </div>
            ) : null}

            {loading ? (
              <div className="grid gap-10 md:grid-cols-2">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="space-y-5">
                    <Skeleton className="aspect-[4/5] w-full rounded-none" />
                    <Skeleton className="h-9 w-2/3 rounded-none" />
                    <Skeleton className="h-5 w-full rounded-none" />
                  </div>
                ))}
              </div>
            ) : error ? (
              <div className="border border-[var(--lodging-rule)] py-16 text-center">
                <p className="mb-4 text-lg text-[var(--lodging-danger)]">{error}</p>
                <button onClick={() => window.location.reload()} className="lodging-button">Try Again</button>
              </div>
            ) : roomsWithAvailability.length === 0 ? (
              <div className="border border-[var(--lodging-rule)] py-16 text-center">
                <h2 className="lodging-title mb-3">No availability for selected dates.</h2>
                <p className="mx-auto mb-8 max-w-xl text-[var(--lodging-ink-muted)]">Try widening your filters, shifting the dates, or contacting the concierge for direct support.</p>
                <div className="flex justify-center gap-4">
                  {hasActiveFilters ? <button onClick={clearFilters} className="lodging-button-ghost">Clear Dates</button> : null}
                  <Link href="/contact" className="lodging-button">Contact Concierge</Link>
                </div>
              </div>
            ) : (
              <div className="space-y-0">
                {roomsWithAvailability.map((roomType) => (
                  <RoomCard
                    key={roomType.id}
                    roomType={roomType}
                    availableCount={roomType.availableCount}
                    nights={nights}
                    totalPrice={roomType.baseRate * nights}
                    searchParams={searchParams?.toString()}
                    layout="list"
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}

function RoomsPageFallback() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-[var(--lodging-accent-deep)]" />
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
