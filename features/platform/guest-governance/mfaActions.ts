'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { keystoneClient } from '@/features/dashboard/lib/keystoneClient';
import { requireActionData } from '@/features/platform/lib/actionResult';
import { safeDashboardReturnPath } from '@/features/dashboard/lib/safeDashboardReturnPath';

export async function completeHotelMfa(_previous: { message: string }, form: FormData) {
  const from = safeDashboardReturnPath(form.get('from'));
  try {
    const response = await keystoneClient<any>('mutation($code:String!,$recovery:Boolean){ verifyHotelMfa(code:$code,recovery:$recovery) }', { code: String(form.get('code') || '').trim(), recovery: form.get('recovery') === 'on' });
    const result = JSON.parse(requireActionData(response).verifyHotelMfa);
    if (!result.sessionToken) throw new Error('Verification did not issue a session. Sign in again.');
    (await cookies()).set('keystonejs-session', result.sessionToken, { secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', httpOnly: true, maxAge: 60 * 60 * 12 });
  } catch (error) { return { message: error instanceof Error ? error.message : 'MFA verification failed.' }; }
  redirect(from);
}
export async function loadHotelMfaStatus() {
  const response = await keystoneClient<any>('query { hotelMfaStatus }'); return JSON.parse(requireActionData(response).hotelMfaStatus);
}
export async function changeHotelMfa(action: string, password: string, code: string, recovery: boolean) {
  const response = await keystoneClient<any>('mutation($action:String!,$password:String!,$code:String,$recovery:Boolean){ manageHotelMfa(action:$action,password:$password,code:$code,recovery:$recovery) }', { action, password, code, recovery });
  const result = JSON.parse(requireActionData(response).manageHotelMfa);
  if (result.signedOut) (await cookies()).delete('keystonejs-session');
  return result;
}
