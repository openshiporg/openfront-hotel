'use client';

import { createContext, useContext } from 'react';
import type { GuestAccountStatus } from '../lib/guest-account-types';

const GuestAccountContext = createContext<GuestAccountStatus>({ account: null, passwordResetAvailable: false });

/** The signed-in guest account, read on the server for each request. */
export function GuestAccountProvider({ status, children }: { status: GuestAccountStatus; children: React.ReactNode }) {
  return <GuestAccountContext.Provider value={status}>{children}</GuestAccountContext.Provider>;
}

export function useGuestAccount() {
  return useContext(GuestAccountContext);
}
