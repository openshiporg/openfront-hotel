'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { safeDashboardReturnPath } from './safeDashboardReturnPath';

const SIGN_IN_PATH = '/dashboard/signin';

async function mfaChallengePending() {
  try {
    const response = await fetch('/api/graphql', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: 'query { hotelMfaStatus }' }),
    });
    const payload = await response.json();
    return JSON.parse(payload?.data?.hotelMfaStatus || '{}').challengeRequired === true;
  } catch {
    return false;
  }
}

/**
 * Staff MFA step. The shared Openfront sign-in issues a password session and returns to
 * the sign-in page while the hotel's MFA challenge is pending; this sends those staff to
 * the hotel's verification step instead of leaving them on the password form.
 */
export function StaffMfaContinuation() {
  const pathname = usePathname();

  useEffect(() => {
    if (pathname !== SIGN_IN_PATH) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const continueToVerification = async () => {
      if (!active || !(await mfaChallengePending()) || !active) return false;
      const from = safeDashboardReturnPath(new URLSearchParams(window.location.search).get('from'));
      window.location.replace(`${SIGN_IN_PATH}/mfa?from=${encodeURIComponent(from)}`);
      return true;
    };
    // After the password form is submitted, watch for the pending challenge briefly.
    const onSubmit = () => {
      let attempts = 0;
      clearTimeout(timer);
      const poll = async () => {
        if (await continueToVerification() || ++attempts >= 12 || !active) return;
        timer = setTimeout(poll, 700);
      };
      timer = setTimeout(poll, 700);
    };
    void continueToVerification();
    document.addEventListener('submit', onSubmit, true);
    return () => { active = false; clearTimeout(timer); document.removeEventListener('submit', onSubmit, true); };
  }, [pathname]);

  return null;
}
