'use client';

import * as React from 'react';
import Link from 'next/link';
import { KeyRound, Search } from 'lucide-react';
import { createGuestAccountAction, signInGuestAction, type AccountFormState } from '../../actions/account';
import { GuestSearchSubmitButton } from '../GuestSearchSubmitButton';
import { Notice } from '../ui';

const idle: AccountFormState = { status: 'idle', message: '' };

type FormProps = {
  email: string;
  next: string;
  onEmail: (email: string) => void;
  onPending: (pending: boolean) => void;
};

function SignInForm({ email, next, onEmail, onPending }: FormProps) {
  const [state, action, pending] = React.useActionState(signInGuestAction, idle);
  React.useEffect(() => onPending(pending), [pending, onPending]);
  React.useEffect(() => { if (state.email) onEmail(state.email); }, [state.email, onEmail]);
  return <form action={action} className="sf-stack" style={{ '--stack': '18px' } as React.CSSProperties}>
    <input type="hidden" name="next" value={next} />
    <label className="sf-field" htmlFor="signin-email">
      <span className="sf-label">Email</span>
      <input id="signin-email" name="email" type="email" autoComplete="email" required maxLength={254} defaultValue={email} onChange={event => onEmail(event.target.value)} className="sf-input" />
    </label>
    <label className="sf-field" htmlFor="signin-password">
      <span className="sf-label">Password</span>
      <input id="signin-password" name="password" type="password" autoComplete="current-password" required maxLength={1000} className="sf-input" />
    </label>
    {state.status === 'error' && <Notice tone="danger" role="alert">{state.message}</Notice>}
    <GuestSearchSubmitButton idleLabel="Sign in" pendingLabel="Signing in…" />
    <Link href={`/account/reset${email ? `?email=${encodeURIComponent(email)}` : ''}`} className="sf-link" style={{ width: 'fit-content' }}>Forgot your password?</Link>
  </form>;
}

function CreateAccountForm({ email, next, onEmail, onPending, onCreated }: FormProps & { onCreated: (message: string) => void }) {
  const [state, action, pending] = React.useActionState(createGuestAccountAction, idle);
  React.useEffect(() => onPending(pending), [pending, onPending]);
  React.useEffect(() => { if (state.email) onEmail(state.email); }, [state.email, onEmail]);
  React.useEffect(() => { if (state.status === 'created') onCreated(state.message); }, [state, onCreated]);
  return <form action={action} className="sf-stack" style={{ '--stack': '18px' } as React.CSSProperties}>
    <input type="hidden" name="next" value={next} />
    <label className="sf-field" htmlFor="create-name">
      <span className="sf-label">Full name</span>
      <input id="create-name" name="name" type="text" autoComplete="name" required maxLength={120} className="sf-input" />
    </label>
    <label className="sf-field" htmlFor="create-email">
      <span className="sf-label">Email</span>
      <input id="create-email" name="email" type="email" autoComplete="email" required maxLength={254} defaultValue={email} onChange={event => onEmail(event.target.value)} className="sf-input" />
      <span className="sf-hint">Use the email on your reservations so they appear in your account.</span>
    </label>
    <label className="sf-field" htmlFor="create-phone">
      <span className="sf-label">Phone <small>(optional)</small></span>
      <input id="create-phone" name="phone" type="tel" autoComplete="tel" maxLength={40} className="sf-input" />
    </label>
    <label className="sf-field" htmlFor="create-password">
      <span className="sf-label">Password</span>
      <input id="create-password" name="password" type="password" autoComplete="new-password" required minLength={10} maxLength={1000} className="sf-input" />
      <span className="sf-hint">At least 10 characters. Avoid common passwords.</span>
    </label>
    <label className="sf-field" htmlFor="create-confirm">
      <span className="sf-label">Confirm password</span>
      <input id="create-confirm" name="confirmPassword" type="password" autoComplete="new-password" required minLength={10} maxLength={1000} className="sf-input" />
    </label>
    {state.status === 'error' && <Notice tone="danger" role="alert">{state.message}</Notice>}
    <GuestSearchSubmitButton idleLabel="Create account" pendingLabel="Creating your account…" />
  </form>;
}

/**
 * Sign in or create a guest account, in the storefront's own design. Each mode is its own
 * form, so switching never carries a typed password into another field; only the email moves.
 */
export function AccountAuthPanel({ mode: initialMode, email, next, notice }: { mode: 'signin' | 'create'; email: string; next: string; notice?: string | null }) {
  const [mode, setMode] = React.useState(initialMode);
  const [knownEmail, setKnownEmail] = React.useState(email);
  const [pending, setPending] = React.useState(false);
  const [message, setMessage] = React.useState(notice || '');
  const onCreated = React.useCallback((text: string) => { setMessage(text); setMode('signin'); }, []);
  const choose = (next: 'signin' | 'create') => { if (!pending) { setMode(next); setMessage(''); } };

  return <div className="sf-split" style={{ alignItems: 'start', marginTop: 'clamp(32px, 5vw, 56px)' }}>
    <section className="sf-float sf-pad-lg" aria-labelledby="account-form-title">
      <div className="sf-segment" role="group" aria-label="Account" style={{ marginBottom: 24 }}>
        <button type="button" aria-pressed={mode === 'signin'} disabled={pending} onClick={() => choose('signin')}>Sign in</button>
        <button type="button" aria-pressed={mode === 'create'} disabled={pending} onClick={() => choose('create')}>Create account</button>
      </div>
      <h2 id="account-form-title" className="sf-h3" style={{ marginBottom: 20 }}>{mode === 'signin' ? 'Welcome back.' : 'Create your guest account.'}</h2>
      {message && <div style={{ marginBottom: 18 }}><Notice tone="success" role="status" className="sf-noprint">{message}</Notice></div>}
      {mode === 'signin'
        ? <SignInForm key="signin" email={knownEmail} next={next} onEmail={setKnownEmail} onPending={setPending} />
        : <CreateAccountForm key="create" email={knownEmail} next={next} onEmail={setKnownEmail} onPending={setPending} onCreated={onCreated} />}
    </section>
    <aside className="sf-panel sf-pad-lg sf-stack" style={{ '--stack': '14px' } as React.CSSProperties}>
      <span className="sf-feature__icon"><KeyRound aria-hidden="true" /></span>
      <p className="sf-eyebrow">Your account</p>
      <h2 className="sf-h3">Every stay in one place.</h2>
      <p className="sf-muted">See upcoming and past stays, statements and cancellation terms, request changes, and book with your details filled in.</p>
      <p className="sf-eyebrow" style={{ marginTop: 12 }}>Booked without an account?</p>
      <p className="sf-muted">Find a reservation with its confirmation number and email. Create an account with the same email and the stays you open on this device are added to it.</p>
      <Link href="/bookings/lookup" className="sf-btn sf-btn--ghost" style={{ width: 'fit-content' }}><Search aria-hidden="true" />Find a reservation</Link>
    </aside>
  </div>;
}
