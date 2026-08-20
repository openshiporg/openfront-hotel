'use server';

import { cookies, headers } from 'next/headers';

import { getServerBaseUrl } from '@/lib/graphql-client';
import { GET_BOOKINGS_BY_EMAIL, VERIFY_GUEST_BOOKING } from '@/lib/queries';

export type BookingLookupActionState = {
  status: 'idle' | 'matched' | 'no_match' | 'error';
  message: string;
  booking: Record<string, any> | null;
  formData: { confirmationNumber: string; email: string };
};

export type AccountLookupActionState = {
  status: 'idle' | 'matched' | 'no_match' | 'error';
  message: string;
  bookings: Array<Record<string, any>> | null;
  formData: { email: string };
};

class PublicGraphqlBoundaryError extends Error {}

const NO_MATCH = "We couldn't match those details. Check the confirmation number and email, then try again.";
const SEARCH_ERROR = 'The reservation search did not complete. Please try again.';
const RATE_LIMITED = 'Too many requests. Please wait and try again.';

function value(data: FormData, name: string) {
  const entry = data.get(name);
  return typeof entry === 'string' ? entry.trim() : '';
}

async function incomingRequestHeaders() {
  try {
    const incoming = await headers();
    const result = new Headers({ 'content-type': 'application/json' });
    const cookie = incoming.get('cookie');
    const forwardedProtocol = incoming.get('x-forwarded-proto');
    if (cookie) result.set('cookie', cookie);
    if (forwardedProtocol) result.set('x-forwarded-proto', forwardedProtocol);
    return result;
  } catch {
    return new Headers({ 'content-type': 'application/json' });
  }
}

async function relayGuestAccessCookie(response: Response) {
  const setCookie = response.headers.get('set-cookie') || '';
  const match = setCookie.match(/(?:^|,\s*)hotel-guest-access=([^;]+)/i);
  if (!match) return;
  try {
    const store = await cookies();
    store.set('hotel-guest-access', decodeURIComponent(match[1]), {
      httpOnly: true,
      sameSite: 'lax',
      secure: /;\s*secure/i.test(setCookie),
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
    });
  } catch {
    // Unit calls have no Next request scope. Runtime actions do.
  }
}

async function publicGraphql<T>(query: string, variables: Record<string, string>): Promise<T> {
  const response = await fetch(`${getServerBaseUrl()}/api/graphql`, {
    method: 'POST',
    headers: await incomingRequestHeaders(),
    body: JSON.stringify({ query, variables }),
    cache: 'no-store',
    signal: AbortSignal.timeout(8_000),
  });
  const payload = await response.json().catch(() => null) as {
    data?: T;
    errors?: Array<{ message?: string }>;
  } | null;
  const errorMessage = payload?.errors?.map((error) => error.message || '').join(' ') || '';
  if (!response.ok || !payload?.data || errorMessage) {
    throw new PublicGraphqlBoundaryError(errorMessage || SEARCH_ERROR);
  }
  await relayGuestAccessCookie(response);
  return payload.data;
}

function publicFailure(error: unknown) {
  const message = error instanceof Error ? error.message : '';
  return /too many requests/i.test(message) ? RATE_LIMITED : SEARCH_ERROR;
}

export async function lookupBookingAction(
  _previous: BookingLookupActionState,
  formData: FormData,
): Promise<BookingLookupActionState> {
  const confirmationNumber = value(formData, 'confirmationNumber').toUpperCase();
  const email = value(formData, 'email');
  const submitted = { confirmationNumber, email };
  if (!confirmationNumber || !email) {
    return { status: 'no_match', message: NO_MATCH, booking: null, formData: submitted };
  }

  try {
    const data = await publicGraphql<{ booking?: Record<string, any> | null }>(
      VERIFY_GUEST_BOOKING,
      submitted,
    );
    if (!data.booking) {
      return { status: 'no_match', message: NO_MATCH, booking: null, formData: submitted };
    }
    return {
      status: 'matched',
      message: 'Reservation matched. Open the booking below.',
      booking: data.booking,
      formData: submitted,
    };
  } catch (error) {
    if (error instanceof Error && /reservation access could not be verified/i.test(error.message)) {
      return { status: 'no_match', message: NO_MATCH, booking: null, formData: submitted };
    }
    return { status: 'error', message: publicFailure(error), booking: null, formData: submitted };
  }
}

export async function lookupAccountAction(
  _previous: AccountLookupActionState,
  formData: FormData,
): Promise<AccountLookupActionState> {
  const email = value(formData, 'email');
  const submitted = { email };
  if (!email) return { status: 'no_match', message: NO_MATCH, bookings: null, formData: submitted };

  try {
    const data = await publicGraphql<{ bookings?: Array<Record<string, any>> | null }>(
      GET_BOOKINGS_BY_EMAIL,
      submitted,
    );
    const bookings = Array.isArray(data.bookings) ? data.bookings : [];
    if (bookings.length === 0) {
      return { status: 'no_match', message: NO_MATCH, bookings: null, formData: submitted };
    }
    return {
      status: 'matched',
      message: 'Verified reservations loaded.',
      bookings,
      formData: submitted,
    };
  } catch (error) {
    return { status: 'error', message: publicFailure(error), bookings: null, formData: submitted };
  }
}
