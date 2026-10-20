'use client';

import * as React from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { requestGuestPasswordResetAction, redeemGuestPasswordResetAction, type AccountFormState } from '../actions/account';
import { useGuestAccount } from '../components/GuestAccountProvider';
import { useHotelSettings } from '../components/HotelSettingsProvider';
import { GuestSearchSubmitButton } from '../components/GuestSearchSubmitButton';
import { Notice, Skeleton } from '../components/ui';

const idle: AccountFormState = { status: 'idle', message: '' };

function ResetContent() {
  const search = useSearchParams();
  const token = search?.get('token') || '';
  const email = (search?.get('email') || '').slice(0, 254);
  const { passwordResetAvailable } = useGuestAccount();
  const identity = useHotelSettings();
  const [requestState, requestReset] = React.useActionState(requestGuestPasswordResetAction, idle);
  const [redeemState, redeemReset] = React.useActionState(redeemGuestPasswordResetAction, idle);

  return <div className="sf-wrap sf-wrap--mid sf-section--tight">
    <header className="sf-stack" style={{ '--stack': '16px' } as React.CSSProperties}>
      <p className="sf-eyebrow">Guest account</p>
      <h1 className="sf-h1">{token ? <>Choose a <em>new password.</em></> : <>Reset your <em>password.</em></>}</h1>
    </header>
    <section className="sf-float sf-pad-lg" style={{ marginTop: 'clamp(28px, 4vw, 40px)' }}>
      {token ? redeemState.status === 'success' ? <div className="sf-stack" style={{ '--stack': '18px' } as React.CSSProperties}>
        <Notice tone="success" role="status">{redeemState.message}</Notice>
        <Link href={`/account?reset=1&email=${encodeURIComponent(redeemState.email || email)}`} className="sf-btn" style={{ width: 'fit-content' }}>Sign in</Link>
      </div> : <form action={redeemReset} className="sf-stack" style={{ '--stack': '18px' } as React.CSSProperties}>
        <input type="hidden" name="token" value={token} />
        <label className="sf-field" htmlFor="reset-email">
          <span className="sf-label">Email</span>
          <input id="reset-email" name="email" type="email" autoComplete="email" required maxLength={254} defaultValue={redeemState.email || email} className="sf-input" />
        </label>
        <label className="sf-field" htmlFor="reset-password">
          <span className="sf-label">New password</span>
          <input id="reset-password" name="password" type="password" autoComplete="new-password" required minLength={10} maxLength={1000} className="sf-input" />
          <span className="sf-hint">At least 10 characters. Avoid common passwords.</span>
        </label>
        <label className="sf-field" htmlFor="reset-confirm">
          <span className="sf-label">Confirm new password</span>
          <input id="reset-confirm" name="confirmPassword" type="password" autoComplete="new-password" required minLength={10} maxLength={1000} className="sf-input" />
        </label>
        {redeemState.status === 'error' && <Notice tone="danger" role="alert">{redeemState.message} <Link href="/account/reset" className="sf-link">Request a new link</Link></Notice>}
        <GuestSearchSubmitButton idleLabel="Save new password" pendingLabel="Saving…" />
      </form>
      : !passwordResetAvailable ? <div className="sf-stack" style={{ '--stack': '14px' } as React.CSSProperties}>
        <Notice tone="warn" role="status" title="Password reset by email isn’t available right now.">
          <p>{identity.inquiriesAvailable || identity.phone ? 'Contact the property and they’ll help you get back into your account.' : 'Please try again later.'}</p>
        </Notice>
        <div className="sf-row">
          {identity.inquiriesAvailable && <Link href="/contact?subject=account" className="sf-btn">Contact the property</Link>}
          {identity.phone && <a className="sf-btn sf-btn--ghost" href={`tel:${identity.phone.replace(/[^+\d]/g, '')}`}>Call {identity.phone}</a>}
        </div>
      </div>
      : <form action={requestReset} className="sf-stack" style={{ '--stack': '18px' } as React.CSSProperties}>
        <p className="sf-muted">Enter the email for your guest account and we’ll send a link to choose a new password.</p>
        <label className="sf-field" htmlFor="request-email">
          <span className="sf-label">Email</span>
          <input id="request-email" name="email" type="email" autoComplete="email" required maxLength={254} defaultValue={requestState.email || email} className="sf-input" />
        </label>
        {requestState.status !== 'idle' && <Notice tone={requestState.status === 'success' ? 'success' : 'danger'} role={requestState.status === 'success' ? 'status' : 'alert'}>{requestState.message}</Notice>}
        <GuestSearchSubmitButton idleLabel="Send reset link" pendingLabel="Sending…" />
      </form>}
      <p className="sf-small" style={{ marginTop: 22 }}><Link href="/account" className="sf-link">Back to sign in</Link></p>
    </section>
  </div>;
}

export default function PasswordResetPage() {
  return <React.Suspense fallback={<div className="sf-wrap sf-wrap--mid sf-section--tight" role="status" aria-label="Opening password reset"><Skeleton height={64} width="55%" /><div style={{ height: 24 }} /><Skeleton height={220} radius={22} /></div>}>
    <ResetContent />
  </React.Suspense>;
}
