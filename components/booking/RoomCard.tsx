'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowRight, Bed, CheckCircle, Maximize, ShieldCheck, Sparkles, Users } from 'lucide-react';
import { RoomType } from '@/lib/types';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface RoomCardProps {
  roomType: RoomType;
  availableCount?: number;
  nights?: number;
  totalPrice?: number;
  searchParams?: string;
}

const AMENITY_LABELS: Record<string, string> = {
  wifi: 'Fast WiFi',
  tv: 'Smart TV',
  minibar: 'Mini bar',
  balcony: 'Balcony',
  coffee_maker: 'Coffee setup',
  safe: 'In-room safe',
  bathtub: 'Bathtub',
  shower: 'Rain shower',
  ac: 'Climate control',
  heating: 'Heating',
  desk: 'Work desk',
  iron: 'Iron',
  hair_dryer: 'Hair dryer',
  room_service: 'Room service',
  ocean_view: 'Ocean view',
  city_view: 'City view',
  garden_view: 'Garden view',
  kitchenette: 'Kitchenette',
  jacuzzi: 'Jacuzzi',
  fireplace: 'Fireplace',
};

const BED_CONFIG_LABELS: Record<string, string> = {
  king: '1 king bed',
  queen: '1 queen bed',
  double_queen: '2 queen beds',
  twin: '1 twin bed',
  double_twin: '2 twin beds',
  king_sofa: 'King bed + sofa',
  queen_sofa: 'Queen bed + sofa',
  suite: 'Suite layout',
};

function getRoomMood(roomType: RoomType) {
  if ((roomType.squareFeet || 0) >= 450) return 'Best for longer stays';
  if ((roomType.amenities || []).includes('city_view')) return 'Popular city-view choice';
  if ((roomType.amenities || []).includes('desk')) return 'Well suited to work trips';
  return 'Comfort-first direct booking rate';
}

function getPolicyHighlights(roomType: RoomType) {
  const plans = roomType.ratePlans || [];
  const hasBreakfast = plans.some((plan) => plan.mealPlan?.includes('breakfast'));
  const hasFlexible = plans.some((plan) => plan.cancellationPolicy === 'flexible');

  return [
    hasFlexible ? 'Flexible change-friendly rates' : 'Direct booking support from the hotel team',
    hasBreakfast ? 'Breakfast packages available' : 'Best-available room-only rates',
    'No marketplace messaging delays',
  ];
}

export function RoomCard({
  roomType,
  availableCount,
  nights = 1,
  totalPrice,
  searchParams,
}: RoomCardProps) {
  const pricePerNight = roomType.baseRate;
  const calculatedTotal = totalPrice || pricePerNight * nights;

  const bookingUrl = searchParams
    ? `/rooms/${roomType.id}?${searchParams}`
    : `/rooms/${roomType.id}`;

  const displayedAmenities = roomType.amenities?.slice(0, 4) || [];
  const policyHighlights = getPolicyHighlights(roomType);

  return (
    <Card className="hotel-surface overflow-hidden rounded-[2rem] border-0 bg-transparent shadow-none transition-transform duration-200 hover:-translate-y-0.5">
      <CardHeader className="pb-4">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="hotel-eyebrow-pill">{getRoomMood(roomType)}</span>
          {availableCount !== undefined ? (
            <Badge
              variant="outline"
              className={`rounded-full border px-3 py-1 text-xs font-medium ${
                availableCount > 0
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  : 'border-rose-200 bg-rose-50 text-rose-700'
              }`}
            >
              {availableCount > 0
                ? `${availableCount} ready to book`
                : 'Currently unavailable'}
            </Badge>
          ) : null}
        </div>

        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <CardTitle className="text-2xl tracking-[-0.04em] text-[color:oklch(0.22_0.02_58)]">
              {roomType.name}
            </CardTitle>
            <p className="mt-2 max-w-md text-sm leading-6 text-[color:oklch(0.42_0.03_58)]">
              A hospitality-first room type with the comfort, flexibility, and direct support guests expect when booking with the property.
            </p>
          </div>
          <div className="text-right">
            <div className="text-sm font-medium uppercase tracking-[0.12em] text-[color:oklch(0.48_0.04_55)]">
              From
            </div>
            <div className="text-3xl font-semibold tracking-[-0.05em] text-[color:oklch(0.24_0.03_55)]">
              ${pricePerNight}
            </div>
            <div className="text-sm text-[color:oklch(0.46_0.02_58)]">per night</div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-5 pb-5">
        <div className="grid gap-3 text-sm text-[color:oklch(0.33_0.03_55)] sm:grid-cols-3">
          {roomType.bedConfiguration ? (
            <div className="hotel-surface-muted flex items-center gap-2 rounded-2xl px-3 py-3">
              <Bed className="h-4 w-4 text-[color:oklch(0.44_0.06_45)]" />
              <span>{BED_CONFIG_LABELS[roomType.bedConfiguration] || roomType.bedConfiguration}</span>
            </div>
          ) : null}
          <div className="hotel-surface-muted flex items-center gap-2 rounded-2xl px-3 py-3">
            <Users className="h-4 w-4 text-[color:oklch(0.44_0.06_45)]" />
            <span>Up to {roomType.maxOccupancy} guests</span>
          </div>
          {roomType.squareFeet ? (
            <div className="hotel-surface-muted flex items-center gap-2 rounded-2xl px-3 py-3">
              <Maximize className="h-4 w-4 text-[color:oklch(0.44_0.06_45)]" />
              <span>{roomType.squareFeet} sq ft</span>
            </div>
          ) : null}
        </div>

        {displayedAmenities.length > 0 ? (
          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-[color:oklch(0.46_0.04_55)]">
              In-room comforts
            </div>
            <div className="flex flex-wrap gap-2">
              {displayedAmenities.map((amenity) => (
                <span key={amenity} className="hotel-chip">
                  <CheckCircle className="h-3.5 w-3.5 text-[color:oklch(0.42_0.07_145)]" />
                  {AMENITY_LABELS[amenity] || amenity}
                </span>
              ))}
            </div>
          </div>
        ) : null}

        <div className="grid gap-2 text-sm text-[color:oklch(0.38_0.03_58)]">
          {policyHighlights.map((highlight) => (
            <div key={highlight} className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-[color:oklch(0.41_0.07_145)]" />
              <span>{highlight}</span>
            </div>
          ))}
        </div>
      </CardContent>

      <CardFooter className="flex flex-col items-start gap-4 border-t border-black/5 bg-[color:color-mix(in_oklab,white_78%,oklch(0.95_0.02_85))] px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:oklch(0.47_0.04_55)]">
            Direct booking estimate
          </div>
          <div className="mt-1 text-sm text-[color:oklch(0.38_0.03_58)]">
            {nights > 1 ? (
              <>
                Total for {nights} nights:{' '}
                <span className="text-lg font-semibold text-[color:oklch(0.24_0.03_55)]">
                  ${calculatedTotal.toFixed(2)}
                </span>
              </>
            ) : (
              'Select dates to see your full stay total.'
            )}
          </div>
        </div>
        <Button
          asChild
          disabled={availableCount === 0}
          className="h-11 rounded-full bg-[color:oklch(0.34_0.08_45)] px-5 text-white hover:bg-[color:oklch(0.3_0.08_42)]"
        >
          <Link href={bookingUrl}>
            {availableCount === 0 ? 'Unavailable' : 'View room details'}
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </CardFooter>
    </Card>
  );
}
