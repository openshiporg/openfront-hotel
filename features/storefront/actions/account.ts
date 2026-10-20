'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { hotelResetActionSecret } from '@/features/keystone/lib/hotelResetActionSecret';
import { GUEST_SESSION_COOKIE, storefrontServerGraphql } from '../lib/storefront-server-graphql';
import { getGuestAccountBookings, type GuestAccountStaysPage } from '../lib/guest-account';

export type AccountFormState = { status: 'idle' | 'error' | 'success' | 'created'; message: string; email?: string };

const AUTHENTICATE = `mutation($email: String!, $password: String!) {
  authenticate: authenticateUserWithPassword(email: $email, password: $password) {
    ... on UserAuthenticationWithPasswordSuccess { sessionToken }
    ... on UserAuthenticationWithPasswordFailure { message }
  }
}`;
const STATUS = `query { guestAccountStatus { account { id } } }`;
const CLAIM = `mutation { claimGuestAccountStays }`;
const END_SESSION = `mutation { endSession }`;
const REGISTER = `mutation($name: String!, $email: String!, $password: String!, $phone: String) {
  registerGuestAccount(name: $name, email: $email, password: $password, phone: $phone) { account { id } error }
}`;
const UPDATE = `mutation($name: String!, $phone: String) { updateGuestAccount(name: $name, phone: $phone) { account { id } error } }`;
const CHANGE_PASSWORD = `mutation($currentPassword: String!, $newPassword: String!) {
  changeGuestAccountPassword(currentPassword: $currentPassword, newPassword: $newPassword) { account { id } error }
}`;
const REQUEST_RESET = `mutation($email: String!) { sendUserPasswordResetLink(email: $email) }`;
const REDEEM_RESET = `mutation($email: String!, $token: String!, $password: String!) {
  redeemHotelPasswordResetToken(email: $email, token: $token, password: $password) { code message }
}`;

const RESET_FAILURES: Record<string, string> = {
  FAILURE: 'The reset link doesn’t match this email, or the new password is too common. Check both, or request a new link.',
  TOKEN_REDEEMED: 'This reset link has already been used. Request a new one if you still need it.',
  TOKEN_EXPIRED: 'This reset link has expired. Request a new one.',
};
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 12;
const TRY_AGAIN = 'That didn’t go through. Please try again.';
const RATE_LIMITED = 'Too many attempts. Please wait a few minutes and try again.';

function field(form: FormData, name: string) {
  const value = form.get(name);
  return typeof value === 'string' ? value.trim() : '';
}

/** Only same-site storefront paths; never the staff dashboard. */
function safeNext(value: unknown) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || /[\\\u0000-\u001f\u007f]/.test(value)) return '/account';
  try {
    const target = new URL(value, 'https://hotel.invalid');
    if (target.origin !== 'https://hotel.invalid' || target.pathname.startsWith('/dashboard') || target.pathname.startsWith('/api')) return '/account';
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return '/account';
  }
}

async function setSession(token: string) {
  (await cookies()).set(GUEST_SESSION_COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: SESSION_MAX_AGE_SECONDS });
}

/** Sign in, refuse staff identities, keep the session and attach stays this device already verified. */
async function startGuestSession(email: string, password: string): Promise<string | null> {
  const result = await storefrontServerGraphql<{ authenticate: { sessionToken?: string; message?: string } }>(AUTHENTICATE, { email, password });
  if (result.status === 429) return RATE_LIMITED;
  const token = result.data?.authenticate?.sessionToken;
  if (!token) return result.ok ? 'That email and password don’t match an account.' : TRY_AGAIN;
  const status = await storefrontServerGraphql<{ guestAccountStatus: { account: { id: string } | null } }>(STATUS, {}, { sessionToken: token });
  if (!status.data?.guestAccountStatus?.account) {
    await storefrontServerGraphql(END_SESSION, {}, { sessionToken: token }).catch(() => null);
    return 'This account can’t be used to sign in here.';
  }
  await setSession(token);
  await storefrontServerGraphql(CLAIM, {}, { sessionToken: token }).catch(() => null);
  return null;
}

export async function signInGuestAction(_previous: AccountFormState, form: FormData): Promise<AccountFormState> {
  const email = field(form, 'email').toLowerCase();
  const password = String(form.get('password') || '');
  if (!email || !password) return { status: 'error', message: 'Enter your email and password.', email };
  let failure: string | null;
  try { failure = await startGuestSession(email, password); } catch { failure = TRY_AGAIN; }
  if (failure) return { status: 'error', message: failure, email };
  redirect(safeNext(form.get('next')));
}

export async function createGuestAccountAction(_previous: AccountFormState, form: FormData): Promise<AccountFormState> {
  const email = field(form, 'email').toLowerCase();
  const password = String(form.get('password') || '');
  if (password !== String(form.get('confirmPassword') || '')) return { status: 'error', message: 'The two passwords don’t match.', email };
  let created = false;
  let failure: string | null = null;
  try {
    const result = await storefrontServerGraphql<{ registerGuestAccount: { account: { id: string } | null; error: string | null } }>(REGISTER, { name: field(form, 'name'), email, password, phone: field(form, 'phone') || null });
    const outcome = result.data?.registerGuestAccount;
    if (!outcome?.account) failure = outcome?.error || (result.status === 429 ? RATE_LIMITED : TRY_AGAIN);
    else {
      created = true;
      failure = await startGuestSession(email, password);
    }
  } catch { failure = TRY_AGAIN; }
  // The account exists even when signing in afterwards failed; never ask the guest to create it again.
  if (created && failure) return { status: 'created', message: 'Your account was created, but we couldn’t sign you in. Sign in with your email and new password.', email };
  if (failure) return { status: 'error', message: failure, email };
  redirect(safeNext(form.get('next')));
}

export async function signOutGuestAccountAction() {
  await storefrontServerGraphql(END_SESSION).catch(() => null);
  const store = await cookies();
  store.delete(GUEST_SESSION_COOKIE);
  // Signing out of a shared device also forgets the reservations verified on it.
  store.delete('hotel-guest-access');
  redirect('/account?signedOut=1');
}

export async function updateGuestProfileAction(_previous: AccountFormState, form: FormData): Promise<AccountFormState> {
  try {
    const result = await storefrontServerGraphql<{ updateGuestAccount: { account: { id: string } | null; error: string | null } }>(UPDATE, { name: field(form, 'name'), phone: field(form, 'phone') || null });
    const outcome = result.data?.updateGuestAccount;
    if (!outcome?.account) return { status: 'error', message: outcome?.error || TRY_AGAIN };
  } catch { return { status: 'error', message: TRY_AGAIN }; }
  // The greeting, header and booking prefill all read the account from the layout.
  revalidatePath('/', 'layout');
  return { status: 'success', message: 'Your details are saved.' };
}

export async function changeGuestPasswordAction(_previous: AccountFormState, form: FormData): Promise<AccountFormState> {
  const next = String(form.get('newPassword') || '');
  if (next !== String(form.get('confirmPassword') || '')) return { status: 'error', message: 'The two new passwords don’t match.' };
  try {
    const result = await storefrontServerGraphql<{ changeGuestAccountPassword: { account: { id: string } | null; error: string | null } }>(CHANGE_PASSWORD, { currentPassword: String(form.get('currentPassword') || ''), newPassword: next });
    const outcome = result.data?.changeGuestAccountPassword;
    if (!outcome?.account) return { status: 'error', message: outcome?.error || TRY_AGAIN };
  } catch { return { status: 'error', message: TRY_AGAIN }; }
  // The password change ends every session for the account, including this one.
  (await cookies()).delete(GUEST_SESSION_COOKIE);
  redirect('/account?passwordChanged=1');
}

export async function requestGuestPasswordResetAction(_previous: AccountFormState, form: FormData): Promise<AccountFormState> {
  const email = field(form, 'email').toLowerCase();
  if (!email) return { status: 'error', message: 'Enter the email for your account.', email };
  const startedAt = Date.now();
  // Only an accepted request may say a link is coming. Every other outcome gets the same
  // retry message, which never says whether an account uses the email.
  let outcome: 'accepted' | 'rate-limited' | 'unavailable' = 'unavailable';
  try {
    const result = await storefrontServerGraphql<{ sendUserPasswordResetLink: boolean }>(REQUEST_RESET, { email }, { headers: { 'x-hotel-reset-action': hotelResetActionSecret() } });
    if (result.status === 429) outcome = 'rate-limited';
    else if (result.ok && result.data?.sendUserPasswordResetLink === true) outcome = 'accepted';
  } catch {
    outcome = 'unavailable';
  }
  const remaining = 400 - (Date.now() - startedAt);
  if (remaining > 0) await new Promise(resolve => setTimeout(resolve, remaining));
  if (outcome === 'rate-limited') return { status: 'error', message: RATE_LIMITED, email };
  if (outcome === 'unavailable') return { status: 'error', message: 'We couldn’t send a reset link just now. Please try again in a few minutes.', email };
  return { status: 'success', message: 'If an account uses that email, a link to reset the password is on its way. It expires soon, so use it promptly.', email };
}

export async function redeemGuestPasswordResetAction(_previous: AccountFormState, form: FormData): Promise<AccountFormState> {
  const email = field(form, 'email').toLowerCase();
  const password = String(form.get('password') || '');
  if (password !== String(form.get('confirmPassword') || '')) return { status: 'error', message: 'The two passwords don’t match.', email };
  try {
    const result = await storefrontServerGraphql<{ redeemHotelPasswordResetToken: { code?: string | null; message?: string | null } }>(REDEEM_RESET, { email, token: field(form, 'token'), password });
    const outcome = result.data?.redeemHotelPasswordResetToken;
    if (!result.ok || !outcome) return { status: 'error', message: result.status === 429 ? RATE_LIMITED : 'This reset link is invalid or has expired. Request a new one.', email };
    if (outcome.code) return { status: 'error', message: RESET_FAILURES[outcome.code] || RESET_FAILURES.FAILURE, email };
  } catch { return { status: 'error', message: TRY_AGAIN, email }; }
  return { status: 'success', message: 'Your password has been reset. Sign in with your new password.', email };
}

/** The next page of the signed-in guest's stays; ownership is enforced by the resolver. */
export async function loadMoreGuestStaysAction(skip: number): Promise<GuestAccountStaysPage | null> {
  return getGuestAccountBookings(skip);
}
