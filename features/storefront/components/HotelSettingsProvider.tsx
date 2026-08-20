'use client';

import { createContext, useContext } from 'react';

import type { HotelIdentity } from '@/features/storefront/lib/hotel-settings';

const HotelSettingsContext = createContext<HotelIdentity | null>(null);

export function HotelSettingsProvider({
  identity,
  children,
}: {
  identity: HotelIdentity;
  children: React.ReactNode;
}) {
  return (
    <HotelSettingsContext.Provider value={identity}>
      {children}
    </HotelSettingsContext.Provider>
  );
}

export function useHotelSettings() {
  const settings = useContext(HotelSettingsContext);
  if (!settings) {
    throw new Error('useHotelSettings must be used within HotelSettingsProvider.');
  }
  return settings;
}
